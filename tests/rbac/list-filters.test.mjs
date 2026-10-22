// Phase G2: the ticket list's Filters sheet (M3) — priority, category, created date, technician and group. The expected
// behaviour is the web portal's ticket list, read from its source (docs/G2-WEB-FILTERS.md), with the technician and
// group filters left out for the two roles whose web selects are always empty (their lookups are a 403).
//
// Like the other tests/rbac suites, these are written to FAIL when the app becomes MORE permissive: each persona's full
// answer is spelled out, so a filter that appears for a role that should not see it, or a parameter that reaches the
// server for such a role, breaks a test. They also pin how the five combine with the quick filters, search, sort and
// country into ONE TKT-1 query, and that the earlier quick filters, search and sort are unchanged.
//
// What is real: permissions.ts, ticket-filters.ts, ui.store.ts, the API modules and the axios client.
// What is faked: the network (axios's transport adapter records requests). Nothing calls UAT.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { listCategories, listTeams } from '../../src/api/lookups.api.ts';
import { listTickets } from '../../src/api/tickets.api.ts';
import { searchUsers } from '../../src/api/users.api.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import { ticketListFilters } from '../../src/utils/permissions.ts';
import {
  NO_ADVANCED_FILTERS, PRIORITY_FILTER_OPTIONS, TECHNICIAN_FILTER_ROLES, activeAdvancedFilters, activeFilterLabels,
  advancedFilterQuery, availableTicketFilters, categoryFilterOptions, dateRangeLabel, groupFilterOptions, isFilterDay,
  listCountryParam, roleDefaultTicketQuery, ticketFilterQuery, ticketListQuery, ticketSortQuery, withAdvancedFilters,
  withNamedFilter,
} from '../../src/utils/ticket-filters.ts';
import { NAMES, PERSONAS, forEachPersona } from './personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const ALL_FIVE = ['priority', 'category', 'date', 'technician', 'group'];
const THREE = ['priority', 'category', 'date'];

/** Every one of the five set, as if a stale state held them all. */
const EVERYTHING = {
  priority: 'HIGH',
  category: { id: 'cat-hw', name: 'Hardware' },
  fromDate: '2026-10-01',
  toDate: '2026-10-22',
  technician: { id: 'tech-1', name: 'Jane Tech' },
  group: { id: 'team-1', name: 'Service Desk' },
};

const queryFor = (p, extra = {}) =>
  ticketListQuery({
    me: p,
    filter: 'ALL',
    sort: 'UPDATED',
    countryId: listCountryParam(p, null),
    advanced: EVERYTHING,
    allowed: ticketListFilters(p),
    ...extra,
  });

// ── Recorded network ─────────────────────────────────────────

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, params: { ...(config.params ?? {}) } });
  const body = config.url === '/tickets' ? { data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrev: false } : [];
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(body),
    config,
    request: {},
  };
};
/** The query string axios would send: keys whose value is undefined are dropped, as axios drops them. */
const sentParams = (i = 0) => Object.fromEntries(Object.entries(sent[i].params).filter(([, v]) => v !== undefined));

// ── 1. Who sees which filter ─────────────────────────────────

