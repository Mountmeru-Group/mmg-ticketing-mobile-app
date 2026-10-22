// Confirmation dialogs and short notices for write actions (Phase 3b).
// Every irreversible write — status change, closure, assignment, ticket creation, bulk anything — asks first, in
// words that name exactly what will happen (who is emailed, what becomes public).
import { Alert, Platform, ToastAndroid } from 'react-native';

import { describeActionWriteError, describeFieldWriteError, describeWriteError, isSessionEndedError } from '@/api/errors';

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

/** Short success notice (05 §A.2 / §A.8 toasts). The app is Android-only; Alert is the fallback elsewhere. */
export function notify(message: string): void {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}

/**
 * Show a failed write. Silent on 401: the API client has already cleared the session and the app is on its way
 * to Login (02 §5.3), so a dialog would only pop up over the login screen.
 */
export function reportWriteError(title: string, error: unknown): void {
  if (isSessionEndedError(error)) return;
  Alert.alert(title, describeWriteError(error));
}

/** reportWriteError() for a G3 action: a 403 says the role can't `action` (e.g. "delete files from a ticket"). */
export function reportActionWriteError(title: string, action: string, error: unknown): void {
  if (isSessionEndedError(error)) return;
  Alert.alert(title, describeActionWriteError(action, error));
}

/** reportWriteError() for a property save on M4: a 403 names the field the role can't change (Phase G1). */
export function reportFieldWriteError(title: string, field: string, error: unknown): void {
  if (isSessionEndedError(error)) return;
  Alert.alert(title, describeFieldWriteError(field, error));
}
