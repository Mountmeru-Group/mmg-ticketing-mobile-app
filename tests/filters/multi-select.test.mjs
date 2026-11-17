// Multi-select dropdowns (2026-11-17, second brief). Built ONLY for a filter TKT-1 reads several values for: Status,
// one comma-separated `status` (tickets.controller.ts:114-116; docs/web-system/16-SAVED-VIEWS.md §7). Priority, category,
// technician and group are read as ONE value each, so they stay single: two would give a wrong list or a 500.
// What runs for real: utils/multi-select.ts, utils/ticket-filters.ts (the query), ui.store, and the TKT-1 request through
// the API client (axios transport faked). OptionSheet and the Filters screen are read as source (no React Native renderer).
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
  inOptionOrder, multiSelectSummary, sameChoices, selectAllState, selectionCount, toggleAllShown, toggleChoice,
} from '../../src/utils/multi-select.ts';
import { filterOptionsByLabel } from '../../src/utils/option-search.ts';
import { captureSavedView, decodeSavedView } from '../../src/utils/saved-filters.ts';
import {
  NO_ADVANCED_FILTERS, STATUS_FILTER_OPTIONS, activeAdvancedFilters, activeFilterLabels, advancedFilterQuery, cleanStatusList,
  namedFilterSetsStatus, statusFilterSummary, ticketListQuery, withAdvancedFilters, withNamedFilter,
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

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push({ url: config.url, params: { ...(config.params ?? {}) } });
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify({ data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrev: false }),
    config,
    request: {},
  };
};

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
    assert.equal(statusFilterSummary([]), null);
  });

  test('the count beside "Select all" is the web\'s: chosen / all options', () => {
    assert.equal(selectionCount(1, 38), '1/38');
    assert.equal(selectionCount(0, 12), '0/12');
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
});

