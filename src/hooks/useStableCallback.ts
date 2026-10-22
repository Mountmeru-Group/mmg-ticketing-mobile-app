import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function whose identity never changes but which always calls the latest `fn` (Phase P). For handlers passed to
 * memoised list rows: a new function each render would re-render every row. Call it from events only, never during
 * render (the latest `fn` is swapped in after each commit).
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
