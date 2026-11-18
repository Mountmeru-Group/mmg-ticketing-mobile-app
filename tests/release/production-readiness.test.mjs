// iOS-9b: what must stay true for the App Store build. The iOS port of Android's file (6b5e46c), with only what is true
// on iOS: PROD is reachable only from a release build of the `production` EAS profile, each bundle holds ONE API URL
// (src/config/env.ts picks it at build time), the preview (TestFlight, UAT) profile is exactly as before, and the version,
// runtime and update channels keep a TestFlight update away from an App Store build. docs/ios/RELEASE-IOS.md.
// iOS-5i: Android's sign-in cases too, now that the developer-token screen is deleted (the iOS-9 list's items 1 and 5,
// docs/ios/ANDROID-DELTA.md §5). Not ported: Android's Google Play items. The bundles themselves are checked by
// scripts/verify-release-bundle.js (both profiles).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
/** Code only: comments may name anything in prose. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PROD_URL = 'https://servicedesk.mountmerugroup.com/api/v1';
const UAT_URL = 'https://uat-servicedesk.mountmerugroup.com/api/v1';

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel.replace(/\\/g, '/')] : [];
  });
}

// Android's block (4063df3, c5c63ac, f4fad10, 999943e), on iOS since iOS-5i. iOS difference: the email sign-in's session
// is stored by its own file, passwordSignInAttempt.ts (iOS-5g), not by signInAttempt.ts; the assertions are the same.
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
    assert.deepEqual(callers.sort(), ['src/hooks/useProfile.ts', 'src/screens/auth/passwordSignInAttempt.ts', 'src/screens/auth/signInAttempt.ts']);
    const attempt = read('src/screens/auth/signInAttempt.ts');
    const password = read('src/screens/auth/passwordSignInAttempt.ts');
    assert.equal(attempt.split('.setSession({').length - 1 + password.split('.setSession({').length - 1, 2, 'one call per sign-in flow');
    // fullAuthAt (02 §5.8) is set only after a challenged sign-in; the profile save never passes it, so it keeps the date.
    assert.match(attempt, /setSession\(\{ token: result\.session\.token, user: result\.session\.user, fullAuthAt \}\)/);
    // A password is a full credential check, so an email sign-in always starts a new 15 days.
    assert.match(password, /setSession\(\{ token: session\.token, user: session\.user, fullAuthAt: Date\.now\(\) \}\)/);
    assert.match(read('src/hooks/useProfile.ts'), /const \{ token, issuedAt, user: current \} = useAuthStore\.getState\(\);/);
    assert.doesNotMatch(read('src/hooks/useProfile.ts'), /fullAuthAt/);
  });

  test('the Login screen navigates nowhere: its primary action is "Sign in with Microsoft"', () => {
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
    assert.equal(env.API_HOST, 'servicedesk.mountmerugroup.com');
    assert.equal(env.ENVIRONMENT_LABEL, 'PROD · servicedesk.mountmerugroup.com');
    assert.equal(env.SHOW_ENVIRONMENT_CHIP, false);
  });

  test('a release build of preview (UAT), or with nothing set, or anything but exactly PROD, talks to UAT', async () => {
    for (const appEnv of ['UAT', undefined, 'prod', 'QA', '']) {
      const env = await loadEnv(false, appEnv);
      assert.equal(env.APP_ENV, 'UAT', String(appEnv));
      assert.equal(env.API_BASE_URL, UAT_URL, String(appEnv));
      assert.equal(env.HEALTH_URL, 'https://uat-servicedesk.mountmerugroup.com/health');
    }
  });

  test('a development build refuses PROD and otherwise talks to UAT', async () => {
    await assert.rejects(loadEnv(true, 'PROD'), /a development build must never point at production/);
    const env = await loadEnv(true, undefined);
    assert.equal(env.API_BASE_URL, UAT_URL);
    assert.equal(env.ENVIRONMENT_LABEL, 'UAT · uat-servicedesk.mountmerugroup.com · development build');
  });

  test('iOS: ONE URL per bundle: each URL once, in its own branch of a build-time choice on EXPO_PUBLIC_APP_ENV', () => {
    const source = read('src/config/env.ts');
    const urls = code('src/config/env.ts').match(/https?:\/\/[^'\s`]+/g);
    assert.deepEqual(urls, [PROD_URL, UAT_URL], 'exactly the two approved URLs, once each, and no other (code only)');
    assert.match(
      source,
      /const API_BASE_URLS: Partial<Record<AppEnvironment, string>> =\s*process\.env\.EXPO_PUBLIC_APP_ENV === 'PROD'\s*\?\s*\{\s*PROD: 'https:\/\/servicedesk\.mountmerugroup\.com\/api\/v1',\s*\}\s*:\s*\{\s*UAT: 'https:\/\/uat-servicedesk\.mountmerugroup\.com\/api\/v1',\s*\};/,
    );
    // The build guard and the release check read each URL from its own line.
    assert.match(source, /^\s*PROD: 'https:\/\/servicedesk\.mountmerugroup\.com\/api\/v1',$/m);
    assert.match(source, /^\s*UAT: 'https:\/\/uat-servicedesk\.mountmerugroup\.com\/api\/v1',$/m);
    assert.match(source, /^export const API_BASE_URL: string = API_BASE_URLS\[APP_ENV\] \?\? '';$/m);
    // The release check's own rule: one URL per profile, both directions (it builds the bundles; this pins the rule).
    const check = read('scripts/verify-release-bundle.js');
    assert.match(check, /const OWN_API_URL = profile === 'production' \? PROD_API_URL : UAT_API_URL;/);
    assert.match(check, /const OTHER_API_URL = profile === 'production' \? UAT_API_URL : PROD_API_URL;/);
    assert.match(check, /const ALLOWED_HOSTS = \[hostOf\(OWN_API_URL\)\]\.filter\(Boolean\);/);
    // In every target searched (the JS and the Hermes bytecode), and for both profiles: not inside a profile branch.
    assert.match(check, /else for \(const \[k, t\] of Object\.entries\(targets\)\) if \(count\(t, OTHER_API_URL\) > 0\) problems\.push\(/);
    assert.match(check, /const targets = \{ 'release JS': read\(releaseJs\), \.\.\.\(releaseHbc \? \{ 'release Hermes': read\(releaseHbc\) \} : \{\}\) \};/);
    assert.match(check, /else if \(count\(js, OWN_API_URL\) === 0\) problems\.push/);
  });

  test('no plain-http URL anywhere in the app, its config or its build profiles', () => {
    for (const rel of [...sourceFiles('src'), 'App.tsx', 'app.json', 'eas.json']) {
      assert.doesNotMatch(code(rel), /http:\/\//, rel);
    }
  });
});

describe('EAS build guard (scripts/eas-build-guard.js), on this repo', () => {
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

describe('build profiles, submit and store identity', () => {
  // eas.json is JSON5: every comment in it is a whole line.
  const eas = JSON.parse(read('eas.json').replace(/^\s*\/\/.*$/gm, ''));
  const app = JSON.parse(read('app.json')).expo;

  test('preview (TestFlight, UAT) is exactly as before iOS-9b', () => {
    assert.deepEqual(eas.build.preview, {
      node: '24.18.0',
      distribution: 'store',
      channel: 'ios-preview',
      env: { EXPO_PUBLIC_APP_ENV: 'UAT' },
      ios: { autoIncrement: true },
    });
    assert.deepEqual(eas.submit.preview, { ios: { ascAppId: '6827931735', appleTeamId: 'ZNPR2MFW76' } });
  });

  test('production is the App Store build on PROD: store, channel production, its own build numbers', () => {
    assert.deepEqual(eas.build.production, {
      node: '24.18.0',
      distribution: 'store',
      channel: 'production',
      env: { EXPO_PUBLIC_APP_ENV: 'PROD' },
      ios: { autoIncrement: true },
    });
    assert.equal(eas.cli.appVersionSource, 'remote', 'EAS keeps the build number; app.json keeps the version');
    assert.deepEqual(Object.keys(eas.build).sort(), ['preview', 'production']);
  });

  test('submit.production: the same App Store Connect app and team as preview', () => {
    assert.deepEqual(eas.submit.production, { ios: { ascAppId: '6827931735', appleTeamId: 'ZNPR2MFW76' } });
    assert.deepEqual(eas.submit.production, eas.submit.preview);
  });

  test('no URL and no credential in eas.json', () => {
    const text = read('eas.json');
    assert.doesNotMatch(text, /https?:\/\//);
    assert.doesNotMatch(text, /ascApiKey|appleId"|password|\.p8|\.p12|mobileprovision/i);
  });

  test('version 1.1.0 (iOS-5i, a new App Store version), so the runtime is 1.1.0 (policy appVersion) for every build from here', () => {
    assert.equal(app.version, '1.1.0');
    assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
    assert.equal(app.ios.buildNumber, '1', 'only seeds the EAS counter (appVersionSource remote)');
  });

  test('update channels: a TestFlight update can never reach an App Store build', () => {
    // Each binary carries its profile's channel (EAS writes it into Expo.plist); updates are served per channel.
    assert.equal(eas.build.preview.channel, 'ios-preview');
    assert.equal(eas.build.production.channel, 'production');
    assert.notEqual(eas.build.preview.channel, eas.build.production.channel);
    // The app has no way to switch its channel at run time: nothing imports expo-updates' JavaScript API.
    for (const rel of [...sourceFiles('src'), 'App.tsx', 'index.ts']) {
      assert.doesNotMatch(code(rel), /from 'expo-updates'|require\('expo-updates'\)|setUpdateURLAndRequestHeadersOverride/, rel);
    }
    // No channel or request headers are hard-coded in app.json, which would override the profile's.
    assert.equal(app.updates.requestHeaders, undefined);
    assert.equal(app.updates.url, 'https://u.expo.dev/f7e5b2ae-0785-414d-b9c9-9e3e59b21be3');
  });

  test('App Transport Security: arbitrary loads off, no exception domains (as the SDK 57 template, now explicit)', () => {
    assert.deepEqual(app.ios.infoPlist.NSAppTransportSecurity, { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true });
  });

  test('store identity is unchanged: bundle ID, iPhone only, export compliance, scheme, EAS project, purpose strings', () => {
    assert.equal(app.ios.bundleIdentifier, 'com.mountmeru.servicedesk');
    assert.equal(app.ios.supportsTablet, false);
    assert.deepEqual(app.ios.config, { usesNonExemptEncryption: false });
    assert.equal(app.scheme, 'msauth.com.mountmeru.servicedesk');
    assert.equal(app.slug, 'setu-ios');
    assert.equal(app.name, 'Setu');
    assert.equal(app.extra.eas.projectId, 'f7e5b2ae-0785-414d-b9c9-9e3e59b21be3');
    assert.deepEqual(Object.keys(app.ios.infoPlist).sort(), [
      'NSAppTransportSecurity', 'NSCameraUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSPhotoLibraryUsageDescription',
    ]);
  });
});
