// R1, the cookie shield (iOS, 2026-11-08; src/api/cookieShield.ts): no server cookie, `sd_session` or any other, lives in
// iOS's cookie store. The store is emptied through React Native's Networking module (clearCookies):
//   - right after each sign-in answer, success or error, before the session is stored: email (POST /auth/mobile/login)
//     and Microsoft (AUTH-P2);
//   - once at every cold start, before the first API call (RootNavigator);
//   - at every sign-out: by the person (after AUTH-3), the 15-day re-authentication, the 8-hour expiry, a 401.
// A failing shield never blocks sign-in or sign-out. Auth stays Bearer only: no cookie header, `withCredentials: false`.
// iOS only: on another platform the module is never touched.
// What is real: the sign-in and sign-out code, the apiClient with its interceptors, axios, the auth store, the shield.
// Faked: the native Networking module (tests/support/stubs/react-native.mjs: it counts each clearCookies call, and a
// test can make it missing, throwing or silent), Microsoft (…/expo-auth-session.mjs), the Keychain
// (…/expo-secure-store.mjs) and the network (axios's adapter). Nothing calls UAT, PROD or Microsoft. Tokens are fakes.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosError, AxiosHeaders } from 'axios';
import * as microsoft from 'expo-auth-session';
import * as secureStore from 'expo-secure-store';
import * as reactNative from 'react-native';

import { exchangeMicrosoftIdToken, signOutAndWipe } from '../../src/api/auth.api.ts';
import { apiClient, endSessionIfReauthDue } from '../../src/api/client.ts';
import { CLEAR_COOKIES_WAIT_MS, clearCookieStore } from '../../src/api/cookieShield.ts';
import { signInWithPassword } from '../../src/api/passwordSignIn.api.ts';
import { attemptPasswordSignIn } from '../../src/screens/auth/passwordSignInAttempt.ts';
import { attemptSignIn } from '../../src/screens/auth/signInAttempt.ts';
import { REAUTH_INTERVAL_MS, SESSION_TTL_MS, useAuthStore } from '../../src/store/auth.store.ts';
import { MOBILE_PASSWORD_PATH } from '../../src/types/mobile-password-contract.ts';
import { MOBILE_SSO_PATH } from '../../src/types/mobile-sso-contract.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
/** Code only: comments may say anything. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function sourceFiles(dir = 'src') {
  return readdirSync(path.join(REPO, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}
const SRC = sourceFiles();

const PASSWORD = 'fake-R1-Pa55word';
const TOKEN = 'fake-session-token-R1';
const EMAIL = 'uat.tester@mountmerugroup.com';
const COOKIE = 'sd_session=fake-cookie-value-R1; Path=/; HttpOnly';
const SESSION_KEYS = ['mmg.session.token', 'mmg.session.issuedAt', 'mmg.session.user'];
const LOGGED_OUT = { user: null, token: null, issuedAt: null, fullAuthAt: null, isAuthenticated: false, isLoading: false, signOutMessage: null };
const USER = { id: 'user-1', email: EMAIL, displayName: 'UAT Tester', role: 'AGENT', countryId: 'country-tz', ldapSamAccount: null };

const json = (status, body, extra = {}) => ({ status, contentType: 'application/json; charset=utf-8', body, ...extra });
const HTML_404 = { status: 404, contentType: 'text/html; charset=utf-8', body: '<pre>Cannot POST</pre>' };
const passwordUser = (over = {}) => ({ id: 'user-1', email: EMAIL, name: 'UAT Tester', role: 'AGENT', countryId: 'country-tz', ldapSamAccount: null, ...over });
const ssoBody = () => ({
  token: TOKEN,
  user: { id: 'user-1', email: EMAIL, name: 'UAT Tester', role: 'AGENT', countryId: 'country-tz', ldapSamAccount: 'uat.tester' },
  expiresAt: '2026-11-08T18:00:00.000Z',
});

// ── The network ──────────────────────────────────────────────
// A route with `setCookie` answers with a Set-Cookie header, and the stub's store then holds a cookie: what iOS would
// do if it stored it despite `withCredentials: false` (not provable from source; 02-AUTH §iOS-B).

const sent = [];
let routes = {};
apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, headers: AxiosHeaders.from(config.headers).toJSON(), withCredentials: config.withCredentials });
  const reply = routes[config.url] ?? HTML_404;
  if (reply.hang) return new Promise(() => {});
  if (reply.noAnswer) throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {});
  if (reply.setCookie) reactNative.__putCookieInStore();
  const response = {
    status: reply.status,
    statusText: String(reply.status),
    headers: AxiosHeaders.from({ 'content-type': reply.contentType, ...(reply.setCookie ? { 'set-cookie': [COOKIE] } : {}) }),
    data: typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body),
    config,
    request: {},
  };
  if (config.validateStatus(response.status)) return response;
  const code = response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;
  throw new AxiosError(`Request failed with status code ${response.status}`, code, config, {}, response);
};

const lines = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) console[level] = (...args) => lines.push(`${level}: ${args.map(String).join(' ')}`);
const shieldLines = () => lines.filter((l) => l.includes('[auth] cookie shield'));

/** What had happened when the app called clearCookies, one entry per call. */
let atClear = [];
function watchClears() {
  reactNative.__onCookieClear(() => {
    const stored = secureStore.__snapshot();
    atClear.push({
      requests: sent.map((r) => `${r.method} ${r.url}`),
      keychainWrites: secureStore.__calls().filter((c) => c.op === 'set').map((c) => c.key),
      sessionInKeychain: SESSION_KEYS.some((k) => k in stored),
      isAuthenticated: useAuthStore.getState().isAuthenticated,
    });
  });
}

