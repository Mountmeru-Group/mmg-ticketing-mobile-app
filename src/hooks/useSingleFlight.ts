// One write handler at a time per screen. A button's `disabled` only applies after React re-renders, so a fast
// double-tap could otherwise fire two creates or two replies — or stack two confirmation dialogs.
import { useCallback, useRef } from 'react';

export function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(async (handler: () => Promise<void>) => {
    if (busy.current) return; // a write (or its confirmation) is already in progress
    busy.current = true;
    try {
      await handler();
    } finally {
      busy.current = false;
    }
  }, []);
}
