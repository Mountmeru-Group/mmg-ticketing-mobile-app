# Release guide — Setu (Android)

Written in Phase 5 (2026-10-16). Covers building each EAS profile, getting the Android signing hash for IT (ask A2),
handing an APK to testers, and the checklist that must be complete before any production build.
Updated 2026-10-29 for the first production build (Google Play internal testing): developer-token screen deleted,
PROD URL set, version 1.0.0, release-bundle check fixed.
Updated 2026-11-03 for the second production build, after UAT testing passed: versionCode 3, the production target,
bundle, permissions and readiness re-verified (§5a). Not built.

**Where things stand**

| Item | State |
|---|---|
| App identity | `Setu` (renamed 2026-10-23; `Mount Meru Service Desk` from Phase B, 2026-10-20, and `MMG Service Desk` before that), package `com.mountmeru.servicedesk`, version **`1.0.0`**, versionCode **`3`** (`app.json`, set 2026-11-03). versionCode `2` (set 2026-10-29) is the AAB uploaded to Google Play; every build before it was `0.1.0` / `1` |
| Android SDK | targetSdk **36**, compileSdk 36, minSdk 24 (re-checked 2026-10-29 and 2026-11-03). Not set in this repo: the Expo SDK 57 template reads them from React Native 0.86's version catalog (`node_modules/react-native/gradle/libs.versions.toml`) through the `expo-root-project` Gradle plugin (`ExpoRootProjectPlugin.kt`, which falls back to **35** if the catalog has no `targetSdk`). Re-check after any Expo or React Native upgrade |
| Icons | Built from the official Meru logo (`assets/brand/meru-logo.png`, the web portal's own file) and wired in `app.json` (see §7). Re-audited in Phase C: no placeholder file remains. The blue "MMG" ticket icon seen on a phone is an APK built before Phase B (commit `8ffe265`); uninstall it before installing the next build, because some launchers keep the old icon. Source is only 689 × 478, so get a vector or ≥ 2048 px master before a store release |
| Splash | **Wired (Phase C, 2026-10-20).** `expo-splash-screen` ~57.0.10 is installed and configured in `app.json`. It shows the Meru logo with "Setu" on white (image regenerated 2026-10-23, §7), and stays up until the first screen is ready (`src/navigation/splash.ts`), so no blank frame shows between the splash and the app. Takes effect from the next build |
| `preview` APK | Ready to build with your Expo account (§2). It points at **UAT** |
| Signing in | **Microsoft sign-in only, in every build.** The `__DEV__` developer-token screen was **deleted on 2026-10-29** (§5), with its route, its Login button and the helpers that existed only for it. AUTH-P2 is live on UAT (02-AUTH §7) |
| `production` AAB | **versionCode 3: ready to build, not built** (§2a). UAT testing passed; re-verified 2026-11-03 (§5a). versionCode 2 is on Google Play. It points at **PRODUCTION**. Open items outside this repo are in §5 |

---

## 1. Build profiles (`eas.json`)

| Profile | Output | Distribution | Backend | Notes |
|---|---|---|---|---|
| `development` | Dev-client APK | internal | UAT | Not in `eas.json`. Needs `expo-dev-client`, which is not installed (§8) |
| `preview` | APK | internal | UAT | Release-mode build for testers |
| `production` | AAB | store | PROD | Google Play. PROD URL `https://servicedesk.mountmerugroup.com/api/v1` set in `src/config/env.ts` on 2026-10-29 |

How the backend is chosen:
- Each profile sets `EXPO_PUBLIC_APP_ENV`. `src/config/env.ts` maps it to a URL. **No URL is in `eas.json`.**
- Anything other than `PROD` resolves to UAT.
- A `__DEV__` build refuses `PROD` outright.
- A release build refuses `PROD` while the PROD URL is empty.

**Build guard.** `scripts/eas-build-guard.js` runs on the EAS server before `npm install` (`eas-build-pre-install` hook in `package.json`). It fails the build within seconds when:
- the profile is `production` and the PROD URL in `src/config/env.ts` is empty, or the profile doesn't set `EXPO_PUBLIC_APP_ENV=PROD`; or
- any other profile sets `EXPO_PUBLIC_APP_ENV=PROD`.

Preview the guard's verdict locally (Git Bash):

```sh
EAS_BUILD_PROFILE=production EXPO_PUBLIC_APP_ENV=PROD node scripts/eas-build-guard.js   # OK (since 2026-10-29)
EAS_BUILD_PROFILE=preview    EXPO_PUBLIC_APP_ENV=UAT  node scripts/eas-build-guard.js   # OK
EAS_BUILD_PROFILE=preview    EXPO_PUBLIC_APP_ENV=PROD node scripts/eas-build-guard.js   # refused
```

`npm test` runs the same verdicts (`tests/release/production-readiness.test.mjs`). On 2026-10-29 an unchanged copy of the
guard, pointed at an `env.ts` with an empty PROD URL, still refused `production`.

**Versioning.** `cli.appVersionSource` is `local`, so `app.json` is the only source of `version` and `android.versionCode`.
- Bump `android.versionCode` by 1 for every build you hand out or upload. Never reuse a number: Android refuses to install a lower versionCode over a higher one, and Play rejects duplicates.
- Change `version` (the name users see) when the release content changes.

**eas-cli** is **not** a project dependency: it was removed on 2026-10-16 (`6c67728`). `eas.json` requires `>= 24.8.0`.
- Run it as `eas …` from a global install, or as `npx eas-cli@24.8.0 …`.
- Don't type `npx eas …` (as this guide used to say). Without a local eas-cli, npx fetches the npm package named `eas`,
  which is a different package.

## 2. First build — commands, in order

Run these yourself: they need your Expo account. Use PowerShell or Git Bash, in `mmg-ticketing-mobile-app`.

1. Review the Phase 5 changes, then commit them on `dev`.
   - EAS uploads the working tree (respecting `.gitignore`, so no `.env` and no `android/`), and records the commit.
   - Building from a commit lets you trace each APK to its source.
2. `npm ci`. Only needed on a fresh clone. eas-cli is not in `package-lock.json` (§1).
3. `eas login`
4. `eas init` (done: `app.json` has `owner` and `extra.eas.projectId`)
   - It creates or links the Expo project `meru-servicedesk`.
   - It writes `owner` and `extra.eas.projectId` into `app.json`. Commit that change.
5. `eas build --platform android --profile preview`
   - When asked "Generate a new Android Keystore?", answer **Yes**.
   - EAS creates and stores the release signing key. This is the key whose SHA-1 IT needs.
6. `eas credentials --platform android`
   - Choose the `preview` profile.
   - Copy the **SHA1 Fingerprint** for §3.
   - Do not choose `production` here.

When step 5 finishes, EAS prints a build page URL and a QR code. That page has the APK (§4).

Later builds: bump `android.versionCode`, commit, then repeat step 5.

## 2a. Production build (Google Play internal testing)

Prepared on 2026-10-29 and **not built**: Ronit runs it after review. Use PowerShell or Git Bash, in `mmg-ticketing-mobile-app`.

**versionCode 3 (prepared 2026-11-03, not built).** Same steps. In step 1, commit the 2026-11-03 changes (§5a). The
differences:
- versionCode 2 is already on Play, so Play App Signing already has its key. That makes §3.4 possible now, if it isn't done.
- Step 5 can still be a manual upload. `eas submit` would also work now that a first release exists, but it needs a
  Google Play service-account key set up in EAS, and `eas.json` has no `submit` profile.

1. Review the 2026-10-29 changes on `dev`, then commit them. EAS records the commit.
2. Go through §5. Do not build while an item marked **BLOCKS** is open.
3. `npm run verify:release-bundle -- --prod` must end with `PASS (PROD)` (§6).
4. `eas build --platform android --profile production`
   - The build guard should print `profile "production", EXPO_PUBLIC_APP_ENV=PROD — OK`.
   - EAS signs the AAB with the project's existing Android keystore from §2 step 5. For Google Play, that key becomes the **upload key**.
5. Download the `.aab` from the build page. Upload it **by hand**: Play Console → the app → Internal testing → Create release.
   - Google Play's API can't create an app's first release, so `eas submit` works only after this first manual upload.
   - Keep **Play App Signing** on, with a Google-generated app signing key (the default).
6. Before any tester signs in, do §3.4: Google's signing key needs its own redirect URI.
7. Install from the internal-testing link.
   - A phone with a `preview` APK installed must uninstall it first. The two are signed with different keys, so Android refuses to update one with the other.
   - Sign in with Microsoft, then check that Profile shows **PROD · servicedesk.mountmerugroup.com**. Since 2026-10-30, Login shows no environment chip on a PROD build (`SHOW_ENVIRONMENT_CHIP` in `src/config/env.ts`).

For every later upload, raise `android.versionCode` by 1. Play rejects a versionCode that isn't higher than the last one it received.

## 2b. Push notifications (G7, 2026-11-02): what the next build needs

**The next build must be a full EAS build** (`preview` or `production`), because G7 added a native module.
- `expo-notifications` ~57.0.24 was installed with `npx expo install`, and its config plugin was added to `app.json`:
  - icon `assets/adaptive-icon.png`;
  - colour `#D21121`;
  - default channel `setu_tickets`.
- An over-the-air JavaScript update cannot add native code. Setu has no OTA channel anyway (no `expo-updates`).
- A build made before G7 has no push code at all.

**Firebase configuration (Ronit / backend team)**
1. Someone creates MMG's Firebase project with Cloud Messaging on (MOBILE-BACKEND-REQUIREMENTS.md §1.3). The backend uses the same project's service account to send.
2. Download its `google-services.json` for the Android app `com.mountmeru.servicedesk`. Put it at the repo root and add `"googleServicesFile": "./google-services.json"` under `expo.android` in `app.json`.
3. **Decide how it reaches EAS.**
   - Committed: Google treats this file as configuration, not a secret; its API key is restricted to the app.
   - Or an EAS file environment variable: EAS does not upload git-ignored files.
4. **Without it, the build still succeeds, but push stays off, silently.** Firebase gives no token, and the Alerts notice says "This version of Setu can't receive notifications". Nothing else changes.

**State on 2026-11-03:** there is no `google-services.json` in the repo (it is git-ignored) and no `googleServicesFile` in `app.json`. So the versionCode 3 build succeeds with push off (point 4). Without that key, prebuild does not apply the Google Services Gradle plugin. Firebase Messaging is linked but never initialised, so `getDevicePushTokenAsync` rejects and the app records `unavailable` (`tests/push/push.test.mjs`, "no Firebase config in the build").

**Behaviour until the server half ships** (01 NTF-5/NTF-6, ⚠ NOT YET DEPLOYED)
- After sign-in the app tries to register the phone. NTF-5 answers 404.
- The Alerts notice says notifications "aren't switched on at the Service Desk yet", and logcat shows `[push] register: 404, NTF-5 not deployed yet`.
- No banner, no dialog. The app retries on each sign-in and app start, and when Firebase rotates the token: no polling.
- The permission dialog appears **only on the first visit to Alerts**, and only on Android 13+ (older versions grant it at install).
- Expo Go never receives push on Android (SDK 53 and later). Test push on an installed APK.

**For the backend team** (from the payload suggested in MOBILE-BACKEND-REQUIREMENTS.md §1.6)
- `android.notification.icon: "ic_notification"` names a drawable the app does not have. The plugin's drawable is `notification_icon`, and it is also the manifest default that FCM falls back to. Either omit `icon` or send `notification_icon`.
- `color: "#C4161F"` differs from the brand red `#D21121` in `app.json`. The payload wins per notification, so send `#D21121` or omit it.

**Checks before that build:** `npx tsc --noEmit`, `npm test`, and `npm run verify:release-bundle` in both modes (§6). The bundle check was not run for G7.

## 3. Signing hash for IT (Entra ID app registration, ask A2)

IT needs the release signing certificate's fingerprint to register the Android app. EAS generated the keystore in §2 step 5 and keeps it.
- All profiles use the project's default Android build credentials, so `development` and `preview` builds are signed with this same key.
- Local `npx expo run:android` builds use the Android debug key instead. Its hash is different, and it must not be sent.

### 3.1 Get the SHA-1

1. Run `eas credentials --platform android` and pick the `preview` profile.
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
- *Since then (seen 2026-10-29):* `scheme` is `["mmgservicedesk", "com.mountmeru.servicedesk", "msauth"]`. `getAuthRedirectUri()` in `src/config/auth.config.ts` returns the Entra **Android-platform** form, `msauth://com.mountmeru.servicedesk/<URL-encoded Base64 SHA-1 of the EAS key>`. The comments in that file still name `com.mountmeru.servicedesk://auth`. That file was out of scope on 2026-10-29 and was not changed.

### 3.4 Google Play signing key: register a SECOND redirect URI before sign-in on a Play build

**Why.**
- With Play App Signing, the AAB from EAS is signed with the EAS key, which Play treats as the **upload key**.
- Google re-signs the app it delivers with its own **app signing key**. So a phone that installs from Play runs an app whose SHA-1 is **not** the EAS key's SHA-1 from §3.1.
- The Entra Android redirect URI embeds the signing key's hash. The one registered today belongs to the EAS key.
- A **second** redirect URI, for Google's key, must be registered on the **same** app registration before sign-in works on a Play build.

**Steps** (after the first AAB is uploaded, §2a step 5; Play has no app signing key before that):
1. In Play Console, open the app → **App integrity** → **App signing**. Labels move between Play Console versions.
2. Under **App signing key certificate**, copy the **SHA-1**.
   - Do **not** copy the *Upload key certificate*. That is the EAS key, already registered.
3. Convert it to Base64 with §3.2.
4. Send IT the package name `com.mountmeru.servicedesk` and that hash, to add to the same Entra registration's **Android** platform. This is the second hash the §3.3 message promised.
   - Entra shows the result as `msauth://com.mountmeru.servicedesk/<hash>`, URL-encoded (`/` → `%2F`, `+` → `%2B`, `=` → `%3D`).
5. Keep the EAS-key URI. `preview` APKs still need it.
6. Test sign-in on a phone that installed from the internal-testing link.

**Note: what the app sends today (not changed on 2026-10-29).**
- `getAuthRedirectUri()` returns one **fixed** string, the EAS-key URI, whatever key signed the build.
- Sign-in runs in the browser (`expo-auth-session`), not through MSAL or the Authenticator broker. In that flow Entra matches the redirect URI as text and does not check the app's signature. So a Play build may sign in even before step 4.
- Register the second URI anyway: it is the correct registration for Google's key, and a broker or a key-derived redirect URI would need it. The first internal-testing install settles the question.
- If Microsoft shows **AADSTS50011** (redirect URI mismatch) on a Play build, the registration is the cause.
- Making the app send the Play-key URI would mean changing `auth.config.ts`, which this release left untouched.

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
  - the Login screen shows **UAT · uat-servicedesk.mountmerugroup.com**;
  - sign in with Microsoft. It is the only way in: the developer-token screen was deleted on 2026-10-29.
- Every build of `preview` talks to **UAT**. UAT runs on production hardware (00-OVERVIEW §3), so no load testing.

## 5. Pre-release checklist (before any `production` build)

State on **2026-11-03** (versionCode 3, after UAT testing passed). Items marked **BLOCKS** stop a useful production build; the rest are on the person releasing. The build guard enforces the PROD URL item.

**Done in this repo (2026-11-03)**: details and evidence in §5a
- [x] **versionCode** `2` → **`3`** (`app.json`). versionCode 2 is on Google Play, and Play rejects an upload that isn't above it. `version` stays `1.0.0`. Package, slug, schemes and EAS projectId are unchanged.
- [x] `tests/release/production-readiness.test.mjs` now requires versionCode **> 2**. Before, it only required ≥ 2.
- [x] Production target re-verified: the PROD URL, the `production` profile (store, `app-bundle`), `preview` still on UAT, and the build guard's verdicts.
- [x] `npm run verify:release-bundle` **PASS** in both modes (§6), plus a wider secret scan of the PROD bundle.
- [x] Permissions audited from every manifest that merges into the build. Two groups were flagged (§5a).
- [x] **ShortcutBadger's 16 launcher-badge permissions blocked** in `app.json` `android.blockedPermissions`, beside `SYSTEM_ALERT_WINDOW` (Ronit, 2026-11-03). The merged list goes from 28 permissions to 12 (§5a flag 1).
- [x] `npx tsc --noEmit` clean. `npm test`: 1086 pass, 0 fail.
- Not done: no EAS build, no commit. `auth.config.ts`, the Entra redirect URI and the UAT configuration are untouched.

**Done in this repo (2026-10-29)**
- [x] **PROD URL set**: `https://servicedesk.mountmerugroup.com/api/v1`, in the `PROD` entry of `src/config/env.ts` and nowhere else. Set on Ronit's written instruction.
  - Checked against the web repo, read-only, at `d7f3887`: `Production-Build/docs/DEPLOYMENT-GUIDE.md` §2, `.env.production` `APP_URL`, the `/api/v1` mount in `backend/src/app.ts`, and the PROD `web.config` rewrite to `:4000`. UAT is unchanged, and `preview` still sets UAT.
- [x] **Developer-token screen removed** (2026-10-29):
  - [x] deleted `src/screens/auth/DevTokenScreen.tsx`;
  - [x] deleted its `require` and registration in `src/navigation/AuthStack.tsx`;
  - [x] deleted the `DevToken` route type (`src/types/navigation.ts`);
  - [x] deleted the `__DEV__` button and its "fallback" text in `src/screens/auth/LoginScreen.tsx`. The `__DEV__` redirect-URI hint stays: it shows the URI to send to Entra (02-AUTH §7.2) and is not a way in;
  - [x] also deleted what existed only for it:
    - `src/screens/PlaceholderScreen.tsx`, the screen's layout;
    - `src/utils/session.ts`, the guards for the fake user the screen stored before 2026-10-15. Their uses in `permissions.ts`, `writeGuards.ts`, `useProfile.ts`, `ProfileScreen`, `TaskEditorScreen`, `AssignPickerScreen` and `ReplyComposerScreen` went with it;
    - the `__DEV__` sign-out text about the developer token;
  - [x] `npm run verify:release-bundle` PASSES (§6): 0 dev-token strings in release and in the control.
  - **Only way in:** Microsoft sign-in. The auth stack has one screen (Login), and the only code that creates a session is the Microsoft flow (`signInAttempt.ts`). `tests/release/production-readiness.test.mjs` checks both.
- [x] **Version bumped**: `version` `0.1.0` → **`1.0.0`**; `android.versionCode` `1` → **`2`**. Every build ever committed used versionCode 1, and nothing has been uploaded to Play.
  - EAS build history needs your Expo login, so it was not checked. If any EAS build ever used a higher versionCode, raise this above it.
- [x] **Splash wired** (`expo-splash-screen` installed and configured in Phase C, §7).
- [x] `npx tsc --noEmit` passes. `npm test` passes. `npm run verify:release-bundle` passes in both modes (UAT and `--prod`), with the production host in its allow-list (§6).
- [x] `eas.json` `production`: `distribution: "store"`, `android.buildType: "app-bundle"`, `EXPO_PUBLIC_APP_ENV=PROD`. targetSdk **36** (top table).

**Open: outside this repo** (state on 2026-11-03. "No record" means this repo's docs don't show it done. It may be done; Ronit to confirm)
- [ ] **BLOCKS — AUTH-P2 on production.** `POST /api/v1/auth/microsoft/mobile` is confirmed on UAT only (02-AUTH §7.6 item 1; no record since). Until the backend team deploys and confirms it on production, a Play build shows **"App sign-in isn't available yet"** (`endpoint-missing`) after Microsoft sign-in, and nobody can get in.
- [ ] **BLOCKS — security asks fixed and confirmed on production by the backend team** (06-BACKEND-ASKS, all "BLOCKING — launch"; still no record they shipped on 2026-11-03):
  - [ ] **A7**: authorization gaps, the AI-summary private-note leak first;
  - [ ] **A13**: session cache re-checks `isActive` and role;
  - [ ] **A14**: rate limit keyed on the Bearer token, not the IP.
  - Ronit decides whether an internal-testing track with named testers may go ahead before these ship.
  - The values in the bundle are public by design (§5a). That leaves these server-side checks as all that protects production.
- [x] **SSO end to end on an installed UAT build**: UAT testing passed (Ronit, 2026-11-03).
- [ ] **Google Play:**
  - [x] first AAB uploaded: versionCode 2 (Ronit, 2026-11-03). Confirm that Play App Signing is on, with a Google-generated key (§2a step 5);
  - [ ] **BLOCKS sign-in on Play builds:** Play app signing key SHA-1 → a second Entra redirect URI (§3.4), then sign-in tested on a Play install. No record yet;
  - [ ] Play Console data-safety form and privacy policy. §5a lists every permission. For Play's advertising-ID question, the answer is **No**: there is no ads or analytics SDK and no `AD_ID` permission;
  - [ ] store listing: icon, the app name "Setu" and the splash approved by brand, rebuilt from a high-resolution master (§7 Resolution).
- [ ] **Push** (not blocking): the Firebase project and `google-services.json` (§2b), and NTF-5/NTF-6 deployed on production. Until both are done, push stays off, silently.
- [x] **Decided:** ShortcutBadger's 16 launcher-badge permissions are blocked (Ronit, 2026-11-03). The three inherited normal permissions (§5a flag 2) stay.
- [ ] `eas build --platform android --profile production`. Ronit runs it; it was not run on 2026-10-29 or 2026-11-03.

**Notes for Ronit (not blockers, nothing changed)**
- The UAT URL string is in the production **JS** bundle once, as the unused UAT entry of the URL table in `src/config/env.ts`. A PROD build never selects it: `npm test` loads `env.ts` as a production release build and gets the PROD URL. Removing the string would mean restructuring `env.ts`, which this release did not do.
  - *2026-11-03:* the string is **absent** from the Hermes bytecode. The check compiles that bytecode with `-O`, which is the release Gradle task's default flag (`hermesFlags`, `@react-native/gradle-plugin` `ReactExtension.kt`), and the optimiser drops the unused entry.
  - The AAB ships the bytecode, so it should not contain the string either. That was not checked on an AAB.
- The environment label (04 M1, M10): since 2026-10-30, Login shows no chip on a PROD build. Profile still shows **PROD · servicedesk.mountmerugroup.com**, and end users will see it there. Decide whether it stays.

## 5a. Verification for the versionCode 3 build (2026-11-03)

Prepared on Ronit's written instruction after UAT testing passed. Branch `dev` at `69a38ab` (equal to `origin/dev`,
tree clean at the start), plus the changes in §5. **No EAS build was run, and nothing was committed.**

