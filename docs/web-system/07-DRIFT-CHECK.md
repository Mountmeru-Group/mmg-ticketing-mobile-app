# 07 — Drift check: docs 00–06 vs the live web repo

> **A1 and A2 are STILL NEEDED. Send them as written.** Login still returns the session token **only** as an httpOnly cookie, and there is still no native-SSO endpoint. Nothing in the live repo changes the auth picture (§3).
>
> **Before you send A7:** a new authorization gap was added to the web repo on 2026-10-09. `POST /api/v1/ai/summarise` lets **any** logged-in user, END_USER included, get an AI summary of **any** ticket's thread, **PRIVATE notes included** (§6, item 1). It is now A7's first, "FIX FIRST" item (`06`), and `05` §C.24 records it (Q2, resolved).
>
> **Verdict: YES. Docs 00–06 are safe to build against** with the corrections in §7, which are already applied. No MVP endpoint, enum value, auth rule, error shape or pagination shape changed. The corrections fix counts, source-line references and provenance, not behaviour.
>
> **Heads-up:** the two old folders the brief said were deleted **still exist** (§1.6, Q4).

| | |
|---|---|
| **Checked** | 2026-10-14, read-only |
| **Live repo** | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform`, branch `master` @ `d7f3887` |
| **Docs baseline** | The ZIP extract at `C:\Users\Ronit Chaudhari\Desktop\Service Desk Web Clone` (still on disk). Proven identical to `master` @ `a7c9f90` (§1.6) |
| **Method** | `git log` / `git branch` / `git diff` (including `git diff --no-index --ignore-cr-at-eol` between the extract and the clone), plus reading source as text. No checkout, fetch, install, build, database, Redis or network call |

---

## 1. REPO STATE

### 1.1 `git log -15 --oneline` (master)
```
d7f3887 fix: allow AI to override rule-based category on email tickets when confident
86c7834 fix: apply routing corrections feedback loop to email ticket auto-enrichment
d463ff3 feat: AI routing correction feedback loop (Phase A+B)
c0ecd3a feat: AI Reply Assistant — Draft Reply button in comment composer
656fc8b feat: add Apply All button to AI suggestion panel
68bdb9b feat: AI technician and team prediction on Create Ticket form
3f2b126 fix: use compatible Anthropic SDK import for Node 24 CJS runtime
53c528b fix: move AI summary to conversations tab + auto-enrich email tickets via AI
2ee7333 feat: Phase 1 AI features — sentiment analysis, priority prediction, category suggestion, ticket summary
a7c9f90 fix: add country mappings to CATEGORY Network and Internet for correct auto-assignment
09ab296 fix: auto-set team to assignee team on assignment + history pagination
fce11c9 feat: auto-assignment fixes, O365 sync agent guard, CSV export, local auth
13efcea fix: email poller reliability + CCA team-guard bypass
98d70a7 fix: bump SW cache to v2 to force old cached index.html to expire
39e6020 feat: Phase 2 mobile responsiveness across all key pages
```

### 1.2 Current branch
- `master`, "up to date with 'origin/master'", working tree clean.
- HEAD `d7f3887f443c8af75d1d7fd565f96f802835c7dc`. 95 commits on `master`.
- Remote: `https://github.com/Mountmeru-Group/MMG-Ticketing-Platform.git`.
- I did **not** fetch (R1), so remote-tracking refs are as of the clone (2026-10-14 10:28 IST).

### 1.3 `git branch -a`
```
* master
  remotes/origin/HEAD -> origin/master
  remotes/origin/claude/adoring-booth
  remotes/origin/claude/manifest-auth-errors-pqil6p
  remotes/origin/dashboard-improvements
  remotes/origin/feat/manageengine-parity-modules
  remotes/origin/feature/sow-gaps
  remotes/origin/feature/uat-bugfixes-observations
  remotes/origin/fix/code-review-security-and-quality
  remotes/origin/master
  remotes/origin/uat-local-features
```

| Branch | Last commit | Merged into `master`? |
|---|---|---|
| `origin/master` | 2026-10-09 `d7f3887` | – |
| `origin/uat-local-features` | 2026-10-07 `49b7d97` "Merge pull request #11 from Mountmeru-Group/master" | **No** |
| `origin/claude/manifest-auth-errors-pqil6p` | 2026-09-08 `7aebd47` "distinguish expired vs rejected secret, warn on GUID secret at boot…" | **No** |
| `origin/dashboard-improvements` | 2026-07-21 `925066e` | Yes |
| `origin/claude/adoring-booth` | 2026-04-09 `cb4f3db` | Yes |
| `origin/feature/sow-gaps` | 2026-04-09 `71c8513` | Yes |
| `origin/feat/manageengine-parity-modules` | 2026-04-04 `94e0bb7` | Yes |
| `origin/feature/uat-bugfixes-observations` | 2026-03-24 `97f27ca` | **No** |
| `origin/fix/code-review-security-and-quality` | 2026-03-17 `acc8413` | Yes |

### 1.4 Most recent commit
**`d7f3887`, 2026-10-09 13:11:27 +0200** (16:41 IST). There is nothing on `master` after 2026-10-09.

