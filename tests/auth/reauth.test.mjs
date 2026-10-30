// The 15-day forced re-authentication (02-AUTH.md §5.8), run on the app's own code without a device.
//
// What is real: the auth store (isReauthDue, setSession, clearSession, restoreSession), attemptSignIn() (the Login
// screen's sequence), the apiClient with its interceptors, endSession() / endSessionIfReauthDue(), and the Login notice.
// What is faked: Microsoft (tests/support/stubs/expo-auth-session.mjs), the phone's Keystore (…/expo-secure-store.mjs)
// and the network (axios's transport). RootNavigator and LoginScreen need React Native, so their wiring is read from
// their source. Nothing calls UAT or Microsoft. All tokens below are fake markers; the last test checks none leaks.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosError, AxiosHeaders } from 'axios';
import * as microsoft from 'expo-auth-session';
import * as secureStore from 'expo-secure-store';

import { apiClient, endSession, endSessionIfReauthDue } from '../../src/api/client.ts';
import { attemptSignIn } from '../../src/screens/auth/signInAttempt.ts';
import {
  REAUTH_CLOCK_TOLERANCE_MS,
  REAUTH_INTERVAL_MS,
  REAUTH_NOTICE,
  SESSION_ENDED_MESSAGE,
  SESSION_TTL_MS,
  isReauthDue,
  useAuthStore,
} from '../../src/store/auth.store.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const KEYS = {
  token: 'mmg.session.token',
  issuedAt: 'mmg.session.issuedAt',
  user: 'mmg.session.user',
  fullAuthAt: 'mmg.auth.fullAuthAt',
};
const FAKE = {
  idToken: 'fake-microsoft-id-token-REAUTH',
  code: 'fake-authorization-code-REAUTH',
  token: 'fake-session-token-REAUTH',
};
const USER = {
  id: 'user-1',
  email: 'test.user@mountmerugroup.com',
  displayName: 'Test User',
  role: 'AGENT',
  ldapSamAccount: 'test.user',
  countryId: 'country-1',
};

/** AUTH-P2's confirmed 200 body (02 §7.5), with fake values. */
function signInBody() {
  return {
    token: FAKE.token,
    user: { id: 'user-1', email: USER.email, name: 'Test User', role: 'AGENT', countryId: 'country-1', ldapSamAccount: 'test.user', department: 'IT', phone: '+255 000 000 000' },
    expiresAt: '2026-10-30T17:00:00.000Z',
  };
}

// ── The network: axios's transport answers; the interceptors above it are the real code ──

