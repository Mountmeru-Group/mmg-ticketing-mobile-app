// The greeting mark (2026-11-03, docs/brand/UI-STANDARDS.md §14): a drawn sun, sun behind a cloud, or moon beside
// "Good morning, Ronit", one per greeting band; flat SVG in brand yellow, never an emoji; one rise and fade when Home
// mounts; hidden from screen readers. The band rule is src/utils/greeting.ts; the component is read as source.
//
// iOS (iOS-5f): ported from Android dev d8626bc (STEP 4: the band rule; STEP 5: the drawn mark). "On Home, quiet" joins
// with the iOS HomeScreen in STEP 6. iOS addition at the end: no rise under Reduce Motion or while VoiceOver runs.
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

describe('greeting mark: drawn, not an emoji', () => {
  const mark = read('src/components/GreetingMark.tsx');

  test('each band has its own flat SVG, required by the component', () => {
    for (const [name, rel] of Object.entries(SVG)) {
      assert.ok(existsSync(path.join(REPO, rel)), rel);
      assert.match(mark, new RegExp(`${name}: require\\('\\.\\./\\.\\./${rel.replace(/\./g, '\\.')}'\\) as number,`), name);
    }
  });

  test('flat: no gradient, filter, image or text in any of them; brand yellow in each', () => {
    for (const rel of Object.values(SVG)) {
      const svg = read(rel).replace(/<!--[\s\S]*?-->/g, ''); // the drawing, not its comment
      assert.doesNotMatch(svg, /Gradient|<filter|<image|<text|opacity=/i, rel);
      assert.match(svg, new RegExp(`fill="${colors.secondary}"`, 'i'), `${rel}: brand yellow`);
    }
  });

  test('every colour in them is a src/theme/colors.ts token (brand yellow, white, gray-400)', () => {
    const allowed = new Set([colors.secondary, palette.white, palette.gray[400]].map((c) => c.toLowerCase()));
    for (const rel of Object.values(SVG)) {
      for (const [hex] of read(rel).matchAll(/#[0-9a-f]{6}\b/gi)) assert.ok(allowed.has(hex.toLowerCase()), `${rel}: ${hex}`);
    }
  });

  test('no emoji anywhere in src/ (they are the phone\'s font, and differ across Android versions)', () => {
    const files = (function walk(dir) {
      return readdirSync(path.join(REPO, dir)).flatMap((e) => {
        const rel = path.join(dir, e);
        if (statSync(path.join(REPO, rel)).isDirectory()) return walk(rel);
        return /\.tsx?$/.test(e) ? [rel] : [];
      });
    })('src');
    // None at all since 2026-11-03: the paperclip emoji html.ts used to write for an e-mail's inline (cid:) image is a
    // drawn icon now (tests/polish/cid-image.test.mjs). Characters are built from code points, so this file holds none.
    const VARIATION_SELECTOR_16 = String.fromCodePoint(0xfe0f); // asks for the emoji form of any character
    for (const rel of files) {
      // Code only: comments are not drawn (some older comments use a marker such as the padlock).
      const code = read(rel.replace(/\\/g, '/')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      // Emoji_Presentation draws as an emoji by default.
      assert.deepEqual(code.match(/\p{Emoji_Presentation}/gu) ?? [], [], rel);
      assert.ok(!code.includes(VARIATION_SELECTOR_16), rel);
    }
    // Sun, sun behind cloud (three forms), crescent moons, sun with face: none on Home, drawn or not.
    const home = read('src/screens/dashboard/HomeScreen.tsx');
    for (const cp of [0x2600, 0x26c5, 0x1f324, 0x1f325, 0x1f326, 0x1f319, 0x1f31a, 0x1f31b, 0x1f31e]) {
      assert.ok(!home.includes(String.fromCodePoint(cp)), cp.toString(16));
    }
  });
});

// ── iOS (iOS-5f): skipped under Reduce Motion and while VoiceOver runs ──

describe('greeting mark on iOS: no rise under Reduce Motion or VoiceOver', () => {
  const mark = read('src/components/GreetingMark.tsx');

  test('decided at mount, and again when the art first shows: either setting gives the end state at once', () => {
    assert.match(mark, /useState\(\(\) => \(reduceMotionEnabled\(\) \|\| screenReaderEnabled\(\) \? null : new Animated\.Value\(0\)\)\)/);
    assert.match(mark, /if \(!entry \|\| played\.current\) return;\s*played\.current = true;\s*\/\/[^\n]*\n\s*if \(reduceMotionEnabled\(\) \|\| screenReaderEnabled\(\)\) \{\s*entry\.setValue\(1\);\s*return;\s*\}/);
    // Still the one timing, once.
    assert.equal(mark.split('Animated.timing(').length - 1, 1);
  });

  test('hidden from VoiceOver (accessibilityElementsHidden is iOS\'s; importantForAccessibility is Android\'s)', () => {
    assert.match(mark, /accessible=\{false\}\s*accessibilityElementsHidden\s*importantForAccessibility="no-hide-descendants"/);
  });

  test('screenReaderEnabled() follows VoiceOver as iOS reports it, turned on and off while the app runs', async () => {
    const rn = await import('react-native');
    const { screenReaderEnabled } = await import('../../src/hooks/useScreenReader.ts');
    assert.equal(screenReaderEnabled(), false, 'off until the system says otherwise');
    rn.__changeScreenReader(true);
    assert.equal(screenReaderEnabled(), true);
    rn.__changeScreenReader(false);
    assert.equal(screenReaderEnabled(), false);
  });
});