### 1.5 Branches that suggest mobile work
- **None.** No branch name contains "mobile", "app", "expo", "native" or "api-token".
- Nearest by name: **`origin/claude/manifest-auth-errors-pqil6p`** (unmerged). Its name mentions auth, and its last subject concerns the Entra client-secret check at boot, not mobile login. **Not checked out and not read** (R1). See R7 table.
- The only "mobile" commits are on `master` and concern the **responsive web UI / PWA**, not a native app: `39e6020`, `64b064b`, `0b27f05`. All three predate the docs' baseline and are already reflected in them.

### 1.6 Which snapshot the docs were written from (new finding)
- **Both "deleted" folders still exist:**
  - `C:\Users\Ronit Chaudhari\Desktop\Service Desk Web Clone`: the ZIP extract, 835 files, extracted 2026-10-09 12:50 IST (09:20 +0200).
  - `C:\Users\Ronit Chaudhari\mmg-ticketing-mobile`: a byte-identical copy of this repo's `CLAUDE.md` and `docs/` **as they were before today's edits**.
- I compared the extract with the clone, ignoring CRLF-vs-LF line endings: `git diff --no-index --ignore-cr-at-eol --numstat`, which prints counts only, never content.
  - **831 of 835 files are identical. 4 are modified, 5 are added, 0 are deleted.**
  - That is exactly the 9-file set of `git diff --stat a7c9f90 d7f3887`, with identical counts (+875 / −1).
- **So the docs' baseline is `master` @ `a7c9f90` (2026-10-07 13:20 +0200).** The extract was taken 11 minutes before the next commit.
- **All drift is the 9 commits below, made 2026-10-09 09:31–13:11 +0200. All of them are "AI features".**

| Commit | Time (+0200) | Subject |
|---|---|---|
| `2ee7333` | 09:31 | Phase 1 AI features: sentiment, priority prediction, category suggestion, ticket summary |
| `53c528b` | 11:15 | Move AI summary to conversations tab + auto-enrich email tickets via AI |
| `3f2b126` | 12:00 | Compatible Anthropic SDK import for Node 24 CJS runtime |
| `68bdb9b` | 12:16 | AI technician and team prediction on Create Ticket form |
| `656fc8b` | 12:22 | Apply All button on AI suggestion panel |
| `c0ecd3a` | 12:28 | AI Reply Assistant: Draft Reply button |
| `d463ff3` | 12:51 | AI routing-correction feedback loop |
| `86c7834` | 13:02 | Apply that feedback loop to email-ticket auto-enrichment |
| `d7f3887` | 13:11 | Let AI override the rule-based category on email tickets when confident |

| File | Change |
|---|---|
| `backend/src/app.ts` | +2: `import aiRouter` (line 56), `app.use('/api/v1/ai', aiRouter)` (line 162) |
| `backend/src/modules/ai/ai.router.ts` | **new** (11 lines) |
| `backend/src/modules/ai/ai.controller.ts` | **new** (325 lines) |
| `backend/src/modules/email/graph.service.ts` | +98: import (line 13), async AI enrichment block (lines 820–915) |
| `frontend/src/api/ai.api.ts` | **new** |
| `frontend/src/components/ai/AISuggestionPanel.tsx`, `AISummaryPanel.tsx` | **new** |
| `frontend/src/pages/tickets/CreateTicketPage.tsx` | +37: AI suggestion panel (UI only) |
| `frontend/src/pages/tickets/TicketDetailPage.tsx` | +30 / −1: AI Summary panel, Draft Reply button (UI only) |

**Untouched since the baseline:** all of `backend/prisma/` (schema, migrations, seeds); every middleware; the whole auth module; every router and controller except the four backend files above; all env templates; `web.config*`; `ecosystem.config.js`; `Production-Build/`.

---

## 2. BASE URL — SETTLE THIS DEFINITIVELY

**The API base path is `/api/v1`. Our docs are correct. The brief's `/api` is wrong as an API base.** `/api` is only the IIS proxy prefix; no business route lives directly under it.

**Source:** `backend/src/app.ts` (bootstrap in `backend/src/server.ts:4,15` imports `app` and calls `app.listen`). Every router is mounted under `/api/v1`, for example:
```ts
// backend/src/app.ts:123-124
app.use('/api/v1/auth', authRouter);
app.use('/api/v1', apiLimiter);
// backend/src/app.ts:129
app.use('/api/v1/tickets', ticketsRouter);
// backend/src/app.ts:162  (new since our docs)
app.use('/api/v1/ai', aiRouter);
```

**What sits where** (live `app.ts`):

| Prefix | What | Lines |
|---|---|---|
| `/api/v1/*` | All 38 routers, plus `POST /api/v1/auth/test-login` and the login limiter | `117`, `122–162` |
| `/api/docs` | Swagger UI. **The only route directly under `/api`** | `114` |
| `/health` | Health check, outside `/api` | `111` |
| any other path in production | SPA `index.html` with **200** (so `/api/health` "works" but returns HTML) | `167–178` |

**Corroboration**
- The web client uses `baseURL: '/api/v1'` (`frontend/src/api/client.ts:5`).
- The OpenAPI spec declares `servers: [{ url: '/api/v1' }]` (`backend/src/config/openapi-spec.ts:9`).
- IIS rewrites `^api/(.*)` to `http://localhost:4000/api/{R:1}` (`web.config:10-11`; UAT → `:4001`, `web.config.uat:15-16`). The path is preserved, so the public URL is `https://<host>/api/v1/...`.
- The brief's `/api` most likely comes from that IIS rule, or from the deployment guide's `/api/health` smoke test, which is not a route (`00` §2).

