# 06 — Backend Asks (request list for the web/backend team)

> **Plain-English summary (for a manager).**
>
> **What works today.** The Service Desk website already has a proper data interface (an "API") that a phone app can use to list, open, create and update tickets. In principle the mobile app can be built on it without rebuilding anything.
>
> **The problem is signing in.**
> - Today the system hands each user's login pass only to a web browser, in a form a phone app cannot read.
> - The company sign-in (Microsoft) is wired up for the website only.
> - Until the backend team adds a phone-friendly sign-in (asks **A1** and **A2**, and a new Microsoft app registration by IT), the app can be built but **nobody can log in to it**.
>
> **What else is needed before go-live.**
> - Close some permission holes (**A7**). For example, a normal user can read other people's tickets if they know the ticket's ID.
>   - **The most urgent one is new and does not wait for the app.** A website update dated 9 October adds an "AI Summary" button that lets any user, a normal end user included, read a summary of the IT team's **internal notes** on a ticket. Wherever that update is live, it should be fixed now.
> - Two small fixes (**A13** and **A14**) so that deactivated users are locked out promptly and phone users on the same office Wi-Fi don't throttle each other.
> - A way in for Google's app reviewer (**A32**, added 4 November). Google Play needs a login it can use, and the only login is the company Microsoft account. The fix is one email-and-password account, on the live system, that works for the reviewer alone.
>   - **Update, 5 November:** the backend team says the email-and-password endpoint is already on the test system (UAT). The app now supports it there, but only by trying several likely shapes, because its code is not in the repository. **What we need now:** the exact contract in writing, and the source pushed. Then the live system (PROD) as well.
>
> **Everything else is an improvement, not a blocker.** That includes push notifications, longer sessions, server-side workflow rules and quicker lists.
>
> **Size of the work.**
> - Blocking work: roughly **1.5 to 3 weeks of one backend developer**, plus about an hour of Microsoft Entra admin time.
> - Nice-to-haves: roughly another 3 to 5 weeks.
> - Features copied from the ServiceDesk Plus app that the system can't support yet (worklogs, a "my tasks" list, merging tickets, approval delegation and similar; asks **A19–A30**, added 14 October): roughly another 3 to 5 weeks. None of them blocks the first release; the app hides those features until they exist.

Source of every item: `C:\Users\Ronit Chaudhari\mmg-ticketing-diagnostic.md` §10, re-checked against the web repo on 2026-10-09. The A7 "AI ticket summary" item comes from the 2026-10-14 drift check (`07-DRIFT-CHECK.md`), verified against web `master` @ `d7f3887`. File paths are relative to `backend/src/` unless stated otherwise.

**Priority key**
- **BLOCKING — dev**: the mobile app cannot be tested end to end without it.
- **BLOCKING — launch**: we can build and test without it, but must not ship to real users.
- **Nice-to-have**: mobile has a workaround (see `05-RULES-AND-GAPS.md` §B), and this removes it.

**Effort key** (guesses for a developer who knows this codebase, including tests and a UAT deploy)
- **XS** < ½ day
- **S** ≈ 1 day
- **M** 2–4 days
- **L** 1–2 weeks

---

## Summary table (blocking first)

