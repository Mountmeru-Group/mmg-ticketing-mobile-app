# G7: the Home period on the ticket list, Approvals for every role, push (app side)

**2026-11-02.** Built on `dev` after G6 (`87aba2c`). Not committed, and no EAS build was run.

The web repo clone (`MMG-Ticketing-Platform`, `master` @ `d7f3887`, 2026-10-09) was read only, and is byte-for-byte unchanged before and after. No database was touched.
- `BE:` = `backend/src/`, `FE:` = `frontend/src/` in that clone.
- MOBILE-BACKEND-REQUIREMENTS.md is Ronit's push spec, sent to the backend team. It is not in this repo; a copy was read from Ronit's Downloads folder.

---

## 0. Answers in one place

| Question | Answer | § |
|---|---|---|
| How does the web pass the period to the list? | Each dashboard link appends `&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`: UTC days of the browser clock. Nothing for All Time; Custom's own days | 1.1 |
| Do tile numbers and list rows agree? | Yes for every tile, with two exceptions, both server-side: the server's clock if it is not UTC, and Unassigned for one kind of AGENT | 1.3 |
| Which roles does the web show Approvals to? | Sidebar: ADMIN and AGENT. The page itself has no guard: anyone can open it by address | 2.1 |
| What does APR-1 return for someone with none? | `200 []`, for every role. Never a 403 | 2.2 |
| Can a non-staff role be an approver? | **Yes.** Any active user can be named. No role can never have one | 2.3 |
| When is the notification permission asked? | **On the first visit to Alerts**, once, and only on Android 13+. Never at launch or at sign-in | 3.2 |
| Libraries | `expo-notifications` only (`expo-device` not needed) | 3.1 |
| Next build | **A full EAS build** (new native module). It also needs the Firebase project's `google-services.json` | 3.8 |

---

## 1. The Home period on the ticket list

### 1.1 What the web does

- **The days:** `getRangeDateParams()` (`FE:pages/dashboard/DashboardPage.tsx:72-86`):
  - `fmt(d) = d.toISOString().split('T')[0]`, the **UTC** calendar day (`:74`);
  - `sub(n)` = today's date minus n days via `setDate` (`:76`), then `fmt`;
  - Today: today → today; Yesterday: −1 → −1; Last 7 Days / This Week: −7 → today; Last 30 Days / This Month: −30 → today; Quarterly: −90; This Year: −365 (`:78-83`);
  - **All Time: nothing** (`:84`);
  - Custom: `fromDate=<From>` and `toDate=<To>` when set (`:77`).
- **Which links carry them** (`${dp}`):
  - Total (`:346`), In Progress (`:360`), Resolved (`:367`), SLA Breached (`:374`), Closed (`:386`), Unassigned (`:393`).
  - **Not** Open (`:353`; it counts `currentlyOpen`, any date).
  - **Not** the pending-reason and On Hold mini-cards (`:407`), although they count in-period tickets (§1.3).
- **The list:** reads `fromDate` / `toDate` from the URL into its date filter (`FE:pages/tickets/TicketsListPage.tsx:59`, `:105-106`). TKT-1 reads them as UTC day bounds on `createdAt` (`BE:modules/tickets/tickets.controller.ts:125-130`).

### 1.2 What the app does

- **The days:** `periodListDates()` (`src/utils/dashboard-period.ts`) is the web's function transcribed. A test checks it against an independent copy of the web's code at five times of day.
  - All time gives nothing.
  - Custom gives its From and To once valid: the app shows no counts for an incomplete range, so there is no number to match.
- **Which tiles carry it** (`src/utils/home-kpis.ts`): every tile and chip but Open and Active.
  - The pending reasons and On hold carry it **unlike the web**, so their number and their list agree (05 B.37).
  - L2_MANAGER has no period row, so its tiles carry nothing.
- **How:**
  - The tile writes the days into the list's ordinary Created filter (`ui.store.ts` `openTicketList(filter, period)`), so it combines with every other filter exactly as hand-picked days do.
  - The list shows a red **"This month ✕"** chip while the days are still the tile's (`appliedTicketPeriod`). ✕ clears only the dates; Clear all clears it too.
  - Changing a day in the Filters sheet makes them the person's own dates, and the chip goes. A tile without a period starts the list clean, as before.

### 1.3 Does the tile's number equal the list's rows?

