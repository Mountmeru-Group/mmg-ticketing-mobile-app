// Multi-select on EVERY ticket-list filter (2026-11-18, Ronit's brief): status, priority, category, technician and group.
// Each sends ONE parameter holding its values joined by commas, as the live web portal does. The format was read from a
// URL Ronit copied from the UAT portal (three categories, two technicians), not from source: the web clone still reads
// priority, category, technician and group as one value (01-API-CONTRACT.md TKT-1, 16-SAVED-VIEWS.md §7).
// - Several values: `categoryId=a,b,c`, one key, never repeated keys, never an array.
// - One value: exactly as before the multi-select (no comma). None: the key is not sent at all.
// - The HTTP client (axios) encodes the query; nothing in the app builds a query string.
// What runs for real: utils/multi-select.ts, utils/ticket-filters.ts, utils/saved-filters.ts, ui.store, and the TKT-1
// request through the API client (axios transport faked; the URL axios builds is read back). OptionSheet and the Filters
// screen are read as source (no React Native renderer).
// iOS (iOS-5i): Android's 723e2fc tests, with one change, marked "iOS": Clear and Done sit in the sheet's bar
// (components/OptionSheet.tsx; Ronit, decision 4), not in a footer.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { listTickets } from '../../src/api/tickets.api.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import { ticketListFilters } from '../../src/utils/permissions.ts';
import {
  byLabel, inOptionOrder, mergeOptions, multiSelectSummary, sameChoices, selectAllState, selectionCount,
  selectionCountUnknownTotal, toggleAllShown, toggleChoice,
} from '../../src/utils/multi-select.ts';
import { filterOptionsByLabel } from '../../src/utils/option-search.ts';
import {
  captureSavedView, decodeSavedView, sameSavedViewFilters, savedViewChips, savedViewFiltersFor,
} from '../../src/utils/saved-filters.ts';
import {
  NO_ADVANCED_FILTERS, STATUS_FILTER_OPTIONS, activeAdvancedFilters, activeFilterLabels, advancedFilterQuery, cleanPicks,
  cleanPriorityList, cleanStatusList, namedFilterSetsStatus, picksSummary, priorityFilterSummary, statusFilterSummary,
  ticketListQuery, withAdvancedFilters, withNamedFilter,
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

/** 38 options, as UAT's category list: the web's "Select All 1/38". */
const MANY = Array.from({ length: 38 }, (_, i) => ({ value: `c${i}`, label: i === 5 ? 'Afrikomart' : i === 6 ? 'Afrika Retail' : `Category ${i}` }));
const admin = PERSONAS.ADMIN;
const ADMIN_FILTERS = ticketListFilters(admin);

/** The ids in the URL Ronit copied from the UAT portal (2026-11-18): three categories, two technicians. */
const PORTAL_CATEGORIES = ['416f882d-e18c-4be9-a9a2-31fb1590533c', '4f72a6ef-4eac-4d62-9076-c5f897527a82', '17715eba-a9ec-488a-b66e-89a15f268b73'];
const PORTAL_TECHNICIANS = ['f29cdb1e-f175-4768-af19-2ba871d6d035', '11e436d3-855d-42d2-b86a-e67e9564637e'];
const PORTAL_QUERY =
  'categoryId=416f882d-e18c-4be9-a9a2-31fb1590533c%2C4f72a6ef-4eac-4d62-9076-c5f897527a82%2C17715eba-a9ec-488a-b66e-89a15f268b73' +
  '&assignedToId=f29cdb1e-f175-4768-af19-2ba871d6d035%2C11e436d3-855d-42d2-b86a-e67e9564637e';

const picks = (ids, word = 'Item') => ids.map((id, i) => ({ id, name: `${word} ${i + 1}` }));

/** Every filter holding the given ids / values. */
function filtersWith({ status = [], priority = [], category = [], technician = [], group = [] }) {
  return { ...NO_ADVANCED_FILTERS, status, priority, category: picks(category, 'Category'), technician: picks(technician, 'Tech'), group: picks(group, 'Group') };
}

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push({ url: config.url, params: { ...(config.params ?? {}) }, uri: apiClient.getUri(config) });
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify({ data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrev: false }),
    config,
    request: {},
  };
};

