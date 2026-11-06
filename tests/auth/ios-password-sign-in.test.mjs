// iOS-5g: what iOS adds to Android's email and password sign-in (tests/auth/password-sign-in.test.mjs is Android's):
//   (b) ONE path, the backend team's confirmed POST /auth/mobile/login; never POST /auth/login, never any other;
//   (c) the gate: UAT only, at run time (EMAIL_SIGN_IN_ENABLED, as Android) and at build time (LoginScreen.tsx), so a
//       production bundle has no email sign-in code or string (scripts/verify-release-bundle.js proves it on bundles);
//   (e) the session exactly as after Microsoft sign-in: the Keychain class, the 15-day clock, the reinstall wipe,
//       sign-out (AUTH-3);
//   (f) the password: never written anywhere, and dropped by the form on success, failure and unmount; the iOS keyboard.
// What is real: the sign-in modules, the apiClient, axios, the auth store. Faked: the network (axios's adapter) and the
// Keychain (tests/support/stubs/expo-secure-store.mjs). Nothing calls UAT or PROD.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosError, AxiosHeaders } from 'axios';
import * as secureStore from 'expo-secure-store';

import { signOutAndWipe } from '../../src/api/auth.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { PasswordSignInError, signInWithPassword } from '../../src/api/passwordSignIn.api.ts';
import { attemptPasswordSignIn } from '../../src/screens/auth/passwordSignInAttempt.ts';
import { forgetStoredFullAuth, useAuthStore, wipeStoredSession } from '../../src/store/auth.store.ts';
import { MOBILE_PASSWORD_PATH } from '../../src/types/mobile-password-contract.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
/** Code only: comments may name any path in prose. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function sourceFiles(dir = 'src') {
  return readdirSync(path.join(REPO, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}
const SRC = sourceFiles();

const PASSWORD = 'fake-iOS-Pa55word-NEVER-STORED';
const TOKEN = 'fake-session-token-IOS-PW';
const EMAIL = 'uat.tester@mountmerugroup.com';
const KEYS = { token: 'mmg.session.token', issuedAt: 'mmg.session.issuedAt', user: 'mmg.session.user', fullAuthAt: 'mmg.auth.fullAuthAt' };
const LOGGED_OUT = { user: null, token: null, issuedAt: null, fullAuthAt: null, isAuthenticated: false, isLoading: false, signOutMessage: null };

const json = (status, body) => ({ status, contentType: 'application/json; charset=utf-8', body });
const HTML_404 = { status: 404, contentType: 'text/html; charset=utf-8', body: '<pre>Cannot POST</pre>' };
const user = (over = {}) => ({ id: 'user-1', email: EMAIL, name: 'UAT Tester', role: 'AGENT', countryId: 'country-tz', ldapSamAccount: null, ...over });

// ── The network ──
const sent = [];
let routes = {};
apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, headers: AxiosHeaders.from(config.headers).toJSON(), data: config.data });
  const reply = routes[config.url] ?? HTML_404;
  if (reply.noAnswer) throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {});
  const response = {
    status: reply.status,
    statusText: String(reply.status),
    headers: AxiosHeaders.from({ 'content-type': reply.contentType }),
    data: typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body),
    config,
    request: {},
  };
  if (config.validateStatus(response.status)) return response;
  throw new AxiosError(`Request failed with status code ${response.status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response);
};
const lines = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) console[level] = (...args) => lines.push(args.map(String).join(' '));

beforeEach(() => {
  secureStore.__reset();
  useAuthStore.setState(LOGGED_OUT);
  sent.length = 0;
  routes = {
    [MOBILE_PASSWORD_PATH]: json(200, { token: TOKEN, user: user(), expiresAt: '2026-11-06T18:00:00.000Z' }),
    '/auth/me': json(200, { user: { ...user(), displayName: 'UAT Tester' } }),
    '/auth/logout': json(200, { message: 'Logged out' }),
  };
});

// ── (b) one path ─────────────────────────────────────────────

describe('(b) one path: POST /auth/mobile/login, and never POST /auth/login', () => {
  /** Every way an email sign-in can go, as a table of what the server answers. */
  const SCENARIOS = {
    'signed in': {},
    'signed in, countryId from AUTH-2': { [MOBILE_PASSWORD_PATH]: json(200, { token: TOKEN, user: user({ countryId: undefined }) }) },
    'AUTH-2 refuses, so AUTH-3 ends the session': { [MOBILE_PASSWORD_PATH]: json(200, { token: TOKEN, user: user({ countryId: undefined }) }), '/auth/me': json(401, { error: 'Session expired' }) },
    'no such route (HTML 404)': { [MOBILE_PASSWORD_PATH]: HTML_404 },
    'wrong password (401)': { [MOBILE_PASSWORD_PATH]: json(401, { error: 'Invalid credentials' }) },
    'deactivated (403)': { [MOBILE_PASSWORD_PATH]: json(403, { error: 'Account deactivated' }) },
    'rate-limited (429)': { [MOBILE_PASSWORD_PATH]: { status: 429, contentType: 'text/plain', body: 'Too many requests' } },
    'server error (500)': { [MOBILE_PASSWORD_PATH]: json(500, { error: 'Internal server error' }) },
    offline: { [MOBILE_PASSWORD_PATH]: { noAnswer: true } },
    'no token in the 200': { [MOBILE_PASSWORD_PATH]: json(200, { user: user() }) },
  };
  const ALLOWED = [`post ${MOBILE_PASSWORD_PATH}`, 'get /auth/me', 'post /auth/logout'];

  for (const [name, table] of Object.entries(SCENARIOS)) {
    test(`${name}: only ${MOBILE_PASSWORD_PATH} (then AUTH-2 / AUTH-3 where Android calls them), one sign-in request`, async () => {
      Object.assign(routes, table);
      await attemptPasswordSignIn(EMAIL, PASSWORD);
      const calls = sent.map((r) => `${r.method} ${r.url}`);
      assert.ok(calls.every((c) => ALLOWED.includes(c)), calls.join(', '));
      assert.equal(calls.filter((c) => c === `post ${MOBILE_PASSWORD_PATH}`).length, 1, 'exactly one sign-in request: no fallback');
      assert.ok(!calls.some((c) => /\/auth\/login\b/.test(c)), 'never /auth/login');
    });
  }

  test('the confirmed path, and the body Android sends to it (Ronit, 1a)', async () => {
    await signInWithPassword(EMAIL, PASSWORD);
    assert.equal(MOBILE_PASSWORD_PATH, '/auth/mobile/login');
    assert.deepEqual(JSON.parse(sent[0].data), { username: EMAIL, email: EMAIL, password: PASSWORD });
  });

  test('src/ names no other auth path: no list, no "/auth/login", no "/auth/test-login" (code, not comments)', () => {
    const AUTH_PATHS = /['"`]\/auth\/[A-Za-z/-]+['"`]/g;
    const found = new Set();
    for (const rel of SRC) for (const m of code(rel).matchAll(AUTH_PATHS)) found.add(`${rel}: ${m[0]}`);
    assert.deepEqual([...found].sort(), [
      "src/api/auth.api.ts: '/auth/config'",
      "src/api/auth.api.ts: '/auth/logout'",
      "src/api/auth.api.ts: '/auth/me'",
      "src/api/passwordSignIn.api.ts: '/auth/logout'",
      "src/api/passwordSignIn.api.ts: '/auth/me'",
      "src/screens/auth/DevTokenScreen.tsx: '/auth/me'", // __DEV__ only (iOS-9 list); never in a release bundle
      "src/types/mobile-password-contract.ts: '/auth/mobile/login'",
      "src/types/mobile-sso-contract.ts: '/auth/microsoft/mobile'",
    ]);
    assert.doesNotMatch(code('src/types/mobile-password-contract.ts'), /MOBILE_PASSWORD_PATHS|\[\s*'\/auth/);
    assert.doesNotMatch(code('src/api/passwordSignIn.api.ts'), /answeringPath|tryOrder|for \(const path of/);
  });

  test('the release check fails any bundle that holds "/auth/login"', () => {
    assert.match(read('scripts/verify-release-bundle.js'), /const FORBIDDEN_NEEDLES = \[[^\]]*'\/auth\/login'\];/);
  });
});

// ── (c) the gate ─────────────────────────────────────────────

describe('(c) UAT only: at run time, and at build time', () => {
  const login = code('src/screens/auth/LoginScreen.tsx');
  const GATED = [
    'src/screens/auth/EmailSignInForm.tsx', 'src/screens/auth/passwordSignInAttempt.ts', 'src/api/passwordSignIn.api.ts',
    'src/types/mobile-password-contract.ts',
  ];

  test('run time: EMAIL_SIGN_IN_ENABLED is APP_ENV === UAT (Android\'s line), and Login renders the form only then', () => {
    assert.match(read('src/config/env.ts'), /^export const EMAIL_SIGN_IN_ENABLED: boolean = APP_ENV === 'UAT';$/m);
    assert.match(login, /\{EMAIL_SIGN_IN_ENABLED && EmailSignInForm \? \(\s*<EmailSignInForm/);
    assert.equal(login.split('<EmailSignInForm').length - 1, 1, 'rendered in one place');
  });

  test('build time: Login loads the form through a require that Expo and Metro remove from a production build', () => {
    assert.match(
      login,
      /const EmailSignInForm: typeof import\('\.\/EmailSignInForm'\)\.EmailSignInForm \| null =\s*process\.env\.EXPO_PUBLIC_APP_ENV !== 'PROD'\s*\? \(require\('\.\/EmailSignInForm'\) as typeof import\('\.\/EmailSignInForm'\)\)\.EmailSignInForm\s*: null;/,
    );
    // The same test env.ts uses: anything but PROD is UAT (resolveEnvironment).
    assert.match(read('src/config/env.ts'), /const requested = process\.env\.EXPO_PUBLIC_APP_ENV;\s*if \(requested !== 'PROD'\) return 'UAT';/);
    assert.doesNotMatch(login, /^import [^\n]*from '\.\/EmailSignInForm'/m, 'no static import');
  });

  test('nothing outside the gated modules imports them (a static import would carry them into every bundle)', () => {
    const importers = {};
    for (const rel of SRC) {
      const text = code(rel);
      for (const target of GATED) {
        const name = path.basename(target).replace(/\.tsx?$/, '');
        // A value import; `import type` is erased and carries nothing.
        const re = new RegExp(`^import (?!type )[^;]*from '[^']*${name}';`, 'm');
        if (re.test(text)) (importers[target] ??= []).push(rel);
      }
    }
    assert.deepEqual(importers, {
      'src/screens/auth/passwordSignInAttempt.ts': ['src/screens/auth/EmailSignInForm.tsx'],
      'src/api/passwordSignIn.api.ts': ['src/screens/auth/passwordSignInAttempt.ts'],
      'src/types/mobile-password-contract.ts': ['src/api/passwordSignIn.api.ts'],
    });
    assert.doesNotMatch(read('src/types/index.ts'), /mobile-password-contract/, 'not re-exported from the types barrel');
  });

  test('the release check: production must hold none of the email sign-in\'s modules or strings, preview all of them', () => {
    const script = read('scripts/verify-release-bundle.js');
    for (const rel of GATED) assert.ok(script.includes(`'${rel}'`), rel);
    assert.match(script, /if \(profile === 'production'\) \{\s*if \(emailModules\.length\) problems\.push/);
    assert.match(script, /for \(const \[k, c\] of Object\.entries\(emailStrings\)\) if \(c > 0\) problems\.push/);
    assert.match(script, /if \(missing\.length\) problems\.push\(`the preview bundle lacks email sign-in module/);
  });
});

// ── (e) the session ──────────────────────────────────────────

describe('(e) the session is stored, aged and ended exactly as after Microsoft sign-in', () => {
  test('every session item goes to the Keychain with AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, the token\'s class', async () => {
    const outcome = await attemptPasswordSignIn(EMAIL, PASSWORD);
    assert.deepEqual(outcome, { type: 'signed-in' });
    const writes = secureStore.__calls().filter((c) => c.op === 'set');
    assert.deepEqual(writes.map((c) => c.key).sort(), Object.values(KEYS).sort());
    for (const call of writes) assert.deepEqual(call.options, { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }, call.key);
    assert.equal(secureStore.__snapshot()[KEYS.token], TOKEN);
  });

  test('the 15-day clock starts at the email sign-in (fullAuthAt = now), as Android\'s', async () => {
    const before = Date.now();
    await attemptPasswordSignIn(EMAIL, PASSWORD);
    const fullAuthAt = useAuthStore.getState().fullAuthAt;
    assert.ok(fullAuthAt >= before && fullAuthAt <= Date.now());
    assert.equal(Number(secureStore.__snapshot()[KEYS.fullAuthAt]), fullAuthAt);
  });

  test('a reinstall wipes it all, as after Microsoft sign-in (installMarker.ts)', async () => {
    await attemptPasswordSignIn(EMAIL, PASSWORD);
    await wipeStoredSession();
    await forgetStoredFullAuth();
    assert.deepEqual(secureStore.__snapshot(), {});
  });

  test('sign-out sends AUTH-3 with the email session\'s token, then wipes the Keychain', async () => {
    await attemptPasswordSignIn(EMAIL, PASSWORD);
    sent.length = 0;
    await signOutAndWipe();
    assert.deepEqual(sent.map((r) => `${r.method} ${r.url}`), ['post /auth/logout']);
    assert.equal(sent[0].headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(secureStore.__snapshot(), {});
    assert.equal(useAuthStore.getState().isAuthenticated, false);
  });
});

// ── (f) the password ─────────────────────────────────────────

describe('(f) the password is never written, and the form drops it', () => {
  const form = read('src/screens/auth/EmailSignInForm.tsx');

  test('never in the Keychain, the store, a log line, or any error, whatever the server answers', async () => {
    const answers = [
      json(200, { token: TOKEN, user: user(), expiresAt: '2026-11-06T18:00:00.000Z' }),
      json(200, { token: TOKEN, user: user({ countryId: undefined }) }), // AUTH-2 called with the new token
      json(401, { error: 'Invalid credentials' }),
      json(400, { error: 'Validation error' }),
      json(403, { error: 'Account deactivated' }),
      json(500, { error: 'Internal server error' }),
      HTML_404,
      { noAnswer: true },
      json(200, { user: user() }),
    ];
    for (const answer of answers) {
      secureStore.__reset();
      useAuthStore.setState(LOGGED_OUT);
      routes[MOBILE_PASSWORD_PATH] = answer;
      try {
        await signInWithPassword(EMAIL, PASSWORD);
      } catch (error) {
        assert.ok(error instanceof PasswordSignInError);
        const fields = JSON.stringify({ message: error.message, detail: error.detail, serverMessage: error.serverMessage, path: error.path });
        assert.equal(fields.includes(PASSWORD), false, `the error (${error.reason})`);
      }
      const outcome = await attemptPasswordSignIn(EMAIL, PASSWORD);
      assert.equal(JSON.stringify(outcome).includes(PASSWORD), false, 'the outcome');
      assert.equal(JSON.stringify(secureStore.__snapshot()).includes(PASSWORD), false, 'the Keychain');
      assert.equal(JSON.stringify(useAuthStore.getState()).includes(PASSWORD), false, 'the store');
    }
    // Only the sign-in request itself carries it; AUTH-2 and AUTH-3 never do.
    for (const request of sent.filter((r) => r.url !== MOBILE_PASSWORD_PATH)) {
      assert.equal(String(request.data ?? '').includes(PASSWORD) || JSON.stringify(request.headers).includes(PASSWORD), false, request.url);
    }
    assert.equal(lines.join('\n').includes(PASSWORD), false, 'a log line');
  });

  test('no storage API in the email sign-in\'s modules: the session goes only through setSession()', () => {
    for (const rel of ['src/screens/auth/EmailSignInForm.tsx', 'src/screens/auth/passwordSignInAttempt.ts', 'src/api/passwordSignIn.api.ts']) {
      const src = code(rel);
      assert.doesNotMatch(src, /\bSecureStore\.|AsyncStorage|setItem|persist\(|MMKV/, rel);
      assert.doesNotMatch(src, /console\.\w+\([^)]*\bpassword\b/i, rel);
    }
  });

  test('the form drops it on success, on failure and on unmount', () => {
    assert.match(form, /\} finally \{\s*inFlight\.current = false;\s*setPassword\(''\); \/\/ signed in or not, the password goes/);
    assert.match(form, /useEffect\(\(\) => \(\) => setPassword\(''\), \[\]\);/);
  });

  test('the iOS keyboard: email keyboard, AutoFill (username + password), secure entry, Return → password → sign in', () => {
    const email = form.match(/<TextInput\s+value=\{email\}[\s\S]*?\/>/)[0];
    for (const prop of ['keyboardType="email-address"', 'textContentType="username"', 'returnKeyType="next"', 'onSubmitEditing={() => passwordInput.current?.focus()}', 'accessibilityLabel="Email"']) {
      assert.ok(email.includes(prop), prop);
    }
    const password = form.match(/<TextInput\s+ref=\{passwordInput\}[\s\S]*?\/>/)[0];
    for (const prop of ['textContentType="password"', 'secureTextEntry={!shown}', 'returnKeyType="go"', 'onSubmitEditing={startSubmit}', 'accessibilityLabel="Password"']) {
      assert.ok(password.includes(prop), prop);
    }
  });

  test('VoiceOver: every control labelled; field errors and the failure box announced (no live region)', () => {
    assert.match(form, /accessibilityLabel="Sign in with email instead"/);
    assert.match(form, /accessibilityLabel=\{shown \? 'Hide password' : 'Show password'\}/);
    assert.match(form, /accessibilityLabel="Sign in"/);
    assert.match(form, /if \(spoken\) AccessibilityInfo\.announceForAccessibility\(spoken\);/);
    assert.doesNotMatch(code('src/screens/auth/EmailSignInForm.tsx'), /accessibilityLiveRegion|aria-label/);
  });

  test('Dynamic Type and 44 pt: the fields and "Sign in" have a minimum height, never a fixed one; targets 48 pt', () => {
    assert.match(form, /field: \{\s*minHeight: form\.fieldHeight,/);
    assert.doesNotMatch(form.match(/  field: \{[^}]*\}/)[0], /\bheight:/);
    assert.match(read('src/screens/auth/emailFormLayout.ts'), /button: \{ minHeight: submit\.height,/);
    assert.match(form, /action: \{ minHeight: form\.actionHeight,/);
    assert.match(form, /toggle: \{ position: 'absolute', right: 0, top: 0, width: form\.toggle, height: form\.toggle,/);
    assert.equal(read('src/theme/brand.ts').includes('toggle: 48,'), true);
  });
});
