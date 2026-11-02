// G6: the Home PERIOD row and the KPI tiles and status chips at parity with the web dashboard.
// The web's behaviour, with sources, is docs/G6-WEB-DASHBOARD.md. These tests pin:
//   1. each period sends DSH-1 exactly what the web's button sends (the request itself, through the real axios client);
//   2. Custom range validation;
//   3. what each tile and chip counts (the web's KPI field), and the zero-hiding of the web's mini-cards;
//   4. each tile and chip opens the list it counts, and that list is allowed for every persona who sees it;
//   5. the period lasts while the app is open and is wiped on sign-out; the stale caption is gone.
// Role variants (which tiles, chips and period row each persona gets) are pinned in tests/rbac/role-gating.test.mjs.
//
// What is real: dashboard-period.ts, home-kpis.ts, permissions.ts, ticket-filters.ts, ui.store.ts, the DSH-1 API module
// and the axios client. What is faked: the network (axios's transport adapter records requests). Nothing calls UAT.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { getDashboard } from '../../src/api/dashboard.api.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import { TICKET_STATUSES } from '../../src/types/index.ts';
import {
  CUSTOM_RANGE_MESSAGES, DASHBOARD_PERIODS, DEFAULT_DASHBOARD_PERIOD, NO_CUSTOM_RANGE, customRangeLabel,
  customRangeProblem, dashboardPeriodKey, dashboardPeriodQuery,
} from '../../src/utils/dashboard-period.ts';
import {
  HOME_CHIP_LABELS, HOME_CHIP_LIST_FILTER, HOME_KPI_KEYS, HOME_TILE_LIST_FILTER, homeChipValue, homeTileLabel,
  homeTileValue, visibleHomeChips,
} from '../../src/utils/home-kpis.ts';
import { homeChips, homeTiles } from '../../src/utils/permissions.ts';
import { isTicketFilterAllowed, ticketFilterQuery } from '../../src/utils/ticket-filters.ts';
import { NAMES, PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, params: { ...(config.params ?? {}) } });
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify({ kpis: {}, recent: [] }),
    config,
    request: {},
  };
};
/** The query string axios sends: keys whose value is undefined are dropped, as axios drops them. */
const sentParams = (i = 0) => Object.fromEntries(Object.entries(sent[i].params).filter(([, v]) => v !== undefined));

// ── 1. What each period sends ────────────────────────────────

describe('PERIOD row: the web\'s buttons, in its order, sending what the web sends', () => {
  beforeEach(() => {
    sent.length = 0;
  });

  // FE:DashboardPage.tsx:294-304 — the button values, in order. FE:dashboard.api.ts:50-58 sends `range=<value>`.
  const WEB_ORDER = ['today', 'yesterday', 'last7', 'last30', 'week', 'month', 'quarter', 'year', 'all', 'custom'];
  const WEB_LABELS = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'This Week', 'This Month', 'Quarterly', 'This Year', 'All Time', 'Custom'];

  test('the same ten periods as the web, in the web\'s order, with the web\'s words (sentence case)', () => {
    assert.deepEqual(DASHBOARD_PERIODS.map((p) => p.value), WEB_ORDER);
    assert.deepEqual(DASHBOARD_PERIODS.map((p) => p.label.toLowerCase()), WEB_LABELS.map((l) => l.toLowerCase()));
  });

  test('the default is the web\'s: "This month" (range=month, FE:DashboardPage.tsx:61)', () => {
    assert.equal(DEFAULT_DASHBOARD_PERIOD, 'month');
    useUiStore.getState().reset();
    assert.equal(useUiStore.getState().homePeriod, 'month');
  });

  for (const period of WEB_ORDER.filter((p) => p !== 'custom')) {
    test(`${period}: GET /dashboard/all?range=${period}, nothing else`, async () => {
      const query = dashboardPeriodQuery(period, NO_CUSTOM_RANGE);
      assert.deepEqual(query, { range: period });
      await getDashboard({ ...query });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].method, 'get');
      assert.equal(sent[0].url, '/dashboard/all');
      assert.deepEqual(sentParams(), { range: period });
    });
  }

  test('a preset with a country: range and countryId only', async () => {
    await getDashboard({ ...dashboardPeriodQuery('week', NO_CUSTOM_RANGE), countryId: 'country-ke' });
    assert.deepEqual(sentParams(), { range: 'week', countryId: 'country-ke' });
  });

  test('custom: from and to as YYYY-MM-DD, no range (the server ignores range once from is sent, :244, :300)', async () => {
    const query = dashboardPeriodQuery('custom', { from: '2026-10-01', to: '2026-10-15' });
    assert.deepEqual(query, { from: '2026-10-01', to: '2026-10-15' });
    await getDashboard({ ...query, countryId: 'country-tz' });
    assert.deepEqual(sentParams(), { from: '2026-10-01', to: '2026-10-15', countryId: 'country-tz' });
  });

  test('custom with no valid range: nothing to send (the query waits, as the web\'s does, :106)', () => {
    for (const range of [NO_CUSTOM_RANGE, { from: '2026-10-01', to: null }, { from: null, to: '2026-10-01' }, { from: '2026-10-15', to: '2026-10-01' }]) {
      assert.equal(dashboardPeriodQuery('custom', range), null, JSON.stringify(range));
    }
  });

  test('a custom range never leaks into a preset, and a preset never sends from/to', async () => {
    const custom = { from: '2026-10-01', to: '2026-10-15' };
    assert.deepEqual(dashboardPeriodQuery('today', custom), { range: 'today' });
    await getDashboard({ ...dashboardPeriodQuery('today', custom) });
    assert.deepEqual(sentParams(), { range: 'today' });
  });

  test('getDashboard alone still defaults to range=month, and never sends to without from', async () => {
    await getDashboard();
    await getDashboard({ to: '2026-10-15' });
    assert.deepEqual(sentParams(0), { range: 'month' });
    assert.deepEqual(sentParams(1), { range: 'month' });
  });

  test('each period has its own query key, so changing the period fetches that period', () => {
    const keys = WEB_ORDER.filter((p) => p !== 'custom').map((p) => dashboardPeriodKey(dashboardPeriodQuery(p, NO_CUSTOM_RANGE)));
    keys.push(dashboardPeriodKey({ from: '2026-10-01', to: '2026-10-15' }));
    keys.push(dashboardPeriodKey({ from: '2026-10-01', to: '2026-10-16' }));
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(dashboardPeriodKey({ from: '2026-10-01', to: '2026-10-15' }), 'custom:2026-10-01:2026-10-15');
    assert.equal(dashboardPeriodKey({ range: 'month' }), 'month');
  });
});

