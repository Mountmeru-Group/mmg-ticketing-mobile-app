# App Store compliance checklist — Setu (iOS)

> Written in Phase iOS-1a, 2026-10-27. **Every row is Open.** A row closes only with evidence (a build, a screenshot or a link) recorded in the row.
> The phases are the ones in `00-PORT-MANIFEST.md` §2.

**Sources, read on 2026-10-27:**
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), which say "Last Updated: October 16, 2026";
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/);
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/);
- the Human Interface Guidelines.

**Two caveats:**
- **The `apple-look` skill is not installed** in this environment, so these rows come from Apple's published pages directly.
- **The HIG has no numbers.** HIG rows are filed under guideline 4.0 (Design) and name the HIG topic.

## A. 2.1 — App completeness

| # | Guideline | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|---|
| A1 | 2.1(a) | No crashes or obvious technical problems; tested on a device | - The `ErrorBoundary` carries over: a render crash shows a recoverable screen.<br>- Every screen is tested on a physical iPhone on the currently shipping iOS.<br>- TestFlight crash reports are read before each submission.<br>- The app is also run **in iPad compatibility mode**: an iPhone-only app can still be installed on an iPad, and review may use one | iOS-4, iOS-5, re-checked in iOS-8 (testing rounds) and iOS-9 | Open |
| A2 | 2.1(a) | No placeholder text, empty pages or temporary content | - `PlaceholderScreen` is reachable only in developer or test-login builds.<br>- Modules whose backend ask hasn't shipped stay hidden, not shown as "coming soon" (Assets P18, approval delegation A26).<br>- The Theme setting is not shown.<br>- Icon and splash come from the final high-resolution master (the same open item as Android, RELEASE §7) | iOS-9 | Open |
| A3 | 2.1(a) | "Turn on your back-end service" | - The production API must be live during review, with AUTH-P2 (`/auth/microsoft/mobile`) deployed to PROD. 10-A2-STATUS §0.4 says PROD is **not confirmed**.<br>- The PROD URL in `env.ts` needs your written sign-off.<br>- Depends on the backend team | iOS-9 | Open |
| A4 | 2.1(a) | Demo account for the reviewer, with full access | - An Entra **work account in the MMG tenant**, for Apple only.<br>- It must be able to sign in from outside MMG's network and country: a Conditional Access exclusion, and MFA either off for this one account or given by a method a reviewer can use.<br>- It needs an **AGENT role locked to a test country or group** with seeded tickets, so the reviewer sees assignment, status, approvals and tasks but **no real staff or customer data**.<br>- This is an IT and backend ask (raise in iOS-3).<br>- Apple's other option, a built-in demo mode, needs Apple's prior approval and is not proposed | Ask: iOS-3. Ready: iOS-9 | Open |
| A5 | 2.1(a), 2.3.1(a) | Review notes: specific, with demo credentials | Notes state:<br>- this is Mount Meru Group's internal IT service desk;<br>- sign-in is the company's Microsoft Entra ID (enterprise SSO, see G1);<br>- the demo credentials and any MFA step;<br>- what to try: raise a ticket, reply, attach a photo, change status, approve, read the knowledge base;<br>- there are no in-app purchases;<br>- the account-deletion route (H6).<br>Each later version names its changes specifically | iOS-9 | Open |
| A6 | 2.1(b) | In-app purchases complete and reviewable | No in-app purchases, subscriptions or paid content. Nothing to configure; stated in the notes | iOS-9 | Open |

## B. 2.3 — Accurate metadata

| # | Guideline | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|---|
| B1 | 2.3 | Description, screenshots, previews and privacy information match the app's core experience | Written from the build that is submitted, and updated with each version | iOS-9 | Open |
| B2 | 2.3.3 | Screenshots show the app in use, not the title art, login or splash | iPhone screenshots of Home, Tickets, Ticket detail, Approvals and Knowledge base, taken from the demo data (A4) so no real names appear | iOS-9 | Open |
| B3 | 2.3.7 | Unique app name of at most 30 characters; no keyword stuffing | - **"Setu" may already be taken** on the App Store.<br>- The name under the icon (`CFBundleDisplayName`) can stay "Setu" while the store name is longer, e.g. "Setu – Mount Meru Service Desk" (exactly 30 characters).<br>- Reserve it when the App Store Connect record is created.<br>- **Decision D11** | iOS-3 | Open |
| B4 | 2.3.8, age rating | Metadata suitable for 4+; age rating questions answered | Answer the updated age-rating questionnaire (the new system, mandatory since 31 Jan 2026) in App Store Connect | iOS-9 | Open |

