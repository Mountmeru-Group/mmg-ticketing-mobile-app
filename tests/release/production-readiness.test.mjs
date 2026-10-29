// First production build (2026-10-29): what must stay true for a Google Play build. Microsoft sign-in is the only
// way in (the __DEV__ developer-token screen is deleted), PROD is reachable only from a release build of the
// `production` EAS profile, and the store identity in app.json does not drift. docs/RELEASE.md §5.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

describe('sign-in: Microsoft is the only way into the app', () => {
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

  test('only the Microsoft flow creates a session; the profile save re-stores the same token', () => {
    const callers = sourceFiles('src').filter((rel) => /\.setSession\(\{/.test(read(rel)));
    assert.deepEqual(callers.sort(), ['src/hooks/useProfile.ts', 'src/screens/auth/signInAttempt.ts']);
    assert.match(read('src/screens/auth/signInAttempt.ts'), /setSession\(\{ token: result\.session\.token, user: result\.session\.user \}\)/);
    assert.match(read('src/hooks/useProfile.ts'), /const \{ token, issuedAt, user: current \} = useAuthStore\.getState\(\);/);
  });

  test('the Login screen navigates nowhere: its one action is "Sign in with Microsoft"', () => {
    const login = read('src/screens/auth/LoginScreen.tsx');
    assert.doesNotMatch(login, /navigation\.|navigate\(/);
    assert.match(login, /label=\{signingIn \? 'Signing in…' : 'Sign in with Microsoft'\}/);
  });
});

describe('environment: PROD only from a release build', () => {
  let copy = 0;
  /** A fresh src/config/env.ts, evaluated as a build with this __DEV__ and EXPO_PUBLIC_APP_ENV would evaluate it. */
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

  test('a release build of the production profile talks to production', async () => {
    const env = await loadEnv(false, 'PROD');
    assert.equal(env.APP_ENV, 'PROD');
    assert.equal(env.API_BASE_URL, PROD_URL);
    assert.equal(env.HEALTH_URL, 'https://servicedesk.mountmerugroup.com/health');
    assert.equal(env.ENVIRONMENT_LABEL, 'PROD · servicedesk.mountmerugroup.com');
  });

  test('a release build of preview (UAT), or with nothing set, talks to UAT', async () => {
    for (const appEnv of ['UAT', undefined, 'prod', 'QA']) {
      const env = await loadEnv(false, appEnv);
      assert.equal(env.API_BASE_URL, UAT_URL, String(appEnv));
    }
  });

  test('a development build refuses PROD and otherwise talks to UAT', async () => {
    await assert.rejects(loadEnv(true, 'PROD'), /a development build must never point at production/);
    const env = await loadEnv(true, undefined);
    assert.equal(env.API_BASE_URL, UAT_URL);
    assert.equal(env.ENVIRONMENT_LABEL, 'UAT · uat-servicedesk.mountmerugroup.com · development build');
  });
});

describe('EAS build guard (scripts/eas-build-guard.js)', () => {
  function guard(profile, appEnv) {
    const env = { ...process.env };
    delete env.EAS_BUILD_PROFILE;
    delete env.EXPO_PUBLIC_APP_ENV;
    if (profile !== undefined) env.EAS_BUILD_PROFILE = profile;
    if (appEnv !== undefined) env.EXPO_PUBLIC_APP_ENV = appEnv;
    return spawnSync(process.execPath, [path.join(REPO, 'scripts', 'eas-build-guard.js')], { env, encoding: 'utf8' }).status;
  }

  test('permits production with PROD, and preview with UAT', () => {
    assert.equal(guard('production', 'PROD'), 0);
    assert.equal(guard('preview', 'UAT'), 0);
  });

  test('refuses PROD on every other profile', () => {
    for (const profile of ['preview', 'development', 'anything-else', undefined]) {
      assert.equal(guard(profile, 'PROD'), 1, String(profile));
    }
  });

  test('refuses a production build that does not target PROD', () => {
    assert.equal(guard('production', 'UAT'), 1);
    assert.equal(guard('production', undefined), 1);
  });
});

describe('build profiles and store identity', () => {
  // eas.json is JSON5: every comment in it is a whole line.
  const eas = JSON.parse(read('eas.json').replace(/^\s*\/\/.*$/gm, ''));
  const app = JSON.parse(read('app.json')).expo;

  test('production is a store AAB on PROD; preview is an internal APK on UAT; no URL in eas.json', () => {
    assert.deepEqual(
      { distribution: eas.build.production.distribution, buildType: eas.build.production.android.buildType, env: eas.build.production.env },
      { distribution: 'store', buildType: 'app-bundle', env: { EXPO_PUBLIC_APP_ENV: 'PROD' } },
    );
    assert.deepEqual(
      { distribution: eas.build.preview.distribution, buildType: eas.build.preview.android.buildType, env: eas.build.preview.env },
      { distribution: 'internal', buildType: 'apk', env: { EXPO_PUBLIC_APP_ENV: 'UAT' } },
    );
    assert.doesNotMatch(read('eas.json'), /https?:\/\//);
  });

  test('src/config/env.ts holds exactly the two approved URLs', () => {
    const source = read('src/config/env.ts');
    assert.match(source, /^\s*UAT: 'https:\/\/uat-servicedesk\.mountmerugroup\.com\/api\/v1',$/m);
    assert.match(source, /^\s*PROD: 'https:\/\/servicedesk\.mountmerugroup\.com\/api\/v1',$/m);
  });

  test('version 1.0.0 with a versionCode above every earlier build (all used 1)', () => {
    assert.equal(app.version, '1.0.0');
    assert.ok(Number.isInteger(app.android.versionCode) && app.android.versionCode >= 2, String(app.android.versionCode));
  });

  test('package, slug, schemes and EAS project are unchanged (the Entra registration and EAS key depend on them)', () => {
    assert.equal(app.android.package, 'com.mountmeru.servicedesk');
    assert.equal(app.slug, 'meru-servicedesk');
    assert.deepEqual(app.scheme, ['mmgservicedesk', 'com.mountmeru.servicedesk', 'msauth']);
    assert.equal(app.extra.eas.projectId, '86788b11-328a-4ad7-a3dc-275b6f31325e');
  });
});
