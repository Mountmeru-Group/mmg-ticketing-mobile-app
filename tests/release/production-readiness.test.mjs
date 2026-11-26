// First production build (2026-10-29): what must stay true for a Google Play build. Microsoft sign-in is the only
// way in (the __DEV__ developer-token screen is deleted), PROD is never reachable from a development build (since
// 2026-11-17 every RELEASE build starts on PROD and may switch to UAT), and the store identity in app.json does not
// drift. docs/RELEASE.md §5.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const PROD_URL = 'https://servicedesk.mountmerugroup.com/api/v1';
const UAT_URL = 'https://uat-servicedesk.mountmerugroup.com/api/v1';

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel.replace(/\\/g, '/')] : [];
  });
}

// 2026-11-05: email and password became the second way in; 2026-11-06 it was opened to PROD (02-AUTH.md §8). Both run
// from signInAttempt.ts; tests/auth/password-sign-in.test.mjs covers the email path itself.
describe('sign-in: Microsoft, and email on UAT and PROD, are the only ways into the app', () => {
  test('the auth stack registers one screen, Login, and its param list has nothing else', () => {
    const stack = read('src/navigation/AuthStack.tsx');
    assert.equal(stack.split('<Stack.Screen').length - 1, 1);
    assert.match(stack, /<Stack\.Screen name="Login" component=\{LoginScreen\} \/>/);
    assert.match(read('src/types/navigation.ts'), /export type AuthStackParamList = \{\s*Login: undefined;\s*\};/);
  });

  test('the developer-token screen, its layout and its placeholder-user guards are deleted', () => {
    for (const rel of ['src/screens/auth/DevTokenScreen.tsx', 'src/screens/PlaceholderScreen.tsx', 'src/utils/session.ts']) {
      assert.equal(existsSync(path.join(REPO, rel)), false, rel);
    }
    const leftovers = sourceFiles('src').filter((rel) =>
      /DevToken|PlaceholderScreen|isPlaceholderUser|canAssignToSelf|developer token/i.test(read(rel)),
    );
    assert.deepEqual(leftovers, []);
  });

  test('only the two sign-in flows create a session; the profile save re-stores the same token', () => {
    const callers = sourceFiles('src').filter((rel) => /\.setSession\(\{/.test(read(rel)));
    assert.deepEqual(callers.sort(), ['src/hooks/useProfile.ts', 'src/screens/auth/signInAttempt.ts']);
    const attempt = read('src/screens/auth/signInAttempt.ts');
    assert.equal(attempt.split('.setSession({').length - 1, 2, 'one call per sign-in flow');
    // fullAuthAt (02 §5.8) is set only after a challenged sign-in; the profile save never passes it, so it keeps the date.
    assert.match(attempt, /setSession\(\{ token: result\.session\.token, user: result\.session\.user, fullAuthAt \}\)/);
    // A password is a full credential check, so an email sign-in always starts a new 15 days.
    assert.match(attempt, /setSession\(\{ token: session\.token, user: session\.user, fullAuthAt: Date\.now\(\) \}\)/);
    assert.match(read('src/hooks/useProfile.ts'), /const \{ token, issuedAt, user: current \} = useAuthStore\.getState\(\);/);
    assert.doesNotMatch(read('src/hooks/useProfile.ts'), /fullAuthAt/);
  });

  test('the Login screen navigates nowhere: its primary action is "Sign in with Microsoft"', () => {
    // Since the "arc split" layout (2026-10-30) the action is SignInButton; it was a SubmitButton labelled
    // 'Signing in…' / 'Sign in with Microsoft' before. The email form (2026-11-05) opens in place, on the same screen.
    const login = read('src/screens/auth/LoginScreen.tsx');
    const button = read('src/screens/auth/SignInButton.tsx');
    const email = read('src/screens/auth/EmailSignInForm.tsx');
    for (const source of [login, button, email]) assert.doesNotMatch(source, /navigation\.|navigate\(/);
    assert.equal(login.split('<EmailSignInForm').length - 1, 1);
    assert.ok(login.indexOf('<EmailSignInForm') > login.indexOf('<SignInButton'), 'the email option sits below the pill');
    assert.equal(login.split('<SignInButton').length - 1, 1);
    assert.match(login, /<SignInButton busy=\{signingIn\} onPress=\{startSignIn\} \/>/);
    assert.match(button, /const LABEL = 'Sign in with Microsoft';/);
    assert.match(button, /accessibilityLabel=\{LABEL\}/);
  });
});

// 2026-11-17: the environment is a RUNTIME choice (Login's gear), no longer fixed by the EAS profile. Until then these
// tests pinned "PROD only from a release build of the production profile" (EXPO_PUBLIC_APP_ENV=PROD); that premise is
// gone. What stays: a development build can never use PROD. The switch itself: tests/environment/.
describe('environment: every release build starts on Production and may switch; a development build is UAT only', () => {
  let copy = 0;
  /** A fresh src/config/env.ts, evaluated as a build with this __DEV__ (and a stray EXPO_PUBLIC_APP_ENV) would evaluate it. */
  async function loadEnv(dev, appEnv) {
    const saved = { dev: globalThis.__DEV__, appEnv: process.env.EXPO_PUBLIC_APP_ENV };
    globalThis.__DEV__ = dev;
    if (appEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = appEnv;
    try {
      return await import(`../../src/config/env.ts?case=${++copy}`);
    } finally {
      globalThis.__DEV__ = saved.dev;
      if (saved.appEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = saved.appEnv;
    }
  }

  test('a release build offers Production and UAT, starts on Production, and has the switch', async () => {
    const env = await loadEnv(false, undefined);
    assert.deepEqual(env.SELECTABLE_ENVIRONMENTS, ['PROD', 'UAT']);
    assert.equal(env.DEFAULT_ENVIRONMENT, 'PROD');
    assert.equal(env.CAN_SWITCH_ENVIRONMENT, true);
    assert.equal(env.apiBaseUrlFor('PROD'), PROD_URL);
    assert.equal(env.healthUrlFor('PROD'), 'https://servicedesk.mountmerugroup.com/health');
    assert.equal(env.environmentLabel('PROD'), 'PROD · servicedesk.mountmerugroup.com');
    assert.equal(env.apiBaseUrlFor('UAT'), UAT_URL);
    assert.equal(env.environmentLabel('UAT'), 'UAT · uat-servicedesk.mountmerugroup.com');
  });

  test('EXPO_PUBLIC_APP_ENV no longer decides anything: Production is the release default whatever it says', async () => {
    for (const appEnv of ['UAT', 'PROD', undefined, 'prod', 'QA']) {
      const env = await loadEnv(false, appEnv);
      assert.equal(env.DEFAULT_ENVIRONMENT, 'PROD', String(appEnv));
      assert.deepEqual(env.SELECTABLE_ENVIRONMENTS, ['PROD', 'UAT'], String(appEnv));
    }
    assert.doesNotMatch(read('src/config/env.ts'), /process\.env/);
  });

  test('a development build refuses PROD: UAT only, no switch, and a PROD URL is never handed out', async () => {
    for (const appEnv of ['PROD', undefined]) {
      const env = await loadEnv(true, appEnv);
      assert.deepEqual(env.SELECTABLE_ENVIRONMENTS, ['UAT'], String(appEnv));
      assert.equal(env.DEFAULT_ENVIRONMENT, 'UAT');
      assert.equal(env.CAN_SWITCH_ENVIRONMENT, false);
      assert.equal(env.isSelectableEnvironment('PROD'), false);
      assert.throws(() => env.apiBaseUrlFor('PROD'), /a development build must never point at production/);
      assert.equal(env.apiBaseUrlFor('UAT'), UAT_URL);
      assert.equal(env.environmentLabel('UAT'), 'UAT · uat-servicedesk.mountmerugroup.com · development build');
    }
  });
});

describe('EAS build guard (scripts/eas-build-guard.js)', () => {
  function guard(profile, appEnv, script = path.join(REPO, 'scripts', 'eas-build-guard.js')) {
    const env = { ...process.env };
    delete env.EAS_BUILD_PROFILE;
    delete env.EXPO_PUBLIC_APP_ENV;
    if (profile !== undefined) env.EAS_BUILD_PROFILE = profile;
    if (appEnv !== undefined) env.EXPO_PUBLIC_APP_ENV = appEnv;
    return spawnSync(process.execPath, [script], { env, encoding: 'utf8' }).status;
  }

  test('permits every profile that leaves the environment to the app', () => {
    for (const profile of ['production', 'preview', undefined]) assert.equal(guard(profile, undefined), 0, String(profile));
  });

  test('refuses any profile that still sets EXPO_PUBLIC_APP_ENV, whatever its value', () => {
    for (const profile of ['production', 'preview', 'development', undefined]) {
      for (const appEnv of ['PROD', 'UAT', '']) assert.equal(guard(profile, appEnv), 1, `${profile} ${appEnv}`);
    }
  });

  test('refuses every profile when env.ts lacks either URL, or cannot be read (fails closed)', () => {
    // A copy of the guard next to a fake env.ts, in the OS temp folder: the repo's own env.ts is never touched.
    const source = read('src/config/env.ts');
    const cases = {
      'no PROD': source.replace(/^(\s*PROD:\s*)'[^']*'/m, "$1''"),
      'no UAT': source.replace(/^(\s*UAT:\s*)'[^']*'/m, "$1''"),
      'no env.ts': null,
    };
    for (const [name, fake] of Object.entries(cases)) {
      if (fake !== null) assert.notEqual(fake, source, `${name}: the fake differs`);
      const root = mkdtempSync(path.join(tmpdir(), 'mmg-guard-'));
      try {
        mkdirSync(path.join(root, 'scripts'));
        mkdirSync(path.join(root, 'src', 'config'), { recursive: true });
        writeFileSync(path.join(root, 'scripts', 'eas-build-guard.js'), read('scripts/eas-build-guard.js'));
        if (fake !== null) writeFileSync(path.join(root, 'src', 'config', 'env.ts'), fake);
        for (const profile of ['production', 'preview']) {
          assert.equal(guard(profile, undefined, path.join(root, 'scripts', 'eas-build-guard.js')), 1, `${name}, ${profile}`);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

describe('build profiles and store identity', () => {
  // eas.json is JSON5: every comment in it is a whole line.
  const eas = JSON.parse(read('eas.json').replace(/^\s*\/\/.*$/gm, ''));
  const app = JSON.parse(read('app.json')).expo;

  // 2026-11-17: no profile chooses the environment any more (it was EXPO_PUBLIC_APP_ENV PROD / UAT per profile).
  test('production is a store AAB, preview an internal APK; neither sets an environment; no URL in eas.json', () => {
    assert.deepEqual(
      { distribution: eas.build.production.distribution, buildType: eas.build.production.android.buildType, env: eas.build.production.env },
      { distribution: 'store', buildType: 'app-bundle', env: undefined },
    );
    assert.deepEqual(
      { distribution: eas.build.preview.distribution, buildType: eas.build.preview.android.buildType, env: eas.build.preview.env },
      { distribution: 'internal', buildType: 'apk', env: undefined },
    );
    const json = JSON.stringify(eas);
    assert.doesNotMatch(json, /https?:\/\//);
    assert.doesNotMatch(json, /EXPO_PUBLIC_APP_ENV/);
  });

  test('src/config/env.ts holds exactly the two approved URLs', () => {
    const source = read('src/config/env.ts');
    assert.match(source, /^\s*UAT: 'https:\/\/uat-servicedesk\.mountmerugroup\.com\/api\/v1',$/m);
    assert.match(source, /^\s*PROD: 'https:\/\/servicedesk\.mountmerugroup\.com\/api\/v1',$/m);
  });

  test('version 1.0.0 with a versionCode above the last one uploaded to Google Play (8)', () => {
    // versionCode 2 was the first AAB uploaded to Play, versionCode 8 the latest (on Play by Ronit's brief of
    // 2026-11-26); Play rejects any upload not above the last one it received.
    assert.equal(app.version, '1.0.0');
    assert.ok(Number.isInteger(app.android.versionCode) && app.android.versionCode > 8, String(app.android.versionCode));
  });

  test("ShortcutBadger's 16 launcher-badge permissions are blocked, and nothing the app needs is", () => {
    // Every <uses-permission> in ShortcutBadger 1.1.22's AAR manifest (pulled in by expo-notifications); its four
    // com.android.launcher entries are commented out there. Setu never sets a badge. RELEASE.md §5a.
    const BADGER = [
      'com.sec.android.provider.badge.permission.READ', 'com.sec.android.provider.badge.permission.WRITE',
      'com.htc.launcher.permission.READ_SETTINGS', 'com.htc.launcher.permission.UPDATE_SHORTCUT',
      'com.sonyericsson.home.permission.BROADCAST_BADGE', 'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
      'com.anddoes.launcher.permission.UPDATE_COUNT', 'com.majeur.launcher.permission.UPDATE_BADGE',
      'com.huawei.android.launcher.permission.CHANGE_BADGE', 'com.huawei.android.launcher.permission.READ_SETTINGS',
      'com.huawei.android.launcher.permission.WRITE_SETTINGS', 'android.permission.READ_APP_BADGE',
      'com.oppo.launcher.permission.READ_SETTINGS', 'com.oppo.launcher.permission.WRITE_SETTINGS',
      'me.everything.badger.permission.BADGE_COUNT_READ', 'me.everything.badger.permission.BADGE_COUNT_WRITE',
    ];
    const blocked = app.android.blockedPermissions;
    for (const permission of BADGER) assert.ok(blocked.includes(permission), permission);
    const needed = [
      'INTERNET', 'ACCESS_NETWORK_STATE', 'POST_NOTIFICATIONS', 'WAKE_LOCK', 'CAMERA', 'READ_EXTERNAL_STORAGE', 'VIBRATE',
    ].map((p) => `android.permission.${p}`);
    for (const permission of [...needed, 'com.google.android.c2dm.permission.RECEIVE']) {
      assert.ok(!blocked.includes(permission), permission);
    }
  });

  test('package, slug, schemes and EAS project are unchanged (the Entra registration and EAS key depend on them)', () => {
    assert.equal(app.android.package, 'com.mountmeru.servicedesk');
    assert.equal(app.slug, 'meru-servicedesk');
    assert.deepEqual(app.scheme, ['mmgservicedesk', 'com.mountmeru.servicedesk', 'msauth']);
    assert.equal(app.extra.eas.projectId, '86788b11-328a-4ad7-a3dc-275b6f31325e');
  });
});
