# Android → iOS delta (iOS-5b)

> Written 2026-10-30 on `ios-dev`. It lists every Android change since the first port source, `c84d53a`, on Android `dev` and on every unmerged Android branch, and what iOS did with each.
> **New port source: `origin/dev` @ `4063df30421407e040a7dccc9399bb38557dd702`.** To sync later Android work, diff `4063df3..origin/dev`.
> The build is in `00-PORT-MANIFEST.md` §4.15. The parity proof and figures are in `WEB-VS-MOBILE-ROLES.md` §iOS-A.5; the tests and the mutation check in `ROLE-MATRIX.md` §iOS-A.6 and §7.

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
| 1 | Delete the developer-token screen, `PlaceholderScreen.tsx`, the route and the Login button (D4), together with the placeholder guards and `session.ts` (D5) | `4063df3` | Port as Android did. Update `ios-sso.test.mjs`, the release check's dev-token control, 02-AUTH §6, CLAUDE.md rule 5 and manifest §8 | The first real Microsoft sign-in on an iPhone (iOS-7), so a simulator can still sign in until then |
| 2 | The PROD API URL in `env.ts` (D6), and the `eas.json` production comment | `4063df3` | Set it; the build guard then permits `production` | **Ronit's written sign-off** (CLAUDE.md I3); compliance A3 |
| 3 | Version 1.0.0 (D7) | `4063df3` | `app.json` `version` (the iOS `buildNumber` follows App Store Connect) | Ronit, with the App Store Connect record |
| 4 | The release check's PROD host (D8) | `4063df3` | Allow `servicedesk.mountmerugroup.com` in the `production` run only | Item 2 |
| 5 | Production-readiness tests (D9) | `4063df3` | Port the part items 1–3 make true; leave out APK/AAB and `versionCode` | Items 1–3 |
| 6 | 02-AUTH §6 and the release guide | `4063df3` | Android's text about the deleted screen and the PROD build, in `RELEASE-IOS.md` | Items 1, 2 |

## 6. Not ported: not in Android `dev`

R1–R5, S1–S6, P2–P4: see §3.2 and §3.3. **If Android merges any of them into `dev`, the next sync (`4063df3..origin/dev`) brings them across.** P1 is not needed: iOS has `dev`'s reply templates.
