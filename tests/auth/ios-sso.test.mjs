// Microsoft sign-in on iOS (iOS-6, 02-AUTH.md §7.7): the redirect, PKCE, the sign-in sheet, the Keychain and sign-out.
// The confirmed AUTH-P2 contract itself is pinned by ./mobile-sso.test.mjs (the 34 tests ported from Android).
//
// What is real: attemptSignIn() (the Login screen's sequence), signInWithMicrosoft(), signOutAndWipe(), the apiClient
// with its interceptors, axios, the auth and UI stores, the query cache and the Login screen's messages.
// What is faked: Microsoft and the sign-in sheet (tests/support/stubs/expo-auth-session.mjs), the Keychain
// (…/expo-secure-store.mjs), Platform.OS (…/react-native.mjs) and the network: axios's transport adapter answers.
// Nothing calls UAT or Microsoft. All tokens below are fake markers; the last test checks none reaches a log line.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosError, AxiosHeaders } from 'axios';
import * as microsoft from 'expo-auth-session';
import * as secureStore from 'expo-secure-store';
import * as reactNative from 'react-native';

import { signOutAndWipe } from '../../src/api/auth.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { queryClient } from '../../src/api/queryClient.ts';
import {
  AUTH_REDIRECT_SCHEME,
  AZURE_CLIENT_ID,
  AZURE_ENDPOINTS,
  AZURE_SCOPES,
  AZURE_TENANT_ID,
  IOS_AUTH_REDIRECT_URI,
  getAuthRedirectUri,
} from '../../src/config/auth.config.ts';
import { FAILURE_COPY, attemptSignIn, createStaleFailureGuard } from '../../src/screens/auth/signInAttempt.ts';
import { useAuthStore } from '../../src/store/auth.store.ts';
import { useUiStore } from '../../src/store/ui.store.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IOS_REDIRECT = 'msauth.com.mountmeru.servicedesk://auth';
const FAKE = {
  idToken: 'fake-microsoft-id-token-NOT-A-JWT',
  code: 'fake-authorization-code',
  token: 'fake-session-token-0002',
};
const KEYS = { token: 'mmg.session.token', issuedAt: 'mmg.session.issuedAt', user: 'mmg.session.user' };

function confirmedBody() {
  return {
    token: FAKE.token,
    user: {
      id: 'user-1',
      email: 'test.user@mountmerugroup.com',
      name: 'Test User',
      role: 'AGENT',
      countryId: 'country-1',
      ldapSamAccount: 'test.user',
      department: 'IT',
      phone: '+255 000 000 000',
    },
    expiresAt: '2026-10-28T18:00:00.000Z',
  };
}

/** Every file under src/, as [repo-relative path, text]. */
function sourceFiles() {
  return readdirSync(path.join(REPO, 'src'), { recursive: true })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => [`src/${f.split(path.sep).join('/')}`, readFileSync(path.join(REPO, 'src', f), 'utf8')]);
}

function source(relative) {
  return readFileSync(path.join(REPO, relative), 'utf8');
}

// ── The network: axios's transport is replaced; everything above it is the real code ──

const sent = [];
let reply;

function serverAnswers({ status = 200, body, noAnswer = false, hang = false }) {
  reply = { status, body, noAnswer, hang };
}

apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, headers: AxiosHeaders.from(config.headers).toJSON() });
  if (reply.hang) return new Promise(() => {});
  if (reply.noAnswer) throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {});
  const response = {
    status: reply.status,
    statusText: String(reply.status),
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(reply.body),
    config,
    request: {},
  };
  if (config.validateStatus(response.status)) return response;
  const code = response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;
  throw new AxiosError(`Request failed with status code ${response.status}`, code, config, {}, response);
};

// ── Microsoft and the sheet: a successful sign-in, unless a test says otherwise ──