### Version

- `android.versionCode`: `2` → **`3`**. Play's last upload is versionCode 2, and Play rejects an upload that isn't above the last one.
- `version` stays **`1.0.0`**. Play does not require a new version name for a new versionCode.
  - §1 suggests changing the name when the release content changes, and it has since versionCode 2 (G6–G8 and the polish rounds).
  - Whether users should see e.g. `1.0.1` is Ronit's call. The test pins `1.0.0`, so a new name means changing that line too.
- Unchanged, and pinned by `npm test`: package `com.mountmeru.servicedesk`, slug `meru-servicedesk`, the three schemes,
  and EAS projectId `86788b11-…325e`.

### Build profiles

| Profile | Environment | API base URL | Distribution | Build type |
|---|---|---|---|---|
| `preview` | UAT | `https://uat-servicedesk.mountmerugroup.com/api/v1` | `internal` | `apk` |
| `production` | PROD | `https://servicedesk.mountmerugroup.com/api/v1` | `store` | `app-bundle` |

- `eas.json` sets only `EXPO_PUBLIC_APP_ENV`. No URL is in it; `src/config/env.ts` maps the name to the URL.
- `preview` has not drifted: it is still `UAT`, `internal` and `apk`.
- Build guard verdicts, run locally:
  - permitted: `production` + `PROD`, and `preview` + `UAT`;
  - refused (exit 1): `preview` + `PROD`, `development` + `PROD`, no profile + `PROD`, `production` + `UAT`, and `production` with nothing set.

