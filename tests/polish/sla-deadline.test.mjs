// The SLA deadline on ticket detail (2026-11-03, Ronit's option C; src/utils/sla-deadline.ts): "Due Mon 11:00" or
// "Breached", coloured, no bar and no countdown. The deadline is effectiveResolveDue() (05 §A.9, the "Resolve by" row)
// and the colour is the hold-adjusted SLA status (getDisplaySlaStatus); the app adds no threshold of its own.
// Dates are built in local time (the Date constructor with parts), as the phone shows them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { colors, palette } from '../../src/theme/colors.ts';
import { SLA_STATUSES } from '../../src/types/index.ts';
import { formatRelativeShort, formatShortDate, getDisplaySlaStatus } from '../../src/utils/format.ts';
import { formatDueTime, slaDeadline, slaDueLine } from '../../src/utils/sla-deadline.ts';

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
    assert.deepEqual(slaDeadline(base(), FRI_17), { tone: 'WITHIN_SLA', label: 'Due Mon 11:00', paused: false, due: at(9, 11) });
  });

  test('the server says due soon (≤ 30 min): amber', () => {
    const d = slaDeadline(base({ slaStatus: 'DUE_SOON', slaResolveDue: iso(at(6, 17, 25)) }), FRI_17);
    assert.deepEqual(d, { tone: 'DUE_SOON', label: 'Due today 17:25', paused: false, due: at(6, 17, 25) });
  });

  test('an hour away is still green unless the server says due soon: the app sets no threshold', () => {
    assert.equal(slaDeadline(base({ slaResolveDue: iso(at(6, 18)) }), FRI_17).tone, 'WITHIN_SLA');
  });

  test('past the deadline: "Breached", red', () => {
    assert.deepEqual(slaDeadline(base({ slaResolveDue: iso(at(6, 16)) }), FRI_17), { tone: 'BREACHED', label: 'Breached', paused: false, due: at(6, 16) });
  });

  test('on hold: the deadline moves with the hold (05 §A.9), so no time is given', () => {
    const t = base({ status: 'ON_HOLD', slaResolveDue: iso(at(6, 16, 30)), slaHoldStartedAt: iso(at(6, 16)) });
    // 16:30, plus the hour on hold so far: the deadline that moves.
    assert.deepEqual(slaDeadline(t, FRI_17), { tone: 'WITHIN_SLA', label: 'Paused while on hold', paused: true, due: at(6, 17, 30) });
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

  test('detail: the dot row in the header card. The list card: its own due line from the same rule (below). Home: neither', () => {
    assert.match(read('src/screens/tickets/TicketDetailScreen.tsx'), /<SlaBadge ticket=\{ticket\} \/>\s*<\/View>\s*\{\/\*[^*]*\*\/\}\s*<SlaDeadline ticket=\{ticket\} \/>/);
    assert.doesNotMatch(read('src/components/TicketCard.tsx'), /<SlaDeadline|\bslaDeadline\(/, 'the card words it with slaDueLine');
    assert.doesNotMatch(read('src/components/RecentTicketRow.tsx'), /SlaDeadline|slaDeadline|slaDueLine/);
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

// ── The ticket card's due line (2026-11-05, UI-STANDARDS.md §16) ──
// The same rule as detail (slaDeadline), worded with the date: "Due Fri 7 Nov, 17:00", "Breached 3 Nov, 12:00".

describe('the card\'s due line, in words', () => {
  /** Thursday 5 Nov 2026, 10:00 local: "today" is the 5th, "tomorrow" the 6th, Friday 13th is next week. */
  const THU_10 = new Date(2026, 10, 5, 10, 0).getTime();
  const dueAt = (date, over = {}) => base({ slaResolveDue: iso(date), ...over });

  test('today: "Due today 5 Nov, 16:30"', () => {
    assert.equal(new Date(THU_10).getDay(), 4, 'the 5th is a Thursday');
    assert.equal(slaDueLine(dueAt(at(5, 16, 30)), THU_10).label, 'Due today 5 Nov, 16:30');
  });

  test('tomorrow: "Due tomorrow 6 Nov, 09:00"', () => {
    assert.equal(slaDueLine(dueAt(at(6, 9)), THU_10).label, 'Due tomorrow 6 Nov, 09:00');
  });

  test('this week: weekday, date and time, "Due Sat 7 Nov, 17:00"', () => {
    assert.equal(slaDueLine(dueAt(at(7, 17)), THU_10).label, 'Due Sat 7 Nov, 17:00');
    assert.equal(slaDueLine(dueAt(at(11, 8, 15)), THU_10).label, 'Due Wed 11 Nov, 08:15');
  });

  test('later: still the weekday with the date, and the year once it is another year', () => {
    assert.equal(slaDueLine(dueAt(at(13, 17)), THU_10).label, 'Due Fri 13 Nov, 17:00');
    assert.equal(slaDueLine(dueAt(at(17, 10)), THU_10).label, 'Due Tue 17 Nov, 10:00');
    assert.equal(slaDueLine(dueAt(new Date(2027, 0, 4, 9, 0)), THU_10).label, 'Due Mon 4 Jan 2027, 09:00');
  });

  test('breached: when it was missed, "Breached 3 Nov, 12:00", red', () => {
    const line = slaDueLine(dueAt(at(3, 12)), THU_10);
    assert.deepEqual({ tone: line.tone, label: line.label }, { tone: 'BREACHED', label: 'Breached 3 Nov, 12:00' });
    assert.equal(slaDueLine(dueAt(at(5, 9, 45)), THU_10).label, 'Breached 5 Nov, 09:45');
  });

  test('the server says due soon: amber, with the same words', () => {
    const line = slaDueLine(dueAt(at(5, 10, 20), { slaStatus: 'DUE_SOON' }), THU_10);
    assert.deepEqual({ tone: line.tone, label: line.label }, { tone: 'DUE_SOON', label: 'Due today 5 Nov, 10:20' });
  });

  test('no SLA: no line at all', () => {
    assert.equal(slaDueLine(base({ slaResolveDue: null }), THU_10), null);
  });

  test('on hold (and every pending status): no time given, as detail', () => {
    const held = { slaResolveDue: iso(at(7, 17)), slaHoldStartedAt: iso(at(5, 9)) };
    for (const status of ['ON_HOLD', 'PENDING', 'PENDING_USER_INFO', 'PENDING_MGMT_REVIEW']) {
      const line = slaDueLine(base({ status, ...held }), THU_10);
      assert.equal(line.label, 'Paused while on hold', status);
      assert.doesNotMatch(line.label, /\d/, status);
    }
    const breachedThenHeld = slaDueLine(base({ status: 'ON_HOLD', slaResolveDue: iso(at(4, 12)), slaHoldStartedAt: iso(at(5, 9)) }), THU_10);
    assert.equal(breachedThenHeld.label, 'Breached');
  });

  test('a stopped clock (Resolved, Closed, Canceled): no line, even with a deadline, even a missed one', () => {
    for (const status of ['RESOLVED', 'CLOSED', 'CANCELED']) {
      assert.equal(slaDueLine(dueAt(at(7, 17), { status }), THU_10), null, status);
      assert.equal(slaDueLine(dueAt(at(3, 12), { status, resolvedAt: iso(at(4, 9)) }), THU_10), null, status);
    }
  });

  test('never a countdown: no "left", no hours or minutes to go', () => {
    for (const due of [at(5, 10, 1), at(5, 23), at(7, 17), at(30, 9), at(1, 9)]) {
      const { label } = slaDueLine(dueAt(due), THU_10);
      assert.doesNotMatch(label, /left|\d+\s*[hm]\b|in \d/, label);
    }
  });

  test('one rule: the card\'s tone and deadline are detail\'s, for every case', () => {
    const cases = [at(5, 16, 30), at(6, 9), at(7, 17), at(3, 12)].map((d) => dueAt(d));
    cases.push(dueAt(at(5, 10, 20), { slaStatus: 'DUE_SOON' }), dueAt(at(7, 17), { slaResponseDue: iso(at(4, 9)) }));
    for (const t of cases) {
      const detail = slaDeadline(t, THU_10);
      const card = slaDueLine(t, THU_10);
      assert.equal(card.tone, detail.tone);
      assert.equal(card.due.getTime(), detail.due.getTime());
    }
  });
});

describe('the card\'s due line: colour, place and cost', () => {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const lightness = (hex) => {
    const y = luminance(hex);
    return y <= 216 / 24389 ? (y * 24389) / 27 : 116 * Math.cbrt(y) - 16;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  test('colours from src/theme/colors.ts, one per SLA status', () => {
    assert.deepEqual(Object.keys(colors.slaDue).sort(), [...SLA_STATUSES].sort());
  });

  test('each passes WCAG AA as 12 dp text (4.5:1) on the white card and on the selected card\'s red-50', () => {
    for (const status of SLA_STATUSES) {
      for (const ground of [colors.card, palette.red[50]]) {
        const ratio = contrast(colors.slaDue[status], ground);
        assert.ok(ratio >= 4.5, `${status} on ${ground}: ${ratio.toFixed(2)}`);
      }
    }
  });

  test('they differ in LIGHTNESS, not hue alone: green lightest, red darkest, at least 9 L* apart', () => {
    const [green, amber, red] = ['WITHIN_SLA', 'DUE_SOON', 'BREACHED'].map((s) => lightness(colors.slaDue[s]));
    assert.ok(green - amber >= 9, `green ${green.toFixed(1)} vs amber ${amber.toFixed(1)}`);
    assert.ok(amber - red >= 9, `amber ${amber.toFixed(1)} vs red ${red.toFixed(1)}`);
  });

  test('TicketCard: the due line after the people row, in the SLA colour, from slaDueLine; no SLA chip; absent when null', () => {
    const card = read('src/components/TicketCard.tsx');
    assert.doesNotMatch(card, /SlaBadge/);
    assert.match(card, /const due = slaDueLine\(ticket, now\);/);
    const people = card.indexOf('<PeopleRow');
    const line = card.indexOf('{due ? (');
    assert.ok(people > 0 && line > people, 'below the people row');
    assert.match(card, /<Ionicons name="time-outline" size=\{14\} color=\{dueColor\} \/>/);
    assert.match(card, /style=\{\{ color: dueColor \}\}/);
    assert.match(card, /\) : null\}\s*<\/Pressable>/, 'nothing rendered when there is no line');
  });

  test('no animation, no timer on the row: computed on render from the list\'s clock', () => {
    const card = read('src/components/TicketCard.tsx');
    const row = card.slice(card.indexOf('{due ? ('), card.indexOf(') : null}', card.indexOf('{due ? (')));
    assert.doesNotMatch(row, /Animated|useEffect|setInterval|setTimeout/);
    const list = read('src/screens/tickets/TicketListScreen.tsx');
    assert.match(list, /const now = Math\.max\(shownAt, currentMinute\(\)\);/);
    assert.match(list, /now=\{now\}/);
    assert.doesNotMatch(list, /setInterval|refetchInterval/);
  });

  test('the top line: "#19445 · Raised 2 Nov · updated 2d ago", the New reply badge still at the right', () => {
    const card = read('src/components/TicketCard.tsx');
    assert.match(card, /#\{ticket\.ticketNumber \?\? '—'\}<\/Text>\s*<Text className=\{`shrink text-xs \$\{meta\}`\} numberOfLines=\{1\}>\s*\{` · Raised \$\{raised\}`\}/);
    assert.match(card, /\{` · updated \$\{formatRelativeShort\(ticket\.updatedAt, now\)\}`\}/);
    assert.ok(card.indexOf('· updated') < card.indexOf('New reply</Text>'));
    assert.equal(formatShortDate(new Date(2026, 10, 2, 8, 0), new Date(2026, 10, 5).getTime()), '2 Nov');
    assert.equal(formatRelativeShort(new Date(2026, 10, 3, 10), new Date(2026, 10, 5, 10).getTime()), '2d ago');
  });

  test('the list skeleton matches the new card: two chips, then the due line under the people row', () => {
    const skeleton = read('src/components/LoadingSkeleton.tsx');
    const list = skeleton.slice(skeleton.indexOf('// `list`: TicketCard'));
    assert.equal((list.match(/rounded-full" \/>/g) ?? []).length >= 2, true);
    assert.match(list, /<Bar className="mr-1\.5 h-5 w-16 rounded-full" \/>\s*<Bar className="h-5 w-14 rounded-full" \/>\s*<\/View>/);
    assert.match(list, /<View className="mt-2 h-4 flex-row items-center">\s*<Bar className="h-3\.5 w-3\.5 rounded-full" \/>/);
  });
});