describe('Status: the one multi-select, sent as ONE comma-separated `status`', () => {
  test('several statuses → one key, one comma list, in the web\'s order; only 03 values', () => {
    const query = advancedFilterQuery({ ...NO_ADVANCED_FILTERS, status: ['PENDING', 'OPEN'] }, ticketListFilters(admin));
    assert.deepEqual(query, { status: 'OPEN,PENDING' });
    assert.deepEqual(cleanStatusList(['CLOSED', 'NOPE', 'OPEN', 'OPEN', 7]), ['OPEN', 'CLOSED']);
    assert.deepEqual(STATUS_FILTER_OPTIONS.length, 12);
  });

  test('on the wire: `status=OPEN,IN_PROGRESS,PENDING` as one parameter, never repeated keys or an array', async () => {
    await listTickets({ ...ticketListQuery({ me: admin, filter: 'ALL', sort: 'UPDATED', advanced: { ...NO_ADVANCED_FILTERS, status: ['PENDING', 'IN_PROGRESS', 'OPEN'] }, allowed: ticketListFilters(admin) }) });
    assert.equal(sent[0].url, '/tickets');
    assert.equal(sent[0].params.status, 'OPEN,IN_PROGRESS,PENDING');
    assert.equal(typeof sent[0].params.status, 'string');
  });

  test('every role has it (the web\'s status select has no role check) and it counts as one filter', () => {
    for (const [name, persona] of Object.entries(PERSONAS)) {
      assert.ok(ticketListFilters(persona).includes('status'), name);
      const advanced = { ...NO_ADVANCED_FILTERS, status: ['OPEN', 'RESOLVED', 'CLOSED'] };
      assert.deepEqual(activeAdvancedFilters(advanced, ticketListFilters(persona)), ['status'], name);
      assert.deepEqual(activeFilterLabels({ filter: 'ALL', search: undefined, advanced, allowed: ticketListFilters(persona) }), ['Open +2'], name);
    }
  });

  test('one status slot: picking statuses moves a quick filter that sends one to All; that quick filter clears them', () => {
    let state = withNamedFilter({ filter: 'ALL', advanced: NO_ADVANCED_FILTERS }, 'OPEN');
    state = withAdvancedFilters(state, { status: ['RESOLVED'] });
    assert.deepEqual([state.filter, state.advanced.status], ['ALL', ['RESOLVED']]);
    state = withNamedFilter(state, 'PENDING');
    assert.deepEqual([state.filter, state.advanced.status], ['PENDING', []]);
    // Overdue sends `sla`, not `status`: the two combine.
    state = withNamedFilter({ filter: 'ALL', advanced: { ...NO_ADVANCED_FILTERS, status: ['OPEN'] } }, 'OVERDUE');
    assert.deepEqual([state.filter, state.advanced.status], ['OVERDUE', ['OPEN']]);
    const query = ticketListQuery({ me: admin, filter: 'OVERDUE', sort: 'UPDATED', advanced: state.advanced, allowed: ticketListFilters(admin) });
    assert.deepEqual([query.status, query.sla], ['OPEN', 'BREACHED']);
    for (const f of ['ALL', 'UNASSIGNED', 'OVERDUE', 'DUE_SOON']) assert.equal(namedFilterSetsStatus(f), false, f);
    for (const f of ['OPEN', 'MY_OPEN', 'PENDING', 'RESOLVED', 'CLOSED', 'ACTIVE_KPI', 'BREACHED_KPI']) assert.equal(namedFilterSetsStatus(f), true, f);
  });

  test('the store keeps the slot rule, and Clear all, a Home tile and sign-out empty the statuses', () => {
    const ui = useUiStore.getState();
    ui.setTicketFilter('CLOSED');
    ui.setTicketAdvanced({ status: ['OPEN', 'ON_HOLD'] });
    assert.deepEqual([useUiStore.getState().ticketFilter, useUiStore.getState().ticketAdvanced.status], ['ALL', ['OPEN', 'ON_HOLD']]);
    useUiStore.getState().clearTicketFilters();
    assert.deepEqual(useUiStore.getState().ticketAdvanced.status, []);
    ui.setTicketAdvanced({ status: ['OPEN'] });
    useUiStore.getState().openTicketList('ACTIVE_KPI');
    assert.deepEqual(useUiStore.getState().ticketAdvanced.status, []);
    ui.setTicketAdvanced({ status: ['OPEN'] });
    useUiStore.getState().reset();
    assert.deepEqual(useUiStore.getState().ticketAdvanced.status, []);
  });

  test('saved views carry several statuses and restore them', () => {
    const list = { ticketFilter: 'ALL', ticketSort: 'UPDATED', ticketSearch: undefined, ticketCountryId: null, ticketAdvanced: { ...NO_ADVANCED_FILTERS, status: ['ON_HOLD', 'PENDING_PARTNER', 'OPEN'] } };
    const { filters } = captureSavedView(list, admin);
    assert.deepEqual(filters, { status: 'OPEN,ON_HOLD,PENDING_PARTNER' });
    assert.deepEqual(decodeSavedView(filters, admin).content.advanced.status, ['OPEN', 'ON_HOLD', 'PENDING_PARTNER']);
  });
});

