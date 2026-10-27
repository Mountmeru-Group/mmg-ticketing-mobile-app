# G3 — How the web portal does reply templates, file deletion and "Submit for approval"

**Phase G3, 2026-10-22.** Read-only inspection of the web repo clone at HEAD `d7f3887` (byte-for-byte unchanged before
and after: SHA-1 of every file under `frontend/src`, `backend/src` and `backend/prisma`).

This file records what the web portal **actually does** for the three G3 features, so that mobile copies it. Every
statement cites the source. Where the source does not settle something, this file says so, and §4 lists what mobile
does differently and why.

**Paths**
- `FE:` = `frontend/src/`; `TDP` = `FE:pages/tickets/TicketDetailPage.tsx`; `CRP` = `FE:components/ui/CannedResponsePicker.tsx`.
- `BE:` = `backend/src/`; `AC` = `BE:modules/approvals/approvals.controller.ts`; `TC` = `BE:modules/tickets/tickets.controller.ts`.
- Line numbers are as of today.

**One fact that applies to all three:** the web has no route guards and its role checks are UI-only
(`docs/ROLE-MATRIX.md` §1). Where the UI and the server disagree, the table says which is which.

---

## 1. Reply templates (canned responses)

| Question | Web behaviour | Source |
|---|---|---|
| Where | A **"Templates"** button in the composer's bottom toolbar, left of "Draft Reply" and "Attach files". It opens a pop-up above the button with a search box and the list | `TDP:1044-1051`; `CRP:52-60, :62-105` |
| When it is there | Whenever the composer is open. The composer opens from Reply, Reply All, Add Note, and Actions › Reply / Add Note | composer block `TDP:888-1110`; openers `:843-883, :684, :686` |
| Which roles | **Every role**, END_USER included. Neither the picker nor its place in the toolbar has a role check. (Reply and Reply All are ungated, so END_USER reaches the composer.) | `TDP:1046` (no condition), `:843-873`; `CRP` (no role check) |
| Reply vs private note | **Both.** The picker is outside the `commentType === 'PUBLIC'` condition that hides "Draft Reply" in note mode | `TDP:1046-1051` vs `:1052` |
| How the list loads | `GET /canned-responses` with **no parameters**, when the composer mounts the picker; cached 60 s under `['canned-responses']` | `CRP:15-19`; `FE:api/canned-responses.api.ts:14-15` |
| Scoped by category or team | **No.** The server supports `search` (title or body) and `category` (exact), but the web sends neither. Every active template is listed to everyone | `CRP:17`; `BE:modules/cannedResponses/cannedResponses.controller.ts:4-20` |
| Server | `requireAuth` only ("All authenticated users can list active responses (for the reply picker)"). Active rows only, ordered by category then title; `{ data: [{ id, title, body, category }] }`, no paging | `BE:modules/cannedResponses/cannedResponses.router.ts:14-15`; controller `:6, :14-19` |
| Search | Always shown. Client-side, case-insensitive, on **title or category** (not the body) | `CRP:31-35, :64-77` |
| Grouping and order | Grouped under `category`, or **"General"** when it has none. Groups sorted by name (`localeCompare`); inside a group, the server's order (title) | `CRP:37-42, :84` |
| Empty list | "No templates found" | `CRP:81-82` |
| Each row | The title only (truncated), with an icon and a chevron. No preview | `CRP:89-99` |
| Inserting | `onSelect(r.body)`: **if the body has no text once tags are stripped, it is replaced by the template; otherwise the template is appended at the end** (`prev + body`, an HTML paragraph after the existing ones). Never at the cursor: the editor's `innerHTML` is rewritten from the new value. The pop-up closes and its search clears | `TDP:1046-1051`; `FE:components/ui/RichTextEditor.tsx:27-42`; `CRP:44-48` |
| Placeholders | **None.** The body is inserted verbatim. There is no placeholder syntax in the admin editor, the picker or the server | `CRP:45`; `FE:pages/admin/CannedResponsesPage.tsx:150-185`; `cannedResponses.controller.ts` (no substitution) |
| Template content | Rich-text HTML written in the admin page's editor (bold, lists, links; pasted images become inline base64) | `FE:pages/admin/CannedResponsesPage.tsx:169-176`; 05 §A.16 |
| Admin | Create, edit, disable and delete are ADMIN-only pages and routes; out of scope for mobile | `FE:layouts/AppLayout.tsx:43`; `BE:modules/cannedResponses/cannedResponses.router.ts:16-21` |

**Discrepancy with our docs:** 01 LKP-7 said "The web uses it for staff only, and so does mobile", and the
2026-10-20 Phase 2 plan offered templates to staff only. The source shows the web offers them to every role
(as `ROLE-MATRIX.md` §1.5 already recorded). Mobile now matches the source; 01 LKP-7 is corrected.

