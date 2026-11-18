// The environment switch: ADMIN only, no password (2026-11-18, Ronit's decision). Replaces the password gate of the third
// brief of 2026-11-17, whose tests (switch-password.test.mjs) are removed with it.
// - The drawer's Environment row is for ADMIN only, and ABSENT for every other role; the sheet is not a route and is
//   mounted for ADMIN only, so no link or saved navigation state can reach it. switchEnvironment() refuses anyone else.
// - NOT brought back (two runs ago): refusing a non-ADMIN sign-in on UAT, ending a stored UAT session at cold start, and
//   sending a signed-out cold start on UAT back to Production. Anyone may still USE UAT.
// - The gate is gone from src/ and from what a release bundle is checked for (scripts/removed-gate-scan.js holds only a
//   fingerprint of the old hash).
// - The drawer card and the sheet as approved, and the chip colours (WCAG AA, told apart by lightness).
// This file runs as a RELEASE build: __DEV__ is false before the app's modules load (dynamic imports below). What is real:
// permissions.ts, switchEnvironment(), env.ts, the auth, environment and ui stores, the API client, the theme. Faked: the
// network (axios transport) and the Keystore. The drawer and the sheet are read as source (no React Native renderer).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
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
const { ADMIN_ONLY_SWITCH, switchEnvironment } = await import('../../src/api/environmentSwitch.ts');
const permissions = await import('../../src/utils/permissions.ts');
const { colors } = await import('../../src/theme/colors.ts');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const scan = createRequire(import.meta.url)('../../scripts/removed-gate-scan.js');
const SESSION_KEYS = ['mmg.session.token', 'mmg.session.issuedAt', 'mmg.session.user', 'mmg.session.environment'];
const NON_ADMINS = Object.entries(PERSONAS).filter(([, p]) => p.role !== 'ADMIN');

function filesUnder(dir) {
  const out = [];
  (function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  })(path.join(REPO, dir));
  return out;
}

const sent = [];
apiClient.defaults.adapter = (config) => {
  sent.push({ method: config.method, url: config.url, base: config.baseURL });
  return Promise.resolve({
    status: 200, statusText: '200', headers: AxiosHeaders.from({ 'content-type': 'application/json' }), data: '{"message":"ok"}', config, request: {},
  });
};

async function freshInstall() {
  secureStore.__reset();
  useEnvironmentStore.setState({ environment: env.DEFAULT_ENVIRONMENT, restored: false });
  useAuthStore.setState({ user: null, token: null, issuedAt: null, environment: null, fullAuthAt: null, isAuthenticated: false, isLoading: true, signOutMessage: null });
  useUiStore.getState().reset();
  queryClient.clear();
  await useEnvironmentStore.getState().restoreEnvironment();
  sent.length = 0;
}

const signIn = (persona) => useAuthStore.getState().setSession({ token: `${activeEnvironment()}-${persona.id}`, user: persona, fullAuthAt: Date.now() });

/** An ADMIN signs in on Production and switches to UAT: how anyone's phone gets onto UAT. Signed out afterwards. */
async function adminMovesToUat() {
  await signIn(PERSONAS.ADMIN);
  await switchEnvironment('UAT');
  assert.equal(activeEnvironment(), 'UAT');
  sent.length = 0;
}

/** The app process starts again: nothing read yet from the Keystore. */
function coldStart() {
  useEnvironmentStore.setState({ environment: env.DEFAULT_ENVIRONMENT, restored: false });
  useAuthStore.setState({ user: null, token: null, issuedAt: null, environment: null, isAuthenticated: false, isLoading: true });
}

beforeEach(freshInstall);

describe('who may switch: ADMIN, and no other role (permissions.ts canSwitchEnvironment)', () => {
  for (const [name, persona] of Object.entries(PERSONAS)) {
    test(`${name}: the drawer row is ${persona.role === 'ADMIN' ? 'shown' : 'absent'}`, () => {
      assert.equal(permissions.canSwitchEnvironment(persona.role), name === 'ADMIN');
    });
  }

  test('no signed-in user, or a role the app does not know: no switch', () => {
    for (const role of [null, undefined, '', 'admin', 'SUPER_ADMIN']) assert.equal(permissions.canSwitchEnvironment(role), false, String(role));
    assert.equal(permissions.offersEnvironmentSwitch, undefined, 'the every-role rule of the password gate is gone');
  });

  test('the drawer decides it through permissions.ts only, in a release build; the row is absent, never disabled', () => {
    assert.equal(env.CAN_SWITCH_ENVIRONMENT, true);
    const drawer = read('src/navigation/DrawerContent.tsx');
    assert.match(drawer, /const offersSwitch = CAN_SWITCH_ENVIRONMENT && canSwitchEnvironment\(user\?\.role\);/);
    // The row exists only inside `{offersSwitch ? (`, with no disabled form of it anywhere.
    const row = drawer.indexOf('accessibilityLabel={`Environment: ');
    assert.ok(row > drawer.indexOf('{offersSwitch ? ('), 'the row is inside the ADMIN branch');
    assert.equal(drawer.split('accessibilityLabel={`Environment: ').length - 1, 1, 'one row, no greyed copy');
    assert.doesNotMatch(drawer.slice(drawer.indexOf('{offersSwitch ? ('), row + 400), /disabled/);
    // No inline role check: no role literal or comparison in the drawer.
    assert.doesNotMatch(drawer, /'ADMIN'|"ADMIN"|role\s*[!=]==/);
  });
});

