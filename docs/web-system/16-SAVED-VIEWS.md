# 16 — Saved views (the web's "Views"), read from source

Written 2026-11-17 for Ronit's brief "saved filters sync with the web, multi-select dropdowns, the switch in the
drawer". Read-only inspection of the web clone; nothing in it was changed or run.

**What was read**
- The clone at `Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform`, branch `master` at **`7df97c8`** (committed
  2026-11-05 06:24 +0200). Cloned 2026-11-16 11:26; last `git fetch` 2026-11-16 14:30.
- Every one of the 15 remote branches was compared with `master` for the files below (`git diff --stat`). The saved-views
  module is the same on every branch: `git log --all -- backend/src/modules/savedViews` lists only `f1f9329` and `6dac405`.
- Abbreviations:
  - `SVC` = `backend/src/modules/savedViews/savedViews.controller.ts`;
  - `SVR` = `backend/src/modules/savedViews/savedViews.router.ts`;
  - `TC` = `backend/src/modules/tickets/tickets.controller.ts`;
  - `TLP` = `frontend/src/pages/tickets/TicketsListPage.tsx`;
  - `schema` = `backend/prisma/schema.prisma`.
  - Line numbers are at `7df97c8` unless a branch is named.

---

## 1. The four operations and their mounted paths

The router is mounted at `/api/v1/saved-views` (`backend/src/app.ts:53` import, `:160` `app.use('/api/v1/saved-views', savedViewsRouter)`).

| ID | Method and path | Router | Controller | Auth |
|---|---|---|---|---|
| SVW-1 | `GET /api/v1/saved-views?entityType=<t>` | `SVR:7` | `listSavedViews`, `SVC:14-24` | `requireAuth` only: every role |
| SVW-2 | `POST /api/v1/saved-views` | `SVR:8` | `createSavedView`, `SVC:26-42` | `requireAuth` only |
| SVW-3 | `PUT /api/v1/saved-views/:id` | `SVR:9` | `updateSavedView`, `SVC:44-63` | `requireAuth`; owner only (`SVC:47`) |
| SVW-4 | `DELETE /api/v1/saved-views/:id` | `SVR:10` | `deleteSavedView`, `SVC:65-71` | `requireAuth`; owner only (`SVC:68`) |

- No role guard on any of them (`SVR:7-10`): END_USER, AGENT, L2_MANAGER and ADMIN all have their own views.
- `requireAuth` reads the `sd_session` cookie first, then `Authorization: Bearer` (`backend/src/middleware/auth.middleware.ts:7`). The app sends only the Bearer header (01 §0.1).

## 2. `savedViewSchema` (`SVC:6-12`), verbatim

```ts
const savedViewSchema = z.object({
  name: z.string().min(1),
  entityType: z.string().min(1),
  filters: z.any(),
  columns: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
});
```

| Field | Type | Required on create (SVW-2) | Notes |
|---|---|---|---|
| `name` | string, at least 1 character | yes | Not trimmed, so `" "` passes. No maximum length. **Not unique**: two views may share a name |
| `entityType` | string, at least 1 character | yes | Free text. The web writes and lists `'ticket'` only (`TLP:183`, `:189`) |
| `filters` | `z.any()` | **in practice yes** | The schema accepts anything, including nothing. But the column is a required `Json` (§3), so a body without `filters`, or with `filters: null`, reaches Prisma and fails as a **500** |
| `columns` | string[] | no, default `[]` | The web on `master` never sends it. A newer web branch does (§6) |
| `isDefault` | boolean | no, default `false` | See §4 |

- **SVW-3 (update)** parses `savedViewSchema.partial()` (`SVC:49`). With zod 3 (`backend/package.json:54`, `^3.22.4`), a field left out of a partial object stays out: its default is not applied and the key is not set. So `PUT { name }` changes the name **and nothing else**: `filters`, `columns`, `isDefault` and `entityType` keep their stored values. A `PUT` that sends `filters` replaces the whole stored object; nothing is merged.
- A failed parse is `400 { "error": "Validation error", "details": { <field>: [<message>] } }` (`backend/src/middleware/errorHandler.middleware.ts:12-17`).

