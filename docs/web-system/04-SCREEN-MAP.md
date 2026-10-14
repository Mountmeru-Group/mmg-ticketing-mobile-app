# 04 — Screen Map (web → mobile)

**Sources**
- Web routes: `frontend/src/router/index.tsx:89-162`.
- Navigation and role visibility: `frontend/src/layouts/AppLayout.tsx:18-58, 258-289`.
- Endpoints per page: from each page's API calls. Endpoint IDs refer to `01-API-CONTRACT.md`.
- **SDP parity (2026-10-14):** the MVP was revised to follow the ManageEngine ServiceDesk Plus Android structure wherever the backend allows. Feature verdicts, the navigation design and the list-view spec are in `08-SDP-PARITY.md`. Every change to this file is listed in §3.

**Key facts about the web UI**
- **No web route has a role guard.** Roles only hide sidebar items, so any logged-in user can open any URL. The backend is the only enforcement, and it has gaps (`05` §C).
- On narrow screens the web shows bottom tabs **Dashboard · Tickets · Alerts · Knowledge · Requests** to every role (`AppLayout.tsx:258-289`).
- The web has **no profile/settings page**, **no unread badge** and **no polling** (`refetchInterval` appears nowhere).

---

## 1. Web screen → mobile mapping

**Roles:** ALL = ADMIN, AGENT, END_USER, L2_MANAGER. "Nav" = who sees the menu item.

