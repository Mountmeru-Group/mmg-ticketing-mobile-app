# 00 — iOS port manifest (Phase iOS-1a)

> This phase is planning only. No code is copied, nothing is installed, and no `eas` command is run.
> Written on 2026-10-27 on branch `ios-dev`. The App Store side is in `APP-STORE-COMPLIANCE.md`, in this folder.

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
| **SCREEN** | A screen file, ported in iOS-4 in the order of §6 |

Rules used:
- **An Android comment alone does not make a file ADAPT.** Comments such as "Android back", "APK" or "Keystore" are corrected the next time the file changes for a real reason.
- **Docs that record Android history are KEEP, verbatim.** iOS differences go in `docs/ios/`. A doc is ADAPT only if a future session would follow it as an instruction and get iOS wrong: `CLAUDE.md`, `docs/RELEASE.md`, `docs/brand/UI-STANDARDS.md` and `docs/web-system/02-AUTH.md`.
- **Exceptions to the brief's KEEP folders.** These files are in folders the brief marks KEEP, but each needs a real iOS change, so each is ADAPT and its row says why:
  - `src/api/auth.api.ts`, `src/config/auth.config.ts`, `src/store/auth.store.ts`, `src/types/navigation.ts`, `src/utils/dialogs.ts`;
  - `scripts/verify-release-bundle.js`;
  - `tests/auth/mobile-sso.test.mjs`, `tests/rbac/role-gating.test.mjs`, `tests/rbac/service-catalog.test.mjs`.
- **The pre-SSO test login (§8) is not counted here.** It is a proposal, so the classification below covers only what the port itself needs. §8 lists the files the test login would change if it is approved.

**Totals: KEEP 176 · ADAPT 27 · SKIP 2 · SCREEN 25 = 230.**

## 2. Phase map (proposed)

iOS-1a, iOS-4 and iOS-7 come from the brief. **The other phases are my proposal and need your OK**: the "Phase" columns in both documents use them.

| Phase | Content |
|---|---|
| **iOS-1a** | These two documents |
| iOS-1b | Copy every KEEP file marked iOS-1b |
| iOS-2 | Project setup: `app.json`, `eas.json`, `package.json` with the packages you approve, `npm install`, EAS project `setu-ios`, the Apple Developer and App Store Connect records, and a first simulator build |
| iOS-3 | Navigation shell (tab bar + More), `ScreenHeader`, navigation types, the auth screens, the two navigation tests, and the new shared iOS pieces (§7) |
| **iOS-4** | Screens, in the order of §6, each with the tests that read its source |
| iOS-5 | HIG and accessibility pass: Dynamic Type, VoiceOver, Reduce Motion, 44 pt targets, safe areas, keyboard, iPad compatibility mode |
| iOS-6 | TestFlight pipeline: `testflight` profile, EAS Update channel `ios-preview`, privacy manifest, export compliance, iOS release guide, and the test login if you approve §8 |
| **iOS-7** | Microsoft SSO on iOS (redirect `msauth.com.mountmeru.servicedesk://auth`) |
| iOS-8 | App Store readiness: metadata, screenshots, privacy labels, demo account, review notes, test login removed, `production` profile |

## 3. Every file in the port source

### 3.1 Repository root (17)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `.env.example` | KEEP | iOS-1b | Comment says "for an APK" (wording only) |
| `.gitignore` | KEEP | iOS-1b | Already ignores `ios/`, `*.ipa`, `*.p8`, `*.p12`, `*.mobileprovision`, `GoogleService-Info.plist` |
| `App.tsx` | ADAPT · verify | iOS-3 | Uses React Native's `StatusBar` (`barStyle="dark-content"`), which works on iOS. No code change expected. On a device, check the status bar over native page-sheet modals |
| `CLAUDE.md` | ADAPT | iOS-1b | §4.1 |
| `README.md` | KEEP | — | Already on `ios-dev`, byte-identical |
| `app.json` | ADAPT | iOS-2 (scheme: iOS-7) | §4.2 |
| `babel.config.js` | KEEP | iOS-1b | — |
| `eas.json` | ADAPT | iOS-2, iOS-6 | §4.3 |
| `global.css` | KEEP | iOS-1b | — |
| `globals.d.ts` | KEEP | iOS-1b | — |
| `index.ts` | KEEP | iOS-1b | — |
| `metro.config.js` | KEEP | iOS-1b | — |
| `nativewind-env.d.ts` | KEEP | iOS-1b | — |
| `package-lock.json` | ADAPT | iOS-2 | Never edited by hand. `npm install` regenerates it after the `package.json` changes in §4.4 |
| `package.json` | ADAPT | iOS-2 | §4.4 |
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
| `docs/PERFORMANCE.md` | KEEP | iOS-1b | Android measurements. iOS figures, if needed, go in `docs/ios/` (iOS-5) |
| `docs/RELEASE.md` | ADAPT | iOS-6 | §4.7 |
| `docs/ROLE-MATRIX.md` | KEEP | iOS-1b | Role rules are platform-neutral |
| `docs/UAT-TEST-PLAN.md` | KEEP | iOS-1b | Android steps. The iOS test plan is a new `docs/ios/` file (iOS-6) |
| `docs/WEB-VS-MOBILE-ROLES.md` | KEEP | iOS-1b | — |
| `docs/brand/UI-STANDARDS.md` | ADAPT | iOS-3 | §4.8 |
| `docs/brand/WEB-TOKENS.md` | KEEP | iOS-1b | — |
| `docs/web-system/00-OVERVIEW.md` | KEEP | iOS-1b | Environments table unchanged: UAT only |
| `docs/web-system/01-API-CONTRACT.md` | KEEP | iOS-1b | — |
| `docs/web-system/02-AUTH.md` | ADAPT | iOS-7 | §4.6 |
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
| `scripts/eas-build-guard.js` | KEEP | iOS-1b | Platform-neutral: it checks the profile name and `EXPO_PUBLIC_APP_ENV`, which `testflight` and `production` still use |
| `scripts/verify-release-bundle.js` | ADAPT | iOS-6 | Change `--platform android` to `ios`, and the output file from `index.android.bundle` to `main.jsbundle`. Hermes compiles iOS bundles too, so the bytecode step stays. Run it on the `production` configuration: the result must be PASS |

