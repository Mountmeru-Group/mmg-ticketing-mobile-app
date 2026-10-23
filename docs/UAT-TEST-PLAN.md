# UAT test plan — Setu (Android, `preview` APK)

Written in Phase D (2026-10-20) for the first APK since Phase 5. It is also the first build that can prove Microsoft
sign-in end to end.

Work top to bottom. Tick each box, and log anything unexpected in **Section F** as you go.

**Before you start**
- **APK.** Use the `preview` build from the expo.dev build page (**Install** button or QR code). It talks only to
  **UAT** (`uat-servicedesk.mountmerugroup.com`).
- **Test accounts.** You need four Microsoft work accounts in the Mount Meru tenant, with these roles in the UAT
  Service Desk (set by an admin on the UAT web portal):
  - `END_USER`, shown in the app as **User**;
  - `AGENT` with **no** country, shown as **Technician** (a "triage" technician);
  - `L2_MANAGER`, shown as **L2 Manager**;
  - `ADMIN`, shown as **Admin**.
  - Optional fifth: an `AGENT` **with** a country, which is a country-locked technician.
  - A brand-new account is created on its first sign-in. Its role is whatever the Service Desk gives new users, so
    set each account's role on the web portal **before** Section D.
- **Ticket names.** Start every ticket you create with **`[MOBILE TEST]`**.
- **Email.** UAT may send real email (MS Graph or SMTP). A public reply emails the requester and everyone on the
  ticket's original email thread. Use only your test accounts as requesters and in To/CC. Never add a real
  colleague.
- **Load.** UAT runs on the same server as production. Don't stress-test it (for example by pulling to refresh in a
  loop).
- **Screenshots.** Take one of anything wrong, and note the time to the minute. IT can find a sign-in in Entra's
  logs by account and time.

---

## Section A — Install

- [ ] **A1. Uninstall the old app first.** Go to Settings → Apps → **MMG Service Desk** or **Mount Meru Service Desk**
  (the old names) → Uninstall.
  - The MMG Service Desk APK's icon is a blue square with white mountains and "MMG".
  - Some launchers keep showing the old icon after an install over the top, which is why you uninstall first.
  - The old APK can never finish Microsoft sign-in anyway: it predates the `msauth` link handler (`7018f85`).
- [ ] **A2. Install** the new APK. If Android asks, allow "Install unknown apps" for your browser or file manager.
  - If the phone is managed and blocks sideloading, IT has to push the APK through Intune. Log it in Section F.
- [ ] **A3. Launcher icon** is the Meru logo: a red "m" with a yellow drop, on white. It must **not** be a blue
  square with "MMG".
  - Check the app drawer, the home screen (if you add it there), and the recent-apps screen.
  - With Android 13+ themed icons switched on, a one-colour silhouette of the logo is correct.
- [ ] **A4. App name** reads **Setu**, in full, under the icon.
  - Check it under Settings → Apps too.
- [ ] **A5. Splash.** Force-stop the app (Settings → Apps → Setu → Force stop), then open it.
  - You should see the Meru logo with "Setu" under it, on white. Android 12+ shows it inside a circle.
  - It goes straight to the Login screen, with **no white or blank flash** in between.
- [ ] **A6. Release-build check (Login screen).**
  - The amber badge reads **`UAT · uat-servicedesk.mountmerugroup.com`**, and does **not** say "development
    build".
  - There is **no** dashed amber box saying "Developer: use a UAT session token". That box exists only in
    developer builds; if you see it, stop and log a **Critical** defect.

---

## Section B — Microsoft sign-in (the critical path, never verified on a device before)

### B1. Steps: from tapping Sign in to Home

Do this first with the **Admin** account.

- [ ] 1. On Login, tap **Sign in with Microsoft**.
  - The button changes to **Signing in…** with a spinner.
  - The line "Finish on the Microsoft page. Close it to cancel." appears.
- [ ] 2. A Chrome page opens on `login.microsoftonline.com`. It asks you to **pick an account**, every time, by
  design.