| Web Screen (route · file) | Purpose | Roles (nav) | Mobile Equivalent | MVP / Phase 2 / Skip | Endpoints Used (mobile IDs; web-only calls in *italics*) |
|---|---|---|---|---|---|
| `/login` · `pages/auth/LoginPage.tsx` | Microsoft SSO button; local login form when enabled | public | **M1 Login** | **MVP** (blocked on A1/A2) | SYS-1, AUTH-1, AUTH-P1/AUTH-P2 (pending). *Web: `POST /auth/login`, redirect to `/auth/microsoft`* |
| `/change-password` · `pages/auth/ChangePasswordPage.tsx` | Forced first password set. **Unreachable on web** | local-auth users | M10 Profile → "Change password" | **Phase 2** (only if `localAuthEnabled`) | USR-4 |
| `/dashboard` · `pages/dashboard/DashboardPage.tsx` | ~14 charts, KPIs, range picker | ALL | **M2 Home** (staff variant: KPI cards + recent) | **MVP** (simplified) | DSH-1, NTF-2 |
| `/portal` · `pages/portal/PortalPage.tsx` | End-user landing: raise ticket, latest tickets, KB search | ALL | **M2 Home** (END_USER variant) | **MVP** (merged into Home) | TKT-1, DSH-1. KB search is P2 (KB-3). *Web: `GET /tickets?pageSize=10` (ignored)* |
| `/tickets` · `pages/tickets/TicketsListPage.tsx` | Filtered list, search, saved views, CSV export | ALL | **M3 Ticket list**: named-filter drop-down, sort sheet, inline status chip, multi-select with bulk Pick up / Assign / Close (`08` §4) | **MVP** (no CSV, no saved views) | TKT-1, TKT-5 and TKT-6 (inline/bulk, staff), LKP-2 (staff group filter), LKP-1, LKP-4/LKP-5 (country), USR-3 (requester filter, ADMIN/AGENT) |
| `/tickets/new` · `pages/tickets/CreateTicketPage.tsx` | Create ticket (3-level category, staff fields, files) | ALL (from buttons) | **M8 Create ticket** | **MVP** | LKP-1, LKP-2 (staff), USR-3 (staff), TKT-2, ATT-2. Priority preview is P2 (LKP-6) |
| `/tickets/:id` · `pages/tickets/TicketDetailPage.tsx` | Full workspace: 10 tabs, properties, status bar, closure modal, composer, assignment, tasks, attachments, approvals, history | ALL (actions role-gated) | **M4 Ticket detail**, **M5 Reply composer**, **M6 Status & closure sheet**, **M7 Assign picker**, **M11 Task editor** | **MVP**. Skipped: Associations; Approvals tab (needs A27, `08` 1.35); Worklog (no model, A19); Checklists/Reminders (placeholders) | TKT-3, TKT-4, TKT-5, TKT-6, TKT-7, TKT-9, TKT-10, CMT-1 (Notes, ADMIN/AGENT), CMT-2, ATT-1, ATT-2, ATT-3, ATT-4, TSK-1, TSK-2, TSK-3, TSK-4, USR-3, LKP-1, LKP-2. *Web-only: priority-matrix, link-problem/change (dead), unscoped `GET /approvals`, problems, changes* |
| `/ticket/:ticketNumber` · `pages/tickets/TicketRedirectPage.tsx` | Email link: ticket number → UUID | ALL | Deep-link handler (no screen) | **MVP** (in-app logic); OS app links **Phase 2** (A18) | TKT-1 `search=<n>` (`05` §A.11) |
| `/tickets/kanban` · `pages/tickets/KanbanPage.tsx` | Drag-and-drop status board | ADMIN, AGENT, L2 | — | **Skip** | *`GET /tickets?pageSize=500`, `PUT /tickets/:id {status}` (no-op)* |
| `/notifications` · `pages/notifications/NotificationsPage.tsx` | Inbox, mark read / all read | ALL | **M9 Notifications** ("Alerts" tab + badge) | **MVP** | NTF-1, NTF-2, NTF-3, NTF-4 |
| `/kb`, `/kb/:slug` · `pages/kb/KBPage.tsx`, `KBArticlePage.tsx` | Browse, search, read, "helpful" vote | ALL | **M14 Knowledge base**, **M15 KB article** (drawer) | **MVP** (was Phase 2 P1) | KB-1, KB-2, KB-3, KB-4, KB-5 |
| `/kb/new`, `/kb/edit/:slug` · `pages/kb/KBArticleFormPage.tsx` | Author articles | ADMIN, AGENT | — | **Skip** | *`POST/PUT /kb/articles`. Publish is never called; edit links are broken* |
| `/service-catalog` · `pages/service-catalog/ServiceCatalogPage.tsx` | Catalog browse + "my requests" | ALL ("Requests" tab) | P2 Service catalog + My requests | **Phase 2** | SCR-1, SCR-2, SCR-4 |
| `/service-catalog/new/:itemId` · `ServiceRequestFormPage.tsx` | Dynamic request form | ALL | P3 Service request form | **Phase 2** | SCR-3, SCR-5, SCR-6 |
| `/approvals` · `pages/approvals/ApprovalsPage.tsx` | My pending approvals; approve/reject | nav: ADMIN, AGENT. Server: any approver | **M12 Approvals inbox**, **M13 Approval detail** (drawer; END_USER/L2 only while they have pending approvals, `08` S1) | **MVP** (was Phase 2 P4) | APR-1, APR-2, APR-3, TKT-3/TKT-7/ATT-1 best-effort (ticket approvals carry no ticket data; `08` 1.49) |
| `/announcements` · `pages/announcements/AnnouncementsPage.tsx` | Read; ADMIN manages | ADMIN, AGENT, L2 | **M16 Announcements** (drawer) + pinned banner on M2 Home | **MVP** (was Phase 2 P5) | ANN-1 |
| `/reports`, `/reports/scheduled`, `/reports/query-builder` | 10 report tabs, ~20 charts, exports, scheduled reports, ad-hoc queries | ADMIN, AGENT, L2 (query builder: URL only) | — | **Skip** | *`/reports/*`, `/query-builder/*`* |
| `/problems` · `pages/problems/ProblemsPage.tsx` | Problem management | ADMIN, AGENT | — | **Skip** | *`/problems/*`* |
| `/changes` · `pages/changes/ChangesPage.tsx` | Change management, CAB flow | ADMIN, AGENT | — (approve via P4 later) | **Skip** | *`/changes/*`* |
| `/assets` · `pages/assets/AssetsPage.tsx` | CMDB: assets, vendors, contracts, licences, tree | ADMIN, AGENT | P18 Asset lookup / QR scan (staff) | **Skip** for the MVP; lookup is **Phase 2** (P18) | *`/assets/*`*. P18 would use `GET /assets?search=` and `GET /assets/:id` after a `01` entry; exact tag lookup is A29 |
| `/purchase-orders` · `pages/purchaseOrders/PurchaseOrdersPage.tsx` | PO CRUD, approve, receive | ADMIN, AGENT | — | **Skip** | *`/purchase-orders/*`* |
| `/projects` · `pages/projects/ProjectsPage.tsx` | Projects, tasks, milestones, Gantt | ADMIN, AGENT | — | **Skip** | *`/projects/*`* |
| `/surveys` · `pages/surveys/SurveysPage.tsx` | Survey builder and stats | ADMIN | — | **Skip** | *`/surveys/*` (`/respond` is dead)* |
| `/admin` + 21 `/admin/*` pages | Configuration: countries, users, teams, categories, templates, canned responses, SLA, PM, custom fields, email, KB categories, business rules, sites, departments, operational hours, holidays, priority matrix, CAB, closure rules, user groups | ADMIN | — | **Skip** | *admin endpoints (`01` Appendix A)* |
| *(none on web)* | — | — | **M10 Profile & settings** (name, phone, department, timezone; country selector; theme System/Light/Dark; sign out). Opened from the drawer header, not a tab | **MVP** (new) | AUTH-2, USR-1, USR-2, LKP-4, LKP-5, AUTH-3 |

### Web screens whose function does not make sense on a phone
| Web screen / feature | Why not on a phone |
|---|---|
| **Kanban** | HTML5 drag-and-drop doesn't work on touch, and six fixed 288 px columns need horizontal scroll. Its status change is **broken server-side** anyway (`PUT {status}` is a no-op, `05` §B.1) |
| **Reports / Query builder / Scheduled reports** | Many-series charts, wide tables, CSV/PPTX export and cron-style configuration: desk analysis work |
| **Dashboard technician/team matrices** | Wide matrices, and several are **mis-scoped** server-side (`05` §B.20). Mobile shows only correctly scoped KPI counts and the recent list |
| **Ticket CSV export** | Built client-side by paging the whole list; nothing a phone user needs |
| **Projects (Gantt), Purchase Orders, Assets tables, CMDB tree** | Wide tables and line-item editing |
| **All 21 Admin pages, Business-rule builder, SLA/priority matrix editors** | Bulk configuration with large forms. Errors there affect everyone |
| **KB authoring and rich-text editor with inline images** | Inline base64 images hit the 2 MB JSON limit, and web publishing is broken |
| **Ticket-detail extras** (Associations to problems/changes, Submit for approval, Worklog/Reminder/Checklist placeholder tabs, Print, "Duplicate", "Email the Technician") | Several are dead or fake on web (`05` §B.33). Problem/change linking calls routes that don't exist |
| **Saved views** | Desktop filter sets; mobile uses fixed quick filters |

---

## 2. Proposed mobile screens

### 2.1 MVP: 16 screens

**Navigation** (full spec: `08-SDP-PARITY.md` §3)
- A **side drawer** ("Menu", as in SDP), opened by ☰ top-left on every root screen or by an edge-swipe, wraps **three bottom tabs: Home · Tickets · Alerts**.
  - END_USER sees the Tickets tab labelled "My Tickets".
  - The Alerts tab shows the unread badge.
- **Drawer header:** avatar, name, role, country chip. Tap → M10.
- **Drawer items by role**
  - **Approvals** (badge): ADMIN and AGENT always; END_USER and L2 only while APR-1 returns ≥ 1 (`08` S1).
  - **Knowledge base** and **Announcements**: all roles.
  - **Settings** and **Sign out**: all roles.
  - Footer: app version + environment.
  - Later (hidden until their asks ship): My tasks (A20), Service catalog (P2), Assets (P18).
