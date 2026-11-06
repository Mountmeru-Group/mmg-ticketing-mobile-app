// iOS-5e: Home's period (G6) and the period a tile hands the ticket list (G7a), on iOS. Android's behaviour is pinned by
// tests/home/dashboard.test.mjs and tests/home/period-list.test.mjs (ported unchanged); these tests pin what iOS adds:
//   1. each of the ten periods and Custom sends exactly the DSH-1 request Android sends (written out in full);
//   2. Custom validation: Android's messages, and Android's picker limits (no future day, From ≤ To) on DatePickerSheet;
//   3. the period is in the React Query key, and a period change sends at most ONE DSH-1 request: run on the app's own
//      QueryClient (the hook's QueryObserver, with the key and `enabled` useDashboard builds, pinned below by source);
//   4. the iOS interface: the toolbar, the period sheet and the Custom calendars, every control labelled and 44 pt;
//   5. a tile tap opens Tickets with the matching period chip, for every persona and tile; ✕ clears exactly what
//      Android's clears, and the chip sits in the iOS-8a toolbar.
// What is real: dashboard-period.ts, the DSH-1 module, the axios client, queryKeys.ts, the app's QueryClient and
// TanStack's QueryObserver. Faked: the network. Read as text: the screen, which needs a phone to render.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { QueryObserver } from '@tanstack/react-query';
import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { getDashboard } from '../../src/api/dashboard.api.ts';
import { MIN_STALE_TIME_MS, queryClient } from '../../src/api/queryClient.ts';
import { queryKeys } from '../../src/hooks/queryKeys.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import {
  CUSTOM_RANGE_MESSAGES, DASHBOARD_PERIODS, NO_CUSTOM_RANGE, customRangeProblem, dashboardPeriodKey, dashboardPeriodLabel,
  dashboardPeriodQuery, periodListDates,
} from '../../src/utils/dashboard-period.ts';
import {
  HOME_CHIP_CARRIES_PERIOD, HOME_CHIP_LIST_FILTER, HOME_TILE_CARRIES_PERIOD, HOME_TILE_LIST_FILTER,
} from '../../src/utils/home-kpis.ts';
import { homeChips, homeTiles, showHomePeriod, ticketListFilters } from '../../src/utils/permissions.ts';
import { appliedTicketPeriod } from '../../src/utils/ticket-filters.ts';
import { NAMES, PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const HOME = 'src/screens/dashboard/HomeScreen.tsx';

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
const sentParams = (i) => Object.fromEntries(Object.entries(sent[i].params).filter(([, v]) => v !== undefined));

const CUSTOM = { from: '2026-10-01', to: '2026-10-15' };

// ── 1. The request for each period ───────────────────────────

describe('iOS: each period sends exactly the DSH-1 request Android sends', () => {
  beforeEach(() => {
    sent.length = 0;
  });

  // Android's request per period, written out in full (docs/G6-WEB-DASHBOARD.md §2; Android dashboard.test.mjs §1).
  const EXPECTED = {
    today: { range: 'today' },
    yesterday: { range: 'yesterday' },
    last7: { range: 'last7' },
    last30: { range: 'last30' },
    week: { range: 'week' },
    month: { range: 'month' },
    quarter: { range: 'quarter' },
    year: { range: 'year' },
    all: { range: 'all' },
    custom: { from: '2026-10-01', to: '2026-10-15' },
  };

  test('the ten periods and Custom, in the web\'s order: GET /dashboard/all with exactly these params', async () => {
    const got = {};
    for (const { value } of DASHBOARD_PERIODS) {
      sent.length = 0;
      await getDashboard({ ...dashboardPeriodQuery(value, CUSTOM) });
      assert.equal(sent.length, 1, value);
      assert.equal(`${sent[0].method} ${sent[0].url}`, 'get /dashboard/all', value);
      got[value] = sentParams(0);
    }
    assert.deepEqual(Object.keys(got), Object.keys(EXPECTED), 'the order');
    assert.deepEqual(got, EXPECTED);
  });

  test('with a country picked: the same params plus countryId, for every period', async () => {
    for (const { value } of DASHBOARD_PERIODS) {
      sent.length = 0;
      await getDashboard({ ...dashboardPeriodQuery(value, CUSTOM), countryId: 'country-tz' });
      assert.deepEqual(sentParams(0), { ...EXPECTED[value], countryId: 'country-tz' }, value);
    }
  });

  test('an incomplete or reversed Custom range sends nothing (no params to send)', () => {
    for (const range of [NO_CUSTOM_RANGE, { from: '2026-10-01', to: null }, { from: null, to: '2026-10-01' }, { from: '2026-10-15', to: '2026-10-01' }]) {
      assert.equal(dashboardPeriodQuery('custom', range), null, JSON.stringify(range));
    }
  });
});

// ── 2. Custom validation ─────────────────────────────────────

describe('iOS: Custom validation is Android\'s, messages and picker limits', () => {
  test('From after To is refused with Android\'s message, shown in red', () => {
    assert.equal(customRangeProblem({ from: '2026-10-20', to: '2026-10-10' }), 'from-after-to');
    assert.equal(CUSTOM_RANGE_MESSAGES['from-after-to'], 'The From day must be on or before the To day.');
    assert.match(read(HOME), /problem === 'from-after-to' \? 'text-red-700' : 'text-gray-500'/);
    assert.match(read(HOME), /\{CUSTOM_RANGE_MESSAGES\[problem\]\}/);
  });

  test('a missing day: Android\'s two prompts; the same day for From and To is a valid one-day range', () => {
    assert.equal(CUSTOM_RANGE_MESSAGES['from-missing'], 'Pick a From day to see the counts.');
    assert.equal(CUSTOM_RANGE_MESSAGES['to-missing'], 'Pick a To day to see the counts.');
    assert.equal(customRangeProblem({ from: '2026-10-10', to: '2026-10-10' }), null);
  });

  test('a future day cannot be picked: the calendars stop at today, as Android\'s dialog does; there is no extra message', () => {
    // Android has three messages and no "future" one (Q5: none is added on iOS).
    assert.deepEqual(Object.keys(CUSTOM_RANGE_MESSAGES).sort(), ['from-after-to', 'from-missing', 'to-missing']);
    const src = read(HOME);
    // Android's limits, line for line (8b522e3 HomeScreen.tsx pickDay).
    assert.match(src, /const minimumDate = which === 'to' && fromDate \? fromDate : DUE_DATE_MIN;/);
    assert.match(src, /const maximumDate = which === 'from' && toDate && toDate < today \? toDate : today;/);
    assert.match(src, /value: clampDate\(current \?\? \(which === 'to' \? fromDate : null\) \?\? today, minimumDate, maximumDate\)/);
    // …and both reach the iOS calendar.
    assert.match(src, /<DatePickerSheet[\s\S]{0,200}minimumDate=\{dayPicker\?\.minimumDate\}\s+maximumDate=\{dayPicker\?\.maximumDate\}/);
    // DatePickerSheet hands them to UIDatePicker.
    assert.match(read('src/components/DatePickerSheet.tsx'), /minimumDate=\{minimumDate\}\s+maximumDate=\{maximumDate\}/);
  });

  test('Done writes the device\'s calendar day (YYYY-MM-DD) into the store; Cancel or a swipe down writes nothing', () => {
    const src = read(HOME);
    // iOS-5f: a picked day also counts as changing the period, for the count fade (Android: its date dialog's handler).
    assert.match(src, /onDone=\{\(date\) => \{\s*if \(dayPicker\) \{\s*setPeriodTouched\(true\);\s*setCustomRange\(\{ \[dayPicker\.which\]: dayFromDate\(date\) \}\);\s*\}\s*\}\}/);
    assert.match(src, /onClose=\{\(\) => setDayPicker\(null\)\}/);
  });
});

// ── 3. The query key, and one request per period change ──────

describe('iOS: the period is in the query key, and a change sends at most one DSH-1 request', () => {
  /** useDashboard's options for a period, as hooks/useHome.ts builds them (pinned by the source test below). */
  function dashboardOptions(period, custom, countryId) {
    const periodQuery = dashboardPeriodQuery(period, custom);
    const queryKey = queryKeys.dashboard.summary(periodQuery ? dashboardPeriodKey(periodQuery) : 'custom:incomplete', countryId);
    return {
      queryKey,
      placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === queryKey[2] ? previous : undefined),
      queryFn: () => getDashboard({ ...periodQuery, countryId }),
      enabled: periodQuery !== null,
    };
  }
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };

  beforeEach(() => {
    queryClient.clear();
    sent.length = 0;
  });
  after(() => queryClient.clear());

  test('useHome builds exactly that key and that `enabled`, sets no staleTime or interval of its own', () => {
    const src = read('src/hooks/useHome.ts');
    assert.match(src, /const queryKey = queryKeys\.dashboard\.summary\(periodQuery \? dashboardPeriodKey\(periodQuery\) : 'custom:incomplete', countryId\);/);
    assert.match(src, /enabled: !!user && user\.role !== 'L2_MANAGER' && periodQuery !== null,/);
    assert.doesNotMatch(src, /refetchInterval|staleTime|refetchOnWindowFocus/);
    assert.equal(MIN_STALE_TIME_MS >= 60_000, true);
  });

  test('every period has its own key, and the key names the period (the range, or custom:<from>:<to>)', () => {
    const keys = DASHBOARD_PERIODS.map(({ value }) => dashboardOptions(value, CUSTOM, undefined).queryKey);
    assert.deepEqual(keys.map((k) => k[1]), [
      'today', 'yesterday', 'last7', 'last30', 'week', 'month', 'quarter', 'year', 'all', 'custom:2026-10-01:2026-10-15',
    ]);
    assert.deepEqual(keys[5], ['dashboard', 'month', null]);
    assert.deepEqual(dashboardOptions('month', CUSTOM, 'country-tz').queryKey, ['dashboard', 'month', 'country-tz']);
  });

  test('on the app\'s QueryClient: one request per new period, none for a period fetched under 60 s ago, none while Custom is incomplete', async () => {
    const observer = new QueryObserver(queryClient, dashboardOptions('month', NO_CUSTOM_RANGE, undefined));
    const unsubscribe = observer.subscribe(() => {});
    try {
      await settle();
      assert.deepEqual(sent.map((_, i) => sentParams(i)), [{ range: 'month' }], 'Home opens: one request');

      observer.setOptions(dashboardOptions('today', NO_CUSTOM_RANGE, undefined));
      await settle();
      assert.deepEqual(sent.map((_, i) => sentParams(i)), [{ range: 'month' }, { range: 'today' }], 'Today: one more');

      observer.setOptions(dashboardOptions('month', NO_CUSTOM_RANGE, undefined));
      await settle();
      assert.equal(sent.length, 2, 'back to This month within 60 s: from the cache, no request');

      observer.setOptions(dashboardOptions('custom', NO_CUSTOM_RANGE, undefined));
      await settle();
      observer.setOptions(dashboardOptions('custom', { from: '2026-10-01', to: null }, undefined));
      await settle();
      assert.equal(sent.length, 2, 'Custom with no days, then From only: nothing sent');

      observer.setOptions(dashboardOptions('custom', CUSTOM, undefined));
      await settle();
      assert.equal(sent.length, 3, 'both days: one request');
      assert.deepEqual(sentParams(2), { from: '2026-10-01', to: '2026-10-15' });

      observer.setOptions(dashboardOptions('custom', { from: '2026-10-20', to: '2026-10-15' }, undefined));
      await settle();
      assert.equal(sent.length, 3, 'From after To: nothing sent');
      assert.ok(sent.every((r) => r.url === '/dashboard/all'), 'no other endpoint is touched by a period change');
    } finally {
      unsubscribe();
    }
  });
});

