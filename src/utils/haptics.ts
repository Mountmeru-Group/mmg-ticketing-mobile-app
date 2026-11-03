// Haptic feedback (2026-11-03, docs/brand/UI-STANDARDS.md §14): three events, each one short system effect.
//   success  a status change, an assignment or a form submitted                   → Android CONFIRM
//   error    a save that failed (every write error the app reports)               → Android REJECT
//   select   a long-press that selects a ticket on the list                       → Android LONG_PRESS
//
// THE OS SETTING. Only expo-haptics' performAndroidHapticsAsync is used. It calls View.performHapticFeedback() without
// FLAG_IGNORE_GLOBAL_SETTING (expo-haptics HapticsModule.kt), so Android itself drops it when the person has turned
// touch feedback / "Vibration & haptics" off. expo-haptics' other calls (impactAsync, notificationAsync,
// selectionAsync) drive the Vibrator directly, which that setting does not govern, so the app never uses them; nor
// React Native's Vibration. These calls need no VIBRATE permission; the one expo-haptics declares is kept all the same
// (Ronit, 2026-11-03; UI-STANDARDS.md §14.5). It is a normal install-time permission: no prompt.
//
// Android 10 and older have no CONFIRM or REJECT (API 30): expo-haptics rejects them, and the event falls back to an
// effect every Android version has. Fire and forget: nothing waits for a haptic, and a phone without one is silent.
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

export type HapticEvent = 'success' | 'error' | 'select';

/** Each event's effect, and the one used where the phone's Android lacks it. */
export const HAPTIC_EFFECTS: Record<HapticEvent, { effect: AndroidHaptics; fallback: AndroidHaptics | null }> = {
  success: { effect: AndroidHaptics.Confirm, fallback: AndroidHaptics.Virtual_Key },
  error: { effect: AndroidHaptics.Reject, fallback: AndroidHaptics.Long_Press },
  select: { effect: AndroidHaptics.Long_Press, fallback: null },
};

export function haptic(event: HapticEvent): void {
  const { effect, fallback } = HAPTIC_EFFECTS[event];
  void performAndroidHapticsAsync(effect)
    .catch(() => (fallback ? performAndroidHapticsAsync(fallback) : undefined))
    .catch(() => undefined);
}
