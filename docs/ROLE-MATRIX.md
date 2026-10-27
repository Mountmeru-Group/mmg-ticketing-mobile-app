# Role matrix: web portal (expected) vs mobile app (audit)

**Phase D-pre RBAC audit, 2026-10-20.** Nothing was built and nothing was committed.

**Updated for Phase G1, 2026-10-22.** Staff property editing on M4 is now built: impact and urgency (with the priority preview), category, country and resolution. Rows T8, T9, T11, T12 and T13, the totals, §0, §3, §6, §7 and §8 are updated; §10 lists what G1 changed. The web's behaviour for these fields, with sources, is in `docs/G1-WEB-BEHAVIOUR.md`.

**Updated for Phase G2, 2026-10-22.** §8 items 2, 11 and 12 are RESOLVED, each by "match the web" (Ronit). The ticket list now has the web's priority, category, date, technician and group filters. Rows L10 (now filled in), L12 (new), T11 and T13, the totals, §0, §1.4, §3, §6, §7 and §8 are updated; §11 lists what G2 changed. The web's filter behaviour, with sources, is in `docs/G2-WEB-FILTERS.md`.

**Updated for Phase G3, 2026-10-22.** Reply templates, deleting a file and submitting a ticket for approval are built, each matching the web's roles and state rules. Rows T22, T26 and C4, the totals, §0, §2, §3, §6 and §7 are updated; §12 lists what G3 changed. The web's behaviour, with sources, is in `docs/G3-WEB-BEHAVIOUR.md`.

**Updated for Phase G4, 2026-10-22.** The service catalogue is built: browsing, the request form with every field type the web renders, and My Requests. §1.9 (expected behaviour) and §2.8 (rows SC1–SC9) are new; row N8, the totals, §0, §2, §6 and §7 are updated; §13 lists what G4 changed. The web's behaviour, with sources, is in `docs/G4-WEB-CATALOGUE.md`.

**Updated for Phase G5, 2026-10-22.** The create form's priority preview is built (CR8, new), and "My Requests" lists every request for staff, as on the web (SC7 is now a MATCH). The full role audit was re-run over every element G1–G4 added; it found two too-permissive cases, both fixed, and one latent one, hardened. §14 has the audit, the fixes and the answers to the brief's four questions. §0, §1.6, §1.9, §2, §6 and §7 are updated.

**Updated 2026-10-27: the technician, inline on M4.** The Technician row in Properties now has a "Change technician" link and an inline editor, like impact/urgency, category and country. **Placement, not a new capability:** it saves through the existing assignment path (`useAssignTicket` → TKT-5), for exactly the roles and states that already had Assign in More options. Rows T6 and A1, §3, §6 and §7 are updated; §15 has the web's picker (with sources), what was built and the duplication check. No row was added and no total changed.

**Sources**
- Web repo clone, read-only, at HEAD `d7f3887` (2026-10-09). It was byte-for-byte unchanged before and after this audit.
- Path prefixes:
  - `FE:` = `frontend/src/`
  - `BE:` = `backend/src/`
  - `src/` = this mobile repo
- Line numbers are as of today.

**Personas**
- The four roles: END_USER, AGENT, L2_MANAGER, ADMIN.
- The **triage AGENT**. "Triage" has two meanings:
  - **Server:** an email listed in `TRIAGE_USER_EMAILS`. Such an agent also sees unassigned tickets (`BE:modules/tickets/tickets.controller.ts:60-73`).
  - **Web UI:** an AGENT with no `countryId` (`FE:components/CountrySelector.tsx:30`). For this persona the UI only unlocks the country switcher.
  - The app cannot see the server's list (ask A4), so it uses the UI definition, as the web does.

**How to read this file**
- §1 is the **expected** behaviour, taken from the web portal's code, not from the docs.
- §2 audits the app against §1.
- The tests in `tests/rbac/role-gating.test.mjs` pin the app's answers. See §7.

---

## 0. Verdicts