/** The query of the URL axios actually built, decoded as the server's query parser decodes it. */
const sentQuery = (i = 0) => new URL(sent[i].uri, 'https://x.invalid').searchParams;

beforeEach(() => {
  sent.length = 0;
  useUiStore.getState().reset();
});

describe('the rules (utils/multi-select.ts)', () => {
  test('the closed field reads "Afrikomart +2": the first chosen in option order, then how many more', () => {
    assert.equal(multiSelectSummary([]), null);
    assert.equal(multiSelectSummary(['Afrikomart']), 'Afrikomart');
    assert.equal(multiSelectSummary(['Afrikomart', 'Category 9', 'Category 20']), 'Afrikomart +2');
    assert.equal(statusFilterSummary(['PENDING', 'OPEN', 'IN_PROGRESS']), 'Open +2', 'option order, not tap order');
    assert.equal(priorityFilterSummary(['URGENT', 'LOW']), 'Low +1');
    assert.equal(picksSummary([{ id: 'c5', name: 'Afrikomart' }, { id: 'c6', name: 'Afrika Retail' }, { id: 'c9', name: 'Category 9' }]), 'Afrikomart +2');
    for (const none of [statusFilterSummary([]), priorityFilterSummary([]), picksSummary([])]) assert.equal(none, null);
  });

  test('the count beside "Select all" is the web\'s: chosen / all options; a server search has no total', () => {
    assert.equal(selectionCount(1, 38), '1/38');
    assert.equal(selectionCount(0, 12), '0/12');
    assert.equal(selectionCountUnknownTotal(2), '2 selected');
  });

  test('ticking keeps option order and each value once; untick removes it', () => {
    let chosen = toggleChoice(MANY, [], 'c9');
    chosen = toggleChoice(MANY, chosen, 'c2');
    assert.deepEqual(chosen, ['c2', 'c9']);
    assert.deepEqual(toggleChoice(MANY, chosen, 'c2'), ['c9']);
    assert.deepEqual(inOptionOrder(MANY, ['c9', 'zz', 'c2', 'c2']), ['c2', 'c9'], 'unknown values dropped');
    assert.equal(sameChoices(['c2', 'c9'], ['c9', 'c2']), true);
    assert.equal(sameChoices(['c2'], ['c2', 'c9']), false);
  });

  test('"Select all" with no search: every option; again: none. Its state is all / some / none', () => {
    assert.equal(selectAllState(MANY, []), 'none');
    const all = toggleAllShown(MANY, MANY, ['c3']);
    assert.equal(all.length, 38);
    assert.equal(selectAllState(MANY, all), 'all');
    assert.equal(selectAllState(MANY, ['c3']), 'some');
    assert.deepEqual(toggleAllShown(MANY, MANY, all), []);
  });

  test('"Select all" applies to what the SEARCH shows, and keeps choices the search hides', () => {
    const shown = filterOptionsByLabel(MANY, 'afrik');
    assert.deepEqual(shown.map((o) => o.label), ['Afrikomart', 'Afrika Retail']);
    const chosen = toggleAllShown(MANY, shown, ['c30']);
    assert.deepEqual(chosen, ['c5', 'c6', 'c30'], 'the two shown are added; c30, hidden by the search, stays');
    assert.equal(selectAllState(shown, chosen), 'all');
    assert.deepEqual(toggleAllShown(MANY, shown, chosen), ['c30'], 'again: only the shown are taken off');
    assert.equal(selectAllState([], chosen), 'none', 'no match: nothing to select');
  });

  test('a chosen value the options lack keeps its row and name (merge), so opening and closing drops nothing', () => {
    const stale = { value: 'gone', label: 'Old category' };
    const known = mergeOptions(MANY.slice(0, 3), [stale, MANY[1]]);
    assert.deepEqual(known.map((o) => o.value), ['c0', 'c1', 'c2', 'gone'], 'the options first, each value once');
    assert.deepEqual(inOptionOrder(known, ['gone', 'c1']), ['c1', 'gone']);
    assert.deepEqual(byLabel([{ value: 'b', label: 'Zed' }, { value: 'a', label: 'Amy' }]).map((o) => o.value), ['a', 'b']);
  });
});

