// R1, the cookie shield (iOS, 2026-11-08): no server cookie, `sd_session` or any other, lives in the app's cookie store.
// Auth is the Bearer header only (client.ts); the app needs no cookie from anyone, so the whole store is emptied.
// Why, when `withCredentials: false` already keeps React Native from SENDING the store's cookies (RCTNetworking.mm:319):
// - Whether iOS still STORES a Set-Cookie from an answer is iOS's behaviour, not provable from source, and the backend
//   team has not yet said whether POST /auth/mobile/login sends one (ask A32; 02-AUTH.md §iOS-B).
// - Other code reads the same store with cookies ON: expo-file-system's downloads (ATT-4: URLSession .default and
//   .shared) and, it may be, expo-image (ATT-3). A cookie left there would ride on them, and after a sign-out into the
//   next person's session; the server reads `sd_session` before the Bearer header (02 §2 #5).
// The store (NSHTTPCookieStorage.sharedHTTPCookieStorage) is emptied:
// - right after each sign-in answer, success or error, before the session is stored: email (passwordSignIn.api.ts)
//   and Microsoft (AUTH-P2, auth.api.ts);
// - once at every cold start, before the first API call (RootNavigator.tsx);
// - at every sign-out: by the person (after AUTH-3), the 15-day re-authentication, the 8-hour expiry, a 401
//   (endSession(), client.ts).
// Microsoft's sign-in page is not in this store: the sheet is ephemeral and keeps its own (auth.config.ts).
// Never throws and never blocks: an error is one `[auth]` line, and a native answer that never comes is given up after
// CLEAR_COOKIES_WAIT_MS. iOS only: on any other platform it returns at once and touches nothing.
import { Platform, TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * React Native's own Networking module: the one method used here (RN 0.86.3, Libraries/Network/RCTNetworking.mm:850,
 * spec NativeNetworkingIOS.js:31). Reached by name, as NativeNetworkingIOS.js does, because the `Networking` export is
 * missing from the TypeScript types this project compiles against. The callback's `true`: the store held cookies and
 * they were all deleted; `false`: it was already empty. It never names a cookie.
 */
interface NetworkingModule extends TurboModule {
  clearCookies(callback: (result: boolean) => void): void;
}

/** Where the shield runs; named in its log line. */
export type CookieShieldPoint = 'launch' | 'email-sign-in' | 'microsoft-sign-in' | 'sign-out';

/** How long to wait for the native answer before going on without it. It normally comes back at once. */
export const CLEAR_COOKIES_WAIT_MS = 2_000;

/** The error's class name only. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * Empties iOS's cookie store. Resolves when it is done, when it failed, or after `waitMs`, whichever comes first; never
 * rejects. Logs `[auth]` lines with the point only: never a cookie, a token or anything about the person.
 */
export async function clearCookieStore(point: CookieShieldPoint, waitMs: number = CLEAR_COOKIES_WAIT_MS): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const at = `[auth] cookie shield (${point})`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const networking = TurboModuleRegistry.get<NetworkingModule>('Networking');
    if (!networking || typeof networking.clearCookies !== 'function') {
      console.warn(`${at}: React Native's Networking module is not available; nothing was cleared`);
      return;
    }
    const held = await new Promise<boolean | null>((resolve) => {
      timer = setTimeout(() => resolve(null), waitMs);
      networking.clearCookies((result) => resolve(result === true));
    });
    if (held === null) console.warn(`${at}: clearCookies gave no answer within ${waitMs} ms; going on`);
    else if (held) console.debug(`${at}: the cookie store held cookies; all deleted`);
  } catch (e) {
    console.warn(`${at}: clearCookies failed (${errorName(e)}); going on`);
  } finally {
    clearTimeout(timer);
  }
}
