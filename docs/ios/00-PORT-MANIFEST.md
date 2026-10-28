# 00 — iOS port manifest (Phase iOS-1a)

> This phase is planning only. No code is copied, nothing is installed, and no `eas` command is run.
> Written on 2026-10-27 on branch `ios-dev`. The App Store side is in `APP-STORE-COMPLIANCE.md`, in this folder.
> Updated in iOS-1b, iOS-2, iOS-3a, iOS-6 and iOS-3b with what each phase actually built (§4.1–§4.5, §4.9–§4.11).

## 0. Port source and fixed facts

| | |
|---|---|
| **PORT SOURCE** | `origin/dev` @ **`c84d53ac716b10a1d0084fb002f212225fb24763`** (2026-10-27 12:50 +0530, "feat: inline "Change technician" editor on the ticket detail properties") |
| How it was read | Only through git: `git ls-tree -r origin/dev`, `git show origin/dev:<path>` and `git grep … origin/dev`. Nothing was checked out or pulled. The Android folder (`..\mmg-ticketing-mobile-app`) and the web folder (`..\MMG-Ticketing-Platform`) were not opened |
| Files in the port source | **230** |
| Target | Branch `ios-dev`, which starts at `28621e5` with only `README.md`. That README is byte-identical to the one on `origin/dev` (blob `4d80835`) |
| API | **UAT `https://uat-servicedesk.mountmerugroup.com/api/v1`, unchanged.** `src/config/env.ts` is copied as it is: UAT is the only allowed target, and PROD stays an empty placeholder |
| Stack (from `package.json` at the port source) | Expo SDK 57 (`expo ~57.0.31`), React Native 0.86.3, React 19.2.3, React Navigation 7, TanStack Query 5, Zustand 5, NativeWind 4, expo-secure-store, Axios. EAS builds use Node 24.18.0 |
| Syncing later Android work | Diff `c84d53a..origin/dev` and apply each changed file according to its row below |

Drift found at the port source (reported here, not fixed):
- `CLAUDE.md` still says Expo SDK 52, React Navigation v6 and "documentation only". `package.json` is the truth: SDK 57 and Navigation 7.
- `docs/RELEASE.md` §1 says `eas-cli` is pinned in `devDependencies`, but `package.json` has no `eas-cli`.
- `docs/web-system/02-AUTH.md` §7.2 and the comments in `src/config/auth.config.ts` describe a redirect URI that the code no longer uses. `11-SSO-VERIFY.md` §7 item 2 already reports this.

## 1. How to read this manifest

| Class | Meaning |
|---|---|
| **KEEP** | Copy byte for byte |
| **ADAPT** | Copy, then make the iOS change stated in the row. **ADAPT · verify** means the file uses something on the brief's list (for example `StatusBar`) that works on iOS unchanged: no code change is expected, and it is checked on a device |
| **SKIP** | Not brought over. One-line reason in the row |
| **SCREEN** | A screen file, ported in iOS-3 in the order of §6 (iOS-3a read, iOS-3b write, iOS-3c modules) |