describe('Filters sheet: which filters each persona sees', () => {
  // G2-WEB-FILTERS §2: priority, category and date work for every role on the web; technician and group only for
  // ADMIN and AGENT (USR-3 / LKP-2 are agentOrAdmin; END_USER and L2_MANAGER get an always-empty select).
  forEachPersona(
    'visible filters',
    { END_USER: THREE, AGENT: ALL_FIVE, TRIAGE_AGENT: ALL_FIVE, L2_MANAGER: THREE, ADMIN: ALL_FIVE },
    (p) => ticketListFilters(p),
  );

  test('with no signed-in user: the END_USER set', () => {
    assert.deepEqual(ticketListFilters(null), THREE);
  });

  test('technician and group are exactly the roles USR-3 and LKP-2 serve (01: ADMIN, AGENT)', () => {
    for (const name of NAMES) {
      const keys = ticketListFilters(PERSONAS[name]);
      const agentOrAdmin = PERSONAS[name].role === 'ADMIN' || PERSONAS[name].role === 'AGENT';
      assert.equal(keys.includes('technician'), agentOrAdmin, name);
      assert.equal(keys.includes('group'), agentOrAdmin, name);
    }
  });

  // How many show as "on" on the Filters button: only allowed ones count, the date range counts once.
  forEachPersona(
    'active count with every filter set in the state',
    { END_USER: 3, AGENT: 5, TRIAGE_AGENT: 5, L2_MANAGER: 3, ADMIN: 5 },
    (p) => activeAdvancedFilters(EVERYTHING, ticketListFilters(p)).length,
  );

  forEachPersona(
    'the summary line never names a filter the persona cannot see',
    {
      END_USER: ['High priority', 'Hardware', 'Created 01 Oct 2026 – 22 Oct 2026'],
      AGENT: ['High priority', 'Hardware', 'Created 01 Oct 2026 – 22 Oct 2026', 'Jane Tech', 'Service Desk'],
      TRIAGE_AGENT: ['High priority', 'Hardware', 'Created 01 Oct 2026 – 22 Oct 2026', 'Jane Tech', 'Service Desk'],
      L2_MANAGER: ['High priority', 'Hardware', 'Created 01 Oct 2026 – 22 Oct 2026'],
      ADMIN: ['High priority', 'Hardware', 'Created 01 Oct 2026 – 22 Oct 2026', 'Jane Tech', 'Service Desk'],
    },
    (p) => activeFilterLabels({ filter: 'ALL', search: undefined, advanced: EVERYTHING, allowed: ticketListFilters(p) }),
  );
});

// ── 2. What reaches the server ───────────────────────────────

