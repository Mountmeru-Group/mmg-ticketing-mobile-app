// Microsoft sign-in after the redirect, against the backend's CONFIRMED AUTH-P2 contract (02-AUTH.md §7.5).
//
// What is real: attemptSignIn() (the Login screen's sequence), signInWithMicrosoft(), exchangeMicrosoftIdToken(), the
// apiClient with its interceptors, axios itself, the auth store, drift logging and the Login screen's messages.
// What is faked: Microsoft (tests/support/stubs/expo-auth-session.mjs), the phone's Keychain (…/expo-secure-store.mjs)
// and the network: axios's transport adapter answers with the documented responses. Nothing calls UAT or Microsoft.
//
// All tokens below are fake markers; the last test checks none of them ever reaches a log line or an error.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { AxiosError, AxiosHeaders } from 'axios';
import * as microsoft from 'expo-auth-session';
import * as secureStore from 'expo-secure-store';

import { exchangeMicrosoftIdToken } from '../../src/api/auth.api.ts';
import { apiClient } from '../../src/api/client.ts';
import {
  AUTH_SESSION_OPTIONS,
  AZURE_CLIENT_ID,
  AZURE_ENDPOINTS,
  AZURE_SCOPES,
  getAuthRedirectUri,
} from '../../src/config/auth.config.ts';
import { SESSION_TTL_MS, isSessionExpired, useAuthStore } from '../../src/store/auth.store.ts';
import {
  FAILURE_COPY,
  STALE_FAILURE_AFTER_MS,
  attemptSignIn,
  createStaleFailureGuard,
} from '../../src/screens/auth/signInAttempt.ts';

const FAKE = {
  idToken: 'fake-microsoft-id-token-NOT-A-JWT',
  code: 'fake-authorization-code',
  token: 'fake-session-token-0001',
};
const UAT_API = 'https://uat-servicedesk.mountmerugroup.com/api/v1';
const KEYS = { token: 'mmg.session.token', issuedAt: 'mmg.session.issuedAt', user: 'mmg.session.user' };

/** The backend's confirmed 200 body (02 §7.5): same fields, types, role and expiresAt; identifying values are fakes. */
function confirmedBody() {
  return {
    token: FAKE.token,
    user: {
      id: 'user-1',
      email: 'test.user@mountmerugroup.com',
      name: 'Test User',
      role: 'ADMIN',
      countryId: 'country-1',
      ldapSamAccount: 'test.user',
      department: 'IT',
      phone: '+255 000 000 000',
    },
    expiresAt: '2026-10-20T07:45:00.000Z',
  };
}

// ── The network: axios's transport is replaced; everything above it (interceptors, parsing) is the real code ──

const sent = [];
let reply;

/** What the "server" answers next. `body` is sent as raw text, the way a real transport hands it to axios. */
function serverAnswers({ status = 200, contentType = 'application/json; charset=utf-8', body, headers = {}, noAnswer = false }) {
  reply = { status, contentType, body, headers, noAnswer };
}

apiClient.defaults.adapter = async (config) => {
  sent.push({
    method: config.method,
    baseURL: config.baseURL,
    url: config.url,
    headers: AxiosHeaders.from(config.headers).toJSON(),
    withCredentials: config.withCredentials,
    data: config.data,
  });
  if (reply.noAnswer) throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {});
  const response = {
    status: reply.status,
    statusText: String(reply.status),
    headers: AxiosHeaders.from({ 'content-type': reply.contentType, ...reply.headers }),
    data: typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body),
    config,
    request: {},
  };
  if (config.validateStatus(response.status)) return response;
  const code = response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;
  throw new AxiosError(`Request failed with status code ${response.status}`, code, config, {}, response);
};

// ── Microsoft: a successful sign-in on its page, unless a test says otherwise ──