- **"+" FAB** on Home and Tickets → M8.
- **Android back:** closes the drawer or sheet first, then returns to Home, then exits.
- Ticket detail, composer, closure, assign, task editor and approval detail are stack or modal screens.

| # | Screen | Who | Purpose and content | Endpoints | Rules |
|---|---|---|---|---|---|
| **M1** | **Login** | public | SSO button (A2) and/or username+password (A1), chosen by AUTH-1; error messages from `05` §A.13; environment label on non-prod builds | SYS-1, AUTH-1, AUTH-P1/P2, AUTH-2 | `02-AUTH.md` §4–§5 |
| **M2** | **Home** | all | **END_USER:** "Raise a ticket" button, pinned-announcement banner, my 5 most recent tickets, open/resolved counts. **Staff:** tiles that open the Tickets tab with a named filter pre-applied: My open, Unassigned*, Overdue (`sla=BREACHED`), Due soon (`sla=DUE_SOON`); KPI counts (`open`, `inProgress`, `onHold`, `slaBreached`, `totalOpen`); Pending approvals tile (count, → M12); announcement banner; `recent` list | DSH-1, TKT-1, NTF-2, APR-1, ANN-1 | `01` DSH-1 (only the safe KPIs); *`unassigned` only for ADMIN and triage AGENT; no "Due today" until A23 (`08` S6) |
| **M3** | **Ticket list** | all | Infinite list (20/page). **Named-filter drop-down:** All · Open · My open · Unassigned (staff) · Pending · Overdue · Due soon · Resolved · Closed, plus an "Advanced" sheet (priority, group, category, created dates, country). **Search** box: digits = ticket #; text matches subject, requester and technician (no field selector, A22). **Requester** filter chip via USR-3 (ADMIN/AGENT). **Sort sheet:** Last updated · Priority · Due date (no other sorts or direction, A21). **Inline status chip** on each card (transition map only; hidden for END_USER). **Tap-and-hold multi-select** → bulk Pick up / Assign (ADMIN/AGENT) and Close (staff), max **20** per action, sequential, stop on first 429/5xx. Row: #, subject, status chip, priority, SLA badge (hold-adjusted), requester/technician, "new reply" highlight | TKT-1, TKT-5, TKT-6, LKP-2, LKP-4/5, USR-3 | `08` §4; `05` §A.1, §A.2, §A.9, §A.10, §A.12, §B.14; D8 |
| **M4** | **Ticket detail** | all (actions by role) | **Header:** #, subject, **status drop-down** (staff; transition map), priority, SLA, attachments icon with **count badge** (`_count.attachments`). **"More options" sheet** (bottom-right): Pick up, Assign (M7), Close (M6); ADMIN/AGENT only for Pick up/Assign. **Properties:** impact/urgency, category cascade, group, technician, country, requester card. **Sections:** Conversations (FAB → M5) · Notes (PRIVATE comments; ADMIN/AGENT only) · History · Resolution (resolution, closure code, FCR, closure comments) · Tasks (→ M11) · Attachments. Description as sanitised HTML | TKT-3, TKT-7, TKT-4, TKT-5, TKT-6, CMT-1, ATT-1, ATT-3, ATT-4, TSK-1, TSK-3, LKP-1, LKP-2 | `05` §A.1, §A.3, §A.6, §A.7, §A.9, §A.15; §C hygiene rules. No Worklog (A19) or Approvals (A27) sections |
| **M5** | **Reply / Note composer** | all (Note: ADMIN/AGENT) | Reply, Reply-All (staff), Note; To/CC chips (staff); plain-text body; attach files/photos (camera, gallery, documents); send | CMT-2, ATT-2, TKT-9, USR-3 | `05` §A.5, §A.16; §B.11; client-side file checks (§B.9) |
| **M6** | **Status & closure sheet** | ADMIN, AGENT, L2 | Transition buttons from the map; for RESOLVED/CLOSED/CANCELED: Resolution*, Closure code, FCR, Closure comments*, attachments. **Bulk mode** (from M3): one Close form applied to each eligible selected ticket. Tickets whose status has no Close transition are skipped and listed. The confirmation states how many requesters will be emailed | TKT-6, ATT-2 | `05` §A.1, §A.2; `08` §4.2 |
| **M7** | **Assign picker** | ADMIN, AGENT | **Group selector** first (LKP-2, active groups), then its members with search; Recommended (country, TKT-10); user search (USR-3) when a group has no members; "Assign to me"; remove assignment. **Bulk mode** (from M3): the same picker, applied per ticket with `{assignedToId, teamId}` | TKT-10, LKP-2, USR-3, TKT-5 (or TKT-4) | `05` §A.4; §B.14, §B.30; `08` §4.2 |
| **M8** | **Create ticket** | all | Title, description, 3-level category cascade; **staff only:** impact, urgency, team ("Auto (from category)"), assignee, requester (raise on behalf); attachments (photos/files) uploaded after create; END_USER routing banner | LKP-1, LKP-2, USR-3, TKT-2, ATT-2 | `05` §A.8; D5 |
| **M9** | **Notifications** | all | List (unread first in the UI), tap → ticket (by `ticketId`), mark read, mark all read; tab badge from the count | NTF-1, NTF-2, NTF-3, NTF-4 | `05` §B.3, §B.4, §B.23 |
| **M10** | **Profile & settings** | all | Opened from the drawer header. Name, email, role label (`08` S3), phone, department, timezone (editable: name, phone, department, timezone); country selector (ADMIN, triage AGENT; locked display for country agents; hidden for L2); **theme: System / Light / Dark** (stored on the device); app version + environment; **Sign out** | AUTH-2, USR-1, USR-2, LKP-4, LKP-5, AUTH-3 | `02-AUTH.md` §5.5; `05` §A.12 |
| **M11** | **Task editor** (sheet from M4 Tasks) | ADMIN, AGENT, L2 | Create, edit (title, description, technician, status, due date), delete with "Remove this task?" confirm. END_USER: read-only list in M4 (D4) | TSK-2, TSK-3, TSK-4 | `05` §A.15; B.25 (`dueDate` as full UTC ISO); C.3 (no server checks, so staff-only by UI) |
| **M12** | **Approvals inbox** | ADMIN, AGENT; END_USER/L2 while they have pending approvals | Cards (entity type, title/number when available, requested date, stage); filter chips **All · Tickets · Service requests · Changes** (client-side on `entityType`); pull-to-refresh; drawer badge = count | APR-1 | `08` 1.47–1.48; S1, S2 |
| **M13** | **Approval detail + Take action** | approver | Approval facts; for `ticket`: try TKT-3 by `entityId` and show subject, description, public conversation and attachments **only if it returns 200**. On 403, show "details not available on mobile". For `service_request`: embedded `serviceRequest`. For `change`: `{changeNumber, title, status}` only. **Take action** → comments → Approve (comment optional) / Reject (comment required). After a decision, show "Ticket stays Pending Management Review until a technician moves it" | APR-2, APR-3, TKT-3, TKT-7, ATT-1, ATT-3 | `05` B.22; `08` 1.49, S8. Never rely on the AGENT scope gap (C.6) |
| **M14** | **Knowledge base** | all | Category list (hide `isPublic:false`), article list (paged), search (≥ 2 chars, KB-3) | KB-1, KB-2, KB-3 | `05` B.26; never send `published` |
| **M15** | **KB article** | all | Sanitised HTML body, tags, "Was this helpful?" (one vote per article per device) | KB-4, KB-5 | `01` KB-4 (show "not available" if `isPublished` is false) |
| **M16** | **Announcements** | all | List ordered as the server returns it (pinned first), type chip (INFO / WARNING / CRITICAL / MAINTENANCE), expandable sanitised body. Pinned ones also appear as the M2 banner | ANN-1 | `08` 1.60, S1 |

