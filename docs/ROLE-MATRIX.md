# Role matrix: web portal (expected) vs mobile app (audit)

**Phase D-pre RBAC audit, 2026-10-20.** Nothing was built and nothing was committed.

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
| Elements whose role gating differs from the web portal | **30** of the 84 rows in §2. **0 are security problems** |
| More permissive than the web UI | **3**, all deliberate and documented (N1, N4, CR4). None exposes data or actions beyond what the server already scopes to the user |
| More restrictive than the web UI | **27**. Of these: **12** avoid a web defect, a 403 or a mis-scoped number (mobile is correct). **11** are documented product decisions. **4** are undocumented: staff property editing on ticket detail was never built (T8, T9, T11, T12) |
| Private notes (check A) | **Hidden client-side, independent of the server.** There are three guards on the conversation and one on history. The Note option is absent for END_USER and L2, and the device refuses a PRIVATE post from them before it is sent. The premise "the API hides notes from L2" is only half true: TKT-7 sends them to L2 (§4) |
| Attachments on private notes (check B) | **Real leak, Critical, backend-only fix.** The requester can list, view, download and zip files attached to a private note, and the header count includes them. The app cannot tell those files apart from others. It can only stop creating new ones (§5) |
| Actions that 403 (check C) | **All hidden**, and assignment is also refused on the device (§6) |
| Fixed in this pass | One hide-vs-disable fix: T21, the Attachments tab now says why a locked AGENT can't add files. All role gating now goes through one tested module, `src/utils/permissions.ts`, and screens render its output. No permission was relaxed |
| Needs Ronit | §8, ten items. The first is Critical: whether staff may attach files to notes |

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
- Technician and Group filters are shown to every role, but END_USER and L2 get a 403 and an empty list (`:549-570`).

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
| Impact, urgency, priority preview, mode | ❌ | ✅ | ✅ | ✅ | `:346-400` |
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
- `bulkActions`, `inlineStatusTransitions`

It builds on `src/utils/ticket-rules.ts`, `activity.ts` and `ticket-filters.ts`.

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
| N8 | Tabs Home · Tickets · Alerts | all, same three | all, five tabs | MATCH. KB is in the drawer; Requests is P2 | `src/navigation/MainTabs.tsx:46` → perm `mainTabs` |

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
| L10 | Technician / Group advanced filters | not built | all (END_USER and L2 get 403/empty) | N/A | – |
| L11 | CSV export, saved views | – | all | N/A (04 §2.3) | – |

### 2.4 Ticket detail (M4)
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| T1 | "Change status" card | AGENT, L2, ADMIN; a locked AGENT sees why there are no buttons | same | MATCH | `src/screens/tickets/TicketDetailScreen.tsx:497-525` → perm `ticketDetailPermissions` |
| T2 | Transitions offered | map; END_USER none; AGENT none on CLOSED/CANCELED | same | MATCH (test pins every role × status) | `ticket-rules.ts` `getAvailableTransitions` |
| T3 | Status `<select>` with all statuses | none | AGENT, L2, ADMIN | **NARROWER**, *decision* D1 (W7) | – |
| T4 | Close… (closure form) | roles whose map has CLOSED | same | MATCH | perm `moreActions` |
| T5 | Pick up | ADMIN, AGENT; not locked; not when already yours | AGENT, L2 (403), ADMIN | **NARROWER** for L2, *defect avoided* (D2, §6) | perm `moreActions` |
| T6 | Assign / Reassign / Remove | ADMIN, AGENT; not locked (M7) | AGENT, L2 (403), ADMIN | **NARROWER** for L2, *defect avoided* | perm `moreActions`; `AssignPickerScreen.tsx:47` |
| T7 | Group & Site | ADMIN, AGENT (M7 "Move to group") | AGENT, L2 (403), ADMIN | **NARROWER** for L2, *defect avoided* | M7 |
| T8 | Category edit | nobody (read-only) | ADMIN, AGENT (not locked) | **NARROWER, UNDOCUMENTED** (not built) | – |
| T9 | Impact / urgency edit | nobody | AGENT (not locked), L2, ADMIN | **NARROWER, UNDOCUMENTED** (not built) | – |
| T10 | Impact / urgency display for END_USER | hidden | read-only in the Details tab | **NARROWER**, *decision* 05 §A.3 | perm `classification`; `TicketDetailScreen.tsx:553` |
| T11 | Country edit | nobody | ADMIN, AGENT; L2 no-op | **NARROWER, UNDOCUMENTED** (not built) | – |
| T12 | Resolution edit | nobody | all roles | **NARROWER**: END_USER *decision* D3; staff **UNDOCUMENTED** (not built) | – |
| T13 | Priority read-only; "Auto" pill | pill for staff | same | MATCH | `TicketDetailScreen.tsx:454` |
| T14 | Reply | all | all | MATCH | perm `conversationActions`, `:278` |
| T15 | Reply all | AGENT, L2, ADMIN | all | **NARROWER** for END_USER, *decision* 04 M5 / 01 TKT-9 (TKT-9 has no access check, C.1) | same |
| T16 | Note (private) | ADMIN, AGENT | AGENT, L2, ADMIN (+ END_USER via the Actions menu) | **NARROWER**, *defect avoided*: their "note" is emailed publicly (W1) | same |
| T17 | PRIVATE notes rendered | ADMIN, AGENT | AGENT, **L2**, ADMIN | **NARROWER** for L2, *defect avoided* (W2, §4) | `src/hooks/useTicketComments.ts:18`; `TicketDetailScreen.tsx:711` |
| T18 | History "added a comment" row for a note | ADMIN, AGENT | all | **NARROWER**, *defect avoided* (05 §A.7, W3) | `src/hooks/useTicketHistory.ts:47` |
| T19 | Conversation count | the visible comments only | none | MATCH (no leak; `_count.comments` is never shown) | `TicketDetailScreen.tsx:267-271` |
| T20 | Attachment count | all | all (Properties row) | MATCH, but the server's number includes note files (§5) | `TicketDetailScreen.tsx:270, :455` |
| T21 | Add files | all except a locked AGENT, who **now sees why** | all except a locked AGENT | MATCH (**fixed** per §3) | `TicketDetailScreen.tsx:345, :359-364` |
| T22 | Delete attachment | not built | AGENT, L2, ADMIN | **NARROWER**, *decision* P7 (Phase 2) | – |
| T23 | View / download | all | all | MATCH | `TicketDetailScreen.tsx` AttachmentRow |
| T24 | Tasks: tick, add, remove | AGENT, L2, ADMIN; no lock | all; no lock | **NARROWER** for END_USER, *decision* D4 | perm `editTasks`; `src/screens/tasks/TaskDetailScreen.tsx:163` |
| T25 | Task edit (title, due date, technician) | AGENT, L2, ADMIN; technician picker ADMIN, AGENT | no UI | N/A (M11 addition) | `src/screens/tasks/TaskEditorScreen.tsx:126, :197` |
| T26 | Submit for approval | none | all via the Actions menu (END_USER, L2 get 403); staff via the tab | **NARROWER**, *decision* (out of MVP, P16) | – |
| T27 | AI Summary / Draft reply | none | all | **NARROWER**, *defect avoided* (05 C.24: the summary leaks notes) | – |
| T28 | Print, Duplicate, Delete, Email technician, Problem/Change links, Tags | none | various | N/A (dead or out of scope, 05 B.33) | – |