describe('TKT-1: the filters become query parameters, never for a role that cannot see them', () => {
  const DATES = { fromDate: '2026-10-01', toDate: '2026-10-22' };
  const MORE_FOR_ALL = { priority: 'HIGH', categoryId: 'cat-hw', ...DATES };
  const MORE_FOR_STAFF = { ...MORE_FOR_ALL, assignedToId: 'tech-1', teamId: 'team-1' };

  // Every filter set in the state; "All countries" selected. Written out in full per persona.
  forEachPersona(
    'every filter set: the exact parameters',
    {
      END_USER: { countryId: '', ...MORE_FOR_ALL },
      AGENT: { countryId: 'country-tz', ...MORE_FOR_STAFF },
      TRIAGE_AGENT: { countryId: '', ...MORE_FOR_STAFF },
      L2_MANAGER: { ...MORE_FOR_ALL },
      ADMIN: { ...MORE_FOR_STAFF },
    },
    (p) => queryFor(p),
  );

  // Combined with a quick filter, a search, a sort and a picked country: still one query, everything ANDed by the server.
  forEachPersona(
    'combined with "Open", a search, sort by priority and a country: the exact parameters',
    {
      END_USER: { countryId: '', status: 'OPEN', sortBy: 'priority', search: 'printer', ...MORE_FOR_ALL },
      AGENT: { countryId: 'country-tz', status: 'OPEN', sortBy: 'priority', search: 'printer', ...MORE_FOR_STAFF },
      TRIAGE_AGENT: { countryId: 'country-ke', status: 'OPEN', sortBy: 'priority', search: 'printer', ...MORE_FOR_STAFF },
      L2_MANAGER: { status: 'OPEN', sortBy: 'priority', search: 'printer', ...MORE_FOR_ALL },
      ADMIN: { countryId: 'country-ke', status: 'OPEN', sortBy: 'priority', search: 'printer', ...MORE_FOR_STAFF },
    },
    (p) => queryFor(p, { filter: 'OPEN', sort: 'PRIORITY', search: 'printer', countryId: listCountryParam(p, 'country-ke') }),
  );

  test('each filter alone sends only its own parameter', () => {
    const admin = ticketListFilters(PERSONAS.ADMIN);
    const only = (patch) => advancedFilterQuery({ ...NO_ADVANCED_FILTERS, ...patch }, admin);
    assert.deepEqual(only({ priority: 'URGENT' }), { priority: 'URGENT' });
    assert.deepEqual(only({ category: { id: 'c1', name: 'C' } }), { categoryId: 'c1' });
    assert.deepEqual(only({ fromDate: '2026-10-01' }), { fromDate: '2026-10-01' });
    assert.deepEqual(only({ toDate: '2026-10-22' }), { toDate: '2026-10-22' });
    assert.deepEqual(only({ technician: { id: 'u1', name: 'U' } }), { assignedToId: 'u1' });
    assert.deepEqual(only({ group: { id: 't1', name: 'T' } }), { teamId: 't1' });
    assert.deepEqual(only({}), {});
  });

  test('the request on the wire carries them, with limit and never pageSize', async () => {
    sent.length = 0;
    await listTickets({ ...queryFor(PERSONAS.ADMIN, { filter: 'PENDING' }), page: 2, limit: 20 });
    assert.equal(sent[0].url, '/tickets');
    assert.deepEqual(sentParams(), {
      status: 'PENDING,PENDING_USER_INFO,PENDING_USER_CONFIRM,PENDING_PARTNER,PENDING_MASTER_DATA,PENDING_MGMT_REVIEW,ON_HOLD',
      priority: 'HIGH', categoryId: 'cat-hw', fromDate: '2026-10-01', toDate: '2026-10-22', assignedToId: 'tech-1',
      teamId: 'team-1', page: 2, limit: 20,
    });
  });

  test('END_USER and L2_MANAGER: a technician or group in the state never reaches the server', async () => {
    for (const p of [PERSONAS.END_USER, PERSONAS.L2_MANAGER]) {
      sent.length = 0;
      await listTickets(queryFor(p));
      assert.equal('assignedToId' in sentParams(), false, p.role);
      assert.equal('teamId' in sentParams(), false, p.role);
    }
  });

  test('a malformed day is never sent (anything but YYYY-MM-DD is a 500, 01 TKT-1)', () => {
    for (const bad of ['2026-13-01', '2026-02-30', '01/10/2026', '2026-10-1', '', '2026-10-01T00:00:00Z']) {
      assert.equal(isFilterDay(bad), false, bad);
      assert.deepEqual(advancedFilterQuery({ ...NO_ADVANCED_FILTERS, fromDate: bad, toDate: bad }, THREE), {}, bad);
    }
    assert.equal(isFilterDay('2026-10-22'), true);
  });

  test('the date range counts as one filter, and either end alone is a filter', () => {
    assert.deepEqual(activeAdvancedFilters({ ...NO_ADVANCED_FILTERS, fromDate: '2026-10-01', toDate: '2026-10-22' }, THREE), ['date']);
    assert.deepEqual(activeAdvancedFilters({ ...NO_ADVANCED_FILTERS, toDate: '2026-10-22' }, THREE), ['date']);
    assert.equal(dateRangeLabel('2026-10-01', null), 'Created from 01 Oct 2026');
    assert.equal(dateRangeLabel(null, '2026-10-22'), 'Created until 22 Oct 2026');
    assert.equal(dateRangeLabel(null, null), null);
  });

  test('From after To is sent as is, as on the web (the list is then empty)', () => {
    assert.deepEqual(advancedFilterQuery({ ...NO_ADVANCED_FILTERS, fromDate: '2026-10-22', toDate: '2026-10-01' }, THREE), {
      fromDate: '2026-10-22', toDate: '2026-10-01',
    });
  });
});

// ── 3. One technician slot ───────────────────────────────────

