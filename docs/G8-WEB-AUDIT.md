# G8: the web portal's audit log, and the app's (2026-11-02)

**What this is.** Part 1 of the G8 brief: the endpoint behind the web portal's `/audit-log`, from the web repo (read-only). Every statement has a source. It is followed by what the app built (§10) and what needs Ronit (§11).

**Sources**
- Web repo clone `MMG-Ticketing-Platform`, read-only, `master` at HEAD `d7f3887` (2026-10-09). It was byte-for-byte unchanged before and after this work.
- Path prefixes:
  - `BE:` = `backend/src/`
  - `FE:` = `frontend/src/`
  - `src/` = this mobile repo
- `schema.prisma` = `backend/prisma/schema.prisma`, read as text (R2: no database).

---

## 0. The answer in brief

| # | Question | Answer |
|---|---|---|
| 1 | Is there an API route, or does the page query the database? | **There is a route:** `GET /api/v1/audit-log` (§2). **But the `/audit-log` PAGE is not in the clone at all** (§1). The deployed web runs code this clone does not have. |
| 2 | Path, method, query | `GET /api/v1/audit-log` with `page`, `limit`, `entityType`, `actorId`, `ticketId` (§2) |
| 3 | Response | Standard page `{data, total, page, limit, totalPages, hasNext, hasPrev}`. Each row is the full `audit_logs` row plus `actor {id, displayName, email}` and `ticket {id, ticketNumber, title}` (§3) |
| 4 | Pagination | `page`/`limit` offset paging. Default **25**, max 100, min 1 (§4) |
| 5 | ADMIN-only on the server? | **Yes.** `requireAuth, adminOnly`: every other role gets **403**. Not merely a hidden link (§5) |
| 6 | Filters | The server reads **three**: `entityType`, `actorId`, `ticketId`, each an exact match. **No action, date (From/To), ticket-number or text filter exists** in this code (§6) |
| 7 | Action labels and colours | The `AuditAction` enum has 9 values (§7). **The clone has no audit page, so it has no labels or colours for them.** Only the ticket History tab has sentence labels, all grey (§7) |
| 8 | Details: formatted or stored? | **Stored as JSON objects** (`oldValues`, `newValues`) and returned as they are, ids unresolved. `{"type":"PUBLIC"}` is exactly what a comment writes, and `status: "IN_PROGRESS" → "RESOLVED"` is `oldValues.status` → `newValues.status`. So the arrow is drawn client-side by the page (§8) |
| 9 | Actor's role, "(Consultant)" | **Not in the response:** `actor` carries `id, displayName, email` only. "Consultant" appears nowhere in the web source (§9) |
| 10 | Default sort | `createdAt` descending, newest first. No sort parameter (§10) |

---

## 1. The page: not in the clone

Ronit confirmed that `/audit-log` exists and works on the deployed web portal. **The clone has no such page:**
- **No route:** `FE:router/index.tsx` registers no `audit-log` path (`:114-159`).
- **No API client:** no file in `FE:api/` calls `/audit-log`.
- **No page anywhere in history:**
  - `git log --all -S"audit-log" -- '*.ts' '*.tsx'` finds only the initial commit `051e297`, which added the backend route.
  - No branch has a frontend file matching `*udit*`. All nine remote branches were checked, the newest being `origin/master` (2026-10-09) and `origin/uat-local-features` (2026-10-07).
- **No built page:**
  - `Production-Build/frontend/assets/` (built 2026-10-14, 90 files) has no audit page; only `TicketDetailPage-*.js` mentions audit.
  - The same holds for `frontend/dist_old/`.
- **The other copy:** the Desktop folder "Service Desk Web Clone" (no `.git`) has the same `pages/` folders and no audit page either.

**So:**
- Everything Ronit sees on the page that the endpoint below cannot supply comes from newer code than this clone:
  - the Action, From, To and Ticket # filters;
  - the "(Consultant)" beside a name;
  - the action colours.
- Either the deployed backend is newer too, or the page filters on its own side.
- The app was built against the endpoint as it is in the clone. CLAUDE.md rule 1: never invent a query parameter.