describe('no way to the sheet for anyone else: not a route, not a link, not a saved navigation state', () => {
  test('the sheet is mounted only in the ADMIN branch of the drawer, and imported nowhere else', () => {
    const drawer = read('src/navigation/DrawerContent.tsx');
    assert.match(drawer, /\{offersSwitch \? <EnvironmentSheet visible=\{switchOpen\} onClose=\{\(\) => setSwitchOpen\(false\)\} \/> : null\}/);
    assert.equal(drawer.split('<EnvironmentSheet').length - 1, 1);
    const importers = filesUnder('src').filter((f) => /from '\.\/EnvironmentSheet'|from '@\/navigation\/EnvironmentSheet'/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(importers.map((f) => path.relative(REPO, f).replace(/\\/g, '/')), ['src/navigation/DrawerContent.tsx']);
  });

  test('no navigator registers it, and no route name or param list mentions an environment screen', () => {
    for (const file of filesUnder('src/navigation')) {
      const src = readFileSync(file, 'utf8');
      assert.doesNotMatch(src, /<\w+\.Screen[^>]*name="[^"]*Environment/, file);
      assert.doesNotMatch(src, /component=\{EnvironmentSheet\}/, file);
    }
    assert.doesNotMatch(read('src/types/navigation.ts'), /Environment/);
  });

  test('navigation state is never saved or restored, and there is no linking config to reach a screen from a URL', () => {
    for (const file of [...filesUnder('src'), path.join(REPO, 'App.tsx')]) {
      const src = readFileSync(file, 'utf8');
      assert.doesNotMatch(src, /\binitialState=|onStateChange=|linking=\{|NAVIGATION_STATE|PERSISTENCE_KEY/, file);
    }
    // Links and push taps open tickets only.
    for (const rel of ['src/utils/deep-links.ts', 'src/push/taps.ts']) assert.doesNotMatch(read(rel), /EnvironmentSheet|switchEnvironment|setSwitchOpen/, rel);
  });

  for (const [name, persona] of NON_ADMINS) {
    test(`${name}: even called directly, switchEnvironment() refuses before it signs out, sends or stores anything`, async () => {
      await signIn(persona);
      await assert.rejects(switchEnvironment('UAT'), new RegExp(ADMIN_ONLY_SWITCH));
      assert.equal(activeEnvironment(), 'PROD');
      assert.equal(useAuthStore.getState().isAuthenticated, true, 'still signed in');
      assert.equal(secureStore.__snapshot()[ENVIRONMENT_KEY], undefined);
      assert.deepEqual(sent, []);
    });
  }

  test('signed out (Login): no switch to UAT for anyone; back to Production ("Use Production") for anyone', async () => {
    await assert.rejects(switchEnvironment('UAT'), new RegExp(ADMIN_ONLY_SWITCH));
    assert.equal(activeEnvironment(), 'PROD');
    await adminMovesToUat();
    assert.equal(useAuthStore.getState().isAuthenticated, false, 'the switch signed the ADMIN out');
    await switchEnvironment('PROD');
    assert.equal(activeEnvironment(), 'PROD');
  });

  test('ADMIN: switches as before (device token off, sign-out, cache and filters cleared, then the new environment)', async () => {
    await signIn(PERSONAS.ADMIN);
    queryClient.setQueryData(['tickets', 'list'], { data: [] });
    useUiStore.getState().setTicketAdvanced({ category: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }] });
    await switchEnvironment('UAT');
    assert.equal(activeEnvironment(), 'UAT');
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(queryClient.getQueryCache().getAll().length, 0);
    assert.deepEqual(useUiStore.getState().ticketAdvanced.category, []);
    assert.deepEqual(sent.map((r) => [r.method, r.url, r.base]), [['post', '/auth/logout', 'https://servicedesk.mountmerugroup.com/api/v1']]);
    // The order of those steps is pinned by tests/environment/switch-release.test.mjs.
  });
});

