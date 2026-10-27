# 11 — Microsoft sign-in, verified without a build (Phase A-VERIFY, 2026-10-20)

> ## Result: everything after Microsoft's redirect is proven. The redirect itself still needs a build.
> - **34 tests, 34 pass** (`npm test`). They run the app's real sign-in code against the backend's confirmed AUTH-P2 response (`02-AUTH.md` §7.5). Nothing calls UAT or Microsoft.
> - **Extra unknown fields cannot break sign-in.** Test (b) proves it, and a deliberately broken copy of the code that rejects extra fields fails exactly that test (§1.4).
> - **Fixed:** an old sign-in error could still be on screen when someone came back to the app hours later (§6).
> - **Not reconciled:** the sign-in `user` and the `GET /auth/me` `user` have different shapes (§5).
> - **Only a build can prove** that Microsoft accepts the redirect URI and that Android hands the result back to the app (§4). §4.1 gives an optional browser check that needs no build.
> - No EAS build was run, nothing was committed, and the branch is `dev`.

---

## 1. How it was tested

### 1.1 The test setup
- **The repo had no test framework.** There was no jest or vitest, no test script and no test files.
- No library was added. The tests use **Node 24's built-in test runner** (`node:test`; Node 24 is already the pinned runtime in `eas.json`), plus the repo's existing `typescript` package to read the app's `.ts` files.
- Run: **`npm test`** (new script in `package.json`).

| File | What it is |
|---|---|
| `tests/auth/mobile-sso.test.mjs` | The 34 tests |
| `tests/support/register.mjs`, `tests/support/loader.mjs` | Lets Node load the app's TypeScript and its `@/` imports |
| `tests/support/stubs/expo-secure-store.mjs` | An in-memory stand-in for the phone's Keystore |
| `tests/support/stubs/expo-auth-session.mjs` | Plays Microsoft's part, and records what the app asked Microsoft for |

- Test files are plain `.mjs`. They are outside `tsc` (which checks `**/*.ts`) and outside the app bundle (checked: no test module in the Metro bundle).

### 1.2 Real vs faked

