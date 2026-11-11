# Android → iOS delta (iOS-5b, iOS-5c, iOS-5d, iOS-5e, iOS-5f, iOS-5g, iOS-5h)

> Written 2026-10-30 on `ios-dev`. It lists every Android change since the first port source, `c84d53a`, on Android `dev` and on every unmerged Android branch, and what iOS did with each.
> **Port source since iOS-5h: `origin/dev` @ `6b5e46c74d9eb16229d83049e8f1505b19fe12ed`** (§11). To sync later Android work, diff `6b5e46c..origin/dev`. Android's opening of the email sign-in to PROD (`6b5e46c`) was on the iOS-9 list (§5, item 7) and is done in iOS-9b (2026-11-11).
> iOS-5f's and iOS-5g's port source was `d8626bc4180c8fd5b1f4814c9a0aabfe091d89a7` (§10); G9 (email sign-in) from `d8626bc` came across in iOS-5g, UAT builds only, to the one confirmed path (§10.8).
> iOS-5e's port source was `8b522e3bf063b26a808efee9d65776c3c6bbef3c` (§9). iOS-5d's port source was `f4fad10a1bd1aac9658f4c4be151b0172f683898` (§8). iOS-5c's port source was `c5c63acff8d7296244876020069884364864a99b` (§7). iOS-5b's was `4063df30421407e040a7dccc9399bb38557dd702` (§1–§6).
> The builds are in `00-PORT-MANIFEST.md` §4.15–§4.21. The parity proof and figures are in `WEB-VS-MOBILE-ROLES.md` §iOS-A.5; the tests and the mutation check in `ROLE-MATRIX.md` §iOS-A.6 and §7.

## 1. The rule (Ronit, 2026-10-30)

One rule answers decisions 1–5: **iOS = Android `dev` exactly (`4063df3`).**
- **Port** everything on Android `dev` that iOS lacks: D1, D2, D3 and D10 below.
- **Don't port** unmerged-branch work (SLA alerts, SDP parity round 1, the code-review fixes, the combined branch). Android `dev` doesn't have it. Each is recorded below as "not in Android dev — not ported".
- **Android release items** (D4–D9) go on the **iOS-9 list** (§5), not built now.

**Decision 6** wasn't covered by the rule, so it was asked, and Ronit answered on 2026-10-30. When a shared doc has a section number on both sides, **Android's number wins**, and Android's text lands verbatim. The iOS-only section takes a letter Android never uses (**§iOS-A**, §iOS-B…), so no later sync can clash:
- ROLE-MATRIX: the iOS-5 audit, §16 → §iOS-A;
- UI-STANDARDS: the iOS-4 standard, §9 → §iOS-A;
- WEB-VS-MOBILE-ROLES: the iOS parity summary, §9 → §iOS-A.

| # | Decision | Answer |
|---|---|---|
| 1 | Knowledge base and Announcements ADMIN only on iOS (D1, D2)? | **Yes**, by the rule. Ported in iOS-5b |
| 2 | Delete the developer-token screen and the placeholder guards (D4, D5)? | **iOS-9 list** (release item). The screen is never in a TestFlight or release bundle (`verify-release-bundle`), so the TestFlight build is the same either way |
| 3 | The PROD API URL (D6)? | **iOS-9 list.** It stays empty until Ronit's written sign-off (CLAUDE.md I3). TestFlight is `preview`, which talks to UAT |
| 4 | Version 1.0.0 (D7)? | **iOS-9 list.** The first TestFlight build stays `0.1.0` (build 1) unless Ronit moves it earlier |
| 5 | Unmerged branch work (R1–R5, S1–S6, P1–P4)? | **Not ported**: not in Android `dev` |
| 6 | Section numbers in the shared docs | **Android's numbers; iOS sections lettered** (§iOS-A). Asked and answered 2026-10-30 |

## 2. Where Android stood (2026-10-30, read only)

**The Android folder** (`..\mmg-ticketing-mobile-app`) was opened read-only for this diagnosis only, on Ronit's brief. Every git command ran with `--no-optional-locks`.
- It is on `dev` @ `4063df3`, with nothing uncommitted, untracked, stashed or unpushed. Its `dev` equals GitHub's.
- Its status, stash list, every ref, and the timestamps of `.git/index` and `FETCH_HEAD` had the same SHA-256 before and after: `e126e7ab…c413b2`.
- In iOS-5b itself it was not opened. Android was read only through git in this clone (`git show 4063df3:<path>`).

**History since `c84d53a`** (`git fetch origin` in this clone only):

| Branch | Against `dev` | Commits | Merged? |
|---|---|---|---|
| `dev` | — | `ef0cf5d` KB and Announcements ADMIN only, the Home greeting; `4063df3` the first production build (Google Play) | — |
| `main` | 30 merge commits ahead, 0 behind; **the same tree as `dev`** | PR merges only | same content as `dev` |
| `review/code-review-fixes` | 1 ahead, 15 behind | `bf22171` | **No** |
| `feature/sla-breach-alerts` | 2 ahead, 14 behind | `d86615c`, `f313a6c` | **No** |
| `feature/sdp-parity-round1` | 1 ahead, 14 behind | `b163a87` | **No** |
| `enhancement/review-sla-parity-combined` | 10 ahead, 13 behind | the three above, 3 merges, `58c484a`, `6bdd37b`, `f7c0db5` | **No** |

The four unmerged branches all start 11–13 commits **before** `c84d53a`. All 10 of their commits are laxmishankar's, dated 2026-10-22.

`ios-main` (`d5f4fb6`) holds iOS work only: Ronit's PRs #29–#40, merging `ios-dev`. Its tree is identical to `ios-dev`'s at `a24d307`.

**Drift check:** the port source, Android `dev` and `ios-dev` were compared blob by blob. The only Android files changed since `c84d53a` are those in `ef0cf5d` and `4063df3`. There is no other Android drift.

## 3. The gap table

Types: feature · bug fix · release (setup, tooling, tests) · docs · refactor · N/A.

### 3.1 On Android `dev`