### 2.5 Composer (M5), status sheet (M6), assign picker (M7)
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| C1 | Composer modes | END_USER: Reply. L2: Reply, Reply all. ADMIN, AGENT: + Private note | see T14–T16 | see T14–T16 | `src/screens/tickets/ReplyComposerScreen.tsx:39` → perm `composerPermissions` |
| C2 | To / CC chips | AGENT, L2, ADMIN (PUBLIC only) | all (PUBLIC only) | **NARROWER** for END_USER, *decision* 04 M5 | `ReplyComposerScreen.tsx:44` |
| C3 | Address suggestions (USR-3) | ADMIN, AGENT | – | MATCH 05 §A.5 (403 for others) | perm `suggestRecipients` |
| C4 | Canned responses | not built | all | N/A (P6) | – |
| C5 | Attach files to a reply or note | all, no lock | all, no lock | MATCH. Note files leak (§5) → §8 item 1 | `ReplyComposerScreen.tsx:173` |
| C6 | A PRIVATE post from END_USER or L2 | refused on the device, nothing sent | sent; the server makes it a PUBLIC email | stricter, correct | `src/api/comments.api.ts:25`; `src/hooks/usePostComment.ts:36` |
| S1 | Status sheet | AGENT, L2, ADMIN; map; locked reason | = T1, T2 | MATCH | `src/screens/tickets/StatusClosureScreen.tsx:203, :231-233` |
| A1 | Assign picker | ADMIN, AGENT; others see "Not available"; locked reason | = T6 | MATCH (L2 per T6) | `src/screens/tickets/AssignPickerScreen.tsx:47, :156` |

### 2.6 Create ticket (M8)
| # | Element | Mobile shows to | Web shows to | Verdict | Mobile source |
|---|---|---|---|---|---|
| CR1 | Title, description, category, files | all | all | MATCH | `src/screens/tickets/CreateTicketScreen.tsx` |
| CR2 | Impact, urgency | AGENT, L2, ADMIN | AGENT, L2, ADMIN | MATCH | `:128-129, :213` |
| CR3 | Group, Assign to | ADMIN, AGENT | AGENT, L2 (403, empty), ADMIN | **NARROWER** for L2, *defect avoided* | `:130-131, :221` |
| CR4 | Requester (raise on behalf) | ADMIN, AGENT | nobody | **WIDER**, *decision* 01 TKT-2 / 04 M8. The server accepts it from non-END_USER (`BE:tickets.controller.ts:190`). It conflicts with CLAUDE.md rule 6 → §8 item 4 | `:132, :221` |
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

