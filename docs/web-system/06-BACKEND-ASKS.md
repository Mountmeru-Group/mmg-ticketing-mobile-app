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
>
> **Everything else is an improvement, not a blocker.** That includes push notifications, longer sessions, server-side workflow rules and quicker lists.
>
> **Size of the work.**
> - Blocking work: roughly **1.5 to 3 weeks of one backend developer**, plus about an hour of Microsoft Entra admin time.
> - Nice-to-haves: roughly another 3 to 5 weeks.

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

**Totals**
- **5 blocking asks:** A1, A2, A7, A13, A14.
- **13 nice-to-have asks.**

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
