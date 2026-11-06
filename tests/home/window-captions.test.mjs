// Home's window captions (2026-11-03, docs/brand/UI-STANDARDS.md §14). Ronit's decision: keep the web's numbers and
// label the windows. On his phone Home showed Total 199 and Open 342: Total counts the period, Open counts what is open
// right now with no date filter (docs/G6-WEB-DASHBOARD.md §5.1). Each count now says which window it is.
// Which KPI is which is written out here from G6 §5 and §7 (BE:dashboard.controller.ts:331-442), not derived from the
// code under test. No count changes: the values are pinned too.
//
// iOS (iOS-5f): ported from Android dev d8626bc. One iOS difference in "Home draws them": at the accessibility text
// sizes a tile's caption wraps freely (the tile has the row to itself, UI-STANDARDS.md §iOS-A.3).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { DASHBOARD_PERIODS, NO_CUSTOM_RANGE, customRangeCaption, periodCaption } from '../../src/utils/dashboard-period.ts';
import {
  HOME_CHIP_CARRIES_PERIOD, HOME_CHIP_WINDOW, HOME_TILE_CARRIES_PERIOD, HOME_TILE_WINDOW, NOW_CAPTION, homeChipCaption,
  homeChipValue, homeTileCaption, homeTileValue,
} from '../../src/utils/home-kpis.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const TILES = ['total', 'open', 'inProgress', 'resolved', 'slaBreached'];
const CHIPS = ['closed', 'unassigned', 'pendingMgmtReview', 'pendingPartner', 'pendingUserConfirm', 'pendingUserInfo', 'pendingMasterData', 'onHold', 'active'];

/** G6 §5.1 / §5.2: created in the period, or a status count right now. */
const TILE_WINDOWS = { total: 'period', open: 'now', inProgress: 'period', resolved: 'period', slaBreached: 'period' };
const CHIP_WINDOWS = {
  closed: 'period', unassigned: 'period', pendingMgmtReview: 'period', pendingPartner: 'period', pendingUserConfirm: 'period',
  pendingUserInfo: 'period', pendingMasterData: 'period', onHold: 'period', active: 'now',
};

/** Each period's caption, written out. */
const CAPTIONS = {
  today: 'today',
  yesterday: 'yesterday',
  last7: 'last 7 days',
  last30: 'last 30 days',
  week: 'this week',
  month: 'this month',
  quarter: 'this quarter',
  year: 'this year',
  all: 'all time',
};

describe('which window each count covers (G6)', () => {
  test('tiles: Open counts right now; Total, In progress, Resolved and SLA breached the period', () => {
    assert.deepEqual(HOME_TILE_WINDOW, TILE_WINDOWS);
  });

  test('chips: Active counts right now; every other chip the period (the byStatus groupBy, BE:…:346)', () => {
    assert.deepEqual(HOME_CHIP_WINDOW, CHIP_WINDOWS);
  });

  test('the window agrees with what each tile and chip hands to the list (G7): period ⇔ carries the period', () => {
    for (const t of TILES) assert.equal(HOME_TILE_WINDOW[t] === 'period', HOME_TILE_CARRIES_PERIOD[t], t);
    for (const c of CHIPS) assert.equal(HOME_CHIP_WINDOW[c] === 'period', HOME_CHIP_CARRIES_PERIOD[c], c);
  });
});

describe('the caption under every tile', () => {
  test('every period, every tile: the period\'s words, or "right now" for Open', () => {
    for (const { value: period } of DASHBOARD_PERIODS) {
      if (period === 'custom') continue;
      for (const tile of TILES) {
        const expected = TILE_WINDOWS[tile] === 'now' ? 'right now' : CAPTIONS[period];
        assert.equal(homeTileCaption(tile, period, NO_CUSTOM_RANGE), expected, `${period} ${tile}`);
      }
    }
  });

  test('"right now", not "all time": Open is a count of what is open at this moment', () => {
    assert.equal(NOW_CAPTION, 'right now');
    assert.equal(homeTileCaption('open', 'all', NO_CUSTOM_RANGE), 'right now');
    assert.equal(homeTileCaption('total', 'all', NO_CUSTOM_RANGE), 'all time');
  });

  test('every preset has a caption, and "This month" reads "this month"', () => {
    for (const { value } of DASHBOARD_PERIODS) assert.ok(periodCaption(value, NO_CUSTOM_RANGE), value);
    assert.equal(periodCaption('month', NO_CUSTOM_RANGE), 'this month');
    assert.equal(periodCaption('last7', NO_CUSTOM_RANGE), 'last 7 days');
  });

  test('Custom: its two days, short in one year, full across two; "custom range" until both are valid', () => {
    const oct = { from: '2026-10-01', to: '2026-10-15' };
    const newYear = { from: '2025-12-28', to: '2026-01-02' };
    assert.equal(customRangeCaption(oct), '01 Oct – 15 Oct');
    assert.equal(homeTileCaption('total', 'custom', oct), '01 Oct – 15 Oct');
    assert.equal(customRangeCaption(newYear), '28 Dec 2025 – 02 Jan 2026');
    assert.equal(homeTileCaption('resolved', 'custom', { from: '2026-10-01', to: null }), 'custom range');
    assert.equal(homeTileCaption('total', 'custom', { from: '2026-10-15', to: '2026-10-01' }), 'custom range');
    assert.equal(homeTileCaption('open', 'custom', oct), 'right now');
  });
});

