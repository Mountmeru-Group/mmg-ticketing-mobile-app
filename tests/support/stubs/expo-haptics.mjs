// In-memory stand-in for expo-haptics (2026-11-03). Records every call; tests inspect them through the `__` exports.
// Only the names src/utils/haptics.ts may use are real functions here. The Vibrator-based calls exist so that a use of
// one is recorded (and fails tests/polish/haptics.test.mjs) instead of crashing the import.
export const AndroidHaptics = {
  Confirm: 'confirm',
  Reject: 'reject',
  Long_Press: 'long-press',
  Virtual_Key: 'virtual-key',
  Context_Click: 'context-click',
  Clock_Tick: 'clock-tick',
};

const calls = [];
/** Effects this "phone" lacks, as expo-haptics rejects CONFIRM and REJECT below Android 11 (API 30). */
let unsupported = new Set();

export async function performAndroidHapticsAsync(type) {
  calls.push(['performAndroidHapticsAsync', type]);
  if (unsupported.has(type)) throw new Error(`Haptic type ${type} is not supported (test)`);
}

export async function impactAsync(style) {
  calls.push(['impactAsync', style]);
}

export async function notificationAsync(type) {
  calls.push(['notificationAsync', type]);
}

export async function selectionAsync() {
  calls.push(['selectionAsync']);
}

export function __calls() {
  return calls.slice();
}

/** Clears the record; `missing` = the effects this phone lacks. */
export function __reset(missing = []) {
  calls.length = 0;
  unsupported = new Set(missing);
}
