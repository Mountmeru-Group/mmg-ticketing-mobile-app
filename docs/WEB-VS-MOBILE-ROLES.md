# Web portal vs mobile app: who can do what

**Mount Meru Service Desk, 2026-10-20.** This is a presentation of the Phase D-pre role audit. The evidence, with file and line references, is in `docs/ROLE-MATRIX.md`; this document only reformats its findings.

## 1. How to read this

This document compares, one capability per row, what the **web portal** lets each role do with what the **mobile app** lets the same role do, for five personas: END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN. Each row carries one of these five status codes:

| Status | Meaning |
|---|---|
| ✅ SAME | Mobile matches the web for that role |
| ➕ MOBILE ONLY | Mobile allows it; the web does not |
| ❌ NOT BUILT | The web allows it; mobile does not. A genuine gap |
| ⊘ OUT OF SCOPE | Deliberately left out of mobile (reports, admin and similar) |
| 🔒 SAFER | Mobile hides something that fails, returns an error or exposes data on the web |

## 2. Summary by role

| Role | Capabilities on web | Capabilities on mobile | % parity | Genuine gaps |
|---|---|---|---|---|
| END_USER | 44 | 37 | 90% | 3: priority/category/date filter, reply templates, service catalogue |
| AGENT | 76 | 64 | 80% | 11: all of section 4 |
| triage AGENT | 75 | 64 | 80% | 11: all of section 4 |
| L2_MANAGER | 55 | 47 | 84% | 6: impact/urgency, staff resolution edit, delete a file, priority/category/date filter, reply templates, service catalogue |
| ADMIN | 77 | 64 | 80% | 11: all of section 4 |

- **Capabilities** is the number of rows in section 3 that the role can use. A web control that only gives that role an error is not counted.
- **% parity** is the share of the role's web capabilities that mobile also offers, leaving out the ones mobile skips on purpose (⊘ and 🔒). What remains is exactly the genuine gaps. If the deliberate exclusions are counted as misses too, every role is at 58–60%.
- The mobile count includes things only mobile offers (➕), so it is not a subset of the web count.

## 3. Main table: 105 capabilities

| ✅ SAME | ➕ MOBILE ONLY | ❌ NOT BUILT | ⊘ OUT OF SCOPE | 🔒 SAFER | Total |
|---|---|---|---|---|---|
| 35 | 21 | 11 | 21 | 17 | **105** |

**Key to the "who can" columns**
- **All roles** means END_USER, AGENT (plain and triage), L2_MANAGER and ADMIN.
- **AGENT** means every AGENT. A **triage AGENT** has no fixed country and can switch between countries. A **plain AGENT** is fixed to one country. Rows name them separately only where they differ.
- **AGENT (lock)** means an AGENT cannot do this once the ticket is closed or canceled. The lock is identical on web and mobile.
- **(L2_MANAGER: error)** in the web column means the web shows that role the control, but it fails. That role is not counted as "can".
- ROLE-MATRIX.md audits 84 screen elements. Here some of them are split into separate capabilities and the web-only modules are added, which gives 105 rows.

### Tickets

**The ticket list**

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| See your ticket list | All roles | All roles | ✅ SAME | Requesters see their own tickets; staff see their queue. The server decides. |
| Search and sort the list | All roles | All roles | ✅ SAME | Mobile has three sort orders: last updated, priority, due date. |
| Filter by status | All roles | All roles | ✅ SAME | A drop-down on the web; named filters (Open, Pending, Resolved, Closed) on mobile. |
| Quick filters "My open", "Overdue", "Due soon" | Nobody | All roles | ➕ MOBILE ONLY | |
| Filter to unassigned tickets | Nobody | ADMIN, AGENT | ➕ MOBILE ONLY | A plain AGENT sees the unassigned tickets in their own groups. |
| Filter by technician or group | ADMIN, AGENT (END_USER, L2_MANAGER: error) | Nobody | ❌ NOT BUILT | |
| Filter by priority, category or date | All roles | Nobody | ❌ NOT BUILT | |
| Export the list to a spreadsheet | All roles | Nobody | ⊘ OUT OF SCOPE | |
| Saved views | All roles | Nobody | ⊘ OUT OF SCOPE | |
| Switch the country filter (any country or "All") | ADMIN, triage AGENT | ADMIN, triage AGENT | ✅ SAME | L2_MANAGER has no country filter on either. |
| Country filter fixed to your own country | plain AGENT | plain AGENT | ✅ SAME | Shown with a lock. |
| See your country filter, read-only | END_USER | Nobody | ⊘ OUT OF SCOPE | Mobile always shows a requester all of their own tickets. |
| Change status from the ticket list | Nobody | ADMIN, AGENT (lock), L2_MANAGER | ➕ MOBILE ONLY | Same rules as on the ticket itself. |

