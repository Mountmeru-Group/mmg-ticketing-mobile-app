// The SLA deadline on ticket detail (2026-11-03, Ronit's option C; src/utils/sla-deadline.ts): "Due Mon 11:00" or
// "Breached", coloured, no bar and no countdown. The deadline is effectiveResolveDue() (05 §A.9, the "Resolve by" row)
// and the colour is the hold-adjusted SLA status (getDisplaySlaStatus); the app adds no threshold of its own.
// Dates are built in local time (the Date constructor with parts), as the phone shows them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { colors } from '../../src/theme/colors.ts';
import { SLA_STATUSES } from '../../src/types/index.ts';
import { getDisplaySlaStatus } from '../../src/utils/format.ts';
import { formatDueTime, slaDeadline } from '../../src/utils/sla-deadline.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

/** Friday 6 Nov 2026, 17:00 local: the Friday-evening example (A31). */
const FRI_17 = new Date(2026, 10, 6, 17, 0).getTime();
const at = (day, h, m = 0) => new Date(2026, 10, day, h, m);
const iso = (d) => d.toISOString();
const base = (over = {}) => ({
  status: 'IN_PROGRESS',
  slaStatus: 'WITHIN_SLA',
  slaResponseDue: null,
  slaResolveDue: iso(at(9, 11)), // Monday 11:00
  firstResponseAt: null,
  resolvedAt: null,
  slaHoldMinutes: 0,
  slaHoldStartedAt: null,
  ...over,
});

describe('when it is due, in words', () => {
  test('today, tomorrow, a weekday for the rest of the week, then a date', () => {
    assert.equal(new Date(FRI_17).getDay(), 5, 'the 6th is a Friday');
    assert.equal(formatDueTime(at(6, 17, 45), FRI_17), 'today 17:45');
    assert.equal(formatDueTime(at(7, 9, 5), FRI_17), 'tomorrow 09:05');
    assert.equal(formatDueTime(at(9, 11), FRI_17), 'Mon 11:00');
    assert.equal(formatDueTime(at(12, 18), FRI_17), 'Thu 18:00');
    // Seven days on would be next Friday: a date, so a weekday never means next week.
    assert.equal(formatDueTime(at(13, 10), FRI_17), '13 Nov 10:00');
    assert.equal(formatDueTime(new Date(2027, 0, 4, 9, 0), FRI_17), '04 Jan 2027 09:00');
  });
});

describe('the deadline', () => {
  test('Ronit\'s example: Friday 17:00, due Monday 11:00 → "Due Mon 11:00", green (not "66h left")', () => {
    assert.deepEqual(slaDeadline(base(), FRI_17), { tone: 'WITHIN_SLA', label: 'Due Mon 11:00', paused: false });
  });

  test('the server says due soon (≤ 30 min): amber', () => {
    const d = slaDeadline(base({ slaStatus: 'DUE_SOON', slaResolveDue: iso(at(6, 17, 25)) }), FRI_17);
    assert.deepEqual(d, { tone: 'DUE_SOON', label: 'Due today 17:25', paused: false });
  });

  test('an hour away is still green unless the server says due soon: the app sets no threshold', () => {
    assert.equal(slaDeadline(base({ slaResolveDue: iso(at(6, 18)) }), FRI_17).tone, 'WITHIN_SLA');
  });

  test('past the deadline: "Breached", red', () => {
    assert.deepEqual(slaDeadline(base({ slaResolveDue: iso(at(6, 16)) }), FRI_17), { tone: 'BREACHED', label: 'Breached', paused: false });
  });

  test('on hold: the deadline moves with the hold (05 §A.9), so no time is given', () => {
    const t = base({ status: 'ON_HOLD', slaResolveDue: iso(at(6, 16, 30)), slaHoldStartedAt: iso(at(6, 16)) });
    assert.deepEqual(slaDeadline(t, FRI_17), { tone: 'WITHIN_SLA', label: 'Paused while on hold', paused: true });
  });

  test('breached before the hold began: still "Breached"', () => {
    const t = base({ status: 'ON_HOLD', slaResolveDue: iso(at(6, 12)), slaHoldStartedAt: iso(at(6, 15)) });
    assert.equal(slaDeadline(t, FRI_17).label, 'Breached');
  });

  test('a first-response breach alone leaves the resolution deadline green (the SLA badge shows that breach)', () => {
    const t = base({ slaResponseDue: iso(at(6, 12)) });
    assert.equal(getDisplaySlaStatus(t, FRI_17).status, 'BREACHED');
    assert.equal(slaDeadline(t, FRI_17).tone, 'WITHIN_SLA');
  });

  test('nothing to show: no SLA, or the clock has stopped (Resolved, Closed, Canceled)', () => {
    assert.equal(slaDeadline(base({ slaResolveDue: null }), FRI_17), null);
    for (const status of ['RESOLVED', 'CLOSED', 'CANCELED']) assert.equal(slaDeadline(base({ status }), FRI_17), null, status);
  });

  test('never a countdown: no label says "left"', () => {
    for (const due of [at(6, 17, 1), at(6, 23), at(9, 11), at(20, 9)]) {
      assert.doesNotMatch(slaDeadline(base({ slaResolveDue: iso(due) }), FRI_17).label, /left/);
    }
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
    assert.deepEqual(Object.keys(colors.slaDeadline).sort(), [...SLA_STATUSES].sort());
    const tones = SLA_STATUSES.map((s) => [s, lightness(colors.slaDeadline[s])]);
    for (let i = 0; i < tones.length; i++) {
      for (let j = i + 1; j < tones.length; j++) {
        const gap = Math.abs(tones[i][1] - tones[j][1]);
        assert.ok(gap >= 15, `${tones[i][0]} vs ${tones[j][0]}: ${gap.toFixed(1)}`);
      }
    }
  });

  test('ticket detail only: in the header card, never on a list card', () => {
    assert.match(read('src/screens/tickets/TicketDetailScreen.tsx'), /<SlaBadge ticket=\{ticket\} \/>\s*<\/View>\s*\{\/\*[^*]*\*\/\}\s*<SlaDeadline ticket=\{ticket\} \/>/);
    for (const rel of ['src/components/TicketCard.tsx', 'src/screens/tickets/TicketListScreen.tsx', 'src/components/RecentTicketRow.tsx']) {
      assert.doesNotMatch(read(rel), /SlaDeadline|slaDeadline/, rel);
    }
  });

  test('no bar, no animation, no timer: the clock is read on render, focus and return to the app', () => {
    const src = read('src/components/SlaDeadline.tsx');
    assert.doesNotMatch(src, /Animated|setInterval|setTimeout|requestAnimationFrame|flex: elapsed|track/);
    assert.match(src, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*setNow\(Date\.now\(\)\);/);
    assert.match(src, /if \(next === 'active'\) setNow\(Date\.now\(\)\);/);
  });

  test('the backend ask for a real countdown is filed (A31), with the Friday-evening example', () => {
    const asks = read('docs/web-system/06-BACKEND-ASKS.md');
    assert.match(asks, /### A31 — /);
    assert.match(asks, /66h left/);
  });
});