## 3. The Prisma model and how views are scoped

`schema:1783-1796`, verbatim:

```prisma
model SavedView {
  id         String   @id @default(uuid())
  name       String
  entityType String
  filters    Json
  columns    String[]
  userId     String
  isDefault  Boolean  @default(false)
  createdAt  DateTime @default(now())

  user User @relation("UserViews", fields: [userId], references: [id], onDelete: Cascade)

  @@map("saved_views")
}
```

The relation's other side is `User.savedViews` (`schema:165`).

- **Per user, and only per user.**
  - Every view has one `userId`, set from the token on create (`SVC:28`, `:39`).
  - The list returns only the caller's views (`SVC:15-17`, `where: { userId }`).
  - Update and delete refuse anyone else's view with `403 "Not authorized"` (`SVC:47`, `:68`).
- **Not per country.** There is no country column, and nothing reads the country.
- **Not shared.** No team, role or public flag. Nobody sees another person's views, not even an ADMIN.
- **Per environment by nature.** UAT and Production have separate databases, so a view saved on UAT is never listed on Production.
- **Deleted with the user** (`onDelete: Cascade`).
- **No `updatedAt`.** The list is ordered `createdAt desc`, newest first (`SVC:21`).
- **Not created by any migration.** No file in `backend/prisma/migrations/` mentions `saved_views`. This matches 03's note that the database is managed with `prisma db push`. Where the table is missing, every SVW call is a 500, and the app shows that failure (§9).

## 4. `isDefault`

- On create with `isDefault: true`, the server first clears `isDefault` on every view of the same user and the same `entityType` (`SVC:31-36`, `updateMany`), then creates the new one. On update with `isDefault: true` it does the same for the stored view's `entityType` (`SVC:51-56`). So **at most one default per user per entity type**, when it is set through the API.
- Nothing reads it. The web on `master` never sends `isDefault` and never looks at it: `TLP:186-200` creates without it, and `TLP:221-254` loads a view without checking it. No page opens a default view by itself.
- The app never sends `isDefault` and ignores it. A default set by some other client survives, because a rename sends only `name` (§2).

## 5. How the filter set is stored

**One JSON blob per view**: the `filters Json` column (`schema:1787`). It is not split into named columns and it is not a query string.

- The server stores whatever `filters` the client sent (`z.any()`, `SVC:9`; `create({ data: { ...data, userId } })`, `SVC:38-40`). It does not validate, normalise, or check that the IDs exist.
- It is never interpreted server-side: TKT-1 does not read saved views. Applying a view is the client copying the blob back into its own filter state (§6).
- `columns` is a separate `String[]` column (`schema:1788`), for the table's columns, not for filters.

## 6. What the web sends, and what it reads back

**Save**: `TLP:186-200` on `master`, verbatim:

```ts
const saveViewMutation = useMutation({
  mutationFn: () => savedViewsApi.create({
    name: viewName,
    entityType: 'ticket',
    filters: {
      status: filters.status,
      priority: filters.priority,
      sortBy: filters.sortBy,
      assignedToId: filters.assignedToId,
      teamId: filters.teamId,
      categoryId: filters.categoryId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
    },
  }),
```

- `savedViewsApi.create` is `client.post('/saved-views', data)` (`frontend/src/api/saved-views.api.ts:7-13`), base `/api/v1` (`frontend/src/api/client.ts:5`).
- Every value is a string or `undefined` (`TicketFilters`, `frontend/src/api/tickets.api.ts:4-22`). `JSON.stringify` drops the `undefined` ones, so **the stored object holds only the keys that were set**, for example `{"status":"OPEN","priority":"HIGH"}`.
- **The name** is whatever was typed in the views bar (`TLP:442-449`), not trimmed. Save is blocked only while it is blank (`TLP:450-451`).
- **What each value can be**, from the web's own controls on `master`:

| Key | Value | Source |
|---|---|---|
| `status` | **one** status from the status select (`TLP:484-491`), or a **comma list** when the list was opened from a link that carried one (the URL's `status`, `TLP:97`, `:124-132`) | `TLP:28` lists the 12 statuses |
| `priority` | one of `LOW`, `MEDIUM`, `HIGH`, `URGENT` | `TLP:58`, `:494-501` |
| `sortBy` | `priority` or `sla`; left out for "Updated" | `TLP:504-512` |
| `assignedToId` | one user id (`TLP:549-558`), or `unassigned` from a URL | `TLP:101` |
| `teamId` | one team id | `TLP:561-570` |
| `categoryId` | one top-level category id | `TLP:573-586` |
| `fromDate`, `toDate` | `YYYY-MM-DD` from a date input | `TLP:533-545` |

- **Not saved by the web**: the search (`TLP:236`, loading a view clears it), the country (it comes from the navbar's country store, `TLP:76`, `:161-164`), `sla`, `requesterId`, page and page size.

**Load** (`TLP:221-254`): `loadView` reads **only those eight keys** (`TLP:223-232`) into the filter state, keeps the country and the requester from the URL (`TLP:241-242`), clears the search (`TLP:235`), and writes the same eight into the URL (`TLP:243-250`). Any other key in the blob is ignored.

**Delete**: `TLP:211-219`, after a browser `confirm` (`TLP:433`). The web never renames or updates a view: `savedViewsApi.update` (`saved-views.api.ts:15`) has no caller on `master`.

**Newer web branches.** `origin/features/UI-UX-lsaroj25` (`afc3f1b`, 2026-11-09) and `origin/features-enhancement-oct` (`a9bbffd`, 2026-11-07) send the same `filters` object plus `columns` (hunk at TLP `+304` on `afc3f1b`), and restore `columns` on load (`+338-342`). Their filters and their `loadView` keys are unchanged. They add `sortBy` values (`created`, `number`, `status`, `updated`, `due`) and a `sortDir` parameter to TKT-1 (`TC` `resolveOrderBy` on `afc3f1b`), but `sortDir` is **not** saved in a view.

## 7. Which TKT-1 filters accept more than one value (Part 3)

`TC:54` reads the query as `Record<string, string>`. The server runs Express `^4.18.3` (`backend/package.json:32`) with no `query parser` setting (`backend/src/app.ts`), so Express's default `extended` (qs) parser applies: a **repeated** key (`?x=a&x=b`) arrives as an **array**.

| Filter | Server code (`TC`, `master`) | Many values? | What two values would do |
|---|---|---|---|
| **status** | `:114-116` `q.status.includes(',') ? { status: { in: q.status.split(',') } } : { status: q.status }` | **Yes: one comma-separated value**, `status=OPEN,IN_PROGRESS` | Repeated keys: an array, which fails `includes(',')` and goes to Prisma as `status: [..]`, so a 500 |
| priority | `:117` `{ priority: q.priority }` | No | Comma list: not an enum value, so a 500. Repeated keys: an array, so a 500 |
| technician (`assignedToId`) | `:120` exact match, or `unassigned` | No | Comma list: matches no user, so **an empty list with no error**. Repeated keys: a 500 |
| group (`teamId`) | `:121` exact match | No | As technician: empty list, or a 500 |
| category (`categoryId`) | `:122` exact match | No | As technician: empty list, or a 500 |

- The same five lines are unchanged on `afc3f1b` and `a9bbffd` (only `myTeams`, `due` and the sort were added).
- **The web's multi-select category control ("Select All 1/38") is in no branch of the clone.**
  - `git log --all -G'MultiSelect|multi-select|selectAll|Select all' -- frontend/src` finds three commits, and none is a ticket-list filter:
    - `f817220` and `d2b6551`: the admin Categories page's bulk selection;
    - `b7048ed`: row selection on the list.
  - On every branch the ticket list's category, technician, group, priority and status filters are single `<select>`s (`TLP:484-586` on `master`).
  - So whatever UAT or Production serves was deployed from source that has not been pushed. Its backend may read several categories, but nothing the app can read says so, or in what form.
- **What the app did on 2026-11-17:** Status was the only multi-select. **Superseded on 2026-11-18** (next).

### 7a. 2026-11-18: every filter takes several values (Ronit's brief; read from a live URL)

- Ronit copied a URL from the **UAT portal's** ticket list with three categories and two technicians ticked:
  `categoryId=<a>%2C<b>%2C<c>&assignedToId=<x>%2C<y>`. So the live format is **ONE parameter holding comma-separated
  ids**: not repeated keys, not an array. The clone (above, re-read 2026-11-18 at `7df97c8` on all 16 refs) still reads
  one value for each: **the deployed server differs from the source**, as with the audit log and push.
- The app now sends status, priority, category, technician and group that way (`01-API-CONTRACT.md` TKT-1).
- **How the web stores several values in a view: a comma STRING, by every sign the clone gives; not confirmed.**
  - In the source, every value in the blob is a string (`TicketFilters`, §6), and a status list that came from a URL is
    stored as the same comma string the URL holds (`TLP:97`, `:124-132`, `:186-200`).
  - The live portal keeps its multi-value filters in the URL as one comma string (Ronit's URL). On `master` the URL, the
    filter state and the saved blob are one object of strings, so its views most likely hold `"categoryId": "a,b,c"`.
  - The deployed web's save code is **not in the clone**, so this is not read from code. Nothing suggests arrays.
  - **The app writes comma strings**, one per key, the same eight keys. It reads comma strings. An ARRAY in a view is
    not guessed at: it is named as left out ("Category “[…]” (not readable by the app)") and not sent, so if the web
    does store arrays, the app says so on the first such view rather than applying something else.
  - **To confirm (Ronit, on UAT, no code):** save a view on the web portal with two categories ticked, then open the
    browser's network tab on the Views list (`GET /api/v1/saved-views?entityType=ticket`) and look at that view's
    `filters.categoryId`: a string `"a,b"` means the two clients agree; an array means they do not, and the app's
    reader needs a change.
- Comparing a view with the list ignores the order inside a list (`savedViewKey` sorts ids; status and priority in the
  03 order), since the web and the phone may tick in another order.

## 8. Can the stored shape hold what the mobile Filters sheet holds?

**Not all of it.** The web's blob has eight keys and the web reads only those. The app writes exactly those keys, with the web's meanings, and **nothing else**. An extra key would be ignored by the web, so the same view would show different tickets on the web and on the phone.

**From the phone to a view:**

| On the phone | In the view | Round-trips? |
|---|---|---|
| Quick filter **Open, My open, Unassigned, Pending, Resolved, Closed** | `status` and/or `assignedToId`: what TKT-1 sends for it (`utils/ticket-filters.ts` `ticketFilterQuery`) | Yes. Read back as the same quick filter when it matches one exactly, otherwise as the Status filter (same tickets) |
| Quick filter **Overdue, Due soon** (TKT-1 `sla`), and the Home tile filters that send `sla` | **nothing can hold `sla`** | **No. The app refuses to save** and says why (UI-STANDARDS §17.2) |
| Status (multi-select) | `status`, comma list | Yes |
| Priority, category, technician, group (multi-select since 2026-11-18) | `priority`, `categoryId`, `assignedToId`, `teamId`: each one value, or a comma list (§7a) | Yes, by id. The names are not stored (§9) |
| Created From/To | `fromDate`/`toDate` | Yes |
| Sort: Last updated / Priority / Due date | no key / `sortBy=priority` / `sortBy=sla` | Yes |
| **Search** | not held (the web clears it on load, `TLP:235`) | No. The save sheet lists it under "Not kept in a saved view" |
| **Country** (ADMIN, triage AGENT) | not held (the web keeps the navbar's, `TLP:161-164`) | No. Listed the same way. Applying a view keeps the country on screen, as the web does |
| Home period's name ("This month") | its dates are kept as `fromDate`/`toDate` | The dates, yes; the name, no (as before) |

**What is lost, plainly:**
- the search;
- the country;
- the quick filters that filter by SLA (Overdue, Due soon, and the Home tiles' "SLA breached");
- the Home period's name.

The first two are not part of a view on the web either. The SLA filters are refused rather than dropped.

**From a view to the phone.** The app may meet things it cannot show:
- a key it does not know (from a newer web, for example a multi-category key);
- a value it cannot read (a status or priority outside the 03 enum, an id with characters other than UUID ones, an array, `unassigned` inside a technician list, a date in another form, a newer `sortBy`). A comma list of ids is read since 2026-11-18 (§7a);
- a filter this role cannot send (technician or group for END_USER and L2_MANAGER, "Unassigned" for them too, or a technician id for L2_MANAGER).

For each of these the app:
- **does not send it**;
- applies the rest of the view and **says what it left out**, under the chips;
- marks the view's chip with a warning icon;
- **never writes the view's filters back**: rename sends `{ name }` only (§2), and there is no "update filters". The web-set filter stays in the database exactly as the web wrote it.

## 9. What the app does (2026-11-17)

- **SVW-1** when the Filters sheet opens: `GET /saved-views?entityType=ticket`. staleTime 60 s, refetched on opening only when older than that (`src/hooks/useSavedViews.ts`). Cleared with the rest of the cache on sign-out and on the environment switch.
- **SVW-2** "Save these filters": `{ name, entityType: 'ticket', filters }`, with `filters` holding only the eight keys (§6), in the web's order, and only those set. No `columns`, no `isDefault`.
- **SVW-3** Rename: `{ name }` only.
- **SVW-4** Delete, after a confirmation that says it is deleted on the web too.
- **Never optimistic.** The list changes only after the server answers.
  - A refused or failed write is said where it was made: under the name field, or in a dialog for a delete.
  - Offline, nothing is sent ("You're offline. Nothing was sent").
  - After a failure that may have reached the server (network, timeout, 5xx), the list is re-read, so a view that did save appears.
- **Role.**
  - A saved view holds only what that role can send: `ticketListFilters()` and `isTicketFilterAllowed()` (`utils/permissions.ts`, `utils/ticket-filters.ts`).
  - The same rules cut a view down when it is read (§8).
- **Names.**
  - Views hold ids only. The app names them from the lookups it already uses: categories (LKP-1), groups (LKP-2, ADMIN and AGENT), and technicians (USR-1 by id, ADMIN and AGENT).
  - Each is loaded only while a view needs it, and cached for 10 minutes. Every id in a comma list is named (2026-11-18).
  - A name that cannot be found reads "Unknown category", "Unknown group" or "Unknown technician".
- **Names the app writes:** trimmed, at most 40 characters, and not a name already in the list (any case). The server checks none of these.
- **No cap.** The phone-only list had a cap of 20. With the server as the source, the app shows every view the web saved.
- **The phone-only filters of versionCode 6** (key `mmg.savedFilters.<env>.<userId>`) are **not uploaded**.
  - The Filters sheet lists them once in a notice: each name and what it held.
  - They are removed from the phone only when the person taps **Dismiss**.
  - Reason: they hold the search, the country and the SLA quick filters that a view cannot hold (§8). An automatic upload would also write to Production's database without the person asking.

## 10. Errors the app can meet

| Call | Answer | Meaning | App |
|---|---|---|---|
| all | 401 | session over | the usual sign-out (02 §5.3) |
| SVW-1 | 200 `[]` | no views | "Save the filters you use often…" |
| SVW-1 | not an array | drift | error state, Retry |
| SVW-2 | 201 row | saved | added to the list |
| SVW-2 | 400 Validation error | bad body (cannot happen from the app) | the server's words |
| SVW-3/4 | 404 "View not found" | deleted elsewhere | removed from the list, and the person is told |
| SVW-3/4 | 403 "Not authorized" | not the caller's | cannot happen: the list holds only the caller's |
| all | 500 | table missing, `filters` null, or a database error | "The Service Desk reported an error…" |

## 11. Findings (reported, not fixed: R3)

- **B.42** `name` is not trimmed, has no maximum and is not unique (`SVC:7`). The web blocks a name that is blank once trimmed (`TLP:446`, `:450`), but stores what was typed, leading and trailing spaces included (`TLP:188`).
- **B.43** `filters: z.any()` (`SVC:9`) makes a missing or `null` `filters` a 500, not a 400.
- **B.44** SVW-3 accepts `entityType` (`SVC:49`), so a view can be moved to another entity type. When it is moved with `isDefault: true`, the default is cleared under the **old** type (`SVC:53`).
- **B.45** No migration creates `saved_views` (§3).
- Added to `05-RULES-AND-GAPS.md` §B.
