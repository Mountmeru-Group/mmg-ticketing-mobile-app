// Saved filters = the Service Desk's saved views (2026-11-17, second brief): the web portal's "Views", synced both ways.
// Contract and sources: docs/web-system/16-SAVED-VIEWS.md.
// What is real: src/api/savedViews.api.ts with the API client and its interceptors, the query and mutation options of
// src/hooks/useSavedViews.ts run by the app's own QueryClient, src/utils/saved-filters.ts, ui.store's apply,
// ticketListFilters() (permissions.ts) and ticketListQuery(). Faked: the network (axios's transport, answering as
// savedViews.controller.ts does) and the phone's Keystore. Nothing calls UAT or Production.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import * as secureStore from 'expo-secure-store';

import { apiClient } from '../../src/api/client.ts';
import { ApiClientError, describeWriteError } from '../../src/api/errors.ts';
import { queryClient } from '../../src/api/queryClient.ts';
import { SAVED_VIEW_FILTER_KEYS } from '../../src/api/savedViews.api.ts';
import { queryKeys } from '../../src/hooks/queryKeys.ts';
import {
  SAVED_VIEWS_STALE_TIME_MS, SAVED_VIEW_GONE, savedViewMutations, savedViewsQuery,
} from '../../src/hooks/useSavedViews.ts';
import { discardLegacySavedFilters, readLegacySavedFilters } from '../../src/store/legacySavedFilters.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import { ticketListFilters } from '../../src/utils/permissions.ts';
import {
  captureSavedView, decodeSavedView, sameSavedViewFilters, sanitizeSavedFilter, savedFilterNameProblem, savedViewChips,
  savedViewFiltersFor, savedViewSaveProblem,
} from '../../src/utils/saved-filters.ts';
import {
  HOME_TILE_FILTERS, NO_ADVANCED_FILTERS, availableTicketFilters, isTicketFilterAllowed, ticketListQuery,
} from '../../src/utils/ticket-filters.ts';
import { PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel.replace(/\\/g, '/')] : [];
  });
}

/** The eight keys the web writes and reads back (TicketsListPage.tsx:190-199, :223-232), in its order. */
const WEB_KEYS = ['status', 'priority', 'sortBy', 'assignedToId', 'teamId', 'categoryId', 'fromDate', 'toDate'];
const admin = PERSONAS.ADMIN;

/** The list with everything set, as ui.store holds it: what a staff member could have on screen. */
const EVERYTHING = {
  ticketFilter: 'ALL',
  ticketSort: 'PRIORITY',
  ticketSearch: 'vpn',
  ticketCountryId: 'country-ke',
  countryName: 'Kenya',
  ticketAdvanced: {
    status: ['OPEN', 'IN_PROGRESS'],
    // One value each (lists since 2026-11-18): a view holds exactly what it held before. Several: multi-select.test.
    priority: ['HIGH'],
    category: [{ id: 'cat-network', name: 'Network' }],
    fromDate: '2026-11-01',
    toDate: '2026-11-30',
    technician: [{ id: 'tech-1', name: 'Jane Tech' }],
    group: [{ id: 'team-1', name: 'Service Desk' }],
  },
};

/** The TKT-1 params the list sends for a ui.store state (no country: a view holds none, on the web either). */
const queryOf = (state, viewer) =>
  ticketListQuery({
    me: viewer, filter: state.ticketFilter, sort: state.ticketSort, search: state.ticketSearch, advanced: state.ticketAdvanced,
    allowed: ticketListFilters(viewer),
  });
/** What the web's loadView puts in its filter state from a view (TicketsListPage.tsx:223-232). */
const webLoad = (filters) => Object.fromEntries(WEB_KEYS.filter((k) => filters[k]).map((k) => [k, filters[k]]));
const only = (query, keys) => Object.fromEntries(keys.filter((k) => query[k] !== undefined).map((k) => [k, query[k]]));
/** The same request for the server: TKT-1 reads `status` as a set (`in`, tickets.controller.ts:114-116), so its order is not part of it. */
const sameRequest = (query) => ({ ...query, ...(query.status ? { status: query.status.split(',').sort().join(',') } : {}) });

// ── The network: answers as savedViews.controller.ts does; every request is recorded ──