- [ ] 3. Choose (or type) the work account. Complete the password and MFA.
- [ ] 4. If Microsoft shows a **"Permissions requested"** consent screen, note it in Section F, then accept.
  - IT is meant to have granted admin consent, so normally this screen does not appear.
- [ ] 5. The Chrome page closes **by itself** and you are back in the app.
  - The button keeps spinning for a moment, then **Home** appears.
- [ ] 6. **Success looks like this:**
  - Home says **"Hello, <your first name>"**, with your role under it (Admin / Technician / User / L2 Manager).
  - Open the menu (☰, top left). The **account card at the bottom** shows your **real full name** and **role**.
    It must not say "Signed in" and must not show an email address in place of the name.
  - Home's counts and Recent tickets load. This proves the session token works for later requests (BLOCKER B4).
- [ ] 7. **The session survives a restart.**
  - Swipe the app away and reopen it: you go straight to Home, with no sign-in.
  - Restart the phone and open the app: still signed in.
- [ ] 8. **Cancelling is quiet.** Sign out (Section E15), tap Sign in, then close the Microsoft page with ✕ or
  Back. You should be back on Login with **no error message**.
- [ ] 9. Repeat steps 1–6 for the **User**, **Technician** and **L2 Manager** accounts.
- [ ] 10. **Side effect check.** The app registers for every `msauth://` link (`11-SSO-VERIFY.md` §4.2).
  - If another app on this phone signs in to Microsoft through the browser, Android may show an **"Open with"**
    chooser that lists Setu.
  - If you see that chooser, log it in Section F, with the other app's name.

### B2. When it fails: what you see, what it means, what to send

Every failure **inside the app** shows a red box with a title, a message, and a line like
**`Ref: token-rejected · HTTP 401`**. That `Ref:` line is the most useful thing to report: copy it exactly.

Failures that happen on **Microsoft's page** show no red box in the app, so they need a screenshot of that page.

| # | What you see | Where | `Ref:` line | What it means | Who fixes it |
|---|---|---|---|---|---|
| F1 | A Microsoft error page with an **AADSTS** code, e.g. "AADSTS50011: The redirect URI … does not match" | Chrome, on Microsoft's page | none (the app shows nothing; closing the page returns to the button) | **Entra configuration.** Common codes: **50011** the redirect URI isn't registered exactly; **700016** wrong client ID or tenant; **65001 / 90094** consent not granted; **50020 / 50034** that account isn't in the tenant; **53003** blocked by a Conditional Access policy; **7000218** the URI is registered under "Web" instead of "Mobile and desktop" | IT (Entra app registration) |
| F2 | **"Microsoft sign-in failed"** in the red box | App | `Ref: microsoft` (no HTTP) | Microsoft returned an error to the app, or no ID token. The AADSTS code isn't shown in this build, so send the **time** and **account**, and IT can read it from Entra's sign-in log. Also Entra configuration | IT |
| F3 | Back on Login with **no red box and no message**, although you finished signing in and did **not** close the page. Or Chrome stays on a blank page / "can't open page" after sign-in | App / Chrome | none | **The redirect was not received.** Microsoft accepted you, but Android didn't hand the `msauth://…` link back to the app, or the app didn't recognise it. See `docs/web-system/11-SSO-VERIFY.md` §4.2 | Mobile team |
| F4 | **"Sign-in couldn't be completed"** | App | `Ref: unexpected-response · HTTP 200` | **Contract mismatch.** The Service Desk answered "OK", but the reply is missing a required field (`token`, `expiresAt`, `user.id`, `user.email`, `user.role`), has an unknown role, or isn't JSON | Backend + mobile (compare with `src/types/mobile-sso-contract.ts`) |
| F5 | **"App sign-in isn't available yet"** | App | `Ref: endpoint-missing · HTTP 404` (or 405) | **Endpoint not reachable.** `POST /api/v1/auth/microsoft/mobile` isn't deployed on UAT, or IIS isn't routing it. Your Microsoft account is fine | Backend / server |
| F6 | **"Sign-in was refused"** | App | `Ref: token-rejected · HTTP 401` | **Token rejected.** The Service Desk refused the Microsoft ID token. Most likely UAT's backend expects a different client ID or tenant than the app's. Or you picked a non-work account | Backend (Entra settings on UAT) |
| F7 | **"Account deactivated"** | App | `Ref: account-disabled · HTTP 403` | **Account deactivated** in the Service Desk | UAT admin |
| — | "The Service Desk had a problem" | App | `Ref: server · HTTP 500` (or other) | Server error, or an IIS error page | Backend |
| — | "Can't connect" | App | `Ref: network` | No answer from Microsoft or the Service Desk: offline, DNS, timeout. Check Wi-Fi/VPN, then retry | — |
| — | "Too many attempts" | App | `Ref: rate-limited · HTTP 429` | Rate limit. Wait a few minutes | — |
| — | "Sign-in request wasn't accepted" | App | `Ref: bad-request · HTTP 400` | The server couldn't read the app's request | Mobile + backend |
| — | "Microsoft sign-in is not configured." | App | `Ref: not-configured` | This APK has placeholder Entra IDs. It should never happen in this build | Mobile |
| — | "Couldn't save your sign-in" | App | `Ref: storage` | The phone refused to store the session securely | Mobile (note the phone model) |
| F8 | Sign-in works and Home appears, but you are **sent back to Login** right away with **"Your session has ended. Please sign in again."** | App | none | Sign-in succeeded, but the **next** requests were refused (401). Most likely IIS isn't passing the `Authorization` header through (BLOCKER B4) | Backend / server |

