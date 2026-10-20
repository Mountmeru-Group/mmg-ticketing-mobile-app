# 05 — Rules and Gaps

This is where web-system behaviour is recorded so that mobile **copies the intended rules and does not inherit the bugs**.

| Section | What it holds | What mobile does with it |
|---|---|---|
| **A** | Logic that lives **only in the web frontend**. The backend does not enforce it | Mobile reimplements it, exactly as quoted, with the web source cited |
| **B** | **Backend gaps and bugs** | Mobile works around them; each has a workaround |
| **C** | **Security findings** | **Report only**: the web team owns them |

**Paths**
- `FE:` = `frontend/src/` in the web repo.
- Unprefixed backend paths are relative to `backend/src/`.
- Line numbers are as of 2026-10-09.

---

## A. LOGIC THAT LIVES ONLY IN THE WEB FRONTEND (mobile must reimplement)

> - The backend enforces **none** of the rules in this section unless a row says otherwise. Mobile copies them so that phone and web behave the same.
> - **When backend ask A6 ships (server-side workflow), delete A.1–A.2 from mobile and use the server's `allowedTransitions`.**

### A.1 Ticket status transitions
**Source:** `FE:pages/tickets/TicketDetailPage.tsx:45-106` (map) and `:612-623` (locks). **Backend:** not enforced. `POST /tickets/:id/status` accepts any status from any status (`modules/tickets/tickets.controller.ts:841-994`).

**The transition map**, verbatim minus comments. Button labels are part of the rule.
```ts
const STATUS_TRANSITIONS: Record<string, { label: string; target: string }[]> = {
  OPEN: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Close', target: 'CLOSED' },
  ],
  IN_PROGRESS: [
    { label: 'On-hold', target: 'ON_HOLD' },
    { label: 'Pending with Management Review', target: 'PENDING_MGMT_REVIEW' },
    { label: 'Pending with Master Data Team', target: 'PENDING_MASTER_DATA' },
    { label: 'Pending with Partner', target: 'PENDING_PARTNER' },
    { label: 'Pending with User for Confirmation/Testing', target: 'PENDING_USER_CONFIRM' },
    { label: 'Pending with User for more Information', target: 'PENDING_USER_INFO' },
    { label: 'Resolve', target: 'RESOLVED' },
    { label: 'Close', target: 'CLOSED' },
    { label: 'Canceled', target: 'CANCELED' },
  ],
  ON_HOLD: [
    { label: 'In-Progress', target: 'IN_PROGRESS' },
    { label: 'On hold to open', target: 'OPEN' },
  ],
  PENDING_MGMT_REVIEW: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
  ],
  PENDING_MASTER_DATA: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
  ],
  PENDING_PARTNER: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
  ],
  PENDING_USER_CONFIRM: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
    { label: 'Close', target: 'CLOSED' },
  ],
  PENDING_USER_INFO: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
    { label: 'Close', target: 'CLOSED' },
  ],
  RESOLVED: [
    { label: 'Resolve to open', target: 'OPEN' },
    { label: 'Close', target: 'CLOSED' },
  ],
  CLOSED: [],
  CANCELED: [],
};
```
- `PENDING` (a legacy status) has **no entry**, so it gets no transitions. It can still appear on old tickets and in list filters.

**Who may change status** (verbatim, `:612-623`):
```ts
const canChangeStatus = user?.role !== 'END_USER';
const LOCKED_STATUSES = new Set(['CLOSED','CANCELED']);
const isResolvedLocked = user?.role === 'AGENT' && LOCKED_STATUSES.has(ticket.status);
const transitions = isResolvedLocked ? [] : (STATUS_TRANSITIONS[ticket.status] || []);
```

| Role | Status bar | Locked when CLOSED/CANCELED |
|---|---|---|
| END_USER | **hidden**: cannot change status | – |
| AGENT | shown | **yes**: no transitions, and the property edits in A.3 become read-only |
| L2_MANAGER | shown | no |
| ADMIN | shown | no (CLOSED/CANCELED have no transitions anyway) |

**Clicking a transition**
- Target is `RESOLVED`, `CLOSED` or `CANCELED`: open the closure modal (A.2).
- Any other target: `POST /tickets/:id/status { status: target }` (`:759-767`).
- Disable all transition buttons while the request is pending (`:770`).
- Button colours: RESOLVED green, CLOSED grey, others neutral (`:771-777`).

**Web inconsistency not to copy:** the Properties panel's status `<select>` (`:1684-1724`) lists **every** status and bypasses the map. Mobile offers **only** the map (decision D1).

**There is no pending-reason modal.** Pending and hold targets post `{ status }` only (`:767`). The server's `reason` field is ignored anyway.

### A.2 Closure modal: RESOLVED / CLOSED / CANCELED
**Source:** `FE:TicketDetailPage.tsx:2421-2542`. **Backend:** validates nothing. `closureCode` is a free string; `resolution` and `closureComments` are optional server-side.

- **Title:** `` `Transition · ${label}` ``. **Save button:** `` `Save & ${label}` ``.

| Field | Required | Notes |
|---|---|---|
| Resolution | **yes** (`trim()` non-empty) | textarea |
| Closure Code | no | select; options below |
| Is FCR (First Call Resolution) | no | checkbox, default `false` |
| Closure Comments | **yes** (`trim()` non-empty) | textarea. The server posts it as a **PUBLIC comment** visible to the requester, and puts it in the CLOSED email |
| Attachments | no | uploaded to the ticket in parallel |

- **Save disabled** (verbatim, `:2514`): `!closureResolution.trim() || !closureComments.trim() || statusMutation.isPending`. There are no error messages; the button simply stays disabled.
- **Closure code options**, verbatim (`:2456-2462`). The dashes are **U+2013 EN DASH**; the apostrophe is ASCII. Send the exact string:
  ```
  (empty)  → "— Select —"   (send undefined)
  "Resolved – Issue Fixed"
  "Resolved – Workaround Provided"
  "Closed – Duplicate"
  "Closed – Won't Fix"
  "Cannot Reproduce"
  "Other"
  ```
- **Request** (verbatim, `:2518-2524`):
  ```ts
  { status: target, resolution: closureResolution.trim(), closureCode: closureCode || undefined,
    isFcr: closureIsFcr, closureComments: closureComments.trim() }
  ```
- **Files:** the web fires the upload (`POST /tickets/:id/attachments`) in parallel and swallows errors (`:2525-2534`). **Mobile:** upload first, wait for it, then post the status. Report upload failures.
- **Toasts:** "Status updated" on success; "Failed to update status" on error.

### A.3 Field-level edit permissions on the ticket detail screen
**Source:** `FE:TicketDetailPage.tsx:1684-2210`. **Backend:** mostly **not** enforced (see §C).