### 3.5 `src/api/` (22)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/api/announcements.api.ts` | KEEP | iOS-1b | — |
| `src/api/approvals.api.ts` | KEEP | iOS-1b | — |
| `src/api/attachmentDownload.ts` | KEEP | iOS-1b | `expo-sharing` opens the iOS share sheet. `dialogTitle` is Android-only and is ignored on iOS |
| `src/api/attachments.api.ts` | KEEP | iOS-1b | — |
| `src/api/auth.api.ts` | ADAPT | iOS-7 | Pass `{ preferEphemeralSession: true }` to `request.promptAsync(...)`. Without it, iOS shows "'Setu' Wants to Use 'microsoftonline.com' to Sign In" before every sign-in, and the sign-in shares Safari's Microsoft cookies. With it, neither happens, which also suits shared phones (`prompt=select_account`). This is decision D5 |
| `src/api/client.ts` | KEEP | iOS-1b | — |
| `src/api/comments.api.ts` | KEEP | iOS-1b | — |
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
| `src/components/AttachmentPicker.tsx` | KEEP | iOS-1b | Camera, Photos and Files all work on iOS. The purpose strings live in `app.json` (§4.2). Photos uses the system's out-of-process picker, so iOS asks for no photo-library permission |
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
| `src/components/ImageViewerModal.tsx` | ADAPT | iOS-4 | Change the share icon from `share-social-outline` (the Android glyph) to `share-outline` (the iOS glyph). The `StatusBar` there works unchanged (verify). Because this shares images, the share sheet offers "Save Image", which needs `NSPhotoLibraryAddUsageDescription` (§4.2) |
| `src/components/ListEntry.tsx` | KEEP | iOS-1b | — |
| `src/components/LoadingSkeleton.tsx` | KEEP | iOS-1b | — |
| `src/components/OptionSheet.tsx` | KEEP | iOS-1b | Android-only Modal props are ignored. Whether this becomes a native iOS sheet is an iOS-5 design question, not a port change |
| `src/components/PersonPickerSheet.tsx` | KEEP | iOS-1b | Same as `OptionSheet` |
| `src/components/PriorityBadge.tsx` | KEEP | iOS-1b | — |
| `src/components/RecentTicketRow.tsx` | KEEP | iOS-1b | — |
| `src/components/ScreenHeader.tsx` | ADAPT | iOS-3 | §4.5 |
| `src/components/Shimmer.tsx` | KEEP | iOS-1b | — |
| `src/components/SlaBadge.tsx` | KEEP | iOS-1b | — |
| `src/components/StatusBadge.tsx` | KEEP | iOS-1b | Already sets the iOS `accessibilityElementsHidden` next to the Android prop |
| `src/components/TaskRow.tsx` | KEEP | iOS-1b | — |
| `src/components/TemplatePickerSheet.tsx` | KEEP | iOS-1b | Same as `OptionSheet` |
| `src/components/TicketCard.tsx` | KEEP | iOS-1b | — |
| `src/components/index.ts` | KEEP | iOS-1b | iOS-3 adds the new exports from §7 |
| `src/components/listDefaults.ts` | KEEP | iOS-1b | — |

### 3.7 `src/config/` (2)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/config/auth.config.ts` | ADAPT | iOS-7 | `getAuthRedirectUri()` returns `'msauth.com.mountmeru.servicedesk://auth'` instead of the Android `msauth://com.mountmeru.servicedesk/<signature hash>`. `AUTH_REDIRECT_SCHEME` becomes `'msauth.com.mountmeru.servicedesk'`. Drop the unused `makeRedirectUri` import and fix the comments. The client and tenant IDs stay: same Entra registration, so the backend's ID-token audience check is unchanged |
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
| `src/hooks/useDiscardGuard.ts` | KEEP | iOS-1b | Uses `usePreventRemove`. In iOS-4, check on a device that it also stops the iOS swipe-back and the swipe-down that closes a sheet. If it doesn't, the affected screens set `gestureEnabled: false` while there is unsent input |
| `src/hooks/useHome.ts` | KEEP | iOS-1b | — |
| `src/hooks/useKnowledgeBase.ts` | KEEP | iOS-1b | — |
| `src/hooks/useLookups.ts` | KEEP | iOS-1b | — |
| `src/hooks/useNotifications.ts` | KEEP | iOS-1b | — |
| `src/hooks/usePostComment.ts` | KEEP | iOS-1b | — |
| `src/hooks/useProfile.ts` | KEEP | iOS-1b | — |
| `src/hooks/useReduceMotion.ts` | KEEP | iOS-1b | `AccessibilityInfo.isReduceMotionEnabled` reads iOS's Reduce Motion setting. The comment names only Android's equivalent |
| `src/hooks/useServiceCatalog.ts` | KEEP | iOS-1b | — |
| `src/hooks/useSingleFlight.ts` | KEEP | iOS-1b | — |
| `src/hooks/useStableCallback.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTasks.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTicket.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTicketAttachments.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTicketComments.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTicketHistory.ts` | KEEP | iOS-1b | — |
| `src/hooks/useTickets.ts` | KEEP | iOS-1b | — |
| `src/hooks/useUpdateTicket.ts` | KEEP | iOS-1b | — |
| `src/hooks/useUploadAttachment.ts` | KEEP | iOS-1b | — |
| `src/hooks/writeGuards.ts` | KEEP | iOS-1b | — |

