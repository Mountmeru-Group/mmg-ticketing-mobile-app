# Release guide — Setu (iOS)

**Written in Phase iOS-5, 2026-10-29.** Android's guide stays `docs/RELEASE.md` at the port source. Manifest §4.7 planned to rewrite that file in iOS-7; the iOS-5 brief asked for this file in `docs/ios/` instead. The build guard's refusal message still says "docs/RELEASE.md" (`scripts/eas-build-guard.js:63`); it means this file. That message was not changed in iOS-5.

**Ronit runs every `eas` command** (build, submit, update, channel). A phase never runs one (CLAUDE.md I7). The commands in §4 and §6 are for Ronit to run.

| | |
|---|---|
| Bundle ID | `com.mountmeru.servicedesk` (iPhone only, `supportsTablet: false`) |
| Version | `app.json` `expo.version`: **1.0.0** since iOS-9b (2026-11-11), for both profiles. The build number comes from EAS (`appVersionSource: "remote"`, `autoIncrement` on both profiles); `app.json`'s `ios.buildNumber` (`"1"`) only seeded EAS's counter |
| Profiles | `preview` (TestFlight, UAT) · `production` (App Store, PROD, since iOS-9b) |
| EAS project | `setu-ios`, `projectId` `f7e5b2ae-0785-414d-b9c9-9e3e59b21be3` (iOS-7), in `app.json` `extra.eas`; the release check reads it from there |
| Apple records | App Store Connect app `ascAppId` 6827931735, team `ZNPR2MFW76`, in `eas.json` `submit` for both profiles. One app record: TestFlight (UAT) and App Store (PROD) builds share it and its version train |
| `eas-cli` | Not a dependency. Always `npx eas-cli@24.8.0 …`; `eas.json` requires `>= 24.8.0` |
| API | `preview` and development builds: UAT only, `https://uat-servicedesk.mountmerugroup.com/api/v1`. `production` only: PROD, `https://servicedesk.mountmerugroup.com/api/v1`, **approved by Ronit's manager on 2026-11-11 for the `production` profile only** (CLAUDE.md I3). Each bundle holds one of the two URLs, never both (`src/config/env.ts`, iOS-9b) |

## 1. Build profiles (`eas.json`) and the build guard

| Profile | Distribution | Channel | `EXPO_PUBLIC_APP_ENV` | Use |
|---|---|---|---|---|
| `preview` | `store` (TestFlight requires store signing) | `ios-preview` | `UAT` | Every TestFlight build |
| `production` | `store` | `production` | `PROD` | The App Store build (iOS-9b): App Review, then release. `ios.autoIncrement` too |

`scripts/eas-build-guard.js` runs on the EAS server first (`eas-build-pre-install`), before `npm install`. It refuses a build in four cases:
1. a profile other than `production` asks for `PROD` (development and preview builds are UAT only);
2. `production` without `PROD` (`EXPO_PUBLIC_APP_ENV` unset or anything else);
3. `production` while the PROD URL in `src/config/env.ts` is empty or unreadable;
4. `production` while `PRIVACY_POLICY_URL` or `SUPPORT_URL` in `src/config/legal.ts` is not an `https://` link (§7). iOS-9b dropped the old deletion category and working days (§7).

**The `legal.ts` rule blocks only `production`, never the TestFlight `preview` build.** Checked on 2026-11-11 (iOS-9b), with the real files:

| Build | Result |
|---|---|
| `production`, PROD | **OK** (PROD URL, privacy and support links set) |
| `preview`, UAT | **OK** |
| `production`, UAT or unset | Refused: production must target PROD |
| `preview`, `development` or any other profile asking for PROD | Refused (CLAUDE.md rule 4) |
| `production`, PROD URL emptied, or a legal link empty or `http://` | Refused (pinned by `tests/screens/hig-polish.test.mjs`) |

To see the verdict locally: `EAS_BUILD_PROFILE=production EXPO_PUBLIC_APP_ENV=PROD node scripts/eas-build-guard.js`. It is pinned by `tests/screens/hig-polish.test.mjs` (the rules) and `tests/release/production-readiness.test.mjs` (spawned on this repo).

## 2. Pre-build checks: before every build or update, in order

