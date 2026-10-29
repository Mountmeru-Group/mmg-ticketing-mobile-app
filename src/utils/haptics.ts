// Haptics (iOS-4), over expo-haptics. HIG, Playing haptics: "Use system-provided haptic patterns according to their
// documented meanings" and "Avoid overusing haptics". So there are four, each with one meaning, and nothing else in the
// app plays one:
// - success: a write the person asked for has finished (every notify(), an approval decision, the deletion request);
// - warning: it finished only in part (files that failed after a ticket was created, a bulk run with failures or
//   skips, a mark-read that failed while the notification still opened);
// - error:   a write failed (every reportWriteError*());
// - selection: a filter chip, a segmented tab or a selected ticket changed.
// iOS plays them only when Settings › Sounds & Haptics › System Haptics is on (HIG: "Make haptics optional"). A haptic
// is decoration: it is never awaited, and a failure to play one is ignored.
import * as Haptics from 'expo-haptics';

export type HapticOutcome = 'success' | 'warning' | 'error';

const NOTIFICATION: Record<HapticOutcome, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

/** The outcome of a write: success, warning (partial) or error. */
export function hapticOutcome(outcome: HapticOutcome): void {
  Haptics.notificationAsync(NOTIFICATION[outcome]).catch(() => undefined);
}

/**
 * A finished bulk run's haptic: success when every ticket went through, error when none did and at least one failed,
 * warning otherwise (some skipped, failed or not sent after a Stop).
 */
export function bulkOutcomeHaptic(outcomes: readonly { state: 'done' | 'failed' | 'skipped' | 'not-run' }[]): HapticOutcome {
  const done = outcomes.filter((o) => o.state === 'done').length;
  if (done === outcomes.length) return 'success';
  if (done === 0 && outcomes.some((o) => o.state === 'failed')) return 'error';
  return 'warning';
}

/** A selection changed: a filter chip, a segmented tab, a ticket added to or taken out of a selection. */
export function hapticSelection(): void {
  Haptics.selectionAsync().catch(() => undefined);
}