| ID | Change | Where | Commit | Files | What it does for the user | In iOS before iOS-5b | Type | Effort | Notes | **Outcome** |
|---|---|---|---|---|---|---|---|---|---|---|
| D1 | Knowledge base ADMIN only | dev | `ef0cf5d` | `permissions.ts` (`canUseKnowledgeBase`, `drawerItems`, `drawerRoutes`), AppDrawer, DrawerContent, KnowledgeBaseScreen | Other roles lose the KB row, and the KB and article screens can't be reached at all | No | feature (Ronit's product decision) | M | No endpoint. iOS needed its own per-role route registration (the iOS form of `drawerRoutes`) | **Ported in iOS-5b** |
| D2 | Announcements and the Home banner ADMIN only | dev | `ef0cf5d` | `permissions.ts` (`canReadAnnouncements`, `showAnnouncementBanner`), useAnnouncements, HomeScreen, AnnouncementsScreen | Other roles get no banner, no row and no screen, and ANN-1 is never requested for them | No | feature (Ronit's product decision) | M | ANN-1 only. Pull-to-refresh must skip ANN-1 (`refetch()` runs on a disabled query) | **Ported in iOS-5b** |
| D3 | Time-of-day greeting | dev | `ef0cf5d` | `utils/greeting.ts` (new), HomeScreen | "Good morning/afternoon/evening, <first name>" by the phone's clock, re-read on focus and on return to the app | No ("Hello, …") | feature | S | No endpoint, no timer | **Ported in iOS-5b** |
| D4 | Delete the `__DEV__` developer-token screen | dev | `4063df3` | DevTokenScreen, PlaceholderScreen, AuthStack, LoginScreen, navigation types | Developer builds: Microsoft becomes the only way in. Release and TestFlight: no change (already left out) | No | release | S–M | Touches `ios-sso` tests, the release check's 12 control strings, 02-AUTH §6, CLAUDE.md rule 5, manifest §8 | **iOS-9 list** |
| D5 | Remove the placeholder-user guards | dev | `4063df3` | `session.ts` (deleted) and its uses in **7 files**: `permissions.ts` (Pick up), writeGuards, useProfile, ProfileScreen, AssignPicker, TaskEditor, ReplyComposer | No change for a real account | No | release (cleanup) | S | Only safe together with D4. The one answer that differs from Android is Pick up for the placeholder session, which no release build can hold | **iOS-9 list** |
| D6 | The PROD API URL | dev | `4063df3` | `env.ts`, `eas.json` | Android's production build talks to PROD | No (PROD empty) | release | S | Needs Ronit's written sign-off (CLAUDE.md I3). Compliance A3 | **iOS-9 list** |
| D7 | Version 1.0.0 | dev | `4063df3` | `app.json` | Store version | No (0.1.0, build 1) | release | S | `versionCode` is Android only | **iOS-9 list** |
| D8 | Release-bundle check fixes | dev | `4063df3` | `scripts/verify-release-bundle.js` | Tooling only | Partial (iOS-5 built its own equivalents; only the PROD-host allowance is missing) | release | S | Goes with D6 | **iOS-9 list** |
| D9 | Production-readiness tests (14) | dev | `4063df3` | `tests/release/production-readiness.test.mjs` | Tests only | Partial (iOS covers the guard and sign-in elsewhere) | release | S | Port the part D4, D6 and D7 make true | **iOS-9 list** |
| D10 | Docs | dev | both | ROLE-MATRIX §16, WEB-VS-MOBILE-ROLES (✂, §5a, §2), PERFORMANCE §11, UI-STANDARDS §9, UAT-TEST-PLAN E14/E17/E18, 02-AUTH §6, RELEASE.md | Docs only | No | docs | S–M | The 02-AUTH and RELEASE changes go with D4 and D6 | **Ported in iOS-5b** (except 02-AUTH and RELEASE: iOS-9, with D4 and D6) |

### 3.2 Unmerged bug fixes (`review/code-review-fixes`, also in the combined branch)

| ID | Change | Where | Commit | Files | What it does for the user | In iOS | Type | Effort | Notes | **Outcome** |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | An HTML 401 no longer signs the user out | review/code-review-fixes | `bf22171` | `api/client.ts`, `api/errors.ts`, `hooks/useBulkRunner.ts` | A gateway or captive-portal 401 page shows an error instead of ending the session | No (`client.ts:138`) | bug fix | S | It changes when a session ends (CLAUDE.md rule 7 against 02 §5.3's order) | **Not in Android dev — not ported** |
| R2 | No duplicate uploads when a failed send is retried | same | `bf22171` | writeGuards, usePostComment, useChangeStatus, ReplyComposer, StatusClosure | Files already on the ticket aren't attached again on a retry | No (`writeGuards.ts:126`) | bug fix (write safety) | M | It would be re-written for iOS's sheets. ATT-2 doesn't remove duplicates | **Not in Android dev — not ported** |
| R3 | Ticket detail shows the new status straight away | same | `bf22171` | `hooks/cache.ts` | The old status no longer lingers after "Status updated" | Partial (the helper exists; `useChangeStatus.ts:45` doesn't call it) | bug fix | S | — | **Not in Android dev — not ported** |
| R4 | Opening a file no longer blocks Pick up or status taps | same | `bf22171` | TicketDetailScreen | Separate tap guards for reading and for writing | No (`TicketDetailScreen.tsx:142`) | bug fix | S | Smaller effect on iOS (the share sheet is modal) | **Not in Android dev — not ported** |
| R5 | `isAgentOrAdmin` in 3 places; unused `REQUIRED_CLOSURE_FIELDS` removed | same | `bf22171` | comments.api, activity, useLookups, ticket-rules | None visible | No | refactor | S | — | **Not in Android dev — not ported** |

### 3.3 Unmerged features (`feature/sla-breach-alerts`, `feature/sdp-parity-round1`, and the combined branch's fixes)

| ID | Change | Where | Commit | Files | What it does for the user | In iOS | Type | Effort | Notes | **Outcome** |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | SLA reminders as local notifications | feature/sla-breach-alerts (and combined) | `d86615c`; fixes `58c484a` (type alias), `6bdd37b` (lockfile) | sla-reminders, localReminders, useSlaReminders, cache, queryKeys, prefs.store | Staff get a phone alert 30 minutes before a response or resolution deadline on their tickets | No | feature | L | TKT-1 only, which is documented. **New dependency `expo-notifications`** (I7), a native build, and possibly the push entitlement (compliance C4 and a 4.5.4 row). Response deadlines on tickets beyond the 50 fetched are missed | **Not in Android dev — not ported** |
| S2 | Tapping a reminder opens the ticket | same | `d86615c` | navigationRef | — | No | feature | S–M | Needs S1 | **Not in Android dev — not ported** |
| S3 | Home SLA card | same | `d86615c`; merge fix `4ca49f5` | HomeScreen | Allow notifications; "N due within 30 min"; the queue, soonest first | No | feature | S | Needs S1 | **Not in Android dev — not ported** |
| S4 | SLA countdown on ticket detail | same | `d86615c` | TicketDetailScreen, sla-reminders | "Resolution due in 2 h 05 min", amber inside 30 minutes | No | feature | S | Works alone | **Not in Android dev — not ported** |
| S5 | Profile on/off switch for SLA reminders | same | `d86615c` | ProfileScreen, prefs.store | One switch per phone | No | feature | S | The Keychain (rule 8), and it survives uninstall | **Not in Android dev — not ported** |
| S6 | SLA docs and tests | same | `d86615c`, `f313a6c` | SLA-REMINDERS.md, SLA-ALERTS-REVIEW.md, the test | Docs and tests only | No | docs | S | Only with S1 | **Not in Android dev — not ported** |
| P1 | Reply templates | feature/sdp-parity-round1 | `b163a87` | lookups, compose | — | **Yes**, `dev`'s G3 version (TemplatePickerSheet, `templates.ts`) | N/A (superseded) | — | Clashes with G3 | **Not ported**: iOS already has `dev`'s version |
| P2 | Local drafts for replies and new tickets | same | `b163a87` | drafts, useDraft, useDiscardGuard, 2 screens | Typed text survives the 8-hour sign-out, a crash or a call | No | feature | M | 02-AUTH §5.4 asks for drafts. On iOS: keep them out of the iCloud backup, and wipe them on sign-out | **Not in Android dev — not ported** |
| P3 | Share link to a ticket | same | `b163a87` | TicketDetailScreen | Share sheet with "Ticket #N" and a web link | No | feature | S | No endpoint | **Not in Android dev — not ported** |
| P4 | SDP gap review | same | `b163a87` | `docs/SDP-GAP-REVIEW.md` | Proposals only | No | docs | S | — | **Not in Android dev — not ported** |

**Checked and not applicable to iOS:**
- the HTML regex change (already on iOS);
- the Android sign-in redirect change (`makeRedirectUri`, `msauth://`);
- Android's CLAUDE.md;
- the CRLF test fix (iOS already has it since iOS-5; Android `dev` still lacks it);
- `versionCode 2` (Android only);
- the adaptive icons.

### 3.4 Totals (25 rows)

| By type | Count | Rows |
|---|---|---|
| Feature | 10 | D1, D2, D3, S1, S2, S3, S4, S5, P2, P3 |
| Bug fix | 4 | R1, R2, R3, R4 |
| Release (setup, tooling, tests) | 6 | D4, D5, D6, D7, D8, D9 |
| Docs | 3 | D10, S6, P4 |
| Refactor | 1 | R5 |
| N/A (superseded) | 1 | P1 |
| UAT fix | 0 | — |
| Performance | 0 | Android's PERFORMANCE §11 measured the bundle and applied nothing |

| By source | Count | Outcome |
|---|---|---|
| Android `dev` | 10 | 4 ported in iOS-5b (D1, D2, D3, D10); 6 on the iOS-9 list (D4–D9) |
| Unmerged branches | 15 | Not ported: 14 not in Android `dev`, and P1 superseded |
| Local uncommitted (Android folder) | 0 | — |

## 4. What iOS-5b built

Details are in manifest §4.15. In short:
- **D1, D2:** Android's `canUseKnowledgeBase()`, `canReadAnnouncements()`, `showAnnouncementBanner()` and the `drawerItems()` change, in `permissions.ts`.
  - `stackRoutes(tab, role)` (`navigation/routes.ts`) is the iOS form of `drawerRoutes()`. `TabStacks.tsx` registers exactly its routes, so `KnowledgeBase`, `KbArticle` and `Announcements` exist for ADMIN only.
  - Deep links resolve only ticket links; a KB or announcement URL opens in Safari. Notification taps open only a ticket or an approval.
  - ANN-1 is requested for ADMIN only, pull-to-refresh included.
- **D3:** Android's `greeting.ts` and the Home change.
- **D10:** the five shared docs, merged so that every line Android added is present (checked by script). The iOS sections were renumbered §iOS-A. `UAT-TEST-PLAN-IOS.md` gained E14.3, E17.3, E18 and D1.3a/b (217 checks).
- **Tests:** 962 → **1,035**, all passing:
  - +56: Android's `kb-announcements`, on iOS's navigation;
  - +5: iOS reachability per persona, by tab, More, deep link and notification tap;
  - +12: `greeting`;
  - 22 existing cases updated.
- **Checks** (2026-10-30):
  - `tsc` 0 errors.
  - `npm ci --dry-run` up to date.
  - `expo-doctor` 20/21 (the known `react-native-render-html` notice).
  - `expo export --platform ios`: 5.5 MB Hermes bundle.
  - `verify-release-bundle`: PASS (`preview`).
  - Parity: 0 differences over 4,168 inputs and 34 shared exports.
  - Mutations: **53 of 53 caught**.
- **Compliance:** no row changes status. A4, B2 and F1 got an iOS-5b note: the demo account and the Knowledge base screenshot need an ADMIN session, or a review note (Ronit decides at iOS-9).

## 5. The iOS-9 list (Android release items, not built)

| # | Item | From | What iOS-9 does | Needs |
|---|---|---|---|---|
| 1 | Delete the developer-token screen, `PlaceholderScreen.tsx`, the route and the Login button (D4), together with the placeholder guards and `session.ts` (D5) | `4063df3` | Port as Android did. Update `ios-sso.test.mjs`, `ios-reauth.test.mjs` (the screen is a `setSession` caller and has a test of its own since iOS-5d), the release check's dev-token control, 02-AUTH §6, CLAUDE.md rule 5 and manifest §8 | The first real Microsoft sign-in on an iPhone (iOS-7), so a simulator can still sign in until then |
| 2 | The PROD API URL in `env.ts` (D6), and the `eas.json` production comment | `4063df3` | Set it; the build guard then permits `production`. Then restore Android's chip assertion in `tests/motion/start-up-and-login.test.mjs` (a `PROD` build shows no chip; iOS-5c checks the refusal instead) | **Ronit's written sign-off** (CLAUDE.md I3); compliance A3 |
| 3 | Version 1.0.0 (D7) | `4063df3` | `app.json` `version` (the iOS `buildNumber` follows App Store Connect) | Ronit, with the App Store Connect record |
| 4 | The release check's PROD host (D8) | `4063df3` | Allow `servicedesk.mountmerugroup.com` in the `production` run only | Item 2 |
| 5 | Production-readiness tests (D9) | `4063df3`, `c5c63ac`, `f4fad10` | Port the part items 1–3 make true; leave out APK/AAB and `versionCode`. `c5c63ac` changed its "Login navigates nowhere" case for the new sign-in button; it becomes true on iOS with item 1. `f4fad10` changed its sign-in case (`setSession` with `fullAuthAt`; the profile save never passes it). iOS-5d checks the same in `ios-reauth.test.mjs`, with the developer-token screen as a third caller until item 1 | Items 1–3 |
| 6 | 02-AUTH §6 and the release guide | `4063df3` | Android's text about the deleted screen and the PROD build, in `RELEASE-IOS.md` | Items 1, 2 |
| 7 | **Match Android `6b5e46c` at iOS-9: the email sign-in on production builds** (H4, §11). Android deleted `EMAIL_SIGN_IN_ENABLED` and renders the form unconditionally; the backend team reports the endpoint on PROD, in sync with UAT (2026-11-06). **Also the App Review demo-login route** (compliance A4): whether the email sign-in, with a reviewer account on PROD, becomes App Review's demo login | `6b5e46c` | Remove the run-time gate (`src/config/env.ts`) and the build-time gate (`LoginScreen.tsx`); flip the release check's production rule (G9 modules and strings required, not forbidden); port Android's three test changes (`password-sign-in`, `start-up-and-login`, `production-readiness`); update compliance K1, K2, A4, A5 and the G9 section. Keep the one path and never `/auth/login` | **The backend team confirms the endpoint sends no `Set-Cookie`, and PROD is approved** (Ronit's written sign-off, CLAUDE.md I3; item 2). Ronit, iOS-5h (2026-11-08) |
| 8 | Android's release guide: what a production build does differently from the tested UAT build, and "production = UAT except where a difference is required", with its table of every remaining difference (H3, H8, §11) | `f67265c`, `6b5e46c` (`docs/RELEASE.md` §5b, §5c) | Write the iOS table in `RELEASE-IOS.md` when the `production` profile becomes runnable: API URL, profile and artifact, `EXPO_PUBLIC_APP_ENV`, the Login chip, the environment label, deep-link origins, and (until item 7) the email sign-in | Items 2, 7 |

**Status after iOS-9b (Ronit, 2026-11-11):**

| # | Status |
|---|---|
| 1 | **Open.** Not in the iOS-9b brief. The screen is `__DEV__` only and in no release bundle (`verify-release-bundle`: 0 of 12 strings, both profiles) |
| 2 | **Done.** PROD URL `https://servicedesk.mountmerugroup.com/api/v1`, approved by Ronit's manager on 2026-11-11 for the `production` profile only; the `eas.json` comment rewritten; Android's chip assertion restored (`start-up-and-login.test.mjs`). **iOS difference:** `env.ts` picks the URL at build time, so each bundle holds one URL; Android's holds both |
| 3 | **Done.** `app.json` `version` 1.0.0 (both profiles; runtime 1.0.0). The build number stays EAS's (`autoIncrement`, now on `production` too) |
| 4 | **Done, stricter than planned.** Each run allows its own profile's host only: `production` the PROD host, `preview` the UAT host; and each fails on the other profile's URL, in JS and Hermes |
| 5 | **Done for items 2, 3 and 7:** `tests/release/production-readiness.test.mjs` (environment, guard, profiles, submit, version, runtime, channels, ATS). Android's sign-in cases wait for item 1 |
| 6 | **Partly.** `RELEASE-IOS.md` has the production build, submit and channel rules (§4, §6 rule 11, §7). Android's text about the deleted screen waits for item 1 |
| 7 | **Done** (Ronit opened it before the `Set-Cookie` answer, which stays pending, mitigated by R1): no `EMAIL_SIGN_IN_ENABLED`, no build-time gate, the release check requires G9 in `production`; Android's three test changes ported; compliance A4, A5, G1, H5, K1 and the G9 section updated. App Review's demo login is an email-and-password review account |
| 8 | **Done.** `RELEASE-IOS.md` §7, the `preview` vs `production` table |

## 6. Not ported: not in Android `dev`

R1–R5, S1–S6, P2–P4: see §3.2 and §3.3. **If Android merges any of them into `dev`, the next sync (`8b522e3..origin/dev` since iOS-5e) brings them across.** P1 is not needed: iOS has `dev`'s reply templates.

## 7. iOS-5c: the sync to `c5c63ac` (2026-10-30 to 2026-10-31)

### 7.1 What came across

At planning (`git fetch`, 2026-10-30), `4063df3..origin/dev` was **one commit**: `c5c63ac` "feat: arc-split Login and the four-stage open-and-sign-in motion" (2026-10-30 15:44 +0530). It changed 26 files (8 added, 18 modified) and no sign-in flow file. It changed no `app.json` and added no package. Ronit OK'd the plan with its defaults. The build is in `00-PORT-MANIFEST.md` §4.16.

| ID | Change | Files | What it does for the user | In iOS before iOS-5c | Type | **Outcome** |
|---|---|---|---|---|---|---|
| L1 | Login, "arc split" | `LoginScreen.tsx`, `theme/brand.ts`, `colors.ts`, `typography.ts` (`loginType`), `BrandLogo.tsx`, `env.ts` (`SHOW_ENVIRONMENT_CHIP`) | A red card with the logo and "One portal for all your IT needs."; below it "Setu", the prompt, the sign-in pill and the footer. The environment chip is hidden on production builds | No (the Phase C card) | feature | **Ported.** One iOS difference, `__DEV__` only: the developer-token button stays until iOS-9 (§5, item 1) |
| L2 | Sign-in motion | `SignInButton.tsx`, `motion.ts` (`signIn`) | The pill collapses into a turning yellow ring, "Opening Microsoft…"; it reverses on cancel or failure | No (`SubmitButton` with "Signing in…") | feature | **Ported** verbatim |
| L3 | Start-up intro, and the drop-only launch image | `SplashIntro.tsx`, `splashSequence.ts`, `splash.ts`, `App.tsx`, `useReduceMotion.ts` (`reduceMotionSettled`), `motion.ts` (`intro`), `assets/splash-icon.png`, `assets/brand/meru-drop.png`, `scripts/make-splash-assets.py` | The drop falls into the logo, "Setu" rises over a yellow line, then it fades into the first screen. A tap skips it, and Reduce Motion removes it | No (logo-and-"Setu" launch image) | feature | **Ported** verbatim. JavaScript, plus one image that takes effect with the first build (`RELEASE-IOS.md` §6, rule 8) |
| L4 | Yellow shimmer | `Shimmer.tsx`, `motion.ts`, `colors.ts` | The loading band is brand yellow | No (white) | feature | **Ported** verbatim |
| L5 | KPI placeholder holds the count's line | `HomeScreen.tsx` | Home's tiles no longer jump when the counts arrive | No (a fixed 32 pt line, 2 pt short on iOS) | bug fix | **Ported**, with iOS's own `numberOfLines` and Title 1 cap on the placeholder |
| L6 | Docs | `PERFORMANCE.md` §12, `UI-STANDARDS.md` §10, `RELEASE.md` §7 | Docs only | No | docs | PERFORMANCE: verbatim. UI-STANDARDS: merged, §10 before §iOS-A, plus §iOS-A.12. RELEASE.md: not on iOS; its iOS-relevant splash facts are in `RELEASE-IOS.md` §6 |
| L7 | Tests | `start-up-and-login.test.mjs` (+26), `tests/support/png.mjs`, `production-readiness.test.mjs` | Tests only | No | release | `start-up-and-login`: ported, with 2 iOS changes (manifest §3.17). `production-readiness`: still iOS-9 (§5, item 5) |

### 7.2 Section numbers (the iOS-5b rule)

No clash. Android's new UI-STANDARDS §10 and PERFORMANCE §12 have no iOS counterpart. The iOS notes went into lettered sections: UI-STANDARDS §iOS-A.12 (new), §iOS-A.3 and §iOS-A.7.

### 7.3 After the plan: `f4fad10`, not in iOS-5c

On 2026-10-31 the brief's last check (`git fetch`; `origin/dev` must equal the port source) found one more commit on `dev`. It arrived after the iOS-5c plan had been OK'd: `f4fad10` "feat: 15-day forced re-authentication with prompt=login" (2026-10-30 16:59 +0530, 12 files).
- **What it does:** every 15 days the user is signed out, and the next Microsoft sign-in uses `prompt=login`. A new SecureStore key, `mmg.auth.fullAuthAt`, is written only after a challenged sign-in. Login shows "Signed out for security".
- **Why it is not in iOS-5c:** it changes the sign-in flow this brief kept untouched (`auth.api.ts`, `auth.store.ts`, `client.ts`, `signInAttempt.ts`, `RootNavigator.tsx`, `useProfile.ts`), and most of those files are iOS-adapted.
- **iOS questions for its own plan:**
  - the new Keychain key's accessibility (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, as `ios-sso.test.mjs` checks on every call);
  - whether the reinstall wipe (`installMarker.ts` → `wipeStoredSession()`) also clears it;
  - what `prompt=login` adds to iOS's private sheet, which already holds no Microsoft session (it matters on phones with Microsoft's SSO extension);
  - the merge into iOS's `02-AUTH.md` (§5.8 is free; iOS's own section is §7.7).