function microsoftSucceeds() {
  microsoft.__setMicrosoft({
    promptResult: () => ({ type: 'success', params: { code: FAKE.code }, url: 'redirect-not-logged' }),
    exchange: () => ({ idToken: FAKE.idToken, accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token' }),
  });
}

// ── Console: drift lines are captured (and checked) instead of printed ──

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
  secureStore.__reset();
  microsoft.__reset();
  microsoftSucceeds();
  serverAnswers({ body: confirmedBody() });
  useAuthStore.setState(LOGGED_OUT);
  sent.length = 0;
  warnings.length = 0;
});

const outcomes = [];
afterEach(() => {
  everything.push(JSON.stringify(outcomes.splice(0)));
});

/** One tap of "Sign in with Microsoft", exactly as the Login screen runs it. */
async function signIn() {
  const outcome = await attemptSignIn();
  outcomes.push(outcome);
  return outcome;
}

function storedUser() {
  const raw = secureStore.__snapshot()[KEYS.user];
  return raw === undefined ? undefined : JSON.parse(raw);
}

function assertNothingStored() {
  assert.deepEqual(secureStore.__snapshot(), {}, 'nothing may be written to SecureStore');
  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(useAuthStore.getState().token, null);
}

// ─────────────────────────────────────────────────────────────

describe('what the app sends', () => {
  test('Microsoft step: PKCE code flow with the configured client ID, scopes and fixed redirect URI', async () => {
    await signIn();
    const { requests, prompts, promptOptions, exchanges } = microsoft.__calls();
    assert.equal(requests.length, 1);
    const { config } = requests[0];
    assert.equal(config.clientId, AZURE_CLIENT_ID);
    assert.equal(config.redirectUri, getAuthRedirectUri());
    assert.equal(config.redirectUri, 'msauth.com.mountmeru.servicedesk://auth'); // iOS (iOS-6); Android's is on dev
    assert.equal(config.responseType, 'code');
    assert.equal(config.usePKCE, true);
    assert.equal(config.prompt, 'select_account');
    assert.deepEqual(config.scopes, [...AZURE_SCOPES]);
    assert.deepEqual(prompts, [AZURE_ENDPOINTS]);
    assert.deepEqual(promptOptions, [AUTH_SESSION_OPTIONS]);
    // The code is redeemed with the same redirect URI and the request's own PKCE verifier; no secret.
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0].config.code, FAKE.code);
    assert.equal(exchanges[0].config.redirectUri, config.redirectUri);
    assert.equal(exchanges[0].config.extraParams.code_verifier, requests[0].codeVerifier);
    assert.equal('clientSecret' in exchanges[0].config, false);
  });

  test('AUTH-P2: POST {UAT}/auth/microsoft/mobile with exactly { idToken }, no Authorization header, no cookies', async () => {
    // Even with a leftover token in memory, the sign-in request must not carry it (skipAuth).
    useAuthStore.setState({ token: 'fake-stale-token', issuedAt: Date.now() });
    await signIn();
    assert.equal(sent.length, 1);
    const [request] = sent;
    assert.equal(request.method, 'post');
    assert.equal(request.baseURL, UAT_API);
    assert.equal(request.url, '/auth/microsoft/mobile');
    assert.deepEqual(JSON.parse(request.data), { idToken: FAKE.idToken });
    assert.match(request.headers['Content-Type'], /application\/json/);
    assert.equal(request.headers.Accept, 'application/json');
    assert.equal(request.headers.Authorization, undefined);
    assert.equal(request.withCredentials, false);
  });
});