## C. 2.5 — Software requirements and EAS Update

| # | Guideline | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|---|
| C1 | 2.5.1 | Public APIs only; runs on the currently shipping OS | Expo SDK 57 and React Native 0.86, with no private APIs. Tested on the current iOS release and on the oldest iOS that Expo SDK 57 supports | iOS-5, iOS-9 | Open |
| C2 | 2.5.2 + the Developer Program License Agreement's interpreted-code clause (§3.3.1(B) in recent versions; §3.3.2 in older ones) | No downloaded code that adds or changes features. Downloaded interpreted code must not change the app's primary purpose | **EAS Update is for fixes only.** Allowed:<br>- JavaScript bug fixes;<br>- wording fixes;<br>- fixes to data handling.<br>Never by update:<br>- a new feature, screen or module;<br>- a new permission;<br>- a change of purpose.<br>Anything else ships as a new build through review.<br><br>How it is enforced:<br>- `runtimeVersion: fingerprint`: an update reaches only binaries with the same native code;<br>- separate channels: `ios-preview` (TestFlight) and `production`;<br>- every production update goes through the script in manifest §8 L5, which runs `verify-release-bundle`;<br>- each update is logged with its reason in `docs/ios/` | iOS-3, then every release | Open |
| C3 | 2.5.2 | Self-contained; no reading or writing outside the app's container | Downloads go to one folder in the app's own cache (`attachmentDownload.ts`). Picked documents are copied into the cache (`copyToCacheDirectory: true`) | iOS-4 | Open |
| C4 | 2.5.4 | Background modes only for their intended purpose | None declared: no audio, location, VoIP or background fetch. No push in v1; push (ask A5) will need its own row<br>- **iOS-1b:** `npx expo config --type introspect` shows no `UIBackgroundModes`. Proven by the first build (iOS-3) | iOS-1b | Open |

## D. 3 — Business

| # | Guideline | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|---|
| D1 | 3.1.1, 3.1.3(c) | Paid digital content must use in-app purchase | Nothing is sold. Not applicable; stated in the notes | iOS-9 | Open |
| D2 | 3.2 (Other business model issues) | **An app made for one organisation's staff** is regularly rejected for public App Store listing; reviewers point to Custom App distribution. *This comes from rejection reports and Apple's distribution options, not from a guideline sentence* | **Decision D8**, before the first App Review submission, because the route is hard to change afterwards:<br>(a) **Custom App via Apple Business Manager.** MMG enrols in ABM; the app is still reviewed, but only MMG gets it.<br>(b) **Unlisted App Distribution.** Requested from Apple; the app is reachable only by its link.<br>(c) Public listing, with the case made in the review notes.<br>**Recommended: (a)** if MMG has or can get ABM, otherwise (b) | Decide: iOS-3 | Open |

## E. 4.0 — Design and the Human Interface Guidelines

