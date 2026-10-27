# G2 — How the web portal filters the ticket list

**Phase G2, 2026-10-22.** Read-only inspection of the web repo clone at HEAD `d7f3887` (unchanged before and after).
This file records what the web portal **actually does** when it filters the ticket list, so mobile can do the same.
Every statement cites the source. Where the source does not settle something, this file says so.

**Paths**
- `FE:` = `frontend/src/`; `TLP` = `FE:pages/tickets/TicketsListPage.tsx`.
- `BE:` = `backend/src/`; `TC` = `BE:modules/tickets/tickets.controller.ts`.
- Line numbers are as of today.

**Two facts that apply to every filter**
- **Every filter is server-side.** Each control writes one key of a single `filters` object (`TLP:256-268`), and that object, plus the country, is the TKT-1 query (`TLP:161-170`; `FE:api/tickets.api.ts:42-43` passes it as `params` unchanged). The page filters nothing on the device. The only client-side logic on the list is display: the hold-adjusted SLA badge and the "customer replied" highlight (`TLP:34-57, :615-620`). Neither hides or reorders rows.
- **The page has one role check**, for the triage AGENT's "All countries" (`TLP:86`). Every filter control is rendered for every role (`TLP:465-588`). Whether its options load depends on the endpoint's role guard (§2).

---

## 1. The filters the web offers

| Filter | Control | Query parameter and value | Server | Source |
|---|---|---|---|---|
| Search | Text box; applied on Enter or the 🔍 button, not per keystroke | `search=<text>` | All digits: exact `ticketNumber`. Otherwise case-insensitive contains on title, requester name, requester email, assignee name | `TLP:467-481, :270-282`; `TC:133-150` |
| Status | `<select>`: "All Statuses" + 12 statuses | `status=<ONE_STATUS>` (single value from this control) | `status` exact, or `in` for a comma list (the dashboard links send lists) | `TLP:484-491, :28`; `TC:114-116` |
| **Priority** | `<select>`: "All Priorities", `LOW`, `MEDIUM`, `HIGH`, `URGENT` (raw enum text) | `priority=<LOW\|MEDIUM\|HIGH\|URGENT>`, one value | `priority` exact | `TLP:494-501, :58`; `TC:117` |
| Sort | `<select>`: Updated (default), Priority, SLA Due | `sortBy=priority` \| `sortBy=sla` \| absent | `priority desc` \| `slaResolveDue asc` \| `updatedAt desc` | `TLP:504-512`; `TC:157-161` |
| **Date (From, To)** | Two `<input type="date">` in the "More Filters" row, each optional and independent | `fromDate=YYYY-MM-DD`, `toDate=YYYY-MM-DD` | On **`createdAt`**: `fromDate` → `gte <day>T00:00:00.000Z`, `toDate` → `lte <day>T23:59:59.999Z` (UTC day bounds, inclusive) | `TLP:531-546`; `TC:125-130` |
| **Technician** | `<select>` "All Technicians" + the loaded technicians, labelled `displayName \|\| email` | `assignedToId=<user UUID>` | `assignedToId` exact | `TLP:549-558`; `TC:120` |
| **Group** | `<select>` "All Groups" + the loaded teams, labelled `name` | `teamId=<team UUID>` | `teamId` exact | `TLP:561-570`; `TC:121` |
| **Category** | `<select>` "All Categories" + **top-level categories only**, sorted by name | `categoryId=<category UUID>` | `categoryId` **exact**: a ticket filed under a sub-category or item of that category does **not** match | `TLP:573-586`; `TC:122` |
| Country | The navbar country selector, not this panel | `countryId` (see 05 §A.12) | | `TLP:81-86, :161-164` |
| Requester | No control; only from a URL (`?requesterId=`, e.g. "Previous requests") | `requesterId=<UUID>` | Ignored for END_USER | `TLP:103, :123-134`; `TC:123` |
| Saved views, CSV export | Out of scope for mobile (WEB-VS-MOBILE-ROLES §6) | | | `TLP:181-254, :297-393` |