**Occurrences in `docs/web-system/`:** 125 mentions of `/api/v1` and none of a bare `/api` base. The only non-v1 `/api/...` strings are `/api/docs` (Swagger), `/api/health` (documented as *not* a route) and `frontend/src/api/client.ts` (a file path). **No correction needed.**

---

## 3. AUTH — RE-VERIFY FROM LIVE SOURCE

These files are byte-identical to the baseline (§1.6):
- `middleware/auth.middleware.ts`, `middleware/rbac.middleware.ts`, `middleware/errorHandler.middleware.ts`;
- `modules/auth/auth.router.ts`, `auth.controller.ts`, `auth.service.ts`, `msal.config.ts`.

Re-read today.

| Question | Answer | Live source |
|---|---|---|
| Does `requireAuth` still accept `Authorization: Bearer <token>`? | **Yes.** It is unchanged, and an `sd_session` cookie still wins over the header | `middleware/auth.middleware.ts:7`: `const token = req.cookies?.sd_session \|\| req.headers.authorization?.replace('Bearer ', '');` |
| Does login still return the token **only** as an httpOnly cookie? | **Yes.** The body is `{ user }` only | `modules/auth/auth.controller.ts:43-44`: `res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS); return res.json({ user: result.user });` |
| Any new route that returns a token in the body? | **No.** Auth routes are unchanged (`auth.router.ts:7-15`). Only the Selenium `test-login` returns `{ user, token }` (`auth.controller.ts:96`, mounted `app.ts:117`), still must-not-use | – |
| New auth mechanism, middleware or role? | **No.** The new `/ai/*` routes use plain `requireAuth`, so Bearer works there too | `modules/ai/ai.router.ts:7-9` |

**Effect on backend asks**
- **A1: still needed, BLOCKING (dev).** Text and line references unchanged.
- **A2: still needed, BLOCKING (dev & launch).** Text and line references unchanged.
- **A7:** the new gap has been added as A7's first item (§6 item 1; Q2, resolved).
- **A14:** also covers `/ai/*`, which sits behind the same IP-keyed limiter.
- **`02-AUTH.md`:** still accurate. Only `app.ts` line references moved, and they are corrected (§7).

---

## 4. ENDPOINT DRIFT

### 4.1 The 33 MVP endpoints
**Method:**
- Read each live router.
- Confirmed every router **and** controller behind these endpoints is byte-identical to the baseline. So params, validators and response shapes cannot have changed either.

Paths are under `/api/v1` unless noted.

| Endpoint | In our docs (`01`) | In live repo | Status |
|---|---|---|---|
| SYS-1 `GET /health` | public, outside `/api` | `app.ts:111` | MATCH |
| AUTH-1 `GET /auth/config` | public | `modules/auth/auth.router.ts:15` | MATCH |
| AUTH-2 `GET /auth/me` | any | `auth.router.ts:10` (`requireAuth`) | MATCH |
| AUTH-3 `POST /auth/logout` | token optional | `auth.router.ts:9` (no `requireAuth`) | MATCH |
| TKT-1 `GET /tickets` | any (scoped) | `modules/tickets/tickets.router.ts:16` | MATCH |
| TKT-2 `POST /tickets` | any | `tickets.router.ts:17` | MATCH |
| TKT-3 `GET /tickets/:id` | any (ctrl) | `tickets.router.ts:18` | MATCH |
| TKT-4 `PUT /tickets/:id` | any (ctrl) | `tickets.router.ts:19` | MATCH |
| TKT-5 `POST /tickets/:id/assign` | ADMIN, AGENT | `tickets.router.ts:20` (`agentOrAdmin`) | MATCH |
| TKT-6 `POST /tickets/:id/status` | any (ctrl) | `tickets.router.ts:21` | MATCH |
| TKT-7 `GET /tickets/:id/activity` | any ⚠ | `tickets.router.ts:22` | MATCH ¹ |
| TKT-9 `GET /tickets/:id/email-recipients` | any ⚠ | `tickets.router.ts:24` | MATCH |
| TKT-10 `GET /tickets/:id/suggested-assignees` | any ⚠ | `tickets.router.ts:25` | MATCH |
| CMT-1 `GET /tickets/:ticketId/comments` | any ⚠ | `tickets.router.ts:12` → `modules/comments/comments.router.ts:7` | MATCH |
| CMT-2 `POST /tickets/:ticketId/comments` | any ⚠ | `comments.router.ts:8` | MATCH |
| ATT-1 `GET /tickets/:ticketId/attachments` | any (ctrl) | `tickets.router.ts:13` → `modules/attachments/attachments.router.ts:8` | MATCH |
| ATT-2 `POST /tickets/:ticketId/attachments` (multipart `files`) | any ⚠ | `attachments.router.ts:9` (`upload.array('files', 10)`) | MATCH |
| ATT-3 `GET /tickets/:ticketId/attachments/:attachmentId/view` | any (ctrl) | `attachments.router.ts:12` | MATCH |
| ATT-4 `GET /tickets/:ticketId/attachments/:attachmentId/download` | any (ctrl) | `attachments.router.ts:11` | MATCH |
| TSK-1 `GET /tickets/:ticketId/tasks` | any ⚠ | `tickets.router.ts:14` → `modules/ticketTasks/ticketTasks.router.ts:7` | MATCH |
| TSK-3 `PUT /tickets/:ticketId/tasks/:taskId` | any ⚠ | `ticketTasks.router.ts:9` | MATCH |
| USR-1 `GET /users/:id` | any (ctrl) | `modules/users/users.router.ts:18` | MATCH |
| USR-2 `PUT /users/:id` | self or ADMIN | `users.router.ts:19` | MATCH |
| USR-3 `GET /users/search` | ADMIN, AGENT | `users.router.ts:15` (`agentOrAdmin`) | MATCH |
| LKP-1 `GET /categories?flat=true` | any | `modules/categories/categories.router.ts:10` | MATCH |
| LKP-2 `GET /teams` | ADMIN, AGENT | `modules/teams/teams.router.ts:8` (`agentOrAdmin`) | MATCH |
| LKP-4 `GET /countries/my-countries` | any | `modules/countries/countries.router.ts:20` | MATCH |
| LKP-5 `GET /countries` | any | `countries.router.ts:19` | MATCH |
| DSH-1 `GET /dashboard/all` | any (scoped) | `modules/dashboard/dashboard.router.ts:8` | MATCH |
| NTF-1 `GET /notifications` | own | `modules/notifications/notifications.router.ts:7` | MATCH |
| NTF-2 `GET /notifications/count` | own | `notifications.router.ts:8` | MATCH |
| NTF-3 `POST /notifications/:id/read` | own | `notifications.router.ts:10` | MATCH |
| NTF-4 `POST /notifications/read-all` | own | `notifications.router.ts:11` | MATCH |