describe('single filters unchanged: priority, category, technician, group (the server reads one value each)', () => {
  const EVERYTHING = {
    ...NO_ADVANCED_FILTERS,
    priority: 'HIGH', category: { id: 'cat-hw', name: 'Hardware' }, technician: { id: 'tech-1', name: 'Jane' }, group: { id: 'team-1', name: 'SD' },
  };

  test('each sends exactly one value, never a list', () => {
    const query = advancedFilterQuery(EVERYTHING, ticketListFilters(admin));
    assert.deepEqual(query, { priority: 'HIGH', categoryId: 'cat-hw', assignedToId: 'tech-1', teamId: 'team-1' });
    for (const [key, value] of Object.entries(query)) {
      assert.equal(typeof value, 'string', key);
      assert.doesNotMatch(value, /,/, key);
    }
  });

  test('their state holds one value: a pick, not a list', () => {
    const source = read('src/utils/ticket-filters.ts');
    assert.match(source, /priority: TicketPriority \| null;/);
    assert.match(source, /category: FilterPick \| null;/);
    assert.match(source, /technician: FilterPick \| null;/);
    assert.match(source, /group: FilterPick \| null;/);
    assert.match(source, /status: readonly TicketStatus\[\];/);
  });

  test('their sheets stay single-choice; Status is the only `multiple` OptionSheet in the app', () => {
    const multiples = sourceFiles('src').flatMap((rel) => (read(rel).match(/<OptionSheet\s+multiple/g) ?? []).map(() => rel));
    assert.deepEqual(multiples, ['src/screens/tickets/TicketFiltersScreen.tsx']);
    const screen = read('src/screens/tickets/TicketFiltersScreen.tsx');
    const sheet = screen.slice(screen.indexOf('<OptionSheet\n          multiple'));
    assert.match(sheet.slice(0, 400), /title="Status"/);
    assert.match(sheet.slice(0, 400), /onChange=\{\(values\) => setTicketAdvanced\(\{ status: values \}\)\}/);
    for (const title of ['Priority', 'Category', 'Group']) {
      const at = screen.indexOf(`title="${title}"`);
      const open = screen.lastIndexOf('<OptionSheet', at);
      assert.doesNotMatch(screen.slice(open, at), /multiple/, title);
    }
  });
});

describe('OptionSheet `multiple`: one component, checkboxes, Select all with its count, Clear, the same search', () => {
  const sheet = read('src/components/OptionSheet.tsx');

  test('one component: the single-choice rows and the checkboxes are the same OptionSheet', () => {
    assert.match(sheet, /export type OptionSheetProps<T extends string> = SingleProps<T> \| MultipleProps<T>;/);
    assert.match(sheet, /multiple \? \(\s*<CheckRow option=\{item\} checked=\{chosen\.has\(item\.value\)\} onToggle=\{toggle\} \/>\s*\) : \(\s*<OptionRow/);
    assert.match(sheet, /accessibilityRole="checkbox"\s*accessibilityState=\{\{ checked \}\}/);
  });

  test('"Select all" pinned above the list, with the web\'s count, applying to the search\'s matches', () => {
    assert.ok(sheet.indexOf('<SearchField') < sheet.indexOf("'Select all shown' : 'Select all'"));
    assert.ok(sheet.indexOf("'Select all shown' : 'Select all'") < sheet.indexOf('<FlatList'), 'outside the list, so it never scrolls away');
    assert.match(sheet, /\{selectionCount\(draft\.length, options\.length\)\}/);
    assert.match(sheet, /toggleAllShown\(options as readonly SheetOption<string>\[\], shown, now\)/);
    assert.match(sheet, /checked: allState === 'all' \? true : allState === 'some' \? 'mixed' : false/);
  });

  test('Clear and Done; the ticks reach the caller once, when the sheet closes, and only if they changed', () => {
    assert.match(sheet, /<OutlineButton label="Clear" onPress=\{\(\) => setDraft\(\[\]\)\} disabled=\{draft\.length === 0\} \/>/);
    assert.match(sheet, /<SubmitButton label="Done" onPress=\{close\} \/>/);
    assert.match(sheet, /if \(props\.multiple === true && !sameChoices\(draft, props\.selectedValues\)\) props\.onChange\(draft as T\[\]\);/);
    assert.match(sheet, /if \(visible && committed\) setDraft\(inOptionOrder\(/);
  });

  test('the search still works in it: the same field, the same rule, the same threshold', () => {
    assert.match(sheet, /const searchable = children === undefined && isSearchableList\(options\.length\);/);
    assert.equal(sheet.split('<SearchField').length - 1, 1);
    assert.equal(sheet.split('<FlatList').length - 1, 1);
    // Status has 12 options: past the threshold of 10, so its sheet has the search.
    assert.ok(STATUS_FILTER_OPTIONS.length > 10);
  });
});
