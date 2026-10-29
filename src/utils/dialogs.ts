// Confirmation dialogs and short notices for write actions (Phase 3b).
// Every irreversible write — status change, closure, assignment, ticket creation, bulk anything — asks first, in
// words that name exactly what will happen (who is emailed, what becomes public).
// iOS (docs/ios/00-PORT-MANIFEST.md §3.14): the confirmations stay Alerts, the right iOS control for them, with the
// destructive button in red. A success notice is the non-modal SuccessNotice (utils/successNotice.ts), not a toast.
import { Alert } from 'react-native';

import { describeActionWriteError, describeFieldWriteError, describeWriteError, isSessionEndedError } from '@/api/errors';
import { hapticOutcome } from './haptics';
import { showSuccessNotice } from './successNotice';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Red confirm button (close, cancel, bulk). */
  destructive?: boolean;
}

/** Resolves true only when the person taps the confirm button. Back / outside tap = false. */
export function confirmAction({ title, message, confirmLabel, destructive = false }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Short success notice (05 §A.2 / §A.8 toasts): on iOS, the SuccessNotice at the top, read out by VoiceOver, with the
 * success haptic (iOS-4, utils/haptics.ts).
 */
export function notify(message: string): void {
  showSuccessNotice(message);
  hapticOutcome('success');
}

/**
 * iOS-4: the same non-modal notice for something that went only partly right (a side step failed, the main action did
 * not), with an amber mark instead of the tick and the warning haptic. Never for a write that failed outright: that is
 * reportWriteError().
 */
export function notifyWarning(message: string): void {
  showSuccessNotice(message, 'warning');
  hapticOutcome('warning');
}

/**
 * Show a failed write, with the error haptic (iOS-4). Silent on 401: the API client has already cleared the session and
 * the app is on its way to Login (02 §5.3), so a dialog would only pop up over the login screen.
 */
export function reportWriteError(title: string, error: unknown): void {
  if (isSessionEndedError(error)) return;
  hapticOutcome('error');
  Alert.alert(title, describeWriteError(error));
}

/** reportWriteError() for a G3 action: a 403 says the role can't `action` (e.g. "delete files from a ticket"). */
export function reportActionWriteError(title: string, action: string, error: unknown): void {
  if (isSessionEndedError(error)) return;
  hapticOutcome('error');
  Alert.alert(title, describeActionWriteError(action, error));
}

/** reportWriteError() for a property save on M4: a 403 names the field the role can't change (Phase G1). */
export function reportFieldWriteError(title: string, field: string, error: unknown): void {
  if (isSessionEndedError(error)) return;
  hapticOutcome('error');
  Alert.alert(title, describeFieldWriteError(field, error));
}