| # | Guideline | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|---|
| E1 | 4.0 / HIG: Tab bars | Tab bar for top-level areas; at most 5 tabs on iPhone; don't hide or disable tabs | - Tabs: **Home · Tickets · Alerts · More**, the same four for every role.<br>- More holds Approvals, Tasks, Knowledge base, Service Request, Announcements and Settings.<br>- The rows that depend on the role live in the More list, never in the bar.<br>- No drawer and no ☰ (manifest §4.5) | iOS-2 | Open |
| E2 | 4.0 / HIG: Navigation | The native back swipe works everywhere; sheets close with a swipe down | - Every pushed screen keeps native-stack's edge swipe, including the module screens opened from More.<br>- The back control is a chevron.<br>- `presentation: 'modal'` gives native page sheets.<br>- **The unsaved-input guard** (`useDiscardGuard`) must also catch the swipe-back and the swipe-down. Check on a device; if it doesn't, turn the gesture off while there is unsent input | iOS-2, iOS-4 | Open |
| E3 | 4.0 / HIG: Platform conventions | iOS controls and conventions, not Android ones | - No ☰, no ⋮ (use `ellipsis-horizontal-circle`), no ripple or elevation.<br>- The iOS share glyph.<br>- No toast: a non-modal `Notice` instead.<br>- No hardware-back logic (`BackHandler` removed in 2 screens).<br>- Native iOS date picker (`DatePickerSheet`) instead of the Android dialog.<br>- iOS `Switch` | iOS-2, iOS-4 | Open |
| E4 | 4.0 / HIG: Layout | Respect safe areas: notch or Dynamic Island, home indicator | - Headers pad by the top inset; bars and lists by the bottom inset (already done that way on Android).<br>- Portrait only.<br>- Checked on a Dynamic Island phone and on a small phone (iPhone SE size) | iOS-2, iOS-5 | Open |
| E5 | 4.0 / HIG: Accessibility | Hit targets at least 44 × 44 pt | - UI-STANDARDS already uses 44 (`h-11` / `min-h-11`), and dp = pt numerically.<br>- Re-audit on iOS: header icons, tab items, chips, row actions | iOS-5 | Open |
| E6 | 4.0 / HIG: Typography | Support Dynamic Type | - React Native text follows the user's text size by default, and no `maxFontSizeMultiplier` is set anywhere.<br>- Check every screen at the largest accessibility size (AX5); Android was measured only up to 200 %.<br>- Fixed-height pieces (tab bar, header, badges, KPI tiles) must either grow or, for the tab bar, use iOS's large-content behaviour | iOS-5 | Open |
| E7 | 4.0 / HIG: Dark Mode | Decide whether to support dark mode | - **Decision D9. Proposed: light only for v1**, as on Android and the web.<br>- `userInterfaceStyle: "light"` sets `UIUserInterfaceStyle = Light`, so system sheets, pickers and the keyboard also stay light.<br>- Apple does not require dark mode. Contrast has been verified only for light (UI-STANDARDS §3)<br>- **iOS-1b:** set in `app.json`; `npx expo config --type introspect` shows `UIUserInterfaceStyle = Light`. Proven by the first build (iOS-3) | iOS-1b | Open |
| E8 | 4.0 / HIG: Motion | Honour Reduce Motion | - `useReduceMotion` reads iOS's Reduce Motion through the same React Native API, so the shimmer, list-entry and status-badge animations are skipped when it is on.<br>- Check the stack and sheet transitions on a device with it on | iOS-5 | Open |
| E9 | 4.0 / HIG: VoiceOver | Every control labelled and in a sensible order | - Roles and labels already exist (tested with TalkBack on Android).<br>- A VoiceOver pass on every screen.<br>- Success notices announced (`Notice`) | iOS-5 | Open |
| E10 | 4.0 / HIG: iOS 26 design (Liquid Glass) | Building with the iOS 26 SDK applies the new look to native controls | - Native controls (alerts, sheets, pickers, keyboard) take it automatically.<br>- The custom tab bar and header do not; acceptable for v1 (**decision D4**).<br>- Do **not** set `UIDesignRequiresCompatibility`: Apple describes that opt-out as temporary | iOS-2 | Open |
| E11 | 4.0 / HIG: App icons, Launch screen | The App Store icon is 1024 × 1024 and opaque; a plain launch screen | - `assets/icon.png` is 1024 × 1024 and opaque; it must be rebuilt from a high-resolution master.<br>- Dark and tinted icon variants are optional; proposed for after v1.<br>- The launch screen comes from `expo-splash-screen` (logo on white) | iOS-1b, iOS-9 | Open |
| E12 | 2.4.1, iPhone-only | iPhone apps should run on iPad wherever possible | - `supportsTablet: false` makes the app iPhone-only.<br>- iPad users can still install it in compatibility mode, so it must not break there (see A1).<br>- No iPad screenshots are needed | iOS-1b, iOS-5 | Open |

## F. 4.2 — Minimum functionality