**Raising a ticket**

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Create a ticket (title, description, category, files) | All roles | All roles | ✅ SAME | |
| Set impact and urgency when creating | ADMIN, AGENT, L2_MANAGER | ADMIN, AGENT, L2_MANAGER | ✅ SAME | |
| See the priority a new ticket will get, before saving | ADMIN, AGENT (L2_MANAGER: error) | Nobody | ❌ NOT BUILT | |
| Choose the group and technician when creating | ADMIN, AGENT (L2_MANAGER: error) | ADMIN, AGENT | 🔒 SAFER | On the web L2_MANAGER's lists come back empty. |
| Raise a ticket on someone else's behalf | Nobody | ADMIN, AGENT | ➕ MOBILE ONLY | The server supports it; the web form never offers it. Awaiting Ronit's confirmation. |
| Set mode, level and source when creating | ADMIN, AGENT, L2_MANAGER | Nobody | ⊘ OUT OF SCOPE | |
| AI assistant while creating | All roles | Nobody | 🔒 SAFER | |
| Tell a requester how their ticket will be routed | END_USER | END_USER | ✅ SAME | |

**Working on a ticket**

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Open a ticket and read it | All roles | All roles | ✅ SAME | Description, properties, requester, history. |
| Change status with the allowed buttons | ADMIN, AGENT (lock), L2_MANAGER | ADMIN, AGENT (lock), L2_MANAGER | ✅ SAME | Same transition rules on both. |
| Change status to any status from a drop-down | ADMIN, AGENT (lock), L2_MANAGER | Nobody | 🔒 SAFER | Skips the transition rules. |
| Resolve, close or cancel, with the closure form | ADMIN, AGENT (lock), L2_MANAGER | ADMIN, AGENT (lock), L2_MANAGER | ✅ SAME | Resolution and closure comments are required on both. |
| Pick up a ticket (assign it to yourself) | ADMIN, AGENT (lock) (L2_MANAGER: error) | ADMIN, AGENT (lock) | 🔒 SAFER | Mobile also hides it when the ticket is already yours. |
| Assign, reassign or unassign a technician | ADMIN, AGENT (lock) (L2_MANAGER: error) | ADMIN, AGENT (lock) | 🔒 SAFER | |
| Move a ticket to another group | ADMIN, AGENT (lock) (L2_MANAGER: error) | ADMIN, AGENT (lock) | 🔒 SAFER | |
| Change category | ADMIN, AGENT (lock) | Nobody | ❌ NOT BUILT | L2_MANAGER sees it read-only on the web. |
| Change impact and urgency | ADMIN, AGENT (lock), L2_MANAGER | Nobody | ❌ NOT BUILT | Together they set the priority and the SLA deadline. |
| See impact and urgency | All roles | ADMIN, AGENT, L2_MANAGER | ⊘ OUT OF SCOPE | Requesters see them read-only on the web. |
| Change the requester's country on a ticket | ADMIN, AGENT (L2_MANAGER: not saved) | Nobody | ❌ NOT BUILT | On the web L2_MANAGER gets a success message, but nothing is saved. |
| Edit the resolution (staff) | ADMIN, AGENT, L2_MANAGER | Nobody | ❌ NOT BUILT | Read-only on mobile. |
| Edit the resolution (requester) | END_USER | Nobody | 🔒 SAFER | |
| See the priority | All roles | All roles | ✅ SAME | Nobody edits it; it follows impact and urgency. Staff see an "Auto" label. |
| Submit a ticket for approval | ADMIN, AGENT (END_USER, L2_MANAGER: error) | Nobody | ❌ NOT BUILT | |
| AI summary and AI draft reply | All roles | Nobody | 🔒 SAFER | |
| Print, duplicate, delete, "email the technician", tags, link to a problem or change | All roles (some staff only) | Nobody | ⊘ OUT OF SCOPE | Most of these do nothing on the web. |
| Request a service from the catalogue | All roles | Nobody | ❌ NOT BUILT | The web's "Requests" tab. Planned for Phase 2. |