## 2. The endpoint

| | |
|---|---|
| Mount | `app.use('/api/v1/audit-log', auditLogRouter)` (`BE:app.ts:136`; import `:30`) |
| Route | `router.get('/', requireAuth, adminOnly, getAuditLogs)` (`BE:modules/auditLog/auditLog.router.ts:8`) |
| Method, path | `GET /api/v1/audit-log` |
| Handler | `getAuditLogs` (`BE:modules/auditLog/auditLog.controller.ts:5-29`) |
| Query | `page`, `limit` (`:6`, via `parsePagination`); `entityType`, `actorId`, `ticketId` (`:7`). **Nothing else is read.** |
| Other routes in the module | None: `GET /` is the only one (`auditLog.router.ts:8`). There is no export, no single-entry GET and no write route; entries are written in-process by `logAudit` (`auditLog.service.ts:15-28`) and one `createMany` (§8) |

## 3. The response, field by field

`res.json(paginatedResponse(data, total, pagination))` (`auditLog.controller.ts:28`; shape `BE:utils/pagination.ts:22-37`):

| Field | Type | Source |
|---|---|---|
| `data` | `AuditLogEntry[]` | `findMany` (`auditLog.controller.ts:17-25`) |
| `total` | number, rows matching the filters | `count({ where })` (`:16`) |
| `page`, `limit` | number, as parsed | `pagination.ts:16-20` |
| `totalPages` | `ceil(total / limit)` | `:27` |
| `hasNext`, `hasPrev` | boolean | `:34-35` |

**Each row:** `findMany` has no `select`, so every scalar column comes back, plus the two includes (`auditLog.controller.ts:19-22`; model `schema.prisma:558-577`).

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | `:559` |
| `ticketId` | string \| null | `:560`. Null for an entry with no ticket. Also null after its ticket is deleted (`onDelete: SetNull`, `:570`) |
| `actorId` | string \| null | `:561`. Null for the auto-close job (§8). Also null after the user is deleted (`onDelete: SetNull`, `:571`) |
| `action` | `AuditAction` | `:562`; enum `:71-81` (§7) |
| `entityType` | string | `:563`. Free text; the values written are in §6 |
| `entityId` | string | `:564`. The ticket's id, the comment's id, or the ticket's id again for attachments (§8) |
| `oldValues` | JSON \| null | `:565`. Any JSON; in practice an object (§8) |
| `newValues` | JSON \| null | `:566` |
| `ipAddress` | string \| null | `:567`. Sent to ADMIN with every row. **The app never displays it.** |
| `createdAt` | ISO string | `:568` |
| `actor` | `{ id, displayName, email }` \| null | `auditLog.controller.ts:20`. **No role.** |
| `ticket` | `{ id, ticketNumber, title }` \| null | `:21` |

The mobile type is `AuditLogEntry` (`src/types/audit.ts`, copied from `03` §C).

## 4. Pagination

- **Offset paging:** `skip = (page - 1) * limit`, `take = limit` (`BE:utils/pagination.ts:39-44`, used at `auditLog.controller.ts:24`).
- **Defaults:** `page` defaults to 1; `limit` defaults to **25**, clamped to 1–100 (`pagination.ts:16-20`).
- **Bad values:** `page=abc` gives `NaN` and a Prisma 500, as for every endpoint using `parsePagination` (`01` §0.3). The app always sends positive integers (`toPositiveInt`).
- **Cost of each page:**
  - Every page runs a `count` and a `findMany` (`auditLog.controller.ts:15-26`).
  - The table is indexed on `ticketId`, `actorId` and `createdAt` (`schema.prisma:573-575`), but **not on `entityType`**.
  - So an entity-type filter alone reads the whole table on each page.
- **Rows shift:** offset paging over a log that grows at the top repeats rows when entries are written between page loads. The app de-duplicates by `id` (`src/hooks/useAuditLog.ts`).

## 5. Server-side role enforcement: genuinely ADMIN-only