describe('(a) the confirmed 200 response', () => {
  test('signs in: the token and the ADMIN user are stored, and the app is authenticated', async () => {
    const before = Date.now();
    assert.deepEqual(await signIn(), { type: 'signed-in' });

    const stored = secureStore.__snapshot();
    assert.equal(stored[KEYS.token], FAKE.token);
    assert.ok(Number(stored[KEYS.issuedAt]) >= before && Number(stored[KEYS.issuedAt]) <= Date.now());
    assert.deepEqual(storedUser(), {
      id: 'user-1',
      email: 'test.user@mountmerugroup.com',
      role: 'ADMIN',
      displayName: 'Test User',
      ldapSamAccount: 'test.user',
      countryId: 'country-1',
    });

    const state = useAuthStore.getState();
    assert.equal(state.isAuthenticated, true);
    assert.equal(state.token, FAKE.token);
    assert.equal(state.user.role, 'ADMIN');
    assert.equal(state.signOutMessage, null);
    assert.deepEqual(warnings, [], 'the confirmed body must not produce a single drift line');
  });

  test('`name` becomes `displayName`: the renamed field that made the pre-fix app reject this body', async () => {
    await signIn();
    assert.equal(storedUser().displayName, 'Test User');
    assert.equal('name' in storedUser(), false);
  });

  test('`department` and `phone` are accepted but not kept: AuthUser has neither (03 §C)', async () => {
    await signIn();
    assert.equal('department' in storedUser(), false);
    assert.equal('phone' in storedUser(), false);
  });

  test('expiresAt is validated and reaches the app unchanged; the session clock is still 8 h from sign-in', async () => {
    const session = await exchangeMicrosoftIdToken(FAKE.idToken);
    assert.equal(session.expiresAt, '2026-10-20T07:45:00.000Z');
    // Documented behaviour (02 §5.4): expiresAt is not stored or enforced yet; the 8-hour rule runs from issuedAt.
    await signIn();
    const issuedAt = Number(secureStore.__snapshot()[KEYS.issuedAt]);
    assert.equal(Object.keys(secureStore.__snapshot()).some((k) => /expires/i.test(k)), false);
    assert.equal(isSessionExpired(issuedAt, issuedAt + SESSION_TTL_MS - 1), false);
    assert.equal(isSessionExpired(issuedAt, issuedAt + SESSION_TTL_MS), true);
  });

  test('the stored session comes back after an app restart', async () => {
    await signIn();
    // A second, fresh copy of the store module: what a cold start loads. Same SecureStore.
    const restarted = await import(`../../src/store/auth.store.ts?restart=${Date.now()}`);
    assert.notEqual(restarted.useAuthStore, useAuthStore);
    await restarted.useAuthStore.getState().restoreSession();
    const state = restarted.useAuthStore.getState();
    assert.equal(state.isAuthenticated, true);
    assert.equal(state.token, FAKE.token);
    assert.equal(state.user.role, 'ADMIN');
    assert.equal(state.user.displayName, 'Test User');
    assert.equal(state.signOutMessage, null);
  });
});

describe('(b) unknown extra fields', () => {
  test('three unknown extra fields: still signs in, the stored user is unchanged, nothing is logged', async () => {
    const body = confirmedBody();
    body.sessionId = 'extra-top-level'; // 1
    body.user.departmentId = 'extra-department-id'; // 2
    body.user.avatarUrl = null; // 3
    serverAnswers({ body });

    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(secureStore.__snapshot()[KEYS.token], FAKE.token);
    assert.equal(storedUser().role, 'ADMIN');
    assert.equal(storedUser().displayName, 'Test User');
    assert.equal('departmentId' in storedUser(), false);
    assert.equal('avatarUrl' in storedUser(), false);
    assert.deepEqual(warnings, [], 'extra fields are never read, so not even a drift line');
  });
});

describe('(c) optional fields removed', () => {
  test('department, countryId, ldapSamAccount and phone removed: still signs in; each is logged as drift', async () => {
    const body = confirmedBody();
    for (const key of ['department', 'countryId', 'ldapSamAccount', 'phone']) delete body.user[key];
    serverAnswers({ body });

    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(storedUser().role, 'ADMIN');
    assert.equal(storedUser().countryId, null);
    assert.equal(storedUser().ldapSamAccount, null);
    for (const field of ['user.department', 'user.countryId', 'user.ldapSamAccount', 'user.phone']) {
      assert.ok(
        warnings.some((line) => line.startsWith(`[API drift] AUTH-P2 ${field}:`)),
        `expected a drift line for ${field}`,
      );
    }
  });

  test('`name` removed as well: still signs in, and the email stands in for the display name', async () => {
    const body = confirmedBody();
    for (const key of ['name', 'department', 'countryId', 'ldapSamAccount', 'phone']) delete body.user[key];
    serverAnswers({ body });

    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(storedUser().displayName, 'test.user@mountmerugroup.com');
    assert.ok(warnings.some((line) => line.startsWith('[API drift] AUTH-P2 user.name:')));
  });
});

