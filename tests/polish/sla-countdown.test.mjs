// The SLA countdown on ticket detail (2026-11-03, src/utils/sla-countdown.ts): "6h left", "1h left", "Breached" with a
// bar, from the existing SLA fields only. The deadline is effectiveResolveDue() (05 §A.9, the "Resolve by" row) and the
// colour is the hold-adjusted SLA status (getDisplaySlaStatus); the app adds no threshold of its own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { colors } from '../../src/theme/colors.ts';
import { SLA_STATUSES } from '../../src/types/index.ts';
import { getDisplaySlaStatus } from '../../src/utils/format.ts';
import { formatTimeLeft, slaCountdown } from '../../src/utils/sla-countdown.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const NOW = Date.UTC(2026, 10, 3, 10, 0, 0);
const H = 3600000;
const iso = (ms) => new Date(ms).toISOString();
const base = (over = {}) => ({
  status: 'IN_PROGRESS',
  slaStatus: 'WITHIN_SLA',
  slaResponseDue: null,
  slaResolveDue: iso(NOW + 6 * H),
  firstResponseAt: null,
  resolvedAt: null,
  slaHoldMinutes: 0,
  slaHoldStartedAt: null,
  createdAt: iso(NOW - 2 * H),
  ...over,
});

describe('time left, in words', () => {
  test('whole units, rounded down: never more time than there is', () => {
    const cases = [
      [30 * 1000, 'under 1m'],
      [60 * 1000, '1m'],
      [25 * 60 * 1000, '25m'],
      [59 * 60 * 1000 + 59000, '59m'],
      [H, '1h'],
      [6 * H + 59 * 60 * 1000, '6h'],
      [47 * H, '47h'],
      [48 * H, '2d'],
      [52 * H, '2d 4h'],
    ];
    for (const [ms, text] of cases) assert.equal(formatTimeLeft(ms), text, String(ms));
  });
});

describe('the countdown', () => {
  test('within SLA: "6h left", green, the share of creation → deadline gone', () => {
    assert.deepEqual(slaCountdown(base(), NOW), { tone: 'WITHIN_SLA', label: '6h left', paused: false, elapsed: 0.25 });
  });

  test('the server says due soon (≤ 30 min): amber', () => {
    const c = slaCountdown(base({ slaStatus: 'DUE_SOON', slaResolveDue: iso(NOW + 25 * 60000) }), NOW);
    assert.equal(c.tone, 'DUE_SOON');
    assert.equal(c.label, '25m left');
  });

  test('"1h left" is still green unless the server says due soon: the app sets no threshold', () => {
    assert.equal(slaCountdown(base({ slaResolveDue: iso(NOW + H) }), NOW).tone, 'WITHIN_SLA');
  });

  test('past the deadline: "Breached", red, a full bar', () => {
    assert.deepEqual(slaCountdown(base({ slaResolveDue: iso(NOW - H) }), NOW), { tone: 'BREACHED', label: 'Breached', paused: false, elapsed: 1 });
  });

  test('on hold: the deadline moves with the hold (05 §A.9), so the time left stands still and says "paused"', () => {
    const t = base({ status: 'ON_HOLD', slaResolveDue: iso(NOW - 30 * 60000), slaHoldStartedAt: iso(NOW - H) });
    const c = slaCountdown(t, NOW);
    assert.equal(c.label, '30m left');
    assert.equal(c.paused, true);
    assert.equal(slaCountdown(t, NOW + 2 * H).label, '30m left', 'two hours later, still 30m');
  });

  test('a first-response breach alone leaves the resolution bar as it is (the SLA badge shows that breach)', () => {
    const t = base({ slaResponseDue: iso(NOW - H) });
    assert.equal(getDisplaySlaStatus(t, NOW).status, 'BREACHED');
    assert.equal(slaCountdown(t, NOW).tone, 'WITHIN_SLA');
  });

  test('nothing to count down: no SLA, or the clock has stopped (Resolved, Closed, Canceled)', () => {
    assert.equal(slaCountdown(base({ slaResolveDue: null }), NOW), null);
    for (const status of ['RESOLVED', 'CLOSED', 'CANCELED']) assert.equal(slaCountdown(base({ status }), NOW), null, status);
  });

  test('a deadline before the creation time (bad data) gives an empty bar, not a broken one', () => {
    const c = slaCountdown(base({ createdAt: iso(NOW + 10 * H) }), NOW);
    assert.equal(c.elapsed, 0);
  });
});

describe('colours and where it shows', () => {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lightness = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const y = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return y <= 216 / 24389 ? (y * 24389) / 27 : 116 * Math.cbrt(y) - 16;
  };

  test('green, amber and red differ in LIGHTNESS, not hue alone (≥ 15 L* apart)', () => {
    assert.deepEqual(Object.keys(colors.slaBar).sort(), [...SLA_STATUSES, 'track'].sort());
    const tones = SLA_STATUSES.map((s) => [s, lightness(colors.slaBar[s])]);
    for (let i = 0; i < tones.length; i++) {
      for (let j = i + 1; j < tones.length; j++) {
        const gap = Math.abs(tones[i][1] - tones[j][1]);
        assert.ok(gap >= 15, `${tones[i][0]} vs ${tones[j][0]}: ${gap.toFixed(1)}`);
      }
    }
  });

  test('ticket detail only: in the header card, never on a list card', () => {
    assert.match(read('src/screens/tickets/TicketDetailScreen.tsx'), /<SlaBadge ticket=\{ticket\} \/>\s*<\/View>\s*\{\/\*[^*]*\*\/\}\s*<SlaCountdown ticket=\{ticket\} \/>/);
    for (const rel of ['src/components/TicketCard.tsx', 'src/screens/tickets/TicketListScreen.tsx', 'src/components/RecentTicketRow.tsx']) {
      assert.doesNotMatch(read(rel), /SlaCountdown|slaCountdown/, rel);
    }
  });

  test('static and timer-free: the clock is read on render, focus and return to the app', () => {
    const src = read('src/components/SlaCountdown.tsx');
    assert.doesNotMatch(src, /Animated|setInterval|setTimeout|requestAnimationFrame/);
    assert.match(src, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*setNow\(Date\.now\(\)\);/);
    assert.match(src, /if \(next === 'active'\) setNow\(Date\.now\(\)\);/);
  });
});
