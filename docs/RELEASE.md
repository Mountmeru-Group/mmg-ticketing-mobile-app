# Release guide — MMG Service Desk (Android)

Written in Phase 5 (2026-10-16). Covers building each EAS profile, getting the Android signing hash for IT (ask A2),
handing an APK to testers, and the checklist that must be complete before any production build.

**Where things stand**

| Item | State |
|---|---|
| App identity | `MMG Service Desk`, package `com.mountmeru.servicedesk`, version `0.1.0`, versionCode `1` (`app.json`) |
| Android SDK | targetSdk **36**, compileSdk 36, minSdk 24. Not set in this repo: the Expo SDK 57 template reads them from React Native 0.86's version catalog (`node_modules/react-native/gradle/libs.versions.toml`) through the `expo-root-project` Gradle plugin. Re-check after any Expo or React Native upgrade |
| Icons | Generated artwork in `assets/` and wired in `app.json` (see §7). Not the official MMG logo, so get brand sign-off before a store release |
| Splash | **Not wired.** SDK 57 can only configure the native splash through `expo-splash-screen`, which is not installed (§8). Until then, Android 12+ shows the app icon at launch and Android 7–11 show Expo's grey template placeholder |
| `preview` APK | Ready to build with your Expo account (§2). It points at **UAT** |
| Signing in on a `preview` APK | **Not possible yet.** The developer-token screen exists only in `__DEV__` builds, and `preview` is a release build. Sign-in arrives with SSO (A2). The first APK is for checking install, icon and launch, and for producing the signing hash IT needs |
| `production` AAB | **Placeholder, refused by design** (§1, §5) |

---

## 1. Build profiles (`eas.json`)

| Profile | Output | Distribution | Backend | Notes |
|---|---|---|---|---|
| `development` | Dev-client APK | internal | UAT | Needs `expo-dev-client`, which is not installed (§8). This is the only kind of installable build that keeps the developer-token screen, because it is a `__DEV__` build |
| `preview` | APK | internal | UAT | Release-mode build for testers. **Build this one first** |
| `production` | AAB | store | PROD | **Placeholder, not runnable.** `src/config/env.ts` has an empty PROD URL |

How the backend is chosen:
- Each profile sets `EXPO_PUBLIC_APP_ENV`. `src/config/env.ts` maps it to a URL. **No URL is in `eas.json`.**
- Anything other than `PROD` resolves to UAT.
- A `__DEV__` build refuses `PROD` outright.
- A release build refuses `PROD` while the PROD URL is empty.

**Build guard.** `scripts/eas-build-guard.js` runs on the EAS server before `npm install` (`eas-build-pre-install` hook in `package.json`). It fails the build within seconds when:
- the profile is `production` and the PROD URL in `src/config/env.ts` is empty; or
- any other profile sets `EXPO_PUBLIC_APP_ENV=PROD`.

Preview the guard's verdict locally (Git Bash):

```sh
EAS_BUILD_PROFILE=production EXPO_PUBLIC_APP_ENV=PROD node scripts/eas-build-guard.js   # refused today
EAS_BUILD_PROFILE=preview    EXPO_PUBLIC_APP_ENV=UAT  node scripts/eas-build-guard.js   # OK
```

**Versioning.** `cli.appVersionSource` is `local`, so `app.json` is the only source of `version` and `android.versionCode`.
- Bump `android.versionCode` by 1 for every build you hand out or upload. Never reuse a number: Android refuses to install a lower versionCode over a higher one, and Play rejects duplicates.
- Change `version` (the name users see) when the release content changes.

**eas-cli** is pinned in `devDependencies` (`24.8.0`; the newest release at the time was one day old). Run it as `npx eas …`, so everyone uses the same version and nothing is installed globally.

## 2. First build — commands, in order

Run these yourself: they need your Expo account. Use PowerShell or Git Bash, in `mmg-ticketing-mobile-app`.

