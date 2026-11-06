# 01 — API Contract (mobile-relevant endpoints)

> **Rule:** if an endpoint, field, query parameter or enum value is not in this file, the mobile app does not use it. **Stop and ask Ronit.**
>
> **Sources**
> - Written from the actual routers, validators (zod) and controllers in the web repo, read on 2026-10-09.
> - **Not** from Swagger: `/api/docs` covers about 95 of 300 paths and has known errors.
> - File references are relative to `backend/src/` unless prefixed.
> - **2026-11-05:** the backend team sent Ronit a written contract for AUD-1, DSH-1 and NTF-5/NTF-6. Each section below says where it agrees with the source (re-read at `7df97c8`, the clone of 2026-11-05 09:56) and where it does not, and what the app does.
>
> **Auth status:** every endpoint below except §1's public ones needs `Authorization: Bearer <token>`. **No way to obtain a token exists yet** (`02-AUTH.md`).

**Legend**
- **Any** = any authenticated role.
- **(ctrl)** = an extra rule enforced inside the controller.
- **⚠** = a defect or authorization gap. **Do not rely on it, do not exploit it** (`05-RULES-AND-GAPS.md` §C).
- **MVP / P2** = the phase in which mobile uses the endpoint (`04-SCREEN-MAP.md`).
- Each endpoint has an ID (e.g. `TKT-3`) that `04-SCREEN-MAP.md` refers to.

---

## 0. Conventions that apply to every endpoint

### 0.1 Base URL and headers
- Base: `https://<env-host>/api/v1`. **UAT only** for development (`00-OVERVIEW.md` §3).
- Request headers:
  - `Authorization: Bearer <uuid>`: capital B, one space (`middleware/auth.middleware.ts:7`).
  - `Accept: application/json`.
  - `Content-Type: application/json` for JSON bodies.
  - `multipart/form-data` for uploads; let the HTTP library set the boundary.
- **Never send cookies.** If an `sd_session` cookie is present it overrides the Bearer header (`auth.middleware.ts:7`).
- **IDs** are UUID strings. The one exception is `ticketNumber`, a human-facing integer (`#1234`), which **no endpoint accepts as a path parameter**.
- **Dates** in responses are ISO-8601 UTC strings, e.g. `"2026-10-09T08:30:00.000Z"` (Prisma `DateTime` → JSON).
  - Dates in query strings: see each endpoint.
  - The web app renders dates in the **device timezone** (`frontend/src/utils/formatDate.ts`); do the same.
- **Rich text:** ticket `description` and comment `body` are **HTML strings**. They may contain inline base64 `data:` images and `cid:` references.
  - Sanitise before rendering (`05` §A).
  - Never *produce* base64 images: the JSON body limit is **2 MB** (`app.ts:76`).

### 0.2 Error envelope
Every error body is JSON `{ "error": string }`, with these exceptions noted below (`middleware/errorHandler.middleware.ts`).

| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "Validation error", "details": { "<field>": ["<zod message>", …] } }` | A zod `.parse()` fails (`errorHandler.middleware.ts:12-17`). `details` is `flatten().fieldErrors`; form-level errors are dropped, so a non-object body gives `details: {}` |
| 400 | `{ "error": "<specific message>" }` | Hand-written checks (listed per endpoint) |
| 401 | `{ "error": "Unauthorized" }` / `"Session expired"` / `"Account deactivated"` | `requireAuth` (`auth.middleware.ts:10, 39, 43`). An **unknown or garbage token gets `"Session expired"`** |
| 403 | `{ "error": "Forbidden: insufficient role" }` | Route role guard (`middleware/rbac.middleware.ts:14`) |
| 403 | `{ "error": "Forbidden" }` | Controller ownership check |
| 404 | `{ "error": "<Thing> not found" }` | Controller lookups |
| 429 | Login: `{ "error": "Too many login attempts. Try again in 15 minutes." }`. Everything else: express-rate-limit **default body (plain text, not JSON)** | Rate limits (§0.4) |
| 500 | `{ "error": "Internal server error" }` | **Everything else.** Includes Prisma "not found" on update (P2025), unique conflicts (P2002), bad foreign keys (P2003), multer upload errors (file too large, blocked extension, too many files), malformed JSON, bodies over 2 MB, and non-numeric `page`/`limit` |

**Client rule:** map 500 to "Something went wrong". Never auto-retry non-GET requests (`02-AUTH.md` §5.3).

### 0.3 Pagination: four shapes, one adapter
| Shape | Request | Response | Used by (in this file) |
|---|---|---|---|
| **(a) Standard** (`utils/pagination.ts:16-37`) | `?page=` (default 1, min 1), `?limit=` (default **25**, clamped 1–**100**) | `{ data: T[], total, page, limit, totalPages, hasNext, hasPrev }`. `totalPages = ceil(total/limit)` (0 when empty) | TKT-1, NTF-1, KB-2, AUD-1 (G8) |
| **(b) Hand-rolled** | `?page=&limit=`, **limit uncapped** | `{ data: T[], total, page, limit }` | APR (list), SCR-4 |
| **(c) Ticket activity** | `?page=&pageSize=` (default 50, max 100) | `{ items, auditTotal, page, pageSize, auditPages }` | TKT-7 |
| **(d) Plain array** | none | `T[]` | comments, attachments, tasks, categories, teams, users/search, … |

**Rules**
- `page=abc` or `limit=abc` gives `NaN`, which crashes Prisma and returns **500**. Always send integers.
- `GET /tickets` reads **`limit`**. The web client sends `pageSize`, which is **ignored** (§2, TKT-1).
- Build one `normalisePage<T>()` adapter in the mobile API layer that returns `{ items, page, hasNext, total }` for shapes (a), (b) and (c).

### 0.4 Rate limits (`app.ts:87-102, 122-124`)
- **Login:** 20 requests per 15 min per IP.
- **All `/api/v1/*` except matched `/auth/*` routes:** 300 requests/min, keyed by the `sd_session` cookie, **otherwise by IP**.
  - Every Bearer client behind the same NAT shares one bucket (backend ask A14).
  - Keep polling conservative: the unread count no more often than every 60 s in the foreground, and never in the background.

### 0.5 HTML traps (production only, `app.ts:167-178`)
- Unknown **GET** under `/api/v1`: **200 `text/html`** (the SPA's `index.html`).
- Unknown POST/PUT/DELETE: Express's default **HTML 404**.
- **Client rule:** reject any response whose `content-type` contains `text/html`, as the web client does (`frontend/src/api/client.ts:20`).

### 0.6 Web-client calls that are dead or wrong: never copy them
Each web `api/*.api.ts` function was checked against the backend routers. File paths are under `frontend/src/`.

| # | Web call | Problem | Correct call (if any) |
|---|---|---|---|
| 1 | `GET /attachments?ticketId=` (`api/tickets.api.ts:75-76`) | No `/api/v1/attachments` mount | ATT-1 |
| 2 | `POST /tickets/:id/link-problem`, `DELETE /tickets/:id/link-problem/:problemId` (`api/tickets.api.ts:79-83`) | Route does not exist | (out of scope) `POST /problems/:id/link-ticket` |
| 3 | `POST /tickets/:id/link-change`, `DELETE /tickets/:id/link-change/:changeId` (`api/tickets.api.ts:85-89`) | Route does not exist | (out of scope) `POST /changes/:id/link-ticket`. ⚠ That call **force-closes the ticket** |
| 4 | `GET /announcements/:id` (`api/announcements.api.ts:6`) | No such route | ANN-1 |
| 5 | `POST /surveys/:id/respond` (`api/surveys.api.ts:11-12`) | Wrong path | (out of scope) `POST /surveys/:id/responses` |
| 6 | `PUT /tickets/:id { status }` (Kanban, `pages/tickets/KanbanPage.tsx:159-161`) | `status` is silently stripped; 200 with no change | TKT-6 |
| 7 | `PUT /service-catalog/requests/:id { status }` (`api/service-catalog.api.ts:21-22`) | `status` is stripped | (out of scope) `POST /service-catalog/requests/:id/status` |
| 8 | `PUT/DELETE /cab/:id` with the CAB **member** id (`api/cab.api.ts:14-15`) | The backend expects a **user** id | (out of scope) |
| 9 | `GET /tickets?pageSize=…` (5 pages) | `pageSize` is ignored; the backend reads `limit` | TKT-1 with `limit` |
| 10 | `GET /kb/articles?search=…` (`pages/kb/KBPage.tsx:26`, `pages/portal/PortalPage.tsx:28`) | `search` is ignored | KB-3 `GET /kb/search?q=` |
| 11 | `GET /teams?page&pageSize&search` (`api/teams.api.ts:5`) | Only `countryId` is read | LKP-2 |
| 12 | `POST /tickets/:id/tasks { dueDate: 'YYYY-MM-DD' }` | 400: `dueDate` must be a full UTC ISO string | TSK-2 with `toISOString()` |

---

## 1. Auth

> **Sign-in endpoints.** AUTH-P2 (Microsoft) is deployed on UAT with a confirmed contract (`02-AUTH.md` §7.5). AUTH-P1 (email and password) is reported deployed on UAT, but its contract is **⚠ ASSUMED, not verified against source** (AUTH-P1 below; `02-AUTH.md` §8). The other pending endpoints are listed in §1.4 so that nobody invents their own.

### SYS-1 `GET /health` — MVP
- **Purpose:** connectivity and maintenance check, e.g. on app start or after a network error.
- **Path:** outside `/api/v1`: `https://<host>/health`.
- **Auth:** none. Not rate-limited.
- **200:** `{ "status": "ok", "ts": "<ISO>" }`.
- **Source:** `app.ts:111`.
- **Note:** the deployment guide's `/api/health` is not a route; in production it returns the SPA HTML.

### AUTH-1 `GET /api/v1/auth/config` — MVP
- **Purpose:** tells the login screen which methods are enabled.
- **Auth:** none. Not rate-limited (matched auth route).
- **Params / body:** none.
- **200:** `{ "microsoftEnabled": boolean, "localAuthEnabled": boolean }`
  - `microsoftEnabled` = Entra client ID, secret and tenant are all configured (`modules/auth/msal.config.ts:8-10`).
  - `localAuthEnabled` = `LOCAL_AUTH_ENABLED==='true' || REDIS_URL==='redis://mock' || NODE_ENV==='development'`.
- **Errors:** none in code.
- **Source:** `modules/auth/auth.router.ts:15`, `modules/auth/auth.controller.ts:226-232`.
- **Mobile:** decide which buttons to show. `microsoftEnabled` describes the **web** SSO; the mobile SSO (A2) will need its own flag once it ships.

### AUTH-2 `GET /api/v1/auth/me` — MVP
- **Purpose:** the current user, for app start-up and session validation.
- **Auth:** Bearer; any role.
- **200:**
  ```json
  { "user": { "id": "uuid", "email": "string", "displayName": "string",
              "role": "ADMIN|AGENT|END_USER|L2_MANAGER",
              "ldapSamAccount": "string|null", "countryId": "string|null" } }
  ```
  - The data comes from the Redis session cache, so it may be stale up to the session TTL after a profile, role or country change (`auth.middleware.ts:24-27`).
  - It does **not** include department, phone, timezone, avatarUrl, teams or `mustChangePassword`.
- **Errors:** the 401s in §0.2.
- **Source:** `auth.router.ts:10`, `auth.controller.ts:60-65`, `auth.middleware.ts:46-53`.

### AUTH-3 `POST /api/v1/auth/logout` — MVP
- **Purpose:** invalidate the session server-side.
- **Auth:** **not** behind `requireAuth`. Reads the token from the cookie, otherwise `Authorization: Bearer`. Not rate-limited.
- **Body:** none.
- **200 always:** `{ "message": "Logged out" }`, even without a token.
- **Side effects:** deletes the `sessions` row(s) with that token and Redis `session:<token>`; clears the cookie (`modules/auth/auth.service.ts:110-115`).
- **Errors:** 500 if the DB or Redis throws.
- **Source:** `auth.router.ts:9`, `auth.controller.ts:51-58`.
- **Mobile:** call it, ignore its result, then wipe local state (`02-AUTH.md` §5.5).

### 1.4 PENDING — not in the API yet (do not call until shipped; shape to be agreed)
| ID | Endpoint | Ask | Proposed response |
|---|---|---|---|
| AUTH-P1 | Email and password sign-in. **⚠ ASSUMED, called by the app on UAT builds since 2026-11-05:** see "AUTH-P1" below | A1, A32 | Several shapes tolerated (below) |
| AUTH-P2 | `POST /api/v1/auth/microsoft/mobile` `{ idToken }`. **Deployed on UAT, contract confirmed** (`02-AUTH.md` §7.5) | A2 | `{ token, expiresAt, user }`, no cookie |
| AUTH-P3 | `POST /api/v1/auth/refresh` | A3 | `{ token, expiresAt }` |
| ~~AUTH-P4~~ | ~~`POST /api/v1/devices`, `DELETE /api/v1/devices/:token`~~ **Superseded in G7 (2026-11-02)** by NTF-5 / NTF-6 (`/notifications/device-token`, §9, confirmed in writing 2026-11-05), as specified in Ronit's MOBILE-BACKEND-REQUIREMENTS.md §1.5 | A5 | see §9 |
| AUTH-P5 | `GET /api/v1/tickets/by-number/:ticketNumber` | A8 | same as TKT-3 |

### AUTH-P1 email and password sign-in — ⚠ ASSUMED, NOT VERIFIED AGAINST SOURCE (2026-11-05)
> **Why assumed.** On 2026-11-05 the backend team told Ronit that a mobile password-login endpoint is deployed on UAT, with local auth on there. Its source has not been pushed: no branch of the web clone has it, neither the clone fetched 2026-11-04 16:36 nor the fresh one of 2026-11-05 09:56 (`master` `7df97c8`) (`docs/G9-PASSWORD-LOGIN.md`). Ronit authorised the four assumed paths in writing (G9 brief, 2026-11-05), under CLAUDE.md rule 1. **Nothing below is from source.** It is what the app sends, and what it accepts. Confirm it with the backend team (ask A32), then replace this entry with the real contract.

- **Code:** every wire name is in `src/types/mobile-password-contract.ts`. The call is `signInWithPassword()` in `src/api/auth.api.ts`.
- **Builds:** UAT only (`EMAIL_SIGN_IN_ENABLED`, `src/config/env.ts`). Production builds never call it.
- **Auth:** none. Sent without `Authorization` and without cookies.
- **Paths, tried in this order;** the next only after a **404 with an HTML body** (Express's "Cannot POST", §0.5):
  1. `POST /api/v1/auth/mobile/login`
  2. `POST /api/v1/auth/login/mobile`
  3. `POST /api/v1/auth/mobile`
  4. `POST /api/v1/auth/login`: the clone's web login (§1.5), in case a token was added to its body.
  - Any JSON answer means the route exists: the app stops and reports it. The app remembers that path for the rest of the run; a 429 is not remembered.
- **Body:** `{ "username": "<email>", "email": "<email>", "password": "<password>" }`: one input under both names. The clone reads `username`, A32 proposed `email`.
- **200 accepted.** Any other field is ignored.
  - **REQUIRED:** a token under `token`, `accessToken` or `sessionToken`; then `user.id`, and `user.role` (one of the four values).
  - **Optional:** `user.email` (the typed email stands in), and the name under `user.name`, `user.displayName` or `user.fullName` (the email stands in). Also the expiry under `expiresAt`, `expires_at` or `expiry`: unused, the 8-hour clock applies. Also `user.countryId` (string or null) and `user.ldapSamAccount`.
  - **`user.countryId` missing:** the app calls AUTH-2 with `Bearer <new token>` before completing. If AUTH-2 fails or disagrees, the sign-in is refused and the app sends AUTH-3 for that token (`02-AUTH.md` §8.4).
- **Errors, as the app maps them** (`02-AUTH.md` §8.6):
  - 400 `bad-request`; 401 `credentials-rejected`, showing the server's message unless it says which field was wrong; 403 `account-disabled`;
  - any other JSON 4xx is `refused`; 429 is `rate-limited`; 5xx is `server`;
  - all four paths answering HTML 404 is `unavailable`; a 2xx without a token is `no-token`.
- **Rate limit:** unknown for the new route. On `/auth/login`, the clone's login limiter allows 20 per 15 minutes per IP (§0.4).
- **To confirm:** the list in `02-AUTH.md` §8.7. How to read it off a device: `02-AUTH.md` §8.8.

### 1.5 Reference only — exists, but mobile must NOT call it
| Endpoint | Why not | Source |
|---|---|---|
| `POST /api/v1/auth/login` `{ username, password }` → `200 { user:{id,email,displayName,role} }` + `Set-Cookie sd_session` | No token in the body. Errors: `400 "Username and password are required"`, `401 "<raw message>"`, `429`. **Exception since 2026-11-05:** AUTH-P1's last fallback path (above), in case a token was added to its body. A 200 without one is `no-token`. Its cookie cannot reach the native jar: `withCredentials: false` makes React Native's Android networking use `CookieJar.NO_COOKIES` (`02-AUTH.md` §5.2) | `auth.controller.ts:22-49` |
| `GET /api/v1/auth/microsoft`, `GET /api/v1/auth/microsoft/callback` | Web confidential-client redirect flow; ends on the web domain with a cookie | `auth.controller.ts:101-224` |
| `POST /api/v1/auth/test-login` | Selenium skeleton key (`x-test-secret`). Never ship its secret. It checks **no password**, signs in any user and sets the cookie. On `fix/phase0-1-security` it also needs `TEST_AUTH_ENABLED=true`. **Not a password sign-in, and not a way in for a reviewer** (`docs/G9-PASSWORD-LOGIN.md` §6) | `app.ts:117`, `auth.controller.ts:67-97` (`:68-106` on `fix/phase0-1-security`) |

**Re-checked 2026-11-04 (G9), on every branch fetched by 2026-11-02; again on 2026-11-05 on a fresh clone with the same commits:**
- `POST /auth/login` is unchanged: the token only as the cookie, the body `{ user }`.
- No route in the source returns a token for an email and password. The one on UAT (AUTH-P1, above) is not in the source.
- On PROD, `GET /auth/config` reports `localAuthEnabled: false`.
- The sources are in `docs/G9-PASSWORD-LOGIN.md`.

---

## 2. Tickets

**Router:** `modules/tickets/tickets.router.ts`, mounted at `/api/v1/tickets` (`app.ts:129`).
**Files:** controller `modules/tickets/tickets.controller.ts` (**ctrl**), validator `modules/tickets/tickets.validator.ts` (**val**).
**Path IDs:** every `:id` is the ticket **UUID**. A ticket number gives 404 (500 on assign). For number lookup see TKT-1 `search` and `05` §B.

**Ticket response object** (`TicketDTO`, see `03-DATA-MODEL.md`)
- All Ticket scalars, plus `TICKET_INCLUDE` (verbatim, ctrl:31-50):
```ts
const TICKET_INCLUDE = {
  requester: { select: { id: true, displayName: true, email: true, avatarUrl: true, phone: true, department: true, timezone: true, role: true, countryId: true } },
  assignedTo: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
  team: { select: { id: true, name: true } },
  country: { select: { id: true, name: true, displayName: true } },
  category: {
    select: {
      id: true, name: true, level: true, parentId: true,
      parent: {
        select: {
          id: true, name: true, level: true, parentId: true,
          parent: { select: { id: true, name: true, level: true } },
        },
      },
    },
  },
  slaPolicy: { select: { id: true, name: true } },
  _count: { select: { comments: true, attachments: true } },
  tasks: { include: { assignedTo: { select: { id: true, displayName: true, email: true } } }, orderBy: { sortOrder: 'asc' as const } },
};
```
- TKT-3 replaces `slaPolicy` with the **full** SLAPolicy row.
- TKT-1 additionally merges `lastRequesterReplyAt` through raw SQL (null if that query fails).

**Validator** (verbatim, val:1-47; zod strips unknown keys):
```ts
const optionalUuid = z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional());
const optionalId   = z.preprocess((val) => (val === '' ? null : val), z.string().nullable().optional());

export const createTicketSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(1),
  priority: z.nativeEnum(TicketPriority).default('MEDIUM'),
  impact: z.nativeEnum(TicketImpact).optional(),
  urgency: z.nativeEnum(TicketUrgency).optional(),
  source: z.nativeEnum(TicketSource).default('WEB_FORM'),
  categoryId: optionalUuid,
  teamId: optionalUuid,
  assignedToId: optionalUuid,
  slaPolicyId: optionalUuid,
  countryId: optionalId,
  level: z.string().optional(),
  mode: z.string().optional(),
  tags: z.array(z.string()).default([]),
  requesterId: z.preprocess((val) => (val === '' ? undefined : val), z.string().uuid().optional()),
  customFields: z.record(z.unknown()).optional(),
});

export const updateTicketSchema = createTicketSchema.partial().omit({ source: true }).extend({
  resolution: z.string().optional(),
});

export const changeStatusSchema = z.object({
  status: z.nativeEnum(TicketStatus),
  reason: z.string().optional(),
});

export const assignTicketSchema = z.object({
  assignedToId: optionalUuid,
  teamId: optionalUuid,
});
```

### TKT-1 `GET /api/v1/tickets` — MVP
- **Purpose:** the role-scoped, filtered, paginated ticket list (My tickets, queues, search).
- **Auth:** any. Scoping is applied through the query `where`; there is no 403 (ctrl:57-86).

| Role | Sees |
|---|---|
| END_USER | `requesterId = me` |
| AGENT | `assignedToId = me` OR `teamId ∈ my teams` OR (`assignedToId = null` if my email is in env `TRIAGE_USER_EMAILS`) |
| L2_MANAGER | `requesterId = me` OR `teamId ∈ my teams` OR `assignedToId ∈ members of my teams` |
| ADMIN | everything |

- **Query** (all optional; exact parsing, ctrl:52-161):

| Param | Parsing |
|---|---|
| `page`, `limit` | Shape (a): default 1 / **25**, limit max **100**. **`pageSize` is ignored.** |
| `status` | Single value, or comma list (`OPEN,IN_PROGRESS`) → `in`. Not validated: an unknown value gives 500 |
| `priority`, `impact`, `urgency` | Single enum value, exact match |
| `assignedToId` | A user UUID, or the literal `unassigned` (→ `assignedToId = null`) |
| `teamId`, `categoryId` | Exact UUID match. `categoryId` does not include children |
| `requesterId` | Exact match; ignored for END_USER |
| `sla` | `WITHIN_SLA` \| `DUE_SOON` \| `BREACHED` |
| `fromDate`, `toDate` | `YYYY-MM-DD` only, interpreted as **UTC** day bounds on `createdAt`. Any other format gives 500 |
| `search` | **All digits** → exact `ticketNumber` match. Otherwise case-insensitive contains on title, requester name, requester email, and assignee name |
| `countryId` | **Key present:** non-empty → strict filter on that country (tickets with null country excluded); `''` → no country filter. **Key absent:** END_USER → their profile country; others → no filter. **Ignored for L2_MANAGER** (ctrl:92-110) |
| `sortBy` | `priority` → priority desc (URGENT first); `sla` → `slaResolveDue` asc; anything else → `updatedAt` desc |

- **200:** `{ data: TicketDTO[], total, page, limit, totalPages, hasNext, hasPrev }`.
- **Errors:** 401; 500 (bad enum, date or number).
- **Source:** rtr:16, ctrl:52-183.
- **⚠ Server bugs that affect the results** (`05` §B/§C; do not work around them, do not rely on them):
  - For AGENT (no non-empty `countryId` sent) and L2_MANAGER, a **text** `search` **replaces the role scope**, so they see every matching ticket in the system (ctrl:110-113, 143).
  - END_USER: with no `countryId` key, tickets whose country differs from the profile country are hidden.
- **Mobile defaults:**
  - Always send `limit` (20–25).
  - **END_USER:** send `countryId=` (empty), so every own ticket shows regardless of country. This matches what the user expects ("my tickets"); confirm with Ronit.
  - **AGENT and ADMIN:** send the country selector value, or `countryId=` for all.
  - Never send `pageSize`.
  - The list payload is heavy, since each row includes tasks and the category chain (ask A9).
- **Mobile filters on M3** (Phase G2, as the web ticket list sends them; sources in `docs/G2-WEB-FILTERS.md`). All are **server-side**: the app filters nothing on the device. They are ANDed by the server with the role scope, the country, the named filter (`status`, `sla`, `assignedToId`), `search` and `sortBy`, in **one** request per page (`src/utils/ticket-filters.ts` `ticketListQuery`).

| Filter | Parameter and value | Who | Options from |
|---|---|---|---|
| Priority | `priority=LOW\|MEDIUM\|HIGH\|URGENT`, one value | every role | the 03 enum, in that order |
| Category | `categoryId=<top-level category id>`. **Exact match: tickets filed under its sub-categories or items do not match**, as on the web (web defect W-G2-1) | every role | LKP-1 `flat=true`, `level` CATEGORY (or none), sorted by name |
| Created date | `fromDate=YYYY-MM-DD` and/or `toDate=YYYY-MM-DD`: the device's calendar day, read by the server as a UTC day on `createdAt`, both ends inclusive. Nothing else is ever sent (any other format is a 500). **G7:** a Home tile also sets both, from the Home period, as the web's dashboard links do: UTC days of the device clock (`FE:pages/dashboard/DashboardPage.tsx:72-86`; `src/utils/dashboard-period.ts` `periodListDates`; `docs/G7-PERIOD-APPROVALS-PUSH.md` §1) | every role | the system date picker, or a Home tile |
| Technician | `assignedToId=<user id>` | ADMIN, AGENT | USR-3 `role=AGENT` (the web lists active AGENTs) |
| Group | `teamId=<team id>` | ADMIN, AGENT | LKP-2 with no `countryId`, inactive groups included (as on the web) |

  - Technician and group are never sent for END_USER or L2_MANAGER, even if set: their lookups are 403 for those roles (`permissions.ts` `ticketListFilters`).
  - One `assignedToId`: the named filters My open (`<me>`) and Unassigned (`unassigned`) win over the Technician filter, and choosing one clears the other, as the web's single select does.

### TKT-2 `POST /api/v1/tickets` — MVP
- **Purpose:** raise a ticket.
- **Auth:** any role.
- **Body:** `createTicketSchema` (above).
- **Fields mobile sends:**

| Field | END_USER | L2_MANAGER | AGENT / ADMIN |
|---|---|---|---|
| `title` (3–255) | ✅ required | ✅ | ✅ |
| `description` (HTML, min 1) | ✅ required | ✅ | ✅ |
| `categoryId` (deepest selected level) | ✅ (client-required; `05` §A) | ✅ | ✅ |
| `source` | `"API"` (pending A15 / Ronit) | `"API"` | `"API"` |
| `impact`, `urgency` | ❌ never (web strips them) | ✅ optional | ✅ optional |
| `teamId`, `assignedToId` | ❌ never | ❌ never (G5: the web's lists are a 403 for L2) | ✅ optional |
| `requesterId` (raise on behalf) | ❌ never (server ignores it for END_USER) | ❌ never (G5) | ✅ optional |
| `priority`, `slaPolicyId`, `countryId`, `tags`, `customFields`, `level`, `mode` | ❌ | ❌ | ❌ for MVP. `countryId`, `level` and `mode` are **ignored on create** |

- **G5:** the allow-list is per role (`CREATE_KEYS_BY_ROLE`, `src/api/tickets.api.ts`). Before G5, L2_MANAGER shared the AGENT/ADMIN keys, although no screen offered L2 a group, technician or requester (`ROLE-MATRIX.md` §14.3). A role the app does not know sends END_USER's keys.
- **G5, the priority preview:** ADMIN and AGENT see the priority the new ticket will get, read from LKP-6 by the server's own rule (next bullets). `priority` is still never sent: with both values and a matrix row the server applies the same row; otherwise it stores the default MEDIUM, which the preview says.

- **Server behaviour** (ctrl:185-469):
  - `requesterId` = the body value if the caller isn't END_USER, else the caller (`:190`).
  - **Country** = the requester's profile country; the body `countryId` is ignored (`:256-261`).
  - **Priority:** if both `impact` and `urgency` are given and a PriorityMatrix row exists, the matrix wins (`:193-201`). Otherwise the sent value, or the default `MEDIUM`.
  - **Category:** a category named exactly `Auto Category`, or none at all, triggers **keyword auto-categorisation** on title + description (`:205-253`).
  - **Auto-assignment:**
    - category default team and assignee, then the parent's;
    - then Category→Country→Technician mapping with load balancing, used when no `assignedToId` is sent;
    - then the team is switched to the assignee's team for that country (`:264-370`).
    - A team named exactly `Auto Team` counts as "not set".
  - **SLA:** the explicit policy, or the team's priority-specific policy, or the team default. Due dates are computed in business hours (`:373-385`).
  - **⚠** No field is stripped for END_USER except `requesterId` (`05` §C).
- **201:** `TicketDTO` (no `lastRequesterReplyAt` merge).
- **Errors:** `400 Validation error`; `500` (unknown requester, team or policy IDs).
- **Side effects:**
  - Audit `CREATED`, plus `ASSIGNED` (`_autoAssigned:true`) if auto-assigned.
  - Emails: requester (created), triage list (if unassigned), assignee.
  - In-app `TICKET_ASSIGNED` to the assignee.
  - Dashboard cache invalidated.
- **Mobile flow:** create → upload attachments to the new `id` (ATT-2) → navigate to detail (`05` §A).
- **Source:** rtr:17, ctrl:185-469, val:16-33.

### TKT-3 `GET /api/v1/tickets/:id` — MVP
- **Purpose:** ticket detail.
- **Auth:** any. (ctrl:476-498)
  - END_USER: own tickets only, else `403 "Forbidden"`.
  - L2_MANAGER: own, team, or team-member tickets, else `403 "Forbidden"`.
  - ⚠ AGENT and ADMIN: no check (an agent can open any ticket by ID).
- **200:** `TicketDTO`, with `slaPolicy` as the **full** SLAPolicy row (or null).
- **Errors:** `404 "Ticket not found"`, `403 "Forbidden"`.
- **Source:** rtr:18, ctrl:471-501.

### TKT-4 `PUT /api/v1/tickets/:id` — MVP (staff field edits)
- **Purpose:** edit fields: title, description, category, impact/urgency, team, assignee, tags.
- **Auth:** any. Checks run in this order (ctrl:531-560):
  1. `404 "Ticket not found"`.
  2. END_USER who is not the requester: `403 "Forbidden"`.
  3. L2_MANAGER outside their scope: `403 "Forbidden"`.
  4. Then zod.
  - `countryId` is dropped unless ADMIN or AGENT.
  - `assignedToId` is dropped for L2_MANAGER.
- **Body:** `updateTicketSchema` (all optional; no defaults applied).
  - **`status` is NOT accepted.** It is silently stripped, and the call still returns 200. Use TKT-6 for status.
  - `source`, `closureCode`, `isFcr` and `closureComments` are also stripped.
- **Fields mobile may send, by role** (mirrors the web UI; `05` §A). This is the API-layer allow-list, `UPDATE_KEYS_BY_ROLE` in `src/api/tickets.api.ts`; the screens send less (`permissions.ts` `fieldEditProblem`).
  - END_USER: `title`, `description` only (and only if the web lets them; see `05` §A).
  - AGENT / ADMIN: `categoryId`, `impact`, `urgency`, `priority` (see below), `teamId`, `assignedToId`, `tags`, `title`, `description`, `resolution`, `countryId`.
  - L2: `title`, `description`, `impact`, `urgency`, `tags`, `resolution`. **No `categoryId`** (read-only for L2 on the web, `FE:TicketDetailPage.tsx:1951`), **no `teamId`** (the web changes the group through TKT-5, a 403 for L2), no `assignedToId`, no `priority`, no `countryId`. Narrowed in G2 (ROLE-MATRIX §8 item 2).
  - **`priority`, as the web sends it** (G2, ROLE-MATRIX §8 item 11; `FE:TicketDetailPage.tsx:304-317`): ADMIN and AGENT only, **only together with an `impact` or `urgency` change**, and only when the LKP-6 matrix is loaded and has a row for the effective pair (the new value, else the ticket's own). The value is that row's priority. Never on its own, never for L2 (LKP-6 is a 403 for L2, so the web never sends one either). If the matrix has not loaded or has no row, the change is sent without `priority`, as on the web.
  - **Never send** `requesterId`, `slaPolicyId` or `customFields`. ⚠ The server would accept them.
- **Server behaviour:**
  - **Priority:** recomputed from the matrix when the effective impact and urgency are both set; this overrides an explicit `priority` (`:563-573`).
  - **Category change:** re-runs auto-assignment using the requester's country. The assignee is only applied if they are a member of the resolved team. This **can replace the current assignee** (`:577-673`).
  - **SLA:** priority or team change → policy and due dates recomputed from `createdAt` (`:676-693`).
  - **Manual `assignedToId` with a team set** (non-END_USER): if the user is not a team member, the server returns **400** `"Technician is not a member of the ticket's team. Please add them to the team first, or reassign the ticket to a different team."` (`:695-707`).
  - `impact` and `urgency` cannot be set to `null` (400).
- **200:** `TicketDTO`.
  - A post-update `firstResponseAt` / `slaStatus` change caused by assignment is **not** reflected in the response (`:760-772`). Refetch TKT-3 after an assignee change.
- **Errors:**
  - `404`, `403`
  - `400 Validation error`
  - `400` team-membership message (above)
  - `500`
- **Side effects:**
  - Audit `UPDATED` (title, priority, urgency, impact and category diffs, or `{updated:true}`), plus `ASSIGNED` on an assignee change.
  - Emails: new assignee; requester and assignee on an explicit priority change.
  - Dashboard cache invalidated.
  - **The `priority` key itself is what triggers two of these.** The stored priority is the matrix value whether or not `priority` is sent, but the priority line in the audit row (ctrl:719) and the "priority changed" email to the requester and the assignee (ctrl:776-784) are keyed on the body's `priority` differing from the stored one. Sending it with an impact/urgency change, as the web does, is what restores that email and the History line for a mobile edit (G2).
- **Source:** rtr:19, ctrl:531-788, val:35-37.

### TKT-5 `POST /api/v1/tickets/:id/assign` — MVP (staff)
- **Purpose:** assign or unassign a technician and/or set the team.
- **Auth:** `agentOrAdmin` (rtr:20). L2_MANAGER and END_USER get `403 "Forbidden: insufficient role"`. ⚠ No ticket scope check.
- **Body:** `assignTicketSchema`: `{ assignedToId?: uuid|null|'' , teamId?: uuid|null|'' }`.
  - `assignedToId: null` unassigns.
  - `teamId: null` **does not** clear the team.
  - With no `teamId` and an `assignedToId`, the team becomes one of the assignee's teams, chosen arbitrarily (ctrl:795-811).
  - No team-membership check (unlike TKT-4), no SLA recalculation, no `firstResponseAt`.
- **200:** `TicketDTO`.
- **Errors:** `400 Validation error`; **`500` for an unknown ticket ID** (no 404, P2025).
- **Side effects:** audit `ASSIGNED`; email and in-app `TICKET_ASSIGNED` to the assignee (if not the caller); dashboard cache invalidated.
- **Source:** rtr:20, ctrl:790-839, val:44-47.
- **Mobile:** prefer TKT-4 (`{ assignedToId, teamId }`) when the team is known. It validates team membership and sets the SLA first-response time. Use TKT-5 only for "assign to me" with no team change. Pick one and use it consistently; record the choice in the mobile code.

### TKT-6 `POST /api/v1/tickets/:id/status` — MVP (staff; END_USER limited, see `05` §A)
- **Purpose:** change status, including resolve, close or cancel with closure fields.
- **Auth:** any. (ctrl:841-847)
  - END_USER: own ticket only, else `403 "Forbidden"`.
  - ⚠ AGENT, L2 and ADMIN: no check.
- **Body:**
  ```ts
  // validated (val:39-42)
  { status: TicketStatus /* required */, reason?: string /* parsed, IGNORED */ }
  // read raw from req.body, NOT validated (ctrl:850-853) — written when != null
  { resolution?: string, closureCode?: string, isFcr?: boolean, closureComments?: string,
    teamId?: string, categoryId?: string, assignedToId?: string }
  ```
  - **Mobile sends only** `{ status, resolution?, closureCode?, isFcr?, closureComments? }`, exactly as the web does (`frontend/src/pages/tickets/TicketDetailPage.tsx:518-520`).
  - Never send `teamId`, `categoryId` or `assignedToId` here: they bypass every check.
- **⚠ No transition rules exist on the server.** Any status → any status, and closure fields are never required. **The mobile app must enforce the web's transition map and closure rules itself** (`05` §A).
- **Server side effects** (ctrl:861-990):
  - **SLA hold.** Hold statuses = `ON_HOLD, PENDING, PENDING_MGMT_REVIEW, PENDING_MASTER_DATA, PENDING_PARTNER, PENDING_USER_CONFIRM, PENDING_USER_INFO`.
    - Entering a hold sets `slaHoldStartedAt`.
    - Leaving a hold adds the wall-clock duration to `slaResolveDue` (and to `slaResponseDue` if there has been no first response) and to `slaHoldMinutes`, then clears `slaHoldStartedAt`.
  - `RESOLVED`: sets `resolvedAt` once and may clear a false breach.
  - `CLOSED`: sets `closedAt` once, and `resolvedAt` if missing.
  - Reopening does **not** clear either timestamp.
  - `closureComments` (non-blank) becomes a **PUBLIC comment** by the caller. It is created after the update, so `_count.comments` in the response is one short.
  - Audit `STATUS_CHANGED` (`{status: old}` → `{status: new}`).
  - Emails to the requester:
    - status-changed, or resolved;
    - also a closed email on CLOSED;
    - also a pending-reason email on hold statuses (so the requester gets **2 emails**).
    - On reopen (RESOLVED/CLOSED → OPEN/IN_PROGRESS): email to the assignee.
  - In-app:
    - requester: `TICKET_RESOLVED` or `TICKET_UPDATED`;
    - assignee: `TICKET_UPDATED`.
  - Dashboard cache invalidated.
- **200:** `TicketDTO`.
- **Errors:** `400 Validation error` (unknown status), `404 "Ticket not found"`, `403 "Forbidden"`, `500`.
- **Source:** rtr:21, ctrl:841-994, val:39-42.

### TKT-7 `GET /api/v1/tickets/:id/activity` — MVP
- **Purpose:** the merged timeline of comments and history for the detail screen.
- **Auth:** any. ⚠ **No ticket access check for any role.** An unknown ticket gives `200` with empty items. Mobile must only call it for a ticket the user could open with TKT-3.
- **Query:** `page` (default 1), `pageSize` (default **50**, max 100). Shape (c).
- **200:**
  ```ts
  { items: ActivityItem[], auditTotal: number, page: number, pageSize: number, auditPages: number }
  ```
  - `items` are sorted by `createdAt` **desc**.
  - **Comments are NOT paginated:** every comment is returned on **every** page. Only the audit entries page. De-duplicate comments by `id` when loading page 2+.
  - `_type: 'comment'`: comment scalars (incl. `toRecipients`, `ccRecipients`) + `author{id,displayName,email,avatarUrl}` + `attachments[{id,fileName,mimeType,storagePath}]`.
    - END_USER gets PUBLIC comments only.
    - **L2_MANAGER sees PRIVATE notes here**, unlike CMT-1.
  - `_type: 'audit'`: `{ id, ticketId, actorId, action, entityType, entityId, oldValues, newValues, ipAddress, createdAt, actor:{id,displayName}|null }`.
    - UUID values inside `oldValues`/`newValues` are enriched with `_<key-without-Id>Name`, e.g. `_assignedToName`, `_teamName`, `_categoryName`, `_countryName`, `_requesterName` (ctrl:1036-1082).
    - END_USER sees **all** audit entries.
- **Source:** rtr:22, ctrl:996-1096.
- **Mobile:** render audit items as sentences using the web's mapping (`05` §A). Do not show `ipAddress`.

### TKT-8 `GET /api/v1/tickets/:id/sla` — P2
- **Auth:** any. ⚠ No access check.
- **200:** `{ slaStatus, slaResponseDue, slaResolveDue, firstResponseAt, resolvedAt, slaBreachedAt, policy: SLAPolicy|null }`. It does **not** include `slaHoldStartedAt` / `slaHoldMinutes`, which are on TKT-3.
- **Errors:** `404 "Ticket not found"`.
- **Source:** rtr:23, ctrl:1098-1114.
- **Mobile:** TKT-3 already has all the SLA fields; this call is optional.

### TKT-9 `GET /api/v1/tickets/:id/email-recipients` — MVP (staff reply-all)
- **Purpose:** pre-fill To and CC for a public reply.
- **Auth:** any. ⚠ No access check. **Mobile calls it only for ADMIN, AGENT and L2 users** (the web uses it for Reply-All).
- **200:** `{ to: string[] /* 0 or 1 */, cc: string[], from: string }`.
  - `to` = the original inbound sender (or the requester's email).
  - `cc` = every other address seen on the thread, minus the service mailbox.
  - An unknown ticket gives `200 {to:[],cc:[],from:''}`.
- **Source:** rtr:24, ctrl:1119-1169.

### TKT-10 `GET /api/v1/tickets/:id/suggested-assignees` — MVP (staff)
- **Purpose:** technicians mapped to this ticket's category and country, shown first in the assignee picker.
- **Auth:** any. Mobile calls it for ADMIN and AGENT only.
- **200:** `[{ id, displayName, email, avatarUrl }]`, de-duplicated, unordered.
  - `[]` if the ticket has no country or category.
  - Exact-country mappings only ("All Sites" rows are not included).
  - **Inactive users are not filtered out.**
- **Errors:** `404 "Ticket not found"`.
- **Source:** rtr:25, ctrl:503-529.

### Not in the tickets router
- No bulk update, merge, watchers, export or link-problem/link-change routes exist.
- The web's CSV export pages through TKT-1 with `limit=100` on the client.

---

## 3. Comments

Mounted at `/api/v1/tickets/:ticketId/comments` (`modules/tickets/tickets.router.ts:12`; `Router({ mergeParams: true })` at `modules/comments/comments.router.ts:5`). Every route is `requireAuth` only; there are no role guards.

**Comment response object** (`CommentDTO`, see `03-DATA-MODEL.md`)
```ts
{ id, ticketId, authorId, body /*HTML*/, type: 'PUBLIC'|'PRIVATE', isEdited, toRecipients: string[], ccRecipients: string[],
  createdAt, updatedAt,
  author: { id, displayName, email, avatarUrl|null },
  attachments?: Attachment[] }   // only on CMT-1