### What ships in the release bundle, and why none of it is a secret

`npm run verify:release-bundle -- --prod`: **PASS (PROD)**. The UAT mode also passes. Figures are in §6.

These values are in the bundle **by design**:

| Value | From | Why it is not a secret |
|---|---|---|
| PROD API base URL `https://servicedesk.mountmerugroup.com/api/v1` | `src/config/env.ts` | It is the address the app calls. The phone's own traffic shows it, and it is the web portal's public host |
| Entra **client ID** `76c6edf5-…678b`, **tenant ID** `24067079-…f4d8`, and the `login.microsoftonline.com` authority | `src/config/auth.config.ts` | They identify a public-client registration (PKCE, no client secret). Every Microsoft sign-in sends them in the clear, in the authorize URL |
| EAS **project ID** `86788b11-…325e` | `app.json`, through `env.ts` | It names the Expo project, and grants nothing without an Expo login |

These identifiers ship in **every** mobile app that calls an API or signs in with Microsoft. Anyone can extract them
from any APK or AAB, so hiding them would not protect anything.
- **Access is controlled server-side.** Every API call needs a session token. The backend issues one only after a
  valid Microsoft sign-in (AUTH-P2), and then decides what each role may do.
- Knowing the URL and IDs gets nobody past that.
- This is also why the backend gaps A7, A13 and A14 (§5) block launch: the app can't hide them, and only the server can close them.

