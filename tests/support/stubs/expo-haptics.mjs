// In-memory stand-in for expo-haptics (iOS-4, src/utils/haptics.ts). It plays nothing; it records each haptic the app
// asked for, in order, so a test can check which outcome was felt: __haptics() → ['success', 'selection', …].
export const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' };

let played = [];

export function notificationAsync(type = NotificationFeedbackType.Success) {
  played.push(type);
  return Promise.resolve();
}

export function selectionAsync() {
  played.push('selection');
  return Promise.resolve();
}

/** Every haptic asked for since the last __clearHaptics(), oldest first. */
export function __haptics() {
  return played.slice();
}

export function __clearHaptics() {
  played = [];
}