Stop at the first failure.

| # | Command | Pass |
|---|---|---|
| 1 | `git status` and `git log -1` | On `ios-dev`, clean, and equal to `origin/ios-dev`. The commit being built is pushed |
| 2 | `npx tsc --noEmit` | 0 errors |
| 3 | `npm test` | Every test passes (962 on 2026-10-29). The count never goes down without a reason in the phase notes |
| 4 | `npx expo-doctor` | Every check passes except `react-native-render-html` "Unmaintained" (known since iOS-1b) |
| 5 | `npm ci --dry-run` | "up to date": the lockfile installs as it is |
| 6 | `npm run verify:release-bundle` **and** `npm run verify:release-bundle -- --profile production` | **PASS** for both (§3), whichever profile is being built: each proves its bundle holds its own API URL and never the other's |
| 7 | `app.json` `version` | The version this upload should carry (1.0.0 since iOS-9b). The build number is EAS's, never typed by hand |

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
- **(iOS-9b) lacks its own profile's API URL** (`preview`: UAT; `production`: PROD, which must be set) **or holds the other profile's**, in the JS or in Hermes: one API URL per bundle;
- names any `mountmerugroup.com` host but its own API host. Set aside first, each only as its exact, whole value: the email form's example address (iOS-5h) and the two `legal.ts` links (iOS-9b);
- **(iOS-9b) lacks any email sign-in module or string** (G9: 4 modules, 7 strings), in `preview` **and** `production`; contains the web login path `/auth/login` (iOS never calls it);
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
3. Submit **that** build, never "the latest" (iOS-9b): either build and submit in one go, which submits the build it just made with the profile's own `submit` entry,
   ```
   npx eas-cli@24.8.0 build --platform ios --profile preview --auto-submit
   ```
   or submit a finished build by its ID: `npx eas-cli@24.8.0 submit --platform ios --profile preview --id <build id>`.
   - **Never `submit --latest`** from iOS-9b on: it takes the newest iOS build of **either** profile, so it can send a PROD build to TestFlight testers or a UAT build to App Review. Both profiles upload to the same App Store Connect app (6827931735) and the same version train (1.0.0).
4. In App Store Connect › TestFlight, give the build to the **internal** group only (compliance K2). An external group would trigger Beta App Review and widen access.
5. Testers follow `docs/ios/UAT-TEST-PLAN-IOS.md`. TestFlight builds expire after 90 days.

**The App Store build (`production`, from iOS-9b).** After §2 in full (both release checks PASS) and the external items in `APP-STORE-COMPLIANCE.md`:
```
npx eas-cli@24.8.0 build --platform ios --profile production --auto-submit
```
- The guard (§1) refuses it unless it is PROD with the PROD URL and both `legal.ts` links.
- `--auto-submit` uploads that build with `submit.production` (same `ascAppId` and `appleTeamId` as preview). Or submit it later by ID: `npx eas-cli@24.8.0 submit --platform ios --profile production --id <build id>`.
- The upload also appears in TestFlight, as every upload does. **Before the first production upload, turn off automatic distribution** to the UAT internal group (App Store Connect › TestFlight › the group), or testers get a PROD build (compliance K2). Who may install a production build before release, to check it on PROD (compliance A1), is Ronit's decision.
- In App Store Connect, choose this build (version 1.0.0, its build number) for the 1.0.0 version, and check it is the `production` build: a UAT build of 1.0.0 has a different build number.
- Check the build log: Xcode 26 or later with the iOS 26 SDK (J1); record the deployment target (J2). Check the IPA's `Info.plist`: `NSAllowsArbitraryLoads` false, no exception domains (compliance I-row ATS check).

**First build only (iOS-7):**
- `npx eas-cli@24.8.0 init` creates `setu-ios` and writes its `projectId` into `app.json`. Re-run `npm run verify:release-bundle`: the check reads the new ID from `app.json` and allows it.
- Create the App Store Connect record and reserve the name (compliance B3, D11).
- Ask IT to confirm Entra's iOS/macOS platform entry (02-AUTH §7.7).

## 5. Getting a build to testers