describe('NOT brought back: the UAT rules of two runs ago (anyone may USE UAT)', () => {
  for (const [name, persona] of NON_ADMINS) {
    test(`${name}: signs in on UAT, and is still signed in on UAT after a restart`, async () => {
      await adminMovesToUat();
      await signIn(persona);
      assert.equal(useAuthStore.getState().isAuthenticated, true, 'no sign-in refusal on UAT');
      coldStart();
      await useAuthStore.getState().restoreSession();
      assert.equal(activeEnvironment(), 'UAT', 'not sent back to Production');
      assert.equal(useAuthStore.getState().isAuthenticated, true, 'the stored UAT session is not ended at cold start');
      assert.equal(useAuthStore.getState().user.role, persona.role);
      for (const key of SESSION_KEYS) assert.ok(secureStore.__snapshot()[key], key);
      assert.deepEqual(sent, [], 'nothing ended it');
      assert.equal(permissions.canSwitchEnvironment(persona.role), false, 'they keep the session; they simply cannot switch');
    });
  }

  test('nobody signed in on UAT: a cold start stays on UAT (no reset to Production)', async () => {
    await adminMovesToUat();
    coldStart();
    await useAuthStore.getState().restoreSession();
    assert.equal(activeEnvironment(), 'UAT');
    assert.equal(useAuthStore.getState().signOutMessage, null);
  });

  test('the sign-in flows and the session store refuse no role and no environment', () => {
    assert.doesNotMatch(read('src/screens/auth/signInAttempt.ts'), /admitSignIn|environment-refused|ADMIN|canSwitchEnvironment/);
    assert.doesNotMatch(read('src/store/auth.store.ts'), /mayStayIn|EnvironmentRefusedError|canUseEnvironment|canSwitchEnvironment|'ADMIN'/);
    assert.doesNotMatch(read('src/store/environment.store.ts'), /canSwitchEnvironment|role/);
    assert.equal(existsSync(path.join(REPO, 'src/api/environmentPolicy.ts')), false);
    assert.equal(permissions.canUseEnvironment, undefined);
  });
});

