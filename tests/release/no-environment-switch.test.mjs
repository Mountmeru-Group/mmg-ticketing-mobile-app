// iOS-5i, Ronit's decision 1 (2026-11-18): Android's run-time environment switch (7d0a19d, 4d0e51e, 723e2fc) is NOT on
// iOS. iOS keeps CLAUDE.md rule I3: one API URL per bundle, chosen at build time (docs/web-system/02-AUTH.md §iOS-C).
// This file proves it from the source, for the five personas: nobody can switch, ADMIN included, because there is
// nothing to switch with. scripts/verify-release-bundle.js proves the same of both release bundles (preview, production).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as env from '../../src/config/env.ts';
import * as permissions from '../../src/utils/permissions.ts';
import { stackRoutes } from '../../src/navigation/routes.ts';
import { NAMES, PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel.replace(/\\/g, '/')] : [];
  });
}
/** The code without its comments (a comment may say there is no switch). */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Android's switch files at 723e2fc. None exists on iOS. */
const ANDROID_SWITCH_FILES = [
  'src/api/environmentSwitch.ts',
  'src/store/environment.store.ts',
  'src/navigation/EnvironmentSheet.tsx',
  'src/navigation/EnvironmentChip.tsx',
  'src/navigation/DrawerContent.tsx',
  'src/utils/switch-password.ts',
  'scripts/removed-gate-scan.js',
  'scripts/password-scan.js',
];

/** Android's names, stored keys and words for the switch (723e2fc and the removed password gate of 4d0e51e). */
const SWITCH_MARKERS = [
  // names
  'switchEnvironment', 'canSwitchEnvironment', 'CAN_SWITCH_ENVIRONMENT', 'SELECTABLE_ENVIRONMENTS', 'DEFAULT_ENVIRONMENT',
  'isSelectableEnvironment', 'apiBaseUrlFor', 'apiHostFor', 'appOriginFor', 'healthUrlFor', 'environmentLabel(',
  'showEnvironmentChip(', 'environmentRowState', 'ENVIRONMENT_CHIP_LABELS', 'ENVIRONMENT_NAMES', 'useEnvironmentStore',
  'saveEnvironment', 'restoreEnvironment', 'activeEnvironment', 'sessionTokenForActiveEnvironment', 'ADMIN_ONLY_SWITCH',
  'EnvironmentSheet', 'EnvironmentChip', 'colors.environment', 'offersEnvironmentSwitch', 'EnvironmentPasswordSheet',
  // stored keys
  'mmg.app.environment', 'mmg.session.environment',
  // words
  'Use Production', 'Switch and sign out', 'Only an administrator can change the environment', 'Opens the environment switch',
  'Switching signs you out', 'Switch password', 'Enter the switch password',
];

describe('no environment switch on iOS: nothing to switch with', () => {
  test('none of Android\'s switch files exists', () => {
    assert.deepEqual(ANDROID_SWITCH_FILES.filter((rel) => existsSync(path.join(REPO, rel))), []);
  });

  test('no switch name, stored key or word anywhere in src/ or scripts/ (code, comments aside)', () => {
    const files = [...sourceFiles('src'), ...readdirSync(path.join(REPO, 'scripts')).map((f) => `scripts/${f}`)];
    const hits = [];
    for (const rel of files) {
      if (!/\.(tsx?|js|cjs|mjs)$/.test(rel)) continue;
      const src = code(read(rel));
      for (const marker of SWITCH_MARKERS) if (src.includes(marker)) hits.push(`${rel}: ${marker}`);
    }
    assert.deepEqual(hits, []);
  });

  test('src/config/env.ts exports constants only: one environment, fixed when the bundle was built', () => {
    const functions = Object.entries(env).filter(([, value]) => typeof value === 'function').map(([name]) => name);
    assert.deepEqual(functions, [], 'no function that hands out another environment\'s URL');
    assert.equal(typeof env.API_BASE_URL, 'string');
    assert.equal(typeof env.APP_ENV, 'string');
    // The one build-time choice (iOS-9b): a direct process.env read Expo inlines; nothing stored, nothing chosen in the app.
    const src = code(read('src/config/env.ts'));
    assert.equal((src.match(/process\.env\.EXPO_PUBLIC_APP_ENV/g) ?? []).length, 2);
    assert.doesNotMatch(src, /SecureStore|AsyncStorage|getItem|setItem|zustand/);
  });

  test('every request goes to that one URL: the client\'s fixed baseURL, never set per request', () => {
    const client = code(read('src/api/client.ts'));
    assert.match(client, /axios\.create\(\{\s*baseURL: API_BASE_URL,/);
    assert.doesNotMatch(client, /config\.baseURL\s*=|defaults\.baseURL\s*=/);
    const all = sourceFiles('src').filter((rel) => /\bbaseURL\s*[:=]/.test(code(read(rel))));
    assert.deepEqual(all, ['src/api/client.ts']);
  });

  test('the environment is shown, never offered: Profile\'s line is read-only; More\'s footer is text', () => {
    const profile = code(read('src/screens/profile/ProfileScreen.tsx'));
    assert.match(profile, /<ReadOnly label="Environment" value=\{ENVIRONMENT_LABEL\} \/>/);
    assert.match(profile, /function ReadOnly\(\{ label, value \}[^)]*\) \{\s*return \(\s*<View className="mb-3">\s*<FieldLabel label=\{label\} \/>\s*<Text selectable/);
    const more = code(read('src/navigation/MoreScreen.tsx'));
    assert.match(more, /<Text[^>]*>\s*v\{APP_VERSION\} · \{APP_ENV\}/);
  });
});

describe('the five personas: nobody can switch, ADMIN included', () => {
  for (const name of NAMES) {
    test(`${name}: no permission, tab, More row or route reaches an environment switch`, () => {
      const { role } = PERSONAS[name];
      const environmentNamed = (value) => /environment/i.test(JSON.stringify(value));
      assert.equal(Object.keys(permissions).some((key) => /environment/i.test(key)), false, 'no permission about environments');
      assert.equal(environmentNamed(permissions.appTabs(role)), false, 'tabs');
      assert.equal(environmentNamed(permissions.moreSections(role)), false, 'More');
      for (const tab of ['HomeTab', 'TicketsTab', 'ApprovalsTab', 'AlertsTab', 'MoreTab']) {
        assert.equal(environmentNamed(stackRoutes(tab, role)), false, `${tab} routes`);
      }
    });
  }
});