- Internal testers are added in App Store Connect › Users and Access, then to the TestFlight internal group. They install with the TestFlight app (UAT plan A1–A2).
- **Only UAT `preview` builds go to the testers' TestFlight groups.** Never a build pointed at production (CLAUDE.md rule 4). A `production` build appears in TestFlight too (§4): it is never added to a testers' group, and automatic distribution stays off.

## 6. EAS Update rules (from iOS-7)

**Prerequisites, in place since iOS-7a (`62a927c`):**
- `expo-updates` added to the project (decision D6, iOS-7);
- `runtimeVersion` set (`app.json`: the `appVersion` policy, so runtime `0.1.0` today);
- the EAS project (§4).

**The command, for TestFlight builds** (PowerShell; the first line every time, rule 4):
```
$env:EXPO_PUBLIC_APP_ENV="UAT"
npx eas-cli@24.8.0 update --channel ios-preview --platform ios --clear-cache --message "fix: <what and why>"
```

**Rules:**
1. **Fixes only** (compliance C2; App Review 2.5.2):
   - allowed: JavaScript bug fixes, wording fixes, fixes to data handling;
   - **never by update:** a new feature, screen, module or permission, or a change of purpose. Those ship as a new build through §4.
2. **Always both flags: `--channel ios-preview --platform ios`.** Without `--platform ios`, an update is also built for Android.
3. **Run §2 in full first,** with the release check on `preview`.
4. **`eas update` does not run the build guard** and does not read `eas.json`'s `env`. The bundle takes `EXPO_PUBLIC_APP_ENV` from your shell.
   - **Set it before every update: `$env:EXPO_PUBLIC_APP_ENV="UAT"`** in the same PowerShell window (Ronit, iOS-5f, 2026-11-06). `env.ts` also treats an unset value as UAT, but a window left with `PROD` from another task would bake PROD into a TestFlight update.
   - Since iOS-9b it also decides **which single API URL the update's bundle holds** (`src/config/env.ts`). The email sign-in no longer depends on it: it is in every build (iOS-9b).
   - **Always `--clear-cache` (found in iOS-9b, 2026-11-11).** Metro's transform cache on this laptop is **not** keyed on `EXPO_PUBLIC_APP_ENV`. Seen in iOS-9b: `npx expo export` with `UAT`, run right after one with `PROD`, produced a bundle with **the PROD URL and not the UAT one**; with `--clear` it was right. §2 step 6 runs the release check for `production` last, which leaves PROD in the cache, so an update published next without `--clear-cache` could put the **PROD URL into a TestFlight update** (or, for a production update, the UAT URL). Keying the cache on the environment in `metro.config.js` (`cacheVersion`) was tried and did **not** prevent it. Confirm the flag's name once with `npx eas-cli@24.8.0 update --help`. The same applies to any local `npx expo export`: use `--clear`.
   - Not affected: `verify-release-bundle` (it bundles with `--reset-cache`) and EAS builds (a clean server; never add the Metro cache to `eas.json` `cache`).
5. **Log every update** in `docs/ios/UPDATES-LOG.md` (created in iOS-5f; entry 1 is the iOS-8a + iOS-5e update): date, channel, runtime version, commit, reason.
6. **No update to `production` in iOS-9b.** The first one waits for an agreed procedure: the script manifest §8 L5 describes (not built) or a written checklist. Whichever it is, a production update:
   - is built with **`$env:EXPO_PUBLIC_APP_ENV="PROD"`** in the same window, or the update carries the UAT URL to App Store users;
   - uses **`--channel production --platform ios --clear-cache`** (rule 4), and `npm run verify:release-bundle -- --profile production` PASSES first;
   - follows rule 1 (fixes only), and is logged in `UPDATES-LOG.md`.