1. Review the Phase 5 changes, then commit them on `dev`.
   - EAS uploads the working tree (respecting `.gitignore`, so no `.env` and no `android/`), and records the commit.
   - Building from a commit lets you trace each APK to its source.
2. `npm ci`. Only needed on a fresh clone; `package-lock.json` already includes eas-cli.
3. `npx eas login`
4. `npx eas init`
   - It creates or links the Expo project `meru-servicedesk`.
   - It writes `owner` and `extra.eas.projectId` into `app.json`. Commit that change.
5. `npx eas build --platform android --profile preview`
   - When asked "Generate a new Android Keystore?", answer **Yes**.
   - EAS creates and stores the release signing key. This is the key whose SHA-1 IT needs.
6. `npx eas credentials --platform android`
   - Choose the `preview` profile.
   - Copy the **SHA1 Fingerprint** for §3.
   - Do not choose `production` here.

When step 5 finishes, EAS prints a build page URL and a QR code. That page has the APK (§4).

Later builds: bump `android.versionCode`, commit, then repeat step 5.

## 3. Signing hash for IT (Entra ID app registration, ask A2)

IT needs the release signing certificate's fingerprint to register the Android app. EAS generated the keystore in §2 step 5 and keeps it.
- All profiles use the project's default Android build credentials, so `development` and `preview` builds are signed with this same key.
- Local `npx expo run:android` builds use the Android debug key instead. Its hash is different, and it must not be sent.

### 3.1 Get the SHA-1

1. Run `npx eas credentials --platform android` and pick the `preview` profile.
2. Under **Android Credentials → Configuration: Build Credentials (Default) → Keystore**, copy **SHA1 Fingerprint**. It looks like `AB:CD:…` (20 hex pairs).
   - The same value is on expo.dev: Project `meru-servicedesk` → Credentials → Android → `com.mountmeru.servicedesk` → Build credentials.
3. Leave the menu with **Exit**. Nothing needs changing.

### 3.2 Convert it to the Base64 form Entra asks for

Entra's **Android** platform asks for the *signature hash*: the same 20 bytes, Base64-encoded, not hex. Either command works (verified to give identical output):

```powershell
# PowerShell
$sha1 = 'AB:CD:...'   # paste the SHA1 Fingerprint
[Convert]::ToBase64String(($sha1 -split ':' | ForEach-Object { [Convert]::ToByte($_, 16) }))
```

```sh
# Node, any shell
node -e "console.log(Buffer.from(process.argv[1].replace(/:/g,''),'hex').toString('base64'))" AB:CD:...
```

The result is 28 characters ending in `=`.

The fingerprint is not secret: it comes from the public certificate. Still, send it to IT only. The keystore and its passwords stay in EAS. Never download them into this repo; `*.jks` and `*.keystore` are git-ignored.

### 3.3 Message to IT (copy, fill the two hashes, send)