const sent = [];
let answer = null;
let nextId = 1;
apiClient.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  sent.push({ method: config.method, url: config.url, params: { ...(config.params ?? {}) }, body, auth: config.headers?.Authorization });
  const out = answer ? answer(config, body) : { status: 200, body: {} };
  if (out === 'network') throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {});
  const response = {
    status: out.status,
    statusText: String(out.status),
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(out.body),
    config,
    request: {},
  };
  if (config.validateStatus(response.status)) return response;
  throw new AxiosError(`Request failed with status code ${response.status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response);
};

/** A row as the server returns it: every column, no include (SVC:38-41, schema.prisma:1783-1796). */
const row = (over = {}) => ({
  id: `view-${nextId++}`, name: 'View', entityType: 'ticket', filters: {}, columns: [], userId: admin.id, isDefault: false,
  createdAt: '2026-11-17T08:00:00.000Z', ...over,
});

/** The server: SVW-2 echoes the body as a new row (201); SVW-3 applies `name` only; SVW-4 answers its message. */
function serverLikeTheController() {
  answer = (config, body) => {
    if (config.method === 'post' && config.url === '/saved-views') return { status: 201, body: row({ name: body.name, filters: body.filters }) };
    if (config.method === 'put') return { status: 200, body: row({ id: config.url.split('/').pop(), name: body.name, filters: { kept: 'as stored' } }) };
    if (config.method === 'delete') return { status: 200, body: { message: 'View deleted' } };
    return { status: 200, body: [] };
  };
}

const ops = () => savedViewMutations(queryClient);
const run = (options, variables) => new MutationObserver(queryClient, options).mutate(variables);
const cached = () => queryClient.getQueryData(queryKeys.savedViews.tickets());

beforeEach(() => {
  sent.length = 0;
  answer = null;
  queryClient.clear();
  secureStore.__reset();
  useUiStore.getState().reset();
  onlineManager.setOnline(true);
});
afterEach(() => onlineManager.setOnline(true));

describe('the contract round-trips: phone → Service Desk → web, and web → Service Desk → phone', () => {
  test('a phone save sends the web\'s eight keys only, in its order, and reads back as the same tickets', async () => {
    serverLikeTheController();
    queryClient.setQueryData(queryKeys.savedViews.tickets(), []);
    const capture = captureSavedView(EVERYTHING, admin);
    assert.equal(capture.refusal, null);
    const view = await run(ops().create, { name: '  Network   work ', filters: capture.filters, existing: [] });

    // On the wire: SVW-2, exactly the body the web sends (TicketsListPage.tsx:187-200), no columns, no isDefault.
    assert.equal(sent.length, 1);
    assert.deepEqual({ method: sent[0].method, url: sent[0].url }, { method: 'post', url: '/saved-views' });
    assert.deepEqual(sent[0].body, {
      name: 'Network work',
      entityType: 'ticket',
      filters: {
        status: 'OPEN,IN_PROGRESS', priority: 'HIGH', sortBy: 'priority', assignedToId: 'tech-1', teamId: 'team-1',
        categoryId: 'cat-network', fromDate: '2026-11-01', toDate: '2026-11-30',
      },
    });
    assert.deepEqual(Object.keys(sent[0].body.filters), WEB_KEYS);
    assert.deepEqual([...SAVED_VIEW_FILTER_KEYS], WEB_KEYS);
    for (const value of Object.values(sent[0].body.filters)) assert.equal(typeof value, 'string', 'every value a string, as the web');

    // Shown only once the server answered: its row, at the top (the list is newest first).
    assert.deepEqual(cached().map((v) => v.id), [view.id]);

    // Read back on the phone: nothing left out, and the list sends the same TKT-1 query, minus the search.
    const decoded = decodeSavedView(view.filters, admin);
    assert.deepEqual(decoded.leftOut, []);
    useUiStore.getState().setTicketSearch('vpn');
    useUiStore.getState().setTicketCountryId('country-ke');
    useUiStore.getState().applySavedTicketFilter(decoded.content);
    const ui = useUiStore.getState();
    assert.equal(ui.ticketSearch, undefined, 'the search is cleared, as the web clears it (TicketsListPage.tsx:235)');
    assert.equal(ui.ticketCountryId, 'country-ke', 'the country is kept, as on the web');
    assert.deepEqual(queryOf(ui, admin), queryOf({ ...EVERYTHING, ticketSearch: undefined }, admin));

    // Read back on the web: its loadView puts exactly what the phone's list sends.
    assert.deepEqual(webLoad(view.filters), only(queryOf(ui, admin), WEB_KEYS));
  });

  test('a view saved on the web appears on the phone (SVW-1) and applies as the same tickets the web shows', async () => {
    const web = row({
      id: 'view-web', name: 'Partner, urgent',
      // As TicketsListPage.tsx:190-199 writes it: only the keys that were set.
      filters: {
        status: 'PENDING_PARTNER', priority: 'URGENT', sortBy: 'sla', assignedToId: 'tech-2', teamId: 'team-1',
        categoryId: 'cat-hw', fromDate: '2026-10-01', toDate: '2026-10-31',
      },
      columns: ['title', 'status'],
    });
    answer = () => ({ status: 200, body: [web] });
    const views = await queryClient.fetchQuery(savedViewsQuery());
    assert.deepEqual(sent.map((r) => [r.method, r.url, r.params]), [['get', '/saved-views', { entityType: 'ticket' }]]);
    assert.deepEqual(views.map((v) => v.name), ['Partner, urgent']);

    const names = { category: () => 'Hardware', group: () => 'Service Desk', technician: () => 'John Tech' };
    const { content, leftOut } = decodeSavedView(web.filters, admin, names);
    assert.deepEqual(leftOut, []);
    assert.deepEqual(savedViewChips(content), [
      'Quick filter: All', 'Status: Pending with Partner', 'Priority: Urgent', 'Category: Hardware',
      'Created 01 Oct 2026 – 31 Oct 2026', 'Technician: John Tech', 'Group: Service Desk', 'Sort: Due date',
    ]);
    useUiStore.getState().applySavedTicketFilter(content);
    assert.deepEqual(only(queryOf(useUiStore.getState(), admin), WEB_KEYS), webLoad(web.filters));
  });

  test('every quick filter a view can hold, for every role: saved, read back, same request', () => {
    for (const [name, persona] of Object.entries(PERSONAS)) {
      const filters = [...availableTicketFilters(persona.role), ...HOME_TILE_FILTERS].filter((f) => isTicketFilterAllowed(persona.role, f));
      for (const filter of filters) {
        const content = sanitizeSavedFilter({ filter, sort: 'DUE', advanced: { ...NO_ADVANCED_FILTERS, priority: ['LOW'] } }, persona);
        const { filters: stored, sla } = savedViewFiltersFor(content, persona);
        if (sla) continue; // refused, below
        const back = decodeSavedView(JSON.parse(JSON.stringify(stored)), persona);
        assert.deepEqual(back.leftOut, [], `${name} ${filter}`);
        const state = (c) => ({ ticketFilter: c.filter, ticketSort: c.sort, ticketAdvanced: c.advanced, ticketSearch: undefined });
        assert.deepEqual(sameRequest(queryOf(state(back.content), persona)), sameRequest(queryOf(state(content), persona)), `${name} ${filter}`);
      }
    }
  });

  test('status lists round-trip whatever their order, and the chip matching the list is found', () => {
    assert.equal(sameSavedViewFilters({ status: 'IN_PROGRESS,OPEN' }, { status: 'OPEN,IN_PROGRESS' }), true);
    assert.equal(sameSavedViewFilters({ status: 'OPEN' }, { status: 'OPEN', categoryIds: ['x'] }), false, 'a key the app cannot read is never "the same"');
    assert.equal(sameSavedViewFilters({ sortBy: 'updated' }, {}), true, '`updated` is the order with no sortBy');
    assert.equal(sameSavedViewFilters(null, null), false);
    const capture = captureSavedView(EVERYTHING, admin);
    const stored = { ...capture.filters, status: 'IN_PROGRESS,OPEN' };
    assert.equal(savedViewSaveProblem([{ name: 'Mine', filters: stored }], capture), 'These filters are already saved as “Mine”.');
  });
});

describe('what a view cannot hold is refused or named, never dropped quietly', () => {
  test('the SLA quick filters (Overdue, Due soon, SLA breached): saving is refused, with the reason', () => {
    for (const filter of ['OVERDUE', 'DUE_SOON', 'BREACHED_KPI']) {
      const capture = captureSavedView({ ...EVERYTHING, ticketFilter: filter }, admin);
      assert.match(capture.refusal, /can't be saved: the web portal's views have no SLA filter/, filter);
      assert.equal(savedViewSaveProblem([], capture), capture.refusal);
    }
  });

  test('the search and the country are listed as "not kept" (a view holds neither, on the web either)', () => {
    assert.deepEqual(captureSavedView(EVERYTHING, admin).notKept, ['Search “vpn”', 'Country: Kenya']);
    // A country-locked AGENT has no country choice to lose.
    assert.deepEqual(captureSavedView(EVERYTHING, PERSONAS.AGENT).notKept, ['Search “vpn”']);
    assert.deepEqual(captureSavedView({ ...EVERYTHING, ticketSearch: undefined, ticketCountryId: null }, admin).notKept, []);
  });

  test('a view with what this role cannot send, or the app cannot read: not sent, and each part named', () => {
    const filters = {
      status: 'OPEN,NOT_A_STATUS', priority: 'SEVERE', sortBy: 'created', assignedToId: 'tech-2', teamId: 'team-1',
      // An ARRAY is not guessed at (the web stores comma strings, 16-SAVED-VIEWS §7): named, never sent.
      categoryId: ['cat-a', 'cat-b'], fromDate: '2026-13-45', categoryIds: ['cat-a', 'cat-b'],
    };
    for (const persona of [PERSONAS.END_USER, PERSONAS.L2_MANAGER]) {
      const { content, leftOut } = decodeSavedView(filters, persona);
      assert.deepEqual(leftOut, [
        '“categoryIds” (not on the app)',
        'Status “OPEN,NOT_A_STATUS” (not a status the app knows)',
        'Technician (not available to your role)',
        'Priority “SEVERE” (not a priority the app knows)',
        'Category “["cat-a","cat-b"]” (not readable by the app)',
        'Group (not available to your role)',
        'Created from “2026-13-45” (not a date the app can send)',
        'Sort “created” (not on the app)',
      ]);
      const query = queryOf({ ticketFilter: content.filter, ticketSort: content.sort, ticketAdvanced: content.advanced }, persona);
      for (const key of ['status', 'priority', 'assignedToId', 'teamId', 'categoryId', 'fromDate', 'sortBy']) {
        assert.equal(query[key], undefined, `${persona.role}: ${key} is never sent`);
      }
    }
    assert.deepEqual(decodeSavedView({ assignedToId: 'unassigned' }, PERSONAS.END_USER).leftOut, ['Unassigned tickets only (not available to your role)']);
    assert.equal(decodeSavedView({ assignedToId: 'unassigned' }, PERSONAS.AGENT).content.filter, 'UNASSIGNED');
    assert.equal(decodeSavedView(null, admin).content, null);
    assert.equal(decodeSavedView('status=OPEN', admin).content, null);
  });

  test('rename sends the name ONLY: a filter the web saved (even one the app cannot show) is never rewritten', async () => {
    serverLikeTheController();
    const web = row({ id: 'view-web', name: 'Web view', filters: { teamId: 'team-1', categoryIds: ['a', 'b'] } });
    queryClient.setQueryData(queryKeys.savedViews.tickets(), [web]);
    await run(ops().rename, { id: 'view-web', name: '  Renamed ', existing: [web] });
    assert.deepEqual(sent.map((r) => [r.method, r.url, r.body]), [['put', '/saved-views/view-web', { name: 'Renamed' }]]);
    assert.deepEqual(cached().map((v) => [v.id, v.name]), [['view-web', 'Renamed']]);
    // No request in the app ever carries a view's filters except SVW-2 creating a new one.
    const writers = sourceFiles('src').filter((rel) => /['`]\/saved-views/.test(read(rel)));
    assert.deepEqual(writers, ['src/api/savedViews.api.ts']);
    const api = read('src/api/savedViews.api.ts');
    assert.match(api, /const body: RenameSavedViewBody = \{ name \};/);
    assert.equal(api.split('filters: savedViewFiltersBody(filters)').length - 1, 1, 'only create sends filters');
  });
});