function microsoftSucceeds() {
  microsoft.__setMicrosoft({
    promptResult: () => ({ type: 'success', params: { code: FAKE.code }, url: 'redirect-not-logged' }),
    exchange: () => ({ idToken: FAKE.idToken, accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token' }),
  });
}

function microsoftReturns(promptResult) {
  microsoft.__setMicrosoft({ promptResult: () => promptResult, exchange: () => assert.fail('no code exchange expected') });
}

const warnings = [];
const everything = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => {
    const line = args.map(String).join(' ');
    everything.push(line);
    if (level === 'warn') warnings.push(line);
  };
}

const LOGGED_OUT = { user: null, token: null, issuedAt: null, isAuthenticated: false, isLoading: false, signOutMessage: null };

beforeEach(() => {
  reactNative.__setPlatformOS('ios');
  secureStore.__reset();
  microsoft.__reset();
  microsoftSucceeds();
  serverAnswers({ body: confirmedBody() });
  useAuthStore.setState(LOGGED_OUT);
  useUiStore.getState().reset();
  queryClient.clear();
  sent.length = 0;
  warnings.length = 0;
});

afterEach(() => {
  reactNative.__setPlatformOS('ios');
});

async function signIn() {
  const outcome = await attemptSignIn();
  everything.push(JSON.stringify(outcome));
  return outcome;
}

function storedUser() {
  const raw = secureStore.__snapshot()[KEYS.user];
  return raw === undefined ? undefined : JSON.parse(raw);
}

function assertNothingStored() {
  assert.deepEqual(secureStore.__snapshot(), {}, 'nothing may be written to the Keychain');
  assert.equal(useAuthStore.getState().isAuthenticated, false);
}

// ─────────────────────────────────────────────────────────────

describe('iOS redirect', () => {
  test('is exactly msauth.com.mountmeru.servicedesk://auth, the string registered in Entra', () => {
    assert.equal(IOS_AUTH_REDIRECT_URI, IOS_REDIRECT);
    assert.equal(getAuthRedirectUri(), IOS_REDIRECT);
  });

  test('its scheme is app.json `scheme`, so iOS hands the redirect to Setu', () => {
    const appJson = JSON.parse(source('app.json'));
    assert.equal(AUTH_REDIRECT_SCHEME, 'msauth.com.mountmeru.servicedesk');
    assert.equal(IOS_REDIRECT.split('://')[0], AUTH_REDIRECT_SCHEME);
    assert.equal(appJson.expo.scheme, AUTH_REDIRECT_SCHEME);
  });

  test('sign-in sends it to Microsoft and redeems the code with the same string', async () => {
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    const { requests, exchanges } = microsoft.__calls();
    assert.equal(requests[0].config.redirectUri, IOS_REDIRECT);
    assert.equal(exchanges[0].config.redirectUri, IOS_REDIRECT);
  });

  test("Android's msauth:// redirect is nowhere in src/: there is nothing to fall back to", () => {
    for (const [file, text] of sourceFiles()) {
      assert.equal(text.includes('msauth://'), false, `${file} names an msauth:// URI`);
      assert.equal(text.includes('tlz9kcLBCrCtaVd'), false, `${file} holds the Android signature hash`);
    }
  });

  test('on any other platform sign-in refuses (not-configured) before Microsoft is opened', async () => {
    reactNative.__setPlatformOS('android');
    assert.throws(() => getAuthRedirectUri(), /No Microsoft redirect URI is registered for android/);
    const outcome = await signIn();
    assert.equal(outcome.type, 'failed');
    assert.equal(outcome.failure.reason, 'not-configured');
    assert.equal(microsoft.__calls().requests.length, 0, 'no AuthRequest may be built');
    assert.equal(sent.length, 0);
    assertNothingStored();
  });
});

describe('PKCE, scopes and the public client', () => {
  test('PKCE S256: on, the method stated, and the request\'s own verifier redeems the code', async () => {
    await signIn();
    const { requests, exchanges } = microsoft.__calls();
    assert.equal(requests[0].config.usePKCE, true);
    assert.equal(requests[0].config.codeChallengeMethod, 'S256');
    assert.equal(requests[0].config.responseType, 'code');
    assert.equal(exchanges[0].config.extraParams.code_verifier, requests[0].codeVerifier);
  });

  test('scopes are exactly openid profile email offline_access, on the request and the exchange', async () => {
    assert.deepEqual([...AZURE_SCOPES], ['openid', 'profile', 'email', 'offline_access']);
    await signIn();
    const { requests, exchanges } = microsoft.__calls();
    assert.deepEqual(requests[0].config.scopes, ['openid', 'profile', 'email', 'offline_access']);
    assert.deepEqual(exchanges[0].config.scopes, ['openid', 'profile', 'email', 'offline_access']);
  });

  test('the fixed client and tenant IDs, against single-tenant v2.0 endpoints', async () => {
    assert.equal(AZURE_CLIENT_ID, '76c6edf5-a09c-4d1a-9a48-68f84697678b');
    assert.equal(AZURE_TENANT_ID, '24067079-ff6a-4c4e-a5de-7c5ac7ddf4d8');
    const authority = 'https://login.microsoftonline.com/24067079-ff6a-4c4e-a5de-7c5ac7ddf4d8';
    assert.deepEqual(AZURE_ENDPOINTS, {
      authorizationEndpoint: `${authority}/oauth2/v2.0/authorize`,
      tokenEndpoint: `${authority}/oauth2/v2.0/token`,
    });
    await signIn();
    const { requests, prompts, exchanges } = microsoft.__calls();
    assert.equal(requests[0].config.clientId, AZURE_CLIENT_ID);
    assert.equal(exchanges[0].config.clientId, AZURE_CLIENT_ID);
    assert.deepEqual(prompts, [AZURE_ENDPOINTS]);
    assert.deepEqual(exchanges[0].discovery, AZURE_ENDPOINTS);
  });

  test('no client secret on the AuthRequest or the code exchange', async () => {
    await signIn();
    const { requests, exchanges } = microsoft.__calls();
    for (const config of [requests[0].config, exchanges[0].config]) {
      assert.equal('clientSecret' in config, false);
      assert.equal('client_secret' in (config.extraParams ?? {}), false);
    }
  });

  test('no client secret anywhere in src/: no client_secret, no clientSecret, no Entra secret value', () => {
    // Entra client secrets look like `abc8Q~` followed by 34 characters.
    const ENTRA_SECRET = /[A-Za-z0-9_.~-]{3}\dQ~[A-Za-z0-9_.~-]{31,34}/;
    for (const [file, text] of sourceFiles()) {
      assert.equal(/client_secret|clientSecret/.test(text), false, `${file} names a client secret`);
      assert.equal(ENTRA_SECRET.test(text), false, `${file} holds an Entra-secret-shaped value`);
    }
  });
});

describe('the iOS sign-in sheet', () => {
  test('opens ephemeral: preferEphemeralSession is passed to the sheet', async () => {
    await signIn();
    assert.deepEqual(microsoft.__calls().promptOptions, [{ preferEphemeralSession: true }]);
  });

  const CANCELS = [
    ['Cancel on the sheet (iOS answers `cancel`)', { type: 'cancel' }],
    ['the sheet dismissed by the app', { type: 'dismiss' }],
    ['a second sheet while one is open (`locked`)', { type: 'locked' }],
    [
      "Cancel on Microsoft's own page",
      { type: 'error', error: { code: 'access_denied' }, params: { error: 'access_denied', error_subcode: 'cancel' } },
    ],
  ];
  for (const [what, result] of CANCELS) {
    test(`${what}: cancelled, no Service Desk request, nothing stored, no error`, async () => {
      microsoftReturns(result);
      assert.deepEqual(await signIn(), { type: 'cancelled' });
      assert.equal(sent.length, 0);
      assert.equal(microsoft.__calls().exchanges.length, 0);
      assertNothingStored();
      assert.equal(useAuthStore.getState().signOutMessage, null);
    });
  }

  test('the Login screen shows a banner only for `failed`: a cancel just gives the button back', () => {
    const login = source('src/screens/auth/LoginScreen.tsx');
    const calls = login.match(/[^\n]*setFailure\([^)]*\)/g) ?? [];
    assert.ok(calls.length >= 1);
    for (const line of calls) {
      assert.ok(
        /setFailure\(null\)/.test(line) || /if \(outcome\.type === 'failed'\) setFailure\(outcome\.failure\)/.test(line),
        `unexpected banner write: ${line.trim()}`,
      );
    }
  });

  test('the sheet failing to open is a Microsoft failure with a retry, not a crash', async () => {
    microsoft.__setMicrosoft({
      promptResult: () => {
        throw new Error('WebAuthSessionFailedToStartException');
      },
      exchange: () => assert.fail('no code exchange expected'),
    });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'microsoft');
    assert.equal(FAILURE_COPY.microsoft.retryLabel, 'Try again');
    assertNothingStored();
  });

  test("iOS app states: the sheet, or a trip to Authenticator mid-sign-in, never clears the banner", () => {
    let clock = 0;
    let signingIn = true;
    const isStale = createStaleFailureGuard(() => signingIn, () => clock);
    // The sheet over the app (`inactive`), then a switch to Microsoft Authenticator for MFA (`background`).
    assert.equal(isStale('inactive'), false);
    assert.equal(isStale('background'), false);
    clock += 30 * 60 * 1000;
    assert.equal(isStale('active'), false);
    // Idle, Control Centre pulled down for 10 minutes: `inactive` is not leaving the app.
    signingIn = false;
    isStale('inactive');
    clock += 10 * 60 * 1000;
    assert.equal(isStale('active'), false);
  });
});

