// The email form's "Sign in" (G9): its style, and where Login scrolls so it can be tapped (docs/brand/UI-STANDARDS.md
// §15.3). No React Native at run time, so tests/login/sign-in-button.test.mjs runs THIS style through NativeWind's own
// runtime and THIS scroll rule against measured layouts.
//
// WHY THE BUTTON WAS INVISIBLE ON UAT (found 2026-11-05):
// - Its Pressable took a function as `style`: `({ pressed }) => [...]`.
// - NativeWind wraps every Pressable (babel.config.js `jsxImportSource: 'nativewind'`) and merges `style` as data. A
//   function has no own keys, so it came out as `{}` (react-native-css-interop, native-interop.js applyRules,
//   `{ ...declaration }`).
// - The button lost its 52 dp height, its red fill, its radius and its top margin. What was left was a 20 dp line of
//   WHITE "Sign in" on the WHITE page: laid out and tappable in a thin strip, but invisible. The tests only read source.
// So in this app `style` is never a function (tested across src/). A pressed look goes on an inner view, through the
// Pressable's children function, which NativeWind passes through untouched.
//
// iOS (iOS-5g): the same static styles, with one change for Dynamic Type: the button and its face have a MINIMUM height
// (52 pt), not a fixed one, so the label never clips at the accessibility text sizes; at the default size it is 52 pt,
// as on Android. The scroll rule is Android's.
import type { ViewStyle } from 'react-native';

import { colors, loginLayout, motion } from '@/theme';

const { submit, reveal } = loginLayout.emailForm;

/** The smallest touch target the app allows (UI-STANDARDS.md §3.4). */
export const MIN_TOUCH = 48;

/** "Sign in": the Pressable carries the size, the inner face the colour. Every style is static (see above). */
export const submitStyle = {
  /** The touch target: at least 52 pt tall (iOS: grows with the text), the form's full width, 16 pt under the last field. */
  button: { minHeight: submit.height, marginTop: submit.gap, alignSelf: 'stretch', borderRadius: submit.radius },
  /** While Microsoft sign-in runs (the button is disabled too). */
  locked: { opacity: 0.5 },
  /** What is seen: brand red, filling the button, the spinner and label centred. */
  face: {
    flex: 1,
    minHeight: submit.height,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: submit.radius,
    backgroundColor: colors.primary,
  },
  /** Held: the app's press opacity. */
  pressed: { opacity: motion.press.opacity },
} satisfies Record<string, ViewStyle>;

/** A view's place in the scroll content (measureLayout against the content view), in dp. */
export interface ContentRect {
  y: number;
  height: number;
}

/** Login's scroll view as it stands, in dp. */
export interface ScrollViewport {
  /** How far the content is scrolled. */
  scrollY: number;
  /** The scroll view's height. KeyboardAvoidingView (`padding`) shrinks it while the keyboard is up. */
  height: number;
  /** The scroll view's top in the window. Login has no header, so 0. */
  top: number;
  /** The keyboard's top edge in the window (`endCoordinates.screenY`), or null while it is down. */
  keyboardTop: number | null;
}

/**
 * The stretch of content a person can see and touch: from the scroll view's top to its bottom or the keyboard's top,
 * whichever is higher. The keyboard is counted even though KeyboardAvoidingView already shrinks the view for it, so the
 * answer is right whether or not that padding has been applied yet (the keyboard event arrives before the re-layout).
 */
export function visibleContent(v: ScrollViewport): { from: number; to: number } {
  const bottom = Math.min(v.top + v.height, v.keyboardTop ?? Number.POSITIVE_INFINITY);
  return { from: v.scrollY, to: v.scrollY + Math.max(0, bottom - v.top) };
}

/** True when a person can see and tap the whole of `rect`: at least 48 dp tall, and all of it in view. */
export function canTap(rect: ContentRect, v: ScrollViewport): boolean {
  const { from, to } = visibleContent(v);
  return rect.height >= MIN_TOUCH && rect.y >= from && rect.y + rect.height <= to;
}

/**
 * Where to scroll so all of `rect` shows, `margin` dp clear of the edge it was hidden behind (the keyboard, or the
 * screen's foot or top), or null when it already shows in full.
 */
export function revealScrollY(rect: ContentRect, v: ScrollViewport, margin: number = reveal): number | null {
  const { from, to } = visibleContent(v);
  const bottom = rect.y + rect.height;
  if (rect.y >= from && bottom <= to) return null;
  if (bottom > to) return Math.max(0, bottom + margin - (to - from));
  return Math.max(0, rect.y - margin);
}