**How to report a sign-in failure:**
- the row number from the table (F1–F8);
- the exact `Ref:` line, or the AADSTS code, Correlation ID and Timestamp from Microsoft's page (tap "More details");
- the account, its role, and the time;
- a screenshot.

---

## Section C — Branding

- [ ] **C1. Drawer header.** Open the menu (☰).
  - The Meru logo sits top left at a normal size (about as tall as two lines of text), with **"Mount Meru / Service
    Desk"** beside it.
  - The logo must not overflow the header or be cropped.
- [ ] **C2. Account card at the bottom.**
  - Under a separator line, a bordered card **pinned to the bottom** shows the initials circle, your **name** and
    **role**, and a chevron.
  - **Sign out** sits **inside that card**, in red, under a thin line.
  - The version line under the card reads **`v0.1.0 · UAT`**, with no "dev build".
  - Nothing is hidden under the gesture bar or the navigation buttons.
- [ ] **C3. Pinned card.** Set the phone's font size to the largest (Settings → Display → Font size), then open the
  menu.
  - If the menu items don't all fit, **only the items scroll**. The account card and version line stay put.
- [ ] **C4. Active item.**
  - In the menu, the screen you are on (e.g. Tasks) is a **filled brand-red row with white text**.
  - The others are grey.
  - Tapping the card's name area opens Settings / Profile.
- [ ] **C5. Home tiles** (Admin account), at normal font size:
  - **two tiles per row**: Open, In progress / On hold, SLA breached / Active ("right now"), Unassigned;
  - each tile shows a coloured square with a white icon, the label **in full** (no single letters, no "…"), then the
    number;
  - the tiles do **not** overlap the "Hello, …" greeting.
  - With the **Technician-with-country** or **L2 Manager** account there are five tiles, and the last one (Active) is
    **full width**.
- [ ] **C6. Home tiles at the largest font size.**
  - "In progress" and "SLA breached" may wrap onto two lines.
  - "Unassigned" stays on one line, slightly smaller.
  - The two tiles in a row stay the same height, and their numbers line up.
  - Nothing is cut off.
- [ ] **C7. Brand red elsewhere:**
  - the active bottom tab (red icon and label);
  - the main buttons ("Raise a ticket", Save / Send);
  - the **+** button bottom right;
  - spinners and pull-to-refresh;
  - selected filter chips.
  - Links are blue.
- [ ] **C8. Known items at 200 % font size** (pre-existing; just record what you see):
  - the drawer header text may be clipped;
  - "Announcements" in the menu may split mid-word.

---

## Section D — Four-role matrix

