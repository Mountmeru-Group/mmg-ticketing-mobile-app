# Release guide — Setu (Android)

Written in Phase 5 (2026-10-16). Covers building each EAS profile, getting the Android signing hash for IT (ask A2),
handing an APK to testers, and the checklist that must be complete before any production build.
Updated 2026-10-29 for the first production build (Google Play internal testing): developer-token screen deleted,
PROD URL set, version 1.0.0, release-bundle check fixed.

**Where things stand**

| Item | State |
|---|---|
| App identity | `Setu` (renamed 2026-10-23; `Mount Meru Service Desk` from Phase B, 2026-10-20, and `MMG Service Desk` before that), package `com.mountmeru.servicedesk`, version **`1.0.0`**, versionCode **`2`** (`app.json`, set 2026-10-29; every earlier build was `0.1.0` / `1`) |
| Android SDK | targetSdk **36**, compileSdk 36, minSdk 24 (re-checked 2026-10-29). Not set in this repo: the Expo SDK 57 template reads them from React Native 0.86's version catalog (`node_modules/react-native/gradle/libs.versions.toml`) through the `expo-root-project` Gradle plugin (`ExpoRootProjectPlugin.kt`, which falls back to **35** if the catalog has no `targetSdk`). Re-check after any Expo or React Native upgrade |
| Icons | Built from the official Meru logo (`assets/brand/meru-logo.png`, the web portal's own file) and wired in `app.json` (see §7). Re-audited in Phase C: no placeholder file remains. The blue "MMG" ticket icon seen on a phone is an APK built before Phase B (commit `8ffe265`); uninstall it before installing the next build, because some launchers keep the old icon. Source is only 689 × 478, so get a vector or ≥ 2048 px master before a store release |
| Splash | **Wired (Phase C, 2026-10-20).** `expo-splash-screen` ~57.0.10 is installed and configured in `app.json`. It shows the Meru logo with "Setu" on white (image regenerated 2026-10-23, §7), and stays up until the first screen is ready (`src/navigation/splash.ts`), so no blank frame shows between the splash and the app. Takes effect from the next build |
| `preview` APK | Ready to build with your Expo account (§2). It points at **UAT** |
| Signing in | **Microsoft sign-in only, in every build.** The `__DEV__` developer-token screen was **deleted on 2026-10-29** (§5), with its route, its Login button and the helpers that existed only for it. AUTH-P2 is live on UAT (02-AUTH §7) |
| `production` AAB | **Ready to build, not built** (§2a). PROD URL set 2026-10-29; the build guard permits it. It points at **PRODUCTION**. Open blockers are in §5 |

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
   - Check that Login shows **PROD · servicedesk.mountmerugroup.com**, then sign in with Microsoft.

For every later upload, raise `android.versionCode` by 1. Play rejects a versionCode that isn't higher than the last one it received.

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

State on **2026-10-29**. Items marked **BLOCKS** stop a useful production build; the rest are on the person releasing. The build guard enforces the PROD URL item.

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

**Open: outside this repo**
- [ ] **BLOCKS — AUTH-P2 on production.** `POST /api/v1/auth/microsoft/mobile` is confirmed on UAT only (02-AUTH §7.6 item 1). Until the backend team deploys and confirms it on production, a Play build shows **"App sign-in isn't available yet"** (`endpoint-missing`) after Microsoft sign-in, and nobody can get in.
- [ ] **BLOCKS — security asks fixed and confirmed on production by the backend team** (06-BACKEND-ASKS, all "BLOCKING — launch"; no record they shipped):
  - [ ] **A7**: authorization gaps, the AI-summary private-note leak first;
  - [ ] **A13**: session cache re-checks `isActive` and role;
  - [ ] **A14**: rate limit keyed on the Bearer token, not the IP.
  - Ronit decides whether an internal-testing track with named testers may go ahead before these ship.
- [ ] **SSO end to end on an installed UAT build.** AUTH-P2 answers on UAT (2026-10-20) and the Entra registration exists, but this repo has no record of a completed sign-in on a phone. Ronit to confirm.
- [ ] **Google Play:**
  - [ ] first AAB uploaded by hand, Play App Signing on (§2a);
  - [ ] **BLOCKS sign-in on Play builds:** Play app signing key SHA-1 → a second Entra redirect URI (§3.4), then sign-in tested on a Play install;
  - [ ] Play Console data-safety form and privacy policy;
  - [ ] store listing: icon, the app name "Setu" and the splash approved by brand, rebuilt from a high-resolution master (§7 Resolution).
- [ ] `eas build --platform android --profile production`. Ronit runs it; it was not run on 2026-10-29.

**Notes for Ronit (not blockers, nothing changed)**
- The UAT URL string is still inside the production bundle, as the unused UAT entry of the URL table in `src/config/env.ts`. A PROD build never selects it: `npm test` loads `env.ts` as a production release build and gets the PROD URL. Removing the string would mean restructuring `env.ts`, which this release did not do.
- Login and Profile show the environment badge (04 M1). On a Play build it reads **PROD · servicedesk.mountmerugroup.com**, and end users will see it. Decide whether it stays.

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

`android.blockedPermissions` removes `SYSTEM_ALERT_WINDOW` (draw over other apps). The Expo template adds it, but the app never uses it, and Play reviews flag it. `allowBackup` stays `false`, so the SecureStore token is never restored onto another device.

## 8. Packages waiting for approval

`expo-splash-screen` was approved and installed in Phase C (~57.0.10, via `npx expo install`); its configuration is in §7.

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