describe('the wire: each of the five sends ONE parameter, its values joined by commas', () => {
  const CASES = [
    { key: 'status', param: 'status', several: { status: ['PENDING', 'OPEN', 'IN_PROGRESS'] }, expect: 'OPEN,IN_PROGRESS,PENDING', one: { status: ['OPEN'] }, single: 'OPEN' },
    { key: 'priority', param: 'priority', several: { priority: ['URGENT', 'LOW'] }, expect: 'LOW,URGENT', one: { priority: ['HIGH'] }, single: 'HIGH' },
    { key: 'category', param: 'categoryId', several: { category: PORTAL_CATEGORIES }, expect: PORTAL_CATEGORIES.join(','), one: { category: ['cat-1'] }, single: 'cat-1' },
    { key: 'technician', param: 'assignedToId', several: { technician: PORTAL_TECHNICIANS }, expect: PORTAL_TECHNICIANS.join(','), one: { technician: ['tech-1'] }, single: 'tech-1' },
    { key: 'group', param: 'teamId', several: { group: ['team-a', 'team-b', 'team-c'] }, expect: 'team-a,team-b,team-c', one: { group: ['team-1'] }, single: 'team-1' },
  ];

  for (const c of CASES) {
    test(`${c.key}: several values → \`${c.param}=<a>,<b>…\`; one → the unchanged single value; none → no key`, () => {
      assert.deepEqual(advancedFilterQuery(filtersWith(c.several), ADMIN_FILTERS), { [c.param]: c.expect });
      assert.deepEqual(advancedFilterQuery(filtersWith(c.one), ADMIN_FILTERS), { [c.param]: c.single });
      assert.doesNotMatch(c.single, /,/, 'one value: no comma, exactly as before the multi-select');
      assert.deepEqual(advancedFilterQuery(filtersWith({}), ADMIN_FILTERS), {}, 'nothing chosen: the key is not sent at all');
      assert.deepEqual(activeAdvancedFilters(filtersWith(c.several), ADMIN_FILTERS), [c.key], 'several values are one filter');
    });

    test(`${c.key} on the wire: one key in the URL axios builds, the values a single comma list, never repeated or an array`, async () => {
      await listTickets(ticketListQuery({ me: admin, filter: 'ALL', sort: 'UPDATED', advanced: filtersWith(c.several), allowed: ADMIN_FILTERS }));
      assert.equal(typeof sent[0].params[c.param], 'string', 'a string, so axios never writes `key[]=`');
      const query = sentQuery();
      assert.deepEqual(query.getAll(c.param), [c.expect]);
      assert.doesNotMatch(sent[0].uri, new RegExp(`${c.param}\\[\\]|${c.param}=[^&]*&${c.param}=`));
    });
  }

  test('the portal\'s own URL and the app\'s request carry the same values (Ronit\'s UAT URL, 2026-11-18)', async () => {
    const portal = new URLSearchParams(PORTAL_QUERY);
    await listTickets(ticketListQuery({
      me: admin, filter: 'ALL', sort: 'UPDATED', allowed: ADMIN_FILTERS,
      advanced: filtersWith({ category: PORTAL_CATEGORIES, technician: PORTAL_TECHNICIANS }),
    }));
    const app = sentQuery();
    for (const key of ['categoryId', 'assignedToId']) {
      assert.deepEqual(app.getAll(key), portal.getAll(key), key);
      assert.equal(app.get(key).split(',').length, key === 'categoryId' ? 3 : 2, key);
    }
    // The HTTP client encodes it, as it already does for `status`: axios leaves the comma as is, the browser writes %2C.
    // Both decode to the same value (above). The app hands axios plain strings and never builds the query itself.
    assert.match(sent[0].uri, /categoryId=416f882d-e18c-4be9-a9a2-31fb1590533c,4f72a6ef-/);
  });

  test('every filter at once, several values each: one key per filter, in one request', async () => {
    const advanced = filtersWith({
      status: ['ON_HOLD', 'OPEN'], priority: ['HIGH', 'URGENT'], category: PORTAL_CATEGORIES, technician: PORTAL_TECHNICIANS, group: ['team-a', 'team-b'],
    });
    await listTickets({ ...ticketListQuery({ me: admin, filter: 'ALL', sort: 'UPDATED', advanced, allowed: ADMIN_FILTERS }), limit: 20 });
    assert.deepEqual(sent[0].params, {
      status: 'OPEN,ON_HOLD', priority: 'HIGH,URGENT', categoryId: PORTAL_CATEGORIES.join(','),
      assignedToId: PORTAL_TECHNICIANS.join(','), teamId: 'team-a,team-b', page: 1, limit: 20,
    });
  });

  test('no filter ever sends a trailing comma, an empty value, or a value twice', () => {
    const messy = {
      ...NO_ADVANCED_FILTERS,
      status: ['OPEN', 'NOPE', '', 'OPEN'],
      priority: ['HIGH', '', 'SEVERE', 'HIGH'],
      category: [{ id: 'cat-1', name: 'A' }, { id: '', name: 'Empty' }, { id: 'a,b', name: 'Comma' }, { id: 'cat-1', name: 'Again' }, null, 'x'],
      technician: [{ id: 'tech-1', name: 'T' }, { id: 'tech 2', name: 'Space' }, { name: 'No id' }],
      group: [{ id: '', name: '' }],
    };
    const query = advancedFilterQuery(messy, ADMIN_FILTERS);
    assert.deepEqual(query, { status: 'OPEN', priority: 'HIGH', categoryId: 'cat-1', assignedToId: 'tech-1' }, 'the group has no usable id: no key');
    for (const [key, value] of Object.entries(query)) {
      assert.doesNotMatch(value, /^,|,$|,,/, `${key}: no empty part`);
      assert.notEqual(value, '', key);
    }
    for (const empty of [[], [{ id: '', name: '' }]]) {
      assert.deepEqual(advancedFilterQuery({ ...NO_ADVANCED_FILTERS, category: empty, technician: empty, group: empty }, ADMIN_FILTERS), {});
    }
    assert.deepEqual(cleanPriorityList(['URGENT', 'LOW', 'LOW', 7]), ['LOW', 'URGENT']);
    assert.deepEqual(cleanStatusList(['CLOSED', 'NOPE', 'OPEN', 'OPEN', 7]), ['OPEN', 'CLOSED']);
    assert.deepEqual(cleanPicks([{ id: 'x', name: 'X' }, { id: 'x', name: 'Dup' }]), [{ id: 'x', name: 'X' }]);
  });

  test('roles: END_USER and L2_MANAGER never send technicians or groups, however many the state holds', () => {
    for (const persona of [PERSONAS.END_USER, PERSONAS.L2_MANAGER]) {
      const query = advancedFilterQuery(filtersWith({ category: ['c1', 'c2'], technician: ['t1', 't2'], group: ['g1', 'g2'] }), ticketListFilters(persona));
      assert.deepEqual(query, { categoryId: 'c1,c2' }, persona.role);
    }
  });
});

