// Email and password sign-in (AUTH-P1, 02-AUTH.md §8), against an ASSUMED contract: the endpoint is deployed on UAT
// but its source is not in the web clone, so every plausible request and response shape is tried here.
//
// What is real: attemptPasswordSignIn() (the Login form's sequence), signInWithPassword() with its path discovery, the
// ONE session reader shared with Microsoft sign-in, the apiClient with its interceptors, axios itself, the auth store,
// drift logging, and the form's messages. What is faked: the phone's Keystore (tests/support/stubs/expo-secure-store.mjs)
// and the network: axios's transport adapter answers per path. Nothing calls UAT or PROD.
//
// The password, the token and the email below are fake markers; the R6 test checks the password never reaches a log
// line, an error, an outcome, the store or SecureStore, and leaves the device only in the sign-in request itself.
//
// iOS (iOS-5g): ported from Android dev d8626bc. The path is CONFIRMED (POST /auth/mobile/login, the backend team,
// 2026-11-06) and is the only one iOS calls, so Android's "path discovery" section is "one path" here: the same
// failure cases, on that path alone, and never another (ANDROID-DELTA.md §10.7). The request and the reading of the 200
// are Android's (Ronit: 1a, 2a). The code lives in iOS's own modules (src/api/passwordSignIn.api.ts,
// src/screens/auth/passwordSignInAttempt.ts), which only a UAT build bundles. iOS-only checks:
// tests/auth/ios-password-sign-in.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosError, AxiosHeaders } from 'axios';
import * as microsoft from 'expo-auth-session';
import * as secureStore from 'expo-secure-store';

import { exchangeMicrosoftIdToken } from '../../src/api/auth.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { neutralCredentialMessage } from '../../src/api/passwordSignIn.api.ts';
import { EMAIL_SIGN_IN_ENABLED } from '../../src/config/env.ts';
import { SESSION_TTL_MS, isReauthDue, isSessionExpired, useAuthStore } from '../../src/store/auth.store.ts';
import {
  PASSWORD_FAILURE_COPY,
  attemptPasswordSignIn,
  checkEmailSignIn,
  passwordFailureRef,
  passwordFailureText,
} from '../../src/screens/auth/passwordSignInAttempt.ts';
import { attemptSignIn } from '../../src/screens/auth/signInAttempt.ts';
import { MOBILE_PASSWORD_PATH } from '../../src/types/mobile-password-contract.ts';
import { isCountryLockedAgent, isTriageAgent } from '../../src/utils/roles.ts';
import { countrySelectorMode, listCountryParam } from '../../src/utils/ticket-filters.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const FAKE = {
  password: 'fake-Pa55word-NEVER-LOGGED',
  token: 'fake-session-token-PW-0001',
  idToken: 'fake-microsoft-id-token-PW',
  code: 'fake-authorization-code-PW',
};
const EMAIL = 'play.reviewer@mountmerugroup.com';
const UAT_API = 'https://uat-servicedesk.mountmerugroup.com/api/v1';
const KEYS = { token: 'mmg.session.token', issuedAt: 'mmg.session.issuedAt', user: 'mmg.session.user', fullAuthAt: 'mmg.auth.fullAuthAt' };
const P1 = MOBILE_PASSWORD_PATH;

/** A plausible 200: AUTH-P2's shape (A32 asked for it), for an AGENT locked to one country. Values are fakes. */
function body200() {
  return {
    token: FAKE.token,
    user: { id: 'user-1', email: EMAIL, name: 'Play Reviewer', role: 'AGENT', countryId: 'country-tz', ldapSamAccount: null },
    expiresAt: '2026-11-05T16:00:00.000Z',
  };
}

/** AUTH-2 `GET /auth/me` (01 AUTH-2): the server's own record of the session. */
function meBody(user = {}) {
  return { user: { id: 'user-1', email: EMAIL, displayName: 'Play Reviewer', role: 'AGENT', ldapSamAccount: null, countryId: 'country-tz', ...user } };
}

const HTML_404 = { status: 404, contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><body><pre>Cannot POST</pre></body></html>' };
const json = (status, body) => ({ status, contentType: 'application/json; charset=utf-8', body });

// ── The network: axios's transport answers per path; everything above it is the real code ──

const sent = [];
let routes;

/** What each path answers. A function is called with the request; anything not listed answers Express's HTML 404. */
function server(table) {
  routes = { '/auth/me': json(200, meBody()), '/auth/logout': json(200, { message: 'Logged out' }), ...table };
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
  const route = routes[config.url];
  const reply = typeof route === 'function' ? route(config) : (route ?? HTML_404);
  if (reply.noAnswer) throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {});
  const response = {
    status: reply.status,
    statusText: String(reply.status),
    headers: AxiosHeaders.from({ 'content-type': reply.contentType, ...(reply.headers ?? {}) }),
    data: typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body),
    config,
    request: {},
  };
  if (config.validateStatus(response.status)) return response;
  const code = response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;
  throw new AxiosError(`Request failed with status code ${response.status}`, code, config, {}, response);
};

// ── Console: every line is captured (and checked) instead of printed ──