describe('(d) each required field missing in turn', () => {
  const REQUIRED = [
    ['token', (b) => delete b.token],
    ['user.id', (b) => delete b.user.id],
    ['user.email', (b) => delete b.user.email],
    ['user.role', (b) => delete b.user.role],
    ['expiresAt', (b) => delete b.expiresAt],
  ];
  for (const [field, remove] of REQUIRED) {
    test(`${field} missing: refused as unexpected-response, naming ${field}; nothing stored`, async () => {
      const body = confirmedBody();
      remove(body);
      serverAnswers({ body });

      const outcome = await signIn();
      assert.equal(outcome.type, 'failed');
      assert.equal(outcome.failure.reason, 'unexpected-response');
      assert.equal(outcome.failure.status, 200);
      assert.ok(outcome.failure.detail.includes(`${field}:`), `the detail should name ${field}: ${outcome.failure.detail}`);
      assert.equal(FAILURE_COPY[outcome.failure.reason].title, "Sign-in couldn't be completed");
      assertNothingStored();
    });
  }

  test('an unknown role value is refused too (every gate is keyed on it)', async () => {
    const body = confirmedBody();
    body.user.role = 'SUPERUSER';
    serverAnswers({ body });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'unexpected-response');
    assert.match(outcome.failure.detail, /user\.role: unknown value "SUPERUSER"/);
    assertNothingStored();
  });
});

describe('(e) error statuses: each has its own message', () => {
  const CASES = [
    [400, 'idToken is required', 'bad-request'],
    [401, 'Invalid Microsoft token', 'token-rejected'],
    [403, 'Account is deactivated', 'account-disabled'],
    [500, 'Internal server error', 'server'],
  ];
  const seen = new Map();

  for (const [status, error, reason] of CASES) {
    test(`${status} → ${reason}; nothing stored`, async () => {
      serverAnswers({ status, body: { error } });
      const outcome = await signIn();
      assert.equal(outcome.type, 'failed');
      assert.equal(outcome.failure.reason, reason);
      assert.equal(outcome.failure.status, status);
      assert.ok(outcome.failure.detail.includes(`"${error}"`), 'the server message is quoted in the developer detail');
      assertNothingStored();
      // A 401 here is a refused sign-in, not an expired session: no "Your session has ended" sign-out.
      assert.equal(useAuthStore.getState().signOutMessage, null);
      seen.set(status, FAILURE_COPY[reason]);
    });
  }

  test('the four messages are different from each other, and 403 says the account is deactivated', () => {
    assert.equal(seen.size, 4);
    const copies = [...seen.values()];
    assert.equal(new Set(copies.map((c) => c.title)).size, 4, 'four different titles');
    assert.equal(new Set(copies.map((c) => c.message)).size, 4, 'four different messages');
    assert.match(seen.get(403).title, /deactivated/i);
    assert.match(seen.get(403).message, /deactivated/i);
  });

  test('a 403 is "deactivated" whatever its wording (mapped by status, not text)', async () => {
    serverAnswers({ status: 403, body: { error: 'Forbidden' } });
    assert.equal((await signIn()).failure.reason, 'account-disabled');
  });
});