Both sides apply the same role scope and the same country:
- the AGENT scope sets are the same (`BE:dashboard.controller.ts:264-275` vs `tickets.controller.ts:66-73`);
- the app sends the same `listCountryParam` to both;
- END_USER's `countryId=` means no country filter on TKT-1 (`:94-96`), as on DSH-1.

| Tile / chip | DSH-1 counts | The list sends | Agree? |
|---|---|---|---|
| Total | created in window (`:332`) | dates only | yes* |
| Open | OPEN now, any date (`:433`) | `status=OPEN` | **yes, exactly** |
| In progress | IN_PROGRESS, PENDING in window (`:335`) | that status set + dates | yes* |
| Resolved (Resolved today) | RESOLVED in window (`:337`, `:336`) | `status=RESOLVED` + dates | yes* |
| SLA breached | `slaStatus` BREACHED, not RESOLVED/CLOSED, in window (`:338`) | `sla=BREACHED` (`slaStatus`, `:124`) + statuses + dates | yes* |
| Closed | CLOSED in window (`:429`) | `status=CLOSED` + dates | yes* |
| Pending reasons, On hold | that status in window (`:346`) | that status + dates | yes* (the web's links: no) |
| Unassigned | unassigned + active in window (`:339`) | `assignedToId=unassigned` + active + dates | yes*, **except one AGENT case** (below) |
| Active | OPEN/IN_PROGRESS/ON_HOLD/PENDING now (`:431`) | that status set | **yes, exactly** |

**\* The two exceptions. Both are server-side (R3); the app does not paper over either.**

1. **The server's clock.**
   - **The two windows:** the dashboard window runs from midnight N days ago to the end of today, in **server-local** time (`dashboard.controller.ts:207-209`, `startOfDay`/`endOfDay`). The list's days are **UTC** days (`tickets.controller.ts:127-128`).
   - **Where they differ:** if the server runs on UTC, the windows are identical. If not, they are offset by the server's UTC offset at both ends, and tickets created in those hours can be counted on one side only. In East Africa that is 3 hours.
   - **What we know of the clock:** no `TZ` is set in `ecosystem.config.js`, `web.config`, `web.config.uat` or the backend config, so it is the Windows host's zone, which is unknown.
   - **Why the app can't fix it:** TKT-1 takes whole days only. Custom has the same split: `from` is UTC midnight (`:301`) but `to` is server-local (`:302`). Reported as 05 B.37.
2. **Unassigned, for an AGENT with no team who is not on the server's triage list.**
   - **Dashboard:** that AGENT's scope is `{ assignedToId: me }` alone (`dashboard.controller.ts:272-275`), and the count's `assignedToId: null` replaces it, so the count is global (05 B.20).
   - **TKT-1:** always wraps the scope in `OR` (`tickets.controller.ts:70-73`), so the list holds none of those tickets.
   - **Who is affected:** the app shows Unassigned only to ADMIN and the UI's triage AGENT (no country). Since the app cannot see the server's triage list (A4), a UI-triage AGENT in that state sees a global number over an empty list.

**Not a server issue, but worth knowing:**
- Home's counts are as of Home's last load: 60 s staleTime, no polling. The list loads fresh, so a ticket that changed in between can differ until pull-to-refresh.
- The ADMIN dashboard cache (300 s) is dropped on every ticket change (`dashboard.controller.ts:16-57`), so it is not a source of drift.

---

## 2. Approvals for every role

### 2.1 What the web shows

- **The sidebar** shows Approvals to `roles: ['ADMIN', 'AGENT']` (`FE:layouts/AppLayout.tsx:32`).
- **The route** `/approvals` has **no role guard** (`FE:router/index.tsx:141`), so END_USER and L2_MANAGER can open the page by address. It calls APR-1 and the unscoped list (`FE:pages/approvals/ApprovalsPage.tsx:18, :24`; 05 C.16).
- **On a ticket**, the web shows Approve/Reject to the named approver (`FE:pages/tickets/TicketDetailPage.tsx:1624-1633`, `a.approver?.id === user?.id`), but only to someone allowed to open that ticket.

### 2.2 What APR-1 returns for someone with none

- `router.get('/pending', requireAuth, ctrl.myPendingApprovals)` (`BE:modules/approvals/approvals.router.ts:10`): authentication only, no role check.
- `findMany({ where: { approverId: me, status: 'PENDING' } })` → `res.json(approvals)` (`approvals.controller.ts:105-112`): **`200 []`** for anyone with none, whatever the role.
- **No 403, no error.** So no 403 handling was added: there is no case to handle, and a dead menu item cannot occur. The inbox's empty state already reads **"Nothing waiting for you"** ("Approvals assigned to you appear here. Pull down to refresh."), with the "clear" illustration.

### 2.3 Can a non-staff role be an approver?

**Yes, every role.**
- The web's ticket "Submit for approval" searches all users with **no role filter**: `usersApi.search(approvalSearch)` (`FE:TicketDetailPage.tsx:418-421`). The app's submit screen does the same (01 APR-4).
- The server never checks an approver's role (`approvals.controller.ts:16-38`), and notifies each approver (`:64-82`).
- Approve and reject check only that the caller is the named approver (`:118`).
- Change approvals pick from AGENTs (`FE:pages/changes/ChangesPage.tsx:79`), but any ticket approval can name an END_USER or an L2_MANAGER.

**No role can never have an approval, so there is none to report.** On the web, such a person learns of it from the notification or email. They cannot act from the ticket unless they may open it, and the sidebar has no Approvals link for them. The app's drawer row is therefore their only obvious way in.

### 2.4 What the app does now

- **Drawer:** `drawerItems(role)` puts Approvals first on every drawer, always (`src/utils/permissions.ts`). The pending count stays as the badge.
- **Route:** `drawerRoutes()` already registered `Approvals` for every role. The tests open it through React Navigation's own drawer router for all five personas.
- **Home shortcut:** "Pending approvals" keeps the old rule (ADMIN/AGENT always, others while ≥ 1), so a requester's Home doesn't gain a shortcut that almost always reads 0.
- **Still never called:** the unscoped `GET /approvals` (05 C.16). A test scans `src/` for it.

---

## 3. Push notifications, the app side

The server half is specified in MOBILE-BACKEND-REQUIREMENTS.md §1 and is **not deployed**.
- `01` NTF-5 `POST /api/v1/notifications/device-token` `{ token, platform: "android" }`.
- NTF-6 `DELETE` with the body `{ token }`.

### 3.1 Libraries

| Package | Installed? | Why |
|---|---|---|
| `expo-notifications` ~57.0.24 (`npx expo install`) | **yes** | It covers everything push needs on the phone: the `POST_NOTIFICATIONS` permission (declared in its manifest) and its dialog; the `setu_tickets` channel; the native FCM token (`getDevicePushTokenAsync`); the token-rotation listener; showing a notification while the app is open; taps when the app is cold, in the background and in the foreground |
| `expo-device` | no | It only tells emulators apart. A phone that can't get a token already ends in the silent "unavailable" state |
| `expo-constants` | no | Expo Go is detected with `isRunningInExpoGo()` from `expo` itself |

### 3.2 The permission: when, and a refusal

- **When:** on the **first visit to Alerts**, and only if Android has never asked (`requestPushOnAlertsOpen`, status `undetermined`).
  - Why there: a person looking at their alerts is the moment the question makes sense. Asking at launch or sign-in, before the app has shown any value, is the moment Android's guidance warns against.
  - Not at launch, and not at sign-in.
- **Android 12 and older** grant it at install, so a phone there registers at sign-in without any dialog.
- **A refusal:** status `denied`. Nothing else changes: the Alerts list, the badge and pull-to-refresh work as before.
  - The Alerts notice says notifications are off and offers **Turn on notifications** while Android allows another dialog, and **Open settings** after that.
  - Returning to the app re-checks the permission (an `AppState` event, not a timer).

### 3.3 The token and the server

- **The token:** native **FCM**, not an Expo push token, because the backend sends through FCM directly (§1.2 of the spec).
- **NTF-5** is sent in these cases, always only with the permission granted:
  - after sign-in, and once per app start with a stored session;
  - on the first grant;
  - when Firebase rotates the token (`addPushTokenListener`).
- **Until NTF-5 ships it answers 404**, an Express HTML page:
  - nothing is shown but the Alerts notice ("Notifications on this phone aren't switched on at the Service Desk yet…");
  - `[push] register: 404, NTF-5 not deployed yet` goes to `console.info` (Metro and logcat);
  - other failures are silent too (`[push] register: failed (HTTP 500)`);
  - log lines never contain the token, and the token is never written to disk.

### 3.4 Sign-out

- **Explicit sign-out** (`useSignOut`): NTF-6 `{ token }` first, waiting at most 3 s, while the session token still works; then AUTH-3; then the local wipe.
- **Any sign-out** (the button, a 401, the 8-hour expiry, the 15-day re-authentication) **also has Firebase delete the token on the phone** (`FirebaseMessaging.deleteToken()`, via `unregisterForNotificationsAsync`, `PushTokenModule.kt:73-75`).
  - The old token can no longer deliver anything to this phone, even when NTF-6 never reached the server. Without the button, the session token is already dead, so NTF-6 cannot be sent.
  - The next sign-in gets a new token and registers it for whoever signs in. NTF-5 also reassigns a known token to the caller (spec §1.5), which covers the rest.
- **Not touched:** the auth flow, `auth.config.ts`, the re-auth logic and `RootNavigator`. The sign-out hook is one awaited call in `useSignOut`; the "any sign-out" reaction subscribes to the auth store from `PushBridge`.

### 3.5 Channel, display, taps

- **Channel:** `setu_tickets` ("Ticket alerts", high importance) is created when push is set up after sign-in.
  - Creating a channel never shows the dialog at target SDK 36.
  - It is also FCM's default channel in `app.json`. The icon is `assets/adaptive-icon.png` (the logo on transparent, already the themed-icon mask) and the colour is `#D21121`.
- **While Setu is open:** a notification shows as a banner and in the tray, without sound, but only while someone is signed in. It also refreshes the Alerts list and badge.
- **A tap** opens `data.ticketId` through the **existing deep-link resolver**: `openTicketLinkInApp(\`${APP_ORIGIN}/tickets/<id>\`)` → TicketLink → M4.
  - `data.ticketNumber` is the fallback. Neither present → the Alerts tab.
  - Everything goes through `parseTicketLink`, so only a uuid or a plain number from this environment is followed.
  - **Background and foreground:** the response listener opens it at once.
  - **Cold start:** the launching tap waits until the navigation container is ready (its `ready` event) and the stored session is read. Then it opens, or, if nobody is signed in, it is dropped. Nothing is queued past sign-in, as with links today.
  - A tap reported twice on a cold start is opened once.

### 3.6 The Alerts notice

The notice now reflects the real state (`src/utils/push.ts` `pushNotice`):
- on;
- off (with the button);
- not switched on at the Service Desk yet;
- couldn't be set up just now;
- not possible in this build (Expo Go, or no Firebase configuration);
- checking.

It is no longer the fixed sentence "the Service Desk has no push yet".

### 3.7 Expo Go

Android push left Expo Go in SDK 53: `getDevicePushTokenAsync` and `addPushTokenListener` throw there (`expo-notifications/build/warnOfExpoGoPushUsage.js`). The app detects Expo Go first and never touches expo-notifications there, so Expo Go development keeps working and shows "not possible in this build". Push is testable on an installed APK only.

### 3.8 The next build

**It must be a full EAS build, not an OTA update:** the new native module needs it, and Setu has no OTA channel anyway.

For push to work on it, the Firebase project's `google-services.json` must be in the build (`app.json` `android.googleServicesFile`; `docs/RELEASE.md` §2b). Without it, the build succeeds and push stays silently "unavailable".

### 3.9 For the backend team (not changed here)

- The suggested payload's `android.notification.icon: "ic_notification"` names a drawable the app does not have. Send `notification_icon` (the plugin's drawable, also FCM's manifest default) or omit it.
- `color: "#C4161F"` is not the brand red `#D21121`.
- Approvals arrive as `TICKET_UPDATED` (05 B.23). A tap opens the ticket, which an approver may not be allowed to see. The in-app Alerts list prefers the pending approval; a push tap does not, because a cold start has no approvals loaded.
- `notificationId` is in the payload, but a tap does not mark the in-app row read yet: possible follow-up.

---

## 4. Decisions for Ronit

1. **The pending-reason and On hold chips** carry the period, unlike the web's links, so their number and list agree. Keep this, or match the web exactly?
2. **The Home "Pending approvals" shortcut** keeps the old rule (requesters only while something waits). Make it permanent like the drawer row?
3. **Firebase:** who creates MMG's project, and does `google-services.json` get committed or passed to EAS as a file variable?
4. **The server clock (05 B.37):** if the server is not on UTC, tile and list differ at the window's edges. Fixing it is the backend's job: run the server on UTC, or interpret the list's days in server time.
