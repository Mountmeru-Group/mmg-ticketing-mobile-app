// G7: push notifications, the app side (the server side, 01 NTF-5/NTF-6, confirmed in writing by the backend team on
// 2026-11-05). Web/backend facts and the design: docs/G7-PERIOD-APPROVALS-PUSH.md §3.
// These tests pin:
//   1. registration on sign-in: NTF-5 `{ token, platform: "android" }`, only with the permission granted;
//   2. the permission is never asked at sign-in, only on the first visit to Alerts (and by the explicit button);
//   3. a refusal, a missing Firebase config and Expo Go all end quietly, with no request;
//   4. a 404 (endpoint not deployed) and every other failure are SILENT: nothing thrown, no session ended, a `[push]`
//      log line for us that never contains the token;
//   5. sign-out: NTF-6 `{ token, platform }` before AUTH-3, bounded in time; any sign-out deletes the token on the phone;
//   6. token rotation re-registers; taps open the ticket through the existing resolver's link format;
//   7. the Alerts notice follows the real state; the wiring (no prompt at launch, no polling, the channel).
// What is real: registration.ts, utils/push.ts, the stores, the NTF module and the axios client. Faked: the network
// (axios's adapter) and the phone (a PushPlatform object instead of expo-notifications, which needs a device).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { ApiClientError } from '../../src/api/errors.ts';
import {
  UNREGISTER_WAIT_MS, forgetPushOnSessionEnd, installPushPlatform, onPushTokenRotated, requestPushOnAlertsOpen,
  syncPushRegistration, unregisterPushForSignOut,
} from '../../src/push/registration.ts';
import { useAuthStore } from '../../src/store/auth.store.ts';
import { usePushStore } from '../../src/store/push.store.ts';
import { APP_ORIGIN, parseTicketLink } from '../../src/utils/deep-links.ts';
import { deviceTokenFailure, pushNotice, pushTapAction, pushTicketLink } from '../../src/utils/push.ts';
import { PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const FCM_TOKEN = 'fcm-token-AAAA:bbbb_cccc-dddd';
const TICKET_ID = '3f2b8c1e-9a4d-4e2f-8b7a-1c2d3e4f5a6b';

// ── The network ──────────────────────────────────────────────
const sent = [];
let reply = () => ({ status: 200, body: { ok: true } });
apiClient.defaults.adapter = (config) => {
  sent.push({
    method: config.method,
    base: config.baseURL,
    url: config.url,
    data: config.data ? JSON.parse(config.data) : undefined,
    auth: config.headers?.Authorization,
    cookie: config.headers?.Cookie,
  });
  const { status, body, html, hang } = reply(config);
  if (hang) return new Promise(() => undefined); // a request that never answers
  const response = {
    status,
    statusText: String(status),
    headers: AxiosHeaders.from({ 'content-type': html ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8' }),
    data: html ? body : JSON.stringify(body),
    config,
    request: {},
  };
  if (status >= 200 && status < 300) return Promise.resolve(response);
  const error = new Error(`Request failed with status code ${status}`);
  Object.assign(error, { isAxiosError: true, response, config, toJSON: () => ({}) });
  return Promise.reject(error);
};
const EXPRESS_404 = () => ({ status: 404, html: true, body: '<!DOCTYPE html><pre>Cannot POST /api/v1/notifications/device-token</pre>' });

// ── The phone ────────────────────────────────────────────────
function fakePlatform({ permission = 'granted', canAskAgain = true, answer = 'granted', token = FCM_TOKEN, available = true } = {}) {
  const calls = { channel: 0, request: 0, getToken: 0, deleteLocalToken: 0 };
  let current = { status: permission, canAskAgain };
  let tokenListener = null;
  return {
    calls,
    rotate: (next) => tokenListener?.(next),
    platform: {
      available,
      ensureChannel: async () => {
        calls.channel++;
      },
      getPermission: async () => current,
      requestPermission: async () => {
        calls.request++;
        current = { status: answer, canAskAgain: answer === 'granted' ? true : canAskAgain && calls.request < 2 };
        return current;
      },
      getToken: async () => {
        calls.getToken++;
        if (token instanceof Error) throw token;
        return token;
      },
      deleteLocalToken: async () => {
        calls.deleteLocalToken++;
      },
      onTokenChange: (listener) => {
        tokenListener = listener;
        return () => {
          tokenListener = null;
        };
      },
    },
  };
}

// ── The log ──────────────────────────────────────────────────
const logs = [];
const realInfo = console.info;

function signIn(persona = PERSONAS.ADMIN) {
  useAuthStore.setState({ token: 'session-token', user: persona, issuedAt: Date.now(), isAuthenticated: true, isLoading: false, signOutMessage: null });
}
function signOutLocally() {
  useAuthStore.setState({ token: null, user: null, issuedAt: null, isAuthenticated: false, isLoading: false });
}

beforeEach(() => {
  sent.length = 0;
  logs.length = 0;
  reply = () => ({ status: 200, body: { ok: true } });
  console.info = (...args) => logs.push(args.join(' '));
  usePushStore.getState().reset();
  signIn();
});
afterEach(() => {
  console.info = realInfo;
  installPushPlatform(null);
  // The log is for us, and never carries the token.
  for (const line of logs) assert.ok(!line.includes(FCM_TOKEN) && !line.includes('rotated-token'), `token in log: ${line}`);
});

// ── 1–3. Registration ────────────────────────────────────────

describe('registration on sign-in', () => {
  test('permission granted: channel, token, POST /notifications/device-token { token, platform: "android" }, status on', async () => {
    const phone = fakePlatform();
    installPushPlatform(phone.platform);
    await syncPushRegistration();
    assert.equal(phone.calls.channel, 1);
    assert.deepEqual(sent.map((r) => `${r.method} ${r.url}`), ['post /notifications/device-token']);
    assert.deepEqual(sent[0].data, { token: FCM_TOKEN, platform: 'android' });
    assert.equal(sent[0].auth, 'Bearer session-token');
    assert.equal(usePushStore.getState().status, 'on');
    assert.equal(usePushStore.getState().token, FCM_TOKEN);
  });

  test('sign-in never asks for the permission: undetermined stays not-asked, nothing is sent', async () => {
    const phone = fakePlatform({ permission: 'undetermined' });
    installPushPlatform(phone.platform);
    await syncPushRegistration();
    assert.equal(phone.calls.request, 0);
    assert.equal(phone.calls.getToken, 0);
    assert.deepEqual(sent, []);
    assert.equal(usePushStore.getState().status, 'not-asked');
  });

  test('nobody signed in: nothing is sent', async () => {
    signOutLocally();
    const phone = fakePlatform();
    installPushPlatform(phone.platform);
    await syncPushRegistration();
    assert.deepEqual(sent, []);
  });

  test('Expo Go / not Android (platform unavailable): status unavailable, the phone is never asked anything', async () => {
    const phone = fakePlatform({ available: false });
    installPushPlatform(phone.platform);
    await syncPushRegistration({ prompt: 'button' });
    assert.deepEqual(phone.calls, { channel: 0, request: 0, getToken: 0, deleteLocalToken: 0 });
    assert.deepEqual(sent, []);
    assert.equal(usePushStore.getState().status, 'unavailable');
  });

  test('no Firebase config in the build (getToken rejects): unavailable, silent, nothing sent', async () => {
    const phone = fakePlatform({ token: new Error('Default FirebaseApp is not initialized') });
    installPushPlatform(phone.platform);
    await syncPushRegistration();
    assert.deepEqual(sent, []);
    assert.equal(usePushStore.getState().status, 'unavailable');
    assert.ok(logs.some((l) => l.startsWith('[push] token:')));
  });
});

describe('the permission: first visit to Alerts only, and a refusal changes nothing else', () => {
  test('first visit to Alerts asks once; granted → registered', async () => {
    const phone = fakePlatform({ permission: 'undetermined', answer: 'granted' });
    installPushPlatform(phone.platform);
    await syncPushRegistration();
    await requestPushOnAlertsOpen();
    assert.equal(phone.calls.request, 1);
    assert.equal(usePushStore.getState().status, 'on');
    assert.equal(sent.length, 1);
  });

  test('refused: status denied, no token, no request; later visits to Alerts never ask again by themselves', async () => {
    const phone = fakePlatform({ permission: 'undetermined', answer: 'denied' });
    installPushPlatform(phone.platform);
    await requestPushOnAlertsOpen();
    await requestPushOnAlertsOpen();
    await requestPushOnAlertsOpen();
    assert.equal(phone.calls.request, 1);
    assert.equal(phone.calls.getToken, 0);
    assert.deepEqual(sent, []);
    assert.equal(usePushStore.getState().status, 'denied');
  });

  test('a visit to Alerts while already on does nothing at all', async () => {
    const phone = fakePlatform();
    installPushPlatform(phone.platform);
    await syncPushRegistration();
    sent.length = 0;
    await requestPushOnAlertsOpen();
    assert.equal(phone.calls.request, 0);
    assert.deepEqual(sent, []);
  });

  test('the "Turn on notifications" button asks again while Android allows it', async () => {
    const phone = fakePlatform({ permission: 'denied', canAskAgain: true, answer: 'granted' });
    installPushPlatform(phone.platform);
    await syncPushRegistration({ prompt: 'button' });
    assert.equal(phone.calls.request, 1);
    assert.equal(usePushStore.getState().status, 'on');
  });

  test('after a permanent refusal the button cannot ask (Settings only): no dialog call', async () => {
    const phone = fakePlatform({ permission: 'denied', canAskAgain: false });
    installPushPlatform(phone.platform);
    await syncPushRegistration({ prompt: 'button' });
    assert.equal(phone.calls.request, 0);
    assert.equal(usePushStore.getState().status, 'denied');
    assert.equal(usePushStore.getState().canAskAgain, false);
    assert.deepEqual(pushNotice('denied', false).action, { label: 'Open settings', kind: 'settings' });
  });
});

// ── 4. Silent failures ───────────────────────────────────────

describe('a 404 from the device-token endpoint is silent', () => {
  test('Express HTML 404 (not deployed): resolves, status not-deployed, session untouched, logged for us', async () => {
    reply = EXPRESS_404;
    installPushPlatform(fakePlatform().platform);
    await assert.doesNotReject(syncPushRegistration());
    assert.equal(usePushStore.getState().status, 'not-deployed');
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.ok(logs.includes('[push] register: 404, NTF-5 not deployed yet'));
  });

  test('a JSON 404 reads the same', async () => {
    reply = () => ({ status: 404, body: { error: 'Not found' } });
    installPushPlatform(fakePlatform().platform);
    await syncPushRegistration();
    assert.equal(usePushStore.getState().status, 'not-deployed');
  });

  test('a 500 or no network: status failed, still silent', async () => {
    reply = () => ({ status: 500, body: { error: 'Internal server error' } });
    installPushPlatform(fakePlatform().platform);
    await assert.doesNotReject(syncPushRegistration());
    assert.equal(usePushStore.getState().status, 'failed');
    assert.ok(logs.includes('[push] register: failed (HTTP 500)'));
  });

  test('failures are classified, never shown: 404 not-deployed, 401 session-ended, anything else failed', () => {
    assert.equal(deviceTokenFailure(new ApiClientError('not-json', 404, { error: 'x' })), 'not-deployed');
    assert.equal(deviceTokenFailure(new ApiClientError('http', 401, { error: 'Session expired' })), 'session-ended');
    assert.equal(deviceTokenFailure(new ApiClientError('network', null, { error: 'Network error' })), 'failed');
    assert.equal(deviceTokenFailure(new Error('boom')), 'failed');
  });

  test('nothing in src/push or the screens turns a device-token failure into a banner, dialog or toast', () => {
    for (const file of ['src/push/registration.ts', 'src/push/PushBridge.tsx', 'src/push/taps.ts']) {
      assert.doesNotMatch(read(file), /notify\(|confirmAction\(|reportWriteError\(|Alert\.alert|QueryBanner/, file);
    }
  });
});

// ── 5. Sign-out ──────────────────────────────────────────────

describe('removal on sign-out', () => {
  test('DELETE /notifications/device-token { token, platform } with the session token still valid', async () => {
    installPushPlatform(fakePlatform().platform);
    await syncPushRegistration();
    sent.length = 0;
    await unregisterPushForSignOut();
    assert.deepEqual(sent.map((r) => `${r.method} ${r.url}`), ['delete /notifications/device-token']);
    assert.deepEqual(sent[0].data, { token: FCM_TOKEN, platform: 'android' });
    assert.equal(sent[0].auth, 'Bearer session-token');
  });

  test('a 404 on sign-out is silent too', async () => {
    installPushPlatform(fakePlatform().platform);
    await syncPushRegistration();
    reply = EXPRESS_404;
    await assert.doesNotReject(unregisterPushForSignOut());
    assert.ok(logs.includes('[push] unregister: 404, NTF-6 not deployed yet'));
  });

  test('push never set up (no token): nothing is sent', async () => {
    await unregisterPushForSignOut();
    assert.deepEqual(sent, []);
  });

  test(`an unanswered DELETE holds sign-out for at most ${UNREGISTER_WAIT_MS} ms`, async () => {
    usePushStore.getState().setToken(FCM_TOKEN);
    reply = () => ({ hang: true });
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      let done = false;
      const pending = unregisterPushForSignOut().then(() => {
        done = true;
      });
      await Promise.resolve();
      mock.timers.tick(UNREGISTER_WAIT_MS - 1);
      await Promise.resolve();
      assert.equal(done, false);
      mock.timers.tick(1);
      await pending;
      assert.equal(done, true);
    } finally {
      mock.timers.reset();
    }
  });

  test('useSignOut sends NTF-6 BEFORE AUTH-3 (which ends the session token NTF-6 needs)', () => {
    const src = read('src/hooks/useProfile.ts');
    const body = src.slice(src.indexOf('export function useSignOut'));
    const unregisterAt = body.indexOf('await unregisterPushForSignOut();');
    const logoutAt = body.indexOf('logout()');
    const endAt = body.indexOf('await endSession(');
    assert.ok(unregisterAt > 0 && unregisterAt < logoutAt && logoutAt < endAt, 'NTF-6, then AUTH-3, then the local wipe');
  });

  test('any sign-out (explicit, 401, 8 h, 15 days): Firebase deletes the token on this phone and the state resets', async () => {
    const phone = fakePlatform();
    installPushPlatform(phone.platform);
    await syncPushRegistration();
    await forgetPushOnSessionEnd();
    assert.equal(phone.calls.deleteLocalToken, 1);
    assert.deepEqual({ status: usePushStore.getState().status, token: usePushStore.getState().token }, { status: 'checking', token: null });
  });

  test('PushBridge runs it on every signed-in → signed-out transition (not only the Sign out button)', () => {
    const src = read('src/push/PushBridge.tsx');
    assert.match(src, /useAuthStore\.subscribe\(\(state, previous\) => \{/);
    assert.match(src, /if \(!signedIn && wasSignedIn\) void forgetPushOnSessionEnd\(\);/);
    assert.match(src, /if \(signedIn && \(!wasSignedIn \|\| state\.user\?\.id !== previous\.user\?\.id\)\) void syncPushRegistration\(\);/);
  });
});

// ── 6. Rotation and taps ─────────────────────────────────────

describe('token rotation and taps', () => {
  test('Firebase rotates the token: the new one is registered', async () => {
    installPushPlatform(fakePlatform().platform);
    await syncPushRegistration();
    sent.length = 0;
    await onPushTokenRotated('rotated-token');
    assert.deepEqual(sent.map((r) => r.data), [{ token: 'rotated-token', platform: 'android' }]);
    assert.equal(usePushStore.getState().token, 'rotated-token');
  });

  test('…also while the endpoint is not deployed (it will be retried with the new token)', async () => {
    reply = EXPRESS_404;
    installPushPlatform(fakePlatform().platform);
    await syncPushRegistration();
    sent.length = 0;
    await onPushTokenRotated('rotated-token');
    assert.equal(sent.length, 1);
  });

  test('…but not while notifications are off, or after sign-out', async () => {
    installPushPlatform(fakePlatform({ permission: 'denied' }).platform);
    await syncPushRegistration();
    await onPushTokenRotated('rotated-token');
    usePushStore.getState().reset();
    signOutLocally();
    await onPushTokenRotated('rotated-token');
    assert.deepEqual(sent, []);
  });

  test('a tap opens data.ticketId through the existing resolver\'s link format', () => {
    const link = pushTicketLink({ type: 'TICKET_COMMENT', ticketId: TICKET_ID, ticketNumber: '5266', notificationId: 'n-1' });
    assert.equal(link, `${APP_ORIGIN}/tickets/${TICKET_ID}`);
    assert.deepEqual(parseTicketLink(link), { ok: true, target: { kind: 'id', id: TICKET_ID } });
  });

  test('no ticketId: the ticket number; nothing usable: null (the Alerts tab opens instead)', () => {
    assert.equal(pushTicketLink({ ticketNumber: '5266' }), '#5266');
    assert.equal(pushTicketLink({ ticketId: 'not-a-uuid' }), null);
    assert.equal(pushTicketLink({ ticketId: '../../admin' }), null);
    assert.equal(pushTicketLink({ type: 'ANNOUNCEMENT' }), null);
    assert.equal(pushTicketLink(null), null);
  });

  test('cold, background, foreground: wait until the navigation and the session are ready; signed out → nothing', () => {
    const base = { navigationReady: true, sessionLoading: false, signedIn: true, link: '#1' };
    assert.equal(pushTapAction(base), 'open-ticket');
    assert.equal(pushTapAction({ ...base, link: null }), 'open-alerts');
    assert.equal(pushTapAction({ ...base, navigationReady: false }), 'wait'); // cold start, navigation not mounted
    assert.equal(pushTapAction({ ...base, sessionLoading: true }), 'wait'); // cold start, session being restored
    assert.equal(pushTapAction({ ...base, signedIn: false }), 'drop');
  });

  test('taps reuse openTicketLinkInApp, and the cold-start tap is flushed on the container\'s ready event', () => {
    assert.match(read('src/push/taps.ts'), /openTicketLinkInApp\(link\)/);
    const bridge = read('src/push/PushBridge.tsx');
    assert.match(bridge, /navigationRef\.addListener\('ready', flushPushTap\)/);
    assert.match(bridge, /getLastNotificationResponseAsync\(\)/);
    assert.match(bridge, /addNotificationResponseReceivedListener\(onResponse\)/);
  });
});

// ── The backend team's written contract (2026-11-05) ─────────

describe('registration matches the confirmed contract exactly', () => {
  // POST and DELETE /api/v1/notifications/device-token, body { "token": "<fcm-token>", "platform": "android" },
  // header Authorization: Bearer <token>.
  async function both() {
    installPushPlatform(fakePlatform().platform);
    await syncPushRegistration();
    await unregisterPushForSignOut();
    return sent;
  }

  test('method and path: POST, then DELETE, on /api/v1/notifications/device-token', async () => {
    const calls = await both();
    assert.deepEqual(calls.map((r) => r.method.toUpperCase()), ['POST', 'DELETE']);
    for (const r of calls) assert.equal(`${new URL(r.base).pathname}${r.url}`, '/api/v1/notifications/device-token');
  });

  test('body: exactly { token, platform: "android" } on both, as JSON', async () => {
    for (const r of await both()) {
      assert.deepEqual(Object.keys(r.data).sort(), ['platform', 'token']);
      assert.deepEqual(r.data, { token: FCM_TOKEN, platform: 'android' });
    }
  });

  test('header: Authorization: Bearer <session token>, never a cookie', async () => {
    for (const r of await both()) {
      assert.equal(r.auth, 'Bearer session-token');
      assert.equal(r.cookie, undefined);
    }
  });

  test('a tap on the payload the server sends (fcm.service.ts: type, notificationId, ticketId, ticketNumber, all strings) opens that ticket', () => {
    const data = { type: 'COMMENT_ADDED', notificationId: 'n-7', ticketId: TICKET_ID, ticketNumber: '19445' };
    assert.deepEqual(parseTicketLink(pushTicketLink(data)), { ok: true, target: { kind: 'id', id: TICKET_ID } });
    assert.match(read('src/push/PushBridge.tsx'), /handlePushTap\(response\.notification\.request\.identifier, response\.notification\.request\.content\.data\)/);
  });
});

describe('Firebase in the build (google-services.json)', () => {
  test('with Firebase and the permission granted, push is on and Alerts stops saying it cannot receive notifications', async () => {
    installPushPlatform(fakePlatform({ permission: 'granted' }).platform);
    await syncPushRegistration();
    const { status, canAskAgain } = usePushStore.getState();
    assert.equal(status, 'on');
    const notice = pushNotice(status, canAskAgain).text;
    assert.doesNotMatch(notice, /can't receive|cannot receive/);
    assert.match(notice, /arrive on this phone as notifications/);
  });

  test('without it (getToken rejects) the notice says so: the one state that does', async () => {
    installPushPlatform(fakePlatform({ token: new Error('FirebaseApp is not initialized') }).platform);
    await syncPushRegistration();
    assert.equal(usePushStore.getState().status, 'unavailable');
    assert.match(pushNotice('unavailable', true).text, /can't receive notifications/);
    const others = ['checking', 'not-asked', 'denied', 'not-deployed', 'failed', 'on'];
    for (const s of others) assert.doesNotMatch(pushNotice(s, true).text, /can't receive/, s);
  });

  test('app.config.js sets android.googleServicesFile only from the EAS file variable, and keeps app.json as it is', async () => {
    const appJson = JSON.parse(read('app.json')).expo;
    const { default: dynamic } = await import('../../app.config.js');
    const saved = process.env.GOOGLE_SERVICES_JSON;
    try {
      delete process.env.GOOGLE_SERVICES_JSON;
      assert.equal(dynamic({ config: appJson }), appJson, 'no variable: the config is app.json, untouched');
      process.env.GOOGLE_SERVICES_JSON = '/home/expo/workingdir/google-services.json';
      const withFile = dynamic({ config: appJson });
      assert.equal(withFile.android.googleServicesFile, '/home/expo/workingdir/google-services.json');
      assert.deepEqual({ ...withFile.android, googleServicesFile: undefined }, { ...appJson.android, googleServicesFile: undefined });
      assert.equal(withFile.android.package, 'com.mountmeru.servicedesk');
    } finally {
      if (saved === undefined) delete process.env.GOOGLE_SERVICES_JSON;
      else process.env.GOOGLE_SERVICES_JSON = saved;
    }
    assert.equal(appJson.android.googleServicesFile, undefined, 'app.json names no file: a build without the variable never looks for one');
  });

  test('the file stays out of git (every copy of it), and the production profile is not given it', () => {
    assert.match(read('.gitignore'), /^google-services\*\.json$/m, 'also "google-services (1).json" from a second download');
    const eas = read('eas.json');
    assert.doesNotMatch(eas, /GOOGLE_SERVICES_JSON|googleServicesFile/);
  });
});

// ── 7. The notice and the wiring ─────────────────────────────

describe('the Alerts notice follows the real state', () => {
  test('one notice per state, none of them hard-coded "no push yet"', () => {
    const texts = ['checking', 'unavailable', 'not-asked', 'denied', 'not-deployed', 'failed', 'on'].map((s) => pushNotice(s, true).text);
    assert.equal(new Set(texts).size, texts.length);
    assert.match(pushNotice('on', true).text, /arrive on this phone/);
    assert.match(pushNotice('not-deployed', true).text, /aren't switched on at the Service Desk yet/);
    assert.equal(pushNotice('denied', true).action?.kind, 'request');
    assert.equal(pushNotice('not-asked', true).action?.kind, 'request');
    assert.equal(pushNotice('on', true).action, undefined);
    const screen = read('src/screens/notifications/NotificationsScreen.tsx');
    assert.doesNotMatch(screen, /has no push yet/);
    assert.match(screen, /pushNotice\(status, canAskAgain\)/);
  });
});

describe('wiring', () => {
  test('no permission prompt at launch: only the Alerts screen and its button can prompt', () => {
    assert.doesNotMatch(read('src/push/PushBridge.tsx'), /requestPermission|requestPushOnAlertsOpen|prompt:/);
    assert.match(read('src/screens/notifications/NotificationsScreen.tsx'), /requestPushOnAlertsOpen\(\)/);
    assert.match(read('src/screens/notifications/NotificationsScreen.tsx'), /syncPushRegistration\(\{ prompt: 'button' \}\)/);
  });

  test('the channel is setu_tickets, in code and as the default FCM channel in app.json', () => {
    assert.match(read('src/push/platform.ts'), /export const PUSH_CHANNEL_ID = 'setu_tickets';/);
    const app = JSON.parse(read('app.json'));
    const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
    assert.ok(plugin, 'expo-notifications config plugin');
    assert.equal(plugin[1].defaultChannel, 'setu_tickets');
  });

  test('the token is the native FCM token (getDevicePushTokenAsync), not an Expo push token', () => {
    const src = read('src/push/platform.ts');
    assert.match(src, /getDevicePushTokenAsync\(\)/);
    assert.doesNotMatch(src, /getExpoPushTokenAsync/);
  });

  test('Expo Go is detected before expo-notifications is used', () => {
    assert.match(read('src/push/platform.ts'), /Platform\.OS === 'android' && !isRunningInExpoGo\(\)/);
  });

  test('no polling, no timers in the push code but the sign-out bound; the token is never persisted', () => {
    for (const file of ['src/push/registration.ts', 'src/push/PushBridge.tsx', 'src/push/taps.ts', 'src/push/platform.ts', 'src/store/push.store.ts']) {
      const src = read(file);
      assert.doesNotMatch(src, /setInterval|refetchInterval/, file);
      assert.doesNotMatch(src, /SecureStore|AsyncStorage|persist\(/, file);
    }
    assert.equal((read('src/push/registration.ts').match(/setTimeout\(/g) ?? []).length, 1);
  });
});