// ── 2. Custom range validation ───────────────────────────────

describe('Custom range validation', () => {
  const cases = [
    [{ from: null, to: null }, 'from-missing'],
    [{ from: null, to: '2026-10-15' }, 'from-missing'],
    [{ from: '2026-10-01', to: null }, 'to-missing'],
    [{ from: '2026-10-15', to: '2026-10-01' }, 'from-after-to'],
    [{ from: '2026-10-01', to: '2026-10-15' }, null],
    [{ from: '2026-10-15', to: '2026-10-15' }, null], // one day: both days included
    [{ from: '2025-12-31', to: '2026-01-01' }, null], // across a year
    // Never a day the server can't parse (anything but a real YYYY-MM-DD could 500 the request)
    [{ from: '2026-02-30', to: '2026-03-01' }, 'from-missing'],
    [{ from: '2026/10/01', to: '2026-10-15' }, 'from-missing'],
    [{ from: '2026-10-01', to: '15-10-2026' }, 'to-missing'],
    [{ from: '', to: '' }, 'from-missing'],
    [{ from: '1999-12-31', to: '2026-10-15' }, 'from-missing'],
  ];
  for (const [range, problem] of cases) {
    test(`${JSON.stringify(range)} → ${problem ?? 'valid'}`, () => {
      assert.equal(customRangeProblem(range), problem);
      assert.equal(dashboardPeriodQuery('custom', range) === null, problem !== null);
    });
  }

  test('every problem has a message for the screen', () => {
    for (const problem of ['from-missing', 'to-missing', 'from-after-to']) assert.ok(CUSTOM_RANGE_MESSAGES[problem]);
  });

  test('the label of a complete range, as calendar days', () => {
    assert.equal(customRangeLabel({ from: '2026-10-01', to: '2026-10-15' }), '01 Oct 2026 – 15 Oct 2026');
    assert.equal(customRangeLabel({ from: '2026-10-15', to: '2026-10-01' }), null);
  });
});

// ── 3. What each tile and chip counts ────────────────────────