describe('401 and 403 from AUTH-P2', () => {
  test('401: "Sign-in was refused", with Try again; not a session-ended sign-out', async () => {
    serverAnswers({ status: 401, body: { error: 'Invalid Microsoft token' } });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'token-rejected');
    assert.equal(outcome.failure.status, 401);
    assert.deepEqual(FAILURE_COPY['token-rejected'], {
      title: 'Sign-in was refused',
      message:
        'The Service Desk did not accept your Microsoft sign-in. Make sure you chose your Mount Meru work account, ' +
        'then try again. If it keeps happening, contact IT support.',
      retryLabel: 'Try again',
    });
    assertNothingStored();
    assert.equal(useAuthStore.getState().signOutMessage, null);
  });

  test('403: "Account deactivated", Contact IT support, no retry', async () => {
    serverAnswers({ status: 403, body: { error: 'Account is deactivated' } });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'account-disabled');
    assert.equal(outcome.failure.status, 403);
    assert.deepEqual(FAILURE_COPY['account-disabled'], {
      title: 'Account deactivated',
      message: 'Your account has been deactivated. Contact IT support.',
    });
    assertNothingStored();
  });
});

describe('Keychain', () => {
  test('every read, write and delete uses AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY (no iCloud sync, no backup restore)', async () => {
    await signIn();
    const restarted = await import(`../../src/store/auth.store.ts?restart=${Date.now()}`);
    await restarted.useAuthStore.getState().restoreSession();
    serverAnswers({ body: { message: 'Logged out' } });
    await signOutAndWipe(50);

    const calls = secureStore.__calls();
    assert.deepEqual(new Set(calls.map((c) => c.op)), new Set(['set', 'get', 'delete']));
    for (const call of calls) {
      assert.equal(
        call.options?.keychainAccessible,
        secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        `${call.op} ${call.key} did not pass AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`,
      );
    }
  });
});