describe('the password gate is gone: the prompt, the hash, the lockout, the single-use pass and their tests', () => {
  test('its files are deleted, and nothing imports them', () => {
    for (const rel of [
      'src/utils/switch-password.ts', 'src/navigation/EnvironmentPasswordSheet.tsx', 'scripts/password-scan.js',
      'tests/environment/switch-password.test.mjs', 'tests/support/stubs/expo-crypto.mjs',
    ]) assert.equal(existsSync(path.join(REPO, rel)), false, rel);
    assert.doesNotMatch(read('tests/support/loader.mjs'), /expo-crypto/);
  });

  test('the scanner finds a hash and a password by fingerprint alone (control: a test password and its hash, planted)', () => {
    const planted = 'Plant3d@pass';
    assert.equal(planted.length, scan.OLD_PASSWORD_LENGTH);
    const hash = createHash('sha256').update(planted).digest('hex');
    const fingerprint = createHash('sha256').update(hash).digest('hex');
    const buffer = Buffer.from(`${'x'.repeat(3000)} const p = '${planted}'; const h = '${hash}'; ${'y'.repeat(3000)}`, 'latin1');
    assert.equal(scan.countHashCopies(buffer, fingerprint), 1);
    assert.equal(scan.countPasswordWindows(buffer, scan.OLD_PASSWORD_LENGTH, fingerprint), 1);
    assert.equal(scan.countHashCopies(buffer), 0, 'the real fingerprint does not match a test hash');
    assert.deepEqual(scan.gateMarkersIn('const x = environmentSwitchGate; // Too many wrong tries'), ['environmentSwitchGate', 'Too many wrong tries']);
  });

  test('src/: no copy of the hash, no plain-text password, none of the gate\'s names or words (the lockout included)', () => {
    const files = filesUnder('src');
    assert.ok(files.length > 150, `${files.length} files`);
    const hits = files.flatMap((f) => {
      const buffer = readFileSync(f);
      const found = [];
      if (scan.countHashCopies(buffer) > 0) found.push('hash');
      if (scan.countPasswordWindows(buffer) > 0) found.push('password');
      found.push(...scan.gateMarkersIn(buffer.toString('utf8')));
      return found.length ? [`${path.relative(REPO, f)}: ${found.join(', ')}`] : [];
    });
    assert.deepEqual(hits, []);
    // The lockout's constants and the hashing import. (A masked field is still in src: the email sign-in's password.)
    for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /from 'expo-crypto'|LOCKOUT_MS|MAX_ATTEMPTS|lockedForMs/, f);
  });

  test('the hash is kept nowhere in the working tree either (tests, scripts, docs, config): only its fingerprint', () => {
    const files = [...filesUnder('tests'), ...filesUnder('scripts'), ...filesUnder('docs'), path.join(REPO, 'app.json'), path.join(REPO, 'package.json')];
    assert.deepEqual(files.filter((f) => scan.countHashCopies(readFileSync(f)) > 0).map((f) => path.relative(REPO, f)), []);
  });

  test('the release bundle check fails on any trace of it (scripts/verify-release-bundle.js)', () => {
    const check = read('scripts/verify-release-bundle.js');
    assert.match(check, /require\('\.\/removed-gate-scan'\)/);
    assert.match(check, /if \(c\.hash > 0\) problems\.push\(/);
    assert.match(check, /if \(c\.password > 0\) problems\.push\(/);
    assert.match(check, /if \(c\.markers\.length > 0\) problems\.push\(/);
    assert.doesNotMatch(check, /password-scan|readPasswordHash|its hash in release JS/);
  });

  test('expo-crypto stays a dependency only because sign-in needs it (expo-auth-session); no app file imports it', () => {
    const authSession = JSON.parse(readFileSync(path.join(REPO, 'node_modules/expo-auth-session/package.json'), 'utf8'));
    assert.ok(authSession.dependencies['expo-crypto'], 'expo-auth-session depends on expo-crypto (PKCE)');
    assert.ok(JSON.parse(read('package.json')).dependencies['expo-crypto'], 'pinned since 2026-10-19 (Phase 2 SSO), before the gate');
  });
});

describe('the drawer card and the sheet, as approved (UI-STANDARDS.md §18)', () => {
  const drawer = read('src/navigation/DrawerContent.tsx');
  const sheet = read('src/navigation/EnvironmentSheet.tsx');

  test('one card, three rows with a hairline between: Environment, the account, Sign out', () => {
    const card = drawer.slice(drawer.indexOf('<View className="overflow-hidden rounded-xl border border-border">'));
    const environmentRow = card.indexOf('accessibilityLabel={`Environment: ');
    const accountRow = card.indexOf('accessibilityLabel="Open profile and settings"');
    const signOutRow = card.indexOf("{signingOut ? 'Signing out…' : 'Sign out'}");
    assert.ok(environmentRow > 0 && environmentRow < accountRow && accountRow < signOutRow, 'in that order, in the same card');
    const hairline = '<View className="mx-3 border-t border-gray-100" />';
    assert.equal(card.slice(0, signOutRow).split(hairline).length - 1, 2, 'a hairline after each of the first two rows');
    assert.ok(card.indexOf(hairline) > environmentRow && card.indexOf(hairline) < accountRow);
  });

  test('the row: a circular icon, "Environment", the PRODUCTION or UAT chip, a chevron, in that order', () => {
    const row = drawer.slice(drawer.indexOf('accessibilityLabel={`Environment: '), drawer.indexOf('accessibilityLabel="Open profile and settings"'));
    const at = (s) => row.indexOf(s);
    assert.ok(at('rounded-full') > 0 && at('<Ionicons name="server-outline"') > at('rounded-full'));
    assert.ok(at('>\n                  Environment\n') > at('<Ionicons name="server-outline"'));
    assert.ok(at('<EnvironmentChip env={environment} />') > at('Environment\n'));
    assert.ok(at('chevron-forward') > at('<EnvironmentChip'));
    assert.deepEqual(env.ENVIRONMENT_CHIP_LABELS, { PROD: 'PRODUCTION', UAT: 'UAT' });
  });

  test('no version line under the card: the version is on the Profile screen (the Settings row)', () => {
    assert.doesNotMatch(drawer, /APP_VERSION|v\{|dev build/);
    assert.match(read('src/screens/profile/ProfileScreen.tsx'), /<ReadOnly label="Version" value=\{APP_VERSION\} \/>/);
  });

  test('the sheet: the heading "Environment" and nothing else above the two one-line rows', () => {
    assert.match(sheet, /<Sheet visible=\{visible\} title="Environment" onClose=\{close\}>\s*<View accessibilityRole="radiogroup">/);
    assert.match(sheet, /<Text className="ml-3 flex-1 text-base font-medium text-gray-900" numberOfLines=\{1\}>\s*\{ENVIRONMENT_NAMES\[env\]\}/);
    // Gone: the host captions, the DEFAULT badge, the paragraph above, the warning box.
    assert.doesNotMatch(sheet, /apiHostFor|DEFAULT|Badge|Notice|amber|Choose which/);
  });

  test('the state chip: IN USE on the one in use, TESTING on UAT otherwise, in that environment\'s colours', () => {
    assert.equal(env.environmentRowState('PROD', 'PROD'), 'IN USE');
    assert.equal(env.environmentRowState('UAT', 'PROD'), 'TESTING');
    assert.equal(env.environmentRowState('PROD', 'UAT'), null);
    assert.equal(env.environmentRowState('UAT', 'UAT'), 'IN USE');
    assert.match(sheet, /\{state \? <EnvironmentChip env=\{env\} label=\{state\} \/> : null\}/);
    const row = sheet.slice(sheet.indexOf('function EnvironmentRow('));
    const radio = row.indexOf('rounded-full border-2');
    const name = row.indexOf('>\n        {ENVIRONMENT_NAMES[env]}\n');
    assert.ok(radio > 0 && radio < name && name < row.indexOf('<EnvironmentChip'), 'the radio on the left, the name, the chip on the right');
  });

  test('one line at the foot, then "Switch and sign out" and Cancel; switching is unchanged', () => {
    assert.match(sheet, /export const SWITCH_FOOTNOTE = 'Switching signs you out and clears everything loaded\.';/);
    assert.match(sheet, /<Text className="mx-4 mt-3 text-sm text-gray-600">\{SWITCH_FOOTNOTE\}<\/Text>/);
    assert.match(sheet, /<SubmitButton label=\{SWITCH_LABEL\} onPress=\{apply\} disabled=\{chosen === active\} loading=\{switching\} \/>/);
    assert.match(sheet, /<OutlineButton label="Cancel" onPress=\{close\} disabled=\{switching\} \/>/);
    assert.match(sheet, /await switchEnvironment\(chosen\);/);
  });
});

describe('the chip colours: WCAG AA at the chip\'s size, told apart by LIGHTNESS, not hue alone', () => {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const lightness = (hex) => {
    const y = luminance(hex);
    return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (y * 24389) / 27;
  };
  const { PROD, UAT } = colors.environment;

  test('PRODUCTION: brand red on its light tint; UAT: amber on its light tint (src/theme/colors.ts)', () => {
    assert.equal(PROD.fg, colors.primary);
    assert.equal(UAT.bg, '#fbbf24', 'amber-400');
    assert.equal(UAT.fg, '#451a03', 'amber-950');
    assert.ok(lightness(PROD.bg) > 90 && lightness(UAT.bg) > 75, 'both fills are light tints');
  });

  test('both pass WCAG AA (4.5:1) for the chip\'s 11 dp bold words', () => {
    assert.ok(contrast(PROD.fg, PROD.bg) >= 4.5, `PRODUCTION ${contrast(PROD.fg, PROD.bg).toFixed(2)}:1`);
    assert.ok(contrast(UAT.fg, UAT.bg) >= 4.5, `UAT ${contrast(UAT.fg, UAT.bg).toFixed(2)}:1`);
  });

  test('they differ in lightness: fills and words each at least 15 CIELAB L* apart', () => {
    assert.ok(Math.abs(lightness(PROD.bg) - lightness(UAT.bg)) >= 15, `fills ${Math.abs(lightness(PROD.bg) - lightness(UAT.bg)).toFixed(1)}`);
    assert.ok(Math.abs(lightness(PROD.fg) - lightness(UAT.fg)) >= 15, `words ${Math.abs(lightness(PROD.fg) - lightness(UAT.fg)).toFixed(1)}`);
  });

  test('every environment chip uses these tokens: the drawer row, its header\'s UAT chip, the sheet; no hex or ad-hoc amber', () => {
    const chip = read('src/navigation/EnvironmentChip.tsx');
    assert.match(chip, /const tone = colors\.environment\[env\];/);
    assert.match(chip, /style=\{\{ backgroundColor: tone\.bg \}\}/);
    assert.match(chip, /style=\{\{ color: tone\.fg \}\}/);
    const drawer = read('src/navigation/DrawerContent.tsx');
    assert.doesNotMatch(drawer, /bg-amber-100|text-amber-800/, 'the header chip is the same chip');
    assert.equal(drawer.split('<EnvironmentChip env={environment} />').length - 1, 2, 'the header chip and the row chip');
    for (const rel of ['src/navigation/EnvironmentChip.tsx', 'src/navigation/EnvironmentSheet.tsx', 'src/navigation/DrawerContent.tsx']) {
      assert.doesNotMatch(read(rel), /#[0-9a-fA-F]{6}\b/, rel);
    }
  });
});