**Totals**
- 84 rows.
- **30 mismatches:**
  - 3 WIDER: N1, N4, CR4.
  - 27 NARROWER:
    - **12 defect avoided:** H5, H6, T5, T6, T7, T16, T17, T18, T27, CR3, CR6, AP3.
    - **11 decisions:** H2, H4, L9, T3, T10, T15, T22, T24, T26, C2, CR5.
    - **4 UNDOCUMENTED:** T8, T9, T11, T12.
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
| `POST /tickets/:id/assign` is `agentOrAdmin` → 403 | L2, END_USER | Pick up, Assign, Reassign, Remove and Move to group are hidden. Bulk Pick up / Assign are hidden. The M7 screen refuses. `assertAssignment` refuses before sending | `BE:tickets.router.ts:20` → perm `moreActions`, `bulkActions`; `src/hooks/writeGuards.ts:76` |
| `GET /teams`, `GET /users/search` are `agentOrAdmin` → 403 | L2, END_USER | Create's Group and Assign to, M7, the task technician picker and recipient suggestions are all hidden. The queries are disabled for those roles | `BE:teams.router.ts:8`, `BE:users.router.ts:15` → `src/hooks/useLookups.ts:39, :74, :94` |
| `POST /approvals` is `agentOrAdmin` → 403 | L2, END_USER | Submit for approval is not offered to anyone | `BE:approvals.router.ts:8` |
| `DELETE /attachments/:id` → 403 | END_USER | Delete is not offered to anyone (P7) | `BE:attachments.controller.ts:149` |
| `GET /priority-matrix` is `agentOrAdmin` | L2, END_USER | Never called | `BE:priorityMatrix.router.ts:8` |
| **Silent** rewrite: note → PUBLIC email | L2, END_USER | Note hidden and refused on the device | `BE:comments.controller.ts:56` → perm `composerModes`; `comments.api.ts:25` |
| **Silent** no-op: `countryId` edit | L2 | Country edit is not offered (not built) | `BE:tickets.controller.ts:554-556` |
| **Silent** no-op: `PUT /tickets/:id {status}` | all | Status only goes through TKT-6 POST | 05 B.1 |

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

---

## 8. For Ronit to decide (not changed)

| # | Question | Recommendation |
|---|---|---|
| 1 | **Critical (§5).** Private-note files are visible to the requester. Should mobile stop offering attachments in Note mode until the backend fix ships? The composer's note text is misleading today | **Yes.** Hide the attachment picker in Note mode. In the meantime, change the text to: "Files are added to the ticket and the requester can see them." Raise §5 with the web team as part of A7 |
| 2 | Staff property editing on M4 was never built: category, impact/urgency, country, staff resolution (T8, T9, T11, T12). There is no recorded reason; the web offers it and 04's capability table lists it | Build it in Phase D with the §1.5 gates: impact/urgency for AGENT, L2, ADMIN; category and country for ADMIN, AGENT; AGENT lock on all except country. **First** narrow `UPDATE_KEYS_BY_ROLE.L2_MANAGER` in `src/api/tickets.api.ts:91-96`: it allows `categoryId` and `teamId`, which the web keeps read-only or 403s for L2. That is an API-layer change, so it needs your OK |
| 3 | END_USER country selector: the app hides it (D8); 05 §A.12 says "shown read-only" | Keep it hidden: END_USER always sends `countryId=`, so a country label would be wrong. Update the 05 §A.12 text to match |
| 4 | "Raise on behalf" (requester picker) for ADMIN and AGENT: not in the web UI, but in 01 TKT-2 and 04 M8. CLAUDE.md rule 6 says the UI offers only what the web offers | Keep it: it is the server's intended feature and SDP parity, and exposes nothing. Record the exception against rule 6 |
| 5 | 08 S1 (Approvals for END_USER/L2 approvers, Announcements for END_USER) is implemented on its *proposed* default | Confirm S1 as decided |
| 6 | Reply all and To/CC for END_USER: the web offers them, mobile does not (04 M5) | Keep: TKT-9 has no access check (C.1), and the server builds END_USER recipients |
| 7 | Hide vs disable leftovers: Pick up / Assign for a locked AGENT, and Pick up on your own ticket, are hidden rather than disabled | Keep. The lock reason is on the same screen, and `OptionSheet` has no disabled state. Revisit if UAT finds it confusing |
| 8 | Approval detail shows ticket context whenever TKT-3 returns 200. For AGENT that is always true, because TKT-3 is unscoped for AGENT (C.6) | Keep: the approver is designated for that ticket, and the 403 path takes over automatically once A7 scopes TKT-3 |
| 9 | 04 M3 says the Unassigned filter is "(staff)"; 08 §4.5 and the app say ADMIN and AGENT | Fix 04's wording to ADMIN, AGENT |
| 10 | The comment at `src/hooks/usePostComment.ts:51` says "END_USER and L2 never send recipients". L2 does send To/CC, and the server keeps them | Correct the comment. I left it because hooks with mutations were out of bounds for this pass |

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
