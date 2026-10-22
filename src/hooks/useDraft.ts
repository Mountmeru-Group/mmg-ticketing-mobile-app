// A form's local draft (utils/drafts.ts, 02 §5.4): read once when the form opens, saved (debounced) on every change
// after that, cleared when the form is sent or discarded.
// - `key` must contain the user's id (`reply:<userId>:<ticketId>`, `create:<userId>`); null = drafts off.
// - `current` must be a memoised object (useMemo over the fields), so a save is scheduled per change, not per render.
// - `isEmpty` decides when the saved file is removed instead (an emptied form leaves nothing behind).
// The form applies `restored` to its state in an effect, once; `discard()` is for the guard's Discard and for "Discard draft".
import { useCallback, useEffect, useRef, useState } from 'react';

import { clearDraft, readDraft, writeDraft } from '@/utils/drafts';

const SAVE_DELAY_MS = 600;

export function useDraft<T extends object>(key: string | null, current: T, isEmpty: (value: T) => boolean) {
  const [restored, setRestored] = useState<T | null>(null);
  const [ready, setReady] = useState(key === null);
  // The first change after the restore is the restore itself being applied: nothing to save yet.
  const skipNext = useRef(true);
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setReady(false);
    void readDraft<T>(key).then((value) => {
      if (cancelled) return;
      setRestored(value && !isEmptyRef.current(value) ? value : null);
      skipNext.current = true;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!key || !ready) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void (isEmptyRef.current(current) ? clearDraft(key) : writeDraft(key, current));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, ready, current]);

  const discard = useCallback(() => {
    if (key) void clearDraft(key);
    setRestored(null);
  }, [key]);

  return { restored, ready, discard };
}