**Shared components (not screens)**
- Navigation drawer (§2.1 Navigation).
- Named-filter drop-down, sort sheet, advanced-filter sheet, bulk-action bar and progress/result sheet (`08` §4).
- Attachment viewer (image/PDF inline, others via share sheet: ATT-3/ATT-4).
- HTML renderer (`05` §A.6).
- SLA badge; status and priority chips.
- Theme tokens (light/dark).
- Deep-link resolver (`05` §A.11).
- Offline/error banner (SYS-1).

**MVP endpoint coverage**
- **44 endpoints:** the 33 from `01` Appendix B, plus KB-1..KB-5, APR-1..APR-3, ANN-1, TSK-2 and TSK-4.
- Plus the pending auth endpoint (A1 or A2).
- ⚠ `01` Appendix B still labels these 11 as P2 until Ronit approves the label update (`08` §9 R7-1).

**What each role can do in the MVP**

| Capability | END_USER | AGENT | L2_MANAGER | ADMIN |
|---|---|---|---|---|
| See own / scoped tickets | own | own + team (+ unassigned if triage) | own + team + team members | all |
| Create ticket | ✅ (basic fields) | ✅ (+ staff fields, on behalf) | ✅ (+ impact/urgency; no team list, as `/teams` returns 403) | ✅ |
| Public reply | ✅ | ✅ | ✅ | ✅ |
| Private note | ❌ | ✅ | ❌ | ✅ |
| Change status / close | ❌ | ✅ (locked on CLOSED/CANCELED) | ✅ | ✅ |
| Assign / reassign / pick up | ❌ | ✅ | ❌ (server 403) | ✅ |
| Inline status chip on list cards | ❌ | ✅ (not on CLOSED/CANCELED) | ✅ | ✅ |
| Bulk Pick up / Assign (max 20) | ❌ | ✅ | ❌ | ✅ |
| Bulk Close (max 20) | ❌ | ✅ | ✅ | ✅ |
| Edit category / impact / urgency | ❌ | ✅ | impact/urgency only | ✅ |
| Notes section (read/write private notes) | ❌ | ✅ | ❌ | ✅ |
| Tasks: toggle / add / edit / delete | ❌ (read-only, D4) | ✅ | ✅ | ✅ |
| Approvals inbox and approve/reject | only while they have pending approvals (`08` S1) | ✅ | only while they have pending approvals | ✅ |
| Knowledge base (published, public) | ✅ | ✅ | ✅ | ✅ |
| Announcements | ✅ (`08` S1) | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ✅ |
| Theme (System / Light / Dark) | ✅ | ✅ | ✅ | ✅ |

