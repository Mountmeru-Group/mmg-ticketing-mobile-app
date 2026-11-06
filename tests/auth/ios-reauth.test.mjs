// The 15-day forced re-authentication on iOS (iOS-5d, 02-AUTH.md §5.8 and §iOS-A). Android's own 47 cases run in
// ./reauth.test.mjs; these are the iOS-only ones: the Keychain class of the date, the reinstall wipe, and the return
// from the background at exactly day 15.
//
// What is real: the auth store, attemptSignIn(), signOutAndWipe(), endSessionIfReauthDue(), the apiClient with its
// interceptors, the query cache, the UI store and installMarker.ts.
// What is faked: Microsoft and the sign-in sheet (tests/support/stubs/expo-auth-session.mjs), the Keychain
// (…/expo-secure-store.mjs: deleting the app keeps its items, as iOS does), the app container (…/expo-file-system.mjs)
// and the network (axios's transport). RootNavigator needs React Native, so a "launch" here runs what it runs on start:
// the reinstall check, then restoreSession(). Nothing calls UAT or Microsoft. All tokens below are fake markers.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';
import * as microsoft from 'expo-auth-session';
import * as appContainer from 'expo-file-system';
import * as secureStore from 'expo-secure-store';

import { signOutAndWipe } from '../../src/api/auth.api.ts';
import { apiClient, endSession, endSessionIfReauthDue } from '../../src/api/client.ts';
import { queryClient } from '../../src/api/queryClient.ts';
import { AUTH_SESSION_OPTIONS, IOS_AUTH_REDIRECT_URI } from '../../src/config/auth.config.ts';
import { attemptSignIn } from '../../src/screens/auth/signInAttempt.ts';
import {
  REAUTH_INTERVAL_MS,
  REAUTH_NOTICE,
  SESSION_ENDED_MESSAGE,
  useAuthStore,
} from '../../src/store/auth.store.ts';
import { wipeSessionLeftByPreviousInstall } from '../../src/store/installMarker.ts';
import { useUiStore } from '../../src/store/ui.store.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const sourceFiles = () =>
  readdirSync(path.join(REPO, 'src'), { recursive: true })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => `src/${f.split(path.sep).join('/')}`);

const DAY = 24 * 60 * 60 * 1000;
const FULL_AUTH_KEY = 'mmg.auth.fullAuthAt';
const SESSION_KEYS = ['mmg.session.token', 'mmg.session.issuedAt', 'mmg.session.user'];
const FAKE = {
  idToken: 'fake-microsoft-id-token-IOS-REAUTH',
  code: 'fake-authorization-code-IOS-REAUTH',
  token: 'fake-session-token-IOS-REAUTH',
};

// ── The network: AUTH-P2's confirmed 200 (02 §7.5) and AUTH-3's, with fake values ──

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push(config.url);
  const body =
    config.url === '/auth/logout'
      ? { message: 'Logged out' }
      : {
          token: FAKE.token,
          user: { id: 'user-1', email: 'test.user@mountmerugroup.com', name: 'Test User', role: 'AGENT', countryId: 'country-1', ldapSamAccount: 'test.user', department: 'IT', phone: '+255 000 000 000' },
          expiresAt: '2026-11-01T17:00:00.000Z',
        };
  return {
    status: 200,
    statusText: 'OK',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(body),
    config,
    request: {},
  };
};