Rules used:
- **An Android comment alone does not make a file ADAPT.** Comments such as "Android back", "APK" or "Keystore" are corrected the next time the file changes for a real reason.
- **Docs that record Android history are KEEP, verbatim.** iOS differences go in `docs/ios/`. A doc is ADAPT only if a future session would follow it as an instruction and get iOS wrong: `CLAUDE.md`, `docs/RELEASE.md`, `docs/brand/UI-STANDARDS.md` and `docs/web-system/02-AUTH.md`.
- **Exceptions to the brief's KEEP folders.** These files are in folders the brief marks KEEP, but each needs a real iOS change, so each is ADAPT and its row says why:
  - `src/api/auth.api.ts`, `src/config/auth.config.ts`, `src/store/auth.store.ts`, `src/types/navigation.ts`, `src/utils/dialogs.ts`;
  - `src/utils/deep-links.ts` and `src/utils/permissions.ts` (reclassified KEEP → ADAPT in iOS-2: the tab bar and More);
  - `scripts/verify-release-bundle.js`;
  - `tests/auth/mobile-sso.test.mjs`, `tests/rbac/role-gating.test.mjs`, `tests/rbac/service-catalog.test.mjs`;
  - `src/hooks/useProfile.ts`, `tests/support/stubs/expo-auth-session.mjs` and `tests/support/stubs/expo-secure-store.mjs` (reclassified KEEP → ADAPT in iOS-6: sign-out moved into `auth.api.ts`; the stubs record what the iOS tests check);
  - `src/api/comments.api.ts`, `src/hooks/usePostComment.ts`, `src/components/AttachmentPicker.tsx`, `src/utils/assignment.ts`, `src/theme/motion.ts` and `tests/rbac/g3-features.test.mjs` (reclassified KEEP → ADAPT in iOS-3b: no files on a private note, the attachment action sheet, a role list out of a screen, the notice's motion token, one wiring line; §4.11).
- **The pre-SSO test login (§8) is not counted here.** It is a proposal, so the classification below covers only what the port itself needs. §8 lists the files the test login would change if it is approved.

**Totals: KEEP 162 · ADAPT 40 · SKIP 3 · SCREEN 25 = 230.** iOS-3b moved six files from KEEP to ADAPT (§4.11). iOS-6 moved three files from KEEP to ADAPT (`useProfile.ts` and two test stubs, §4.10). iOS-3a moved `useTickets.ts` from KEEP to ADAPT (§4.9). iOS-2 moved four files from KEEP to ADAPT (`deep-links.ts`, `permissions.ts`, `ModuleStacks.tsx`, `TicketStack.tsx`) and one from ADAPT to SKIP (`AppTabBar.tsx`). iOS-1a counted KEEP 176 · ADAPT 27 · SKIP 2.

## 2. Phase map

**Decided by Ronit on 2026-10-27 (D1); renumbered by Ronit on 2026-10-28** (the iOS-3a brief). The "Phase" columns in both documents use this roadmap.

| Phase | Content |
|---|---|
| **iOS-1** | **Foundation** |
| iOS-1a | These two documents |
| iOS-1b | Port the non-screen foundation: every KEEP file marked iOS-1b, plus the iOS versions of `app.json`, `eas.json`, `package.json` (scripts only, no dependency changes) and `CLAUDE.md`. Then `npm ci`, `tsc`, the tests that can run, and `expo-doctor` |
| **iOS-2** | **Navigation shell (tab bar + More):** the navigators, navigation types, the auth screens, the reinstall check, DEV placeholders for every route, and the navigation tests. Built 2026-10-27 (§4.5). `Notice` and `DatePickerSheet` moved to iOS-3, where the screens that use them arrive |
| **iOS-3** | **Screens**, in the order of §6, each with the tests that read its source: **iOS-3a** read (built 2026-10-28, §4.9), **iOS-3b** write (built 2026-10-28, §4.11), **iOS-3c** modules |
| **iOS-4** | **HIG polish:** Dynamic Type, VoiceOver, Reduce Motion, 44 pt targets, safe areas, keyboard, iPad compatibility mode |
| **iOS-5** | **Parity + tests:** feature-by-feature check against Android at the port source (and any newer Android commits being synced), and the full test suite green |
| **iOS-6** | **Microsoft SSO** on iOS (redirect `msauth.com.mountmeru.servicedesk://auth`). Pulled forward and built 2026-10-28 (§4.10); verified on a device in iOS-7 |
| **iOS-7** | **EAS project + first build → TestFlight (full-system test):** EAS project `setu-ios` (`projectId`), the Apple Developer and App Store Connect records, privacy manifest, the iOS release guide, `expo-updates` with the `ios-preview` channel, and the test login if you approve §8 |
| **iOS-8** | **Testing-team rounds** on TestFlight, with the iOS UAT test plan |
| **iOS-9** | **App Store readiness + submit:** metadata, screenshots, privacy labels, demo account, review notes, test login removed, `production` profile |

**The 2026-10-28 renumbering.** The first EAS build moved from third to seventh, after the screens, the polish, parity and SSO, so the first TestFlight build tests the whole system. Commit messages and code comments written before it use the old numbers:

| Old | iOS-3 | iOS-4 (4a, 4b, 4c) | iOS-5 | iOS-6 | iOS-7 |
|---|---|---|---|---|---|
| **New** | **iOS-7** | **iOS-3** (3a, 3b, 3c) | **iOS-4** | **iOS-5** | **iOS-6** |

iOS-1, iOS-2, iOS-8 and iOS-9 keep their numbers.

## 3. Every file in the port source

### 3.1 Repository root (17)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `.env.example` | KEEP | iOS-1b | Comment says "for an APK" (wording only) |
| `.gitignore` | KEEP | iOS-1b, iOS-3a | Already ignores `ios/`, `*.ipa`, `*.p8`, `*.p12`, `*.mobileprovision`, `GoogleService-Info.plist`. **iOS-3a:** `ios/` and `android/` anchored to the root (`/ios/`, `/android/`): the unanchored `ios/` also matched `docs/ios/`, so a new file there was silently ignored |
| `App.tsx` | ADAPT | iOS-1b, iOS-2 | **iOS-1b:** a DEV ONLY foundation root: the React Query and safe-area providers and one `__DEV__` screen; a release bundle renders nothing. **iOS-2:** the Android root, byte for byte: gesture-handler root view, providers, `HtmlRenderProvider`, `ErrorBoundary`, splash hand-over and the connectivity monitor, around `RootNavigator`. Its `StatusBar` (`barStyle="dark-content"`) works on iOS unchanged; check it over native page-sheet modals on a device |
| `CLAUDE.md` | ADAPT | iOS-1b | §4.1 |
| `README.md` | KEEP | — | Already on `ios-dev`, byte-identical |
| `app.json` | ADAPT | iOS-1b | §4.2 |
| `babel.config.js` | KEEP | iOS-1b | — |
| `eas.json` | ADAPT | iOS-1b, iOS-7 | §4.3 |
| `global.css` | KEEP | iOS-1b | — |
| `globals.d.ts` | KEEP | iOS-1b | — |
| `index.ts` | KEEP | iOS-1b | — |
| `metro.config.js` | KEEP | iOS-1b | — |
| `nativewind-env.d.ts` | KEEP | iOS-1b | — |
| `package-lock.json` | ADAPT | iOS-1b | Never edited by hand. Copied as it is: iOS-1b changes no dependency, so `npm ci` installs exactly the Android lockfile. `npm install` regenerates it when a dependency changes (§4.4) |
| `package.json` | ADAPT | iOS-1b | §4.4 |
| `tailwind.config.js` | KEEP | iOS-1b | — |
| `tsconfig.json` | KEEP | iOS-1b | — |

### 3.2 `assets/` (8)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `assets/adaptive-icon-background.png` | SKIP | — | Android adaptive-icon background layer. iOS has no adaptive icons |
| `assets/adaptive-icon.png` | SKIP | — | Android adaptive-icon foreground and Android 13 monochrome layer |
| `assets/brand/meru-logo.png` | KEEP | iOS-1b | Source logo |
| `assets/brand/meru-mark.png` | KEEP | iOS-1b | In-app logo (`BrandLogo`) |
| `assets/icon.png` | KEEP | iOS-1b | 1024 × 1024 and opaque (RELEASE §7), which is what the iOS App Store icon needs (no alpha). Open item, as on Android: rebuild it from a vector or ≥ 2048 px master before the store, because it is upscaled ×1.13 |
| `assets/illustrations/all-clear.svg` | KEEP | iOS-1b | — |
| `assets/illustrations/nothing-here.svg` | KEEP | iOS-1b | — |
| `assets/splash-icon.png` | KEEP | iOS-1b | `expo-splash-screen` builds the iOS launch screen from it |

### 3.3 `docs/` (23)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `docs/G1-WEB-BEHAVIOUR.md` | KEEP | iOS-1b | — |
| `docs/G2-WEB-FILTERS.md` | KEEP | iOS-1b | — |
| `docs/G3-WEB-BEHAVIOUR.md` | KEEP | iOS-1b | — |
| `docs/G4-WEB-CATALOGUE.md` | KEEP | iOS-1b | — |
| `docs/PERFORMANCE.md` | KEEP | iOS-1b | Android measurements. iOS figures, if needed, go in `docs/ios/` (iOS-4) |
| `docs/RELEASE.md` | ADAPT | iOS-7 | Not copied in iOS-1b (it is the Android release guide). Rewritten for iOS in iOS-7 (§4.7) |
| `docs/ROLE-MATRIX.md` | KEEP | iOS-1b | Role rules are platform-neutral |
| `docs/UAT-TEST-PLAN.md` | KEEP | iOS-1b | Android steps. The iOS test plan is a new `docs/ios/` file (iOS-7) |
| `docs/WEB-VS-MOBILE-ROLES.md` | KEEP | iOS-1b | — |
| `docs/brand/UI-STANDARDS.md` | ADAPT | iOS-1b as-is, iOS-4 | Copied unchanged in iOS-1b; adapted in iOS-4 (§4.8). Until then the iOS navigation chrome is described in §4.5 |
| `docs/brand/WEB-TOKENS.md` | KEEP | iOS-1b | — |
| `docs/web-system/00-OVERVIEW.md` | KEEP | iOS-1b | Environments table unchanged: UAT only |
| `docs/web-system/01-API-CONTRACT.md` | KEEP | iOS-1b | — |
| `docs/web-system/02-AUTH.md` | ADAPT | iOS-1b as-is, iOS-6 | Copied unchanged in iOS-1b; adapted in iOS-6 (§4.6) |
| `docs/web-system/03-DATA-MODEL.md` | KEEP | iOS-1b | — |
| `docs/web-system/04-SCREEN-MAP.md` | KEEP | iOS-1b | — |
| `docs/web-system/05-RULES-AND-GAPS.md` | KEEP | iOS-1b | — |
| `docs/web-system/06-BACKEND-ASKS.md` | KEEP | iOS-1b | The iOS halves of A2, A5 and A18 are named there already |
| `docs/web-system/07-DRIFT-CHECK.md` | KEEP | iOS-1b | — |
| `docs/web-system/08-SDP-PARITY.md` | KEEP | iOS-1b | §8.1 lists the iOS work Android deferred. This manifest picks it up |
| `docs/web-system/09-API-DRIFT.md` | KEEP | iOS-1b | — |
| `docs/web-system/10-A2-STATUS.md` | KEEP | iOS-1b | — |
| `docs/web-system/11-SSO-VERIFY.md` | KEEP | iOS-1b | Android's SSO record |

### 3.4 `scripts/` (2)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `scripts/eas-build-guard.js` | KEEP | iOS-1b | Platform-neutral: it checks the profile name and `EXPO_PUBLIC_APP_ENV`, which `preview` and `production` still use |
| `scripts/verify-release-bundle.js` | ADAPT | iOS-7 | Not copied in iOS-1b, so until iOS-7 the `verify:release-bundle` script in `package.json` points at a missing file. Change `--platform android` to `ios`, and the output file from `index.android.bundle` to `main.jsbundle`. Hermes compiles iOS bundles too, so the bytecode step stays. Run it on the `production` configuration: the result must be PASS It can PASS only once the Login screen exists (iOS-2), because it requires the "Sign in with Microsoft" string |

### 3.5 `src/api/` (22)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/api/announcements.api.ts` | KEEP | iOS-1b | — |
| `src/api/approvals.api.ts` | KEEP | iOS-1b | — |
| `src/api/attachmentDownload.ts` | KEEP | iOS-1b | `expo-sharing` opens the iOS share sheet. `dialogTitle` is Android-only and is ignored on iOS |
| `src/api/attachments.api.ts` | KEEP | iOS-1b | — |
| `src/api/auth.api.ts` | ADAPT | iOS-1b as-is, iOS-6 | Copied unchanged in iOS-1b. In iOS-6, pass `{ preferEphemeralSession: true }` to `request.promptAsync(...)`. Without it, iOS shows "'Setu' Wants to Use 'microsoftonline.com' to Sign In" before every sign-in, and the sign-in shares Safari's Microsoft cookies. With it, neither happens, which also suits shared phones (`prompt=select_account`). This is decision D5. **iOS-6 (built 2026-10-28):** done, through `AUTH_SESSION_OPTIONS` in `auth.config.ts`. Also: `codeChallengeMethod: S256` is stated, and `signOutAndWipe()` holds the sign-out sequence, moved unchanged out of `useSignOut` so the tests can run it (§4.10) |
| `src/api/client.ts` | KEEP | iOS-1b | — |
| `src/api/comments.api.ts` | ADAPT | iOS-1b, iOS-3b | Copied unchanged in iOS-1b. **iOS-3b:** `createComment` also refuses a PRIVATE note that carries `attachmentIds` (05 §C.26: a note's files stay visible to the requester), a second layer under `sendComment` (§4.11) |
| `src/api/dashboard.api.ts` | KEEP | iOS-1b | — |
| `src/api/drift.ts` | KEEP | iOS-1b | — |
| `src/api/errors.ts` | KEEP | iOS-1b | — |
| `src/api/helpers.ts` | KEEP | iOS-1b | — |
| `src/api/kb.api.ts` | KEEP | iOS-1b | — |
| `src/api/lookups.api.ts` | KEEP | iOS-1b | — |
| `src/api/network.ts` | KEEP | iOS-1b | NetInfo works on iOS |
| `src/api/notifications.api.ts` | KEEP | iOS-1b | — |
| `src/api/pagination.ts` | KEEP | iOS-1b | — |
| `src/api/queryClient.ts` | KEEP | iOS-1b | — |
| `src/api/responseSpecs.ts` | KEEP | iOS-1b | — |
| `src/api/serviceCatalog.api.ts` | KEEP | iOS-1b | — |
| `src/api/tasks.api.ts` | KEEP | iOS-1b | — |
| `src/api/tickets.api.ts` | KEEP | iOS-1b | — |
| `src/api/users.api.ts` | KEEP | iOS-1b | — |

### 3.6 `src/components/` (30)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/components/AnnouncementCard.tsx` | KEEP | iOS-1b | — |
| `src/components/ApprovalStatusChip.tsx` | KEEP | iOS-1b | — |
| `src/components/AttachmentPicker.tsx` | ADAPT | iOS-1b, iOS-3b | Camera, Photos and Files all work on iOS. The purpose strings live in `app.json` (§4.2). Photos uses the system's out-of-process picker, so iOS asks for no photo-library permission. **iOS-3b:** Android's three buttons become one "Add attachment" button and an action sheet (Take Photo · Photo Library · Choose File); a refused camera offers "Open Settings". The device checks before staging are unchanged |
| `src/components/Banners.tsx` | KEEP | iOS-1b | — |
| `src/components/BrandLogo.tsx` | KEEP | iOS-1b | — |
| `src/components/BulkProgressModal.tsx` | KEEP | iOS-1b | `statusBarTranslucent` and `onRequestClose` are Android props, ignored on iOS |
| `src/components/Card.tsx` | KEEP | iOS-1b | — |
| `src/components/EmailChipsInput.tsx` | KEEP | iOS-1b | — |
| `src/components/EmptyState.tsx` | KEEP | iOS-1b | — |
| `src/components/ErrorBoundary.tsx` | KEEP | iOS-1b | — |
| `src/components/ErrorState.tsx` | KEEP | iOS-1b | — |
| `src/components/Filters.tsx` | KEEP | iOS-1b | — |
| `src/components/Form.tsx` | KEEP | iOS-1b | — |
| `src/components/HtmlText.tsx` | KEEP | iOS-1b | `Linking.openURL` opens Safari |
| `src/components/ImageViewerModal.tsx` | ADAPT | iOS-1b as-is, iOS-3a | Copied unchanged in iOS-1b. **Done in iOS-3a:** change the share icon from `share-social-outline` (the Android glyph) to `share-outline` (the iOS glyph). The `StatusBar` there works unchanged (verify). Because this shares images, the share sheet offers "Save Image", which needs `NSPhotoLibraryAddUsageDescription` (§4.2) |
| `src/components/ListEntry.tsx` | KEEP | iOS-1b | — |
| `src/components/LoadingSkeleton.tsx` | KEEP | iOS-1b | — |
| `src/components/OptionSheet.tsx` | KEEP | iOS-1b | Android-only Modal props are ignored. Whether this becomes a native iOS sheet is an iOS-4 design question, not a port change. **iOS-3b:** the short fixed choices moved to iOS action sheets (`utils/actionSheet.ts`); this sheet keeps the long server lists (categories, groups, countries, sort, country filter) |
| `src/components/PersonPickerSheet.tsx` | KEEP | iOS-1b | Same as `OptionSheet` |
| `src/components/PriorityBadge.tsx` | KEEP | iOS-1b | — |
| `src/components/RecentTicketRow.tsx` | KEEP | iOS-1b | — |
| `src/components/ScreenHeader.tsx` | ADAPT | iOS-1b as-is, iOS-2 | Copied unchanged in iOS-1b, because `components/index.ts` exports it. **iOS-2:** the `'drawer'` variant and `DrawerActions` are removed; the back icon is `chevron-back`. Signed-in screens use the native navigation bar instead (§4.5), so only the `__DEV__` developer-token screen uses this header now. Its 56 pt height is an iOS-4 item (§4.8) |
| `src/components/Shimmer.tsx` | KEEP | iOS-1b | — |
| `src/components/SlaBadge.tsx` | KEEP | iOS-1b | — |
| `src/components/StatusBadge.tsx` | KEEP | iOS-1b | Already sets the iOS `accessibilityElementsHidden` next to the Android prop |
| `src/components/TaskRow.tsx` | KEEP | iOS-1b | — |
| `src/components/TemplatePickerSheet.tsx` | KEEP | iOS-1b | Same as `OptionSheet` |
| `src/components/TicketCard.tsx` | KEEP | iOS-1b | — |
| `src/components/index.ts` | KEEP | iOS-1b | iOS-2 adds the new exports from §7 |
| `src/components/listDefaults.ts` | KEEP | iOS-1b | — |

### 3.7 `src/config/` (2)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/config/auth.config.ts` | ADAPT | iOS-1b as-is, iOS-6 | Copied unchanged in iOS-1b; nothing calls it on iOS before iOS-6. In iOS-6, `getAuthRedirectUri()` returns `'msauth.com.mountmeru.servicedesk://auth'` instead of the Android `msauth://com.mountmeru.servicedesk/<signature hash>`. `AUTH_REDIRECT_SCHEME` becomes `'msauth.com.mountmeru.servicedesk'`. Drop the unused `makeRedirectUri` import and fix the comments. The client and tenant IDs stay: same Entra registration, so the backend's ID-token audience check is unchanged. **iOS-6 (built 2026-10-28):** done. `getAuthRedirectUri()` returns `IOS_AUTH_REDIRECT_URI` on iOS and throws elsewhere; `isMicrosoftSignInConfigured()` is false off iOS. `AUTH_SESSION_OPTIONS` holds D5 |
| `src/config/env.ts` | KEEP | iOS-1b | UAT only; PROD placeholder unchanged |

### 3.8 `src/hooks/` (31)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/hooks/cache.ts` | KEEP | iOS-1b | — |
| `src/hooks/index.ts` | KEEP | iOS-1b | — |
| `src/hooks/queryKeys.ts` | KEEP | iOS-1b | — |
| `src/hooks/useAnnouncements.ts` | KEEP | iOS-1b | — |
| `src/hooks/useApprovals.ts` | KEEP | iOS-1b | — |
| `src/hooks/useAssignTicket.ts` | KEEP | iOS-1b | — |
| `src/hooks/useBulkRunner.ts` | KEEP | iOS-1b | — |
| `src/hooks/useChangeStatus.ts` | KEEP | iOS-1b | — |
| `src/hooks/useCreateTicket.ts` | KEEP | iOS-1b | — |
| `src/hooks/useDebouncedValue.ts` | KEEP | iOS-1b | — |
| `src/hooks/useDeleteAttachment.ts` | KEEP | iOS-1b | — |
| `src/hooks/useDiscardGuard.ts` | KEEP | iOS-1b | Uses `usePreventRemove`. In iOS-3, check on a device that it also stops the iOS swipe-back and the swipe-down that closes a sheet. If it doesn't, the affected screens set `gestureEnabled: false` while there is unsent input. **iOS-3b:** in the installed source, native-stack turns a prevented removal into iOS's `preventNativeDismiss` (`NativeStackView.native.tsx`), so the swipes ask too; pinned by `tests/screens/write-screens.test.mjs`, device check in iOS-7 |
| `src/hooks/useHome.ts` | KEEP | iOS-1b | — |
| `src/hooks/useKnowledgeBase.ts` | KEEP | iOS-1b | — |
| `src/hooks/useLookups.ts` | KEEP | iOS-1b | — |
| `src/hooks/useNotifications.ts` | KEEP | iOS-1b | — |
| `src/hooks/usePostComment.ts` | ADAPT | iOS-1b, iOS-3b | Copied unchanged in iOS-1b. **iOS-3b:** the write is the exported `sendComment(role, …)` (as `sendAssignment`), so the tests drive it; it refuses a PRIVATE note with files before anything is uploaded (05 §C.26, §4.11) |
| `src/hooks/useProfile.ts` | ADAPT | iOS-1b, iOS-6 | Copied unchanged in iOS-1b. **iOS-6:** `useSignOut` calls `signOutAndWipe()` (`auth.api.ts`) instead of running AUTH-3 and `endSession` itself. Same sequence, same 5 s cap; now testable under Node |
| `src/hooks/useReduceMotion.ts` | KEEP | iOS-1b | `AccessibilityInfo.isReduceMotionEnabled` reads iOS's Reduce Motion setting. The comment names only Android's equivalent |
| `src/hooks/useServiceCatalog.ts` | KEEP | iOS-1b | — |
| `src/hooks/useSingleFlight.ts` | KEEP | iOS-1b | — |
| `src/hooks/useStableCallback.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTasks.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTicket.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTicketAttachments.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTicketComments.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTicketHistory.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTickets.ts` | ADAPT | iOS-1b, iOS-3a | Copied unchanged in iOS-1b. **iOS-3a:** the 500-ticket cap's two expressions become the exported `nextTicketListPage()` and `isTicketListCapped()`, so `tests/screens/read-screens.test.mjs` can run them. Same behaviour |
| `src/hooks/useUpdateTicket.ts` | KEEP | iOS-1b | — |
| `src/hooks/useUploadAttachment.ts` | KEEP | iOS-1b | — |
| `src/hooks/writeGuards.ts` | KEEP | iOS-1b | — |

### 3.9 `src/navigation/` (10)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/navigation/AppDrawer.tsx` | ADAPT | iOS-2 | Not copied. **Replaced** by `AppTabs.tsx` (the tab bar) and `TabStacks.tsx` (one native stack per tab, More included) (§4.5) |
| `src/navigation/AppTabBar.tsx` | SKIP | — | Not copied. It existed so the bar could sit under the drawer's screens. On iOS the tab navigator's own bar is on every pushed screen (§4.5, decision D4) |
| `src/navigation/AuthStack.tsx` | KEEP | iOS-2 | Copied in iOS-2. The `__DEV__` gate is unchanged. §8 would change it only if approved |
| `src/navigation/DrawerContent.tsx` | ADAPT | iOS-2 | Not copied. **Replaced** by `src/navigation/MoreScreen.tsx`: the same rows, labels, icons, account card, Sign out and version line, as an iOS grouped list from `moreSections()` (§4.5) |
| `src/navigation/MainTabs.tsx` | ADAPT | iOS-2 | Not copied. **Replaced** by `AppTabs.tsx` (tabs from `appTabs()`, badges from `tabBadges()`) |
| `src/navigation/ModuleStacks.tsx` | ADAPT | iOS-2 | Not copied. **Replaced:** the four module stacks are flattened into the More stack (`routes.ts`), so each module's first screen swipes back to More. The `getId` functions moved to `routes.ts` (`RECORD_ID_PARAM`) |
| `src/navigation/RootNavigator.tsx` | ADAPT | iOS-2, iOS-3b | Written from the Android file: Auth \| App tabs, plus the seven sheets in a root modal group that covers the tab bar. The reinstall check (`installMarker.ts`) runs before `restoreSession()`. The 8-hour foreground check and the splash hand-over are unchanged. **iOS-3b:** registers the five write sheets, gives every sheet `getIdFor(name)`, and mounts `SuccessNoticeHost` above the navigator |
| `src/navigation/TicketStack.tsx` | ADAPT | iOS-2 | Not copied. **Replaced:** the list is the Tickets tab's stack; the record screens (`TicketDetail`, `TaskDetail`, `TicketLink`, plus `ApprovalDetail`) are in every tab's stack; the six sheets and `CreateTicket` are root sheets (§4.5) |
| `src/navigation/navigationRef.ts` | ADAPT | iOS-1b as-is, iOS-2 | Copied unchanged in iOS-1b, because `HtmlText` imports it. **iOS-2:** `openTicketLinkInApp` opens the resolver in the tab on screen (`deep-links.ts` `ticketLinkDestination`, `routes.ts` `focusedAppTab`); nothing opens under a sheet |
| `src/navigation/splash.ts` | KEEP | iOS-1b | `ErrorBoundary` imports it |

### 3.10 `src/screens/` (29)

The 25 SCREEN files are listed in porting order in §6. The remaining four are here.

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/screens/PlaceholderScreen.tsx` | ADAPT | iOS-2 | Copied in iOS-2; the `'drawer'` value is removed from `headerVariant`. It is used only by `DevTokenScreen`. The signed-in routes' placeholders are the new `DevPlaceholderScreen` (§7) |
| `src/screens/auth/DevTokenScreen.tsx` | KEEP | iOS-2 | Copied in iOS-2. `__DEV__` only, as on Android, and absent from the exported release bundle (compliance A2). §8 would change it only if approved |
| `src/screens/auth/LoginScreen.tsx` | KEEP | iOS-2 | Copied in iOS-2. Nothing platform-specific. The `__DEV__` hint shows whichever redirect `auth.config.ts` returns, which is the Android one until iOS-6, so Microsoft sign-in can't finish on iOS before then |
| `src/screens/auth/signInAttempt.ts` | KEEP | iOS-2 | Copied in iOS-2. The stale-banner rule is platform-neutral. On iOS the Microsoft sheet leaves the app `inactive`, not `background`, so it still never counts as leaving. Checked in iOS-6. **iOS-6:** unchanged. `tests/auth/ios-sso.test.mjs` runs the iOS sequences: the sheet (`inactive`), a trip to Authenticator during sign-in (`background`), and Control Centre while idle (`inactive`). None of them clears the banner. On real AppState events in iOS-7 |
| `src/screens/approvals/ApprovalDetailScreen.tsx` | SCREEN | iOS-3c | §6 #14 |
| `src/screens/approvals/ApprovalsInboxScreen.tsx` | SCREEN | iOS-3c | §6 #13 |
| `src/screens/catalog/ServiceCatalogScreen.tsx` | SCREEN | iOS-3c | §6 #20 |
| `src/screens/catalog/ServiceFormFieldInput.tsx` | SCREEN | iOS-3c | §6 #21 |
| `src/screens/catalog/ServiceRequestDetailScreen.tsx` | SCREEN | iOS-3c | §6 #23 |
| `src/screens/catalog/ServiceRequestFormScreen.tsx` | SCREEN | iOS-3c | §6 #22 |
| `src/screens/dashboard/AnnouncementsScreen.tsx` | SCREEN | iOS-3c | §6 #24 |
| `src/screens/dashboard/HomeScreen.tsx` | SCREEN | iOS-3a (built), iOS-3b | §6 #1, §4.9. **iOS-3b:** "Raise a ticket" and "+" back (§4.11) |
| `src/screens/knowledge/KbArticleScreen.tsx` | SCREEN | iOS-3c | §6 #19 |
| `src/screens/knowledge/KnowledgeBaseScreen.tsx` | SCREEN | iOS-3c | §6 #18 |
| `src/screens/notifications/NotificationsScreen.tsx` | SCREEN | iOS-3a | §6 #6 |
| `src/screens/profile/ProfileScreen.tsx` | SCREEN | iOS-3c | §6 #25 |
| `src/screens/tasks/TaskDetailScreen.tsx` | SCREEN | iOS-3c | §6 #16 |
| `src/screens/tasks/TaskEditorScreen.tsx` | SCREEN | iOS-3c | §6 #17 |
| `src/screens/tasks/TaskListScreen.tsx` | SCREEN | iOS-3c | §6 #15 |
| `src/screens/tickets/AssignPickerScreen.tsx` | SCREEN | iOS-3b (built) | §6 #10, §4.11 |
| `src/screens/tickets/CreateTicketScreen.tsx` | SCREEN | iOS-3b (built) | §6 #7, §4.11 |
| `src/screens/tickets/ReplyComposerScreen.tsx` | SCREEN | iOS-3b (built) | §6 #8, §4.11 |
| `src/screens/tickets/StatusClosureScreen.tsx` | SCREEN | iOS-3b (built) | §6 #9, §4.11 |
| `src/screens/tickets/SubmitApprovalScreen.tsx` | SCREEN | iOS-3b (built) | §6 #12, §4.11 |
| `src/screens/tickets/TicketDetailScreen.tsx` | SCREEN | iOS-3a (built), iOS-3b | §6 #4, §4.9. **iOS-3b:** every write back, More options as an action sheet (§4.11) |
| `src/screens/tickets/TicketFiltersScreen.tsx` | SCREEN | iOS-3a (built) | §6 #3, §4.9 |
| `src/screens/tickets/TicketLinkScreen.tsx` | SCREEN | iOS-3a (built) | §6 #5, §4.9 |
| `src/screens/tickets/TicketListScreen.tsx` | SCREEN | iOS-3a (built), iOS-3b | §6 #2, §4.9. **iOS-3b:** the status chip (action sheet), selection and "+" back (§4.11) |
| `src/screens/tickets/TicketPropertyEditors.tsx` | SCREEN | iOS-3a as-is, iOS-3b (built) | §6 #11. Copied unchanged in iOS-3a, because TicketDetail imports it; its editors open since iOS-3b, with impact and urgency as action sheets (§4.11) |

### 3.11 `src/store/` (2)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/store/auth.store.ts` | ADAPT | iOS-1b | Pass `{ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }` to every SecureStore call. This is the value `02-AUTH.md` §5.1 already specifies, and the iOS counterpart of Android's `allowBackup: false`: the token never moves to another device through a backup. Also fix the "Android Keystore" comment. The wipe after a reinstall goes in a separate file (§7), so this store stays loadable by the Node tests. **iOS-2:** `wipeStoredSession()` is exported for that file |
| `src/store/ui.store.ts` | KEEP | iOS-1b | — |

### 3.12 `src/theme/` (5)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/theme/colors.ts` | KEEP | iOS-1b | — |
| `src/theme/index.ts` | KEEP | iOS-1b | — |
| `src/theme/motion.ts` | ADAPT | iOS-1b, iOS-3b | Copied unchanged in iOS-1b. **iOS-3b:** adds `successNotice` (fade 200 ms, visible 3 s) for `components/SuccessNotice.tsx`; components hold no motion numbers of their own |
| `src/theme/spacing.ts` | KEEP | iOS-1b | dp values are used as pt on iOS, at the same numbers |
| `src/theme/typography.ts` | KEEP | iOS-1b | No font is named, so iOS uses its system font, SF Pro. The web's `font-sans` stack also uses the Apple system font on Apple devices. The comment mentions Roboto only |

### 3.13 `src/types/` (17)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/types/announcement.ts` | KEEP | iOS-1b | — |
| `src/types/api.ts` | KEEP | iOS-1b | — |
| `src/types/approval.ts` | KEEP | iOS-1b | — |
| `src/types/attachment.ts` | KEEP | iOS-1b | — |
| `src/types/comment.ts` | KEEP | iOS-1b | — |
| `src/types/dashboard.ts` | KEEP | iOS-1b | — |
| `src/types/enums.ts` | KEEP | iOS-1b | — |
| `src/types/index.ts` | KEEP | iOS-1b | — |
| `src/types/kb.ts` | KEEP | iOS-1b | — |
| `src/types/lookups.ts` | KEEP | iOS-1b | — |
| `src/types/mobile-sso-contract.ts` | KEEP | iOS-1b | — |
| `src/types/navigation.ts` | ADAPT | iOS-1b as-is, iOS-2 | Copied unchanged in iOS-1b, because `types/index.ts` re-exports it. **iOS-2:** rewritten for the tabs (§4.5): `AppTabParamList`, one param list per tab stack, `RecordScreensParamList` (in every stack), `SheetsParamList` (in the root stack), and their screen props. The drawer types and the `@react-navigation/drawer` import are gone |
| `src/types/notification.ts` | KEEP | iOS-1b | — |
| `src/types/service-catalog.ts` | KEEP | iOS-1b | — |
| `src/types/task.ts` | KEEP | iOS-1b | — |
| `src/types/ticket.ts` | KEEP | iOS-1b | — |
| `src/types/user.ts` | KEEP | iOS-1b | — |

### 3.14 `src/utils/` (19)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/utils/activity.ts` | KEEP | iOS-1b | — |
| `src/utils/approvals.ts` | KEEP | iOS-1b | — |
| `src/utils/assignment.ts` | ADAPT | iOS-1b, iOS-3b | Copied unchanged in iOS-1b. **iOS-3b:** receives `CREATE_ASSIGNEE_ROLES` from CreateTicketScreen, which may not name a role (`tests/navigation/shell.test.mjs`). Same list |
| `src/utils/compose.ts` | KEEP | iOS-1b | — |
| `src/utils/deep-links.ts` | ADAPT | iOS-1b, iOS-2 | Copied unchanged in iOS-1b. **iOS-2:** adds `ticketLinkDestination()`: a ticket link opens the resolver in the tab on screen, and nothing under a sheet. `parseTicketLink()` is unchanged |
| `src/utils/dialogs.ts` | ADAPT | iOS-1b as-is, iOS-3 | Copied unchanged in iOS-1b: its `ToastAndroid` call is already behind `Platform.OS === 'android'`. Its change moved from iOS-2 to iOS-3, with `Notice` and the screens that show notices. Today `notify()` uses `ToastAndroid`, and on iOS it falls back to a modal `Alert` for every success notice. The HIG discourages that. In iOS-3 it changes to the non-modal `Notice` (§7), which VoiceOver announces. Drop the `ToastAndroid` and `Platform` imports. `confirmAction` and the error alerts stay as `Alert`, which is the right iOS control for them. **Done in iOS-3b:** `notify()` calls `showSuccessNotice()`; the component is named `SuccessNotice`, not `Notice` (§7) |
| `src/utils/format.ts` | KEEP | iOS-1b | — |
| `src/utils/html.ts` | KEEP | iOS-1b | — |
| `src/utils/kb.ts` | KEEP | iOS-1b | — |
| `src/utils/permissions.ts` | ADAPT | iOS-1b, iOS-2 | Copied unchanged in iOS-1b. **iOS-2:** adds `appTabs()`, `hasApprovalsTab()`, `moreSections()` and `tabBadges()` (§4.5), built on `drawerItems()` and `ticketsTitle()`. Every existing function is unchanged, so the role-gating test still pins the same answers. **iOS-3a:** exports the existing `navRole()` (no user: END_USER's answers), so the screens no longer name a role themselves, which `tests/navigation/shell.test.mjs` forbids |
| `src/utils/roles.ts` | KEEP | iOS-1b | — |
| `src/utils/service-catalog.ts` | KEEP | iOS-1b | — |
| `src/utils/session.ts` | KEEP | iOS-1b | — |
| `src/utils/tasks.ts` | KEEP | iOS-1b | — |
| `src/utils/templates.ts` | KEEP | iOS-1b | — |
| `src/utils/ticket-filters.ts` | KEEP | iOS-1b | — |
| `src/utils/ticket-properties.ts` | KEEP | iOS-1b | — |
| `src/utils/ticket-rules.ts` | KEEP | iOS-1b | — |
| `src/utils/writeCopy.ts` | KEEP | iOS-1b | — |

### 3.15 `tests/` (13)

Several suites read screen or navigator source files as text. Each suite is copied in the phase that brings the files it reads, so `npm test` stays green from iOS-1b on.

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `tests/auth/mobile-sso.test.mjs` | ADAPT | iOS-2, then iOS-6 | **Copied as it is in iOS-2**, together with `src/screens/auth/signInAttempt.ts`, which it imports; it passes. In iOS-6 its fixed-redirect assertion (line 152) changes to `msauth.com.mountmeru.servicedesk://auth`, together with `auth.config.ts`. **iOS-6 (built):** done; it also asserts the sheet options (`AUTH_SESSION_OPTIONS`). All 34 pass |
| `tests/rbac/g3-features.test.mjs` | ADAPT | iOS-3b (copied) | Reads the TicketDetail, ReplyComposer and SubmitApproval screens and `TicketStack.tsx`. **Copied in iOS-3b** with every expectation unchanged; one wiring line reads `RootNavigator.tsx`'s sheet list instead of `TicketStack.tsx` |
| `tests/rbac/g5-audit.test.mjs` | KEEP | iOS-3b (copied) | Reads `CreateTicketScreen`. Copied unchanged; all pass |
| `tests/rbac/list-filters.test.mjs` | KEEP | iOS-3a (copied) | Reads `TicketListScreen` and `TicketFiltersScreen`. Copied unchanged; all pass |
| `tests/rbac/personas.mjs` | KEEP | iOS-1b | — |
| `tests/rbac/property-editing.test.mjs` | KEEP | iOS-1b | Pure modules only |
| `tests/rbac/role-gating.test.mjs` | ADAPT | iOS-3a (copied), completed in iOS-3b and iOS-3c | Not copied in iOS-2: it reads screens that arrive in iOS-3. Its navigation part is already covered on iOS by `tests/navigation/shell.test.mjs` (§7). **Copied in iOS-3a, ahead of iOS-3c,** with every expectation unchanged; its `GATED` list holds only the screens ported so far, and a comment names the rows iOS-3b (CreateTicket, ReplyComposer, SubmitApproval) and iOS-3c (the catalogue, Profile) add back with their Android `forbid`. Changed on copy: the `GATED` entry for `src/navigation/DrawerContent.tsx` becomes `MoreScreen.tsx` calling `moreSections(` and `countrySelectorMode(` (`drawerItems(` is now called only inside `permissions.ts`); the `MainTabs.tsx` entry becomes `AppTabs.tsx` calling `appTabs(`. The `drawerItems()` and `mainTabs()` expectations are unchanged. **iOS-3b:** the three rows are back, byte-identical to Android's, plus two Android did not have (StatusClosure, AssignPicker) so every write sheet takes its role decisions from `permissions.ts`; 128 pass |
| `tests/rbac/service-catalog.test.mjs` | ADAPT | iOS-3c | Not copied in iOS-2: it reads the catalogue screens. When copied, lines 126–128 change: `MoreScreen.tsx` opens the catalogue with `navigate('ServiceCatalog', { view: 'catalog' })` (and My Requests with `view: 'requests'`), and the catalogue's routes are registered from `STACK_ROUTES.MoreTab` in `src/navigation/routes.ts`, not by a `Drawer.Screen` or a `CatalogStack` |
| `tests/rbac/technician-editor.test.mjs` | KEEP | iOS-3b (copied) | Reads AssignPicker, TicketDetail and TicketPropertyEditors. Copied unchanged; all pass |
| `tests/support/loader.mjs` | KEEP | iOS-1b | — |
| `tests/support/register.mjs` | KEEP | iOS-1b | — |
| `tests/support/stubs/expo-auth-session.mjs` | ADAPT | iOS-1b, iOS-6 | Copied unchanged in iOS-1b. **iOS-6:** exports `CodeChallengeMethod`; records the options passed to `promptAsync`; the unused `makeRedirectUri` is gone; the comment says "device build" |
| `tests/support/stubs/expo-secure-store.mjs` | ADAPT | iOS-1b, iOS-6 | Copied unchanged in iOS-1b. **iOS-6:** records each call's options (`__calls()`, never a value), so `tests/auth/ios-sso.test.mjs` can check `keychainAccessible` on every call; also exports the other three accessibility constants |

## 4. ADAPT details

### 4.1 `CLAUDE.md` (written in iOS-1b)
- **Title and "What this repo is":**
  - the iOS port of Setu on `ios-dev`, with the port source commit;
  - the stack corrected to Expo SDK 57, React Native 0.86 and React Navigation 7, with "documentation only" removed;
  - bundle ID and iPhone only;
  - the roadmap (§2);
  - auth status on iOS: SSO in iOS-6, the developer-token screen from iOS-2, the TestFlight test login not approved.
- **New "iOS branch rules" I1–I7:**
  - I1: `ios-dev` only; never push to, merge into, rebase or touch `main`, `dev` or any Android branch.
  - I2: never open or modify `..\mmg-ticketing-mobile-app` or `..\MMG-Ticketing-Platform`. Read Android code only through git; porting is `git checkout <port source> -- <path>`.
  - I3: UAT API only.
  - I4: the web repo is read-only and is not opened from this repo.
  - I5: App Store compliance is checked every phase against `docs/ios/APP-STORE-COMPLIANCE.md`.
  - I6: never commit without first showing the diff and getting an OK.
  - I7: no `eas` commands, new dependencies, screens or navigation outside the phase brief.
- **Changed rules:**
  - Rule 3: web repo, see I4.
  - Rule 4: TestFlight builds named as well.
  - Rule 5: the stale "auth is a PENDING DECISION" text replaced by the `02-AUTH.md` §6 list.
  - Rule 8: signing certificates, provisioning profiles and App Store Connect keys added; the Keychain mode named.
- **Doc index:** `docs/ios/00-PORT-MANIFEST.md` and `docs/ios/APP-STORE-COMPLIANCE.md` added.
- **Unchanged:**
  - the "backend is the single source of truth" section;
  - rules 1, 2, 6 and 7;
  - R1–R7, with an iOS note: in this repo each phase brief says what R4 and R5 allow.

### 4.2 `app.json` (written in iOS-1b)

Every value below is in the repo's `app.json` now, apart from the comments:

```jsonc
{
  "expo": {
    "name": "Setu",                                   // CFBundleDisplayName (under the icon)
    "slug": "setu-ios",                               // separate EAS project (created in iOS-7)
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",                    // light only for v1 (decision D9, compliance E7)
    "scheme": "msauth.com.mountmeru.servicedesk",     // the iOS SSO redirect scheme; nothing else in src/ uses a scheme
    "platforms": ["ios"],
    "ios": {
      "bundleIdentifier": "com.mountmeru.servicedesk",
      "buildNumber": "1",                             // bumped by hand per upload (appVersionSource: local)
      "supportsTablet": false,                        // iPhone only
      "config": { "usesNonExemptEncryption": false }, // writes ITSAppUsesNonExemptEncryption = false
      "infoPlist": {
        "NSCameraUsageDescription": "Setu uses the camera only when you choose to take a photo to attach to a ticket, a reply or a request.",
        "NSPhotoLibraryUsageDescription": "Setu opens your photos only when you choose some to attach to a ticket, a reply or a request. Only the photos you pick are uploaded.",
        "NSPhotoLibraryAddUsageDescription": "Setu saves an attachment image to your photo library only when you choose Save Image."
      }
    },
    "plugins": [
      ["expo-secure-store", { "faceIDPermission": false }],      // deletes the default Face ID string
      ["expo-image-picker", { "microphonePermission": false }],  // deletes the microphone string
      "@react-native-community/datetimepicker",
      "expo-font",
      ["expo-splash-screen", { "image": "./assets/splash-icon.png", "imageWidth": 192, "resizeMode": "contain", "backgroundColor": "#FFFFFF" }]
    ]
  }
}
```

**Removed:**
- **The whole `android` block** (`package`, `versionCode`, `allowBackup`, `adaptiveIcon`, `blockedPermissions`). It is Android-only (§5).
- **The schemes `mmgservicedesk`, `com.mountmeru.servicedesk` and `msauth`.** Nothing in `src/` uses them; the last is the Android MSAL form.
- **`extra.eas.projectId` and `owner`** (decision D7).

**Added later, not in iOS-1b:**
- **iOS-7:**
  - `owner` and `extra.eas.projectId` (`eas init` for `setu-ios`);
  - `runtimeVersion` (`fingerprint` proposed) and `updates.url`, both of which need `expo-updates` (D6);
  - `ios.privacyManifests` (compliance H4).

**Purpose strings** (checked against the plugin source in `node_modules`):
- **How the keys are kept:** `expo-image-picker` and `expo-secure-store` keep any value already in `ios.infoPlist`. They write their generic default ("Allow $(PRODUCT_NAME) to access …") only when the key is empty, and they delete a key whose plugin option is `false`.
- **Camera and photo library:** set in `ios.infoPlist`. The library picker runs out of process, so the photo-library prompt should never appear, but the key is still written.
- **Photo library add:** `NSPhotoLibraryAddUsageDescription`. It is needed because image attachments are shared through the system share sheet (`ImageViewerModal`), and that sheet's "Save Image" action crashes an app that lacks this key.
- **Files: there is no purpose string to add.** The Files picker (`expo-document-picker`) runs out of process and asks for no permission.
- **Microphone:** none (`microphonePermission: false`, as on Android).
- **Face ID:** none (`faceIDPermission: false`). Setu never uses biometrics.

**Other values:**
- **Export compliance:** `ios.config.usesNonExemptEncryption: false`. The app only uses HTTPS through iOS and the OS's SHA-256 (via `expo-crypto`) for PKCE, both of which are exempt.
- **`runtimeVersion: fingerprint` (iOS-7):** an EAS Update only reaches binaries built from the same native code (compliance C2). The alternative is `appVersion`, which needs a manual version bump on every native change.

### 4.3 `eas.json` (written in iOS-1b)

`preview` and `production`, as set out in the iOS-1b brief. No build is run before iOS-7.

```jsonc
{
  "cli": { "version": ">= 24.8.0", "appVersionSource": "local" },
  "build": {
    // TestFlight build for internal testers, pointed at UAT. Store-signed, because TestFlight requires it.
    // The channel takes effect once expo-updates is added (iOS-7).
    "preview":    { "node": "24.18.0", "distribution": "store", "channel": "ios-preview", "env": { "EXPO_PUBLIC_APP_ENV": "UAT" } },
    // ⛔ PLACEHOLDER: refused by scripts/eas-build-guard.js while the PROD URL in src/config/env.ts is empty.
    "production": { "node": "24.18.0", "distribution": "store", "channel": "production",  "env": { "EXPO_PUBLIC_APP_ENV": "PROD" } }
  }
}
```

- **Removed:** the Android outputs, `android.buildType: apk` and `android.buildType: app-bundle` (§5). The name `preview` is kept, but on iOS it means a store-signed TestFlight build instead of an installable APK. An iOS "internal" (ad hoc) build would need every tester's device UDID registered.
- **Shared app record:** `preview` and `production` builds share one bundle ID and one App Store Connect record. Only `production` builds are ever submitted for review.
- **Added in iOS-7:**
  - a pinned build image with Xcode 26 or later (compliance J1);
  - `submit.preview.ios.ascAppId`;
  - a `development` profile, if `expo-dev-client` is approved (D6).
- **Credentials:** the distribution certificate, provisioning profile and App Store Connect API key are created and stored by EAS. None of them enters the repo; `.gitignore` already covers `*.p8`, `*.p12` and `*.mobileprovision`.

### 4.4 `package.json` (and `package-lock.json`)
- **Scripts (iOS-1b):**
  - `"android": "expo start --android"` is replaced by `"ios": "expo start --ios"`.
  - `verify:release-bundle` stays, but its script file arrives in iOS-7 (§3.4).
  - `eas-build-pre-install` runs `scripts/eas-build-guard.js`, which is copied.
- **Dependencies:** none added or removed in iOS-1b. `package-lock.json` is the Android lockfile, unchanged.
- **`@react-navigation/drawer` is unused since iOS-2:** nothing imports it. It stays installed until you approve its removal (D6); the iOS-2 brief did not allow removals.
- **iOS-2 added no package:** `@react-navigation/native-stack` and `@react-navigation/bottom-tabs` (7.21.0) were already dependencies.
- **Keep** `react-native-gesture-handler` (only `App.tsx`'s root view uses it since iOS-2) and `react-native-reanimated` / `react-native-worklets` (NativeWind needs them).
- **Add only with your approval (D6):**
  - `expo-updates`, for EAS Update and the `ios-preview` channel (iOS-7);
  - `expo-dev-client`, for a `development` profile.
- **`eas-cli`:** pin it in `devDependencies` or always run `npx eas-cli@<version>`. Android's RELEASE §1 claims it is pinned, but it is not (§0 drift).
- **`package-lock.json`:** never edited by hand. `npm install` regenerates it when a dependency changes.

### 4.5 Navigation: drawer → tab bar + "More" (built in iOS-2)

**Approved by Ronit on 2026-10-27** (the iOS-2 plan, decisions 1–9 below). It replaces the iOS-1a proposal of four tabs with Approvals in More for every role.

**Tree:**

```
Root (native stack)
├─ Auth   → AuthStack (Login · DevToken in __DEV__ only)
├─ App    → AppTabs (bottom tabs; which ones: appTabs())
│           ├─ HomeTab      → native stack: Home*, Announcements, + records
│           ├─ TicketsTab   → native stack: TicketList*, + records
│           ├─ ApprovalsTab → native stack: ApprovalsInbox*, + records        (ADMIN, AGENT)
│           ├─ AlertsTab    → native stack: Notifications*, + records
│           └─ MoreTab      → native stack: More*, ApprovalsInbox, TaskList, KnowledgeBase, KbArticle,
│                             ServiceCatalog, ServiceRequestForm, ServiceRequestDetail, Announcements, Profile, + records
└─ Sheets (presentation 'modal', above the tabs): CreateTicket, ReplyComposer, StatusClosure, AssignPicker,
   SubmitApproval, TaskEditor, TicketFilters

*       large title (tab roots only)
records TicketDetail, TaskDetail, ApprovalDetail, TicketLink — registered in every tab stack
```

The table is `src/navigation/routes.ts` (`STACK_ROUTES`, `SHEET_ROUTES`, `RECORD_ID_PARAM`, titles). The navigators are built from it, and a compile-time check ties each list to its param list in `src/types/navigation.ts`.

**Tabs by role** (`appTabs()` in `permissions.ts`; pinned by `tests/navigation/shell.test.mjs`):

| Tab | END_USER | AGENT | Triage AGENT | L2_MANAGER | ADMIN |
|---|---|---|---|---|---|
| Home | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tickets | ✅ "My Tickets" | ✅ | ✅ | ✅ | ✅ |
| Approvals | — (More row while ≥ 1) | ✅ | ✅ | — (More row while ≥ 1) | ✅ |
| Alerts | ✅ | ✅ | ✅ | ✅ | ✅ |
| More | ✅ | ✅ | ✅ | ✅ | ✅ |

- The Approvals tab is `hasApprovalsTab()`: the roles for which `drawerItems(role, 0)` already includes Approvals, as in the web nav (`AppLayout.tsx:32`).
- A role's tabs are fixed for the session and never follow a count. HIG, Tab bars: *"Don't disable or hide tab bar buttons, even when their content is unavailable."*
- **Badges** (`tabBadges()`): Alerts = NTF-2 unread; Approvals = APR-1 pending; More = APR-1 pending while the Approvals row is in it. Shown as "99+" past 99, with a VoiceOver label such as "Alerts, 3 unread". They come from the existing queries (`useUnreadCount`, `usePendingApprovals`), observed once in `AppTabs`. No polling.

**More** (`moreSections()`; `src/navigation/MoreScreen.tsx`):

| Section | Rows |
|---|---|
| 1 | Approvals (END_USER and L2_MANAGER while ≥ 1, with badge) · Tasks · Service Request · My Requests |
| 2 | Knowledge base · Announcements |
| 3 | Settings (opens Profile) |
| 4 | Account card (initials, name, role, the country chip for a country-locked AGENT; opens Profile) · Sign out (confirmation, `useSignOut`) |
| Footer | `v<version> · <environment>` (+ "· dev build") |

Every row is a `drawerItems()` row that is not a tab, so no screen has two routes. "My Requests" is new: it opens the same `ServiceCatalog` route with `view: 'requests'`.

**Decisions in the iOS-2 plan (approved 2026-10-27):**

| # | Decision |
|---|---|
| 1 | Approvals for END_USER and L2_MANAGER is a More row while ≥ 1, not a tab; More shows the pending badge (settles D3) |
| 2 | The tab is labelled "Alerts" (Android and web), not "Notifications". The screen's title stays "Notifications", as on Android |
| 3 | React Navigation's own tab bar, which supports `freezeOnBlur`; the native `UITabBar` is reconsidered in iOS-4 (D4) |
| 4 | Record screens open in the tab the person is in |
| 5 | `CreateTicket` is a sheet |
| 6 | My Requests is its own More row |
| 7 | The reinstall check (`installMarker.ts`) is built now |
| 8 | Placeholders exist only in `__DEV__` builds, with sample links; the release bundle is checked for their absence (compliance A2) |
| 9 | "No API calls" = no new endpoint and no polling. The shell uses existing hooks only: NTF-2, APR-1, the country lookup, AUTH-3, AUTH-2 (dev token), AUTH-P2 |

**Behaviour changes from Android** (each is the iOS convention):

| Android | iOS |
|---|---|
| A ticket opened from Home, Alerts, an approval or a task switched to the Tickets tab | It opens in the current tab (the record screens are in every stack) |
| An alert about an approval opened the drawer's Approvals module | It opens `ApprovalDetail` inside Alerts |
| A ticket link in HTML switched to the Tickets tab | It opens in the current tab; under a sheet it is left to the browser |
| `CreateTicket` was pushed, then replaced by the new ticket | A sheet. On success (iOS-3b) it closes and the new ticket opens in the tab underneath |
| The drawer's back history (`backBehavior: 'fullHistory'`) and Android back on a tab root returning to Home | None: there is no back button. Each tab keeps its own stack, and tapping the current tab again returns to its root |
| Home's "Pending approvals" opened the drawer module | It switches to the Approvals tab, or pushes More's Approvals for END_USER and L2_MANAGER (`hasApprovalsTab()`) |
| Home's announcement banner opened the drawer screen | It pushes Announcements inside Home |

Unchanged: Home's KPI tiles switch to the Tickets tab with the named filter. The search box opens `TicketLink` in the Tickets tab. The module screens open from More.

**getId** (`RECORD_ID_PARAM`; `tests/navigation/get-id.test.mjs`):

| Route | `getId` | Stacks |
|---|---|---|
| `TicketDetail` | `ticketId` | all five |
| `TaskDetail` | `taskId` | all five |
| `ApprovalDetail` | `approvalId` | all five |
| `KbArticle` | `slug` | More |
| `ServiceRequestForm` | `itemId` | More |
| `ServiceRequestDetail` | `requestId` | More |

- **No `getId`, on purpose** (`WITHOUT_GET_ID`, as in PERFORMANCE §9.7):
  - `TicketLink` holds no state of its own;
  - `TicketList` and `ServiceCatalog` are list roots;
  - the sheets open only from the screen beneath them and cover everything.
- **Test:** every route whose params name a record (read from `navigation.ts`) is in one list or the other.
- **Randomised run** on the installed `StackRouter`: 2,000 runs × 40 actions per tab stack.
  - With `getId`: **0** screen-reuse events in every stack.
  - Without `getId`: about 7,800–12,900 per stack, which proves the test can detect reuse.

**Files written in iOS-2:**

| File | What |
|---|---|
| `src/navigation/RootNavigator.tsx` | Auth \| App tabs + the root sheets (✕ Close, swipe down). Reinstall check, then `restoreSession()` |
| `src/navigation/AppTabs.tsx` | The tab bar: `appTabs()`, `tabBadges()`, filled Ionicons, brand tint, `freezeOnBlur` |
| `src/navigation/TabStacks.tsx` | One native stack per tab from `STACK_ROUTES`: large title on the root, standard back chevron, `getIdFor()` on every screen, `freezeOnBlur` |
| `src/navigation/MoreScreen.tsx` | The More list |
| `src/navigation/routes.ts` | The route table, getIds, titles, `focusedAppTab()` |
| `src/navigation/navigationRef.ts` | `openTicketLinkInApp` opens in the tab on screen |
| `src/navigation/AuthStack.tsx`, `src/screens/auth/*` | Copied from the port source unchanged |
| `src/screens/placeholders.ts`, `src/screens/DevPlaceholderScreen.tsx` | DEV-only placeholders (§7, compliance A2) |
| `src/store/installMarker.ts` | The reinstall check (§7) |
| `src/types/navigation.ts`, `src/utils/permissions.ts`, `src/utils/deep-links.ts`, `src/components/ScreenHeader.tsx`, `src/screens/PlaceholderScreen.tsx`, `src/store/auth.store.ts`, `App.tsx` | See their rows in §3 |

**For the iOS-3 screens:**
- **Header:** the screen's own `ScreenHeader` goes. Its title and right-hand actions move to the native bar through `navigation.setOptions({ title, headerRight })`.
- **Props types:** `AppDrawerScreenProps`, `MainTabScreenProps`, `TicketStackScreenProps` and `TaskScreenProps` become:
  - the tab-stack props (`HomeStackScreenProps`, `TicketsStackScreenProps`, `ApprovalsStackScreenProps`, `AlertsStackScreenProps`, `MoreStackScreenProps`);
  - `RecordScreenProps` for the record screens;
  - `SheetScreenProps` for the sheets.
- **Opening another screen:** a record opens with a plain `navigation.navigate('TicketDetail', …)`, because every stack has it. Only Home's tiles and its Approvals shortcut switch tab.
- **Registering a screen:** add the built screen to `SCREENS` in `TabStacks.tsx`, or to the sheets in `RootNavigator.tsx`. The placeholder then drops out of that route.

### 4.6 `docs/web-system/02-AUTH.md` (iOS-6)
- **§7.1:** the existing registration `76c6edf5-…` gains the **iOS/macOS platform** for bundle ID `com.mountmeru.servicedesk`, which gives the redirect `msauth.com.mountmeru.servicedesk://auth`. This is an IT ask, the iOS half of A2. No new client ID and no backend change.
- **§7.2:** add the iOS row: `msauth.com.mountmeru.servicedesk://auth` through `ASWebAuthenticationSession`, plus the `preferEphemeralSession` decision (D5).
- **§5.1:** record that `keychainAccessible` is now in the code (`auth.store.ts`).
- **§6:** changes only if §8 is approved.
- **Done in iOS-6 (2026-10-28), differently:** §7.1–§7.6 are left as Android's record, with a pointer at the top of §7. All the iOS content (registration, redirect, the sheet, D5, Keychain, sign-out, bundle proof, device checks) is in a new **§7.7**. The header and §5.1 each gained one iOS line. §6 is unchanged.

### 4.7 `docs/RELEASE.md` (iOS-7)
The file name is kept, because code comments cite "docs/RELEASE.md §6".

| Section | Change |
|---|---|
| Title and status table | "Release guide — Setu (iOS)", with bundle ID, `buildNumber`, iOS SDK and Xcode |
| §1 Profiles | `development` (simulator) / `preview` / `production`. Build guard text unchanged |
| §2 First build | `eas init` for `setu-ios`, then `eas build --platform ios --profile preview`. EAS creates the Apple distribution certificate and provisioning profile instead of a keystore. Then `eas submit` to TestFlight |
| §3 Signing hash for IT | Replaced by the iOS message to IT: bundle ID and redirect `msauth.com.mountmeru.servicedesk://auth`. iOS needs no signature hash |
| §4 APK to testers | Replaced by TestFlight internal testing: who is added, and how builds expire after 90 days |
| §5 Pre-release checklist | Android items (`versionCode`, Play, data safety) replaced by iOS items. Points to `docs/ios/APP-STORE-COMPLIANCE.md` |
| §6 Bundle proof | The iOS bundle (`main.jsbundle`), re-run with the result recorded |
| §7 Assets | Android adaptive-icon and splash geometry removed. iOS icon rules (opaque, 1024 px; optional dark and tinted variants) and the launch screen added |
| §8 Packages | `expo-dev-client`, `expo-updates` |
| §9 State audit | Kept; re-run on iOS in iOS-3 |

### 4.8 `docs/brand/UI-STANDARDS.md` (iOS-4; moved from iOS-2)
- **S1 header:** the native navigation bar (iOS-2): back chevron on pushed screens, a large title and no left button on tab roots, ✕ on sheets. The DEV-only `ScreenHeader` keeps 56 pt until then.
- **S12 navigation chrome:** the drawer is replaced by tab bar + More (§4.5); ripple and elevation removed.
- **§4 large text:** re-checked at iOS Dynamic Type sizes, up to the largest accessibility size (AX5), instead of Android's 130 % / 200 %.
- **§5.2:** the drawer measurements are replaced by the More list.
- **§7:** rewritten for iOS. Every pushed screen swipes back, sheets swipe down, there is no hardware back, and the 25-route table is redone.
- **Unchanged:** colours, contrast (§2, §3), radii and spacing. dp and pt use the same numbers.

### 4.9 iOS-3a: the read screens (built 2026-10-28)

**Approved by Ronit on 2026-10-28** (the iOS-3a plan; decisions 1–4 as recommended). Home, Ticket list and Ticket detail, plus the list's Filters sheet (#3) and the ticket-link resolver (#5), which they open. Notifications (#6) is still a placeholder.

**Write controls are left out until iOS-3b** (`src/utils/phase-gate.ts`, guideline 2.1):
- **The screens are Android's code.** Each write control renders from a role answer (`ticketDetailPermissions()`, `ticketFieldPermissions()`, `bulkActions()`, `inlineStatusTransitions()`), and the gate empties those answers' write parts. The controls are absent: not disabled, and no "coming soon".
- **TicketDetail:** More options (Pick up, Assign…, Close…, Submit for approval…), the status card, Reply / Reply all / Note, Add files, a file's delete button, the task checkbox, Add task, and the five property editors, together with the lock reasons that explain a missing write.
- **TicketList:** the status chip, the long-press selection and its bar, and the "+" button. **Home:** "Raise a ticket" and "+".
- **Reading is complete:**
  - the header, description, properties, requester and resolution;
  - Conversation, with private notes only for ADMIN and AGENT;
  - History;
  - Attachments: images open in the viewer, and other files download to the share sheet;
  - Tasks.
- **Priority:** shown as the badge, with its "Auto" pill when impact × urgency set it. The live preview is part of the impact/urgency editor and returns with it in iOS-3b.
- **iOS-3b:** set `WRITE_CONTROLS` to true, delete the gate and unwrap its calls, then device-check each write. **Done in iOS-3b (§4.11):** the gate and its file are gone; the device checks are listed there.

**Read links to screens that arrive in iOS-3c** keep Android's behaviour. In `__DEV__` builds they open the DEV placeholder, as the tabs and More rows have since iOS-2. No release build exists before iOS-7.
- Home: Pending approvals → `ApprovalsInbox`, and the announcement banner → `Announcements`.
- TicketDetail: a task → `TaskDetail`.

**Android-only code replaced:**

| Android | iOS |
|---|---|
| `ScreenHeader` (drawer, back, close) | The native bar. TicketDetail sets `title` and `headerRight`; TicketFilters sets "Clear all"; the ✕ comes with every sheet |
| `RefreshControl colors` | `tintColor={colors.primary}` |
| `BackHandler` and the red selection bar with `StatusBar light-content` | "N selected", Cancel and "max 20" in the native bar |
| ⋮ `ellipsis-vertical` | `ellipsis-horizontal-circle`, in the bar's tint |
| FAB `shadow-lg` (elevation) | `shadows.fab` |
| `DateTimePickerAndroid.open` | `DatePickerSheet` |
| `share-social-outline` (ImageViewerModal) | `share-outline` |
| `insets.bottom` padding in tab screens | Dropped: the tab bar takes the home-indicator inset |
| `user?.role ?? 'END_USER'` | `navRole(user?.role)` (permissions.ts) |

**Behaviour that differs from Android:**
- Records open in the current tab (§4.5).
- Home's offline and error banners sit inside the scroll view and scroll with it. react-native-screens collapses a large title only against the scroll view on the screen's first-subview chain (`RNSScreen.mm`).
- The ticket list has a standard title (`routes.ts` `hasLargeTitle()`): its pinned search and filter bar would stop a large title from collapsing. iOS-4 can put the search in the navigation bar instead.
- TicketLink's "Go to tickets" switches to the Tickets tab.

**Still to check on a simulator or device** (this is Windows):
- the large-title collapse on Home;
- React Native's `Modal` sheets (OptionSheet, DatePickerSheet) over the Filters page sheet;
- the inline calendar's height on an iPhone SE;
- the selection header and the FAB shadow, in iOS-3b when they are switched on.

**Tests:** 163 → 399.
- `tests/rbac/list-filters.test.mjs`, unchanged.
- `tests/rbac/role-gating.test.mjs`, moved forward from iOS-3c (§3.15).
- `tests/screens/read-screens.test.mjs`, new (§7). Its gate, wiring and Reduce Motion checks were each shown to fail when the code under test was broken on purpose.

### 4.10 iOS-6: Microsoft SSO on iOS (built 2026-10-28)

**Approved by Ronit on 2026-10-28** (the iOS-6 plan, with the recommended answers): D5 `preferEphemeralSession: true`; the bundle's client-secret check matches secret values, not the library's option names; this manifest and compliance rows A2, A4, F2, G1, H3, H6 and K1 updated. Pulled forward ahead of iOS-3b–iOS-5. Ronit reports that Entra has the iOS/macOS platform registered.

**What changed** (the details are in `02-AUTH.md` §7.7):
- `src/config/auth.config.ts`: the redirect `msauth.com.mountmeru.servicedesk://auth` on iOS. Anywhere else, `getAuthRedirectUri()` throws and sign-in shows `not-configured`; there is no Android fallback in this branch. `AUTH_SESSION_OPTIONS` = `{ preferEphemeralSession: true }`.
- `src/api/auth.api.ts`: passes `AUTH_SESSION_OPTIONS` to `promptAsync`; states `codeChallengeMethod: S256`; adds `signOutAndWipe()`.
- `src/hooks/useProfile.ts`: `useSignOut` calls `signOutAndWipe()`.
- Not changed: `app.json` (its `scheme` was already right), `auth.store.ts` (already `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), `LoginScreen.tsx`, `signInAttempt.ts`, `AuthStack.tsx`, `DevTokenScreen.tsx`, `package.json`. No new package and no `eas` command.
- `maybeCompleteAuthSession` is not called. It is a no-op on iOS, and calling it would need `expo-web-browser` as a direct dependency.

**Tests:** 399 → 429.
- `tests/auth/mobile-sso.test.mjs`: line 152 now asserts the iOS URI, and the test also asserts the sheet options.
- `tests/auth/ios-sso.test.mjs`: new, 30 tests (§7).
- **Shown to fail when the code was broken on purpose:**
  - the sheet made non-ephemeral;
  - an `msauth://` redirect;
  - the Keychain class changed to `WHEN_UNLOCKED`;
  - S256 not stated;
  - the wipe made to wait for a successful logout;
  - the 5 s cap removed.

**Release bundle** (`npx expo export --platform ios`, Hermes):
- 0 developer-token strings out of 12 (the dev control has 12/12) and 0 DEV-placeholder strings.
- The iOS redirect is present; `msauth://` and the Android hash are absent.
- No client-secret value. `client_secret` and `clientSecret` occur only in `expo-auth-session`.
- The only host is `uat-servicedesk.mountmerugroup.com`.

**Still to check on a device (iOS-7):** that Entra accepts the redirect, that the sheet returns the code, the real PKCE flow, AUTH-P2 with an iOS ID token, the Keychain across a restart and a reinstall, and the stale banner on real AppState events.

### 4.11 iOS-3b: the write path (built 2026-10-28)

**Approved by Ronit on 2026-10-28** (the iOS-3b plan). The phase rule: behave exactly as the web portal does, with only the interface iOS, except for the 17 🔒 SAFER divergences in `docs/WEB-VS-MOBILE-ROLES.md` §5, plus one more Ronit added: no attachments on a private note (05 §C.26).
- Q1: bulk exactly as Android `c84d53a`, with no new stop rule.
- Q2: "Add task" comes back; it opens the TaskEditor DEV placeholder until iOS-3c.
- Q3: `getId` on the reply, status, submit-for-approval (ticket id) and assign (ticket ids) sheets.
- Q4: the toast replacement is named `SuccessNotice`.

**What was built:**
- **The five write sheets,** ported from `c84d53a` (byte-identical first, then adapted): CreateTicket, ReplyComposer, StatusClosure, AssignPicker, SubmitApproval. They are registered as root page sheets in `RootNavigator.tsx`.
- **TicketPropertyEditors** opens (G1 property editing and the inline technician).
- **The phase gate (§4.9) is deleted.** TicketDetail, TicketList and Home render Android's write controls from the same role answers:
  - the status card and More options;
  - Reply, Reply all and Note;
  - Add files, and deleting a file;
  - the task checkbox and Add task;
  - the five property editors;
  - the list's status chip, selection and bulk bar;
  - "Raise a ticket" and "+".
- **No new package, no `eas` command, no API change, no auth or SSO change.**

**iOS adaptations (interface only):**

| Control | Android | iOS |
|---|---|---|
| More options (M4) | OptionSheet | ActionSheetIOS listing exactly `ticketDetailPermissions().moreActions`, Cancel last |
| A list card's status chip (M3) | OptionSheet | ActionSheetIOS listing exactly `inlineStatusTransitions()`; Canceled in red; a closing status opens M6 |
| Impact and urgency (M8, G1 editor); the closure code (M6) | OptionSheet | ActionSheetIOS (`utils/actionSheet.ts`). The G1 editor offers the four real values, as before; create keeps "Not set" |
| Categories, groups, countries, people, approvers | OptionSheet, PersonPickerSheet | Unchanged: long server lists, which an action sheet doesn't suit |
| Attachment source | Three buttons | One "Add attachment" button → Take Photo · Photo Library · Choose File. A refused camera offers "Open Settings" |
| Destructive confirmations | Alert | Alert, destructive style:<br>- delete a file;<br>- close or cancel through the closure form;<br>- remove an assignment;<br>- bulk pick up, assign and close;<br>- drop staged files to write a note |
| Success notice | ToastAndroid | `SuccessNotice` (§7), read out by VoiceOver |
| Header | `ScreenHeader` | The native sheet bar: ✕, and the title through `setOptions` ("Reply · #1234") |
| Keyboard | `KeyboardAvoidingView` `padding` | `SheetKeyboardView`: `padding` plus the offset a page sheet needs. In a sheet, a tap outside an input or a drag down puts the keyboard away. M4's list uses `automaticallyAdjustKeyboardInsets` for the inline resolution editor |
| FCR switch | `thumbColor` white | iOS's own white thumb (`thumbColor` is Android-only) |
| New ticket | `replace('TicketDetail')` | The sheet closes, and the ticket opens in the tab underneath (`tabUnderSheets()`, `popTo('App', …)`) |
| `user?.role ?? 'END_USER'` | | `navRole()`; CreateTicket's role list moved to `utils/assignment.ts` (screens name no role) |

**Behaviour that differs from Android:**
1. **No files on a private note (05 §C.26).**
   - Android still offers them, with a note saying "Files are added to the ticket, not to this note" (ROLE-MATRIX §8 item 1, open there).
   - iOS hides the picker in Note mode, and asks before dropping staged files when switching to Note.
   - `sendComment` and `createComment` both refuse a note with files before anything is sent.
   - The note's help text now says why.
2. **One sheet per ticket.** The write sheets have `getId` (Q3). Android's sheets had none; React Navigation 7 reuses the sheet on top when the same route opens with other params.
3. **StatusClosure takes "may change status", the transitions and the lock from `permissions.ts`.** Android read them from `ticket-rules.ts`. The answers are the same, proved for every role (unknown role included) and status in `write-screens.test.mjs`.
4. **Everything else in the write path is Android's:** bulk and its stop rule (Q1), the guards, the requests, the confirmations' wording.

**Where iOS differs from the web on the write path, with the reason:**

| Web | iOS (= Android unless noted) | Reason |
|---|---|---|
| L2_MANAGER gets group and technician pickers on create | ADMIN, AGENT only | 🔒 SAFER: 403 (`GET /teams`, `/users/search`) |
| AI assistant on create; AI summary and draft reply | Not built | 🔒 SAFER: §C gaps C.5, C.24, C.25 |
| Change status to any status from a drop-down | The transition map only (status card, status sheet, list chip) | 🔒 SAFER: §A rule (05 §A.1) |
| L2_MANAGER: Pick up, Assign/Reassign/Remove, Move to group | Hidden; the sheet and the guard refuse | 🔒 SAFER: 403 (`POST /tickets/:id/assign` is `agentOrAdmin`) |
| The requester edits the resolution | Value only | 🔒 SAFER: §C gap C.5 |
| L2_MANAGER and END_USER write an "internal" note | Not offered; refused on the device | 🔒 SAFER: leak C.27 (sent as a public email) |
| A private note can carry files | **No files on a note (iOS-3b)** | 🔒 SAFER (added by Ronit for iOS-3b): leak C.26 (note files visible to the requester and L2_MANAGER) |
| The requester adds, ticks or removes tasks | Read-only for END_USER | 🔒 SAFER: §C gap C.3 |
| Any page by address | Each write sheet refuses a role it is not for | 🔒 SAFER: 403 / leak (ROLE-MATRIX §1) |
| END_USER and L2_MANAGER see "Submit for approval"; END_USER sees a file's delete button | Hidden; refused on the device | The web control always gets 403 (counted ✅ SAME in WEB-VS-MOBILE-ROLES §5, not 🔒) |
| No status chip on list cards | A status chip on list cards (staff), same rules and call | ➕ MOBILE ONLY, from Android (not a 🔒 row) |
| No bulk actions | Select up to 20: Pick up, Assign, Close | ➕ MOBILE ONLY, from Android; kept on Ronit's brief and Q1 (not a 🔒 row) |
| No requester field on create | "Raise on behalf" for ADMIN and AGENT | ➕ MOBILE ONLY, from Android; awaits Ronit (ROLE-MATRIX §8 item 4; not a 🔒 row) |
| END_USER: Reply all and To/Cc | Staff only | ⊘ OUT OF SCOPE, from Android: TKT-9 has no access check (05 C.1; ROLE-MATRIX §8 item 6). Not a 🔒 row, though its ground is a §C gap |
| Mode, level and source on create | Not offered; `source` is "API" | ⊘ OUT OF SCOPE: the server drops mode and level (05 B.13) |
| A plain AGENT changes the ticket's country | Locked, with the reason | ⊘ OUT OF SCOPE: Ronit decided in G2 (05 §A.12) |
| Print, duplicate, delete, "email the technician", tags, problem/change links | Not offered | ⊘ OUT OF SCOPE |
| Rich-text composer; templates keep formatting and images | Plain text; a template's images are left out and the composer says so | 05 §A.16 (plain-text composer); no inline base64 images (01 §0.1) |
| G1 impact/urgency "Not Set" (saves nothing) | Not offered | It does nothing on the web (G1 §6) |
| Submit for approval: "until all approvers respond"; blank comments sent as `''` | Says what the server does (05 B.35); blank comments left out | The web's wording is wrong (G3 §4); same stored meaning |
| Some writes unconfirmed (e.g. a status change, Pick up) | Every irreversible write asks first, naming who is emailed | Android's rule (`utils/dialogs.ts`): writes that email people can't be undone |
| No re-read before writing | Status changes and assignments re-read the ticket's status first (one GET) | The server accepts any transition (05 B.2); a stale status could reopen a closed ticket |
| Offline writes fail at the network | Refused on the device, never queued | `writeGuards.requireOnline` |

**Safety rules → tests** (each was broken on purpose and the tests failed, then restored byte for byte):

| Rule | Tests |
|---|---|
| Status only via POST `/status` | `write-screens`: one POST to `/status`; no role's PUT carries `status`; only two callers of TKT-6, the loop after both guards. Broken: `status` in a PUT allow-list → caught |
| No files on a private note | `write-screens`: `sendComment` and `createComment` refuse with nothing sent; no picker in Note mode. Broken twice (the hook, the composer) → caught |
| No internal note for L2_MANAGER or END_USER | `write-screens`, `role-gating`, `g3-features`: modes per persona; refused with nothing sent |
| No Assign for L2_MANAGER | `write-screens`, `technician-editor`, `role-gating`: no Pick up or Assign in any status; refused before the status read. Broken (Assign for everyone) → caught |
| Bulk: max 20, sequential, Android's stop rule, per-ticket results | `write-screens`: 21 refused unsent; in flight at most 1; 403 continues; 401, 429, 5xx, timeout and network stop; Stop and offline. Broken (stop on any error) → caught |
| One sheet per ticket | `get-id`: per sheet, B opens a new sheet over A (and without getId, A's sheet takes B); 2,000 × 40 random runs: 0 reuse with getId, some without. Broken (no getId) → caught |
| Non-JSON 200 is an error | `write-screens`: 8 write calls reject a 200 `text/html`; HTML labelled JSON; through the hooks; notices only after the write resolves. Broken (both client checks) → caught |
| Role decisions from `permissions.ts` | `role-gating` (Android's three rows plus two), `shell` (no role string), `write-screens` (StatusClosure equals Android's answers). Broken (`canChangeStatus` in StatusClosure) → caught |
| Action sheets list exactly `permissions.ts`'s answers | `write-screens`: per persona, spelled out, and every persona × status × assignee. Broken twice (an extra transition, Assign for all) → caught |
| Destructive confirmations | `write-screens`: Alert styles; every destructive site. Broken (delete not destructive) → caught |
| Success notice, not Alert or toast | `write-screens`, `read-screens`. Broken (`Alert` in `notify`) → caught |

**Tests:** 429 → 731.
- New: `write-screens` (93).
- Copied from `c84d53a`, expectations unchanged:
  - `g3-features`, `g5-audit` and `technician-editor` (198 together);
  - `role-gating` (+6).
- Grown: `get-id` (12 → 19).
- Rewritten for the removed gate: `read-screens` (49 → 47).
- Sum: 93 + 198 + 6 + 7 − 2 = 302 new.

**Release bundle** (`npx expo export --platform ios`, Hermes, with its source map; the export was deleted afterwards):
- **0 developer-token strings** (6 searched), **0 test-login markers**, **0 DEV-placeholder strings**. The placeholder, phase-gate and developer-token modules are not bundled.
- **Present:** Send Reply, Save Note, Create ticket, Choose a different status, Add attachment, Take Photo, Remove and write a note, Submit for approval?, Not available for your role, and the status sheet's message.
- **`ToastAndroid` and `DateTimePickerAndroid`:** no app code mentions either. One app comment does (`DatePickerSheet.tsx` line 1). The bundle's occurrences come only from library code:
  - React Native's lazy `index.js` getter, which runs only if the property is read;
  - the iOS fallbacks (`ToastAndroidFallback.js`, datetimepicker's `DateTimePickerAndroid.js`), which only warn;
  - FlashList comments.

**Still to check on a device (iOS-7):**
- every sheet over the tabs, with the keyboard up (including an iPhone SE);
- the composer's Send button above the keyboard;
- swipe-down with unsent input;
- the action sheets, including the status sheet's 9 choices plus Cancel;
- Camera, Photos and Files;
- the success notice over a closing sheet, and with VoiceOver;
- the bulk progress sheet;
- the new ticket opening in each tab;
- React Native `Modal` sheets (OptionSheet, PersonPickerSheet) over the page sheets.

**Open for iOS-3c:** TaskEditor is still the DEV placeholder. In a release build, "Add task" would open an empty sheet, so iOS-3c must build it before any release build (iOS-7; compliance A2).

## 5. SKIP

Whole files:

| File | Reason |
|---|---|
| `assets/adaptive-icon-background.png` | Android adaptive-icon layer; iOS has no adaptive icons |
| `assets/adaptive-icon.png` | Android adaptive-icon foreground and themed (monochrome) layer |
| `src/navigation/AppTabBar.tsx` | (iOS-2) A custom bar so the tabs could sit under the drawer's screens. iOS has no drawer, and the tab navigator's own bar stays on every pushed screen (§4.5) |

Android-only parts of ADAPT files, not brought over:

| Where | Part | Reason |
|---|---|---|
| `app.json` | `android` block, including `versionCode`, `adaptiveIcon`, `allowBackup`, `blockedPermissions` | Android manifest settings. The iOS counterparts are in §4.2 and §3.11 |
| `app.json` | `msauth` in `scheme` | The Android MSAL redirect form. On iOS it would claim every `msauth://` link (11-SSO-VERIFY §4.2) |
| `app.json` | `extra.eas.projectId` `86788b11-…` | Android's EAS project. iOS gets its own (`setu-ios`) |
| `eas.json` | Every `android.buildType` (the APK `preview` and the AAB `production`) | APK/AAB outputs. The iOS `preview` profile builds for TestFlight instead |
| `src/config/auth.config.ts` | The `msauth://com.mountmeru.servicedesk/<hash>` redirect | Android signature-hash redirect |
| `docs/RELEASE.md` | §2–§4 (keystore, SHA-1 → Base64 hash for Entra, APK sideloading) and the §7 adaptive-icon geometry | Android signing and distribution |
| `package.json` | `"android"` script | Android launcher |
| Not in the repo | `android/` native folder, `*.jks`, `*.keystore`, `google-services.json` | Generated or secret. Already git-ignored, never present |

## 6. SCREEN — porting order: iOS-3a read → iOS-3b write → iOS-3c modules

**Applies to every screen:**
- **Pull to refresh:** add `tintColor={colors.primary}` to `RefreshControl`, because iOS ignores the Android `colors` prop.
- **Keyboard:** `KeyboardAvoidingView` `behavior="height"` → `"padding"` (iOS).
- **Header:** the native navigation bar (§4.5). The screen's own `ScreenHeader` is removed; its title and right-hand actions move to `navigation.setOptions({ title, headerRight })`.
- **Opening screens:** a record opens in the current tab with a plain `navigation.navigate('TicketDetail', …)`, because every tab stack has it. A sheet opens with `navigation.navigate('<Sheet>', …)`, which reaches the root stack. Only Home's tiles and Approvals shortcut switch tab (§4.5).
- **Registering:** the built screen replaces the placeholder in `TabStacks.tsx` (`SCREENS`) or `RootNavigator.tsx` (sheets).
- **Text inputs:** `textAlignVertical` is Android-only. iOS already top-aligns multiline inputs, so it is left in place harmlessly.
- **Tests:** a screen is done when the tests that read it pass (§3.15).

| # | Screen | iOS changes beyond the common ones |
|---|---|---|
| **iOS-3a — Read** | | |
| 1 | `dashboard/HomeScreen.tsx` | The KPI tiles keep `navigate('TicketsTab', { screen: 'TicketList', … })`. A recent ticket pushes `TicketDetail` inside Home. Create opens the `CreateTicket` sheet. "Pending approvals" goes to `ApprovalsTab`, or to More's `ApprovalsInbox` when `hasApprovalsTab()` is false. The banner pushes `Announcements` inside Home (§4.5). Check the FAB `shadow-lg` and the KPI tiles at large Dynamic Type sizes (UI-STANDARDS §5.1 measured Android only). **Built in iOS-3a (§4.9):** the FAB's shadow is the `shadows.fab` token; the offline and error banners moved inside the scroll view so the large title collapses; "Raise a ticket" and the FAB wait for iOS-3b. **iOS-3b:** both back |
| 2 | `tickets/TicketListScreen.tsx` | The `BackHandler` that clears the selection is removed. iOS has no hardware back, so the selection bar gets a visible **Cancel** (Done) button. The `StatusBar` `light-content` during selection works unchanged (verify). **Built in iOS-3a (§4.9):** the selection shows in the native bar ("N selected", Cancel), so the `StatusBar` and Android's red bar are gone; a standard title, because the search and filter bar is pinned; the status chip, selection and FAB wait for iOS-3b. **iOS-3b:** all three back; the chip opens an action sheet |
| 3 | `tickets/TicketFiltersScreen.tsx` | `DateTimePickerAndroid.open` → `DatePickerSheet` (§7). It still sends the device's calendar day. **Built in iOS-3a (§4.9):** a root page sheet; "Clear all" in the bar's right side |
| 4 | `tickets/TicketDetailScreen.tsx` | The ⋮ (`ellipsis-vertical`, the Android overflow mark) → `ellipsis-horizontal-circle`, the iOS "more" mark. It imports `TicketPropertyEditors`, so that file comes along (its write paths are checked at #11). **Built in iOS-3a (§4.9):** read-only; the title and More options are in the native bar. **iOS-3b:** every write back; More options is an action sheet; the list keeps an inline editor above the keyboard |
| 5 | `tickets/TicketLinkScreen.tsx` | None expected. `Linking.openURL` opens Safari. **Built in iOS-3a (§4.9):** "Go to tickets" switches to the Tickets tab's list |
| 6 | `notifications/NotificationsScreen.tsx` | A tap pushes `TicketDetail` or `ApprovalDetail` inside Alerts, instead of switching module (§4.5) |
| **iOS-3b — Write** | | |
| 7 | `tickets/CreateTicketScreen.tsx` | Now a sheet: on success it closes and the new ticket opens in the tab underneath. Android's `replace('TicketDetail')` can't cross the sheet. On a device, check attachments from Camera, Photos and Files. **Built in iOS-3b (§4.11):** `popTo('App', …)` into `tabUnderSheets()`; impact and urgency as action sheets |
| 8 | `tickets/ReplyComposerScreen.tsx` | Common changes only. **Built in iOS-3b (§4.11):** no files on a private note (05 §C.26), stricter than Android |
| 9 | `tickets/StatusClosureScreen.tsx` | `Switch` `thumbColor` is Android-only. iOS keeps a white thumb; the red `trackColor` is fine (verify). **Built in iOS-3b (§4.11):** `thumbColor` dropped; the closure code as an action sheet; the role gate from `permissions.ts` |
| 10 | `tickets/AssignPickerScreen.tsx` | None expected. Check it on a device. **Built in iOS-3b (§4.11):** the common changes only |
| 11 | `tickets/TicketPropertyEditors.tsx` | Check the inline editors with the keyboard up. Copied unchanged in iOS-3a with TicketDetail; iOS-3b removes the phase gate that keeps its editors closed (§4.9). `accessibilityLiveRegion` on the priority preview is Android-only: VoiceOver needs `AccessibilityInfo.announceForAccessibility` (iOS-4). **Built in iOS-3b (§4.11):** the gate is gone; impact and urgency as action sheets |
| 12 | `tickets/SubmitApprovalScreen.tsx` | Common changes only. **Built in iOS-3b (§4.11)** |
| **iOS-3c — Modules** | | |
| 13 | `approvals/ApprovalsInboxScreen.tsx` | The Approvals tab's root (ADMIN, AGENT), or pushed from More (END_USER, L2_MANAGER) |
| 14 | `approvals/ApprovalDetailScreen.tsx` | `KeyboardAvoidingView` `"height"` → `"padding"`. `navigate('MainTabs' …)` becomes `navigate('TicketDetail', …)` in the same stack. "Back to approvals" pops to `ApprovalsInbox`, or goes back when the approval was opened from Alerts |
| 15 | `tasks/TaskListScreen.tsx` | Common changes only |
| 16 | `tasks/TaskDetailScreen.tsx` | `navigate('MainTabs' …)` becomes `navigate('TicketDetail', …)` in the same stack; it still goes back when the ticket is underneath |
| 17 | `tasks/TaskEditorScreen.tsx` | `DateTimePickerAndroid.open` → `DatePickerSheet`. `KeyboardAvoidingView` `"height"` → `"padding"` |
| 18 | `knowledge/KnowledgeBaseScreen.tsx` | Common changes only |
| 19 | `knowledge/KbArticleScreen.tsx` | Common changes only |
| 20 | `catalog/ServiceCatalogScreen.tsx` | The `BackHandler` that leaves an open category or search first is removed. Instead there is a visible in-screen "Catalogue" back control (the web's Home breadcrumb). The iOS swipe-back leaves the catalogue, as iOS users expect. Two `RefreshControl`s |
| 21 | `catalog/ServiceFormFieldInput.tsx` | `DateTimePickerAndroid.open` → `DatePickerSheet` |
| 22 | `catalog/ServiceRequestFormScreen.tsx` | Common changes only |
| 23 | `catalog/ServiceRequestDetailScreen.tsx` | Common changes only |
| 24 | `dashboard/AnnouncementsScreen.tsx` | Registered in the Home and More stacks. `AppDrawerScreenProps` → props that fit both |
| 25 | `profile/ProfileScreen.tsx` | `AppDrawerScreenProps` → `MoreStackScreenProps`. `KeyboardAvoidingView` `"height"` → `"padding"`. Adds a **Privacy policy** link and the **account-deletion** entry (compliance H1, H6; content depends on D10). The Theme setting stays unbuilt (light only) |

## 7. iOS-only additions

**New files, none of which exist on Android:**

| New file | Phase | Purpose |
|---|---|---|
| `docs/ios/00-PORT-MANIFEST.md` | iOS-1a | This file |
| `docs/ios/APP-STORE-COMPLIANCE.md` | iOS-1a | Apple checklist |
| `docs/ios/UAT-TEST-PLAN-IOS.md` | iOS-7 | iOS test steps: TestFlight install, back swipe, sheets, Dynamic Type, VoiceOver |
| `src/navigation/routes.ts` | iOS-2 (built), iOS-3b | The route table: each tab stack's routes, the sheets, `getId` per record route, titles, and `focusedAppTab()` (§4.5). Plain data, read by the navigators and the tests. **iOS-3b:** `SHEET_ID_PARAM` (getId for the four write sheets) and `tabUnderSheets()` |
| `src/navigation/AppTabs.tsx`, `src/navigation/TabStacks.tsx`, `src/navigation/MoreScreen.tsx` | iOS-2 (built) | The tab bar, one native stack per tab, and the More list. They replace `AppDrawer`, `MainTabs`, `AppTabBar`, `DrawerContent`, `TicketStack` and `ModuleStacks` (§3.9) |
| `src/screens/placeholders.ts`, `src/screens/DevPlaceholderScreen.tsx` | iOS-2 (built); deleted in iOS-3c | ⚠ DEV ONLY. What a route renders until its screen is ported: the route, its params and sample links, marked "DEV PLACEHOLDER — replaced in iOS-3". Bundled only in `__DEV__` builds; checked absent from the release bundle (compliance A2) |
| `tests/navigation/shell.test.mjs`, `get-id.test.mjs`, `deep-links.test.mjs` | iOS-2 (built) | Tabs, More rows and badges per persona; no role string in navigators, screens or components; `getId` coverage and the randomised `StackRouter` runs; ticket-link parsing and where a link opens |
| `src/components/DatePickerSheet.tsx` | iOS-3a (built) | The native iOS date picker (`@react-native-community/datetimepicker`, inline) in a sheet with Done/Cancel. Replaces `DateTimePickerAndroid.open` in three screens and returns the same value. Used by TicketFilters since iOS-3a; TaskEditor and ServiceFormFieldInput follow in iOS-3c |
| `src/components/SuccessNotice.tsx`, `src/utils/successNotice.ts` | iOS-3b (built) | Planned as `Notice.tsx`; named `SuccessNotice` (Ronit, iOS-3b plan Q4) because `Form.tsx` already exports a `Notice`. A short, non-modal capsule at the top of the screen after a write, gone after 3 s, taking no touches, read out by VoiceOver (`announceForAccessibilityWithOptions`, queued), no fade under Reduce Motion. `notify()` calls it; `SuccessNoticeHost` is mounted once in `RootNavigator` |
| `src/utils/phase-gate.ts` | iOS-3a (built); **deleted in iOS-3b** | The write gate (§4.9): `WRITE_CONTROLS = false` and `readOnlyDetail()`, `readOnlyFields()`, `readOnlyActions()`, which empty the role answers' write parts so the read screens offer no write |
| `src/utils/actionSheet.ts` | iOS-3b (built) | `chooseFromActionSheet()` over ActionSheetIOS (Cancel last, destructive in red, the brand tint), `moreActionChoices()` and `transitionChoices()`, which only label what `permissions.ts` returns |
| `src/components/SheetKeyboardView.tsx` | iOS-3b (built) | `KeyboardAvoidingView` `padding` with the offset a page sheet needs (its position on screen, `measureInWindow`), for the write sheets |
| `tests/screens/write-screens.test.mjs` | iOS-3b (built) | 93 tests: the action sheets per persona and status, the destructive confirmations, the success notice, each safety rule, the sheets on iOS (§4.11) |
| `src/theme/shadows.ts` | iOS-3a (built) | `shadows.fab`: shadowColor, shadowOffset, shadowOpacity and shadowRadius from the palette, for the floating "+" button (Android: `shadow-lg` / elevation) |
| `tests/screens/read-screens.test.mjs`, `tests/support/stubs/react-native.mjs` | iOS-3a (built), iOS-3b | No write reachable in iOS-3a; Reduce Motion (a stand-in for AccessibilityInfo); the 500 cap; Home tiles per role; no Android-only API or colour literal; registration and large titles (§4.9). **iOS-3b:** the gate checks became "the writes render from Android's answers"; `ToastAndroid` and `thumbColor` added to the Android-only list; the stub also records ActionSheetIOS, Alert and VoiceOver announcements |
| `tests/auth/ios-sso.test.mjs` | iOS-6 (built) | Microsoft sign-in on iOS (§4.10):<br>- the exact redirect and its match with the `app.json` scheme;<br>- no `msauth://` in `src/`, and other platforms refused;<br>- PKCE S256, the scopes, the fixed IDs, and no client secret in `src/` or the requests;<br>- the ephemeral sheet, and every cancel path ending without a banner;<br>- the 401 and 403 copy;<br>- `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` on every Keychain call;<br>- sign-out: AUTH-3, then the Keychain, query cache and UI store wiped, even when logout fails or hangs;<br>- the `name` and `department` lessons, and the `__DEV__` gate on the developer-token screen.<br>`tests/support/stubs/react-native.mjs` gains `Platform.OS` ('ios', with a setter) |
| `src/store/installMarker.ts` | iOS-2 (built) | **iOS Keychain items survive uninstall.** On the first launch after an install, no marker file exists in the app container yet. In that case, wipe the three `mmg.session.*` keys and write the marker. A reinstalled app then never starts signed in to a session from before it was deleted |

**iOS identity and settings** (the values are in §4.2 and §4.3):

| Item | Value |
|---|---|
| Bundle ID | `com.mountmeru.servicedesk` |
| Display name | Setu |
| Devices | `supportsTablet: false` (iPhone only) |
| `Info.plist` purpose strings | Camera, photo library, photo-library add. No Files string exists (§4.2) |
| Export compliance | `ITSAppUsesNonExemptEncryption` = `false` |
| EAS | Separate project `setu-ios` |
| EAS Update | Channel `ios-preview` (TestFlight); `production` reserved |
| TestFlight | `preview` build profile |
| Privacy manifest | Declared in `app.json` (`ios.privacyManifests`) in iOS-7 |

## 8. Pre-SSO sign-in on TestFlight — PROPOSAL (nothing built)

### 8.1 The problem
- TestFlight builds are release builds, so `__DEV__` is false.
- The developer-token screen is compiled out of release builds: `AuthStack` `require`s it only inside `__DEV__`, and `verify-release-bundle` proves it is absent.
- Microsoft SSO arrives in iOS-6, before the first TestFlight build (iOS-7) since the 2026-10-28 renumbering.
- So the gap exists only if IT has not registered the iOS redirect (§8.5) by iOS-7: then **no tester can sign in** to a TestFlight build until it is registered.

### 8.2 The rules it runs into
`02-AUTH.md` §6 and `CLAUDE.md` rule 5 forbid three things:
- calling `/auth/test-login` or embedding `TEST_AUTH_SECRET`;
- asking users to paste a token, with one exception: the `__DEV__`-only developer-token screen;
- any secret in the app.

Any TestFlight test login therefore needs **your written amendment to 02 §6 and CLAUDE.md rule 5**. This section is the content of that amendment.

### 8.3 Proposal: the existing developer-token screen, unlocked by a build flag
**For the tester:**
1. Sign in to the UAT web portal on a computer.
2. Copy the `sd_session` value, as for the developer-token screen today.
3. Paste it into the app.

**What the app does:** checks the token with one `GET /auth/me` (AUTH-2) and stores the account the server returns. This is the existing `DevTokenScreen` code path: no new endpoint, and no secret in the app.

**The flag:**
- `EXPO_PUBLIC_UAT_TEST_LOGIN=1`, set only in the `preview` and `development` profiles.
- In code, the screen is available when `(__DEV__ || flag === '1') && APP_ENV === 'UAT'`.

**Five locks make it impossible in production:**

| # | Lock | Where |
|---|---|---|
| L1 | The `production` profile never sets the flag | `eas.json` |
| L2 | The build guard refuses any build with the flag set when the profile is `production` or `EXPO_PUBLIC_APP_ENV` is `PROD`. It fails in seconds, before compiling | `scripts/eas-build-guard.js` |
| L3 | At runtime, the flag counts only when `APP_ENV` is UAT. A PROD bundle can't show the screen even if the flag leaks into it | `src/config/env.ts` |
| L4 | The `require` sits inside `__DEV__ \|\| process.env.EXPO_PUBLIC_UAT_TEST_LOGIN === '1'`. Expo inlines that at build time, so a bundle built without the flag does not contain the module. `verify-release-bundle` on the `production` configuration must find 0 developer-token strings | `AuthStack.tsx`, `verify-release-bundle.js` |
| L5 | `eas update` does not run the build guard. So updates to `production` are published only by a script that sets `APP_ENV=PROD`, unsets the flag and runs `verify-release-bundle` first. `ios-preview` updates are built with the `preview` environment | iOS-7 script and RELEASE |

**Also:**
- The Login screen shows "UAT test build — test sign-in on".
- Flagged builds go to **TestFlight internal testers only**, never to external groups, and are never submitted for App Review.

**Files it would change (iOS-7):**
- `eas.json`, `src/config/env.ts`, `src/navigation/AuthStack.tsx`;
- `src/screens/auth/LoginScreen.tsx` (the condition on the developer button);
- `src/screens/auth/DevTokenScreen.tsx` (its `if (!__DEV__)` self-guard switches to the same availability check);
- `scripts/eas-build-guard.js`, `scripts/verify-release-bundle.js` (a second run on the `preview` configuration, where the strings are expected);
- `02-AUTH.md` §6, `CLAUDE.md` rule 5, `docs/RELEASE.md`.

**Removal:** the flag, the screen and the route are deleted under the existing release-checklist item "Developer-token screen removed", once SSO works (iOS-6 → iOS-9).

**Risks:**
- A tester handles a live 8-hour UAT session token and moves it from the computer to the phone. Clipboard only; never chat or email.
- Never a PROD token (05 C.12): UAT and PROD share hardware, and possibly Redis (00 B7).
- Clumsy for non-technical testers.

### 8.4 Rejected
`/auth/test-login` with `TEST_AUTH_SECRET` in the app. It puts a UAT skeleton key in every IPA, and any TestFlight tester can extract it. 02 §6 forbids it, and the bundle check rejects its strings.

### 8.5 Recommended first: pull the iOS half of A2 forward, so no test login is needed
- AUTH-P2 is already live on UAT, and the Entra registration exists.
- iOS needs only two things:
  1. IT adds the iOS platform (bundle ID `com.mountmeru.servicedesk`) to registration `76c6edf5-…`;
  2. the iOS-6 changes to `app.json` `scheme` and `auth.config.ts` (§3.7).
- The renumbered roadmap (§2) already runs iOS-6 before the first TestFlight build (iOS-7). If IT does item 1 by then, §8.3 is never built.

**Recommendation:** send IT that ask now. Build §8.3 only if the registration can't be ready in time.

## 9. Decisions for you

| # | Decision | My recommendation |
|---|---|---|
| D1 | Phase map (§2) | **Decided 2026-10-27; renumbered 2026-10-28:** iOS-1 foundation … iOS-9 App Store submit, with the first EAS build moved to iOS-7 (§2) |
| D2 | Pre-SSO sign-in (§8) | Ask IT for the iOS redirect now (§8.5). Approve §8.3 only as the fallback |
| D3 | Pending-approvals badge on the More tab, as well as on its row | **Decided 2026-10-27 (iOS-2 plan #1):** yes, for END_USER and L2_MANAGER, whose Approvals is a More row. ADMIN and AGENT have the Approvals tab and its badge |
| D4 | Tab bar: keep the custom bar, or switch to the native iOS tab bar (Liquid Glass on iOS 26) | **Decided for v1 on 2026-10-27 (iOS-2 plan #3):** React Navigation's own bar, which supports `freezeOnBlur`. Android's custom bar is not ported. The native bar (`@react-navigation/bottom-tabs/unstable`, already installed) is reconsidered in iOS-4 |
| D5 | `preferEphemeralSession` for Microsoft sign-in | **Decided 2026-10-28 (iOS-6 plan):** yes. Built in `AUTH_SESSION_OPTIONS`; trade-off in `02-AUTH.md` §7.7 |
| D6 | Packages: add `expo-updates` and `expo-dev-client`; remove `@react-navigation/drawer`; pin `eas-cli` | Approve all four |
| D7 | EAS owner for `setu-ios` (`ronitpc`, as for Android?), and the Apple Developer team | Your call |
| D8–D11 | Distribution route, dark mode, account deletion, App Store name | See `APP-STORE-COMPLIANCE.md` |