`locked` = A.1's `isResolvedLocked` (AGENT on CLOSED/CANCELED).

| Field | END_USER | AGENT | L2_MANAGER | ADMIN | Call |
|---|---|---|---|---|---|
| Status | ❌ | via A.1 | via A.1 | via A.1 | TKT-6 |
| Priority | read-only (all roles) | read-only | read-only | read-only | Computed by the server from impact × urgency. Show an "Auto" pill when both are set (staff) |
| Impact / Urgency | **hidden** | edit unless `locked` | edit | edit | TKT-4 `{impact}` / `{urgency}`. "Not Set" cannot clear a value |
| Technician (assignee) | read-only | edit unless `locked` (A.4) | **read-only on mobile** (web shows it, server returns 403; D2) | edit | TKT-5 / TKT-4 |
| Group & Site (team) | read-only | edit unless `locked` | **read-only on mobile** (server returns 403) | edit | TKT-5 `{assignedToId: current, teamId}` |
| Category / Sub / Item | read-only | edit unless `locked` | read-only | edit | TKT-4 `{categoryId}`. **May auto-reassign** (toast: `Category updated — auto-assigned to <name>` when the response has `assignedTo`) |
| Country (requester details) | read-only | edit (not lock-gated) | **read-only on mobile** (server silently drops it) | edit | TKT-4 `{countryId: value \|\| null}` |
| Resolution (when RESOLVED/CLOSED) | **read-only on mobile** (web lets END_USER edit; D3) | edit | edit | edit | TKT-4 `{resolution}` |
| Level / Mode / Tags | not shown on detail | – | – | – | – |
| Attachments: add | ✅ unless `locked` | ✅ unless `locked` | ✅ | ✅ | ATT-2 |
| Attachments: delete | ❌ | ✅ (not lock-gated) | ✅ | ✅ | ATT-5, after a "Delete <fileName>?" confirm |
| Tasks: add / toggle / delete | **read-only on mobile** (web allows; D4) | ✅ | ✅ | ✅ | TSK-2/3/4 |
| Private note | ❌ | ✅ | ❌ (server forces PUBLIC) | ✅ | CMT-2 `type:'PRIVATE'` |
| Comment edit/delete | no UI on web; **none on mobile MVP** | | | | CMT-3/4 exist server-side |
| Submit for approval | ❌ | ✅ | ❌ (403) | ✅ | Out of MVP scope |

**Impact and urgency labels** (verbatim, `:108-121`):
```ts
const impactLabel  = { MINIMAL: 'Affects User', LOW: 'Affects Group', MEDIUM: 'Affects Department', HIGH: 'Affects Business' };
const urgencyLabel = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };
```

**Category cascade on the detail screen** (`:1934-2008`)
- Derive the current selection from `ticket.category.level`:
  - `ITEM`: item = `c.id`, sub = `c.parentId`, category = `c.parent.parentId`
  - `SUBCATEGORY`: sub = `c.id`, category = `c.parentId`
  - `CATEGORY`: category = `c.id`
- Options come from `GET /categories?flat=true`, filtered by `level` and `parentId`.
- What each change sends:
  - Category: `value || null`
  - Sub: `value || curCatId || null`
  - Item: `value || curSubId || null`

### A.4 Assignment picker (staff)
**Source:** `FE:TicketDetailPage.tsx:1776-1888`, `:2363-2419`.

**Toggle label:** `'✕ Cancel'` when open, else `'↔ Reassign'` when assigned, else `'+ Assign'`.

**Candidate order**
1. **"🌍 Recommended for {country}"**: TKT-10 `GET /tickets/:id/suggested-assignees`, fetched when the picker opens.
2. **Members of the ticket's current team**: `members[].user` of that team in `GET /teams` (LKP-2). The web makes an extra `GET /teams/:id` per team, which mobile doesn't need. Shows "Remove assignment" when the ticket is assigned.
3. **Search**: `GET /users/search?q=<≥2 chars>&role=AGENT,ADMIN` (USR-3), used when the team has no members.

**Calls**
- **Pick:** `POST /tickets/:id/assign { assignedToId: u.id }` (TKT-5).
- **Pick up** (toolbar): assign to self.
- **Remove:** `{ assignedToId: null }`.
- After assigning, refetch TKT-3.

### A.5 Reply / note composer
**Source:** `FE:TicketDetailPage.tsx:540-571, 841-1105`.

**Quick actions**
- **Reply:** type PUBLIC; To = `[requester.email]` (if present); CC = `[]`.
- **Reply All:** type PUBLIC; call TKT-9.
  - To = `r.to` if non-empty, else `[requester.email]`.
  - CC = `r.cc`.
  - On error: To = `[requester.email]`, CC unchanged.
- **Add Note:** type PRIVATE, no recipients. **ADMIN and AGENT only** (L2 is forced to PUBLIC by the server).

**Type selector:** "Public Reply" / "Private Note", shown only for non-END_USER. To/CC rows show only for PUBLIC.

**Email chip validation**
- Regex, verbatim: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- On Enter, `,` or space: trim, strip a trailing comma, validate, skip duplicates, then add the chip.
- Backspace on an empty input removes the last chip.
- Leftover text in the To or CC input is added on send if it is valid.

**Recipient suggestions:** `GET /users/search?q=` (≥2 chars). ADMIN and AGENT only; others get 403, so mobile doesn't call it for them.