### Comments

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Reply to the requester (public reply) | All roles | All roles | ✅ SAME | |
| Reply all (everyone on the email thread) | All roles | ADMIN, AGENT, L2_MANAGER | ⊘ OUT OF SCOPE | |
| Choose the To and Cc addresses | All roles | ADMIN, AGENT, L2_MANAGER | ⊘ OUT OF SCOPE | |
| Address suggestions while typing | ADMIN, AGENT | ADMIN, AGENT | ✅ SAME | The server refuses other roles, so mobile never asks for them. |
| Write an internal (private) note | ADMIN, AGENT (L2_MANAGER, END_USER: sent as a public email) | ADMIN, AGENT | 🔒 SAFER | Mobile also refuses it on the phone for those roles. See 7.2. |
| Read internal notes | ADMIN, AGENT, L2_MANAGER | ADMIN, AGENT | 🔒 SAFER | The web shows them to L2_MANAGER by mistake. |
| History line "added a comment" for an internal note | All roles | ADMIN, AGENT | 🔒 SAFER | |
| Conversation count on the ticket | Nobody | All roles | ➕ MOBILE ONLY | Counts only the replies that person may see. |
| Reply templates (canned responses) | All roles | Nobody | ❌ NOT BUILT | Planned for Phase 2. |
| Attach files to a reply | All roles | All roles | ✅ SAME | |
| Attach files to an internal note | ADMIN, AGENT | ADMIN, AGENT | ✅ SAME | ⚠ The requester can see these files. See 7.1. |

### Attachments

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Add files to a ticket | All roles; AGENT (lock) | All roles; AGENT (lock) | ✅ SAME | Mobile tells a locked AGENT why they cannot. |
| View or download a file | All roles | All roles | ✅ SAME | |
| Download all files as one zip | All roles | Nobody | ⊘ OUT OF SCOPE | |
| Delete a file | ADMIN, AGENT, L2_MANAGER | Nobody | ❌ NOT BUILT | Planned for Phase 2. |
| See how many files a ticket has | All roles | All roles | ✅ SAME | The number includes files on internal notes. See 7.1. |

### Tasks

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| See a ticket's tasks | All roles | All roles | ✅ SAME | |
| Add, tick off or remove tasks | All roles | ADMIN, AGENT, L2_MANAGER | 🔒 SAFER | Read-only for requesters on mobile. |
| Edit a task's title, description and due date | Nobody | ADMIN, AGENT, L2_MANAGER | ➕ MOBILE ONLY | |
| Assign a task to a technician | Nobody | ADMIN, AGENT | ➕ MOBILE ONLY | L2_MANAGER cannot load the technician list. |
| Task list across all tickets | Nobody | All roles | ➕ MOBILE ONLY | "Assigned to me" filter for staff; read-only for requesters. |

### Approvals

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| See my pending approvals | ADMIN, AGENT | All roles (END_USER, L2_MANAGER: only while something waits for them) | ➕ MOBILE ONLY | On the web the others reach the page only by typing its address. Awaiting Ronit's confirmation. |
| Approve or reject | All roles (the named approver only) | All roles (the named approver only) | ✅ SAME | Web: Approvals page or the ticket. Mobile: the Approvals inbox. |
| Rejecting requires a reason | All roles | All roles | ✅ SAME | |
| See everyone's approvals | ADMIN, AGENT | Nobody | 🔒 SAFER | |
| See the ticket behind an approval | Nobody | All roles | ➕ MOBILE ONLY | Only when the person is allowed to open that ticket. |

### Notifications

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Alerts: list, mark read, mark all read, open the ticket | All roles | All roles | ✅ SAME | |
| Unread alerts badge | Nobody | All roles | ➕ MOBILE ONLY | |
| Read announcements | ADMIN, AGENT, L2_MANAGER | All roles | ➕ MOBILE ONLY | The server sends each role only the announcements meant for it. Awaiting Ronit's confirmation. |
| Announcement banner on the Home screen | Nobody | All roles | ➕ MOBILE ONLY | |
| Create or delete announcements | ADMIN | Nobody | ⊘ OUT OF SCOPE | |

### Knowledge Base

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Browse, search and read articles | All roles | All roles | ✅ SAME | |
| Vote "Was this helpful?" | All roles | All roles | ✅ SAME | |
| Write, edit or delete articles; see drafts | ADMIN, AGENT | Nobody | ⊘ OUT OF SCOPE | |

