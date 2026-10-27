# Web portal vs mobile app: who can do what

**Final state, 2026-10-22 (Phases G1–G5).** G1 built ticket property editing (impact and urgency with the priority preview, category, country, resolution); G2 the list's priority, category, date, technician and group filters; G3 reply templates, deleting a file and submitting a ticket for approval; G4 the service catalogue; G5 the priority preview on the create form, settled My Requests against the web (staff see every request, as on the web), re-audited every G1–G4 element, and traced six workflows end to end. **No ❌ NOT BUILT row remains: every role is at 100% parity** (section 2). What mobile still does differently is deliberate and listed with its reason: section 5 (safer), section 6 (out of scope), section 8 (workflow steps).

**2026-10-27: the technician can also be changed inline on the ticket** ("Change technician" in Properties, beside the impact/urgency, category and country editors). This is placement, not a new capability: the same roles and the same AGENT lock as "Assign…", through the same request. **No row was added and no figure in sections 2 and 3 changed.** See the assignment row in section 3.

**Setu (Mount Meru Service Desk until 2026-10-23), 2026-10-20; updated 2026-10-22 for Phases G1, G2, G3, G4 and G5.** This is a presentation of the Phase D-pre role audit. The evidence, with file and line references, is in `docs/ROLE-MATRIX.md`; this document only reformats its findings. Phase G1 built ticket property editing: impact and urgency, category, country (ADMIN and triage AGENT) and the staff resolution edit. The web's behaviour for those fields, with sources, is in `docs/G1-WEB-BEHAVIOUR.md`. Phase G2 built the ticket list's priority, category, date, technician and group filters (web behaviour: `docs/G2-WEB-FILTERS.md`) and applied three decisions: priority is now sent with an impact/urgency change as on the web, the country stays locked for a plain AGENT, and L2_MANAGER's update call can no longer carry a category or group. Phase G3 built reply templates, deleting a file and submitting a ticket for approval, each as the web does it (web behaviour: `docs/G3-WEB-BEHAVIOUR.md`). Phase G4 built the service catalogue: browsing, the request form with every field type the web renders, and My Requests (web behaviour: `docs/G4-WEB-CATALOGUE.md`). Phase G5 added the create form's priority preview (the web's `CreateTicketPage.tsx:49-76, :368-387`), made My Requests list every request for staff as the web does, and re-ran the role audit over G1–G4 (`docs/ROLE-MATRIX.md` §14).

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
| END_USER | 46 | 43 | 100% | none |
| AGENT | 80 | 79 | 100% | none |
| triage AGENT | 79 | 80 | 100% | none |
| L2_MANAGER | 59 | 58 | 100% | none |
| ADMIN | 82 | 80 | 100% | none |

- **Capabilities** is the number of rows in section 3 that the role can use. A web control that only gives that role an error is not counted.
- **% parity** is the share of the role's web capabilities that mobile also offers, leaving out the ones mobile skips on purpose (⊘ and 🔒) for that role. What remains is exactly the genuine gaps. If the deliberate exclusions are counted as misses too, the roles are at 67–76% (END_USER 67%, L2_MANAGER 71%, ADMIN 73%, AGENT 74%, triage AGENT 76%).
- **Is anything still ❌ NOT BUILT? No.** G5 built the last row, "See the priority a new ticket will get, before saving" (gap 11). Every web capability is now on mobile, or left out on purpose with its reason in section 5 or 6.
- **Before G5** (after G4, 2026-10-22): END_USER 43 on mobile, 100%, no gap; AGENT 77, 98%, 1 gap; triage AGENT 78, 98%, 1; L2_MANAGER 57, 100%, none; ADMIN 78, 98%, 1. With the exclusions counted as misses, 67–73%. G5 moved two rows to ✅ SAME: the create form's priority preview (❌ → ✅, ADMIN and AGENT) and everyone's requests under My Requests (🔒 → ✅, ADMIN, AGENT and L2_MANAGER).
- **Before G4** (after G3, 2026-10-22): END_USER 39 on mobile, 97%, 1 gap; AGENT 72, 96%, 2; triage AGENT 73, 96%, 2; L2_MANAGER 52, 97%, 1; ADMIN 73, 96%, 2. With the exclusions counted as misses, 64–72%. G4 replaced the one catalogue row (❌) with seven: four ✅ SAME, one ➕ MOBILE ONLY (a request's detail), one 🔒 SAFER (everyone's requests under My Requests) and one ⊘ OUT OF SCOPE (creating templates).
- **Before G3** (after G2, 2026-10-22): END_USER 38 on mobile, 93%, 2 gaps; AGENT 69, 91%, 5; triage AGENT 70, 91%, 5; L2_MANAGER 50, 92%, 3; ADMIN 70, 91%, 5. With the exclusions counted as misses, 61–68%. G3 moved three rows to ✅ SAME: reply templates (every role), delete a file (ADMIN, AGENT, L2_MANAGER) and submit for approval (ADMIN, AGENT).
- **Before G2** (after G1, 2026-10-22): END_USER 37 on mobile, 90%, 3 gaps; AGENT 67, 86%, 8; triage AGENT 68, 88%, 7; L2_MANAGER 49, 89%, 4; ADMIN 68, 88%, 7. With the exclusions counted as misses, 59–65%. G2 moved the two filter rows to ✅ SAME, and the plain AGENT's country row to ⊘ OUT OF SCOPE because Ronit decided it stays locked.
- **Before G1** (2026-10-20): AGENT 64 on mobile, 80%, 11 gaps; triage AGENT 64, 80%, 11; L2_MANAGER 47, 84%, 6; ADMIN 64, 80%, 11; END_USER unchanged. With the exclusions counted as misses, 58–60%.
- The mobile count includes things only mobile offers (➕), so it is not a subset of the web count.
- The figures were recounted from the section 3 table by script, which reproduces the published pre-G2 figures exactly. For G3 the script was rebuilt and first run on the pre-G3 table, where it reproduced every published figure (106 rows; 41, 21, 5, 22, 17; each role's counts, parity and gaps), before the three rows were changed. For G4 it was rebuilt again and first run on the pre-G4 table, where it reproduced every published figure (106 rows; 44, 21, 2, 22, 17; each role's counts, parity, gaps and the 64–72% range) before any row was changed. For G5 it was rebuilt once more and first run on the pre-G5 table, where it reproduced every published figure (112 rows; 48, 22, 1, 23, 18; each role's counts, parity, gaps and the 67–73% range) before the two rows were changed.

## 3. Main table: 112 capabilities

| ✅ SAME | ➕ MOBILE ONLY | ❌ NOT BUILT | ⊘ OUT OF SCOPE | 🔒 SAFER | Total |
|---|---|---|---|---|---|
| 50 | 22 | 0 | 23 | 17 | **112** |

Before G5: 48 SAME, 22 MOBILE ONLY, 1 NOT BUILT, 23 OUT OF SCOPE, 18 SAFER. G5 moved the create form's priority preview from ❌ to ✅ and everyone's requests under My Requests from 🔒 to ✅.
Before G4: 44 SAME, 21 MOBILE ONLY, 2 NOT BUILT, 22 OUT OF SCOPE, 17 SAFER, 106 rows. G4 replaced the catalogue row with the seven rows of "Service catalogue".
Before G3: 41 SAME, 5 NOT BUILT. G3 moved reply templates, delete a file and submit for approval to ✅ SAME.
Before G2: 39 SAME, 8 NOT BUILT, 21 OUT OF SCOPE. G2 moved the two filter rows to ✅ SAME and the plain AGENT's country row to ⊘ OUT OF SCOPE (decided: it stays locked). The 17 🔒 SAFER rows are unchanged.
Before G1: 35 SAME, 11 NOT BUILT, 105 rows. G1 moved four rows to ✅ SAME and split the country row in two, because mobile now treats the triage AGENT and the plain AGENT differently there.

**Key to the "who can" columns**
- **All roles** means END_USER, AGENT (plain and triage), L2_MANAGER and ADMIN.
- **AGENT** means every AGENT. A **triage AGENT** has no fixed country and can switch between countries. A **plain AGENT** is fixed to one country. Rows name them separately only where they differ.
- **AGENT (lock)** means an AGENT cannot do this once the ticket is closed or canceled. The lock is identical on web and mobile.
- **(L2_MANAGER: error)** in the web column means the web shows that role the control, but it fails. That role is not counted as "can".
- ROLE-MATRIX.md audits 94 screen elements. Here some of them are split into separate capabilities and the web-only modules are added, which gives 112 rows.

### Tickets

**The ticket list**

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| See your ticket list | All roles | All roles | ✅ SAME | Requesters see their own tickets; staff see their queue. The server decides. |
| Search and sort the list | All roles | All roles | ✅ SAME | Mobile has three sort orders: last updated, priority, due date. |
| Filter by status | All roles | All roles | ✅ SAME | A drop-down on the web; named filters (Open, Pending, Resolved, Closed) on mobile. |
| Quick filters "My open", "Overdue", "Due soon" | Nobody | All roles | ➕ MOBILE ONLY | |
| Filter to unassigned tickets | Nobody | ADMIN, AGENT | ➕ MOBILE ONLY | A plain AGENT sees the unassigned tickets in their own groups. |
| Filter by technician or group | ADMIN, AGENT (END_USER, L2_MANAGER: error) | ADMIN, AGENT | ✅ SAME | In the Filters sheet. The web shows END_USER and L2_MANAGER these two lists, always empty; mobile leaves them out. Technicians are found by name (the web lists its first 100). Built in G2. |
| Filter by priority, category or date | All roles | All roles | ✅ SAME | In the Filters sheet, combined with the quick filters, search and sort. As on the web, the category filter lists top-level categories and skips tickets filed under their sub-categories, and the date is the day the ticket was created. Built in G2. |
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
| See the priority a new ticket will get, before saving | ADMIN, AGENT (L2_MANAGER: error) | ADMIN, AGENT | ✅ SAME | Recomputed whenever impact or urgency changes, from the priority matrix, as on the web: "Auto-computed from Impact × Urgency", or "Set Impact and Urgency above to compute priority". Nobody picks the priority by hand on either side. It is the box from the ticket's impact/urgency editor (G1), reused. L2_MANAGER's web box never computes (the matrix is a 403 for L2); mobile tells L2 the Service Desk sets it. Built in G5. |
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
| Assign, reassign or unassign a technician | ADMIN, AGENT (lock) (L2_MANAGER: error) | ADMIN, AGENT (lock) | 🔒 SAFER | Two places since 2026-10-27: "Assign…" in More options, and **also inline**: "Change technician" on the Technician row in Properties, with Save and Cancel like the other property editors (the web has its own panel there too). **This is placement, not capability: the parity figures do not change.** The same roles, the same AGENT lock, the same list of technicians and the same request (POST /tickets/:id/assign). L2_MANAGER and END_USER see the technician with no link. Details: `ROLE-MATRIX.md` §15. |
| Move a ticket to another group | ADMIN, AGENT (lock) (L2_MANAGER: error) | ADMIN, AGENT (lock) | 🔒 SAFER | |
| Change category | ADMIN, AGENT (lock) | ADMIN, AGENT (lock) | ✅ SAME | Three levels; changing a level clears the ones below. L2_MANAGER sees it read-only on both. The server may re-route the ticket, and mobile says so. Built in G1. |
| Change impact and urgency | ADMIN, AGENT (lock), L2_MANAGER | ADMIN, AGENT (lock), L2_MANAGER | ✅ SAME | Together they set the priority and the SLA deadline. Mobile shows ADMIN and AGENT the resulting priority before Save; the web saves on selection, then shows it. Since G2, ADMIN and AGENT send that priority with the change, as the web does, so the requester and the technician get the "priority changed" email. Built in G1. |
| See impact and urgency | All roles | ADMIN, AGENT, L2_MANAGER | ⊘ OUT OF SCOPE | Requesters see them read-only on the web. |
| Change the ticket's country: ADMIN, triage AGENT | ADMIN, triage AGENT | ADMIN, triage AGENT | ✅ SAME | In any status, as on the web. On the web L2_MANAGER gets a success message, but nothing is saved; mobile shows L2_MANAGER the value only. Built in G1. |
| Change the ticket's country: plain AGENT | plain AGENT | Nobody | ⊘ OUT OF SCOPE | Mobile shows the value with a lock reason. The web lets every AGENT change it. Ronit decided in G2 to keep it locked (05 §A.12; ROLE-MATRIX.md §8 item 12). |
| Edit the resolution (staff) | ADMIN, AGENT, L2_MANAGER | ADMIN, AGENT, L2_MANAGER | ✅ SAME | While the ticket is Resolved or Closed, as on the web; the AGENT lock does not apply. Built in G1. |
| Edit the resolution (requester) | END_USER | Nobody | 🔒 SAFER | |
| See the priority | All roles | All roles | ✅ SAME | Nobody edits it; it follows impact and urgency. Staff see an "Auto" label. |
| Submit a ticket for approval | ADMIN, AGENT (END_USER, L2_MANAGER: error) | ADMIN, AGENT | ✅ SAME | In "More options", in every status: the AGENT lock doesn't apply, as on the web. Approvers can be any user; a comment is optional. The ticket moves to Pending with Management Review at once (on a resolved, closed or canceled ticket that reopens it), and approving or rejecting doesn't move it again. Mobile says so; the web says "until all approvers respond". The web also shows END_USER and L2_MANAGER the action, which always fails; mobile hides it. Built in G3. |
| AI summary and AI draft reply | All roles | Nobody | 🔒 SAFER | |
| Print, duplicate, delete, "email the technician", tags, link to a problem or change | All roles (some staff only) | Nobody | ⊘ OUT OF SCOPE | Most of these do nothing on the web. |

### Service catalogue

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Browse the catalogue: categories, their services, search | All roles | All roles | ✅ SAME | Mobile: the drawer's "Service Request" (the web: the sidebar's "Service Request" and a "Requests" bottom tab). Every active service, for every role: nothing is scoped by role, team or country. Search covers service names and descriptions in every category, on the device, as on the web. Built in G4. |
| Request a service through its form | All roles | All roles | ✅ SAME | All seven field types the web renders: text, long text, date, phone, e-mail, number, drop-down. Any other type is a text box on both. The web's checks: "<label> is required", a valid e-mail address, a whole number. Notes go in a collapsed "Resolution" section. No confirmation, then back to the catalogue, as on the web. Thirteen other web controls and the attachment box are not shown: the server keeps nothing they collect (see the note under section 5). Built in G4. |
| Set impact and urgency on a request (they set its priority) | ADMIN, AGENT, L2_MANAGER | ADMIN, AGENT, L2_MANAGER | ✅ SAME | With the web form's own map and labels (its Urgency has no Urgent). Only the priority reaches the server; without both, a request is Medium. Built in G4. |
| See my requests (My Requests) | All roles | All roles | ✅ SAME | SR number, service, status and date, newest first; no requester column, on either side. The web shows the latest 50; mobile loads older ones as the list scrolls. Built in G4. |
| See everyone's requests under "My Requests" | ADMIN, AGENT, L2_MANAGER | ADMIN, AGENT, L2_MANAGER | ✅ SAME | As on the web, since G5. The server lists every request to every role except END_USER, by design: it scopes END_USER only, and staff fulfil requests. A request carries no country, group or technician from the web, so there is no narrower scope. The rows show the same four columns as the web; your own say "by you". G4 had made this 🔒 SAFER; G5 settled it against the web's source (section 5, review). |
| Open a request: its answers, notes, approvals and progress | Nobody | All roles | ➕ MOBILE ONLY | Own requests only: only your own rows in My Requests are links. The web's rows are never links, and the web never shows anyone a request's answers again, so another person's answers stay unshown on both. Read-only: neither side lets anyone change or cancel a request. Built in G4. |
| Create a service template (admin) | ADMIN | Nobody | ⊘ OUT OF SCOPE | The catalogue page's "+ New Template (admin)". |

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
| Reply templates (canned responses) | All roles | All roles | ✅ SAME | A "Templates" button in the composer, for replies and private notes alike. Search by title or category; grouped by category. A blank message is replaced by the template, otherwise it is added at the end. Neither side fills in placeholders. Mobile inserts the text without its formatting or images, because the phone composer is plain text. Built in G3. |
| Attach files to a reply | All roles | All roles | ✅ SAME | |
| Attach files to an internal note | ADMIN, AGENT | ADMIN, AGENT | ✅ SAME | ⚠ The requester can see these files. See 7.1. |

### Attachments

| Capability | WEB: who can | MOBILE: who can | Status | Note |
|---|---|---|---|---|
| Add files to a ticket | All roles; AGENT (lock) | All roles; AGENT (lock) | ✅ SAME | Mobile tells a locked AGENT why they cannot. |
| View or download a file | All roles | All roles | ✅ SAME | |
| Download all files as one zip | All roles | Nobody | ⊘ OUT OF SCOPE | |
| Delete a file | ADMIN, AGENT, L2_MANAGER | ADMIN, AGENT, L2_MANAGER | ✅ SAME | Any file on the ticket, whoever uploaded it, in every status (the AGENT lock doesn't apply). It asks first, naming the file; deleting is permanent. The list and both file counts update. Built in G3. |
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
| Bottom tab bar | All roles | All roles | ✅ SAME | Web: Dashboard, Tickets, Alerts, Knowledge, Requests. Mobile: Home, Tickets, Alerts; Knowledge and the catalogue ("Service Request", G4) are in the drawer. |
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

The gaps are ranked by how much each one matters day to day. Each one uses an endpoint the backend already has, so none of them needs backend work. The numbers are those of the 2026-10-20 list, kept so that earlier references still work.

**Still open: none.** All eleven gaps of the 2026-10-20 list are built (1–9, 11) or decided (10).

**Built in Phase G5 (2026-10-22)** — the web's behaviour, with sources: `FE:pages/tickets/CreateTicketPage.tsx:26, :49-76, :346-387`; `BE:modules/tickets/tickets.controller.ts:185-201`

| # | Gap | Now |
|---|---|---|
| 11 | See the priority before saving a new ticket | ✅ ADMIN, AGENT, in the create form's Classification card. **The G1 component, reused:** `PriorityPreviewBox` from the ticket's impact/urgency editor now takes a `create` target, so both screens show one implementation of the one rule (`previewPriority`). Recomputed whenever impact, urgency or the matrix changes, as the web's effect is. It shows the web's words: "Auto-computed from Impact × Urgency" with the badge, or "Set Impact and Urgency above to compute priority". **A preview only:** nobody sets a priority by hand on the create form, on either side (the web's only other writer is its AI panel, which mobile does not have), so there is nothing to overwrite; and the request carries no `priority` (01 TKT-2), because the server applies the same matrix row itself. Without a row, or without both values, the ticket is created as Medium, and the box says so. L2_MANAGER: impact and urgency as before, and the box says the Service Desk sets the priority (LKP-6 is a 403 for L2, so the web's box never computes either). Gated by `createTicketPermissions()` in `src/utils/permissions.ts`, which now decides every role-dependent part of the create form |

One edge differs. On the web, once a priority has been computed, changing to a pair with no matrix row (the default rows have none for impact "Affects User" or urgency "Urgent") leaves the old priority on screen and sends it; the server then stores it, since no row overrides it (`CreateTicketPage.tsx:67-72`). Mobile shows and stores Medium, whatever was chosen before. The web's value depends on the order the two fields were picked, so it is recorded as a web defect (`docs/ROLE-MATRIX.md` §14), not copied.

**Built in Phase G4 (2026-10-22)** — the web's behaviour, with sources: `docs/G4-WEB-CATALOGUE.md`

| # | Gap | Now |
|---|---|---|
| 7 | Request a service from the catalogue | ✅ Every role, from the drawer's "Service Request" (04 P2: a drawer item; the web also has a "Requests" bottom tab). **Browse:** categories with their item counts, a category's services, and a search over every service's name and description (SCR-1, SCR-2, filtered on the device, as the web). **Request:** the item's form (SCR-3) with **all seven field types the web renders** (text, long text, date, phone, e-mail, number, drop-down; any other type is a text box, as on the web), the web's checks ("<label> is required", where only an empty value fails; a valid e-mail; a whole number), no conditional fields (the web has none), notes, and for ADMIN, AGENT and L2_MANAGER the Impact × Urgency priority from the web form's own map. **SCR-5** carries exactly `{ serviceItemId, formData, notes, priority? }`, the four keys the server keeps (05 B.24). No confirmation; the web's toast; back to the catalogue. **My Requests:** SCR-4 (G4: the person's own requests for every role; **G5: every request for staff, as on the web**), with a detail screen for one's own (SCR-6, ➕). Not shown: the thirteen web controls whose values the server discards, and the attachment box, whose files the web never uploads (section 5 note) |

**Built in Phase G3 (2026-10-22)** — the web's behaviour, with sources: `docs/G3-WEB-BEHAVIOUR.md`

| # | Gap | Now |
|---|---|---|
| 3 | Reply templates (canned responses) | ✅ Every role, in Reply, Reply all and Private note, as on the web (the old Phase 2 plan said staff only; the web's source says every role). A "Templates" sheet: search by title or category, grouped by category ("General" when none). Loaded with LKP-7, no parameters, only when the button is tapped. A blank message is replaced, otherwise the template is appended. No placeholders, on either side. The phone composer is plain text, so a template goes in without its formatting, and without images (the composer says so) |
| 8 | Delete a file | ✅ ADMIN, AGENT, L2_MANAGER, any file, in every status (the AGENT lock doesn't apply, as on the web). A confirmation naming the file, then ATT-5. The list, the tab count and the header count update. END_USER: no button, and refused on the device |
| 9 | Submit a ticket for approval | ✅ ADMIN, AGENT, in every status, from More options. Approvers: any active user (USR-3, no role filter, as on the web); comment optional; "Submit (n)". A confirmation that says what the server does, then **APR-4 `POST /approvals`**, added to 01 with Ronit's sign-off in the G3 brief. Afterwards the screen shows the ticket's status as re-read from the server and says that approving or rejecting won't move it (05 B.22). END_USER and L2_MANAGER: hidden (the web shows them a control that always returns 403) and refused on the device |

**Built in Phase G2 (2026-10-22)**

| # | Gap | Now |
|---|---|---|
| 4 | Filter by technician or group | ✅ ADMIN, AGENT, in the Filters sheet: technicians found by name (USR-3, AGENTs as on the web), every group (LKP-2). Sent as `assignedToId` / `teamId` on the ticket list call |
| 5 | Filter by priority, category or date | ✅ All roles, in the Filters sheet. Sent as `priority`, `categoryId`, `fromDate` / `toDate` |

**Decided in Phase G2, no longer a gap**

| # | Gap | Decision |
|---|---|---|
| 10 | Change the ticket's country: plain AGENT | Stays locked (05 §A.12; ROLE-MATRIX.md §8 item 12). Now ⊘ OUT OF SCOPE in section 3 and listed in section 6 |

**Built in Phase G1 (2026-10-22)**

| # | Gap | Now |
|---|---|---|
| 1 | Change impact and urgency | ✅ ADMIN, AGENT (lock), L2_MANAGER, with the resulting priority shown before Save (ADMIN, AGENT) |
| 2 | Change category | ✅ ADMIN, AGENT (lock); three levels; the screen says when the server re-routed the ticket |
| 6 | Edit the resolution (staff) | ✅ ADMIN, AGENT, L2_MANAGER, while Resolved or Closed |
| 10 | Change the ticket's country | ✅ ADMIN and triage AGENT, in any status. The plain AGENT part is still open (above) |

The G1 brief named the gaps to build as 1, 2, 6, 7 and 8, and described them as impact/urgency, category, resolution, country and the priority preview. By this list's numbering those are 1, 2, 6, 10 and 11. G1 built the named fields on the ticket detail screen; it did not build 7 (catalogue), 8 (delete a file) or the create-form preview in 11.

The G3 brief named its three features by name, not by number: reply templates, delete a file and submit for approval. By this list's numbering they are 3, 8 and 9. It left the service catalogue (7) for G4.

The G4 brief called the catalogue "the last remaining gap". By this list it is gap 7. Gap 11 (the priority preview on the create form) was also still open, and G4's scope ("the service catalogue only") left it open. G5 closed it.

**The prerequisite, mobile-side only.** Before G1 the app's update call would have let an L2_MANAGER send a category or group change, which the web allows neither. G1 refuses both on the device before anything is sent: every property save goes through `fieldEditProblem` in `src/utils/permissions.ts`. G2 also narrowed the API-layer allow-list (`UPDATE_KEYS_BY_ROLE` in `src/api/tickets.api.ts`) and 01 TKT-4, so even a call that skipped the guard could not carry `categoryId`, `teamId` or `priority` for L2 (ROLE-MATRIX.md §8 item 2, RESOLVED).

## 5. Where mobile is safer than the web

Each of these is deliberate: on the web the control fails, returns an error, or shows something it should not.

**Reviewed in G5 (2026-10-22), entry by entry, against the standing exception:** the web shows a control that returns a 403 (**403**) or that leaks data (**leak**). Two more grounds come from CLAUDE.md, which every phase must follow: the control works on the web only through a backend permission gap listed in 05 §C, which mobile may not rely on (rule 6, **§C gap**); or it skips a rule mobile must enforce itself, 05 §A (**§A rule**). Each of the 17 entries below meets at least one ground, cited. One G4 entry did not, and was removed (below the table).

| Capability | Why mobile hides it | Ground (G5 review) |
|---|---|---|
| Choose the group and technician when creating | The web shows L2_MANAGER group and technician pickers that the server refuses to fill, so they are always empty. | **403**: `GET /teams` and `GET /users/search` are `agentOrAdmin` (`BE:teams.router.ts:8`, `users.router.ts:15`) |
| AI assistant while creating | On the web it lets a requester pick the team and the technician, which the normal form deliberately prevents. | **§C gap**: the server keeps a requester's `teamId` and `assignedToId` on create (05 C.5), and the AI routes check no role (C.25). The AI endpoints are not in 01 either (CLAUDE.md rule 1) |
| Change status to any status from a drop-down | The web drop-down lists every status and ignores the transition rules. ADMIN and L2_MANAGER can even move a closed ticket to any status. Mobile offers only the rule-based buttons. | **§A rule**: the transition map (05 §A.1) is one of the two web-only rules CLAUDE.md requires mobile to enforce |
| Pick up a ticket | The web shows L2_MANAGER a Pick up button that the server always refuses. | **403**: `POST /tickets/:id/assign` is `agentOrAdmin` (`BE:tickets.router.ts:20`) |
| Assign, reassign or unassign a technician | The web shows L2_MANAGER Assign, Reassign and Remove controls that the server always refuses. Since 2026-10-27 the technician can also be changed inline on mobile; L2_MANAGER does not get that link either, and the phone refuses the request before sending it. | **403**: as above |
| Move a ticket to another group | The web shows L2_MANAGER a group selector that the server always refuses. | **403**: as above |
| Edit the resolution (requester) | The web lets a requester rewrite the technician's resolution on their own ticket. | **§C gap**: it works only because the server accepts any field from a requester on their own ticket (05 C.5); mobile's END_USER update carries title and description only (01 TKT-4) |
| AI summary and AI draft reply | The web's AI summary is built from every comment, internal notes included, so it can show a requester what staff wrote privately. The server does not check who asks for a draft reply either. | **leak**: internal notes reach the requester (05 C.24); no role or scope check on the AI routes (C.25) |
| Write an internal (private) note | On the web an L2_MANAGER, or a requester using the Actions menu, can write what looks like an internal note, but the server sends it as a public email (7.2). Mobile does not offer it to those roles and refuses it on the phone. | **leak**: text its author believes internal is emailed to the requester and the thread (05 C.27) |
| Read internal notes | L2_MANAGER is not meant to see internal notes, and the server's main comment feed hides them. One web screen reads a different feed that includes them. | **leak**: `/activity` sends notes to L2 while `/comments` withholds them (`BE:tickets.controller.ts:1014` vs `comments.controller.ts:24`) |
| History line "added a comment" for an internal note | On the web it tells a requester that internal notes exist on their ticket. | **leak**: reveals that internal notes exist (05 §A.7) |
| Add, tick off or remove tasks | The web lets a requester add, tick off or delete the service desk's tasks, and the server does not check who is asking. | **§C gap**: the task routes have no role or access check (05 C.3) |
| See everyone's approvals | The server does not limit that list to the person asking, so it shows other people's approvals. | **leak**: unscoped `GET /approvals` (05 C.16) |
| Open a page your role isn't meant to use | The web has no page-level checks: anyone signed in can open any page by typing its address, admin pages included. | **403 / leak**: admin pages' calls fail for other roles, and some lists they read are unscoped (ROLE-MATRIX §1). Mobile has no addresses to type |
| Counts for L2_MANAGER | The server keeps one set of numbers for all L2 managers, so one manager can see another's counts. | **leak**: per-role cache shared by every L2 manager (05 C.19) |
| Unassigned count | For anyone other than ADMIN or a triage AGENT, the server's count includes tickets outside that person's queue. | **leak**: the count drops the person's scope (05 B.20) |
| Charts, technician and team tables, trends, workload | Several of these widgets ignore the person's scope on the server and show organisation-wide numbers. | **leak**: unscoped or mis-scoped widgets (05 B.20; ROLE-MATRIX §1.3) |

**Removed in G5: "See everyone's requests under My Requests"** (🔒 since G4, now ✅ SAME). The web source was read again (`docs/ROLE-MATRIX.md` §14):
- **Does the web show staff all requests, or only those they are involved with?** All of them. `GET /service-catalog/requests` filters by requester for END_USER only (`BE:serviceCatalog.controller.ts:117`), and the web lists the response as is (`FE:ServiceCatalogPage.tsx:44-48, :333-352`). "Involved with" cannot apply: a request created from the web has no group, technician or country (SCR-5 keeps only the service, priority, answers and notes, `:135-159`), and no web page calls the assign or status routes.
- **Does the API enforce scoping, or is it a UI choice?** The API. The scoping is deliberate and explicit ("End users see only their own requests", `:116-117`), and SCR-6 applies the same rule (`:129-131`). Staff fulfil service requests: the update, status and assign routes are staff-only (`serviceCatalog.router.ts:25-27`).
- **Is there a separate staff view?** No. There is one page and one "My Requests" view for every role (`FE:router/index.tsx:145-146`), and no other page calls the list.
- **Against the criteria:** it is not a 403. It is not a leak: the server grants staff every request on purpose, and the web shows four columns only (number, service, status, date), with no requester and no answers. It relies on no §C gap, and skips no §A rule. So it matches the web now: ADMIN, AGENT and L2_MANAGER see every request, and END_USER their own. Another person's answers and notes are still shown nowhere on mobile: only your own rows open the detail screen (the ➕ row), and on the web no row opens anything.

Three ✅ SAME rows also contain web controls that always fail, or do nothing, which mobile hides. They are not 🔒 rows, because nobody is counted as "can" on the web for those controls either:
- **Filter by technician or group:** the web shows END_USER and L2_MANAGER these lists, always empty (403).
- **Submit a ticket for approval (G3):** the web's Actions menu offers it to END_USER and L2_MANAGER, and the Approvals tab offers it to L2_MANAGER. The server always answers 403. Mobile offers it to ADMIN and AGENT only and refuses it on the device for anyone else.
- **Request a service through its form (G4):** the web's form also shows a subject, a description, a category cascade, a group, a technician, assets and a site, for staff a request type, status, mode, level and impact details, and an attachment box. The server keeps none of them: it stores only the service, the priority, the custom fields and the notes (05 §B.24). Some are not even sent, the group list is a 403 for L2_MANAGER, and the files are never uploaded. Mobile shows only what is kept. Sources: `docs/G4-WEB-CATALOGUE.md` §3.

## 6. Out of scope by design

| Capability | Why mobile skips it |
|---|---|
| Export the list to a spreadsheet | It builds a file by paging through every ticket: desk work, not phone work. |
| Saved views | Desktop filter sets; mobile uses fixed quick filters instead. |
| See your country filter, read-only | Mobile always shows a requester every ticket they raised, whatever the country, so a country label would be wrong. |
| Change the ticket's country: plain AGENT | Decided in G2: an AGENT locked to one country keeps the ticket's country locked, as 05 §A.12 locks their list. Moving a ticket to another country would move it out of their own queue. ADMIN and the triage AGENT change it as on the web. |
| Set mode, level and source when creating | The server throws away mode and level on a new ticket, and mobile sets the source itself. |
| See impact and urgency (requester) | Classification is a service-desk field, so by decision mobile shows it to staff only. |
| Print, duplicate, delete, "email the technician", tags, link to a problem or change | On the web, delete and "email the technician" send nothing and duplicate reopens the same ticket. The problem and change links call server routes that do not exist. Printing is desk work. |
| Reply all | The server lookup behind it has no access check. For a requester, the server already chooses who receives the reply. |
| Choose the To and Cc addresses | For a requester the server chooses the recipients itself, so mobile does not ask for addresses. |
| Download all files as one zip | Not allowed by the mobile API contract: an error during a zip download can crash the server for everyone. |
| Create or delete announcements | Administration; it stays on the web. |
| Create a service template (admin) | Administration; it stays on the web. The web page that offers it cannot define a template's form fields either. |
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
- **Found in G3:** the "Approval requested" email attaches every ticket-level file, so these files also go to each approver, and an approver can be any user (05 C.28). This happens whether the request is made on the web or on mobile; the mobile confirmation says the approvers are emailed the ticket's files.

### 7.2 A web "internal note" can be emailed to the requester (High)

- **What happens:** on the web portal, an L2_MANAGER sees an "internal note" option, and every role, requesters included, sees "Add Note" in the Actions menu. When an L2_MANAGER or a requester uses them, the server quietly turns the note into a public reply. It then emails the reply to the requester and to everyone on the ticket's email thread.
- **Who is affected:** everyone who receives that email gets text its author believed was internal. Only L2_MANAGERs and requesters can trigger it, through those web controls.
- **Mobile:** does not offer a note to those roles, and refuses one on the phone if it is ever attempted, so the app cannot trigger this. It cannot stop it happening on the web.

## 8. Workflow parity: six workflows traced end to end (G5)

**2026-10-22.** The sequence of actions a person takes, not how the screens look. Each workflow was traced through the web's source (`FE:` pages, `BE:` controllers) and the app's (screens, hooks, guards, API functions), and every divergence was checked in both. Nothing here was changed in G5. These are differences in steps or wording, except one difference in outcome (2a), which is a known server quirk that mobile avoids.

**Identical on both sides:** the status transition map and its labels; the AGENT lock on Closed and Canceled tickets; the closure form (Resolution and Closure comments required, the six closure codes, first-call resolution off by default, the same request); the service-request toast and the return to the catalogue; the ticket-list filter parameters and how they combine and clear.

**Mobile safeguards on every write.** These are app-wide and apply to most of the workflows below:
- **Confirmation before most writes.** Create a ticket, Pick up, a status change, closure Save, approve and reject. In these six workflows the web confirms none of them (it confirms deleting a file, which both sides do). Exception: "Add Request" in the catalogue sends at once on both sides.
- **Status re-read before a write.** One GET before a status change, an assignment or a property save. If the ticket moved since the screen opened, nothing is written and the new status is shown.
- **Leave prompt.** Leaving a form with unsaved input asks first; the web's Cancel discards silently.

None of them changes who can do what, or what the server stores.

| # | Workflow | Divergence (web → mobile) | Outcome differs? | Sources (web; mobile) | Recorded before? |
|---|---|---|---|---|---|
| 1a | Raise a ticket (END_USER) | No confirmation → "Create this ticket?" first | No | `CreateTicketPage.tsx:168`; `CreateTicketScreen.tsx:112-122` | New (G5) |
| 1b | | `source: WEB_FORM` and plain text → `source: API` and the description as escaped HTML | Source label only | `:55, :149-167`; `useCreateTicket.ts:62-65` | 05 §A.18 D5, §A.16 |
| 1c | | A description of spaces only is accepted → refused ("Description is required"); the 3-character title minimum is the server's | Validation only: the web creates a ticket with a blank-looking description; mobile asks for one | `:212`; `useCreateTicket.ts:39-47` | Title: 05 §A.8. Spaces: new (G5) |
| 1d | | After creating: the web pushes the ticket (Back returns to the form) → mobile replaces the form (Back returns to the list) | No | `:185`; `CreateTicketScreen.tsx:140` | New (G5) |
| 2a | Pick up, work, reply, resolve, close (AGENT) | **Pick up** sends `{ assignedToId }` alone, and the server then moves the ticket to the technician's first group → mobile also sends the ticket's current group, so it stays where it is | **Yes, the group.** Same whenever the ticket has no group or the technician's first group is the ticket's | `TicketDetailPage.tsx:672`, `BE:tickets.controller.ts:795-802`; `TicketDetailScreen.tsx:185` | 05 §B.14 (server quirk; mobile's workaround). Not copied: the web's result depends on the order of the technician's group memberships |
| 2b | | Pick up, a non-closure status change and closure Save happen at once → each asks first. (08 §4.1 says other targets "post straight away"; mobile confirms first) | No | `:672, :767, :2516`; `TicketDetailScreen.tsx:161, :177`; `StatusClosureScreen.tsx:151, :169` | New (G5) |
| 2c | | No re-check → one GET of the current status before the write (above) | No | none; `writeGuards.ts:64-73`, `useChangeStatus.ts:33` | UAT-TEST-PLAN E6 only. New here |
| 2d | | Closure files: the web changes the status, then uploads, and ignores upload failures → mobile uploads first, and changes nothing if an upload fails | Only when an upload fails | `:2516-2535`; `useChangeStatus.ts:34-40` | 05 §A.2 |
| 2e | | A closure error loses the typed text (the web closed the modal) → the form stays, with the error | No | `:2534`; `StatusClosureScreen.tsx:180-182` | New (G5) |
| 2f | | Toasts "Comment added" / "Ticket assigned" → "Reply sent" / "Note saved" / "Assigned to you"; Pick up hidden on a ticket already yours | No | `:470, :570`; `ReplyComposerScreen.tsx:107` | Pick up: section 3. Wording: new (G5) |
| 3a | Service request through the catalogue | The web sends 11 keys and shows 13 controls the server drops → mobile shows and sends the 4 the server keeps | No (the server keeps the same 4) | `ServiceRequestFormPage.tsx:142-155`; `service-catalog.ts:365-372` | Section 5 note; G4 §9 |
| 3b | | The browser's bubble, then the field messages → every message at once, plus a line naming the fields | No (same rules, same blocking) | `:246`; `ServiceRequestFormScreen.tsx:86-91` | G4 §9 |
| 4a | Submit for approval, then approve | Submit: a confirmation; blank comments left out instead of sent as ""; a result card with the status re-read | No | `TicketDetailPage.tsx:442-460`; `SubmitApprovalScreen.tsx:82-98` | G3 §4 |
| 4b | | Approve on the web's Approvals page: one click, no comment (the ticket's own tab asks for an optional comment) → the inbox's detail screen: optional comment, then a confirmation | No | `ApprovalsPage.tsx:83`, `TicketDetailPage.tsx:1625-1633`; `ApprovalDetailScreen.tsx:54-64` | New (G5) |
| 4c | | The approver reaches it from the web sidebar (ADMIN, AGENT) or the ticket → from the Approvals inbox, for anyone with a pending approval | No | `AppLayout.tsx:32`; `permissions.ts` `drawerItems` | Section 3 (Approvals); 08 S1 |
| 5a | Change impact, urgency and category | The web saves on each selection → one explicit Save | No | `TicketDetailPage.tsx:1744, :1761, :1981-2000`; `TicketPropertyEditors.tsx` | G1 §6 |
| 5b | | Impact **and** urgency changed: the web sends two updates (each with the priority of its moment) → mobile sends one with both | **Side effects only:** the web can write two History lines and send two "priority changed" emails where mobile sends at most one; the stored values are the same | `:304-317`, `BE:tickets.controller.ts:719, :775-784`; `ticket-properties.ts` `classificationChanges` | New (G5): a consequence of G1's explicit Save |
| 5c | | Category: one update per level (each can re-route) → one update with the deepest level | Fewer re-routing runs; same final category | `:1981-2000`; `TicketPropertyEditors.tsx` | G1 §6 |
| 6a | Filter by technician, then by date | Technician picked from a list of up to 100 → found by typing 2+ letters (same people: active AGENTs) | No | `TicketsListPage.tsx:153-156`; `TicketFiltersScreen.tsx` | G2 §5 |
| 6b | | A date picker instead of typed dates; a warning when From is after To | No | `:531-546`; `TicketFiltersScreen.tsx` | G2 §5 |

**Not determinable from the source:** whether 5b's second "priority changed" email is actually sent on UAT depends on its priority matrix, which was not queried (no API call was made in G5).