/** Lets a `void endSession()` started by the app run to its end. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function microsoftSucceeds() {
  microsoft.__setMicrosoft({
    promptResult: () => ({ type: 'success', params: { code: 'fake-authorization-code' }, url: 'redirect-not-logged' }),
    exchange: () => ({ idToken: 'fake-microsoft-id-token', accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token' }),
  });
}

async function signedIn({ issuedAt = Date.now(), fullAuthAt = Date.now() } = {}) {
  await useAuthStore.getState().setSession({ token: TOKEN, user: USER, issuedAt, fullAuthAt });
  secureStore.__calls().length = 0;
}

const THROWS = { clearCookies() { throw new TypeError('native module failed (test)'); } };
const SILENT = { clearCookies() {} };
/** A test that could hang if the 2 s wait were gone fails here instead of stalling the run. */
const HANG_LIMIT = { timeout: 10_000 };

beforeEach(() => {
  secureStore.__reset();
  reactNative.__resetNetworking();
  reactNative.__setPlatformOS('ios');
  microsoft.__reset();
  microsoftSucceeds();
  useAuthStore.setState(LOGGED_OUT);
  sent.length = 0;
  lines.length = 0;
  atClear = [];
  watchClears();
  routes = {
    [MOBILE_PASSWORD_PATH]: json(200, { token: TOKEN, user: passwordUser() }),
    [MOBILE_SSO_PATH]: json(200, ssoBody()),
    '/auth/me': json(200, { user: { ...passwordUser(), displayName: 'UAT Tester' } }),
    '/auth/logout': json(200, { message: 'Logged out' }),
    '/tickets': json(200, { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
  };
});

// ── The helper ───────────────────────────────────────────────

describe('the helper: clearCookieStore() (src/api/cookieShield.ts)', () => {
  test('iOS: one clearCookies call on React Native\'s Networking module; an empty store says nothing', async () => {
    await clearCookieStore('launch');
    assert.equal(reactNative.__cookieClears(), 1);
    assert.deepEqual(shieldLines(), []);
  });

  test('a store that held cookies: one debug line, naming the point only', async () => {
    reactNative.__putCookieInStore();
    await clearCookieStore('launch');
    assert.deepEqual(shieldLines(), ['debug: [auth] cookie shield (launch): the cookie store held cookies; all deleted']);
  });

  test('never rejects: a missing module, or one that throws, is one [auth] warning and nothing else', async () => {
    reactNative.__setNetworking(null);
    await clearCookieStore('sign-out');
    reactNative.__setNetworking(THROWS);
    await clearCookieStore('sign-out');
    assert.deepEqual(shieldLines(), [
      "warn: [auth] cookie shield (sign-out): React Native's Networking module is not available; nothing was cleared",
      'warn: [auth] cookie shield (sign-out): clearCookies failed (TypeError); going on',
    ]);
  });

  test('never hangs: a native answer that never comes is given up after the wait (2 s by default)', HANG_LIMIT, async () => {
    assert.equal(CLEAR_COOKIES_WAIT_MS, 2_000);
    reactNative.__setNetworking(SILENT);
    const started = Date.now();
    await clearCookieStore('launch', 25);
    assert.ok(Date.now() - started < 1_000, 'gave up on time');
    assert.deepEqual(shieldLines(), ['warn: [auth] cookie shield (launch): clearCookies gave no answer within 25 ms; going on']);
  });

  test('src/: exactly four call sites, each awaited, one per point', () => {
    const found = [];
    for (const rel of SRC) for (const m of code(rel).matchAll(/(await )?clearCookieStore\('([a-z-]+)'\)/g)) found.push(`${rel}: ${m[1] ?? ''}${m[2]}`);
    assert.deepEqual(found.sort(), [
      'src/api/auth.api.ts: await microsoft-sign-in',
      'src/api/client.ts: await sign-out',
      'src/api/passwordSignIn.api.ts: await email-sign-in',
      'src/navigation/RootNavigator.tsx: await launch',
    ]);
  });
});

// ── Email sign-in ────────────────────────────────────────────

describe('email sign-in: cleared right after POST /auth/mobile/login answers, before the session is stored', () => {
  test('signed in: one clear, when only the sign-in request had been sent and nothing was in the Keychain', async () => {
    const outcome = await attemptPasswordSignIn(EMAIL, PASSWORD);
    assert.deepEqual(outcome, { type: 'signed-in' });
    assert.equal(reactNative.__cookieClears(), 1);
    assert.deepEqual(atClear, [{ requests: [`post ${MOBILE_PASSWORD_PATH}`], keychainWrites: [], sessionInKeychain: false, isAuthenticated: false }]);
    assert.equal(useAuthStore.getState().isAuthenticated, true, 'then the session is stored');
  });

  test('an answer with a Set-Cookie: the cookie is deleted before the session is stored; its value is never logged', async () => {
    routes[MOBILE_PASSWORD_PATH] = json(200, { token: TOKEN, user: passwordUser() }, { setCookie: true });
    assert.deepEqual(await attemptPasswordSignIn(EMAIL, PASSWORD), { type: 'signed-in' });
    assert.deepEqual(shieldLines(), ['debug: [auth] cookie shield (email-sign-in): the cookie store held cookies; all deleted']);
    assert.ok(lines.some((l) => /\[auth\] email sign-in: .* sent Set-Cookie/.test(l)), 'the iOS-5g line still records it (A32)');
    assert.ok(lines.every((l) => !l.includes('fake-cookie-value-R1') && !l.includes(TOKEN) && !l.includes(PASSWORD) && !l.includes(EMAIL)));
  });

  test('no countryId in the answer: cleared before AUTH-2 is asked', async () => {
    routes[MOBILE_PASSWORD_PATH] = json(200, { token: TOKEN, user: passwordUser({ countryId: undefined }) });
    assert.deepEqual(await attemptPasswordSignIn(EMAIL, PASSWORD), { type: 'signed-in' });
    assert.deepEqual(sent.map((r) => r.url), [MOBILE_PASSWORD_PATH, '/auth/me']);
    assert.deepEqual(atClear.map((a) => a.requests), [[`post ${MOBILE_PASSWORD_PATH}`]]);
  });

  const REFUSED = {
    'wrong password (401)': [json(401, { error: 'Invalid credentials' }, { setCookie: true }), 'credentials-rejected'],
    'deactivated (403)': [json(403, { error: 'Account deactivated' }), 'account-disabled'],
    'rate-limited (429)': [{ status: 429, contentType: 'text/plain', body: 'Too many requests' }, 'rate-limited'],
    'server error (500)': [json(500, { error: 'Internal server error' }), 'server'],
    'no such route (HTML 404)': [HTML_404, 'unavailable'],
    'no token in the 200': [json(200, { user: passwordUser() }), 'no-token'],
    'no answer (offline)': [{ noAnswer: true }, 'network'],
  };
  for (const [name, [reply, reason]] of Object.entries(REFUSED)) {
    test(`any answer, not only success: ${name} → cleared once, nothing stored, "${reason}" as before`, async () => {
      routes[MOBILE_PASSWORD_PATH] = reply;
      const outcome = await attemptPasswordSignIn(EMAIL, PASSWORD);
      assert.equal(outcome.type, 'failed');
      assert.equal(outcome.failure.reason, reason);
      assert.equal(reactNative.__cookieClears(), 1);
      assert.deepEqual(secureStore.__snapshot(), {});
    });
  }

  test('a failing shield never blocks sign-in: missing or throwing module → signed in', async () => {
    for (const module of [null, THROWS]) {
      reactNative.__setNetworking(module);
      useAuthStore.setState(LOGGED_OUT);
      assert.deepEqual(await attemptPasswordSignIn(EMAIL, PASSWORD), { type: 'signed-in' });
    }
  });

  test('a silent native module never blocks sign-in: signed in after the 2 s wait', HANG_LIMIT, async () => {
    reactNative.__setNetworking(SILENT);
    const started = Date.now();
    assert.deepEqual(await attemptPasswordSignIn(EMAIL, PASSWORD), { type: 'signed-in' });
    const took = Date.now() - started;
    assert.ok(took >= CLEAR_COOKIES_WAIT_MS - 50 && took < CLEAR_COOKIES_WAIT_MS + 1_500, `took ${took} ms`);
  });
});

// ── Microsoft sign-in ────────────────────────────────────────

describe('Microsoft sign-in: cleared right after AUTH-P2 answers, before the session is stored', () => {
  test('signed in: one clear, when only AUTH-P2 had been sent and nothing was in the Keychain', async () => {
    assert.deepEqual(await attemptSignIn(), { type: 'signed-in' });
    assert.equal(reactNative.__cookieClears(), 1);
    assert.deepEqual(atClear, [{ requests: [`post ${MOBILE_SSO_PATH}`], keychainWrites: [], sessionInKeychain: false, isAuthenticated: false }]);
    assert.equal(useAuthStore.getState().isAuthenticated, true, 'then the session is stored');
  });

  test('an AUTH-P2 answer with a Set-Cookie: deleted before the session is stored', async () => {
    routes[MOBILE_SSO_PATH] = json(200, ssoBody(), { setCookie: true });
    assert.deepEqual(await attemptSignIn(), { type: 'signed-in' });
    assert.deepEqual(shieldLines(), ['debug: [auth] cookie shield (microsoft-sign-in): the cookie store held cookies; all deleted']);
  });

  const REFUSED = {
    'token refused (401)': [json(401, { error: 'Invalid Microsoft token' }), 'token-rejected'],
    'deactivated (403)': [json(403, { error: 'Account deactivated' }), 'account-disabled'],
    'server error (500)': [json(500, { error: 'Internal server error' }), 'server'],
    'not deployed (HTML 404)': [HTML_404, 'endpoint-missing'],
    'no answer (offline)': [{ noAnswer: true }, 'network'],
  };
  for (const [name, [reply, reason]] of Object.entries(REFUSED)) {
    test(`any answer, not only success: ${name} → cleared once, nothing stored`, async () => {
      routes[MOBILE_SSO_PATH] = reply;
      const outcome = await attemptSignIn();
      assert.equal(outcome.type, 'failed');
      assert.equal(outcome.failure.reason, reason);
      assert.equal(reactNative.__cookieClears(), 1);
      assert.deepEqual(secureStore.__snapshot(), {});
    });
  }

  test('closed Microsoft\'s page: AUTH-P2 never answered, so there is nothing to clear', async () => {
    microsoft.__setMicrosoft({ promptResult: () => ({ type: 'cancel' }), exchange: () => assert.fail('no exchange') });
    assert.deepEqual(await attemptSignIn(), { type: 'cancelled' });
    assert.equal(reactNative.__cookieClears(), 0);
  });

  test('a failing shield never blocks sign-in: missing or throwing module → signed in', async () => {
    for (const module of [null, THROWS]) {
      reactNative.__setNetworking(module);
      useAuthStore.setState(LOGGED_OUT);
      assert.deepEqual(await attemptSignIn(), { type: 'signed-in' });
    }
  });
});

// ── Sign-out ─────────────────────────────────────────────────

describe('sign-out: cleared at every end of a session, after the session is wiped', () => {
  test('the person signs out: after AUTH-3 was sent, after the Keychain wipe', async () => {
    await signedIn();
    await signOutAndWipe(50);
    assert.equal(reactNative.__cookieClears(), 1);
    assert.deepEqual(atClear.map(({ requests, sessionInKeychain, isAuthenticated }) => ({ requests, sessionInKeychain, isAuthenticated })), [
      { requests: ['post /auth/logout'], sessionInKeychain: false, isAuthenticated: false },
    ]);
  });

  test('AUTH-3 never answers: cleared once its wait is over', async () => {
    await signedIn();
    routes['/auth/logout'] = { hang: true };
    await signOutAndWipe(20);
    assert.equal(reactNative.__cookieClears(), 1);
    assert.equal(useAuthStore.getState().isAuthenticated, false);
  });

  test('the 15-day re-authentication ends the session: cleared', async () => {
    await signedIn({ fullAuthAt: Date.now() - REAUTH_INTERVAL_MS - 1_000 });
    assert.equal(endSessionIfReauthDue(), true);
    await settle();
    assert.equal(reactNative.__cookieClears(), 1);
    assert.deepEqual(atClear.map((a) => a.isAuthenticated), [false]);
  });

  test('the 8-hour expiry ends the session (request interceptor): cleared, and the dead token is never sent', async () => {
    await signedIn({ issuedAt: Date.now() - SESSION_TTL_MS - 1_000 });
    await assert.rejects(apiClient.get('/tickets'));
    await settle();
    assert.deepEqual(sent, []);
    assert.equal(reactNative.__cookieClears(), 1);
  });

  test('a 401 ends the session: cleared once, even for a burst of three', async () => {
    await signedIn();
    routes['/tickets'] = json(401, { error: 'Session expired' });
    await Promise.allSettled([apiClient.get('/tickets'), apiClient.get('/tickets'), apiClient.get('/tickets')]);
    await settle();
    assert.equal(reactNative.__cookieClears(), 1);
    assert.deepEqual(atClear.map((a) => a.isAuthenticated), [false]);
  });

  test('a failing shield never blocks sign-out: missing, throwing or silent module → logged out, Keychain wiped', HANG_LIMIT, async () => {
    for (const module of [null, THROWS, SILENT]) {
      reactNative.__setNetworking(module);
      await signedIn();
      const started = Date.now();
      await signOutAndWipe(20);
      assert.ok(Date.now() - started < CLEAR_COOKIES_WAIT_MS + 1_500, 'sign-out finished');
      assert.equal(useAuthStore.getState().isAuthenticated, false);
      assert.ok(SESSION_KEYS.every((k) => !(k in secureStore.__snapshot())));
    }
  });
});

// ── Launch ───────────────────────────────────────────────────

describe('launch: cleared once at every cold start, before the first API call', () => {
  test('RootNavigator\'s start-up: the shield, then the reinstall check, then restoreSession(), each awaited in turn', () => {
    const nav = code('src/navigation/RootNavigator.tsx');
    const boot = nav.match(/useEffect\(\(\) => \{\s*void \(async \(\) => \{([\s\S]*?)\}\)\(\);\s*\}, \[\]\);/);
    assert.ok(boot, 'the start-up effect');
    assert.deepEqual([...boot[1].matchAll(/await ([^;]+);/g)].map((m) => m[1]), [
      "clearCookieStore('launch')",
      'wipeSessionLeftByPreviousInstall()',
      'useAuthStore.getState().restoreSession()',
    ]);
  });

  test('nothing calls the API before it: a blank view until restoreSession() ends; App.tsx starts no request', () => {
    assert.equal(useAuthStore.getInitialState().isLoading, true, 'a cold start begins loading');
    assert.match(code('src/navigation/RootNavigator.tsx'), /if \(isLoading\) return <View className="flex-1 bg-white" \/>;/);
    const app = code('App.tsx');
    assert.deepEqual([...app.matchAll(/from '@\/api\/([^']+)'/g)].map((m) => m[1]).sort(), ['network', 'queryClient']);
    for (const rel of ['src/api/network.ts', 'src/api/queryClient.ts']) assert.doesNotMatch(code(rel), /apiClient|from '\.\/client'/, rel);
  });
});

// ── Bearer only ──────────────────────────────────────────────

describe('client.ts: Bearer only, never a cookie', () => {
  test('withCredentials stays false', () => {
    assert.equal(apiClient.defaults.withCredentials, false);
  });

  test('no request the app sends carries a cookie header, or asks for cookies; signed-in ones carry the Bearer token', async () => {
    await attemptPasswordSignIn(EMAIL, PASSWORD);
    await apiClient.get('/tickets');
    useAuthStore.setState(LOGGED_OUT);
    await attemptSignIn();
    await apiClient.get('/tickets');
    await signOutAndWipe(50);
    assert.deepEqual(sent.map((r) => `${r.method} ${r.url}`), [
      `post ${MOBILE_PASSWORD_PATH}`, 'get /tickets', `post ${MOBILE_SSO_PATH}`, 'get /tickets', 'post /auth/logout',
    ]);
    for (const request of sent) {
      assert.deepEqual(Object.keys(request.headers).filter((h) => /cookie/i.test(h)), [], `${request.method} ${request.url}`);
      assert.equal(request.withCredentials, false, `${request.method} ${request.url}`);
    }
    for (const request of sent.filter((r) => r.url === '/tickets')) assert.equal(request.headers.Authorization, `Bearer ${TOKEN}`);
  });

  test('src/ never names a cookie header, and turns withCredentials on nowhere', () => {
    for (const rel of SRC) {
      const text = code(rel);
      assert.doesNotMatch(text, /['"`][Cc]ookie2?['"`]|\b[Cc]ookie2?\s*:/, rel);
      assert.doesNotMatch(text, /withCredentials\s*:\s*true|credentials\s*:\s*['"`]include/, rel);
    }
    const flags = SRC.flatMap((rel) => [...code(rel).matchAll(/withCredentials\s*:\s*(\w+)/g)].map((m) => `${rel}: ${m[1]}`));
    assert.deepEqual(flags, ['src/api/client.ts: false']);
  });
});

// ── Android ──────────────────────────────────────────────────

describe('iOS only: on any other platform the native module is never touched', () => {
  test('the guard is the first statement of clearCookieStore()', () => {
    const body = code('src/api/cookieShield.ts').split(/export async function clearCookieStore\([^)]*\)[^{]*\{/)[1];
    assert.match(body, /^\s*if \(Platform\.OS !== 'ios'\) return;/);
  });

  test("Platform.OS 'android': email sign-in, AUTH-P2 and sign-out run as before, with no clearCookies call", async () => {
    reactNative.__setPlatformOS('android');
    try {
      await clearCookieStore('launch');
      assert.deepEqual(await attemptPasswordSignIn(EMAIL, PASSWORD), { type: 'signed-in' });
      await exchangeMicrosoftIdToken('fake-microsoft-id-token');
      await signOutAndWipe(50);
      assert.equal(reactNative.__cookieClears(), 0);
      assert.deepEqual(shieldLines(), []);
    } finally {
      reactNative.__setPlatformOS('ios');
    }
  });

  test('signInWithPassword() itself clears on iOS (the module the Android check above never reached)', async () => {
    await signInWithPassword(EMAIL, PASSWORD);
    assert.equal(reactNative.__cookieClears(), 1);
  });
});