describe('tiles and chips count what the web counts', () => {
  // Every number different, so a tile reading the wrong field shows up.
  const KPIS = {
    total: 1, currentlyOpen: 2, inProgress: 3, resolved: 4, resolvedToday: 5, slaBreached: 6, closed: 7, unassigned: 8,
    onHold: 9, pendingMgmtReview: 10, pendingPartner: 11, pendingUserConfirm: 12, pendingUserInfo: 13,
    pendingMasterData: 14, totalOpen: 15,
  };

  test('tiles: Total, Open = currentlyOpen (any date, FE:DashboardPage.tsx:350), In progress, Resolved, SLA breached', () => {
    const values = Object.fromEntries(['total', 'open', 'inProgress', 'resolved', 'slaBreached'].map((t) => [t, homeTileValue(t, KPIS, 'month')]));
    assert.deepEqual(values, { total: 1, open: 2, inProgress: 3, resolved: 4, slaBreached: 6 });
  });

  test('Today: "Resolved today" from resolvedToday, as on the web (:363-364); every other period: "Resolved"', () => {
    assert.equal(homeTileValue('resolved', KPIS, 'today'), 5);
    assert.equal(homeTileLabel('resolved', 'today'), 'Resolved today');
    for (const period of ['yesterday', 'last7', 'month', 'all', 'custom']) {
      assert.equal(homeTileValue('resolved', KPIS, period), 4);
      assert.equal(homeTileLabel('resolved', period), 'Resolved');
    }
    assert.equal(homeTileLabel('total', 'month'), 'Total tickets');
  });

  test('chips: each reads its own count; Active is totalOpen', () => {
    const values = Object.fromEntries(Object.keys(HOME_CHIP_LIST_FILTER).map((c) => [c, homeChipValue(c, KPIS)]));
    assert.deepEqual(values, {
      closed: 7, unassigned: 8, pendingMgmtReview: 10, pendingPartner: 11, pendingUserConfirm: 12, pendingUserInfo: 13,
      pendingMasterData: 14, onHold: 9, active: 15,
    });
  });

  test('chips use the web\'s words (FE:DashboardPage.tsx:382-402)', () => {
    assert.deepEqual(HOME_CHIP_LABELS, {
      closed: 'Closed', unassigned: 'Unassigned', pendingMgmtReview: 'Mgmt review', pendingPartner: 'With partner',
      pendingUserConfirm: 'User confirm', pendingUserInfo: 'More info', pendingMasterData: 'Master data',
      onHold: 'On hold', active: 'Active now',
    });
  });

  test('Home never reads a KPI the server mis-scopes for AGENT/L2 (closedToday, closedYesterday; 05 B.20)', () => {
    for (const key of ['closedToday', 'closedYesterday', 'open', 'pending', 'slaBreachPercent']) {
      assert.ok(!HOME_KPI_KEYS.includes(key), key);
    }
  });

  const ADMIN_CHIPS = homeChips(PERSONAS.ADMIN);
  const ALWAYS = ['closed', 'unassigned', 'active'];

  test('the web hides a pending-reason or On hold chip at 0 (:404-405); Closed, Unassigned and Active always show', () => {
    const zeros = Object.fromEntries(Object.keys(KPIS).map((k) => [k, 0]));
    assert.deepEqual(visibleHomeChips(ADMIN_CHIPS, zeros, true), ALWAYS);
    assert.deepEqual(visibleHomeChips(ADMIN_CHIPS, { ...zeros, pendingPartner: 3, onHold: 1 }, true), ['closed', 'unassigned', 'pendingPartner', 'onHold', 'active']);
    assert.deepEqual(visibleHomeChips(ADMIN_CHIPS, KPIS, true), ADMIN_CHIPS);
  });

  test('while counts load, only the chips that always show (no zero chip flashes up)', () => {
    assert.deepEqual(visibleHomeChips(ADMIN_CHIPS, undefined, true), ALWAYS);
  });

  test('L2_MANAGER (no counts): every chip, as a shortcut', () => {
    const l2 = homeChips(PERSONAS.L2_MANAGER);
    assert.deepEqual(visibleHomeChips(l2, undefined, false), l2);
  });
});

// ── 4. Tiles and chips open the matching list ────────────────