| # | Guideline | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|---|
| F1 | 4.2, 4.2.2 | More than a repackaged website; not a collection of links | - A native client with no web view of the portal.<br>- Tickets: create, reply, change status, assign, attachments from the camera, photos or files.<br>- Approvals, tasks, the knowledge base, the service catalogue and alerts.<br>- An offline banner and handling | iOS-4, checked iOS-9 | Open |
| F2 | 4.2.3(i) | Works without installing another app | Sign-in runs in the system's web sign-in sheet (`ASWebAuthenticationSession`). The app needs no other app. If MMG's MFA policy uses Microsoft Authenticator, the review notes say so | iOS-7 | Open |

## G. 4.8 — Login services

| # | Guideline | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|---|
| G1 | 4.8 | A third-party or social login must be offered alongside an equivalent private option (e.g. Sign in with Apple) — **not required** for "an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account" | - Setu signs in **only** with the user's existing MMG Microsoft Entra ID work account.<br>- There is no social login and no self sign-up, so Sign in with Apple is not required.<br>- The review notes quote this exemption | iOS-7, iOS-9 | Open |

## H. 5.1 — Privacy

| # | Guideline | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|---|
| H1 | 5.1.1(i) | A privacy-policy link in App Store Connect **and** easily reachable in the app. The policy says what is collected, how it is used and shared, retention and deletion, and how to ask for deletion | - **MMG publishes the policy URL** (owner: you / legal).<br>- The app links to it from More → Settings (`ProfileScreen`, manifest §6 #25).<br>- The policy covers: name, email, role, country, and department and phone from sign-in; tickets, comments and attachments, including photos.<br>- Sharing: Microsoft for sign-in; Expo for app updates; nobody else | Link: iOS-5. URL: iOS-9 | Open |
| H2 | 5.1.1(ii) | Purpose strings clearly and completely describe the use | - Camera, photo library and photo-library-add strings, worded in manifest §4.2.<br>- No microphone string.<br>- The default Face ID string is removed: the app never uses biometrics.<br>- The Files picker needs no permission, so it has no string<br>- **iOS-1b:** set in `app.json` `ios.infoPlist`. `npx expo config --type introspect` shows our three strings, and no microphone or Face ID key. Proven by the first build (iOS-3) | iOS-1b | Open |
| H3 | 5.1.1(iii) | Ask only for what the core function needs; prefer out-of-process pickers | - Photos and Files use the system's out-of-process pickers.<br>- No contacts, location or tracking.<br>- Microsoft's access and refresh tokens are discarded; only the ID token is used, once.<br>- **Consider dropping the `offline_access` scope**, since the refresh token is never used (an ask to IT, the A2 registration) | iOS-7 | Open |
| H4 | Privacy manifest (required for uploads since 1 May 2024) | `PrivacyInfo.xcprivacy`: tracking flag, tracking domains, data types, and approved reasons for the "required reason" APIs, including those used by SDKs | - Declared in `app.json` `ios.privacyManifests`: `NSPrivacyTracking: false`, no tracking domains, data types matching H5.<br>- Approved reasons for the required-reason APIs that React Native and Expo modules use. Commonly: UserDefaults `CA92.1`, file timestamps `C617.1`, system boot time `35F9.1`, disk space `E174.1`; **confirm against the actual build**.<br>- Check the merged file in the archive and the App Store Connect upload warnings | iOS-3 | Open |
| H5 | 5.1.2, App Privacy labels | The App Store Connect privacy answers are accurate | **Data linked to the user, used for App Functionality, not used to track:**<br>- Contact info: name, email address, phone number.<br>- User content: photos, customer support (tickets), other user content (comments, attachments).<br>- Identifiers: user ID.<br><br>**Not collected:** analytics, advertising and crash SDKs. **To check:** what `expo-updates` sends with update requests (it includes an install identifier), and whether Apple's definitions require declaring it | iOS-9 | Open |
| H6 | 5.1.1(v) | If the app supports account creation, it must let people start account deletion in the app. Apple's FAQ adds that **automatically created accounts count too**. Non-regulated apps must not require a phone call, email or support flow; a direct link to a web page that completes deletion is allowed | **This is a real risk:**<br>- AUTH-P2 **auto-creates** a Service Desk user (END_USER) the first time someone signs in (10-A2-STATUS §0.2).<br>- Apple's page has no exception for enterprise accounts.<br><br>**Proposed position:**<br>- Setu creates no identities: MMG IT creates the Entra work account, the Service Desk record mirrors it, and offboarding removes it.<br>- **Even so, add a "Delete account" entry** in Settings that *starts* deletion in the app. Either:<br>&nbsp;&nbsp;(a) a backend endpoint that files a deletion or deactivation request (a **new backend ask**); or<br>&nbsp;&nbsp;(b) a link straight to an MMG web page where the request is completed.<br>- Not email or phone.<br>- **Decision D10** | Decide: iOS-5. Build: iOS-5 or iOS-9 | Open |
| H7 | 1.2, 1.5 | User-generated content safeguards; developer contact information | - Tickets and comments are private exchanges between MMG staff and MMG IT, moderated by IT staff. There is no public feed and no strangers, so report and block tools don't fit; the notes explain this.<br>- A Support URL with contact details goes in the metadata (1.5) | iOS-9 | Open |

## I. Export compliance

| # | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|
| I1 | Declare encryption use for each build | - `ios.config.usesNonExemptEncryption: false` writes `ITSAppUsesNonExemptEncryption = false`.<br>- Justification: the only encryption is HTTPS through iOS and OS-provided SHA-256 for PKCE (`expo-crypto`), with no proprietary or non-standard cryptography, so it is exempt.<br>- App Store Connect then stops asking for each build<br>- **iOS-1b:** set in `app.json`; `npx expo config --type introspect` shows `ITSAppUsesNonExemptEncryption = false`. Proven by the first build (iOS-3) | iOS-1b | Open |

## J. Build and upload requirements

| # | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|
| J1 | Since 28 Apr 2026, uploads must be **built with Xcode 26 or later using the iOS 26 SDK** | - Each EAS iOS profile uses a build image with Xcode 26 or later (pinned in `eas.json`, manifest §4.3).<br>- The SDK line in each build log is checked | iOS-3 | Open |
| J2 | Since 9 Sep 2026, iOS apps must target iOS 13 or later | Expo SDK 57's own minimum is already higher. Record the actual deployment target from the first build | iOS-3 | Open |
| J3 | iPhone-only build | `supportsTablet: false` gives `UIDeviceFamily = [1]`<br>- **iOS-1b:** `supportsTablet: false` set in `app.json`. The device family is written into the Xcode project, so the first build proves it (iOS-3) | iOS-1b | Open |

## K. Release hygiene: no test sign-in in release builds

| # | Rule | How Setu meets it | Phase | Status |
|---|---|---|---|---|
| K1 | The developer token and any test login are absent from every build submitted for review | - The `production` profile never sets the test-login flag.<br>- Build guard, runtime lock, and `verify-release-bundle` (iOS) PASS on the `production` configuration (manifest §8, locks L1–L5).<br>- After SSO works, the developer-token screen, its route and the flag are deleted (RELEASE checklist) | Locks: iOS-3. Deletion: iOS-9 | Open |
| K2 | Only reviewed builds reach users; test builds stay internal | - UAT `preview` builds go to **TestFlight internal testers only**. External TestFlight groups would trigger Beta App Review and widen access.<br>- Only `production` builds are submitted to App Review | iOS-3, iOS-9 | Open |
| K3 | Production target ready | - PROD URL signed off (`env.ts`).<br>- AUTH-P2 on PROD.<br>- Security asks A7, A13 and A14 fixed on PROD (carried over from RELEASE §5) | iOS-9 | Open |

## Decisions this checklist needs from you

| # | Decision | Row |
|---|---|---|
| D8 | Distribution route: Custom App (ABM), Unlisted, or public | D2 |
| D9 | Dark mode: light only for v1 | E7 |
| D10 | Account deletion: backend endpoint or web-page link | H6 |
| D11 | App Store name, if "Setu" is taken | B3 |
| — | Privacy-policy URL owner | H1 |
| — | Demo account: IT (Entra, Conditional Access, MFA) and backend (test country, seeded data) | A4 |