describe('the status chips', () => {
  test('only the chip counted differently from its neighbours gets a caption: Active, "right now"', () => {
    const captions = Object.fromEntries(CHIPS.map((c) => [c, homeChipCaption(c)]));
    assert.deepEqual(captions, {
      closed: null, unassigned: null, pendingMgmtReview: null, pendingPartner: null, pendingUserConfirm: null,
      pendingUserInfo: null, pendingMasterData: null, onHold: null, active: 'right now',
    });
  });
});

describe('no count changed', () => {
  test('Ronit\'s case: Total 199 for the period, Open 342 right now, each with its window', () => {
    const kpis = {
      total: 199, currentlyOpen: 342, inProgress: 1, resolved: 2, resolvedToday: 3, slaBreached: 4, closed: 5, unassigned: 6,
      onHold: 7, pendingMgmtReview: 8, pendingPartner: 9, pendingUserConfirm: 10, pendingUserInfo: 11, pendingMasterData: 12,
      totalOpen: 13,
    };
    assert.equal(homeTileValue('total', kpis, 'month'), 199);
    assert.equal(homeTileValue('open', kpis, 'month'), 342);
    assert.equal(homeTileCaption('total', 'month', NO_CUSTOM_RANGE), 'this month');
    assert.equal(homeTileCaption('open', 'month', NO_CUSTOM_RANGE), 'right now');
    // Every tile and chip still reads the field G6 pinned.
    assert.deepEqual(TILES.map((t) => homeTileValue(t, kpis, 'month')), [199, 342, 1, 2, 4]);
    assert.equal(homeTileValue('resolved', kpis, 'today'), 3);
    assert.deepEqual(CHIPS.map((c) => homeChipValue(c, kpis)), [5, 6, 8, 9, 10, 11, 12, 7, 13]);
  });

  test('the dashboard query is untouched: the captions read the period, never the request', () => {
    const src = read('src/utils/home-kpis.ts');
    assert.doesNotMatch(src, /dashboardPeriodQuery|@\/api|useDashboard/);
  });
});

describe('Home draws them', () => {
  const home = read('src/screens/dashboard/HomeScreen.tsx');

  test('each tile carries its caption; it shows under the count whenever counts do (loading too), small and muted', () => {
    assert.match(home, /caption: homeTileCaption\(key, period, customRange\),/);
    assert.match(home, /\{showCounts \? \(\s*<Text className="text-xs text-gray-500" numberOfLines=\{largeText \? undefined : 2\}>\s*\{t\.caption\}\s*<\/Text>\s*\) : null\}/);
    // Under the number: the caption comes after the count's branches in the tile's foot.
    const tile = home.slice(home.indexOf('function KpiTile('), home.indexOf('function StatusChip('));
    assert.ok(tile.indexOf('{t.caption}') > tile.indexOf('{t.value}'), 'caption after the count');
    // The old under-the-label hint is gone; the caption replaced it.
    assert.doesNotMatch(home, /hint: 'right now'|t\.hint/);
  });

  test('the Active chip shows its caption; screen readers hear it too', () => {
    assert.match(home, /caption=\{homeChipCaption\(chip\)\}/);
    assert.match(home, /\{caption \? <Text className="ml-1 text-xs text-gray-500">\{caption\}<\/Text> : null\}/);
    assert.match(home, /\$\{caption \? `, \$\{caption\}` : ''\}/);
  });
});