**Not in the bundle** (a wider scan of the PROD JS and Hermes bundle; the script printed counts only):
- 0 JWTs, PEM private keys, AWS keys, Google API keys, Slack, GitHub or OpenAI-style keys;
- 0 `Basic` credentials, `Bearer <value>` literals, Azure connection strings or service-account keys;
- 0 `.env`-style `*_SECRET=` / `*_TOKEN=` assignments, `sd_session`, `test-login` or test secrets.

What the scan did find, all expected:
- 2 `password` hits, both React Native's `TextInput` autofill map (`'current-password': 'password'`, `'new-password': 'password-new'`, `TextInput.js:849`);
- 28 `client_secret` / `clientSecret` names, all inside `expo-auth-session`, none with a value (§6).

No `.env` file exists in the repo, and EAS uploads none.

**Sign-in, logging and token storage**
- **Microsoft SSO is the only way in.**
  - The bundle has 0 of the 12 developer-token strings, in the JS and the bytecode.
  - The auth stack has one screen, Login.
  - Only `src/screens/auth/signInAttempt.ts` creates a session. `useProfile.ts` re-stores the same one.
  - `tests/release/production-readiness.test.mjs` checks all three.
- **Nothing logs a token, an ID token or an authorization code.** `src/` has 7 `console` calls.
  - 6 run only in `__DEV__`: 5 behind `if (__DEV__)`, and `drift.ts` `report()`, which only `checkFields()` reaches after its `if (!__DEV__) return`.
  - The one that runs in release is `pushLog()` (`src/push/registration.ts`). Its callers pass fixed text and an HTTP status only.
  - Microsoft sign-in errors carry only the OAuth error code and the AADSTS number. `auth.api.ts` never logs or shows `result.url` or `result.params`, which hold the code.