- **Status:** ~~pending Ronit's decision~~ **Ported in iOS-5d** (2026-11-01, §8). Ronit chose a separate phase. The four questions were answered in its brief:
  - **Keychain class:** `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, the token's. Tested on every call on the key.
  - **Reinstall:** the wipe clears it too (`installMarker.ts` → `forgetStoredFullAuth()`). A reinstall means a fresh login.
  - **`prompt=login`:** kept exactly as Android, alongside the private sheet. On a plain iPhone it adds nothing visible; it matters with Microsoft's SSO plug-in, or if D5 is reversed (02-AUTH §iOS-A).
  - **02-AUTH:** Android's §5.8 verbatim; the iOS notes in a new lettered §iOS-A.

## 8. iOS-5d: the sync to `f4fad10` (2026-11-01)

### 8.1 What came across

At planning (`git fetch`, 2026-11-01), `c5c63ac..origin/dev` was **one commit**: `f4fad10` "feat: 15-day forced re-authentication with prompt=login" (2026-10-30 16:59 +0530, 12 files: 11 modified, 1 added). It added no package and changed no `app.json`. Ronit OK'd the plan with its default for Q1. The build is in `00-PORT-MANIFEST.md` §4.17.

| ID | Change | Files | What it does for the user | In iOS before iOS-5d | Type | **Outcome** |
|---|---|---|---|---|---|---|
| F1 | 15-day forced re-authentication | `auth.store.ts`, `client.ts`, `signInAttempt.ts`, `auth.api.ts`, `RootNavigator.tsx`, `useProfile.ts` | Every 15 days the user is signed out (on a cold start, or on return to the foreground), and the next Microsoft sign-in is challenged (`prompt=login`) | No | feature (security) | **Ported.** `client.ts` and `signInAttempt.ts` verbatim. The rest merged by hand: the Keychain option on the new key's three calls; the user's sign-out option in `signOutAndWipe()` (iOS's sign-out, since iOS-6). Two iOS additions: the reinstall wipe also clears the date (`installMarker.ts`), and the `__DEV__` developer-token screen starts the 15 days (Q1) |
| F2 | "Signed out for security" on Login | `LoginScreen.tsx` | A blue information box in the message slot says why | No | feature | **Ported**, the same hunk. The `__DEV__` developer-token block is untouched |
| F3 | Tests | `reauth.test.mjs` (+47), `mobile-sso.test.mjs`, the SecureStore stub, `production-readiness.test.mjs` | Tests only | No | release | `reauth`: ported, with 2 wiring checks adapted. `mobile-sso` and the stub: merged. `production-readiness`: still iOS-9 (§5, item 5); its two `f4fad10` assertions are covered in `ios-reauth.test.mjs` |
| F4 | Docs | `02-AUTH.md` (header, §5.4, §5.5, **§5.8**, §7.1, §7.3) | Docs only | No | docs | **Merged**: every line Android added is present (checked by script). iOS notes in the new §iOS-A and two lines in §7.7 |

### 8.2 iOS decisions (Ronit's brief, 2026-11-01)

- Same behaviour as Android in every case: launch, return from the background, during a request (not checked), the message, and the sign-out side effects.
- The date sits in the Keychain with the token's class. A reinstall wipes it, so it is a fresh login.
- `prompt=login` is kept as on Android, next to the private sheet. No change to the iOS redirect, PKCE or the exchange.
- **Q1** (the only open point in the plan): the developer-token screen passes `fullAuthAt: Date.now()`. Default (a), OK'd with the plan.
- **Recorded, not changed:** the 15-day sign-out doesn't call AUTH-3, so the server token lives until its own 8 hours, as on Android.

### 8.3 Section numbers

No clash. Android's new §5.8 is free on iOS. The iOS notes are 02-AUTH's first lettered section, **§iOS-A**, at the end; §7.7 keeps its number.

## 9. iOS-5e: the sync to `8b522e3` (2026-11-03)

### 9.1 What came across

At planning (`git fetch`, 2026-11-03), `f4fad10..origin/dev` was **three commits**, 62 files:
- `87aba2c` "feat: G6 - Home period selector and KPI parity with the web portal" (2026-11-02 11:21 +0530, 21 files);
- `51f5554` "feat: G7 - period-filtered tiles, approvals for all roles, push client" (2026-11-02 12:26 +0530, 39 files);
- `8b522e3` "feat: G8 - ADMIN-only audit log screen" (2026-11-02 16:22 +0530, 28 files).

Ronit OK'd the plan with all seven defaults (§9.2). The code went in as `33dc1f6`; the build is in `00-PORT-MANIFEST.md` §4.18. There is no endpoint outside 01, and no write: DSH-1, TKT-1 and APR-1 as before, plus AUD-1 (01 §10.5).

| ID | Change | Commit | Files | What it does for the user | In iOS before iOS-5e | Type | **Outcome** |
|---|---|---|---|---|---|---|---|
| G6 | Home period and the web's KPIs | `87aba2c` | `dashboard.api`, `queryKeys`, `useHome`, `ui.store`, `colors`, `dashboard-period` (new), `home-kpis` (new), `permissions`, `ticket-filters`, `HomeScreen` | A period for Home's counts: the web's ten (Today … All time) and Custom, default This month. The web's tiles (Total tickets, Open "right now", In progress, Resolved, SLA breached) and its status chips (Closed, Unassigned, the pending reasons and On hold above 0, Active now). END_USER: Open and Resolved. L2_MANAGER: no period and no counts, as before | No (a fixed `range=month` and "last 30 days" captions) | feature | **Ported.** Data layer verbatim. iOS: a toolbar button under the solid bar opens the period sheet (`OptionSheet`); Custom's From and To open `DatePickerSheet` with Android's limits; VoiceOver announcements instead of the live region |
| G7a | A tile hands its period to the list | `51f5554` | `dashboard-period`, `home-kpis`, `ui.store`, `ticket-filters`, `HomeScreen`, `TicketListScreen` | A tile or chip that counts "created in the period" opens Tickets with that period as its Created filter, shown as a removable "<period> ✕" chip. Open, Active and the shortcuts start the list clean | No | feature | **Ported.** The chip is first in the iOS-8a toolbar's filter row |
| G7b | Approvals for every role | `51f5554` | `permissions` (`drawerItems`), `DrawerContent`, `ApprovalsInboxScreen` (comment) | Approvals is always in the menu. With nothing pending it opens "Nothing waiting for you" | Partly: ADMIN and AGENT had the tab; END_USER and L2_MANAGER had a More row only while ≥ 1 was pending | feature | **Ported**, Q1 (a): the tab for ADMIN and AGENT is unchanged; END_USER and L2_MANAGER get a permanent first More row |
| G7c | Push client (FCM) | `51f5554` | `App.tsx`, `app.json`, `package.json` and the lock file (`expo-notifications`), `src/push/*` (4), `push.store`, `utils/push`, `notifications.api` (NTF-5, NTF-6), `useProfile`, `useNotifications`, `NotificationsScreen`, `tests/push/push.test.mjs` (35), `RELEASE.md` §2b | Android asks for the notification permission on the first visit to Alerts and registers the phone for push | No | feature | **Not ported** (§9.3) |
| G8 | ADMIN-only audit log | `8b522e3` | `auditLog.api`, `useAuditLog`, `types/audit`, `utils/audit-log`, `AuditLogScreen` (all new); `responseSpecs`, `LoadingSkeleton`, `hooks/index`, `queryKeys`, `AppDrawer`, `DrawerContent`, `colors`, `theme/index`, `types/index`, `types/navigation`, `permissions` | ADMIN gets "Audit log" (AUD-1): entries by day, filtered by ticket number, entity type and person. A ticket link opens the ticket | No | feature | **Ported.** A More row in its own section before Settings. `stackRoutes()` registers `AuditLog` for ADMIN only, so no tab, More row, deep link or notification tap reaches it for any other role |
| — | Docs | all three | `G6-WEB-DASHBOARD.md`, `G7-PERIOD-APPROVALS-PUSH.md`, `G8-WEB-AUDIT.md` (new); 01, 03, 04, 05, 06; ROLE-MATRIX §17–§19; WEB-VS-MOBILE-ROLES; UI-STANDARDS §11–§13; WEB-TOKENS; UAT-TEST-PLAN; RELEASE.md | Docs only | No | docs | **Verbatim:** the three new docs, 01–06, WEB-TOKENS and UAT-TEST-PLAN; 01 also gains §iOS-A (Q6). **Merged:** ROLE-MATRIX, WEB-VS-MOBILE-ROLES and UI-STANDARDS, every line Android added present (checked by script). RELEASE.md: not on iOS |
| — | Tests | all three | `dashboard` (53), `period-list` (30), `approvals-visibility` (25), `audit-log` (48), `audit-details` (34), all new; `role-gating`, `kb-announcements`, `service-catalog`; `push` (35) | Tests only | No | release | **Ported**, all but `push` (manifest §3.19). iOS additions: `ios-period` (26), 24 in `approvals-visibility`, 10 in `audit-log` |

### 9.2 iOS decisions (Ronit's OK, 2026-11-03)

Ronit accepted every default in the plan:
- **Q1 (a):** the Approvals tab stays for ADMIN and AGENT only, the web's sidebar rule. END_USER and L2_MANAGER get Approvals as a permanent first More row, which mirrors Android's drawer row. The More tab shows the pending count while ≥ 1. Every role's tabs stay fixed (compliance E1).
- **Q2:** the period button sits in a toolbar under the navigation bar, not in the bar.
- **Q3:** From and To each open the existing `DatePickerSheet`, as Android opens its date dialog. No new sheet.
- **Q4:** AUD-1 asks for 50 entries a page, as Android does. The brief had said 20.
- **Q5:** no message for a future day. As on Android, the calendar's latest day is today.
- **Q6:** 01-API-CONTRACT gains §iOS-A: its NTF-5 and NTF-6 lines describe Android only.
- **Q7:** a one-time exception to compliance C2's "fixes only". iOS-5e's features may reach build 0.1.0 (1) by EAS Update, on `ios-preview` only, for internal TestFlight testers only, and never on `production`. The App Store build ships them natively. Recorded in `APP-STORE-COMPLIANCE.md` C2 and `RELEASE-IOS.md` §6, rule 9.

**One change outside the planned files:** an optional `onDismiss` on `PageSheet` and `OptionSheet`, so that the From calendar opens only after the period sheet has gone, with no timer.

### 9.3 Not ported, and why

| What | Why |
|---|---|
| **G7c, the push client** (`51f5554`): 7 new files, and the push parts of `App.tsx`, `app.json`, `package.json`, the lock file, `notifications.api.ts`, `useProfile.ts`, `useNotifications.ts` and `NotificationsScreen.tsx` | Out of the brief ("OUT: G7c"). It needs `expo-notifications`, a new dependency (CLAUDE.md I7). Its `app.json` plugin is a native change, so it can't reach build 1 by update. On iOS it also needs the push entitlement (`aps-environment`), an APNs key, a compliance row of its own (C4) and the Service Desk's push (ask A5). iOS keeps its Alerts notice, which is still true: there is no push. `approvals-visibility.test.mjs` fails if `expo-notifications` appears in `src/`, `App.tsx`, `package.json`, the lock file or `app.json` |
| `AppDrawer.tsx`, `DrawerContent.tsx` | No iOS files (manifest §4.5). Their G7 and G8 changes went into `routes.ts`, `TabStacks.tsx`, `MoreScreen.tsx` and `moreSections()` |
| `drawerRoutes()` | Not on iOS since iOS-5b; `stackRoutes(tab, role)` decides which routes exist |
| `docs/RELEASE.md` (§2b, Firebase) | Android's release guide; not copied to iOS (manifest §4.7) |
| 2 of the 53 `permissions.ts` exports iOS shares with Android | They differ only by the placeholder-session guard (D5): the iOS-9 list, §5 item 1. The other 51 are identical to `8b522e3` |

### 9.4 P7: not in these three commits; now pending (iOS-5f)

The brief's **P7** is Home's window captions: "this month" or "right now" under each count, and the "Active now" chip renamed "Active". The brief said to port it **only if** it was part of `87aba2c`, `51f5554` or `8b522e3`.
- **It was not.** At `8b522e3` the chip still reads "Active now" (`src/utils/home-kpis.ts:136`), and no count has a "this month" caption. The one caption there, "right now" under Open, belongs to G6, and came across with it.
- **So iOS-5e did not port P7.** This is the sync rule at work, not a decision against P7: it was not on Android `dev` at the port source.
- **It reached Android `dev` during iOS-5e**, in `e85c602` ("window captions under every count ("this month" ... / "right now" for Open and the Active chip)"). At `origin/dev` the chip reads "Active" (`home-kpis.ts:139`).
- **Status: pending, in iOS-5f** (§9.5).

### 9.5 Android `dev` after the plan: iOS-5f

Three commits reached `dev` while iOS-5e was being built. None of them is in iOS-5e.

| Commit | Date (+0530) | What | iOS |
|---|---|---|---|
| `e85c602` | 2026-11-03 10:42 | The polish pass: the people row on ticket cards, the Home greeting mark, **P7's window captions**, swipe actions on list rows, haptics, an SLA bar on ticket detail, press feedback | **Pending: iOS-5f** |
| `69a38ab` | 2026-11-03 11:28 | The SLA deadline (in place of `e85c602`'s SLA countdown), a count cross-fade, a paperclip icon, VIBRATE kept | **Pending: iOS-5f** |
| `0c0bbac` | 2026-11-03 12:24 | Android's second Play upload: `versionCode` 3, `RELEASE.md` §5a, and the production-readiness test asks for `versionCode` > 2 | **Not applicable.** `versionCode` and `RELEASE.md` are Android only. The test is already on the iOS-9 list (§5, item 5), which leaves `versionCode` out |

**A first look for the iOS-5f plan.** This is not a plan, and nothing was ported:
- `e85c602` and `69a38ab` together change 59 files (+3,091 / −249 lines).
- **Packages:** they add `expo-haptics ~57.0.3`, which iOS already has. Their `app.json` changes cancel out (VIBRATE blocked in `e85c602`, kept in `69a38ab`) and are Android only. The new SVG illustrations are drawn by `expo-image`, already installed. So no native change shows yet; the iOS-5f plan must confirm it.
- **Android-only code** for that plan to replace: haptics through `performAndroidHapticsAsync` (iOS has its own system patterns, UI-STANDARDS §iOS-A.6), and the swipe actions on list rows.
- **The C2 exception (§9.2, Q7) doesn't cover iOS-5f.** Whether iOS-5f may ship by EAS Update needs its own decision.
- **GitHub's `dev` has moved again.** `git ls-remote` shows `5b3c73a` on 2026-11-03. This clone's last fetch was at 12:28 +0530 (`0c0bbac`), and this docs-only task did not fetch. The iOS-5f plan's `git fetch` lists what came after `0c0bbac`.

### 9.6 Section numbers

No clash. Android's new UI-STANDARDS §11–§13 and ROLE-MATRIX §17–§19 were free on iOS; they sit before §iOS-A. The iOS notes are in lettered sections: UI-STANDARDS §iOS-A.14, ROLE-MATRIX §iOS-A.7 (and its §7, the mutation check), WEB-VS-MOBILE-ROLES §iOS-A.6, and 01-API-CONTRACT's first lettered section, §iOS-A.

## 10. iOS-5f: the sync to `d8626bc` (built 2026-11-06)

### 10.1 What came across

At planning (`git fetch`, 2026-11-06), `origin/dev` was `d8626bc`, the brief's port target, with nothing after it. `8b522e3..d8626bc` is **eight commits**, 102 files (+8,059 / −689):

| Commit | Date (+0530) | What | Files |
|---|---|---|---|
| `e85c602` | 2026-11-03 10:42 | The polish pass: people row, greeting mark, window captions, swipe, haptics, SLA bar, press feedback | 53 |
| `69a38ab` | 2026-11-03 11:28 | The SLA deadline (in place of the SLA bar), count cross-fade, paperclip icon, VIBRATE kept | 26 |
| `0c0bbac` | 2026-11-03 12:24 | Android's `versionCode` 3 | 3 |
| `5b3c73a` | 2026-11-03 12:33 | ShortcutBadger's launcher-badge permissions blocked | 3 |
| `be33e7e` | 2026-11-05 09:01 | G9: the footer's copyright year; password-login findings, ask A32 | 10 |
| `0f75e51` | 2026-11-05 09:51 | G9 re-read of the web clone, A32 narrowed (docs) | 2 |
| `999943e` | 2026-11-05 10:34 | G9: email and password sign-in on UAT builds, against an ASSUMED contract | 22 |
| `d8626bc` | 2026-11-05 14:17 | The visible email Sign in button; push config, audit and dashboard contracts; card dates | 41 |

**Packages and `app.json`.** Android adds `expo-haptics` (`package.json`, the lock file), which iOS has had since iOS-4. Android's `app.json` and `app.config.js` changes are Android only: VIBRATE, ShortcutBadger, `versionCode`, `google-services.json`. On iOS, `package.json`, `package-lock.json` and `app.json` stay unchanged (checked at STEP 8). The four SVGs in `assets/illustrations/` are drawn by `expo-image`, already installed.

### 10.2 The gap table

> The IDs follow the commits: A = `e85c602`, B = `69a38ab`, C = `0c0bbac` and `5b3c73a`, D = the three G9 commits, E = `d8626bc`. They were written up from the commits for this section; the brief's references (A3, A4, A5, A6, B3, B4, C1, C2, D2, E1, E2, E3, E5) map onto them.

| ID | Change | Commit | What it does for the user | iOS | Step |
|---|---|---|---|---|---|
| A1 | People row on ticket cards (requester → technician, dashed "Unassigned"), list skeleton to match | `e85c602` | Who raised it and who has it, at a glance | **Port** | 4, 5, 6 |
| A2 | Greeting mark: a drawn SVG per time-of-day band, one rise and fade | `e85c602` | A small sun, cloud-sun or moon by the Home greeting | **Port**. iOS: plays once, skipped under Reduce Motion and VoiceOver | 4, 5, 6 |
| A3 | Window captions under every count; "Active now" → "Active" | `e85c602` | "this month" … or "right now" under each Home count (P7, §9.4) | **Port** | 4, 6 |
| A4 | Swipe left on list rows: Assign, Resolve (`ticketSwipeActions`) | `e85c602` | Quick actions from the list, from the tap rules; none for END_USER | **Port**, plus VoiceOver custom actions "Assign" and "Resolve" under the same rules (decision 3, an iOS-only accessibility addition) | 2, 6 |
| A5 | Haptics through `performAndroidHapticsAsync`; VIBRATE blocked | `e85c602` | Android's system haptics | **Not ported** (Android native). iOS has its own haptics since iOS-4 (UI-STANDARDS §iOS-A.6). STEP 6 checks that every event Android buzzes on has an iOS-4 haptic | 6 (check) |
| A6 | SLA countdown bar on ticket detail | `e85c602` | A bar to the resolve deadline | **Not ported**: Android replaced it with B1 within the hour; none of it is left at `d8626bc` | — |
| A7 | Press feedback (0.97 dip and tint, native driver) on every tappable card or row | `e85c602` | Taps feel answered | **Port**. iOS: honours Reduce Motion | 5, 6 |
| B1 | SLA deadline on ticket detail ("Due Mon 11:00"), `slaDeadline` | `69a38ab` | The deadline instead of a misleading wall-clock countdown (06 A31) | **Port** | 4, 5, 6 |
| B2 | Count cross-fade on Home | `69a38ab` | A changed count fades rather than jumps | **Port** | 5, 6 |
| B3 | Paperclip icon for `cid:` images, no emoji (`<cid-image>`) | `69a38ab` | "Image in attachments" with a flat icon | **Port** | 3, 5 |
| B4 | VIBRATE kept in `app.json` | `69a38ab` | — | **Not ported** (Android permission) | — |
| C1 | `versionCode` 3, `RELEASE.md` §5a | `0c0bbac` | — | **Not ported** (Android only) | — |
| C2 | ShortcutBadger permissions blocked | `5b3c73a` | — | **Not ported** (Android only; iOS has no `expo-notifications`) | — |
| D1 | Footer copyright year from the device clock | `be33e7e` | The footer's year stays current | **Port** | 4, 6 |
| D2 | G9 email and password sign-in, UAT builds only | `999943e` | A second way in, on UAT | **Port, changed:** one call to the confirmed path only (decision 1). **Built in iOS-5g** (§10.8) | iOS-5g |
| D3 | G9 findings, A32, the re-read (docs) | `be33e7e`, `0f75e51` | Docs only | **Docs** (STEP 1: G9-PASSWORD-LOGIN, 06) | 1 |
| E1 | The email Sign in button visible (no function `style`), kept above the keyboard | `d8626bc` | The button could not be seen on UAT | **Port** with D2: **built in iOS-5g** (§10.8) | iOS-5g |
| E2 | Push: `google-services.json` through `app.config.js`; NTF-6 sends `{ token, platform }` | `d8626bc` | Android push on UAT builds | **Not ported** (push stays out, decision 4) | — |
| E3 | Audit log: `/audit-logs` then `/audit-log`; `action`, `dateFrom`, `dateTo`, `ticketNumber`; "No ticket #n" | `d8626bc` | ADMIN filters the log by action and date; gap 12 closed | **Port** | 1, 3, 6 |
| E4 | Ticket cards: "#n · Raised 2 Nov · updated 2d ago", and the due line (`slaDueLine`) in place of the SLA chip | `d8626bc` | Raised and due dates on each card | **Port** | 4, 5, 6 |
| E5 | Dashboard: stays on `/dashboard/all`; its params match the written contract | `d8626bc` | None | **Docs only** (01 §8) | 1 |

**Portable: 13** (A1, A2, A3, A4, A7, B1, B2, B3, D1, D3, E3, E4, E5), **all 13 built in iOS-5f**, **plus G9** (D2 with E1), built in iOS-5g (§10.8). **Not ported: 7** (A5, A6, B4, C1, C2, E2, and G7c's push client, as in iOS-5e).

### 10.3 Ronit's decisions (iOS-5f brief, 2026-11-06)

1. **G9 email and password sign-in was planned for this phase** (STEP 7), using **only the path the backend team confirmed**. **Moved to its own phase, iOS-5g** (§10.7). Android's fallback chain (`/auth/mobile/login` → `/auth/login/mobile` → `/auth/mobile` → `/auth/login`) is **not ported**. **iOS must never call `POST /auth/login`.**
   - **⏳ The confirmed contract was still a placeholder** in the brief (`<CONFIRMED_PATH>`, `<CONFIRMED_BODY>`, `<CONFIRMED_RESPONSE>`). STEP 7 stopped for it. Recorded as pending in `01-API-CONTRACT.md` §iOS-A and `docs/G9-PASSWORD-LOGIN.md` §iOS-A.
2. **iOS-5f ships in a new TestFlight build, not by EAS Update**: **0.2.0 (2)** since STEP 8 (Ronit: a new version, so a new runtime) (`RELEASE-IOS.md` §6, rule 10; `UPDATES-LOG.md`).
3. **Swipe (A4):** VoiceOver custom actions "Assign" and "Resolve", under exactly the swipe's rules. An iOS-only accessibility addition.
4. **Push (E2, G7c) stays out.**
- **Not ported** (Android native only): A5 (with a check that every Android haptic event has an iOS-4 haptic), A6, B4, C1, C2, E2. **E5 is docs only.**
- **Kept:** the 17 🔒 SAFER divergences (manifest, WEB-VS-MOBILE-ROLES) and every iOS-only interface difference recorded in §1–§9 above: tabs and More, sheets, iOS-8a's header and toolbar layout and `listBottomInset`, the developer-token screen in `__DEV__` only, iOS-4's haptics.

### 10.4 Docs in STEP 1

- **Verbatim from `d8626bc`:** `03-DATA-MODEL.md`, `05-RULES-AND-GAPS.md`, `06-BACKEND-ASKS.md`, `PERFORMANCE.md` (§13, §14), `docs/G9-PASSWORD-LOGIN.md` (new). 05, 06 and G9-PASSWORD-LOGIN each gain an **§iOS-A** at the end: push is not on iOS, and iOS uses only the confirmed G9 path.
- **Merged** (three-way; every line Android added is present, checked by script): `01-API-CONTRACT.md` (its §iOS-A rewritten for iOS-5f), `UI-STANDARDS.md` (§14–§16 before §iOS-A), `WEB-VS-MOBILE-ROLES.md` (gap 12 closed; the audit-filter row's iOS cell says "being built" until STEP 8).
- **Left for G9 (iOS-5g):** `02-AUTH.md`. All of Android's changes to it are G9 (§8, Android's assumed contract); they land with the iOS sign-in and its own §iOS-A note.
- **Not on iOS:** `docs/RELEASE.md` (Android's release guide, manifest §4.7).
- **New:** `docs/ios/UPDATES-LOG.md`. `RELEASE-IOS.md` §6: `$env:EXPO_PUBLIC_APP_ENV="UAT"` before every update (rule 4), and rule 10 (iOS-5f by build only; builds 1 and 2 share runtime 0.1.0).

### 10.5 Section numbers

No clash. Android's new UI-STANDARDS §14–§16 and PERFORMANCE §13–§14 were free on iOS; they sit before §iOS-A. 05, 06 and G9-PASSWORD-LOGIN get their first lettered section, §iOS-A. 01's §iOS-A keeps its letter.

### 10.6 Results (STEP 8, 2026-11-06)

**Built:** all 13 portable changes (§10.2), in six commits: `0d2b623` docs, `8d87945` permissions, `9d2e820` audit data and the cid placeholder, `2467174` functions and theme, `82c6c12` components, `18a795e` screens. G9 (D2, E1) moved to iOS-5g (§10.7). Details by file: `00-PORT-MANIFEST.md` §3.20 and §4.19.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm test` | **1,391 → 1,589**, all passing (190 → 228 suites) |
| Mutation check, the new rules (swipe and audit) | **30 of 30 caught**, each applied alone against the full suite and restored; `src/` and `tests/` byte-identical afterwards (SHA-1). Swipe 15: the rule (8), the VoiceOver actions (3), the row and the list (4). Audit 15: the path and its fallback, the params, `isNoSuchGetRoute`, `contentType`, the dates, the unknown ticket number, the calendar. The G9 gate: iOS-5g. Earlier in the phase: 11 of 11 (components), 3 of 3 (press feedback); two equivalent mutations dropped |
| `npm ci --dry-run` | up to date |
| `npx expo-doctor` | 19/21. The known `react-native-render-html` notice, and **new: five Expo SDK 57 patch releases** since the lock file (`expo` 57.0.31 → 57.0.32, `expo-image-picker`, `expo-sharing`, `expo-splash-screen`, `expo-updates`). Not changed: no package change in this phase, and Android `dev` is on the same versions. Recorded for the next build phase |
| `npx expo export --platform ios` | one Hermes bundle, **5,588,572 bytes** (iOS-5e: 5,548,120; +40,452, +0.73 %), written to the session scratch folder and deleted |
| `npm run verify:release-bundle` | **PASS (preview)** and **PASS (`--profile production`)**: 2,317 modules, 207 of them app code (iOS-5e: 2,305 and 195). Developer-token strings 0 of 12, control 12 of 12. No Android-only API reached. No email sign-in in either (G9 not built) |
| `package.json`, `package-lock.json` | unchanged since `6897b70` |
| `app.json` | one change: `version` 0.1.0 → **0.2.0** (Ronit, STEP 8), so build 2's runtime is 0.2.0 (`RELEASE-IOS.md` §6, rule 10) |
| `git log d8626bc..origin/dev` | empty (fetched 2026-11-06) |
| Verbatim | 19 files byte-identical to `d8626bc` (4 SVGs, 2 docs, 13 source files) |

**Not run:** a device check. UAT G19.1–G19.17 (`UAT-TEST-PLAN-IOS.md`).

### 10.7 G9: pending, its own phase (iOS-5g)

> **Built in iOS-5g, 2026-11-06 (§10.8).** The path is confirmed; `Set-Cookie` is still open. Kept below as written on 2026-11-06.

**Ronit, 2026-11-06:** STEP 7 was skipped. G9 (D2 with E1, Android `999943e` and `d8626bc`) becomes its own phase, **iOS-5g**, once the backend team confirms the contract. Nothing of it is in iOS-5f or in build 0.2.0 (2). Decision 1 stands for iOS-5g: one call to the confirmed path, never `POST /auth/login`, UAT builds only.
- **Waiting on:** the contract in writing: path and method, request body, the 200 field by field (`user.countryId`; `name` or `displayName`), every error with its body and message, **whether it sets a cookie**, its rate limit, which accounts may use it (06 A32, §iOS-A).
- **Docs already in place (STEP 1):** `docs/G9-PASSWORD-LOGIN.md` §iOS-A, 01 §iOS-A, 06 §iOS-A. `02-AUTH.md`'s G9 changes land with iOS-5g.

**The cookie proof (the brief's item c): half proven.**
- **Proven from source** (React Native 0.86.3, axios): `src/api/client.ts:37` `withCredentials: false` → `node_modules/axios/lib/adapters/xhr.js:212-213` → `node_modules/react-native/Libraries/Network/XMLHttpRequest.js:642` and `RCTNetworking.ios.js:54` → `RCTNetworking.mm:319` `request.HTTPShouldHandleCookies = NO`. With NO, React Native never adds the shared jar's cookies (`RCTNetworking.mm:321-325`). Auth is Bearer only.
- **Not provable from React Native's source:** that a `Set-Cookie` on the answer is never **stored**. React Native's session accepts and stores cookies (`RCTHTTPRequestHandler.mm:98-100`); skipping them for a request with the flag off is iOS's behaviour (Apple: "whether cookies will be sent with and set for this request"). It is settled only if the confirmed endpoint sends **no `Set-Cookie`**, which 06 A32 asks for.
- **A React Native finding, existing, recorded and not changed:** on any HTTP redirect, `RCTHTTPRequestHandler.mm:149-159` (`willPerformHTTPRedirection`) sets the redirected request's headers to the shared jar's cookies, whatever `withCredentials` says, which also **drops `Authorization`**. It applies to every API call today. No `/api/v1` call is expected to redirect; UAT G19.16 checks it on the device. Recorded in `APP-STORE-COMPLIANCE.md` (G9 section).

### 10.8 iOS-5g: G9 email and password sign-in (built 2026-11-06, UAT builds only)

**The contract (the backend team, through Ronit, 2026-11-06):** `POST /api/v1/auth/mobile/login`, **confirmed** live on UAT. It is the only sign-in path iOS calls. **`Set-Cookie`: not yet confirmed.** Ronit is asking. **That open item blocks shipping the email sign-in to testers.**

**Ronit's decisions (iOS-5g):**
1. **1a, the request:** Android's body for this path, `{ username, email, password }`. The brief said `{ email, password }` "as Android sends to this path"; Android sends both names.
2. **2a, the 200:** Android's tolerant reader, `AUTH_P1_READER`: the token, `user`, `user.id` and `user.role` required; `name` or `displayName`; extras never fail. The brief listed `user.email` and `expiresAt` as required too; Android's reader treats both as optional.
3. **A build-time gate** on top of Android's run-time `EMAIL_SIGN_IN_ENABLED`: accepted. A `production` bundle holds none of the G9 code.
4. **`Set-Cookie`:** logged (never its value) in every UAT build, with Android's `__DEV__` warning: accepted.
5. **One build:** G9 ships in the same TestFlight build as iOS-5f, **0.2.0 (2)**, once the backend team confirms no `Set-Cookie` (`RELEASE-IOS.md` §6, rule 10).

**Behaviour = Android `d8626bc` for that one path.** The same reasons, words, Ref line, AUTH-2 `countryId` rule, session, 15-day clock (`fullAuthAt` on every password sign-in) and single flight with Microsoft. **Not ported:** the other three paths, the fallback after an HTML 404, the remembered path, and `/auth/login` (decision 1, §10.3). The interface is iOS's (`02-AUTH.md` §iOS-B; `UI-STANDARDS.md` §iOS-A.16).

| File | Class | iOS change |
|---|---|---|
| `src/types/mobile-password-contract.ts` | ADAPT | One path, `MOBILE_PASSWORD_PATH` (Android: `MOBILE_PASSWORD_PATHS`, four). Android's request and response types. Not re-exported from `src/types/index.ts` |
| `src/api/auth.api.ts` | ADAPT | Android's reader refactor (`readSession()`, `readUser()`, per-endpoint readers; `AUTH_P2_READER` holds AUTH-P2's old names). The password half moved out, so the build-time gate can drop it |
| `src/api/passwordSignIn.api.ts` | **new** (Android's code, moved) | One `POST`, `skipAuth`. No path list, no remembered path. A `Set-Cookie` line in every UAT build. `AUTH_P1_READER`, `AUTH_2_READER`, `confirmFromAuthMe()` and `endUnusedSession()`: Android's |
| `src/screens/auth/passwordSignInAttempt.ts` | **new** (Android's code, moved) | `attemptPasswordSignIn()`, `checkEmailSignIn()`, the copy and the Ref line: Android's |
| `src/screens/auth/signInAttempt.ts` | KEEP | A header note only (the password half is in `passwordSignInAttempt.ts`) |
| `src/screens/auth/EmailSignInForm.tsx` | ADAPT | VoiceOver announcements in place of live regions; the toggle's `accessibilityLabel`; `textContentType` `username`; `minHeight` for Dynamic Type; the password also cleared in the submit's `finally` |
| `src/screens/auth/emailFormLayout.ts` | ADAPT | `minHeight` in place of a fixed height (Dynamic Type). The keyboard scroll maths: Android's |
| `src/screens/auth/LoginScreen.tsx` | ADAPT | Android's `d8626bc` file (E1: `KeyboardAvoidingView`, measure and scroll, `emailBusy`, the shared single flight), with iOS's `__DEV__` developer-token button, `accessibilityElementsHidden` on the Microsoft pill while email runs, and the build-time gate |
| `src/config/env.ts` | ADAPT | `EMAIL_SIGN_IN_ENABLED = APP_ENV === 'UAT'` (Android's line; iOS's `APP_ENV` is UAT unless PROD) |
| `src/theme/brand.ts`, `typography.ts`, `motion.ts` | KEEP | Android's G9 tokens (`emailForm`, `loginType`, `emailReveal`), verbatim |
| `scripts/verify-release-bundle.js` | ADAPT | `/auth/login` forbidden in every bundle. The four G9 modules and seven strings: none in `production`, all in `preview`. An email domain after `@` is not a host |
| `tests/auth/password-sign-in.test.mjs` | ADAPT | Android's, with "one path" in place of "path discovery" (103 tests) |
| `tests/auth/ios-password-sign-in.test.mjs` | **new** | iOS only (27): one path and every auth path in `src/`, the two gates, the Keychain, the password, the keyboard, VoiceOver, Dynamic Type |
| `tests/login/sign-in-button.test.mjs` | ADAPT | E1's test, for `minHeight` (14) |
| `tests/support/nativewind.mjs`, `tests/support/stubs/react-native.cjs` | KEEP | Verbatim |
| `tests/motion/start-up-and-login`, `tests/screens/hig-polish`, `tests/screens/read-screens`, `tests/auth/ios-reauth` | ADAPT | The form counted where Login's files are counted |

**Results (2026-11-06)**

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm test` | **1,589 → 1,735**, all passing (228 → 247 suites) |
| Mutation check | **14 of 14 caught**, each applied alone against the full suite and restored; the six files SHA-1 identical afterwards. **The gate (7):** the build-time gate removed; spelt so an unset build loses it; the run-time gate dropped; the form imported statically as well; `EMAIL_SIGN_IN_ENABLED` on in every build; the contract re-exported from the types barrel; the release check no longer failing production. **The path (7):** `/auth/login` instead; another guessed path; a fallback to `/auth/login` after an HTML 404; the request sent twice; the release check no longer forbidding `/auth/login`; no `skipAuth`; the body without `username` |
| `npm run verify:release-bundle` | **PASS (preview):** 2,322 modules, 212 app code; G9 4 of 4 modules, 7 of 7 strings (JS and Hermes); `/auth/login` 0. **PASS (`--profile production`):** 2,318 modules, 208 app code; G9 **0 of 4 modules, 0 of 7 strings**; `/auth/login` 0. Production's one new module is `emailFormLayout.ts`, Login's keyboard scroll maths (Android's E1): no G9 string, call or form. Developer-token strings 0 of 12 in both, control 12 of 12 |
| `npx expo export --platform ios` | one Hermes bundle, **5,625,890 bytes** (iOS-5f: 5,588,572; +37,318, +0.67 %), a UAT bundle (`EXPO_PUBLIC_APP_ENV` unset), so with G9. Written to the session scratch folder and deleted |
| `npx expo-doctor` | 19/21, as in iOS-5f: the known `react-native-render-html` notice, and the same five Expo SDK 57 patch releases (§10.6). No package change in this phase |
| `npm ci --dry-run` | up to date |
| `package.json`, `package-lock.json` | unchanged. `app.json`: `version` still **0.2.0** |
| `git log d8626bc..origin/dev` | empty |

**Not run:** a device check: UAT G20 (`UAT-TEST-PLAN-IOS.md`). No call to UAT was made; the tests mock the network.

## 11. iOS-5h: the sync to `6b5e46c` (2026-11-08)

### 11.1 What came across

At planning (`git fetch origin --prune` in this clone, 2026-11-08), `d8626bc..origin/dev` was **two commits**, both 2026-11-06:
- `f67265c` "chore: prepare versionCode 4 production build" (4 files);
- `6b5e46c` "feat: open email sign-in to production; versionCode 5; production matches UAT except required differences" (14 files).

Together they changed 15 files and added or deleted none (293 files, as at `d8626bc`). `origin/main` took both through PRs #70 and #71 (2026-11-08 07:02 +0530); it has merge commits only, and its tree equals `dev`'s. No new branch. The four unmerged branches (2026-10-22) are unchanged, with no commit after 2026-11-05: not ported (§6).

**The Android folder** was opened read-only for the diagnosis only, on Ronit's brief, every git command with `--no-optional-locks`. It is on `dev` @ `6b5e46c`, equal to its own `origin/dev`, with nothing uncommitted, untracked, stashed or unpushed and no lock file. Its branch, HEAD, status, stash list, every ref, and the size and time of `.git/index`, `FETCH_HEAD` and `logs/HEAD` were identical before and after (32 lines compared). In iOS-5h itself it was not opened; Android was read only through git in this clone.

### 11.2 The items

| ID | Change | Commit | What it does for the user | iOS | **Outcome** |
|---|---|---|---|---|---|
| H1 | `versionCode` 3 → 4 | `f67265c` | — | Android only | **Not ported** |
| H2 | Release check: the email form's example address set aside **only** as that exact, whole address before the host search (`EXAMPLE_EMAILS`, `wholeAddress()`) | `f67265c` | Tooling only | Partial: iOS-5g skipped any domain after "@", which also hid `https://user@host` and any other address at the domain | **Ported** (Android's code, with the iOS file names in the description). Proven by a plant (§11.5) |
| H3 | `RELEASE.md` §5b: what the production build does differently from the tested UAT build | `f67265c` | Docs | Not on iOS (manifest §4.7) | **iOS-9 list** (§5, item 8) |
| H4 | **The email sign-in on production builds:** `EMAIL_SIGN_IN_ENABLED` deleted, the form rendered unconditionally | `6b5e46c` | On Android PROD, anyone with a local password can sign in with email, and the Play reviewer can get in. The same for every role (sign-in comes before the role) | Partial: UAT builds only, two gates | **iOS-9 list** (§5, item 7; Ronit, §11.3). No code change |
| H5 | Push on production: the Firebase file in the production EAS environment (`app.config.js`, a comment only) | `6b5e46c` | Android PROD gets push | No: push is out (§10.3, decision 4) | **Not ported** (Android native; iOS would need `expo-notifications` and APNs, a native build) |
| H6 | `versionCode` 4 → 5 | `6b5e46c` | — | Android only | **Not ported** |
| H7 | Shared docs: **the backend team reports the email endpoint deployed on PROD as well as UAT, in sync** (2026-11-06); 01 AUTH-P1, 02-AUTH §8, 06 A32, `G9-PASSWORD-LOGIN.md`, UI-STANDARDS §15.2 | `6b5e46c` | Docs | No | **Merged** verbatim, with iOS notes (§11.4) |
| H8 | `RELEASE.md` §5c: "production = UAT except where a difference is required", with the table of every remaining difference | `6b5e46c` | Docs | No | **iOS-9 list** (§5, item 8) |

**Flags.** H4 and H7 touch G9. Android's docs at `6b5e46c` still list "no `Set-Cookie`" as unconfirmed (02-AUTH §8 item 4) and A32 is still open: the PROD confirmation does not answer iOS's open item. Android's production builds now also carry its fourth path, `POST /auth/login`, tried after an HTML 404 on the first three; iOS never calls it (§10.3). Reported, not for iOS to change.

### 11.3 Ronit's decision (2026-11-08)

1. **H4: option (a), defer.** Recorded on the iOS-9 list as "match Android `6b5e46c` at iOS-9, after the backend confirms no `Set-Cookie` and PROD is approved; also the App Review demo-login route (A4)" (§5, item 7). iOS keeps both gates. Every runnable iOS build is UAT (the PROD URL is empty, CLAUDE.md I3), so no iOS user sees a difference either way.
2. **The rest as proposed:** H2 ported, H7 merged, H3 and H8 on the iOS-9 list; H1, H5, H6 not ported.

### 11.4 Docs

- **Merged three-way** (base `d8626bc`, ours `ios-dev`, theirs `6b5e46c`): `01-API-CONTRACT.md`, `02-AUTH.md`, `06-BACKEND-ASKS.md`, `docs/G9-PASSWORD-LOGIN.md`, `docs/brand/UI-STANDARDS.md`. All 13 lines Android added are present verbatim, and the 12 it replaced are gone (checked by script).
- **One conflict:** 02-AUTH's header bullet on G9. Android's line verbatim, with the iOS sub-bullet kept under it and updated (UAT only; Android's PROD opening on the iOS-9 list).
- **iOS notes** in the lettered sections: 01 §iOS-A, 02 §8's iOS line and §iOS-B (the gate row's Android column, "Not on production"), 06 §iOS-A, `G9-PASSWORD-LOGIN.md` §iOS-A (and its contract row), UI-STANDARDS §iOS-A.16.
- **Section numbers:** no clash; no new lettered section.
- **Not on iOS:** `docs/RELEASE.md` (H3, H8: §5, item 8).
- **Compliance:** A4 (the demo-login line), K1 (the host rule, with the proof below) and the G9 section (`APP-STORE-COMPLIANCE.md`).

### 11.5 Results (2026-11-08)

| Check | Result |
|---|---|
| H2, proven to fail | With `https://x@servicedesk.mountmerugroup.com/api/v1` and `it@mountmerugroup.com` planted in `src/config/env.ts`: the iOS-5g check **PASS** (the gap: hosts reported, only `uat-servicedesk`); the iOS-5h check **FAIL**, "release JS names hosts that are not allowed: servicedesk.mountmerugroup.com, mountmerugroup.com". Plant removed; `src/` identical to `c3e9eee` |
| `npm run verify:release-bundle` | **PASS (preview):** 2,322 modules, 212 app code; hosts only `uat-servicedesk.mountmerugroup.com`; the example set aside 2×; G9 4 of 4 modules, 7 of 7 strings; `/auth/login` 0. **PASS (`--profile production`):** 2,318 modules, 208 app code; G9 0 of 4 modules, 0 of 7 strings; the example 0×; `/auth/login` 0. Developer-token strings 0 of 12 in both, control 12 of 12 |
| `npx tsc --noEmit` | 0 errors |
| `npm test` | **1,735**, all passing (247 suites), as in iOS-5g: no test changed |
| `app.json`, `package.json`, `package-lock.json` | unchanged (`version` 0.2.0) |
| `src/`, `tests/` | unchanged |
| `git log 6b5e46c..origin/dev` | empty (fetched 2026-11-08) |

**Build 0.2.0 (2):** iOS-5h changes no app code, so it joins that build as it is. The build still waits for the backend team's `Set-Cookie` answer (`RELEASE-IOS.md` §6, rule 10).
