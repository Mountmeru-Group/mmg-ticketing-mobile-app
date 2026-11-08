// In-memory stand-in for the parts of React Native the Node tests load:
// - AccessibilityInfo's reduce-motion API, which src/hooks/useReduceMotion.ts reads. On an iPhone,
//   isReduceMotionEnabled() answers Settings › Accessibility › Motion › Reduce Motion, and 'reduceMotionChanged' fires
//   when the person flips it (Android: "Remove animations").
// - Platform.OS, which src/config/auth.config.ts reads to pick the Microsoft redirect. 'ios', as on the phone.
// - iOS-3b: AccessibilityInfo's announcements (VoiceOver reading out a success notice, utils/successNotice.ts),
//   ActionSheetIOS (utils/actionSheet.ts) and Alert (utils/dialogs.ts). Each records what the app asked for, and the
//   test answers as the person would: __pickActionSheet(index), __pressAlertButton(text).
// - R1: TurboModuleRegistry, for the one native module the app reaches by name: React Native's Networking, whose
//   clearCookies(callback) empties iOS's cookie store (src/api/cookieShield.ts). The stand-in counts each call and
//   answers as the device would; a test can swap in a missing, throwing or silent module (__setNetworking).
// The test sets what the device says with the __ functions. Any other React Native import fails at load, on purpose:
// a module that needs more of React Native is not a pure module and is checked by reading its source instead.
const listeners = new Set();
let reduceMotion = false;
// iOS-5f: VoiceOver (hooks/useScreenReader.ts): isScreenReaderEnabled() and 'screenReaderChanged'.
const screenReaderListeners = new Set();
let screenReader = false;

export const Platform = { OS: 'ios' };

// iOS-4: the window and the person's text size (hooks/useTextSize.ts). fontScale is 1 at the default text size and
// 3.571 at the largest accessibility size, as React Native reports it on an iPhone.
let fontScale = 1;

export function useWindowDimensions() {
  return { width: 390, height: 844, scale: 3, fontScale };
}

/** The person's text size, as React Native's fontScale. */
export function __setFontScale(value) {
  fontScale = value;
}

/** Pretend to be another platform (only to prove the app refuses it); set it back to 'ios' afterwards. */
export function __setPlatformOS(os) {
  Platform.OS = os;
}

const announcements = [];

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(reduceMotion),
  isScreenReaderEnabled: () => Promise.resolve(screenReader),
  addEventListener(event, handler) {
    const set = event === 'reduceMotionChanged' ? listeners : event === 'screenReaderChanged' ? screenReaderListeners : null;
    set?.add(handler);
    return { remove: () => set?.delete(handler) };
  },
  announceForAccessibility(announcement) {
    announcements.push({ announcement, options: undefined });
  },
  announceForAccessibilityWithOptions(announcement, options) {
    announcements.push({ announcement, options });
  },
};

/** What the setting is before the app first asks. */
export function __setReduceMotion(value) {
  reduceMotion = value;
}

/** The person flips the setting while the app runs. */
export function __changeReduceMotion(value) {
  reduceMotion = value;
  for (const listener of listeners) listener(value);
}

/** VoiceOver turned on or off while the app runs (iOS-5f). */
export function __changeScreenReader(value) {
  screenReader = value;
  for (const listener of screenReaderListeners) listener(value);
}

/** Everything VoiceOver was asked to say, oldest first, with its options. */
export function __announcements() {
  return announcements.slice();
}

// ── ActionSheetIOS ───────────────────────────────────────────

let sheet = null;

export const ActionSheetIOS = {
  showActionSheetWithOptions(options, callback) {
    if (sheet) throw new Error('An action sheet is already on screen');
    sheet = { options, callback };
  },
};

/** The action sheet on screen (its options as the app passed them), or null. */
export function __actionSheet() {
  return sheet ? sheet.options : null;
}

/** The person taps button `index` (the Cancel button included); the sheet closes. */
export function __pickActionSheet(index) {
  if (!sheet) throw new Error('No action sheet is on screen');
  const { callback } = sheet;
  sheet = null;
  callback(index);
}

// ── Alert ────────────────────────────────────────────────────

let alerts = [];

export const Alert = {
  alert(title, message, buttons, options) {
    alerts.push({ title, message, buttons: buttons ?? [{ text: 'OK' }], options });
  },
};

/** Every Alert shown and not yet answered, oldest first. */
export function __alerts() {
  return alerts.slice();
}

/** The person taps the button labelled `text` on the newest Alert; that Alert closes. */
export function __pressAlertButton(text) {
  const alert = alerts.at(-1);
  if (!alert) throw new Error('No Alert is on screen');
  const button = alert.buttons.find((b) => b.text === text);
  if (!button) throw new Error(`The Alert has no "${text}" button`);
  alerts = alerts.slice(0, -1);
  button.onPress?.();
}

/** Forget every Alert (between tests). */
export function __clearAlerts() {
  alerts = [];
}

// ── TurboModuleRegistry: React Native's Networking module (R1) ──

let cookieClears = 0;
let jarHoldsCookies = false;
let onCookieClear = null;

/** As on the phone (RCTNetworking.mm clearCookies): empties the store, answers true when it held cookies. */
const deviceNetworking = {
  clearCookies(callback) {
    cookieClears += 1;
    onCookieClear?.();
    const held = jarHoldsCookies;
    jarHoldsCookies = false;
    callback(held);
  },
};
let networking = deviceNetworking;

export const TurboModuleRegistry = {
  get(name) {
    return name === 'Networking' ? networking : null;
  },
};

/** How many times clearCookies was called since the last __resetNetworking(). */
export function __cookieClears() {
  return cookieClears;
}

/** Puts a cookie in the store, as a Set-Cookie on an answer would: the next clearCookies answers true. */
export function __putCookieInStore() {
  jarHoldsCookies = true;
}

/** Runs `fn` inside each clearCookies call, at the moment the app calls it (to see what has happened so far). */
export function __onCookieClear(fn) {
  onCookieClear = fn;
}

/** Replaces the Networking module: null (missing), or an object with its own clearCookies (throwing, silent…). */
export function __setNetworking(module) {
  networking = module;
}

/** Back to the device's module, an empty store, no hook and a count of 0. */
export function __resetNetworking() {
  networking = deviceNetworking;
  cookieClears = 0;
  jarHoldsCookies = false;
  onCookieClear = null;
}
