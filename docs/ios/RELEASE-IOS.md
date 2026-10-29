# Release guide — Setu (iOS)

**Written in Phase iOS-5, 2026-10-29.** Android's guide stays `docs/RELEASE.md` at the port source. Manifest §4.7 planned to rewrite that file in iOS-7; the iOS-5 brief asked for this file in `docs/ios/` instead. The build guard's refusal message still says "docs/RELEASE.md" (`scripts/eas-build-guard.js:63`); it means this file. That message was not changed in iOS-5.

**No `eas` command has been run on this branch.** The commands in §4 and §6 are for iOS-7 and later, when their phase brief allows them (CLAUDE.md I7).

| | |
|---|---|
| Bundle ID | `com.mountmeru.servicedesk` (iPhone only, `supportsTablet: false`) |
| Version | `app.json` `expo.version` and `expo.ios.buildNumber`. `eas.json` has `appVersionSource: "local"`: bump both by hand for each upload |
| Profiles | `preview` (TestFlight, UAT) · `production` (placeholder, refused by the build guard) |
| EAS project | Not created yet. `setu-ios`, in iOS-7. Its `projectId` goes in `app.json` `extra.eas`; the release check reads it from there |
| Apple records | Apple Developer team, App Store Connect app and TestFlight internal group: iOS-7 |
| `eas-cli` | Not a dependency. Always `npx eas-cli@24.8.0 …`; `eas.json` requires `>= 24.8.0` |
| API | UAT only: `https://uat-servicedesk.mountmerugroup.com/api/v1`. PROD stays empty until Ronit signs it off (CLAUDE.md I3) |

## 1. Build profiles (`eas.json`) and the build guard

| Profile | Distribution | Channel | `EXPO_PUBLIC_APP_ENV` | Use |
|---|---|---|---|---|
| `preview` | `store` (TestFlight requires store signing) | `ios-preview` | `UAT` | Every TestFlight build |
| `production` | `store` | `production` | `PROD` | App Review (iOS-9). **Not runnable today** |

`scripts/eas-build-guard.js` runs on the EAS server first (`eas-build-pre-install`), before `npm install`. It refuses a build in three cases:
1. a profile other than `production` asks for `PROD` (development and preview builds are UAT only);
2. `production` while the PROD URL in `src/config/env.ts` is empty;
3. `production` while a value in `src/config/legal.ts` is empty (§7).

**The `legal.ts` rule blocks only `production`, never the TestFlight `preview` build.** Checked on 2026-10-29 by calling the guard's own `verdict()` with today's files:

| Build | Result |
|---|---|
| `preview`, UAT, `legal.ts` empty (today) | **OK** |
| `preview`, UAT, `legal.ts` unreadable | **OK** |
| `production`, PROD, `legal.ts` empty, no PROD URL (today) | Refused: no PROD URL, and the three legal values |
| `production`, PROD URL set, `legal.ts` empty | Refused: the three legal values |
| `production`, PROD URL set, `legal.ts` filled | **OK** |
| `preview` asking for PROD | Refused (CLAUDE.md rule 4) |

To see the verdict locally: `EAS_BUILD_PROFILE=production EXPO_PUBLIC_APP_ENV=PROD node scripts/eas-build-guard.js`. It is pinned by `tests/screens/hig-polish.test.mjs`.

## 2. Pre-build checks: before every build or update, in order

Stop at the first failure.

| # | Command | Pass |
|---|---|---|
| 1 | `git status` and `git log -1` | On `ios-dev`, clean, and equal to `origin/ios-dev`. The commit being built is pushed |
| 2 | `npx tsc --noEmit` | 0 errors |
| 3 | `npm test` | Every test passes (962 on 2026-10-29). The count never goes down without a reason in the phase notes |
| 4 | `npx expo-doctor` | Every check passes except `react-native-render-html` "Unmaintained" (known since iOS-1b) |
| 5 | `npm ci --dry-run` | "up to date": the lockfile installs as it is |
| 6 | `npm run verify:release-bundle` | **PASS** for `preview` (§3). Before an iOS-9 `production` build, also `npm run verify:release-bundle -- --profile production` |
| 7 | `app.json` | `version` and `ios.buildNumber` bumped since the last upload |

## 3. The release-bundle check (`scripts/verify-release-bundle.js`)

**What it builds.** The bundle is made as the iOS release build makes it:
- `expo export:embed --platform ios --dev false --minify true` into `main.jsbundle`, with its source map;
- compiled to Hermes bytecode with the project's `hermesc`;
- plus a development bundle as a **control**.

`--profile preview` (the default) bundles with `EXPO_PUBLIC_APP_ENV=UAT`; `--profile production` with `PROD`. Everything goes to the OS temp folder and is deleted afterwards (`--keep` keeps it). It prints counts only, never a matched value.