- **Tokens are stored in `expo-secure-store` only** (`src/store/auth.store.ts`): the session token, its issue time, the user and the 15-day date.
  - AsyncStorage is not installed.
  - Microsoft's ID token is held in memory only for the AUTH-P2 exchange. Its access and refresh tokens are not kept.
  - `allowBackup` is `false`.

### Release readiness

| Check | Result | Evidence |
|---|---|---|
| targetSdkVersion ≥ 36 | **PASS**: 36 | React Native 0.86's version catalog: `targetSdk = "36"`, `compileSdk = "36"` (`node_modules/react-native/gradle/libs.versions.toml`). Expo's root-project plugin reads it, and falls back to 35 only if the entry is missing |
| minSdkVersion unchanged at 24 | **PASS**: 24 | The same catalog: `minSdk = "24"` |
| No UAT reference reachable from a production build | **PASS** | `env.ts` picks UAT only when `EXPO_PUBLIC_APP_ENV` isn't `PROD`, and `production` inlines `PROD`. Deep-link origins come from `API_BASE_URL`. The `[MOBILE TEST]` title prefix is `__DEV__`-only. `npm test` loads `env.ts` as a PROD release build and gets the PROD URL and health URL. The UAT string sits once in the JS as the unused table entry, and is absent from the `-O` Hermes bytecode (§5 notes) |
| Permissions | **PASS** | Table below: 12 after the badge block, 3 of them inherited and unused (flag 2) |
| 15-day re-authentication active | **PASS** | `REAUTH_INTERVAL_MS` = 15 days (`src/store/auth.store.ts`). It is checked on cold start (`restoreSession`) and on every return to the foreground (`endSessionIfReauthDue`, `RootNavigator`). When it is due, the next sign-in sends `prompt=login`. 47 cases in `tests/auth/reauth.test.mjs`, all passing |
| Push silent when the backend endpoint is missing | **PASS** | A 404 from NTF-5 or NTF-6 sets status `not-deployed` and writes one `[push]` log line, with no banner, dialog or toast (`src/push/registration.ts`). Tests: "a 404 from the device-token endpoint is silent" and "a 404 on sign-out is silent too" |
| `google-services.json` | **Absent**: the build succeeds with push off | Not in the repo, and no `googleServicesFile` in `app.json` (§2b). Firebase gives no token, the app records `unavailable`, and Alerts says "This version of Setu can't receive notifications" |
| Dev-token screen absent | **PASS** | Above |
| `npx tsc --noEmit` / `npm test` | **PASS** | Clean / 1086 pass, 0 fail |

### Every permission the build declares

**Sources, read on 2026-11-03:**
- the app manifest that prebuild generates (`npx expo config --type introspect`, the template plus config plugins);
- every library manifest under `node_modules`;
- the manifests of the Maven AARs that `expo-notifications` pulls in: `firebase-messaging` 25.0.1 with its 16
  Android dependencies, `ShortcutBadger` 1.1.22, and `androidx.core` 1.17.0.

Gradle may resolve a newer version of a transitive library. Confirm the final list on the built AAB: Play Console →
App bundle explorer → the bundle → Permissions.

