// Push registration (G7): this phone's FCM token on the Service Desk, from sign-in to sign-out.
// The backend half (01 NTF-5, NTF-6) is confirmed in writing by the backend team (2026-11-05). A server without it
// answers 404, and everything here stays silent: no banner, no dialog, no error state. The Alerts screen's notice says
// what state push is in (utils/push.ts pushNotice), and a `[push]` line goes to the log for us.
// What the phone needs: the Firebase project's google-services.json in the build (docs/RELEASE.md §2b). Without it
// Firebase gives no token and push is `unavailable`; with it, and the permission granted, NTF-5 runs and push is `on`.
//
// When each step runs (src/push/PushBridge.tsx wires the events; nothing here polls):
//   sign-in or a restored session  → syncPushRegistration(): channel, permission (never asked here), token, NTF-5
//   Alerts opened                  → requestPushOnAlertsOpen(): the ONE place the permission dialog appears by itself,
//                                    and only while Android has never been asked (status `undetermined`)
//   "Turn on notifications" button → syncPushRegistration({ prompt: 'button' })
//   back from Settings             → syncPushRegistration() again, while push is off
//   Firebase rotates the token     → onPushTokenRotated(): NTF-5 with the new token
//   explicit sign-out              → unregisterPushForSignOut() (hooks/useProfile.ts), BEFORE AUTH-3: NTF-6
//   any sign-out (401, 8 h, 15 d)  → forgetPushOnSessionEnd(): Firebase deletes this phone's token, so the old one can
//                                    never deliver another person's alerts here, even if NTF-6 never reached the server
//
// Logs: `[push] <what happened>` via console.info (Metro and logcat, never on screen). Never a token, never a body.
import { registerDeviceToken, unregisterDeviceToken } from '@/api/notifications.api';
import { useAuthStore } from '@/store/auth.store';
import { usePushStore } from '@/store/push.store';
import { deviceTokenFailure, type PushPermission } from '@/utils/push';

/** What registration needs from the phone. The real one is src/push/platform.ts (expo-notifications); tests use a fake. */
export interface PushPlatform {
  /** False in Expo Go and off Android: there is no push token to get. */
  available: boolean;
  /** Create (or update) the `setu_tickets` channel. Creating a channel never shows the permission dialog (target SDK 33+). */
  ensureChannel: () => Promise<void>;
  getPermission: () => Promise<PushPermission>;
  /** Shows Android's dialog when Android still allows it; otherwise resolves with the current answer. */
  requestPermission: () => Promise<PushPermission>;
  /** The native FCM registration token. Rejects without Firebase configuration or Google Play services. */
  getToken: () => Promise<string>;
  /** FirebaseMessaging.deleteToken(): the current token stops working; the next getToken() returns a new one. */
  deleteLocalToken: () => Promise<void>;
  /** Firebase issued a new token. Returns the unsubscribe function. */
  onTokenChange: (listener: (token: string) => void) => () => void;
}

let platform: PushPlatform | null = null;

/** PushBridge installs the real platform once, at start-up. */
export function installPushPlatform(next: PushPlatform | null): void {
  platform = next;
}

/** For us, not for them: Metro and logcat only. Callers pass fixed text and status codes, never a token or a body. */
export function pushLog(message: string): void {
  console.info(`[push] ${message}`);
}

/** How long sign-out waits for NTF-6 before going on to AUTH-3 (which then gets its own 5 s, useSignOut). */
export const UNREGISTER_WAIT_MS = 3_000;

/**
 * - `never`       read the permission, don't ask (sign-in, restore, back from Settings, token rotation)
 * - `first-time`  ask only if Android has never been asked (the first visit to Alerts)
 * - `button`      ask whenever Android still allows the dialog (the person tapped "Turn on notifications")
 */
export type PushPrompt = 'never' | 'first-time' | 'button';

let running: Promise<void> | null = null;

/**
 * Bring this phone's registration up to date. Never throws and never shows anything but Android's own permission dialog
 * (and that only for `first-time` / `button`); the outcome is the push store's status. One run at a time: a call made
 * while another runs waits for it, then runs only if it can still change something.
 */
export function syncPushRegistration({ prompt = 'never' }: { prompt?: PushPrompt } = {}): Promise<void> {
  if (running) {
    return running.then(() => {
      const { status } = usePushStore.getState();
      const worthAnotherRun = prompt !== 'never' && (status === 'not-asked' || status === 'denied' || status === 'checking');
      return worthAnotherRun ? syncPushRegistration({ prompt }) : undefined;
    });
  }
  running = run(prompt).finally(() => {
    running = null;
  });
  return running;
}

