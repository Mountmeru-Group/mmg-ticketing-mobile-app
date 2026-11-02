// G7: a Home tile hands the selected period to the ticket list as its created-date filter, as the web's dashboard
// links do (FE:pages/dashboard/DashboardPage.tsx:72-86). The web's behaviour and the agreement analysis, with sources:
// docs/G7-PERIOD-APPROVALS-PUSH.md §1. These tests pin:
//   1. the days each period puts on the list (the web's own computation, UTC days of the device clock);
//   2. which tiles and chips carry the period (all but Open and Active);
//   3. the TKT-1 request the list then sends: the tile's status set AND the period, through the real axios client;
//   4. the list's period chip: shown while the days are the tile's, cleared by its ✕ or Clear all, combined with the
//      other filters without breaking them.
// What is real: dashboard-period.ts, home-kpis.ts, ticket-filters.ts, permissions.ts, ui.store.ts, the TKT-1 module and
// the axios client. What is faked: the network (axios's transport adapter). Nothing calls UAT.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { listTickets } from '../../src/api/tickets.api.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import { DASHBOARD_PERIODS, NO_CUSTOM_RANGE, dashboardPeriodLabel, periodListDates } from '../../src/utils/dashboard-period.ts';
import {
  HOME_CHIP_CARRIES_PERIOD, HOME_CHIP_LIST_FILTER, HOME_TILE_CARRIES_PERIOD, HOME_TILE_LIST_FILTER,
} from '../../src/utils/home-kpis.ts';
import { ticketListFilters } from '../../src/utils/permissions.ts';
import { appliedTicketPeriod, ticketListQuery } from '../../src/utils/ticket-filters.ts';
import { NAMES, PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

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
const sentParams = (i = 0) => Object.fromEntries(Object.entries(sent[i].params).filter(([, v]) => v !== undefined));

/** The web's getRangeDateParams, transcribed (DashboardPage.tsx:72-86), as an independent reference. */
function webDates(range, now) {
  const fmt = (d) => d.toISOString().split('T')[0];
  const todayStr = fmt(now);
  const sub = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return fmt(d);
  };
  if (range === 'today') return { fromDate: todayStr, toDate: todayStr };
  if (range === 'yesterday') return { fromDate: sub(1), toDate: sub(1) };
  if (range === 'last7' || range === 'week') return { fromDate: sub(7), toDate: todayStr };
  if (range === 'last30' || range === 'month') return { fromDate: sub(30), toDate: todayStr };
  if (range === 'quarter') return { fromDate: sub(90), toDate: todayStr };
  if (range === 'year') return { fromDate: sub(365), toDate: todayStr };
  return null; // all
}

// ── 1. The days ──────────────────────────────────────────────

describe('the days a tile puts on the list, per period', () => {
  const NOON = new Date('2026-11-02T12:00:00Z');

  test('the concrete days on 2 November 2026 (noon UTC)', () => {
    const days = Object.fromEntries(DASHBOARD_PERIODS.map((p) => [p.value, periodListDates(p.value, NO_CUSTOM_RANGE, NOON)]));
    assert.deepEqual(days, {
      today: { fromDate: '2026-11-02', toDate: '2026-11-02' },
      yesterday: { fromDate: '2026-11-01', toDate: '2026-11-01' },
      last7: { fromDate: '2026-10-26', toDate: '2026-11-02' },
      last30: { fromDate: '2026-10-03', toDate: '2026-11-02' },
      week: { fromDate: '2026-10-26', toDate: '2026-11-02' },
      month: { fromDate: '2026-10-03', toDate: '2026-11-02' },
      quarter: { fromDate: '2026-08-04', toDate: '2026-11-02' },
      year: { fromDate: '2025-11-02', toDate: '2026-11-02' },
      all: null, // "All time" passes no date filter (:84)
      custom: null, // no custom range picked
    });
  });

  test('identical to the web\'s computation at any time of day, in this machine\'s timezone', () => {
    for (const iso of ['2026-11-02T00:30:00Z', '2026-11-02T12:00:00Z', '2026-11-02T21:30:00Z', '2026-03-31T23:59:00Z', '2026-01-01T00:00:00Z']) {
      const now = new Date(iso);
      for (const { value } of DASHBOARD_PERIODS.filter((p) => p.value !== 'custom')) {
        assert.deepEqual(periodListDates(value, NO_CUSTOM_RANGE, now), webDates(value, now), `${value} at ${iso}`);
      }
    }
  });

  test('"today" is the UTC day, as on the web: 01:30 in Dar es Salaam on 3 Nov is still 2 Nov in UTC', () => {
    const now = new Date('2026-11-02T22:30:00Z'); // 01:30 EAT, 3 November
    assert.deepEqual(periodListDates('today', NO_CUSTOM_RANGE, now), { fromDate: '2026-11-02', toDate: '2026-11-02' });
  });

  test('custom: its From and To, only once the range is valid', () => {
    assert.deepEqual(periodListDates('custom', { from: '2026-10-01', to: '2026-10-15' }), { fromDate: '2026-10-01', toDate: '2026-10-15' });
    assert.equal(periodListDates('custom', { from: '2026-10-01', to: null }), null);
    assert.equal(periodListDates('custom', { from: '2026-10-15', to: '2026-10-01' }), null);
  });
});