| Permission | Kind | Declared by | Why Setu needs it | Verdict |
|---|---|---|---|---|
| `INTERNET` | normal | template, expo-file-system, expo-image, Firebase | Every API call and the Microsoft sign-in | Justified |
| `ACCESS_NETWORK_STATE` | normal | NetInfo, expo-image, Firebase | The offline banner, and pausing queries while offline (`src/api/network.ts`); FCM | Justified |
| `CAMERA` | runtime | expo-image-picker | "Take photo" for an attachment (`AttachmentPicker.tsx`). Asked only when tapped | Justified |
| `READ_EXTERNAL_STORAGE` (max SDK 32) | runtime, Android 6–12 | template, expo-file-system, expo-image, expo-image-picker | Choosing a gallery photo on Android 7–12. Not declared on 13+ | Justified |
| `POST_NOTIFICATIONS` | runtime, Android 13+ | expo-notifications, firebase-messaging | Push alerts. Asked only on the first visit to Alerts, or by "Turn on notifications" | Justified |
| `WAKE_LOCK`, `com.google.android.c2dm.permission.RECEIVE` | normal | firebase-messaging, play-services-cloud-messaging | Receiving FCM messages | Justified (push) |
| `VIBRATE` | normal | expo-haptics, template | Kept by Ronit's decision, 2026-11-03 (UI-STANDARDS §14.5). The app's haptic calls don't need it | Justified by decision |
| `com.mountmeru.servicedesk.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | signature, the app's own | androidx.core | Guards the app's own non-exported broadcast receivers | Justified (internal) |
| `WRITE_EXTERNAL_STORAGE` (max SDK 32) | runtime; no effect from Android 10 | template, expo-file-system, expo-image-picker | None: the app writes only to its own cache, and shares downloads from there. App code never requests it | Inherited; low risk |
| `ACCESS_WIFI_STATE` | normal | NetInfo | None: the app reads only connected / not connected | Inherited; low risk |
| `RECEIVE_BOOT_COMPLETED` | normal | expo-notifications | None: it reschedules local notifications after a reboot, and Setu schedules none | Inherited; low risk |
| **16 launcher-badge permissions**: `com.sec.android.provider.badge.permission.{READ, WRITE}` (Samsung), `com.htc.launcher.permission.{READ_SETTINGS, UPDATE_SHORTCUT}`, `com.sonyericsson.home.permission.BROADCAST_BADGE`, `com.sonymobile.home.permission.PROVIDER_INSERT_BADGE`, `com.anddoes.launcher.permission.UPDATE_COUNT` (Apex), `com.majeur.launcher.permission.UPDATE_BADGE` (Solid), `com.huawei.android.launcher.permission.{CHANGE_BADGE, READ_SETTINGS, WRITE_SETTINGS}`, `android.permission.READ_APP_BADGE` (ZUK), `com.oppo.launcher.permission.{READ_SETTINGS, WRITE_SETTINGS}`, `me.everything.badger.permission.{BADGE_COUNT_READ, BADGE_COUNT_WRITE}` | normal / vendor | ShortcutBadger 1.1.22, through expo-notifications | None: they set icon badge counts on some launchers, and Setu never sets one | **Removed** (`blockedPermissions`, 2026-11-03; flag 1) |
| `SYSTEM_ALERT_WINDOW` | — | template | — | Removed (`blockedPermissions`) |
| `RECORD_AUDIO` | — | expo-image-picker | — | Removed (`microphonePermission: false`) |

- **Flag 1, the launcher-badge permissions: blocked on 2026-11-03** (Ronit). None was on Play's restricted or
  sensitive lists, and none prompted the user. But they showed in the listing's permission details, and nothing in Setu uses them.
  - **There are 16, not 20.** The four `com.android.launcher.permission.*` entries (`READ_SETTINGS`, `WRITE_SETTINGS`,
    `INSTALL_SHORTCUT`, `UNINSTALL_SHORTCUT`) are commented out in ShortcutBadger's manifest. The first version of this
    section read the AAR without stripping comments, counted them, and said 20.
  - All 16 are in `android.blockedPermissions` in `app.json`, beside `SYSTEM_ALERT_WINDOW`. Prebuild writes each one
    as `<uses-permission … tools:node="remove"/>` (checked with `npx expo config --type introspect`), and the
    manifest merger then drops it from the library.
  - Simulated merge of every manifest listed above, with that rule: **28 permissions before, 12 after**. Every
    permission this table marks justified is still there.
  - **Nothing breaks.** Setu sets no badge: `shouldSetBadge: false` in `src/push/PushBridge.tsx`, no
    `setBadgeCountAsync`, and on Android a notification's `badge` field is only passed back to JS.
    - If a badge were ever set, ShortcutBadger wraps any exception, a `SecurityException` included, as
      `ShortcutBadgeException` (`applyCountOrThrow`). expo-notifications' `BadgeHelper` catches that and logs it at debug level.
    - Android 8+ notification dots need no permission, so they are unaffected.
  - `tests/release/production-readiness.test.mjs` pins the 16. It also fails if a permission the app needs is
    blocked: `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, c2dm `RECEIVE`, `CAMERA`,
    `READ_EXTERNAL_STORAGE` or `VIBRATE`.
- **Flag 2, the three inherited normal permissions** (`WRITE_EXTERNAL_STORAGE` capped at 32, `ACCESS_WIFI_STATE`,
  `RECEIVE_BOOT_COMPLETED`). They are unused but harmless, and are in almost every Expo app with these libraries. They can be blocked the same way.
- **Not declared:**
  - no `READ_MEDIA_IMAGES` or `READ_MEDIA_VIDEO`, so Play's photo-and-video permissions declaration doesn't apply;
  - no location, contacts, microphone, `AD_ID`, `QUERY_ALL_PACKAGES` or `MANAGE_EXTERNAL_STORAGE`.

## 6. Release bundle check (`npm run verify:release-bundle`)

Until 2026-10-29 this section was "Proof the developer-token screen is not in a release bundle".
- The screen is now deleted. The check still searches for its strings, as a regression test.
- The check was fixed so that known false positives no longer bury a real finding. It had failed on them since the SSO work of 2026-10-19 (02-AUTH §7.6 item 8).

**Method** (`scripts/verify-release-bundle.js`):
1. Builds the JS bundle exactly as a release build's Gradle task does: `expo export:embed --platform android --dev false --minify true`, plus a source map.
   - `npm run verify:release-bundle` bundles with `EXPO_PUBLIC_APP_ENV=UAT`, as `preview` does.
   - `npm run verify:release-bundle -- --prod` bundles with `PROD`, as `production` does. **Run this one before every production build.**
2. Compiles it to Hermes bytecode with the project's `hermesc`, as the release build does.
3. Builds a **development** bundle as a control. A `__DEV__`-only string from `src/config/env.ts` must be in the control and absent from release. That proves the search works and that `__DEV__` code is stripped.
4. Fails on any of these:
   - the 12 strings of the deleted developer-token screen;
   - forbidden auth markers: `/auth/test-login`, `x-test-secret`, `TEST_AUTH_SECRET`, `AZURE_AD`, `sd_session=` (in the JS and the bytecode);
   - a client-secret name that is not allowed below, or one given a literal value;
   - a UUID-v4 literal (the shape of a session token) that is not allowed below;
   - a `Bearer <uuid>` literal;
   - a `mountmerugroup.com` host other than the two in `src/config/env.ts`;
   - a missing control string (wrong file searched), or `__DEV__`-only code in release.
5. Prints counts and file names only, never a matched value. Bundles go to the OS temp folder, never the repo.

**What is allowed, and why each is safe** (2026-10-29). These are the four known false positives, plus two side effects of this release: the PROD host and Metro's trailer.

