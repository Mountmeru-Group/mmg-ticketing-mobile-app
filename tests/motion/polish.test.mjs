// Motion added on 2026-11-03 (docs/PERFORMANCE.md §13), under the Phase A1 rules: native driver; transform and opacity
// only; never blocks a press; skipped under "Remove animations"; stopped on unmount; values in src/theme/motion.ts.
// The general checks over every animating file live in tests/motion/start-up-and-login.test.mjs (now seven files);
// this file holds what is specific to this phase, above all: NO LOOPING ANIMATION IN A LIST ROW.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { motion } from '../../src/theme/motion.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((e) => {
    const rel = path.join(dir, e);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e) ? [rel.replace(/\\/g, '/')] : [];
  });
}
const files = sourceFiles('src');

describe('no looping animation on any list row', () => {
  test('Animated.loop exists in exactly two files, neither of them a list row: the skeleton shimmer and the sign-in arc', () => {
    const loops = files.filter((rel) => /Animated\.loop\(/.test(read(rel)));
    assert.deepEqual(loops.sort(), ['src/components/Shimmer.tsx', 'src/screens/auth/SignInButton.tsx']);
    // The shimmer is drawn only by LoadingSkeleton (a placeholder that leaves when rows arrive); the arc only on Login.
    assert.deepEqual(files.filter((rel) => /<Shimmer\b/.test(read(rel))), ['src/components/LoadingSkeleton.tsx']);
    assert.deepEqual(files.filter((rel) => /<SignInButton\b/.test(read(rel))), ['src/screens/auth/LoginScreen.tsx']);
  });

  test('what a ticket row is made of animates only on a press, a status change or its first entry: one-shot, never looped', () => {
    for (const rel of ['src/components/TicketCard.tsx', 'src/components/PeopleRow.tsx', 'src/components/PressFeedback.tsx', 'src/components/StatusBadge.tsx', 'src/components/ListEntry.tsx']) {
      assert.doesNotMatch(read(rel), /Animated\.loop|iterations|setInterval|requestAnimationFrame/, rel);
    }
  });
});

describe('press feedback (components/PressFeedback.tsx)', () => {
  const src = read('src/components/PressFeedback.tsx');

  test('dips to 0.97 and tints (opacity) while held: transform and opacity only, native driver', () => {
    assert.equal(motion.press.scale, 0.97);
    assert.ok(motion.press.opacity > 0.7 && motion.press.opacity < 1);
    assert.match(src, /Animated\.timing\(held, \{ toValue, duration: toValue === 1 \? pressIn : pressOut, easing: ease, useNativeDriver: true \}\)/);
    assert.match(src, /opacity: held\.interpolate\(/);
    assert.match(src, /transform: \[\{ scale: held\.interpolate\(/);
  });

  test('never blocks the press: the Pressable\'s own handlers still run, nothing awaits the animation', () => {
    assert.match(src, /go\(1\);\s*own\?\.onPressIn\?\.\(event\);/);
    assert.match(src, /go\(0\);\s*own\?\.onPressOut\?\.\(event\);/);
    assert.doesNotMatch(src, /await|\.start\(\s*\(/);
  });

  test('"Remove animations": no scale, and the tint is set at once', () => {
    assert.match(src, /if \(reduceMotionEnabled\(\)\) \{\s*held\.setValue\(toValue\);\s*return;\s*\}/);
    assert.match(src, /reduceMotion\s*\?\s*\{ opacity: held\.interpolate/);
  });

  test('a touch that becomes a scroll shows nothing: the press shows after pressDelay', () => {
    assert.match(src, /unstable_pressDelay: pressDelay,/);
    assert.ok(motion.press.pressDelay > 0 && motion.press.pressDelay <= 100);
  });

  test('every tappable card and list row uses it, and the old active: tints are gone from them', () => {
    const USERS = {
      'src/components/TicketCard.tsx': /\{\.\.\.feedback\.pressProps\(\)\}/,
      'src/components/RecentTicketRow.tsx': /<PressableCard\b/,
      'src/components/TaskRow.tsx': /<PressableCard\b/,
      'src/screens/approvals/ApprovalsInboxScreen.tsx': /<PressableCard\b/,
      'src/screens/catalog/ServiceCatalogScreen.tsx': /<PressableCard\b[\s\S]*<PressableCard\b/,
      'src/screens/knowledge/KnowledgeBaseScreen.tsx': /<PressableCard\b[\s\S]*<PressableCard\b/,
      'src/screens/notifications/NotificationsScreen.tsx': /\{\.\.\.feedback\.pressProps\(\)\}/,
      'src/screens/tickets/TicketDetailScreen.tsx': /<PressableCard\b/,
      'src/screens/dashboard/HomeScreen.tsx': /<PressableCard\b/,
    };
    for (const [rel, pattern] of Object.entries(USERS)) assert.match(read(rel), pattern, rel);
    // No card (a Pressable with the card's rounded-xl border) keeps a NativeWind active: tint.
    for (const rel of files) {
      for (const line of read(rel).split('\n')) {
        if (/rounded-xl border/.test(line)) assert.doesNotMatch(line, /active:(opacity|bg)-/, `${rel}: ${line.trim()}`);
      }
    }
  });
});

describe('swipe (components/TicketCard.tsx)', () => {
  const card = read('src/components/TicketCard.tsx');

  test('react-native-gesture-handler\'s Swipeable, on its default native animations: translateX only, never turned off', () => {
    assert.match(card, /import \{ Swipeable \} from 'react-native-gesture-handler';/);
    assert.doesNotMatch(card, /useNativeAnimations/);
  });

  test('its numbers are motion.swipe; leftward only, and a vertical move cancels it (no fight with the list\'s scroll)', () => {
    assert.match(card, /const \{ actionWidth, dragStart, verticalFail, openThreshold, friction, reducedSpringSpeed \} = motion\.swipe;/);
    assert.match(card, /activeOffsetX=\{-dragStart\}/);
    assert.match(card, /failOffsetY=\{\[-verticalFail, verticalFail\]\}/);
    assert.match(card, /animationOptions=\{reduceMotionEnabled\(\) \? REDUCED_SPRING : undefined\}/);
  });

  test('recycling: an open row closes when its cell gets another ticket, and when the list starts to scroll', () => {
    assert.match(card, /if \(shownId\.current === ticket\.id\) return;\s*shownId\.current = ticket\.id;\s*if \(open\.current\) \{\s*open\.current = false;\s*ref\.current\?\.reset\(\);/);
    assert.match(read('src/screens/tickets/TicketListScreen.tsx'), /onScrollBeginDrag=\{closeOpenRow\}/);
  });

  test('a selection closes the open row and disables swiping; a resting row renders one empty box, not the buttons', () => {
    assert.match(read('src/screens/tickets/TicketListScreen.tsx'), /useEffect\(\(\) => \{\s*if \(selectionMode\) closeOpenRow\(\);/);
    assert.match(card, /revealed \? \(/);
    assert.match(card, /<View style=\{\{ width: actions\.length \* actionWidth \}\} \/>/);
    assert.match(card, /onSwipeableOpenStartDrag=\{\(\) => setRevealed\(true\)\}/);
  });
});

describe('count roll on Home: a cross-fade, not a count-up (components/CountFade.tsx, Ronit\'s option 5)', () => {
  const fade = read('src/components/CountFade.tsx');
  const home = read('src/screens/dashboard/HomeScreen.tsx');

  test('no count-up anywhere: no number is driven frame by frame (it would need JavaScript every frame)', () => {
    for (const src of [fade, home]) assert.doesNotMatch(src, /addListener\(|requestAnimationFrame|setInterval|Animated\.loop/);
    assert.doesNotMatch(home, /Animated\./, 'Home itself animates nothing');
  });

  test('one native timing per change, on opacity and translateY: the old number fades out over the new', () => {
    assert.equal(fade.split('Animated.timing(').length - 1, 1);
    assert.match(fade, /Animated\.timing\(fade\.progress, \{ toValue: 1, duration, easing: ease, useNativeDriver: true \}\)/);
    assert.match(fade, /\{ opacity: progress, transform: \[\{ translateY: progress\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[rise, 0\] \}\) \}\] \}/);
    assert.match(fade, /\{ opacity: progress\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[1, 0\] \}\) \}/);
    assert.ok(motion.countFade.duration > 0 && motion.countFade.duration <= 500);
  });

  test('only when the period changes: a refresh within the same period shows its number at once', () => {
    assert.match(fade, /active && periodChanged && shown\.value !== value && !reduceMotionEnabled\(\)/);
  });

  test('"Remove animations", or Home out of view: the end state at once; stopped on unmount', () => {
    assert.match(fade, /useState<Fade \| null>\(\(\) =>\s*active && !reduceMotionEnabled\(\) \?/);
    assert.match(fade, /if \(fade && !active\) setFade\(null\);/);
    assert.match(fade, /return \(\) => run\.stop\(\);/);
  });

  test('Home: only while it is the screen in view, and only after the period has been changed', () => {
    assert.match(home, /const focused = useIsFocused\(\);/);
    assert.match(home, /const countsFade = focused && periodTouched;/);
    assert.match(home, /const pickPeriod = \(next: DashboardPeriod\) => \{\s*setPeriodTouched\(true\);/);
    assert.match(home, /<CountFade value=\{t\.value\} periodKey=\{periodKey\} active=\{countsFade\} \/>/);
  });

  test('a previous period\'s count is never shown as the new one: placeholder data still supplies no count', () => {
    assert.match(home, /const countsCurrent = showTileCounts && periodReady && !dashboard\.isPlaceholderData;/);
  });
});