describe('each tile and chip opens the list it counts', () => {
  const ACTIVE = 'OPEN,IN_PROGRESS,ON_HOLD,PENDING';
  // kpis.slaBreached: status notIn [CLOSED, RESOLVED] (BE:dashboard.controller.ts:338), every other 03 status.
  const NOT_RESOLVED_OR_CLOSED = TICKET_STATUSES.filter((s) => s !== 'RESOLVED' && s !== 'CLOSED').join(',');
  const me = PERSONAS.ADMIN;

  test('tiles: Total → all, Open → OPEN, In progress → IN_PROGRESS+PENDING, Resolved, SLA breached (active)', () => {
    const queries = Object.fromEntries(Object.entries(HOME_TILE_LIST_FILTER).map(([tile, f]) => [tile, ticketFilterQuery(f, me)]));
    assert.deepEqual(queries, {
      total: {},
      open: { status: 'OPEN' },
      inProgress: { status: 'IN_PROGRESS,PENDING' },
      resolved: { status: 'RESOLVED' },
      slaBreached: { sla: 'BREACHED', status: NOT_RESOLVED_OR_CLOSED },
    });
  });

  test('chips: the web\'s links (:386, :393, :407), Active → the active statuses', () => {
    const queries = Object.fromEntries(Object.entries(HOME_CHIP_LIST_FILTER).map(([chip, f]) => [chip, ticketFilterQuery(f, me)]));
    assert.deepEqual(queries, {
      closed: { status: 'CLOSED' },
      unassigned: { assignedToId: 'unassigned', status: ACTIVE },
      pendingMgmtReview: { status: 'PENDING_MGMT_REVIEW' },
      pendingPartner: { status: 'PENDING_PARTNER' },
      pendingUserConfirm: { status: 'PENDING_USER_CONFIRM' },
      pendingUserInfo: { status: 'PENDING_USER_INFO' },
      pendingMasterData: { status: 'PENDING_MASTER_DATA' },
      onHold: { status: 'ON_HOLD' },
      active: { status: ACTIVE },
    });
  });

  for (const name of NAMES) {
    test(`${name}: the list accepts the filter of every tile and chip they see`, () => {
      const p = PERSONAS[name];
      for (const tile of homeTiles(p)) assert.ok(isTicketFilterAllowed(p.role, HOME_TILE_LIST_FILTER[tile]), tile);
      for (const chip of homeChips(p)) assert.ok(isTicketFilterAllowed(p.role, HOME_CHIP_LIST_FILTER[chip]), chip);
    });
  }

  test('a chip opens the list with that filter alone, like a tile (the period never travels with it)', () => {
    const store = useUiStore.getState;
    store().reset();
    store().setTicketSearch('printer');
    store().setHomePeriod('today');
    store().openTicketList(HOME_CHIP_LIST_FILTER.pendingPartner);
    assert.equal(store().ticketFilter, 'PARTNER_KPI');
    assert.equal(store().ticketSearch, undefined);
    assert.deepEqual(store().ticketAdvanced.fromDate, null);
    assert.equal(store().homePeriod, 'today', 'opening a list leaves the Home period alone');
    store().reset();
  });
});

// ── 5. Lifetime, and the screen ──────────────────────────────

describe('the period lasts while the app is open, in memory only', () => {
  const store = useUiStore.getState;

  test('kept across the list\'s Clear and a tile tap; the custom days are kept when another period is picked', () => {
    store().reset();
    store().setHomePeriod('custom');
    store().setHomeCustomRange({ from: '2026-10-01' });
    store().setHomeCustomRange({ to: '2026-10-15' });
    store().setHomePeriod('year');
    store().clearTicketFilters();
    store().openTicketList('OPEN');
    assert.equal(store().homePeriod, 'year');
    assert.deepEqual(store().homeCustomRange, { from: '2026-10-01', to: '2026-10-15' });
    store().setHomePeriod('custom');
    assert.deepEqual(dashboardPeriodQuery(store().homePeriod, store().homeCustomRange), { from: '2026-10-01', to: '2026-10-15' });
  });

  test('signing out puts it back to the web\'s default and forgets the custom days', () => {
    store().setHomePeriod('quarter');
    store().reset();
    assert.equal(store().homePeriod, 'month');
    assert.deepEqual(store().homeCustomRange, NO_CUSTOM_RANGE);
  });

  test('nothing about the period is written to disk (the store has no persistence)', () => {
    const src = read('src/store/ui.store.ts');
    assert.doesNotMatch(src, /from ['"](zustand\/middleware|@react-native-async-storage[^'"]*|expo-secure-store|expo-file-system)['"]/);
    assert.doesNotMatch(src, /\bpersist\(|createJSONStorage/);
  });
});

describe('Home screen source', () => {
  const src = read('src/screens/dashboard/HomeScreen.tsx');

  test('the stale "last 30 days" captions are gone: the period is explicit now', () => {
    assert.doesNotMatch(src, /last 30 days/i);
    assert.doesNotMatch(src, /all dates/i);
  });

  test('the Custom period reuses the system date picker; tiles and chips open lists through the shared tables', () => {
    assert.match(src, /DateTimePickerAndroid\.open\(/);
    assert.match(src, /HOME_TILE_LIST_FILTER\[/);
    assert.match(src, /HOME_CHIP_LIST_FILTER\[/);
    assert.match(src, /<FilterChip/);
  });

  test('no polling or timers were added (UAT shares hardware with PROD)', () => {
    assert.doesNotMatch(src, /refetchInterval|setInterval|setTimeout/);
    assert.doesNotMatch(read('src/hooks/useHome.ts'), /refetchInterval|staleTime/);
  });
});