describe('roles: a saved view only carries filters that role can send (permissions.ts)', () => {
  const expected = {
    END_USER: ['status', 'priority', 'sortBy', 'categoryId', 'fromDate', 'toDate'],
    L2_MANAGER: ['status', 'priority', 'sortBy', 'categoryId', 'fromDate', 'toDate'],
    AGENT: WEB_KEYS,
    TRIAGE_AGENT: WEB_KEYS,
    ADMIN: WEB_KEYS,
  };
  for (const [name, persona] of Object.entries(PERSONAS)) {
    test(`${name}: ${expected[name].join(', ')}`, () => {
      const { filters } = captureSavedView(EVERYTHING, persona);
      assert.deepEqual(Object.keys(filters), expected[name]);
      // The same list as the Filters sheet's filters for that role.
      const allowed = ticketListFilters(persona);
      assert.equal('assignedToId' in filters, allowed.includes('technician'));
      assert.equal('teamId' in filters, allowed.includes('group'));
    });
  }

  test('"My open" is written as the web reads it: the person\'s own id and the open statuses; read back as "My open"', () => {
    const { filters } = savedViewFiltersFor(sanitizeSavedFilter({ filter: 'MY_OPEN' }, admin), admin);
    assert.equal(filters.assignedToId, admin.id);
    assert.match(filters.status, /^OPEN,IN_PROGRESS,/);
    assert.equal(decodeSavedView(filters, admin).content.filter, 'MY_OPEN');
  });
});