Sign in as each account in turn and check every row.
- **✅** = must be there. **❌** = must **not** be there. Any other text is the exact condition.
- **Technician** here is the triage technician (no country). Rows that differ for a country-locked technician are
  marked **(CA)**.
- The app only mirrors the web portal's UI. The server stays the authority, so a ❌ here is "not offered", not
  "impossible".

### D1. What each role sees

| Area | User (END_USER) | Technician (AGENT) | L2 Manager | Admin |
|---|---|---|---|---|
| Bottom tabs | Home, **My Tickets**, Alerts | Home, **Tickets**, Alerts | Home, Tickets, Alerts | Home, Tickets, Alerts |
| Menu: Approvals | only while they have ≥ 1 pending approval | ✅ always, with a count badge | only while ≥ 1 pending | ✅ always |
| Menu: Tasks, Knowledge base, Announcements, Settings | ✅ | ✅ | ✅ | ✅ |
| Account card: lock chip with country name | ❌ | ❌; **(CA)** ✅ | ❌ | ❌ |
| Home tiles | **Open, Resolved** (with numbers) | Open, In progress, On hold, SLA breached, Active, **Unassigned**; **(CA)** the same without Unassigned | the same five **without numbers**: each says "View tickets", and a blue notice explains why | all six |
| Home shortcuts | "Pending approvals" only while ≥ 1 | My open, Due soon, Pending approvals | My open, Due soon (+ Pending approvals while ≥ 1) | My open, Due soon, Pending approvals |
| Home create button | **"Raise a ticket"** button; ❌ no **+** button | **+** button bottom right | **+** | **+** |
| Ticket list chip "Unassigned" | ❌ | ✅ | ❌ | ✅ |
| Ticket list country pill | ❌ | globe pill, opens a country picker; **(CA)** grey lock pill, not changeable | ❌ | globe pill |
| Long-press a ticket to select | ❌ (nothing happens) | ✅ max 20 ("Selection limit") | ✅ | ✅ |
| Selection bar | — | **Pick up, Assign, Close** | **Close only** | Pick up, Assign, Close |
| Ticket detail ⋮ menu | ❌ (no ⋮ at all) | Pick up, Assign…, Close… | **Close… only** | Pick up, Assign…, Close… |
| Ticket detail: Impact, Urgency, First response | ❌ | ✅ | ✅ | ✅ |
| "Change status" card | ❌ | ✅ (transitions in Section E6) | ✅ | ✅ |
| Buttons under Conversation | **Reply** only | Reply, Reply all, **Note** | Reply, Reply all; ❌ **no Note** | Reply, Reply all, Note |
| Private notes in Conversation / History | ❌ **never** (D2) | ✅ | ❌ (the app hides them from L2 too) | ✅ |
| Create ticket form | Title, Description, Category (+ Subcategory / Item), Attachments | + **Classification** (Impact, Urgency, "Priority … (Auto)") + **Routing** (Group, Assign to, Requester) | + Classification; ❌ no Routing | + Classification + Routing |
| Tasks | read-only: "Tasks are read-only for your role." ❌ no Add task, no checkboxes | add, tick, edit, remove | add, tick, edit, remove; the Technician picker is read-only | all |
| Approvals: Approve / Reject | only on approvals assigned to them | same | same | same |
| Settings: editable fields | Name, Phone, Department, Timezone (Email and Role read-only) | same | same | same |
| Settings: Country card | ❌ | selector ("Not saved to your account"); **(CA)** "Locked to your country" | ❌ | selector |

### D2. A User must never see a private note (Critical)

Setup: as the **User**, create `[MOBILE TEST] D2 private note check` (Section E1).

- [ ] D2.1 As the **Technician**, open that ticket and tap **Note**.
  - The composer shows "Internal note: visible to Admins and Technicians only…".
  - Write `[MOBILE TEST] INTERNAL — the requester must not see this`.
  - Attach one small image, then tap **Save Note**.
- [ ] D2.2 As the **Technician** and as the **Admin**, the note is visible in **Conversation** as an
  **amber-tinted card labelled "Private note"**.