### 3.9 `src/navigation/` (10)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/navigation/AppDrawer.tsx` | ADAPT | iOS-3 | Becomes `src/navigation/MoreStack.tsx` (§4.5) |
| `src/navigation/AppTabBar.tsx` | ADAPT | iOS-3 | §4.5 |
| `src/navigation/AuthStack.tsx` | KEEP | iOS-3 | The `__DEV__` gate is unchanged. §8 would change it only if approved |
| `src/navigation/DrawerContent.tsx` | ADAPT | iOS-3 | Becomes `src/navigation/MoreScreen.tsx` (§4.5) |
| `src/navigation/MainTabs.tsx` | ADAPT | iOS-3 | §4.5 |
| `src/navigation/ModuleStacks.tsx` | KEEP | iOS-3 | The four module stacks are reused as they are, now inside the More stack |
| `src/navigation/RootNavigator.tsx` | ADAPT | iOS-3 | §4.5 |
| `src/navigation/TicketStack.tsx` | KEEP | iOS-3 | `presentation: 'modal'` gives native iOS page sheets. The comment about Android back is wording only |
| `src/navigation/navigationRef.ts` | ADAPT | iOS-3 | §4.5 |
| `src/navigation/splash.ts` | KEEP | iOS-3 | — |

### 3.10 `src/screens/` (29)

The 25 SCREEN files are listed in porting order in §6. The remaining four are here.

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/screens/PlaceholderScreen.tsx` | ADAPT | iOS-3 | Remove the `'drawer'` value from `headerVariant` (§4.5). It is used only by `DevTokenScreen` |
| `src/screens/auth/DevTokenScreen.tsx` | KEEP | iOS-3 | `__DEV__` only, as on Android. §8 would change it only if approved |
| `src/screens/auth/LoginScreen.tsx` | KEEP | iOS-3 | Nothing platform-specific. The `__DEV__` hint shows whichever redirect `auth.config.ts` returns |
| `src/screens/auth/signInAttempt.ts` | KEEP | iOS-3 | The stale-banner rule is platform-neutral. On iOS the Microsoft sheet leaves the app `inactive`, not `background`, so it still never counts as leaving. Checked in iOS-7 |
| `src/screens/approvals/ApprovalDetailScreen.tsx` | SCREEN | iOS-4 | §6 #14 |
| `src/screens/approvals/ApprovalsInboxScreen.tsx` | SCREEN | iOS-4 | §6 #13 |
| `src/screens/catalog/ServiceCatalogScreen.tsx` | SCREEN | iOS-4 | §6 #20 |
| `src/screens/catalog/ServiceFormFieldInput.tsx` | SCREEN | iOS-4 | §6 #21 |
| `src/screens/catalog/ServiceRequestDetailScreen.tsx` | SCREEN | iOS-4 | §6 #23 |
| `src/screens/catalog/ServiceRequestFormScreen.tsx` | SCREEN | iOS-4 | §6 #22 |
| `src/screens/dashboard/AnnouncementsScreen.tsx` | SCREEN | iOS-4 | §6 #24 |
| `src/screens/dashboard/HomeScreen.tsx` | SCREEN | iOS-4 | §6 #1 |
| `src/screens/knowledge/KbArticleScreen.tsx` | SCREEN | iOS-4 | §6 #19 |
| `src/screens/knowledge/KnowledgeBaseScreen.tsx` | SCREEN | iOS-4 | §6 #18 |
| `src/screens/notifications/NotificationsScreen.tsx` | SCREEN | iOS-4 | §6 #6 |
| `src/screens/profile/ProfileScreen.tsx` | SCREEN | iOS-4 | §6 #25 |
| `src/screens/tasks/TaskDetailScreen.tsx` | SCREEN | iOS-4 | §6 #16 |
| `src/screens/tasks/TaskEditorScreen.tsx` | SCREEN | iOS-4 | §6 #17 |
| `src/screens/tasks/TaskListScreen.tsx` | SCREEN | iOS-4 | §6 #15 |
| `src/screens/tickets/AssignPickerScreen.tsx` | SCREEN | iOS-4 | §6 #10 |
| `src/screens/tickets/CreateTicketScreen.tsx` | SCREEN | iOS-4 | §6 #7 |
| `src/screens/tickets/ReplyComposerScreen.tsx` | SCREEN | iOS-4 | §6 #8 |
| `src/screens/tickets/StatusClosureScreen.tsx` | SCREEN | iOS-4 | §6 #9 |
| `src/screens/tickets/SubmitApprovalScreen.tsx` | SCREEN | iOS-4 | §6 #12 |
| `src/screens/tickets/TicketDetailScreen.tsx` | SCREEN | iOS-4 | §6 #4 |
| `src/screens/tickets/TicketFiltersScreen.tsx` | SCREEN | iOS-4 | §6 #3 |
| `src/screens/tickets/TicketLinkScreen.tsx` | SCREEN | iOS-4 | §6 #5 |
| `src/screens/tickets/TicketListScreen.tsx` | SCREEN | iOS-4 | §6 #2 |
| `src/screens/tickets/TicketPropertyEditors.tsx` | SCREEN | iOS-4 | §6 #11 |

### 3.11 `src/store/` (2)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/store/auth.store.ts` | ADAPT | iOS-3 | Pass `{ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }` to every SecureStore call. This is the value `02-AUTH.md` §5.1 already specifies, and the iOS counterpart of Android's `allowBackup: false`: the token never moves to another device through a backup. Also fix the "Android Keystore" comment. The wipe after a reinstall goes in a separate file (§7), so this store stays loadable by the Node tests |
| `src/store/ui.store.ts` | KEEP | iOS-1b | — |

### 3.12 `src/theme/` (5)

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `src/theme/colors.ts` | KEEP | iOS-1b | — |
| `src/theme/index.ts` | KEEP | iOS-1b | — |
| `src/theme/motion.ts` | KEEP | iOS-1b | — |
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
| `src/types/navigation.ts` | ADAPT | iOS-3 | §4.5 |
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
| `src/utils/assignment.ts` | KEEP | iOS-1b | — |
| `src/utils/compose.ts` | KEEP | iOS-1b | — |
| `src/utils/deep-links.ts` | KEEP | iOS-1b | — |
| `src/utils/dialogs.ts` | ADAPT | iOS-3 | `notify()` uses `ToastAndroid`, and on iOS it falls back to a modal `Alert` for every success notice. The HIG discourages that. It changes to the non-modal `Notice` (§7), which VoiceOver announces. Drop the `ToastAndroid` and `Platform` imports. `confirmAction` and the error alerts stay as `Alert`, which is the right iOS control for them |
| `src/utils/format.ts` | KEEP | iOS-1b | — |
| `src/utils/html.ts` | KEEP | iOS-1b | — |
| `src/utils/kb.ts` | KEEP | iOS-1b | — |
| `src/utils/permissions.ts` | KEEP | iOS-1b | `drawerItems()` and `mainTabs()` are reused unchanged: the first lists the More rows, the second gives the first three tabs. The role-gating tests that pin them keep passing |
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

Several suites read screen or navigator source files as text. Each suite is copied in the phase that brings the files it reads, so `npm test` stays green from iOS-2 on.

| File | Class | Phase | iOS change / note |
|---|---|---|---|
| `tests/auth/mobile-sso.test.mjs` | ADAPT | iOS-1b, then iOS-7 | Copied as it is in iOS-1b, where it passes against the unchanged `auth.config.ts`. In iOS-7 its fixed-redirect assertion (line 152) changes to `msauth.com.mountmeru.servicedesk://auth`, together with `auth.config.ts` |
| `tests/rbac/g3-features.test.mjs` | KEEP | iOS-4 | Reads the TicketDetail, ReplyComposer and SubmitApproval screens and `TicketStack.tsx` |
| `tests/rbac/g5-audit.test.mjs` | KEEP | iOS-4 | Reads `CreateTicketScreen` |
| `tests/rbac/list-filters.test.mjs` | KEEP | iOS-4 | Reads `TicketListScreen` and `TicketFiltersScreen` |
| `tests/rbac/personas.mjs` | KEEP | iOS-1b | — |
| `tests/rbac/property-editing.test.mjs` | KEEP | iOS-1b | Pure modules only |
| `tests/rbac/role-gating.test.mjs` | ADAPT | iOS-3, run fully from iOS-4 | In the `GATED` list, the path `src/navigation/DrawerContent.tsx` changes to `src/navigation/MoreScreen.tsx`. The rules stay the same: it must call `drawerItems(` and `countrySelectorMode(`. The `mainTabs()` expectations are unchanged |
| `tests/rbac/service-catalog.test.mjs` | ADAPT | iOS-3, run fully from iOS-4 | Lines 126–127 read `MoreScreen.tsx` instead of `DrawerContent.tsx`; the same `navigate('Catalog', { screen: 'ServiceCatalog', pop: true })` call is still valid there. Line 128 expects `<More.Screen name="Catalog" component={CatalogStack} />` in `MoreStack.tsx`, instead of the `Drawer.Screen` in `AppDrawer.tsx` |
| `tests/rbac/technician-editor.test.mjs` | KEEP | iOS-4 | Reads AssignPicker, TicketDetail and TicketPropertyEditors |
| `tests/support/loader.mjs` | KEEP | iOS-1b | — |
| `tests/support/register.mjs` | KEEP | iOS-1b | — |
| `tests/support/stubs/expo-auth-session.mjs` | KEEP | iOS-1b | The comment says "needs an Android build" (wording only) |
| `tests/support/stubs/expo-secure-store.mjs` | KEEP | iOS-1b | It ignores the options argument, so the `keychainAccessible` change does not affect it. It already exports `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` |

## 4. ADAPT details

### 4.1 `CLAUDE.md`
- **Title and "What this repo is":** this is the iOS port of Setu, on branch `ios-dev`, with the port source commit. Correct the stack line to Expo SDK 57, React Native 0.86 and React Navigation 7, and remove "documentation only".
- **New block, "iOS branch rules", taken from the brief:**
  - work only on `ios-dev`;
  - never open, modify, check out or pull `..\mmg-ticketing-mobile-app` or `..\MMG-Ticketing-Platform`;
  - never push to, merge into or touch `main`, `dev` or any Android branch;
  - read Android code only with `git show`, `git ls-tree` or `git grep` against `origin/dev`.
- **Web repo:** rule 3 allows reading the web clone. On iOS it changes to "use `docs/web-system/`; do not open the web clone from this repo".
- **Doc index:** add `docs/ios/00-PORT-MANIFEST.md` and `docs/ios/APP-STORE-COMPLIANCE.md`.
- **Unchanged:** rules 1–8 and R1, R2, R3, R6. Rule 5 changes only if §8 is approved. Which of R4 and R5 are relaxed for this repo stays your call, as the existing note says.

### 4.2 `app.json`

```jsonc
{
  "expo": {
    "name": "Setu",                                   // CFBundleDisplayName (under the icon)
    "slug": "setu-ios",                               // separate EAS project
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",                    // light only for v1 (decision D9, compliance E7)
    "scheme": ["mmgservicedesk", "com.mountmeru.servicedesk"],   // "msauth" dropped; iOS-7 adds "msauth.com.mountmeru.servicedesk"
    "platforms": ["ios"],
    "ios": {
      "bundleIdentifier": "com.mountmeru.servicedesk",
      "buildNumber": "1",                             // bumped by hand per upload (appVersionSource: local)
      "supportsTablet": false,                        // iPhone only
      "config": { "usesNonExemptEncryption": false }, // writes ITSAppUsesNonExemptEncryption = false
      "infoPlist": {
        "NSPhotoLibraryAddUsageDescription": "Setu saves an attachment image to your photo library only when you choose Save Image."
      },
      "privacyManifests": { /* iOS-6, compliance H4 */ }
    },
    "plugins": [
      ["expo-secure-store", { /* no Face ID string: see below */ }],
      ["expo-image-picker", {
        "cameraPermission": "Setu uses the camera only when you choose to take a photo to attach to a ticket, reply or request.",
        "photosPermission": "Setu shows your photos only when you choose some to attach to a ticket, reply or request. Only the photos you pick are uploaded.",
        "microphonePermission": false
      }],
      "@react-native-community/datetimepicker",
      "expo-font",
      ["expo-splash-screen", { "image": "./assets/splash-icon.png", "imageWidth": 192, "resizeMode": "contain", "backgroundColor": "#FFFFFF" }]
    ],
    "runtimeVersion": { "policy": "fingerprint" },    // needs expo-updates (D6)
    "updates": { "url": "https://u.expo.dev/<setu-ios projectId>" },
    "extra": { "eas": { "projectId": "<new: eas init in iOS-2>" } },
    "owner": "ronitpc"                                // confirm (D7)
  }
}
```

