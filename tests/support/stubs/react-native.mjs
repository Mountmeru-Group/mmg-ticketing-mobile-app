// In-memory stand-in for the one part of React Native the Node tests load: AccessibilityInfo's reduce-motion API, which
// src/hooks/useReduceMotion.ts reads. On an iPhone, isReduceMotionEnabled() answers Settings › Accessibility › Motion ›
// Reduce Motion, and 'reduceMotionChanged' fires when the person flips it (Android: "Remove animations").
// The test sets what the device says with the two __ functions. Any other React Native import fails at load, on purpose:
// a module that needs more of React Native is not a pure module and is checked by reading its source instead.
const listeners = new Set();
let reduceMotion = false;

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(reduceMotion),
  addEventListener(event, handler) {
    if (event === 'reduceMotionChanged') listeners.add(handler);
    return { remove: () => listeners.delete(handler) };
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