**Send flow** (verbatim core, `:540-558`):
```ts
const cc = [...ccChips, ...(ccInput.trim() ? [ccInput.trim()] : [])].filter(isValidEmail);
const to = [...toChips, ...(toInput.trim() ? [toInput.trim()] : [])].filter(isValidEmail);
let attachmentIds: string[] = [];
if (replyFiles.length > 0) {   // 1) upload first
  const fd = new FormData(); replyFiles.forEach(f => fd.append('files', f));
  const uploadRes = await client.post(`/tickets/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  attachmentIds = (uploadRes.data ?? []).map((a: any) => a.id).filter(Boolean);
}
await ticketsApi.addComment(id, commentBody, commentType, cc, to, attachmentIds);   // 2) then POST /comments
```

**Send disabled** (verbatim, `:1101`):
```ts
(!commentBody.trim() || commentBody.replace(/<[^>]*>/g, '').trim() === '') && replyFiles.length === 0
```
A body holding only an inline image counts as empty.

**Button label:** "Send Reply" (PUBLIC) / "Save Note" (PRIVATE).

**Canned response insert** (`:1046-1051`): if the body has no text once tags are stripped, replace it with the template; otherwise append the template.

**Server facts to tell the user**
- PUBLIC replies email the requester, **every address on the original email thread**, and the assignee. Removing a chip does **not** remove original-thread participants (B.11).

### A.6 Rendering HTML (descriptions, comments, email bodies)
**Source:** `FE:TicketDetailPage.tsx:2685-2718` (`sanitizeHtml`), `:1157` (HTML detection). **Backend:** stores HTML unsanitised (`comments.controller.ts:64-68`).

**Web sanitiser**, verbatim. It is a **minimum**: mobile must render in a sandboxed renderer and should use a real allow-list sanitiser.
```ts
function sanitizeHtml(html: string): string {
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+="[^"]*"/gi, '');
  clean = clean.replace(/\s+on\w+='[^']*'/gi, '');
  const bodyMatch = clean.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) { clean = bodyMatch[1]; }
  clean = clean.replace(/<head[\s\S]*?<\/head>/gi, '');
  clean = clean.replace(/<\/?html[^>]*>/gi, '');
  clean = clean.replace(/<meta[^>]*>/gi, '');
  clean = clean.replace(/<!DOCTYPE[^>]*>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');
  clean = clean.replace(/<img[^>]*src=["']cid:[^"']*["'][^>]*\/?>/gi, '<span …>📎 [image]</span>');
  clean = clean.replace(/(<img[^>]*)(src=["'][^"']*["'])([^>]*>)/gi, (match, pre, src, post) => {
    if (src.toLowerCase().includes('cid:')) return '<span …>📎 image in attachments</span>';
    return match;
  });
  return clean.trim();
}
```
- **HTML vs plain text:** treat as HTML if it matches `/<[a-z!\/]|&(lt|gt|nbsp|amp|quot|#x?\d+);/i`; otherwise render as plain text, preserving whitespace.
- **History snippets:** `sanitizeHtml(body.substring(0, 300))`.
- **Mobile rules**
  - Render with `react-native-render-html`, or a WebView with JavaScript **disabled** and navigation intercepted (links open in the system browser).
  - Allow `data:image/*` sources (inline images arrive as base64).
  - Block remote `<img>` fetches unless they are attachment URLs, which need the Bearer header.
  - Replace `cid:` images with "📎 image in attachments".

### A.7 Activity / audit → human sentence
**Source:** `FE:TicketDetailPage.tsx:2883-2932`. **Backend** supplies the `_xxxName` fields (`tickets.controller.ts:1036-1082`).
```ts
const nv = audit.newValues || {}, ov = audit.oldValues || {};
const assignedName = nv._assignedToName || nv.assignedToId || 'someone';
const statusFormatted = (nv.status || '').replace(/_/g, ' ');
// UPDATED: join of → `renamed to "${nv.title}"`, `priority changed from ${ov.priority ?? '?'} → ${nv.priority}`,
//          `urgency changed from …`, `impact changed from …`, `category → ${nv._categoryName || nv.categoryId}`; empty → 'updated'
const actionLabel = {
  CREATED: `created this ticket${nv._teamName ? ` → ${nv._teamName}` : ''}${nv._assignedToName ? ` / ${nv._assignedToName}` : ''}${nv._categoryName ? ` [${nv._categoryName}]` : ''}${nv._countryName ? ` (${nv._countryName})` : ''}`,
  UPDATED: describeChanges() || 'updated this ticket',
  STATUS_CHANGED: `changed status to ${statusFormatted}`,
  ASSIGNED: nv._autoAssigned ? `auto-assigned to ${assignedName}`
          : ov.assignedToId ? `reassigned from ${ov._assignedToName || ov.assignedToId || 'unassigned'} to ${assignedName}`
          : `assigned to ${assignedName}`,
  COMMENTED: 'added a comment',
  SLA_BREACHED: 'SLA breached',
  ESCALATED: 'escalated ticket',
  ATTACHMENT_ADDED: 'added an attachment',
  DELETED: 'deleted',
};
// line: `${actor?.displayName ?? 'System'} ${actionLabel[action] ?? action} · ${formatDateTime(createdAt)}`
```
- Never display `ipAddress`.
- For END_USER, hide `COMMENTED` entries whose `newValues.type === 'PRIVATE'`. They reveal that internal notes exist (C.1). This is display hygiene, not a security fix.

### A.8 Create-ticket form
**Source:** `FE:pages/tickets/CreateTicketPage.tsx`. **Backend:** only title 3–255 and description ≥1 are enforced. The category is optional server-side.

**Validation**

| Rule | Message |
|---|---|
| `title` required, **3–255 chars** (the server needs 3) | "Title is required" (mobile adds a min-3 check, matching the server) |
| `description` required | "Description is required" |
| A category must be selected | toast "Please select a Category" |

**Category cascade**, verbatim (`:78-97`); the source is `GET /categories?flat=true` (LKP-1):
```ts
const topCategories = categories.filter(c => c.level === 'CATEGORY' || (!c.level && !c.parentId));
const subCategories = selectedTopCatId ? categories.filter(c => c.parentId === selectedTopCatId && (c.level === 'SUBCATEGORY' || !c.level)) : [];
const items         = selectedSubCatId ? categories.filter(c => c.parentId === selectedSubCatId && (c.level === 'ITEM' || !c.level)) : [];
// changing top resets sub+item; changing sub resets item. Each list sorted by name.localeCompare.
// Sub dropdown shown only if subCategories.length > 0; Item only if items.length > 0.
```
- **Submitted `categoryId`** = `selectedItemId || selectedSubCatId || selectedTopCatId`.
- "Auto Category" and "Auto Team" are ordinary rows. If present, selecting them means "let the server decide".

**END_USER payload strip** (verbatim, `:149-167`). Mobile goes further and builds the END_USER payload from an allow-list: `{ title, description, categoryId, source }`.
```ts
if (!isStaff) { delete cleaned.priority; delete cleaned.impact; delete cleaned.urgency; }
```

**Staff-only fields** (`isStaff = role !== 'END_USER'`, which includes L2)
- **Impact** and **urgency**: options as in A.3.
- **Priority display**, recomputed from `GET /priority-matrix` when both are set. That endpoint is ADMIN/AGENT only, so L2 can't preview; show "Auto".
- **Team:** first option "Auto (from category)".
- **Assign To:** members of the selected team, else user search with END_USERs filtered out.
- **Mode**, **Level**, **Source**: options verbatim below. **The server drops `level` and `mode` on create** (B.13), so mobile omits them in the MVP.
  ```
  Mode:   ''→Not Set, PHONE→Phone, EMAIL→Email, WALK_IN→Walk-in, SELF_SERVICE→Self-service, CHAT→Chat
  Level:  ''→Not Set, LEVEL_1→Level 1, LEVEL_2→Level 2, LEVEL_3→Level 3
  Source: WEB_FORM→Web Form, EMAIL→Email, PORTAL→Portal, API→API
  ```

**Staff auto-preview** (`:99-130`)
- Walk up from the deepest selected category.
- Pre-select the first `defaultTeamId`.
- Pre-select the first `defaultAssigneeId` **only if** that user is a member of that team (from `GET /teams`).
- **END_USER banner** after a category is chosen: "Your ticket will be automatically routed to the appropriate team based on the selected category."

**Defaults:** web `priority: 'MEDIUM'`, `source: 'WEB_FORM'`. **Mobile:** `source: 'API'` (D5).

**After submit** (`:168-189`)
1. `POST /tickets` (TKT-2).
2. If files are staged: `POST /tickets/{id}/attachments`. On failure, toast "Ticket created but some attachments failed to upload".
3. Invalidate the ticket and dashboard queries.
4. Toast "Ticket created successfully".
5. Navigate to the detail screen.
- **On error:** show `response.data.error` or "Failed to create ticket".

### A.9 SLA display
**Source:** `FE:pages/tickets/TicketsListPage.tsx:30-57` (list), `FE:components/ui/SLABadge.tsx:3-39` (detail). **Backend:** the same hold logic exists in `utils/sla.ts:1-59`, but the API returns only raw fields.

**Hold-adjusted status** (verbatim). **Mobile uses this on BOTH the list and the detail screen**; the web detail page doesn't, and the two web screens disagree (D6).
```ts
const HOLD_STATUSES = ['ON_HOLD','PENDING','PENDING_MGMT_REVIEW','PENDING_MASTER_DATA','PENDING_PARTNER','PENDING_USER_CONFIRM','PENDING_USER_INFO'];
function effectiveResolveDue(t) {
  if (!t.slaResolveDue) return null;
  const due = new Date(t.slaResolveDue);
  if (!HOLD_STATUSES.includes(t.status)) return due;
  const pastHoldMs = (t.slaHoldMinutes ?? 0) * 60000;
  const ongoingHoldMs = t.slaHoldStartedAt ? (Date.now() - new Date(t.slaHoldStartedAt).getTime()) : 0;
  return new Date(due.getTime() + pastHoldMs + ongoingHoldMs);
}
function getDisplaySlaStatus(t) {
  const now = new Date();
  const responseMissed = !!t.slaResponseDue && !t.firstResponseAt && new Date(t.slaResponseDue) < now;
  const effDue = effectiveResolveDue(t);
  const resolutionMissed = effDue ? (t.resolvedAt ? new Date(t.resolvedAt) > effDue : effDue < now) : false;
  if (resolutionMissed && responseMissed) return { status: 'BREACHED', breachType: 'both' };
  if (resolutionMissed) return { status: 'BREACHED', breachType: 'resolution' };
  if (responseMissed)   return { status: 'BREACHED', breachType: 'first_response' };
  return { status: t.slaStatus === 'BREACHED' ? 'WITHIN_SLA' : t.slaStatus, breachType: null };
}
```
- **Breach labels:**
  - `first_response`: "First Response SLA Breached"
  - `resolution`: "Resolution SLA Breached"
  - `both`: "First Response & Resolution SLA Breached"
  - else: "Breached"
- **Caveat:** the server already extends `slaResolveDue` by the hold time when a ticket leaves a hold (`tickets.controller.ts:861-881`) and *also* accumulates `slaHoldMinutes`. The web formula adds `slaHoldMinutes` again while a ticket is back on hold, so it can over-extend. Copy it as-is for parity and flag it (B.27).
- **"Unread reply" highlight:** emphasise a list row when `lastRequesterReplyAt` is non-null (`TicketsListPage.tsx:615-622`).

### A.10 Labels and colours (verbatim maps)
**Status** (`FE:components/ui/StatusBadge.tsx:4-17`):
```ts
OPEN:'Open' (blue) · IN_PROGRESS:'In Progress' (yellow) · PENDING:'Pending' (orange) · ON_HOLD:'On Hold' (slate)
PENDING_MGMT_REVIEW:'Pending with Management Review' (purple) · PENDING_MASTER_DATA:'Pending with Master Data Team' (indigo)
PENDING_PARTNER:'Pending with Partner' (amber) · PENDING_USER_CONFIRM:'Pending with User for Confirmation' (cyan)
PENDING_USER_INFO:'Pending with User for Info' (teal) · RESOLVED:'Resolved' (green) · CANCELED:'Canceled' (red) · CLOSED:'Closed' (zinc-700 bg, white text)
fallback: raw value, gray
```

**Priority** (`FE:components/ui/PriorityBadge.tsx:3-8`):
```
LOW 'Low' gray · MEDIUM 'Medium' blue · HIGH 'High' orange · URGENT 'Urgent' red
```

**SLA** (`SLABadge.tsx`):
```
WITHIN_SLA 'Within SLA' green · DUE_SOON 'Due Soon' yellow · BREACHED 'Breached' (or breach label) red
```

**Detail chips**
- Impact: HIGH red, MEDIUM yellow, else green.
- Urgency: URGENT red, HIGH orange, MEDIUM yellow, else green.
- Header source chip: `source === 'EMAIL' ? 'Email Request' : 'Incident Request'`.

**Approval chip:** APPROVED green, REJECTED red, CANCELLED gray, else yellow.

**Exact shades and brand colours** (Phase B, 2026-10-20): `docs/brand/WEB-TOKENS.md` lists every badge pair (`<hue>-100` background, `<hue>-700` text, except CANCELED `red-600` and CLOSED `zinc-700`/white), the KPI tile colours and the brand red `#D21121` / yellow `#FFCC00`, each with its web source line. The mobile copies live in `src/theme/colors.ts`.
- Web brand inconsistencies (report only, R3): `index.html:7` and `public/manifest.webmanifest:5` still set `theme-color` to blue `#2563eb`; `components/ui/Button.tsx:12` gives the red primary button `hover:bg-blue-600`.

**Name formatting** (`TicketsListPage.tsx:21-26`): if a display name contains `@`, take the part before `@`, turn `[._-]+` into spaces, and title-case it.

**Dates** (`FE:utils/formatDate.ts`)
- Device timezone.
- `dd MMM yyyy`; date-time `dd MMM yyyy, HH:mm`; relative "x ago" via date-fns.
- `Country.timezone` and `dateFormat` are unused.

### A.11 Ticket number → ticket (deep links)
**Source:** `FE:pages/tickets/TicketRedirectPage.tsx`. **Backend:** there is no by-number endpoint (ask A8).
1. `GET /tickets?search=<number>&limit=5`. The web sends `pageSize`, which is ignored.
2. Open the result whose `ticketNumber === number`, else the first result; with no results, go to the list.
- Normal list scoping applies, so an END_USER can only resolve their own tickets.
- **AGENT/L2 gotcha:** a digits-only search uses the exact-number branch, not the text-search branch, so the scope bug (C.7) does not apply here.

### A.12 Country selector
**Source:** `FE:components/CountrySelector.tsx:28-134`, `FE:store/country.store.ts:24-30`. **Backend:** list scoping only (`tickets.controller.ts:88-110`). The "country-locked agent" rule is **UI-only**.
```ts
const isAdmin = role === 'ADMIN';
const isTriageAgent  = role === 'AGENT' && !user.countryId;
const isCountryAgent = role === 'AGENT' && !!user.countryId;
const canSwitch = isAdmin || isTriageAgent;
```
- **Country agent:** forced to their own country, with a lock icon and tooltip `Locked to …`.
- **Others:** default `null` = "All Countries".
- **List source:** triage agent → `GET /countries/my-countries`; others → `GET /countries`.
- **Hidden for L2_MANAGER**; shown read-only for END_USER.
- The value is sent only as `countryId` on TKT-1 and DSH-1. "All" sends `countryId=` (empty) for a triage agent.
- The web persists it in `localStorage['sd-country']`. **Mobile clears it on logout**; the web doesn't.
- **"Triage" has two definitions:** UI = AGENT without a countryId; server = email in `TRIAGE_USER_EMAILS`. Mobile can't see the server one (ask A4).

### A.13 Session UX
**Inactivity logout** (`FE:hooks/useInactivityLogout.ts`)
- 60 min idle, with a warning toast at 55 min: `You will be logged out in 5 minutes due to inactivity`.
- Then `POST /auth/logout` and redirect `/login?reason=inactivity`, which shows "You were signed out due to inactivity. Please sign in again."
- Activity events are throttled to one per 30 s.
- **Server has no idle timeout.** For the mobile policy see `02-AUTH.md` §5.6 (D7).

**Login error messages** (`FE:pages/auth/LoginPage.tsx:16-25`, verbatim; reuse for the mobile SSO flow where they apply):
```
oauth_denied: 'Microsoft sign-in was cancelled or denied.'
oauth_failed: 'Microsoft sign-in failed. Please try again.'
oauth_not_configured: 'Microsoft sign-in is not configured.'
oauth_state_mismatch: 'Sign-in session expired. Please try again.'
account_deactivated: 'Your account has been deactivated. Contact IT support.'
inactivity: 'You were signed out due to inactivity. Please sign in again.'
```

### A.14 Password rules (local-auth environments only)
**Source:** `FE:pages/auth/ChangePasswordPage.tsx:63-70, 89-92`. **Backend:** only length ≥ 8.
```ts
newPassword: required 'New password is required'; minLength 8 'Password must be at least 8 characters';
             pattern /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/ 'Must contain uppercase, lowercase and a number'
confirmPassword: must equal newPassword 'Passwords do not match'
```

### A.15 Tasks panel
**Source:** `FE:TicketDetailPage.tsx:627-634, 1364-1435, 2259-2297`.
- Add is disabled when the title is blank.
- Payload: `{ title: title.trim(), description: description.trim() || undefined, dueDate }`.
- **Due date format bug in web:** the web sends `YYYY-MM-DD`, which the server's `z.string().datetime()` rejects with 400. **Mobile sends a full UTC ISO string** (`2026-10-12T00:00:00.000Z`).
- Toggle: `PUT … { status: COMPLETED ↔ OPEN }`.
- Delete asks "Remove this task?".

### A.16 Rich-text input
**Source:** `FE:components/ui/RichTextEditor.tsx:56-74, 109, 205-226`.
- The web embeds pasted or picked images as base64 `data:` URLs, with **no size check**. The JSON body limit is 2 MB.
- **Mobile:** plain-text or minimal-formatting input. Images go as **attachments** (ATT-2), never inline.
- Wrap plain text as `<p>…</p>` with escaped characters so it renders the same on web.
- **Web "empty" test:** `!value || value === '' || value === '<p></p>' || value === '<br>'`.

### A.17 Service request form (Phase 2)
**Source:** `FE:pages/service-catalog/ServiceRequestFormPage.tsx`.
- **`formFields` renderer** (`:183-235`): array of `{ name, label, type, required?, placeholder?, options? }`.
  - Types: `text` (default), `textarea`, `date`, `phone`, `email`, `number`, `select`.
  - `options` are strings or `{ value, label }`.
  - The only check is `required`, with message `` `${label} is required` ``.
- **Subject** is required ("Subject is required").
- **Hard-coded priority map** (`:110-122`). It differs from the server matrix; **do not copy it**. The server ignores impact and urgency on this endpoint anyway (B.24):
  ```ts
  HIGH:{HIGH:'URGENT',MEDIUM:'HIGH',LOW:'HIGH'}, MEDIUM:{HIGH:'HIGH',MEDIUM:'MEDIUM',LOW:'MEDIUM'},
  LOW:{HIGH:'MEDIUM',MEDIUM:'LOW',LOW:'LOW'}, MINIMAL:{HIGH:'LOW',MEDIUM:'LOW',LOW:'LOW'}
  ```
- **Mobile sends only** `{ serviceItemId, priority?, formData, notes? }`, which is what the server keeps.

### A.18 Decisions needed (Ronit)
| ID | Question | Proposed default |
|---|---|---|
| D1 | Status changes: copy only the transition map, or also the web's "any status" Properties select? | **Map only** |
| D2 | L2_MANAGER: the web shows assign, team and country controls that the server rejects or ignores. Hide them on mobile? | **Hide** |
| D3 | END_USER editing `resolution` (web allows it): keep? | **No** (read-only) |
| D4 | END_USER task add/toggle/delete (web allows it, no server checks): keep? | **No** (read-only) |
| D5 | `source` value for mobile-created tickets until A15 | **`API`** |
| D6 | SLA badge: use the list's hold-adjusted logic on the detail screen too? | **Yes**, one function everywhere |
| D7 | Idle logout on mobile? | **No**; optional biometric app-lock instead |
| D8 | END_USER list: send `countryId=` (all their tickets), or default to the profile country like the web? | **`countryId=`** (all their own tickets) |

---

## B. BACKEND GAPS THE MOBILE APP MUST WORK AROUND

| # | Gap (evidence) | What it means for mobile | Workaround | Removed by |
|---|---|---|---|---|
| B.1 | **`PUT /tickets/:id {status}` is silently stripped.** `status` is not in `updateTicketSchema` (`modules/tickets/tickets.validator.ts:35-37`). The web Kanban relies on it (`FE:KanbanPage.tsx:159-161`) and shows "updated" | A status sent via PUT returns 200 and changes nothing | **Only ever change status through `POST /tickets/:id/status`** (TKT-6). No Kanban drag on mobile | A6 |
| B.2 | **No transition rules and no required closure fields** (`tickets.controller.ts:841-994`) | The server accepts anything | Enforce A.1–A.2 in the client | A6 |
| B.3 | **SSE stream never delivers events.** `subscriber.subscribe(channel, cb)` passes the handler as the ioredis completion callback; no `on('message')` is attached (`modules/notifications/notifications.controller.ts:58-62`). Clients get `data: null` once, then heartbeats. PM2/NSSM restarts at 03:00 and IIS buffering add to the problem | No real-time channel | Don't use SSE. Poll `GET /notifications/count` on foreground and every ≥60 s while foregrounded. Refetch the open ticket on focus and pull-to-refresh | A12 / A5 |
| B.4 | **No push infrastructure:** no device-token table, no endpoint, no sender | No notifications when the app is closed | MVP: badge plus in-app list, refreshed on open. Set expectations in release notes | A5 |
| B.5 | **Dead automations:** escalation rules, `ClosureRule` (mandatory fields, auto-close days, require-survey), business-rule triggers other than inbound-email create, preventive maintenance, scheduled reports and survey triggers never execute | Settings in the admin UI do nothing | Don't surface them. Closure requirements come from A.2, not `/closure-rules` | backend |
| B.6 | **8 h absolute session, no refresh** (`config/index.ts:15`) | Forced re-login every 8 h | `02-AUTH.md` §5.4: pre-emptive re-login prompt, local drafts | A3 / A2 silent re-auth |
| B.7 | **Pagination:** four shapes; `pageSize` ignored on `/tickets`; non-numeric `page`/`limit` gives 500 (`utils/pagination.ts:16-20`) | Easy to get 25 rows when you asked for 20, or a 500 | One adapter (`01` §0.3). Always send integer `limit` | A9 / A17 |
| B.8 | **Unknown GET → 200 `index.html`; unknown non-GET → HTML 404** in production (`app.ts:167-178`) | A typo looks like success | Reject `text/html` responses | A11 |
| B.9 | **Prisma and multer errors → 500 `Internal server error`:** not-found on update/assign, unique conflicts, file too big, blocked extension, too many files (`middleware/errorHandler.middleware.ts:24-32`) | No useful error for the user | Validate on the client before sending: file size ≤ 25 MB (until `00` B6), max 10 files, blocked extensions `.exe .bat .cmd .sh .php .py .js`, UUIDs only from server data | A11 |
| B.10 | **No ticket lookup by number** | Email and push links carry `#1234` | A.11 search workaround | A8 |
| B.11 | **Reply attachments are linked only for PUBLIC comments that produce an email.** The linking block sits inside `if (filteredRecipients.length > 0)` (`modules/comments/comments.controller.ts:158-175`). Private-note attachments stay ticket-level. Removing To/CC chips does not stop emails to original-thread participants | A note's files won't show under that note | Show all ticket attachments in an Attachments tab (ATT-1). Don't promise "attached to this note". Warn staff that public replies email the whole original thread | backend |
| B.12 | **Activity endpoint returns ALL comments on EVERY page;** only audit entries paginate (`tickets.controller.ts:1010-1030`) | Duplicates when paging | De-duplicate by `id` + `_type`. For long tickets, consider CMT-1 for the conversation and TKT-7 for history | backend |
| B.13 | **`level` and `mode` dropped on create** (`tickets.controller.ts:387-404`); body `countryId` ignored on create | Data loss | Don't collect them in the MVP | backend |
| B.14 | **`POST /tickets/:id/assign`:** unknown ticket → 500; `teamId:null` cannot clear the team; team = assignee's arbitrary first team; no team-membership check (`tickets.controller.ts:790-839`) | Surprising team changes | Pass `teamId` explicitly when known. Refetch after assigning | backend |
| B.15 | **Category tree mode returns inactive and unordered children** (`modules/categories/categories.controller.ts:30-37`) | Retired categories appear | **Use `GET /categories?flat=true`** (`isActive` filtered at every level), build the tree client-side, ignore the nested `children` arrays | backend |
| B.16 | **Heavy list payload:** each ticket row includes tasks, a 3-level category chain and requester details | Slow on mobile data | `limit` 20, cache with TanStack Query, avoid refetch storms | A9 |
| B.17 | **`lastRequesterReplyAt` is only guaranteed on the list endpoint** (raw-SQL merge, `tickets.controller.ts:166-178`) | The detail view may lack it | Use it only for list highlighting | A16 |
| B.18 | **Several writes complete after the response is built:** TKT-4 assignment `firstResponseAt`/`slaStatus`; TKT-6 `closureComments` comment (`_count` one short); service-request approvals (`[]` in the 201) | Stale UI after a write | Invalidate and refetch TKT-3 / TKT-7 after every write | backend |
| B.19 | **Rate limit keyed by IP for Bearer clients** (`app.ts:94-102`) | Office NAT shares 300 req/min | Conservative polling (≥60 s), cache aggressively, back off on 429 | A14 |
| B.20 | **Dashboard `/all` scoping and caching defects:** L2 cache shared by role; `...scope` overwrites make some widgets global for AGENT/L2 when no `countryId` is sent; `countryGroupRows` is unscoped (`modules/dashboard/dashboard.controller.ts:244-425`) | Numbers can include tickets outside the user's scope | MVP shows only `kpis` fields that are correctly scoped (`total`, `open`, `inProgress`, `onHold`, `resolved`, `slaBreached`, `totalOpen`, `currentlyOpen`) and the `recent` list. Hide the technician/team widgets | backend |
| B.21 | **Requester replies do not reopen RESOLVED tickets.** Only the 48 h auto-close job exists (`jobs/autoCloseResolved.job.ts`) | An END_USER cannot reopen through the UI (no status bar) | Tell END_USERs to reply. Staff reopen through A.1 (`RESOLVED → OPEN`) | A6 (define END_USER reopen) |
| B.22 | **Approvals:** ticket approvals carry no ticket data; approving or rejecting **never changes the ticket's status** (it stays `PENDING_MGMT_REVIEW`); each approver's approval notifies the requester (`modules/approvals/approvals.controller.ts:114-247`) | Confusing state after approval | P2: after approve or reject, show "Ticket stays Pending Management Review until an agent moves it". Fetch the ticket by `entityId` | backend |
| B.23 | **Approval and requester notifications use type `TICKET_UPDATED`;** `MENTION` is never produced | Can't route notification taps by type alone | Route taps by `ticketId` | A5 |
| B.24 | **Service request create keeps only `{serviceItemId, priority, formData, notes}`.** It creates no ticket, returns no `ticketId`, and its 201 has `approvals: []` (`modules/serviceCatalog/serviceCatalog.controller.ts:135-159`) | The web form's extra fields and attachments are lost | P2: send only the kept fields. Don't offer attachments on service requests | backend |
| B.25 | **Task `dueDate` must be a UTC `Z` ISO string;** the web sends `YYYY-MM-DD` and gets 400 (`modules/ticketTasks/ticketTasks.controller.ts:12`) | – | Send `toISOString()` | – |
| B.26 | **KB routes never authenticate** (`modules/knowledgeBase/kb.router.ts:14-27`), so staff can't see non-public articles; drafts are reachable | Staff see the same KB as anonymous users | P2: show published public articles only; never use `published=false` | backend |
| B.27 | **SLA hold double-count risk:** the server extends `slaResolveDue` on hold exit **and** stores `slaHoldMinutes`, and the web list formula adds both | The SLA due time shown can be later than the server's | Copy the web formula for parity (A.9); raise with the backend | backend |
| B.28 | **Stale identity:** `/auth/me` reads the Redis cache; `PUT /users/:id` doesn't refresh it | A name change doesn't show until re-login | Update the local store from the USR-2 response | A13 |
| B.29 | **Schema drift:** `users.mustChangePassword` is not in `schema.prisma`; `POST /users/change-password` writes it via raw SQL and can 500 where it's missing | Change-password may fail | Only show change-password when `localAuthEnabled`; handle 500 | A16 |
| B.30 | **`suggested-assignees` includes inactive users** and only exact-country mappings (`tickets.controller.ts:503-529`) | Deactivated techs may be offered | Cross-check against `GET /teams/:id` members or `users/search` (active only) before offering. If unsure, show them last | backend |
| B.31 | **`/categories/resolve-assignee` probably prefers "All Sites" over the country mapping** (`ORDER BY countryId DESC` puts NULLs first, `modules/categories/categoryCountryAssignee.controller.ts:172-185`) | Wrong preview | Don't use it for previews; use A.8's default-team logic | backend |
| B.32 | **Daily forced restart at 03:00** (`ecosystem.config.js` `cron_restart`) and single-instance Node | Brief outages; a network error or 502 from IIS | Treat network errors and 502/503 as transient; retry GETs only | backend |
| B.33 | **The web client calls dead or wrong endpoints:**<br>• `/tickets/:id/link-problem`, `/tickets/:id/link-change` (`FE:api/tickets.api.ts:79-89`)<br>• `/attachments?ticketId=`<br>• `GET /announcements/:id`<br>• `POST /surveys/:id/respond`<br>• CAB update/remove with the wrong id<br>• service-request status via PUT<br>• KB `search` on the list endpoint<br>Full list: `01` §0.6 | Copying web calls blindly breaks things | Use only `01` | – |
| B.34 | **IIS upload limit unknown** (default ~28.6 MB vs the app's 50 MB) | Large uploads may fail at IIS with an HTML error | Client cap 25 MB until `00` B6 is resolved | B6 |

---

## C. SECURITY FINDINGS — REPORT ONLY, DO NOT FIX

> ### ⚠ These are the WEB TEAM's to fix. The mobile app must:
> 1. **NOT rely on them.** Never build a feature that only works because a check is missing.
> 2. **NOT exploit them.** Never call an endpoint for data the user's role should not see. Never send fields the web UI does not send for that role (`01` lists the allowed fields per role).
> 3. **NOT attempt to patch them.** No client-side "security" filtering presented as a fix, and no proxy. Client-side role gating mirrors the web UI for **UX only**; the server remains the authority.
>
> They are listed because a mobile app hands every user a reusable Bearer token. That makes direct API calls trivial and turns these from latent into practical issues. Backend ask **A7** covers the fixes.

| # | Finding | Evidence | Who can exploit | Severity |
|---|---|---|---|---|
| C.1 | **Ticket sub-resources have no access check.** Any authenticated user can read any ticket's **activity** (all audit entries incl. `ipAddress`, and existence of private notes), **SLA**, **email recipients** (email addresses) and **suggested assignees** by ticket UUID | `tickets.controller.ts:996-1169, 503-529` | END_USER | High |
| C.2 | **Comments:** any user can **list PUBLIC comments of, and post on, any ticket** | `modules/comments/comments.controller.ts:19-48, 50-62` | END_USER | High |
| C.3 | **Tasks:** no role or access check on any route; anyone can create, edit or delete tasks on any ticket | `modules/ticketTasks/ticketTasks.controller.ts` (all) | END_USER | Medium |
| C.4 | **Attachments:** upload to any ticket by any role; download/view never check the attachment belongs to `:ticketId`; END_USER check skipped when `attachment.ticketId` is null; `storagePath` (server disk path) returned; AGENT/L2 can delete any attachment | `modules/attachments/attachments.controller.ts:70-157` | END_USER / staff | High |
| C.5 | **END_USER privilege fields:** on create, `assignedToId`, `teamId`, `priority`, `slaPolicyId`, `impact`, `urgency`, `source` are accepted; on update (own ticket), any schema field incl. **`requesterId`**, assignee (skips the team-membership check), team, SLA policy; via `/status`, **any status** plus raw unvalidated `teamId`, `categoryId`, `assignedToId` | `tickets.controller.ts:185-469, 531-788, 841-909` | END_USER | High |
| C.6 | **AGENT is unscoped** on `GET/PUT /tickets/:id`, `/assign`, `/status`; **L2_MANAGER is unscoped on `/status`** | `tickets.controller.ts:471-501, 531-550, 790-847` | AGENT / L2 | High |
| C.7 | **Text search drops the role scope** for AGENT (when no non-empty `countryId` is sent) and L2_MANAGER. `where.OR` for search overwrites the scope `OR` (verified) | `tickets.controller.ts:110-113, 143-148` | AGENT / L2 | High |
| C.8 | **`GET /users/lookup-azure` returns the full user row including `passwordHash`**, and auto-creates unknown Azure users as **AGENT**; the email is interpolated unescaped into an OData filter | `modules/users/users.controller.ts:150-197` | ADMIN | High |
| C.9 | **`POST /users/change-password` needs no current password;** other sessions are not revoked | `users.controller.ts:339-350` | anyone with a token | Medium |
| C.10 | **Non-admins can change their own `countryId`** via `PUT /users/:id`, which changes their ticket scope | `users.controller.ts:15-23, 123-139` | any | Medium |
| C.11 | **Revocation gap:** the Redis session fast path never re-checks `isActive` or `role`. Deactivation and role changes take effect only when the cached key expires (≤ 8 h) | `middleware/auth.middleware.ts:24-27`; `users.controller.ts:141-147` | deactivated users | High |
| C.12 | **VERIFY: possible cross-environment session acceptance.** The cache key is `session:<token>` with no environment component. PROD, UAT and QA share one Memurai instance (`Production-Build/docs/DEPLOYMENT-GUIDE.md:37-38`). If they share a Redis DB index, a token minted on UAT would pass PROD's fast path | `auth.middleware.ts:18`; `00-OVERVIEW.md` B3/B7 | anyone with a UAT login | High if confirmed |
| C.13 | **`/auth/test-login` skeleton key:** always mounted, gated only by the `TEST_AUTH_SECRET` header, accepts any email, **no `isActive` check**. Whether the secret is set in production is unknown | `app.ts:117`; `modules/auth/auth.controller.ts:67-97` | holder of the secret | High if set in prod |
| C.14 | **Query-builder filter injection:** the `equals` value is passed verbatim into a Prisma `where`, allowing relation filters such as probing `requester.passwordHash` | `modules/queryBuilder/queryBuilder.controller.ts:41` | ADMIN / AGENT | High |
| C.15 | **Knowledge base unauthenticated:** drafts listable (`published=false`) and readable by slug; non-public category names exposed; `helpful` votes unlimited | `modules/knowledgeBase/kb.router.ts:14-27`, `kb.controller.ts:53-150` | anonymous | Medium |
| C.16 | **`GET /approvals` unscoped** (END_USER sees all approvals) | `modules/approvals/approvals.router.ts:9` | END_USER | Medium |
| C.17 | **Stored XSS risk:** `/attachments/:id/view` serves the **client-declared** `Content-Type` inline (HTML/SVG allowed; only 7 extensions blocked); CSP is disabled (`app.ts:67-69`); comment and description HTML is stored unsanitised | `attachments.controller.ts:127-144`; `middleware/upload.middleware.ts:27-35` | any uploader | High |
| C.18 | **PLAUSIBLE (untested): upload path traversal.** The multer `destination` joins `UPLOAD_DIR` with the decoded `req.params.ticketId` and creates the directory **before** the ticket existence check, so an encoded `..%2F` segment may write outside `UPLOAD_DIR`. Files are also left on disk after the 404 | `middleware/upload.middleware.ts:12-20`; `attachments.controller.ts:76-79` | any | High if confirmed |
| C.19 | **Dashboard leaks:** L2 cache keyed by role (one L2 manager can see another's dashboard); scope overwrites make widgets global; `countryGroupRows` unscoped | `modules/dashboard/dashboard.controller.ts:244-425` | AGENT / L2 | Medium |
| C.20 | **Availability:** a zip-stream error is thrown inside an event handler → uncaught exception → `process.exit(1)` | `attachments.controller.ts:58`; `server.ts:39-42` | any | Medium |
| C.21 | **Availability:** the SLA calculator can loop forever when a policy has `businessDays=[]` or start ≥ end (the zod schema allows both) | `modules/sla/sla.calculator.ts` | ADMIN (config) | Medium |
| C.22 | **Secrets hygiene:** `.env.production` holds real secrets and is **not** git-ignored ([REDACTED - present in .env.production]); `.env.example` has non-placeholder-looking passwords ([REDACTED - present in .env.example]); `dump.rdb` (Redis dump, may hold live session tokens) sits in the repo folder | repo root | anyone with the folder | High |
| C.23 | **Minor information leaks:** `GET /users/:id` returns 404 before 403 (ID enumeration); login returns raw LDAP error messages; `/categories/resolve-assignee` exposes technician emails to END_USER; Swagger UI is public | `users.controller.ts:94-109`; `auth.controller.ts:45-48` | any | Low |
| C.24 | **`POST /api/v1/ai/summarise` discloses PRIVATE (internal) notes. The most severe finding in this table.** Any authenticated role, END_USER included, sends `{ ticketId }`. There is no role guard and no ownership or team-scope check: the controller never reads `req.user` and loads any ticket by ID. The ticket's first 20 comments go to the LLM with **no `type` filter**, so the returned `{ summary }` is built from internal notes. **It is the only route that gives END_USER the content of PRIVATE notes:** the comments list and the activity feed both withhold them from END_USER. (`/ai/draft-reply`, added the same day, does filter `PUBLIC`; summarise never has.) Comment bodies reach the model unescaped, so a requester's own comment can steer it to reproduce notes instead of paraphrasing them. **Reachable from the web UI itself, no crafted request needed:** the same commit adds an "AI Summary → Generate" panel that shows for every role on the ticket page. Ticket content, internal notes included, is also sent to a third-party LLM API. On web `master` since `2ee7333` (2026-10-09); which environments run it is unverified (`07-DRIFT-CHECK.md` Q6) | `modules/ai/ai.router.ts:8`; `modules/ai/ai.controller.ts:213-253` (comment select `:224-228`; contrast draft-reply `:271`); rules it bypasses: `modules/comments/comments.controller.ts:24`, `modules/tickets/tickets.controller.ts:1014`; UI: `FE:pages/tickets/TicketDetailPage.tsx:838`, `FE:components/ai/AISummaryPanel.tsx:43-49` | END_USER: any ticket by UUID, and their own tickets with one click in the web UI. (L2_MANAGER can call it too, but already receives PRIVATE notes through TKT-7, `01` TKT-7 / C.1) | **Critical (fix first)** |
| C.25 | **`POST /api/v1/ai/draft-reply` and `POST /api/v1/ai/analyse` have no role or scope check.** draft-reply returns an LLM reply built from **any** ticket's title, description, requester and assignee names and PUBLIC thread, by ticket UUID. analyse returns a suggested team and up to 3 technicians (names and user IDs) to any role. Each call is a paid third-party API request; only the generic 300/min limiter applies | `modules/ai/ai.router.ts:7, 9`; `modules/ai/ai.controller.ts:127-209, 257-325` | END_USER | Medium |

**Mobile-side rules that follow from §C** (hygiene, not fixes)
- Call ticket sub-resources (TKT-7..10, CMT-*, ATT-*, TSK-*) only for a ticket the user has **already opened successfully** with TKT-3 in this session.
- Build request bodies from **per-role allow-lists** (`01` TKT-2/TKT-4/TKT-6, USR-2). Never spread form state into a body.
- Never render attachment content of type `text/html`, `image/svg+xml` or `application/xhtml+xml` in a WebView. Offer download or share instead.
- Never log tokens, attachment URLs with tokens, or `storagePath`.
- If a tester finds a way to see data they shouldn't, **file it for the web team (A7) — don't code around it.**