/** Every console line of this file, in order. Drift lines are logged once per run (drift.ts), so look for them here. */
const logs = [];
/** Every console line, plus every outcome and what the store and SecureStore held after each test (R6). */
const everything = [];
const warnings = [];
const debugs = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => {
    const line = args.map(String).join(' ');
    logs.push(line);
    everything.push(line);
    if (level === 'warn') warnings.push(line);
    if (level === 'debug') debugs.push(line);
  };
}

const LOGGED_OUT = { user: null, token: null, issuedAt: null, fullAuthAt: null, isAuthenticated: false, isLoading: false, signOutMessage: null };

beforeEach(() => {
  secureStore.__reset();
  microsoft.__reset();
  server({ [P1]: json(200, body200()) });
  useAuthStore.setState(LOGGED_OUT);
  sent.length = 0;
  warnings.length = 0;
  debugs.length = 0;
});

const outcomes = [];
const outcomeDumps = [];
afterEach(() => {
  // For R6: every outcome, and what the store and SecureStore hold, are searched for the password at the end.
  outcomeDumps.push(JSON.stringify(outcomes));
  everything.push(JSON.stringify(outcomes.splice(0)));
  everything.push(JSON.stringify(secureStore.__snapshot()));
  everything.push(JSON.stringify(useAuthStore.getState()));
});

