// The native splash (expo-splash-screen; image, size and background are in app.json). It stays up from launch until
// the first screen can draw, so nothing blank or half-loaded shows between the splash and the app:
// - RootNavigator hides it once the stored session has been read and navigation is ready.
// - The crash screen (ErrorBoundary) hides it too, so a start-up crash is never stuck behind the splash.
// Imported first in App.tsx: preventAutoHideAsync() must run before the first render.
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

let hidden = false;

/** Hides the native splash. Safe to call more than once and from several places. */
export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  SplashScreen.hideAsync().catch(() => undefined);
}