**It FAILS (exit 1) when the release bundle:**
- contains any of the 12 strings of the `__DEV__`-only developer-token screen, or a "DEV PLACEHOLDER" string;
- contains a test-login marker (`x-test-secret`, `TEST_AUTH_SECRET`, `/auth/test-login`, `sd_session=`) or a backend secret name (`AZURE_AD`);
- contains a **client-secret value**: an Entra secret (`…NQ~…`), a literal assigned to the client-secret option, or `client_secret=<value>` inside a string;
- names the client-secret option outside `expo-auth-session`'s own modules;
- lacks the iOS redirect `msauth.com.mountmeru.servicedesk://auth`, or contains the Android form `msauth://`;
- **(preview)** lacks the UAT API URL from `src/config/env.ts`;
- names any `mountmerugroup.com` host that `env.ts` doesn't allow;
- contains a UUID-v4 literal that is not a known public ID, or a literal "Bearer <uuid>";
- reaches an Android-only API from app code: `ToastAndroid`, `BackHandler`, `PermissionsAndroid`, `DateTimePickerAndroid`, `DrawerLayoutAndroid`, `TouchableNativeFeedback` or `android_ripple`. App code is read from the bundle's source map, with comments removed; library code doesn't count;
- contains `@react-navigation/drawer`;
- lacks its control strings (the non-JSON guard, the error screen, "Sign in with Microsoft"), which would mean the wrong file was searched.

It reports, but does not fail on, the Android-only props that iOS ignores (`statusBarTranslucent`).

**Android's false positives, fixed** (02-AUTH §7.6 item 8; PERFORMANCE §9.3; manifest §4.10, approved 2026-10-28):

| Android flagged | Why it was wrong | iOS rule |
|---|---|---|
| `client_secret`, `clientSecret` (28 hits) | `expo-auth-session`'s own option names: code, not a value | Names allowed only inside `node_modules/expo-auth-session/`. Secret **values** are searched instead. The library copies the option into a request (`s.client_secret=t.clientSecret`), which is not matched |
| UUID-v4 literals from `auth.config.ts` | The Entra client and tenant IDs are public; they ship in every build | Read from `auth.config.ts`, and allowed |
| The EAS `projectId` from `app.json` | Public | Read from `app.json` once it exists, and allowed |
| UUIDs it couldn't attribute | — | Allowed only when library code defines them, or when the UUID is the build's own `//# debugId=` line and equals the source map's `debugId` (Metro stamps one per build) |

**Result on 2026-10-29:** see §8.

## 4. Build and submit (from iOS-7)

> **Phone hotspot.** The MMG office network blocks uploads to Expo. Before `eas build`, `eas submit` or `eas update`, switch the laptop to a phone hotspot. The upload is small (about 1 MB).

1. Run §2 in full.
2. Build for TestFlight:
   ```
   npx eas-cli@24.8.0 build --platform ios --profile preview
   ```
   - EAS creates and keeps the Apple distribution certificate and the provisioning profile. Nothing goes in the repo: no `.p12`, no `.mobileprovision`, no `.p8` (CLAUDE.md rule 8).
   - The build guard runs first, on the server (§1).
   - Check the build log: Xcode 26 or later with the iOS 26 SDK (compliance J1); the deployment target (J2).
3. Submit the latest build to App Store Connect, for TestFlight:
   ```
   npx eas-cli@24.8.0 submit --platform ios --latest
   ```
4. In App Store Connect › TestFlight, give the build to the **internal** group only (compliance K2). An external group would trigger Beta App Review and widen access.
5. Testers follow `docs/ios/UAT-TEST-PLAN-IOS.md`. TestFlight builds expire after 90 days.

**First build only (iOS-7):**
- `npx eas-cli@24.8.0 init` creates `setu-ios` and writes its `projectId` into `app.json`. Re-run `npm run verify:release-bundle`: the check reads the new ID from `app.json` and allows it.
- Create the App Store Connect record and reserve the name (compliance B3, D11).
- Ask IT to confirm Entra's iOS/macOS platform entry (02-AUTH §7.7).

## 5. Getting a build to testers

- Internal testers are added in App Store Connect › Users and Access, then to the TestFlight internal group. They install with the TestFlight app (UAT plan A1–A2).
- **Only UAT `preview` builds go to TestFlight.** Never a build pointed at production (CLAUDE.md rule 4).

## 6. EAS Update rules (from iOS-7)

**Prerequisites, none of them in place yet:**
- `expo-updates` added to the project (decision D6, iOS-7);
- `runtimeVersion` set (compliance C2: the `fingerprint` policy);
- the EAS project (§4).

**The command, for TestFlight builds:**
```
npx eas-cli@24.8.0 update --channel ios-preview --platform ios --message "fix: <what and why>"
```

