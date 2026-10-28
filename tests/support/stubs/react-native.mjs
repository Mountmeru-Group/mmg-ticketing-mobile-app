// In-memory stand-in for the parts of React Native the Node tests load:
// - AccessibilityInfo's reduce-motion API, which src/hooks/useReduceMotion.ts reads. On an iPhone,
//   isReduceMotionEnabled() answers Settings › Accessibility › Motion › Reduce Motion, and 'reduceMotionChanged' fires
//   when the person flips it (Android: "Remove animations").
// - Platform.OS, which src/config/auth.config.ts reads to pick the Microsoft redirect. 'ios', as on the phone.
// - iOS-3b: AccessibilityInfo's announcements (VoiceOver reading out a success notice, utils/successNotice.ts),
//   ActionSheetIOS (utils/actionSheet.ts) and Alert (utils/dialogs.ts). Each records what the app asked for, and the
//   test answers as the person would: __pickActionSheet(index), __pressAlertButton(text).
// The test sets what the device says with the __ functions. Any other React Native import fails at load, on purpose:
// a module that needs more of React Native is not a pure module and is checked by reading its source instead.
const listeners = new Set();
let reduceMotion = false;

export const Platform = { OS: 'ios' };

/** Pretend to be another platform (only to prove the app refuses it); set it back to 'ios' afterwards. */
export function __setPlatformOS(os) {
  Platform.OS = os;
}

const announcements = [];

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(reduceMotion),
  addEventListener(event, handler) {
    if (event === 'reduceMotionChanged') listeners.add(handler);
    return { remove: () => listeners.delete(handler) };
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