describe('the slots: a quick filter and the matching multi-select replace each other, whatever they hold', () => {
  test('statuses: picking some moves a status quick filter to All; that quick filter clears them; Overdue combines', () => {
    let state = withNamedFilter({ filter: 'ALL', advanced: NO_ADVANCED_FILTERS }, 'OPEN');
    state = withAdvancedFilters(state, { status: ['RESOLVED', 'CLOSED'] });
    assert.deepEqual([state.filter, state.advanced.status], ['ALL', ['RESOLVED', 'CLOSED']]);
    state = withNamedFilter(state, 'PENDING');
    assert.deepEqual([state.filter, state.advanced.status], ['PENDING', []]);
    state = withNamedFilter({ filter: 'ALL', advanced: { ...NO_ADVANCED_FILTERS, status: ['OPEN'] } }, 'OVERDUE');
    const query = ticketListQuery({ me: admin, filter: 'OVERDUE', sort: 'UPDATED', advanced: state.advanced, allowed: ADMIN_FILTERS });
    assert.deepEqual([query.status, query.sla], ['OPEN', 'BREACHED']);
    for (const f of ['ALL', 'UNASSIGNED', 'OVERDUE', 'DUE_SOON']) assert.equal(namedFilterSetsStatus(f), false, f);
  });

  test('technicians: several picked replace "My open" / "Unassigned"; either of those clears them all', () => {
    const two = picks(['t1', 't2'], 'Tech');
    let state = withAdvancedFilters({ filter: 'MY_OPEN', advanced: NO_ADVANCED_FILTERS }, { technician: two });
    assert.deepEqual([state.filter, state.advanced.technician], ['ALL', two]);
    state = withNamedFilter(state, 'UNASSIGNED');
    assert.deepEqual([state.filter, state.advanced.technician], ['UNASSIGNED', []]);
    assert.equal(withAdvancedFilters({ filter: 'MY_OPEN', advanced: NO_ADVANCED_FILTERS }, { technician: [] }).filter, 'MY_OPEN', 'clearing changes nothing');
    const query = ticketListQuery({ me: admin, filter: 'MY_OPEN', sort: 'UPDATED', advanced: { ...NO_ADVANCED_FILTERS, technician: two }, allowed: ADMIN_FILTERS });
    assert.equal(query.assignedToId, admin.id, 'the request\'s own guard: one assignedToId, the quick filter\'s');
  });

  test('the store keeps the lists, and Clear all, a Home tile and sign-out empty every one', () => {
    const ui = useUiStore.getState();
    ui.setTicketAdvanced(filtersWith({ status: ['OPEN'], priority: ['LOW', 'HIGH'], category: ['c1', 'c2'], technician: ['t1'], group: ['g1', 'g2'] }));
    assert.deepEqual(useUiStore.getState().ticketAdvanced.priority, ['LOW', 'HIGH']);
    assert.deepEqual(useUiStore.getState().ticketAdvanced.category.map((c) => c.id), ['c1', 'c2']);
    useUiStore.getState().clearTicketFilters();
    assert.deepEqual(useUiStore.getState().ticketAdvanced, NO_ADVANCED_FILTERS);
    ui.setTicketAdvanced(filtersWith({ group: ['g1', 'g2'] }));
    useUiStore.getState().openTicketList('ACTIVE_KPI');
    assert.deepEqual(useUiStore.getState().ticketAdvanced, NO_ADVANCED_FILTERS);
    ui.setTicketAdvanced(filtersWith({ category: ['c1', 'c2'] }));
    useUiStore.getState().reset();
    assert.deepEqual(useUiStore.getState().ticketAdvanced, NO_ADVANCED_FILTERS);
  });

  test('the line under the quick filters names each filter once, as the closed fields do', () => {
    const advanced = { ...filtersWith({ status: ['OPEN', 'RESOLVED'], priority: ['HIGH', 'URGENT'] }), category: [{ id: 'c5', name: 'Afrikomart' }, { id: 'c6', name: 'Afrika Retail' }, { id: 'c9', name: 'Hardware' }] };
    assert.deepEqual(activeFilterLabels({ filter: 'ALL', search: undefined, advanced, allowed: ADMIN_FILTERS }), ['Open +1', 'High +1 priority', 'Afrikomart +2']);
    const one = filtersWith({ priority: ['HIGH'] });
    assert.deepEqual(activeFilterLabels({ filter: 'ALL', search: undefined, advanced: one, allowed: ADMIN_FILTERS }), ['High priority'], 'one value: as before');
  });
});