---

## 2. Delete a file (attachment)

| Question | Web behaviour | Source |
|---|---|---|
| Where | A trash icon on each row of the attachment list, in the **Details** tab's Attachments section, beside Download | `TDP:1174, :1262-1360`, button `:1345-1350` |
| Which roles | `user?.role !== 'END_USER'`: **ADMIN, AGENT, L2_MANAGER** | `TDP:1345` |
| Whose files | **Any file on the ticket**, whoever uploaded it (the requester's, a technician's, a reply's, a note's, an email's, the closure form's). There is no uploader check in the UI or on the server | `TDP:1319-1351`; `BE:modules/attachments/attachments.controller.ts:146-157` |
| Ticket state | **Not restricted.** The AGENT lock (`isResolvedLocked`) hides "Add Attachment" (`:1268`) but not the trash icon, so an AGENT deletes on CLOSED and CANCELED tickets too | `TDP:1268` vs `:1345` |
| Confirmation | The browser's `confirm("Delete <fileName>?")`; Cancel sends nothing | `TDP:1346` |
| Request | `DELETE /tickets/:id/attachments/:attachmentId` | `TDP:272-273` |
| Server rule | `requireAuth`; the controller refuses END_USER with `403 "Forbidden"`. Any other role can delete **any** attachment by id; the server does not check that it belongs to `:ticketId` (05 C.4) | `BE:modules/attachments/attachments.router.ts:13`; controller `:146-149` |
| Soft or hard | **Hard.** The file is unlinked from disk (if present) and the row deleted. No audit row, so History shows nothing; the earlier "added an attachment" row stays | controller `:151-156`; 01 ATT-5 |
| Response | `200 { "message": "Attachment deleted" }`; `404 "Attachment not found"` | controller `:148, :156` |
| Afterwards | Toast **"Attachment deleted"**, then refetch the attachment list. The Properties "Attachments" count is that list's length, so it drops too. The ticket itself is not refetched | `TDP:274-277, :1916-1923` |
| On error | Toast: the server's `error`, else **"Failed to delete attachment"**. Nothing was removed from the list, so nothing needs reverting | `TDP:278` |

---

## 3. Submit a ticket for approval

| Question | Web behaviour | Source |
|---|---|---|
| Where | (1) **Actions › "Submit for Approval"**, under an "Approve" heading. (2) The **Approvals** tab's "Submit for Approval" button. Both open the same modal | `TDP:696-697`; `:806, :1581-1590`; modal `:2545-2612` |
| Which roles (UI) | Actions menu: **every role** (no check). Approvals tab button: `role !== 'END_USER'`, so ADMIN, AGENT, L2_MANAGER | `TDP:697`; `:1585` |
| Which roles (server) | `agentOrAdmin`: **ADMIN, AGENT**. END_USER and L2_MANAGER get `403 "Forbidden: insufficient role"`, so the web shows them a control that always fails (`ROLE-MATRIX.md` §1.8 W8) | `BE:modules/approvals/approvals.router.ts:8`; `BE:middleware/rbac.middleware.ts:13-14, :22` |
| Ticket states | **Every state.** Neither entry point checks the status or the AGENT lock, and the server checks nothing. A locked AGENT can submit a CLOSED ticket | `TDP:697, :1585`; `AC:16-88` |
| Form | **Approver(s) \***: a search box ("Search any user by name or email (min 2 chars)..."); results appear from 2 characters; each pick adds a removable chip; people already picked are left out of the results. **Comments (optional)**: a textarea, "Context for the approver..." | `TDP:2551-2599` |
| Approver search | `GET /users/search?q=` with **no role filter**: any active user, END_USER included ("approvers can be from management"). At most 20 | `TDP:415-421`; `FE:api/users.api.ts:8-9`; `BE:modules/users/users.controller.ts:69-93` |
| Validation | Submit disabled until at least one approver is picked. Nothing else: no length limit, self-approval not prevented. Server: `approverIds` min 1 ("At least one approver required"), `comments` optional | `TDP:2605`; `AC:17-22` |
| Button | **"Submit (n)"** with the number of approvers; Cancel closes the modal | `TDP:2602-2609` |
| Modal text | "Select one or more approvers. The ticket will move to **Pending with Management Review** until all approvers respond." The second half is not true (below) | `TDP:2547-2549` |
| Request | `POST /approvals` `{ entityType: 'ticket', entityId: <ticket id>, approverIds: [...], comments: <text> }`. `comments` is sent even when empty (`''`) | `TDP:442-448`; `FE:api/approvals.api.ts:10-11` |
| Afterwards (UI) | Toast **"Approval request submitted"**; refetch the ticket and the ticket's approval list; close and clear the modal | `TDP:449-458` |
| On error | Toast: the server's `error`, else **"Failed to submit approval"**; the modal stays open with its contents | `TDP:459` |