**Totals: 33 MATCH, 0 CHANGED, 0 GONE.**
- ¹ TKT-7's path, params and response shape are unchanged. A new **kind of entry** can now appear in its `items` (an AI-enrichment audit row); see §5.3. Mobile is unaffected if it follows `05` §A.7.
- The 25 Phase-2 and 3 reference-only endpoints in `01` sit in routers and controllers that are also byte-identical to the baseline, so they are unchanged too.

### 4.2 NEW endpoints since our docs (all mobile-relevant in principle, none in scope)

| Endpoint | Auth | Body (zod) | Response | Notes |
|---|---|---|---|---|
| `POST /api/v1/ai/analyse` | `requireAuth` only (**any role**) | `{ subject: string(min 1), description?: string, messages?: string[], categoryId?: uuid, requesterCountry?: string }` | `{ sentiment:{label,score,reason}, priority:{suggested,confidence,reason}, categories:[{id,name,level}], team:{id,name,reason}\|null, technicians:[{id,name,teamName}] }`. The LLM's JSON is passed through **unvalidated**; `502 "AI returned invalid JSON"` if unparsable | ⚠ `priority.suggested` may be **`CRITICAL`, which is not a `TicketPriority`**. Exposes team rosters (names and user IDs) to any role. `ai.controller.ts:12-18, 127-209` |
| `POST /api/v1/ai/summarise` | `requireAuth` only | `{ ticketId: uuid }` | `{ summary: string }` ("•" bullets); `404 "Ticket not found"` | ⚠ **No ticket-scope check; reads ALL comments including PRIVATE** (§6 item 1). `ai.controller.ts:20-22, 213-253` |
| `POST /api/v1/ai/draft-reply` | `requireAuth` only | `{ ticketId: uuid, hint?: string }` | `{ draft: string }` (HTML `<p>`); `404` | No ticket-scope check; uses PUBLIC comments only. `ai.controller.ts:24-27, 257-325` |

- Router: `modules/ai/ai.router.ts:7-9`, mounted at `app.ts:162`.
- Each call is a synchronous request to a third-party LLM API (Anthropic, model `claude-haiku-4-5-20251001`). It is paid, takes seconds, and has no server-side timeout.
- **Action taken:** listed in `01` Appendix A (out of scope), so that its "all routers accounted for" claim stays true. Making any of them a mobile feature is Q1.

---

## 5. DATA MODEL DRIFT

### 5.1 `schema.prisma`
- Live `backend/prisma/schema.prisma` (1,762 lines) is **identical** to the baseline extract's (`git diff --no-index --ignore-cr-at-eol`: no differences).
- `git log a7c9f90..d7f3887 -- backend/prisma` is **empty**. Migrations and seeds are identical too.
- **Fields added: 0. Removed: 0. Retyped: 0. Enum values changed: 0.**

### 5.2 Re-verification of `03-DATA-MODEL.md` against the live schema
I checked `03` directly against the live schema, not just the extract against the clone.

**Enums: all 13 match value-for-value, in order, at the cited lines.**