let reply;
function serverAnswers(status, body) {
  reply = { status, body };
}
apiClient.defaults.adapter = async (config) => {
  const response = {
    status: reply.status,
    statusText: String(reply.status),
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(reply.body),
    config,
    request: {},
  };
  if (config.validateStatus(response.status)) return response;
  throw new AxiosError(`Request failed with status code ${response.status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response);
};

// ── Microsoft: a successful sign-in on its page, unless a test says otherwise ──

function microsoftSucceeds() {
  microsoft.__setMicrosoft({
    promptResult: () => ({ type: 'success', params: { code: FAKE.code }, url: 'redirect-not-logged' }),
    exchange: () => ({ idToken: FAKE.idToken, accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token' }),
  });
}

/** The `prompt` of each Microsoft page the app opened, in order. */
const prompts = () => microsoft.__calls().requests.map((request) => request.config.prompt);

// ── Console and outcomes: captured for the R6 check at the end ──

const everything = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => everything.push(args.map(String).join(' '));
}

/** One tap of "Sign in with Microsoft", exactly as the Login screen runs it. */
async function signIn() {
  const outcome = await attemptSignIn();
  everything.push(JSON.stringify(outcome));
  return outcome;
}

// ── The phone ──

const LOGGED_OUT = { user: null, token: null, issuedAt: null, fullAuthAt: null, isAuthenticated: false, isLoading: false, signOutMessage: null };

/**
 * What SecureStore holds before a cold start: a session from `issuedAgo` ago and, unless left out, a 15-day date from
 * `fullAuth` ago (a number; negative is in the future) or a raw stored string (a corrupt value).
 */
async function phoneHolds({ issuedAgo = 1 * HOUR, fullAuth } = {}) {
  const now = Date.now();
  await secureStore.setItemAsync(KEYS.token, FAKE.token);
  await secureStore.setItemAsync(KEYS.issuedAt, String(now - issuedAgo));
  await secureStore.setItemAsync(KEYS.user, JSON.stringify(USER));
  if (fullAuth !== undefined) {
    await secureStore.setItemAsync(KEYS.fullAuthAt, typeof fullAuth === 'string' ? fullAuth : String(now - fullAuth));
  }
}

/** A cold start: nothing in memory, then restoreSession() reads SecureStore (RootNavigator runs it on start). */
async function coldStart() {
  useAuthStore.setState({ ...LOGGED_OUT, isLoading: true });
  await useAuthStore.getState().restoreSession();
  return useAuthStore.getState();
}

const storedDate = () => secureStore.__snapshot()[KEYS.fullAuthAt];

/** Lets a fire-and-forget endSession() finish its SecureStore deletes. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  secureStore.__reset();
  microsoft.__reset();
  microsoftSucceeds();
  serverAnswers(200, signInBody());
  useAuthStore.setState(LOGGED_OUT);
});

afterEach(async () => {
  await settle();
});

// ─────────────────────────────────────────────────────────────

describe('the interval: one named constant', () => {
  test('REAUTH_INTERVAL_MS is 15 days, and the Login notice says so from it', () => {
    assert.equal(REAUTH_INTERVAL_MS, 15 * DAY);
    assert.match(REAUTH_NOTICE.message, /every 15 days\.$/);
  });

  test('it is defined once, in src/store/auth.store.ts; no other source file has its own 15 days', () => {
    const files = sourceFiles('src');
    assert.deepEqual(files.filter((rel) => /REAUTH_INTERVAL_MS\s*=/.test(read(rel))), ['src/store/auth.store.ts']);
    assert.deepEqual(files.filter((rel) => /\b15 \* 24\b|\b1296000000\b|\b15 \* DAY\b/.test(read(rel))), ['src/store/auth.store.ts']);
  });
});

describe('isReauthDue(): the date against the clock', () => {
  const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);

  test('under 15 days: not due', () => {
    for (const elapsed of [0, 1 * MIN, SESSION_TTL_MS, 14 * DAY, REAUTH_INTERVAL_MS - 1]) {
      assert.equal(isReauthDue(T0, T0 + elapsed), false, `${elapsed} ms after`);
    }
  });

  test('exactly at the boundary: due, to the millisecond', () => {
    assert.equal(isReauthDue(T0, T0 + REAUTH_INTERVAL_MS - 1), false);
    assert.equal(isReauthDue(T0, T0 + REAUTH_INTERVAL_MS), true);
  });

  test('over 15 days, or the clock moved forward past them: due', () => {
    for (const elapsed of [REAUTH_INTERVAL_MS + 1, 16 * DAY, 365 * DAY]) {
      assert.equal(isReauthDue(T0, T0 + elapsed), true, `${elapsed} ms after`);
    }
  });

  test('clock moved back a little (a network-time correction, up to 5 minutes): not due', () => {
    assert.equal(REAUTH_CLOCK_TOLERANCE_MS, 5 * MIN);
    assert.equal(isReauthDue(T0, T0 - 1000), false);
    assert.equal(isReauthDue(T0, T0 - REAUTH_CLOCK_TOLERANCE_MS), false);
  });

  test('clock moved back further: due, because a date in the future proves nothing', () => {
    for (const back of [REAUTH_CLOCK_TOLERANCE_MS + 1, 1 * HOUR, 10 * DAY, 365 * DAY]) {
      assert.equal(isReauthDue(T0, T0 - back), true, `clock ${back} ms before the date`);
    }
  });

  test('missing or not a number: due', () => {
    for (const value of [null, Number.NaN, Infinity, -Infinity]) assert.equal(isReauthDue(value, T0), true, String(value));
  });
});

describe('cold start: restoreSession()', () => {
  test('under 15 days: the session comes back, with its date in memory', async () => {
    await phoneHolds({ fullAuth: 14 * DAY });
    const state = await coldStart();
    assert.equal(state.isAuthenticated, true);
    assert.equal(state.signOutMessage, null);
    assert.equal(state.fullAuthAt, Number(storedDate()));
  });

  test('over 15 days: signed out with the security notice; the session and the date are deleted', async () => {
    await phoneHolds({ fullAuth: 15 * DAY + 1 * MIN });
    const state = await coldStart();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.token, null);
    assert.equal(state.signOutMessage, REAUTH_NOTICE.message);
    assert.equal(state.fullAuthAt, null);
    assert.deepEqual(secureStore.__snapshot(), {});
  });

  test('15 days and 8 hours both up: the 15-day notice wins', async () => {
    await phoneHolds({ issuedAgo: 9 * HOUR, fullAuth: 16 * DAY });
    assert.equal((await coldStart()).signOutMessage, REAUTH_NOTICE.message);
  });

  test('8 hours up within the 15 days: the usual "session has ended", and the date is kept', async () => {
    await phoneHolds({ issuedAgo: SESSION_TTL_MS, fullAuth: 3 * DAY });
    const date = storedDate();
    const state = await coldStart();
    assert.equal(state.signOutMessage, SESSION_ENDED_MESSAGE);
    assert.equal(state.fullAuthAt, Number(date));
    assert.deepEqual(secureStore.__snapshot(), { [KEYS.fullAuthAt]: date });
  });

  test('date missing (e.g. a phone updated from a build before this change): signed out with the notice, no crash', async () => {
    await phoneHolds({});
    const state = await coldStart();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.isLoading, false);
    assert.equal(state.signOutMessage, REAUTH_NOTICE.message);
    assert.deepEqual(secureStore.__snapshot(), {});
  });

  const CORRUPT = ['', 'abc', 'NaN', '-5', '0', '1.5', '1e12', ` ${Date.now()}`, '{"at":1}', '9'.repeat(20)];
  for (const raw of CORRUPT) {
    test(`date corrupt (${JSON.stringify(raw)}): treated as expired, no crash, the bad value is deleted`, async () => {
      await phoneHolds({ fullAuth: raw });
      const state = await coldStart();
      assert.equal(state.isAuthenticated, false);
      assert.equal(state.isLoading, false);
      assert.equal(state.signOutMessage, REAUTH_NOTICE.message);
      assert.equal(storedDate(), undefined);
    });
  }

  test('date in the future (the clock was moved back since sign-in): signed out with the notice', async () => {
    await phoneHolds({ fullAuth: -2 * DAY });
    const state = await coldStart();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.signOutMessage, REAUTH_NOTICE.message);
  });

  test('the Keystore cannot read the date: treated as expired, signed out with the notice, no crash', async () => {
    await phoneHolds({ fullAuth: 1 * DAY });
    secureStore.__failReadsOn(KEYS.fullAuthAt);
    const state = await coldStart();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.isLoading, false);
    assert.equal(state.signOutMessage, REAUTH_NOTICE.message);
  });

  test('the Keystore cannot read anything: logged out as before, and the next sign-in is challenged', async () => {
    await phoneHolds({ fullAuth: 1 * DAY });
    secureStore.__failReadsOn(...Object.values(KEYS));
    const state = await coldStart();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.isLoading, false);
    assert.equal(state.fullAuthAt, null);
    secureStore.__failReadsOn();
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(prompts(), ['login']);
  });

  test('already signed out by the 8-hour rule, date still good: no notice, and the date waits for the next sign-in', async () => {
    const date = String(Date.now() - 2 * DAY);
    await secureStore.setItemAsync(KEYS.fullAuthAt, date);
    const state = await coldStart();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.signOutMessage, null);
    assert.equal(state.fullAuthAt, Number(date));
    assert.deepEqual(secureStore.__snapshot(), { [KEYS.fullAuthAt]: date });
  });
});

describe('sign-in: Microsoft is told to challenge (prompt=login) only when the 15 days are due', () => {
  test('first sign-in on a fresh phone: prompt=login, and the date is written', async () => {
    const before = Date.now();
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(prompts(), ['login']);
    assert.match(storedDate(), /^\d+$/, 'only a number is stored');
    const date = Number(storedDate());
    assert.ok(date >= before && date <= Date.now());
    assert.equal(useAuthStore.getState().fullAuthAt, date);
  });

  test('within the 15 days (an ordinary re-sign-in after the 8-hour expiry): prompt=select_account, date unchanged', async () => {
    await phoneHolds({ issuedAgo: 9 * HOUR, fullAuth: 5 * DAY });
    const date = storedDate();
    assert.equal((await coldStart()).signOutMessage, SESSION_ENDED_MESSAGE);
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(prompts(), ['select_account']);
    assert.equal(storedDate(), date);
    assert.equal(useAuthStore.getState().fullAuthAt, Number(date));
  });

  test('after the 15-day sign-out: prompt=login, and a NEW date restarts the 15 days from now', async () => {
    await phoneHolds({ fullAuth: 16 * DAY });
    const old = Number(storedDate());
    assert.equal((await coldStart()).signOutMessage, REAUTH_NOTICE.message);
    const before = Date.now();
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(prompts(), ['login']);
    const fresh = Number(storedDate());
    assert.ok(fresh >= before && fresh > old);
    const state = useAuthStore.getState();
    assert.equal(state.isAuthenticated, true);
    assert.equal(state.signOutMessage, null, 'the notice goes once signed in');
    assert.equal(isReauthDue(state.fullAuthAt, fresh + REAUTH_INTERVAL_MS - 1), false);
    assert.equal(isReauthDue(state.fullAuthAt, fresh + REAUTH_INTERVAL_MS), true);
  });

  test('the forced sign-in cancelled at Microsoft: nothing written, the notice stays, the next attempt still challenges', async () => {
    await phoneHolds({ fullAuth: 16 * DAY });
    await coldStart();
    microsoft.__setMicrosoft({ promptResult: () => ({ type: 'dismiss' }), exchange: () => assert.fail('no exchange') });
    assert.deepEqual(await signIn(), { type: 'cancelled' });
    assert.deepEqual(secureStore.__snapshot(), {});
    assert.equal(useAuthStore.getState().signOutMessage, REAUTH_NOTICE.message);
    microsoftSucceeds();
    await signIn();
    assert.deepEqual(prompts(), ['login', 'login']);
  });

  test('the forced sign-in refused by the Service Desk (401): no date is written, so it is still due', async () => {
    serverAnswers(401, { error: 'Invalid Microsoft token' });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'token-rejected');
    assert.deepEqual(secureStore.__snapshot(), {});
    assert.equal(isReauthDue(useAuthStore.getState().fullAuthAt), true);
  });

  test('the Keystore refuses the date: a "storage" failure, not signed in, and a cold start clears the partial session', async () => {
    secureStore.__failOn(KEYS.fullAuthAt);
    const outcome = await signIn();
    assert.equal(outcome.type, 'failed');
    assert.equal(outcome.failure.reason, 'storage');
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    secureStore.__failOn(null);
    const state = await coldStart();
    assert.equal(state.isAuthenticated, false);
    assert.deepEqual(secureStore.__snapshot(), {});
  });
});

describe('the date is NOT reset by an ordinary session renewal', () => {
  /** A challenged sign-in 3 days ago, and a live session. Returns the stored date. */
  async function threeDaysIn() {
    await phoneHolds({ fullAuth: 3 * DAY });
    assert.equal((await coldStart()).isAuthenticated, true);
    return storedDate();
  }
  const dates = () => ({ stored: storedDate(), memory: String(useAuthStore.getState().fullAuthAt) });

  test('8-hour expiry, then an ordinary re-sign-in: the same date, stored and in memory', async () => {
    const date = await threeDaysIn();
    await endSession(SESSION_ENDED_MESSAGE); // what the request interceptor and the foreground check do at 8 hours
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.deepEqual(dates(), { stored: date, memory: date });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(prompts(), ['select_account']);
    assert.deepEqual(dates(), { stored: date, memory: date });
  });

  test('a 401 from the server, then an ordinary re-sign-in: the same date', async () => {
    const date = await threeDaysIn();
    serverAnswers(401, { error: 'Session expired' });
    await assert.rejects(apiClient.get('/auth/me'));
    await settle();
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(useAuthStore.getState().signOutMessage, SESSION_ENDED_MESSAGE);
    assert.deepEqual(dates(), { stored: date, memory: date });
    serverAnswers(200, signInBody());
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(prompts(), ['select_account']);
    assert.deepEqual(dates(), { stored: date, memory: date });
  });

  test('re-storing the same session (the profile save in useProfile.ts): the same date', async () => {
    const date = await threeDaysIn();
    const { token, issuedAt, user } = useAuthStore.getState();
    await useAuthStore.getState().setSession({ token, issuedAt, user: { ...user, displayName: 'New Name' } });
    assert.deepEqual(dates(), { stored: date, memory: date });
  });

  test('after a renewal and a cold start, the session still ends 15 days after the challenged sign-in', async () => {
    const date = await threeDaysIn();
    await endSession(SESSION_ENDED_MESSAGE);
    await signIn();
    const state = await coldStart();
    assert.equal(state.isAuthenticated, true);
    assert.equal(String(state.fullAuthAt), date);
    assert.equal(endSessionIfReauthDue(Number(date) + REAUTH_INTERVAL_MS - 1), false);
    assert.equal(endSessionIfReauthDue(Number(date) + REAUTH_INTERVAL_MS), true);
  });
});

describe('a sign-out by the user', () => {
  test('clears the date, so the next sign-in starts fresh: challenged, with a new date', async () => {
    await phoneHolds({ fullAuth: 3 * DAY });
    const old = Number(storedDate());
    await coldStart();
    await endSession(null, { forgetFullAuth: true }); // useSignOut(), after AUTH-3
    assert.deepEqual(secureStore.__snapshot(), {});
    assert.equal(useAuthStore.getState().fullAuthAt, null);
    assert.equal(useAuthStore.getState().signOutMessage, null, 'no notice: the user chose to sign out');
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(prompts(), ['login']);
    assert.ok(Number(storedDate()) > old);
  });

  test('useSignOut() is the call that passes forgetFullAuth', () => {
    assert.match(read('src/hooks/useProfile.ts'), /await endSession\(null, \{ forgetFullAuth: true \}\);/);
  });
});

describe('expiry reached while the app is open: the return to the foreground', () => {
  test('signed in 14 days ago: nothing happens; the same open session past 15 days: signed out with the notice', async () => {
    await phoneHolds({ fullAuth: 14 * DAY });
    await coldStart();
    const { fullAuthAt } = useAuthStore.getState();
    assert.equal(endSessionIfReauthDue(), false);
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    // The app is left open in the background and comes back a day later.
    assert.equal(endSessionIfReauthDue(fullAuthAt + REAUTH_INTERVAL_MS), true);
    const state = useAuthStore.getState();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.signOutMessage, REAUTH_NOTICE.message);
    assert.equal(state.fullAuthAt, null);
    await settle();
    assert.deepEqual(secureStore.__snapshot(), {});
    await signIn();
    assert.deepEqual(prompts(), ['login']);
  });

  test('the clock moved back while the app was open: signed out on return', async () => {
    await phoneHolds({ fullAuth: 1 * DAY });
    await coldStart();
    assert.equal(endSessionIfReauthDue(useAuthStore.getState().fullAuthAt - 1 * DAY), true);
    assert.equal(useAuthStore.getState().signOutMessage, REAUTH_NOTICE.message);
  });

  test('on Login (not signed in): nothing happens, and the message already shown is not replaced', () => {
    useAuthStore.setState({ signOutMessage: SESSION_ENDED_MESSAGE });
    assert.equal(endSessionIfReauthDue(), false);
    assert.equal(useAuthStore.getState().signOutMessage, SESSION_ENDED_MESSAGE);
  });

  test('RootNavigator: restoreSession() on start, and on each return to the foreground the 15 days before the 8 hours', () => {
    const nav = read('src/navigation/RootNavigator.tsx');
    assert.match(nav, /useEffect\(\(\) => \{\s*void useAuthStore\.getState\(\)\.restoreSession\(\);\s*\}, \[\]\);/);
    assert.match(
      nav,
      /AppState\.addEventListener\('change', \(next\) => \{\s*if \(next !== 'active'\) return;\s*\/\/[^\n]*\n\s*if \(endSessionIfReauthDue\(\)\) return;\s*const \{ isAuthenticated, issuedAt \} = useAuthStore\.getState\(\);\s*if \(isAuthenticated && \(issuedAt === null \|\| isSessionExpired\(issuedAt\)\)\) \{\s*void endSession\(SESSION_ENDED_MESSAGE\);/,
    );
  });

  test('no timer and no poll: checked only on start and on return to the foreground', () => {
    for (const rel of ['src/navigation/RootNavigator.tsx', 'src/store/auth.store.ts', 'src/api/client.ts', 'src/screens/auth/signInAttempt.ts']) {
      assert.doesNotMatch(read(rel), /setInterval|setTimeout|requestAnimationFrame/, rel);
    }
    // The request interceptor keeps only its 8-hour check: the 15 days are not checked per request.
    const interceptor = read('src/api/client.ts').split('apiClient.interceptors.request.use(')[1].split('\n});')[0];
    assert.doesNotMatch(interceptor, /isReauthDue|endSessionIfReauthDue/);
    assert.match(interceptor, /if \(issuedAt === null \|\| isSessionExpired\(issuedAt\)\) \{\s*void endSession\(SESSION_ENDED_MESSAGE\);/);
  });
});

describe('the Login notice', () => {
  test('says plainly why: "Signed out for security", then asks to sign in again', () => {
    assert.equal(REAUTH_NOTICE.title, 'Signed out for security');
    assert.match(REAUTH_NOTICE.message, /^Please sign in again\. /);
    assert.notEqual(REAUTH_NOTICE.message, SESSION_ENDED_MESSAGE);
  });

  test('it fills the existing message slot above "Setu", in the info tone rather than the red failure box', () => {
    const login = read('src/screens/auth/LoginScreen.tsx');
    const slot = login.indexOf('signOutMessage === REAUTH_NOTICE.message ? (');
    assert.notEqual(slot, -1);
    assert.ok(slot > login.indexOf('<View style={[styles.bottom'), 'in the white bottom section');
    assert.ok(slot < login.indexOf('<View style={styles.signIn}>'), 'above the wordmark and the button');
    const notice = login.slice(slot, login.indexOf(') : (', slot));
    assert.match(notice, /bg-blue-50/);
    assert.match(notice, /\{REAUTH_NOTICE\.title\}/);
    assert.match(notice, /\{signOutMessage\}/);
    assert.doesNotMatch(notice, /red/);
  });
});

describe('R6: secrets', () => {
  test('no session token, Microsoft ID token or authorization code in any log line or sign-in outcome', () => {
    const text = everything.join('\n');
    assert.ok(everything.length > 0);
    for (const [name, value] of Object.entries(FAKE)) assert.equal(text.includes(value), false, `${name} leaked`);
  });
});