// ── 4. The iOS interface ─────────────────────────────────────

describe('iOS: the period toolbar, the period sheet and the Custom calendars', () => {
  const src = read(HOME);

  test('the toolbar sits under the navigation bar, outside the scroll view, for every role but L2_MANAGER', () => {
    const toolbar = src.indexOf('<PeriodBar');
    assert.ok(toolbar > src.indexOf('<OfflineBanner />') && toolbar < src.indexOf('<QueryBanner'), 'between the banners');
    assert.ok(toolbar < src.indexOf('<ScrollView'), 'not in the scroll view');
    assert.match(src, /\{showPeriod \? \(\s*<PeriodBar/);
    assert.match(src, /const showPeriod = showHomePeriod\(role\);/);
  });

  test('the period sheet lists the web\'s ten periods in order, ticks the current one, and stores the pick', () => {
    assert.match(src, /const PERIOD_OPTIONS: readonly SheetOption<DashboardPeriod>\[\] = DASHBOARD_PERIODS\.map\(\(p\) => \(\{ value: p\.value, label: p\.label \}\)\);/);
    assert.match(src, /<OptionSheet\s+visible=\{periodSheet\}\s+title="Period"\s+options=\{PERIOD_OPTIONS\}\s+selected=\{period\}\s+onSelect=\{pickPeriod\}/);
    assert.match(src, /setPeriod\(next\);/);
  });

  test('Custom with no From day opens its calendar once the period sheet has gone (no timer), as Android opens it at once', () => {
    assert.match(src, /if \(next === 'custom' && customRangeProblem\(customRange\) === 'from-missing'\) openFromNext\.current = true;/);
    assert.match(src, /onDismiss=\{onPeriodSheetGone\}/);
    assert.match(src, /const onPeriodSheetGone = \(\) => \{\s*if \(!openFromNext\.current\) return;\s*openFromNext\.current = false;\s*pickDay\('from'\);\s*\};/);
    assert.match(read('src/components/PageSheet.tsx'), /onDismiss=\{onDismiss\}/);
    assert.match(read('src/components/OptionSheet.tsx'), /onDismiss=\{onDismiss\}/);
    assert.doesNotMatch(src, /setTimeout|setInterval|requestAnimationFrame/);
  });

  test('every new control is labelled for VoiceOver and at least 44 pt (the chips: 36 pt + a 4 pt hit slop)', () => {
    assert.match(src, /accessibilityLabel=\{`Period: \$\{label\}\. Changes the period`\}[\s\S]{0,80}className="min-h-11 /);
    assert.match(src, /accessibilityLabel=\{`\$\{label\}: \$\{value \?\? 'not picked'\}\. Opens the date picker`\}[\s\S]{0,80}className=\{`min-h-11 /);
    // iOS-5f: + the chip's window caption (Active's "right now", homeChipCaption), as on Android.
    assert.match(src, /accessibilityLabel=\{`\$\{label\}\$\{value !== undefined \? `: \$\{value\}` : ''\}\$\{caption \? `, \$\{caption\}` : ''\}\. Opens the list`\}\s+onPress=\{onPress\}\s+hitSlop=\{4\}\s+className="min-h-9 /);
  });

  test('VoiceOver hears the Custom message change (Android\'s live region is TalkBack\'s only)', () => {
    assert.doesNotMatch(src, /accessibilityLiveRegion=/);
    assert.match(src, /if \(spoken\) AccessibilityInfo\.announceForAccessibility\(spoken\);/);
  });

  test('nothing truncates at the large text sizes: From and To stack, the chips grow (no fixed h-9)', () => {
    assert.match(src, /className=\{largeText \? 'flex-col' : 'flex-row'\}/);
    assert.match(src, /numberOfLines=\{wrap \? undefined : 1\}/);
    assert.doesNotMatch(src, /className="h-9 /);
  });

  test('no colour literal in the screen: every colour is a theme token (no hex outside src/theme)', () => {
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(read('src/components/PageSheet.tsx'), /#[0-9a-fA-F]{3,8}\b/);
  });
});

// ── 5. Tile → Tickets with the period chip, and its ✕ ────────

describe('iOS: a tile opens Tickets with the matching period chip, and ✕ clears exactly what Android clears', () => {
  const NOW = new Date('2026-11-02T12:00:00Z');
  const LIST = 'src/screens/tickets/TicketListScreen.tsx';

  /** What HomeScreen's openList() does for a tile or chip (pinned by source in tests/home/period-list.test.mjs). */
  function tapTile(persona, filter, carriesPeriod, period = 'month', custom = NO_CUSTOM_RANGE) {
    const dates = carriesPeriod && showHomePeriod(persona.role) ? periodListDates(period, custom, NOW) : null;
    useUiStore.getState().openTicketList(filter, dates ? { label: dashboardPeriodLabel(period), ...dates } : null);
    const s = useUiStore.getState();
    return appliedTicketPeriod(s.ticketPeriod, s.ticketAdvanced, ticketListFilters(persona));
  }

  beforeEach(() => useUiStore.getState().reset());
  after(() => useUiStore.getState().reset());

  for (const name of NAMES) {
    test(`${name}: every tile and chip they see opens the list with the chip it should have`, () => {
      const persona = PERSONAS[name];
      const taps = [
        ...homeTiles(persona).map((t) => [t, HOME_TILE_LIST_FILTER[t], HOME_TILE_CARRIES_PERIOD[t]]),
        ...homeChips(persona).map((c) => [c, HOME_CHIP_LIST_FILTER[c], HOME_CHIP_CARRIES_PERIOD[c]]),
      ];
      assert.ok(taps.length >= 2);
      for (const [what, filter, carries] of taps) {
        const chip = tapTile(persona, filter, carries);
        // L2_MANAGER has no period row, so no tile of theirs carries one; Open and Active never do.
        const expected = carries && showHomePeriod(persona.role)
          ? { label: 'This month', fromDate: '2026-10-03', toDate: '2026-11-02' }
          : null;
        assert.deepEqual(chip, expected, `${name} ${what}`);
        assert.equal(useUiStore.getState().ticketFilter, filter, `${name} ${what}: the tile's own filter`);
      }
    });
  }

  test('the chip shows only while the person may use the Created filter, and only while the days are still the tile\'s', () => {
    // Every role has the date filter today (ticketListFilters), so this pins Android's rule itself (mutation check,
    // iOS-5e: dropping the `allowed` test survived until this case was added).
    const period = { label: 'This month', fromDate: '2026-10-03', toDate: '2026-11-02' };
    const advanced = { ...useUiStore.getState().ticketAdvanced, fromDate: '2026-10-03', toDate: '2026-11-02' };
    assert.deepEqual(appliedTicketPeriod(period, advanced, ['priority', 'category', 'date']), period);
    assert.equal(appliedTicketPeriod(period, advanced, ['priority', 'category']), null, 'no date filter: no chip');
    assert.equal(appliedTicketPeriod(period, { ...advanced, toDate: '2026-11-01' }, ['date']), null, 'a day changed: no chip');
    assert.equal(appliedTicketPeriod(null, advanced, ['date']), null);
    for (const name of NAMES) assert.ok(ticketListFilters(PERSONAS[name]).includes('date'), `${name} has the date filter`);
  });

  test('each period names its chip, as Android: "Today", "Last 7 days" … "Custom"; All time puts no chip', () => {
    const persona = PERSONAS.ADMIN;
    const labels = DASHBOARD_PERIODS.map(({ value }) => tapTile(persona, 'ALL', true, value, CUSTOM)?.label ?? null);
    assert.deepEqual(labels, [
      'Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'This week', 'This month', 'Quarterly', 'This year', null, 'Custom',
    ]);
  });

  test('✕ (clearTicketPeriod) clears the two days and the chip, and nothing else', () => {
    const store = useUiStore.getState();
    store.setTicketCountryId('country-tz');
    store.setHomePeriod('quarter');
    store.setHomeCustomRange({ from: '2026-09-01' });
    tapTile(PERSONAS.ADMIN, 'BREACHED_KPI', true, 'quarter');
    const s = useUiStore.getState();
    s.setTicketSort('PRIORITY');
    s.setTicketAdvanced({ ...s.ticketAdvanced, priority: 'HIGH' });
    s.setTicketSearchText('vpn');
    s.setTicketSearch('vpn');
    const before = useUiStore.getState();
    before.clearTicketPeriod();
    const after = useUiStore.getState();
    const pick = (x) => Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v !== 'function'));
    assert.deepEqual(pick(after), {
      ...pick(before),
      ticketAdvanced: { ...before.ticketAdvanced, fromDate: null, toDate: null },
      ticketPeriod: null,
    });
    assert.equal(after.ticketFilter, 'BREACHED_KPI', 'the tile\'s filter stays');
    assert.equal(after.ticketAdvanced.priority, 'HIGH', 'the other Filters-sheet choices stay');
    assert.equal(after.ticketCountryId, 'country-tz', 'the country stays');
    assert.equal(after.homePeriod, 'quarter', 'Home\'s own period is not touched');
  });

  test('the chip is the first of the toolbar\'s filter chips (iOS-8a), labelled, 44 pt to touch, and grows with the text', () => {
    const src = read(LIST);
    const rows = src.slice(src.indexOf('const filterRows = ('), src.indexOf('{isHomeTileFilter(activeFilter) ? ('));
    assert.match(rows, /\{period \? \(/, 'before the Home-tile chip, inside the filter rows');
    assert.match(src, /accessibilityLabel=\{`Period from Home: \$\{period\.label\}, \$\{dateRangeLabel\(period\.fromDate, period\.toDate\) \?\? ''\}\. Clear the period`\}\s+onPress=\{clearTicketPeriod\}\s+hitSlop=\{4\}\s+className="min-h-9 /);
    // The filter rows are in the fixed toolbar, and at the large text sizes at the top of the list (iOS-8a).
    assert.match(src, /\{largeText \? null : filterRows\}/, 'the fixed toolbar');
    assert.match(src, /bg-white px-4 pb-1">\{filterRows\}<\/View>/, 'the list header at the large text sizes');
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
  });
});
