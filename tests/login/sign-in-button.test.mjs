// The email form's "Sign in" is laid out where it can be tapped, keyboard up or down (G9 fix, 2026-11-05;
// docs/brand/UI-STANDARDS.md §15.3).
//
// On UAT the button was invisible: its Pressable's `style` was a function, NativeWind turned it into `{}`, and what was
// left was a 20 dp line of white text on the white page. The old tests read the source, found a "Sign in" Pressable,
// and passed. These tests check what the phone gets instead:
// 1. the button's style, run through NativeWind's OWN runtime (tests/support/nativewind.mjs), as the native Pressable
//    receives it: 52 dp tall, full width, brand red;
// 2. no component in src/ hands NativeWind a function as `style` (it would vanish the same way);
// 3. Login's scroll rule (emailFormLayout.ts), on measured layouts: once it has run, all of the button is in view and
//    above the keyboard, at least 48 dp tall. The broken button, 20 dp of label, fails that check wherever it sits.
// What still needs a phone: that Android reports these sizes (UI-STANDARDS.md §15.3, device checks).
//
// iOS (iOS-5g): ported from Android dev d8626bc, with Android's NativeWind helpers (tests/support/nativewind.mjs and
// stubs/react-native.cjs). One iOS difference: "Sign in" has a MINIMUM height of 52 pt, not a fixed one, so it grows
// with Dynamic Type (emailFormLayout.ts); at the default text size it is 52 pt, as on Android. What still needs a phone:
// UAT G20 (keyboard, AutoFill, the largest text size).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { throughNativeWind } from '../support/nativewind.mjs';
import { MIN_TOUCH, canTap, revealScrollY, submitStyle, visibleContent } from '../../src/screens/auth/emailFormLayout.ts';
import { colors, loginLayout, loginType, motion } from '../../src/theme/index.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

/** The style the native Pressable / View gets on its first render. */
const nativeStyle = (component, style) => throughNativeWind(component, { style }).style ?? {};

describe('the bug, reproduced with NativeWind itself', () => {
  test('a function as `style` reaches the native Pressable as {}: no height, no fill, no margin', () => {
    const before = ({ pressed }) => [submitStyle.button, submitStyle.face, pressed ? submitStyle.pressed : null];
    const style = nativeStyle('Pressable', before);
    assert.deepEqual(style, {});
    // What was left on screen: the label's own line, white on the white page.
    assert.equal(loginType.button.lineHeight, 20);
    assert.equal(colors.primaryForeground, colors.background);
  });

  test('no component in src/ is given a function as `style`', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) walk(file);
        else if (file.endsWith('.tsx') && /\b[sS]tyle=\{\s*(\(|function\b|async\b)/.test(readFileSync(file, 'utf8'))) {
          offenders.push(path.relative(REPO, file));
        }
      }
    };
    walk(path.join(REPO, 'src'));
    assert.deepEqual(offenders, [], 'NativeWind drops a style function: use static styles, and Pressable children for a pressed look');
  });
});