- [ ] D2.3 As the **User**, open the ticket:
  - [ ] **Conversation:** ❌ the note is not shown, and the Conversation count does not include it.
  - [ ] **History:** ❌ there is no entry that says a note or comment was added at that time.
  - [ ] **Alerts tab:** ❌ there is no notification that quotes or mentions the note. (Notifications show the
    server's text unchanged; the app does not filter them.)
  - [ ] **User's mailbox:** ❌ there is no email about the note.
  - [ ] **Attachments tab: record exactly what you see.**
    - The note composer warns "Files are added to the ticket, not to this note".
    - The server lists every file on a ticket with no filter by note type (`01-API-CONTRACT.md` ATT-1, `05` B.11).
    - So the **image from D2.1 is likely visible to the User**.
    - If it is, log a **Critical** privacy defect: "private-note attachment visible to requester". It's for the web
      and backend team, and it decides whether staff may attach files to notes.
    - The attachment count in the ticket header comes from the server too. Note whether it includes the file.
- [ ] D2.4 As the **L2 Manager**, open the ticket. The note is ❌ not shown (by the app's design).
- [ ] D2.5 As the **User**, check that you **cannot** write a note: there is no **Note** button, and the composer
  has no "Private note" tab.

### D3. Technician lock on closed and canceled tickets

Setup: a `[MOBILE TEST]` ticket that has been **closed** (Section E7).

- [ ] D3.1 As the **Technician**:
  - the ⋮ menu has ❌ no **Pick up** and no **Assign…**;
  - there is ❌ no **Add files** card;
  - the status card says "Closed and canceled tickets are locked for technicians.".
- [ ] D3.2 As the **Admin**, Assign… and Add files are still offered (Admins are not locked).
- [ ] D3.3 **Known gap. Check it and log it.**
  - As the **Technician**, on the closed ticket, tap **Reply**, attach a file, and send.
  - The web portal doesn't let technicians add files to closed tickets (`05` §A.3). The app's reply path
    doesn't check the lock (`src/hooks/usePostComment.ts`).
  - If the file is accepted, log it as **Medium** (mobile).

---

## Section E — Core flows

- **Every ticket title starts with `[MOBILE TEST]`.**
- Work only on `[MOBILE TEST]` tickets, including when you select tickets in bulk.
- When you finish, close every `[MOBILE TEST]` ticket as Admin, with closure code "Other".

### E1. Create a ticket (User)
- [ ] Home → **Raise a ticket**.
  - Title: `[MOBILE TEST] E1 laptop will not charge`.
  - Description: a sentence.
  - Category, then Subcategory / Item if they appear.
  - Attachments: one photo.
  - Tap **Create ticket**.
- [ ] Expected:
  - the ticket opens;
  - it appears at the top of **My Tickets** and in Home "My recent tickets";
  - the photo is in its **Attachments** tab.
- [ ] Leave Title or Description empty: you can't create the ticket, and a message says what is missing.

### E2. Create a ticket for someone else (Admin)
- [ ] Tickets tab → **+**.
  - Title: `[MOBILE TEST] E2 raised on behalf`.
  - Set **Impact** and **Urgency**. The note says priority is set by the server (Auto).
  - Under **Routing**, set **Requester** to the **User** test account. Leave Group "Auto (from category)" and
    Assign to "No one (auto)".
  - Tap **Create ticket**.
- [ ] Expected:
  - the requester shown is the User account;
  - the priority badge shows "Auto";
  - signed in as the User, the ticket is in **My Tickets**.

### E3. Public reply (User)
- [ ] On the E1 ticket, tap **Reply**.
  - The note reads "Your reply is added to the ticket and emailed to the people working on it.".
  - Write a message and tap **Send Reply**.
- [ ] Expected:
  - the reply appears in **Conversation**;
  - as the Technician, the ticket shows **New reply** in the Tickets list;
  - an empty message with no file is refused with "Write a message or attach a file.".

### E4. Reply and Reply all (Technician)
- [ ] On the E1 ticket, tap **Reply**. **To** is pre-filled with the requester. Send a message.
- [ ] Tap **Reply all**.
  - To and Cc come from the ticket's email thread.
  - **Remove any address that isn't a test account** before sending.
  - Address suggestions appear after 2 letters.
- [ ] Expected:
  - both replies are in Conversation for every role;
  - the User's test mailbox receives them, if UAT sends email.

### E5. Private note (Technician)
- [ ] Covered by **D2**. Also: the **L2 Manager** has no Note button.
  - If an L2 note is ever attempted, the app must refuse it with "Only Admins and Technicians can add internal
    notes.".

### E6. Status change (Technician)
- [ ] On the E2 ticket (OPEN), in **Change status**, the only options are **In Progress** and **Close**.
- [ ] Tap **In Progress**. The status badge updates, and a History entry is added.
- [ ] From IN_PROGRESS, the options are:
  - On-hold;
  - Pending with Management Review;
  - Pending with Master Data Team;
  - Pending with Partner;
  - Pending with User for Confirmation/Testing;
  - Pending with User for more Information;
  - Resolve, Close, Canceled.
- [ ] Choose **Pending with Partner**. The options are now In Progress, Open, Resolve. Go back to **In Progress**.
- [ ] **On-hold** offers only **In-Progress** and **On hold to open**.
- [ ] On the Tickets list, tap a ticket's status chip: it offers the same choices.
- [ ] Stale-status guard. Change the status of the same ticket on the web portal while it is open in the app, then
  change it in the app.
  - Expected: "This ticket is now … — it changed after you opened it. Nothing was changed; review it and try
    again.".

### E7. Closure (Technician, then Admin)
- [ ] On the E2 ticket (IN_PROGRESS), tap **Resolve**.
  - The screen is titled **Transition · Resolve**.
  - **Save & Resolve** stays disabled until **Resolution** and **Closure comments** are both filled.
  - Closure code (e.g. "Resolved – Issue Fixed"), "Is FCR" and attachments are optional.
- [ ] Save. Expected:
  - the status is RESOLVED;
  - the **closure comments appear as a public comment** for the User (and are emailed);
  - the Resolution shows on the ticket.
- [ ] RESOLVED offers **Resolve to open** and **Close**. Tap **Close**, fill both fields, then **Save & Close**.
  - The ticket is CLOSED and has no further status options.
- [ ] Then run **D3** on this ticket.
- [ ] On another `[MOBILE TEST]` ticket, go IN_PROGRESS → **Canceled**. The same closure form appears; save it.

### E8. Assign (Technician and Admin)
- [ ] On an open `[MOBILE TEST]` ticket, use ⋮ → **Pick up**. You become the assignee.
- [ ] ⋮ → **Assign…** opens **Assign to**, showing:
  - "Assign to me";
  - "Recommended for <country>" (when the ticket has a country);
  - the team's members;
  - search (type 2+ letters).
  - Pick another test technician.
- [ ] **Remove assignment** clears the assignee.
- [ ] "Move to <group>" changes the group.
- [ ] As the **L2 Manager**: no Pick up and no Assign… in ⋮. If the screen is reached another way, it must say
  "Only Admins and Technicians can assign tickets.".

### E9. Attachments: upload and view
- [ ] Ticket detail → **Attachments** → **Add files**. Try **Camera**, **Photos** and **Files** (a PDF). Each file
  appears in the list.
- [ ] Attach a file through **Reply** too (E3/E4). It shows in the Attachments tab.
- [ ] Tap an **image**: it opens full screen. Tap the **PDF**, or **Download and share**: it downloads and opens
  the share sheet. **Long-press** a file: its details appear.
- [ ] Try a file over 25 MB, or a `.bat` / `.exe`.
  - Expected: a clear message.
  - Log it if it's a generic error: the server answers a bare 500 for these.

### E10. Bulk actions (Technician, Admin, L2 Manager)
- [ ] Tickets list → **long-press** a `[MOBILE TEST]` ticket, then tap 1–2 more. The bar shows Pick up / Assign /
  Close (Technician and Admin).
- [ ] **Pick up**: all the selected tickets are assigned to you. A progress window shows each result.
- [ ] **Assign**: choose a test technician. All the selected tickets are reassigned.
- [ ] **Close**:
  - the screen says "Attachments can't be added in bulk.";
  - fill Resolution and Closure comments, then **Save & Close N**;
  - every selected ticket is CLOSED.
- [ ] As the **L2 Manager**, the bar shows **Close only**. As the **User**, long-press selects nothing.
- [ ] Optional: selecting a 21st ticket shows "Selection limit".

### E11. Tasks
- [ ] Ticket detail → **Tasks** tab → **Add task** (Technician).
  - Fill in a title, the Technician, and a Due date, then save. Expected: it appears in the tab and in the menu's
    **Tasks**.
- [ ] Tick it done, then open it and choose **Mark as not done**, **Edit task** and **Remove task**.
- [ ] Menu → **Tasks**: the status chips and the "Assigned to me" chip filter the list.
- [ ] As the **User**:
  - the Tasks tab shows the tasks with no Add task and no checkboxes;
  - opening a task says "Tasks are read-only for your role.".
- [ ] As the **L2 Manager**: you can add a task, but the Technician field is read-only.

### E12. Approvals
- [ ] **Setup on the web portal**: submit a `[MOBILE TEST]` ticket for approval, with a **test** account as the
  approver.
- [ ] As that approver: the menu shows **Approvals** with a count badge, and Home shows "Pending approvals (n)".
- [ ] Open the approval and tap **Approve**. It moves to decided and the badge goes down.
- [ ] On another approval, tap **Reject** with no comment. Expected: "A reason is required to reject.". Add a
  reason and reject.
- [ ] Open an approval that belongs to someone else, if any. Expected: no decision is possible ("This approval is
  assigned to someone else.").
- [ ] As the **User** or **L2 Manager** with no pending approvals, **Approvals** is not in the menu.

### E13. Notifications
- [ ] As the **User**, reply on a ticket assigned to the Technician.
- [ ] As the **Technician**, the **Alerts** tab shows an unread badge and the notification. There are **no push
  notifications** by design: pull down to refresh.
- [ ] Tap the notification: the ticket opens, and the item is marked read.
- [ ] Tap **Mark all read**: the badge clears.

### E14. Knowledge base
- [ ] Menu → **Knowledge base**:
  - category chips filter the list;
  - "Search articles" finds an article by a word in its title;
  - open an article.
- [ ] Tap **Yes, this helped**, then confirm. The vote is accepted and remembered on this phone.

### E15. Profile edit and sign out (any account)
- [ ] Menu → account card (or **Settings**). Change **Phone** and **Department**.
  - The button changes from **No changes** to **Save changes**. Save it.
  - Reopen the screen: the values are kept.
- [ ] Change **Timezone**, then set it back. **Email** and **Role** can't be edited.
- [ ] Country card per role, as in D1.
- [ ] **Sign out:** menu → account card → **Sign out**.
  - A "Sign out?" dialog appears. Cancel keeps you signed in.
  - Confirm goes back to Login, with no error.
  - Reopen the app: it shows Login (the session was wiped).

### E16. Offline and session end
- [ ] Turn on aeroplane mode:
  - an offline banner appears under the header;
  - sending a reply says "You're offline. Nothing was sent — try again when you're connected.".
- [ ] Turn it off: the banner goes, and pull-to-refresh works.
- [ ] Optional, long: 8 hours after signing in, the app returns to Login with "Your session has ended. Please sign
  in again.".

### E17. Announcements
- [ ] If an announcement is active, Home shows its banner. ✕ hides it for this session.
- [ ] Menu → **Announcements** lists the active ones.

---

## Section F — Defect log

Severity:
- **Critical**: data or privacy exposure, or a crash.
- **High**: a flow can't be completed.
- **Medium**: wrong but workable.
- **Low**: cosmetic.

| # | Screen | Steps / account (role) | What happened (incl. `Ref:` line or AADSTS code) | What was expected | Severity | Time | Screenshot |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |
