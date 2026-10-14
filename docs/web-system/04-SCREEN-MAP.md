# 04 — Screen Map (web → mobile)

**Sources**
- Web routes: `frontend/src/router/index.tsx:89-162`.
- Navigation and role visibility: `frontend/src/layouts/AppLayout.tsx:18-58, 258-289`.
- Endpoints per page: from each page's API calls. Endpoint IDs refer to `01-API-CONTRACT.md`.

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
| `/tickets` · `pages/tickets/TicketsListPage.tsx` | Filtered list, search, saved views, CSV export | ALL | **M3 Ticket list** | **MVP** (no CSV, no saved views) | TKT-1, LKP-2 (staff team filter), LKP-1, LKP-4/LKP-5 (country) |
| `/tickets/new` · `pages/tickets/CreateTicketPage.tsx` | Create ticket (3-level category, staff fields, files) | ALL (from buttons) | **M8 Create ticket** | **MVP** | LKP-1, LKP-2 (staff), USR-3 (staff), TKT-2, ATT-2. Priority preview is P2 (LKP-6) |
| `/tickets/:id` · `pages/tickets/TicketDetailPage.tsx` | Full workspace: 10 tabs, properties, status bar, closure modal, composer, assignment, tasks, attachments, approvals, history | ALL (actions role-gated) | **M4 Ticket detail**, **M5 Reply composer**, **M6 Status & closure sheet**, **M7 Assign picker** | **MVP** (Associations, Approvals, Worklog etc. skipped) | TKT-3, TKT-4, TKT-5, TKT-6, TKT-7, TKT-9, TKT-10, CMT-2, ATT-1, ATT-2, ATT-3, ATT-4, TSK-1, TSK-3, USR-3, LKP-1, LKP-2. *Web-only: priority-matrix, link-problem/change (dead), approvals, problems, changes* |
| `/ticket/:ticketNumber` · `pages/tickets/TicketRedirectPage.tsx` | Email link: ticket number → UUID | ALL | Deep-link handler (no screen) | **MVP** (in-app logic); OS app links **Phase 2** (A18) | TKT-1 `search=<n>` (`05` §A.11) |
| `/tickets/kanban` · `pages/tickets/KanbanPage.tsx` | Drag-and-drop status board | ADMIN, AGENT, L2 | — | **Skip** | *`GET /tickets?pageSize=500`, `PUT /tickets/:id {status}` (no-op)* |
| `/notifications` · `pages/notifications/NotificationsPage.tsx` | Inbox, mark read / all read | ALL | **M9 Notifications** (+ tab badge) | **MVP** | NTF-1, NTF-2, NTF-3, NTF-4 |
| `/kb`, `/kb/:slug` · `pages/kb/KBPage.tsx`, `KBArticlePage.tsx` | Browse, search, read, "helpful" vote | ALL | P1 Knowledge (list + article) | **Phase 2** | KB-1, KB-2, KB-3, KB-4, KB-5 |
| `/kb/new`, `/kb/edit/:slug` · `pages/kb/KBArticleFormPage.tsx` | Author articles | ADMIN, AGENT | — | **Skip** | *`POST/PUT /kb/articles`. Publish is never called; edit links are broken* |
| `/service-catalog` · `pages/service-catalog/ServiceCatalogPage.tsx` | Catalog browse + "my requests" | ALL ("Requests" tab) | P2 Service catalog + My requests | **Phase 2** | SCR-1, SCR-2, SCR-4 |
| `/service-catalog/new/:itemId` · `ServiceRequestFormPage.tsx` | Dynamic request form | ALL | P3 Service request form | **Phase 2** | SCR-3, SCR-5, SCR-6 |
| `/approvals` · `pages/approvals/ApprovalsPage.tsx` | My pending approvals; approve/reject | nav: ADMIN, AGENT. Server: any approver | P4 Approvals inbox | **Phase 2** | APR-1, APR-2, APR-3, TKT-3 (ticket approvals carry no ticket data) |
| `/announcements` · `pages/announcements/AnnouncementsPage.tsx` | Read; ADMIN manages | ADMIN, AGENT, L2 | Banner/list on M2 Home | **Phase 2** | ANN-1 |
| `/reports`, `/reports/scheduled`, `/reports/query-builder` | 10 report tabs, ~20 charts, exports, scheduled reports, ad-hoc queries | ADMIN, AGENT, L2 (query builder: URL only) | — | **Skip** | *`/reports/*`, `/query-builder/*`* |
| `/problems` · `pages/problems/ProblemsPage.tsx` | Problem management | ADMIN, AGENT | — | **Skip** | *`/problems/*`* |
| `/changes` · `pages/changes/ChangesPage.tsx` | Change management, CAB flow | ADMIN, AGENT | — (approve via P4 later) | **Skip** | *`/changes/*`* |
| `/assets` · `pages/assets/AssetsPage.tsx` | CMDB: assets, vendors, contracts, licences, tree | ADMIN, AGENT | — | **Skip** (future: asset lookup / QR scan) | *`/assets/*`* |
| `/purchase-orders` · `pages/purchaseOrders/PurchaseOrdersPage.tsx` | PO CRUD, approve, receive | ADMIN, AGENT | — | **Skip** | *`/purchase-orders/*`* |
| `/projects` · `pages/projects/ProjectsPage.tsx` | Projects, tasks, milestones, Gantt | ADMIN, AGENT | — | **Skip** | *`/projects/*`* |
| `/surveys` · `pages/surveys/SurveysPage.tsx` | Survey builder and stats | ADMIN | — | **Skip** | *`/surveys/*` (`/respond` is dead)* |
| `/admin` + 21 `/admin/*` pages | Configuration: countries, users, teams, categories, templates, canned responses, SLA, PM, custom fields, email, KB categories, business rules, sites, departments, operational hours, holidays, priority matrix, CAB, closure rules, user groups | ADMIN | — | **Skip** | *admin endpoints (`01` Appendix A)* |
| *(none on web)* | — | — | **M10 Profile & settings** (name, phone, department, timezone; country selector; sign out) | **MVP** (new) | AUTH-2, USR-1, USR-2, LKP-4, LKP-5, AUTH-3 |

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