| Allowed | Exactly what | Why it is safe | What still fails |
|---|---|---|---|
| `client_secret`, `clientSecret` (any case; `_`, `-` or nothing between) | Occurrences that the source map traces to `node_modules/expo-auth-session/` | They are the auth library's option and form-field **names** (`AuthRequest`, `TokenRequest`, `RevokeTokenRequest`, the hooks). The app is a public client with PKCE and passes no secret (02-AUTH §7.1). All 28 are property reads and copies such as `this.clientSecret=e.clientSecret`; none has a value | The name anywhere else: app code, `app.json`, any other package. The name given a literal value anywhere, the library included: `clientSecret:"…"`, `client_secret='…'`, `?client_secret=…`. A missing or unreadable source map, which fails closed. Each run also proves the tracing works: an app string must trace to `src/api/client.ts` |
| Entra client ID | `76c6edf5-…678b`, exact value | Application (client) ID of a public-client registration. It is sent in every authorize request; not a secret (02-AUTH §7.1) | Any other UUID-v4 |
| Entra tenant ID | `24067079-…f4d8`, exact value | Directory (tenant) ID. It is part of the public authority URL `login.microsoftonline.com/<tenant>` | Any other UUID-v4 |
| EAS project ID | `86788b11-…325e`, exact value | `app.json` `extra.eas.projectId`, bundled because `src/config/env.ts` imports `app.json`. It names the Expo project and grants nothing without an Expo login | Any other UUID-v4 |
| `servicedesk.mountmerugroup.com` | Host | The PROD API host, set 2026-10-29. `env.ts` bundles its URL table whole, so every bundle names both hosts | Any other `mountmerugroup.com` host, e.g. QA |
| Metro's `//# debugId=<uuid>` | The trailer at the very end of the bundle, only when its id equals the `debugId` in the source map Metro just wrote | Appears because the check now builds a source map. Metro generates a fresh id per build to pair a bundle with its map | A UUID anywhere else |

- In the Hermes bytecode, the two client-secret names are not searched. Bytecode keeps no source positions to trace them by. It is compiled from the release JS checked above, and every other marker is still searched in it.
- The old dev placeholder user ID is **no longer allowed**: its source (`src/utils/session.ts`) was deleted.

**Proof that the check catches a real leak (2026-10-29).**
- For one run, a canary was appended to `src/utils/greeting.ts`, then the file was restored byte for byte. The canary held a literal `clientSecret`, a made-up UUID-v4 and the QA host.
- Result: **FAIL**, with exactly 4 problems:
  - the secret name, traced to `src/utils/greeting.ts`;
  - its literal value;
  - the QA host;
  - the unknown UUID.

**Result on 2026-11-03 (versionCode 3): PASS in both modes.** The `--prod` run was repeated after the versionCode
change, because `app.json` is bundled. Every figure equals the 2026-10-29 table below: dev-token strings 0 / 0 / 0;
forbidden markers 0; 28 client-secret names, all from `expo-auth-session`, none with a value; the 3 public UUIDs and 0
others; the two hosts; `__DEV__`-only string 1 in the control and 0 in release. The wider scan is in §5a.

**Result on 2026-10-29 (this release's code): PASS in both modes**

| Check | `preview` mode (UAT) | `--prod` mode (PROD) |
|---|---|---|
| Dev-token strings (of 12): release JS / Hermes / control | 0 / 0 / 0 (screen deleted) | 0 / 0 / 0 |
| Forbidden auth markers | 0 | 0 |
| Client-secret names | 28, all traced to `expo-auth-session`; 0 with a value | the same |
| UUID-v4 literals | the 3 public IDs; 0 others (Metro trailer set aside) | the same |
| Hosts | `uat-servicedesk`, `servicedesk` | the same |
| `__DEV__`-only string: control / release | 1 / 0 | 1 / 0 |
| Control strings (non-JSON guard, error boundary, "Sign in with Microsoft") | present | present |

A one-off wider scan of the PROD bundle on the same day (not part of the script) found:
- no JWT, private key, AWS, Google or Slack/GitHub/OpenAI-style key, `Basic` credential, or session-token value;
- three `password` / `AccessToken` hits, all enum values: React Native `TextInput` autofill names and `expo-auth-session` `TokenTypeHint.AccessToken = "access_token"`.

No `.env` file exists in the repo, and EAS uploads none. The app reads `EXPO_PUBLIC_APP_ENV`, inlined at build time; an EAS build uses the Entra ID defaults in `auth.config.ts`.

History:
- 2026-10-16 (Phase 5): PASS.
- 2026-10-19 to 2026-10-29: FAIL, on the false positives listed above.
- 2026-10-29: PASS, both modes (versionCode 2).
- 2026-11-03: PASS, both modes (versionCode 3).

## 7. App identity assets (`assets/`)

Phase B (2026-10-20) replaced the Phase 5 placeholder artwork with the official Meru logo. Every file comes from
`assets/brand/meru-logo.png`, which is byte-identical to the web portal's `frontend/public/meru-logo.png`.

| File | Size | Content | Used for |
|---|---|---|---|
| `icon.png` | 1024×1024, opaque | Logo 640 px wide, centred on white | `expo.icon`: legacy launcher icon (Android 7.x) and store listing source |
| `adaptive-icon.png` | 1024×1024, transparent | Logo 512 px wide, centred | `android.adaptiveIcon.foregroundImage`, and `monochromeImage` (Android 13 themed icons use its alpha) |
| `adaptive-icon-background.png` | 1024×1024, flat white | — | `android.adaptiveIcon.backgroundImage` (`backgroundColor` is the same `#FFFFFF`) |
| `splash-icon.png` | 1024×1024, transparent | **Since 2026-10-30: only the yellow drop**, where it sits in a 640 px logo whose top is at y 160, raised 96 px (18 dp): the start-up intro's first frame. Phase C to 2026-10-29: the logo 640 px wide, then "Setu" on one line (Segoe UI Bold, 102 px, #111827) | `expo-splash-screen` image (`app.json` plugins: `imageWidth` 192, white background) |
| `brand/meru-mark.png` | 566×346, transparent background (the mark itself is 89 % opaque red, see below) | The logo trimmed to its content | In-app logo (`src/components/BrandLogo.tsx`): Login's logo card (contained in 92 × 60 dp), the drawer header (44 dp tall, 72 dp wide) and the start-up intro (120 × 73 dp) |
| `brand/meru-drop.png` | 566×346, transparent | `meru-mark.png` with every pixel cleared except the drop's (the drop's pixels are byte-identical to the mark's). Added 2026-10-30 | The start-up intro (`src/navigation/SplashIntro.tsx`): the drop falls on its own, then the mark fades in over it in the same box |
| `brand/meru-logo.png` | 689×478, RGB | The source, untouched | — |

Splash geometry (Phase C):
- The plugin fits the square image into `imageWidth` (192 dp), centred in its 288 dp canvas.
- Android 12+ shows only the centred 192 dp circle of that canvas. Core-splashscreen uses the same composition on Android 11 and older.
- So everything drawn must fit in the circle inscribed in the 1024 px square. The logo-and-text block is 640 × 559 px, a diagonal of 850 px (17 % margin); the farthest drawn pixel is 379 px from the centre, inside the 512 px radius. With the old two-line name it was 640 × 679 px.
- On screen this is a logo of 120 × 73 dp and text of 19 dp.
- The splash stays until `RootNavigator` has read the stored session and navigation is ready (`src/navigation/splash.ts`); the crash screen also hides it.
- The text is part of the image because the native splash can only show an image.
- Segoe UI was used because no Roboto file was available to render it. Brand may want it redrawn in their own typeface together with the high-resolution logo.

Splash since 2026-10-30 (start-up intro, `docs/PERFORMANCE.md` §12.2):
- The image shows **only the drop**: the intro's first frame. The intro draws that same frame in the same place (a
  192 dp box centred on the screen, `splashArt` in `src/theme/brand.ts`), and the native splash is hidden as soon as
  it can, so the hand-over shows no change. The intro then drops it 18 dp into place, brings in the logo, then "Setu"
  over a short yellow rule (drawn by the app in Roboto: there is no text in the image any more).