```

### CMT-1 `GET /api/v1/tickets/:ticketId/comments` — MVP
- **Purpose:** the ticket conversation (replies and internal notes).
- **Auth:** any.
  - (ctrl) END_USER and L2_MANAGER see only `type: 'PUBLIC'`; ADMIN and AGENT see PUBLIC and PRIVATE (`modules/comments/comments.controller.ts:24`).
  - ⚠ There is **no check that the caller may access the ticket**. Mobile must only call it for tickets the user reached through TKT-1 or TKT-3.
- **Path:** `ticketId` (uuid). **Query:** none. **Not paginated.**
- **200:** `CommentDTO[]` **newest first** (`orderBy createdAt desc`, `:27`), each with:
  - `author{id,displayName,email,avatarUrl}`;
  - `attachments: Attachment[]` (full rows including `storagePath`; attachment order unspecified);
  - `toRecipients`/`ccRecipients` read through raw SQL, which become `[]` if those columns are missing (`:31-45`).
- **Unknown ticket:** `200 []`.
- **Errors:** 401, 500.
- **Source:** `comments.router.ts:7`, `comments.controller.ts:19-48`.
- **Mobile:** TKT-7 (activity) already contains the comments interleaved with history. Use CMT-1 only if you need recipients and attachments without audit entries.

### CMT-2 `POST /api/v1/tickets/:ticketId/comments` — MVP
- **Purpose:** post a public reply (emails recipients) or a private internal note.
- **Auth:** any.
  - (ctrl) **END_USER and L2_MANAGER are silently forced to `PUBLIC`** (`:55-56`).
  - ⚠ The handler checks only that the ticket exists, not that the caller may access it.
- **Body** (zod, verbatim, `comments.controller.ts:11-17`):
  ```ts
  z.object({
    body: z.string().default(''),
    type: z.nativeEnum(CommentType).default('PUBLIC'),          // 'PUBLIC' | 'PRIVATE'
    cc: z.array(z.string().email()).optional().default([]),
    to: z.array(z.string().email()).optional().default([]),
    attachmentIds: z.array(z.string()).optional().default([]),
  })
  ```
  - The server accepts an empty `body`. The **client** must block sending an empty body with no files (`05` §A).
- **201:** the created comment with `author{id,displayName,email,avatarUrl}`, `toRecipients`, `ccRecipients`. **`attachments` are NOT included**; refetch to see them.
- **Errors:**
  - `400 Validation error` (e.g. a non-email in `to`/`cc`)
  - `404 "Ticket not found"`
  - `500` (possible **after** the comment was created, if the audit write fails)
- **Side effects:**
  - Audit `COMMENTED`.
  - **PUBLIC only:**
    - Sets `firstResponseAt` if this is the first public reply by a non-requester (SLA response clock, `:62, 92-94`).
    - Sets `lastRequesterReplyAt` (requester) or clears it (anyone else) (`:96-100`).
    - Builds the recipient list: request `to`/`cc` + the original inbound email's from/to/cc + the requester (if still empty and the author is not the requester) + **always** the assignee, minus the service mailbox.
    - Sends a reply-all email `Re: [Ticket #N] <title>`.
    - Creates in-app notifications (`COMMENT_ADDED`) for the requester and the assignee.
  - **Attachment linking** (`:169-175`): files in `attachmentIds` are linked to the comment **only for PUBLIC comments that end up with at least one email recipient**. For PRIVATE notes they stay on the ticket unlinked (`05` §B).
- **Source:** `comments.router.ts:8`, `comments.controller.ts:50-281`.
- **Mobile flow:** upload files first (ATT-2), then POST the comment with the returned IDs in `attachmentIds` (`05` §A).

### CMT-3 `PUT /api/v1/tickets/:ticketId/comments/:commentId` — P2
- **Purpose:** edit the body of your own comment.
- **Auth:** any. (ctrl) **author or ADMIN** only, else `403 "Forbidden"` (`:287`). `:ticketId` is ignored.
- **Body:** `{ body: string (min 1) }`. It is validated **after** the 404/403 checks (`:289`). `type`, `to`, `cc` and attachments cannot change.
- **200:** the comment scalars + `author{id,displayName,email}` (**no `avatarUrl`, no attachments**); `isEdited: true`.
- **Errors:** `404 "Comment not found"`, `403 "Forbidden"`, `400 Validation error`.
- **Side effects:** none: no audit, no email.
- **Source:** `comments.router.ts:9`, `comments.controller.ts:283-296`.

### CMT-4 `DELETE /api/v1/tickets/:ticketId/comments/:commentId` — P2
- **Auth:** author or ADMIN (`:302`).
- **200:** `{ "message": "Comment deleted" }`.
- **Errors:** `404 "Comment not found"`, `403 "Forbidden"`.
- **Side effects:** linked attachment rows are cascade-deleted (their files stay on disk). No audit.
- **Source:** `comments.router.ts:10`, `comments.controller.ts:298-306`.

---

## 4. Attachments

Mounted at `/api/v1/tickets/:ticketId/attachments` (`tickets.router.ts:13`; `mergeParams` at `modules/attachments/attachments.router.ts:6`). `requireAuth` only.

**Attachment object** (full Prisma row; no endpoint uses a `select`)
```ts
{ id, ticketId: string|null, commentId: string|null, uploaderName: string, fileName: string,
  mimeType: string /* client-declared */, sizeBytes: number, storagePath: string /* server disk path — ignore */, createdAt }
```

### ATT-1 `GET /api/v1/tickets/:ticketId/attachments` — MVP
- **Auth:** any. (ctrl) END_USER must be the ticket requester, else `403 "Forbidden"` (`modules/attachments/attachments.controller.ts:29-31`).
- **200:** `Attachment[]`, `createdAt desc`, including comment-linked files. Not paginated.
- **Errors:** `404 "Ticket not found"`, `403 "Forbidden"`.
- **Source:** `attachments.router.ts:8`, `attachments.controller.ts:24-37`.

### ATT-2 `POST /api/v1/tickets/:ticketId/attachments` — MVP
- **Purpose:** upload 1–10 files.
- **Auth:** any. ⚠ No ownership check (any role can upload to any existing ticket).
- **Request:** `multipart/form-data`. **Field name `files`**, repeated once per file, at most **10**.
  - React Native: `form.append('files', { uri, name, type })`.
  - Optional query `?commentId=<uuid>` links the files to an existing comment. It is unvalidated: a bad ID gives 500. Prefer `attachmentIds` on CMT-2.
- **Limits** (`middleware/upload.middleware.ts:7-45`):
  - Per file: `MAX_UPLOAD_SIZE_MB`, default **50 MB**. IIS may cap requests lower, at about 28.6 MB by default (`00` BLOCKER B6).
  - Blocked extensions: `.exe .bat .cmd .sh .php .py .js`, case-insensitive. This is an extension check only.
  - **Every limit violation returns `500 "Internal server error"`.** The client cannot tell why, so **validate size, count and extension on the device before uploading.** Recommended client cap until B6 is resolved: 25 MB per file.
- **201:** `Attachment[]`, one per file, in upload order.
- **Errors:**
  - `400 "No files uploaded"`
  - `404 "Ticket not found"`
  - `500` (limits; bad `commentId`)
- **Side effects:** files are written to `<UPLOAD_DIR>/<ticketId>/<uuid><ext>`; audit `ATTACHMENT_ADDED` (`newValues: { count, files }`).
- **Source:** `attachments.router.ts:9`, `attachments.controller.ts:70-108`.

### ATT-3 `GET /api/v1/tickets/:ticketId/attachments/:attachmentId/view` — MVP
- **Purpose:** show an image or PDF inline.
- **Auth:** any. (ctrl) END_USER must be the requester of the attachment's ticket (`:129-136`).
- **200:** binary stream.
  - `Content-Type: <stored mimeType || application/octet-stream>`
  - `Content-Disposition: inline; filename="<urlencoded name>"`
  - `Cache-Control: private, max-age=3600`
  - No `Content-Length`.
- **Errors:** `404 "Attachment not found"`, `403 "Forbidden"`, `404 "File not found on disk"`.
- **Source:** `attachments.router.ts:12`, `attachments.controller.ts:127-144`.
- **Mobile:**
  - Send the Bearer header (`expo-image` `source={{ uri, headers }}`).
  - Only render inline for `image/*` and `application/pdf`. Never render `text/html` or `image/svg+xml` from an attachment in a WebView (`05` §C).

### ATT-4 `GET /api/v1/tickets/:ticketId/attachments/:attachmentId/download` — MVP
- **Purpose:** download a file for sharing or opening elsewhere.
- **Auth and errors:** same as ATT-3.
- **200:** Express `res.download`: `Content-Disposition: attachment; filename="<fileName>"`, `Content-Type` guessed from the extension.
- **Source:** `attachments.router.ts:11`, `attachments.controller.ts:110-124`.
- **Mobile:** `FileSystem.downloadAsync(url, localPath, { headers: { Authorization } })`, then the share sheet.

### ATT-5 `DELETE /api/v1/tickets/:ticketId/attachments/:attachmentId` — P2
- **Auth:** any. (ctrl) END_USER always gets `403 "Forbidden"`. ⚠ AGENT, L2 and ADMIN can delete any attachment (no ticket check).
- **200:** `{ "message": "Attachment deleted" }`.
- **Errors:** `404 "Attachment not found"`, `403 "Forbidden"`.
- **Side effects:** the file is removed from disk (best effort) and the row deleted. No audit.
- **Source:** `attachments.router.ts:13`, `attachments.controller.ts:146-157`.
- **Mobile (built in G3):** `deleteAttachment()` in `src/api/attachments.api.ts`, `useDeleteAttachment`. The delete button is shown to ADMIN, AGENT and L2_MANAGER only, matching the web (`FE:pages/tickets/TicketDetailPage.tsx:1345`). It works on any file, whoever uploaded it, in every status: the web does not apply the AGENT lock here. A request from END_USER is refused on the device and nothing is sent. The app asks "Delete <fileName>?" first. It sends only ids from this ticket's ATT-1 list, then refetches ATT-1 and TKT-3 (`_count.attachments`).

---

## 5. Ticket tasks (sub-tasks)

Mounted at `/api/v1/tickets/:ticketId/tasks` (`tickets.router.ts:14`). `requireAuth` only. ⚠ **There are no role or ticket-access checks on any task route** (`05` §C). The mobile UI must offer task editing **only to ADMIN, AGENT and L2_MANAGER**, and END_USER sees tasks read-only (see `05` §A for the web rule).

**Task object**
```ts
{ id, ticketId, title, description: string|null, assignedToId: string|null,
  status: 'OPEN'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED', dueDate: string|null, sortOrder: number,
  completedAt: string|null, createdAt, updatedAt,
  assignedTo: { id, displayName, email, avatarUrl } | null }
```
Include: `TASK_INCLUDE` (`modules/ticketTasks/ticketTasks.controller.ts:16-18`).

**Body schema** (verbatim, `ticketTasks.controller.ts:7-14`):
```ts
z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(TaskStatus).default('OPEN'),
  dueDate: z.string().datetime().optional().nullable(),   // UTC 'Z' ISO only, e.g. "2026-10-12T00:00:00.000Z"; offsets rejected
  sortOrder: z.number().int().default(0),
})
```

### TSK-1 `GET /api/v1/tickets/:ticketId/tasks` — MVP (read)
- **200:** `Task[]`, ordered `sortOrder asc`. An unknown ticket gives `[]`.
- **Source:** `ticketTasks.router.ts:7`, `ticketTasks.controller.ts:20-27`.
- **Mobile:** the task list is also embedded in TKT-3's `tasks`, so a separate call is optional.

### TSK-2 `POST /api/v1/tickets/:ticketId/tasks` — P2
- **Body:** the schema above.
- **201:** `Task`. `completedAt` is **not** set even if `status: 'COMPLETED'`.
- **Errors:** `404 "Ticket not found"` (checked before validation), `400 Validation error`, `500` (unknown `assignedToId`).
- **Source:** `ticketTasks.router.ts:8`, `ticketTasks.controller.ts:29-52`.

### TSK-3 `PUT /api/v1/tickets/:ticketId/tasks/:taskId` — MVP (status toggle) / P2 (full edit)
- **Body:** `taskSchema.partial()`. Only keys you send change; `null` clears `description`, `assignedToId` and `dueDate`.
- **`completedAt`:**
  - status → `COMPLETED` (from another status): set to now;
  - status → anything else: cleared;
  - status omitted: unchanged.
- **200:** `Task`.
- **Errors:** `404 "Task not found"`, `400`.
- **Source:** `ticketTasks.router.ts:9`, `ticketTasks.controller.ts:54-85`.

### TSK-4 `DELETE /api/v1/tickets/:ticketId/tasks/:taskId` — P2
- **200:** `{ "message": "Task deleted" }`.
- **Errors:** `404 "Task not found"`.
- **Source:** `ticketTasks.router.ts:10`, `ticketTasks.controller.ts:87-95`.

---

## 6. Users / profile

Mounted at `/api/v1/users` (`app.ts:126`).

### USR-1 `GET /api/v1/users/:id` — MVP (own profile)
- **Auth:** any. (ctrl) END_USER may only read their own id, else `403 "Forbidden"` (`modules/users/users.controller.ts:104-106`). AGENT and L2 can read anyone.
- **200:**
  ```ts
  { id, email, displayName, role, isActive, department: string|null, phone: string|null,
    timezone: string, lastLoginAt: string|null, createdAt }
  ```
  **No `countryId`, `avatarUrl` or `officeLocation`**; use AUTH-2 for `countryId`.
- **Errors:** `404 "User not found"` (checked before the 403), `403 "Forbidden"`.
- **Source:** `users.router.ts:18`, `users.controller.ts:94-109`.

### USR-2 `PUT /api/v1/users/:id` — MVP (own profile edit)
- **Auth:** any. (ctrl) non-ADMIN may only update their own id, else `403 "Forbidden"`. For non-admins, `role` and `isActive` are deleted from the body (`:127-131`).
- **Body** (zod, verbatim, `users.controller.ts:15-23`):
  ```ts
  z.object({
    displayName: z.string().min(1).optional(),
    role: z.nativeEnum(UserRole).optional(),
    department: z.string().optional(),
    phone: z.string().optional(),
    timezone: z.string().optional(),
    isActive: z.boolean().optional(),
    countryId: z.string().optional().nullable().transform(v => v === '' ? null : v),
  })
  ```
  **Mobile sends ONLY `displayName`, `phone`, `department`, `timezone`.**
  - Never send `countryId`. ⚠ The server lets non-admins change it, which changes which tickets they see; the web UI doesn't offer it.
  - `department` and `phone` cannot be set to `null` (400); send `""` to clear.
- **200:** `{ id, email, displayName, role, isActive, department, phone, timezone }`.
- **Errors:** `403 "Forbidden"`, `400 Validation error`, `500` (unknown id).
- **Side effects:** the Redis session cache is **not** updated, so AUTH-2 keeps returning the old `displayName` until re-login. Update the local store from this response.
- **Source:** `users.router.ts:19`, `users.controller.ts:123-139`.

### USR-3 `GET /api/v1/users/search` — MVP (staff only)
- **Purpose:** typeahead for the assignee picker and "raise on behalf of" requester picker, and the M3 Technician filter (`role=AGENT`, the same people the web's technician list holds; G2).
- **Auth:** `agentOrAdmin`: **ADMIN, AGENT only.** L2_MANAGER and END_USER get `403 "Forbidden: insufficient role"`.
- **Query:**
  - `q`: if shorter than 2 characters the response is `200 []`.
  - `role`: comma list of `ADMIN,AGENT,END_USER,L2_MANAGER`; invalid entries are dropped.
- **200:** `[{ id, email, displayName, role }]`, at most 20, active users only, unordered; matches `displayName` or `email`, case-insensitive.
- **Source:** `users.router.ts:15`, `users.controller.ts:68-92`.

### USR-4 `POST /api/v1/users/change-password` — P2 (local-auth environments only)
- **Auth:** any.
- **Body:** `{ "newPassword": string }`. There is no zod schema and **no current-password check** (⚠ `05` §C).
- **200:** `{ "ok": true }`.
- **Errors:** `400 "Password must be at least 8 characters"`; `500` if the `mustChangePassword` column is missing in that database (raw SQL, `users.controller.ts:345-348`).
- **Mobile:** only show it if AUTH-1 says `localAuthEnabled`. Apply the web's stronger client rule (`05` §A).
- **Source:** `users.router.ts:10`, `users.controller.ts:339-350`.

---

## 7. Lookups (teams, categories, priorities, statuses, countries)

> **Priorities and statuses are enums, not tables.**
> - There is **no** `Priority` or `Status` model and **no** `/priorities` or `/statuses` endpoint. A grep of every router confirms this; a call to such a path returns 200 HTML in production.
> - The value sets are fixed in `03-DATA-MODEL.md` §A. The mobile app hard-codes them, with labels from `05` §A.10.
> - The only priority-related endpoint is the impact × urgency matrix (LKP-6).

### LKP-1 `GET /api/v1/categories` — MVP
- **Purpose:** the 3-level category tree for the create form and the staff category editor.
- **Auth:** any role.
- **Query:**
  - `flat`: only the exact string `true` enables flat mode.
  - `countryId`: returns that country's rows **plus** global (`countryId = null`) rows. The web create form sends no `countryId`.
- **Server query** (`modules/categories/categories.controller.ts:20-40`):
  - `where: { ...countryWhere, ...(!flat && { parentId: null }), isActive: true }`
  - `orderBy: { sortOrder: 'asc' }` (top level only)
  - `take: 2000`
- **200:** `Category[]`, not paginated. Each row has:
  - the Category scalars `{ id, name, description, parentId, sortOrder, level: 'CATEGORY'|'SUBCATEGORY'|'ITEM', isActive, defaultTeamId, defaultAssigneeId, countryId, keywords: string[], createdAt }`;
  - `defaultTeam: {id,name}|null` and `defaultAssignee: {id,displayName}|null`;
  - `children[]`: scalars, defaultTeam, defaultAssignee, and grandchildren as raw scalars.
- **⚠** The nested `children` are **not** filtered by `isActive` or country and are unordered.
- **Mobile:**
  - **Always call with `flat=true`.** Every row at every level is then active.
  - Build the tree client-side from `parentId` and `level` (`05` §A.8).
  - **Ignore the nested `children` arrays.**
  - Sort each level by `name.localeCompare`, as the web does.
  - Cache for 10 minutes.
  - M3 Category filter (G2): the top-level rows only, sorted by name, as the web's list filter (TKT-1).
- **Source:** `categories.router.ts:10`, `categories.controller.ts:20-40`.

### LKP-2 `GET /api/v1/teams` — MVP (staff)
- **Purpose:** team picker, and team members for the assignee picker.
- **Auth:** `agentOrAdmin`: **ADMIN, AGENT only.** END_USER and L2_MANAGER get `403 "Forbidden: insufficient role"`.
- **Query:** `countryId`, an **exact** match on `Team.countryId`. Teams with a null country are excluded when it is set. `''` means no filter.
- **200:** `Team[]`, ordered by name asc. Not paginated. **Inactive teams are included.** Each team is:
  ```ts
  { id, name, description, isActive, slaPolicyId, slaPolicyP1Id, slaPolicyP2Id, slaPolicyP3Id, slaPolicyP4Id, countryId, createdAt, updatedAt,
    members: [{ id, teamId, userId, isLead, joinedAt, user: { id, displayName, email } }],
    slaPolicy: { id, name } | null }
  ```
- **Mobile:**
  - Filter out teams with `isActive: false`, except in the M3 Group filter (G2), which lists every team, inactive ones marked, as the web's list filter does: an inactive group can still own tickets.
  - Use `members` directly. The web's extra `GET /teams/:id` per team (N+1) is unnecessary.
- **Source:** `teams.router.ts:8`, `teams.controller.ts:17-28`.

### LKP-3 `GET /api/v1/teams/:id` — P2 (staff)
- **Auth:** ADMIN, AGENT.
- **200:** the team, plus `members[].user` with `role` added, plus `slaPolicy` as the **full** SLAPolicy row (or null).
- **Errors:** `404 "Team not found"`.
- **Source:** `teams.router.ts:10`, `teams.controller.ts:30-40`.
- **Mobile:** only needed if a member's `role` must be shown.

### LKP-4 `GET /api/v1/countries/my-countries` — MVP
- **Purpose:** the countries the user may pick in the country selector (`05` §A.12).
- **Auth:** any role.
- **200:** `Country[]`, active only, ordered by `name` asc:
  ```ts
  { id, code /* 2 chars */, name, displayName, timezone, currency, dateFormat, businessLanguage, isActive }
  ```
- **Logic** (`countries.controller.ts:40-42`):
  - ADMIN gets all active countries.
  - Any other role **with** a `countryId` gets only that country.
  - Any other role **without** a `countryId` gets all active countries.
- **Errors:** `500 "Failed to fetch countries"`.
- **Source:** `countries.router.ts:20`, `countries.controller.ts:34-61`.

### LKP-5 `GET /api/v1/countries` — MVP
- **Purpose:** all active countries, used by ADMIN's selector and for names and flags.
- **Auth:** any role.
- **200:** same shape and order as LKP-4.
- **Source:** `countries.router.ts:19`, `countries.controller.ts:7-29`.

### LKP-6 `GET /api/v1/priority-matrix` — P2 (staff)
- **Purpose:** preview the priority the server will compute from impact × urgency.
- **Auth:** ADMIN, AGENT only. Others get 403.
- **200:** `[{ id, impact, urgency, priority }]`, ordered impact desc, then urgency desc.
- **⚠ Writes on GET:** if the table is empty, it seeds 9 default rows (`priorityMatrix.controller.ts:21-39`). The defaults don't cover impact `MINIMAL` or urgency `URGENT`, so a missing pair means "server keeps the sent or default priority".
- **Mobile:** the server's value always wins (TKT-2/TKT-4). On M4, ADMIN and AGENT see the preview before Save and, as the web does, send the matching row's `priority` with the impact/urgency change (TKT-4, G2). On M8 (G5), ADMIN and AGENT see the same preview while choosing impact and urgency, from the same component and cache; nothing is sent for it (TKT-2).
- **Source:** `priorityMatrix.router.ts:8`, `priorityMatrix.controller.ts:21-39`.

### LKP-7 `GET /api/v1/canned-responses` — P2 (every role; built in G3)
- **Purpose:** reply templates in the composer.
- **Auth:** any role. **Correction (G3):** this entry used to say the web uses it for staff only. The web's picker has no role check and is offered to every role, in replies and private notes alike (`FE:pages/tickets/TicketDetailPage.tsx:1046`; `docs/G3-WEB-BEHAVIOUR.md` §1). Mobile does the same.
- **Query:** both optional, and **neither is sent**, by the web or by mobile:
  - `search`: case-insensitive match on title or body;
  - `category`: exact match.
- **200, wrapped:** `{ data: [{ id, title, body /* HTML */, category: string|null }] }`.
  - Active only, ordered by category then title.
  - No pagination and no limit.
- **Source:** `cannedResponses.router.ts:15`, `cannedResponses.controller.ts:4-20`.
- **Mobile (G3):** `listCannedResponses()` in `src/api/lookups.api.ts`, `useCannedResponses` in `src/hooks/useLookups.ts`. Loaded only when the person taps "Templates", cached 60 s as on the web. Search (title or category) and grouping (by category, "General" when none) happen on the device. The insert rule is in `05` §A.5: a blank body is replaced, otherwise the template is appended. No placeholders. The phone composer is plain text, so the template's formatting and images are not kept.

---

## 8. Dashboard / stats

### DSH-1 `GET /api/v1/dashboard/all` — MVP (simplified)
- **Written contract (backend team, 2026-11-05):** `GET /api/v1/dashboard?range=last7`; ranges `today`, `yesterday`, `last7`, `last30`, `week`, `month`, `quarter`, `year`, `all`; custom `?from=2026-10-01&to=2026-10-31`.
  - **Params: the same as the app sends** (below, and `tests/home/dashboard.test.mjs`). Confirmed, no longer read from the source alone.
  - **Path: differs.** The source has no handler on `/dashboard` itself, only `/all`, `/kpis` and the other widgets (`dashboard.router.ts:8-15` at `7df97c8`), and the web dashboard in the same clone calls `/dashboard/all` with exactly these params (`FE:api/dashboard.api.ts:35`). The written path is read as the module's base. **Ronit's call (2026-11-05): keep `/dashboard/all`.** Calling `/dashboard` would answer the web app's `index.html` (production mode) or Express's 404, and Home would show its error for every role.
  - `countryId` is not in the written list. The source reads it (`dashboard.controller.ts:242`) and the web sends it; the app keeps sending it from the country selector (not for L2).
- **Purpose:** the role-scoped KPI counters and the recent-tickets list for the home screen.
- **Auth:** any role. It is the only dashboard endpoint every role may call.
- **Query** (`modules/dashboard/dashboard.controller.ts:206-302`):

| Param | Parsing |
|---|---|
| `range` | Default `month`. Maps to a window that ends at the end of today, server-local time (timezone UNKNOWN). `today` and `yesterday` are single days; `last7` = `week` (−7 days); `last30` = `month` = **any unknown value** (−30 days); `quarter` (−90); `year` (−365); `all` (from 2000-01-01) |
| `from`, `to` | If `from` is present, `range` is ignored. `to` defaults to today. No validation. `to` without `from` is ignored |
| `countryId` | Explicit only. ANDed with the role scope. **Ignored for L2_MANAGER** |

- **Scope** (`:261-288`): the same rules as TKT-1. END_USER = own requests; AGENT = own + team + (triage) unassigned; L2 = own + team + team members' tickets; ADMIN = all.
- **Cache:** Redis.
  - END_USER, AGENT and L2: 60 s. ADMIN: 300 s.
  - Invalidated on ticket create, update, assign and status change.
  - ⚠ The L2 cache key is per **role**, not per user.
- **200** (top-level keys, `:572-578`):
  ```ts
  { kpis, byStatus, byPriority, workload, trends, recent, technicianMatrix, teamMatrix, bySource,
    countryGroupRows, technicianPriorityBreakdown, technicianSLABreaches, technicianClosedToday,
    technicianClosedThisWeek, monthlyTrends }
  ```
- **`kpis`** (all `number`; "in range" = `createdAt` within the window):

| Key | Meaning |
|---|---|
| `total` | created in range |
| `open` | status OPEN, created in range |
| `inProgress` | IN_PROGRESS or PENDING, created in range |
| `onHold` | ON_HOLD, in range |
| `pendingMgmtReview`, `pendingPartner`, `pendingUserConfirm`, `pendingUserInfo`, `pendingMasterData`, `pending` | per-status counts, in range |
| `resolved` | RESOLVED (not CLOSED), in range |
| `closed` | CLOSED, in range |
| `resolvedToday` | RESOLVED **and created today** (not resolved today) |
| `slaBreached` | slaStatus BREACHED and not RESOLVED/CLOSED, in range |
| `unassigned` | unassigned and active, in range ⚠ unscoped for some AGENTs |
| `totalOpen` | currently OPEN, IN_PROGRESS, ON_HOLD or PENDING, **no date filter** (PENDING_* excluded) |
| `currentlyOpen` | currently OPEN, no date filter |
| `createdToday`, `createdYesterday` | created that day |
| `closedToday`, `closedYesterday` | RESOLVED/CLOSED that day ⚠ unscoped for AGENT/L2 when no `countryId` is sent |
| `slaBreachPercent` | `round(slaBreached / totalOpen × 100)`. Mixed windows |

- **Arrays the MVP may use:**
  - `recent`: the 10 newest tickets in scope, no date filter. Each is Ticket scalars + `requester:{displayName}` + `assignedTo:{displayName}|null`.
  - `byStatus: [{status, count}]` and `byPriority: [{priority, count}]`, in range.
- **⚠ Do not show in the MVP:** `workload`, `technicianMatrix`, `technicianPriorityBreakdown`, `technicianSLABreaches`, `technicianClosedToday`, `technicianClosedThisWeek` and `countryGroupRows`. They become **global (unscoped)** for some AGENT and L2 users, or are never scoped at all (`05` §B.20, §C.19). For their shapes see the web repo `dashboard.controller.ts:446-570`.
- **Errors:** 500, including when Redis is down (`getCached` has no try/catch).
- **Source:** `dashboard.router.ts:8`, `dashboard.controller.ts:231-581`.
- **Mobile:**
  - Default `range=month`, the web's default ("This Month", `FE:pages/dashboard/DashboardPage.tsx:61`).
  - **G6:** Home's PERIOD row sends `range=<preset>` for the nine presets, or `from` + `to` (`YYYY-MM-DD`) for Custom, only once both days are valid (`src/utils/dashboard-period.ts`).
    - It never sends `range=custom`. The web does (`DashboardPage.tsx:99`), but it is not a `DashboardRange` in 03 §C, and the server ignores `range` whenever `from` is present.
    - Home reads only the KPIs in `src/utils/home-kpis.ts` (`HomeKpis`): the web dashboard's set plus `totalOpen`.
    - Web behaviour with sources: `docs/G6-WEB-DASHBOARD.md`.
  - Send `countryId` from the selector (not for L2).
  - Pull-to-refresh, no polling.
  - The 7 single-widget endpoints (`/dashboard/kpis` etc.) are ADMIN/AGENT only and **globally unscoped**: out of scope (Appendix A).

---

## 9. Notifications (in-app)

Mounted at `/api/v1/notifications` (`app.ts:132`). `requireAuth` only. Every route is scoped to the caller (`req.user.id`).

**Notification object**
```ts
{ id, userId, ticketId: string|null, type: NotificationType, title: string, body: string,
  isRead: boolean, readAt: string|null, createdAt,
  ticket: { id, ticketNumber, title } | null }        // `ticket` only on NTF-1
```
- `type` values **actually produced**: `COMMENT_ADDED`, `TICKET_ASSIGNED`, `TICKET_UPDATED`, `TICKET_RESOLVED`, `SLA_WARNING`, `SLA_BREACHED`.
- `MENTION` exists in the enum but is never produced.
- Approval requests and decisions arrive as `TICKET_UPDATED`.
- Producers are listed in `05` §B.

### NTF-1 `GET /api/v1/notifications` — MVP
- **Query:**
  - `page`, `limit`: shape (a), default 25, max 100.
  - `unread=true`: exactly the string `true`; anything else means all.
- **200:** `{ data: Notification[], total, page, limit, totalPages, hasNext, hasPrev }`, `createdAt desc`.
- **Source:** `modules/notifications/notifications.router.ts:7`, `notifications.controller.ts:6-23`.

### NTF-2 `GET /api/v1/notifications/count` — MVP
- **200:** `{ "count": number }`, the unread count.
- **Source:** `notifications.router.ts:8`, `notifications.controller.ts:25-28`.
- **Mobile:** this drives the badge. Poll it on app foreground, on pull-to-refresh, and every ≥ 60 s while the app is in the foreground. It is the substitute for push until A5 ships.
  - In practice the app does not poll it: it reloads on pull-to-refresh and after a mark-read.
  - Since G7 it also reloads when a push arrives while Setu is open. That needs a build with Firebase's `google-services.json` (`docs/RELEASE.md` §2b); NTF-5/NTF-6 and the FCM send are confirmed (2026-11-05).

### NTF-3 `POST /api/v1/notifications/:id/read` — MVP
- **200:** `{ "message": "Marked as read" }`. Also returns 200 for unknown or foreign IDs, which are silently ignored.
- **Source:** `notifications.router.ts:10`, `notifications.controller.ts:30-36`.

### NTF-4 `POST /api/v1/notifications/read-all` — MVP
- **200:** `{ "message": "All notifications marked as read" }`.
- **Source:** `notifications.router.ts:11`, `notifications.controller.ts:38-44`.

### NTF-5 `POST /api/v1/notifications/device-token` — confirmed (G7; written contract 2026-11-05)
- **Status: confirmed by the backend team in writing (2026-11-05)**, and in the source since `7df97c8`: `notifications.router.ts:14`, `deviceToken.controller.ts:4-22`.
  - Specified by Ronit in MOBILE-BACKEND-REQUIREMENTS.md §1.5 (2026-11-02). It replaces AUTH-P4 (§1.4).
  - A server without it answers `404` with an HTML body (`Cannot POST …`); the app still reads that as "not deployed" (below).
- **Auth:** `Authorization: Bearer <token>`, the signed-in user (`requireAuth`).
- **Body:** `{ "token": "<FCM registration token>", "platform": "android" }`. Both are required: `400 { error: 'token and platform are required' }`; a platform other than `android` or `ios` is `400` too.
- **200:** `{ "ok": true }`.
  - Upsert on `token`.
  - A token already registered to a different user is **reassigned to the caller**.
  - `lastSeenAt` is updated.
- **Mobile (G7):** `registerDeviceToken()` in `src/api/notifications.api.ts`, called from `src/push/registration.ts`. It is sent:
  - after sign-in, and once per app start with a stored session, while the notification permission is granted;
  - when Firebase rotates the token.
  - The token is the native FCM token (`getDevicePushTokenAsync`), not an Expo push token.
  - **A 404 is silent**: no banner, no dialog. The Alerts notice says "not switched on at the Service Desk yet", and `[push] register: 404, NTF-5 not deployed yet` is logged for developers.
  - Checked against the written contract on 2026-11-05: path, method, body keys and header all match (`tests/push/push.test.mjs`, "registration matches the confirmed contract exactly").
  - The phone needs Firebase's `google-services.json` in the build for a token at all (`docs/RELEASE.md` §2b).
  - No other failure is shown either. The token is never logged.

### NTF-6 `DELETE /api/v1/notifications/device-token` — confirmed (G7; written contract 2026-11-05)
- **Status: confirmed in writing (2026-11-05)**; in the source at `notifications.router.ts:15`, `deviceToken.controller.ts:24-35`.
- **Auth:** `Authorization: Bearer <token>`.
- **Body:** a JSON body, `{ "token": "<FCM registration token>", "platform": "android" }`, as the written contract gives for both calls. It is not a path parameter. The source reads only `token` (`400` without it) and deletes that token for the caller only.
  - **Changed 2026-11-05:** the app sent `{ token }` alone. It now sends `platform` too, to match the written contract exactly.
- **200:** `{ "ok": true }`.
- **Mobile (G7):** `unregisterDeviceToken()`, called from `useSignOut` (`src/hooks/useProfile.ts`) on an explicit sign-out.
  - It is sent **before** AUTH-3, because AUTH-3 ends the session token NTF-6 needs.
  - Sign-out waits at most 3 s for it, and its failures are silent.
  - Sessions that end without the Sign out button (401, 8 h expiry, the 15-day re-authentication) cannot call it, because their token is already dead. For those, the app has Firebase delete the token on the phone (`FirebaseMessaging.deleteToken()`), so the old token can no longer deliver anything. The server row is then removed when FCM reports the token unregistered (MOBILE-BACKEND-REQUIREMENTS.md §1.6).

> `GET /api/v1/notifications/stream` (SSE) is **out of scope**. It never delivers events (ioredis subscribe bug, `notifications.controller.ts:58-62`), and React Native has no `EventSource`. See `05` §B.

---

## 10. Phase 2 modules (approvals, announcements, knowledge base, service catalog)

### 10.1 Approvals (`/api/v1/approvals`, `app.ts:143`)

**Approval object** (include verbatim, `modules/approvals/approvals.controller.ts:8-14`):
```ts
{ id, entityType: 'ticket'|'change'|'service_request', entityId, stage, approverId,
  status: 'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED', comments: string|null, decidedAt: string|null,
  changeId: string|null, serviceRequestId: string|null, createdAt,
  approver: { id, displayName, email } | null,
  change: { id, changeNumber, title, status } | null,
  serviceRequest: (ServiceRequest scalars + serviceItem: { id, name }) | null }
```
⚠ For `entityType: 'ticket'`, both `change` and `serviceRequest` are null. Load the ticket via TKT-3 using `entityId`.

#### APR-1 `GET /api/v1/approvals/pending` — P2
- **Auth:** any role; scoped to `approverId = me`, `status = PENDING`.
- **200:** `Approval[]`, `createdAt` asc, not paginated.
  - Someone with nothing pending gets `200 []`, whatever their role. There is no role check, so there is never a 403 (re-checked in G7).
- **Source:** `approvals.router.ts:10`, `approvals.controller.ts:105-112`.
- **Mobile (G7):** the Approvals drawer row and route are there for **every** role, always (Ronit's decision). An empty answer is the inbox's "Nothing waiting for you" state. The app still never calls the unscoped `GET /approvals` (`05` §C.16).

#### APR-2 `POST /api/v1/approvals/:id/approve` — P2
- **Auth:** any role. (ctrl) must be the approver.
- **Body:** `z.object({ comments: z.string().optional() })`.
- **200:** the updated Approval (include above).
- **Errors:** `404 "Approval not found"`, `403 "Not your approval"`, `400 "Approval already decided"`, `400 Validation error`.
- **Side effects:**
  - Changes go to `APPROVED` once every approval for the change is approved.
  - **Tickets: no status change** (they stay `PENDING_MGMT_REVIEW`).
  - The requester gets an email and an in-app `TICKET_UPDATED` notification.
- **Source:** `approvals.router.ts:11`, `approvals.controller.ts:114-180`.

#### APR-3 `POST /api/v1/approvals/:id/reject` — P2
- **Body:** `z.object({ comments: z.string().min(1, 'Rejection reason required') })`.
- **Side effects:**
  - Other PENDING approvals for the same entity become `CANCELLED`.
  - A change goes to `REJECTED`.
  - **Tickets: no status change.** Email and in-app notification to the requester.
- **Errors:** same as APR-2.
- **Source:** `approvals.router.ts:12`, `approvals.controller.ts:182-247`.

#### APR-4 `POST /api/v1/approvals` — P2 (ADMIN, AGENT; added in G3)
- **Purpose:** submit a ticket for approval. Added to this contract in Phase G3, with Ronit's sign-off in the G3 brief. The web's behaviour, with sources: `docs/G3-WEB-BEHAVIOUR.md` §3.
- **Auth:** `agentOrAdmin`: **ADMIN, AGENT only.** L2_MANAGER and END_USER get `403 "Forbidden: insufficient role"` (`approvals.router.ts:8`). There is no ticket-state check: any status is accepted.
- **Body** (zod, `approvals.controller.ts:17-22`): `{ entityType: string, entityId: string, approverIds: string[] (min 1, "At least one approver required"), comments?: string }`.
  - **Mobile sends exactly** `{ entityType: 'ticket', entityId: <ticket id>, approverIds, comments? }` (`CreateApprovalBody`, 03 §C). It removes duplicate ids and leaves out a blank `comments`; the web sends `''`, which stores the same "no comment".
  - `approverIds` are user ids from USR-3 **with no `role` filter**, as on the web: an approver can be any active user (`FE:pages/tickets/TicketDetailPage.tsx:415-421`).
- **201:** `Approval[]`, one per approver (the Approval object above), `stage` 1, 2, 3… in the order sent.
- **Errors:** `403` (role); `400 "Validation error"` with `details.approverIds`; `500` for an unknown approver or ticket id (Prisma, §0.2).
- **Side effects** (`approvals.controller.ts:24-84`):
  1. Every **PENDING** approval already on the ticket becomes **CANCELLED**.
  2. One approval per approver. The stage is not enforced: all approvers are notified at once.
  3. ⚠ **The ticket's status is set to `PENDING_MGMT_REVIEW` by a direct update, from any status** (CLOSED and CANCELED included). It bypasses TKT-6, so there is no `STATUS_CHANGED` audit, no email or in-app notice to the requester, and **the SLA clock is not paused** (`05` B.35).
  4. Each approver gets an in-app `TICKET_UPDATED` notification ("Approval requested") and an email. The email carries the PUBLIC conversation and attaches every ticket-level file (⚠ `05` C.28).
  - Approving or rejecting later never changes the ticket's status (APR-2, APR-3; `05` B.22).
- **Source:** `approvals.router.ts:8`, `approvals.controller.ts:16-88`; email `modules/email/notification.service.ts:113-156, :506-528`.
- **Mobile (G3):** `submitTicketForApproval()` in `src/api/approvals.api.ts`, `useSubmitForApproval`, `SubmitApprovalScreen`. ADMIN and AGENT, every status (no AGENT lock, as on the web). A request from END_USER or L2_MANAGER is refused on the device and nothing is sent. The app confirms first, then re-reads the ticket's status (TKT-3) and shows it as the server has it.

> `GET /api/v1/approvals` (the list) is **unscoped** (⚠ `05` §C.16) and out of scope for mobile. That includes the web's per-ticket use of it (`?entityType=ticket&entityId=`, the ticket's Approvals tab), which G3 did not build.

### 10.2 Announcements

#### ANN-1 `GET /api/v1/announcements/active` — P2
- **Auth:** any role.
- **Server filter:**
  - `isActive`, `startsAt ≤ now`, and `expiresAt` null or `> now`;
  - then, in memory, `targetRoles` is empty or contains my role.
- **Order:** `isPinned` desc, `type` asc (INFO, WARNING, CRITICAL, MAINTENANCE), `createdAt` desc.
- **200:** a plain array of:
  ```ts
  { id, title, body /* HTML */, type: 'INFO'|'WARNING'|'CRITICAL'|'MAINTENANCE', authorId, isActive, isPinned,
    startsAt, expiresAt: string|null, targetRoles: string[], createdAt, updatedAt, author: { id, displayName } }
  ```
- **Source:** `modules/announcements/announcements.router.ts:9`, `announcements.controller.ts:34-52`.

### 10.3 Knowledge base (`/api/v1/kb`, `app.ts:133`)

> ⚠ **These routes do not use `requireAuth`** (`modules/knowledgeBase/kb.router.ts:14-27`). They behave identically for every caller, including anonymous ones, so staff cannot see non-public articles. Mobile still sends the Bearer header and shows **published, public** articles only (`05` §B.26, §C.15).

#### KB-1 `GET /api/v1/kb/categories` — P2
- **200:** top-level `KBCategory[]` = `{ id, name, description, parentId, sortOrder, isPublic, createdAt, children: KBCategory[] }`, ordered by sortOrder.
- There is no `isPublic` filter; mobile hides `isPublic: false`.
- **Source:** `kb.router.ts:14`, `kb.controller.ts:31-34`.

#### KB-2 `GET /api/v1/kb/articles` — P2
- **Query:**
  - `page`, `limit` (shape a);
  - `categoryId`;
  - `tag` (exact, case-sensitive);
  - `published`: **mobile never sends it** (absent = published only).
  - `search` is **ignored**; use KB-3.
- **200:** `{ data: [{ id, title, slug, excerpt, tags, viewCount, helpfulCount, isPublished, isPublic, publishedAt, author:{displayName}, category:{name}|null }], total, page, limit, totalPages, hasNext, hasPrev }`, ordered `publishedAt` desc.
- **Source:** `kb.router.ts:20`, `kb.controller.ts:53-76`.

#### KB-3 `GET /api/v1/kb/search?q=` — P2
- **Query:** `q`; shorter than 2 characters gives `[]`.
- **Matching:** published and public articles only; title or body contains `q` (case-insensitive), or a tag equals `q`.
- **200:** `[{ id, title, slug, excerpt, tags }]`, at most 20, unordered.
- **Source:** `kb.router.ts:21`, `kb.controller.ts:78-97`.

#### KB-4 `GET /api/v1/kb/articles/:slug` — P2
- **Path:** the **slug** (not the id).
- **200:** the full article `{ id, title, slug, body /* HTML */, excerpt, categoryId, authorId, tags, isPublished, isPublic, viewCount, helpfulCount, publishedAt, createdAt, updatedAt, ticketCategoryId, author:{displayName}, category:{name}|null }`.
- **Side effect:** increments `viewCount` (the response shows the old value).
- **Errors:** `404 "Article not found"`, `403 "Forbidden"` (every non-public article), `500 "Failed to fetch article"`.
- **Mobile:** if `isPublished` is false, show "not available". Drafts are reachable by slug (⚠).
- **Source:** `kb.router.ts:22`, `kb.controller.ts:99-118`.

#### KB-5 `POST /api/v1/kb/articles/:id/helpful` — P2
- **Path:** the article **id**. No body.
- **200:** `{ "message": "Thank you for your feedback" }`.
- **Errors:** unknown id gives 500.
- **Mobile:** no server de-duplication, so allow one vote per article per device (local flag).
- **Source:** `kb.router.ts:27`, `kb.controller.ts:147-150`.

### 10.4 Service catalog (`/api/v1/service-catalog`, `app.ts:148`)

> **Used by the app since Phase G4 (2026-10-22)**, for every role: M17 catalogue and My Requests, M18 request form, M19 request detail (`04`). The web's behaviour, with sources: `docs/G4-WEB-CATALOGUE.md`. Client code: `src/api/serviceCatalog.api.ts`, `src/hooks/useServiceCatalog.ts`. The labels stay "P2", as for LKP-7 and APR-4. The routes in Appendix A (admin writes; `PUT /requests/:id`, `/status`, `/assign`) are still never called.

#### SCR-1 `GET /api/v1/service-catalog/categories` — P2 (every role; built in G4)
- **Auth:** any role.
- **200:** `[{ id, name, description, icon, sortOrder, isActive, createdAt, services: ServiceItem[] }]`, active only, ordered by sortOrder; services also active only and ordered by sortOrder.
- **Mobile (G4):** no parameters. The category list of M17's Home view. The embedded `services` are **not** used: item counts and lists come from SCR-2, as on the web (`FE:pages/service-catalog/ServiceCatalogPage.tsx:422`).
- **Source:** `serviceCatalog.router.ts:9`, `serviceCatalog.controller.ts:34-41`.

#### SCR-2 `GET /api/v1/service-catalog/items` — P2 (every role; built in G4)
- **Query:** `categoryId?`.
- **200:** `ServiceItem[]` + `category:{id,name}|null`, active only, ordered by sortOrder.
- **ServiceItem** = `{ id, name, description, categoryId, icon, estimatedTime /* minutes */, requiresApproval, approverIds: string[], formFields: FormField[] /* Json */, isActive, sortOrder, createdAt, updatedAt }`.
- **Mobile (G4):** sent **with no parameters**, as the web (`categoryId` is not used). M17 filters the list on the device by category and by a search on name or description. No item is scoped by role.
- **Source:** `serviceCatalog.router.ts:15`, `serviceCatalog.controller.ts:61-71`.

#### SCR-3 `GET /api/v1/service-catalog/items/:id` — P2 (every role; built in G4)
- **200:** `ServiceItem` + `category`. **Inactive items are still returned**; mobile checks `isActive`.
- **`formFields`** is not validated by the server. The shape the web renders is `[{ name, label, type: 'text'|'textarea'|'date'|'phone'|'email'|'number'|'select', required?, placeholder?, options?: (string|{value,label})[] }]` (`05` §A.17).
  - Any other `type` (or none) renders as a text box. No other key is read: no min, max, pattern, default or dependency. The only rule is `required`, plus the browser's checks on e-mail and number inputs (`docs/G4-WEB-CATALOGUE.md` §4).
- **Mobile (G4):** M18 renders the form from it (`normaliseFormFields`, `src/utils/service-catalog.ts`); M19 uses it to label a request's answers. An inactive item shows "no longer offered" and cannot be requested.
- **Errors:** `404 "Service item not found"`.
- **Source:** `serviceCatalog.router.ts:16`, `serviceCatalog.controller.ts:73-80`.

#### SCR-4 `GET /api/v1/service-catalog/requests` — P2 (every role; built in G4)
- **Auth:** any role. END_USER sees own requests only. ⚠ Every other role sees **all** requests.
- **Query:**
  - `status` (TicketStatus; an invalid value gives 500);
  - `page` (default 1) and `limit` (default 20, **uncapped**). Shape (b).
- **200:** `{ data: ServiceRequestDTO[], total, page, limit }`, ordered `createdAt` desc.
- **ServiceRequestDTO** = ServiceRequest scalars `{ id, requestNumber, serviceItemId, requesterId, assignedToId, teamId, countryId, status, priority, slaPolicyId, slaStatus, slaResponseDue, slaResolveDue, slaBreachedAt, firstResponseAt, formData, notes, resolvedAt, closedAt, createdAt, updatedAt }`, plus:
  ```ts
  serviceItem: { id, name, requiresApproval, estimatedTime }, requester: { id, displayName, email },
  assignedTo: { id, displayName, email } | null, team: { id, name } | null,
  approvals: (Approval + approver{id,displayName,email})[]  // ordered by stage
  ```
- **Mobile:** for the P2 "My requests" screen, show only rows where `requesterId === me`, for every role. Always send `limit` ≤ 50.
- **Mobile (G4):** M17 My Requests sends `page` and `limit=50` (the web sends `page=1&limit=50` and never pages), **never `status`**.
- **Mobile (G5), superseding the "Mobile" line above:** the rows are shown as the web shows them. Staff see every request, END_USER their own (`myServiceRequestRows`; the END_USER scoping is the server's, deliberate, `:116-117`). The next page loads as the list scrolls; nothing is read automatically. A request's detail (SCR-6) still opens only for one's own (`isOwnServiceRequest`). Reason: `ROLE-MATRIX.md` §14.2.
- **Source:** `serviceCatalog.router.ts:22`, `serviceCatalog.controller.ts:111-124`.

#### SCR-5 `POST /api/v1/service-catalog/requests` — P2 (every role; built in G4)
- **Body** (verbatim, `serviceCatalog.controller.ts:26-31`):
  ```ts
  z.object({
    serviceItemId: z.string().uuid(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    formData: z.any().default({}),
    notes: z.string().optional().nullable(),
  })
  ```
  Everything else the web sends (title, description, impact, urgency, categoryId, teamId, assignedToId) is **dropped**.
- **201:** `ServiceRequestDTO`.
  - `approvals` is **always `[]`** in this response, because approvals are created afterwards. Refetch with SCR-6.
  - **No ticket is created and no `ticketId` is returned.**
- **Errors:** `404 "Service item not found"` (missing or inactive), `400 Validation error`.
- **Side effects:** one Approval per `approverIds` entry if `requiresApproval`. No notification, no audit, no SLA.
- **Mobile (G4) sends exactly** `{ serviceItemId, formData, notes, priority? }`:
  - `formData`: every field of the item's form, untouched ones as `""`, every value a string, as the web submits it.
  - `notes`: always a string, `""` when blank (the web: `data.notes || ''`).
  - `priority`: only from ADMIN, AGENT or L2_MANAGER, and only when they chose both Impact and Urgency (the web form's own map, `FE:pages/service-catalog/ServiceRequestFormPage.tsx:107-122`). Otherwise it is left out and the server stores MEDIUM.
  - Any other key, a `priority` from END_USER, or an unknown role is refused on the device, with nothing sent (`serviceRequestProblem`, `src/utils/permissions.ts`).
- **Source:** `serviceCatalog.router.ts:23`, `serviceCatalog.controller.ts:135-159`.

#### SCR-6 `GET /api/v1/service-catalog/requests/:id` — P2 (every role; built in G4)
- **200:** `ServiceRequestDTO`.
- **Errors:** `404 "Service request not found"`; `403 "Forbidden"` for an END_USER who is not the requester.
- ⚠ Any other role can read **any** request by id. **Mobile (G4):** M19 opens only from My Requests, and shows the request only when `requesterId === me` (`isOwnServiceRequest`). The web never calls this endpoint.
- **Source:** `serviceCatalog.router.ts:24`, `serviceCatalog.controller.ts:126-133`.

### 10.5 Audit log (`/api/v1/audit-logs` written; `/api/v1/audit-log` in the source, `app.ts:137`) — G8, 2026-11-02; contract confirmed 2026-11-05

Out of scope until G8 (Appendix A). Evidence for the G8 build, and what the web page shows: `docs/G8-WEB-AUDIT.md`. On 2026-11-05 the backend team sent Ronit the contract in writing; this section follows it, and says where the source differs.

#### AUD-1 `GET /api/v1/audit-logs` — P2 (ADMIN only; built in G8; confirmed in writing 2026-11-05)
- **Written contract (backend team, 2026-11-05):** `GET /api/v1/audit-logs` (plural). Requires an ADMIN Bearer token. Params: `page`, `limit`, `action`, `entityType`, `dateFrom`, `dateTo`, `ticketId`, `ticketNumber`.
- **The path: the written contract and the source differ.**
  - The source at `7df97c8` mounts the module at `/api/v1/audit-log`, singular (`app.ts:137`), on every branch in the clone. No `/audit-logs` exists anywhere in it. The web portal's own audit page is not in the clone either (`docs/G8-WEB-AUDIT.md` §1), so UAT may run newer code.
  - **Ronit's call (2026-11-05): the written path first, the source's as a fallback.** `src/api/auditLog.api.ts` calls `/audit-logs`. Only when the answer shows that no such route exists (an HTML body: Express's `404 Cannot GET`, or the web app's `index.html` with `200` in production mode, §0.5) does it call `/audit-log` with the same params, and it keeps whichever answered for the rest of that run of the app. A JSON error (401, 403, 500) or a 429 is the route's own answer and is never retried on the other path. Cost: at most one extra request per run, ADMIN only. A `[API drift]` line (`__DEV__`) says when the singular answered.
  - So the G8 screen, which called `/audit-log`, was **not** failing against a server built from this source. Against a server that has only `/audit-logs`, it would have shown its error state.
- **Auth:** `requireAuth, adminOnly` (`auditLog.router.ts:8`). **ADMIN only, enforced by the server:**
  - every other role gets `403 "Forbidden: insufficient role"` (`middleware/rbac.middleware.ts:13-15`);
  - no user gives `401 "Unauthorized"`.
  - The one route in the module. (The controller also scopes AGENTs to their teams' tickets, `auditLog.controller.ts:20-32`; `adminOnly` means that code never runs.)
- **Query:** pagination shape (a), §0.3. The written contract's params, as the source reads them (`auditLog.controller.ts:7-49`). They combine with AND; an empty string is ignored.
  - `page`, default 1; `limit`, default **25**, clamped 1–100;
  - `action`: an `AuditAction` (03 §A), exact. Any other value is a Prisma enum error, so a 500: send only the nine values;
  - `entityType`: an exact, case-sensitive match. Values written: `Ticket`, `Comment`, `Attachment`, and `ticket` from the auto-close job (`05` B.38);
  - `dateFrom`, `dateTo`: `createdAt >= new Date(dateFrom)`, `<= new Date(dateTo)` (`:45-49`). No validation: an unreadable value is an Invalid Date and a 500. A bare `YYYY-MM-DD` is UTC midnight, so `dateTo=2026-11-05` drops all of the 5th but its first instant (`05` B.40). **The app sends full instants:** a picked day's first and last millisecond on the phone's clock, as ISO strings;
  - `ticketId`: a ticket id, exact;
  - `ticketNumber`: the server looks the ticket up (`:11-18`) and filters by its id. **A number with no ticket filters nothing: the whole log comes back** (`05` B.40). Ignored when `ticketId` is sent too;
  - `actorId`: a user id, exact. **In the source (`:7, :37`), not in the written list.** The app keeps its Person filter on it.
- **Not supported:** free text, sort. **Never send them** (rule 1).
- **200:** `Paginated<AuditLogEntry>` (`03` §C):
  - each row is the full `audit_logs` row, `ipAddress` included;
  - plus `actor: { id, displayName, email } | null` and `ticket: { id, ticketNumber, title } | null` (`:19-22`);
  - **no actor role**.
  - `oldValues` / `newValues` are the stored JSON, **ids not resolved to names** (unlike TKT-7). Shapes per write site: `docs/G8-WEB-AUDIT.md` §8.
- **Order:** `createdAt` desc (`:23`). Offset paging: rows repeat when entries are written between pages, so de-duplicate by `id`.
- **Cost:** a `count` and a `findMany` per page. `ticketId`, `actorId` and `createdAt` are indexed; `entityType` is not (`schema.prisma:573-575`).
- **Mobile (G8, M20; filters completed 2026-11-05):**
  - The request:
    - ADMIN only: the drawer row, the route and the request (`canViewAuditLog`);
    - `limit=50`, capped at 500 entries;
    - only the written params plus `actorId` are ever sent, through an allow-list (`AUDIT_FILTER_KEYS`, `src/api/auditLog.api.ts`).
  - Filters (`src/utils/audit-log.ts` `auditLogQuery`), all server-side:
    - **Ticket** → `ticketNumber=<n>`, as typed. The TKT-1 number → id lookup of G8 is gone. Because an unknown number returns the whole log, the app checks the first page: if any entry belongs to another ticket (or none), it shows "No ticket #n" and loads nothing more (`auditTicketFilterIgnored`).
    - **Action** → `action`, the nine `AuditAction` values (three of them are never written today, G8 §8, and say so).
    - **Dates** → `dateFrom` / `dateTo`: Any date, Today, Yesterday, Last 7 days, Last 30 days, or either end picked in the system date dialog. Whole days on the phone's calendar, sent as instants (above).
    - **Entity type** → `entityType`; **Person** → `actorId` (USR-3 picker).
  - `ipAddress` is never displayed.
  - Tests: `tests/rbac/audit-log.test.mjs` (every param, the path fallback, the unknown-number check).
- **Source:** `app.ts:30, :137`; `modules/auditLog/auditLog.router.ts:8`; `auditLog.controller.ts:5-67`; `utils/pagination.ts:16-44`; `schema.prisma:558-577` (all at `7df97c8`).

---

## Appendix A — Out of scope for mobile (names only)

These routes exist but the mobile app **must not call them**. Adding any of them needs Ronit's approval and a full spec in this file first.
- Mount lines are in `backend/src/app.ts:117-162`. All 41 router files are accounted for: 38 mounted in `app.ts` and 3 nested under tickets.
- Within modules that are partly in scope, the routes not listed in §1–§10 are out of scope too.

| Module (mount) | Out-of-scope routes |
|---|---|
| auth (`/auth`) | `POST /login` (cookie-only), `POST /test-login`, `GET /microsoft`, `GET /microsoft/callback` (see §1.5) |
| tickets nested | `GET /tickets/:ticketId/attachments/download-all` (zip) |
| notifications | `GET /notifications/stream` (SSE, broken) |
| users (`/users`) | `GET /` (list), `POST /`, `DELETE /:id`, `POST /:id/set-password`, `POST /sync-azure-ad`, `POST /import`, `GET /export`, `GET /lookup-azure` |
| teams | `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/members`, `DELETE /:id/members/:userId` |
| categories | `POST /`, `PUT /:id`, `DELETE /:id`, `GET /resolve-assignee`, `GET /:id/effective-assignees`, `GET/POST /:id/country-assignees`, `DELETE /:id/country-assignees/:mappingId` |
| countries | `GET /:id`, `GET /:id/stats`, `GET /:id/email-routing`, `PUT /:id`, `POST /:id/email-routing`, `PUT/DELETE /email-routing/:ruleId` |
| priority-matrix | `PUT /` |
| canned-responses | `GET /all`, `POST /`, `PUT /:id`, `DELETE /:id` |
| dashboard | `GET /kpis`, `/tickets-by-status`, `/tickets-by-priority`, `/tickets-by-category`, `/agent-workload`, `/sla-trends`, `/recent-tickets` (ADMIN/AGENT, globally unscoped) |
| approvals | `GET /` (unscoped list). (`POST /`, submit for approval, is APR-4 since G3.) |
| announcements | `GET /` (unfiltered list), `POST /`, `PUT /:id`, `DELETE /:id` |
| kb | `POST /import`, `POST/PUT/DELETE /categories[/:id]`, `POST /articles`, `PUT/DELETE /articles/:id`, `POST /articles/:id/publish` |
| service-catalog | `POST/PUT/DELETE /categories[/:id]`, `POST/PUT/DELETE /items[/:id]`, `PUT /requests/:id`, `POST /requests/:id/status`, `POST /requests/:id/assign` |
| sla (`/sla`) | `GET/POST/PUT/DELETE /policies[/:id]`, `/policies/:id/escalation-rules[/:ruleId]` (ticket responses already carry SLA data) |
| templates (`/templates`) | all (`GET /`, `GET /:id`, writes). The web uses them only in admin |
| custom-fields (`/custom-fields`) | all (definitions are not rendered anywhere in the web) |
| reports (`/reports`) | all: 16 report GETs, `GET /ticket-log`, `POST /export`, `/scheduled*` |
| audit-log (`/audit-log`; written contract `/audit-logs`) | none since G8: `GET /` is AUD-1 (§10.5), ADMIN only |
| problems (`/problems`) | all (incl. `/:id/status`, `/:id/link-ticket`) |
| changes (`/changes`) | all (incl. `/:id/status`, `/:id/submit`, `/:id/link-ticket`, which **force-closes tickets**, `/link-problem`, `/link-project`) |
| cab (`/cab`) | all |
| assets (`/assets`) | all (incl. vendors, contracts, licenses, tree, import, assign, link-ticket) |
| purchase-orders (`/purchase-orders`) | all |
| projects (`/projects`) | all (incl. tasks, milestones) |
| pm (`/pm`) | all (preventive maintenance; never executed server-side) |
| business-rules (`/business-rules`) | all |
| closure-rules (`/closure-rules`) | all (ADMIN-only and never enforced; see ask A10) |
| user-groups (`/user-groups`) | all |
| query-builder (`/query-builder`) | all (⚠ injection, `05` §C.14) |
| saved-views (`/saved-views`) | all |
| surveys (`/surveys`) | all (incl. `POST /:id/responses`; surveys are never triggered automatically) |
| sites (`/sites`), departments (`/departments`), operational-hours (`/operational-hours`), holidays (`/holidays`) | all |
| email (`/email`) | all (`/settings`, `/settings/test-imap`, `/settings/test-smtp`, `/poll`) |
| ai (`/ai`) | all: `POST /analyse`, `POST /summarise`, `POST /draft-reply` (added on web `master` 2026-10-09, after these docs were first written; ⚠ `requireAuth` only, no role or ticket-scope check; see `07-DRIFT-CHECK.md` §4, §6) |
| non-API | `GET /api/docs` (Swagger UI) |

## Appendix B — Endpoint index

**60 documented endpoints:** 33 MVP and 27 Phase 2 (APR-4 added in G3, AUD-1 in G8). Also:
- AUTH-P1, P2, P3 and P5 (§1.4), PENDING backend asks;
- NTF-5 and NTF-6 (§9), confirmed in writing by the backend team on 2026-11-05 and in the source at `7df97c8`. They replace AUTH-P4.

3 more are reference-only, do-not-call (§1.5). SCR-1..SCR-6 are used by the app since G4; their label stays P2, as for LKP-7 and APR-4.

| ID | Method | Path (under `/api/v1` unless noted) | Roles (server) | Phase |
|---|---|---|---|---|
| SYS-1 | GET | `/health` (no `/api/v1`) | public | MVP |
| AUTH-1 | GET | `/auth/config` | public | MVP |
| AUTH-2 | GET | `/auth/me` | any | MVP |
| AUTH-3 | POST | `/auth/logout` | token optional | MVP |
| TKT-1 | GET | `/tickets` | any (scoped) | MVP |
| TKT-2 | POST | `/tickets` | any | MVP |
| TKT-3 | GET | `/tickets/:id` | any (ctrl) | MVP |
| TKT-4 | PUT | `/tickets/:id` | any (ctrl) | MVP |
| TKT-5 | POST | `/tickets/:id/assign` | ADMIN, AGENT | MVP |
| TKT-6 | POST | `/tickets/:id/status` | any (ctrl) | MVP |
| TKT-7 | GET | `/tickets/:id/activity` | any ⚠ | MVP |
| TKT-8 | GET | `/tickets/:id/sla` | any ⚠ | P2 |
| TKT-9 | GET | `/tickets/:id/email-recipients` | any ⚠ (mobile: staff) | MVP |
| TKT-10 | GET | `/tickets/:id/suggested-assignees` | any ⚠ (mobile: ADMIN/AGENT) | MVP |
| CMT-1 | GET | `/tickets/:ticketId/comments` | any ⚠ | MVP |
| CMT-2 | POST | `/tickets/:ticketId/comments` | any ⚠ | MVP |
| CMT-3 | PUT | `/tickets/:ticketId/comments/:commentId` | author, ADMIN | P2 |
| CMT-4 | DELETE | `/tickets/:ticketId/comments/:commentId` | author, ADMIN | P2 |
| ATT-1 | GET | `/tickets/:ticketId/attachments` | any (ctrl) | MVP |
| ATT-2 | POST | `/tickets/:ticketId/attachments` (multipart `files`) | any ⚠ | MVP |
| ATT-3 | GET | `/tickets/:ticketId/attachments/:attachmentId/view` | any (ctrl) | MVP |
| ATT-4 | GET | `/tickets/:ticketId/attachments/:attachmentId/download` | any (ctrl) | MVP |
| ATT-5 | DELETE | `/tickets/:ticketId/attachments/:attachmentId` | ADMIN, AGENT, L2 | P2 |
| TSK-1 | GET | `/tickets/:ticketId/tasks` | any ⚠ | MVP |
| TSK-2 | POST | `/tickets/:ticketId/tasks` | any ⚠ (mobile: staff) | P2 |
| TSK-3 | PUT | `/tickets/:ticketId/tasks/:taskId` | any ⚠ (mobile: staff) | MVP |
| TSK-4 | DELETE | `/tickets/:ticketId/tasks/:taskId` | any ⚠ (mobile: staff) | P2 |
| USR-1 | GET | `/users/:id` | any (ctrl) | MVP |
| USR-2 | PUT | `/users/:id` | self or ADMIN | MVP |
| USR-3 | GET | `/users/search` | ADMIN, AGENT | MVP |
| USR-4 | POST | `/users/change-password` | any | P2 |
| LKP-1 | GET | `/categories?flat=true` | any | MVP |
| LKP-2 | GET | `/teams` | ADMIN, AGENT | MVP |
| LKP-3 | GET | `/teams/:id` | ADMIN, AGENT | P2 |
| LKP-4 | GET | `/countries/my-countries` | any | MVP |
| LKP-5 | GET | `/countries` | any | MVP |
| LKP-6 | GET | `/priority-matrix` | ADMIN, AGENT | P2 |
| LKP-7 | GET | `/canned-responses` | any (mobile: every role, G3) | P2 |
| DSH-1 | GET | `/dashboard/all` (written contract: `/dashboard`, §8) | any (scoped) | MVP |
| NTF-1 | GET | `/notifications` | own | MVP |
| NTF-2 | GET | `/notifications/count` | own | MVP |
| NTF-3 | POST | `/notifications/:id/read` | own | MVP |
| NTF-4 | POST | `/notifications/read-all` | own | MVP |
| NTF-5 | POST | `/notifications/device-token` `{ token, platform }` | own | confirmed 2026-11-05 (G7) |
| NTF-6 | DELETE | `/notifications/device-token` `{ token, platform }` | own | confirmed 2026-11-05 (G7) |
| APR-1 | GET | `/approvals/pending` | own | P2 |
| APR-2 | POST | `/approvals/:id/approve` | approver | P2 |
| APR-3 | POST | `/approvals/:id/reject` | approver | P2 |
| APR-4 | POST | `/approvals` | ADMIN, AGENT | P2 (G3) |
| ANN-1 | GET | `/announcements/active` | any | P2 |
| KB-1 | GET | `/kb/categories` | public | P2 |
| KB-2 | GET | `/kb/articles` | public | P2 |
| KB-3 | GET | `/kb/search` | public | P2 |
| KB-4 | GET | `/kb/articles/:slug` | public | P2 |
| KB-5 | POST | `/kb/articles/:id/helpful` | public | P2 |
| SCR-1 | GET | `/service-catalog/categories` | any | P2 (G4) |
| SCR-2 | GET | `/service-catalog/items` | any | P2 (G4) |
| SCR-3 | GET | `/service-catalog/items/:id` | any | P2 (G4) |
| SCR-4 | GET | `/service-catalog/requests` | any (END_USER own) ⚠ (mobile: own rows only) | P2 (G4) |
| SCR-5 | POST | `/service-catalog/requests` | any | P2 (G4) |
| SCR-6 | GET | `/service-catalog/requests/:id` | any (ctrl) ⚠ (mobile: own request only) | P2 (G4) |
| AUD-1 | GET | `/audit-logs`, else `/audit-log` (§10.5) | ADMIN | P2 (G8; confirmed 2026-11-05) |

## iOS-A. The iOS app and this contract (iOS-5e, 2026-11-03; iOS-5f, 2026-11-06)

> A lettered section, so no Android section number can clash with it (`docs/ios/ANDROID-DELTA.md` §1, decision 6). Everything above is Android's text, verbatim at `d8626bc` (iOS-5f; before it `8b522e3`).

- **NTF-5 and NTF-6 (§9) describe the Android app only.** G7's push client (G7c) is **not ported** to iOS: `ios-dev` has no `expo-notifications`, no `src/push/`, and calls neither endpoint. The lines that say "Mobile (G7): … called from `src/push/registration.ts`" or "from `useSignOut` … NTF-6" are Android's; on iOS sign-out sends AUTH-3 only, as before. Pinned by `tests/rbac/approvals-visibility.test.mjs` ("G7c (push) is not in the iOS app").
  - **iOS-5f:** the 2026-11-05 confirmation of NTF-5/NTF-6, NTF-6's new `{ token, platform }` body and the `google-services.json` lines (NTF-2, NTF-5) change nothing on iOS. Push stays out (ANDROID-DELTA §10, decision 4, E2).
- **DSH-1 (§8), TKT-1's created-date filter, APR-1 (§10) and AUD-1 (§10.5)** are used on iOS exactly as these sections say for "Mobile": the same params, the same allow-lists, the same ADMIN-only rule for AUD-1. The iOS interface differs only (`docs/ios/ANDROID-DELTA.md` §9, §10).
  - **AUD-1 since iOS-5f:** `/audit-logs` first and `/audit-log` as the fallback, the `action`, `dateFrom`, `dateTo` and `ticketNumber` filters, and the "No ticket #n" check, exactly as §10.5's "Mobile" says (ANDROID-DELTA §10, E3).
  - **DSH-1:** unchanged, `/dashboard/all`, as Ronit decided for Android on 2026-11-05.
- **AUTH-P1 on iOS (iOS-5f, Ronit's decision 1, 2026-11-06): one call, to the confirmed path only.**
  - Android's tolerance above is **not ported**: no list of four paths, no second name for the email, no alternative key names. iOS sends **one** `POST` to the path the backend team confirmed in writing, with the confirmed body, and reads the confirmed 200.
  - **iOS never calls `POST /api/v1/auth/login`.** §1.5's "Exception since 2026-11-05" is Android's. On iOS, `/auth/login` stays do-not-call with no exception.
  - UAT builds only, gated by `EMAIL_SIGN_IN_ENABLED` exactly as on Android. A `production` build never shows the form or makes the call.
  - **The confirmed contract: ⏳ PENDING.** On 2026-11-06 the iOS-5f brief's contract fields (path, body, 200, errors) were still placeholders. iOS-5f STEP 7 stops for them, and they are recorded here, in `02-AUTH.md` §iOS-A and in `docs/G9-PASSWORD-LOGIN.md` §iOS-A when Ronit fills them in. Until then no iOS code calls AUTH-P1.
  - §1.5's cookie line names Android's mechanism (`CookieJar.NO_COOKIES`). The iOS counterpart (`withCredentials: false` → `HTTPShouldHandleCookies = NO` in React Native's iOS networking) is proven from source at STEP 7, and recorded in `02-AUTH.md` §iOS-A.
- **No other endpoint, param or write** was added on iOS in iOS-5e or iOS-5f.