| Enum | Live values | `03` | Status |
|---|---|---|---|
| `UserRole` (`:14-19`) | ADMIN, AGENT, END_USER, L2_MANAGER | same | MATCH |
| `TicketStatus` (`:21-34`) | OPEN, IN_PROGRESS, PENDING, PENDING_USER_INFO, PENDING_USER_CONFIRM, PENDING_PARTNER, PENDING_MASTER_DATA, PENDING_MGMT_REVIEW, ON_HOLD, RESOLVED, CLOSED, CANCELED | same | MATCH |
| `TicketPriority` (`:36-41`) | LOW, MEDIUM, HIGH, URGENT | same | MATCH (note: AI code emits `CRITICAL`; §5.3) |
| `TicketSource` (`:43-48`) | WEB_FORM, EMAIL, PORTAL, API | same | MATCH |
| `SLAStatus` (`:50-54`) | WITHIN_SLA, DUE_SOON, BREACHED | same | MATCH |
| `NotificationType` (`:56-64`) | TICKET_ASSIGNED, TICKET_UPDATED, TICKET_RESOLVED, SLA_WARNING, SLA_BREACHED, COMMENT_ADDED, MENTION | same | MATCH |
| `CommentType` (`:66-69`) | PUBLIC, PRIVATE | same | MATCH |
| `AuditAction` (`:71-81`) | CREATED, UPDATED, DELETED, STATUS_CHANGED, ASSIGNED, COMMENTED, ATTACHMENT_ADDED, SLA_BREACHED, ESCALATED | same | MATCH |
| `TicketImpact` (`:83-88`) | MINIMAL, LOW, MEDIUM, HIGH | same | MATCH |
| `TicketUrgency` (`:90-95`) | LOW, MEDIUM, HIGH, URGENT | same | MATCH |
| `TaskStatus` (`:97-102`) | OPEN, IN_PROGRESS, COMPLETED, CANCELLED | same | MATCH |
| `ApprovalStatus` (`:756-761`) | PENDING, APPROVED, REJECTED, CANCELLED | same | MATCH |
| `AnnouncementType` (`:1003-1008`) | INFO, WARNING, CRITICAL, MAINTENANCE | same | MATCH |

- The web-only string lists in `03` §A (`closureCode`, `level`, `mode`) are unchanged in content; only their line numbers moved (corrected).

**Models**
- Every scalar field of each model below is named in `03` §B.
- The names `03` omits are back-relation arrays or relation objects, which the API never returns. That is by design.
- All `schema.prisma:` line ranges cited in `03` are still exact.

| Model | Live lines | Fields | Status |
|---|---|---|---|
| Ticket | 340–409 | 54 | MATCH |
| User | 108–177 | 59 (37 relations not documented, by design) | MATCH |
| Comment | 415–433 | 13 | MATCH |
| Attachment | 439–454 | 11 | MATCH |
| TicketTask | 1664–1682 | 13 | MATCH |
| Team / TeamMember | 199–229 / 231–243 | 17 / 7 | MATCH |
| Category | 249–276 | 22 | MATCH |
| PriorityMatrix | 1556–1564 | 4 | MATCH |
| Country, Notification, AuditLog | 1374–1404, 488–505, 558–577 | 25, 11, 12 | MATCH |

### 5.3 New data *values* the client will see (no schema change)
1. **AI-enrichment audit rows on email tickets** (`modules/email/graph.service.ts:901-911`). Shape:
   ```
   action 'UPDATED', entityType 'Ticket', actorId = the ticket's REQUESTER,
   oldValues {}  (empty object, not null),
   newValues { _aiSentiment: 'satisfied'|'neutral'|'dissatisfied', _aiEnriched: true, priority?, categoryId? }
   ```
   - It appears in TKT-7.
   - **Mobile impact: none if `05` §A.7 is copied verbatim.** That renderer ignores unknown keys, exactly like the web (`TicketDetailPage.tsx:2883-2932`). It prints "‹requester› priority changed from ? → HIGH, category → …" or "‹requester› updated".
   - `03`'s `ActivityAuditItem` (`Record<string, unknown>`) already allows this shape.
   - **Do not** build a generic "render every changed key" view; it would surface `_aiSentiment`.
2. **Email tickets can change priority and category after creation.**
   - This runs asynchronously in `setImmediate`, seconds after ingest (`graph.service.ts:820-915`).
   - Priority is changed only if it is still `MEDIUM` (`:878`). Category is set if empty, or overridden on a "high" confidence AI answer (`:888`).
   - It writes through a direct `prisma.ticket.update` (`:896`), with **no SLA recalculation and no auto-assignment re-run**.
   - Mobile impact: none beyond "refetch shows new values". Do not cache an email ticket's priority or category as immutable.
3. **`CRITICAL` priority** exists only in `/ai/*` responses. It cannot be persisted: the DB enum rejects it. If mobile ever uses `/ai/analyse`, map `CRITICAL` → `URGENT`.

---

## 6. ANYTHING ELSE THAT INVALIDATES OUR DOCS

**Checked and unchanged:**
- auth mechanism and token transport (§3);
- middleware (auth, rbac, errorHandler, upload);
- roles (`UserRole`, `agentOrAdmin` / `adminOnly` / `agentOrAdminOrL2`);
- error envelope (`errorHandler.middleware.ts` byte-identical; `AppError` → `{ error }`);
- pagination (`utils/pagination.ts` and the TKT-7 pager unchanged);
- rate-limit values, CORS, the 2 MB body limit, the production HTML fallback;
- environments and ports (`web.config`, `web.config.uat`, `ecosystem.config.js`, `Production-Build/` identical);
- env templates (no new variable names).

**Doc facts that did change** (all corrected in §7):
- (a) Router and module counts: 37 → 38 routers, 40 → 41 modules (≈304 → 307 routes).
- (b) Source-line references into `app.ts`, `TicketDetailPage.tsx` and `CreateTicketPage.tsx` moved.
- (c) Provenance: the analysed path and the "not a git repo" statement.