- The drop sits where it ends up in a 120 × 73 dp logo whose top is 30 dp from the box's top, raised 18 dp. That is
  left of and above the screen's centre: on a slow cold start, the lone drop is what shows until the app is loaded.
- Its farthest drawn pixel is 493 px from the image's centre (bounding-box corner), inside the 512 px circle that
  Android 12+ shows.
- With "Remove animations" on, there is no intro: this image hides when the first screen is ready, as before.
- Android always fades the native splash out as it hides (expo-splash-screen's `SplashScreenManager.kt`; `fade` is an
  iOS option). The fade is set to 120 ms (`motion.intro.nativeFade`, through `SplashScreen.setOptions`); it was the
  default 400 ms.
- **To go back to the old splash** (logo and "Setu" in the image): restore `assets/splash-icon.png` from commit
  `4063df3` and remove `<SplashIntro />` from `App.tsx`. Both together: the old image with the intro would show the logo
  twice.
- The native image only changes with a new build: EAS runs prebuild, which turns it into the splash drawables.

How they were made (Pillow; the script is not in the repo, the steps are):
1. Trim the source to the bounding box of its non-white pixels (x 120–685, y 8–353 → 566 × 346).
2. Make a transparent copy by "colour to alpha" against white. The source has no alpha channel, so this keeps the
   anti-aliased edges clean on any background. The drop's white highlight and the white gap between drop and "m"
   become transparent.
3. Scale with one factor (aspect ratio 1.636 kept, LANCZOS) and centre on each canvas.

The rename to "Setu" (2026-10-23) changed only the splash text; the script is again not in the repo:
1. The logo is not redrawn. Its rows (168–558) are copied byte for byte from the Phase C splash, shifted 64 px down.
2. The text uses the Phase C recipe, recovered from the image: Pillow's basic layout (no kerning), Segoe UI Bold
   102 px, #111827, `anchor='ma'` at x = 512, the line's origin 447 px below the logo's top. Proof: drawn this way,
   "Mount Meru" / "Service Desk" reproduce the Phase C text area byte for byte.
3. The block, 559 px tall (logo top to the text's last row), is re-centred: rows 232–790 of 1024.
4. Checked: Windows OCR (`Windows.Media.Ocr`) reads the image, flattened on white, as "meru" / "Setu", and reads the
   Phase C image as "meru" / "Mount Meru" / "Service Desk" (the control). The logo rows compare identical to the
   Phase C image, and the text is the single colour #111827.

The drop-only splash and `brand/meru-drop.png` (2026-10-30) are drawn by a script in the repo,
`scripts/make-splash-assets.py` (Pillow; run from the repo root):
1. The drop is the mark's connected shape that holds its yellowest pixel (8-connected over alpha > 0). The "m" and
   "meru" are separate shapes. Every other pixel is cleared: that is `meru-drop.png`.
2. That image is scaled to 640 × 391 px (LANCZOS, as Phase C scaled the logo) and placed at (192, 160 − 96).
3. `tests/motion/start-up-and-login.test.mjs` decodes both files and fails if they drift from the app's geometry: the
   drop's pixels must equal the mark's, the splash must hold only the drop, and its edges must sit within 3 px
   (0.6 dp) of where the intro draws them.

The mark's transparency (measured 2026-10-30): the background is fully transparent, but because the mark was made by
"colour to alpha" against white, no pixel is fully opaque. The red is (208, 0, 15) at alpha 228 and the yellow
(254, 202, 0) at alpha 252. On white that composites to the brand colours; on any other colour, the red takes some of it.
So the mark belongs on white (as on Login's white logo card). An opaque vector mark from brand would remove the limit.

Why white behind the logo:
- The mark is red `#D51B28` and yellow `#FECB03`. On a red background the "m" disappears, and on a yellow one the
  drop does.
- White is the logo's own field, and it is what the web shows it on (favicon, sidebar, login card).

Safe zones:
- Adaptive icon: the logo's bounding-box diagonal is 600 px. Android's always-visible 66/108 circle is 626 px. So
  nothing is cropped by any launcher mask (circle, squircle, rounded square). This was checked against rendered masks.
- Splash: see "Splash geometry" above.

Resolution:
- The source logo is only 566 px wide.
- `icon.png` is therefore upscaled ×1.13; the other files are downscaled or unscaled.
- At launcher and store sizes (≤ 512 px) the upscale is invisible.
- For the store release, ask brand or marketing for a **vector (SVG/EPS/AI) or ≥ 2048 px PNG** of the mark, then
  rebuild the four PNGs with the same names, sizes and placement. No code changes are needed.
- Phase C re-audited the three launcher files and did not replace them:
  - all three are the Meru logo, with 0 % placeholder-blue pixels (the Phase 5 `icon.png` was 90 % blue);
  - the adaptive foreground is 512 px wide, inside the inner 66 %;
  - there is no `android/` folder or image cache in the repo that could still hold the old icon.

`android.blockedPermissions` removes `SYSTEM_ALERT_WINDOW` (draw over other apps). The Expo template adds it, but the app never uses it, and Play reviews flag it. Since 2026-11-03 it also removes ShortcutBadger's 16 launcher-badge permissions (§5a flag 1). `allowBackup` stays `false`, so the SecureStore token is never restored onto another device.

## 8. Packages waiting for approval

`expo-splash-screen` was approved and installed in Phase C (~57.0.10, via `npx expo install`); its configuration is in §7.
`expo-notifications` was approved and installed in G7 (~57.0.24, via `npx expo install`) for push; its configuration is in §2b. `expo-device` was not needed: a phone without push support simply gets no token, which the app already handles silently.

| Package | Why | After approval |
|---|---|---|
| `expo-dev-client` (SDK 57 line) | Required by a `development` profile (a dev-client build against UAT). The developer-token screen it was first wanted for was deleted on 2026-10-29 | `npx expo install expo-dev-client`, add a `development` profile to `eas.json`, then `eas build --platform android --profile development` |

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