describe('(f) a 200 that is not JSON', () => {
  const HTML = '<!DOCTYPE html><html><head><title>MMG Service Desk</title></head><body><div id="root"></div></body></html>';

  test('HTML body (text/html): rejected before any parsing; nothing stored', async () => {
    serverAnswers({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    const outcome = await signIn();
    assert.equal(outcome.type, 'failed');
    assert.equal(outcome.failure.reason, 'unexpected-response');
    assert.equal(outcome.failure.status, 200);
    assert.match(outcome.failure.detail, /not a JSON object/);
    assertNothingStored();
  });

  test('HTML body mislabelled application/json: also rejected', async () => {
    serverAnswers({ status: 200, contentType: 'application/json', body: HTML });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'unexpected-response');
    assertNothingStored();
  });
});

describe('other outcomes on the same path', () => {
  test('Microsoft page closed: cancelled, no request to the Service Desk, nothing stored, no error', async () => {
    microsoft.__setMicrosoft({ promptResult: () => ({ type: 'dismiss' }), exchange: () => assert.fail('no exchange') });
    assert.deepEqual(await signIn(), { type: 'cancelled' });
    assert.equal(sent.length, 0);
    assertNothingStored();
  });

  test('no answer from the Service Desk: network', async () => {
    serverAnswers({ noAnswer: true });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'network');
    assertNothingStored();
  });

  test('a 404 from a server without the route: endpoint-missing (there is no "no account" 404)', async () => {
    serverAnswers({ status: 404, contentType: 'text/html', body: '<pre>Cannot POST /api/v1/auth/microsoft/mobile</pre>' });
    assert.equal((await signIn()).failure.reason, 'endpoint-missing');
  });

  test('SecureStore refuses: storage failure, not signed in, and a restart cleans up the partial write', async () => {
    secureStore.__failOn(KEYS.user);
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'storage');
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    // The token and issuedAt were written before the user write failed. The next cold start wipes them.
    const restarted = await import(`../../src/store/auth.store.ts?restart=${Date.now()}`);
    await restarted.useAuthStore.getState().restoreSession();
    assert.equal(restarted.useAuthStore.getState().isAuthenticated, false);
    assert.deepEqual(secureStore.__snapshot(), {});
  });
});

describe('stale failure banner (Login, audit item 5)', () => {
  const MIN = 60 * 1000;
  function guard({ signingIn = false } = {}) {
    let clock = 0;
    const isStale = createStaleFailureGuard(() => signingIn, () => clock);
    return { isStale, advance: (ms) => (clock += ms), setSigningIn: (v) => (signingIn = v) };
  }

  test('left the app idle for 5 minutes or more: the old banner is cleared on return', () => {
    const g = guard();
    assert.equal(g.isStale('background'), false);
    g.advance(STALE_FAILURE_AFTER_MS);
    assert.equal(g.isStale('active'), true);
  });

  test('back within 5 minutes (e.g. to message IT): the banner stays', () => {
    const g = guard();
    g.isStale('background');
    g.advance(2 * MIN);
    assert.equal(g.isStale('active'), false);
  });

  test('away during a sign-in (Microsoft\'s page): never cleared, however long it took', () => {
    const g = guard({ signingIn: true });
    g.isStale('background');
    g.advance(30 * MIN);
    assert.equal(g.isStale('active'), false);
  });

  test('each return is judged once: a second "active" without leaving again clears nothing', () => {
    const g = guard();
    g.isStale('background');
    g.advance(10 * MIN);
    assert.equal(g.isStale('active'), true);
    assert.equal(g.isStale('active'), false);
  });

  test('a cold start cannot bring a banner back: no failure or message is ever written to SecureStore', async () => {
    serverAnswers({ status: 401, body: { error: 'Invalid Microsoft token' } });
    await signIn();
    assert.deepEqual(secureStore.__snapshot(), {});
    const restarted = await import(`../../src/store/auth.store.ts?restart=${Date.now()}`);
    await restarted.useAuthStore.getState().restoreSession();
    assert.equal(restarted.useAuthStore.getState().signOutMessage, null);
  });
});

describe('R6: secrets', () => {
  test('no session token, Microsoft ID token or authorization code in any log line or failure detail', () => {
    // `everything` holds every console line of this file plus every sign-in outcome (with its failure detail).
    const text = everything.join('\n');
    assert.ok(everything.length > 0);
    for (const [name, value] of Object.entries(FAKE)) assert.equal(text.includes(value), false, `${name} leaked`);
  });
});