**Rules:**
1. **Fixes only** (compliance C2; App Review 2.5.2):
   - allowed: JavaScript bug fixes, wording fixes, fixes to data handling;
   - **never by update:** a new feature, screen, module or permission, or a change of purpose. Those ship as a new build through §4.
2. **Always both flags: `--channel ios-preview --platform ios`.** Without `--platform ios`, an update is also built for Android.
3. **Run §2 in full first,** with the release check on `preview`.
4. **`eas update` does not run the build guard** and does not read `eas.json`'s `env`. The bundle takes `EXPO_PUBLIC_APP_ENV` from your shell. Make sure it is unset or `UAT`; `env.ts` treats anything but `PROD` as UAT.
5. **Log every update** in `docs/ios/UPDATES-LOG.md` (created with the first one): date, channel, runtime version, commit, reason.
6. **Never publish to `production` before iOS-9.** From then on, only through the script that manifest §8 L5 describes: it sets `PROD`, checks the flags and runs `verify-release-bundle` first.
7. **The phone hotspot** (§4) applies here too.

## 7. Before a `production` build (iOS-9)

The build guard refuses `production` until all of these are set (§1):

| File | Value | Rule | Owner |
|---|---|---|---|
| `src/config/env.ts` | `PROD` URL | Ronit's written sign-off (CLAUDE.md I3); AUTH-P2 deployed on PROD (compliance A3, K3) | Ronit, backend |
| `src/config/legal.ts` | `PRIVACY_POLICY_URL` | An `https://` link to MMG's published privacy policy (App Review 5.1.1(i); compliance H1) | Ronit, legal |
| `src/config/legal.ts` | `ACCOUNT_DELETION_CATEGORY` | The exact name of an active Service Desk category, looked up through LKP-1 when the request is sent (5.1.1(v); H6) | Ronit, IT |
| `src/config/legal.ts` | `ACCOUNT_DELETION_WORKING_DAYS` | A whole number > 0: IT's committed time to delete an account (H6) | IT |

`legal.ts` holds plain literals only, because the guard reads it as text. While a value is empty, its Profile row is hidden in every build (UAT plan I1). The rest of the production checklist is `docs/ios/APP-STORE-COMPLIANCE.md`.

## 8. Results on 2026-10-29 (Phase iOS-5)

**The §2 checks**, on `ios-dev` after part 1 (`f28afe4`), with the iOS-5 test fixes:

| # | Check | Result |
|---|---|---|
| 1 | `git status` | The iOS-5 docs and the two test fixes, waiting for Ronit's OK |
| 2 | `npx tsc --noEmit` | 0 errors |
| 3 | `npm test` | **962 / 962** (128 suites) |
| 4 | `npx expo-doctor` | 20/21; the one failure is `react-native-render-html` "Unmaintained" (known) |
| 5 | `npm ci --dry-run` | up to date |
| 6 | `npm run verify:release-bundle` | **PASS** (`preview`), **PASS** (`--profile production`) |
| — | `npx expo export --platform ios` | Exported: one Hermes bundle, 5.5 MB, written to the OS temp folder and deleted |

**The release check, `preview`:**

| Check | Release JS | Release Hermes | Development control |
|---|---|---|---|
| Developer-token strings (of 12) | **0** | **0** | 12 |
| Placeholder strings, test-login markers, secret names | 0 | 0 | — |
| Client-secret values | 0 | 0 | — |
| Client-secret option names | 28, all in `expo-auth-session` (3 modules) | — | — |
| iOS redirect `msauth.com.mountmeru.servicedesk://auth` | present | — | — |
| `msauth://` (Android) | 0 | 0 | — |
| Hosts | `uat-servicedesk.mountmerugroup.com` only; the UAT API URL present | — | — |
| UUID-v4 literals | 4: the Entra client and tenant IDs, the old placeholder ID, the build's debug ID. 0 unexplained | — | — |
| Android-only APIs reached from app code | 0 (2,292 modules, 182 of them app code) | — | — |
| Android-only props (reported, not failed) | `statusBarTranslucent` in `BulkProgressModal.tsx` and `ImageViewerModal.tsx` | — | — |

**`--profile production`:** the same counts, PASS. The UAT URL is still in the bundle, because `env.ts` lists both URLs while PROD is empty. The check allows both hosts once PROD is set.

**The check catches what it should.** In a scratch copy, outside the repo, one app module was given six faults. The check FAILED and reported each one:
- a developer-token string (in the JS and in Hermes);
- a client-secret value, with its option named in app code;
- `msauth://` (in the JS and in Hermes);
- an unapproved host;
- a token-shaped UUID, and `Bearer <uuid>`;
- `ToastAndroid` reached from app code.

The copy was then restored and verified byte for byte.