### Profile

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Edit your own name, phone, department and time zone | Nobody | All roles | ➕ MOBILE ONLY | The web has no profile page. |
| Choose a light or dark theme | Nobody | All roles | ➕ MOBILE ONLY | |
| Sign out | All roles | All roles | ✅ SAME | |

### Navigation

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Bottom tab bar | All roles | All roles | ✅ SAME | Web: Dashboard, Tickets, Alerts, Knowledge, Requests. Mobile: Home, Tickets, Alerts. |
| Main menu | All roles | All roles | ✅ SAME | Its items differ by role; each one is compared in its own row. |
| Country lock label in the menu | plain AGENT | plain AGENT | ✅ SAME | |
| Open a ticket from an email link | All roles | All roles | ✅ SAME | |
| Open a page your role isn't meant to use, by typing its address | END_USER, AGENT, L2_MANAGER | Nobody | 🔒 SAFER | Each mobile screen checks the role. |

### Dashboard

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Self-service portal (raise a ticket, recent tickets, search help) | All roles | All roles | ✅ SAME | On mobile it is the requester's Home screen and the Knowledge base. |
| Raise a ticket from the Home screen | All roles | All roles | ✅ SAME | |
| Requester's open and resolved counts | END_USER | END_USER | ✅ SAME | |
| Requester's other counts (total, in progress, SLA breached) | END_USER | Nobody | ⊘ OUT OF SCOPE | |
| Staff counts: open, in progress, on hold, SLA breached, active | ADMIN, AGENT | ADMIN, AGENT | ✅ SAME | |
| Counts for L2_MANAGER | L2_MANAGER | Nobody | 🔒 SAFER | Mobile shows the tiles without numbers. |
| Unassigned count | ADMIN, AGENT, L2_MANAGER | ADMIN, triage AGENT | 🔒 SAFER | |
| Closed count and pending-reason counts | ADMIN, AGENT, L2_MANAGER | Nobody | ⊘ OUT OF SCOPE | |
| Charts, technician and team tables, trends, workload | ADMIN, AGENT, L2_MANAGER | Nobody | 🔒 SAFER | |
| Recent tickets | All roles | All roles | ✅ SAME | |
| Shortcuts to "My open" and "Due soon" | Nobody | ADMIN, AGENT, L2_MANAGER | ➕ MOBILE ONLY | |
| Pending approvals tile | Nobody | ADMIN, AGENT; END_USER, L2_MANAGER while something waits for them | ➕ MOBILE ONLY | |

### Bulk actions

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Select several tickets at once | Nobody | ADMIN, AGENT, L2_MANAGER | ➕ MOBILE ONLY | Up to 20 at a time. |
| Bulk pick up | Nobody | ADMIN, AGENT | ➕ MOBILE ONLY | |
| Bulk assign | Nobody | ADMIN, AGENT | ➕ MOBILE ONLY | |
| Bulk close | Nobody | ADMIN, AGENT, L2_MANAGER | ➕ MOBILE ONLY | Skips any ticket the person could not close on its own. |

### Admin

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Reports, query builder, scheduled reports | ADMIN, AGENT, L2_MANAGER | Nobody | ⊘ OUT OF SCOPE | |
| Kanban board | ADMIN, AGENT, L2_MANAGER | Nobody | ⊘ OUT OF SCOPE | |
| Problem and change management | ADMIN, AGENT | Nobody | ⊘ OUT OF SCOPE | |
| Asset management | ADMIN, AGENT | Nobody | ⊘ OUT OF SCOPE | |
| Purchase orders | ADMIN, AGENT | Nobody | ⊘ OUT OF SCOPE | |
| Projects | ADMIN, AGENT | Nobody | ⊘ OUT OF SCOPE | |
| Surveys | ADMIN | Nobody | ⊘ OUT OF SCOPE | |
| Admin settings (users, teams, categories, SLAs and more) | ADMIN | Nobody | ⊘ OUT OF SCOPE | |

## 4. Genuine gaps: what mobile cannot do that the web can

The gaps are ranked by how much each one matters day to day. Each one uses an endpoint the backend already has, so none of them needs backend work.