7. **The phone hotspot** (§4) applies here too.
8. **The launch screen and the start-up intro ship together, in a build, never by update** (iOS-5c, 2026-10-30; `docs/brand/UI-STANDARDS.md` §iOS-A.12, `docs/PERFORMANCE.md` §12):
   - The launch screen is native: expo-splash-screen builds it from `assets/splash-icon.png` at build time. Since iOS-5c that image is the yellow drop alone, the first frame of the intro (`src/navigation/SplashIntro.tsx`, mounted in `App.tsx`). The first TestFlight build is the first to have it.
   - An update can change the intro but never the launch image. So an update must not remove `<SplashIntro />` or change `splashArt` (`src/theme/brand.ts`) or `motion.intro.dropDistance`: on a build with the drop-only image, the lone drop would show, then jump.
   - To go back to the old launch screen (the logo and "Setu"), restore `assets/splash-icon.png` from `4063df3` **and** remove `<SplashIntro />`, in one new build, as Android's release guide says (`docs/RELEASE.md` §7 at `c5c63ac`; not copied to iOS).
9. **One exception to rule 1: iOS-5e** (Ronit, 2026-11-03; compliance C2; `ANDROID-DELTA.md` §9.2, Q7):
   - **What may ship by update:** iOS-5e's features (`33dc1f6`) to build 0.1.0 (1): the Home period and the web's counts (G6), the period on the ticket list (G7a), Approvals for every role (G7b) and the ADMIN-only audit log, a new screen (G8).
   - **On `ios-preview` only, for internal TestFlight testers only** (§4 step 4; compliance K2). While this update is on the channel, no 0.1.0 build goes to an external group: that group's builds need Beta App Review, and the update reaches every 0.1.0 binary (`runtimeVersion` policy `appVersion`).
   - **Never on `production`.** The App Store build ships these features natively, in the binary App Review sees (iOS-9).
   - **Why an update can carry them:** they are JavaScript only. `app.json`, `package.json`, `package-lock.json`, `eas.json` and `assets/` are unchanged since build 1 (`git diff 30cc239 33dc1f6`; build 1 is `30cc239`, compliance E4). There is no new permission, entitlement or native module: G7c (push), which would need all three, is not ported.
   - **Every other rule still applies:** §2 in full first, both flags, `EXPO_PUBLIC_APP_ENV` set to `UAT` (rule 4), and the hotspot. The update's `--message` and its `UPDATES-LOG.md` entry name this exception.
   - **One time only.** It covers iOS-5e's code, `33dc1f6`; its docs commit changes no code. Later features follow rule 1 again. iOS-5f (Android's `e85c602` to `d8626bc`) had its own decision: rule 10.
10. **iOS-5f and iOS-5g ship in a new build, never by update** (Ronit, 2026-11-06; `ANDROID-DELTA.md` §10, decision 2, and §10.8):
    - iOS-5f's features (the polish pass, the SLA deadline and the audit filters) reach testers in **TestFlight build 0.2.0 (2)**, built through §4.
    - **iOS-5g (G9, the email sign-in, UAT only) is in the same build 0.2.0 (2)** (Ronit, iOS-5g): one build, not two.
    - **R1 (Ronit, 2026-11-08): build 0.2.0 (2) no longer waits for the backend team's `Set-Cookie` answer.** Until R1 it was not to be started until the backend team confirmed `POST /auth/mobile/login` sends no `Set-Cookie`. The R1 cookie shield makes the answer harmless: iOS's cookie store is emptied right after every sign-in answer (email and Microsoft, success or error, before the session is stored), at every cold start and at every sign-out (`02-AUTH.md` §iOS-B; `APP-STORE-COMPLIANCE.md`, G9 section).
      - **Still recorded when it comes:** the backend team's answer (06 A32), in the compliance G9 section and 02-AUTH §iOS-B.
      - **Still before testers get G20:** UAT G20.12 on a device, now with the cross-session check (email sign-in, sign out, Microsoft sign-in as another person: nothing of the first session reaches the second).
    - Before that build, `npm run verify:release-bundle` must PASS for both profiles: `preview` with all of the email sign-in, `production` with none of it (§2).
    - **A new version, so a new runtime** (Ronit, 2026-11-06). `app.json` `version` is **0.2.0** (the only `app.json` change in iOS-5f), and `runtimeVersion` follows `appVersion`, so build 2's runtime is **0.2.0**.
      - An update for build 2 is published for runtime 0.2.0 and can never reach build 1 (runtime 0.1.0); `UPDATES-LOG.md` entry 1 (runtime 0.1.0) can never reach build 2.
      - **Build 1 is retired once 0.2.0 is on TestFlight:** expire it in App Store Connect, so every tester moves to build 2. After that, nothing more is published for runtime 0.1.0.
      - The build number still comes from EAS (`appVersionSource: remote`, `autoIncrement`); `app.json`'s `ios.buildNumber` only seeded it.
    - Superseded: the first draft of this rule (iOS-5f STEP 1) kept 0.1.0 for build 2, so builds 1 and 2 would have shared runtime 0.1.0. Ronit chose the version bump instead.