- `adminOnly = requireRole('ADMIN')` (`BE:middleware/rbac.middleware.ts:21`).
- `requireRole` answers:
  - `401 {"error":"Unauthorized"}` with no user;
  - `403 {"error":"Forbidden: insufficient role"}` for any role not listed (`:8-18`, 403 at `:13-15`).
- It runs after `requireAuth` on the only route (`auditLog.router.ts:8`). END_USER, AGENT and L2_MANAGER all get 403.
- **This is not the A7 pattern.** The web's pages have no route guards (`ROLE-MATRIX.md` §1, `FE:router/index.tsx:58-83, 114-159`), but this endpoint checks the role itself. So no §C security finding is needed.
- **One caveat, already reported:**
  - The session cache does not re-check the role (`05` C.11).
  - An ADMIN who is demoted keeps AUD-1 access until their cached session expires (≤ 8 h).
- **The app:**
  - The drawer row and the route both follow `canViewAuditLog(role)` = ADMIN (`src/utils/permissions.ts`).
  - The hook sends AUD-1 only for ADMIN (`src/hooks/useAuditLog.ts`).
  - This matches the server. The app's gate is UX; the server's is the security.

## 6. Filters: what each accepts

| Filter | Param | Matching | Values | Source |
|---|---|---|---|---|
| Entity type | `entityType` | exact, **case-sensitive** string equality (Prisma default on PostgreSQL) | `Ticket`, `Comment`, `Attachment`, and lowercase `ticket` (auto-close job). Nothing else is written (§8) | `auditLog.controller.ts:10` |
| Actor | `actorId` | exact | a user id (uuid) | `:11` |
| Ticket | `ticketId` | exact | a ticket id (uuid), **not** a ticket number | `:12` |
| Empty string | any of the three | ignored (`entityType && …`) | — | `:9-13` |
| **Action** | — | **not supported** | — | not read at `:7` |
| **From / To (date)** | — | **not supported** | — | not read |
| **Ticket #** | — | **not supported** (ids only) | — | not read |
| Free text | — | **not supported** | — | not read |

- The three filters combine with AND (one `where` object, `:9-13`).
- **An entity-type gap** (`05` B.38):
  - The auto-close job writes `entityType: 'ticket'`, lowercase (`BE:jobs/autoCloseResolved.job.ts:36`).
  - Every other ticket entry writes `'Ticket'` (§8).
  - So `entityType=Ticket` leaves out every automatic close.
- **TKT-7 has the same mismatch, unrelated to this endpoint:** its `OR` branch `{ entityType: 'TICKET', entityId }` matches nothing (`tickets.controller.ts:1003-1008`). It is harmless there, because `ticketId` is set too.

## 7. Actions: labels and colours

- **The enum, nine values** (`schema.prisma:71-81`): `CREATED`, `UPDATED`, `DELETED`, `STATUS_CHANGED`, `ASSIGNED`, `COMMENTED`, `ATTACHMENT_ADDED`, `SLA_BREACHED`, `ESCALATED`.
- **Written today:** six of them (§8). `DELETED`, `SLA_BREACHED` and `ESCALATED` are never written: the SLA breach job sends notifications, not audit entries (`BE:jobs/slaBreachChecker.job.ts:98, :153`).
- **Labels on the web:**
  - The clone has no audit page, so there are no audit-page labels to copy.
  - The only labels are the ticket History tab's sentences, e.g. "changed status to …", "added a comment", "auto-assigned to …" (`FE:pages/tickets/TicketDetailPage.tsx:2903-2917`). The app already uses them on M4 (`src/utils/activity.ts`).
  - The deployed page's labels, as Ronit read them: "Commented", "Status Changed", "Assigned", "Created".
  - The app uses those four verbatim and the same title case for the other five: "Updated", "Deleted", "Attachment Added", "SLA Breached", "Escalated" (`src/utils/audit-log.ts` `AUDIT_ACTION_LABELS`).
  - An action the app does not know is shown in words ("AUTO_CLOSED" → "Auto Closed"), never dropped.
- **Colours on the web:**
  - **None in the clone for audit actions.** History renders every entry in grey (`TicketDetailPage.tsx:2919-2931`).
  - The deployed page's colours could not be read.
  - The app's colours are its own, chosen for lightness (`docs/brand/UI-STANDARDS.md` §13). Matching the deployed page needs its colours from Ronit (§11).

