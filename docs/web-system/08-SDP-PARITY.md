# 08 — SDP Parity (ManageEngine ServiceDesk Plus Cloud for Android vs MMG backend)

> **Purpose.** Our design reference is the ManageEngine ServiceDesk Plus Cloud ("SDP") Android app. This file records, feature by feature, what the MMG backend can support today, what needs backend work, and what does not apply to MMG. `04-SCREEN-MAP.md` was revised from it (§5).
>
> **Sources**
> - The SDP feature list comes from the brief only. No web browsing was done.
> - Every MMG claim was re-checked on 2026-10-14 against the web repo at `master` @ **`d7f3887`**, read-only. This is the same commit the other docs are pinned to, so their line references still hold.
> - Paths are relative to `backend/src/` unless prefixed. `FE:` = `frontend/src/`. `schema:` = `backend/prisma/schema.prisma`.
> - Endpoint IDs (`TKT-6` etc.) refer to `01-API-CONTRACT.md`. Ask IDs (`A7`, `A19` etc.) refer to `06-BACKEND-ASKS.md`.
>
> **Verdict key**
> - **BUILD NOW**: the backend supports it today through endpoints in `01`, and it goes in the Android MVP.
> - **BUILD LATER**: the backend supports it, but it is Phase 2. Usually it needs a new `01` contract entry (with Ronit's OK) or is low value for the MVP.
> - **NEEDS BACKEND**: an endpoint, field or model is missing. The ask is named.
> - **NOT APPLICABLE**: MMG has no such concept, or offering it would break an MMG rule.

---

## 1. Feature parity table

| # | SDP Feature | MMG backend support (evidence) | Endpoint(s) (`01`) | Verdict | Notes |
|---|---|---|---|---|---|
| **Navigation** | | | | | |
| 1.1 | Side drawer ("Menu") of modules | Client-side only. Module availability per row below | — | **BUILD NOW** | Hybrid design: drawer plus 3 bottom tabs (§3) |
| 1.2 | Each module has its own list, filter and search | Tickets: TKT-1 filters (`modules/tickets/tickets.controller.ts:52-161`). KB: KB-2/KB-3. Approvals: APR-1 (unfiltered, so filtering is client-side). Announcements: ANN-1 (unfiltered) | TKT-1, KB-2, KB-3, APR-1, ANN-1 | **BUILD NOW** | Tasks and Assets lists: see 1.38 and 1.56 |
| **Request list view** | | | | | |
| 1.3 | Filter: request type Incident / Service / Both | `Ticket` has **no type field** (`schema:340-409`). Service requests are a separate model, `ServiceRequest` (`schema:962`), with separate endpoints (`modules/serviceCatalog/serviceCatalog.router.ts`). The web "Incident Request" chip is derived from `source` (`FE:pages/tickets/TicketDetailPage.tsx:718`) | — | **NOT APPLICABLE** | MMG tickets ≈ SDP incidents; MMG service requests are their own module (Phase 2, `04` P2/P3). "Both" would merge two differently scoped and paginated lists. Do not build |
| 1.4 | Named filters: unassigned, pending, open, overdue, my open | All server-side on TKT-1: `assignedToId=unassigned`, `status=<comma list>`, `sla=BREACHED`, `assignedToId=<me>` (`tickets.controller.ts:112-131`) | TKT-1 | **BUILD NOW** | Exact mapping in §4.5 |
| 1.5 | Search box | `search`: all digits → exact `ticketNumber`; otherwise contains-match on title, requester name, requester email, assignee name (`tickets.controller.ts:133-150`) | TKT-1 | **BUILD NOW** | ⚠ For AGENT/L2 a text search drops the role scope (`05` C.7). Do not rely on it; A7 |
| 1.6 | Search field selector (ID / subject / requester name) | No field parameter. One `search` covers four fields (above) | TKT-1 (partial) | **NEEDS BACKEND** | Missing: `searchField` param → **A22**. "ID" works today (digits). "Requester" has a supported alternative for ADMIN/AGENT: a USR-3 picker plus `requesterId=` (§4.4) |
| 1.7 | Floating "Add Request" → form | `POST /tickets` (`tickets.controller.ts:185-469`) | TKT-2, LKP-1, ATT-2 | **BUILD NOW** | Existing M8 |
| 1.8 | Template picker before the form | `TicketTemplate` exists (`schema:1145-1170`), but `GET /templates` is ADMIN/AGENT only (`modules/templates/templates.router.ts:7,9`), returns inactive rows and creator emails (`templates.controller.ts:20-28`), and is out of scope in `01` App. A. The web create page uses no templates. The web calls catalog items "service templates" (`FE:pages/service-catalog/ServiceCatalogPage.tsx:454`) | — | **NEEDS BACKEND** | Missing: a template list readable by every role → **A28**. Staff-only use is possible later from the existing route (P15) |
| 1.9 | Tap-and-hold multi-select | Client-side only | — | **BUILD NOW** | Actions 1.10–1.14; cap in §4.2 |
| 1.10 | Bulk: Pick up | No bulk route (`modules/tickets/tickets.router.ts:16-25`). N × `POST /tickets/:id/assign` | TKT-5 ×N | **BUILD NOW** | ADMIN/AGENT. Capped at 20, sequential (§4.2) |
| 1.11 | Bulk: Assign technician | As 1.10 | TKT-5 ×N, LKP-2, USR-3 | **BUILD NOW** | ADMIN/AGENT. Capped |
| 1.12 | Bulk: Merge | No merge route in any router; `01` §2 "Not in the tickets router" | — | **NEEDS BACKEND** | Missing: `POST /tickets/:id/merge` → **A25** |
| 1.13 | Bulk: Delete | No `DELETE /tickets/:id` (`tickets.router.ts:16-25`). The web offers no ticket delete | — | **NOT APPLICABLE** | MMG keeps tickets for audit and SLA reporting; the equivalent is status `CANCELED` (from IN_PROGRESS, `05` §A.1). The mobile UI offers only actions the web offers (`CLAUDE.md` rule 6). Not asked for |
| 1.14 | Bulk: Close | N × `POST /tickets/:id/status {status:'CLOSED', resolution, closureComments, …}` | TKT-6 ×N | **BUILD NOW** | Staff. Only tickets whose status allows Close in the transition map (`05` §A.1). Each close emails the requester and posts a public comment. Capped (§4.2) |
| 1.15 | Status drop-down on each card | `POST /tickets/:id/status` (`tickets.controller.ts:841-994`) | TKT-6 | **BUILD NOW** | Transition map only (`05` §A.1, D1). Hidden for END_USER. §4.1 |
| 1.16 | Sort: last updated, priority | `sortBy=priority` → priority desc; default → `updatedAt` desc; also `sortBy=sla` → `slaResolveDue` asc (`tickets.controller.ts:157-161`) | TKT-1 | **BUILD NOW** | Three fixed sorts, no direction toggle |
| 1.17 | Sort: request ID, status, subject, requester name; ascending/descending | Not accepted. Any other `sortBy` falls back to `updatedAt` desc | — | **NEEDS BACKEND** | Missing: `sortBy` allow-list + `sortOrder` → **A21**. Client-side sort of a paged list would be wrong, so it is not offered |
| 1.18 | Assign flow: technicians filtered by group, with search | Group members: LKP-2 `members[].user` (ADMIN/AGENT). Recommended: TKT-10. Search: USR-3 (ADMIN/AGENT) | LKP-2, TKT-10, USR-3, TKT-5/TKT-4 | **BUILD NOW** | Existing M7 plus a group selector. L2 cannot assign (server 403, `05` §A.3) |
| **Request details** | | | | | |
| 1.19 | Status drop-down in the header | TKT-6 | TKT-6 | **BUILD NOW** | Same rules as 1.15 |
| 1.20 | More options → Pickup | Web "Pick up" = assign to self (`FE:TicketDetailPage.tsx:672`) | TKT-5 | **BUILD NOW** | ADMIN/AGENT |
| 1.21 | More options → Assign | | TKT-5 / TKT-4 | **BUILD NOW** | M7 |
| 1.22 | More options → Close | | TKT-6 (+ATT-2) | **BUILD NOW** | M6, closure rules `05` §A.2 |
| 1.23 | More options → Delete | No route | — | **NOT APPLICABLE** | As 1.13 |
| 1.24 | More options → Approvals (submit for approval) | `POST /approvals` exists, ADMIN/AGENT (`modules/approvals/approvals.router.ts:8`). It sets the ticket to `PENDING_MGMT_REVIEW` directly (`approvals.controller.ts:40-45`), **bypassing TKT-6's SLA-hold logic**. Approval never advances the ticket (`05` B.22). Out of scope in `01` App. A | — | **BUILD LATER** | Needs a `01` entry and Ronit's OK (P16). The SLA-hold bypass should be raised with the backend team (recorded here, not fixed) |
| 1.25 | More options → Delegate | No delegation field or route (`schema:763-783`; `approvals.router.ts:8-12`; `grep -i delegat` finds nothing in backend or frontend) | — | **NEEDS BACKEND** | Read as approval delegation, as in the SDP Approvals module → **A26**. If SDP means "hand the ticket to another technician", that is Assign (1.21) |
| 1.26 | Section: Conversations | Comments + activity | TKT-7, CMT-1, CMT-2, TKT-9 | **BUILD NOW** | Existing M4/M5 |
| 1.27 | Conversations opens from a bottom-right button | Client-side | CMT-2 | **BUILD NOW** | FAB on the Conversations section opens M5 |
| 1.28 | Section: History | Audit entries in TKT-7 (`tickets.controller.ts:996-1096`) | TKT-7 | **BUILD NOW** | Sentences per `05` §A.7 |
| 1.29 | Section: Resolution | `Ticket.resolution`, `closureCode`, `isFcr`, `closureComments` (`schema:373-377`), returned by TKT-3. Staff edit `resolution` via TKT-4 (`tickets.validator.ts:35-37`) | TKT-3, TKT-4 | **BUILD NOW** | Was a block inside M4; now its own section. END_USER read-only (D3) |
| 1.30 | Section: Notes | Notes = `Comment.type = 'PRIVATE'` (`schema:415-433`). ADMIN/AGENT get them from CMT-1 (`modules/comments/comments.controller.ts:24`) | CMT-1, CMT-2 | **BUILD NOW** | ADMIN/AGENT only. Hidden for END_USER and L2 (L2 is forced to PUBLIC on write, `05` §A.5) |
| 1.31 | Section: Worklogs | **No worklog model** (§7.1). The web "Worklog" tab is a static placeholder (`FE:TicketDetailPage.tsx:1646-1655`) | — | **NEEDS BACKEND** | **A19** |
| 1.32 | Section: Tasks | `TicketTask` (`schema:1664-1682`), nested routes (`modules/ticketTasks/ticketTasks.router.ts:7-10`) | TSK-1..TSK-4 | **BUILD NOW** | Add/edit/delete moved into the MVP (staff only, D4) |
| 1.33 | Section: Attachments | `modules/attachments/` | ATT-1..ATT-4 | **BUILD NOW** | Existing |
| 1.34 | Attachments icon with count badge | `_count.attachments` in `TICKET_INCLUDE` (`tickets.controller.ts:31-50`) | TKT-3 | **BUILD NOW** | Refetch after uploads (`05` B.18) |
| 1.35 | Section: Approvals (on the ticket) | The web loads them via the **unscoped** `GET /approvals?entityType=ticket&entityId=` (`FE:TicketDetailPage.tsx:438`; `approvals.controller.ts:90-102`), which is out of scope (`05` C.16) | — | **NEEDS BACKEND** | Missing: a ticket-scoped approvals read → **A27** |
| **Close flow** | | | | | |
| 1.36 | First call resolution | `isFcr` read raw by TKT-6 (`tickets.controller.ts:850-853, 905`) | TKT-6 | **BUILD NOW** | Checkbox, default false |
| 1.37 | Requester acknowledgement | **No field** on `Ticket` (`schema:340-409`); `grep -i acknowledg` finds no field | — | **NEEDS BACKEND** | **A30** |
| 1.38 | Comments | Nearest MMG field is `resolution` (required by the web modal, `05` §A.2) | TKT-6 | **BUILD NOW** | Label it "Resolution", as the web does |
| 1.39 | Closure code | `closureCode`, a free string; the web offers 6 fixed values (`05` §A.2) | TKT-6 | **BUILD NOW** | Send exact strings (U+2013 dashes) |
| 1.40 | Closure comments | `closureComments`; posted as a **PUBLIC** comment and put in the closed email (`tickets.controller.ts:914-928`) | TKT-6 | **BUILD NOW** | Required client-side. Warn that the requester sees it |
| **Tasks module (standalone)** | | | | | |
| 1.41 | Standalone task list with filter and search | No `/tasks` mount (`app.ts:123-162`). Tasks exist only under `/tickets/:ticketId/tasks`. The web dashboard "My Tasks" tab is a static placeholder (`FE:pages/dashboard/DashboardPage.tsx:801-813`) | — | **NEEDS BACKEND** | **A20** |
| 1.42 | Task create / edit / delete | Nested routes, no role checks (⚠ `05` C.3) | TSK-2, TSK-3, TSK-4 | **BUILD NOW** | Inside ticket detail (M11). Staff only. `dueDate` as full UTC ISO (`05` B.25) |
| 1.43 | Task attachments | `Attachment` has only `ticketId`/`commentId` (`schema:439-454`); `TicketTask` has no attachment relation | — | **NEEDS BACKEND** | **A20** (optional part) |
| 1.44 | Task comments | No task comment model | — | **NEEDS BACKEND** | **A20** (optional part) |
| 1.45 | Task worklogs | No worklog model | — | **NEEDS BACKEND** | **A19** (`taskId` FK) |
| 1.46 | "View parent request" link | `TicketTask.ticketId` is on every task row | TKT-3 | **BUILD LATER** | Only meaningful once a standalone task list exists (A20). Inside ticket detail the parent is already on screen |
| **Approvals module (standalone)** | | | | | |
| 1.47 | Card list of my approvals | `GET /approvals/pending`: `approverId = me`, `PENDING`, oldest first, not paginated (`approvals.controller.ts:105-112`) | APR-1 | **BUILD NOW** | Moved from P4 to the MVP (M12). Pending only. A history of decided approvals needs A27 |
| 1.48 | Filter all / request / change | `entityType` is on every row: `ticket` / `service_request` / `change` (`schema:765`) | APR-1 | **BUILD NOW** | Client-side filter (the list is unpaginated). Chips: All · Tickets · Service requests · Changes (S2) |
| 1.49 | Details show attachments and conversations from the parent | Ticket approvals carry no ticket data (`01` §10.1). TKT-3/TKT-7/ATT-1 by `entityId` work only when the approver may open that ticket: END_USER non-requester → 403 (`tickets.controller.ts:476-498`). AGENT works today only because AGENT is unscoped (⚠ C.6, which A7 will close). Change rows carry only `{changeNumber,title,status}`. SCR-6 → 403 for a non-requester END_USER | APR-1, TKT-3, TKT-7, ATT-1, SCR-6 | **NEEDS BACKEND** | **A27**. MVP M13 shows the approval card and tries TKT-3. On 403 it shows "You can approve this, but the details are not available on mobile". It never relies on the C.6 gap to make the screen work |
| 1.50 | Take action → comments → Approve / Reject | APR-2 (comments optional), APR-3 (comments required) (`approvals.controller.ts:114-247`) | APR-2, APR-3 | **BUILD NOW** | After a decision, show "Ticket stays Pending Management Review until a technician moves it" (`05` B.22) |
| 1.51 | Delegate to another approver | None | — | **NEEDS BACKEND** | **A26** |
| 1.52 | Revoke delegation | None | — | **NEEDS BACKEND** | **A26** |
| **Other SDP features** | | | | | |
| 1.53 | Worklogs on the ticket | None (§7.1) | — | **NEEDS BACKEND** | **A19** |
| 1.54 | Worklog timer | None. A device-only timer has nowhere to save its result | — | **NEEDS BACKEND** | **A19** |
| 1.55 | Push notifications | No device-token table, endpoint or sender (`05` B.4); SSE broken (B.3) | AUTH-P4 (pending) | **NEEDS BACKEND** | Existing ask **A5**. MVP polls NTF-2 |
| 1.56 | Assets with QR scanning | `Asset` with unique `assetTag` and `serialNumber` (`schema:807-846`). `GET /assets?search=` contains-matches name, assetTag and serialNumber, ADMIN/AGENT (`modules/assets/assets.router.ts:35`, `assets.controller.ts:79-98`). Out of scope in `01` App. A. **No QR or barcode code exists anywhere in the web repo**, so no labels are printed today | — | **BUILD LATER** | Staff-only lookup after a `01` entry (P18). Exact lookup → **A29**. Printing QR labels is an IT operations decision |
| 1.57 | Day and night mode | Client-side only. The web has no dark mode (`frontend/tailwind.config.js:3` sets `darkMode:'class'`, and `FE:` contains zero `dark:` classes) | — | **BUILD NOW** | System / Light / Dark setting in M10, stored on the device |
| 1.58 | Customisable ticket-detail field list | Client-side only. `User` has no preference fields (`schema:108-177`); `SavedView` (`schema:1730-1745`) is for list views and out of scope | — | **BUILD LATER** | Per-device preference (P14). Server sync would need a preferences store; not asked |
| 1.59 | Knowledge base search and read | KB routes, unauthenticated (⚠ `modules/knowledgeBase/kb.router.ts:14-27`, `05` C.15) | KB-1..KB-5 | **BUILD NOW** | Moved from P1 to the MVP (M14, M15). Always send Bearer; show published public articles only (`05` B.26) |
| 1.60 | Announcements | `GET /announcements/active`, filtered by `targetRoles` (`announcements.controller.ts:34-52`) | ANN-1 | **BUILD NOW** | Moved from P5 to the MVP (M16 + Home banner). The web nav hides it from END_USER (`FE:layouts/AppLayout.tsx:31`), but the server targets by role (S1) |
| 1.61 | Dashboard: pending requests | DSH-1 `kpis.totalOpen` / `currentlyOpen` (safe KPIs, `05` B.20). My pending approvals = `APR-1.length` | DSH-1, APR-1 | **BUILD NOW** | M2 tiles |
| 1.62 | Dashboard: requests due today | No due-date filter on TKT-1 (`fromDate`/`toDate` filter `createdAt`, `tickets.controller.ts:125-130`) and no "due today" KPI. `sla=DUE_SOON` means ≤ 30 min left (`jobs/slaBreachChecker.job.ts:62-65`), not "today" | — | **NEEDS BACKEND** | **A23**. MVP shows **"Due soon (≤30 min)"** (`sla=DUE_SOON`) and **"Overdue"** (`sla=BREACHED`) instead (S6) |
| 1.63 | Dashboard: announcements | ANN-1 | ANN-1 | **BUILD NOW** | Pinned items as a Home banner |
| 1.64 | SAML login | No SAML anywhere (`grep -i saml` over backend and frontend: nothing). Identity = Microsoft Entra ID via MSAL (OIDC), LDAP or local (`modules/auth/`) | AUTH-P2 (pending) | **NOT APPLICABLE** | MMG's enterprise SSO is Entra ID OIDC. Its mobile form is ask **A2** (blocking) |

**Verdict counts (64 rows)**

| Verdict | Count | Rows |
|---|---|---|
| BUILD NOW | **37** | 1.1, 1.2, 1.4, 1.5, 1.7, 1.9, 1.10, 1.11, 1.14, 1.15, 1.16, 1.18, 1.19, 1.20, 1.21, 1.22, 1.26, 1.27, 1.28, 1.29, 1.30, 1.32, 1.33, 1.34, 1.36, 1.38, 1.39, 1.40, 1.42, 1.47, 1.48, 1.50, 1.57, 1.59, 1.60, 1.61, 1.63 |
| BUILD LATER | **4** | 1.24, 1.46, 1.56, 1.58 |
| NEEDS BACKEND | **19** | 1.6, 1.8, 1.12, 1.17, 1.25, 1.31, 1.35, 1.37, 1.41, 1.43, 1.44, 1.45, 1.49, 1.51, 1.52, 1.53, 1.54, 1.55, 1.62 |
| NOT APPLICABLE | **4** | 1.3, 1.13, 1.23, 1.64 |

Some SDP features were split into separately buildable parts, e.g. sort (1.16 / 1.17) and search (1.5 / 1.6), so the row count is higher than the number of bullets in the brief. If this summary and the table ever disagree, the table wins.

---

## 2. Terminology map

**Method.** MMG terms come from `schema.prisma` (model, field and enum names) and from the **labels the web UI actually shows**. Where the web is inconsistent, both labels are quoted.

| SDP term | MMG schema / API | MMG web UI label (source) | **Mobile UI copy** | Why |
|---|---|---|---|---|
| Request | `Ticket` (`schema:340`), `/tickets` | "Tickets" (nav, `FE:layouts/AppLayout.tsx:20`); "New Ticket" (`FE:pages/tickets/CreateTicketPage.tsx:195`). Inconsistent: "Duplicate Request" (`FE:TicketDetailPage.tsx:691`), header chip "Incident Request" / "Email Request" (`:718`) | **Ticket** | Primary web label, and the API/schema word. Users get "[Ticket #N]" emails (`01` CMT-2) |
| Incident (request type) | none (no type field) | "Incident Request" chip, derived from `source` | *(not shown)* | No such field; showing it would imply a choice that doesn't exist |
| Service request | `ServiceRequest` (`schema:962`), `/service-catalog/requests` | "Service Request" (nav, `AppLayout.tsx:30`); catalog items "service templates" (`FE:pages/service-catalog/ServiceCatalogPage.tsx:454`) | **Service request** (Phase 2) | Matches web and schema |
| Request ID | `ticketNumber` (Int, `schema:342`). `id` is a UUID, never shown | "Ticket #" (CSV header, `FE:pages/tickets/TicketsListPage.tsx:332`) | **#1234** / "Ticket #" | Matches web and the email subject line |
| Subject | `title` | "Subject" (detail, `FE:TicketDetailPage.tsx:1177`); "Title *" (create, `CreateTicketPage.tsx:202`) | **Subject** | SDP word, and the web detail label. Use "Subject" on create too |
| Description | `description` (HTML) | "Description *" (`CreateTicketPage.tsx:209`) | **Description** | Same everywhere |
| Technician | role `AGENT` (`schema:14-19`); field `assignedTo` / `assignedToId` | "Technician" (detail, `FE:TicketDetailPage.tsx:1235, 1776`; list filter "All Technicians", `TicketsListPage.tsx:554`). Also "Assigned To" (list column, `:608`) and "Assign To" (create, `CreateTicketPage.tsx:423`). Admin role dropdown shows raw `AGENT` (`FE:pages/admin/UsersPage.tsx:471`) | **Technician** (the person assigned); action verb **Assign** | Web detail and SDP agree. "Agent" never appears in web copy except as the raw enum |
| Group | `Team` (`schema:199`); field `teamId` / `team` | "Group & Site" (detail, `FE:TicketDetailPage.tsx:1236, 1889`); "All Groups" (list filter, `TicketsListPage.tsx:566`); admin nav "Groups" (`AppLayout.tsx:40`). CSV header says "Team" (`TicketsListPage.tsx:332`) | **Group** | Web UI and SDP agree; "Team" is the internal name only |
| Site | `Country` (`schema:1374`), field `countryId` | "Group & Site"; country selector (`FE:components/CountrySelector.tsx`) | **Country** | MMG's "site" dimension is the country; `Site` (`schema:1459`) is a separate admin concept not on tickets |
| Requester | `requester` / `requesterId` (Ticket); usually role `END_USER` | "Requester" (CSV, `TicketsListPage.tsx:332`); "Requester Details" (`FE:TicketDetailPage.tsx:2138`) | **Requester** | Identical in SDP, web and schema |
| Conversations | `Comment` with `type: 'PUBLIC'` (`schema:415`) | Tab "Conversations" (`FE:TicketDetailPage.tsx:800`); "Reply", "Reply All" (`:872`), "Public Reply" (`:902`) | **Conversations**; actions **Reply** / **Reply all** | Same as web |
| Notes | `Comment` with `type: 'PRIVATE'` | "Add Note" (`:684, :881`), "Private Note" (`:903`) | **Note** ("Internal note" in the composer type switch) | Web word. "Internal" makes clear the requester can't see it |
| History | `AuditLog` (`schema:558`) via TKT-7 | Tab "History" (`:808`) | **History** | Same |
| Resolution | `resolution` | Tab "Resolution" (`:804`); modal field "Resolution" | **Resolution** | Same |
| Tasks | `TicketTask` (`schema:1664`) | Tab "Tasks" (`:802`); heading "Sub-Tasks" (`:1369`) | **Tasks** | Same as SDP and the web tab |
| Worklog | none | Placeholder tab "Worklog" (`:807`) | *(not shown until A19)* | No data |
| Approvals | `Approval` (`schema:763`) | "Approvals" (`AppLayout.tsx:32`; `FE:pages/approvals/ApprovalsPage.tsx:53`) | **Approvals** | Same |
| Pick up | TKT-5 `{assignedToId: me}` | "Pick up" (`FE:TicketDetailPage.tsx:672`) | **Pick up** | Same |
| Status / Priority | enums `TicketStatus`, `TicketPriority` | Labels in `05` §A.10 | As `05` §A.10 | Already fixed |
| Overdue | `slaStatus = 'BREACHED'` | "Breached" (SLA badge, `05` §A.10) | **Overdue** in filter names; **Breached** on the SLA badge | "Overdue" reads better as a filter. The badge keeps the web label so screenshots match |
| Due by | `slaResolveDue` | "SLA Due" (sort, `TicketsListPage.tsx:511`) | **Due** | Short, unambiguous |
| Category / Subcategory / Item | `Category.level` = `CATEGORY` / `SUBCATEGORY` / `ITEM` | "Category *", "Sub Category", "Item" (`CreateTicketPage.tsx:290, 308, 327`) | **Category / Subcategory / Item** | Same |
| Closure code, FCR, closure comments | `closureCode`, `isFcr`, `closureComments` | "Closure Code", "Is FCR (First Call Resolution)", "Closure Comments" (`05` §A.2) | Same as web | Same |
| Templates | `TicketTemplate` (admin "Ticket Templates", `AppLayout.tsx:42`) | admin only | *(not shown in MVP)* | END_USER can't read them (A28) |
| Solutions / Knowledge base | `KBArticle`, `KBCategory` | "Knowledge Base" (desktop nav, `AppLayout.tsx:21`), "Knowledge" (mobile tab, `:265`) | **Knowledge base** | Matches desktop nav |
| Notifications | `Notification` | "Notifications" (desktop, `AppLayout.tsx:22`), "Alerts" (mobile web tab, `:264`) | **Alerts** (tab label), **Notifications** (screen title) | Short tab label, as the web's own mobile layout uses |
| Roles | `ADMIN`, `AGENT`, `END_USER`, `L2_MANAGER` | Raw enum, except "L2 Manager" (`UsersPage.tsx:471`) | **Admin**, **Technician**, **User**, **L2 Manager** | Never show raw enums. Proposed mapping (S3) |

**Recommendation: MMG vocabulary with SDP's verbs.** Use MMG's own nouns (**Ticket**, **Group**, **Technician**, **Requester**) and SDP's interaction verbs where MMG has none (**Pick up**, **Take action**). Reasons:
1. Users see "Ticket #1234" in every email the server sends (`01` CMT-2, TKT-6). The app must use the same word, or users meet two names for one thing.
2. The web UI already uses Technician, Group and Requester. Mobile copying them keeps support documentation and training valid for both clients.
3. "Request" is ambiguous in MMG, because Service Requests are a separate object (row 1.3). Calling tickets "Requests" would collide with it in Phase 2.

---

## 3. Navigation design

**Recommendation: a hybrid. A side drawer (SDP's "Menu") holds the module list and account, and three bottom tabs hold the high-frequency places.** It replaces `04`'s "Home · Tickets · Alerts · Profile" tabs.

**Why not drawer-only like SDP**
- On Android, a drawer-only app hides the unread-alerts badge and costs two taps to reach the ticket list.
- END_USERs mostly move between Home, their tickets and alerts.

**Why not 4–5 tabs**
- The extra modules (Approvals, KB, Announcements; later Service catalog, Tasks, Assets) vary by role.
- A tab bar that changes shape per role is confusing. A drawer absorbs that variation.

**Profile** leaves the tab bar. It moves to the drawer header, as in SDP.

### 3.1 Bottom tabs (all roles, same order)

| Tab | END_USER label | Staff label (AGENT, ADMIN, L2) | Screen | Badge |
|---|---|---|---|---|
| 1 | Home | Home | M2 | — |
| 2 | **My Tickets** | **Tickets** | M3 | — |
| 3 | Alerts | Alerts | M9 | unread count (NTF-2) |

**Every root screen**
- **Header:** ☰ on the left opens the drawer. The title sits in the middle. Right: a search icon (Tickets) or "Mark all read" (Alerts).
- **Gestures:** an edge-swipe from the left also opens the drawer.
- **"+" FAB** on Home and Tickets → Create ticket (M8), all roles.

**Android back button**
1. If the drawer is open, close it.
2. If a sheet or modal is open, close it.
3. On a non-Home tab root, go to Home.
4. On Home, exit.

### 3.2 Drawer contents by role

**Drawer header (all roles)**
- Initials avatar, display name, role label (S3), and country chip for country-locked AGENTs.
- Tap → **M10 Profile & settings**.

| Drawer item | END_USER | L2_MANAGER | AGENT | ADMIN | Opens | Endpoint |
|---|---|---|---|---|---|---|
| **Approvals** (badge = pending count) | only if APR-1 returns ≥ 1 (S1) | only if APR-1 returns ≥ 1 (S1) | ✅ always | ✅ always | M12 | APR-1 |
| **Knowledge base** | ✅ | ✅ | ✅ | ✅ | M14 | KB-1..3 |
| **Announcements** | ✅ (S1) | ✅ | ✅ | ✅ | M16 | ANN-1 |
| My tasks | hidden | hidden until A20 | hidden until A20 | hidden until A20 | P17 | needs A20 |
| Service catalog ("Request a service") | Phase 2 | Phase 2 | Phase 2 | Phase 2 | P2/P3 | SCR-* |
| Assets | — | — | Phase 2 (P18) | Phase 2 (P18) | — | not in `01` |
| *divider* | | | | | | |
| **Settings** (profile, theme, country) | ✅ | ✅ | ✅ | ✅ | M10 | AUTH-2, USR-1/2 |
| **Sign out** | ✅ | ✅ | ✅ | ✅ | — | AUTH-3 |
| Footer: app version + environment (e.g. "UAT") | ✅ | ✅ | ✅ | ✅ | — | — |

**How the drawer differs by role, in one line each**
- **END_USER:** Knowledge base, Announcements, Settings. Approvals appears only while they have something to approve.
- **L2_MANAGER:** as END_USER (the web nav hides Approvals for L2, `AppLayout.tsx:32`).
- **AGENT and ADMIN:** Approvals always, plus Knowledge base, Announcements, Settings. Later, Assets and My tasks.

The drawer never lists the three tab destinations, so no screen has two routes.

### 3.3 Home (M2) by role
- **END_USER:**
  - "Raise a ticket" button;
  - pinned-announcement banner (ANN-1);
  - "My open tickets" (5 most recent, TKT-1);
  - open and resolved counts (DSH-1).
- **Staff:** tiles. Each tile opens the Tickets tab with that named filter pre-applied (§4.5):
  - My open
  - Unassigned (ADMIN and triage AGENT only, `04` M2)
  - Overdue
  - Due soon
  - Pending approvals → M12
  - Below the tiles: the announcement banner and the DSH-1 `recent` list.

---

## 4. List-view interaction spec (M3)

### 4.1 Inline status change on the card
- **Endpoint: `POST /api/v1/tickets/:id/status` (TKT-6). This is definitively the only API call that changes a ticket's status.**
  - Status is validated by `changeStatusSchema` (`tickets.validator.ts:39-42`) and written by `changeStatus` (`tickets.controller.ts:841-994`).
  - **`PUT /tickets/:id` cannot change it.** It parses `updateTicketSchema` = `createTicketSchema.partial().omit({source})` + `resolution` (`tickets.validator.ts:35-37`, parsed at `tickets.controller.ts:552`). There is no `status` key, and zod strips unknown keys, so `{status}` returns 200 and changes nothing. This matches `05` B.1.
  - The only other writers of `Ticket.status` are server side effects that mobile must not use for this:
    - `POST /approvals` sets `PENDING_MGMT_REVIEW` (`approvals.controller.ts:40-45`);
    - `POST /changes/:id/link-ticket` force-closes (`modules/changes/changes.controller.ts:166`);
    - the 48 h auto-close job (`jobs/autoCloseResolved.job.ts:27`).
- **Implementation**
  - The chip on each card opens a sheet listing **only** the transitions for that card's status (`05` §A.1, D1).
  - Hidden for END_USER. Empty for AGENT on CLOSED and CANCELED.
  - Targets RESOLVED, CLOSED and CANCELED open M6 (closure fields required, `05` §A.2). Other targets post `{ status }` straight away.
  - On 200, replace the row with the returned `Ticket` and invalidate the list query. `_count.comments` may be one short (`05` B.18).
  - Disable the chip while the request is in flight.

### 4.2 Tap-and-hold multi-select with bulk actions
- **Bulk endpoint: none.** The tickets router has exactly ten routes, none bulk (`tickets.router.ts:16-25`), and no other router takes ticket ID lists. **Every bulk action is N sequential single-ticket calls.**

| Bulk action | Per-ticket call | Roles | Eligibility check per ticket (client) |
|---|---|---|---|
| Pick up | TKT-5 `{ assignedToId: me, teamId: row.teamId }` (send `teamId` when known, `05` B.14) | ADMIN, AGENT | not CLOSED/CANCELED for AGENT (lock, `05` §A.1) |
| Assign technician | TKT-5 `{ assignedToId, teamId }` from the group-filtered picker | ADMIN, AGENT | as above |
| Close | TKT-6 `{ status:'CLOSED', resolution, closureCode?, isFcr, closureComments }`, one shared M6 form | ADMIN, AGENT, L2 | current status's map must contain CLOSED: OPEN, IN_PROGRESS, PENDING_USER_CONFIRM, PENDING_USER_INFO, RESOLVED. Others are skipped and listed |
| Merge | — | — | **Unsupported** (A25). Not shown |
| Delete | — | — | **Not applicable** (row 1.13). Not shown |

- **Rate-limit risk**
  - `/api/v1/*` allows **300 requests/min**, keyed by cookie, otherwise by **IP** (`app.ts:94-102`).
  - Until **A14** ships, every Bearer phone on the same office Wi-Fi or carrier NAT shares that one bucket. So does any web user behind the same NAT without a cookie (login, assets).
  - A 100-ticket bulk close is 100 writes, plus refetches. That can push colleagues into 429s, which the general limiter returns as **plain text** (`01` §0.2).
- **Other costs**
  - Each close also sends the requester 2–3 emails and posts a public comment (`01` TKT-6).
  - Each assign sends an email and an in-app notification.
  - A large batch is a mass mailing.
- **Recommended cap: 20 tickets per bulk action.**
  - Run **sequentially** (concurrency 1), with a progress bar.
  - **Stop at the first 429 or 5xx.** Never auto-retry: non-GET calls are never retried (`02` §5.3), and none of these calls is idempotent.
  - At the end, show a per-ticket result list (done / skipped and why / failed) and refetch the list **once**.
  - Selecting a 21st item shows "You can act on up to 20 tickets at a time".
- **Why 20**
  - About 21 requests (20 writes + 1 refetch) is 7% of a shared 300/min bucket.
  - That leaves room for a dozen phones polling NTF-2 every 60 s.
  - It bounds the email fan-out to about 60 messages.
  - Revisit when A14 (per-user buckets) or A24 (bulk endpoint) ships.

### 4.3 Sort options
- **Accepted by the API** (`tickets.controller.ts:157-161`): `sortBy=priority` → `priority` desc (URGENT first); `sortBy=sla` → `slaResolveDue` asc; anything else or absent → `updatedAt` desc. **There is no direction parameter.**
- **Sort sheet on mobile:** three options, exactly as the web (`FE:pages/tickets/TicketsListPage.tsx:509-511`):
  - **Last updated** (newest first)
  - **Priority** (urgent first)
  - **Due date** (soonest first)
- **Unsupported, not offered:**
  - Request ID, status, subject, requester name;
  - any ascending/descending toggle.
  - Sorting one loaded page on the device would show a wrong order across pages. Needs **A21**.

### 4.4 Search with a field selector
- **What `search` covers** (`tickets.controller.ts:133-150`):
  - digits only → exact `ticketNumber`;
  - otherwise case-insensitive *contains* on `title`, requester `displayName`, requester `email`, and assignee `displayName` (resolved to IDs first).
  - It does **not** search `description` or comments.
- **No field selector exists.** Mobile shows one search box with the hint "Ticket #, subject, requester or technician".
- **Field-by-field mapping**

| SDP field | Supported? | How on mobile |
|---|---|---|
| ID | ✅ | Digits in the box → exact number match. Also strips a leading `#` client-side |
| Subject | ⚠ partial | Free text matches subject **and** requester/technician names. Cannot be restricted to subject (A22) |
| Requester name | ✅ for ADMIN/AGENT via a different control | "Requester" filter chip → USR-3 typeahead → TKT-1 `requesterId=<uuid>` (exact; ignored for END_USER; `tickets.controller.ts:123`). L2 has no USR-3 access (403), so L2 uses free text only |

- **⚠ Scope bug:** for AGENT (with no non-empty `countryId`) and L2_MANAGER, a text `search` replaces the role scope (`tickets.controller.ts:110-113, 143`; `05` C.7).
  - Mobile does not filter results client-side to "fix" this (`05` §C rule 3).
  - It is A7's to fix. Testers who see foreign tickets file it under A7.

### 4.5 Filter drop-down (named filters)

| Filter | Server-side (TKT-1 params) | Client-side | Notes |
|---|---|---|---|
| **All** (my scope) | role scope is applied by the server | — | END_USER sends `countryId=` (D8) |
| **Open** | `status=OPEN` | — | |
| **My open** (staff) | `assignedToId=<me>&status=OPEN,IN_PROGRESS,ON_HOLD,PENDING,PENDING_USER_INFO,PENDING_USER_CONFIRM,PENDING_PARTNER,PENDING_MASTER_DATA,PENDING_MGMT_REVIEW` | — | For END_USER "My open" = All + the same status list (scope already = own) |
| **Unassigned** (ADMIN, AGENT) | `assignedToId=unassigned` | — | An AGENT sees unassigned tickets in their groups; triage agents see all (`tickets.controller.ts:67-73`) |
| **Pending** | `status=PENDING,PENDING_USER_INFO,PENDING_USER_CONFIRM,PENDING_PARTNER,PENDING_MASTER_DATA,PENDING_MGMT_REVIEW,ON_HOLD` | — | Same set as the SLA hold statuses (`03` §A) |
| **Overdue** | `sla=BREACHED` | — | The server `slaStatus` can differ from the hold-adjusted badge (`05` §A.9). The filter uses the server value; the badge uses A.9 |
| **Due soon** | `sla=DUE_SOON` | — | ≤ 30 min left (`jobs/slaBreachChecker.job.ts:62-65`) |
| Due today | ❌ | ❌ | **Unsupported** (A23). Not offered |
| Resolved / Closed | `status=RESOLVED` / `status=CLOSED` | — | |
| Priority, Group, Category, Created date range, Country | `priority`, `teamId` (ADMIN/AGENT; LKP-2), `categoryId` (exact, no children), `fromDate`/`toDate` (`YYYY-MM-DD`, UTC, on `createdAt`), `countryId` | — | "Advanced" sheet |
| Request type (Incident / Service / Both) | ❌ | ❌ | **Not applicable** (row 1.3) |
| "New reply" highlight | — | ✅ `lastRequesterReplyAt != null` on loaded rows | Highlight only, not a filter (it would apply to one page only) |
| SLA breach type (response vs resolution) | — | ✅ badge text only (`05` §A.9) | Not a filter |

- **Status lists are always sent as one comma-separated `status` value.** An unknown status value gives 500 (`01` TKT-1), so the lists come only from the `03` enum.

---

## 5. Screen map revision (applied to `04-SCREEN-MAP.md`)

### 5.1 Screens added to the MVP, and why

| New | Screen | Why | Endpoints added to the MVP |
|---|---|---|---|
| M11 | **Task editor** (sheet: create / edit / delete) | SDP lets staff manage tasks. The backend has the routes (TSK-2/3/4); only role gating is ours (staff only, D4) | TSK-2, TSK-4 (TSK-3 was already MVP) |
| M12 | **Approvals inbox** (cards; All · Tickets · Service requests · Changes) | SDP Approvals module. APR-1 is fully supported and scoped to the caller | APR-1 |
| M13 | **Approval detail + Take action** (comment → Approve / Reject) | SDP "Take action" flow; APR-2/3 are supported. Parent-record detail is best-effort (row 1.49) | APR-2, APR-3 (+TKT-3/TKT-7/ATT-1 already MVP) |
| M14 | **Knowledge base** (categories, article list, search) | SDP KB module; KB-1..3 supported | KB-1, KB-2, KB-3 |
| M15 | **KB article** (read, "Was this helpful?") | SDP KB read; KB-4/5 supported | KB-4, KB-5 |
| M16 | **Announcements** (list, expandable body; pinned banner on Home) | SDP Announcements module and dashboard widget; ANN-1 supported | ANN-1 |

**Existing screens extended (no new endpoints)**
- **M2 Home:** staff tiles linked to named filters; pending-approvals tile (APR-1); announcement banner (ANN-1).
- **M3 Ticket list:**
  - named-filter drop-down (§4.5) and sort sheet (§4.3);
  - inline status chip (§4.1);
  - multi-select with bulk Pick up / Assign / Close, capped at 20 (§4.2);
  - Requester filter via USR-3 (ADMIN/AGENT).
- **M4 Ticket detail:**
  - status drop-down in the header;
  - "More options" sheet (Pick up, Assign, Close);
  - sections Conversations · Notes (ADMIN/AGENT) · History · Resolution · Tasks · Attachments (count badge);
  - Conversations FAB.
- **M6:** also used for bulk Close.
- **M7:** group selector ahead of the member list; also used for bulk Assign.
- **M10:** theme setting (System / Light / Dark).
- **Navigation:** drawer + 3 tabs (§3) instead of 4 tabs with Profile.

### 5.2 SDP screens we cannot build, and what blocks each

| SDP screen / element | Blocked by |
|---|---|
| Worklogs section, worklog timer, task worklogs | No worklog model (§7.1) → **A19** |
| Standalone Tasks module (list, filter, search, task attachments, task comments, "view parent") | No cross-ticket task route; no task attachments or comments → **A20** |
| Ticket "Approvals" section | Only the unscoped `GET /approvals` exists (C.16) → **A27** |
| Approval detail with parent attachments and conversations, for non-staff approvers | TKT-3 / ATT-1 / SCR-6 return 403 for non-requester END_USERs → **A27** |
| Delegate / revoke delegation | No model or route → **A26** |
| Merge | No route → **A25** |
| Delete | Not applicable: no route, no web equivalent |
| Sort by ID / status / subject / requester; asc/desc | **A21** |
| Search field selector | **A22** |
| "Due today" dashboard widget and filter | **A23** |
| Template picker on Add Request (END_USER) | **A28** |
| Requester acknowledgement on Close | **A30** |
| Request-type filter (Incident/Service) | Not applicable: no ticket type |
| Push notifications | **A5** (existing) |
| Assets with QR | Built later (P18); exact lookup **A29**; no QR labels exist yet |
| Bulk actions on more than 20 tickets at once | Mobile cap (§4.2) until **A24** (bulk endpoint) and **A14** (per-user rate-limit bucket) ship |
| SAML login | Not applicable; Entra SSO via **A2** |

### 5.3 New counts
- **MVP screens: 16** (was 10): M1–M16.
  - The drawer is a navigator, not counted.
  - Sheets that are part of a screen are not counted: sort, filter, bulk-action bar, "More options".
- **MVP endpoints: 44** (was 33): +KB-1..KB-5 (5), +APR-1..APR-3 (3), +ANN-1 (1), +TSK-2, TSK-4 (2).
  - Plus the pending auth endpoint (AUTH-P1 or AUTH-P2).
  - Phase 2 keeps **14** of the 58 documented endpoints: TKT-8, CMT-3, CMT-4, ATT-5, USR-4, LKP-3, LKP-6, LKP-7, SCR-1..SCR-6.
  - ⚠ `01-API-CONTRACT.md` still labels the 11 moved endpoints "P2". Updating it is outside this task's write scope; see §9 item R7-1.

### 5.4 Every change made to `04-SCREEN-MAP.md`
This is the change log at the end of `04-SCREEN-MAP.md` (§3), copied verbatim:

1. Header: added the SDP-parity source line pointing to `08`.
2. §1, `/tickets` row: M3 now lists the named filters, sort sheet, inline status chip and bulk actions. Endpoints add TKT-5, TKT-6 and USR-3.
3. §1, `/tickets/:id` row: adds M11. The skipped list now names the Approvals tab (A27), Worklog (A19) and Checklists/Reminders. Endpoints add CMT-1, TSK-2 and TSK-4.
4. §1, `/notifications` row: the tab is named "Alerts".
5. §1, `/kb` row: Phase 2 (P1) → **MVP** (M14, M15).
6. §1, `/approvals` row: Phase 2 (P4) → **MVP** (M12, M13), with the drawer visibility rule.
7. §1, `/announcements` row: Phase 2 (P5) → **MVP** (M16 + Home banner).
8. §1, `/assets` row: "future" → Phase 2 item P18 (staff lookup; exact lookup A29).
9. §1, Profile row: opened from the drawer header; adds the theme setting.
10. §2.1 retitled **"MVP: 16 screens"** (was 10). The navigation paragraph is replaced with drawer + 3 tabs (Home · Tickets · Alerts); Profile is no longer a tab.
11. §2.1 rows rewritten:
    - M2 (staff tiles, approvals tile, announcement banner);
    - M3 (filters, sort, inline status, bulk);
    - M4 (header status drop-down, "More options", Notes and Resolution sections, attachment badge);
    - M6 and M7 (bulk mode, group selector);
    - M10 (drawer entry, theme).
12. §2.1 rows **M11 Task editor, M12 Approvals inbox, M13 Approval detail, M14 Knowledge base, M15 KB article, M16 Announcements** added.
13. §2.1 shared components: adds the drawer, filter/sort sheets, bulk-action bar, result sheet and theme tokens.
14. §2.1 MVP endpoint coverage: **33 → 44** (+KB-1..5, APR-1..3, ANN-1, TSK-2, TSK-4).
15. §2.1 role-capability table: rows added for inline status, bulk actions, Notes, tasks add/edit/delete, approvals, KB, announcements and theme. "Assign" now includes pick up.
16. §2.2: P1, P4 and P5 marked moved to the MVP (IDs kept). P7 narrowed to comment edit/delete and attachment delete.
17. §2.2: added P14–P26 (customisable fields, staff templates, submit for approval, My tasks, assets, worklogs, merge, delegation, approval detail/history, sorts and search field, due today, requester acknowledgement, uncapped bulk).
18. §2.3:
    - assets row narrowed;
    - "Submit ticket for approval" removed (now P16);
    - added ticket delete, request-type filter and SAML.
19. This change log added.

---

## 6. Build order (Android MVP)

**Assumptions**
- Auth (A1 for UAT, or A2) lands **during** Phase C.
- Until then, nothing that needs a Bearer token can be tested live.
- Phase A needs Ronit to relax R4/R5 for the mobile repo (scaffold, `npm install`, `src/`), as `CLAUDE.md` says.

| Phase | Items (rank order) | Blocked on A1/A2? | Ends in (testable) |
|---|---|---|---|
| **A. Foundations** | 1. Expo SDK 52 project, Android dev build profile only (§8). 2. API client: Bearer, HTML guard, 401/403/429 handling, pagination adapter (`01` §0, `02` §5). 3. `src/types/` copied from `03` §C. 4. Theme tokens light/dark (row 1.57). 5. Navigation shell: drawer + 3 tabs, role-switchable with fixture users (§3). 6. SYS-1 + AUTH-1 live against UAT | **No** | App installs on an Android device and emulator; health and auth-config calls succeed against UAT; the drawer shows the correct items for each fixture role; dark mode switches |
| **B. Read-only screens on fixtures + KB live** | 7. Pure-logic modules with unit tests: transition map + locks (`05` §A.1), closure validation (§A.2), SLA display (§A.9), audit sentences (§A.7), status/priority labels (§A.10), HTML sanitiser (§A.6). 8. M3 list UI (filters §4.5, sort §4.3, search §4.4) on fixtures. 9. M4 detail sections on fixtures. 10. M14/M15 Knowledge base **live** (KB routes do not require auth today) | **No** | Unit-test suite green; list/detail render from fixtures; KB browse/search/read works live on UAT. ⚠ KB works without a token only because of `05` C.15. The code sends Bearer anyway and must still work when A7 adds auth |
| **C. Auth lands** | 11. M1 Login (A1 form and/or A2 SSO) + SecureStore + 401 flow (`02` §5). 12. M10 Profile & settings (AUTH-2, USR-1/2, country selector, theme, sign out) | **Yes** | Real UAT user signs in, edits profile, signs out; expired-token path returns to Login |
| **D. Requester flow live** | 13. M3 live (TKT-1, END_USER defaults). 14. M4 live (TKT-3, TKT-7, ATT-1/3/4, TSK-1). 15. M8 Create + attachments. 16. M5 Reply. 17. M9 Alerts + badge polling. 18. M2 Home (END_USER variant) + M16 Announcements | **Yes** | An END_USER raises a ticket with a photo, replies, sees the technician's reply in Alerts, and reads announcements — end to end on UAT |
| **E. Technician queue** | 19. M2 staff tiles. 20. Named filters + sort live. 21. M6 status & closure + inline status chip. 22. M7 assign + Pick up. 23. Notes section + private notes in M5. 24. M11 task add/edit/delete/toggle. 25. Bulk Pick up / Assign / Close (cap 20) | **Yes** | An AGENT works a queue on UAT: filters Unassigned, picks up, adds a note and a task, moves the status through the map, closes with closure fields, and bulk-assigns 5 tickets |
| **F. Approvals** | 26. M12 inbox + filter chips. 27. M13 detail + Approve/Reject (best-effort parent detail) | **Yes** (and needs a UAT approval created by an ADMIN/AGENT on web) | An approver approves and rejects UAT approvals; the ticket stays PENDING_MGMT_REVIEW as documented |
| **G. Launch gates** | 28. Release build, Play internal testing track (§8). 29. Backend **A7, A13, A14** shipped and re-tested (BLOCKING — launch, `06`). 30. Accessibility and offline/error pass | A7/A13/A14 (not A1/A2) | Internal-track build passes the `05` §C hygiene checklist against a fixed backend |
| **Post-MVP** | Push (A5), worklogs (A19), My tasks (A20), merge (A25), delegation (A26), approval detail (A27), service catalog (P2/P3), assets (P18) | Backend asks | — |

**Blocked on A1/A2:** Phases C–F (items 11–27).
**Not blocked:** Phases A–B (items 1–10). Phase G depends on A7, A13 and A14, not on A1/A2.

---

## 7. New backend asks

### 7.1 Does any worklog / time-tracking model exist? **No.**
Evidence, from `master` @ `d7f3887`, read as text:
- `schema.prisma` has 58 models (`grep "^model "`). None is a worklog, time entry or timesheet.
- A case-insensitive search of `schema.prisma` for `worklog|timeentry|timespent|spent|effort|hours|minutes|duration|timer|billable|logged` finds only:
  - SLA business-hours settings (`schema:295-297, 300, 1512-1513`);
  - escalation `minutesBefore` (`:324`);
  - `Ticket.slaHoldMinutes` (`:366`), the accumulated SLA **pause** time, not work time;
  - `ServiceItem.estimatedTime` (`:947`), a catalogue estimate in minutes.
- `TicketTask` (`:1664-1682`) and `ProjectTask` (`:1301-1320`) have no duration, effort or time-spent field.
- No raw-SQL table: no `CREATE TABLE` / `ALTER TABLE` in `backend/src`. The migrations (`backend/prisma/migrations/*`, `postgres/init.sql`) have no worklog or time table.
- The second schema at `Production-Build/backend/prisma/schema.prisma` has no worklog either.
- The web has only UI placeholders:
  - a "Worklog" tab showing "No worklog entries" (`FE:pages/tickets/TicketDetailPage.tsx:807, 1646-1655`);
  - an "Add Worklog" menu item that just switches to that tab (`:688`).
  - Neither calls any API.

### 7.2 New asks (added to `06-BACKEND-ASKS.md` as A19–A30; existing A1–A18 unchanged)

| ID | What | Why mobile needs it | Missing endpoint / model | Priority |
|---|---|---|---|---|
| **A19** | Worklogs and time tracking | SDP worklog section, timer and task worklogs. The web has a placeholder tab and menu item that do nothing | Model `TicketWorklog` + `GET/POST/PUT/DELETE /tickets/:ticketId/worklogs` | Nice-to-have |
| **A20** | Cross-ticket "My tasks" (+ optional task comments/attachments) | SDP standalone Tasks module. The web dashboard "My Tasks" is a placeholder | `GET /tasks` (scoped); optional `taskId` on Comment/Attachment | Nice-to-have |
| **A21** | Ticket list sort allow-list + direction | SDP sort sheet (ID, status, subject, requester, asc/desc) | `sortBy` values + `sortOrder` on `GET /tickets` | Nice-to-have |
| **A22** | Search field selector | SDP search field picker | `searchField` on `GET /tickets` | Nice-to-have |
| **A23** | Due-date filter + "due today" KPI | SDP "Requests due today" | `dueFrom`/`dueTo` on `GET /tickets`; `dueToday` in `/dashboard/all` | Nice-to-have |
| **A24** | Bulk ticket actions | Removes the 20-ticket cap and N-call rate-limit risk | `POST /tickets/bulk` | Nice-to-have |
| **A25** | Merge tickets | SDP Merge | `POST /tickets/:id/merge` | Nice-to-have |
| **A26** | Approval delegation and revoke | SDP Delegate / revoke | `Approval.delegatedFromId` etc. + 2 routes | Nice-to-have |
| **A27** | Approver read access + ticket-scoped approvals + my approval history | SDP approval details and the ticket Approvals section; stop the web relying on unscoped `GET /approvals` | `GET /approvals/:id` (with parent summary), `GET /tickets/:id/approvals`, `GET /approvals/mine` | Nice-to-have (**blocking for non-staff approvers** to see what they approve) |
| **A28** | Ticket templates readable by every role (active only, minimal fields) | SDP "pick a template" before the form | `GET /templates` open to all roles with `isActive` filter and no creator email | Nice-to-have |
| **A29** | Exact asset lookup by tag | QR scan resolves one asset | `GET /assets/by-tag/:assetTag` | Nice-to-have (Phase 2) |
| **A30** | Requester acknowledgement on closure | SDP close flow field | `Ticket.requesterAcknowledged` (+ `acknowledgedAt`), accepted by `POST /tickets/:id/status` | Nice-to-have |

Full text, acceptance criteria and effort guesses are in `06-BACKEND-ASKS.md`.

**Not raised as new asks** (already covered):
- push (A5);
- SSO (A2);
- the `GET /approvals` scope fix (inside A7);
- the per-user rate-limit bucket (A14).

---

## 8. Android-first implications

### 8.1 Removed from scope now
- **Apple accounts:**
  - Apple Developer Program enrolment;
  - App Store Connect app record;
  - certificates and provisioning profiles;
  - APNs key.
- **iOS build:** EAS `ios` build profile, iOS simulator/device QA, `ios.bundleIdentifier`-specific config plugins.
- **App Store assets and review:** screenshots, privacy "nutrition label", TestFlight, App Review notes.
- **iOS halves of backend asks:**
  - iOS Entra redirect URI `msauth.<bundleId>://auth` (A2);
  - `apple-app-site-association` (A18);
  - `provider: 'apns'` fan-out (A5).
- **iOS-only client options:** `keychainAccessible` on SecureStore (`02` §5.1) has no effect on Android.

### 8.2 Must be decided now, because changing them later is expensive

| Decision | Why it's expensive later | Recommendation |
|---|---|---|
| **Android `applicationId` (package name)** | Permanent on Google Play once published. It is part of the Entra redirect URI (`msauth://<package>/<signature-hash>`, A2), of `assetlinks.json` (A18) and of the push credentials | Pick one reverse-DNS ID now, e.g. `com.mountmerugroup.servicedesk` (S9). Reserve the **same string as the future iOS bundle ID**, so Entra, push and links stay symmetrical |
| **Per-environment variants** | UAT and PROD builds must install side by side and each needs its own Entra redirect URI and `assetlinks.json` entry | Suffix `.uat` for UAT builds (`com.mountmerugroup.servicedesk.uat`); no PROD profile until Ronit approves (`00` §3) |
| **App signing key** | Its SHA-256 goes into the Entra redirect URI and `assetlinks.json`. Losing or rotating it breaks SSO and app links | Use Play App Signing. Keep the upload key in a secret store, never in the repo. Record both fingerprints in the A2/A18 hand-over |
| **Deep-link scheme** | Registered in Entra (A2) and embedded in emails/links. Renaming orphans old links | One custom scheme, e.g. `mmgservicedesk://`, for the auth redirect and in-app routing. HTTPS App Links on `/ticket/<number>` later (A18) |
| **Push provider** | Dictates the A5 table (`provider`), the backend sender, and credentials (FCM project, `google-services.json`) | **Expo Push (FCM v1 under the hood)**. It keeps one backend path when iOS arrives, since Expo also wraps APNs. Decide whether ticket titles may transit Expo/Google: recommend a **content-free payload** (`{ticketId, type}` only; the app fetches details after open). Flag to Ronit (S10) |
| **Android notification channels** | Users configure sound and importance per channel. Renaming a channel ID later strands those settings | Fix IDs now: `tickets`, `approvals`, `sla`, `announcements`. Request `POST_NOTIFICATIONS` (Android 13+) at first need, not at launch |
| **Distribution and device management** | If MMG's Entra Conditional Access requires "approved client app" or Intune app-protection policies, the app needs the Intune App SDK (native code, dev build). That decision changes the architecture | Ask IT now whether Conditional Access / Intune MAM applies to mobile apps. Choose: Managed Google Play private app vs Play internal/closed testing track (S11) |
| **Target SDK vs Play policy** | Google Play enforces a minimum `targetSdkVersion` for new apps and updates. Expo SDK 52 (Nov 2024) defaults to an older target than Play required from Aug 2025 (to my knowledge). **VERIFY**: this could not be checked here (no web browsing, R8) | Verify the current Play target-API requirement against SDK 52's default **before** scaffolding. If SDK 52 falls short, either raise `targetSdkVersion` via `expo-build-properties` (and test edge-to-edge, predictive back) or move to a newer Expo SDK. `CLAUDE.md` pins SDK 52, so this is Ronit's call |
| **Backup of secure storage** | Android Auto Backup can restore SecureStore entries to a new device where the Keystore key no longer exists. Decryption then fails, and the app can crash on boot | Exclude SecureStore data from Auto Backup (or `allowBackup=false`) in the first build |

### 8.3 Doc text that assumes both platforms (adjust; none of it is wrong, it is just not Android-first)

| Where | Text | Adjustment |
|---|---|---|
| `02-AUTH.md` §5.1 | `keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` | iOS-only. Add the Android equivalent: exclude SecureStore from Auto Backup (§8.2) |
| `02-AUTH.md` §2 #1 | "NSURLSession on iOS, OkHttp on Android" | Fine as background; no action |
| `02-AUTH.md` §4(b) | "Redirect URIs must be registered per bundle ID / package and signing key" | Android-first: one package per environment + Play signing key fingerprint |
| `06` A2 | Lists both `msauth.<bundleId>://auth` (iOS) and `msauth://<package>/<signature-hash>` (Android) | Ask IT for the **Android** redirect only now; iOS later |
| `06` A5 | `provider` `expo`/`fcm`/`apns`, `platform` `ios`/`android` | Keep both columns (future-proof), but only `expo` + `android` are needed for launch |
| `06` A18 | `apple-app-site-association` and `assetlinks.json` | Only `assetlinks.json` now |
| `00` §2, `02` §2 #7 | "Native iOS and Android are unaffected" (CORS) | Still true; no action |
| `04` (before this revision) | Bottom-tab design without a back-button rule | Fixed in §3.1 (Android back behaviour) |

`02`, `00` and `CLAUDE.md` are outside this task's write scope. These adjustments are recorded in §9, not applied.

---

## Decisions for Ronit raised by this analysis

`05` §A.18 holds D1–D8. These are new, and are numbered S1–S11 so they don't collide with D-numbers.

| ID | Question | Proposed default |
|---|---|---|
| S1 | Show **Approvals** to END_USER/L2 approvers (the web nav hides it, but the server lets any approver act), and **Announcements** to END_USER (the web nav hides it, but the server targets by `targetRoles`)? | **Yes**: Approvals only while they have ≥ 1 pending; Announcements always |
| S2 | Include **change** approvals in the mobile inbox, with summary-only detail? | **Yes**, with "Open on web for full change details" |
| S3 | Role labels: ADMIN → "Admin", AGENT → "Technician", END_USER → "User", L2_MANAGER → "L2 Manager"? | **Yes** |
| S4 | Bulk actions: cap at 20; include bulk **Close** in the MVP? | **Cap 20; include Close** with a confirmation that names the email count |
| S5 | Pick up sends `teamId` = the ticket's current group (the `05` B.14 workaround), unlike the web's assignee-only call? | **Yes** |
| S6 | Replace "Due today" with "Due soon" + "Overdue" until A23? | **Yes** |
| S7 | Keep the Service catalog in Phase 2, although SDP has a "Service" request type? | **Yes**: B.24 and the SCR-4 scope gap make it low value / high risk for the MVP |
| S8 | Approval detail: on 403 from TKT-3, show the approval only (no parent detail) rather than any fallback? | **Yes** |
| S9 | `applicationId` string (and the UAT suffix) | `com.mountmerugroup.servicedesk` / `.uat` |
| S10 | Push provider and payload content | Expo Push; content-free payload |
| S11 | Distribution channel; is Intune / Conditional Access MAM required? | Ask IT before scaffolding |

---

## 9. Steps not performed (R7): writes outside this task's bounds

This task could write only `08-SDP-PARITY.md`, `04-SCREEN-MAP.md` and `06-BACKEND-ASKS.md`. These follow-ups are needed for consistency. **None was performed.** Ronit decides.

| # | File (mobile repo) | Exact change I would have made | Why |
|---|---|---|---|
| R7-1 | `docs/web-system/01-API-CONTRACT.md` | In Appendix B, set Phase to `MVP` for KB-1, KB-2, KB-3, KB-4, KB-5, APR-1, APR-2, APR-3, ANN-1, TSK-2, TSK-4. Change the heading suffixes `— P2` → `— MVP` on those 11 endpoints. Change `**58 documented endpoints:** 33 MVP and 25 Phase 2.` → `**58 documented endpoints:** 44 MVP and 14 Phase 2.` | Keep the contract's phase labels in line with the revised `04` (§5.3) |
| R7-2 | `CLAUDE.md` | Add a row to the doc index: `\| \`08-SDP-PARITY.md\` \| You are deciding whether an SDP feature can be built, or choosing UI wording \|` | New doc must be discoverable |
| R7-3 | `docs/web-system/00-OVERVIEW.md` §4 | Change `The 18 requests to the backend team` → `The 30 requests to the backend team`; add the same 08 row as R7-2 | Ask count changed (A19–A30) |
| R7-4 | `docs/web-system/02-AUTH.md` §5.1 | After the `keychainAccessible` bullet add: `- **Android:** that option is iOS-only. Exclude SecureStore data from Android Auto Backup (or set \`allowBackup=false\`) so a restored device never holds an undecryptable token.` | Android-first (§8.3) |
| R7-5 | `docs/web-system/05-RULES-AND-GAPS.md` §B | In B.22 and B.26, change the leading `P2:` to `MVP:` (approvals and KB moved into the MVP) | Phase label consistency |
| R7-6 | `docs/web-system/05-RULES-AND-GAPS.md` §A.18 | Append S1–S11 from this file once Ronit has decided them | Single decisions register |
| R7-7 | `CLAUDE.md` stack line | Pending the §8.2 target-SDK check, possibly change `Expo SDK 52` | Play target-API policy (VERIFY) |
| R7-8 | (backend team, via `06`) | Not a mobile write: report that `POST /approvals` sets `PENDING_MGMT_REVIEW` without the SLA-hold bookkeeping in `changeStatus` (`approvals.controller.ts:40-45` vs `tickets.controller.ts:861-881`) | Found while verifying row 1.24; record-only (R3) |