**Removed: the whole `android` block** (`package`, `versionCode`, `allowBackup`, `adaptiveIcon`, `blockedPermissions`). It is Android-only (§5).

**Purpose strings:**
- **Camera:** `NSCameraUsageDescription`, set by the `expo-image-picker` plugin option.
- **Photo library:** `NSPhotoLibraryUsageDescription`, set by the same plugin. The library picker runs out of process, so this prompt should never appear, but the plugin writes the key anyway.
- **Photo library add:** `NSPhotoLibraryAddUsageDescription`. It is needed because image attachments are shared through the system share sheet (`ImageViewerModal`). That sheet's "Save Image" action crashes an app that lacks this key.
- **Files: there is no purpose string to add.** The brief lists one, but the Files picker (`expo-document-picker`) runs out of process and asks for no permission.
- **Microphone:** none (`microphonePermission: false`, as on Android).
- **Face ID:** `expo-secure-store`'s plugin may write a default `NSFaceIDUsageDescription`, but Setu never uses biometrics. Remove it (plugin option `faceIDPermission`). In iOS-2, check the generated `Info.plist` to make sure it is gone.

**Other values:**
- **Export compliance:** `ios.config.usesNonExemptEncryption: false`. The app only uses HTTPS through iOS and the OS's SHA-256 (via `expo-crypto`) for PKCE, both of which are exempt.
- **EAS:** a new project `setu-ios` gets a new `projectId` from `eas init`. The Android project `86788b11-…` is never reused.
- **`runtimeVersion: fingerprint`** means an EAS Update only reaches binaries built from the same native code (compliance C2). The alternative is `appVersion`, which needs a manual version bump on every native change.

### 4.3 `eas.json`

```jsonc
{
  "cli": { "version": ">= 24.8.0", "appVersionSource": "local" },
  "build": {
    // Simulator dev-client build, UAT. Needs expo-dev-client (D6). Keeps the __DEV__ developer-token screen.
    "development": { "developmentClient": true, "distribution": "internal", "ios": { "simulator": true },
                     "env": { "EXPO_PUBLIC_APP_ENV": "UAT" } },
    // TestFlight build, UAT. Store-signed, because TestFlight requires it. Internal testers only.
    "testflight":  { "node": "24.18.0", "distribution": "store", "channel": "ios-preview",
                     "ios": { "image": "<an EAS macOS image with Xcode 26 or later>" },
                     "env": { "EXPO_PUBLIC_APP_ENV": "UAT" } },
    // ⛔ PLACEHOLDER: refused by scripts/eas-build-guard.js while the PROD URL in env.ts is empty.
    "production":  { "node": "24.18.0", "distribution": "store", "channel": "ios-production",
                     "env": { "EXPO_PUBLIC_APP_ENV": "PROD" } }
  },
  "submit": { "testflight": { "ios": { "ascAppId": "<App Store Connect app id, iOS-6>" } } }
}
```

- **Removed:** the Android `preview` profile (`android.buildType: apk`) and `android.buildType: app-bundle` (§5). On iOS, `testflight` replaces `preview`. An iOS "internal" (ad hoc) build would need every tester's device UDID registered.
- **Shared app record:** `testflight` and `production` builds share one bundle ID and one App Store Connect record. Only `production` builds are ever submitted for review.
- **Credentials:** the distribution certificate, provisioning profile and App Store Connect API key are created and stored by EAS. None of them enters the repo; `.gitignore` already covers `*.p8`, `*.p12` and `*.mobileprovision`.

### 4.4 `package.json` (and `package-lock.json`)
- **Scripts:** replace `"android": "expo start --android"` with `"ios": "expo start --ios"`. The other scripts are unchanged.
- **Remove `@react-navigation/drawer`** in iOS-3, once nothing imports it.
- **Keep** `react-native-gesture-handler` (the root view in `App.tsx`) and `react-native-reanimated` / `react-native-worklets` (NativeWind needs them).
- **Add only with your approval (D6):**
  - `expo-updates`, for EAS Update and the `ios-preview` channel;
  - `expo-dev-client`, for the `development` profile (already "waiting for approval" in RELEASE §8).
- **`eas-cli`:** pin it in `devDependencies` or always run `npx eas-cli@<version>`. RELEASE §1 claims it is pinned, but it is not (§0 drift).
- **`package-lock.json`:** regenerated by `npm install` in iOS-2, never edited by hand.

### 4.5 Navigation: drawer → tab bar + "More"

**Tree:**

```
Root (native stack)
├─ Auth  → AuthStack (Login · DevToken in __DEV__ only)
└─ App   → MainTabs (bottom tabs, the same four for every role)
           ├─ HomeTab     → HomeScreen
           ├─ TicketsTab  → TicketStack (unchanged)
           ├─ AlertsTab   → NotificationsScreen
           └─ MoreTab     → MoreStack (native stack)
                            ├─ More          → MoreScreen (rows from drawerItems())
                            ├─ Approvals     → ApprovalsStack   (ModuleStacks.tsx, unchanged)
                            ├─ Tasks         → TasksStack
                            ├─ Knowledge     → KnowledgeStack
                            ├─ Catalog       → CatalogStack
                            ├─ Announcements → AnnouncementsScreen
                            └─ Profile       → ProfileScreen (Settings)
```

**Why this shape:**
- A row in More pushes its module with the native animation, and **the module's first screen swipes back to More**.
- The tab bar stays on every screen, which Android had to fix by hand (UI-STANDARDS §7).
- There are 4 tabs, within the HIG's limit of 5.
- No tab ever appears or disappears by role; the conditional Approvals row lives in More.

**File by file:**