| Question | Answer |
|---|---|
| Elements whose role gating differs from the web portal | **30** of the 95 rows in §2 (31 of 94 after G4, 28 of 85 after G3, 29 after G2, 28 of 84 after G1, 30 before it). **0 are security problems** |
| More permissive than the web UI | **3**, all deliberate and documented (N1, N4, CR4). None exposes data or actions beyond what the server already scopes to the user. **G5 audit:** two too-permissive cases below the UI were fixed (§14.3); neither was reachable from a screen |
| More restrictive than the web UI | **27**. Of these: **15** avoid a web defect, a 403, a mis-scoped list or a control that saves nothing (mobile is correct). **12** are documented product decisions. **0** are undocumented. G5: SC7 (My Requests for staff) is now a MATCH, settled against the web's source (§14.2). G4 added three: the request form's controls whose values the server discards (SC6) and the unscoped "My Requests" for staff (SC7), both *defect avoided*, and the admin "+ New Template" (SC3), a *decision*. G2 added one *defect avoided*: the technician and group filters, which the web shows END_USER and L2_MANAGER empty (L10). G3: delete a file (T22) is now a MATCH; submit for approval (T26) is a MATCH for ADMIN and AGENT and moves from *decision* to *defect avoided* for END_USER and L2 (the web's control returns 403); templates (C4) are a MATCH |
| Private notes (check A) | **Hidden client-side, independent of the server.** There are three guards on the conversation and one on history. The Note option is absent for END_USER and L2, and the device refuses a PRIVATE post from them before it is sent. The premise "the API hides notes from L2" is only half true: TKT-7 sends them to L2 (§4) |
| Attachments on private notes (check B) | **Real leak, Critical, backend-only fix.** The requester can list, view, download and zip files attached to a private note, and the header count includes them. The app cannot tell those files apart from others. It can only stop creating new ones (§5) |
| Actions that 403 (check C) | **All hidden**, and assignment is also refused on the device (§6) |
| Fixed in this pass | One hide-vs-disable fix: T21, the Attachments tab now says why a locked AGENT can't add files. All role gating now goes through one tested module, `src/utils/permissions.ts`, and screens render its output. No permission was relaxed |
| Needs Ronit | §8: **nine open** of twelve. The first is Critical: whether staff may attach files to notes. Items 2, 11 and 12 were RESOLVED in G2 |

---

## 1. Expected behaviour: the web portal, from its code

**General facts**
- **There are no route guards.** Every route is open to any signed-in role by URL (`FE:router/index.tsx:58-83, 114-159`). Hiding a nav item is the web's only gate; the backend is the only enforcement.
- The role is read from `useAuthStore(s => s.user).role`. Almost every gate is the negative test `role !== 'END_USER'`, so L2_MANAGER counts as staff almost everywhere.

### 1.1 Navigation (`FE:layouts/AppLayout.tsx`)
| Element | END_USER | AGENT | L2 | ADMIN | Source |
|---|---|---|---|---|---|
| Dashboard, Tickets, Knowledge Base, Notifications, Service Request, Self-Service Portal | ✅ | ✅ | ✅ | ✅ | `:19-22, :30, :34` |
| Reports, Kanban | ❌ | ✅ | ✅ | ✅ | `:23-24` |
| Purchase Orders, Projects, Assets, Problems, Changes | ❌ | ✅ | ❌ | ✅ | `:25-29` |
| Announcements | ❌ | ✅ | ✅ | ✅ | `:31` |
| Approvals | ❌ | ✅ | ❌ | ✅ | `:32` |
| Surveys, Admin section | ❌ | ❌ | ❌ | ✅ | `:33, :82, :135` |
| Bottom tabs: Dashboard · Tickets · Alerts · Knowledge · Requests | ✅ | ✅ | ✅ | ✅ | `:261-267` (the role filter at `:267` removes nothing) |
| Sign out | ✅ | ✅ | ✅ | ✅ | `:197-205` |
| Country selector mounted | ✅ (read-only) | ✅ | ❌ | ✅ | `:243` `role !== 'L2_MANAGER'` |

### 1.2 Country selector (`FE:components/CountrySelector.tsx`)
| Role | Behaviour | Source |
|---|---|---|
| ADMIN | Switch any country or "All Countries". Source: `GET /countries` | `:28, :36, :39-42` |
| Triage AGENT (no countryId) | Switch any country or "All Countries". Source: `GET /countries/my-countries` | `:30, :36` |
| Country AGENT | Locked to own country, lock icon, tooltip `Locked to X` | `:32, :55-58, :91, :99-101` |
| END_USER | Shown with label `—`, not clickable | `:74-78, :85` |
| L2_MANAGER | Not mounted | `AppLayout.tsx:243` |

### 1.3 Dashboard (`FE:pages/dashboard/DashboardPage.tsx`)
| KPI / widget | END_USER | AGENT | L2 | ADMIN | Source | Server scoping (05 §B.20, §C.19) |
|---|---|---|---|---|---|---|
| Total, Open, In Progress, Resolved, SLA Breached | ✅ ("My …" labels) | ✅ | ✅ | ✅ | `:342-375` | Correct. **L2: the cache is shared across all L2 managers** (`BE:modules/dashboard/dashboard.controller.ts:246-248`) |
| Closed, **Unassigned**, pending sub-status cards | ❌ | ✅ | ✅ | ✅ | `:379-405` | Unassigned drops the scope for a non-triage AGENT |
| Status / priority charts, technician breakdowns, workload, SLA trend | ❌ | ✅ | ✅ | ✅ | `:421-545` | Mixed |
| Technician matrix, team matrix, Ticket Mode, **Country × Group** | ❌ | ✅ | ✅ | ✅ | `:550-660` | `countryGroupRows` is **unscoped** (`BE:dashboard.controller.ts:381-393`) |
| Monthly trends, technician performance | ❌ | ✅ | ✅ | ✅ | `:668, :724` | Global for AGENT/L2 when no country is sent |
| Recent list | ✅ | ✅ | ✅ | ✅ | `:773-796` | Correct |

### 1.4 Ticket list (`FE:pages/tickets/TicketsListPage.tsx`)
- The page has one role check, the triage country parameter at `:86`.
- It has **no bulk actions, no inline status change and no quick filters** for any role. Status is a read-only badge (`:635, :693`).
- New Ticket, CSV export, saved views, search, status, priority and sort: all roles, ungated (`:410-512`).
- "More Filters" (date range, technician, group, category): shown to every role (`:514-588`). Date and category work for every role.
- Technician and Group filters are shown to every role, but END_USER and L2 get a 403 and an empty list (`:549-570`).
- Every filter is a TKT-1 parameter; nothing is filtered on the device. Full behaviour, with sources: `docs/G2-WEB-FILTERS.md`.

### 1.5 Ticket detail (`FE:pages/tickets/TicketDetailPage.tsx`)
`locked` = `role === 'AGENT' && status ∈ {CLOSED, CANCELED}` (`:619-622`). The lock exists only in the UI; the server enforces none (05 B.2).

| Capability | END_USER | AGENT | L2 | ADMIN | Lock | Source |
|---|---|---|---|---|---|---|
| Status bar + transitions (map `:45-106`) | ❌ hidden | ✅ | ✅ | ✅ | AGENT: no transitions | `:612, :623, :741-747` |
| Properties status `<select>`, **all 11 statuses, bypasses the map** | read-only | ✅ | ✅ | ✅ | AGENT | `:1685, :1703` |
| Closure modal (Resolve / Close / Cancel) | ❌ | ✅ | ✅ | ✅ | AGENT | `:759-765, :1690-1696` |
| Pick up, Assign (toolbar) | ❌ | ✅ | ✅ **403** | ✅ | AGENT | `:669-673` |
| Reassign, Remove assignment, Unassign | ❌ | ✅ | ✅ **403** | ✅ | AGENT | `:1778, :1832-1837, :2401-2410` |
| Group & Site | read-only | ✅ | ✅ **403** | ✅ | AGENT | `:1890-1895` |
| Category / Sub / Item | read-only | ✅ | read-only | ✅ | AGENT | `:1951-1953` |
| Impact / Urgency | hidden in Properties; read-only in the Details tab `:1212-1222` | ✅ | ✅ | ✅ | AGENT | `:1737-1760` |
| Priority | read-only for all; "Auto" pill for staff | | | | – | `:1725-1734` |
| Country (requester details) | read-only | ✅ | ✅ **silent no-op** | ✅ | none | `:2199-2204`; `BE:tickets.controller.ts:554-556` |
| Resolution edit (when RESOLVED/CLOSED) | ✅ | ✅ | ✅ | ✅ | none | `:1440-1476` |
| Reply | ✅ | ✅ | ✅ | ✅ | none | `:841-855` |
| Reply All | ✅ | ✅ | ✅ | ✅ | none | `:856-873` |
| Add Note button / Public-vs-Private select | ❌ | ✅ | ✅ **sent as PUBLIC email** | ✅ | none | `:874-883, :896-905`; `BE:modules/comments/comments.controller.ts:56` |
| Actions › Add Note | ✅ **sent as PUBLIC email** | ✅ | ✅ **sent as PUBLIC email** | ✅ | none | `:684` |
| To / CC chips (PUBLIC only) | ✅ | ✅ | ✅ | ✅ | none | `:914-1015` |
| Canned responses, AI Draft Reply | ✅ | ✅ | ✅ | ✅ | none | `:1046-1052` |
| Attach files to a reply or note | ✅ | ✅ | ✅ | ✅ | none | `:1075-1088` |
| PRIVATE notes rendered | ❌ (server) | ✅ | ✅ **(see §4)** | ✅ | – | `:624, :1113-1119`, no client filter |
| "X added a comment" history row for a note | ✅ | ✅ | ✅ | ✅ | – | `:1504-1505, :2912`, no filter |
| Comment counts | none shown | | | | – | `:802` (Tasks badge only) |
| Attachments: add | ✅ | ✅ | ✅ | ✅ | AGENT | `:1268` |
| Attachments: delete | ❌ | ✅ | ✅ | ✅ | none | `:1345` |
| Attachments: view, download, download all | ✅ | ✅ | ✅ | ✅ | none | `:1306, :1331, :1341` |
| Attachments list filtered by note type | **no** (client or server) | | | | – | `:1288-1355`; `BE:modules/attachments/attachments.controller.ts:32-35` |
| Tasks: add, toggle, delete | ✅ | ✅ | ✅ | ✅ | none | `:1376-1425` (the server checks nothing either) |
| Submit for approval: Actions menu | ✅ **403** | ✅ | ✅ **403** | ✅ | none | `:697`; `BE:modules/approvals/approvals.router.ts:8` |
| Submit for approval: Approvals tab | ❌ | ✅ | ✅ **403** | ✅ | none | `:1585` |
| Approve / Reject on the ticket | the approver only, any role | | | | – | `:1624` |
| AI Summary panel | ✅ | ✅ | ✅ | ✅ | none | `:838` (leaks notes, 05 C.24) |

### 1.6 Create ticket (`FE:pages/tickets/CreateTicketPage.tsx`, `isStaff = role !== 'END_USER'` at `:26`)
| Field | END_USER | AGENT | L2 | ADMIN | Source |
|---|---|---|---|---|---|
| Title, description, category cascade, attachments | ✅ | ✅ | ✅ | ✅ | `:201-343` |
| Impact, urgency, priority preview, mode | ❌ | ✅ | ✅ (preview never computes: LKP-6 is a **403**) | ✅ | `:346-400`; preview `:49-76, :368-387` |
| Team, Assign To | ❌ | ✅ | ✅ (**403, empty**) | ✅ | `:410-470` |
| Source, level | ❌ | ✅ | ✅ | ✅ | `:474-486` |
| Requester (raise on behalf) | **does not exist for any role** | | | | – |
| AI assistant panel (can set team and assignee) | ✅ | ✅ | ✅ | ✅ | `:217-247` |
| Routing note | ✅ | ❌ | ❌ | ❌ | `:403` |

### 1.7 Approvals, KB, announcements, notifications
| Element | END_USER | AGENT | L2 | ADMIN | Source |
|---|---|---|---|---|---|
| Approvals page: nav | ❌ | ✅ | ❌ | ✅ | `AppLayout.tsx:32` |
| Approvals page: approve / reject | whoever is the approver (the page has no role check) | | | | `FE:pages/approvals/ApprovalsPage.tsx:83-88`; `BE:approvals.controller.ts:118, :186` |
| Approvals page: "All" tab, unscoped `GET /approvals` | URL only | ✅ | URL only | ✅ | `ApprovalsPage.tsx:22-26`; 05 C.16 |
| KB: read, search, "Was this helpful?" | ✅ | ✅ | ✅ | ✅ | `FE:pages/kb/KBArticlePage.tsx:106-116` |
| KB: new, edit, delete, drafts | ❌ | ✅ | ❌ | ✅ | `FE:pages/kb/KBPage.tsx:17` |
| Announcements: read | no nav | ✅ | ✅ | ✅ | `AppLayout.tsx:31` |
| Announcements: create, delete | ❌ | ❌ | ❌ | ✅ | `FE:pages/announcements/AnnouncementsPage.tsx:23, :63-111` |
| Notifications: list, mark read | ✅ | ✅ | ✅ | ✅ | ungated |

### 1.8 Web defects found (report only, R3; recorded in `05` §C.26–C.27 where security-relevant)
- **W1.** L2 sees a "Private Note" option (`:874, :896`) and END_USER sees Actions › Add Note (`:684`). The server turns their "note" into a PUBLIC reply and emails it (`BE:comments.controller.ts:56`). Recorded as **05 C.27**.
- **W2.** L2 sees private notes on the web. The page reads `/activity`, which hides notes from END_USER only (`BE:tickets.controller.ts:1014`). `/comments` hides them from L2 too (`BE:comments.controller.ts:24`). This is already noted under 05 C.24.
- **W3.** "added a comment" rows for private notes are shown to END_USER, which reveals that internal notes exist (05 §A.7).
- **W4.** Private-note attachments are visible to the requester. See §5; recorded as **05 C.26**.
- **W5.** L2 is shown six assignment controls and a Group select, and all return 403 (`:672, :673, :1792, :1834, :1895, :2410`). The country select is a silent no-op that still shows a success toast.
- **W6.** The create-ticket AI panel lets END_USER set a team and an assignee (`CreateTicketPage.tsx:224-230`). The END_USER strip at `:163-167` does not remove them.
- **W7.** The Properties status `<select>` bypasses the transition map (`:1703`).
- **W8.** "Submit for Approval" in the Actions menu is ungated (`:697`), so END_USER and L2 get a 403.
- **W9.** A stale country selection survives logout (`FE:store/auth.store.ts:18` does not reset `sd-country`), and the next END_USER's list is narrowed by it.

### 1.9 Service catalogue (`FE:pages/service-catalog/ServiceCatalogPage.tsx` = SCP, `ServiceRequestFormPage.tsx` = SRF; Phase G4)
Full behaviour, with a source line for every statement: `docs/G4-WEB-CATALOGUE.md`.

| Element | END_USER | AGENT | L2 | ADMIN | Source |
|---|---|---|---|---|---|
| Sidebar "Service Request"; phone bottom tab "Requests" | ✅ | ✅ | ✅ | ✅ | `AppLayout.tsx:30, :266` |
| Catalogue: categories, items, search (client-side, name or description) | ✅ | ✅ | ✅ | ✅ | `SCP:36-66, :364-479` |
| Per-item or per-category visibility | none: every active item for every role | | | | `BE:modules/serviceCatalog/serviceCatalog.controller.ts:34-41, :61-71` |
| "+ New Template (admin)" | ❌ | ❌ | ❌ | ✅ | `SCP:398-405` |
| Request form: custom fields (7 types), required check, notes, "Add Request" (no confirmation) | ✅ | ✅ | ✅ | ✅ | `SRF:183-235, :467-491` |
| Request properties: Impact, Urgency, auto Priority (only `priority` is kept) | ❌ | ✅ | ✅ | ✅ | `SRF:41, :267-318` |
| Subject, description, category cascade, group, technician, assets, site, request type, status, mode, level, impact details, attachments | ✅ (staff extras for AGENT, L2, ADMIN; L2's group list is a **403**) | | | | `SRF:267-464`; the server keeps none (`serviceCatalog.controller.ts:26-31`, 05 B.24); files never uploaded (`SRF:158-165`) |
| My Requests rows | own | **everyone's** | **everyone's** | **everyone's** | `SCP:44-48`; `serviceCatalog.controller.ts:117` (deliberate: "End users see only their own requests", `:116`) |
| Request detail | none: rows are not links | | | | `SCP:344` |
| Cancel, edit, comment, assign, change status | none in the UI | | | | `serviceCatalog.router.ts:25-27` (staff-only routes, no web caller) |

---

## 2. Audit: the mobile app against §1

**Verdicts**
- **MATCH:** the same roles see the element.
- **WIDER:** mobile shows it to more roles than the web UI (the too-permissive direction).
- **NARROWER:** mobile shows it to fewer roles (the too-restrictive, usability direction).
- **N/A:** no web equivalent, or not built on either side.

**Reason tags**
- *defect avoided:* the web element 403s, leaks or is mis-scoped, so mobile is correct.
- *decision:* a documented product decision.
- *UNDOCUMENTED:* no recorded reason.

**Role gating source.** All gating now comes from `src/utils/permissions.ts`, abbreviated **perm**. Its functions:
- `drawerItems`, `mainTabs`
- `homeVariant`, `homeTiles`
- `ticketDetailPermissions`, `composerPermissions`
- `ticketFieldPermissions`, `fieldEditProblem` (G1: the M4 property editors and their write guard)
- `bulkActions`, `inlineStatusTransitions`
- `ticketListFilters` (G2: which of the five filters the M3 Filters sheet offers)
- `canUseReplyTemplates`, `canDeleteAttachments`, `canSubmitForApproval` (G3; read by `composerPermissions().templates`, `ticketDetailPermissions().deleteAttachments` and `moreActions` 'approval', the write guards and the API functions)
- `canUseServiceCatalog`, `serviceCatalogPermissions`, `isOwnServiceRequest`, `myServiceRequestRows`, `serviceRequestProblem` (G4: the drawer row, the catalogue screens, My Requests' rows, the request detail, and the SCR-5 write guard and API function; G5: `everyonesRequests`)
- `createTicketPermissions` (G5: every role-dependent part of the create form, the priority preview included)

It builds on `src/utils/ticket-rules.ts`, `activity.ts` and `ticket-filters.ts`. The G4 form rules (field types, validation, the request body) are in `src/utils/service-catalog.ts`.

### 2.1 Drawer and tab bar
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| N1 | Drawer · Approvals (badge) | ADMIN, AGENT always; END_USER and L2 while APR-1 ≥ 1 | ADMIN, AGENT; anyone by URL | **WIDER**, *decision* 08 S1. Not a security problem: APR-1 returns only approvals assigned to the caller, and the server lets any approver act | `src/navigation/DrawerContent.tsx:83` → perm `drawerItems` |
| N2 | Drawer · Tasks | all (END_USER read-only) | – (no standalone page) | N/A (mobile module, D4) | same |
| N3 | Drawer · Knowledge base | all | all | MATCH | same |
| N4 | Drawer · Announcements | all | ADMIN, AGENT, L2 | **WIDER**, *decision* 08 S1. Not a security problem: the server filters by `targetRoles`, and END_USER is a target option on the web (`AnnouncementsPage.tsx:146-150`) | same |
| N5 | Drawer · Settings | all | – (no web page) | N/A | same |
| N6 | Sign out | all | all | MATCH | `DrawerContent.tsx` account card |
| N7 | Locked-country chip | country AGENT | country AGENT (lock icon) | MATCH | `DrawerContent.tsx:59` |
| N8 | Tabs Home · Tickets · Alerts | all, same three | all, five tabs | MATCH. KB and the catalogue (the web's "Requests" tab, SC1) are in the drawer | `src/navigation/MainTabs.tsx:46` → perm `mainTabs` |

### 2.2 Home (M2) vs Dashboard
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| H1 | Raise a ticket (END_USER) / "+" FAB (staff) | all | all (New Ticket) | MATCH | `src/screens/dashboard/HomeScreen.tsx:133, :192-200` |
| H2 | END_USER KPIs | Open, Resolved | Total, Open, In Progress, Resolved, SLA Breached | **NARROWER**, *decision* 04 M2 | perm `homeTiles` |
| H3 | Staff KPIs open, inProgress, onHold, slaBreached, totalOpen | AGENT, L2 (no counts), ADMIN | AGENT, L2, ADMIN | MATCH | perm `homeTiles` |
| H4 | Unassigned KPI | ADMIN, triage AGENT | AGENT, L2, ADMIN | **NARROWER**, *decision* 04 M2: the count drops the scope for anyone else (05 B.20) | perm `homeTiles` |
| H5 | KPI numbers for L2 | none: tiles without counts, plus a notice | all | **NARROWER**, *defect avoided*: DSH-1 is cached per role for L2, so the numbers can be another manager's (05 C.19) | `HomeScreen.tsx:102, :147` |
| H6 | Matrices, Country × Group, trends, workload | none | AGENT, L2, ADMIN | **NARROWER**, *defect avoided* (unscoped or mis-scoped, 05 B.20) | `src/hooks/useHome.ts` `pickSafe` |
| H7 | Pending approvals shortcut | as N1 | – | as N1 | perm `showApprovalsShortcut` |
| H8 | Recent tickets | all, own scope | all | MATCH | `HomeScreen.tsx:180-188` |
| H9 | My open / Due soon shortcuts | staff | – | N/A | `HomeScreen.tsx:167-168` |

### 2.3 Ticket list (M3)
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| L1 | Named filters; Unassigned for ADMIN and AGENT | all | no quick filters | N/A: mobile addition (08 §4.5), scoped by the server | `src/utils/ticket-filters.ts` `availableTicketFilters`, `isTicketFilterAllowed` |
| L2 | Inline status chip | AGENT, L2, ADMIN; map only; none for a locked AGENT | none (read-only badge) | N/A: mobile addition (08 §4.1). Same rule as the detail status bar (T1, T2) | `src/screens/tickets/TicketListScreen.tsx:273, :468` → perm `inlineStatusTransitions` |
| L3 | Multi-select + bulk Pick up / Assign | ADMIN, AGENT | none | N/A: mobile addition (08 §4.2, S4). Same rule as T5, T6 | `TicketListScreen.tsx:158, :279, :446-450` → perm `bulkActions` |
| L4 | Bulk Close | AGENT, L2, ADMIN; skips rows the role can't close | none | N/A: mobile addition (08 S4). Same rule as T4 | same |
| L5 | Country selector · ADMIN | switch | switch | MATCH | `TicketListScreen.tsx:406` → `countrySelectorMode` |
| L6 | Country selector · triage AGENT | switch | switch | MATCH | same |
| L7 | Country selector · country AGENT | locked chip | locked | MATCH | `TicketListScreen.tsx:419` |
| L8 | Country selector · L2 | hidden | hidden | MATCH | same |
| L9 | Country selector · END_USER | hidden | read-only `—` | **NARROWER**, *decision* D8 (END_USER always sends `countryId=`). This conflicts with the text of 05 §A.12 → §8 item 3 | same; `src/screens/profile/ProfileScreen.tsx:216` |
| L10 | Technician / Group filters (Filters sheet) | ADMIN, AGENT (triage and country-locked alike); same option lists for all of them, as on the web | all; END_USER and L2 get 403 and an always-empty list | MATCH for ADMIN, AGENT. **NARROWER** for END_USER and L2, *defect avoided* (403, G2) | `src/screens/tickets/TicketFiltersScreen.tsx` → perm `ticketListFilters`; query `ticket-filters.ts` `ticketListQuery` |
| L11 | CSV export, saved views | – | all | N/A (04 §2.3) | – |
| L12 | Priority, category and created-date filters (Filters sheet) | all | all | MATCH (G2) | same |

### 2.4 Ticket detail (M4)
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| T1 | "Change status" card | AGENT, L2, ADMIN; a locked AGENT sees why there are no buttons | same | MATCH | `src/screens/tickets/TicketDetailScreen.tsx:497-525` → perm `ticketDetailPermissions` |
| T2 | Transitions offered | map; END_USER none; AGENT none on CLOSED/CANCELED | same | MATCH (test pins every role × status) | `ticket-rules.ts` `getAvailableTransitions` |
| T3 | Status `<select>` with all statuses | none | AGENT, L2, ADMIN | **NARROWER**, *decision* D1 (W7) | – |
| T4 | Close… (closure form) | roles whose map has CLOSED | same | MATCH | perm `moreActions` |
| T5 | Pick up | ADMIN, AGENT; not locked; not when already yours | AGENT, L2 (403), ADMIN | **NARROWER** for L2, *defect avoided* (D2, §6) | perm `moreActions` |
| T6 | Assign / Reassign / Remove | ADMIN, AGENT; not locked. Two places, one path: More options › Assign… (M7), and **since 2026-10-27 also inline**: "Change technician" on the Technician row (a locked AGENT sees the reason; L2 and END_USER see the value only) | AGENT, L2 (403), ADMIN; the web's own Technician panel in Properties (`:1776-1888`) and the toolbar's Assign modal (`:2363-2419`) | **NARROWER** for L2, *defect avoided*. Unchanged by the inline editor: same roles, same lock, same hook, guard and call (§15) | perm `canAssignTickets` → `moreActions`, `ticketFieldPermissions().technician`; `AssignPickerScreen.tsx`; `TicketPropertyEditors.tsx` `TechnicianSection` |
| T7 | Group & Site | ADMIN, AGENT (M7 "Move to group") | AGENT, L2 (403), ADMIN | **NARROWER** for L2, *defect avoided* | M7 |
| T8 | Category edit (3-level cascade) | ADMIN, AGENT (not locked); a locked AGENT sees the reason; L2 and END_USER read-only | ADMIN, AGENT (not locked) | MATCH (G1) | `src/screens/tickets/TicketPropertyEditors.tsx` `CategorySection` → perm `ticketFieldPermissions` |
| T9 | Impact / urgency edit | AGENT (not locked), L2, ADMIN; a locked AGENT sees the reason | AGENT (not locked), L2, ADMIN | MATCH (G1) | `TicketPropertyEditors.tsx` `ClassificationSection` → perm `ticketFieldPermissions` |
| T10 | Impact / urgency display for END_USER | hidden | read-only in the Details tab | **NARROWER**, *decision* 05 §A.3 | perm `ticketFieldPermissions` (`hidden`); `TicketPropertyEditors.tsx` |
| T11 | Country edit | ADMIN, triage AGENT, in every status; a country AGENT sees the value with a lock reason; L2 and END_USER see the value only | ADMIN, every AGENT, not lock-gated; L2 sees a select that saves nothing | **NARROWER** for the country AGENT, *decision* (05 §A.12; G1 D2; §8 item 12 RESOLVED in G2: stays locked). For L2 *defect avoided* (silent no-op) | `TicketPropertyEditors.tsx` `CountrySection` → perm `ticketFieldPermissions` |
| T12 | Resolution edit | AGENT (even locked), L2, ADMIN, while RESOLVED or CLOSED; otherwise the reason | all roles, while RESOLVED or CLOSED | **NARROWER** for END_USER, *decision* D3. Staff MATCH (G1) | `TicketPropertyEditors.tsx` `ResolutionSection` → perm `ticketFieldPermissions` |
| T13 | Priority read-only; "Auto" pill; priority shown before saving an impact/urgency change | pill for staff; preview for ADMIN, AGENT (LKP-6); L2 told the server recalculates (LKP-6 is 403) | pill for staff; no preview, the priority is computed at save time and shown after | MATCH. Since G2, ADMIN and AGENT send the matrix `priority` with the change, as the web does (§8 item 11 RESOLVED); L2 sends none, as on the web | `TicketDetailScreen.tsx` `HeaderCard`; `TicketPropertyEditors.tsx` `PriorityPreviewBox`; `ticket-properties.ts` `classificationChanges` |
| T14 | Reply | all | all | MATCH | perm `conversationActions`, `:278` |
| T15 | Reply all | AGENT, L2, ADMIN | all | **NARROWER** for END_USER, *decision* 04 M5 / 01 TKT-9 (TKT-9 has no access check, C.1) | same |
| T16 | Note (private) | ADMIN, AGENT | AGENT, L2, ADMIN (+ END_USER via the Actions menu) | **NARROWER**, *defect avoided*: their "note" is emailed publicly (W1) | same |
| T17 | PRIVATE notes rendered | ADMIN, AGENT | AGENT, **L2**, ADMIN | **NARROWER** for L2, *defect avoided* (W2, §4) | `src/hooks/useTicketComments.ts:18`; `TicketDetailScreen.tsx:711` |
| T18 | History "added a comment" row for a note | ADMIN, AGENT | all | **NARROWER**, *defect avoided* (05 §A.7, W3) | `src/hooks/useTicketHistory.ts:47` |
| T19 | Conversation count | the visible comments only | none | MATCH (no leak; `_count.comments` is never shown) | `TicketDetailScreen.tsx:267-271` |
| T20 | Attachment count | all | all (Properties row) | MATCH, but the server's number includes note files (§5) | `TicketDetailScreen.tsx:270, :455` |
| T21 | Add files | all except a locked AGENT, who **now sees why** | all except a locked AGENT | MATCH (**fixed** per §3) | `TicketDetailScreen.tsx:345, :359-364` |
| T22 | Delete attachment | AGENT, L2, ADMIN; any file, every status (no AGENT lock); "Delete <fileName>?" first | AGENT, L2, ADMIN; any file; no lock (`:1345-1346`) | MATCH (G3). END_USER: no button, refused on the device | `TicketDetailScreen.tsx` `AttachmentRow` `onDelete` → perm `deleteAttachments`; `src/hooks/useDeleteAttachment.ts` |
| T23 | View / download | all | all | MATCH | `TicketDetailScreen.tsx` AttachmentRow |
| T24 | Tasks: tick, add, remove | AGENT, L2, ADMIN; no lock | all; no lock | **NARROWER** for END_USER, *decision* D4 | perm `editTasks`; `src/screens/tasks/TaskDetailScreen.tsx:163` |
| T25 | Task edit (title, due date, technician) | AGENT, L2, ADMIN; technician picker ADMIN, AGENT | no UI | N/A (M11 addition) | `src/screens/tasks/TaskEditorScreen.tsx:126, :197` |
| T26 | Submit for approval | ADMIN, AGENT; every status (no AGENT lock); More options → `SubmitApprovalScreen` | all via the Actions menu (END_USER, L2 get 403); staff via the tab (L2 403); no lock | MATCH for ADMIN, AGENT (G3). **NARROWER** for END_USER and L2, *defect avoided* (403, W8) | perm `moreActions` ('approval'), `canSubmitForApproval`; `src/screens/tickets/SubmitApprovalScreen.tsx`; `useSubmitForApproval` |
| T27 | AI Summary / Draft reply | none | all | **NARROWER**, *defect avoided* (05 C.24: the summary leaks notes) | – |
| T28 | Print, Duplicate, Delete, Email technician, Problem/Change links, Tags | none | various | N/A (dead or out of scope, 05 B.33) | – |

### 2.5 Composer (M5), status sheet (M6), assign picker (M7)
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| C1 | Composer modes | END_USER: Reply. L2: Reply, Reply all. ADMIN, AGENT: + Private note | see T14–T16 | see T14–T16 | `src/screens/tickets/ReplyComposerScreen.tsx:39` → perm `composerPermissions` |
| C2 | To / CC chips | AGENT, L2, ADMIN (PUBLIC only) | all (PUBLIC only) | **NARROWER** for END_USER, *decision* 04 M5 | `ReplyComposerScreen.tsx:44` |
| C3 | Address suggestions (USR-3) | ADMIN, AGENT | – | MATCH 05 §A.5 (403 for others) | perm `suggestRecipients` |
| C4 | Canned responses ("Templates") | all, in every mode (Reply, Reply all, Note); LKP-7 loads when the sheet opens | all, in both comment types (`:1046-1051`) | MATCH (G3) | `ReplyComposerScreen.tsx` → perm `composerPermissions().templates`; `src/components/TemplatePickerSheet.tsx` |
| C5 | Attach files to a reply or note | all, no lock | all, no lock | MATCH. Note files leak (§5) → §8 item 1 | `ReplyComposerScreen.tsx:173` |
| C6 | A PRIVATE post from END_USER or L2 | refused on the device, nothing sent | sent; the server makes it a PUBLIC email | stricter, correct | `src/api/comments.api.ts:25`; `src/hooks/usePostComment.ts:36` |
| S1 | Status sheet | AGENT, L2, ADMIN; map; locked reason | = T1, T2 | MATCH | `src/screens/tickets/StatusClosureScreen.tsx:203, :231-233` |
| A1 | Assign picker | ADMIN, AGENT; others see "Not available"; locked reason. Its lists and group rule are shared with the inline Technician editor (`src/utils/assignment.ts`, 2026-10-27) | = T6 | MATCH (L2 per T6) | `src/screens/tickets/AssignPickerScreen.tsx` (`canAssignTickets`) |

### 2.6 Create ticket (M8)
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| CR1 | Title, description, category, files | all | all | MATCH | `src/screens/tickets/CreateTicketScreen.tsx` |
| CR2 | Impact, urgency | AGENT, L2, ADMIN | AGENT, L2, ADMIN | MATCH | perm `createTicketPermissions().classification` (G5; before, the screen called `isStaff` itself) |
| CR3 | Group, Assign to | ADMIN, AGENT | AGENT, L2 (403, empty), ADMIN | **NARROWER** for L2, *defect avoided*. G5: the API allow-list no longer lets L2 carry `teamId` or `assignedToId` (§14.3) | perm `createTicketPermissions().routing`; `src/api/tickets.api.ts` `CREATE_KEYS_BY_ROLE` |
| CR4 | Requester (raise on behalf) | ADMIN, AGENT | nobody | **WIDER**, *decision* 01 TKT-2 / 04 M8. The server accepts it from non-END_USER (`BE:tickets.controller.ts:190`). It conflicts with CLAUDE.md rule 6 → §8 item 4. G5: no longer carried for L2 by the API layer (§14.3) | perm `createTicketPermissions().raiseOnBehalf` |
| CR8 | Priority preview while choosing impact and urgency (G5) | ADMIN, AGENT; L2 told the Service Desk sets it | ADMIN, AGENT; L2 sees the box, but it never computes (LKP-6 403) | MATCH. The G1 `PriorityPreviewBox`, reused (`target: create`); display only, no `priority` sent (01 TKT-2) | perm `createTicketPermissions().priorityPreview`; `TicketPropertyEditors.tsx` `PriorityPreviewBox`; `ticket-properties.ts` `newTicketPriority` |
| CR5 | Mode, level, source | none | AGENT, L2, ADMIN | **NARROWER**, *decision* 05 B.13 (the server drops them) | – |
| CR6 | AI assistant | none | all | **NARROWER**, *defect avoided* (W6) | – |
| CR7 | END_USER routing banner | END_USER | END_USER | MATCH | `:208` |

### 2.7 Other screens
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| O1 | Notifications: list, mark read, open ticket (M9) | all | all | MATCH | `src/screens/notifications/NotificationsScreen.tsx` (no role gate) |
| O2 | Profile: editable name, phone, department, timezone (M10) | all | – | N/A | `src/screens/profile/ProfileScreen.tsx` |
| O3 | Profile: country card | as L5–L9 | – | as L5–L9 | `ProfileScreen.tsx:216` |
| O4 | Task list: "Assigned to me" chip | AGENT, L2, ADMIN | – | N/A | `src/screens/tasks/TaskListScreen.tsx:164` |
| AP1 | Approve / Reject (M13) | the approver, any role | the approver, any role | MATCH | `src/screens/approvals/ApprovalDetailScreen.tsx` |
| AP2 | Reject needs a comment | yes | yes | MATCH | `ApprovalDetailScreen.tsx:172` |
| AP3 | "All approvals" (unscoped `GET /approvals`) | never called | ADMIN, AGENT tab | **NARROWER**, *defect avoided* (05 C.16) | `src/api/approvals.api.ts:3` |
| AP4 | Ticket context on an approval | only on a 200 from TKT-3 | – | N/A (08 S8). See §8 item 8 | `ApprovalDetailScreen.tsx:190-250` |
| K1 | KB: read, search, "Was this helpful?" (M14, M15) | all | all | MATCH | – |
| K2 | KB: authoring and drafts | none | ADMIN, AGENT | N/A (skipped, 04 §2.3) | – |
| AN1 | Announcements: read (M16, Home banner) | all | ADMIN, AGENT, L2 | as N4 | `src/screens/dashboard/AnnouncementsScreen.tsx` |
| AN2 | Announcements: create, delete | none | ADMIN | N/A (skipped) | – |
| DL1 | Ticket link → ticket (deep link) | all, server scope | all | MATCH | `src/screens/tickets/TicketLinkScreen.tsx` |

### 2.8 Service catalogue (Phase G4)
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| SC1 | Drawer · Service Request | all | all (sidebar; phone bottom tab "Requests") | MATCH. A drawer row, as 04 P2; the bottom bar keeps its three tabs (08 §3.1) | `src/navigation/DrawerContent.tsx` → perm `drawerItems` ('catalog'), `canUseServiceCatalog` |
| SC2 | Catalogue: categories with item counts, a category's items, search; no per-item scoping | all | all | MATCH | `src/screens/catalog/ServiceCatalogScreen.tsx` → perm `serviceCatalogPermissions().browse`; `src/utils/service-catalog.ts` `filterCatalogItems` (no viewer argument) |
| SC3 | "+ New Template (admin)" | none | ADMIN | **NARROWER**, *decision* (admin stays on the web, 04 §2.3) | – |
| SC4 | Request form: custom fields of all seven types, the web's `required` and browser checks, notes, "Add Request" with no confirmation, back to the catalogue | all | all | MATCH | `src/screens/catalog/ServiceRequestFormScreen.tsx`, `ServiceFormFieldInput.tsx` → perm `serviceCatalogPermissions().submit`; `useSubmitServiceRequest` → `assertServiceRequest` |
| SC5 | Request properties: Impact, Urgency, the auto Priority | AGENT, L2, ADMIN | AGENT, L2, ADMIN | MATCH. Only `priority` is sent; END_USER's request is refused on the device if it ever carries one | perm `serviceCatalogPermissions().requestProperties`, `serviceRequestProblem` |
| SC6 | Form controls whose values the server never keeps (subject, description, category cascade, group, technician, assets, site; for staff request type, status, mode, level, impact details) and the attachment box | none | all (staff extras: AGENT, L2, ADMIN; L2's group list is a 403) | **NARROWER**, *defect avoided*: the server keeps none of them (05 B.24), some are never sent, and the files are never uploaded (`docs/G4-WEB-CATALOGUE.md` §3, D2, D3) | – |
| SC7 | My Requests: whose rows | END_USER own; AGENT, L2, ADMIN everyone's (G5) | END_USER own; AGENT, L2, ADMIN everyone's | MATCH (G5; G4 had it NARROWER for staff). The server's scoping is deliberate and there is no narrower scope (§14.2). Same four columns, no requester column | perm `serviceCatalogPermissions().everyonesRequests`, `myServiceRequestRows`; `src/hooks/useServiceCatalog.ts` `useMyServiceRequests` |
| SC8 | A request's detail (SCR-6): answers, notes, approvals | own, every role; only one's own rows are links | none (rows are not links) | N/A (mobile addition, ➕). Never another person's answers, as on the web | `src/screens/catalog/ServiceRequestDetailScreen.tsx`, `ServiceCatalogScreen.tsx` `canOpen` → perm `isOwnServiceRequest` |
| SC9 | Cancel, edit, comment on, assign or change the status of a request | none | none | MATCH (the server's routes are staff-only and no web page calls them) | – |

**Totals** (after G5, 2026-10-22)
- 95 rows (94 after G4; G5 added CR8; 85 after G3; G4 added SC1–SC9; 84 after G1; G2 added L12).
- **30 mismatches** (31 after G4, 28 after G3, 29 after G2, 28 after G1, 30 before it):
  - 3 WIDER: N1, N4, CR4.
  - 27 NARROWER:
    - **15 defect avoided:** H5, H6, L10, T5, T6, T7, T16, T17, T18, T26, T27, CR3, CR6, AP3, SC6.
    - **12 decisions:** H2, H4, L9, T3, T10, T11, T12, T15, T24, C2, CR5, SC3.
    - **0 UNDOCUMENTED** (before G1: T8, T9, T11, T12).
- G5: CR8 is a new MATCH; SC7 moved from NARROWER (*defect avoided*) to MATCH.
- G2: L10 went from N/A (not built) to built, MATCH for ADMIN and AGENT and NARROWER for END_USER and L2 (the web shows them an empty list). L12 is a new MATCH row.
- G3: T22 (delete) from *decision* to MATCH; T26 (submit for approval) from *decision* to MATCH for ADMIN and AGENT and *defect avoided* for END_USER and L2; C4 (templates) from N/A to MATCH.
- G4: SC1–SC9 are new. SC1, SC2, SC4, SC5 and SC9 MATCH; SC7 matches for END_USER; SC3, SC6 and SC7 (staff) are the three new mismatches; SC8 is a mobile addition.
- **No mismatch is a security problem.**

---

## 3. Hide vs disable: the rule

1. **A capability the role will never have is HIDDEN.**
   - It is not rendered, and it is not a disabled stub.
   - perm leaves it out of the list it returns, so the screen cannot render it.
   - Screens reached only by a deliberate route (M6, M7, M11 for a role without access) show a "Not available for your role" screen as a last guard.
2. **A capability the role has, but the ticket's current state blocks, keeps its place and is DISABLED with a reason, or the reason is shown where the control would be.**
   - Example: the AGENT lock on CLOSED and CANCELED tickets.
3. **Transition targets are not capabilities.**
   - The map lists what is possible from this status. Targets that are not in it are not offered, as on the web.
4. **In-flight requests disable controls; they never hide them.**

**State-gated elements, checked against rule 2**
| Element | Before | Now |
|---|---|---|
| Status card for a locked AGENT | card + "Closed and canceled tickets are locked for technicians." ✅ | unchanged |
| M6 status sheet, locked | reason text ✅ (`StatusClosureScreen.tsx:231-233`) | unchanged |
| M7 assign picker, locked | "Locked" screen with the reason ✅ | unchanged |
| Bulk rows a role can't act on | listed under "Skipped" with the reason ✅ | unchanged |
| **"Add files" for a locked AGENT** | **hidden with no reason ✗** | **fixed:** a notice says files can't be added because the ticket is locked (`TicketDetailScreen.tsx:359-364`) |
| Pick up / Assign in "More options" for a locked AGENT | hidden. The reason is on the same screen (status card). `OptionSheet` has no disabled state | left as is → §8 item 7 |
| Pick up on a ticket already assigned to you | hidden (the web still shows it; re-assigning to yourself is harmless) | left as is → §8 item 7 |
| Approvals row for END_USER / L2 with 0 pending | hidden: treated as a role rule (those roles have an inbox only while something is waiting, 08 S1) | unchanged |
| Send, Save note, closure Save, Reject | disabled until valid, and while sending ✅ | unchanged |
| G1: impact/urgency and category for a locked AGENT | – (not built) | the saved values, with "Closed and canceled tickets are locked for technicians." ✅ |
| G1: country for a country-locked AGENT | – (not built) | the saved value, with the lock reason ✅ |
| G1: resolution for staff outside RESOLVED / CLOSED (e.g. CANCELED) | – (not built) | the saved text, with "The resolution can be edited only while the ticket is Resolved or Closed." ✅ |
| G1: Save on every property editor | – | disabled until something changed, and while saving; Cancel and the pickers disabled while saving ✅ |
| G3: delete a file, submit for approval | – (not built) | **no state rule on the web, so none here:** both are offered in every status, CLOSED and CANCELED included, for a locked AGENT too ✅ |
| G3: the delete button | – | a spinner on the file being deleted; every delete button disabled while a delete or an upload is in flight ✅ |
| G3: "Submit (n)" | – | disabled until one approver is chosen, and while sending; the chips and "Add an approver" disabled while sending ✅ |
| G4: a retired service (SCR-3 still returns it) | – (not built) | the form says the service is no longer offered and has no "Add Request" ✅ |
| G4: "Add Request", "Reset" | – | disabled while sending; the field messages appear after the first try and follow each change, as on the web ✅ |
| 2026-10-27: the Technician row for a locked AGENT | – (not built) | the saved technician, with "Closed and canceled tickets are locked for technicians." ✅ (as impact/urgency and category) |
| 2026-10-27: the Technician editor's Save | – | disabled until another technician (or Unassigned) is chosen, and while saving; the picker and Cancel disabled while saving ✅ |

**Role-never elements, checked against rule 1:** all hidden ✅.
- Note (END_USER, L2)
- Reply all and To/CC (END_USER)
- status card (END_USER)
- Pick up / Assign (END_USER, L2)
- task edits (END_USER)
- bulk selection (END_USER)
- impact/urgency (END_USER)
- country selector (L2, END_USER)
- Unassigned tile and filter (non-ADMIN/AGENT)
- G1 editors: category edit (L2, END_USER), country edit (L2, END_USER), resolution edit (END_USER). Each shows the value with no editor and no reason
- G2: the Technician and Group filters (END_USER, L2): not in the Filters sheet, and never sent from a stale state
- G3: the delete button (END_USER): not on any file row. "Submit for approval…" (END_USER, L2): not in More options; the screen itself shows "Not available for your role"; the guard and the API function refuse it before sending
- G4: the request properties (END_USER): not on the form, and a `priority` from END_USER is refused before sending. Another person's request (any role): its detail shows "Not one of your requests". G5: staff see it listed in My Requests, as on the web, but the row is not a link
- G5: on the create form, the priority preview (L2, END_USER), group and technician (L2, END_USER), requester (L2, END_USER) and impact/urgency (END_USER): not rendered, from `createTicketPermissions()`; the API allow-list drops `teamId`, `assignedToId` and `requesterId` for L2 as well
- 2026-10-27: "Change technician" (L2, END_USER): the Technician row shows the value, with no link and no reason (`ticketFieldPermissions().technician` is `view`); the row itself is never hidden

**G2, state rather than role:** while "My open" or "Unassigned" is the quick filter, the Technician filter stays offered, and its hint says that picking a technician replaces that quick filter (one `assignedToId` on TKT-1, as on the web).

---

## 4. Check A: private notes, definitive

**What the server sends**
| Endpoint | END_USER | L2_MANAGER | Source |
|---|---|---|---|
| CMT-1 `GET /tickets/:id/comments` | PUBLIC only | PUBLIC only | `BE:comments.controller.ts:24` |
| TKT-7 `GET /tickets/:id/activity`: comments | PUBLIC only | **PRIVATE included** | `BE:tickets.controller.ts:1014` |
| TKT-7: audit rows, including `COMMENTED {type:'PRIVATE'}` | **included** | **included** | `BE:tickets.controller.ts:1022-1030`; `BE:comments.controller.ts:103-111` |
| TKT-3 `_count.comments` | **counts notes** | **counts notes** | `BE:tickets.controller.ts:48` |

So the premise "the API hides private notes from END_USER and L2" holds only for CMT-1.

**What the app does: it never relies on the server**
1. The Conversation tab reads CMT-1. The query's `select` filters again with `visibleComments(role)` (`src/hooks/useTicketComments.ts:18`).
2. Each comment passes `isCommentVisible` before it renders, so a PRIVATE comment that arrives anyway is dropped for END_USER and L2 (`TicketDetailScreen.tsx:711`).
3. History uses only TKT-7's audit rows: its comments, which include notes for L2, are discarded. `COMMENTED` rows for notes are removed for END_USER and L2 (`src/hooks/useTicketHistory.ts:47`, `src/utils/activity.ts:22-25`).
4. **Counts:**
   - Conversation (n) is the filtered list (`TicketDetailScreen.tsx:269`).
   - `_count.comments` is never displayed.
   - No other screen shows a comment count.
5. **Composer:**
   - END_USER and L2 have no Note button and no "Private note" tab (perm `composerModes`).
   - A PRIVATE post from either role is refused on the device twice, in `usePostComment.ts:36` and `comments.api.ts:25`. A test proves nothing is sent.
6. Notifications: the server creates them only for PUBLIC comments (`BE:comments.controller.ts:113-114`), so the app does not need to filter them.

**Verdict:** ✅ Notes are hidden client-side by role, independently of the server. What remains is outside the app's control: §5, and the bare "added an attachment" history row. That row shows no file names on mobile.

---

## 5. Check B: attachments on private notes, definitive

**Verdict: REAL. Severity Critical (privacy). Only the backend can fix it.** Recorded as `05` §C.26.

**Why it happens (all `BE:` paths, read-only)**
1. **A note's files are never linked to the note.**
   - The only code that sets `attachment.commentId` sits inside the PUBLIC branch: `if (data.type === 'PUBLIC')` at `modules/comments/comments.controller.ts:114` → `if (filteredRecipients.length > 0)` at `:158` → `updateMany … { commentId }` at `:169-175`.
   - A PRIVATE note's files keep `commentId = null` (`prisma/schema.prisma:439-454`, `commentId String?`).
   - They then look exactly like any other ticket-level file: the requester's own uploads, closure-form files, email attachments.
2. **ATT-1 lists every file on the ticket.**
   - `prisma.attachment.findMany({ where: { ticketId } })` at `modules/attachments/attachments.controller.ts:32-35`.
   - There is no filter on the comment or its type.
   - The only role check is END_USER ownership of the ticket (`:29-31`).
3. **The requester can open them.**
   - Download `:110-124` and view `:127-144` check only that an END_USER owns the ticket.
   - "Download all" zips every file (`:40-68`, filter at `:51`).
4. **Even a linked file would leak.**
   - Uploading with `?commentId=<note>` (`:76, :86`) links the file, but ATT-1, view, download and zip still do not look at the comment's type.
5. **The header count includes them.**
   - `_count: { comments: true, attachments: true }` (`modules/tickets/tickets.controller.ts:48`).
   - The web shows the count, and so does the mobile header and Attachments tab.
6. **History reveals the file names.**
   - The `ATTACHMENT_ADDED` audit row stores the names (`newValues.files`, `attachments.controller.ts:97-105`).
   - TKT-7 returns it to every role (`tickets.controller.ts:1022-1030`).
   - Mobile shows "added an attachment" without names. The web shows the same sentence.
7. **The web shows the files to the requester too** (`FE:TicketDetailPage.tsx:1288-1355`). This is not a mobile-only problem.
8. **L2_MANAGER is affected too.** L2 must not see notes (`comments.controller.ts:24`), but it receives the files the same way.

**Can the app mitigate it?**

**On the requester's side: no.**
- Nothing in an ATT-1 row identifies a note's file.
- Matching upload times against `COMMENTED/PRIVATE` audit rows would be guesswork, and would be "client-side security filtering presented as a fix" (05 §C rule 3).
- The file would still be reachable through ATT-3, ATT-4, the zip and the web.

**On the author's side: partly.**
- The app can stop *creating* new leaks: do not offer attachments in Note mode, or at least warn accurately.
- The composer's note text today says "Files are added to the ticket, not to this note." It does not say the requester can see them, so staff can easily read it as "internal" → §8 item 1.
- Files attached to notes on the web are unaffected.

**Backend fix (ask A7)**
- Link note files to their note in both branches.
- For END_USER and L2, exclude files whose comment is PRIVATE from ATT-1, view, download, download-all and `_count.attachments`.
- Strip file names from `ATTACHMENT_ADDED` rows those roles receive.

---

## 6. Check C: actions the backend rejects, all hidden

| Server rejection | Who | Mobile | Source (server → app) |
|---|---|---|---|
| `POST /tickets/:id/assign` is `agentOrAdmin` → 403 | L2, END_USER | Pick up, Assign, Reassign, Remove and Move to group are hidden. Bulk Pick up / Assign are hidden. The M7 screen refuses. "Change technician" (2026-10-27) is not offered. `assertAssignment` refuses before sending (tested through `sendAssignment` in every status: nothing sent, not even the status read) | `BE:tickets.router.ts:20` → perm `canAssignTickets` (`moreActions`, `bulkActions`, `ticketFieldPermissions().technician`); `src/hooks/writeGuards.ts` `assertAssignment` |
| `GET /teams`, `GET /users/search` are `agentOrAdmin` → 403 | L2, END_USER | Create's Group and Assign to, M7, the task technician picker, recipient suggestions and (G2) the M3 Technician and Group filters are all hidden. The queries are disabled for those roles | `BE:teams.router.ts:8`, `BE:users.router.ts:15` → `src/hooks/useLookups.ts` `useTeams`, `useUserSearch`; perm `ticketListFilters` |
| `POST /approvals` is `agentOrAdmin` → 403 | L2, END_USER | G3: Submit for approval is offered to ADMIN and AGENT only. For L2 and END_USER it is not in More options, `SubmitApprovalScreen` refuses, and `assertCanSubmitForApproval` and `submitTicketForApproval` refuse before sending (tested: nothing sent) | `BE:approvals.router.ts:8` → perm `canSubmitForApproval`; `src/hooks/writeGuards.ts`; `src/api/approvals.api.ts` |
| `DELETE /attachments/:id` → 403 | END_USER | G3: Delete is offered to ADMIN, AGENT and L2 only. For END_USER there is no button, and `assertCanDeleteAttachment` and `deleteAttachment` refuse before sending (tested: nothing sent) | `BE:attachments.controller.ts:149` → perm `canDeleteAttachments`; `src/hooks/writeGuards.ts`; `src/api/attachments.api.ts` |
| `GET /priority-matrix` is `agentOrAdmin` | L2, END_USER | Called only for ADMIN and AGENT, when the impact/urgency editor opens (G1). L2 gets no preview; the query is disabled for L2 and END_USER | `BE:priorityMatrix.router.ts:8` → perm `priorityPreview`; `src/hooks/useLookups.ts` `usePriorityMatrix` |
| **Silent** rewrite: note → PUBLIC email | L2, END_USER | Note hidden and refused on the device | `BE:comments.controller.ts:56` → perm `composerModes`; `comments.api.ts:25` |
| **Silent** no-op: `countryId` edit | L2 | Country edit is not offered to L2, and `fieldEditProblem` refuses `countryId` from L2 before sending (G1) | `BE:tickets.controller.ts:554-556` → perm `ticketFieldPermissions`; `src/hooks/useUpdateTicket.ts` |
| **Silent** no-op: `PUT /tickets/:id {status}` | all | Status only goes through TKT-6 POST | 05 B.1 |
| `PUT /service-catalog/requests/:id`, `POST …/status`, `POST …/assign` are `agentOrAdmin` | L2, END_USER | G4: never called by the app, for any role. The web has no page that calls them either | `BE:modules/serviceCatalog/serviceCatalog.router.ts:25-27`; 01 Appendix A |
| **Silent** discard: the request form's subject, description, category, group, technician; files never uploaded | all | G4: not shown; SCR-5 carries only the four kept keys, and `serviceRequestProblem` refuses any other key before sending (tested: nothing sent) | `BE:serviceCatalog.controller.ts:26-31`; 05 B.24 → `src/api/serviceCatalog.api.ts` `createServiceRequest` |
| ~~Unscoped list~~ Staff-wide list: `GET /service-catalog/requests` for AGENT, L2, ADMIN | AGENT, L2, ADMIN | G4 kept only the person's own rows. **G5: listed as on the web** (deliberate server scoping, not a rejection or a leak, §14.2). The detail still shows only one's own request | `BE:serviceCatalog.controller.ts:116-117` → perm `myServiceRequestRows`, `isOwnServiceRequest` |

---

## 7. Tests

**`tests/rbac/role-gating.test.mjs`**
- 122 tests, using the existing `node:test` harness. No new framework and no new library.
- They cover the five personas: END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN.

**What they assert**
- Drawer rows (0 and 2 pending approvals), bottom tabs and their titles, Home variant and KPI tiles.
- The ticket-detail action set:
  - for an OPEN and a CLOSED ticket, for every persona;
  - from every status, END_USER and L2 never get Pick up, Assign or Note.
- Composer modes per persona.
- A PRIVATE post from END_USER or L2 is refused with **no request sent**; ADMIN and AGENT send it as PRIVATE.
- Private notes and their history rows do not render for END_USER or L2, even when the server sends them.
- The transition map equals the web map label for label. Every persona × every status gets exactly the expected targets on the status bar, the list chip and the detail screen. The on-device guard refuses the rest.
- Bulk actions are staff-only (END_USER: none; L2: Close only). Bulk Close equals single Close. Assignment is refused for L2, END_USER and a locked AGENT.
- The country selector mode and the `countryId` sent, per persona (05 §A.12 and D8).
- **Wiring:**
  - No screen, navigator or component compares a role string.
  - The gated screens call `permissions.ts` and do not call low-level gates directly.
  - Hard-coded Note, Tab or bulk buttons are rejected.

**Proof the tests bite**
- Twelve "too permissive" mutations were each applied, tested and reverted. **Every one made the suite fail.** The files were verified unchanged afterwards by SHA-1.
- The mutations:
  - L2 gets Note
  - Approvals for everyone
  - L2 sees notes
  - L2 gets bulk Assign
  - AGENT lock removed
  - END_USER gets the status bar
  - an extra transition
  - END_USER can switch country
  - a hard-coded Note chip
  - a hard-coded bulk Assign button
  - the drawer deciding Approvals itself
  - the Unassigned tile for every AGENT

**G1 additions (2026-10-22)**
- The five personas moved to `tests/rbac/personas.mjs`, shared by both suites. `role-gating.test.mjs` now has 123 tests: one more wiring test, for `TicketPropertyEditors.tsx`.
- **`tests/rbac/property-editing.test.mjs`, 52 tests.** For each persona:
  - the full `ticketFieldPermissions()` answer for an OPEN, RESOLVED, CLOSED and CANCELED ticket: impact, urgency, category, country, resolution and the priority preview;
  - from every status: END_USER edits nothing; L2 never edits category or country and never loads LKP-6; only ADMIN and the triage AGENT edit the country; an AGENT never edits impact, urgency or category on CLOSED or CANCELED; the resolution only on RESOLVED or CLOSED, staff only;
  - the write guard agrees with those answers for every persona × status × field, and refuses status, priority, title, team, assignee and tags for everyone;
  - the request: `PUT /tickets/:id` never carries status or priority, for every role; a status change is a POST to `/status`;
  - the category cascade clears children, keeps the server's order, sends the deepest level, and keeps an inactive current category visible;
  - the priority preview follows the matrix rule; the 403 wording.
- **Proof the tests bite.** Eleven "too permissive" mutations were each applied, tested and reverted; every one made the suite fail (1–8 failures each), and each file was verified unchanged afterwards by SHA-1:
  - L2 edits the category
  - a country AGENT edits the country
  - the AGENT lock removed from impact/urgency
  - END_USER edits the resolution
  - the resolution editable on CANCELED
  - L2 gets the priority preview
  - the guard lets unknown keys through
  - the guard ignores locks
  - the cascade keeps children
  - an editor sends `priority`
  - the API allow-list sends `priority`

**G2 additions (2026-10-22): 282 tests in all (209 after G1).**
- **`tests/rbac/list-filters.test.mjs`, 65 tests (new).** For each persona (END_USER, AGENT, triage AGENT, L2_MANAGER, ADMIN):
  - exactly which of the five filters the Filters sheet shows, the active count, and that the summary line never names a filter the persona can't see;
  - the exact TKT-1 parameters with every filter set in the state, alone and combined with "Open", a search, sort by priority and a country: technician and group never reach the server for END_USER or L2, even from a stale state;
  - each filter alone sends only its own parameter; a malformed day is never sent; the date range counts once; From after To is sent as on the web;
  - the one technician slot: My open / Unassigned win over the Technician filter, and choosing one clears the other;
  - the option requests: technicians are USR-3 `role=AGENT`, the same for ADMIN, triage and country AGENT; groups are LKP-2 with no country (a country AGENT included); nothing for END_USER or L2; categories are top-level only, by name; inactive groups kept and marked;
  - the quick filters, search and sort give the same query as before G2, for every persona × quick filter × sort × search;
  - Clear all (the web's Clear), a Home tile (filter alone), sign-out (everything wiped);
  - wiring: `useTickets` sends only `ticketListFilters()`'s keys; the list counts only allowed filters; each field of the sheet sits directly behind its own check.
- **`property-editing.test.mjs`, 59 tests (52).** The G1 "never send `priority`" assertions are replaced by Ronit's G2 rule, as strictly: `priority` on its own is refused for everyone in every status; with an impact/urgency change it goes through exactly where the preview is offered (ADMIN, AGENT not locked); the API layer sends it for ADMIN and AGENT only; L2's API allow-list carries no category, group, assignee, country or priority; the exact allowed keys per role; `classificationChanges` adds the matrix row's priority for the effective pair, and none without a row, a value or a change.
- **`role-gating.test.mjs`, 124 tests (123):** the Filters sheet joins the wiring checks; the list must call `ticketListFilters()`.
- **Proof the tests bite.** Eighteen "too permissive" or "not as the web" mutations were each applied, tested and reverted by script; every one made the suite fail (1–17 failures each), and each file was verified byte-identical afterwards by SHA-1:
  - technician and group for every role; group for L2; the query ignores the allow-list; `useTickets` sends every filter;
  - the sheet shows Technician, Group or the technician picker to every role; groups loaded for every role;
  - the technician list includes ADMIN; sub-categories offered as categories;
  - the Technician filter beats My open; My open keeps the technician; Clear all keeps the sort;
  - L2's allow-list sends category and group, or priority; `priority` accepted on its own, or from L2; `priority` sent without a matrix row.
  - Two first-draft mutations survived and were fixed: a redundant `delete` in `ticketListQuery` (removed; the spread order already decides) and a wiring check too loose to catch an unguarded Technician field (tightened).

**G3 additions (2026-10-22): 366 tests in all (282 after G2: 83 new in `g3-features`, 1 new in `role-gating`).** Per file: `g3-features` 83, `role-gating` 125, `property-editing` 59, `list-filters` 65, `tests/auth/mobile-sso` 34.
- **`tests/rbac/g3-features.test.mjs`, 83 tests (new).** For each persona (END_USER, AGENT, triage AGENT, L2_MANAGER, ADMIN):
  - **Templates:** the composer's `templates` flag and the modes it is offered in; the LKP-7 query allowed; an unknown role gets none. The request is `GET /canned-responses` with no parameters. Search on title or category, never the body; groups by category with "General", sorted, with the server's order inside each group. Insertion: a blank body is replaced; otherwise the template is appended as a new paragraph; inserting twice appends twice; no placeholders; HTML becomes text; images are dropped and flagged.
  - **Delete a file:** the exact list of statuses (of all 11) in which the button is offered: none for END_USER, all 11 for every staff persona. A locked AGENT cannot add files but can delete them. The guard refuses END_USER; END_USER's request is refused with nothing sent; staff send exactly one `DELETE /tickets/:id/attachments/:attachmentId`. The server's message is shown; a 403 is worded plainly. The cache drops the row and `_count.attachments` once, not twice. The confirmation names the file.
  - **Submit for approval:** the exact list of statuses in which More options offers it: all 11 for ADMIN, AGENT and triage AGENT, none for END_USER and L2_MANAGER, always the last item. The guard refuses END_USER, L2 and an empty approver list; their requests are refused with nothing sent. ADMIN and AGENT send exactly `{ entityType: 'ticket', entityId, approverIds, comments }`, with blank comments left out and duplicates removed. A 400 and a 403 are worded. The confirmation names the approvers, the cancelled approvals, the move to Pending with Management Review, any reopening and no requester email, and never says "until all approvers respond". It says the SLA clock stays paused only when the server would count it as paused: a hold status with `slaHoldStartedAt` set (`BE:utils/sla.ts:15-19`). The outcome shows only a status re-read from the server.
  - **Wiring:** templates load only while the sheet is open; the hooks run their guard before the API call; the delete button is behind `can.deleteAttachments`, with a destructive confirmation naming the file; the route is registered; the approval screen confirms before sending and re-reads the status after; `GET /approvals` is never called.
- **`role-gating.test.mjs`, 125 tests (124):** the exact objects now include `deleteAttachments`, More options' `approval`, and the composer's `templates`. The wiring checks add `SubmitApprovalScreen.tsx`, and `TicketDetailScreen.tsx` and `ReplyComposerScreen.tsx` must not call the API directly.
- **Proof the tests bite.** Twenty-nine mutations, "too permissive" or "not as the web", were each applied alone, tested and restored by script. Every one made the suite fail (1–14 failures each), and each file was verified byte-identical afterwards by SHA-1, as was every file under `src/` and `tests/` after the run:
  - too permissive: END_USER deletes; L2 or everyone submits for approval; More options or the delete button bypassing the gate; an unknown role gets templates; the delete and submit API functions without their role check, or submit with no approver; either guard loosened or skipped in its hook; an extra field in the submit body; templates loaded with the composer; the delete button not behind the gate;
  - not as the web: the AGENT lock applied to delete or to submit; templates for staff only; a template replacing a non-blank message, or appended without a paragraph break; search matching the body; no "General" group; LKP-7 sending a parameter; the confirmation saying the ticket moves on after approval; the SLA clock judged "paused" from the status alone; the outcome claiming a status it never read; the cache dropping the row but not the count.
  - One first-draft mutation survived ("the delete hook skips the guard"): the order check passed because a missing call counts as position −1. The check now requires both calls to be present; the mutation is caught.

**G4 additions (2026-10-22): 475 tests in all (366 after G3: 106 new in `service-catalog`, 3 new in `role-gating`).** Per file: `service-catalog` 106, `role-gating` 128, `g3-features` 83, `list-filters` 65, `property-editing` 59, `tests/auth/mobile-sso` 34.
- **`tests/rbac/service-catalog.test.mjs`, 106 tests (new).** For each persona (END_USER, AGENT, triage AGENT, L2_MANAGER, ADMIN):
  - **Catalogue visibility:** the exact `serviceCatalogPermissions()` answer; the drawer row's position after Knowledge base; an unknown role gets nothing. **No per-item scoping:** every persona sees exactly the server's item list, and the screen never passes a viewer to the browse filter. The drawer row's label and route, and the three stack screens, are registered.
  - **Who can submit:** each persona sends exactly one `POST /service-catalog/requests` with exactly `{ serviceItemId, formData, notes }`; `priority` goes through for staff and is refused for END_USER with nothing sent; any other key (title, description, categoryId, teamId, assignedToId, impact, urgency, requesterId) is refused for every persona with nothing sent; an unknown role, a missing service or an invalid priority likewise. The write guard agrees, as a device refusal. A 404's message is kept.
  - **Whose requests:** from SCR-4 pages holding everyone's requests, each persona sees only their own, once each, in the server's order; another person's request never reaches the detail screen, for ADMIN too. SCR-4 sends `page` and `limit=50`, never `status`. The automatic reading of further pages is bounded (10 rows or 4 pages).
  - **The form:** the seven field types kept as themselves and every other type (case-sensitive) as text; labels, `required` truthiness and per-type placeholders; select options (strings, objects, numeric values, label-only, and the ones the web crashes on or renders blank); malformed entries skipped and counted; a non-array `formFields`; **no conditional logic** (dependency keys ignored, the field still required, no pattern applied); nothing prefilled. **Validation per type:** `required` fails only on empty (spaces pass, except in an e-mail, which the browser trims); text, long text and phone have no format rule; e-mail is the HTML "valid e-mail address"; number must be a number and a whole one; date a real day, any year; a select value must be an option; the browser check wins over `required`; errors in the form's order. **The `formData`:** every field, untouched ones as `""`, every value a string; the browser's value cleaning; react-hook-form's nesting for dotted and bracketed names; no prototype key. **The body:** exactly the four kept keys; blank notes as `""`, untrimmed; the web's toast text. **Priority:** the web form's options, all 12 pairs of its map, none without both, and sticky after clearing one.
  - **Wiring:** no attachments and no confirmation on the form; the body only from `buildServiceRequestBody`; the toast and the return to the catalogue's Home view; validation before sending, and the guard before the API call in the hook; the field control's seven branches; an inactive item cannot be requested.
- **`role-gating.test.mjs`, 128 tests (125):** the drawer rows now include `catalog` for every persona (a feature added for all roles, not a relaxation); the wiring checks add the three catalogue screens (no direct API call; no attachment picker or confirmation on the form; the detail checks ownership).
- **Proof the tests bite.** Twenty-eight mutations, "too permissive" or "not as the web", were each applied alone, tested and restored by script. Every one made the suite fail (1–10 failures each), and every file under `src/` and `tests/` was verified byte-identical afterwards by SHA-1:
  - too permissive: END_USER gets the request properties; My Requests shows everyone's rows; the detail shows anyone's request; END_USER may send a priority; extra keys allowed in the body; an unknown role may submit; the hook skips the guard; the form sends a priority for everyone; the detail skips the owner check; the catalogue screen gated by a raw role check;
  - not as the web: the catalogue for staff only; `required` trims spaces; no e-mail check; decimals allowed; the e-mail not trimmed; unknown types kept as such; a conditional field hidden; the phone placeholder default lost; empty option values kept; the priority map wrong for High × High; the priority not sticky; untouched fields left out of `formData`; notes trimmed; search on names only; the automatic page reading unbounded; SCR-4 asking for 100; a confirmation added; an attachment picker added.

**G5 additions (2026-10-22): 533 tests in all (475 after G4).** Per file: `role-gating` 129, `service-catalog` 108, `g3-features` 83, `list-filters` 65, `property-editing` 59, `g5-audit` 55, `tests/auth/mobile-sso` 34.
- **`tests/rbac/g5-audit.test.mjs`, 55 tests (new).**
  - **The create form:** `createTicketPermissions()` in full for each persona and for an unknown role; the preview is offered exactly where M4 offers it.
  - **The preview:** for all 25 impact × urgency pairs (including "not set"), it equals what TKT-2 stores, against the seeded matrix.
  - **The request:** TKT-2 carries exactly each role's keys and never `priority`; L2 sends no group, technician or requester; an unknown role sends END_USER's keys.
  - **Wiring:** the create screen renders the G1 `PriorityPreviewBox` and never reads the matrix or names the rule; `src/` defines exactly one `PriorityPreviewBox` and one `previewPriority`; every role decision on the screen comes from `createTicketPermissions()`.
  - **Audit pins:** for every persona, on a CLOSED and a CANCELED ticket, exactly which G1–G4 elements are offered (the web's lock set, §14.4). An unknown role edits no field and deletes no file.
- **`service-catalog.test.mjs`, 108 tests (106).**
  - My Requests: staff see every row and END_USER their own; an unknown role or no session sees only their own.
  - Only one's own rows are links, and there is no requester column.
  - No page is read by itself: the G4 automatic reading of further pages is removed, as there is nothing to search for.
- **`role-gating.test.mjs`, 129 tests (128):** `CreateTicketScreen.tsx` joins the wiring checks (it called `isStaff` and `isAgentOrAdmin` itself before G5).
- **Proof the tests bite.** Eleven mutations were each applied alone, tested and restored by script. Every one made the suite fail (1–9 failures each), and every file under `src/` and `tests/` was verified byte-identical afterwards by SHA-1. The mutations:
  - L2 gets the create preview
  - L2's create body carries group, technician or requester
  - an unknown role gets the staff create keys
  - the create body sends a priority
  - the create screen names the rule
  - the create screen looks the matrix up itself
  - the create screen gates "raise on behalf" with its own role check
  - END_USER sees everyone's requests
  - every My Requests row opens the detail
  - an unknown role may delete files
  - the AGENT lock dropped from category on closed tickets
  - One first-draft mutation survived: the create screen *naming* `previewPriority` without calling it. The wiring check was tightened so the screen may not reference the rule or the matrix data at all. It, and a realistic variant that looks the matrix up itself, are now caught.

**Technician editor (2026-10-27): 593 tests in all (533 before).** Per file: `role-gating` 129, `service-catalog` 108, `g3-features` 83, `list-filters` 65, `technician-editor` 60, `property-editing` 59, `g5-audit` 55, `tests/auth/mobile-sso` 34.
- **`tests/rbac/technician-editor.test.mjs`, 60 tests (new).**
  - **The link:** the Technician row's full answer for each persona on OPEN, RESOLVED, CLOSED and CANCELED, and the states each persona gets the link in (END_USER and L2: none; AGENT and triage AGENT: OPEN and RESOLVED, with the lock reason on CLOSED and CANCELED; ADMIN: all four). L2 and END_USER get the value only in all 11 statuses. No session or an unknown role: the value only.
  - **One rule:** for every persona × status × assignee, the link shows exactly where More options offers Assign, and the write guard refuses exactly where it does not. Bulk Assign follows `canAssignTickets`. TKT-4 refuses `assignedToId` and `teamId` for everyone.
  - **The call, with the UI bypassed:** `sendAssignment` (the hook's own write) for L2 and END_USER in all 11 statuses, to assign or remove: refused on the device, and **no request at all**, not even the status read. A locked AGENT likewise; an AGENT whose ticket was closed meanwhile sends the status read only. AGENT, triage AGENT and ADMIN send the read, then `POST /tickets/:id/assign`.
  - **The body (01 TKT-5):** `{ assignedToId, teamId }` for a member of the ticket's group, `{ assignedToId }` for anyone else or a ticket with no group, `{ assignedToId: null }` to remove; only those two keys; `teamId` never null or empty; the API layer drops any other key; never PUT, never `/status`.
  - **The list:** search roles, members by name, recommended people in an active group first, and the editor's order (recommended, then the group's members, each once, the current technician marked); M7's toast wording, shared.
  - **One implementation:** one TKT-5 function and the only `/assign` request in `src/`; `useAssignTicket()` used by M4 (Pick up), M7 and the editor only; `assignTicket()` called only by that hook and the two bulk loops, each after the guard on the screen's status and on the server's; the editor never calls the API, the guard or TKT-4 for it; one "Change technician" link; M4 renders the row only through `TechnicianSection`; M7 gates with `canAssignTickets`.
- **`property-editing.test.mjs`, 59 tests (unchanged count):** the per-persona answers now include `technician`, spelled out per state.
- **`role-gating.test.mjs`, 129 tests (unchanged count):** the editors' wiring check also requires `useAssignTicket(` and forbids calling `assignTicket(`, `sendAssignment(` or `canAssignTickets(` from the editors.
- **Proof the tests bite.** Ten mutations were each applied alone, tested and restored by script. Every one made the suite fail (1–19 failures each), and all 180 files under `src/` and `tests/` were verified byte-identical afterwards by SHA-1:
  - L2_MANAGER may assign (`canAssignTickets` on `isStaff`)
  - the editor ignores the AGENT lock
  - the editor offered to every staff role while More options is unchanged
  - END_USER gets the editor
  - the hook skips the guard on the screen's status
  - the write guard lets L2 through
  - a group is sent for someone outside it
  - the editor calls the API directly
  - M4 drops the editor for a plain Technician row
  - M7 gates with its own role check again

---

## 8. For Ronit to decide (items 2, 11 and 12 RESOLVED in G2; the rest not changed)

| # | Question | Recommendation |
|---|---|---|
| 1 | **Critical (§5).** Private-note files are visible to the requester. Should mobile stop offering attachments in Note mode until the backend fix ships? The composer's note text is misleading today | **Yes.** Hide the attachment picker in Note mode. In the meantime, change the text to: "Files are added to the ticket and the requester can see them." Raise §5 with the web team as part of A7 |
| 2 | ~~Staff property editing on M4 was never built~~ **Built in G1** (T8, T9, T11, T12). ~~`UPDATE_KEYS_BY_ROLE.L2_MANAGER` allows `categoryId` and `teamId`~~ | ✅ **RESOLVED (G2, Ronit: match the web).** The L2 allow-list is now `title`, `description`, `impact`, `urgency`, `tags`, `resolution`: no `categoryId` (read-only for L2 on the web) and no `teamId` (the web changes the group through TKT-5, a 403 for L2). 01 TKT-4 matches. Tested at the API layer, under the write guard |
| 3 | END_USER country selector: the app hides it (D8); 05 §A.12 says "shown read-only" | Keep it hidden: END_USER always sends `countryId=`, so a country label would be wrong. Update the 05 §A.12 text to match |
| 4 | "Raise on behalf" (requester picker) for ADMIN and AGENT: not in the web UI, but in 01 TKT-2 and 04 M8. CLAUDE.md rule 6 says the UI offers only what the web offers | Keep it: it is the server's intended feature and SDP parity, and exposes nothing. Record the exception against rule 6 |
| 5 | 08 S1 (Approvals for END_USER/L2 approvers, Announcements for END_USER) is implemented on its *proposed* default | Confirm S1 as decided |
| 6 | Reply all and To/CC for END_USER: the web offers them, mobile does not (04 M5) | Keep: TKT-9 has no access check (C.1), and the server builds END_USER recipients |
| 7 | Hide vs disable leftovers: Pick up / Assign for a locked AGENT, and Pick up on your own ticket, are hidden rather than disabled | Keep. The lock reason is on the same screen, and `OptionSheet` has no disabled state. Revisit if UAT finds it confusing |
| 8 | Approval detail shows ticket context whenever TKT-3 returns 200. For AGENT that is always true, because TKT-3 is unscoped for AGENT (C.6) | Keep: the approver is designated for that ticket, and the 403 path takes over automatically once A7 scopes TKT-3 |
| 9 | 04 M3 says the Unassigned filter is "(staff)"; 08 §4.5 and the app say ADMIN and AGENT | Fix 04's wording to ADMIN, AGENT |
| 10 | The comment at `src/hooks/usePostComment.ts:51` says "END_USER and L2 never send recipients". L2 does send To/CC, and the server keeps them | Correct the comment. I left it because hooks with mutations were out of bounds for this pass |
| 11 | **G1 D1.** On an impact or urgency change, the web also sends the matrix `priority` (ADMIN and AGENT only; L2 can't read the matrix). The stored priority is the same either way, but because `priority` is in the body the server emails the requester and the assignee "priority changed" and records it in History | ✅ **RESOLVED (G2, Ronit: match the web).** ADMIN and AGENT now send `priority` = the LKP-6 row for the effective pair, only with an impact/urgency change, only when the matrix is loaded and has that row, exactly as `FE:TicketDetailPage.tsx:304-317`. L2 sends none. **Restored side effect:** when that priority differs from the stored one, the server emails the requester and the assigned technician "priority changed" (`BE:tickets.controller.ts:776-784`) and History's UPDATED row shows the priority change (`:719`). The preview says so before Save. 01 TKT-4 and 03 `UpdateTicketBody` updated |
| 12 | **G1 D2.** Country on the ticket: the G1 brief (from 05 §A.12) locks it for a country AGENT. The web lets **every** AGENT change it, with the full country list (`FE:TicketDetailPage.tsx:2199`). 05 §A.12 describes the ticket-list filter, not this field | ✅ **RESOLVED (G2, Ronit: keep it locked, per 05 §A.12).** No code change: `ticketFieldPermissions` already locks it for a country AGENT, with the reason, and the tests already pin it (T11). WEB-VS-MOBILE-ROLES.md now lists it as ⊘ OUT OF SCOPE instead of a gap |

---

## 9. What changed in this pass (uncommitted)

**Created**
- `src/utils/permissions.ts`
- `tests/rbac/role-gating.test.mjs`
- this file

**Rewired to `permissions.ts`.** Same behaviour except T21.
- `src/navigation/DrawerContent.tsx`, `src/navigation/MainTabs.tsx`
- `src/screens/dashboard/HomeScreen.tsx`
- `src/screens/tickets/TicketListScreen.tsx`, `TicketDetailScreen.tsx`, `ReplyComposerScreen.tsx`

**Added**
- `isTicketFilterAllowed` in `src/utils/ticket-filters.ts`.
- `05-RULES-AND-GAPS.md` §C.26 and §C.27 (report only, R3).

**Not touched**
- No API call, query or mutation.
- No auth file, `auth.config.ts` or dev-token screen.
- No library.
- The web repo.

---

## 10. What Phase G1 changed (2026-10-22, uncommitted)

**Created**
- `docs/G1-WEB-BEHAVIOUR.md`: the web's behaviour for the five fields, with sources, and seven discrepancies with our docs.
- `src/utils/ticket-properties.ts`: the category cascade, the priority preview and the change detection, as pure functions.
- `src/screens/tickets/TicketPropertyEditors.tsx`: the four editors and `usePropertyEditing` (one editor at a time, explicit Save, leave prompt).
- `tests/rbac/property-editing.test.mjs`, `tests/rbac/personas.mjs`.

**Changed**
- `src/utils/permissions.ts`: `ticketFieldPermissions`, `fieldEditProblem`.
- `src/hooks/useUpdateTicket.ts`: refuses any key `fieldEditProblem` rejects, re-checks against the server's current status, puts the server's answer in the detail cache, refetches.
- `src/hooks/writeGuards.ts` (`assertFieldEdits`), `src/hooks/cache.ts` (`patchTicketDetail`), `src/api/errors.ts` (`describeFieldWriteError`), `src/utils/dialogs.ts` (`reportFieldWriteError`).
- LKP-6 added: `src/api/lookups.api.ts` (`getPriorityMatrix`), `src/hooks/useLookups.ts` (`usePriorityMatrix`), `src/api/responseSpecs.ts`, `src/hooks/queryKeys.ts`.
- `src/screens/tickets/TicketDetailScreen.tsx`: the Properties and Resolution cards render the editors.
- `tests/rbac/role-gating.test.mjs`: personas imported; wiring check for the editors file.

**Not touched**
- The status flow: status still changes only through TKT-6 POST.
- The create form (no priority preview there: gap 11 in `WEB-VS-MOBILE-ROLES.md`).
- `src/api/tickets.api.ts` allow-lists (§8 item 2), the auth flow, `auth.config.ts`, the dev-token screen.
- No library. No EAS build. The web repo.

---

## 11. What Phase G2 changed (2026-10-22, uncommitted)

**Decisions applied (§8 items 2, 11, 12, all "match the web")**
- Priority with an impact/urgency change: `classificationChanges` (`src/utils/ticket-properties.ts`) adds the LKP-6 row's priority for ADMIN and AGENT; `fieldEditProblem` accepts `priority` only alongside impact or urgency and only where the preview is offered; `UPDATE_KEYS_BY_ROLE` lets ADMIN and AGENT carry it; the M4 preview says the requester and technician are emailed. `UpdateTicketBody` gained `priority` in `src/types/ticket.ts` and `03-DATA-MODEL.md`.
- Country for a country-locked AGENT: unchanged, recorded as decided.
- L2 allow-list: `categoryId` and `teamId` removed in `src/api/tickets.api.ts`.

**Created**
- `docs/G2-WEB-FILTERS.md`: the web's list filters, with sources, and six web defects (report only).
- `src/screens/tickets/TicketFiltersScreen.tsx`: the Filters sheet (M3 → modal), opened from a button beside the search box.
- `tests/rbac/list-filters.test.mjs`.

**Changed**
- `src/utils/permissions.ts`: `ticketListFilters`; the `priority` rule in `fieldEditProblem`.
- `src/utils/ticket-filters.ts`: the five filters' state, `advancedFilterQuery`, `ticketListQuery` (one query for the list), the technician-slot rules, option lists, labels.
- `src/store/ui.store.ts`: the five filters and the search live here (in memory, wiped on sign-out); `clearTicketFilters` (the web's Clear) and `openTicketList` (a Home tile, like a web dashboard link).
- `src/hooks/useTickets.ts` builds its query with `ticketListQuery` and `ticketListFilters`; `src/hooks/useLookups.ts` `useTeams({ includeInactive })` for the group filter.
- `src/screens/tickets/TicketListScreen.tsx`: the Filters button with its count, the line listing what is applied with **Clear all**, the "No tickets match these filters" empty state. The named filters, search, sort, country, infinite scroll, pull-to-refresh, inline status and bulk actions are unchanged.
- `src/screens/dashboard/HomeScreen.tsx`: tiles call `openTicketList`.
- `src/navigation/TicketStack.tsx`, `src/types/navigation.ts`: the `TicketFilters` route.
- Docs: this file, `WEB-VS-MOBILE-ROLES.md`, `01-API-CONTRACT.md` (TKT-1 filters, TKT-4, USR-3, LKP-1, LKP-2, LKP-6), `03-DATA-MODEL.md`, a G2 note in `G1-WEB-BEHAVIOUR.md`.

**Not touched**
- The status flow (TKT-6 POST only), the create form (gap 11), gaps 3, 7, 8 and 9.
- The auth flow, `auth.config.ts`, the dev-token screen. No library. No EAS build. Nothing committed.
- The web repo: byte-for-byte unchanged (SHA-1 of every file under `frontend/src`, `backend/src` and `backend/prisma`, before and after).

---

## 12. What Phase G3 changed (2026-10-22, uncommitted)

The three features were identified by name, as the G3 brief asked: reply templates, delete a file, submit a ticket for approval. The service catalogue was not built (G4).

**Created**
- `docs/G3-WEB-BEHAVIOUR.md`: the web's behaviour for the three features, with a source line for every statement, and what mobile does differently and why.
- `src/utils/templates.ts`: the web picker's search, grouping and insert rules, as pure functions.
- `src/components/TemplatePickerSheet.tsx`: the "Templates" sheet.
- `src/hooks/useDeleteAttachment.ts`: ATT-5, behind `assertCanDeleteAttachment`.
- `src/screens/tickets/SubmitApprovalScreen.tsx`: the approval form, its confirmation and the outcome.
- `tests/rbac/g3-features.test.mjs`.

**Changed**
- `src/utils/permissions.ts`: `canUseReplyTemplates`, `canDeleteAttachments`, `canSubmitForApproval`; `composerPermissions().templates`; `ticketDetailPermissions().deleteAttachments` and More options' `approval`.
- API: `listCannedResponses` (LKP-7) in `lookups.api.ts`; `deleteAttachment` (ATT-5) in `attachments.api.ts`; **`submitTicketForApproval` (APR-4, new in 01)** in `approvals.api.ts`. Each API function refuses a role that may not use it, before sending. `CANNED_RESPONSE_SPEC`; `describeActionWriteError` (a 403 says plainly that the role can't do it).
- Hooks: `useCannedResponses`, `useSubmitForApproval`, `assertCanDeleteAttachment`, `assertCanSubmitForApproval`, `removeAttachmentFromCache`, the `canned-responses` query key.
- Types: `CreateApprovalBody` in `src/types/approval.ts`, copied from 03 §C, where it was added first.
- Screens: `ReplyComposerScreen.tsx` (Templates button and sheet), `TicketDetailScreen.tsx` (delete button per file; "Submit for approval…" in More options), `PersonPickerSheet` (`excludeIds`), the `SubmitApproval` route in `TicketStack.tsx` and `types/navigation.ts`. Copy: `utils/approvals.ts` (`submitApprovalMessage`, `submitApprovalOutcome`), `utils/writeCopy.ts` (`deleteAttachmentMessage`), `utils/dialogs.ts` (`reportActionWriteError`).
- `tests/rbac/role-gating.test.mjs`: expected objects updated for the three features (no permission relaxed); wiring for the new screen.
- Docs: this file, `WEB-VS-MOBILE-ROLES.md`, `01-API-CONTRACT.md` (LKP-7 corrected, ATT-5, APR-4, the index), `03-DATA-MODEL.md` (`CreateApprovalBody`), `04-SCREEN-MAP.md` (M4, M5, P6, P7, P16), `05-RULES-AND-GAPS.md` (§A.3, §A.5, B.22 re-checked, **B.35** and **C.28** new, report only).

**Not touched**
- The status flow: status still changes only through TKT-6 POST. (APR-4 changes the status on the server by itself; that is the web's behaviour, recorded as 05 B.35.)
- `GET /approvals` (unscoped, C.16): not called, so the web's per-ticket Approvals tab is not built.
- The auth flow, `auth.config.ts`, the dev-token screen. No library. No EAS build. Nothing committed.
- The web repo: byte-for-byte unchanged (SHA-1 of every file under `frontend/src`, `backend/src` and `backend/prisma`, before and after).

---

## 13. What Phase G4 changed (2026-10-22, uncommitted)

The service catalogue, as the web portal does it (`docs/G4-WEB-CATALOGUE.md`), except where the web shows controls that save nothing or a list it should not (SC6, SC7).

**Created**
- `docs/G4-WEB-CATALOGUE.md`: the web's catalogue, request form (every field type and rule) and My Requests, with a source line for every statement; nine web defects (report only); what mobile does differently and why.
- `src/utils/service-catalog.ts`: browsing, the field definitions, validation, `formData`, the request body, the impact × urgency map and the answer rows, as pure functions.
- `src/api/serviceCatalog.api.ts`: SCR-1 to SCR-6. `createServiceRequest` refuses, before sending, any body `serviceRequestProblem` rejects.
- `src/hooks/useServiceCatalog.ts`: `useServiceCategories`, `useServiceItems`, `useServiceItem`, `useMyServiceRequests` (own rows only), `useServiceRequest`, `useSubmitServiceRequest` (behind `assertServiceRequest`).
- `src/screens/catalog/`: `ServiceCatalogScreen` (catalogue and My Requests), `ServiceRequestFormScreen`, `ServiceFormFieldInput` (the seven field types), `ServiceRequestDetailScreen`.
- `src/components/ApprovalStatusChip.tsx`: moved out of `ApprovalDetailScreen.tsx`, unchanged, so the request detail reuses it.
- `tests/rbac/service-catalog.test.mjs`.

**Changed**
- `src/utils/permissions.ts`: the `catalog` drawer row; `canUseServiceCatalog`, `serviceCatalogPermissions`, `isOwnServiceRequest`, `myServiceRequestRows`, `serviceRequestProblem`. The set of known roles is shared with `canUseReplyTemplates` (same answer).
- Navigation: `CatalogStack` in `ModuleStacks.tsx`, the `Catalog` drawer screen, the drawer row "Service Request"; `CatalogStackParamList` in `src/types/navigation.ts`.
- `src/hooks/writeGuards.ts` (`assertServiceRequest`), `src/hooks/queryKeys.ts` (`serviceCatalog`), `src/api/responseSpecs.ts` (three specs), `src/hooks/index.ts`, `src/components/index.ts`; `ApprovalDetailScreen.tsx` imports the chip.
- `tests/rbac/role-gating.test.mjs`: the drawer rows include `catalog`; wiring checks for the three screens.
- Docs: this file, `WEB-VS-MOBILE-ROLES.md`, `01-API-CONTRACT.md` (SCR-1 to SCR-6), `04-SCREEN-MAP.md` (the catalogue screens are now MVP: M17–M19), `05-RULES-AND-GAPS.md` (§A.17 and B.24, a G4 note each).

**Not touched**
- The ticket screens and flows (status still changes only through TKT-6 POST), the create form (gap 11 stays open).
- The auth flow, `auth.config.ts`, the dev-token screen. No library. No EAS build. Nothing committed.
- The web repo: byte-for-byte unchanged (SHA-1 of every file in the clone outside `node_modules` and `.git`, before and after).

---

## 14. Phase G5: the last gap, My Requests settled, and the G1–G4 role audit (2026-10-22, uncommitted)

The web source was re-read at the same HEAD, `d7f3887`. The web's own behaviour for G1–G4 is unchanged since those phases, so their source documents still hold (`docs/G1-WEB-BEHAVIOUR.md` … `G4-WEB-CATALOGUE.md`). This audit re-checks what the **app** does today against them, element by element. Ronit's rule: match the web. The only exception is the §5 cases in `WEB-VS-MOBILE-ROLES.md`, where the web shows a control that returns a 403 or leaks data.

### 14.1 Every element G1–G4 added or changed (and G5's)

"Shows to" means where the control is offered. Direction: **too permissive** = mobile offers more than the web; **too restrictive** = less.

| Phase · element | App shows it to | Web shows it to (source) | Verdict |
|---|---|---|---|
| G1 · impact and urgency edit (T9) | AGENT (not locked), L2, ADMIN | the same (`TDP:1737-1774`; lock `:1740, :1757`) | MATCH |
| G1 · priority shown and sent with that edit (T13) | preview and `priority`: ADMIN, AGENT (not locked); L2 neither | `priority` from ADMIN, AGENT; L2's matrix is a 403 (`TDP:294-317`) | MATCH |
| G1 · category edit (T8) | ADMIN, AGENT (not locked); others read-only | the same (`TDP:1951-1953`) | MATCH |
| G1 · country edit (T11) | ADMIN, triage AGENT, any status; plain AGENT locked; L2 value only | ADMIN, every AGENT, any status; L2 a no-op select (`TDP:2199`; `TC:553-556`) | too restrictive: plain AGENT (Ronit's G2 decision); L2 (*defect avoided*) |
| G1 · resolution edit (T12) | staff, RESOLVED or CLOSED, no lock | every role, RESOLVED or CLOSED (`TDP:1440-1455`) | too restrictive for END_USER (§C gap C.5, `WEB-VS-MOBILE-ROLES.md` §5) |
| G1/G2 · TKT-4 allow-list and write guard | only the fields above, per role and state | (UI only) | MATCH; `fieldEditProblem` refuses everything else before sending |
| G2 · priority, category, date filters (L12) | all | all (`TLP:494-546, :573-586`) | MATCH |
| G2 · technician and group filters (L10) | ADMIN, AGENT | all; END_USER and L2 get a 403 and an empty list (`TLP:145-156`) | MATCH for ADMIN, AGENT; too restrictive for END_USER, L2 (*defect avoided*, 403) |
| G2 · the filters' option lists | every active AGENT; every group | the same (`users.controller.ts:44-63`; `teams.controller.ts:19-26`) | MATCH (§14.4 c) |
| G3 · reply templates (C4) | all, every composer mode | the same (`TDP:1046`) | MATCH |
| G3 · delete a file (T22) | ADMIN, AGENT, L2; any file; every status | the same (`TDP:1345`, lock-free; `attachments.controller.ts:149`) | MATCH (§14.4 d) |
| G3 · submit for approval (T26) | ADMIN, AGENT; every status | the Actions menu to all roles, the tab to staff; the server allows ADMIN and AGENT (`TDP:697, :1585`; `approvals.router.ts:8`) | MATCH for ADMIN, AGENT; too restrictive for END_USER, L2 (*defect avoided*, 403) |
| G4 · catalogue: drawer row, browse, search (SC1, SC2) | all | all (`AppLayout.tsx:30`; `SCP:36-66`) | MATCH |
| G4 · request form and "Add Request" (SC4) | all | all (`SRF:183-235, :485-491`) | MATCH (§14.4 b) |
| G4 · request properties (SC5) | staff; only `priority` sent | staff (`SRF:41, :267-318`) | MATCH |
| G4 · the form's inert controls and attachments (SC6) | nobody | all (`SRF:267-464`; the server keeps none) | too restrictive (*defect avoided*: they save nothing) |
| G4 · My Requests (SC7) | **G5:** staff every request, END_USER their own | the same (`SCP:44-48`; `SCC:117`) | **MATCH since G5** (G4: too restrictive) |
| G4 · a request's detail (SC8) | own requests, every role | no detail at all (`SCP:344`) | mobile addition (➕); never another person's answers |
| G4 · creating a template (SC3) | nobody | ADMIN (`SCP:398-405`) | too restrictive (*decision*: admin stays on the web) |
| G5 · create-form priority preview (CR8) | ADMIN, AGENT; L2 told the Service Desk sets it | ADMIN, AGENT; L2's box never computes (`CTP:49-76, :368-387`) | MATCH |
| G5 · create-form body (TKT-2) | END_USER 4 keys; L2 + impact, urgency; ADMIN, AGENT + group, technician, requester | no form offers L2 a group, technician or requester that works (`CTP:410-470`, 403) | **was too permissive below the UI; fixed** (§14.3) |

**Result:**
- **Too permissive:** two cases in the API layer, unreachable from any screen. Both fixed (§14.3).
- **Too restrictive:** 12 (§2 totals). Each is a 403, a leak, a §C gap, a control that saves nothing, or a recorded decision.
- **Undocumented:** none.

### 14.2 My Requests: the finding

**Does the web show staff all requests, or only those they are involved with?** All of them. `listRequests` adds `requesterId` to the query for END_USER only (`BE:modules/serviceCatalog/serviceCatalog.controller.ts:111-124`). The web lists the response unfiltered, with the columns number, service, status and date, and no requester (`FE:pages/service-catalog/ServiceCatalogPage.tsx:44-48, :333-352`). "Involved with" has nothing to work on:
- A request carries `assignedToId`, `teamId` and `countryId` columns (`schema.prisma`, `model ServiceRequest`).
- But SCR-5 never sets them (`:135-159`).
- No web page calls the staff-only assign or status routes (`serviceCatalog.router.ts:25-27`; `FE:` has no caller).

**Is the scoping enforced by the API, or a UI choice?** By the API. It is explicit: "End users see only their own requests" (`:116`). SCR-6 applies the same rule (`:129-131`, 403 for another person's request, END_USER only).

**Is there a separate staff view?** No. One page, `/service-catalog`, has one "My Requests" view with no role check (`FE:router/index.tsx:145-146`; `SCP:174-187, :326-361`). No other page reads service requests; the Approvals page names a request's service only.

**Against the §5 criteria:**
- **403:** no, the list answers every role.
- **Leak:** no. The server grants staff every request deliberately, as the side that fulfils them. The web shows four non-personal columns; it shows no requester and no answers.
- **CLAUDE.md:** it relies on no §C gap and skips no §A rule.

So the restriction was not justified, and it was removed:
- ADMIN, AGENT and L2_MANAGER now see every request, END_USER their own (`serviceCatalogPermissions().everyonesRequests`, `myServiceRequestRows`).
- Only one's own rows are links, so another person's answers, notes and approvals are still shown nowhere: on the web no row opens anything.
- The rows add "by you" to one's own requests and nothing else.
- G4's automatic reading of further pages (looking for one's own rows) is removed: pages of 50 load as the list scrolls.

### 14.3 Fixes

1. **Too permissive, fixed: TKT-2 let L2_MANAGER carry `teamId`, `assignedToId` and `requesterId`.**
   - `CREATE_KEYS_STAFF` covered every role but END_USER.
   - The screen never offered these to L2, and the web's group and technician lists are a 403 for L2. No web form has a requester field.
   - Now `CREATE_KEYS_BY_ROLE` in `src/api/tickets.api.ts` gives L2 `title`, `description`, `categoryId`, `source`, `impact` and `urgency`, the same narrowing G2 made to TKT-4 (§8 item 2). 01 TKT-2 updated.
2. **Too permissive, fixed: TKT-2 gave a role the app doesn't know the staff keys.** It used `role === 'END_USER' ? … : staff`. It now gets END_USER's keys.
3. **Latent, hardened: an unknown role counted as staff in two G1/G3 gates.** These were `ticketFieldPermissions` (impact, urgency and resolution edits) and `canDeleteAttachments`, which relied on `isStaff` (true for anything but END_USER).
   - Both now answer as for END_USER: no edit, no delete. This matches the G3/G4 gates, which already used the known-role set.
   - It was unreachable: sign-in and the stored session refuse an unknown role (`src/api/auth.api.ts:339`, `src/store/auth.store.ts:75`).
4. **Structure, no change in who can do what:** the create form called `isStaff` and `isAgentOrAdmin` itself. Every role decision there now comes from `createTicketPermissions()`, and the screen is in the wiring checks (§7).

**No permission was relaxed for a test.** The two G4 tests that pinned My Requests to "own rows only" now pin the web's rule. The decision behind them changed, not the test's strictness: END_USER's own-rows rule, the detail's owner check and "only own rows are links" are each tested.

### 14.4 The brief's four questions

**(a) Is anything editable on a closed ticket that the web locks?** **No.**
- The web's only state lock is `isResolvedLocked`: an AGENT on a CLOSED or CANCELED ticket (`TDP:619-623`).
- It removes the transitions, Pick up and Assign, Add Attachment, impact, urgency, category, the group and the status select (`:669, :1268, :1685, :1740, :1757, :1778, :1890, :1953`).
- It leaves country, the resolution, deleting a file, submitting for approval, templates, replies and tasks open.
- CLOSED and CANCELED have no transitions for any role (`:104-105`).
- The app matches exactly. `g5-audit.test.mjs` pins, for every persona, the ten G1–G4 elements offered on a CLOSED and a CANCELED ticket.

**(b) Can any role submit a catalogue field it should not?** **No.**
- The renderer reads no role, team or country key, so every role gets the same custom fields (G4 §4).
- The only role-gated input is the priority from the staff-only Impact and Urgency. END_USER cannot send it: the form omits it, and the hook guard, the API function and `serviceRequestProblem` each refuse it before sending.
- Every other key is refused for everyone.
- `formData` is built only from the item's own fields (`buildFormData`).

**(c) Can a role filter by a technician or group outside their scope, and infer what it should not see?** **No, not through the filters.**
- END_USER and L2 have neither filter. Their values never reach TKT-1, even from a stale state (`ticketListQuery`, tested).
- ADMIN and AGENT get the web's own option lists: every active AGENT, every group.
- The server spreads `assignedToId` and `teamId` alongside the role scope, so a filter only narrows within it (`TC:98-131`). Picking an outside technician or group returns only tickets the person could already see.
- One known server defect widens AGENT and L2 lists, on the web exactly as on mobile, with or without filters: a search term replaces the scope `OR` (`TC:143`, 05 C.7). Mobile neither relies on it nor patches it (CLAUDE.md rule 6). A country-locked AGENT's list is still scoped, because the app always sends their country, which puts the scope under an `AND` (`TC:104-110`; `src/utils/ticket-filters.ts` `listCountryParam`).

**(d) Does the web really let every staff role delete any file in any state?** **Yes, as G3 concluded.**
- The trash icon shows for `role !== 'END_USER'` (`TDP:1345`), outside the lock that hides "Add Attachment" (`:1268`).
- It is on every file of the list (`:1319-1351`).
- The server refuses END_USER only and checks no state or uploader (`attachments.controller.ts:146-157`).
- There is no other delete control in the web app (repo-wide search).

### 14.5 Web defects found in G5 (report only, R3)

- **W-G5-1. The create page's priority preview is sticky.** After a priority has been computed, changing to a pair with no matrix row (impact MINIMAL or urgency URGENT, by default) keeps the old value on screen and in the body (`CTP:67-72`). The server then stores it, because no row overrides it (`TC:193-201`). The stored priority depends on the order the fields were picked. Mobile stores Medium in that case and says so.
- **W-G5-2. The create page loads the priority matrix for every role** (`CTP:49-52`, no `enabled`). Every END_USER and L2 opening "New Ticket" causes a 403. This is the detail page's G1 defect, on a second page.
- **W-G5-3. Changing impact and urgency on the web sends two updates.** Each save-on-select sends the priority of its moment (`TDP:304-317`), so one edit can produce two "priority changed" emails and two History lines (`TC:719, :775-784`). This is the consequence of saving on selection; mobile sends one update (`WEB-VS-MOBILE-ROLES.md` §8, 5b).
- **Already recorded, seen again in the walkthrough:**
  - Pick up without `teamId` moves the ticket to the technician's first group (05 B.14; `WEB-VS-MOBILE-ROLES.md` §8, 2a).
  - The web's My Requests labels everyone's requests "My" (G4 D4). G5 keeps the web's behaviour and label.

### 14.6 What changed (uncommitted)

**Created**
- `tests/rbac/g5-audit.test.mjs`.

**Changed**
- `src/utils/permissions.ts`:
  - `createTicketPermissions` (new);
  - `serviceCatalogPermissions().everyonesRequests`;
  - `myServiceRequestRows` (staff: every row);
  - `isOwnServiceRequest` (doc);
  - `canDeleteAttachments` and `ticketFieldPermissions` (unknown role).
- `src/utils/ticket-properties.ts`: `newTicketPriority`.
- `src/screens/tickets/TicketPropertyEditors.tsx`: `PriorityPreviewBox` exported, with an `update` or `create` target. M4's output is unchanged.
- `src/screens/tickets/CreateTicketScreen.tsx`: the preview, and every role decision from `createTicketPermissions()`.
- `src/api/tickets.api.ts`: `CREATE_KEYS_BY_ROLE`.
- Service catalogue:
  - `src/hooks/useServiceCatalog.ts`: no automatic page reading;
  - `src/utils/service-catalog.ts`: the scan helpers removed;
  - `src/screens/catalog/ServiceCatalogScreen.tsx`: every row for staff, only one's own rows are links;
  - `src/api/serviceCatalog.api.ts`: comment.
- Tests: `service-catalog.test.mjs`, `role-gating.test.mjs`.
- Docs:
  - this file;
  - `WEB-VS-MOBILE-ROLES.md` (final state; §5 reviewed; §8 workflows);
  - `01-API-CONTRACT.md` (TKT-2, SCR-4);
  - `04-SCREEN-MAP.md` (M8, M17);
  - a G5 note in `G1-WEB-BEHAVIOUR.md` and `G4-WEB-CATALOGUE.md`.

**Not touched**
- The status flow: TKT-6 POST only; `PUT /tickets/:id` never carries a status.
- The auth flow, `auth.config.ts`, the dev-token screen.
- No library, no EAS build, nothing committed.
- The web repo: byte-for-byte unchanged (file list, sizes and modification times of all 840 files, and SHA-1 of every file under `frontend/src` and `backend/src`, before and after).

---

## 15. The technician, inline on M4 (2026-10-27, uncommitted)

**What Ronit asked for:** the Technician row in Properties showed the value ("Unassigned") with no way to change it there. Impact/urgency, category and country each have a "Change …" link that opens an inline editor with Save and Cancel; the technician should work the same way. **Placement, not a new capability:** assignment already existed (Pick up and More options › Assign… → M7, both TKT-5).

### 15.1 The web's technician picker (read-only, HEAD `d7f3887`)

`TDP` = `FE:pages/tickets/TicketDetailPage.tsx`; `TC` = `BE:modules/tickets/tickets.controller.ts`.

| Question | The web | Source |
|---|---|---|
| Where, and for whom | A Technician panel in Properties: "+ Assign", "↔ Reassign" or "✕ Cancel" opens a list under the name. Shown when `role !== 'END_USER' && !isResolvedLocked`, so to L2_MANAGER too (every pick then gets 403). The toolbar also has an "Assign" search modal | `TDP:1776-1801`; lock `:619-622`; modal `:673, :2363-2419`; `BE:tickets.router.ts:20` |
| How the list is built | 1. **"🌍 Recommended for {country}"**: TKT-10, fetched when the panel opens, shown only when not empty. 2. **The members of the ticket's own group**: LKP-2, plus one `GET /teams/:id` per group. 3. **Only when that group has no members**: a search box, USR-3 with `role=AGENT,ADMIN`, 2+ characters | `TDP:332-336, :1809-1827`; `:337-355, :1805-1806, :1828-1851`; `:287-291, :1852-1873` |
| Scoped by | **Group** for the members (the ticket's saved group, not a group chosen in the panel). **Category and country** for the recommended list. Search: no scope beyond the two roles | `TDP:1805`; `TC:503-529`; `users.controller.ts:68-92` |
| Order | Recommended: the server's (no `orderBy`, de-duplicated). Members: the server's (no `orderBy` on `GET /teams/:id`). Search: up to 20 active users, unordered | `TC:520-528`; `teams.controller.ts:30-40`; `users.controller.ts:80-91` |
| Is "Unassigned" selectable? | **Yes.** "Remove assignment" in the members header while the ticket is assigned, and "Unassign" in the toolbar modal; both send `{ assignedToId: null }` | `TDP:1832-1837`; `:2401-2414` |
| Does changing the group change the technicians offered? | **Yes, indirectly.** The group is a separate "Group & Site" select that saves at once (TKT-5 `{ assignedToId: current, teamId }`); the panel lists the members of the ticket's saved group, so after the refetch it lists the new group's members. The panel itself has no group choice | `TDP:1889-1895`; `:1805` |
| What a pick sends | `{ assignedToId }` alone, at once (no Save, no confirmation). With no `teamId` the server moves the ticket to the assignee's first group (05 B.14) | `TDP:1818, :1842, :1865`; `TC:793-802` |
| After success | Refetch the ticket and its activity, close the panel, toast **"Ticket assigned"** (also after a removal) | `TDP:462-471` |
| On error | Toast **"Failed to assign ticket"**; the server's message is not shown | `TDP:472` |
| "Recommended" basis | `categoryCountryAssignee` rows for the ticket's category or any ancestor, in the ticket's country (exact match only; "All Sites" rows are not included). `[]` when the ticket has no country or category. Inactive users are not filtered out (05 B.30) | `TC:503-529` |
| The current technician | Highlighted with "✓ Current" | `TDP:1820-1822, :1844-1846` |

**The mobile assign picker (M7) already did this**, with its documented differences: it also lets you choose another group, sends `teamId` when the person is a member of the group chosen (05 B.14), sorts members by name, lists recommended people who are in no active group last with a warning (05 B.30), and confirms each assignment. So nothing was re-derived. Its pieces were moved into `src/utils/assignment.ts` and reused.

### 15.2 What was built

- **The link:** "Change technician" under the Technician row, through the same `FieldAction` as "Change impact and urgency", "Change category" and "Change country". It is shown when `ticketFieldPermissions().technician` is `edit`. A locked AGENT gets the lock reason instead; L2_MANAGER and END_USER get the value only. The row is never hidden.
- **The editor:** the same frame as the country editor. A "Technician" field opens the people picker that M7 uses (`PersonPickerSheet`), then come Save and Cancel (`EditorActions`). The list: "Unassigned", then the recommended people (TKT-10), then the members of the ticket's group (LKP-2), each person once, the current technician marked. When the group has no members, the picker also searches USR-3 (AGENT, ADMIN), as M7 and the web do. The list filters as you type.
- **Saving:** only on Save; nothing is saved on selection or on leaving (the discard prompt applies). Save is disabled until someone else (or Unassigned) is chosen, and every control is disabled while the save is in flight. Before Save, a notice gives M7's confirmation text: who is assigned and emailed, or that the ticket will have no technician.
- **The write:** `edit.assign` → `useAssignTicket` → `sendAssignment` → `assignTicket` (TKT-5). The body is `{ assignedToId, teamId? }`, with the ticket's group sent only for one of its members (M7's rule, `assignmentTeamId`). On success, M7's toast ("Assigned to …" or "Assignment removed"). The hook now also writes the server's answer into the ticket's cached detail (as TKT-4 saves do), so the Technician and Group rows, Pick up and the priority note change at once. The refetch follows.
- **On failure:** the server's message; a 403 says "Your role can't change the technician on this ticket. Nothing was saved." The editor closes and the row shows the saved technician. Nothing is optimistic.
- **Differences from the web**, all inherited from M7 or the editor pattern: an explicit Save (the web saves on click); the group sent for a member (the web sends none and the server moves the ticket); the server's message on error; members by name; inactive recommended people last with a warning; M7's toasts; L2_MANAGER not offered it (the web's always fail).

### 15.3 One assignment implementation, and how it was checked

- **Who:** `canAssignTickets(role)` in `src/utils/permissions.ts` (ADMIN, AGENT) is now the one rule behind More options' Pick up and Assign, the Technician editor (`ticketFieldPermissions().technician`, plus the AGENT lock), bulk Pick up and Assign, M7's screen guard, and the write guard `assertAssignment`. Before, each of these called `isAgentOrAdmin` itself. The answers are unchanged for every role.
- **How:** one API function, `assignTicket` (TKT-5), holding the only `/assign` request in `src/`. One single-ticket hook, `useAssignTicket`, used by Pick up (M4), M7 and the editor. Its write is `sendAssignment`: online, the guard on the status on screen, the guard on the server's status (one TKT-3 read), then TKT-5. The two bulk loops, bulk Pick up on M3 and bulk Assign on M7, predate this change. They call the same guard twice and the same `assignTicket` inside the bulk runner, which cannot use a hook per ticket.
- **Evidence:** `tests/rbac/technician-editor.test.mjs` §6 reads every file under `src/` and pins all of the above. It checks one `assignTicket` definition and one `/assign` URL. It checks that exactly four files mention `useAssignTicket()` (the hook and its three users). It checks that exactly three files call `assignTicket(`, each after `assertAssignment(…)` on the screen's status and on `await fetchCurrentStatus(…)`. It checks that the editor calls none of the API, the guard, `canAssignTickets` or TKT-4 for the technician, and that there is one "Change technician" link. TKT-4 still refuses `assignedToId` and `teamId` from everyone (`fieldEditProblem`), so the editor cannot reach a second path.

### 15.4 Web defects seen (report only, R3)

- The web toasts "Ticket assigned" after **removing** a technician (`TDP:470`).
- The web's assign error hides the server's message (`TDP:472`).
- Already recorded: the panel is shown to L2_MANAGER, whose picks all get 403 (§1.8 W5); a pick without `teamId` moves the ticket to the assignee's first group (05 B.14).

### 15.5 What changed (uncommitted)

**Created**
- `src/utils/assignment.ts`: the lists and the group rule, out of M7.
- `tests/rbac/technician-editor.test.mjs`.

**Changed**
- `src/utils/permissions.ts`: `canAssignTickets` (new); `ticketFieldPermissions().technician` (new); `ticketDetailPermissions` and `bulkActions` read `canAssignTickets`.
- `src/hooks/writeGuards.ts`: `assertAssignment` reads `canAssignTickets`.
- `src/hooks/useAssignTicket.ts`: the write is `sendAssignment` (exported for the tests, same steps); the success also patches the cached detail. `src/hooks/cache.ts`: comment.
- `src/screens/tickets/TicketPropertyEditors.tsx`: `TechnicianSection`, `TechnicianForm`, and `usePropertyEditing().assign`.
- `src/screens/tickets/TicketDetailScreen.tsx`: the Technician row is `TechnicianSection`.
- `src/screens/tickets/AssignPickerScreen.tsx`: `canAssignTickets`, and its lists, group rule and wording from `utils/assignment.ts` and `writeCopy.ts`; same behaviour.
- `src/utils/writeCopy.ts`: `unassignMessage`, M7's wording moved.
- Tests: `property-editing.test.mjs` (the `technician` answers), `role-gating.test.mjs` (the editors' wiring check).
- Docs: this file; `WEB-VS-MOBILE-ROLES.md` (the assignment row; parity unchanged); `docs/brand/UI-STANDARDS.md` (§8, the inline editor pattern).

**Not touched**
- Who may assign, and the AGENT lock on CLOSED and CANCELED: the same answers for every role and status.
- The status flow: TKT-6 POST only; `PUT /tickets/:id` never carries a status.
- The auth flow, `auth.config.ts`, the dev-token screen; navigation; no library; no EAS build; nothing committed.
- The web repo: byte-for-byte unchanged (SHA-1 of all 840 files outside `node_modules` and `.git`, before and after).