**New risks in the web repo.** Record only, per R3: not doc errors, but Ronit should know before sending asks or relying on UAT.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 1 | **High (security)** | **`/ai/summarise` discloses PRIVATE notes across scope.** It has no role or ticket-scope check and selects **all** comments (no `type` filter). Any authenticated user, END_USER included, who knows a ticket UUID gets an LLM summary of its internal notes. The web shows the "AI Summary" panel to **every** role on the ticket page: the route has no role gate, and the panel no role check | `modules/ai/ai.controller.ts:213-253`; `ai.router.ts:8`; `frontend/src/pages/tickets/TicketDetailPage.tsx:838`; `frontend/src/router/index.tsx:117` |
| 2 | **High if confirmed (availability; hits UAT, our only dev target). VERIFY** | **`@anthropic-ai/sdk` is imported at boot but not declared as a dependency.** `app.ts:56` → `ai.router.ts:3` → `ai.controller.ts:2` (static import), and `graph.service.ts:13` imports `ai.controller` too. `backend/package.json` and `backend/package-lock.json` contain no `anthropic` entry, and the build is `npx prisma generate && tsc` (`backend/package.json:8`). A clean install and build of current `master` should fail with "Cannot find module '@anthropic-ai/sdk'" unless the package was installed by hand on the server. `ai.controller.ts:8` also constructs the client at module load. No committed env template names `ANTHROPIC_API_KEY` | as cited |
| 3 | Medium (security / cost) | `/ai/draft-reply` and `/ai/analyse` also lack role and scope checks. draft-reply reveals any ticket's title, description and public thread by UUID (same class as `05` §C). analyse returns team rosters with user IDs to any role. Every call costs money; only the generic 300/min limiter applies | `ai.controller.ts:127-209, 257-325` |
| 4 | Medium (data protection) | Ticket content goes to a third-party LLM API: titles, descriptions and threads (PRIVATE notes too, for summarise), plus the first 1,500 characters of **every inbound email** when `ANTHROPIC_API_KEY` is set. There is no opt-out in code. Mobile users' tickets are included | `ai.controller.ts:191-196, 238-249, 295-321`; `graph.service.ts:851, 854-869` |
| 5 | Low (web bug) | AI priority `CRITICAL` is invalid. In email enrichment the update throws, so the whole enrichment (category and sentiment log too) is silently skipped. On Create Ticket, "Apply" on a CRITICAL suggestion makes `POST /tickets` fail with 400 | `graph.service.ts:878, 896, 913`; `tickets.validator.ts:19` (`z.nativeEnum(TicketPriority)`) |
| 6 | Low (data quality) | AI-enrichment audit rows are attributed to the **requester**, so History says the requester changed priority or category | `graph.service.ts:904` |
| 7 | Low | AI priority change skips SLA recalculation, unlike TKT-4 (`tickets.controller.ts:676-693`). SLA due dates stay those of the original MEDIUM | `graph.service.ts:896` |

**None of these invalidates the MVP contract.** Items 1 and 3 belong with ask **A7**. Item 2 decides whether UAT is up (Q6).

---

## 7. VERDICT

**YES. Docs 00–06 are safe to build against as they stand now.** The corrections below are already applied. Even before them, nothing a client built to the spec depends on had changed: no endpoint, param, response shape, enum value, auth rule, error shape or pagination shape.

### 7.1 What had to be corrected, by severity

| # | Severity | Problem | Fix applied |
|---|---|---|---|
| 1 | Medium | `01` Appendix A claimed "All 40 router files are accounted for: 37 mounted". The new `/ai` router was missing, so a reader would think the list was complete | Counts and mount range updated; `/ai` row added as **out of scope** (the conservative default; promotion is Q1) |
| 2 | Low | `00` §1 counts: "40 modules: 37 routers" | → "41 modules: 38 routers" |
| 3 | Low | `00` header row and blocker B1 said the analysed repo "is not a git repo". After the path change that is false | Row rewritten as factual provenance; B1 marked RESOLVED; line-number convention pinned to `d7f3887` |
| 4 | Low | Source-line references on 53 doc lines, pointing into 3 changed web files (`app.ts`, `TicketDetailPage.tsx`, `CreateTicketPage.tsx`), were off by +1 to +37. Each new number was checked to land on the identical line of code | Updated (table 7.3) |

### 7.2 Changes to `00-OVERVIEW.md`
| Line | Before | After |
|---|---|---|
| 10 | (after Job 1) "`…\MMG-Ticketing-Platform`. The brief's `…\MMG-Ticketing-Platform` placeholder was not filled, … It is **not a git repo**, so there is no commit hash to pin." | "`…\MMG-Ticketing-Platform` (git clone, branch `master`). These docs were first written from a ZIP extract with no git history. `07-DRIFT-CHECK.md` (2026-10-14) proved that extract identical to `master` @ `a7c9f90` (2026-10-07) and re-verified the docs against `master` @ **`d7f3887`** (2026-10-09). The docs are pinned to `d7f3887`." |
| 19 | "About 300 routes in 40 modules: 37 routers mounted in `app.ts`" | "About 300 routes in 41 modules: 38 routers mounted in `app.ts`" |
| 104 | "Line numbers are as of 2026-10-09 and will drift" | "Line numbers are as of web commit `d7f3887` (`master`, 2026-10-09) and will drift" |
| 115 | B1 last cell ended "…so the docs can be pinned to a commit hash." | Appended: "**RESOLVED 2026-10-14:** that finding described the old ZIP extract. The path above is now a real git clone; the extract matched `master` @ `a7c9f90`, and the docs are pinned to `master` @ `d7f3887` (`07-DRIFT-CHECK.md` §1)." |