/** One tap of "Sign in with Microsoft", exactly as the Login screen runs it; Microsoft's sheet succeeds. */
async function signIn() {
  microsoft.__setMicrosoft({
    promptResult: () => ({ type: 'success', params: { code: FAKE.code }, url: 'redirect-not-logged' }),
    exchange: () => ({ idToken: FAKE.idToken, accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token' }),
  });
  return attemptSignIn();
}

/** The `prompt` of each Microsoft sheet the app opened, in order. */
const prompts = () => microsoft.__calls().requests.map((request) => request.config.prompt);

const LOGGED_OUT = { user: null, token: null, issuedAt: null, fullAuthAt: null, isAuthenticated: false, isLoading: false, signOutMessage: null };

/** A launch from cold, as RootNavigator runs it: nothing in memory, the reinstall check, then restoreSession(). */
async function launch() {
  useAuthStore.setState({ ...LOGGED_OUT, isLoading: true });
  await wipeSessionLeftByPreviousInstall();
  await useAuthStore.getState().restoreSession();
  return useAuthStore.getState();
}

/** Delete Setu: the app container goes, the Keychain items stay (iOS). Installing it again starts from here. */
function deleteApp() {
  appContainer.__reset();
}

const keychain = () => secureStore.__snapshot();
const callsOn = (key, from = 0) => secureStore.__calls().slice(from).filter((call) => call.key === key);

/** Lets a fire-and-forget endSession() finish its Keychain deletes. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  secureStore.__reset();
  microsoft.__reset();
  appContainer.__reset();
  queryClient.clear();
  useUiStore.getState().reset();
  useAuthStore.setState(LOGGED_OUT);
  sent.length = 0;
});

afterEach(async () => {
  await settle();
});

// ─────────────────────────────────────────────────────────────

describe('Keychain: the 15-day date has the session\'s class', () => {
  test('written, read and deleted with AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY (no iCloud sync, no backup restore)', async () => {
    await launch();
    assert.deepEqual(await signIn(), { type: 'signed-in' }); // a fresh phone: challenged, so the date is written
    const { fullAuthAt } = await launch(); // read
    assert.equal(endSessionIfReauthDue(fullAuthAt + REAUTH_INTERVAL_MS), true); // deleted
    await settle();

    const calls = callsOn(FULL_AUTH_KEY);
    assert.deepEqual(new Set(calls.map((call) => call.op)), new Set(['set', 'get', 'delete']));
    for (const call of secureStore.__calls()) {
      assert.equal(
        call.options?.keychainAccessible,
        secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        `${call.op} ${call.key} did not pass AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`,
      );
    }
  });

  test('the user\'s sign-out (signOutAndWipe) deletes it with the same class, after AUTH-3, and empties the Keychain', async () => {
    await launch();
    await signIn();
    const from = secureStore.__calls().length;
    await signOutAndWipe(50);
    assert.deepEqual(sent.slice(-1), ['/auth/logout']);
    assert.deepEqual(
      callsOn(FULL_AUTH_KEY, from).map((call) => [call.op, call.options?.keychainAccessible]),
      [['delete', secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY]],
    );
    assert.deepEqual(keychain(), {});
    const state = useAuthStore.getState();
    assert.equal(state.fullAuthAt, null);
    assert.equal(state.signOutMessage, null, 'a sign-out the person chose shows no message');
  });
});

describe('reinstall (installMarker.ts): a fresh, challenged sign-in', () => {
  test('first launch after a reinstall wipes the session and the date; Login shows no notice; the sign-in is challenged', async () => {
    await launch();
    await signIn();
    assert.deepEqual(Object.keys(keychain()).sort(), [FULL_AUTH_KEY, ...SESSION_KEYS].sort());

    deleteApp();
    const from = secureStore.__calls().length;
    const state = await launch();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.signOutMessage, null, 'a reinstall is a fresh start, not a sign-out');
    assert.equal(state.fullAuthAt, null);
    assert.deepEqual(keychain(), {});
    assert.deepEqual(
      callsOn(FULL_AUTH_KEY, from).find((call) => call.op === 'delete')?.options?.keychainAccessible,
      secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    );
    assert.equal(appContainer.__files().length, 1, 'the marker is written again');

    // Well within the 15 days, yet challenged: the date went with the reinstall.
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(prompts(), ['login', 'login']);
  });

  test('reinstall after an 8-hour sign-out, when the Keychain holds only the date: it goes too', async () => {
    await launch();
    await signIn();
    await endSession(SESSION_ENDED_MESSAGE); // the 8-hour rule: the session goes, the date stays
    assert.deepEqual(Object.keys(keychain()), [FULL_AUTH_KEY]);

    deleteApp();
    await launch();
    assert.deepEqual(keychain(), {});
    await signIn();
    assert.deepEqual(prompts(), ['login', 'login'], 'without the wipe this would have been select_account');
  });

  test('an ordinary launch (the marker is there) keeps the session and the date', async () => {
    await launch();
    await signIn();
    const date = keychain()[FULL_AUTH_KEY];
    const state = await launch();
    assert.equal(state.isAuthenticated, true);
    assert.equal(String(state.fullAuthAt), date);
    assert.equal(keychain()[FULL_AUTH_KEY], date);
  });

  test('the marker cannot be written: the next launch wipes again, so the person signs in again (never stuck signed in)', async () => {
    appContainer.__failCreate();
    await launch();
    await signIn();
    const state = await launch();
    assert.equal(state.isAuthenticated, false);
    assert.deepEqual(keychain(), {});
  });

  test('the marker cannot be read: nothing is wiped, and the 15-day rule still applies as usual', async () => {
    await launch();
    await signIn();
    await secureStore.setItemAsync(FULL_AUTH_KEY, String(Date.now() - 16 * DAY));
    appContainer.__failExists();
    const state = await launch();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.signOutMessage, REAUTH_NOTICE.message);
    assert.deepEqual(keychain(), {});
  });
});

describe('return from the background at day 15', () => {
  test('1 ms before: still signed in; at day 15 exactly: the notice, and the Keychain, query cache and UI store are wiped', async () => {
    await launch();
    await signIn();
    const { fullAuthAt } = useAuthStore.getState();
    queryClient.setQueryData(['tickets', 'list'], { data: [{ id: 'ticket-1' }] });
    useUiStore.getState().setTicketCountryId('country-1');

    // RootNavigator's AppState handler, on `active`, with the clock 1 ms short of the 15 days.
    assert.equal(endSessionIfReauthDue(fullAuthAt + REAUTH_INTERVAL_MS - 1), false);
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(queryClient.getQueryCache().getAll().length, 1);

    // The same handler at day 15 exactly: the boundary counts as due.
    assert.equal(endSessionIfReauthDue(fullAuthAt + REAUTH_INTERVAL_MS), true);
    const state = useAuthStore.getState();
    assert.equal(state.isAuthenticated, false, 'flipped at once, so Login shows before anything else is sent');
    assert.equal(state.signOutMessage, REAUTH_NOTICE.message);
    assert.equal(state.fullAuthAt, null);
    await settle();
    assert.deepEqual(keychain(), {});
    assert.equal(queryClient.getQueryCache().getAll().length, 0, 'the query cache must be empty');
    assert.equal(useUiStore.getState().ticketCountryId, null, 'the UI store must be reset');
  });

  test('the sign-in after it is challenged through the same iOS sheet: only `prompt` differs from an ordinary one', async () => {
    await launch();
    await signIn(); // a fresh phone: challenged
    await endSession(SESSION_ENDED_MESSAGE); // 8 hours later
    await signIn(); // an ordinary re-sign-in within the 15 days
    assert.equal(endSessionIfReauthDue(useAuthStore.getState().fullAuthAt + REAUTH_INTERVAL_MS), true);
    await settle();
    await signIn(); // after the 15-day sign-out

    assert.deepEqual(prompts(), ['login', 'select_account', 'login']);
    const { requests, promptOptions } = microsoft.__calls();
    const withoutPrompt = ({ prompt: _prompt, ...rest }) => rest;
    for (const request of requests) {
      assert.equal(request.config.redirectUri, IOS_AUTH_REDIRECT_URI);
      assert.equal(request.config.usePKCE, true);
      assert.equal(request.config.codeChallengeMethod, 'S256');
      assert.deepEqual(withoutPrompt(request.config), withoutPrompt(requests[0].config));
    }
    assert.deepEqual(promptOptions, [AUTH_SESSION_OPTIONS, AUTH_SESSION_OPTIONS, AUTH_SESSION_OPTIONS]);
    assert.deepEqual(AUTH_SESSION_OPTIONS, { preferEphemeralSession: true });
  });
});

describe('who writes the date', () => {
  // Android's production-readiness.test.mjs checks the first two (f4fad10). That file is on the iOS-9 list
  // (docs/ios/ANDROID-DELTA.md §5, item 5), so iOS checks them here, with the developer-token screen it still has.
  test('signInAttempt only after a challenged sign-in; never the profile save; the __DEV__ developer-token screen always', () => {
    const callers = sourceFiles().filter((rel) => /setSession\(\{/.test(read(rel)));
    // iOS-5g: + the email sign-in, which starts the 15 days as Android's does (999943e): a password is a full check.
    assert.deepEqual(callers.sort(), [
      'src/hooks/useProfile.ts',
      'src/screens/auth/DevTokenScreen.tsx',
      'src/screens/auth/passwordSignInAttempt.ts',
      'src/screens/auth/signInAttempt.ts',
    ]);
    assert.match(
      read('src/screens/auth/passwordSignInAttempt.ts'),
      /setSession\(\{ token: session\.token, user: session\.user, fullAuthAt: Date\.now\(\) \}\)/,
    );
    const attempt = read('src/screens/auth/signInAttempt.ts');
    assert.match(attempt, /const fullAuthAt = challenge \? Date\.now\(\) : undefined;/);
    assert.match(attempt, /setSession\(\{ token: result\.session\.token, user: result\.session\.user, fullAuthAt \}\)/);
    assert.doesNotMatch(read('src/hooks/useProfile.ts'), /fullAuthAt/);
    assert.match(read('src/screens/auth/DevTokenScreen.tsx'), /setSession\(\{ token, user, fullAuthAt: Date\.now\(\) \}\)/);
  });

  test('a developer-token session (Q1) survives a return to the foreground, and ends at day 15 like any other', async () => {
    const now = Date.now();
    const user = { id: 'user-1', email: 'test.user@mountmerugroup.com', displayName: 'Test User', role: 'AGENT', ldapSamAccount: 'test.user', countryId: 'country-1' };
    await useAuthStore.getState().setSession({ token: FAKE.token, user, fullAuthAt: now }); // as DevTokenScreen does
    assert.equal(endSessionIfReauthDue(now + 1000), false);
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(endSessionIfReauthDue(now + REAUTH_INTERVAL_MS), true);
    assert.equal(useAuthStore.getState().signOutMessage, REAUTH_NOTICE.message);
  });
});