## 8. Details: what is stored, write site by write site

- `oldValues` / `newValues` are `Json?` columns (`schema.prisma:565-566`), written by `logAudit` (`BE:modules/auditLog/auditLog.service.ts:15-28`).
- AUD-1 returns them untouched. Unlike TKT-7, it resolves no ids to names: TKT-7 adds `_<field>Name` keys (`tickets.controller.ts:1034-1080`), and AUD-1 has no such step.
- **So the web page's arrows and its raw `{"type":"PUBLIC"}` are drawn client-side from stored JSON.**

| Action | entityType | oldValues | newValues | Written at |
|---|---|---|---|---|
| CREATED (form or API) | `Ticket` | — | `{title, priority, status, urgency, impact, source, assignedToId, teamId, categoryId, countryId}` | `BE:modules/tickets/tickets.controller.ts:408-425` |
| CREATED (email, Graph) | `Ticket` | — | `{title, priority, status, source, assignedToId, teamId, categoryId, countryId}` | `BE:modules/email/graph.service.ts:749-765` |
| CREATED (email, IMAP) | `Ticket` | — | `{title, priority, status, source, assignedToId, teamId, categoryId}` | `BE:modules/email/imap.service.ts:209-224` |
| ASSIGNED, automatic | `Ticket` | `{assignedToId: null}` | `{assignedToId, _autoAssigned: true}` | `tickets.controller.ts:431-440`; `graph.service.ts:767-776`; `imap.service.ts:226-234` |
| ASSIGNED, field edit | `Ticket` | `{assignedToId}` (previous) | `{assignedToId}` | `tickets.controller.ts:738-747` |
| ASSIGNED, TKT-5 | `Ticket` | — | `{assignedToId}` | `tickets.controller.ts:813-821` |
| UPDATED, field edit | `Ticket` | the changed fields' old values | the changed fields among `title, priority, urgency, impact, categoryId`, or `{updated: true}` when none changed | `tickets.controller.ts:716-733` |
| UPDATED, AI enrichment of an email ticket | `Ticket` | `{}` | `{_aiSentiment: "satisfied" \| "neutral" \| "dissatisfied", _aiEnriched: true, priority?, categoryId?}` | `graph.service.ts:902-910`; sentiment values `:862` |
| STATUS_CHANGED | `Ticket` | `{status}` | `{status}` | `tickets.controller.ts:929-937` |
| STATUS_CHANGED, auto-close | **`ticket`** | `{status: "RESOLVED"}` | `{status: "CLOSED", closedAt, _source: "auto-close-48h"}`. No `actorId` | `BE:jobs/autoCloseResolved.job.ts:33-41`. The hours come from `AUTO_CLOSE_HOURS` (default 48, `:6`), but the marker always says 48h |
| COMMENTED | `Comment` | — | `{type: "PUBLIC" \| "PRIVATE"}` | `BE:modules/comments/comments.controller.ts:103-111` |
| ATTACHMENT_ADDED | `Attachment` | — | `{count, files: [original names]}`. `entityId` is the ticket's id | `BE:modules/attachments/attachments.controller.ts:97-105` |

**What the app's formatter does with each** (`src/utils/audit-log.ts` `formatAuditDetails`; tests `tests/audit/audit-details.test.mjs`).

**Handled readably:**

| Action | Shown as |
|---|---|
| STATUS_CHANGED | "Status: In Progress → Resolved", using the app's status labels. For the auto-close, also "Closed automatically after being resolved" (the 48 h is not repeated, since the env can change it) |
| ASSIGNED | "Assigned automatically to user 3f2a9c1e", "Technician: user … → user …" or "Assigned to user …". AUD-1 has no names, so the first 8 characters of the id stand in; a `_assignedToName`, if a server ever adds one, is used instead |
| COMMENTED | "Public reply", "Private note" |
| ATTACHMENT_ADDED | "2 files: a.pdf, b.png" (up to 5 names, then "and N more") |
| UPDATED | "Priority: Medium → High", "Title: “old” → “new”", impact and urgency by their labels, "Category changed", "Saved with no field changes", "Set by AI enrichment", "AI sentiment: Dissatisfied" |
| CREATED | Title, priority, status, impact, urgency and source in words. The ids it carries become "Also set: technician, group, category" rather than four uuids |