| # | Gap | What it is | Roles that lose it | Endpoint the app would call | Effort |
|---|---|---|---|---|---|
| 1 | Change impact and urgency | Re-classify a ticket after it is logged. Impact and urgency set its priority and its SLA deadline, so technicians do this often. | ADMIN, AGENT, L2_MANAGER | Update ticket, `PUT /tickets/:id` (TKT-4). The app's update call already accepts these fields; only the screen is missing. | Small |
| 2 | Change category | Move a ticket to the right category, sub-category and item when the requester picked the wrong one. | ADMIN, AGENT | Update ticket (TKT-4), plus the category list `GET /categories` (LKP-1), which Create already uses. | Medium: a three-level picker, and the server may re-assign the ticket afterwards, so the screen must refresh and say so |
| 3 | Reply templates (canned responses) | Insert a saved reply instead of typing it. | All roles (the Phase 2 plan offers it to staff only) | `GET /canned-responses` (LKP-7) | Small |
| 4 | Filter by technician or group | See one technician's or one group's tickets, for example to balance the queue. | ADMIN, AGENT | Ticket list `GET /tickets` with technician or group (TKT-1), plus the group list (LKP-2) and people search (USR-3), which the app already loads | Small to medium |
| 5 | Filter by priority, category or date | Narrow the list to urgent tickets, one category, or this week. | All roles | Ticket list `GET /tickets` with priority, category and from/to dates (TKT-1) | Small |
| 6 | Edit the resolution (staff) | Correct the resolution text after a ticket was resolved or closed. | ADMIN, AGENT, L2_MANAGER | Update ticket (TKT-4) with the resolution | Small |
| 7 | Request a service from the catalogue | Order a standard service (a laptop, an account) from a catalogue instead of writing a free-text ticket. | All roles | Service catalogue, SCR-1 to SCR-6 | Large: each catalogue item brings its own form. Held for Phase 2 by decision |
| 8 | Delete a file | Remove a file uploaded by mistake. | ADMIN, AGENT, L2_MANAGER | Delete attachment, `DELETE /tickets/:id/attachments/:attachmentId` (ATT-5) | Small |
| 9 | Submit a ticket for approval | Ask a manager to approve a ticket before work continues. | ADMIN, AGENT | `POST /approvals`. The route exists on the server but is not yet listed in the mobile API contract, so adding it needs Ronit's sign-off | Medium |
| 10 | Change the requester's country on a ticket | Fix the country when a ticket was logged against the wrong one. | ADMIN, AGENT | Update ticket (TKT-4) with the country, plus the country list (LKP-5), which the app already loads | Small |
| 11 | See the priority before saving a new ticket | Preview the priority while choosing impact and urgency. | ADMIN, AGENT | Priority matrix, `GET /priority-matrix` (LKP-6) | Small |

**One prerequisite, mobile-side only.** Before gaps 1, 2, 6 and 10 are built, the app's own update call needs tightening. Today it would let an L2_MANAGER send a category or group change, and the web allows neither. This is a change to the mobile app, not the backend, and it needs Ronit's OK (ROLE-MATRIX.md §8, item 2).

## 5. Where mobile is safer than the web

Each of these is deliberate: on the web the control fails, returns an error, or shows something it should not.

| Capability | Why mobile hides it |
|---|---|
| Choose the group and technician when creating | The web shows L2_MANAGER group and technician pickers that the server refuses to fill, so they are always empty. |
| AI assistant while creating | On the web it lets a requester pick the team and the technician, which the normal form deliberately prevents. |
| Change status to any status from a drop-down | The web drop-down lists every status and ignores the transition rules. ADMIN and L2_MANAGER can even move a closed ticket to any status. Mobile offers only the rule-based buttons. |
| Pick up a ticket | The web shows L2_MANAGER a Pick up button that the server always refuses. |
| Assign, reassign or unassign a technician | The web shows L2_MANAGER Assign, Reassign and Remove controls that the server always refuses. |
| Move a ticket to another group | The web shows L2_MANAGER a group selector that the server always refuses. |
| Edit the resolution (requester) | The web lets a requester rewrite the technician's resolution on their own ticket. |
| AI summary and AI draft reply | The web's AI summary is built from every comment, internal notes included, so it can show a requester what staff wrote privately. The server does not check who asks for a draft reply either. |
| Write an internal (private) note | On the web an L2_MANAGER, or a requester using the Actions menu, can write what looks like an internal note, but the server sends it as a public email (7.2). Mobile does not offer it to those roles and refuses it on the phone. |
| Read internal notes | L2_MANAGER is not meant to see internal notes, and the server's main comment feed hides them. One web screen reads a different feed that includes them. |
| History line "added a comment" for an internal note | On the web it tells a requester that internal notes exist on their ticket. |
| Add, tick off or remove tasks | The web lets a requester add, tick off or delete the service desk's tasks, and the server does not check who is asking. |
| See everyone's approvals | The server does not limit that list to the person asking, so it shows other people's approvals. |
| Open a page your role isn't meant to use | The web has no page-level checks: anyone signed in can open any page by typing its address, admin pages included. |
| Counts for L2_MANAGER | The server keeps one set of numbers for all L2 managers, so one manager can see another's counts. |
| Unassigned count | For anyone other than ADMIN or a triage AGENT, the server's count includes tickets outside that person's queue. |
| Charts, technician and team tables, trends, workload | Several of these widgets ignore the person's scope on the server and show organisation-wide numbers. |