async function run(prompt: PushPrompt): Promise<void> {
  const store = usePushStore.getState();
  const p = platform;
  if (!p || !p.available) {
    store.setStatus('unavailable');
    return;
  }
  if (!useAuthStore.getState().isAuthenticated) return;

  try {
    await p.ensureChannel();
  } catch {
    pushLog('channel: could not be created');
  }

  let permission: PushPermission;
  try {
    permission = await p.getPermission();
    const mayAsk =
      (prompt === 'first-time' && permission.status === 'undetermined') ||
      (prompt === 'button' && permission.status !== 'granted' && permission.canAskAgain);
    if (mayAsk) permission = await p.requestPermission();
  } catch {
    pushLog('permission: could not be read');
    store.setStatus('unavailable');
    return;
  }
  if (permission.status !== 'granted') {
    // A refusal changes nothing else: the Alerts list, the badge and pull-to-refresh work as before.
    store.setStatus(permission.status === 'denied' ? 'denied' : 'not-asked', permission.canAskAgain);
    pushLog(`permission: ${permission.status}`);
    return;
  }

  let token: string;
  try {
    token = await p.getToken();
  } catch {
    pushLog('token: Firebase gave none (no google-services.json in this build, or no Google Play services)');
    store.setStatus('unavailable', permission.canAskAgain);
    return;
  }
  store.setToken(token);
  await registerToken(token);
}

/** NTF-5 for the signed-in person. Silent on every failure; a 404 is "not deployed yet". */
async function registerToken(token: string): Promise<void> {
  if (!useAuthStore.getState().isAuthenticated) return;
  try {
    await registerDeviceToken(token);
    usePushStore.getState().setStatus('on');
    pushLog('register: ok');
  } catch (error) {
    const failure = deviceTokenFailure(error);
    if (failure === 'session-ended') return; // the 401 handler has already ended the session
    usePushStore.getState().setStatus(failure);
    pushLog(failure === 'not-deployed' ? 'register: 404, NTF-5 not deployed yet' : `register: failed (${statusOf(error)})`);
  }
}

/** Firebase rotated the token: register the new one, if this phone was registering at all (permission granted). */
export async function onPushTokenRotated(token: string): Promise<void> {
  usePushStore.getState().setToken(token);
  const { status } = usePushStore.getState();
  if (status !== 'on' && status !== 'not-deployed' && status !== 'failed') return;
  pushLog('token: rotated');
  await registerToken(token);
}

/** The first visit to Alerts asks for the permission, once, if Android never has (see the table at the top). */
export function requestPushOnAlertsOpen(): Promise<void> {
  const { status } = usePushStore.getState();
  if (status !== 'checking' && status !== 'not-asked') return Promise.resolve();
  return syncPushRegistration({ prompt: 'first-time' });
}

/**
 * Explicit sign-out (useSignOut), while the session token still works: NTF-6 for this phone's FCM token. Waits at most
 * UNREGISTER_WAIT_MS, never throws, never shows anything. Without a token (push never set up) nothing is sent.
 */
export async function unregisterPushForSignOut(): Promise<void> {
  const { token } = usePushStore.getState();
  if (!token || !useAuthStore.getState().isAuthenticated) return;
  const attempt = unregisterDeviceToken(token).then(
    () => pushLog('unregister: ok'),
    (error: unknown) => {
      const failure = deviceTokenFailure(error);
      pushLog(failure === 'not-deployed' ? 'unregister: 404, NTF-6 not deployed yet' : `unregister: failed (${statusOf(error)})`);
    },
  );
  await Promise.race([attempt, new Promise<void>((resolve) => setTimeout(resolve, UNREGISTER_WAIT_MS))]);
}

/**
 * Any sign-out, however it happened: forget the push state and have Firebase delete this phone's token. The next
 * sign-in gets a fresh token and registers it for whoever signs in (NTF-5 also reassigns a known token, §1.5).
 */
export async function forgetPushOnSessionEnd(): Promise<void> {
  usePushStore.getState().reset();
  const p = platform;
  if (!p?.available) return;
  try {
    await p.deleteLocalToken();
    pushLog('token: deleted on this phone after sign-out');
  } catch {
    pushLog('token: could not be deleted on this phone');
  }
}

function statusOf(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? `HTTP ${status}` : 'no response';
}
