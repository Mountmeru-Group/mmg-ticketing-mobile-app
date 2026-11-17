// The environment switch behind a password (2026-11-17, Ronit's third brief), replacing the ADMIN-only switch of the
// second brief. Anyone may open the drawer's row; only a correct password opens the sheet; any role may then use UAT.
// This file runs as a RELEASE build: __DEV__ is false before the app's modules load (dynamic imports below).
// THE REAL PASSWORD IS NOT HERE, and must never be: the gate's mechanics are tested with a test password and its own
// hash (createSwitchPasswordGate), and the real one is searched for by its hash only (scripts/password-scan.js).
// What is real: utils/switch-password.ts, switchEnvironment(), permissions.ts, env.ts, the auth and environment stores,
// the API client. Faked: the network (axios transport), the Keystore, expo-crypto (Node's SHA-256,
// tests/support/stubs/expo-crypto.mjs). The drawer and the prompt are read as source (no React Native renderer).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';
import * as secureStore from 'expo-secure-store';

import { PERSONAS } from '../rbac/personas.mjs';

globalThis.__DEV__ = false;

const env = await import('../../src/config/env.ts');
const { ENVIRONMENT_KEY, activeEnvironment, useEnvironmentStore } = await import('../../src/store/environment.store.ts');
const { useAuthStore } = await import('../../src/store/auth.store.ts');
const { useUiStore } = await import('../../src/store/ui.store.ts');
const { queryClient } = await import('../../src/api/queryClient.ts');
const { apiClient } = await import('../../src/api/client.ts');
const { PASSWORD_REQUIRED, switchEnvironment } = await import('../../src/api/environmentSwitch.ts');
const gateModule = await import('../../src/utils/switch-password.ts');
const {
  LOCKOUT_MS, MAX_ATTEMPTS, SWITCH_PASSWORD_SHA256, createSwitchPasswordGate, environmentSwitchGate, passwordCheckMessage,
  redeemSwitchPass, revokeSwitchPass,
} = gateModule;
const permissions = await import('../../src/utils/permissions.ts');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const scan = createRequire(import.meta.url)('../../scripts/password-scan.js');

/** A password for the tests only, with its own hash. Not the app's. */
const TEST_PASSWORD = 'correct horse battery';
const TEST_SHA256 = createHash('sha256').update(TEST_PASSWORD).digest('hex');
const SESSION_KEYS = ['mmg.session.token', 'mmg.session.issuedAt', 'mmg.session.user', 'mmg.session.environment'];
const NON_ADMINS = Object.entries(PERSONAS).filter(([, p]) => p.role !== 'ADMIN');

const sent = [];
apiClient.defaults.adapter = (config) => {
  sent.push({ method: config.method, url: config.url, base: config.baseURL, data: config.data, auth: config.headers?.Authorization });
  return Promise.resolve({
    status: 200, statusText: '200', headers: AxiosHeaders.from({ 'content-type': 'application/json' }), data: '{"message":"ok"}', config, request: {},
  });
};

/** A clock the tests move by hand. */
function clock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

/** A gate for the test password; its passes are real passes (the same registry the app's gate uses). */
async function unlockedPass() {
  const result = await createSwitchPasswordGate({ expectedSha256: TEST_SHA256 }).check(TEST_PASSWORD);
  assert.equal(result.ok, true);
  return result.pass;
}

async function freshInstall() {
  secureStore.__reset();
  useEnvironmentStore.setState({ environment: env.DEFAULT_ENVIRONMENT, restored: false });
  useAuthStore.setState({ user: null, token: null, issuedAt: null, environment: null, fullAuthAt: null, isAuthenticated: false, isLoading: true, signOutMessage: null });
  useUiStore.getState().reset();
  queryClient.clear();
  await useEnvironmentStore.getState().restoreEnvironment();
  sent.length = 0;
}

beforeEach(freshInstall);