### 2.1 MVP: 10 screens

Navigation: **bottom tabs Home · Tickets · Alerts · Profile**, plus a "+ New ticket" action on Home and Tickets. Ticket detail, composer, closure and assign are stack or modal screens.

| # | Screen | Who | Purpose and content | Endpoints | Rules |
|---|---|---|---|---|---|
| **M1** | **Login** | public | SSO button (A2) and/or username+password (A1), chosen by AUTH-1; error messages from `05` §A.13; environment label on non-prod builds | SYS-1, AUTH-1, AUTH-P1/P2, AUTH-2 | `02-AUTH.md` §4–§5 |
| **M2** | **Home** | all | **END_USER:** "Raise a ticket" button, my 5 most recent tickets, open/resolved counts. **Staff:** KPI cards (`open`, `inProgress`, `onHold`, `slaBreached`, `totalOpen`, `unassigned`*), `recent` list, quick links to filtered lists (Unassigned, My open, Breached). Unread badge | DSH-1, TKT-1, NTF-2 | `01` DSH-1 (only the safe KPIs); *`unassigned` only for ADMIN and triage AGENT |
| **M3** | **Ticket list** | all | Infinite list (20/page), search box (digits = ticket #), quick filters: status group, priority, SLA, assigned to me / unassigned (staff), team (ADMIN/AGENT), sort (updated / priority / SLA). Row: #, title, status badge, priority, SLA badge (hold-adjusted), requester/assignee, "new reply" highlight | TKT-1, LKP-2, LKP-4/5 | `05` §A.9, §A.10, §A.12; D8 |
| **M4** | **Ticket detail** | all (actions by role) | Header (#, title, status, priority, SLA), status action bar (staff), properties (impact/urgency, category cascade, team, assignee, country, requester card), tabs **Conversation · History · Attachments · Tasks**, description (sanitised HTML), resolution block | TKT-3, TKT-7, TKT-4, ATT-1, ATT-3, ATT-4, TSK-1, TSK-3, LKP-1, LKP-2 | `05` §A.1, §A.3, §A.6, §A.7, §A.9, §A.15; §C hygiene rules |
| **M5** | **Reply / Note composer** | all (Note: ADMIN/AGENT) | Reply, Reply-All (staff), Note; To/CC chips (staff); plain-text body; attach files/photos (camera, gallery, documents); send | CMT-2, ATT-2, TKT-9, USR-3 | `05` §A.5, §A.16; §B.11; client-side file checks (§B.9) |
| **M6** | **Status & closure sheet** | ADMIN, AGENT, L2 | Transition buttons from the map; for RESOLVED/CLOSED/CANCELED: Resolution*, Closure code, FCR, Closure comments*, attachments | TKT-6, ATT-2 | `05` §A.1, §A.2 |
| **M7** | **Assign picker** | ADMIN, AGENT | Sections: Recommended (country), team members, search; "Assign to me"; remove assignment; team change | TKT-10, LKP-2, USR-3, TKT-5 (or TKT-4) | `05` §A.4; §B.14, §B.30 |
| **M8** | **Create ticket** | all | Title, description, 3-level category cascade; **staff only:** impact, urgency, team ("Auto (from category)"), assignee, requester (raise on behalf); attachments (photos/files) uploaded after create; END_USER routing banner | LKP-1, LKP-2, USR-3, TKT-2, ATT-2 | `05` §A.8; D5 |
| **M9** | **Notifications** | all | List (unread first in the UI), tap → ticket (by `ticketId`), mark read, mark all read; tab badge from the count | NTF-1, NTF-2, NTF-3, NTF-4 | `05` §B.3, §B.4, §B.23 |
| **M10** | **Profile & settings** | all | Name, email, role, phone, department, timezone (editable: name, phone, department, timezone); country selector (ADMIN, triage AGENT; locked display for country agents; hidden for L2); app version + environment; **Sign out** | AUTH-2, USR-1, USR-2, LKP-4, LKP-5, AUTH-3 | `02-AUTH.md` §5.5; `05` §A.12 |

**Shared components (not screens):** attachment viewer (image/PDF inline, others via share sheet: ATT-3/ATT-4), HTML renderer (`05` §A.6), SLA badge, status/priority badges, deep-link resolver (`05` §A.11), offline/error banner (SYS-1).

**MVP endpoint coverage:** 33 endpoints (`01` Appendix B), plus the pending auth endpoint (A1 or A2).

**What each role can do in the MVP**

| Capability | END_USER | AGENT | L2_MANAGER | ADMIN |
|---|---|---|---|---|
| See own / scoped tickets | own | own + team (+ unassigned if triage) | own + team + team members | all |
| Create ticket | ✅ (basic fields) | ✅ (+ staff fields, on behalf) | ✅ (+ impact/urgency; no team list, as `/teams` returns 403) | ✅ |
| Public reply | ✅ | ✅ | ✅ | ✅ |
| Private note | ❌ | ✅ | ❌ | ✅ |
| Change status / close | ❌ | ✅ (locked on CLOSED/CANCELED) | ✅ | ✅ |
| Assign / reassign | ❌ | ✅ | ❌ (server 403) | ✅ |
| Edit category / impact / urgency | ❌ | ✅ | impact/urgency only | ✅ |
| Toggle task done | ❌ (read-only, D4) | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ✅ |

### 2.2 Phase 2
| # | Screen / feature | Endpoints | Notes / dependency |
|---|---|---|---|
| P1 | Knowledge base (categories, list, search, article, helpful) + "Knowledge" tab | KB-1..KB-5 | Public, published articles only (`05` §B.26) |
| P2 | Service catalog + My requests | SCR-1, SCR-2, SCR-4 | "Requests" tab, as on web |
| P3 | Service request form (dynamic `formFields`) | SCR-3, SCR-5, SCR-6 | Send only kept fields; no attachments (`05` §B.24) |
| P4 | Approvals inbox (approve/reject) | APR-1..APR-3, TKT-3 | Ticket stays `PENDING_MGMT_REVIEW` after a decision (`05` §B.22) |
| P5 | Announcements banner and list on Home | ANN-1 | |
| P6 | Composer: canned responses | LKP-7 | Staff |
| P7 | Task add/delete, comment edit/delete, attachment delete | TSK-2, TSK-4, CMT-3, CMT-4, ATT-5 | Role gating per `05` §A.3 |
| P8 | Priority preview on create/edit (staff) | LKP-6 | Preview only |
| P9 | Change password (local-auth environments) | USR-4 | `05` §A.14 |
| P10 | **Push notifications** | AUTH-P4 | Needs **A5** |
| P11 | **Universal / app links** from emails | AUTH-P5 | Needs **A18** (+ A8 recommended) |
| P12 | Longer sessions / silent refresh | AUTH-P3 | Needs **A3** (+ A13) |
| P13 | SLA details panel | TKT-8 | Optional; TKT-3 already has the fields |

### 2.3 Explicitly out of scope for mobile
| Item | Reason |
|---|---|
| Kanban board | Touch drag-and-drop; server ignores status via PUT |
| Reports, query builder, scheduled reports, dashboard technician/team matrices | Desk analytics; wide charts and tables; several widgets mis-scoped |
| Admin (21 pages), SLA/priority-matrix/business-rule/closure-rule editors | Bulk configuration; ADMIN-only; high blast radius |
| Problems, Changes, CAB | ITSM back-office. Linking a ticket to a change **force-closes** it; problem/change linking from tickets is broken on web |
| Assets, Purchase Orders, Projects | Wide tables, Gantt, line items. Asset lookup or QR scan could be a future feature |
| Surveys (admin and responses) | Never triggered automatically; the web response path is dead |
| KB authoring | Rich-text authoring with inline images; publish flow broken |
| Submit ticket for approval | ADMIN/AGENT desk action; approval doesn't advance the ticket |
| Ticket CSV export, saved views, print | Desktop workflows |
| SSE live stream | Broken server-side; replaced by polling now and push later |
| Expo Web build | Blocked by single-origin CORS; not a target |