11. **Version 1.0.0, runtime 1.0.0, two channels** (iOS-9b, 2026-11-11):
    - `app.json` `version` is **1.0.0** for both profiles, so every build from iOS-9b on, TestFlight and App Store alike, has runtime **1.0.0**. The runtime no longer separates them: **the channel does.**
    - The channel is written into each binary by EAS from its profile (`preview` → `ios-preview`, `production` → `production`) and sent with every update check. The app cannot change it at run time: nothing in `src/` imports `expo-updates`' JavaScript API (`tests/release/production-readiness.test.mjs`).
    - **Never link the channels:** no `eas channel:edit production --branch ios-preview`, no `eas channel:rollout` between them, and no `eas update --branch` aimed at the other profile's branch. Any of these would send a UAT update (UAT URL) to App Store users, or the reverse.
    - **Build 0.2.0 (2)** keeps runtime 0.2.0. A fix for it is published **from a commit before iOS-9b** (`bafbb8c` or earlier), where `app.json` says 0.2.0; published from iOS-9b on, it would be runtime 1.0.0 and never reach build 2.

## 7. The `production` values (iOS-9b, 2026-11-11)

The build guard refuses `production` unless all of these are set (§1). All are set since iOS-9b:

| File | Value | Set to | Rule | Owner |
|---|---|---|---|---|
| `src/config/env.ts` | `PROD` URL | `https://servicedesk.mountmerugroup.com/api/v1` | Approved by Ronit's manager, 2026-11-11, for the `production` profile only (CLAUDE.md I3). Picked at build time: a production bundle holds it and never the UAT URL | Ronit |
| `src/config/legal.ts` | `PRIVACY_POLICY_URL` | `https://www.mountmerugroup.com/privacy-policy` | An `https://` link to MMG's published privacy policy, in Profile and in App Store Connect (5.1.1(i); compliance H1) | Ronit, legal |
| `src/config/legal.ts` | `SUPPORT_URL` | `https://www.mountmerugroup.com` | App Store Connect's Support URL (1.5; H7). **Not shown in the app** | Ronit |

**Removed in iOS-9b:** `ACCOUNT_DELETION_CATEGORY` and `ACCOUNT_DELETION_WORKING_DAYS`. MMG has no deletion category and IT has agreed no deletion time, so account deletion is now a **pre-filled Create Ticket**: Profile › Request Account Deletion → a confirmation → Create Ticket opens with the subject "Account deletion request" and "Please delete my Setu / Service Desk account (<email>)". The person picks the category and creates it through the normal flow. No time is promised anywhere (compliance H6; `src/utils/accountDeletion.ts`).

`legal.ts` holds plain literals only, because the guard and the release check read it as text. While a link is empty, its Profile row is hidden in every build (UAT plan I1). The rest of the production checklist is `docs/ios/APP-STORE-COMPLIANCE.md`.