## 6. Out of scope by design

| Capability | Why mobile skips it |
|---|---|
| Export the list to a spreadsheet | It builds a file by paging through every ticket: desk work, not phone work. |
| Saved views | Desktop filter sets; mobile uses fixed quick filters instead. |
| See your country filter, read-only | Mobile always shows a requester every ticket they raised, whatever the country, so a country label would be wrong. |
| Set mode, level and source when creating | The server throws away mode and level on a new ticket, and mobile sets the source itself. |
| See impact and urgency (requester) | Classification is a service-desk field, so by decision mobile shows it to staff only. |
| Print, duplicate, delete, "email the technician", tags, link to a problem or change | On the web, delete and "email the technician" send nothing and duplicate reopens the same ticket. The problem and change links call server routes that do not exist. Printing is desk work. |
| Reply all | The server lookup behind it has no access check. For a requester, the server already chooses who receives the reply. |
| Choose the To and Cc addresses | For a requester the server chooses the recipients itself, so mobile does not ask for addresses. |
| Download all files as one zip | Not allowed by the mobile API contract: an error during a zip download can crash the server for everyone. |
| Create or delete announcements | Administration; it stays on the web. |
| Write, edit or delete articles; see drafts | Rich-text writing with embedded images, and publishing is broken on the web. |
| Requester's other counts | The phone Home screen keeps to a short, fixed set of counts; the full set stays on the web dashboard. |
| Closed count and pending-reason counts | Same: the phone Home screen keeps to a short, fixed set of counts. |
| Reports, query builder, scheduled reports | Wide charts, exports and report scheduling: desk analysis. |
| Kanban board | Drag-and-drop doesn't suit a phone, and on the web the status change it makes is never saved. |
| Problem and change management | Back-office service-management work done at a desk. |
| Asset management | Wide tables and forms. A simple asset lookup is planned for later. |
| Purchase orders | Line-item editing in wide tables. |
| Projects | Gantt charts and project planning. |
| Surveys | Never sent automatically, and the web's response page doesn't work. |
| Admin settings | Bulk configuration that affects everyone; it stays on the web. |

## 7. Security findings: backend, not ours to fix

The audit found two problems in the backend. **The mobile app does not cause either of them, and it cannot fully prevent either of them.** Only the backend team can fix them. They are reported here for awareness, not as a request for work.

### 7.1 Files attached to an internal note are visible to the requester (Critical)

- **What happens:** when a technician attaches a file to an internal (private) note, the server stores it as an ordinary ticket file. The requester can see it in the ticket's attachments, open it and download it. The ticket's file count includes it, and the ticket history sent to the requester's device carries its file name.
- **Who is affected:**
  - every requester (END_USER), on their own tickets;
  - L2_MANAGERs, who are not meant to see internal notes.

  It happens on the web portal exactly as on mobile.
- **Why the app cannot fix it:** the server gives such a file nothing that marks it as belonging to a note, so the app cannot tell it apart from a file the requester uploaded. Hiding files on the phone would still leave them open on the web and through a direct download.
- **What mobile can do:** stop staff attaching files to notes in the app, so the app adds no new cases. This is a pending decision for Ronit. It does not protect files attached to notes on the web.

### 7.2 A web "internal note" can be emailed to the requester (High)

- **What happens:** on the web portal, an L2_MANAGER sees an "internal note" option, and every role, requesters included, sees "Add Note" in the Actions menu. When an L2_MANAGER or a requester uses them, the server quietly turns the note into a public reply. It then emails the reply to the requester and to everyone on the ticket's email thread.
- **Who is affected:** everyone who receives that email gets text its author believed was internal. Only L2_MANAGERs and requesters can trigger it, through those web controls.
- **Mobile:** does not offer a note to those roles, and refuses one on the phone if it is ever attempted, so the app cannot trigger this. It cannot stop it happening on the web.