describe('"My open" and "Unassigned" share the technician slot with the Technician filter', () => {
  const tech = { id: 'tech-1', name: 'Jane Tech' };

  for (const name of ['AGENT', 'TRIAGE_AGENT', 'ADMIN']) {
    test(`${name}: a quick filter that sets the technician wins over a stale Technician filter`, () => {
      const p = PERSONAS[name];
      assert.equal(queryFor(p, { filter: 'MY_OPEN' }).assignedToId, p.id);
      assert.equal(queryFor(p, { filter: 'UNASSIGNED' }).assignedToId, 'unassigned');
      assert.equal(queryFor(p, { filter: 'UNASSIGNED_KPI' }).assignedToId, 'unassigned');
      assert.equal(queryFor(p, { filter: 'OPEN' }).assignedToId, 'tech-1');
    });
  }

  test('choosing "My open" or "Unassigned" drops the Technician filter; other quick filters keep it', () => {
    const state = { filter: 'ALL', advanced: { ...NO_ADVANCED_FILTERS, technician: tech, priority: 'LOW' } };
    for (const f of ['MY_OPEN', 'UNASSIGNED', 'UNASSIGNED_KPI']) {
      assert.deepEqual(withNamedFilter(state, f), { filter: f, advanced: { ...NO_ADVANCED_FILTERS, priority: 'LOW' } }, f);
    }
    for (const f of ['ALL', 'OPEN', 'PENDING', 'OVERDUE', 'DUE_SOON', 'RESOLVED', 'CLOSED', 'ACTIVE_KPI']) {
      assert.deepEqual(withNamedFilter(state, f), { filter: f, advanced: state.advanced }, f);
    }
  });

  test('choosing a technician moves "My open" / "Unassigned" back to All; other changes keep the quick filter', () => {
    for (const f of ['MY_OPEN', 'UNASSIGNED', 'UNASSIGNED_KPI']) {
      const state = { filter: f, advanced: NO_ADVANCED_FILTERS };
      assert.deepEqual(withAdvancedFilters(state, { technician: tech }), { filter: 'ALL', advanced: { ...NO_ADVANCED_FILTERS, technician: tech } }, f);
      assert.equal(withAdvancedFilters(state, { priority: 'HIGH' }).filter, f, f);
      assert.equal(withAdvancedFilters(state, { technician: null }).filter, f, f);
    }
    assert.equal(withAdvancedFilters({ filter: 'OPEN', advanced: NO_ADVANCED_FILTERS }, { technician: tech }).filter, 'OPEN');
  });
});

// ── 4. Where the options come from, per persona ──────────────