describe('the ADMIN rule is gone: the role decides nothing about the environment', () => {
  for (const [name, persona] of Object.entries(PERSONAS)) {
    test(`${name}: the drawer offers the "Service Desk environment" row`, () => {
      assert.equal(permissions.offersEnvironmentSwitch(persona.role), true);
    });
  }

  test('no role rule is left: permissions.ts reads no role for it, and the old rules do not exist', () => {
    assert.equal(permissions.canSwitchEnvironment, undefined);
    assert.equal(permissions.canUseEnvironment, undefined);
    assert.equal('ENFORCE_ENVIRONMENT_ROLES' in env, false);
    const source = read('src/utils/permissions.ts');
    assert.match(source, /export function offersEnvironmentSwitch\(_role: UserRole\): boolean \{\s*return true;\s*\}/);
    for (const rel of ['src/api/environmentSwitch.ts', 'src/navigation/DrawerContent.tsx', 'src/navigation/EnvironmentSheet.tsx', 'src/store/auth.store.ts', 'src/screens/auth/signInAttempt.ts']) {
      assert.doesNotMatch(read(rel), /'ADMIN'|canSwitchEnvironment|canUseEnvironment|ENFORCE_ENVIRONMENT_ROLES|environmentPolicy/, rel);
    }
    assert.equal(existsSync(path.join(REPO, 'src/api/environmentPolicy.ts')), false);
  });

  test('the drawer row is gated by the build only, opens the PASSWORD first, and the sheet only with a pass', () => {
    const drawer = read('src/navigation/DrawerContent.tsx');
    assert.match(drawer, /const offersSwitch = CAN_SWITCH_ENVIRONMENT && offersEnvironmentSwitch\(role\);/);
    assert.match(drawer, /onPress=\{\(\) => setSwitchStep\('password'\)\}/);
    assert.equal(drawer.split("setSwitchStep('sheet')").length - 1, 1, 'one way to the sheet');
    const unlocked = drawer.slice(drawer.indexOf('onUnlocked={(pass) => {'), drawer.indexOf("setSwitchStep('sheet')") + 30);
    assert.match(unlocked, /setSwitchPass\(pass\);\s*setSwitchStep\('sheet'\);/, 'only a correct password (the pass) leads there');
    assert.match(drawer, /<EnvironmentSheet visible=\{switchStep === 'sheet' && switchPass !== null\} pass=\{switchPass\} onClose=\{endSwitch\} \/>/);
    assert.match(drawer, /const endSwitch = \(\) => \{\s*revokeSwitchPass\(switchPass\);\s*setSwitchPass\(null\);\s*setSwitchStep\('idle'\);/);
    assert.match(read('src/navigation/EnvironmentSheet.tsx'), /await switchEnvironment\(chosen, pass\);/);
  });
});

describe('the gate (utils/switch-password.ts), with a test password', () => {
  test('a wrong password gives no pass and says so plainly, with the tries left; it never echoes what was typed', async () => {
    const gate = createSwitchPasswordGate({ expectedSha256: TEST_SHA256 });
    const result = await gate.check('correct horse battery!');
    assert.deepEqual(result, { ok: false, reason: 'wrong', left: MAX_ATTEMPTS - 1 });
    assert.equal(passwordCheckMessage(result), 'That password is wrong. 4 tries left before a 60-second wait.');
    assert.equal((await gate.check('')).ok, false, 'empty is wrong too');
    assert.equal((await gate.check(TEST_PASSWORD.toUpperCase())).ok, false, 'case matters');
    assert.equal((await gate.check(` ${TEST_PASSWORD}`)).ok, false, 'nothing is trimmed');
  });

  test('the correct password gives a pass, good for ONE switch; a revoked or used pass is worth nothing', async () => {
    const gate = createSwitchPasswordGate({ expectedSha256: TEST_SHA256 });
    const first = await gate.check(TEST_PASSWORD);
    assert.equal(first.ok, true);
    assert.equal(redeemSwitchPass(first.pass), true);
    assert.equal(redeemSwitchPass(first.pass), false, 'used up');
    const second = await gate.check(TEST_PASSWORD);
    revokeSwitchPass(second.pass);
    assert.equal(redeemSwitchPass(second.pass), false, 'revoked when the sheet closed');
    assert.equal(redeemSwitchPass({ switchPass: true }), false, 'a look-alike is not a pass');
    assert.equal(redeemSwitchPass(null), false);
  });

  test(`${MAX_ATTEMPTS} wrong tries lock it for 60 s: every try is refused, the right one too, and it says how long`, async () => {
    const time = clock();
    const gate = createSwitchPasswordGate({ expectedSha256: TEST_SHA256, now: time.now });
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const r = await gate.check(`wrong ${i}`);
      assert.deepEqual(r, { ok: false, reason: 'wrong', left: MAX_ATTEMPTS - i });
    }
    assert.equal(passwordCheckMessage({ ok: false, reason: 'wrong', left: 0 }), 'That password is wrong. Too many wrong tries: try again in 60 seconds.');
    assert.equal(LOCKOUT_MS, 60_000);
    assert.equal(gate.lockedForMs(), 60_000);
    const refused = await gate.check(TEST_PASSWORD);
    assert.deepEqual(refused, { ok: false, reason: 'locked', retryInMs: 60_000 });
    assert.equal(passwordCheckMessage(refused), 'Too many wrong tries. Try again in 60 seconds.');
    time.advance(59_001);
    assert.equal(passwordCheckMessage(await gate.check(TEST_PASSWORD)), 'Too many wrong tries. Try again in 1 second.');
  });

  test('the lock expires after 60 s, with a fresh set of tries', async () => {
    const time = clock();
    const gate = createSwitchPasswordGate({ expectedSha256: TEST_SHA256, now: time.now });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await gate.check('nope');
    time.advance(LOCKOUT_MS);
    assert.equal(gate.lockedForMs(), 0);
    assert.deepEqual(await gate.check('nope'), { ok: false, reason: 'wrong', left: MAX_ATTEMPTS - 1 }, 'the count starts again');
    assert.equal((await gate.check(TEST_PASSWORD)).ok, true);
  });

  test('the count resets on a correct entry', async () => {
    const gate = createSwitchPasswordGate({ expectedSha256: TEST_SHA256, now: clock().now });
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await gate.check('nope');
    assert.equal((await gate.check(TEST_PASSWORD)).ok, true);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) assert.equal((await gate.check('nope')).reason, 'wrong');
    assert.equal(gate.lockedForMs(), 0, `${MAX_ATTEMPTS - 1} more wrong tries do not lock`);
  });

  test('the count resets on an app restart: it is in memory only, nothing is written to the phone', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) await environmentSwitchGate.check(`not it ${i}`);
    assert.ok(environmentSwitchGate.lockedForMs() > 0);
    assert.deepEqual(secureStore.__snapshot(), {});
    const restarted = await import(`../../src/utils/switch-password.ts?restart=${Date.now()}`);
    assert.equal(restarted.environmentSwitchGate.lockedForMs(), 0);
    assert.equal((await restarted.environmentSwitchGate.check('still not it')).left, MAX_ATTEMPTS - 1);
  });
});