describe('saved views: several values per filter, stored as the web stores them (comma strings), read back whole', () => {
  const NAMES = {
    category: (id) => ({ c1: 'Afrikomart', c2: 'Hardware', c3: 'Network' })[id] ?? null,
    group: (id) => ({ g1: 'Service Desk', g2: 'Network Team' })[id] ?? null,
    technician: (id) => ({ t1: 'Jane Tech', t2: 'John Tech' })[id] ?? null,
  };
  const LIST = {
    ticketFilter: 'ALL', ticketSort: 'PRIORITY', ticketSearch: undefined, ticketCountryId: null,
    ticketAdvanced: {
      ...NO_ADVANCED_FILTERS,
      status: ['ON_HOLD', 'OPEN'], priority: ['URGENT', 'HIGH'], fromDate: '2026-11-01',
      category: [{ id: 'c1', name: 'Afrikomart' }, { id: 'c2', name: 'Hardware' }, { id: 'c3', name: 'Network' }],
      technician: [{ id: 't1', name: 'Jane Tech' }, { id: 't2', name: 'John Tech' }],
      group: [{ id: 'g1', name: 'Service Desk' }, { id: 'g2', name: 'Network Team' }],
    },
  };

  test('the phone writes one comma string per key, the web\'s eight keys only: never an array', () => {
    const { filters } = captureSavedView(LIST, admin);
    assert.deepEqual(filters, {
      status: 'OPEN,ON_HOLD', priority: 'HIGH,URGENT', sortBy: 'priority', assignedToId: 't1,t2', teamId: 'g1,g2',
      categoryId: 'c1,c2,c3', fromDate: '2026-11-01',
    });
    for (const value of Object.values(filters)) assert.equal(typeof value, 'string');
  });

  test('round trip: saved, through JSON (the server\'s Json column), read back with every value and its name', () => {
    const { content, filters } = captureSavedView(LIST, admin);
    const back = decodeSavedView(JSON.parse(JSON.stringify(filters)), admin, NAMES);
    assert.deepEqual(back.leftOut, []);
    assert.deepEqual(back.content.advanced.status, ['OPEN', 'ON_HOLD']);
    assert.deepEqual(back.content.advanced.priority, ['HIGH', 'URGENT']);
    assert.deepEqual(back.content.advanced.category, LIST.ticketAdvanced.category);
    assert.deepEqual(back.content.advanced.technician, LIST.ticketAdvanced.technician);
    assert.deepEqual(back.content.advanced.group, LIST.ticketAdvanced.group);
    // Applied, it puts the same request on the list as the one that was saved.
    useUiStore.getState().applySavedTicketFilter(back.content);
    const s = useUiStore.getState();
    const again = ticketListQuery({ me: admin, filter: s.ticketFilter, sort: s.ticketSort, advanced: s.ticketAdvanced, allowed: ADMIN_FILTERS });
    assert.deepEqual(again, ticketListQuery({ me: admin, filter: content.filter, sort: content.sort, advanced: content.advanced, allowed: ADMIN_FILTERS }));
    assert.deepEqual(savedViewChips(back.content), [
      'Quick filter: All', 'Status: Open, On Hold', 'Priority: High, Urgent', 'Category: Afrikomart, Hardware, Network',
      'Created from 01 Nov 2026', 'Technician: Jane Tech, John Tech', 'Group: Service Desk, Network Team', 'Sort: Priority',
    ]);
  });

  test('a web view whose lists are in another order is the same view (its chip lights up), and applies as one', () => {
    const web = { categoryId: 'c3,c1,c2', assignedToId: 't2,t1', teamId: 'g2,g1', priority: 'URGENT,HIGH', status: 'ON_HOLD,OPEN', sortBy: 'priority', fromDate: '2026-11-01' };
    assert.equal(sameSavedViewFilters(web, captureSavedView(LIST, admin).filters), true);
    assert.equal(sameSavedViewFilters({ ...web, categoryId: 'c3,c1' }, captureSavedView(LIST, admin).filters), false, 'a missing value is another view');
    const { content, leftOut } = decodeSavedView(web, admin, NAMES);
    assert.deepEqual(leftOut, []);
    assert.deepEqual(content.advanced.category.map((c) => c.id), ['c3', 'c1', 'c2'], 'as the web stored them');
  });

  test('one value per key reads exactly as before the multi-select', () => {
    const { content, leftOut } = decodeSavedView({ categoryId: 'c1', assignedToId: 't1', teamId: 'g1', priority: 'HIGH' }, admin, NAMES);
    assert.deepEqual(leftOut, []);
    assert.deepEqual(savedViewFiltersFor(content, admin).filters, { priority: 'HIGH', assignedToId: 't1', teamId: 'g1', categoryId: 'c1' });
  });

  test('what the app cannot read is named and not sent: an array, an empty part only, "unassigned" inside a list, an unknown priority', () => {
    const { content, leftOut } = decodeSavedView(
      { categoryId: ['c1', 'c2'], teamId: ',', assignedToId: 'unassigned,t1', priority: 'HIGH,SEVERE' },
      admin,
      NAMES,
    );
    assert.deepEqual(leftOut, [
      'Technician “unassigned,t1” (not readable by the app)',
      'Priority “HIGH,SEVERE” (not a priority the app knows)',
      'Category “["c1","c2"]” (not readable by the app)',
      'Group “,” (not readable by the app)',
    ]);
    assert.deepEqual(advancedFilterQuery(content.advanced, ADMIN_FILTERS), {});
    assert.equal(content.filter, 'ALL');
  });

  test('roles: END_USER keeps its categories and priorities, and is told its technicians and groups were left out', () => {
    const { content, leftOut } = decodeSavedView({ categoryId: 'c1,c2', priority: 'LOW,HIGH', assignedToId: 't1,t2', teamId: 'g1' }, PERSONAS.END_USER, NAMES);
    assert.deepEqual(leftOut, ['Technician (not available to your role)', 'Group (not available to your role)']);
    assert.deepEqual(advancedFilterQuery(content.advanced, ticketListFilters(PERSONAS.END_USER)), { priority: 'LOW,HIGH', categoryId: 'c1,c2' });
  });

  test('the names lookup reads every id in a comma list (useSavedViewNames)', () => {
    const src = read('src/hooks/useSavedViews.ts');
    assert.match(src, /for \(const id of value\.split\(','\)\.map\(\(s\) => s\.trim\(\)\)\) if \(isFilterId\(id\)\) add\(id\);/);
    for (const key of ['categoryId', 'teamId', 'assignedToId']) assert.ok(src.includes(`each(f.${key},`), key);
  });
});