### 7.3 Source-line corrections (number changes only; no wording changed)

**`01-API-CONTRACT.md`**

| Line | Before → After |
|---|---|
| 37 | `app.ts:75` → `app.ts:76` |
| 68 | `app.ts:86-101, 121-123` → `app.ts:87-102, 122-124` |
| 74 | `app.ts:165-176` → `app.ts:167-178` |
| 108 | `app.ts:110` → `app.ts:111` |
| 160 | `app.ts:116` → `app.ts:117` |
| 166 | `app.ts:128` → `app.ts:129` |
| 388 | `TicketDetailPage.tsx:515-517` → `:518-520` |
| 662 | `app.ts:125` → `app.ts:126` |
| 870 | `app.ts:131` → `app.ts:132` |
| 909 | `app.ts:142` → `app.ts:143` |
| 964 | `app.ts:132` → `app.ts:133` |
| 1004 | `app.ts:147` → `app.ts:148` |
| 1066 | "`app.ts:116-160`. All 40 router files … 37 mounted" → "`app.ts:117-162`. All 41 router files … 38 mounted" (item 1) |
| 1105 | **new row:** `ai (/ai)`: `POST /analyse`, `POST /summarise`, `POST /draft-reply`, ⚠ no role/scope check (item 1) |

**`02-AUTH.md`**

| Line | Before → After |
|---|---|
| 68 | `app.ts:86-91` → `app.ts:87-92` |
| 127 | `app.ts:69-72` → `app.ts:70-73` |
| 128 | `app.ts:93-101` → `app.ts:94-102` |
| 168 | `app.ts:116` → `app.ts:117` |

**`03-DATA-MODEL.md`**

| Line | Before → After |
|---|---|
| 45 | `TicketDetailPage.tsx:2427-2433` → `:2456-2462` |
| 46 | `CreateTicketPage.tsx:444-449` → `:481-486` |
| 47 | `CreateTicketPage.tsx:353-360` → `:390-397` |

**`05-RULES-AND-GAPS.md`**
- Lines 24–475 cite `TicketDetailPage.tsx` (§A.1–A.7, A.15), except 315–351, which cite `CreateTicketPage.tsx` (§A.8).
- Lines 528–585 cite `app.ts`.

| Line | Before → After |
|---|---|
| 24 | `:43-104` (map), `:609-620` (locks) → `:45-106`, `:612-623` |
| 85 | `:609-620` → `:612-623` |
| 102 | `:756-764` → `:759-767` |
| 103 | `:767` → `:770` |
| 104 | `:768-774` → `:771-777` |
| 106 | `:1655-1695` → `:1684-1724` |
| 108 | `:764` → `:767` |
| 111 | `:2392-2513` → `:2421-2542` |
| 123 | `:2485` → `:2514` |
| 124 | `:2427-2433` → `:2456-2462` |
| 134 | `:2489-2495` → `:2518-2524` |
| 139 | `:2496-2505` → `:2525-2534` |
| 143 | `:1655-2181` → `:1684-2210` |
| 165 | `:106-119` → `:108-121` |
| 171 | `:1905-1979` → `:1934-2008` |
| 183 | `:1747-1859`, `:2334-2390` → `:1776-1888`, `:2363-2419` |
| 199 | `:537-568, 835-1076` → `:540-571, 841-1105` |
| 219 | `:537-555` → `:540-558` |
| 232 | `:1072` → `:1101` |
| 240 | `:1040-1045` → `:1046-1051` |
| 246 | `:2656-2689`, `:1128` → `:2685-2718`, `:1157` |
| 279 | `:2854-2903` → `:2883-2932` |
| 315 | `:74-93` → `:78-97` (CreateTicketPage) |
| 326 | `:145-163` → `:149-167` (CreateTicketPage) |
| 343 | `:95-126` → `:99-130` (CreateTicketPage) |
| 351 | `:164-185` → `:168-189` (CreateTicketPage) |
| 475 | `:624-631, 1335-1406, 2230-2268` → `:627-634, 1364-1435, 2259-2297` |
| 528 | `app.ts:165-176` → `app.ts:167-178` |
| 539 | `app.ts:93-101` → `app.ts:94-102` |
| 581 | `app.ts:116` → `app.ts:117` |
| 585 | `app.ts:66-68` → `app.ts:67-69` |

**`06-BACKEND-ASKS.md`**

| Line | Before → After |
|---|---|
| 149 | `app.ts` around lines 86–101 → 87–102 |
| 192 | `TicketDetailPage.tsx`, around lines 43–104 → 45–106 |
| 227 | `app.ts`, around line 170 → 172 |

### 7.4 Deliberately NOT changed
- Every endpoint spec, rule, recommendation, enum and interface: none drifted.
- `04-SCREEN-MAP.md`: no change needed. The new web AI UI is a scope question (Q5).
- "as of 2026-10-09" in `01:6`, `03:3` and `05:14`: still true, since `d7f3887` is dated 2026-10-09 and every line number is now valid at it.
- `C:\Users\Ronit Chaudhari\mmg-ticketing-diagnostic.md` (`00:11`, `06:22`): the file still exists at that path, and it was not on the list of moved paths.
- Citations into all other web files: those files are byte-identical to the baseline, so their line numbers are still exact.

---

## Job 1 record: path corrections (authorised by Ronit; path strings only)

