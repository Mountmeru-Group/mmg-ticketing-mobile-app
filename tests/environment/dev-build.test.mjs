// The runtime environment switch (2026-11-17), the development build's side and the wiring.
// A development build (__DEV__, as every other test file runs) stays on UAT whatever is stored, has no switch, and
// refuses PROD everywhere a value could get in (CLAUDE.md rule 4). The release build's side runs in
// tests/environment/switch-release.test.mjs. The screens are read as source (no React Native renderer in this repo).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';
import * as secureStore from 'expo-secure-store';

import { apiClient } from '../../src/api/client.ts';
import { switchEnvironment } from '../../src/api/environmentSwitch.ts';
import { CAN_SWITCH_ENVIRONMENT, DEFAULT_ENVIRONMENT, SELECTABLE_ENVIRONMENTS } from '../../src/config/env.ts';
import { useAuthStore } from '../../src/store/auth.store.ts';
import {
  ENVIRONMENT_KEY, activeEnvironment, apiBaseUrl, storedEnvironment, useEnvironmentStore,
} from '../../src/store/environment.store.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const UAT_URL = 'https://uat-servicedesk.mountmerugroup.com/api/v1';
const USER = { id: 'user-agent', email: 'agent@example.test', displayName: 'Agent', role: 'AGENT', countryId: null };

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel.replace(/\\/g, '/')] : [];
  });
}

const sent = [];
apiClient.defaults.adapter = (config) => {
  sent.push({ method: config.method, base: config.baseURL, url: config.url });
  return Promise.resolve({
    status: 200, statusText: '200', headers: AxiosHeaders.from({ 'content-type': 'application/json' }), data: '{}', config, request: {},
  });
};

beforeEach(async () => {
  sent.length = 0;
  secureStore.__reset();
  useEnvironmentStore.setState({ environment: DEFAULT_ENVIRONMENT, restored: false });
  useAuthStore.setState({ user: null, token: null, issuedAt: null, environment: null, isAuthenticated: false, isLoading: false });
});

describe('a development build never uses PROD (CLAUDE.md rule 4)', () => {
  test('UAT only, UAT by default, and no switch', () => {
    assert.equal(globalThis.__DEV__, true);
    assert.deepEqual(SELECTABLE_ENVIRONMENTS, ['UAT']);
    assert.equal(DEFAULT_ENVIRONMENT, 'UAT');
    assert.equal(CAN_SWITCH_ENVIRONMENT, false);
  });

  test('any role signs in on UAT (no role rule for USING an environment; a release build: admin-switch.test)', async () => {
    await useAuthStore.getState().setSession({ token: 'uat-agent-token', user: USER });
    assert.equal(useAuthStore.getState().isAuthenticated, true, 'an AGENT on UAT, in a development build');
    assert.equal(activeEnvironment(), 'UAT');
    assert.deepEqual(sent, []);
  });

  test('a PROD choice stored on the phone (by a release build of the same app) is ignored: UAT', async () => {
    assert.equal(storedEnvironment('PROD'), 'UAT');
    await secureStore.setItemAsync(ENVIRONMENT_KEY, 'PROD');
    await useEnvironmentStore.getState().restoreEnvironment();
    assert.equal(activeEnvironment(), 'UAT');
    assert.equal(apiBaseUrl(), UAT_URL);
  });

  test('storing PROD is refused, and the switch refuses it before it signs anyone out or sends anything', async () => {
    await assert.rejects(useEnvironmentStore.getState().saveEnvironment('PROD'), /cannot use PROD/);
    await useAuthStore.getState().setSession({ token: 'uat-token', user: USER });
    await assert.rejects(switchEnvironment('PROD'), /cannot use PROD/);
    assert.equal(useAuthStore.getState().isAuthenticated, true, 'still signed in');
    assert.deepEqual(sent, []);
    assert.equal(secureStore.__snapshot()[ENVIRONMENT_KEY], undefined);
    assert.equal(activeEnvironment(), 'UAT');
  });
});

