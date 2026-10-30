# UAT test plan — Setu (iOS, TestFlight `preview` build)

**Written in Phase iOS-5, 2026-10-29,** for the first TestFlight build (iOS-7) and the testing rounds (iOS-8).
- **Based on** Android's plan, `docs/UAT-TEST-PLAN.md`: 96 checks, sections A–F. Each of them is here, adapted to the iOS interface. Each check keeps Android's ID where there is one.
- **Added for iOS:**
  - G: iOS-only checks;
  - H: write safety, on one agreed UAT test ticket;
  - I: the account-deletion request and the privacy link.
- **217 checks:** A–E 133, G 60 (22 screens at two text sizes among them), H 17, I 7. iOS-5b (2026-10-30) added six, from Android's `4063df3` plan: D1.3a, D1.3b, E14.3, E17.3, E18.1 and E18.2.
- **F, the defect log, is at the end**, so that it follows every section.

**How to use it**
- Work top to bottom.
- Put ✓ or ✗ in the last column of each check. Log every ✗, and anything else unexpected, in **Section F** as you go.
- **Role** is the account to use: **User** (END_USER), **Technician** (AGENT with no country, the "triage" technician), **Technician-CA** (an AGENT with a country, optional), **L2 Manager** or **Admin**. "Any" means any one of them.
- **The app only mirrors the web portal's UI.** The server stays the authority. So a ❌ in this plan means "not offered", not "impossible".

**Before you start**
- **Build.** You need the `preview` build from TestFlight (section A). It talks only to **UAT** (`uat-servicedesk.mountmerugroup.com`).
- **Phones.**
  - One small iPhone: iPhone SE (2nd or 3rd generation) or iPhone 13 mini.
  - One current iPhone with the Dynamic Island.
  - For G13, one iPad.
  - Note each one's iOS version in Section F.
- **Test accounts.** You need four Microsoft work accounts in the Mount Meru tenant. An admin sets their roles on the UAT web portal **before** Section D:
  - User;
  - Technician (no country);
  - L2 Manager;
  - Admin;
  - optionally a fifth, Technician-CA.

  The first sign-in creates an account as END_USER.
- **Ticket names.** Start every ticket you create with **`[MOBILE TEST]`**.
- **Email.** UAT may send real email. Use only your test accounts as requesters, approvers and in To/Cc. Never add a real colleague.
- **Load.** UAT shares a server with production. Don't stress it, for example by pulling to refresh in a loop.
- **Screenshots.** Press the side button and volume up together. Note the time to the minute: IT finds a sign-in in Entra's logs by account and time.

---

## Section A — Install (TestFlight)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| A1 | Any | Install **TestFlight** from the App Store. Open the invitation from App Store Connect and accept it | TestFlight lists **Setu**, with the build number from the release notes. (Android: uninstall the old APK. Not needed: there is no older iOS app) | |
| A2 | Any | In TestFlight, tap **Install** | Setu installs. There is no "Untrusted Developer" prompt (TestFlight builds are signed) | |
| A3 | Any | Look at the icon on the Home Screen, in the App Library and in the app switcher | The Meru logo: a red "m" with a yellow drop, on white, in iOS's rounded square. **Not** a blue square with "MMG"; no black or see-through corners | |
| A4 | Any | Read the name under the icon, and under Settings › Apps | **Setu**, in full | |
| A5 | Any | Swipe Setu away in the app switcher, then open it | The launch screen is the Meru logo with "Setu" under it, on white. Then Login, with **no white or blank flash** | |
| A6 | Any | Look at Login | The amber badge reads **`UAT · uat-servicedesk.mountmerugroup.com`**, without "development build". There is **no** dashed amber box "Developer: use a UAT session token". If there is, stop: **Critical** | |

---

## Section B — Microsoft sign-in

### B1. Steps: from Sign in to Home

