// The success notice that replaces Android's toast (docs/ios/00-PORT-MANIFEST.md §7): a short, non-modal line at the
// top of the screen after a write succeeds ("Reply sent", "Status updated"). iOS has no toast, and a modal Alert for
// every success is what the HIG asks apps to avoid. components/SuccessNotice.tsx draws it; VoiceOver reads it out from
// here, queued behind whatever it is saying, so it is heard even while a sheet closes.
// The name avoids components/Form.tsx's Notice, the inline info box. No component in this file, so utils/dialogs.ts
// and the Node tests load it as it is.
import { AccessibilityInfo } from 'react-native';

/** `warning` (iOS-4): a write that finished only in part, or a side step that failed; an amber mark instead of the tick. */
export type NoticeTone = 'success' | 'warning';

export interface SuccessNoticeMessage {
  /** Changes with every notice, so the same words twice in a row still show (and time out) again. */
  id: number;
  message: string;
  tone: NoticeTone;
}

type Listener = (notice: SuccessNoticeMessage) => void;

const listeners = new Set<Listener>();
let lastId = 0;

/** Show a success notice: drawn by every mounted SuccessNoticeHost, and announced to VoiceOver. */
export function showSuccessNotice(message: string, tone: NoticeTone = 'success'): void {
  lastId += 1;
  const notice = { id: lastId, message, tone };
  for (const listener of listeners) listener(notice);
  AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
}

/** For SuccessNoticeHost: called with each new notice. Returns the unsubscribe function. */
export function subscribeToSuccessNotices(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