describe('the app\'s gate holds only a hash; the password is nowhere in the repository or the release bundle', () => {
  test('a SHA-256 hash, pinned: change the password and this, and scripts/password-scan.js PASSWORD_LENGTH, change with it', () => {
    assert.match(SWITCH_PASSWORD_SHA256, /^[0-9a-f]{64}$/);
    assert.equal(SWITCH_PASSWORD_SHA256, 'b0c3a3ca23bfe7e3c3faaf153f9f83e327a589ad1eb1fc9e089cdb22fae201b9');
    assert.equal(scan.readPasswordHash(REPO), SWITCH_PASSWORD_SHA256, 'the scanner reads the same hash');
    assert.match(read('src/utils/switch-password.ts'), /export const environmentSwitchGate: SwitchPasswordGate = createSwitchPasswordGate\(\{ expectedSha256: SWITCH_PASSWORD_SHA256 \}\);/);
  });

  test('the scanner finds a password by its hash alone (control: a test password planted in a file-sized buffer)', () => {
    const planted = 'Plant3d@pass';
    assert.equal(planted.length, scan.PASSWORD_LENGTH);
    const hash = createHash('sha256').update(planted).digest('hex');
    const buffer = Buffer.from(`${'x'.repeat(5000)} const p = '${planted}'; ${'y'.repeat(5000)}`, 'latin1');
    assert.equal(scan.countPasswordWindows(buffer, hash), 1);
    assert.equal(scan.countPasswordWindows(Buffer.from('nothing to see here, at all'), hash), 0);
  });

  test('every file in the repository (src, tests, docs, scripts, config): the real password appears 0 times', () => {
    const files = [];
    (function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(full);
      }
    })(REPO);
    assert.ok(files.some((f) => f.endsWith(path.join('src', 'utils', 'switch-password.ts'))));
    assert.ok(files.length > 250, `${files.length} files`);
    const hits = files.filter((f) => scan.countPasswordWindows(readFileSync(f), SWITCH_PASSWORD_SHA256) > 0);
    assert.deepEqual(hits.map((f) => path.relative(REPO, f)), []);
  });

  test('the release bundle: scripts/verify-release-bundle.js fails on it; the last bundle built, if any, has none', () => {
    const check = read('scripts/verify-release-bundle.js');
    assert.match(check, /const passwordCounts = Object\.entries\(targets\)\.map\(\(\[k, t\]\) => \[k, countPasswordWindows\(Buffer\.from\(t, 'latin1'\), passwordHash\)\]\);/);
    assert.match(check, /if \(c > 0\) problems\.push\(`\$\{k\} contains the environment switch password in plain text/);
    const dir = path.join(os.tmpdir(), 'mmg-release-check', 'release');
    for (const name of ['index.android.bundle', 'index.android.bundle.hbc']) {
      const file = path.join(dir, name);
      if (!existsSync(file) || statSync(file).size === 0) continue;
      assert.equal(scan.countPasswordWindows(readFileSync(file), SWITCH_PASSWORD_SHA256), 0, name);
    }
  });
});

describe('what is typed is never logged, stored or sent', () => {
  const CANARY = 'canary-typed-7Q!';
  const captured = [];
  const originals = {};
  beforeEach(() => {
    captured.length = 0;
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      originals[level] = console[level];
      console[level] = (...args) => captured.push(args.map(String).join(' '));
    }
  });
  afterEach(() => {
    for (const level of Object.keys(originals)) console[level] = originals[level];
  });

  test('checking, right or wrong, writes nothing to the console, the phone or the network', async () => {
    const gate = createSwitchPasswordGate({ expectedSha256: TEST_SHA256 });
    const results = [await gate.check(CANARY), await gate.check(TEST_PASSWORD), await environmentSwitchGate.check(CANARY)];
    assert.deepEqual(captured, []);
    assert.deepEqual(secureStore.__snapshot(), {});
    assert.deepEqual(sent, []);
    for (const r of results) {
      assert.doesNotMatch(JSON.stringify(r), /canary|horse/);
      assert.doesNotMatch(passwordCheckMessage(r) ?? '', /canary|horse/);
    }
  });

  test('the prompt and the gate have no logging, storage or network code at all', () => {
    for (const rel of ['src/utils/switch-password.ts', 'src/navigation/EnvironmentPasswordSheet.tsx']) {
      const source = read(rel);
      assert.doesNotMatch(source, /console\.|SecureStore|AsyncStorage|apiClient|@\/api\/|fetch\(/, rel);
    }
  });
});

describe('the prompt (src/navigation/EnvironmentPasswordSheet.tsx)', () => {
  const prompt = read('src/navigation/EnvironmentPasswordSheet.tsx');

  test('a masked field with a show/hide toggle carrying an aria-label; no autofill, autocorrect or capitals', () => {
    assert.match(prompt, /secureTextEntry=\{!shown\}/);
    assert.match(prompt, /aria-label=\{shown \? 'Hide password' : 'Show password'\}/);
    assert.match(prompt, /onPress=\{\(\) => setShown\(\(now\) => !now\)\}/);
    for (const prop of ['autoCapitalize="none"', 'autoCorrect={false}', 'autoComplete="off"', 'importantForAutofill="no"']) assert.ok(prompt.includes(prop), prop);
  });

  test('says it is for testing and most people do not need it', () => {
    assert.match(prompt, /export const SWITCH_PASSWORD_HELP = 'For testing only\. Most people never need this: Setu stays on Production\.';/);
    assert.match(prompt, /\{SWITCH_PASSWORD_HELP\}/);
  });

  test('wrong: the message, and the field emptied for the next try (it is emptied before the check, right or wrong)', () => {
    const submit = prompt.slice(prompt.indexOf('const submit = () =>'), prompt.indexOf('const cancel = () =>'));
    assert.ok(submit.indexOf("setValue('');") < submit.indexOf('await environmentSwitchGate.check(entered)'));
    assert.match(submit, /setMessage\(passwordCheckMessage\(result\)\);/);
    assert.match(submit, /if \(result\.ok\) \{\s*setMessage\(null\);\s*setShown\(false\);\s*onUnlocked\(result\.pass\);/);
  });

  test('Cancel (or back, or a tap outside) closes it and changes nothing; each opening starts empty and masked', () => {
    assert.match(prompt, /const cancel = \(\) => \{\s*if \(checking\) return;\s*setValue\(''\);\s*setMessage\(null\);\s*onCancel\(\);/);
    assert.match(prompt, /<Sheet visible=\{visible\} title="Switch password" onClose=\{cancel\} avoidKeyboard>/);
    assert.match(prompt, /<OutlineButton label="Cancel" onPress=\{cancel\}/);
    assert.match(prompt, /useEffect\(\(\) => \{\s*setValue\(''\);\s*setShown\(false\);/);
    assert.doesNotMatch(prompt, /switchEnvironment|useEnvironmentStore/, 'the prompt itself changes nothing');
  });
});

describe('switching needs a correct password, every time', () => {
  test('without a pass (a wrong password gives none) nothing changes and nothing is sent', async () => {
    const wrong = await createSwitchPasswordGate({ expectedSha256: TEST_SHA256 }).check('wrong');
    await assert.rejects(switchEnvironment('UAT', wrong.ok ? wrong.pass : null), new RegExp(PASSWORD_REQUIRED));
    await assert.rejects(switchEnvironment('UAT'), new RegExp(PASSWORD_REQUIRED));
    assert.equal(activeEnvironment(), 'PROD');
    assert.equal(secureStore.__snapshot()[ENVIRONMENT_KEY], undefined);
    assert.deepEqual(sent, []);
  });

  test('a correct password switches, and is not remembered: the next switch needs it again', async () => {
    const pass = await unlockedPass();
    await switchEnvironment('UAT', pass);
    assert.equal(activeEnvironment(), 'UAT');
    await switchEnvironment('PROD', pass); // the "Use Production" direction: needs none, and the used pass changes nothing
    assert.equal(activeEnvironment(), 'PROD');
    await assert.rejects(switchEnvironment('UAT', pass), new RegExp(PASSWORD_REQUIRED), 'the same entry cannot switch twice');
    assert.equal(activeEnvironment(), 'PROD');
  });

  test('back to Production (Login\'s "Use Production") needs no password', async () => {
    await switchEnvironment('UAT', await unlockedPass());
    await switchEnvironment('PROD');
    assert.equal(activeEnvironment(), 'PROD');
  });
});

describe('any role signs in on UAT and stays there; the choice persists for anyone', () => {
  /** The app process starts again: nothing read yet from the Keystore. */
  function coldStart() {
    useEnvironmentStore.setState({ environment: env.DEFAULT_ENVIRONMENT, restored: false });
    useAuthStore.setState({ user: null, token: null, issuedAt: null, environment: null, isAuthenticated: false, isLoading: true });
  }

  for (const [name, persona] of NON_ADMINS) {
    test(`${name}: signed in on UAT, and still signed in on UAT after a restart`, async () => {
      await switchEnvironment('UAT', await unlockedPass());
      await useAuthStore.getState().setSession({ token: `uat-${persona.id}`, user: persona, fullAuthAt: Date.now() });
      assert.equal(useAuthStore.getState().isAuthenticated, true);
      coldStart();
      await useAuthStore.getState().restoreSession();
      assert.equal(activeEnvironment(), 'UAT');
      assert.equal(useAuthStore.getState().isAuthenticated, true);
      assert.equal(useAuthStore.getState().user.role, persona.role);
      for (const key of SESSION_KEYS) assert.ok(secureStore.__snapshot()[key], key);
      assert.deepEqual(sent, [], 'nothing ended it');
    });
  }

  test('nobody signed in: a restart keeps UAT (the choice persists)', async () => {
    await switchEnvironment('UAT', await unlockedPass());
    coldStart();
    await useAuthStore.getState().restoreSession();
    assert.equal(activeEnvironment(), 'UAT');
    assert.equal(useAuthStore.getState().signOutMessage, null);
  });

  test('the sign-in flows refuse no role and no environment', () => {
    const flow = read('src/screens/auth/signInAttempt.ts');
    assert.doesNotMatch(flow, /admitSignIn|environment-refused|ADMIN/);
    assert.doesNotMatch(read('src/store/auth.store.ts'), /mayStayIn|EnvironmentRefusedError|canUseEnvironment/);
  });

  test('the UAT chip shows whenever UAT is in use, for anyone; Production stays the default on a fresh install', () => {
    assert.equal(env.DEFAULT_ENVIRONMENT, 'PROD');
    assert.equal(env.showEnvironmentChip('UAT'), true);
    assert.equal(env.showEnvironmentChip('PROD'), false);
    const drawer = read('src/navigation/DrawerContent.tsx');
    assert.ok(drawer.indexOf('{showEnvironmentChip(environment) ? (') < drawer.indexOf('{offersSwitch ? ('), 'not inside the switch row');
    assert.match(read('src/screens/auth/LoginScreen.tsx'), /\{showEnvironmentChip\(environment\) \? \(/);
  });
});