describe('failures: nothing looks saved that did not save', () => {
  test('a 500: the save rejects with the reason, the list is unchanged, and it is re-read', async () => {
    queryClient.setQueryData(queryKeys.savedViews.tickets(), []);
    answer = () => ({ status: 500, body: { error: 'Internal server error' } });
    await assert.rejects(run(ops().create, { name: 'Mine', filters: { status: 'OPEN' }, existing: [] }), (error) => {
      assert.match(describeWriteError(error), /The Service Desk reported an error\. It may have been saved — refresh before trying again\./);
      return true;
    });
    assert.deepEqual(cached(), []);
    assert.equal(queryClient.getQueryState(queryKeys.savedViews.tickets()).isInvalidated, true, 're-read, so a view that did save appears');
  });

  test('no connection: it rejects, says it may have been saved, and the list is re-read', async () => {
    queryClient.setQueryData(queryKeys.savedViews.tickets(), []);
    answer = () => 'network';
    await assert.rejects(run(ops().create, { name: 'Mine', filters: {}, existing: [] }), (error) => error instanceof ApiClientError && error.kind === 'network');
    assert.deepEqual(cached(), []);
    assert.equal(queryClient.getQueryState(queryKeys.savedViews.tickets()).isInvalidated, true);
  });

  test('offline: refused before anything is sent, for save, rename and delete', async () => {
    queryClient.setQueryData(queryKeys.savedViews.tickets(), [row({ id: 'a', name: 'A' })]);
    onlineManager.setOnline(false);
    for (const [options, variables] of [
      [ops().create, { name: 'Mine', filters: {}, existing: [] }],
      [ops().rename, { id: 'a', name: 'B', existing: [] }],
      [ops().remove, { id: 'a' }],
    ]) {
      await assert.rejects(run(options, variables), /You're offline\. Nothing was sent/);
    }
    assert.deepEqual(sent, []);
    assert.deepEqual(cached().map((v) => v.id), ['a']);
    assert.equal(queryClient.getQueryState(queryKeys.savedViews.tickets()).isInvalidated, false, 'nothing could have changed');
  });

  test('names: required, trimmed, at most 40, not one already in the list (any case); refused before sending', async () => {
    const existing = [row({ id: 'a', name: 'Network' })];
    assert.equal(savedFilterNameProblem('  ', existing), 'Give the filter a name.');
    assert.match(savedFilterNameProblem('x'.repeat(41), existing), /40 characters or fewer/);
    assert.match(savedFilterNameProblem(' network ', existing), /already have a saved filter called “Network”/);
    assert.equal(savedFilterNameProblem('network', existing, 'a'), null, 'a rename may keep its own name');
    await assert.rejects(run(ops().create, { name: 'NETWORK', filters: {}, existing }), /already have a saved filter/);
    assert.deepEqual(sent, []);
  });

  test('deleted elsewhere: a rename says so and the view leaves the list; a delete counts it as done', async () => {
    queryClient.setQueryData(queryKeys.savedViews.tickets(), [row({ id: 'a', name: 'A' }), row({ id: 'b', name: 'B' })]);
    answer = () => ({ status: 404, body: { error: 'View not found' } });
    await assert.rejects(run(ops().rename, { id: 'a', name: 'C', existing: [] }), (error) => error.message === SAVED_VIEW_GONE);
    assert.deepEqual(cached().map((v) => v.id), ['b']);
    assert.deepEqual(await run(ops().remove, { id: 'b' }), { alreadyGone: true });
    assert.deepEqual(cached(), []);
    assert.deepEqual(sent.map((r) => [r.method, r.url]), [['put', '/saved-views/a'], ['delete', '/saved-views/b']]);
  });

  test('a delete removes the view only once the server said so', async () => {
    queryClient.setQueryData(queryKeys.savedViews.tickets(), [row({ id: 'a', name: 'A' })]);
    answer = () => ({ status: 403, body: { error: 'Not authorized' } });
    await assert.rejects(run(ops().remove, { id: 'a' }));
    assert.deepEqual(cached().map((v) => v.id), ['a']);
    serverLikeTheController();
    assert.deepEqual(await run(ops().remove, { id: 'a' }), { alreadyGone: false });
    assert.deepEqual(cached(), []);
  });

  test('SVW-1 must answer an array: anything else is the error state, never an empty list', async () => {
    answer = () => ({ status: 200, body: { data: [] } });
    await assert.rejects(queryClient.fetchQuery({ ...savedViewsQuery(), retry: false }), (error) => error.kind === 'shape');
  });

  test('staleTime at least 60 s (UAT shares Production\'s hardware); re-read on opening only once stale', () => {
    assert.ok(SAVED_VIEWS_STALE_TIME_MS >= 60_000);
    const options = savedViewsQuery();
    assert.equal(options.staleTime, SAVED_VIEWS_STALE_TIME_MS);
    assert.equal(options.refetchOnMount, true);
    assert.equal('refetchInterval' in options, false);
  });
});

describe('the phone-only filters of versionCode 6: listed once, never uploaded, removed only on Dismiss', () => {
  const OLD = JSON.stringify([
    {
      id: 'x', name: 'Old network', environment: 'UAT', userId: admin.id, createdAt: 1, filter: 'OPEN', search: 'vpn', sort: 'PRIORITY',
      country: { id: 'country-ke', name: 'Kenya' },
      advanced: { priority: 'HIGH', category: { id: 'cat-network', name: 'Network' }, fromDate: null, toDate: null, technician: null, group: null },
    },
    { id: 'y', name: '   ' },
    'garbage',
  ]);

  test('read with what each held; nothing is sent; Dismiss deletes them from the phone', async () => {
    await secureStore.setItemAsync(`mmg.savedFilters.UAT.${admin.id}`, OLD);
    assert.deepEqual(await readLegacySavedFilters('UAT', admin.id), [
      { name: 'Old network', chips: ['Quick filter: Open', 'Search: “vpn”', 'Priority: High', 'Category: Network', 'Sort: Priority', 'Country: Kenya'] },
    ]);
    assert.deepEqual(await readLegacySavedFilters('PROD', admin.id), [], 'per environment, as they were kept');
    assert.deepEqual(await readLegacySavedFilters('UAT', PERSONAS.AGENT.id), [], 'per user');
    await discardLegacySavedFilters('UAT', admin.id);
    assert.deepEqual(secureStore.__snapshot(), {});
    assert.deepEqual(sent, []);
  });

  test('no code uploads them: the only SVW-2 caller is the "Save these filters" sheet', () => {
    const creators = sourceFiles('src').filter((rel) => /(?<!function )(createTicketView|useCreateSavedView)\(/.test(read(rel)));
    assert.deepEqual(creators.sort(), ['src/hooks/useSavedViews.ts', 'src/screens/tickets/SavedFilters.tsx']);
    assert.doesNotMatch(read('src/store/legacySavedFilters.ts'), /@\/api|apiClient/);
    assert.doesNotMatch(read('src/hooks/useSavedViews.ts').split('export function useLegacySavedFilters')[1], /mutate|createTicketView/);
  });
});

describe('wiring', () => {
  test('the Filters sheet applies a view as decoded for the viewer; a chip is active only when the list is exactly it', () => {
    const block = read('src/screens/tickets/SavedFilters.tsx');
    assert.match(block, /decodeSavedView\(view\.filters, user, names\)/);
    assert.match(block, /onApply\(d\.content\);/);
    assert.match(block, /!list\.ticketSearch && !capture\.refusal && d\.leftOut\.length === 0 && sameSavedViewFilters\(d\.view\.filters, capture\.filters\)/);
    assert.match(block, /`“\$\{name\}” is applied without: \$\{d\.leftOut\.join\('; '\)\}\.`/);
    assert.match(read('src/screens/tickets/TicketFiltersScreen.tsx'), /<SavedFiltersBlock list=\{listState\} onApply=\{applySaved\} \/>/);
  });

  test('sign-out and the environment switch clear the views with the whole cache; nothing else holds them', () => {
    assert.match(read('src/api/client.ts'), /export async function endSession[\s\S]*?queryClient\.clear\(\);/);
    assert.match(read('src/api/environmentSwitch.ts'), /queryClient\.clear\(\);/);
    assert.deepEqual(sourceFiles('src').filter((rel) => /useSavedFiltersStore|savedFilters\.store/.test(read(rel))), []);
  });
});