**What the server does on submit** (`AC:16-88`)
1. Every **PENDING** approval already on this ticket becomes **CANCELLED** (`AC:24-28`). A second request replaces the first.
2. One approval per approver is created, `stage` 1, 2, 3… in the order picked (`AC:30-38`). The stage is not enforced: every approver is notified at once and can decide in any order (`AC:114-119`).
3. **The ticket's status is set to `PENDING_MGMT_REVIEW`** by a direct database update (`AC:40-45`), from whatever it was, CLOSED and CANCELED included. Because this bypasses `POST /tickets/:id/status` (`TC:841-994`):
   - no `STATUS_CHANGED` history row is written (`TC:929-932` is not run);
   - the requester gets **no** status email or in-app notice (`TC:940-972` is not run);
   - **the SLA clock is not paused**: `slaHoldStartedAt` is not set (`TC:857-866` is not run). If the ticket was already on hold it stays paused. When a technician later moves the ticket out, no hold time is added back, because none was recorded (`TC:867-881`).
4. Each approver gets an in-app notification "Approval requested" and an email "[Ticket #n] Approval requested" (`AC:47-84`). The email carries the ticket's PUBLIC conversation and **every ticket-level file, attached** (`BE:modules/email/notification.service.ts:113-116, :128-142, :155-156, :506-528`). Files attached to private notes are ticket-level (05 C.26), so they go to the approver too, whatever the approver's role.
5. Response: `201` with the created approvals (`Approval[]`, `AC:87`). Errors: `403` (role), `400 "Validation error"` (no approver), `500` for an unknown approver or ticket id.

**After an approver decides** (confirms 05 §B.22)
- Approve (`AC:114-180`): the approval becomes APPROVED; **the ticket's status is not touched**; the requester is emailed and notified. ("All approved" only affects a change, `AC:133-137`.)
- Reject (`AC:182-247`): the approval becomes REJECTED; other PENDING approvals for the ticket become CANCELLED; **the ticket's status is not touched**; the requester is emailed and notified.
- So the ticket **stays `PENDING_MGMT_REVIEW` until a technician moves it** with a status change. The web modal's "until all approvers respond" implies otherwise; mobile does not repeat it.

---

## 4. What mobile builds, and where it differs

| Feature | Mobile | Same as the web | Different, and why |
|---|---|---|---|
| Templates | "Templates" button in the composer (M5), in Reply, Reply all and Private note, for every role. A sheet with a search box (title or category), groups by category with "General", the web's order, "No templates found". Loaded with LKP-7, no parameters, **only when the button is tapped**, cached 60 s | Roles, modes, list, search fields, grouping, insert rule (replace a blank body, else append at the end), no placeholders | The mobile composer is plain text (05 §A.16), so the template is inserted as text: formatting is not kept and images are left out (the app never sends inline images, 01 §0.1); the composer says so when a template had images. Each row also shows a one-line preview, since a phone has no hover. Nothing loads when the composer opens |
| Delete a file | A trash button on each row of M4's Attachments tab for ADMIN, AGENT and L2_MANAGER, any file, any status. A confirmation naming the file. ATT-5. Then the list, the tab count and the header count refresh | Roles, any file, no state rule, confirmation, the "Attachment deleted" notice, the error text | The confirmation also says it is permanent and that the requester loses the file. The ticket is refetched too, so the header count (`_count.attachments`) is right |
| Submit for approval | "Submit for approval…" in M4's More options for ADMIN and AGENT, in every status, opening a form: approvers (any active user, from 2 letters, picked ones left out), optional comments, "Submit (n)". A confirmation, APR-4, then a result card with the ticket's status as re-read from the server | Server roles, no state rule, fields, validation, request, the notice and error text | END_USER and L2_MANAGER don't see it (the web shows it and it returns 403: the standing exception, `WEB-VS-MOBILE-ROLES.md` §5). The confirmation and result say what the server really does (step 3 above) instead of "until all approvers respond". Blank comments are left out rather than sent as `''` (same stored meaning: no comment). The ticket's own approval list (the web's Approvals tab, read from the unscoped `GET /approvals`, 05 C.16) is not built: it is a separate capability, not needed to submit |

**Undeterminable from source:** nothing for these three. One thing to know: on a RESOLVED, CLOSED or CANCELED ticket,
submitting for approval reopens it to Pending with Management Review, as on the web; mobile's confirmation says so.

**Backend findings reported in 05 (R3, not fixed):** B.35 (submit bypasses the status endpoint: no history, no
requester notice, SLA not paused, any state) and C.28 (the approval email attaches every ticket-level file,
private-note files included, to any approver).