| File | Change |
|---|---|
| `AppDrawer.tsx` → `MoreStack.tsx` | A native stack with the seven routes above, `headerShown: false` and `freezeOnBlur`. `AboveTabBar` goes away, because the bar is now always present |
| `DrawerContent.tsx` → `MoreScreen.tsx` | Same rows from `drawerItems()`, with the same labels and icons ("Service Request" included) and the same `go()` calls, which now resolve inside MoreStack. The account card, Sign out and the version line stay. Removed: the drawer header band (now a "More" title) and the red active-row highlight (a row pushes a screen instead of switching to one). The Approvals badge stays on its row |
| `MainTabs.tsx` | Add `MoreTab` → `MoreStack`, still calling `mainTabs(role)` for the first three. `backBehavior` no longer matters (no hardware back). A second tap on More pops to the list (the existing `tabPress` behaviour) |
| `AppTabBar.tsx` | Remove `android_ripple` (iOS tab bars show no press ripple) and `elevation: 8` (the Android shadow; the hairline top border stays). Add the More item: `ellipsis-horizontal` icon, label "More", with the pending-approvals badge if D3 is yes. Badges get an accessibility label, e.g. "Alerts, 3 unread". It keeps UIKit's 49 pt + inset metrics. Whether to switch to the native iOS tab bar (Liquid Glass on iOS 26) is decision D4 |
| `RootNavigator.tsx` | `App` → `MainTabs` instead of `AppDrawer`. Before `restoreSession()`, run the reinstall check (§7 `installMarker.ts`) |
| `navigationRef.ts` | The `openTicketLinkInApp` path becomes `App → TicketsTab → TicketLink`. There is no `MainTabs` layer any more |
| `types/navigation.ts` | `AppDrawerParamList` → `AppTabParamList` (`MainTabParamList` + `MoreTab: NavigatorScreenParams<MoreStackParamList>`). New `MoreStackParamList`. `AppDrawerScreenProps` → `MoreStackScreenProps`. `RootStackParamList.App` points at the tabs. Drop the `@react-navigation/drawer` import. The composite props of the module stacks re-parent from the drawer to MoreStack |
| `ScreenHeader.tsx` | Remove the `'drawer'` variant and `DrawerActions`. Tab roots use a new `'root'` variant with no left button. The back icon changes from `arrow-back` to `chevron-back` (the iOS back mark) and keeps its 44 pt target; ✕ on sheets stays. The bar height (56 dp today against UIKit's 44 pt) follows UI-STANDARDS S1 as adapted (§4.8). The native swipe-back belongs to native-stack, not this header, so it works on every pushed screen |
| `PlaceholderScreen.tsx` | Remove `'drawer'` from `headerVariant` |

**Calls that cross tabs:** after this change, a screen in one tab can no longer `navigate('Approvals' …)` to a module that sits in another tab's stack. A new `src/navigation/routes.ts` (§7) holds the few cross-tab jumps, and the screens in §6 call it:
- `openTicket(id)`;
- `openTicketList(filter)`;
- `openCreateTicket()`;
- `openApprovals()`;
- `openApproval(id)`;
- `openAnnouncements()`.

### 4.6 `docs/web-system/02-AUTH.md` (iOS-7)
- **§7.1:** the existing registration `76c6edf5-…` gains the **iOS/macOS platform** for bundle ID `com.mountmeru.servicedesk`, which gives the redirect `msauth.com.mountmeru.servicedesk://auth`. This is an IT ask, the iOS half of A2. No new client ID and no backend change.
- **§7.2:** add the iOS row: `msauth.com.mountmeru.servicedesk://auth` through `ASWebAuthenticationSession`, plus the `preferEphemeralSession` decision (D5).
- **§5.1:** record that `keychainAccessible` is now in the code (`auth.store.ts`).
- **§6:** changes only if §8 is approved.

### 4.7 `docs/RELEASE.md` (iOS-6)
The file name is kept, because code comments cite "docs/RELEASE.md §6".

| Section | Change |
|---|---|
| Title and status table | "Release guide — Setu (iOS)", with bundle ID, `buildNumber`, iOS SDK and Xcode |
| §1 Profiles | `development` (simulator) / `testflight` / `production`. Build guard text unchanged |
| §2 First build | `eas init` for `setu-ios`, then `eas build --platform ios --profile testflight`. EAS creates the Apple distribution certificate and provisioning profile instead of a keystore. Then `eas submit` to TestFlight |
| §3 Signing hash for IT | Replaced by the iOS message to IT: bundle ID and redirect `msauth.com.mountmeru.servicedesk://auth`. iOS needs no signature hash |
| §4 APK to testers | Replaced by TestFlight internal testing: who is added, and how builds expire after 90 days |
| §5 Pre-release checklist | Android items (`versionCode`, Play, data safety) replaced by iOS items. Points to `docs/ios/APP-STORE-COMPLIANCE.md` |
| §6 Bundle proof | The iOS bundle (`main.jsbundle`), re-run with the result recorded |
| §7 Assets | Android adaptive-icon and splash geometry removed. iOS icon rules (opaque, 1024 px; optional dark and tinted variants) and the launch screen added |
| §8 Packages | `expo-dev-client`, `expo-updates` |
| §9 State audit | Kept; re-run on iOS in iOS-4 |

### 4.8 `docs/brand/UI-STANDARDS.md` (iOS-3, extended in iOS-5)
- **S1 header:** a 44 pt bar. Back chevron on pushed screens, nothing on tab roots, ✕ on sheets. Large titles are decided in iOS-3.
- **S12 navigation chrome:** the drawer is replaced by tab bar + More (§4.5); ripple and elevation removed.
- **§4 large text:** re-checked at iOS Dynamic Type sizes, up to the largest accessibility size (AX5), instead of Android's 130 % / 200 %.
- **§5.2:** the drawer measurements are replaced by the More list.
- **§7:** rewritten for iOS. Every pushed screen swipes back, sheets swipe down, there is no hardware back, and the 25-route table is redone.
- **Unchanged:** colours, contrast (§2, §3), radii and spacing. dp and pt use the same numbers.

## 5. SKIP

Whole files:

| File | Reason |
|---|---|
| `assets/adaptive-icon-background.png` | Android adaptive-icon layer; iOS has no adaptive icons |
| `assets/adaptive-icon.png` | Android adaptive-icon foreground and themed (monochrome) layer |

Android-only parts of ADAPT files, not brought over:

| Where | Part | Reason |
|---|---|---|
| `app.json` | `android` block, including `versionCode`, `adaptiveIcon`, `allowBackup`, `blockedPermissions` | Android manifest settings. The iOS counterparts are in §4.2 and §3.11 |
| `app.json` | `msauth` in `scheme` | The Android MSAL redirect form. On iOS it would claim every `msauth://` link (11-SSO-VERIFY §4.2) |
| `app.json` | `extra.eas.projectId` `86788b11-…` | Android's EAS project. iOS gets its own (`setu-ios`) |
| `eas.json` | `preview` profile and every `android.buildType` | APK/AAB outputs. TestFlight replaces `preview` |
| `src/config/auth.config.ts` | The `msauth://com.mountmeru.servicedesk/<hash>` redirect | Android signature-hash redirect |
| `docs/RELEASE.md` | §2–§4 (keystore, SHA-1 → Base64 hash for Entra, APK sideloading) and the §7 adaptive-icon geometry | Android signing and distribution |
| `package.json` | `"android"` script | Android launcher |
| Not in the repo | `android/` native folder, `*.jks`, `*.keystore`, `google-services.json` | Generated or secret. Already git-ignored, never present |

## 6. SCREEN — porting order (iOS-4): read → write → modules

**Applies to every screen:**
- **Pull to refresh:** add `tintColor={colors.primary}` to `RefreshControl`, because iOS ignores the Android `colors` prop.
- **Keyboard:** `KeyboardAvoidingView` `behavior="height"` → `"padding"` (iOS).
- **Header:** `ScreenHeader` `variant="drawer"` → `"root"`.
- **Cross-tab jumps:** use `routes.ts` (§4.5).
- **Text inputs:** `textAlignVertical` is Android-only. iOS already top-aligns multiline inputs, so it is left in place harmlessly.
- **Tests:** a screen is done when the tests that read it pass (§3.15).

| # | Screen | iOS changes beyond the common ones |
|---|---|---|
| **Read** | | |
| 1 | `dashboard/HomeScreen.tsx` | `variant="root"`. `navigate('TicketsTab' …)`, `navigate('Approvals' …)` and `navigate('Announcements')` change to `routes.ts`. Check the FAB `shadow-lg` and the KPI tiles at large Dynamic Type sizes (UI-STANDARDS §5.1 measured Android only) |
| 2 | `tickets/TicketListScreen.tsx` | The `BackHandler` that clears the selection is removed. iOS has no hardware back, so the selection bar gets a visible **Cancel** (Done) button. The `StatusBar` `light-content` during selection works unchanged (verify). `variant="root"` |
| 3 | `tickets/TicketFiltersScreen.tsx` | `DateTimePickerAndroid.open` → `DatePickerSheet` (§7). It still sends the device's calendar day |
| 4 | `tickets/TicketDetailScreen.tsx` | The ⋮ (`ellipsis-vertical`, the Android overflow mark) → `ellipsis-horizontal-circle`, the iOS "more" mark. It imports `TicketPropertyEditors`, so that file comes along (its write paths are checked at #11) |
| 5 | `tickets/TicketLinkScreen.tsx` | None expected. `Linking.openURL` opens Safari |
| 6 | `notifications/NotificationsScreen.tsx` | `variant="root"`. `navigate('Approvals' …)` and `navigate('TicketsTab' …)` change to `routes.ts` |
| **Write** | | |
| 7 | `tickets/CreateTicketScreen.tsx` | Common changes only. On a device, check attachments from Camera, Photos and Files |
| 8 | `tickets/ReplyComposerScreen.tsx` | Common changes only |
| 9 | `tickets/StatusClosureScreen.tsx` | `Switch` `thumbColor` is Android-only. iOS keeps a white thumb; the red `trackColor` is fine (verify) |
| 10 | `tickets/AssignPickerScreen.tsx` | None expected. Check it on a device |
| 11 | `tickets/TicketPropertyEditors.tsx` | Check the inline editors with the keyboard up |
| 12 | `tickets/SubmitApprovalScreen.tsx` | Common changes only |
| **Modules** | | |
| 13 | `approvals/ApprovalsInboxScreen.tsx` | Reached from More |
| 14 | `approvals/ApprovalDetailScreen.tsx` | `KeyboardAvoidingView` `"height"` → `"padding"`. `navigate('MainTabs' …)` changes to `routes.openTicket` |
| 15 | `tasks/TaskListScreen.tsx` | Common changes only |
| 16 | `tasks/TaskDetailScreen.tsx` | `navigate('MainTabs' …)` changes to `routes.openTicket` |
| 17 | `tasks/TaskEditorScreen.tsx` | `DateTimePickerAndroid.open` → `DatePickerSheet`. `KeyboardAvoidingView` `"height"` → `"padding"` |
| 18 | `knowledge/KnowledgeBaseScreen.tsx` | Common changes only |
| 19 | `knowledge/KbArticleScreen.tsx` | Common changes only |
| 20 | `catalog/ServiceCatalogScreen.tsx` | The `BackHandler` that leaves an open category or search first is removed. Instead there is a visible in-screen "Catalogue" back control (the web's Home breadcrumb). The iOS swipe-back leaves the catalogue, as iOS users expect. Two `RefreshControl`s |
| 21 | `catalog/ServiceFormFieldInput.tsx` | `DateTimePickerAndroid.open` → `DatePickerSheet` |
| 22 | `catalog/ServiceRequestFormScreen.tsx` | Common changes only |
| 23 | `catalog/ServiceRequestDetailScreen.tsx` | Common changes only |
| 24 | `dashboard/AnnouncementsScreen.tsx` | `AppDrawerScreenProps` → `MoreStackScreenProps` |
| 25 | `profile/ProfileScreen.tsx` | `AppDrawerScreenProps` → `MoreStackScreenProps`. `KeyboardAvoidingView` `"height"` → `"padding"`. Adds a **Privacy policy** link and the **account-deletion** entry (compliance H1, H6; content depends on D10). The Theme setting stays unbuilt (light only) |

## 7. iOS-only additions

**New files, none of which exist on Android:**

| New file | Phase | Purpose |
|---|---|---|
| `docs/ios/00-PORT-MANIFEST.md` | iOS-1a | This file |
| `docs/ios/APP-STORE-COMPLIANCE.md` | iOS-1a | Apple checklist |
| `docs/ios/UAT-TEST-PLAN-IOS.md` | iOS-6 | iOS test steps: TestFlight install, back swipe, sheets, Dynamic Type, VoiceOver |
| `src/navigation/routes.ts` | iOS-3 | Cross-tab navigation helpers (§4.5) |
| `src/components/DatePickerSheet.tsx` | iOS-3 | The native iOS date picker (`@react-native-community/datetimepicker`, inline) in a sheet with Done/Cancel. Replaces `DateTimePickerAndroid.open` in three screens and returns the same value |
| `src/components/Notice.tsx` | iOS-3 | A short, non-modal success notice at the top of the screen, announced to VoiceOver. Replaces the toast |
| `src/store/installMarker.ts` | iOS-3 | **iOS Keychain items survive uninstall.** On the first launch after an install, no marker file exists in the app container yet. In that case, wipe the three `mmg.session.*` keys and write the marker. A reinstalled app then never starts signed in to a session from before it was deleted |

**iOS identity and settings** (the values are in §4.2 and §4.3):

| Item | Value |
|---|---|
| Bundle ID | `com.mountmeru.servicedesk` |
| Display name | Setu |
| Devices | `supportsTablet: false` (iPhone only) |
| `Info.plist` purpose strings | Camera, photo library, photo-library add. No Files string exists (§4.2) |
| Export compliance | `ITSAppUsesNonExemptEncryption` = `false` |
| EAS | Separate project `setu-ios` |
| EAS Update | Channel `ios-preview` (TestFlight); `ios-production` reserved |
| TestFlight | `testflight` build profile |
| Privacy manifest | Declared in `app.json` (`ios.privacyManifests`) in iOS-6 |

## 8. Pre-SSO sign-in on TestFlight — PROPOSAL (nothing built)

### 8.1 The problem
- TestFlight builds are release builds, so `__DEV__` is false.
- The developer-token screen is compiled out of release builds: `AuthStack` `require`s it only inside `__DEV__`, and `verify-release-bundle` proves it is absent.
- Microsoft SSO arrives in iOS-7.
- So between the first TestFlight build (iOS-6) and iOS-7, **no tester can sign in**.

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
- `EXPO_PUBLIC_UAT_TEST_LOGIN=1`, set only in the `testflight` and `development` profiles.
- In code, the screen is available when `(__DEV__ || flag === '1') && APP_ENV === 'UAT'`.

**Five locks make it impossible in production:**

| # | Lock | Where |
|---|---|---|
| L1 | The `production` profile never sets the flag | `eas.json` |
| L2 | The build guard refuses any build with the flag set when the profile is `production` or `EXPO_PUBLIC_APP_ENV` is `PROD`. It fails in seconds, before compiling | `scripts/eas-build-guard.js` |
| L3 | At runtime, the flag counts only when `APP_ENV` is UAT. A PROD bundle can't show the screen even if the flag leaks into it | `src/config/env.ts` |
| L4 | The `require` sits inside `__DEV__ \|\| process.env.EXPO_PUBLIC_UAT_TEST_LOGIN === '1'`. Expo inlines that at build time, so a bundle built without the flag does not contain the module. `verify-release-bundle` on the `production` configuration must find 0 developer-token strings | `AuthStack.tsx`, `verify-release-bundle.js` |
| L5 | `eas update` does not run the build guard. So updates to `ios-production` are published only by a script that sets `APP_ENV=PROD`, unsets the flag and runs `verify-release-bundle` first. `ios-preview` updates are built with the `testflight` environment | iOS-6 script and RELEASE |

**Also:**
- The Login screen shows "UAT test build — test sign-in on".
- Flagged builds go to **TestFlight internal testers only**, never to external groups, and are never submitted for App Review.

**Files it would change (iOS-6):**
- `eas.json`, `src/config/env.ts`, `src/navigation/AuthStack.tsx`;
- `src/screens/auth/LoginScreen.tsx` (the condition on the developer button);
- `src/screens/auth/DevTokenScreen.tsx` (its `if (!__DEV__)` self-guard switches to the same availability check);
- `scripts/eas-build-guard.js`, `scripts/verify-release-bundle.js` (a second run on the `testflight` configuration, where the strings are expected);
- `02-AUTH.md` §6, `CLAUDE.md` rule 5, `docs/RELEASE.md`.

**Removal:** the flag, the screen and the route are deleted under the existing release-checklist item "Developer-token screen removed", once SSO works (iOS-7 → iOS-8).

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
  2. the iOS-7 changes to `app.json` `scheme` and `auth.config.ts` (§3.7).
- If IT can do item 1 before the first TestFlight build, iOS-7 can run before iOS-6, and §8.3 is never built.

**Recommendation:** send IT that ask now. Build §8.3 only if the registration can't be ready in time.

## 9. Decisions for you

| # | Decision | My recommendation |
|---|---|---|
| D1 | Phase map (§2) | As proposed |
| D2 | Pre-SSO sign-in (§8) | Ask IT for the iOS redirect now (§8.5). Approve §8.3 only as the fallback |
| D3 | Pending-approvals badge on the More tab, as well as on its row | Yes |
| D4 | Tab bar: keep the custom bar, or switch to the native iOS tab bar (Liquid Glass on iOS 26) | Keep the custom bar for v1. It is pinned by tests and already uses UIKit metrics. Revisit after TestFlight |
| D5 | `preferEphemeralSession` for Microsoft sign-in | Yes |
| D6 | Packages: add `expo-updates` and `expo-dev-client`; remove `@react-navigation/drawer`; pin `eas-cli` | Approve all four |
| D7 | EAS owner for `setu-ios` (`ronitpc`, as for Android?), and the Apple Developer team | Your call |
| D8–D11 | Distribution route, dark mode, account deletion, App Store name | See `APP-STORE-COMPLIANCE.md` |