describe('options: the web\'s lists, and not scoped by the viewer (G2-WEB-FILTERS §2)', () => {
  beforeEach(() => {
    sent.length = 0;
  });

  /** The request the Technician picker makes for this persona, or null when the persona has no Technician filter. */
  async function technicianRequest(p) {
    if (!ticketListFilters(p).includes('technician')) return null;
    sent.length = 0;
    await searchUsers('ja', TECHNICIAN_FILTER_ROLES);
    return { url: sent[0].url, params: sentParams() };
  }
  /** The request the Group picker makes for this persona (it passes no country), or null without a Group filter. */
  async function groupRequest(p) {
    if (!ticketListFilters(p).includes('group')) return null;
    sent.length = 0;
    await listTeams();
    return { url: sent[0].url, params: sentParams() };
  }

  // Same people for ADMIN, triage and country AGENT alike: active AGENTs (the web's `role: 'AGENT'`, TLP:155).
  const TECH = { url: '/users/search', params: { q: 'ja', role: 'AGENT' } };
  // Every group, no country even for a country-locked AGENT (the web's `teamsApi.list()`, TLP:147).
  const GROUPS = { url: '/teams', params: {} };
  for (const name of NAMES) {
    test(`technician options: ${name}`, async () => {
      const expected = { END_USER: null, AGENT: TECH, TRIAGE_AGENT: TECH, L2_MANAGER: null, ADMIN: TECH }[name];
      assert.deepEqual(await technicianRequest(PERSONAS[name]), expected);
    });
    test(`group options: ${name}`, async () => {
      const expected = { END_USER: null, AGENT: GROUPS, TRIAGE_AGENT: GROUPS, L2_MANAGER: null, ADMIN: GROUPS }[name];
      assert.deepEqual(await groupRequest(PERSONAS[name]), expected);
    });
  }

  test('technicians are AGENTs only, as on the web', () => {
    assert.deepEqual([...TECHNICIAN_FILTER_ROLES], ['AGENT']);
  });

  test('category options for every role: LKP-1 flat, no country', async () => {
    await listCategories();
    assert.deepEqual(sent.map((r) => [r.url, r.params]), [['/categories', { flat: 'true' }]]);
  });

  test('category options are the active top-level categories, sorted by name (not sub-categories or items)', () => {
    const rows = [
      { id: 'z', name: 'Zeta', level: 'CATEGORY', parentId: null },
      { id: 's', name: 'Laptops', level: 'SUBCATEGORY', parentId: 'h' },
      { id: 'h', name: 'Hardware', level: 'CATEGORY', parentId: null },
      { id: 'i', name: 'Battery', level: 'ITEM', parentId: 's' },
      { id: 'a', name: 'Access', level: null, parentId: null }, // the web keeps rows with no level (`!c.level`)
    ];
    assert.deepEqual(categoryFilterOptions(rows), [
      { id: 'a', name: 'Access' }, { id: 'h', name: 'Hardware' }, { id: 'z', name: 'Zeta' },
    ]);
  });

  test('group options keep inactive groups, marked, in the server\'s order', () => {
    const teams = [
      { id: 't1', name: 'Applications', isActive: true },
      { id: 't2', name: 'Old Desk', isActive: false },
      { id: 't3', name: 'Service Desk', isActive: true },
    ];
    assert.deepEqual(groupFilterOptions(teams), [
      { id: 't1', name: 'Applications', inactive: false },
      { id: 't2', name: 'Old Desk', inactive: true },
      { id: 't3', name: 'Service Desk', inactive: false },
    ]);
  });

  test('priorities in the web\'s order', () => {
    assert.deepEqual([...PRIORITY_FILTER_OPTIONS], ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
  });
});

// ── 5. The earlier list behaviour is unchanged ───────────────

describe('quick filters, search and sort are unchanged when no Filters-sheet filter is set', () => {
  // Before G2, useTickets built: role default, country, quick filter, sort, search. Same answer now, for every persona,
  // every quick filter and every sort.
  for (const name of NAMES) {
    test(name, () => {
      const p = PERSONAS[name];
      for (const filter of availableTicketFilters(p.role)) {
        for (const sort of ['UPDATED', 'PRIORITY', 'DUE']) {
          for (const search of [undefined, '1234', 'printer']) {
            const countryId = listCountryParam(p, null);
            const before = {
              ...roleDefaultTicketQuery(p.role),
              ...(countryId !== undefined ? { countryId } : {}),
              ...ticketFilterQuery(filter, p),
              ...ticketSortQuery(sort),
              ...(search ? { search } : {}),
            };
            const now = ticketListQuery({ me: p, filter, sort, search, countryId, advanced: NO_ADVANCED_FILTERS, allowed: ticketListFilters(p) });
            assert.deepEqual(now, before, `${filter} ${sort} ${search}`);
          }
        }
      }
    });
  }
});

// ── 6. Clear all, Home tiles, sign-out ───────────────────────

describe('state: Clear all, arriving from a Home tile, signing out', () => {
  const store = () => useUiStore.getState();
  const dirty = () => {
    store().reset();
    store().setTicketCountryId('country-ke');
    store().setTicketFilter('OPEN');
    store().setTicketSort('PRIORITY');
    store().setTicketSearchText('printer');
    store().setTicketSearch('printer');
    store().setTicketAdvanced(EVERYTHING);
  };
  const filterState = () => {
    const s = store();
    return {
      filter: s.ticketFilter, sort: s.ticketSort, country: s.ticketCountryId, advanced: s.ticketAdvanced,
      searchText: s.ticketSearchText, search: s.ticketSearch,
    };
  };
  const CLEARED = { filter: 'ALL', sort: 'UPDATED', advanced: NO_ADVANCED_FILTERS, searchText: '', search: undefined };

  test('Clear all is the web\'s Clear: quick filter, search, the five and the sort; the country stays', () => {
    dirty();
    store().clearTicketFilters();
    assert.deepEqual(filterState(), { ...CLEARED, country: 'country-ke' });
  });

  test('a Home tile opens the list with that filter alone, like a web dashboard link', () => {
    dirty();
    store().openTicketList('BREACHED_KPI');
    assert.deepEqual(filterState(), { ...CLEARED, filter: 'BREACHED_KPI', country: 'country-ke' });
  });

  test('signing out wipes every filter, the country included (the web keeps them in the tab)', () => {
    dirty();
    store().reset();
    assert.deepEqual(filterState(), { ...CLEARED, country: null });
  });

  test('the store keeps the one-technician-slot rule', () => {
    store().reset();
    store().setTicketAdvanced({ technician: { id: 'tech-1', name: 'Jane' } });
    store().setTicketFilter('MY_OPEN');
    assert.equal(store().ticketAdvanced.technician, null);
    store().setTicketAdvanced({ technician: { id: 'tech-1', name: 'Jane' } });
    assert.equal(store().ticketFilter, 'ALL');
    store().reset();
  });
});

// ── 7. Wiring: the screens use these decisions ───────────────

describe('wiring: the list and the Filters sheet take every filter decision from permissions.ts / ticket-filters.ts', () => {
  test('useTickets sends only what ticketListFilters() allows, through ticketListQuery()', () => {
    const src = read('src/hooks/useTickets.ts');
    assert.match(src, /ticketListQuery\(\{[^}]*allowed: ticketListFilters\(user\)/);
  });

  test('the list passes the Filters-sheet state to the query and counts only allowed filters', () => {
    const src = read('src/screens/tickets/TicketListScreen.tsx');
    assert.match(src, /useTickets\(\{[^}]*advanced: ticketAdvanced/);
    assert.ok(src.includes('ticketListFilters(user)'));
    assert.ok(src.includes('activeAdvancedFilters(ticketAdvanced, allowedMore)'));
  });

  test('the Filters sheet renders each filter only when ticketListFilters() lists it', () => {
    const src = read('src/screens/tickets/TicketFiltersScreen.tsx');
    assert.ok(src.includes('ticketListFilters(user)'));
    // Each field sits directly behind its own check, and appears once (no unguarded copy elsewhere).
    const GUARDED = {
      priority: /allowed\.includes\('priority'\) \? \(\s*<SelectField\s+label="Priority"/,
      category: /allowed\.includes\('category'\) \? \(\s*<SelectField\s+label="Category"/,
      date: /allowed\.includes\('date'\) \? \(\s*<View[^>]*>\s*<FieldLabel label="Created"/,
      technician: /allowed\.includes\('technician'\) \? \(\s*<SelectField\s+label="Technician"/,
      group: /allowed\.includes\('group'\) \? \(\s*<SelectField\s+label="Group"/,
    };
    for (const key of ALL_FIVE) assert.match(src, GUARDED[key], key);
    for (const label of ['label="Priority"', 'label="Category"', 'label="Created"', 'label="Technician"', 'label="Group"']) {
      assert.equal(src.split(label).length - 1, 1, label);
    }
    assert.match(src, /allowed\.includes\('technician'\) \? \(\s*<PersonPickerSheet/);
    assert.equal(src.split('<PersonPickerSheet').length - 1, 1);
    // Lookups are requested only for a filter the person has, and the technician search only through the AGENT role list.
    assert.match(src, /useTeams\(\{ enabled: [^}]*allowed\.includes\('group'\)/);
    assert.match(src, /useCategories\(\{ enabled: [^}]*allowed\.includes\('category'\)/);
    assert.ok(src.includes('searchRoles={TECHNICIAN_FILTER_ROLES}'));
    // No role decisions of its own: no low-level gate, no role comparison, no hard-coded role list.
    assert.doesNotMatch(src, /\b(isStaff|isAgentOrAdmin|isTriageAgent|isCountryLockedAgent|canSeePrivateNotes)\(/);
    assert.doesNotMatch(src, /\brole\s*[!=]==?\s*['"]|['"](ADMIN|AGENT|END_USER|L2_MANAGER)['"]\s*[!=]==?/);
    assert.doesNotMatch(src, /searchRoles=\{\[/);
  });
});