| ID | Ask | Why mobile needs it | Blocking or Nice-to-have | Effort guess |
|---|---|---|---|---|
| **A1** | Mobile password login that returns the session token in the JSON body | `POST /auth/login` returns the token only as an httpOnly cookie, which a native app can't read or store securely. Needed for any environment with local or LDAP login | **BLOCKING — dev** | S |
| **A2** | Native Microsoft SSO: a token-exchange endpoint, plus a **new Entra ID public-client app registration** | Production has Microsoft SSO only. The current flow is a web-only redirect with a client secret, which ends on the website, not in the app | **BLOCKING — dev & launch** | M (+ ~1h Entra admin) |
| **A7** | Close the authorization gaps. **Fix first:** the AI ticket summary (`POST /ai/summarise`) shows internal notes to end users. Then: ownership and team scope checks; strip privileged fields from END_USER writes; remove `passwordHash` leak; query-builder whitelist; and more | A mobile app hands every user a reusable Bearer token, so anyone can call the API directly. The holes in `05` §C stop being "hidden by the UI". The AI summary leak is not hidden by the UI at all: wherever the 2026-10-09 code is deployed, it is one click in the web UI | **BLOCKING — launch**; the AI summary item: **fix now** | L |
| **A14** | Rate limiter: key on the Bearer token, not on IP | Bearer clients are bucketed by IP. Every phone on the same office Wi-Fi or carrier NAT shares 300 requests/minute, so they get 429s | **BLOCKING — launch** | XS |
| **A13** | Session cache must re-check `isActive` and role | A deactivated user, or one whose role changed, keeps API access until the cached session expires (up to 8 h, longer if A3 extends sessions) | **BLOCKING — launch** (mandatory if A3 is done) | XS–S |
| **A32** | **Narrowed 2026-11-05:** send the contract of the email + password endpoint now on UAT, and push its source. Then deploy it on **PROD**, restricted to reviewer accounts | The endpoint is reportedly on UAT, but its source is not on any branch, so the app runs against an ASSUMED contract (`02-AUTH.md` §8). Google Play's reviewer uses the store build, which talks to PROD only, and PROD has no password login (`docs/G9-PASSWORD-LOGIN.md`) | **BLOCKING — launch** (Google Play review) | XS for the contract and push; S for PROD (+ a reviewer account) |
| A5 | Push notifications (device-token table, register/unregister endpoints, Expo/FCM/APNs fan-out) | There is no push at all, and the SSE stream is broken. Without push the app can only poll | Nice-to-have (MVP polls; required for Phase 2) | M–L |
| A3 | Mobile session lifetime and refresh, plus a device sign-out list | Sessions are 8 h absolute with no refresh, so users are forced to re-login every shift | Nice-to-have (becomes blocking if A2 cannot re-login silently) | M |
| A6 | Server-side ticket workflow: transition map, required closure fields, `allowedTransitions` in responses | Today the rules live only in web code. Mobile has to copy them and they will drift | Nice-to-have | M |
| A4 | Richer `GET /auth/me` (teams, triage flag, capabilities, `mustChangePassword`) | Mobile has to guess role-based UI. The triage pseudo-role can't be seen by any client | Nice-to-have | S |
| A8 | `GET /tickets/by-number/:ticketNumber` | Email and push deep links carry ticket numbers. Today the only workaround is a search query | Nice-to-have | XS |
| A9 | Lightweight ticket list projection (`?fields=summary`) | Each list row carries tasks, nested categories and requester details, which is heavy on mobile data | Nice-to-have | S |
| A10 | Closure rules readable by AGENT and L2 (`GET /closure-rules/ticket`) | Agents closing tickets on mobile need the mandatory field list. The endpoint is ADMIN-only | Nice-to-have (or fold into A6) | XS |
| A11 | JSON 404 for unknown `/api` routes; map Prisma errors to 404/409 | Unknown GETs return `200 text/html` and unknown-id updates return 500, so the client has to special-case them | Nice-to-have | XS |
| A12 | Fix or remove the SSE stream | `GET /notifications/stream` never delivers events (ioredis subscribe bug) | Nice-to-have (mobile won't use SSE) | XS |
| A15 | `MOBILE` ticket source | Reporting can't tell mobile-created tickets apart; mobile must send `API` meanwhile | Nice-to-have | S |
| A16 | Real baseline migration matching production; put raw-SQL columns into `schema.prisma` | A clean staging database for mobile testing can't be built from the repo | Nice-to-have | M |
| A17 | Complete the OpenAPI spec | It covers about 95 of 300 paths, so a typed client can't be generated from it | Nice-to-have | M |
| A18 | App links (`apple-app-site-association`, `assetlinks.json`), and fix the triage email link | Lets ticket links in emails open in the app. The triage email currently links to a wrong route | Nice-to-have (Phase 2) | S |
| A19 | Worklogs and time tracking (model + CRUD under the ticket) | SDP parity: worklog section, worklog timer, task worklogs. No worklog/time model exists; the web "Worklog" tab is a placeholder | Nice-to-have (SDP parity) | M |
| A20 | Cross-ticket "My tasks" list (+ optional task comments/attachments) | SDP standalone Tasks module. Tasks are only reachable under one ticket; the web "My Tasks" tab is a placeholder | Nice-to-have (SDP parity) | S (+M optional part) |
| A21 | Ticket list: more `sortBy` values + `sortOrder` | SDP sort sheet (ID, status, subject, requester, asc/desc). Only priority / SLA / updated exist | Nice-to-have (SDP parity) | XS |
| A22 | Ticket list: `searchField` selector | SDP search field picker. Today one `search` hits four fields | Nice-to-have (SDP parity) | XS |
| A23 | Due-date filter on the ticket list + "due today" KPI | SDP "Requests due today". `fromDate`/`toDate` filter `createdAt`; `DUE_SOON` means ≤ 30 min | Nice-to-have (SDP parity) | S |
| A24 | Bulk ticket actions endpoint | SDP multi-select. Today N calls share a 300/min IP bucket; mobile caps at 20 | Nice-to-have | M |
| A25 | Merge tickets | SDP Merge. No route exists | Nice-to-have (SDP parity) | M |
| A26 | Approval delegation and revoke | SDP Delegate / revoke delegation. No model or route | Nice-to-have (SDP parity) | M |
| A27 | Approver read access to the parent record; ticket-scoped approvals; my approval history | Non-staff approvers get 403 on the ticket they must approve; the ticket's approvals list exists only as the unscoped `GET /approvals` | Nice-to-have (needed for non-staff approvers to see what they approve) | M |
| A28 | Ticket templates readable by every role (active only, minimal fields) | SDP "pick a template" before the form. `GET /templates` is ADMIN/AGENT only and returns inactive rows and creator emails | Nice-to-have (SDP parity) | XS |
| A29 | Exact asset lookup by tag | QR scan → one asset. Today only a contains-search exists | Nice-to-have (Phase 2) | XS |
| A30 | Requester acknowledgement on closure | SDP close-flow field. No column exists | Nice-to-have (SDP parity) | S |
| A31 | Business time remaining on a ticket's SLA (`slaResolveRemainingMinutes`, `slaResolveTotalMinutes`) | The deadline is in business hours, but no field says how much business time is left. A wall-clock countdown reads "66h left" on a Friday evening with 3 working hours to go, so the app shows the deadline instead | Nice-to-have | S |

**Totals**
- **6 blocking asks:** A1, A2, A7, A13, A14, and A32 (added 2026-11-04).
- **26 nice-to-have asks:**
  - the original 13: A3–A6, A8–A12, A15–A18;
  - 12 SDP-parity asks added 2026-10-14: A19–A30. Source: `08-SDP-PARITY.md` §7. Rough effort for these 12 is another 3 to 5 weeks of one backend developer;
  - 1 added 2026-11-03: A31, a real SLA countdown (Ronit's decision; `docs/brand/UI-STANDARDS.md` §14.6).

---

## Detail per ask (send as-is)

### A1 — Mobile password login returning the token — BLOCKING (dev) — S

**Today**
- `POST /api/v1/auth/login` puts the session token **only** in `Set-Cookie: sd_session=…; HttpOnly` (`modules/auth/auth.controller.ts`, around lines 22–44). The JSON body is just `{ user }`.
- `requireAuth` already accepts `Authorization: Bearer <token>` (`middleware/auth.middleware.ts:7`). So the only missing piece is a way to *obtain* the token.

**Ask** (either option is fine)
- (a) A new endpoint `POST /api/v1/auth/mobile/login`, body `{ username, password }`, returning `200 { token, expiresAt, user: { id, email, displayName, role, countryId } }` and setting **no** cookie; or
- (b) `POST /api/v1/auth/login` additionally returns `token` and `expiresAt` in the body **only** when the request carries a header such as `X-Client: mobile`.

Keep the same login rate limiter (20 per 15 min per IP).

**Acceptance criteria**
- With a local or LDAP account on UAT, the response body contains a token.
- `GET /api/v1/auth/me` with `Authorization: Bearer <token>` returns 200.
- `POST /api/v1/auth/logout` with the same header invalidates it.

**Note:** this alone does **not** unblock production, which has Microsoft SSO only. See A2.

### A2 — Native Microsoft SSO — BLOCKING (dev & launch) — M + Entra admin

**Today**
- The SSO flow (`modules/auth/auth.controller.ts`, around lines 101–224) is an MSAL **confidential client**: it uses a client secret and has a fixed redirect to `https://servicedesk.mountmerugroup.com/api/v1/auth/microsoft/callback`.
- CSRF state is kept in an `msal_state` cookie.
- It ends with a cookie and a 302 to the web `/dashboard`.
- None of this can hand a token to a native app, and a client secret must never ship inside an app.

**Ask**
1. **IT / Entra admin:** create a **new app registration** (public client, "Mobile and desktop applications" platform).
   - Redirect URIs for the app's scheme, e.g. `msauth.<bundleId>://auth` (iOS) and `msauth://<package>/<signature-hash>` (Android), or the Expo AuthSession scheme.
   - PKCE, no client secret.
   - Expose or consent `openid profile email User.Read`.
   - Share the client ID and tenant ID with the mobile team (IDs are not secrets).
2. **Backend:** a new endpoint `POST /api/v1/auth/microsoft/mobile`, body `{ idToken }` (or `{ accessToken }` for Graph `/me`).
   - Validate the token signature against Entra JWKS, plus `iss`, `aud` (= the new mobile client ID), `tid` (= MMG tenant) and expiry.
   - Then reuse the existing `loginWithAzureAd()` user-matching (by `azureAdId`, then email; auto-create as END_USER, exactly as web).
   - Return `200 { token, expiresAt, user }`.

**Acceptance criteria**
- A user who can sign in to the website with Microsoft can sign in to the app and receives a token that works with `Authorization: Bearer`.
- A token issued for another tenant or another app is rejected with 401.

### A7 — Close the authorization gaps — BLOCKING (launch) — L

**Ask:** add the missing checks below. Full list with evidence: `05-RULES-AND-GAPS.md` §C.

**⚠ FIX FIRST: the AI ticket summary leaks internal notes. This item is more severe than every other item in A7.** It is exposed through the web UI itself on any environment running `master` from 2026-10-09 onward. Please fix it now, independently of the mobile app (`05` §C.24).
- **What:** `POST /api/v1/ai/summarise`, body `{ ticketId }`, returns `{ summary }` (`modules/ai/ai.router.ts:8`, `modules/ai/ai.controller.ts:213-253`). On `master` since `2ee7333` (2026-10-09).
- **The gap:**
  - `requireAuth` only, so every role can call it, END_USER and L2_MANAGER included.
  - No ownership or team-scope check: the controller never reads `req.user` and loads whatever ticket the body names.
  - The ticket's first 20 comments go to the LLM **with no `type` filter** (`ai.controller.ts:224-228`), so the summary is built from PRIVATE internal notes as well. `POST /ai/draft-reply`, added the same day, does filter `type: 'PUBLIC'` (`:271`).
- **Why it outranks the rest of A7:**
  - It is the only route that gives END_USER the **content** of internal notes. Every other endpoint withholds them from END_USER: the comments list (`modules/comments/comments.controller.ts:24`) and the activity feed (`modules/tickets/tickets.controller.ts:1014`). The other gaps below expose public ticket data, or only the *existence* of notes, to END_USER.
  - It needs no crafted request. The "AI Summary → Generate" panel shows for every role on the ticket page (`frontend/src/pages/tickets/TicketDetailPage.tsx:838`, `frontend/src/components/ai/AISummaryPanel.tsx:43-49`). Any requester can summarise the internal notes on their own ticket with one click, and on any ticket whose ID they have.
  - Comment bodies reach the model unescaped, so a requester's own comment can steer it to reproduce the notes instead of paraphrasing them.
  - Every call also sends the ticket's internal notes to a third-party LLM API.
- **Ask:**
  1. Before loading the ticket, apply the ticket-scope check defined under "Ticket sub-resources" below.
  2. Exclude `PRIVATE` comments for END_USER, as both endpoints above do. For L2_MANAGER the backend disagrees with itself: the comments list hides PRIVATE notes (`comments.controller.ts:24`), but the activity feed returns them (`tickets.controller.ts:1014`). Decide the L2 rule once, then apply it to both of those endpoints and to `/ai/summarise`.
  3. Show the web "AI Summary" panel only to roles that may read internal notes.
  4. Until 1 and 2 ship, restrict the route to ADMIN and AGENT, or unmount it.
- **Same router, lower severity** (`05` §C.25):
  - `POST /ai/draft-reply` (`ai.controller.ts:257-325`) has the same missing scope check; it uses public data only.
  - `POST /ai/analyse` (`ai.controller.ts:127-209`) has no role check.
  - Apply the same scope check, and decide which roles may use `/ai/*` at all.
- **Acceptance:**
  - END_USER or L2_MANAGER calling `/ai/summarise` or `/ai/draft-reply` for a ticket outside their scope gets 403 or 404.
  - For an in-scope ticket, the comments passed to the model contain no `PRIVATE` comment when the caller is END_USER (or L2_MANAGER, if that is the L2 rule chosen in item 2).

**Ticket sub-resources**
- Ownership/scope checks (END_USER: own tickets only; AGENT: team scope as the list uses; L2: team scope) on:
  - `GET /tickets/:id/activity`, `/sla`, `/email-recipients`, `/suggested-assignees`
  - comments GET and POST
  - tasks: all four routes
  - attachment upload
- Attachment download/view/delete must verify that the attachment belongs to `:ticketId`.

**Ticket writes**
- Team scope for AGENT on `GET /tickets/:id`, `PUT /tickets/:id`, `POST /tickets/:id/assign` and `POST /tickets/:id/status`.
- Scope for L2_MANAGER on `POST /tickets/:id/status`.
- On create and update, **strip for END_USER**: `assignedToId`, `teamId`, `priority`, `slaPolicyId`, `impact`, `urgency`, `categoryId` (on update), and `status`.
- `POST /tickets/:id/status`: END_USER limited to an agreed set (e.g. reopen, confirm resolution). Can be done together with A6.

**Ticket list, writes and files** (found while writing the mobile contract)
- **`GET /tickets` text search must keep the role scope.** Today `where.OR` for search overwrites the AGENT/L2 scope `OR` (`modules/tickets/tickets.controller.ts:110-113, 143`), so a text search returns tickets outside the user's teams. Wrap scope and search in `AND`.
- **`PUT /tickets/:id` must not accept `requesterId`** from END_USER, and probably from anyone but ADMIN (`tickets.controller.ts:565`).
- **`POST /tickets/:id/status`** reads `teamId`, `categoryId` and `assignedToId` raw from `req.body` without validation or permission checks (`tickets.controller.ts:850-853, 907-909`). Remove them or validate them like PUT.
- **Attachment `/view`** serves the uploader-declared `Content-Type` inline with CSP disabled, a stored-XSS risk. Force `Content-Disposition: attachment` for anything that is not an image or PDF, and add `X-Content-Type-Options: nosniff` (`modules/attachments/attachments.controller.ts:127-144`).
- **Upload path:** validate `:ticketId` (UUID and existence) **before** multer creates `UPLOAD_DIR/<ticketId>`. An encoded `..%2F` may escape the upload directory; this is untested (`middleware/upload.middleware.ts:12-20`).
- Return multer errors as 400/413 with a message instead of 500.

**Other modules**
- Scope `GET /approvals` to the caller (approver or requester).
- Users:
  - `GET /users/lookup-azure` must `select` without `passwordHash`;
  - `POST /users/change-password` must require `currentPassword`;
  - non-admins must not change their own `countryId` via `PUT /users/:id`.
- Query builder: whitelist fields, operators and value types (`modules/queryBuilder/queryBuilder.controller.ts:41` passes `value` verbatim into a Prisma `where`).
- Knowledge base: require auth to list or read unpublished/non-public articles.

**Acceptance criteria:** an automated test per item showing the forbidden call now returns 403 or 404.

### A14 — Rate-limit key for Bearer clients — BLOCKING (launch) — XS

**Today:** the `/api/v1` limiter (300/min, `app.ts` around lines 87–102) keys on the `sd_session` cookie, otherwise on IP (`trust proxy 1` behind IIS ARR).

**Ask:** in `keyGenerator`, use the Bearer token, or better the resolved user ID, when present.

**Acceptance criteria:** two Bearer clients from the same IP each get their own 300/min budget.

### A13 — Session cache correctness — BLOCKING (launch) — XS–S

**Today:** the Redis fast path in `requireAuth` (`middleware/auth.middleware.ts`, around lines 24–27) trusts the cached user payload. It never re-checks `isActive` or `role`.

**Ask** (either fix)
- Re-read `isActive` and `role` (cheap primary-key lookup) on every request; or
- delete all `session:*` keys for a user when they are deactivated or their role changes.

**Mandatory if A3 lengthens mobile sessions.**

**Acceptance criteria:** deactivating a user makes their next API call return 401 `Account deactivated`.

### A5 — Push notifications — Nice-to-have (MVP polls) — M–L

> **Superseded on 2026-11-02 (G7)** by Ronit's MOBILE-BACKEND-REQUIREMENTS.md §1, sent to the backend team. It asks for:
> - FCM rather than Expo's push service, and a `DeviceToken` table;
> - `POST /api/v1/notifications/device-token` `{ token, platform }`, which upserts and **reassigns a known token to the caller**;
> - `DELETE /api/v1/notifications/device-token` `{ token }`;
> - the FCM send, with `data.ticketId` and channel `setu_tickets`.
>
> The app side is built against that (`01` NTF-5/NTF-6). **2026-11-05:** the backend team confirmed the server half in writing, and it is in the source at `7df97c8`; its written body for the DELETE is `{ token, platform }`, which the app now sends. The original wording below is kept for the record.

**Ask**
1. New table `DeviceToken`:
   - `id`, `userId` (FK, cascade), `token` (unique)
   - `provider` (`expo` | `fcm` | `apns`), `platform` (`ios` | `android`)
   - `createdAt`, `lastSeenAt`
2. `POST /api/v1/devices`, body `{ token, provider, platform }`: upsert for `req.user`.
3. `DELETE /api/v1/devices/:token`: remove (also call this on logout).
4. In `createNotification()` (`modules/notifications/notifications.service.ts`, around line 14), fan out to the user's devices through the Expo Push API.
   - Payload `{ title, body, data: { ticketId, ticketNumber, type } }`.
   - Prune tokens that Expo reports as `DeviceNotRegistered`.

**Note:** the MVP will poll `GET /notifications/count` instead.

### A3 — Mobile session lifetime and refresh — Nice-to-have — M

**Ask**
- Either `POST /api/v1/auth/refresh` (rotate the token, return a new `{ token, expiresAt }`), or a separate sliding TTL for mobile sessions (e.g. 30 days, extended on use).
- Plus `GET /api/v1/auth/sessions` and `DELETE /api/v1/auth/sessions/:id`, so a user can sign out a lost phone.
- Requires A13.

### A6 — Server-side ticket workflow — Nice-to-have — M

**Ask**
- Enforce in `POST /tickets/:id/status` the transition map that the web UI uses (`frontend/src/pages/tickets/TicketDetailPage.tsx`, around lines 45–106), and the required closure fields (`resolution` and `closureComments` for RESOLVED, CLOSED or CANCELED).
- Define what END_USER may do.
- Return `allowedTransitions[]` and `requiredFields[]` in `GET /tickets/:id`.
- Make `PUT /tickets/:id` reject `status` with 400 instead of silently dropping it.

**Once shipped, mobile deletes its copy of the rules (`05` §A).**

### A4 — Richer `/auth/me` — Nice-to-have — S

**Ask:** add to the `GET /api/v1/auth/me` response:
- `teams: [{ id, name, isLead }]`
- `isTriage` (from `TRIAGE_USER_EMAILS`)
- `mustChangePassword`
- optionally `capabilities: string[]`

### A8 — Ticket lookup by number — Nice-to-have — XS

**Ask:** `GET /api/v1/tickets/by-number/:ticketNumber` → same response and same access checks as `GET /tickets/:id`.

### A9 — Lightweight list projection — Nice-to-have — S

**Ask:** `GET /api/v1/tickets?fields=summary` returns per row:
- `id`, `ticketNumber`, `title`, `status`, `priority`, `slaStatus`
- `slaResolveDue`, `slaHoldStartedAt`, `slaHoldMinutes`
- `requester{id,displayName}`, `assignedTo{id,displayName}`, `team{id,name}`
- `updatedAt`, `lastRequesterReplyAt`
- `_count{comments,attachments}`

### A10 — Closure rules readable by agents — Nice-to-have — XS

**Ask:** allow AGENT and L2_MANAGER to call `GET /api/v1/closure-rules/ticket`, or fold the data into A6.

### A11 — Predictable errors — Nice-to-have — XS

**Ask**
- Add `app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))` before the production SPA fallback (`app.ts`, around line 172).
- In the error handler, map Prisma `P2025` to 404 and `P2002` to 409.

### A12 — SSE stream — Nice-to-have — XS

**Today:** `modules/notifications/notifications.controller.ts` (around lines 46–74) passes the message handler as the callback of `subscriber.subscribe()`. Real messages arrive only through `subscriber.on('message', …)`, which is never attached.

**Ask:** fix it, or remove the endpoint if push (A5) replaces it.

### A15 — `MOBILE` ticket source — Nice-to-have — S

**Ask:** add `MOBILE` to the `TicketSource` enum (`backend/prisma/schema.prisma:43`).

**Note:** this needs a schema change in an environment managed by `prisma db push` (see A16). Until it ships, mobile sends `source: "API"`.

### A16 — Baseline migration — Nice-to-have — M

**Ask**
- Generate a real baseline migration from the production schema (`prisma migrate diff`). The current `migrations/0001_initial_schema/migration.sql` contains no SQL.
- Add `users.mustChangePassword` to `schema.prisma`.
- Confirm the raw-SQL columns (`tickets.lastRequesterReplyAt`, `comments.toRecipients` / `ccRecipients`) exist in every environment.

### A17 — Complete OpenAPI — Nice-to-have — M

**Ask:** extend `config/openapi-spec.ts` to every route, at minimum all routes in `01-API-CONTRACT.md`, with request and response schemas.

### A18 — App links — Nice-to-have (Phase 2) — S

**Ask**
- Host `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` on each environment's web domain. The mobile team will provide the bundle IDs and signing fingerprints.
- Fix the triage email link (`modules/email/notification.service.ts`, around line 688) from `/tickets/<ticketNumber>` to `/ticket/<ticketNumber>`.

---

## SDP-parity asks (added 2026-10-14)

**Why these exist**
- The mobile app follows the ManageEngine ServiceDesk Plus Android app's structure.
- These are the SDP features the backend cannot support today. Each was checked against web `master` @ `d7f3887`. Full analysis: `08-SDP-PARITY.md`.

**Status**
- All are **nice-to-have**: the Android MVP ships without them and hides the feature.
- Asks that add a column or table (A19, A20 optional part, A26, A30) need a schema change in an environment managed by `prisma db push`; see A16.
- **Android-first:** the iOS halves of A2, A5 and A18 can wait (`08` §8.3).

### A19 — Worklogs and time tracking — Nice-to-have — M

**Today**
- No worklog, time-entry or time-spent model exists.
- `schema.prisma` has 58 models; none records work time. The only time-like fields are:
  - SLA settings;
  - `Ticket.slaHoldMinutes` (SLA pause time, `schema.prisma:366`);
  - `ServiceItem.estimatedTime` (a catalogue estimate, `:947`).
- `TicketTask` (`:1664-1682`) has no duration or effort field.
- There is no raw-SQL table either.
- The web shows a placeholder "Worklog" tab with "No worklog entries" and an "Add Worklog" menu item that only switches tab (`frontend/src/pages/tickets/TicketDetailPage.tsx:688, 807, 1646-1655`). Neither calls an API.
- Evidence in full: `08` §7.1.

**Ask**
1. New table `TicketWorklog`:
   - `id`, `ticketId` (FK, cascade), `taskId?` (FK `TicketTask`, SetNull), `technicianId` (FK User);
   - `startedAt`, `endedAt?`, `durationMinutes` (Int, required, > 0);
   - `description?`, `createdAt`, `updatedAt`.
2. Routes under `/api/v1/tickets/:ticketId/worklogs`:
   - `GET` (list, `startedAt` desc, with `technician{id,displayName}`);
   - `POST`;
   - `PUT /:id`;
   - `DELETE /:id`.
   - Same ticket-scope check as the other ticket sub-resources (A7). Write: ADMIN, AGENT, L2 only. Edit/delete: author or ADMIN.
3. Optionally `totalWorklogMinutes` on `GET /tickets/:id`.

**Timer:** the mobile timer runs on the device and POSTs `{startedAt, endedAt, durationMinutes}` when stopped. No server-side timer state is needed.

**Acceptance criteria**
- A technician adds, edits and deletes a worklog on a ticket in scope; the list returns it.
- An END_USER gets 403 on POST.
- A caller outside the ticket's scope gets 403 or 404.

### A20 — Cross-ticket "My tasks" — Nice-to-have — S (+M optional)

**Today**
- Tasks exist only as `/api/v1/tickets/:ticketId/tasks` (`modules/ticketTasks/ticketTasks.router.ts:7-10`). There is no `/tasks` mount (`app.ts:123-162`).
- `Attachment` has only `ticketId`/`commentId` (`schema.prisma:439-454`). No task comment model exists.
- The web dashboard "My Tasks" tab is a static placeholder (`frontend/src/pages/dashboard/DashboardPage.tsx:801-813`).

**Ask**
1. `GET /api/v1/tasks?assignedToId=me|<uuid>&status=&search=&page=&limit=`.
   - Shape (a) pagination.
   - Each row = task scalars + `assignedTo{id,displayName}` + `ticket{id,ticketNumber,title,status}`.
   - Scoped like `GET /tickets`: a caller only sees tasks on tickets they may see.
2. *(Optional)* Task comments and attachments: a nullable `taskId` on `Comment` and on `Attachment`, plus a `?taskId=` filter on the existing list routes.

**Acceptance criteria**
- An AGENT sees their open tasks across tickets, each with its parent ticket number.
- An END_USER sees none that belong to tickets they don't own.

### A21 — Ticket list sort allow-list and direction — Nice-to-have — XS

**Today:** `GET /tickets` accepts `sortBy=priority` (desc) or `sla` (`slaResolveDue` asc); anything else gives `updatedAt` desc. There is no direction parameter (`modules/tickets/tickets.controller.ts:157-161`).

**Ask**
- Allow-list `sortBy` ∈ {`ticketNumber`, `status`, `title`, `requester` (requester `displayName`), `priority`, `updatedAt`, `createdAt`, `slaResolveDue`}.
- Add `sortOrder=asc|desc`.
- Reject other values with 400, not 500.

**Acceptance criteria:** each allowed pair returns rows in that order across pages.

### A22 — Ticket list search field selector — Nice-to-have — XS

**Today:** `search` = exact `ticketNumber` if all digits; otherwise contains on title, requester name, requester email and assignee name (`tickets.controller.ts:133-150`).

**Ask**
- Optional `searchField=number|title|requester|assignee`; omitted = today's behaviour.
- **Must keep the role scope** (wrap scope and search in `AND`, as A7 asks).

**Acceptance criteria:** `searchField=title&search=printer` matches only titles, within the caller's scope.

### A23 — Due-date filter and "due today" KPI — Nice-to-have — S

**Today**
- `fromDate`/`toDate` filter `createdAt` only (`tickets.controller.ts:125-130`).
- `DUE_SOON` is set at ≤ 30 minutes remaining (`jobs/slaBreachChecker.job.ts:62-65`).
- No KPI counts tickets due today.

**Ask**
- `dueFrom`/`dueTo` (ISO date-times, so the client can send its own local day bounds) on `GET /tickets`, filtering `slaResolveDue`.
- A `dueToday` count in `GET /dashboard/all` `kpis`. It must be role-scoped, unlike the widgets flagged in `05` B.20. It needs a timezone parameter, or the client uses the list filter instead.

**Acceptance criteria:** a ticket with `slaResolveDue` inside the given window appears; one outside does not.

### A24 — Bulk ticket actions — Nice-to-have — M

**Today**
- No bulk route exists (`modules/tickets/tickets.router.ts:16-25`).
- Mobile sends N sequential calls, capped at 20. All Bearer clients behind one NAT share the 300/min IP bucket until A14 ships (`app.ts:94-102`).

**Ask:** `POST /api/v1/tickets/bulk { ids: uuid[] (max 50), action: 'assign'|'status', payload }`.
- **Same per-ticket checks** as the single routes, plus A7's scope checks.
- Returns `200 { results: [{ id, ok, error? }] }`. No all-or-nothing.
- **One** notification digest per recipient instead of one email per ticket.

**Acceptance criteria**
- Mixed permitted and forbidden IDs give per-item results.
- A requester affected by 10 closes gets one email, not 10–30.

### A25 — Merge tickets — Nice-to-have — M

**Today:** no merge route in any router.

**Ask:** `POST /api/v1/tickets/:id/merge { sourceIds: uuid[] }`, ADMIN/AGENT.
- Move comments and attachments from each source to the target.
- Close each source with `closureCode: 'Closed – Duplicate'` and a public comment linking the target.
- Write audit entries on both sides.

**Acceptance criteria**
- After a merge, the target's activity shows the moved comments.
- Each source is CLOSED and links to the target.

### A26 — Approval delegation — Nice-to-have — M

**Today:** `Approval` has no delegation fields (`schema.prisma:763-783`). The approvals router has only create / list / pending / approve / reject (`modules/approvals/approvals.router.ts:8-12`). Neither the backend nor the frontend contains "delegat".

**Ask**
- Add `delegatedFromId?` and `delegatedAt?` to `Approval`.
- `POST /approvals/:id/delegate { toUserId, comments? }`: the current approver only, PENDING only. Reassign `approverId`, keep the original in `delegatedFromId`, notify the new approver.
- `POST /approvals/:id/revoke-delegation`: the original approver only, while still PENDING.

**Acceptance criteria**
- After delegating, the delegate sees it in `GET /approvals/pending` and the delegator does not.
- After revoking, the reverse is true.

### A27 — Approver read access, ticket-scoped approvals, approval history — Nice-to-have — M

**Today**
- Ticket approvals carry no ticket data.
- An END_USER approver who is not the requester gets **403** from `GET /tickets/:id` (`tickets.controller.ts:476-498`) and from attachments. So do L2 approvers outside their scope.
- The approval email links to the web ticket page (`modules/email/notification.service.ts`, `ticketUrl`, around line 513), which fails the same way.
- AGENT approvers can open the ticket today only because AGENT reads are unscoped (`05` C.6), which A7 will close.
- The web's ticket "Approvals" tab uses the **unscoped** `GET /approvals?entityType=ticket&entityId=` (`frontend/src/pages/tickets/TicketDetailPage.tsx:438`; `05` C.16).
- No endpoint returns "approvals I have decided".

**Ask**
1. `GET /api/v1/approvals/:id`, readable by the approver (and the requester). Returns the approval plus a **parent summary**:
   - ticket: `ticketNumber`, `title`, sanitised `description`, `requester{displayName}`, PUBLIC comments, attachment list;
   - service request: the existing include;
   - change: `changeNumber`, `title`, `description`, `status`.
2. `GET /api/v1/tickets/:id/approvals`, with the same access rule as `GET /tickets/:id`. Replaces the web's unscoped call.
3. `GET /api/v1/approvals/mine?status=APPROVED|REJECTED|CANCELLED&page=&limit=`: the caller's decided approvals.

**Acceptance criteria**
- An END_USER approver can read the parent summary of an approval assigned to them.
- They still get 403 on `GET /tickets/:id` for that ticket (no widening of ticket access).

### A28 — Ticket templates for every role — Nice-to-have — XS

**Today**
- `GET /templates` and `GET /templates/:id` are ADMIN/AGENT only (`modules/templates/templates.router.ts:7, 9`).
- They return inactive templates and `createdBy.email` (`templates.controller.ts:20-38`).
- The web create page uses no templates.

**Ask:** let every role call `GET /templates?entityType=ticket`, returning only `isActive` rows with `{ id, name, description, title, body, categoryId, priority }` and no creator fields. ADMIN keeps the full view.

**Acceptance criteria**
- An END_USER gets active ticket templates only, without email addresses.
- Inactive templates are absent.

### A29 — Exact asset lookup by tag — Nice-to-have (Phase 2) — XS

**Today**
- `GET /assets?search=` contains-matches name, `assetTag` and `serialNumber` (`modules/assets/assets.controller.ts:79-98`), ADMIN/AGENT only.
- `assetTag` is unique (`schema.prisma:809`).
- Nothing in the web repo generates QR codes or barcodes.

**Ask:** `GET /api/v1/assets/by-tag/:assetTag` → the asset (same include as `GET /assets/:id`) or 404, ADMIN/AGENT.

**Acceptance criteria:** scanning a label with tag `MMG-0001` returns exactly that asset.

**Note:** printing QR labels that encode the `assetTag` is an IT operations decision, not a backend change.

### A30 — Requester acknowledgement on closure — Nice-to-have — S

**Today:** `Ticket` has `resolution`, `closureCode`, `isFcr` and `closureComments` (`schema.prisma:373-377`), but no acknowledgement field.

**Ask**
- Add `requesterAcknowledged Boolean?` and `requesterAcknowledgedAt DateTime?` to `Ticket`.
- Accept `requesterAcknowledged` in `POST /tickets/:id/status`, validated, unlike the raw fields today (A7).
- Show it in the web closure modal.

**Acceptance criteria:** closing with `requesterAcknowledged: true` persists it and returns it on `GET /tickets/:id`.

## Asks added 2026-11-03

### A31 — Business time remaining on a ticket's SLA — Nice-to-have — S

**Why (the Friday-evening example)**
- A ticket is raised on Friday at 16:00. Its policy allows 4 working hours, 09:00–18:00, Monday to Friday. The server's calculator sets `slaResolveDue` to Monday 11:00: 2 hours on Friday, 2 on Monday.
- At 17:00 that Friday, a client can only count wall-clock time to that deadline: **"66h left"**. Yet only **3 working hours** remain (1 on Friday, 2 on Monday).
- Over the weekend, a progress bar on wall-clock time fills from 1 % to 97 % while the SLA clock stands still. On Monday morning a technician sees almost no time left, after a Friday evening that said there was plenty.
- So the mobile app shows the deadline itself ("Due Mon 11:00", `docs/brand/UI-STANDARDS.md` §14.6) instead of a countdown. A real countdown needs the server's own figure.

**Today**
- The ticket carries the deadlines `slaResponseDue` and `slaResolveDue`, plus `slaHoldMinutes`, `slaHoldStartedAt` and `slaStatus`.
  - The deadlines are business-hours times, computed server-side from the SLA policy (`businessHoursOnly`, `businessHoursStart`/`End`, `businessDays`, `timezone`, `operationalHoursId`).
  - `slaStatus` is set by a job every 60 s; DUE_SOON means ≤ 30 min left (`jobs/slaBreachChecker.job.ts:62-65`).
- `GET /tickets/:id` (TKT-3) returns the full SLA policy row. But no field says how much business time is left, or how much the policy allowed for this ticket.
- A client could work it out only by re-implementing the calculator: business days, hours, timezone, operational hours, and the hold handling flagged in `05` B.27.
  - The mobile rules forbid that duplication.
  - Any difference from the server's own maths would make the app's countdown disagree with the server's breach.

**Ask:** on `GET /tickets/:id`, and optionally on `GET /tickets` rows, computed by the same SLA calculator that sets `slaResolveDue`, at the time of the response:

| Field | Meaning |
|---|---|
| `slaResolveRemainingMinutes: number \| null` | Business minutes left until the resolve deadline. While on hold, the value does not change. 0 or negative once breached. `null` without an SLA, or once the ticket is resolved, closed or canceled |
| `slaResolveTotalMinutes: number \| null` | The policy's resolve budget for this ticket's priority, so a client can draw a true progress bar |
| `slaClockPaused: boolean` | `true` while the ticket is in a hold status |
| *Optional:* `slaResponseRemainingMinutes`, `slaResponseTotalMinutes` | The same pair for the first response |

**Acceptance criteria**
- The Friday example: policy 09:00–18:00, Monday to Friday, resolve budget 240 min, ticket created Friday 16:00, read Friday 17:00. The response has `slaResolveRemainingMinutes: 180` and `slaResolveTotalMinutes: 240`.
- Read again on Saturday at noon: still 180.
- During a hold, two reads an hour apart return the same remaining minutes, and `slaClockPaused: true`.
- After the deadline passes, the remaining minutes are ≤ 0. After RESOLVED, `null`.

**Mobile after this ships:** the deadline line on ticket detail becomes "3h left" in working time, with a bar. The client reads the server's figures and adds no SLA rule of its own.

## Asks added 2026-11-04

### A32 — Email and password sign-in for the Google Play reviewer — BLOCKING (launch: Play review) — OPEN, narrowed 2026-11-05

**Status 2026-11-05: narrowed to "send us the contract, and push the source".**
- **What changed.** Ronit confirmed with the backend team that a mobile password-login endpoint **is deployed on UAT**, with local auth on there. Its source is **not** on any branch of `Mountmeru-Group/MMG-Ticketing-Platform`. AUTH-P2 was in the same position before its contract arrived.
- **What mobile did.** It built the sign-in defensively, **UAT builds only**, against an ASSUMED contract (`02-AUTH.md` §8; `01-API-CONTRACT.md` AUTH-P1).
  - It tries four paths and sends both `username` and `email`.
  - It accepts several key names for the token, the name and the expiry.
  - It asks AUTH-2 for `countryId` when the answer has none.
- **The ask now, in order:**
  1. **The contract, in writing.** It must cover:
     - the path and method;
     - the request body's keys;
     - the 200 body, field by field with types, including whether `user` carries `countryId`, and whether the name is `name` or `displayName`;
     - every error status with its body and message, including whether an unknown email and a wrong password get the **same** answer;
     - whether it sets a cookie;
     - its rate limit;
     - which accounts may use it.
  2. **Push the source** of the endpoint, and of AUTH-P2, to a branch, so mobile can verify the contract read-only as it does for every other endpoint.
  3. **PROD.** Deploy it there, restricted to reviewer accounts, as proposed below, with a reviewer account. Until then the email option does not render on production builds, and Google's reviewer, who uses the production build, cannot use it.
- When 1 arrives, mobile cuts its tolerance down to the real contract (`02-AUTH.md` §8.7). Until then, the first sign-in on a device shows the answering path and key names (`02-AUTH.md` §8.8).
- **The proposal below still stands for PROD.** It is what mobile asked for on 2026-11-04. If the UAT endpoint already differs from it, the backend team's contract wins, and this proposal is updated to match.

**Why**
- **Google Play needs a login its reviewer can use** (Play Console → App content → App access).
  - The app's only way in is Microsoft sign-in to the MMG tenant, and the reviewer has no account there.
- **The reviewer's build talks to PROD.**
  - The reviewer installs the store AAB. That is the `production` EAS profile, which can only target PROD (`scripts/eas-build-guard.js:51-52`; `src/config/env.ts:15`).
  - A sign-in that works on UAT alone lets testers in, but not the reviewer.

**Today.** From the web source, read-only. Every point is sourced in `docs/G9-PASSWORD-LOGIN.md`.
- **`POST /api/v1/auth/login` returns the session token only as a cookie,** `Set-Cookie: sd_session; HttpOnly` (`modules/auth/auth.controller.ts:43-44`). The body is `{ user }`.
  - A native app cannot read that cookie.
  - A cookie in the native jar also overrides the Bearer header (`middleware/auth.middleware.ts:7`).
- **PROD has no password login for anyone.**
  - Local auth is opt-in: `LOCAL_AUTH_ENABLED=true` or dev settings (`auth.controller.ts:33`). The production env has none of them, and no LDAP settings either (`.env.production` at `d7f3887`, the last commit that tracks it).
  - `GET /auth/config` reports `localAuthEnabled: false` there.
- **`POST /auth/test-login` must not be switched on in PROD for this.**
  - It does return a token in the body, but it is the Selenium skeleton key: no password, any user, outside the rate limiters, and it sets the cookie (`auth.controller.ts:67-97`).
  - On `fix/phase0-1-security` it also needs `TEST_AUTH_ENABLED=true`, precisely so that it stays off in production.
- **No branch** of the clone has any other route that returns a token for a password. This was first read on the clone fetched 2026-11-02, and re-read on 2026-11-05 on a fresh clone fetched 2026-11-04 16:36: same 13 branches, same commits, still none.
- **Relation to A1** (2026-10-09). A1 asked for the same kind of endpoint so that UAT could be tested: `{ username, password }`, LDAP or local. A32 narrows it to what a reviewer needs, and adds PROD.

**Ask**
1. **Backend: a new endpoint `POST /api/v1/auth/mobile/login`.** This is AUTH-P1's path (`01-API-CONTRACT.md` §1.4), with the contract below.
   - **Request:** `Content-Type: application/json`, body `{ "email": string, "password": string }`. No `Authorization` header and no cookie are sent.
   - **Check:** the local bcrypt password only, as `loginWithLocal()` does (`modules/auth/auth.service.ts:121-168`), including its lower-cased email match. Not LDAP.
   - **Restricted to an allow-list** of reviewer emails, set in the server's environment (for example `MOBILE_PASSWORD_LOGIN_EMAILS`). The name is the backend team's choice.
     - An email that is not on the list answers exactly as a wrong password does.
     - With the list empty, the route answers 404, so each environment opts in.
     - **Why:** without the list, the route would let every user with a password hash sign in around Microsoft MFA and Conditional Access.
   - **Success 200.** The body is **the same as AUTH-P2's** (`02-AUTH.md` §7.5), so the app reads both with one reader:
     ```json
     { "token": "<opaque session UUID>", "expiresAt": "<ISO-8601>",
       "user": { "id": "<uuid>", "email": "<string>", "name": "<string>", "role": "ADMIN|AGENT|END_USER|L2_MANAGER",
                 "countryId": "<string|null>", "ldapSamAccount": "<string|null>", "department": "<string|null>", "phone": "<string|null>" } }
     ```
     - **Do not return `loginWithLocal()`'s `user` as it stands** (added 2026-11-05). It is `{ id, email, displayName, role }` (`auth.service.ts:167`): `displayName`, not `name`, with no `countryId` or `ldapSamAccount`. The app would accept it, but show the email as the person's name and treat an AGENT as a triage agent. Build `user` as AUTH-P2 does (`docs/G9-PASSWORD-LOGIN.md`, "The `user` object, field by field").
     - The session is the ordinary one: a `sessions` row, plus the Redis entry with `countryId` and `ldapSamAccount`, lasting `SESSION_TTL_HOURS`.
     - So `Authorization: Bearer <token>` works on every route, and `POST /auth/logout` ends the session.
   - **No `Set-Cookie`.**
   - **Errors** are all JSON `{ "error": "…" }`:

     | Status | When |
     |---|---|
     | 400 | The body is not `{ email, password }` as strings |
     | 401 | `"Invalid credentials"` for an unknown email, an email not on the list, **or** a wrong password: **one message for all three**, so the answer never tells which |
     | 403 | Account deactivated. It is checked only after a correct password, in the order `loginWithLocal` already uses |
     | 404 | The allow-list is empty in this environment |
     | 429 | The existing login limiter, 20 per 15 min per IP, with its JSON body (`app.ts:87-92`) |
     | 500 | Server error |
2. **Backend / ops: one reviewer account on PROD (and one on UAT for testing).**
   - Role `END_USER`, active, with a local password. Use a strong one, and rotate it after each review.
   - It is on the allow-list.
   - It has a few sample tickets, so the reviewer sees a working app.
   - Ronit gives Google the credentials in Play Console. **They never go into the app, its builds or this repo.**
3. **AUTH-P2 on PROD as well** (`docs/RELEASE.md:283`). Without it, nobody (reviewer or employee) can sign in to a Play build with Microsoft.

**Effort**
- **S** (about 1 day): one route that reuses `loginWithLocal()`, the allow-list, tests, and a deploy to UAT and PROD.
- **XS** for the account.
- **Plus a security sign-off.** Even limited to one account, this is a password path that bypasses Entra MFA.

**Acceptance criteria**
- On UAT and on PROD, the reviewer account's email and password return 200 with the body above, and **no** `Set-Cookie`.
- `GET /api/v1/auth/me` with `Authorization: Bearer <token>` returns 200 as that user.
- `POST /api/v1/auth/logout` with the same header ends the session; `/auth/me` then returns 401.
- These all return the **same** 401 body:
  - a wrong password;
  - an unknown email;
  - a real employee's email with that employee's correct password.
- The 21st attempt within 15 minutes from one IP returns 429.
- With the allow-list empty, the route returns 404, and the web is unchanged: `GET /auth/config` and the web login page are as before.

**Alternative without this endpoint**
- A dedicated **Entra ID reviewer account**, signing in through the Microsoft sign-in the app already has.
- It needs AUTH-P2 on PROD (item 3), plus a Conditional Access exclusion from MFA for that one account. That is IT's decision.
- See `docs/G9-PASSWORD-LOGIN.md` §10.

**Mobile: built 2026-11-05, UAT builds only** (`02-AUTH.md` §8)
- The approved design is in, under "Sign in with Microsoft", on the same Login screen. An OR divider, then "Sign in with email instead", then email and password fields that open in place.
- The session is stored exactly as AUTH-P2's is: same store, same 8-hour rule, same 15-day re-authentication clock.
- The password is held in component state only, and is never logged or stored.
- **For PROD:** set `EMAIL_SIGN_IN_ENABLED` in `src/config/env.ts` to include PROD, once this ask ships there and Ronit says so.

---

## Also flagged for the backend owner (not mobile asks; listed so they are not lost)

**Secrets**
- `.env.production` sits in the working folder and `.gitignore` does not exclude it. Values: [REDACTED - present in .env.production]. Consider rotating them.

**Unused required secrets**
- `JWT_SECRET` and `SESSION_SECRET` are required at boot but never used.

**Dead features**
- These never run: escalation rules, closure rules, business-rule triggers other than inbound-email create, preventive-maintenance schedules, scheduled reports, survey triggers.

**Risky behaviour**
- The SLA calculator can loop forever when `businessDays=[]` or start ≥ end.
- `level` and `mode` are silently dropped on ticket create.
- Kanban status drag is a no-op.
- Linking a ticket to a Change silently force-closes it.

**Environment questions** (see `00-OVERVIEW.md` BLOCKERS)
- Confirm whether PROD, UAT and QA share one Redis/Memurai database. If they do, a session token minted in one environment may be accepted by the others through the Redis fast path.
- The deployment guide's smoke test `GET /api/health` hits no route. The health route is `GET /health`.