### 2.2 Phase 2

P-IDs are stable. Items moved into the MVP keep their ID and are marked as moved.

| # | Screen / feature | Endpoints | Notes / dependency |
|---|---|---|---|
| P1 | ~~Knowledge base~~ **→ moved to MVP (M14, M15)** | KB-1..KB-5 | 2026-10-14, SDP parity |
| P2 | Service catalog + My requests | SCR-1, SCR-2, SCR-4 | Drawer item "Request a service". Stays Phase 2 (`08` S7: B.24, SCR-4 scope gap) |
| P3 | Service request form (dynamic `formFields`) | SCR-3, SCR-5, SCR-6 | Send only kept fields; no attachments (`05` §B.24) |
| P4 | ~~Approvals inbox~~ **→ moved to MVP (M12, M13)** | APR-1..APR-3, TKT-3 | 2026-10-14, SDP parity |
| P5 | ~~Announcements banner and list~~ **→ moved to MVP (M16 + M2 banner)** | ANN-1 | 2026-10-14, SDP parity |
| P6 | Composer: canned responses | LKP-7 | Staff |
| P7 | Comment edit/delete, attachment delete (task add/delete **moved to MVP M11**) | CMT-3, CMT-4, ATT-5 | Role gating per `05` §A.3 |
| P8 | Priority preview on create/edit (staff) | LKP-6 | Preview only |
| P9 | Change password (local-auth environments) | USR-4 | `05` §A.14 |
| P10 | **Push notifications** | AUTH-P4 | Needs **A5** |
| P11 | **Universal / app links** from emails | AUTH-P5 | Needs **A18** (+ A8 recommended) |
| P12 | Longer sessions / silent refresh | AUTH-P3 | Needs **A3** (+ A13) |
| P13 | SLA details panel | TKT-8 | Optional; TKT-3 already has the fields |
| P14 | Customisable ticket-detail field list (per device) | — | Client-only preference (`08` 1.58) |
| P15 | Ticket templates on Create (staff) | `GET /templates` (not in `01` yet) | Needs a `01` entry + Ronit's OK. For END_USER needs **A28** |
| P16 | Submit ticket for approval (staff) | `POST /approvals` (not in `01` yet) | Needs a `01` entry. Sets PENDING_MGMT_REVIEW without SLA-hold bookkeeping (`08` §9 R7-8) |
| P17 | Standalone **My tasks** (list, filter, search, "view parent ticket") | — | Needs **A20** |
| P18 | Asset lookup / QR scan (staff) | `GET /assets?search=`, `GET /assets/:id` (not in `01` yet) | Needs a `01` entry; exact lookup **A29**; QR labels must exist first |
| P19 | Worklogs + worklog timer (ticket and task) | — | Needs **A19** |
| P20 | Merge tickets | — | Needs **A25** |
| P21 | Approval delegation / revoke | — | Needs **A26** |
| P22 | Ticket "Approvals" section; full approval detail for every approver; my approval history | — | Needs **A27** |
| P23 | More sorts (ID, status, subject, requester; asc/desc) and a search field selector | TKT-1 | Needs **A21**, **A22** |
| P24 | "Due today" filter and Home tile | TKT-1, DSH-1 | Needs **A23** |
| P25 | Requester acknowledgement on Close | TKT-6 | Needs **A30** |
| P26 | Bulk actions without the 20-ticket cap | — | Needs **A24** (and A14) |