describe('sign-out', () => {
  async function signedInWithCache() {
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    queryClient.setQueryData(['tickets', 'list'], { data: [{ id: 'ticket-1' }] });
    useUiStore.getState().setTicketCountryId('country-1');
    sent.length = 0;
  }

  function assertWiped() {
    assert.deepEqual(secureStore.__snapshot(), {}, 'the Keychain session must be gone');
    assert.equal(queryClient.getQueryCache().getAll().length, 0, 'the query cache must be empty');
    assert.equal(useUiStore.getState().ticketCountryId, null, 'the UI store must be reset');
    const state = useAuthStore.getState();
    assert.equal(state.isAuthenticated, false);
    assert.equal(state.token, null);
    assert.equal(state.user, null);
    assert.equal(state.signOutMessage, null, 'a sign-out the person chose shows no message');
  }

  test('POST /auth/logout with the Bearer token first, then the Keychain, query cache and UI store are wiped', async () => {
    await signedInWithCache();
    serverAnswers({ body: { message: 'Logged out' } });
    await signOutAndWipe();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'post');
    assert.equal(sent[0].url, '/auth/logout');
    assert.equal(sent[0].headers.Authorization, `Bearer ${FAKE.token}`);
    assertWiped();
  });

  test('no answer from /auth/logout: still wiped', async () => {
    await signedInWithCache();
    serverAnswers({ noAnswer: true });
    await signOutAndWipe();
    assertWiped();
  });

  test('/auth/logout never answers: gives up after the wait, still wiped', async () => {
    await signedInWithCache();
    serverAnswers({ hang: true });
    await signOutAndWipe(20);
    assertWiped();
  });

  test('a cold start after sign-out starts signed out, with no message', async () => {
    await signedInWithCache();
    serverAnswers({ body: { message: 'Logged out' } });
    await signOutAndWipe();
    const restarted = await import(`../../src/store/auth.store.ts?restart=${Date.now()}`);
    await restarted.useAuthStore.getState().restoreSession();
    assert.equal(restarted.useAuthStore.getState().isAuthenticated, false);
    assert.equal(restarted.useAuthStore.getState().signOutMessage, null);
  });
});