Do this first with the **Admin** account.

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| B1.1 | Admin | On Login, tap **Sign in with Microsoft** | The button reads **Signing in…** with a spinner. "Finish on the Microsoft page. Close it to cancel." appears | |
| B1.2 | Admin | Watch what opens | A sign-in sheet slides up on `login.microsoftonline.com` and asks you to **pick an account**, every time, by design. **There is no "'Setu' Wants to Use 'microsoftonline.com' to Sign In" prompt**: the sheet is private (D5) | |
| B1.3 | Admin | Choose or type the work account; finish the password and MFA. If Conditional Access asks for an **Authenticator** approval, switch to Authenticator, approve, and come back | The sheet is still there, and continues | |
| B1.4 | Admin | If Microsoft shows **"Permissions requested"**, note it in F, then accept | Normally it does not appear: IT granted admin consent | |
| B1.5 | Admin | — | The sheet closes **by itself**. The button spins for a moment, then **Home** appears | |
| B1.6 | Admin | Look at Home, then at the **More** tab | Home: **"Good morning, <first name>"** ("Good afternoon" from 12:00, "Good evening" from 17:00 to 04:59, by the phone's clock; iOS-5b), with the role under it. More: the account card shows your **real full name** and role, not "Signed in" or an email address. Home's counts and Recent tickets load (proof that the token works for later requests, BLOCKER B4) | |
| B1.7 | Admin | Swipe the app away and reopen it. Then restart the phone and open it | Straight to Home both times, with no sign-in | |
| B1.8 | Admin | Sign out (E15.4). Tap Sign in, then **Cancel** on the sheet | Back on Login, with **no error message** | |
| B1.9 | User, Technician, L2 Manager | B1.1–B1.6 with each account | The same, each with its own name and role | |
| B1.10 | Any | Sign in to Microsoft in **Safari** first (office.com). Then sign out of Setu and sign in again | Setu asks for the account and password again: the private sheet doesn't reuse Safari's sign-in (D5). On a phone managed with Microsoft's SSO plug-in, note in F what happened. (Android's check, an "Open with" chooser for `msauth://` links, doesn't apply: iOS registers only `msauth.com.mountmeru.servicedesk`) | |

### B2. When it fails: what you see, what it means, who fixes it

Every failure **inside the app** shows a red box with a title, a message and a line such as **`Ref: token-rejected · HTTP 401`**. Copy that line exactly. A failure **on Microsoft's page** shows nothing in the app, so take a screenshot of the page and tap "More details".

| # | What you see | Where | `Ref:` | What it means | Who fixes it |
|---|---|---|---|---|---|
| F1 | A Microsoft error page with an **AADSTS** code | The sign-in sheet | none | **Entra configuration:**<br>- **50011:** `msauth.com.mountmeru.servicedesk://auth` is not registered exactly, under the **iOS/macOS** platform for bundle ID `com.mountmeru.servicedesk`;<br>- **700016:** wrong client or tenant ID;<br>- **65001, 90094:** no consent;<br>- **50020, 50034:** the account isn't in the tenant;<br>- **53003:** blocked by Conditional Access | IT |
| F2 | "Microsoft sign-in failed" | App | `microsoft` | Microsoft returned an error, or no ID token. Send the time and the account; IT reads the code in Entra's log | IT |
| F3 | Back on Login with **no message**, although you didn't cancel. Or the sheet stays on a blank page after sign-in | App, sheet | none | **The redirect didn't come back** to the app. Check the iOS redirect in Entra (02-AUTH §7.7) | IT and mobile team |
| F4 | "Sign-in couldn't be completed" | App | `unexpected-response · HTTP 200` | Contract mismatch: the reply lacks `token`, `expiresAt`, `user.id`, `user.email` or `user.role`, has an unknown role, or isn't JSON (`src/types/mobile-sso-contract.ts`) | Backend and mobile |
| F5 | "App sign-in isn't available yet" | App | `endpoint-missing · HTTP 404` | `POST /api/v1/auth/microsoft/mobile` is not reachable on UAT | Backend, server |
| F6 | "Sign-in was refused" | App | `token-rejected · HTTP 401` | The Service Desk refused the ID token: a different client or tenant on UAT, or not a work account | Backend |
| F7 | "Account deactivated" | App | `account-disabled · HTTP 403` | The account is deactivated in the Service Desk | UAT admin |
| — | "The Service Desk had a problem" | App | `server · HTTP 500` | Server error | Backend |
| — | "Can't connect" | App | `network` | No answer: offline, DNS, timeout. Check Wi-Fi or VPN | — |
| — | "Too many attempts" | App | `rate-limited · HTTP 429` | Wait a few minutes | — |
| — | "Sign-in request wasn't accepted" | App | `bad-request · HTTP 400` | The server couldn't read the request | Mobile and backend |
| — | "Microsoft sign-in is not configured." | App | `not-configured` | This build lacks the Entra IDs. It must never happen in TestFlight | Mobile |
| — | "Couldn't save your sign-in" | App | `storage` | The Keychain refused to store the session | Mobile (note the phone model) |
| F8 | Home appears, then you're **sent back to Login** with "Your session has ended. Please sign in again." | App | none | Sign-in worked, but the next requests got 401. IIS probably isn't passing the `Authorization` header (BLOCKER B4) | Backend, server |

**To report a sign-in failure:** the row (F1–F8); the `Ref:` line, or the AADSTS code with the correlation ID and timestamp; the account, its role and the time; a screenshot.

---

## Section C — Branding

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| C1 | Admin | Login, then the **More** tab (iOS has no drawer) | Login: the Meru logo above the card, not cropped. More: a grouped list (Tasks, Service Request, My Requests · Knowledge base, Announcements · Settings; the middle group is the Admin account's only, since iOS-5b), then the account card and **Sign out** in red. Nothing hides under the home indicator | |
| C2 | Any | Look at More's account card and footer | Initials circle, **name**, **role** and a chevron; tapping it opens Settings. **Sign out** in red under it. The footer reads **`v0.1.0 · UAT`**, without "dev build" | |
| C3 | Any | Set the largest text size (Settings › Accessibility › Display & Text Size › Larger Text, slider at the far right), then open More | The rows grow and the list scrolls. The account card and the version line are reached by scrolling, and nothing is clipped. (Android pinned the card; iOS's More is one scrolling list) | |
| C4 | Any | Look at the tab bar, then switch tabs | The tab you are on has a **brand-red** icon and label; the others are grey. Badges are red with white text | |
| C5 | Admin | Home, at the default text size | Tiles **two per row**: Open; In progress, On hold; SLA breached, Active; Unassigned. Each has a coloured square with a white icon, the label **in full** and the number, and none covers the "Hello, …" greeting. With **Technician-CA** or **L2 Manager** there are five tiles, and the last (Active) is **full width** | |
| C6 | Admin | Home, at the largest accessibility size | Tiles **one per row**. Labels in full, numbers aligned, nothing cut off | |
| C7 | Any | Look for the brand red | The active tab, "Raise a ticket", Save / Send, the **+** button, spinners and pull to refresh, the selected filter chips. Links are blue | |
| C8 | Any | Login and the More list at the largest accessibility size | Login's card and its button stay readable. The More rows wrap, without breaking a word in the middle. (Android's C8 noted the drawer header at 200 %; iOS has no drawer header) | |

---

## Section D — The role matrix

### D1. What each role sees

Sign in as each account in turn and check every row. **✅** = must be there. **❌** = must **not** be there. Any other text is the exact condition. **(CA)** marks where the Technician-CA differs.

| ID | Area | User | Technician | L2 Manager | Admin | ✓/✗ |
|---|---|---|---|---|---|---|
| D1.1 | Tabs (iOS) | Home, **My Tickets**, Alerts, More | Home, **Tickets**, **Approvals**, Alerts, More | Home, Tickets, Alerts, More | Home, Tickets, Approvals, Alerts, More | |
| D1.2 | More: Approvals row (iOS) | only while ≥ 1 approval is pending, with the count on the More tab | ❌ (it's a tab) | only while ≥ 1 is pending, with the count on More | ❌ (it's a tab) | |
| D1.3 | More: Tasks, Service Request, My Requests, Settings | ✅ | ✅ | ✅ | ✅ | |
| D1.3a | More: Knowledge base, Announcements (Admin only since iOS-5b, as Android 2026-10-29) | ❌ | ❌ | ❌ | ✅ | |
| D1.3b | Home: announcement banner, when one is active (Admin only since iOS-5b) | ❌ | ❌ | ❌ | ✅ | |
| D1.4 | Badges (iOS) | Alerts: unread. More: pending approvals | Alerts; Approvals: pending | as User | as Technician | |
| D1.5 | Account card: lock chip with the country | ❌ | ❌; **(CA)** ✅ | ❌ | ❌ | |
| D1.6 | Home tiles | **Open, Resolved** (with numbers) | Open, In progress, On hold, SLA breached, Active, **Unassigned**; **(CA)** the same, without Unassigned | the same five **without numbers** ("View tickets"), with a blue notice saying why | all six | |
| D1.7 | Home shortcuts | "Pending approvals" only while ≥ 1 | My open, Due soon, Pending approvals | My open, Due soon (+ Pending approvals while ≥ 1) | My open, Due soon, Pending approvals | |
| D1.8 | Home: "Pending approvals" opens… (iOS) | More › Approvals | the Approvals tab | More › Approvals | the Approvals tab | |
| D1.9 | Home: create | **"Raise a ticket"**; ❌ no **+** | **+** | **+** | **+** | |
| D1.10 | Ticket list chip "Unassigned" | ❌ | ✅ | ❌ | ✅ | |
| D1.11 | Ticket list country pill | ❌ | globe pill (a country picker); **(CA)** grey lock pill | ❌ | globe pill | |
| D1.12 | Long-press a ticket | ❌ nothing happens | selects; "N selected", Cancel and "max 20" in the navigation bar | ✅ | ✅ | |
| D1.13 | Selection bar | — | **Pick up, Assign, Close** | **Close only** | Pick up, Assign, Close | |
| D1.14 | Ticket detail: **⋯** (More options, top right) | ❌ no ⋯ at all | an action sheet: Pick up (not on your own ticket), Assign…, Close… (where Close is allowed), **Submit for approval…**, Cancel | **Close… only** | as Technician | |
| D1.15 | Ticket detail: Impact, Urgency, First response | ❌ | ✅ | ✅ | ✅ | |
| D1.16 | Properties: "Change …" links | values only | impact and urgency, category, **technician**, country; **(CA)** country shows a lock reason | impact and urgency only; category, technician and country are values | all of them | |
| D1.17 | "Change status" card | ❌ | ✅ (E6) | ✅ | ✅ | |
| D1.18 | Buttons under Conversation | **Reply** only | Reply, Reply all, **Note** | Reply, Reply all; ❌ **no Note** | Reply, Reply all, Note | |
| D1.19 | Private notes in Conversation and History | ❌ **never** (D2) | ✅ | ❌ (the app hides them from L2 too) | ✅ | |
| D1.20 | Create ticket form | Title, Description, Category (+ Subcategory, Item), Attachments; the routing notice once a category is chosen | + **Classification** (Impact, Urgency, the priority preview) + **Routing** (Group, Assign to, Requester) | + Impact and Urgency, and "the Service Desk sets the priority"; ❌ no Routing | as Technician | |
| D1.21 | Tasks | read-only: "Tasks are read-only for your role."; ❌ no Add task, no checkbox | add, tick, edit, remove | add, tick, edit, remove; the Technician field is read-only | all | |
| D1.22 | Approvals: Approve / Reject | only on approvals assigned to them | same | same | same | |
| D1.23 | Settings: editable fields | Name, Phone, Department, Timezone; Email and Role read-only | same | same | same | |
| D1.24 | Settings: Country card | ❌ | selector ("Not saved to your account"); **(CA)** "Locked to your country" | ❌ | selector | |

### D2. A User must never see a private note (Critical)

Setup: as the **User**, create `[MOBILE TEST] D2 private note check` (E1).

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| D2.1 | Technician | Open the D2 ticket and tap **Note**. Write `[MOBILE TEST] INTERNAL — the requester must not see this`. Tap **Save Note** | The composer says "Internal note: visible to Admins and Technicians only…". The field's hint is **"Text only: a note takes no files."**, and **there is no Attachments field** (iOS: 05 §C.26). Saving shows "Note saved" | |
| D2.2 | Technician, Admin | Open Conversation | The note is an amber-tinted card labelled **"Private note"** | |
| D2.3a | User | Open the ticket's **Conversation** | ❌ The note isn't there, and the Conversation count doesn't include it | |
| D2.3b | User | Open **History** | ❌ No entry says a note or comment was added at that time | |
| D2.3c | User | Open **Alerts** | ❌ No notification quotes or mentions the note. (The app shows the server's text unchanged) | |
| D2.3d | User | Check the mailbox | ❌ No email about the note | |
| D2.3e | User | Open **Attachments** | Nothing new: the note carried no file. (Android's D2.3 found a note's files visible to the requester, §7.1 of WEB-VS-MOBILE-ROLES. iOS can't add a file to a note. Files attached to notes **on the web** are still visible; that is the backend's fix) | |
| D2.4 | L2 Manager | Open the ticket | ❌ The note isn't shown (the app's rule) | |
| D2.5 | User | Look for a way to write a note | No **Note** button, and the composer has no "Private note" mode | |
| D2.6 | Technician | On **Reply**, add a photo. Then switch to **Note** (iOS) | An alert asks first, with **"Remove and write a note"** in red. Cancel keeps the photo, on Reply. Confirming removes the photo and opens Note | |

### D3. Technician lock on closed and canceled tickets

Setup: a `[MOBILE TEST]` ticket that has been **closed** (E7).

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| D3.1 | Technician | Open the closed ticket | ⋯ has ❌ no Pick up and no Assign…. The Attachments tab says "Closed and canceled tickets are locked for technicians, so files can't be added here." The status card says "Closed and canceled tickets are locked for technicians." Impact and urgency, category and technician show the lock reason instead of "Change …" | |
| D3.2 | Admin | Open the same ticket | Assign…, Add attachment and the property editors are still offered (Admins are not locked) | |
| D3.3 | Technician | **Known gap, check and log.** On the closed ticket, tap **Reply**, attach a file and send | The web doesn't let technicians add files to closed tickets (05 §A.3). The reply path doesn't check the lock, on iOS as on Android (`src/hooks/usePostComment.ts`). If the file is accepted, log it as **Medium** (mobile) | |

---

## Section E — Core flows

- **Every ticket title starts with `[MOBILE TEST]`.** Work only on `[MOBILE TEST]` tickets, also when you select tickets in bulk.
- **Writes are tested in two places:**
  - in Sections D and E, on the `[MOBILE TEST]` tickets made in E1 and E2;
  - in Section H, the write-safety checks, on **one** agreed ticket.
- When you finish, close every `[MOBILE TEST]` ticket as Admin, with closure code "Other".
- **iOS:** every write sheet opens over the tabs. It closes with ✕ or a swipe down, and asks first when it holds unsent input (G4).

### E1. Create a ticket (User)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E1.1 | User | Home › **Raise a ticket**. Title `[MOBILE TEST] E1 laptop will not charge`; a sentence of description; a category, then a subcategory or item if offered. **Add attachment** › **Take Photo**. Tap **Create ticket**, then confirm "Create this ticket?" | The sheet closes, and the new ticket opens in the Home tab, the tab you started from. It's at the top of **My Tickets** and in Home's recent tickets. The photo is in **Attachments** | |
| E1.2 | User | Start a ticket and leave Title or Description empty | It can't be created, and a message says what is missing | |

### E2. Create a ticket for someone else (Admin)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E2.1 | Admin | Tickets › **+**. Title `[MOBILE TEST] E2 raised on behalf`. Set **Impact** and **Urgency** (action sheets). Under **Routing**, set **Requester** to the User account. Leave Group on "Auto (from category)" and Assign to on "No one (auto)". **Create ticket** | Before saving, the priority box reads "Auto-computed from Impact × Urgency." with the badge. After: the requester is the User, the priority badge shows "Auto", and as the User the ticket is in **My Tickets** | |

### E3. Public reply (User)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E3.1 | User | On the E1 ticket, tap **Reply**. Write a message and tap **Send Reply** | The sheet is titled "Reply · #<n>". Its note reads "Your reply is added to the ticket and emailed to the people working on it.". After sending, **"Reply sent"** shows at the top, and the reply is in **Conversation** | |
| E3.2 | Technician | Open Tickets | The E1 ticket is marked **New reply** | |
| E3.3 | User | Tap Send with no message and no file | Refused: "Write a message or attach a file." | |

### E4. Reply and Reply all (Technician)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E4.1 | Technician | On the E1 ticket, tap **Reply** | **To** is filled with the requester. Send a message: it appears in Conversation | |
| E4.2 | Technician | Tap **Reply all**. **Remove any address that isn't a test account**, type 2 letters in To | To and Cc come from the ticket's email thread. Suggestions appear after 2 letters. Both replies are in Conversation for every role, and the User's mailbox gets them if UAT sends email | |

### E5. Private note

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E5.1 | L2 Manager | Look for **Note** on any ticket | Covered by D2. L2 has no Note button. If an L2 note were ever attempted, the app refuses it: "Only Admins and Technicians can add internal notes." | |

### E6. Status change (Technician)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E6.1 | Technician | On the E2 ticket (OPEN), look at **Change status** | The only buttons are **In Progress** and **Close** | |
| E6.2 | Technician | Tap **In Progress** and confirm | The badge changes, and History gains an entry | |
| E6.3 | Technician | Look at the buttons from IN_PROGRESS | On-hold; Pending with Management Review; Pending with Master Data Team; Pending with Partner; Pending with User for Confirmation/Testing; Pending with User for more Information; Resolve, Close, Canceled | |
| E6.4 | Technician | Choose **Pending with Partner** | Now In Progress, Open, Resolve. Go back to In Progress | |
| E6.5 | Technician | Move it to **On-hold** | It offers only **In-Progress** and **On hold to open** | |
| E6.6 | Technician | In Tickets, tap a ticket's status chip (iOS) | An **action sheet** with the same choices, **Cancel** last, **Canceled** in red | |
| E6.7 | Technician | Change the ticket's status on the web portal while it is open in the app. Then change it in the app | "This ticket is now … — it changed after you opened it. Nothing was changed; review it and try again." | |

### E7. Closure (Technician, then Admin)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E7.1 | Technician | On the E2 ticket (IN_PROGRESS), tap **Resolve** | A sheet titled **Transition · Resolve**. **Save & Resolve** stays disabled until **Resolution** and **Closure comments** are both filled. The closure code (an action sheet), "Is FCR" (switch) and attachments are optional | |
| E7.2 | Technician | Fill both, then save and confirm | RESOLVED. The **closure comments appear as a public comment** for the User, and are emailed. The Resolution shows on the ticket | |
| E7.3 | Technician | From RESOLVED, tap **Close**; fill both fields; **Save & Close** | CLOSED, with no further status buttons. Then run D3 on it | |
| E7.4 | Technician | On another `[MOBILE TEST]` ticket: IN_PROGRESS → **Canceled** | The same closure form; the confirmation is red (destructive). Save it | |

### E8. Assign (Technician and Admin)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E8.1 | Technician | On an open `[MOBILE TEST]` ticket: ⋯ › **Pick up**, then confirm "Pick up this ticket?" | "Assigned to you"; you are the technician | |
| E8.2 | Technician | ⋯ › **Assign…** | The **Assign to** sheet lists "Assign to me", "Recommended for <country>" (when the ticket has a country), the group's members, and a search (2+ letters). Pick another test technician and confirm | |
| E8.3 | Technician | **Remove assignment** | A red confirmation; then the ticket has no technician | |
| E8.4 | Technician | **Move to <group>** | The group changes | |
| E8.5 | Technician | Properties › Technician › **Change technician**; pick someone; **Save** | The same list as Assign to. Nothing is saved until Save; then "Assigned to …". Cancel changes nothing | |
| E8.6 | L2 Manager | Open the ticket | ⋯ has no Pick up and no Assign…, and there's no "Change technician". If the Assign screen is reached another way: "Only Admins and Technicians can assign tickets." | |

### E9. Attachments: upload and view

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E9.1 | Technician | Ticket › **Attachments** › **Add attachment** | An action sheet: **Take Photo · Photo Library · Choose File · Cancel**. Add one of each (a PDF from Files): each appears in the list | |
| E9.2 | Technician | Turn Setu's camera access off (Settings › Setu), then try **Take Photo** | A message with **Open Settings**, which opens Setu's settings | |
| E9.3 | Technician | Attach a file through **Reply** (E3, E4) | It shows in the Attachments tab | |
| E9.4 | Any | Tap an **image**; then tap the share button | It opens full screen. The share sheet offers **Save Image** | |
| E9.5 | Any | Tap the PDF, or **Download and share** | It downloads, and the iOS share sheet opens | |
| E9.6 | Any | Long-press a file | Its details appear | |
| E9.7 | Technician | Try a file over 25 MB, or a `.bat` / `.exe` | A clear message. Log it if it's a generic error: the server answers a bare 500 for these | |
| E9.8 | Technician | Delete a file you added | A red confirmation that names the file. Afterwards the list and both file counts drop by one | |

### E10. Bulk actions (Technician, Admin, L2 Manager)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E10.1 | Technician | Tickets: **long-press** a `[MOBILE TEST]` ticket, then tap 1–2 more | The navigation bar shows "N selected", **Cancel** and "max 20". The bar at the bottom offers Pick up, Assign, Close | |
| E10.2 | Technician | **Pick up**, confirm | Every selected ticket is yours. A progress sheet shows each result | |
| E10.3 | Technician | **Assign**: choose a test technician | Every selected ticket is reassigned | |
| E10.4 | Technician | **Close** | The sheet says "Attachments can't be added in bulk.". Fill Resolution and Closure comments, then **Save & Close N**: every selected ticket is CLOSED | |
| E10.5 | L2 Manager, User | Long-press a ticket | L2: the bar shows **Close only**. User: nothing is selected | |
| E10.6 | Technician | Optional: select a 21st ticket | "Selection limit" | |

### E11. Tasks

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E11.1 | Technician | Ticket › **Tasks** › **Add task**. Fill the title, the Technician and a due date (the iOS calendar sheet), then save | It appears in the tab and under More › **Tasks** | |
| E11.2 | Technician | Tick it done. Open it and use **Mark as not done**, **Edit task**, then **Remove task** | Each works. Remove asks first, in red | |
| E11.3 | Technician | More › **Tasks**: use the status chips and "Assigned to me" | The list filters | |
| E11.4 | User | Open a ticket's Tasks tab, then a task | No Add task and no checkboxes. The task says "Tasks are read-only for your role." | |
| E11.5 | L2 Manager | Add a task | Allowed, but the Technician field is read-only | |

### E12. Approvals

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E12.1 | Admin (web) | **On the web portal**, submit a `[MOBILE TEST]` ticket for approval, with a test account as approver | — | |
| E12.2 | the approver | Look at the tabs and Home | Technician or Admin: a count on the **Approvals** tab. User or L2: an **Approvals** row in More, with the count on **More**. Home: "Pending approvals (n)" | |
| E12.3 | the approver | Open the approval; **Approve**; confirm | It is decided, and the count goes down | |
| E12.4 | the approver | On another approval, try **Reject** with no comment | Reject stays disabled, with "Write a reason to enable Reject.". Write a reason, then reject (a red confirmation) | |
| E12.5 | Any | Open an approval that isn't yours (from an alert, if any) | No decision is possible: the screen says it was decided, cancelled or moved, and points to the inbox | |
| E12.6 | User, L2 Manager | With no pending approvals, look at More | No **Approvals** row. The tabs are unchanged | |

### E13. Notifications

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E13.1 | User | Reply on a ticket assigned to the Technician | — | |
| E13.2 | Technician | Look at **Alerts** | A count on the Alerts tab, and the notification. There are **no push notifications** by design: pull down to refresh | |
| E13.3 | Technician | Tap the notification | The ticket opens **inside Alerts**; the back chevron returns to Alerts. The item is marked read | |
| E13.4 | Technician | **Mark all read** (in the navigation bar), then confirm | The count clears | |

### E14. Knowledge base (Admin account only, since iOS-5b)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E14.1 | Admin | More › **Knowledge base**: use the category chips, "Search articles" (a word from a title), and open an article | Each works | |
| E14.2 | Admin | Tap **Yes, this helped**, then confirm | The vote is accepted and remembered on this phone | |
| E14.3 | User, Technician, Technician-CA, L2 Manager | Open the **More** tab | **No** Knowledge base row, and nothing else in the app opens one | |

### E15. Profile and sign out

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E15.1 | Any | More › **Settings** (or the account card). Change **Phone** and **Department** | The button changes from **No changes** to **Save changes**. Save; reopen: the values are kept | |
| E15.2 | Any | Change **Timezone**, then set it back | Works. **Email** and **Role** can't be edited | |
| E15.3 | each role | Look at the Country card | As D1.24 | |
| E15.4 | Any | More › **Sign out** (red, at the bottom) | "Sign out?": Cancel keeps you signed in. Confirm returns to Login with no error. Reopening the app shows Login | |

### E16. Offline and session end

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E16.1 | Any | Turn on Airplane Mode; try to send a reply | An offline banner appears. The reply is refused: "You're offline. Nothing was sent — try again when you're connected." | |
| E16.2 | Any | Turn Airplane Mode off; pull to refresh | The banner goes, and the refresh works | |
| E16.3 | Any | Optional, long: wait 8 hours after signing in | Back to Login with "Your session has ended. Please sign in again." | |

### E17. Announcements (Admin account only, since iOS-5b)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E17.1 | Admin | If an announcement is active, look at Home; tap ✕ | Its banner shows; ✕ hides it for this session. Tapping the banner opens Announcements inside Home | |
| E17.2 | Admin | More › **Announcements** | The active announcements are listed | |
| E17.3 | User, Technician, Technician-CA, L2 Manager | With an announcement active for that role on the web, look at Home and the **More** tab | Home shows **no** banner, and More has **no** Announcements row | |

### E18. Home greeting (iOS-5b, Android 2026-10-29)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| E18.1 | Any | Look at Home's first line at different times of day | "Good morning, <first name>" from 05:00, "Good afternoon" from 12:00, "Good evening" from 17:00 (until 04:59), by the phone's clock | |
| E18.2 | Any | Leave the app open on Home across a band change (for example 11:55 → 12:05) with the screen locked; unlock. Then switch to another tab and back | The greeting has changed on unlock, and is current again after the tab switch | |

---

## Section G — iOS only

Each HIG line quoted here was read on developer.apple.com on 2026-10-29.

### G1. TestFlight and installing again

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G1.1 | Any | In TestFlight, open Setu | The build number matches the release notes. The expiry date is about 90 days after upload | |
| G1.2 | Any | In Setu, take a screenshot, then tap **Share Beta Feedback** and send a test note | The feedback reaches App Store Connect (the release owner confirms) | |
| G1.3 | Admin | While signed in, delete Setu, then install it again from TestFlight | Setu opens on **Login**, not signed in: a reinstall wipes the Keychain session (`installMarker.ts`) | |

### G2. Microsoft sign-in, sign-out and cancel on iOS

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G2.1 | Any | Sign out; sign in with a **different** test account | Microsoft asks which account; Home greets the new account. Nothing from the old account is left: tickets, Alerts, My Requests | |
| G2.2 | Any | Tap Sign in, then cancel the sheet. Then tap Sign in again, sign in, and **switch to another app** before finishing; come back and finish | Cancel: back on Login with no message. Switching away: the sheet is still there, and sign-in finishes with no stale error banner | |
| G2.3 | Any | On Login, open **Control Centre** and close it | No banner appears or disappears | |

### G3. Tab bar and More, per role

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G3.1 | each role | Check D1.1–D1.4. Then have an approval submitted to you, and decide it | The tabs are the same before and after: a tab never appears or disappears with a count. HIG, Tab bars: *"Don't disable or hide tab bar buttons, even when their content is unavailable."* | |
| G3.2 | Any | Open a ticket in Tickets; switch to Home and back | Each tab keeps its own screens: Tickets still shows that ticket | |
| G3.3 | Any | Inside a tab, tap that tab's icon again | It returns to the tab's first screen | |
| G3.4 | Any | At the largest accessibility size, long-press a tab | iOS shows the tab's label large (the Large Content Viewer). The tab bar itself does not grow | |

### G4. Back swipe and closing sheets

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G4.1 | Any | From each pushed screen, swipe right from the left edge: a ticket, a task, an approval, a KB article, the catalogue, a request, Settings | Each goes back one screen. The back chevron does the same | |
| G4.2 | Technician | In Reply, type a few words, then **swipe the sheet down**. Then try ✕ | Both ask before discarding. "Keep editing" keeps the text | |
| G4.3 | Any | On an approval, type a comment, then **swipe back from the edge** | It asks before discarding | |
| G4.4 | Any | Open a picker (category, group or country) over a write sheet, then swipe it down | Only the picker closes; the write sheet keeps its input | |

### G5. Search in the navigation bar (Tickets)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G5.1 | Any | Tickets: type a word in the search field at the top, then tap the keyboard's search key | The list shows matches. Searching starts on the search key, not on each letter | |
| G5.2 | Any | Tap ⓧ; then type again and tap **Cancel** | Each clears the search. So does deleting the text with backspace | |
| G5.3 | Any | Paste a ticket link (`…/ticket/<n>`) and search | The ticket opens through the link resolver | |
| G5.4 | Any | Set filters, then **Clear all** | The filters and the search field both empty | |

### G6. Action sheets

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G6.1 | Technician | Open each one: ⋯ on a ticket; a list card's status chip; Impact and Urgency (create and Properties); the closure code; Add attachment; a task's status; a request's Impact and Urgency | Each lists only that role's choices, with **Cancel** at the bottom. HIG, Action sheets: *"Place the Cancel button at the bottom of the action sheet"*. Canceled is in red | |
| G6.2 | Technician | Open an action sheet; tap outside it, or Cancel | Nothing happens | |

### G7. Destructive confirmations

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G7.1 | Technician | Start each of these, then cancel: delete a file; close or cancel through the closure form; remove an assignment; bulk Pick up, Assign, Close; remove the files to write a note; reject an approval; remove a task; Sign out | Each asks in an alert, with the destructive button in **red**. Cancel changes nothing | |
| G7.2 | Any | Mark all read; a helpful vote | They ask too, but these confirmations are not red | |

### G8. Keyboard on a small iPhone (iPhone SE or 13 mini)

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G8.1 | Technician | Type in each form: Create ticket, Reply, the closure form, Submit for approval, an approval comment, the task editor, a service request form, the resolution editor, Settings | A **Done** bar above the keyboard puts it away. **Next** moves between single-line fields. The field you type in, and Send / Save, stay above the keyboard | |
| G8.2 | Any | In Settings, edit **Phone** (the number pad has no Return key) | The Done bar is there | |
| G8.3 | Any | In a sheet, tap outside a field, or drag the content down | The keyboard goes away | |

### G9. Haptics

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G9.1 | Technician | Send a reply. Then, in Airplane Mode, tap a status button on a ticket and confirm. Then tap a filter chip | A **success** tap when the reply is sent; an **error** buzz with the "couldn't" alert; a light **selection** tick on the chip. Nothing else plays a haptic | |
| G9.2 | Technician | Run a bulk action where one ticket is skipped | A **warning** haptic at the end | |
| G9.3 | Any | Turn off Settings › Sounds & Haptics › **System Haptics**; repeat G9.1 | No haptic. HIG, Playing haptics: *"Make haptics optional."* | |

### G10. Largest and smallest text sizes, every screen

Set the size under Settings › Accessibility › Display & Text Size › Larger Text.
- **AX5:** Larger Accessibility Sizes on, slider at the far right.
- **xS:** the smallest standard size, slider at the far left.

HIG, Typography: *"Make sure your app's layout adapts to all font sizes."* and *"Keep text truncation to a minimum as font size increases."*

In each row, at both sizes:
- nothing overlaps;
- no label is cut so that it can't be read;
- you can reach every control.

| ID | Screen | AX5 | xS |
|---|---|---|---|
| G10.1 | Login | | |
| G10.2 | Home (tiles one per row at AX5) | | |
| G10.3 | Tickets: chips, sort, country pill, cards | | |
| G10.4 | Filters sheet (date rows) | | |
| G10.5 | Ticket detail: header, tabs (2 × 2 at AX5), Properties, Conversation, History, Attachments, Tasks | | |
| G10.6 | Create ticket | | |
| G10.7 | Reply | | |
| G10.8 | Status / closure, single and bulk | | |
| G10.9 | Assign to | | |
| G10.10 | Submit for approval | | |
| G10.11 | Selection bar on Tickets (stacked at AX5) | | |
| G10.12 | Approvals inbox and an approval | | |
| G10.13 | Alerts | | |
| G10.14 | More | | |
| G10.15 | Tasks list, a task, the task editor | | |
| G10.16 | Knowledge base and an article (tables scroll sideways). Admin account | | |
| G10.17 | Service Request: catalogue, a form with every field type, My Requests, a request | | |
| G10.18 | Announcements. Admin account | | |
| G10.19 | Settings (Profile) | | |
| G10.20 | The ticket-link resolver | | |
| G10.21 | Picker sheets (category, group, country, people, templates, date) | | |
| G10.22 | Image viewer | | |

### G11. VoiceOver

HIG, VoiceOver: *"Provide alternative labels for all key interface elements."*

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G11.1 | Any | Turn on VoiceOver. Swipe through every screen of G10 | Every button, field, switch and tab is read with a meaningful label. The order follows the screen. Initials avatars are skipped | |
| G11.2 | Technician | On a ticket card, use the **Actions** rotor | "Change status" and "Select" are offered | |
| G11.3 | Technician | On an attachment row, use the Actions rotor | "Show details", "Download and share", "Delete" | |
| G11.4 | Technician | Send a reply | "Reply sent" is spoken once VoiceOver finishes speaking, and it is not read twice | |
| G11.5 | Admin | Change impact and urgency in Properties | The resulting priority is announced | |

### G12. A phone in Dark Mode

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G12.1 | Any | Settings › Display & Brightness › **Dark**, then use Setu: lists, a ticket, a sheet, an action sheet, an alert, the keyboard, the date picker | **Setu stays light everywhere**, with dark status-bar text. Nothing is half dark. (Decision D9: light only for v1; compliance E7) | |

### G13. iPad compatibility mode

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G13.1 | Any | Install Setu from TestFlight on an iPad | It runs in an iPhone-sized window (Setu is iPhone-only: `supportsTablet: false`) | |
| G13.2 | Technician | Sign in; open a ticket; reply with a photo; open a sheet and an action sheet; rotate the iPad | Everything works. Nothing crashes or is cut off; the keyboard works. Review may use an iPad (compliance A1, E12) | |

### G14. Reduce Motion

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| G14.1 | Any | Turn on Settings › Accessibility › Motion › **Reduce Motion**; open Tickets and a ticket | The list rows don't slide in, the loading shimmer and the status pulse are still, and the picker sheets **fade** instead of sliding. HIG, Motion: *"Make motion optional."* | |
| G14.2 | Any | Turn Reduce Motion off again | The motion returns | |

---

## Section H — Write safety, on one agreed UAT test ticket

**Ticket: TBD — one agreed UAT test ticket, chosen by Ronit before the first TestFlight run.** Do not use #19421.

- **Every check in this section writes to that ticket only.** It catches the guards that stop a write going wrong: a confirmation first, the status re-read before writing, offline refusal, single sending, role refusals, the AGENT lock, no files on a note, and asking before discarding.
- Record the ticket's state in H1. H16 puts it back.

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| H1 | Admin | Write down the ticket's number, status, group, technician, impact, urgency, category and country | Recorded in Section F's notes | |
| H2 | Technician | Start a status change and **cancel** the confirmation | Nothing changes; History has no new entry | |
| H3 | Technician | Reply, and tap **Send Reply** twice quickly | Exactly **one** reply is posted | |
| H4 | Technician | Change the status on the web; then change it in the app without refreshing | "This ticket is now … — it changed after you opened it. Nothing was changed…". The app wrote nothing | |
| H5 | Technician | In Airplane Mode, try a status change, a reply, Assign and a property save | Each is refused: "You're offline. Nothing was sent…". After reconnecting, nothing is sent by itself | |
| H6 | Technician | Note mode: look for a file picker. On Reply, add a file, then switch to Note and confirm | Note has no picker. Confirming removes the file, and the note is saved with text only | |
| H7 | L2 Manager | Open the ticket | ❌ Note, Pick up, Assign…, Change technician and Submit for approval. Change status ✅ | |
| H8 | User (if the ticket is theirs) | Open the ticket | ❌ the status card, ⋯, the property editors and the task controls | |
| H9 | Technician | Properties › **Change impact and urgency**: change both; read the priority shown; **Save** | The priority is shown before Save. Saving makes **one** History entry and at most one "priority changed" email (WEB-VS-MOBILE-ROLES §8, 5b) | |
| H10 | Technician | **Change technician** to a member of the ticket's group; Save | "Assigned to …"; the ticket's **group stays** | |
| H11 | Technician | ⋯ › **Pick up** | You are the technician, and the **group stays** as it was (mobile sends it; 05 B.14) | |
| H12 | Admin | ⋯ › **Submit for approval…** with one test approver and a comment | The confirmation names the approver. It says the ticket moves to Pending with Management Review at once, and that approvers are emailed the ticket's files. Afterwards the screen shows the status as read back from the server. Approving or rejecting does not move the ticket again | |
| H13 | Technician | Add one file; then delete it (a red confirmation naming the file) | The file is gone, and both counts are back to before | |
| H14 | Technician | Type in Reply; close the sheet with ✕, then again with a swipe down | Both ask. "Discard" loses the text; "Keep editing" keeps it | |
| H15 | Technician | **Resolve** the ticket through the closure form (Save stays disabled until both fields are filled), and confirm | RESOLVED. The closure comments are a public comment | |
| H16 | Admin | Put the ticket back to its H1 state: status (Resolve to open), technician, group, impact, urgency, category, country | It matches H1 | |
| H17 | Any | Check the test mailboxes | Only test accounts received mail from this section | |

---

## Section I — Account-deletion request and privacy link

The two rows appear only once `src/config/legal.ts` has its three values (manifest §4.13; compliance H1, H6).
- **I1** is for a build with the values empty, as today.
- **I2–I7** need a UAT build with test values agreed with Ronit and IT: an https privacy URL, a UAT category for deletion requests, and a working-day count.
- **Tell IT before I5** that the request is a test, and must not be acted on.

| ID | Role | Steps | Expected | ✓/✗ |
|---|---|---|---|---|
| I1 | Any | `legal.ts` empty: More › Settings › Account | ❌ no **Privacy Policy** row and no **Request Account Deletion** row. No link to nothing (compliance A2) | |
| I2 | Any | `legal.ts` set: tap **Privacy Policy** | Safari opens the policy. "◀ Setu" at the top left returns to the app | |
| I3 | User | Tap **Request Account Deletion** | An alert, **"Request account deletion?"**. It says what happens, how many working days IT takes, what may be kept, that the Microsoft account is not affected, and that signing in again creates a new account. The buttons are **Cancel** and **Send Request** | |
| I4 | User | **Cancel** | Nothing is sent, and no ticket is created | |
| I5 | User | Tap again, then **Send Request** | **"Request Sent"**: "Ticket #<n> was created. IT will reply on it; updates appear in Alerts." **View Ticket** opens the ticket. It is in the configured category, with no priority, impact or urgency set by the app | |
| I6 | User | In Airplane Mode, **Send Request** | Refused; nothing is sent | |
| I7 | User | VoiceOver and AX5 on the Account rows and the alert | Both rows are read and fit (G10, G11) | |

---

## Section F — Defect log

Severity:
- **Critical:** data or privacy exposure, or a crash.
- **High:** a flow can't be completed.
- **Medium:** wrong but workable.
- **Low:** cosmetic.

| # | Check ID | Screen | Steps / account (role) / phone and iOS version | What happened (with any `Ref:` line or AADSTS code) | Expected | Severity | Time | Screenshot |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 | | | | | | | | |
| 7 | | | | | | | | |
| 8 | | | | | | | | |
| 9 | | | | | | | | |
| 10 | | | | | | | | |