describe('wiring: nothing holds a URL from the environment the app started on', () => {
  test('env.ts exports no fixed URL, host or label any more, and no file imports one', () => {
    const removed = /\b(API_BASE_URL|HEALTH_URL|API_HOST|ENVIRONMENT_LABEL|SHOW_ENVIRONMENT_CHIP|APP_ORIGIN)\b/;
    assert.deepEqual(sourceFiles('src').filter((rel) => removed.test(read(rel))), []);
    assert.doesNotMatch(read('src/config/env.ts'), /export const APP_ENV\b/);
    assert.deepEqual(sourceFiles('src').filter((rel) => /\bAPP_ENV\b/.test(read(rel))), []);
  });

  test('the API client takes the base URL of the environment in use on every request', () => {
    const client = read('src/api/client.ts');
    assert.doesNotMatch(client, /axios\.create\(\{[^}]*baseURL/);
    assert.match(client, /apiClient\.interceptors\.request\.use\(\(config\) => \{\s*\/\/[^\n]*\n\s*config\.baseURL = apiBaseUrl\(\);/);
    assert.match(client, /if \(sessionTokenForActiveEnvironment\(\) === null\) \{\s*void endSession\(SESSION_ENDED_MESSAGE\);/);
  });

  test('switchEnvironment() runs its five steps in the brief\'s order', () => {
    const source = read('src/api/environmentSwitch.ts');
    const body = source.slice(source.indexOf('export async function switchEnvironment'));
    const order = [
      'await unregisterPushForSignOut();',
      'logout()',
      "clearSession(null, { forgetFullAuth: true })",
      // Saved filters are the Service Desk's views since 2026-11-17: they live in this cache only.
      'queryClient.clear();',
      'useUiStore.getState().reset();',
      'saveEnvironment(next)',
    ].map((needle) => {
      const at = body.indexOf(needle);
      assert.notEqual(at, -1, needle);
      return at;
    });
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });

  test('Login: no switch (since 2026-11-17); on UAT only a one-way "Use Production" link, locked during a sign-in', () => {
    const login = read('src/screens/auth/LoginScreen.tsx');
    assert.doesNotMatch(login, /settings-outline|<EnvironmentSheet|EnvironmentSheet'|setEnvironmentSheet/, 'the gear and its sheet are gone');
    assert.doesNotMatch(login, /switchEnvironment\((?!DEFAULT_ENVIRONMENT\))/, 'it can only ever switch to the default, Production');
    assert.match(login, /await switchEnvironment\(DEFAULT_ENVIRONMENT\);/);
    assert.match(login, /const offersProduction = CAN_SWITCH_ENVIRONMENT && environment !== DEFAULT_ENVIRONMENT;/);
    const link = login.slice(login.indexOf('{offersProduction ? ('), login.indexOf(') : null}', login.indexOf('{offersProduction ? (')));
    assert.match(link, /disabled=\{environmentLocked\}/);
    assert.match(login, /const environmentLocked = signingIn \|\| emailBusy;/);
    // The logo alone in the red panel's top row.
    assert.match(login, /<View style=\{styles\.topRow\}>\s*<View style=\{styles\.logoCard\}>[\s\S]*?<\/View>\s*<\/View>/);
  });

  test('the sheet (opened from the drawer, ADMIN only): every environment this build may use, the one in use marked', () => {
    // Its approved layout, chip by chip: tests/environment/admin-switch.test.mjs.
    assert.equal(sourceFiles('src').filter((rel) => /EnvironmentSheet\.tsx$/.test(rel)).join(), 'src/navigation/EnvironmentSheet.tsx');
    const sheet = read('src/navigation/EnvironmentSheet.tsx');
    assert.match(sheet, /SELECTABLE_ENVIRONMENTS\.map\(/);
    assert.match(sheet, /state=\{environmentRowState\(env, active\)\}/);
    assert.match(sheet, /export const SWITCH_LABEL = 'Switch and sign out';/);
    assert.match(sheet, /<SubmitButton label=\{SWITCH_LABEL\} onPress=\{apply\} disabled=\{chosen === active\} loading=\{switching\} \/>/);
    assert.match(sheet, /await switchEnvironment\(chosen\);/);
  });

  test('the drawer\'s chip and Profile follow the environment in use; the version is on Profile (no line under the card)', () => {
    const drawer = read('src/navigation/DrawerContent.tsx');
    assert.match(drawer, /const environment = useEnvironmentStore\(\(s\) => s\.environment\);/);
    assert.match(drawer, /<EnvironmentChip env=\{environment\} \/>/);
    assert.doesNotMatch(drawer, /APP_VERSION/, 'the "v1.0.0 · PROD" line is gone (2026-11-18)');
    const profile = read('src/screens/profile/ProfileScreen.tsx');
    assert.match(profile, /const environment = useEnvironmentStore\(\(s\) => s\.environment\);/);
    assert.match(profile, /<ReadOnly label="Environment" value=\{environmentLabel\(environment\)\} \/>/);
    assert.match(profile, /<ReadOnly label="Version" value=\{APP_VERSION\} \/>/);
  });

  test('restoreSession() reads the environment first, so Login and the session agree from the first frame', () => {
    const store = read('src/store/auth.store.ts');
    assert.match(store, /if \(!environments\.restored\) await environments\.restoreEnvironment\(\);/);
    assert.ok(store.indexOf('restoreEnvironment()') < store.indexOf('const fullAuthAt = await readFullAuthAt();'));
  });
});