- **No preset date ranges** ("today", "this week") exist anywhere on the page. The two date inputs are free.
- **No validation:** a From after To is sent as is and returns an empty list (`TLP:531-546`; `TC:125-130`).
- **Impact and urgency** are accepted by TKT-1 (`TC:118-119`) and typed in `FE:api/tickets.api.ts:13-14`, but no control on the page sets them.
- `pageSize: 20` is sent and ignored; the server uses its default `limit` of 25 (`TLP:94`; `BE:utils/pagination.ts:16-19`; 01 §0.6 #9). The web pages with Previous / Next (`TLP:712-734`).

## 2. Which roles see each filter, and how the options load

| Filter | Shown to | Options come from | Works for | Source |
|---|---|---|---|---|
| Priority | every role | the hard-coded list | every role | `TLP:58, :494-501` |
| Date | every role (inside "More Filters") | free input | every role | `TLP:528-546` |
| Category | every role (inside "More Filters") | `GET /categories?flat=true` (LKP-1), query key `categories-flat`; any role may call it. Filtered to `!c.level \|\| c.level === 'CATEGORY'`, sorted by `name.localeCompare` | every role | `TLP:149-152, :579-585`; `FE:api/categories.api.ts:8-9`; `BE:modules/categories/categories.router.ts:10`, `categories.controller.ts:20-40` |
| Technician | every role (inside "More Filters") | `GET /users?role=AGENT&isActive=true&limit=100` (`usersApi.list` maps `pageSize` to `limit`). Route guard `agentOrAdmin` | **ADMIN, AGENT.** END_USER and L2_MANAGER get a 403, the query fails, and the select shows only "All Technicians" | `TLP:153-156`; `FE:api/users.api.ts:5-6`; `BE:modules/users/users.router.ts:16`, `users.controller.ts:33-67`; `BE:middleware/rbac.middleware.ts:22` |
| Group | every role (inside "More Filters") | `GET /teams` with **no** `countryId` (LKP-2). Route guard `agentOrAdmin` | **ADMIN, AGENT.** END_USER and L2_MANAGER get a 403 and see only "All Groups" | `TLP:145-148`; `FE:api/teams.api.ts:5-6`; `BE:modules/teams/teams.router.ts:8`, `teams.controller.ts:17-28` |

**How the option lists are scoped by the viewer's role: they are not.**
- **Technicians:** every **active user whose role is AGENT**, in the whole system, ordered by `displayName`, at most 100 (`BE:users.controller.ts:44-63`; `BE:utils/pagination.ts:18`). ADMIN, a triage AGENT and a country-locked AGENT all get the same list. ADMINs and L2 managers who work tickets are not in it.
- **Groups:** every team in the system, **inactive ones included**, ordered by name (`BE:teams.controller.ts:19-26`). The web does not pass the viewer's country (`TLP:147`), so a country-locked AGENT is offered every country's groups.
- **Categories:** every active top-level category, all countries, because no `countryId` is sent (`TLP:151`; `categories.controller.ts:25-27`).
- **The results are scoped, the options are not.** Whatever is picked, the server ANDs it with the role scope (`TC:57-86, :112-131`): END_USER sees only their own tickets, an AGENT their own and their groups', L2 their teams', ADMIN everything. Picking a group the viewer is not in therefore shows only that group's tickets inside the viewer's own scope.

## 3. How filters combine

- **All AND, in one request.** The controller spreads every present key into one Prisma `where` with the role scope and the country (`TC:98-131`). One value per key: picking a new technician replaces the previous `assignedToId` (`TLP:256-258`).
- Search adds an `OR` across the text fields. For AGENT (with no non-empty `countryId`) and L2_MANAGER that `OR` overwrites the scope `OR` (`TC:143`, 05 C.7). This is the known scope bug; it is not a filter feature, and mobile does not rely on it or work around it.
- Any filter change goes back to page 1 (`TLP:258, :272`).

## 4. Default state, clearing, persistence

| Question | Web behaviour | Source |
|---|---|---|
| Default | No filter, sort by Updated, page 1. "More Filters" starts closed, unless a date, technician, group or category is already set | `TLP:92-107, :139-142` |
| Arriving from a link that carries filters (dashboard KPI cards and charts: `?status=`, `?sla=`, `?assignedToId=`, `?teamId=`) | Only the link's parameters apply. The filters stored from the last visit are **not** restored, so priority, dates, technician, group, category, sort and search all start empty | `TLP:89-90, :92-107`; links `FE:pages/dashboard/DashboardPage.tsx:346-393, :564-601` |
| "Clear" button | Shown when any of status, priority, search, from, to, technician, group, category or requester is set (not for sort alone) | `TLP:395-397, :519-524` |
| What "Clear" resets | **Everything in the panel:** status, priority, search text, dates, technician, group, category **and the sort** (the state becomes `{ page: 1, pageSize: 20 }`). It keeps the country and a requester from the URL | `TLP:284-295` |
| Clearing one filter | Choose its "All …" option, or empty the date input; each sends the key as absent | `TLP:258` (`value \|\| undefined`) |
| Persistence across navigation | Each change is written to `sessionStorage['tickets:lastFilters']` without page, country, requester and search, and restored on the next visit that has no filter parameters in the URL. The sidebar's Tickets link reopens the last list URL (`lastTicketsUrl`, search removed). Both live as long as the browser tab | `TLP:60-70, :88-90, :113-119, :256-268`; `FE:layouts/AppLayout.tsx:108-112` |
| After logout | Neither key is cleared (`handleLogout` only clears the user), so the next person to sign in **in the same tab** gets the previous person's filters back | `FE:layouts/AppLayout.tsx:83-92` |
| Query cache | 30 s stale time per filter combination | `TLP:166-170` |
| No result | "No tickets found", with no action (the Clear button above stays available) | `TLP:660-666, :706-708` |

## 5. What mobile builds, and where it differs

| Filter | Mobile (G2) | Same as the web? |
|---|---|---|
| Priority | Every role. "All priorities" + Low, Medium, High, Urgent. Sends `priority=` | Yes |
| Category | Every role. "All categories" + the active top-level categories from LKP-1, sorted by name. Sends `categoryId=` (exact). The field says that sub-categories are not included | Yes, plus that one-line hint |
| Date | Every role. "Created from" and "to", each optional, picked with the system date picker; the device's calendar day is sent as `YYYY-MM-DD` on `createdAt`, as the browser's date input does. A From after To is allowed (empty list), with a notice | Yes; picker instead of typing |
| Technician | **ADMIN, AGENT** (triage and country-locked alike). Hidden for END_USER and L2_MANAGER, whose web select is always empty (403). Search by name or email through **USR-3** `GET /users/search?q=&role=AGENT` (active AGENTs, up to 20 per search). Sends `assignedToId=` | Same people and same parameter. The web shows its first 100 AGENTs in a list from `GET /users`, which is not in the mobile API contract (01), so mobile searches the same population instead |
| Group | **ADMIN, AGENT.** Hidden for END_USER and L2_MANAGER (403 on the web). All groups from LKP-2 with no `countryId`, inactive ones included and marked, by name. Sends `teamId=` | Yes |
| Status | The existing named filters (All, Open, My open, Unassigned, Pending, Overdue, Due soon, Resolved, Closed) stand in for the web's status select | Kept from earlier phases (08 §4.5) |
| Where | A "Filters" sheet (M3 → full-height modal), opened from a button beside the search box that shows how many of the five are active. A line under the quick filters lists everything active, with **Clear all** | Panel layout differs; same controls |
| Combining | One TKT-1 request; every filter ANDed by the server with the named filter, search, sort and country | Yes |
| One technician slot | "My open" and "Unassigned" set `assignedToId` too. As on the web there is one value: choosing one of those chips drops the technician filter, and choosing a technician moves the chip back to All | Yes (the web's last-choice-wins) |
| Clear all | The web's Clear: named filter → All, search, the five filters and the sort. Country kept | Yes |
| From a Home tile | Like a dashboard link: the tile's filter only; the five, search and sort start empty | Yes |
| Persistence | In memory for the app session: kept across navigation, gone when the app is closed, and **wiped on sign-out** | Web keeps it per tab and does not clear it on logout (§6 W-G2-4) |
| Empty result | "No tickets match these filters" with a **Clear all filters** button | Web has no action in the empty list (G2 brief asks for one) |
| Paging | Infinite scroll and pull-to-refresh, 20 per page, with every filter applied | Web pages with Previous / Next |
| Client-side filtering | **None.** All five are TKT-1 parameters, as on the web | Yes |

## 6. Web defects found (report only, R3)

- **W-G2-1. The category filter misses most tickets.** It offers only top-level categories (`TLP:580`) but the server matches `categoryId` exactly (`TC:122`). A ticket is filed under the deepest level chosen (TKT-2 sends the deepest selected level), so tickets under a sub-category or item never match their top-level category. Mobile matches the web and says so on the field.
- **W-G2-2.** The Technician and Group selects are shown to END_USER and L2_MANAGER, whose lookups get a 403, so the selects are always empty (`TLP:145-156`). Already ROLE-MATRIX §1.4.
- **W-G2-3.** The technician list is AGENTs only and stops at 100 (`TLP:155`). An ADMIN or L2 manager who works tickets cannot be picked, and with more than 100 active AGENTs some are silently missing.
- **W-G2-4.** Stored filters and the last list URL survive logout in the same tab (`FE:layouts/AppLayout.tsx:83-92`), like the country selection (W9). The next user's list opens with the previous user's technician, group or dates.
- **W-G2-5.** The date inputs give the browser's local calendar day, but the server reads it as a UTC day (`TC:127-128`). In Tanzania (UTC+3) a ticket created between 00:00 and 02:59 local time counts for the previous day. Mobile sends the device's day the same way, so both clients agree.
- **W-G2-6.** A From after To silently returns nothing (`TLP:531-546`).

## 7. Not determinable from the source

- How many active AGENTs UAT has, so whether the web's 100-technician cap bites there. Nothing was called.
- Whether UAT has inactive groups that still own tickets. Mobile shows them, marked "Inactive", as the web lists them.
