# Android → iOS delta (iOS-5b, iOS-5c, iOS-5d, iOS-5e)

> Written 2026-10-30 on `ios-dev`. It lists every Android change since the first port source, `c84d53a`, on Android `dev` and on every unmerged Android branch, and what iOS did with each.
> **Port source since iOS-5e: `origin/dev` @ `8b522e3bf063b26a808efee9d65776c3c6bbef3c`** (§9). To sync later Android work, diff `8b522e3..origin/dev`: in this clone on 2026-11-03 that is `e85c602`, `69a38ab` and `0c0bbac` (§9.5).
> iOS-5d's port source was `f4fad10a1bd1aac9658f4c4be151b0172f683898` (§8). iOS-5c's port source was `c5c63acff8d7296244876020069884364864a99b` (§7). iOS-5b's was `4063df30421407e040a7dccc9399bb38557dd702` (§1–§6).
> The builds are in `00-PORT-MANIFEST.md` §4.15–§4.18. The parity proof and figures are in `WEB-VS-MOBILE-ROLES.md` §iOS-A.5; the tests and the mutation check in `ROLE-MATRIX.md` §iOS-A.6 and §7.

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
