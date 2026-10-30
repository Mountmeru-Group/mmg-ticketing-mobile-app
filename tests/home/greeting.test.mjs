// The Home greeting (2026-10-29): "Good morning, Ronit" by the device's local time. The rule is src/utils/greeting.ts:
// morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–04:59, three greetings only. HomeScreen reads the clock on
// first render, on every focus and when the app returns to the foreground: events only, never a timer.
// iOS-5b: Android's file (4063df3), with one change: the Home header keeps iOS-4's maxFontSizeMultiplier (Title 2's cap,
// theme/typography.ts maxTextScale), so the "same place and type" pattern allows it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { GREETING_BANDS, firstName, greetingForHour, greetingLine, greetingNow } from '../../src/utils/greeting.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

/** A device-local time today (the Date constructor with parts is local time, as the phone's clock is). */
const at = (hours, minutes = 0, seconds = 0) => new Date(2026, 9, 29, hours, minutes, seconds);

const M = 'Good morning';
const A = 'Good afternoon';
const E = 'Good evening';

describe('greeting: time bands', () => {
  test('every hour of the day, written out', () => {
    const expected = [E, E, E, E, E, M, M, M, M, M, M, M, A, A, A, A, A, E, E, E, E, E, E, E];
    assert.deepEqual(Array.from({ length: 24 }, (_, h) => greetingForHour(h)), expected);
  });

  test('the boundaries, to the second', () => {
    const cases = [
      [at(0, 0, 0), E],
      [at(4, 59, 59), E],
      [at(5, 0, 0), M],
      [at(11, 59, 59), M],
      [at(12, 0, 0), A],
      [at(16, 59, 59), A],
      [at(17, 0, 0), E],
      [at(23, 59, 59), E],
    ];
    for (const [clock, greeting] of cases) assert.equal(greetingNow(clock), greeting, clock.toTimeString());
  });

  test('the bands start at 05:00, 12:00 and 17:00', () => {
    assert.deepEqual(GREETING_BANDS, { morning: 5, afternoon: 12, evening: 17 });
  });

  test('only three greetings exist, and every minute of the day gets one', () => {
    const seen = new Set();
    for (let minute = 0; minute < 24 * 60; minute++) seen.add(greetingNow(at(Math.floor(minute / 60), minute % 60)));
    assert.deepEqual([...seen].sort(), [A, E, M]);
  });

  test('with no argument it reads the device clock', () => {
    const before = greetingForHour(new Date().getHours());
    const now = greetingNow();
    const after = greetingForHour(new Date().getHours());
    assert.ok(now === before || now === after);
  });
});

describe('greeting: the name', () => {
  test('"Good morning, Ronit": the greeting, a comma, then the first name only', () => {
    assert.equal(greetingLine(M, 'Ronit Chaudhari'), 'Good morning, Ronit');
    assert.equal(greetingLine(A, 'Ronit Chaudhari'), 'Good afternoon, Ronit');
    assert.equal(greetingLine(E, 'Ronit Chaudhari'), 'Good evening, Ronit');
  });

  test('a single-word name', () => {
    assert.equal(greetingLine(M, 'Ronit'), 'Good morning, Ronit');
  });

  test('a missing or blank name gives the greeting alone', () => {
    for (const name of [undefined, null, '', '   ']) assert.equal(greetingLine(E, name), 'Good evening', JSON.stringify(name));
  });

  test('extra spaces and an e-mail-style display name (formatDisplayName, as the drawer shows it)', () => {
    assert.equal(firstName('  Ronit   Chaudhari '), 'Ronit');
    assert.equal(firstName('ronit.chaudhari@mountmerugroup.com'), 'Ronit');
  });
});

describe('greeting: Home', () => {
  const src = read('src/screens/dashboard/HomeScreen.tsx');

  test('same place and type as the old "Hello": the header text, text-xl font-bold', () => {
    assert.match(src, /<Text accessibilityRole="header" className="text-xl font-bold text-gray-900" maxFontSizeMultiplier=\{maxTextScale\.title2\}>\s*\{greetingLine\(greeting, user\?\.displayName\)\}\s*<\/Text>/);
    assert.doesNotMatch(src, /Hello/);
  });

  test('recomputed on focus and when the app returns to the foreground', () => {
    assert.match(src, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*setGreeting\(greetingNow\(\)\);/);
    assert.match(src, /AppState\.addEventListener\('change', \(next\) => \{\s*if \(next === 'active'\) setGreeting\(greetingNow\(\)\);/);
    assert.match(src, /return \(\) => subscription\.remove\(\);/);
  });

  test('no timer and no polling', () => {
    assert.doesNotMatch(src, /setInterval|setTimeout|refetchInterval|requestAnimationFrame/);
    // The device clock only: no server time, no request, no stored profile timezone.
    assert.doesNotMatch(read('src/utils/greeting.ts'), /setInterval|setTimeout|\bfetch\(|apiClient|@\/api|\.timezone\b|useAuthStore/);
  });
});