> **Subject:** MMG Service Desk mobile app — Android details for the Entra ID app registration (A2)
>
> Hi,
>
> For the new public-client app registration for the MMG Service Desk mobile app (backend ask A2), here are the Android details:
>
> - **Package name:** `com.mountmeru.servicedesk`
> - **Signature hash** (for the Entra "Android" platform; Base64 of the signing certificate's SHA-1): `<BASE64 HASH>`
>   - The same certificate in hex: SHA-1 `<AB:CD:… FINGERPRINT>`.
> - **Redirect URI** (custom URI under "Mobile and desktop applications"): `com.mountmeru.servicedesk://auth`
>
> Settings we need on the registration:
> - Public client ("Allow public client flows" = Yes), PKCE, no client secret.
> - Single tenant (MMG).
> - Delegated permissions `openid`, `profile`, `email` and `User.Read`, with admin consent.
>
> Please send back the **Application (client) ID** and **Directory (tenant) ID**. Neither is a secret.
>
> This hash belongs to the release key our build service uses for internal test builds. If we later publish through Google Play with Play App Signing, Google signs the store copy with a different key, and we will send you a second signature hash to add to the same registration.
>
> Thanks

**For the A2 work (Phase 8, not done now):**
- The app's only URL scheme today is `mmgservicedesk` (used for in-app ticket links).
- Before `com.mountmeru.servicedesk://auth` can return to the app, `com.mountmeru.servicedesk` must be added to `scheme` in `app.json`.
- That change belongs to the SSO work. The auth flow was deliberately left untouched in Phase 5.

## 4. Getting an APK to testers

- The `preview` build page on expo.dev has an **Install** button and a QR code. Open it on the Android phone to download the APK.
  - Internal-distribution links can be opened by anyone who has them. Share them only with named testers, through a company channel.
  - Or download the `.apk` from that page and share it through a company-managed location (SharePoint or Intune). Don't attach it to public email lists.
- On the phone: allow "Install unknown apps" for the browser or file app when Android asks, then install.
  - Some managed devices block sideloading. If so, IT has to push the APK through Intune.
- Updating: a new APK installs over the old one only if its `android.versionCode` is higher and it is signed with the same EAS key.
- What testers can check today:
  - install;
  - icon and name;
  - launch;
  - the Login screen shows **UAT · uat-servicedesk.mountmerugroup.com**.
- What they can't do yet: sign in. SSO is pending A2, and the developer-token screen is absent from this build by design.
- Every build of `preview` talks to **UAT**. UAT runs on production hardware (00-OVERVIEW §3), so no load testing.

## 5. Pre-release checklist (before any `production` build)

All must be true. The build guard enforces the first item; the rest are on the person releasing.

- [ ] **PROD URL set** in `src/config/env.ts` (the `PROD` entry, and nowhere else), with Ronit's written sign-off. 00-OVERVIEW §3.
- [ ] **SSO works end to end on UAT** (A2 shipped, Entra registration done with the hashes from §3).
- [ ] **Developer-token screen removed** (Phase 8, after SSO works):
  - [ ] delete `src/screens/auth/DevTokenScreen.tsx`;
  - [ ] delete its `require` and registration in `src/navigation/AuthStack.tsx`;
  - [ ] delete the `DevToken` route type;
  - [ ] delete the `__DEV__` button in `src/screens/auth/LoginScreen.tsx`;
  - [ ] re-run `npm run verify:release-bundle` (§6). The release bundle must PASS. The control will then find 0 dev-token strings, which is expected.
- [ ] **Security asks fixed and confirmed on production by the backend team** (06-BACKEND-ASKS):
  - [ ] **A7**: authorization gaps, the AI-summary private-note leak first;
  - [ ] **A13**: session cache re-checks `isActive` and role;
  - [ ] **A14**: rate limit keyed on the Bearer token, not the IP.
- [ ] **Version bumped**: `version` and `android.versionCode` in `app.json`, versionCode higher than anything ever distributed.
- [ ] **Splash wired** (`expo-splash-screen` approved and installed, §8), and icon/splash approved by brand.
- [ ] `npx tsc --noEmit` passes, and `npm run verify:release-bundle` passes with the production host added to its allow-list.
- [ ] If distributing through Google Play:
  - [ ] Play App Signing SHA-1 sent to IT (§3.3, last paragraph);
  - [ ] Play Console data-safety form and privacy policy done;
  - [ ] targetSdk still meets Play's current minimum.

## 6. Proof the developer-token screen is not in a release bundle

**Method.** `npm run verify:release-bundle` (`scripts/verify-release-bundle.js`):
1. Builds the JS bundle exactly as a release APK's Gradle task does: `expo export:embed --platform android --dev false --minify true`, with `EXPO_PUBLIC_APP_ENV=UAT` as in `preview`.
2. Compiles it to Hermes bytecode with the project's `hermesc`, as the release build does.
3. Builds a **development** bundle as a control, to show the search finds the strings when they are present.
4. Searches the release JS and the bytecode for:
   - the 12 strings that exist only in the `__DEV__` developer-token code;
   - forbidden auth markers and secret names (`/auth/test-login`, `x-test-secret`, `client_secret` …);
   - UUID-v4 literals (the shape of a session token);
   - `Bearer <uuid>` literals;
   - every `mountmerugroup.com` host.
5. Prints counts only, never a matched value. Bundles go to the OS temp folder, never the repo.

**Result on 2026-10-16 (Phase 5 code): PASS**

| Check | Release JS | Release Hermes | Dev control |
|---|---|---|---|
| Dev-token strings found (of 12), e.g. `DevTokenScreen`, `Developer session token`, `Paste sd_session value` | **0** | **0** | 12 |
| Forbidden auth markers / secret names | 0 | 0 | – |
| Hosts named | `uat-servicedesk.mountmerugroup.com` only | – | – |
| UUID-v4 literals other than the known dev placeholder id | 0 | – | – |
| `Bearer <uuid>` literals | 0 | – | – |
| Non-JSON guard (`Unexpected non-JSON response from the server`) and error boundary text | present | present | present |

Why the screen is absent:
- `src/navigation/AuthStack.tsx` `require`s the module only inside a `__DEV__` branch.
- `__DEV__` is `false` in release, so Metro drops the branch and the module.
- `LoginScreen`'s developer button is inside `{__DEV__ ? … : null}` and is dropped the same way.

The remaining UUID literals in the bundle are the RFC 4122 namespace constants from `expo-modules-core` (version-1 UUIDs, not tokens) and the old dev placeholder user id in `src/utils/session.ts` (not a secret). No `.env` file exists in the repo. The only `EXPO_PUBLIC_*` value used by the app (`EXPO_PUBLIC_APP_ENV`) is inlined at build time.

## 7. App identity assets (`assets/`)

| File | Size | Used for |
|---|---|---|
| `icon.png` | 1024×1024, opaque | `expo.icon`: legacy launcher icon (Android 7.x) and store listing source |
| `adaptive-icon.png` | 1024×1024, transparent | `android.adaptiveIcon.foregroundImage`, and `monochromeImage` (Android 13 themed icons use its alpha) |
| `adaptive-icon-background.png` | 1024×1024, flat `#1D4ED8` | `android.adaptiveIcon.backgroundImage` (`backgroundColor` is the same blue) |
| `splash-icon.png` | 1024×1024, transparent | Splash image, **not wired yet** (§8) |

The design:
- A service-desk **ticket** (rounded rectangle with side notches) with a two-peak **mountain** (Mount Meru) cut out of it.
- "MMG" under it on the icon; "MMG / Service Desk" on the splash.
- Flat colours only: blue `#1D4ED8`, white, grey `#374151`. No gradients.
- Everything sits inside the adaptive-icon safe zone (the central 66/108). The splash content sits inside the central circle that Android 12+ keeps.

These were generated for Phase 5 and are not an official MMG brand mark. Replacing them only needs new PNGs with the same names and sizes; no code changes.

`android.blockedPermissions` removes `SYSTEM_ALERT_WINDOW` (draw over other apps). The Expo template adds it, but the app never uses it, and Play reviews flag it. `allowBackup` stays `false`, so the SecureStore token is never restored onto another device.

## 8. Packages waiting for approval

| Package | Why | After approval |
|---|---|---|
| `expo-splash-screen` (SDK 57 line) | SDK 57 configures the native splash only through this plugin. Without it, Android 7–11 show Expo's template placeholder at launch | `npx expo install expo-splash-screen`, then add to `plugins` in `app.json`: `["expo-splash-screen", { "image": "./assets/splash-icon.png", "imageWidth": 200, "resizeMode": "contain", "backgroundColor": "#FFFFFF" }]` |
| `expo-dev-client` (SDK 57 line) | Required by the `development` profile (a dev-client build that keeps the developer-token screen for internal testing until SSO ships) | `npx expo install expo-dev-client`, then `npx eas build --platform android --profile development` |

## 9. Phase 5 state audit (all 16 MVP screens)

- ✓ = was already present. **+** = added or fixed in Phase 5. n/a = the state can't occur on that screen.
- A 401 is handled once for every screen in `src/api/client.ts`: the session is cleared and the app returns to Login.
- Errors show `describeError()` text, never a raw Axios error.
- Offline = the shared `OfflineBanner`, plus `OfflineState` for a first load waiting for the network.

| Screen | Loading (skeleton) | Empty | Error (message + Retry) | Offline |
|---|---|---|---|---|
| M1 Login | n/a (no request until A2) | n/a | ✓ (sign-out reasons) | **+** banner |
| M2 Home | **+** count placeholders in tiles, ticket-row skeleton (were spinners) | ✓ | ✓ | ✓ |
| M3 Ticket list | ✓ | ✓ | ✓ | ✓ |
| M4 Ticket detail | ✓ | ✓ per tab | ✓ | ✓ |
| M5 Reply composer | **+** form skeleton (was ticket-detail layout) | n/a (form) | ✓; **+** failed reply-all recipients now shown with retry (silently fell back to requester only) | **+** banner, **+** offline first load (was an endless skeleton) |
| M6 Status & closure | **+** form skeleton | ✓ (role, locked) | ✓ | **+** banner, **+** offline first load |
| M7 Assign picker | **+** form skeleton, recommendations skeleton | ✓ | ✓; **+** groups/recommendations reason + retry (bulk showed nothing) | **+** banner, **+** offline first load |
| M8 Create ticket | **+** form skeleton | n/a (form) | ✓; **+** groups lookup reason + retry (failed silently, leaving only "Auto") | **+** banner, **+** offline first load (was an endless skeleton) |
| M9 Notifications | ✓ | ✓ | ✓; **+** failed mark-read on tap now reported | ✓ |
| M10 Profile | **+** form skeleton (was spinner) | n/a | ✓ | ✓ |
| M11 Task editor | **+** form skeleton | ✓ (task removed) | ✓ | **+** banner (offline first load ✓) |
| M12 Approvals inbox | ✓ | ✓ | ✓ | ✓ |
| M13 Approval detail | **+** ticket-card skeleton (was spinner) | ✓ | ✓ | ✓ |
| M14 Knowledge base | ✓; **+** category chip skeleton | ✓ | ✓; **+** category reason + retry (chips vanished silently) | ✓ |
| M15 KB article | ✓ | ✓ (not available) | ✓ | ✓ |
| M16 Announcements | ✓ | ✓ | ✓ | ✓ |

Also fixed:
- Shared people picker: a failed search showed "No one matches". It now shows the reason and Retry.
- Ticket-link resolver: offline banner added.
- Task list and task detail already had all four states.

**Writes.** Every mutation reports failure through `reportWriteError()` (alert) or `InlineError`, and none retries automatically.
- One silent write was found and fixed: tapping a notification marked it read with `mutate()` and no error path. A failure now raises a toast, and the ticket still opens.
- Deliberately quiet, unchanged: sign-out ignores the AUTH-3 result (02 §5.5; the local session always ends), and the KB "voted on this device" flag is a local cache.

**Crashes.** One `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) wraps `RootNavigator` in `App.tsx`.
- A render crash shows "Something went wrong" with **Try again**, which remounts navigation with the cache and session intact and re-sends nothing.
- When signed in, it also offers **Sign out**.
- Error text is shown only in development builds.

**Non-JSON guard.** It still fires: the response interceptor in `src/api/client.ts` rejects any non-JSON response (including the 200 `text/html` SPA fallback) and any body that is not an object or array. Its strings are in the release bundle (§6).