| File:line | Old | New |
|---|---|---|
| `CLAUDE.md:38` | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Web Clone` | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform` |
| `CLAUDE.md:40` | `C:\Users\Ronit Chaudhari\<CLONE_FOLDER_NAME>` | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform` |
| `00-OVERVIEW.md:10` | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Web Clone` | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform` |
| `00-OVERVIEW.md:10` | `C:\Users\Ronit Chaudhari\<CLONE_FOLDER_NAME>` | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform` |
| `00-OVERVIEW.md:115` | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Web Clone` (in the B1 command) | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform` |

- The old mobile path `C:\Users\Ronit Chaudhari\mmg-ticketing-mobile` appears **0 times** in `CLAUDE.md` and `docs/web-system/`.
- `00-OVERVIEW.md:10` and `:115` were then corrected for provenance under Job 2 (§7.2). `CLAUDE.md:40` was left path-only (Q3).

---

## Commands not run (R7: Ronit decides)

| Command I would have run | Why | Why not |
|---|---|---|
| `git -C "…\MMG-Ticketing-Platform" fetch --dry-run` or `git ls-remote origin` | Prove no commits landed on GitHub after the 2026-10-14 clone | `fetch` writes to `.git` (R1); `ls-remote` is a network call outside the R4 list. Risk is low, since the clone is from today |
| `git -C "…\MMG-Ticketing-Platform" log --oneline master..origin/claude/manifest-auth-errors-pqil6p` | See whether the unmerged auth-named branch changes auth | R1: read `master` only |
| On the UAT VM: `npm ls @anthropic-ai/sdk --prefix C:\inetpub\servicedesk-uat\backend`, then `nssm status ServiceDesk-UAT` | Confirm UAT boots with the new AI module (§6 item 2) | Server access; outside our remit |

## Method and safety log
- **Web repo commands:** only `git status`, `git log`, `git branch`, `git diff` (including `--no-index`, `--numstat`, `--stat`), `git config --get`, `git remote -v`. File reads used `cat`, `grep`, `head`, `tail`, `ls`, `find`, `wc`.
- **No writes** to either web folder. `git status` on `MMG-Ticketing-Platform` was identical before and after: `master`, up to date, clean.
- **No database, Redis, Prisma, install, build or network call.**
- **Secrets (R6):** no secret value was opened or printed.
  - `.env.production` was touched only by a `grep -c '^ANTHROPIC_API_KEY='` count (result 0) and by a `--numstat` diff, which prints line counts, not content.
- **Mobile repo:** writes only to `CLAUDE.md`, `docs/web-system/00–06` (edits) and this new file. No code, no `package.json`, no `src/`.
- A helper script that compared old and new citation lines lives in the session scratchpad, outside both repos.

---

## Open questions for Ronit

- **Q1. Should any `/ai/*` endpoint become a mobile feature?** Candidates are a staff ticket summary, a staff draft reply, and create-ticket suggestions. They are now listed as **out of scope** in `01` Appendix A. If yes, each needs a full spec in `01` first, and summarise should wait until the scope gap (§6 item 1) is fixed.
- **Q2. RESOLVED 2026-10-14:** after re-verifying the route against `d7f3887`, I added `/ai/summarise` to `05` as §C.24 (Critical) and `/ai/draft-reply` + `/ai/analyse` as §C.25 (Medium). In `06`, A7 now has a "FIX FIRST" item that says plainly it outranks every other A7 item; A7's summary-table row and the manager summary say the same. *Original question, kept for the record:* **Add the AI gaps to ask A7 before you send it?** I did not edit `06` or `05` §C: ask wording is your call, and R3 said to record findings here. Proposed bullet for `06` A7 → "Other modules":
  > - AI: `POST /ai/summarise` and `POST /ai/draft-reply` must apply the same ticket-scope check as `GET /tickets/:id`; `summarise` must exclude PRIVATE comments for END_USER; consider restricting `/ai/*` to ADMIN/AGENT/L2 (`modules/ai/ai.controller.ts:213-325`).

  Also: should a matching row go into `05` §C (as C.24)?
- **Q3. Reword `CLAUDE.md:40`?** After the literal placeholder replacement it reads oddly ("The brief … named it `…\MMG-Ticketing-Platform`. No such folder exists directly under the home folder…"). I kept it path-only because `CLAUDE.md` is the guardrail file. Proposed replacement:
  > - These docs were first written from a ZIP extract of web `master` @ `a7c9f90`; they are verified against, and pinned to, `master` @ `d7f3887` in the clone above (`docs/web-system/07-DRIFT-CHECK.md`).
- **Q4. The old folders were not deleted.** `C:\Users\Ronit Chaudhari\Desktop\Service Desk Web Clone` and `C:\Users\Ronit Chaudhari\mmg-ticketing-mobile` both still exist. The old extract also holds a copy of `.env.production`, which contains real secrets (`05` C.22). Delete them, or keep them? I deleted nothing (R4).
- **Q5. Should `04-SCREEN-MAP.md` list the new web AI features as "not on mobile"?** These are the AI suggestion panel on Create Ticket, and the AI Summary and Draft Reply on Ticket Detail. I did not add them because it is a scope decision.
- **Q6. VERIFY what UAT runs.**
  - If UAT is on `a7c9f90` or earlier, `/ai/*` does not exist there and everything else matches.
  - If it is on current `master`, check that `@anthropic-ai/sdk` is installed (§6 item 2); otherwise the next clean deploy may take UAT down.