describe('OptionSheet `multiple`: one component for all five, checkboxes, Select all with its count, Clear, the search', () => {
  const sheet = read('src/components/OptionSheet.tsx');
  const screen = read('src/screens/tickets/TicketFiltersScreen.tsx');

  test('one component: the single-choice rows and the checkboxes are the same OptionSheet', () => {
    assert.match(sheet, /export type OptionSheetProps<T extends string> = SingleProps<T> \| MultipleProps<T>;/);
    assert.match(sheet, /multiple \? \(\s*<CheckRow option=\{item\} checked=\{chosen\.has\(item\.value\)\} onToggle=\{toggle\} \/>\s*\) : \(\s*<OptionRow/);
    assert.match(sheet, /accessibilityRole="checkbox"\s*accessibilityState=\{\{ checked \}\}/);
    assert.equal(sourceFiles('src/components').filter((rel) => /Sheet\.tsx$/.test(rel) && /multiple/.test(read(rel))).join(), 'src/components/OptionSheet.tsx');
  });

  test('all five filters are `multiple` OptionSheets, and nothing else in the app is one', () => {
    const multiples = sourceFiles('src').flatMap((rel) => (read(rel).match(/<OptionSheet\s+multiple/g) ?? []).map(() => rel));
    assert.deepEqual(multiples, Array(5).fill('src/screens/tickets/TicketFiltersScreen.tsx'));
    for (const [title, all] of [['Status', 'All statuses'], ['Priority', 'All priorities'], ['Category', 'All categories'], ['Group', 'All groups'], ['Technician', 'All technicians']]) {
      const at = screen.indexOf(`title="${title}"`);
      const open = screen.lastIndexOf('<OptionSheet', at);
      assert.match(screen.slice(open, at + 60), new RegExp(`<OptionSheet\\s+multiple[\\s\\S]*title="${title}"\\s+allLabel="${all}"`), title);
    }
  });

  test('"All categories" clears the choice: a row of its own, never a value; no sentinel value is left in the screen', () => {
    assert.doesNotMatch(screen, /__ALL__|const ALL\b/);
    assert.match(sheet, /<AllRow label=\{allLabel\} active=\{draft\.length === 0\} onPress=\{\(\) => setDraft\(\[\]\)\} \/>/);
    assert.match(sheet, /ListHeaderComponent=\{\s*allLabel && !typed \?/);
  });

  test('"Select all" pinned above the list, with the web\'s count, applying to the search\'s matches', () => {
    assert.ok(sheet.indexOf('<SearchField') < sheet.indexOf("'Select all shown' : 'Select all'"));
    assert.ok(sheet.indexOf("'Select all shown' : 'Select all'") < sheet.indexOf('<FlatList'), 'outside the list, so it never scrolls away');
    assert.match(sheet, /const count = remote \? selectionCountUnknownTotal\(draft\.length\) : selectionCount\(draft\.length, known\.length\);/);
    assert.match(sheet, /setDraft\(\(now\) => toggleAllShown\(known, shown, now\)\);/);
    assert.match(sheet, /checked: allState === 'all' \? true : allState === 'some' \? 'mixed' : false/);
  });

  test('Clear and Done; the ticks reach the caller once, when the sheet closes, and only if they changed, with names', () => {
    // iOS: in the page sheet's bar (SheetTextButton), not Android's footer (OutlineButton, SubmitButton).
    assert.match(sheet, /<SheetTextButton label="Clear" onPress=\{\(\) => setDraft\(\[\]\)\} disabled=\{draft\.length === 0\} \/>/);
    assert.match(sheet, /<SheetTextButton label="Done" onPress=\{close\} bold \/>/);
    assert.match(sheet, /if \(multi && !sameChoices\(draft, committed \?\? \[\]\)\) \{/);
    assert.match(sheet, /multi\.onChange\(draft as T\[\], chosen as SheetOption<T>\[\]\);/);
  });

  test('a chosen value outside the options (a saved view\'s, or one still loading) keeps its row: closing never drops it', () => {
    assert.match(sheet, /\(remote \? byLabel\(mergeOptions\(named, met, options\)\) : mergeOptions\(options, named\)\)/);
    assert.match(sheet, /setDraft\(inOptionOrder\(remote \? byLabel\(mergeOptions\(named, options\)\) : mergeOptions\(options, named\), committed\)\);/);
    for (const key of ['category', 'group', 'technician']) {
      assert.ok(screen.includes(`selectedOptions={pickOptions(advanced.${key})}`), key);
      assert.ok(screen.includes(`onChange={(_values, chosen) => setTicketAdvanced({ ${key}: picksFrom(chosen) })}`), key);
    }
  });

  test('technicians: the same sheet, filled by a server search (USR-3, AGENTs, 2+ letters); the chosen stay listed', () => {
    assert.match(screen, /remoteSearch=\{\{\s*query: technicianQuery,\s*onQueryChange: setTechnicianQuery,/);
    assert.match(sheet, /if \(remote\) return query\.trim\(\) \? options : known\.filter\(\(o\) => pinned\.has\(o\.value\)\);/);
    assert.match(sheet, /return merged\.length === now\.length \? now : merged;/, 'results that are not new change no state (no render loop)');
    assert.match(screen, /const TECHNICIAN_SEARCH_MIN = 2;/);
    assert.match(screen, /\.filter\(\(u\) => isFilterId\(u\.id\)\)/, 'only ids that can be sent in a comma list');
  });

  test('the search still works in it: the same field, the same rule, the same threshold', () => {
    assert.match(sheet, /const searchable = remote !== null \|\| \(children === undefined && isSearchableList\(known\.length\)\);/);
    assert.equal(sheet.split('<SearchField').length - 1, 1);
    assert.equal(sheet.split('<FlatList').length - 1, 1);
    assert.ok(STATUS_FILTER_OPTIONS.length > 10, 'Status has 12 options: past the threshold of 10, so its sheet has the search');
  });

  test('the closed fields read "Afrikomart +2", never a list of every name', () => {
    assert.ok(screen.includes('value={statusFilterSummary(advanced.status)}'));
    assert.ok(screen.includes('value={priorityFilterSummary(advanced.priority)}'));
    for (const key of ['category', 'technician', 'group']) assert.ok(screen.includes(`value={picksSummary(advanced.${key})}`), key);
  });
});