**`production` and `preview` differ only in these** (iOS-9b; Android's RELEASE.md §5c has its own list):

| | `preview` (TestFlight) | `production` (App Store) | Why |
|---|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | `UAT` | `PROD` | `eas.json` |
| API URL in the bundle | UAT only | PROD only | `env.ts` picks it at build time; the release check proves it both ways |
| Login's environment chip | Shown | Not rendered | `SHOW_ENVIRONMENT_CHIP` (04 M1) |
| Profile's Environment row | `UAT · uat-servicedesk.mountmerugroup.com` | `PROD · servicedesk.mountmerugroup.com` | `ENVIRONMENT_LABEL`, from the build's one URL |
| Ticket links the app accepts (deep-link origin) | `https://uat-servicedesk.mountmerugroup.com/…`; a PROD link is "another environment" | `https://servicedesk.mountmerugroup.com/…`; a UAT link is "another environment" | `APP_ORIGIN` (`src/utils/deep-links.ts`), from the build's one URL |
| Update channel | `ios-preview` | `production` | §6 rule 11 |
| Where it goes | TestFlight internal group | App Review, then the App Store | §4, §5 |
| Same in both | Version 1.0.0 and runtime 1.0.0; Microsoft sign-in; the email sign-in (G9, since iOS-9b); the privacy link and the deletion request; no developer-token screen (`__DEV__` only) | | |

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

## 9. Results on 2026-11-11 (Phase iOS-9b)

**The §2 checks**, on `ios-dev` (`bafbb8c` plus the iOS-9b changes, not yet committed):

| # | Check | Result |
|---|---|---|
| 1 | `git status` | The iOS-9b changes, waiting for Ronit's OK. `package.json` and `package-lock.json` unchanged |
| 2 | `npx tsc --noEmit` | 0 errors |
| 3 | `npm test` | **1793 / 1793** (257 suites; 1775 before iOS-9b) |
| 4 | `npx expo-doctor` | 20/21: `react-native-render-html` "Unmaintained" (known). A first run also failed the config-schema check because it could not reach the Expo API (a network error); it passed on the next run |
| 5 | `npm ci --dry-run` | up to date |
| 6 | `npm run verify:release-bundle` | **PASS** (`preview`) and **PASS** (`--profile production`) |
| — | `npx expo export --platform ios` | `EXPO_PUBLIC_APP_ENV=PROD`: the PROD URL once, the UAT URL 0. `EXPO_PUBLIC_APP_ENV=UAT` **with `--clear`**: the UAT URL once, the PROD URL 0. Both: 2,316 modules, the email sign-in present, 0 developer-token strings. Written to a temp folder outside the repo. **Without `--clear`, the UAT export run after the PROD one held the PROD URL** (§6 rule 4) |

**The release check, both profiles** (2,323 modules, 213 of them app code):

| Check | `preview` | `production` |
|---|---|---|
| API URL | UAT present; PROD **0** in JS and in Hermes | PROD present; UAT **0** in JS and in Hermes |
| Hosts | `uat-servicedesk.mountmerugroup.com` only | `servicedesk.mountmerugroup.com` only |
| Legal links set aside (exact URLs) | privacy 1×, support 1× | privacy 1×, support 1× |
| Email sign-in (G9) | 4/4 modules; 7/7 strings in JS and Hermes | 4/4 modules; 7/7 strings in JS and Hermes |
| `/auth/login` | 0 | 0 |
| Developer-token strings (of 12) | 0 (the control finds 12) | 0 (the control finds 12) |
| UUID-v4 literals | 5: 4 public IDs, 1 build debug ID, 0 unexplained | the same |

**Mutation checks: each change must make something fail.** Every file was restored and checked byte for byte (SHA-256) after each one.
- **Bundle level: 10 of 10 caught**, each by `verify-release-bundle` on a real bundle:
  - both URLs in one record, as Android has them (preview and production);
  - the build-time condition flipped (preview and production);
  - the UAT URL planted in app code (production); the PROD URL planted in app code (preview);
  - the PROD URL emptied (production);
  - another path on the legal links' host (production);
  - the email sign-in kept out of production with the old `require` gate (production);
  - a developer-token string planted in app code (production).
- **Unit level: 23 of 23 caught** by the tests, once one weak check was tightened (the release check's "other URL" rule, first missed, then caught):
  - `eas.json`: the preview channel or environment changed, production pointed at `ios-preview`, production's `autoIncrement` or `submit.production` removed;
  - `app.json`: the version back to 0.2.0, arbitrary loads on;
  - `legal.ts`: the privacy URL emptied, the support URL made `http`;
  - `env.ts`: the development-build refusal removed, both URLs in one record, the PROD URL emptied, `EMAIL_SIGN_IN_ENABLED` put back;
  - Login: the form re-gated, or its import removed;
  - deletion: Create Ticket opened before the confirmation, the row gated on a role, a category in the pre-fill, a time in the confirmation, the pre-fill ignored by Create Ticket;
  - the release check: the other URL no longer forbidden, G9 exempt in production; the guard: the support URL no longer required.