### 2.3 Explicitly out of scope for mobile
| Item | Reason |
|---|---|
| Kanban board | Touch drag-and-drop; server ignores status via PUT |
| Reports, query builder, scheduled reports, dashboard technician/team matrices | Desk analytics; wide charts and tables; several widgets mis-scoped |
| Admin (21 pages), SLA/priority-matrix/business-rule/closure-rule editors | Bulk configuration; ADMIN-only; high blast radius |
| Problems, Changes, CAB | ITSM back-office. Linking a ticket to a change **force-closes** it; problem/change linking from tickets is broken on web |
| Asset management (CRUD, vendors, contracts, licences, tree), Purchase Orders, Projects | Wide tables, Gantt, line items. Staff asset **lookup** is Phase 2 (P18) |
| Surveys (admin and responses) | Never triggered automatically; the web response path is dead |
| KB authoring | Rich-text authoring with inline images; publish flow broken |
| Ticket CSV export, saved views, print | Desktop workflows |
| SSE live stream | Broken server-side; replaced by polling now and push later |
| Expo Web build | Blocked by single-origin CORS; not a target |
| **Ticket delete** (single or bulk; SDP has it) | No `DELETE /tickets/:id` route and no web equivalent; MMG uses status CANCELED (`08` 1.13) |
| **Request-type filter Incident / Service / Both** (SDP) | Tickets have no type field; service requests are a separate module (`08` 1.3) |
| **SAML login** (SDP) | MMG has no SAML; enterprise SSO is Entra ID via A2 (`08` 1.64) |

---

## 3. Change log

### 2026-10-14: SDP parity revision (source: `08-SDP-PARITY.md` §5)
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