// ── 2. Which tiles carry it ──────────────────────────────────

describe('which tiles and chips carry the period', () => {
  test('tiles: every one but Open, which counts open tickets of any date (as the web\'s Open link, :353)', () => {
    assert.deepEqual(HOME_TILE_CARRIES_PERIOD, { total: true, open: false, inProgress: true, resolved: true, slaBreached: true });
  });

  test('chips: every one but Active (right now, any date); the pending reasons and On hold too, so chip and list agree', () => {
    assert.deepEqual(HOME_CHIP_CARRIES_PERIOD, {
      closed: true, unassigned: true, pendingMgmtReview: true, pendingPartner: true, pendingUserConfirm: true,
      pendingUserInfo: true, pendingMasterData: true, onHold: true, active: false,
    });
  });

  test('Home wires it: only through the tables, and never for L2_MANAGER (no period row)', () => {
    const src = read('src/screens/dashboard/HomeScreen.tsx');
    assert.match(src, /HOME_TILE_CARRIES_PERIOD\[key\]/);
    assert.match(src, /HOME_CHIP_CARRIES_PERIOD\[chip\]/);
    assert.match(src, /carriesPeriod && showPeriod \? periodListDates\(period, customRange\) : null/);
    // Shortcuts and "See all" carry no period.
    assert.match(src, /openList\('MY_OPEN'\)/);
    assert.match(src, /openList\('DUE_SOON'\)/);
    assert.match(src, /openList\('ALL'\)/);
  });
});

// ── 3. The request the list sends ────────────────────────────

const store = useUiStore.getState;
const NOON = new Date('2026-11-02T12:00:00Z');

/** What HomeScreen.openList does for a tile: the store write, with the period when it carries one. */
function tapTile(filter, carries, period = 'month', custom = NO_CUSTOM_RANGE) {
  const dates = carries ? periodListDates(period, custom, NOON) : null;
  store().openTicketList(filter, dates ? { label: dashboardPeriodLabel(period), ...dates } : null);
}

/** The TKT-1 request M3 then sends (TicketListScreen → useTickets → ticketListQuery → listTickets). */
async function listRequest(persona, countryId) {
  const s = store();
  const query = ticketListQuery({
    me: persona, filter: s.ticketFilter, sort: s.ticketSort, search: s.ticketSearch, countryId, advanced: s.ticketAdvanced,
    allowed: ticketListFilters(persona),
  });
  sent.length = 0;
  await listTickets({ ...query, page: 1, limit: 20 });
  return sentParams();
}

