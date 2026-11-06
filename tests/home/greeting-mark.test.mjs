// The greeting mark (2026-11-03, docs/brand/UI-STANDARDS.md §14): a drawn sun, sun behind a cloud, or moon beside
// "Good morning, Ronit", one per greeting band; flat SVG in brand yellow, never an emoji; one rise and fade when Home
// mounts; hidden from screen readers. The band rule is src/utils/greeting.ts; the component is read as source.
//
// iOS (iOS-5f, STEP 4): ported from Android dev d8626bc. The band rule is verbatim; "drawn, not an emoji" joins with
// GreetingMark and its SVGs in STEP 5, and "on Home, quiet" with the iOS HomeScreen in STEP 6.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { colors, palette } from '../../src/theme/colors.ts';
import { GREETING_MARKS, greetingForHour, greetingMark, greetingNow } from '../../src/utils/greeting.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const SVG = {
  sun: 'assets/illustrations/greeting-sun.svg',
  cloudSun: 'assets/illustrations/greeting-cloud-sun.svg',
  moon: 'assets/illustrations/greeting-moon.svg',
};

describe('greeting mark: one per band', () => {
  test('every hour of the day, written out: sun 05–11, sun behind a cloud 12–16, moon 17–04', () => {
    const S = 'sun';
    const C = 'cloudSun';
    const M = 'moon';
    const expected = [M, M, M, M, M, S, S, S, S, S, S, S, C, C, C, C, C, M, M, M, M, M, M, M];
    assert.deepEqual(Array.from({ length: 24 }, (_, h) => greetingMark(greetingForHour(h))), expected);
  });

  test('the three greetings map to three different marks', () => {
    assert.deepEqual(GREETING_MARKS, { 'Good morning': 'sun', 'Good afternoon': 'cloudSun', 'Good evening': 'moon' });
  });

  test('the boundaries follow the greeting exactly', () => {
    const at = (h, m = 0) => new Date(2026, 10, 3, h, m);
    assert.equal(greetingMark(greetingNow(at(4, 59))), 'moon');
    assert.equal(greetingMark(greetingNow(at(5, 0))), 'sun');
    assert.equal(greetingMark(greetingNow(at(11, 59))), 'sun');
    assert.equal(greetingMark(greetingNow(at(12, 0))), 'cloudSun');
    assert.equal(greetingMark(greetingNow(at(16, 59))), 'cloudSun');
    assert.equal(greetingMark(greetingNow(at(17, 0))), 'moon');
  });
});