/** One tap of the form's "Sign in", exactly as EmailSignInForm runs it. */
async function signIn(email = EMAIL, password = FAKE.password) {
  const outcome = await attemptPasswordSignIn(email, password);
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

const passwordRequests = () => sent.filter((r) => r.url === MOBILE_PASSWORD_PATH);

// ─────────────────────────────────────────────────────────────

describe('what the app sends', () => {
  test('one POST with { username, email, password }: the same input under both names; no Authorization, no cookies', async () => {
    useAuthStore.setState({ token: 'fake-stale-token', issuedAt: Date.now() }); // must not ride along
    await signIn(`  ${EMAIL}  `);
    const [request] = sent;
    assert.equal(request.method, 'post');
    assert.equal(request.baseURL, UAT_API);
    assert.equal(request.url, '/auth/mobile/login');
    // Why both keys: the clone's /auth/login reads `username` (auth.controller.ts:9-12), A32 proposed `email`.
    assert.deepEqual(JSON.parse(request.data), { username: EMAIL, email: EMAIL, password: FAKE.password });
    assert.match(request.headers['Content-Type'], /application\/json/);
    assert.equal(request.headers.Accept, 'application/json');
    assert.equal(request.headers.Authorization, undefined);
    assert.equal(request.withCredentials, false);
  });

  test('the password is sent as typed: never trimmed (a space can be part of it)', async () => {
    await signIn(EMAIL, ' spaced pass ');
    assert.equal(JSON.parse(sent[0].data).password, ' spaced pass ');
  });

  test('email sign-in is on for UAT builds only (the tests run as a development build, which is UAT)', () => {
    assert.equal(EMAIL_SIGN_IN_ENABLED, true);
    assert.match(read('src/config/env.ts'), /export const EMAIL_SIGN_IN_ENABLED: boolean = APP_ENV === 'UAT';/);
    // iOS: and the build-time gate (tests/auth/ios-password-sign-in.test.mjs).
    assert.match(read('src/screens/auth/LoginScreen.tsx'), /\{EMAIL_SIGN_IN_ENABLED && EmailSignInForm \? \(\s*<EmailSignInForm/);
  });
});

describe('checked before sending: nothing invalid ever leaves the phone', () => {
  const CASES = [
    ['', FAKE.password, { email: 'Enter your email address.' }],
    ['   ', FAKE.password, { email: 'Enter your email address.' }],
    ['play.reviewer', FAKE.password, { email: 'Enter a valid email address, like name@mountmerugroup.com.' }],
    ['play reviewer@mountmerugroup.com', FAKE.password, { email: 'Enter a valid email address, like name@mountmerugroup.com.' }],
    ['play.reviewer@mountmerugroup', FAKE.password, { email: 'Enter a valid email address, like name@mountmerugroup.com.' }],
    [EMAIL, '', { password: 'Enter your password.' }],
    ['', '', { email: 'Enter your email address.', password: 'Enter your password.' }],
  ];
  for (const [email, password, expected] of CASES) {
    test(`email ${JSON.stringify(email)}, password ${password ? 'given' : 'empty'}: refused on the phone; no request`, async () => {
      assert.deepEqual(checkEmailSignIn({ email, password }), expected);
      const outcome = await signIn(email, password);
      assert.equal(outcome.failure.reason, 'invalid-input');
      assert.equal(sent.length, 0);
      assertNothingStored();
    });
  }

  test('a valid email (trimmed) and any non-empty password pass', () => {
    assert.equal(checkEmailSignIn({ email: ` ${EMAIL} `, password: 'x' }), null);
    assert.equal(checkEmailSignIn({ email: 'a.b-c@sub.mountmerugroup.co.tz', password: ' ' }), null);
  });
});

describe('one path: POST /auth/mobile/login, confirmed (iOS)', () => {
  test('the path is the confirmed one, and the only one', () => {
    assert.equal(MOBILE_PASSWORD_PATH, '/auth/mobile/login');
  });

  test('it answers 200: signs in there, with one request', async () => {
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(passwordRequests().map((r) => r.url), [P1]);
    assert.ok(debugs.some((line) => line === `[auth] email sign-in: POST /api/v1${P1} answered HTTP 200: token as "token", name as "name", expiry as "expiresAt", countryId sent`));
  });

  test('it answers HTML 404 (no such route): "Email sign-in isn\'t available", offering Microsoft; one request; nothing stored', async () => {
    server({});
    const outcome = await signIn();
    assert.equal(outcome.type, 'failed');
    assert.equal(outcome.failure.reason, 'unavailable');
    assert.equal(outcome.failure.path, null);
    assert.equal(outcome.failure.status, 404);
    assert.deepEqual(sent.map((r) => r.url), [P1], 'no other path is tried');
    assert.equal(PASSWORD_FAILURE_COPY.unavailable.title, "Email sign-in isn't available");
    assert.match(PASSWORD_FAILURE_COPY.unavailable.message, /Sign in with Microsoft instead/);
    assert.equal(PASSWORD_FAILURE_COPY.unavailable.microsoft, true);
    assert.ok(debugs.some((line) => /POST \/api\/v1\/auth\/mobile\/login → 404 with an HTML body \(no such route on uat-servicedesk/.test(line)));
    assertNothingStored();
  });

  test('a JSON error is the route\'s own answer: it stops there', async () => {
    server({ [P1]: json(401, { error: 'Invalid credentials' }) });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'credentials-rejected');
    assert.equal(outcome.failure.path, P1);
    assert.deepEqual(sent.map((r) => r.url), [P1]);
    assertNothingStored();
  });

  test('a JSON 404 is "refused", not "no such route"', async () => {
    server({ [P1]: json(404, { error: 'Password sign-in is not enabled here' }) });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'refused');
    assert.equal(outcome.failure.serverMessage, 'Password sign-in is not enabled here');
    assert.deepEqual(sent.map((r) => r.url), [P1]);
  });

  test('a 404 that is not HTML (plain text) is a server problem', async () => {
    server({ [P1]: { status: 404, contentType: 'text/plain', body: 'Not Found' } });
    assert.equal((await signIn()).failure.reason, 'server');
    assert.deepEqual(sent.map((r) => r.url), [P1]);
  });

  test('a 200 with an HTML body is rejected (the SPA fallback is not an answer)', async () => {
    server({ [P1]: { status: 200, contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><body><div id="root"></div></body></html>' } });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'unexpected-response');
    assert.equal(outcome.failure.status, 200);
    assert.match(outcome.failure.detail, /not a JSON object/);
    assertNothingStored();
  });

  test('HTML labelled application/json on a 200: also rejected', async () => {
    server({ [P1]: { status: 200, contentType: 'application/json', body: '<!DOCTYPE html><html></html>' } });
    assert.equal((await signIn()).failure.reason, 'unexpected-response');
    assertNothingStored();
  });

  test('a 429 is "rate-limited", and the next attempt goes to the same path', async () => {
    server({ [P1]: { status: 429, contentType: 'text/plain', body: 'Too many requests' } });
    assert.equal((await signIn()).failure.reason, 'rate-limited');
    sent.length = 0;
    server({ [P1]: json(200, body200()) });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.deepEqual(sent.map((r) => r.url), [P1]);
  });

  test('no answer at all: network; no spinner left behind (the outcome comes back)', async () => {
    server({ [P1]: { noAnswer: true } });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'network');
    assert.deepEqual(sent.map((r) => r.url), [P1]);
    assertNothingStored();
  });

  test('a 200 { user } with no token: "isn\'t available", offering Microsoft', async () => {
    server({ [P1]: json(200, { user: { id: 'user-1', email: EMAIL, displayName: 'Play Reviewer', role: 'AGENT' } }) });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'no-token');
    assert.equal(outcome.failure.path, P1);
    assert.match(outcome.failure.detail, /token \| accessToken \| sessionToken: expected non-empty string, got undefined/);
    assert.equal(PASSWORD_FAILURE_COPY['no-token'].title, "Email sign-in isn't available");
    assert.equal(PASSWORD_FAILURE_COPY['no-token'].microsoft, true);
    assert.equal(passwordFailureRef(outcome.failure), 'no-token · HTTP 200 · /auth/mobile/login');
    assertNothingStored();
  });
});

describe('the response, read tolerantly', () => {
  for (const key of ['token', 'accessToken', 'sessionToken']) {
    test(`the token under \`${key}\`: signs in, and that token is the session's`, async () => {
      const body = body200();
      delete body.token;
      body[key] = FAKE.token;
      server({ [P1]: json(200, body) });
      assert.deepEqual(await signIn(), { type: 'signed-in' });
      assert.equal(secureStore.__snapshot()[KEYS.token], FAKE.token);
      assert.equal(useAuthStore.getState().token, FAKE.token);
      assert.ok(debugs.some((line) => line.includes(`token as "${key}"`)));
    });
  }

  test('a blank `token` with a real `accessToken`: the first non-blank one wins', async () => {
    const body = { ...body200(), token: '', accessToken: FAKE.token };
    server({ [P1]: json(200, body) });
    await signIn();
    assert.equal(useAuthStore.getState().token, FAKE.token);
  });

  for (const key of ['name', 'displayName', 'fullName']) {
    test(`the name under \`${key}\` becomes displayName`, async () => {
      const body = body200();
      delete body.user.name;
      body.user[key] = 'Play Reviewer';
      server({ [P1]: json(200, body) });
      await signIn();
      assert.equal(storedUser().displayName, 'Play Reviewer');
      for (const wire of ['name', 'fullName']) assert.equal(wire in storedUser(), false);
    });
  }

  test('no name under any key: the email stands in, and one drift line names all three keys', async () => {
    const body = body200();
    delete body.user.name;
    server({ [P1]: json(200, body) });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(storedUser().displayName, EMAIL);
    assert.ok(logs.includes('[API drift] AUTH-P1 user.name | user.displayName | user.fullName: none holds a non-blank string; the email stands in'));
  });

  test('no email in the answer: the typed one stands in', async () => {
    const body = body200();
    delete body.user.email;
    server({ [P1]: json(200, body) });
    await signIn();
    assert.equal(storedUser().email, EMAIL);
  });

  for (const key of ['expiresAt', 'expires_at', 'expiry']) {
    test(`the expiry under \`${key}\`: signs in; still the 8-hour clock from sign-in`, async () => {
      const body = body200();
      delete body.expiresAt;
      body[key] = '2026-11-05T16:00:00.000Z';
      server({ [P1]: json(200, body) });
      assert.deepEqual(await signIn(), { type: 'signed-in' });
      assert.ok(debugs.some((line) => line.includes(`expiry as "${key}"`)));
    });
  }

  test('no expiry at all: signs in; the app\'s own 8-hour clock applies, exactly as after Microsoft sign-in', async () => {
    const body = body200();
    delete body.expiresAt;
    server({ [P1]: json(200, body) });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    const issuedAt = Number(secureStore.__snapshot()[KEYS.issuedAt]);
    assert.equal(Object.keys(secureStore.__snapshot()).some((k) => /expires/i.test(k)), false);
    assert.equal(isSessionExpired(issuedAt, issuedAt + SESSION_TTL_MS - 1), false);
    assert.equal(isSessionExpired(issuedAt, issuedAt + SESSION_TTL_MS), true);
    assert.ok(logs.includes('[API drift] AUTH-P1 expiresAt | expires_at | expiry: none holds a non-blank string; the 8-hour clock applies'));
  });

  test('unknown extra fields at both levels: still signs in, never read, not even a drift line', async () => {
    const body = body200();
    body.refreshToken = 'extra';
    body.session = { id: 'extra', nested: { deep: true } };
    body.constructor = 'extra';
    body.user.departmentId = 'extra';
    body.user.avatarUrl = null;
    body.user.permissions = ['a', 'b'];
    body.user.toString = 'extra';
    server({ [P1]: json(200, body) });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(storedUser().role, 'AGENT');
    for (const key of ['departmentId', 'avatarUrl', 'permissions', 'toString']) assert.equal(Object.hasOwn(storedUser(), key), false, key);
    assert.deepEqual(warnings, []);
  });

  test('the stored session is AuthUser exactly, and survives an app restart', async () => {
    await signIn();
    assert.deepEqual(storedUser(), {
      id: 'user-1', email: EMAIL, role: 'AGENT', displayName: 'Play Reviewer', ldapSamAccount: null, countryId: 'country-tz',
    });
    const restarted = await import(`../../src/store/auth.store.ts?restart=${Date.now()}`);
    await restarted.useAuthStore.getState().restoreSession();
    const state = restarted.useAuthStore.getState();
    assert.equal(state.isAuthenticated, true);
    assert.equal(state.token, FAKE.token);
    assert.equal(state.user.countryId, 'country-tz');
  });
});

describe('required fields: each missing in turn is refused, naming it; nothing stored', () => {
  const CASES = [
    ['the token (all three keys)', (b) => delete b.token, 'no-token', 'token | accessToken | sessionToken: expected non-empty string, got undefined'],
    ['the token, blank', (b) => (b.token = '  '), 'no-token', 'token | accessToken | sessionToken: expected non-empty string, got blank string'],
    ['user', (b) => delete b.user, 'unexpected-response', 'user: expected object, got undefined'],
    ['user.id', (b) => delete b.user.id, 'unexpected-response', 'user.id: expected non-empty string, got undefined'],
    ['user.role', (b) => delete b.user.role, 'unexpected-response', 'user.role: expected string, got undefined'],
    ['user.role, unknown', (b) => (b.user.role = 'SUPERUSER'), 'unexpected-response', 'user.role: unknown value "SUPERUSER"'],
  ];
  for (const [what, remove, reason, problem] of CASES) {
    test(`${what} → ${reason}`, async () => {
      const body = body200();
      remove(body);
      server({ [P1]: json(200, body) });
      const outcome = await signIn();
      assert.equal(outcome.type, 'failed');
      assert.equal(outcome.failure.reason, reason);
      assert.equal(outcome.failure.status, 200);
      assert.ok(outcome.failure.detail.includes(problem), outcome.failure.detail);
      assertNothingStored();
    });
  }

  test('a body that is not an object (a JSON array): unexpected-response', async () => {
    server({ [P1]: json(200, [body200()]) });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'unexpected-response');
    assert.match(outcome.failure.detail, /body: expected object, got array/);
    assertNothingStored();
  });
});

describe('countryId: a missing one can never turn an agent into a triage agent', () => {
  function signedInUser() {
    return useAuthStore.getState().user;
  }

  test('present: kept, no AUTH-2 call; the AGENT is locked to their country', async () => {
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(sent.some((r) => r.url === '/auth/me'), false);
    const user = signedInUser();
    assert.equal(user.countryId, 'country-tz');
    assert.equal(isCountryLockedAgent(user), true);
    assert.equal(isTriageAgent(user), false);
    assert.equal(countrySelectorMode(user), 'locked');
    assert.equal(listCountryParam(user, 'country-ke'), 'country-tz', 'the list is scoped to their own country');
  });

  test('null, as sent: kept as null, no AUTH-2 call; the server says this AGENT is a triage agent', async () => {
    server({ [P1]: json(200, { ...body200(), user: { ...body200().user, countryId: null } }) });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(sent.some((r) => r.url === '/auth/me'), false);
    const user = signedInUser();
    assert.equal(user.countryId, null);
    assert.equal(isTriageAgent(user), true);
    assert.equal(countrySelectorMode(user), 'switch');
  });

  test('missing: GET /auth/me with the NEW token, before the sign-in completes; its countryId is used; still locked', async () => {
    const body = body200();
    delete body.user.countryId;
    server({ [P1]: json(200, body), '/auth/me': json(200, meBody({ countryId: 'country-ug' })) });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    const me = sent.find((r) => r.url === '/auth/me');
    assert.equal(me.method, 'get');
    assert.equal(me.headers.Authorization, `Bearer ${FAKE.token}`);
    assert.equal(me.withCredentials, false);
    assert.ok(sent.indexOf(me) > sent.findIndex((r) => r.url === P1));
    const user = signedInUser();
    assert.equal(user.countryId, 'country-ug');
    assert.equal(storedUser().countryId, 'country-ug');
    assert.equal(isCountryLockedAgent(user), true);
    assert.equal(isTriageAgent(user), false);
    assert.ok(logs.includes('[API drift] AUTH-P1 user.countryId: expected string | null, got undefined'));
    assert.ok(debugs.some((line) => line.endsWith('countryId not sent, so asking GET /auth/me')));
  });

  test('missing, and AUTH-2 says null: the agent is a triage agent because the SERVER says so', async () => {
    const body = body200();
    delete body.user.countryId;
    server({ [P1]: json(200, body), '/auth/me': json(200, meBody({ countryId: null })) });
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    assert.equal(signedInUser().countryId, null);
    assert.equal(isTriageAgent(signedInUser()), true);
  });

  test('missing: AUTH-2 also fills a missing name and email from the server\'s record, never overriding sent ones', async () => {
    const body = body200();
    delete body.user.countryId;
    delete body.user.name;
    delete body.user.email;
    server({ [P1]: json(200, body), '/auth/me': json(200, meBody({ displayName: 'Server Name', email: 'server.copy@mountmerugroup.com' })) });
    await signIn();
    assert.equal(storedUser().displayName, 'Server Name');
    assert.equal(storedUser().email, 'server.copy@mountmerugroup.com');

    useAuthStore.setState(LOGGED_OUT);
    secureStore.__reset();
    const sentName = body200();
    delete sentName.user.countryId;
    server({ [P1]: json(200, sentName), '/auth/me': json(200, meBody({ displayName: 'Server Name' })) });
    await signIn();
    assert.equal(storedUser().displayName, 'Play Reviewer');
  });

  const REFUSALS = [
    ['AUTH-2 answers 500', json(500, { error: 'Internal server error' }), /→ HTTP 500/],
    ['AUTH-2 answers 401', json(401, { error: 'Unauthorized' }), /→ HTTP 401/],
    ['AUTH-2 gets no answer', { noAnswer: true }, /got no answer \(network\)/],
    ['AUTH-2 answers HTML', { status: 200, contentType: 'text/html', body: '<html></html>' }, /→ HTTP 200/],
    ['AUTH-2 has no countryId either', json(200, { user: { id: 'user-1', email: EMAIL, displayName: 'x', role: 'AGENT', ldapSamAccount: null } }), /user\.countryId is missing/],
    ['AUTH-2 is a different user', json(200, meBody({ id: 'user-2' })), /different user\.id/],
    ['AUTH-2 has a different role', json(200, meBody({ role: 'ADMIN' })), /different user\.role/],
    ['AUTH-2 has no user', json(200, { ok: true }), /user: expected object, got undefined/],
  ];
  for (const [what, reply, detail] of REFUSALS) {
    test(`missing, and ${what}: the sign-in is REFUSED; the new session is ended on the server; nothing stored`, async () => {
      const body = body200();
      delete body.user.countryId;
      server({ [P1]: json(200, body), '/auth/me': reply });
      const outcome = await signIn();
      assert.equal(outcome.type, 'failed');
      assert.equal(outcome.failure.reason, 'session-unconfirmed');
      assert.match(outcome.failure.detail, detail);
      assert.equal(outcome.failure.path, P1);
      const logout = sent.find((r) => r.url === '/auth/logout');
      assert.ok(logout, 'AUTH-3 ends the refused session');
      assert.equal(logout.headers.Authorization, `Bearer ${FAKE.token}`);
      assert.match(PASSWORD_FAILURE_COPY['session-unconfirmed'].message, /country/);
      assertNothingStored();
      assert.equal(useAuthStore.getState().signOutMessage, null, 'a 401 here is not a "session ended" sign-out');
    });
  }

  test('a countryId of the wrong type (a number) counts as missing: AUTH-2 is asked', async () => {
    server({ [P1]: json(200, { ...body200(), user: { ...body200().user, countryId: 7 } }), '/auth/me': json(200, meBody()) });
    await signIn();
    assert.ok(sent.some((r) => r.url === '/auth/me'));
    assert.equal(storedUser().countryId, 'country-tz');
  });
});

describe('error statuses: each has its own message', () => {
  const CASES = [
    [400, 'Username and password are required', 'bad-request'],
    [401, 'Invalid credentials', 'credentials-rejected'],
    [429, 'Too many login attempts. Try again in 15 minutes.', 'rate-limited'],
    [500, 'Internal server error', 'server'],
  ];
  const seen = new Map();
  for (const [status, error, reason] of CASES) {
    test(`${status} → ${reason}; nothing stored`, async () => {
      server({ [P1]: json(status, { error }) });
      const outcome = await signIn();
      assert.equal(outcome.type, 'failed');
      assert.equal(outcome.failure.reason, reason);
      assert.equal(outcome.failure.status, status);
      assert.ok(outcome.failure.detail.includes(`"${error}"`), 'the server message is quoted in the developer detail');
      assertNothingStored();
      assert.equal(useAuthStore.getState().signOutMessage, null);
      seen.set(status, passwordFailureText(outcome.failure));
    });
  }

  test('the four messages differ from each other; 429 says plainly that there were too many attempts', () => {
    assert.equal(seen.size, 4);
    assert.equal(new Set([...seen.values()].map((t) => t.title)).size, 4);
    assert.equal(new Set([...seen.values()].map((t) => t.message)).size, 4);
    assert.equal(seen.get(429).title, 'Too many attempts');
    assert.match(seen.get(429).message, /Too many sign-in attempts have been made/);
  });

  test('401 shows the server\'s own message as the message', () => {
    assert.deepEqual(seen.get(401), { title: 'Sign-in was refused', message: 'Invalid credentials', quote: null });
  });

  test('other JSON answers keep their own message and quote the server\'s', () => {
    assert.equal(seen.get(500).quote, 'Internal server error');
    assert.equal(seen.get(429).quote, 'Too many login attempts. Try again in 15 minutes.');
  });

  test('a plain-text 429 (the general limiter) is rate-limited too, with no quote', async () => {
    server({ [P1]: { status: 429, contentType: 'text/plain', body: 'Too many requests, please try again later.' } });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'rate-limited');
    assert.equal(passwordFailureText(outcome.failure).quote, null);
  });

  test('403 → account-disabled, whatever its wording', async () => {
    server({ [P1]: json(403, { error: 'Forbidden' }) });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'account-disabled');
    assert.match(passwordFailureText(outcome.failure).message, /deactivated/);
  });

  test('an IIS error page (HTML 502) is the server\'s problem, not a refusal', async () => {
    server({ [P1]: { status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' } });
    assert.equal((await signIn()).failure.reason, 'server');
  });
});

describe('wrong credentials never say whether the email or the password was wrong', () => {
  const REVEALING = [
    'User not found in Active Directory', // the clone's LDAP path (05 C.23)
    'User not found',
    'No such user',
    'Unknown email',
    'Email does not exist',
    'Incorrect password',
    'Wrong password',
    'Invalid password',
    'Password is incorrect',
    'This email is not registered',
  ];
  for (const said of REVEALING) {
    test(`401 "${said}": replaced by the app's message, which names both`, async () => {
      server({ [P1]: json(401, { error: said }) });
      const outcome = await signIn();
      assert.equal(outcome.failure.serverMessage, null);
      const text = passwordFailureText(outcome.failure);
      assert.equal(text.message, "The email or password isn't right. Check both, then try again.");
      assert.equal(text.quote, null);
      assert.equal(JSON.stringify(text).includes(said), false);
    });
  }

  const NEUTRAL = ['Invalid credentials', 'Invalid email or password', 'Incorrect username or password', 'Account is deactivated', 'Sign-in failed'];
  for (const said of NEUTRAL) {
    test(`"${said}" is shown as sent`, () => {
      assert.equal(neutralCredentialMessage(said), said);
    });
  }

  test('blank, or longer than 200 characters: not shown', () => {
    assert.equal(neutralCredentialMessage('   '), null);
    assert.equal(neutralCredentialMessage('x'.repeat(201)), null);
  });

  test('a revealing message on a JSON 404 is not quoted either', async () => {
    server({ [P1]: json(404, { error: 'User not found' }) });
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'refused');
    assert.deepEqual(passwordFailureText(outcome.failure), {
      title: "Email sign-in wasn't accepted",
      message: PASSWORD_FAILURE_COPY.refused.message,
      quote: null,
    });
  });
});

describe('the session is stored exactly as after Microsoft sign-in', () => {
  test('same store and keys; the 8-hour clock from now; a new 15 days from now (a password is a full credential check)', async () => {
    const before = Date.now();
    assert.deepEqual(await signIn(), { type: 'signed-in' });
    const stored = secureStore.__snapshot();
    assert.deepEqual(Object.keys(stored).sort(), [KEYS.fullAuthAt, KEYS.issuedAt, KEYS.token, KEYS.user].sort());
    const issuedAt = Number(stored[KEYS.issuedAt]);
    const fullAuthAt = Number(stored[KEYS.fullAuthAt]);
    assert.ok(issuedAt >= before && issuedAt <= Date.now());
    assert.ok(fullAuthAt >= before && fullAuthAt <= Date.now());
    const state = useAuthStore.getState();
    assert.equal(state.isAuthenticated, true);
    assert.equal(state.fullAuthAt, fullAuthAt);
    assert.equal(isReauthDue(state.fullAuthAt), false);
  });

  test('a password sign-in restarts the 15 days even when an older date is stored', async () => {
    useAuthStore.setState({ fullAuthAt: Date.now() - 10 * 24 * 60 * 60 * 1000 });
    const before = Date.now();
    await signIn();
    assert.ok(useAuthStore.getState().fullAuthAt >= before);
  });

  test('SecureStore refuses: storage failure, not signed in', async () => {
    secureStore.__failOn(KEYS.user);
    const outcome = await signIn();
    assert.equal(outcome.failure.reason, 'storage');
    assert.equal(useAuthStore.getState().isAuthenticated, false);
  });
});

describe('the SSO path is unaffected', () => {
  const ssoBody = () => ({
    token: FAKE.token,
    user: { id: 'user-1', email: EMAIL, name: 'Play Reviewer', role: 'ADMIN', countryId: 'country-tz', ldapSamAccount: null, department: null, phone: null },
    expiresAt: '2026-11-05T16:00:00.000Z',
  });

  test('AUTH-P2 does not take the email path\'s aliases: `accessToken` alone is refused', async () => {
    const body = ssoBody();
    delete body.token;
    body.accessToken = FAKE.token;
    server({ '/auth/microsoft/mobile': json(200, body) });
    await assert.rejects(exchangeMicrosoftIdToken(FAKE.idToken), (e) => e.reason === 'unexpected-response' && /token: expected non-empty string, got undefined/.test(e.detail));
  });

  test('AUTH-P2 still requires expiresAt and user.email; `displayName` is not read as its name', async () => {
    for (const remove of [(b) => delete b.expiresAt, (b) => delete b.user.email]) {
      const body = ssoBody();
      remove(body);
      server({ '/auth/microsoft/mobile': json(200, body) });
      await assert.rejects(exchangeMicrosoftIdToken(FAKE.idToken), (e) => e.reason === 'unexpected-response');
    }
    const body = ssoBody();
    delete body.user.name;
    body.user.displayName = 'Not Read';
    server({ '/auth/microsoft/mobile': json(200, body) });
    const session = await exchangeMicrosoftIdToken(FAKE.idToken);
    assert.equal(session.user.displayName, EMAIL);
  });

  test('AUTH-P2 never calls AUTH-2, even without a countryId: unchanged behaviour', async () => {
    const body = ssoBody();
    delete body.user.countryId;
    server({ '/auth/microsoft/mobile': json(200, body) });
    const session = await exchangeMicrosoftIdToken(FAKE.idToken);
    assert.equal(session.user.countryId, null);
    assert.equal(sent.some((r) => r.url === '/auth/me'), false);
  });

  test('a full Microsoft sign-in still signs in, after email attempts in the same run', async () => {
    server({});
    await signIn();
    microsoft.__setMicrosoft({
      promptResult: () => ({ type: 'success', params: { code: FAKE.code }, url: 'redirect-not-logged' }),
      exchange: () => ({ idToken: FAKE.idToken }),
    });
    server({ '/auth/microsoft/mobile': json(200, ssoBody()) });
    sent.length = 0;
    assert.deepEqual(await attemptSignIn(), { type: 'signed-in' });
    assert.deepEqual(sent.map((r) => r.url), ['/auth/microsoft/mobile']);
    assert.equal(storedUser().role, 'ADMIN');
  });
});

describe('the screen, read from its source (React Native does not run under Node)', () => {
  const formSrc = read('src/screens/auth/EmailSignInForm.tsx');
  const login = read('src/screens/auth/LoginScreen.tsx');

  test('above the fold unchanged: the pill first, then OR between two hairlines, then the quiet text action', () => {
    assert.ok(login.indexOf('<SignInButton busy={signingIn} onPress={startSignIn} />') < login.indexOf('<EmailSignInForm'));
    assert.match(formSrc, /<View style=\{styles\.hairline\} \/>\s*<Text style=\{styles\.or\}>OR<\/Text>\s*<View style=\{styles\.hairline\} \/>/);
    assert.match(formSrc, /hairline: \{ flex: 1, height: StyleSheet\.hairlineWidth, backgroundColor: colors\.border \}/);
    assert.match(formSrc, />Sign in with email instead<\/Text>\s*<Ionicons name="chevron-forward"/);
    const action = formSrc.match(/  action: \{[^}]*\}/)[0];
    assert.doesNotMatch(action, /border|backgroundColor/, 'no border, no fill');
  });

  test('the email field: email keyboard, no autocapitalise, no autocorrect', () => {
    const email = formSrc.match(/<TextInput\s+value=\{email\}[\s\S]*?\/>/)[0];
    for (const prop of ['keyboardType="email-address"', 'autoCapitalize="none"', 'autoCorrect={false}']) assert.ok(email.includes(prop), prop);
  });

  test('the password field: masked, with a show/hide toggle that carries a label (iOS: accessibilityLabel, which VoiceOver reads)', () => {
    assert.match(formSrc, /secureTextEntry=\{!shown\}/);
    assert.match(formSrc, /accessibilityLabel=\{shown \? 'Hide password' : 'Show password'\}/);
  });

  test('"Sign in": brand red, 52 dp, disabled while in flight (laid out and tappable: tests/login/sign-in-button.test.mjs)', () => {
    assert.equal(read('src/theme/brand.ts').includes('submit: { height: 52, radius: 26, gap: 16 }'), true);
    assert.match(read('src/screens/auth/emailFormLayout.ts'), /backgroundColor: colors\.primary,/);
    assert.match(formSrc, /accessibilityState=\{\{ disabled: locked, busy \}\}\s*disabled=\{locked\}/);
    assert.match(formSrc, /const locked = busy \|\| ssoBusy;/);
  });

  test('the reveal: in place (no route), opacity and translateY on the native driver, skipped under reduce-motion', () => {
    assert.doesNotMatch(formSrc, /navigation|navigate\(/);
    assert.match(formSrc, /if \(reduceMotionEnabled\(\)\) \{\s*reveal\.setValue\(1\);\s*return;\s*\}/);
    assert.match(formSrc, /Animated\.timing\(reveal, \{ toValue: 1, duration, easing: ease, useNativeDriver: true \}\)/);
    assert.match(formSrc, /opacity: reveal,\s*transform: \[\{ translateY: reveal\.interpolate\(/);
  });

  test('the keyboard never covers "Sign in": the screen avoids it and keeps taps (the scroll itself: sign-in-button.test.mjs)', () => {
    assert.match(login, /<KeyboardAvoidingView behavior="padding" style=\{styles\.keyboard\}>/);
    assert.match(login, /keyboardShouldPersistTaps="handled"/);
    assert.match(login, /onContentSizeChange=\{revealSubmit\}/);
  });

  test('the Microsoft pill stays visible, and is locked while an email sign-in runs', () => {
    assert.match(login, /style=\{\[styles\.button, emailBusy \? styles\.locked : null\]\}/);
    assert.match(login, /locked: \{ opacity: 0\.5, pointerEvents: 'none' \}/);
    assert.match(login, /run=\{once\}/, 'one single flight for both sign-ins');
  });

  test('the password: component state only; cleared on success, on failure and on unmount; never logged', () => {
    assert.match(formSrc, /const \[password, setPassword\] = useState\(''\);/);
    assert.match(formSrc, /\} finally \{\s*inFlight\.current = false;\s*setPassword\(''\);/);
    assert.match(formSrc, /useEffect\(\(\) => \(\) => setPassword\(''\), \[\]\);/);
    for (const rel of [
      'src/screens/auth/EmailSignInForm.tsx', 'src/screens/auth/passwordSignInAttempt.ts', 'src/screens/auth/signInAttempt.ts',
      'src/api/passwordSignIn.api.ts', 'src/api/auth.api.ts',
    ]) {
      assert.doesNotMatch(read(rel), /console\.\w+\([^)]*password/i, rel);
      // Storage only through the auth store's setSession(), which never sees the password.
      assert.doesNotMatch(read(rel), /\bSecureStore\.|AsyncStorage|setItem/, rel);
    }
  });
});

describe('R6: secrets', () => {
  test('the password never appears in a log line, an error, an outcome, the store or SecureStore', () => {
    // `everything` holds every console line of this file, every outcome (with its failure detail), and the store and
    // SecureStore after every test.
    const text = everything.join('\n');
    assert.ok(everything.length > 100);
    assert.equal(text.includes(FAKE.password), false, 'the password leaked');
    for (const name of ['idToken', 'code']) assert.equal(text.includes(FAKE[name]), false, `${name} leaked`);
  });

  test('the password leaves the device only in a sign-in request body, never in a header or another call', async () => {
    server({ [P1]: json(200, { ...body200(), user: { ...body200().user, countryId: undefined } }) });
    await signIn();
    for (const request of sent) {
      assert.equal(JSON.stringify(request.headers).includes(FAKE.password), false);
      if (request.url !== MOBILE_PASSWORD_PATH) assert.equal(String(request.data ?? '').includes(FAKE.password), false, request.url);
    }
    assert.ok(sent.some((r) => r.url === '/auth/me'), 'the AUTH-2 call was made, without it');
  });

  test('no session token in a log line or an outcome (only where it belongs: SecureStore, the store, the Bearer header)', () => {
    assert.ok(logs.length > 20 && outcomeDumps.length > 50);
    assert.equal(logs.join('\n').includes(FAKE.token), false);
    assert.equal(outcomeDumps.join('\n').includes(FAKE.token), false);
  });
});