describe('the TKT-1 request after a tile tap (ADMIN, This month)', () => {
  beforeEach(() => store().reset());
  const ACTIVE = 'OPEN,IN_PROGRESS,ON_HOLD,PENDING';
  const MONTH = { fromDate: '2026-10-03', toDate: '2026-11-02' };
  const base = { page: 1, limit: 20 };

  const expected = {
    total: { ...MONTH },
    open: { status: 'OPEN' },
    inProgress: { status: 'IN_PROGRESS,PENDING', ...MONTH },
    resolved: { status: 'RESOLVED', ...MONTH },
  };
  for (const [tile, params] of Object.entries(expected)) {
    test(`${tile}`, async () => {
      tapTile(HOME_TILE_LIST_FILTER[tile], HOME_TILE_CARRIES_PERIOD[tile]);
      assert.deepEqual(await listRequest(PERSONAS.ADMIN), { ...base, ...params });
    });
  }

  test('slaBreached: sla=BREACHED, every status but RESOLVED and CLOSED, and the period', async () => {
    tapTile(HOME_TILE_LIST_FILTER.slaBreached, true);
    const params = await listRequest(PERSONAS.ADMIN);
    assert.equal(params.sla, 'BREACHED');
    assert.ok(!params.status.split(',').includes('RESOLVED') && !params.status.split(',').includes('CLOSED'));
    assert.equal(params.fromDate, MONTH.fromDate);
    assert.equal(params.toDate, MONTH.toDate);
  });

  test('chips: Closed, Unassigned, a pending reason and On hold carry it; Active does not', async () => {
    const cases = {
      closed: { status: 'CLOSED', ...MONTH },
      unassigned: { assignedToId: 'unassigned', status: ACTIVE, ...MONTH },
      pendingPartner: { status: 'PENDING_PARTNER', ...MONTH },
      onHold: { status: 'ON_HOLD', ...MONTH },
      active: { status: ACTIVE },
    };
    for (const [chip, params] of Object.entries(cases)) {
      store().reset();
      tapTile(HOME_CHIP_LIST_FILTER[chip], HOME_CHIP_CARRIES_PERIOD[chip]);
      assert.deepEqual(await listRequest(PERSONAS.ADMIN), { ...base, ...params }, chip);
    }
  });

  test('"All time": no date filter at all', async () => {
    tapTile('RESOLVED', true, 'all');
    assert.deepEqual(await listRequest(PERSONAS.ADMIN), { ...base, status: 'RESOLVED' });
    assert.equal(store().ticketPeriod, null);
  });

  test('Custom: its From and To', async () => {
    tapTile('CLOSED', true, 'custom', { from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual(await listRequest(PERSONAS.ADMIN), { ...base, status: 'CLOSED', fromDate: '2026-09-01', toDate: '2026-09-30' });
    assert.equal(store().ticketPeriod.label, 'Custom');
  });

  test('Today and Yesterday: one day each', async () => {
    tapTile('ALL', true, 'today');
    assert.deepEqual(await listRequest(PERSONAS.ADMIN), { ...base, fromDate: '2026-11-02', toDate: '2026-11-02' });
    tapTile('ALL', true, 'yesterday');
    assert.deepEqual(await listRequest(PERSONAS.ADMIN), { ...base, fromDate: '2026-11-01', toDate: '2026-11-01' });
  });

  test('with the country selector: the same country as the tile\'s count, and the period', async () => {
    tapTile('IN_PROGRESS_KPI', true);
    assert.deepEqual(await listRequest(PERSONAS.ADMIN, 'country-ke'), { ...base, status: 'IN_PROGRESS,PENDING', countryId: 'country-ke', ...MONTH });
  });

  for (const name of NAMES) {
    test(`${name}: the date filter is allowed, so the period reaches the request`, async () => {
      store().reset();
      tapTile('RESOLVED', true);
      const params = await listRequest(PERSONAS[name], PERSONAS[name].role === 'END_USER' ? '' : undefined);
      assert.equal(params.fromDate, MONTH.fromDate, name);
      assert.equal(params.toDate, MONTH.toDate, name);
    });
  }
});

// ── 4. The list's period chip ────────────────────────────────

describe('the list shows the period and lets you clear it', () => {
  beforeEach(() => store().reset());
  const allowed = ticketListFilters(PERSONAS.ADMIN);
  const chip = () => appliedTicketPeriod(store().ticketPeriod, store().ticketAdvanced, allowed);

  test('after a tile: the chip names the period', () => {
    tapTile('RESOLVED', true, 'month');
    assert.deepEqual(chip(), { label: 'This month', fromDate: '2026-10-03', toDate: '2026-11-02' });
  });

  test('its ✕ clears the period only: the tile\'s filter, the country and the rest stay', async () => {
    store().setTicketCountryId('country-ke');
    tapTile('RESOLVED', true);
    store().clearTicketPeriod();
    assert.equal(chip(), null);
    assert.equal(store().ticketFilter, 'RESOLVED');
    assert.equal(store().ticketCountryId, 'country-ke');
    assert.deepEqual(await listRequest(PERSONAS.ADMIN, 'country-ke'), { page: 1, limit: 20, status: 'RESOLVED', countryId: 'country-ke' });
  });

  test('Clear all clears it too (the web\'s Clear)', () => {
    tapTile('RESOLVED', true);
    store().clearTicketFilters();
    assert.equal(chip(), null);
    assert.equal(store().ticketAdvanced.fromDate, null);
  });

  test('other filters combine with it: a priority, a quick filter, a search — the period stays', async () => {
    tapTile('RESOLVED', true);
    store().setTicketAdvanced({ priority: 'HIGH' });
    store().setTicketFilter('CLOSED');
    store().setTicketSearch('printer');
    assert.notEqual(chip(), null);
    assert.deepEqual(await listRequest(PERSONAS.ADMIN), {
      page: 1, limit: 20, status: 'CLOSED', priority: 'HIGH', search: 'printer', fromDate: '2026-10-03', toDate: '2026-11-02',
    });
  });

  test('changing a day in the Filters sheet makes it the person\'s own dates: the chip goes, their dates stay', async () => {
    tapTile('RESOLVED', true);
    store().setTicketAdvanced({ fromDate: '2026-10-20' });
    assert.equal(chip(), null);
    const params = await listRequest(PERSONAS.ADMIN);
    assert.equal(params.fromDate, '2026-10-20');
    assert.equal(params.toDate, '2026-11-02');
  });

  test('a tile that carries no period clears a previous one (the tile\'s filter applies alone)', () => {
    tapTile('RESOLVED', true);
    tapTile('OPEN', false);
    assert.equal(chip(), null);
    assert.equal(store().ticketAdvanced.fromDate, null);
  });

  test('sign-out wipes it', () => {
    tapTile('RESOLVED', true);
    store().reset();
    assert.equal(store().ticketPeriod, null);
  });

  test('the list screen renders the chip from appliedTicketPeriod and clears with clearTicketPeriod', () => {
    const src = read('src/screens/tickets/TicketListScreen.tsx');
    assert.match(src, /appliedTicketPeriod\(ticketPeriod, ticketAdvanced, allowedMore\)/);
    assert.match(src, /onPress=\{clearTicketPeriod\}/);
    assert.match(src, /Period from Home: \$\{period\.label\}/);
  });
});