**Falls through:**
- **Any other key, on any action:** shown as "Label: before → after".
  - Labels are put into words (`closedAt` → "Closed at").
  - Dates are formatted, ids are shortened, lists are joined, and objects are shown as JSON.
- **An unknown action:** every key, as above.
- **A payload that is not an object** (array, string, number): shown raw in a monospace block, "Before: …" / "After: …".
- **Length:** values are clipped at 120 characters and the raw block at 600.
- **Errors:** any exception ends in the raw block. **It never throws.** The tests feed it a throwing getter and a BigInt.
- **Nothing recorded:** no details box at all.

## 9. The actor's role

- AUD-1 selects `actor: { id, displayName, email }` (`auditLog.controller.ts:20`): **no `role`**.
- "Consultant" is not a role:
  - `UserRole` is `ADMIN, AGENT, END_USER, L2_MANAGER` (`schema.prisma:14-19`);
  - the string "Consultant" appears nowhere in `BE:` or `FE:`.
- It may be the user's `department` (`schema.prisma:119`), or a role label in newer code. Either way it is not in this endpoint's response.
- **The app shows the name and email only.** Adding the role would mean a per-person lookup (USR-1 for each actor), which UAT's shared hardware argues against, or a backend change (§11).

## 10. Sort, and what the app built

- **Sort:** `orderBy: { createdAt: 'desc' }` (`auditLog.controller.ts:23`). No sort parameter. Entries written in the same millisecond have no tie-break, so paging could split them unpredictably; that is rare.
- **What was built** (M20, ADMIN only; `ROLE-MATRIX.md` §19):

| Part | What it does |
|---|---|
| Drawer | "Audit log", ADMIN only, after Announcements below a divider, before Settings. The route is registered for ADMIN alone (`drawerRoutes`); for the other four roles React Navigation's own router refuses every way to open it (tests) |
| Request | AUD-1 with `page`, `limit=50` and up to three filters, through `listAuditLog` (`src/api/auditLog.api.ts`), which drops any other key. 10 pages reach the 500-entry cap; at the default of 25 that would take 20 |
| List | FlashList, a heading per local day ("Today", "Yesterday", "Mon 02 Nov 2026"), then one card per entry (action pill, entity, time, ticket link, person, email, details box). Infinite scroll as the ticket list; capped at 500 with "Showing the first 500 of N — search or filter to narrow" |
| Ticket link | Opens through the deep-link resolver (`openTicketLinkInApp` → TicketLink → M4) |
| Filters | **Entity type** (sheet: All, Ticket, Comment, Attachment). **Ticket**: the search box takes a number; TKT-1 `search=<n>` resolves it to the id, exact match only, as the deep-link resolver does. **Person**: the USR-3 picker, every role, active users only. They combine in one request; "Clear all" resets them |
| Not built | Action and date filters: the endpoint has no such parameter, and filtering loaded pages on the phone would show a partial answer as the whole one. The actor's role: not in the response |
| States | Skeleton (`audit` variant), offline, error with Retry, two empty states (none yet, or nothing matches the filters), footer retry; pull-to-refresh reloads the first page only. No polling; default `staleTime` |

## 11. For Ronit

1. **The page is not in the clone (§1).** If the deployed backend accepts more filters (`action`, dates, a ticket number), please pull the clone so they can be verified and added. If it does not, they are a backend ask:
   - `action`;
   - `from`/`to` on `createdAt`;
   - `ticketNumber`;
   - the actor's role (or department) in `actor`;
   - an index on `entityType`.
   Until then the app offers what the clone's endpoint supports.
2. **Action colours:** the deployed page's colours, if they should be matched. The app's are its own (UI-STANDARDS §13).
3. **`entityType` casing** (`05` B.38): "Ticket" leaves out automatic closes. A one-word backend fix.