describe('Android lessons kept', () => {
  test('`name` is the name field: a `displayName` on the wire is never read', async () => {
    const both = confirmedBody();
    both.user.displayName = 'Wire Display Name';
    serverAnswers({ body: both });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(storedUser().displayName, 'Test User');

    secureStore.__reset();
    const displayNameOnly = confirmedBody();
    delete displayNameOnly.user.name;
    displayNameOnly.user.displayName = 'Wire Display Name';
    serverAnswers({ body: displayNameOnly });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(storedUser().displayName, 'test.user@mountmerugroup.com', 'falls back to the email, not displayName');
  });

  test('`department` is a string: any other type is a drift line, never a failed sign-in', async () => {
    const body = confirmedBody();
    body.user.department = { id: 'department-1' }; // the departmentId mix-up
    serverAnswers({ body });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal('department' in storedUser(), false);
    assert.ok(warnings.some((line) => line.startsWith('[API drift] AUTH-P2 user.department:')));
  });
});

describe('the developer-token screen stays out of release builds', () => {
  test('only AuthStack loads DevTokenScreen, through a `require` inside a __DEV__ branch', () => {
    const loaders = sourceFiles().filter(
      ([file, text]) => file !== 'src/screens/auth/DevTokenScreen.tsx' && /['"]@\/screens\/auth\/DevTokenScreen['"]/.test(text),
    );
    assert.deepEqual(loaders.map(([file]) => file), ['src/navigation/AuthStack.tsx']);
    const authStack = loaders[0][1];
    assert.match(authStack, /= __DEV__\s*\?\s*\(require\('@\/screens\/auth\/DevTokenScreen'\)/);
    assert.equal(/^import[^\n]*DevTokenScreen/m.test(authStack), false, 'no static import');
  });

  test("the Login screen's developer button sits inside a {__DEV__ ? (…) : null} block", () => {
    const login = source('src/screens/auth/LoginScreen.tsx');
    const devBlocks = login.match(/\{__DEV__ \? \([\s\S]*?\) : null\}/g) ?? [];
    assert.ok(devBlocks.some((block) => block.includes("navigate('DevToken')")));
    const releaseOnly = login.replace(/\{__DEV__ \? \([\s\S]*?\) : null\}/g, '');
    assert.equal(releaseOnly.includes('DevToken'), false);
    assert.equal(releaseOnly.includes('Developer'), false);
  });
});

describe('R6: secrets', () => {
  test('no session token, Microsoft ID token or authorization code in any log line or outcome', () => {
    const text = everything.join('\n');
    assert.ok(everything.length > 0);
    for (const [name, value] of Object.entries(FAKE)) assert.equal(text.includes(value), false, `${name} leaked`);
  });
});