describe('"Sign in" as the phone receives it', () => {
  const { submit } = loginLayout.emailForm;

  test('the Pressable: at least 52 pt tall (iOS: it grows with the text), the full width of the form, 16 pt under the password field', () => {
    const style = nativeStyle('Pressable', [submitStyle.button, null]);
    assert.equal(style.minHeight, 52);
    assert.equal(style.minHeight, submit.height);
    assert.equal(style.height, undefined, 'no fixed height: the label never clips at the accessibility sizes');
    assert.ok(style.minHeight >= MIN_TOUCH);
    assert.equal(style.alignSelf, 'stretch');
    assert.equal(style.marginTop, 16);
    assert.equal(style.borderRadius, 26);
  });

  test('its face: brand red, filling the Pressable, the label centred; dimmed while held', () => {
    const face = nativeStyle('View', [submitStyle.face, null]);
    assert.equal(face.backgroundColor, colors.primary);
    assert.equal(face.flex, 1);
    assert.equal(face.alignItems, 'center');
    assert.equal(face.justifyContent, 'center');
    assert.equal(nativeStyle('View', [submitStyle.face, submitStyle.pressed]).opacity, motion.press.opacity);
  });

  test('while Microsoft sign-in runs: half opacity, still at least 52 pt', () => {
    const style = nativeStyle('Pressable', [submitStyle.button, submitStyle.locked]);
    assert.equal(style.opacity, 0.5);
    assert.equal(style.minHeight, 52);
  });

  test('EmailSignInForm draws exactly these styles on the Pressable labelled "Sign in", and a tap submits', () => {
    const form = read('src/screens/auth/EmailSignInForm.tsx');
    const pressable = form.match(/<Pressable\s+ref=\{submitRef\}[\s\S]*?<\/Pressable>/)?.[0] ?? '';
    assert.match(pressable, /accessibilityLabel="Sign in"/);
    assert.match(pressable, /onLayout=\{onSubmitLayout\}/);
    assert.match(pressable, /onPress=\{startSubmit\}/);
    assert.match(pressable, /style=\{\[submitStyle\.button, ssoBusy \? submitStyle\.locked : null\]\}/);
    assert.match(pressable, /\{\(\{ pressed \}\) => \(\s*<View style=\{\[submitStyle\.face, pressed \? submitStyle\.pressed : null\]\}>/);
    assert.match(form, /const startSubmit = \(\) => void run\(submit\);/);
    assert.match(form, /outcome = await attemptPasswordSignIn\(typed, password\);/);
  });
});

describe('Login keeps "Sign in" where it can be tapped', () => {
  // A 360 × 640 dp phone at 100 % text, as measureLayout reports it (UI-STANDARDS.md §15.3 has the sums): the red card
  // is 403 dp (63 % of 640), and "Sign in" starts 797 dp down the content, below the fold.
  const SUBMIT = { y: 797, height: loginLayout.emailForm.submit.height };
  const SCREEN = 640;
  const KEYBOARD_TOP = 360; // a 280 dp keyboard
  const at = (scrollY, height = SCREEN, keyboardTop = null) => ({ scrollY, height, top: 0, keyboardTop });

  /** One revealSubmit(): where Login scrolls, and the viewport after it. */
  function reveal(rect, viewport) {
    const target = revealScrollY(rect, viewport);
    return target === null ? viewport : { ...viewport, scrollY: target };
  }

  test('the form opens, keyboard down: below the fold, so Login scrolls until all of it shows, 16 dp clear', () => {
    assert.equal(canTap(SUBMIT, at(0)), false);
    const after = reveal(SUBMIT, at(0));
    assert.equal(after.scrollY, SUBMIT.y + SUBMIT.height + 16 - SCREEN);
    assert.equal(canTap(SUBMIT, after), true);
  });

  test('the keyboard opens: the button lands above it, before and after KeyboardAvoidingView shrinks the view', () => {
    const opened = reveal(SUBMIT, at(0));
    // The keyboard event comes first: the view is still 640 dp tall, the keyboard covers its lower 280.
    const keyboardFirst = reveal(SUBMIT, at(opened.scrollY, SCREEN, KEYBOARD_TOP));
    assert.equal(canTap(SUBMIT, keyboardFirst), true);
    const { to } = visibleContent(keyboardFirst);
    assert.equal(to - (SUBMIT.y + SUBMIT.height), 16, '16 dp between "Sign in" and the keyboard');
    // Then the padding lands and the view is 360 dp tall: already in view, so no second scroll (no jump).
    const padded = at(keyboardFirst.scrollY, KEYBOARD_TOP, KEYBOARD_TOP);
    assert.equal(revealScrollY(SUBMIT, padded), null);
    assert.equal(canTap(SUBMIT, padded), true);
  });

  test('an error appears above it (it moves down 22 dp): Login follows it', () => {
    const shown = reveal(SUBMIT, at(0, KEYBOARD_TOP, KEYBOARD_TOP));
    const moved = { ...SUBMIT, y: SUBMIT.y + 22 };
    assert.equal(canTap(moved, shown), false);
    assert.equal(canTap(moved, reveal(moved, shown)), true);
  });

  test('already in view: no scroll at all', () => {
    assert.equal(revealScrollY(SUBMIT, at(300)), null);
  });

  test('scrolled past it: back up, 16 dp clear of the top', () => {
    const past = at(900);
    assert.equal(canTap(SUBMIT, past), false);
    assert.equal(revealScrollY(SUBMIT, past), SUBMIT.y - 16);
  });

  test('200 % text on the smallest phone: still reaches it', () => {
    const big = { y: 1180, height: 52 };
    assert.equal(canTap(big, reveal(big, at(0, 320, 320))), true);
  });

  test('the broken button (its 20 dp label line, no height of its own) fails wherever it sits', () => {
    const broken = { y: SUBMIT.y, height: loginType.button.lineHeight };
    for (const viewport of [at(0), reveal(broken, at(0)), reveal(broken, at(0, KEYBOARD_TOP, KEYBOARD_TOP))]) {
      assert.equal(canTap(broken, viewport), false);
    }
    assert.equal(canTap({ y: 100, height: 0 }, at(0)), false);
  });

  test('LoginScreen runs the rule on every event that can move it, and on no timer', () => {
    const login = read('src/screens/auth/LoginScreen.tsx');
    assert.match(login, /submit\.current\.measureLayout\(content\.current,/);
    assert.match(login, /const target = revealScrollY\(\{ y, height \}, viewport\.current\);/);
    assert.match(login, /Keyboard\.addListener\('keyboardDidShow', \(event\) => \{\s*viewport\.current\.keyboardTop = event\.endCoordinates\.screenY;\s*revealSubmit\(\);/);
    assert.match(login, /onLayout=\{\(event\) => \{\s*viewport\.current\.height = event\.nativeEvent\.layout\.height;\s*revealSubmit\(\);/);
    assert.match(login, /onContentSizeChange=\{revealSubmit\}/);
    assert.match(login, /submitRef=\{submit\}\s*onSubmitLayout=\{revealSubmit\}/);
    assert.match(login, /<View ref=\{content\} collapsable=\{false\} style=\{styles\.content\}>/);
    assert.doesNotMatch(login, /scrollToEnd|setTimeout|setInterval/);
  });
});
