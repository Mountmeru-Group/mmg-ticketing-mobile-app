// The native splash (expo-splash-screen; image, size and background are in app.json). It stays up from launch until
// the first screen can draw, so nothing blank or half-loaded shows between the splash and the app:
// - RootNavigator hides it once the stored session has been read and navigation is ready.
// - The crash screen (ErrorBoundary) hides it too, so a start-up crash is never stuck behind the splash.
// Imported first in App.tsx: preventAutoHideAsync() must run before the first render.
//
// Since 2026-10-30 the start-up intro (./SplashIntro.tsx) can take over earlier: the native splash shows the intro's
// first frame (the raised drop), and is hidden as soon as the intro can draw that same frame. Who hides it, and when,
// is ./splashSequence.ts. Without the intro ("Remove animations" on, or it could not draw in time), the rule above is
// unchanged.
import * as SplashScreen from 'expo-splash-screen';

import { motion } from '@/theme';
import { createSplashSequence } from './splashSequence';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
// On Android the native splash always fades out as it hides (400 ms by default; `fade` is iOS only). It fades over the
// intro's first frame, the same picture, so it only needs to be short.
SplashScreen.setOptions({ duration: motion.intro.nativeFade });

let hidden = false;

function hideNativeSplash(): void {
  if (hidden) return;
  hidden = true;
  SplashScreen.hideAsync().catch(() => undefined);
}

/** The one start-up sequence: ./SplashIntro.tsx renders it. */
export const splashSequence = createSplashSequence({
  hideNativeSplash,
  setTimer: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
  paintWait: motion.intro.paintWait,
});

/**
 * The first screen (or the crash screen) is ready: hides the native splash, or lets the intro hand over to that screen
 * once it has finished. Safe to call more than once and from several places.
 */
export function hideSplash(): void {
  splashSequence.firstScreenReady();
}