| Real (the app's own code) | Faked |
|---|---|
| The Login screen's sign-in sequence (`attemptSignIn()`) and its messages | Microsoft's page and token endpoint |
| `signInWithMicrosoft()`, `exchangeMicrosoftIdToken()`, response checks, error mapping | The network: axios's transport answers with the documented responses |
| `apiClient` with both interceptors (HTML guard, error normalising, 401 handling), and axios itself | The phone's Keystore (SecureStore) |
| The auth store: `setSession()`, `restoreSession()` and the 8-hour rule; drift logging | — |

### 1.3 One refactor, so the real code could be tested
- The Login screen's sign-in sequence and its message table were inside `LoginScreen.tsx`, a React Native component that Node cannot load.
- They were **moved unchanged** to `src/screens/auth/signInAttempt.ts`. The message table is byte-identical, checked with `diff`.
- `LoginScreen.tsx` now only renders. Behaviour is the same: the spinner stays on success, there is no message on cancel, and each failure shows its own banner.

### 1.4 Do the tests catch real bugs? (mutation check)
Three bugs were put back into a **scratch copy** of the code, never the repo, one at a time:

| Bug reintroduced | Tests that failed |
|---|---|
| Require `user.displayName` again (the pre-fix contract) | 9, including (a) and (b) |
| Reject any field the contract does not name | Exactly 1: test (b), the extra-fields test |
| Read a 403 by its message text again | Exactly 1: "a 403 is deactivated whatever its wording" |

### 1.5 Test data
- The test body has the confirmed response's exact field set, types, `role: "ADMIN"` and `expiresAt: "2026-10-20T07:45:00.000Z"`.
- The identifying values are fakes (token, IDs, email, phone). No real token, ID token or code is in the repo.

---

## 2. The tests (34)

| Brief | Test | Result |
|---|---|---|
| — | Microsoft step: code flow, PKCE on, `prompt=select_account`, the `auth.config.ts` client ID, scopes and endpoints. The code is redeemed with the same redirect URI and the request's own PKCE verifier, and no secret | ✔ |
| — | AUTH-P2 request: `POST https://uat-servicedesk.mountmerugroup.com/api/v1/auth/microsoft/mobile`, body exactly `{ "idToken" }`, JSON headers, **no `Authorization`** even with an old token in memory, no cookies | ✔ |
| **a** | The confirmed 200 signs in. `mmg.session.token` holds the token, `mmg.session.user` holds the user with `role: "ADMIN"`, and the store is authenticated. **Zero** drift lines | ✔ |
| a | `name` becomes `displayName` (the renamed field behind the original failure) | ✔ |
| a | `department` and `phone` are accepted but not kept | ✔ |
| a | `expiresAt` is checked and reaches the app unchanged; the session clock is still **8 h from sign-in** (see §7, item 1) | ✔ |
| a | The stored session comes back after a simulated app restart | ✔ |
| **b** | **Three unknown extra fields** (`sessionId`, `user.departmentId`, `user.avatarUrl`): signs in, same stored user, not even a drift line | ✔ |
| **c** | `department`, `countryId`, `ldapSamAccount` and `phone` removed: signs in, nulls are stored, and one drift line is logged per field | ✔ |
| c | `name` removed too: signs in, and the email stands in for the name | ✔ |
| **d** | Missing `token`, `user.id`, `user.email`, `user.role` or `expiresAt`, five tests: each is refused as `unexpected-response`, the detail names the field, and **nothing is stored** | ✔ ×5 |
| d | An unknown role value (`SUPERUSER`) is refused too | ✔ |
| **e** | 400 → `bad-request`; 401 → `token-rejected`; 403 → `account-disabled`; 500 → `server`. Nothing is stored, and a 401 here does **not** trigger the "session ended" sign-out | ✔ ×4 |
| e | The four titles and the four messages are all different; 403's says "deactivated" | ✔ |
| e | A 403 means deactivated whatever its text (mapped by status) | ✔ |
| **f** | 200 with an HTML body (`text/html`): rejected before parsing; nothing stored | ✔ |
| f | 200 with HTML labelled `application/json`: also rejected | ✔ |
| — | Microsoft page closed: cancelled, no request sent, nothing stored, no error | ✔ |
| — | No answer from the server → `network` | ✔ |
| — | 404 from a server without the route → `endpoint-missing` | ✔ |
| — | SecureStore refuses → `storage`, not signed in, and the next cold start wipes the partial write | ✔ |
| item 5 | Stale banner: cleared after ≥ 5 min away; kept if back sooner; never cleared because of Microsoft's own page; judged once per return | ✔ ×4 |
| item 5 | A cold start cannot bring a banner back: no failure or message is ever written to SecureStore | ✔ |
| R6 | No session token, ID token or authorization code in any log line or failure detail across the whole run | ✔ |

---

## 3. The sign-in path, step by step

1. **Tap "Sign in with Microsoft".** The button greys out and shows a spinner. A fast double tap cannot start two sign-ins.
   - If this build's Entra client ID or tenant ID is not filled in, it stops here: **"Microsoft sign-in is not configured."**
2. **Microsoft's page opens** in a Chrome Custom Tab. The app asks Microsoft for:
   - an authorization code, protected with PKCE (S256);
   - client ID `76c6edf5-…`, tenant `24067079-…`;
   - scopes `openid profile email offline_access`;
   - "choose an account" (`prompt=select_account`);
   - redirect URI `msauth://com.mountmeru.servicedesk/tlz9kcLBCrCtaVd%2FAvzUpkcOfgo%3D`.

   What the user can see at this step:
   - Closes the page, presses Back, or taps Cancel: back to the button, **no message**.
   - Microsoft reports a problem: **"Microsoft sign-in failed"**. The AADSTS code appears in the developer line of dev builds.
3. **Microsoft sends the browser to the redirect URI** with a one-time code, and Android hands that URL to the app.
   - The app trades the code, plus its PKCE verifier and no secret, for tokens at `login.microsoftonline.com`.
   - It keeps **only the ID token**, in memory, for one request. Microsoft's access and refresh tokens are thrown away.
   - No connection: **"Can't connect"**.
4. **The app calls the Service Desk:** `POST https://uat-servicedesk.mountmerugroup.com/api/v1/auth/microsoft/mobile`.
   - Body: `{ "idToken": "<the Microsoft ID token>" }`.
   - It sends **no** `Authorization` header and **no** cookies.
5. **The Service Desk answers.** What the user sees (each banner also shows `Ref: <reason> · HTTP <status>`):

   | Answer | Banner | Retry button |
   |---|---|---|
   | 200 JSON | (step 6) | — |
   | 400 | "Sign-in request wasn't accepted": report to IT | No |
   | 401 | "Sign-in was refused": use the work account | Yes |
   | 403 | **"Account deactivated"**: contact IT | No |
   | 500, other 5xx, or an IIS error page | "The Service Desk had a problem": try in a few minutes | Yes |
   | 404 / 405 | "App sign-in isn't available yet" (the route is not on this server) | No |
   | 429 | "Too many attempts" | No |
   | 200 but HTML or not JSON | "Sign-in couldn't be completed": report to IT | No |
   | No answer or timeout | "Can't connect" | Yes |

6. **The app checks the 200 body.**
   - It needs `token`, `expiresAt`, `user.id`, `user.email`, and `user.role`, which must be ADMIN, AGENT, END_USER or L2_MANAGER.
   - If any is missing or wrong: **"Sign-in couldn't be completed"**, and nothing is saved.
   - Missing optional fields produce only a developer log line. Extra fields are ignored.
7. **The app builds its session from the answer:**
   - `user.name` becomes the display name (the email if there is no name).
   - `countryId` and `ldapSamAccount` are kept, or set to empty if missing.
   - `department` and `phone` are dropped.
   - `expiresAt` is checked but **not used** (§7, item 1).
8. **The session is written** to SecureStore, the phone's Keystore-backed storage, in this order:
   - `mmg.session.token`;
   - `mmg.session.issuedAt` (= now);
   - `mmg.session.user` (the user as JSON; not a secret).

   Then it is kept in memory. If the phone refuses to save it: **"Couldn't save your sign-in"**, with Retry. A token that was already written is wiped on the next cold start (tested).
9. **The app switches to the main screens.** Every later request carries `Authorization: Bearer <token>`.
10. **The session ends** 8 hours after step 8, by the phone's clock, or at the first 401 from the server, whichever comes first. The user returns to Login with "Your session has ended. Please sign in again.", or "Your account is disabled. Contact IT." if the server said the account is deactivated.
11. **On a cold start** the app reads SecureStore.
    - A token, time and user less than 8 h old: straight into the app.
    - Older: Login with "Your session has ended."
    - Anything incomplete: wiped, plain Login.

---

## 4. What only a build can verify, and why

Node cannot open a browser, receive an Android deep link, or run the Keystore. Everything below sits in that gap.

### 4.1 The redirect URI in Entra
**What must be true.** Entra must list exactly this redirect URI for client `76c6edf5-…`:

`msauth://com.mountmeru.servicedesk/tlz9kcLBCrCtaVd%2FAvzUpkcOfgo%3D`

It is fixed in `src/config/auth.config.ts` `getAuthRedirectUri()`.

**What makes it fail:**
- **The string differs in any way.** For example, a different signature hash, `/` and `=` not URL-encoded (`%2F`, `%3D`), or a trailing slash.
  - Microsoft then shows **AADSTS50011** (redirect URI mismatch) on its own page. The app shows nothing; closing the page returns to the button.
- **The URI is registered under the wrong platform.** It must be under **Android** or **Mobile and desktop applications**.
  - Under **Web**, the code exchange fails with AADSTS7000218 (it wants a client secret).
  - Under **Single-page application**, it fails with AADSTS9002327.
  - Either way the app shows **"Microsoft sign-in failed"**, with the code in the developer line.
- **What does not matter here:** the signature hash is not checked against the APK's signing key in this flow. To Microsoft it is just part of the string. Only Microsoft's broker apps verify signatures, and this app does not use a broker.

**Optional check with no build** (Ronit's call: it signs in to Microsoft for real, but never touches the Service Desk):
1. Open this URL in a desktop browser:
   ```
   https://login.microsoftonline.com/24067079-ff6a-4c4e-a5de-7c5ac7ddf4d8/oauth2/v2.0/authorize?client_id=76c6edf5-a09c-4d1a-9a48-68f84697678b&response_type=code&redirect_uri=msauth%3A%2F%2Fcom.mountmeru.servicedesk%2Ftlz9kcLBCrCtaVd%252FAvzUpkcOfgo%253D&scope=openid%20profile%20email%20offline_access&prompt=select_account&code_challenge=ZeK5KHBhBO0I-Bdb38OerNBsfmWSdk0Ae4dh1Tp8HJs&code_challenge_method=S256
   ```
2. Sign in.
   - **AADSTS50011:** the registration does not match. Fix this in Entra before building.
   - **No error, and the browser tries to open an `msauth://` link:** Microsoft accepts the URI.
- The PKCE challenge in the URL belongs to a verifier that was generated and thrown away. Any code the browser receives is useless to anyone.

### 4.2 Getting back into the app
- **Android must give `msauth://com.mountmeru.servicedesk/…` to this app.** That depends on the Android manifest, which is generated only at build time from `app.json` `scheme`. `scheme` has included `"msauth"` since `7018f85`, so **any APK built before `7018f85` can never complete sign-in.**
- **The returning URL must start with the exact redirect string, including `%2F` and `%3D`.** `expo-web-browser` on Android checks this with `startsWith` (`expo-auth-session/node_modules/expo-web-browser/build/WebBrowser.js:352`).
  - If Chrome or Android hands the URL over decoded or re-encoded, the match fails.
  - The app then only sees "came back without a redirect" (`WebBrowser.js:304-305`) and treats it as **Cancel**.
  - **Symptom: you finish signing in at Microsoft, the app comes back, and nothing happens, with no error.** This is the most confusing failure, so watch for it on the first build.
- **The same symptom can come from a timing race.** That code also gives up as soon as the app becomes active again. If Android reports "app active" before it delivers the URL, the result is the same. It is rare, and only visible on a device.
- **Side effect worth checking.** `scheme: "msauth"` registers the app for **every** `msauth://` link, not only `msauth://com.mountmeru.servicedesk/…`.
  - Other Microsoft-library apps on the same phone that sign in through the browser may then show Android's "Open with" chooser with Setu in it.
  - This was not changed: the brief forbids touching the redirect setup.
- **Expo Go can no longer test sign-in at all.** The redirect is fixed to `msauth://…`, and Expo Go cannot receive it. `02-AUTH.md` §7.2 still says Expo Go uses `exp://…`; that is out of date.

### 4.3 After the redirect, on real systems
- **PKCE with the real library.** The tests fake Microsoft, so the real S256 verifier/challenge pair and Microsoft's acceptance of it are unproven.
- **Backend Entra settings.** The ID token's audience is the mobile client ID `76c6edf5-…`. If UAT's backend is set up with a different client ID or tenant, the first real attempt shows **"Sign-in was refused" (401)**. That setting is not visible from here.
- **The Keystore.** SecureStore actually saving and reading on a device, including after a phone restart.
- **Bearer through IIS/ARR on UAT** for the calls after sign-in (`00-OVERVIEW.md` BLOCKER B4).
- **Cookies.** Whether UAT's 200 sets `Set-Cookie`. It must not (`02-AUTH.md` §2 #5). Dev builds warn if it does.
- **The stale-banner wiring** in `LoginScreen.tsx`. Its rule is tested; the AppState events on a real phone are not.

---

## 5. Drift: the sign-in `user` vs `GET /auth/me`

**They are different shapes. They are reported here, not reconciled.**

| | AUTH-P2 `user` (sign-in) | AUTH-2 `GET /auth/me` `user` |
|---|---|---|
| Fields | `id, email, name, role, countryId, ldapSamAccount, department, phone` | `id, email, displayName, role, ldapSamAccount, countryId` |
| Source | Backend team, 2026-10-19 | Web source at `d7f3887`: `auth.controller.ts:64` returns `req.user`, built at `auth.middleware.ts:46-53`, cached at `auth.service.ts:278-285` |

- **The name field differs** (`name` vs `displayName`), and AUTH-P2 adds `department` and `phone`.
- **There is no runtime effect today.** The SSO path never calls `/auth/me`; only the `__DEV__` dev-token screen does, and it reads `displayName`, which matches AUTH-2.
- **`src/store/auth.store.ts:20` says the user "is refreshed from GET /auth/me on every cold start". No code does that.**
  - If that refresh is built, it will read `displayName` while sign-in reads `name`.
  - That is the point where the two shapes must be handled side by side.
- **For sessions created by the new endpoint, `/auth/me` is not verified.** It returns whatever the server cached in Redis at sign-in, and that cache is written by backend code the local web clone (`d7f3887`) does not contain.
- **Question for the backend team:** is `name` vs `displayName` intentional?

---

## 6. Audit: can an old error survive a restart?

- **Cold restart: no, and that was already true.**
  - The error banner is screen state in memory.
  - Nothing about a failure or a message is ever written to SecureStore. Only the token, time and user are.
  - On a cold start `signOutMessage` is reset. It is set only when a stored session is found to have expired, which is a current fact, not an old error.
  - Tested.
- **Warm resume: yes, before this change. Fixed.**
  - Android keeps the app alive in the background, and Back on the Login screen only sends it to the background.
  - Reopened hours later, the old banner (for example "Sign-in couldn't be completed · HTTP 200") was still there and looked fresh.
  - Now the banner is cleared when the app comes back after **5 minutes or more** away, while no sign-in was running. The rule is in `createStaleFailureGuard()` in `signInAttempt.ts`, and `LoginScreen.tsx` feeds it AppState changes.
  - A short trip away (for example to message IT) keeps the banner and its `Ref:` line.
  - Microsoft's own page sends the app to the background mid-sign-in, and that never counts as leaving.
- **Left as is:** the "Your session has ended" note stays above the button until the next successful sign-in. It is not a sign-in failure.

---

## 7. Other findings (reported, not fixed)

1. **`expiresAt` is not used for expiry.** It is checked and returned, but not stored. The app ends the session 8 h after sign-in by its own clock, and a 401 is still the final word (`02-AUTH.md` §5.4).
   - `auth.store.ts` says this waits for the backend to confirm the contract. That has now happened.
   - Using `expiresAt` changes when sessions end, so it is Ronit's decision.
2. **Out-of-date redirect text.**
   - `02-AUTH.md` §7.2 still describes `com.mountmeru.servicedesk://auth`, built by `makeRedirectUri`, and an `exp://` URI for Expo Go.
   - The comments in `auth.config.ts` say the same, and `makeRedirectUri` is now an unused import there.
   - The code itself uses the fixed `msauth://…` URI. `auth.config.ts` was not touched, per the brief.
3. **Partial save.** If SecureStore fails on the third write (user), the token stays in SecureStore until the next cold start wipes it. The user is not signed in meanwhile. Low risk.

---

## 8. Files changed (uncommitted, for Ronit's review)

| File | Change |
|---|---|
| `src/screens/auth/signInAttempt.ts` | **New.** The sign-in sequence and the message table moved out of `LoginScreen.tsx` unchanged, plus the stale-banner rule |
| `src/screens/auth/LoginScreen.tsx` | Uses the above; clears an old banner on return after ≥ 5 min away |
| `package.json` | `"test"` script only; no dependency added |
| `tests/…` | The test file, the loader and the two stubs (§1.1) |
| `docs/web-system/11-SSO-VERIFY.md` | This report |
