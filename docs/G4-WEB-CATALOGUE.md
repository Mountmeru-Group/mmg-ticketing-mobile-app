# G4 — How the web portal does the service catalogue

**Phase G4, 2026-10-22.** Read-only inspection of the web repo clone at HEAD `d7f3887` (`git status` clean; byte-for-byte
unchanged before and after: SHA-1 of every file in the clone outside `node_modules` and `.git`, 840 files).

This file records what the web portal **actually does** for the service catalogue: browsing, the request form with its
dynamic fields, and "My Requests". Every statement cites the source. Where the source does not settle something, this
file says so. §9 lists what mobile does differently and why.

> **G5 note (2026-10-22):** the §9 row "My Requests for staff: everyone's requests → the person's own" no longer applies. G5 re-read §6's sources and found no ground for the restriction: the server's END_USER-only scoping is deliberate, there is no narrower scope a request could carry, and the web shows no personal data in that list. So mobile now lists every request for staff, as the web does. D4 below stays a description of the web (the "My" label); it is no longer a reason for mobile to differ. Only one's own rows open the detail screen. Full reasoning: `ROLE-MATRIX.md` §14.2.

**Paths**
- `FE:` = `frontend/src/`. `SCP` = `FE:pages/service-catalog/ServiceCatalogPage.tsx` (route `/service-catalog`).
  `SRF` = `FE:pages/service-catalog/ServiceRequestFormPage.tsx` (route `/service-catalog/new/:itemId`).
- `BE:` = `backend/src/`. `SCC` = `BE:modules/serviceCatalog/serviceCatalog.controller.ts`. `SCRT` =
  `BE:modules/serviceCatalog/serviceCatalog.router.ts`. `schema` = `backend/prisma/schema.prisma`.
- Line numbers are as of today.

**Two facts that apply throughout**
- The web has no route guards; role checks are UI-only (`docs/ROLE-MATRIX.md` §1). Here the server checks only that the
  caller is signed in, except for the admin and staff-only writes listed in §7.
- The deployed bundle matches this source: `Production-Build/frontend/assets/ServiceRequestFormPage-zWTua5r8.js` and
  `ServiceCatalogPage-DBvHOy3e.js` contain the same field-type strings (`"textarea"`, `"date"`, `"phone"`, `"email"`,
  `"number"`, `"select"`), "Enter phone number", "is required", "Subject is required", "Add Request" and "No service
  requests yet".

---

## 1. Where it lives and who sees it

| Question | Web behaviour | Source |
|---|---|---|
| Sidebar | **"Service Request"**, for ADMIN, AGENT, END_USER and L2_MANAGER, after Changes and before Announcements | `FE:layouts/AppLayout.tsx:30` |
| Phone-width bottom tabs | **"Requests"** (5th tab: Dashboard · Tickets · Alerts · Knowledge · Requests), every role | `FE:layouts/AppLayout.tsx:261-267` |
| Routes | `/service-catalog` (catalogue and My Requests) and `/service-catalog/new/:itemId` (the request form). No guard | `FE:router/index.tsx:145-146` |
| Page title | "Service Request", subtitle "Browse the catalog and request a service" | `SCP:171-172` |
| Two views | Buttons **"Catalog"** and **"My Requests"** at the top right. "Catalog" also clears the selected category and the search | `SCP:174-187`, `:176` |
| Server | Every catalogue read and `POST /requests` need only `requireAuth`: any signed-in role | `SCRT:9, :15, :16, :22, :23, :24` |
| Per-item visibility | **None.** Every active item is returned to every role; `ServiceItem` has no role, team or country field | `SCC:61-71`; `schema:941-960` |
| Per-category visibility | **None.** Every active category, to every role | `SCC:34-41`; `schema:927-939` |

## 2. Browsing

| Question | Web behaviour | Source |
|---|---|---|
| Structure | **Two levels: categories, then items.** Items are not nested further | `schema:927-960` |
| Data | `GET /service-catalog/categories` (SCR-1) and `GET /service-catalog/items` (SCR-2, **no parameters**), each loaded once when the page opens | `SCP:36-43`; `FE:api/service-catalog.api.ts:5, :11` |
| Server order and filter | Active only, ordered by `sortOrder`, for both. SCR-1 also embeds each category's active `services`, which the page **does not use** | `SCC:34-41, :61-71` |
| Pagination | **None.** Both are plain arrays and the page shows them in full | `SCC:40, :70`; `SCP:50-51` |
| Home view | Heading "Choose a category to raise your request", the search box, the breadcrumb **Home**, then a "Categories" list. Shown while no category is selected **and** the search is empty | `SCP:369-407`, `:410` |
| Category row | Icon (`icon` mapped: `mail`, `box`, `globe`, `settings`, `file`; anything else → a box), name, description (when present), **"n item(s)"**, chevron | `SCP:18-20, :420-438` |
| Item count | Counted from the SCR-2 list (`categoryId` equal), not from SCR-1's `services` | `SCP:422` |
| No categories | "No service categories yet." (ADMIN also sees "Create one in admin settings.") | `SCP:416-419` |
| Opening a category | Breadcrumb becomes "Home › <category>"; the list becomes that category's items, with a header "<category>" and "n item(s)". "Home" goes back and clears the search | `SCP:384-397, :446-451` |
| Item row | Icon (same map; anything else → a document), name, description on one truncated line, an amber **"Requires approval"** pill when `requiresApproval`, chevron | `SCP:455-475` |
| Not shown on an item | `estimatedTime`, approvers. There is no cost or SLA field on an item at all | `SCP:455-475`; `schema:941-960` |
| Tapping an item | Opens the request form page: `navigate('/service-catalog/new/<id>')` | `SCP:460` |
| No items | "No matching service templates." | `SCP:454` |
| Search | Box "Search services...". **Client-side**, over the SCR-2 list: the trimmed query, case-insensitive, contained in the item's **name or description**. While it is non-empty the categories list is replaced by matching items from **every** category (still limited to the selected category if one was open). Header "Search: <query as typed>" and "n item(s)" | `SCP:55-66, :373-382, :410, :446-450` |
| Items with no category, or whose category is inactive | Never listed under a category (no category row leads to them); **reachable only by search** | `SCP:57, :410, :446`; `SCC:34-41, :61-71` |
| Loading and errors | No loading or error UI. While loading, the lists are empty, so "No service categories yet." shows until SCR-1 answers; a failed request looks the same | `SCP:36-43, :50-51, :416` |
| Admin | ADMIN sees "+ New Template (admin)": a modal posting name, description, category and "Requires Approval" to `POST /service-catalog/items` (ADMIN only on the server). **No page anywhere lets anyone define form fields**: the modal says to "edit the template in admin", and no admin page reads `formFields` | `SCP:398-405, :482-504`; `SCRT:17`; repo-wide search of `frontend/src` for `formFields` (only the two catalogue pages) |

## 3. The request form page (`SRF`)

The page loads `GET /service-catalog/items/:id` (SCR-3), and also SCR-1, `GET /categories?flat=true` and, for staff,
`GET /teams` (`SRF:47-68`). It shows a spinner until the item arrives (`SRF:178`). Its sections, top to bottom:

| Section | What it holds | Who | Source |
|---|---|---|---|
| Header | Back arrow (to `/service-catalog`), the item's name; a "Select Template" box that only displays the name (not a control) | all | `SRF:248-264` |
| **Request Properties** (collapsible, open by default) | Request Type, Impact, Status (disabled "Open"), Impact Details, Mode, Urgency, Level, Priority (disabled, "-- Auto-calculated --") | **staff**: `isStaff = role !== 'END_USER'` (ADMIN, AGENT, L2_MANAGER) | `SRF:41, :45, :267-318` |
| **Requester Details** | Requester Name (disabled) with "Phone: … \| Department: …"; Assets; Site (disabled); Category, Sub Category, Item; Group; Technician (staff); **Subject** (required); Description | all (Technician: staff) | `SRF:321-402` |
| **Employee Details** (the custom fields) | One row per `formFields` entry. Shown only when there is at least one. The title is `item.formSectionTitle \|\| 'Employee Details'`; `formSectionTitle` is not a `ServiceItem` column, so it is always "Employee Details" | all | `SRF:405-414`; `schema:941-960` |
| **Attachments** | "Add files" and a drop zone | all | `SRF:417-464` |
| **Resolution** (collapsible, closed by default) | One textarea registered as `notes`, placeholder "Add any additional notes for the resolver…" | all | `SRF:467-482` |
| Footer | **"Add Request"** (submit), "Reset", "Cancel" (back to `/service-catalog`) | all | `SRF:485-491` |
| Below the form | "ⓘ This request requires approval before fulfilment." when `requiresApproval` | all | `SRF:493-497` |

**What happens to each field** (the server keeps only `serviceItemId`, `priority`, `formData` and `notes`: zod's
`z.object` drops every other key, `SCC:26-31`)

| Field | Who sees it | Sent by the web? | Kept by the server? | Source |
|---|---|---|---|---|
| Request Type (default "Service Request"), Status ("Open", disabled), Impact Details, Mode (default "Web Form"), Level | staff | **No** (not in the payload) | – | `SRF:72-79, :275-311`; payload `:142-155` |
| Impact (`HIGH` "Affects Business", `MEDIUM` "Affects Department", `LOW` "Affects Group", `MINIMAL` "Affects User") and Urgency (`HIGH` "High", `MEDIUM` "Normal", `LOW` "Low"; **no Urgent**) | staff | Yes (`impact`, `urgency`) | **No**, but they set Priority | `SRF:24-34, :281-305, :147-148` |
| Priority (disabled, auto) | staff | Yes, `priority: data.priority \|\| undefined` | **Yes** | `SRF:149, :312-314`; `SCC:28` |
| Requester Name, Phone, Department, Site | all | No | – (the server uses the signed-in user: `requesterId: req.user.id`) | `SRF:324-338`; `SCC:141` |
| Assets | all | No: a plain input that is **not registered** with the form, so typing in it does nothing | – | `SRF:333-335` |
| Category, Sub Category, Item (ticket categories, LKP-1; Category and Sub Category marked `*` but never checked) | all | Yes (`categoryId`, the deepest chosen) | No | `SRF:339-362, :384-389, :150` |
| Group (marked `*`, never checked). Staff: a select of `GET /teams`, which is 403 for L2_MANAGER, so their list is empty. END_USER: disabled text "Auto-assigned by category" | all | Yes (`teamId`) | No | `SRF:61-68, :347-356, :151` |
| Technician: shows `item.defaultAssignee`, which is not a `ServiceItem` column, so always "(Auto-assigned)" | staff | Yes (`assignedToId`, always empty) | No | `SRF:363-383, :152`; `schema:941-960` |
| **Subject**: prefilled "<item name> : -", **required** ("Subject is required") | all | Yes (`title`) | No | `SRF:95, :391-394, :153` |
| Description: prefilled with the item's description | all | Yes (`description`) | No | `SRF:96, :397-399, :154` |
| **Custom fields** | all | Yes (`formData`) | **Yes** | `SRF:144, :405-414` |
| Attachments | all | Uploaded only `if (req?.ticketId …)`. A service request has no `ticketId` (`schema:962-997`), so **files are never uploaded** and are dropped without a message | No | `SRF:158-165` |
| **Resolution → notes** | all | Yes, `notes: data.notes \|\| ''` (an empty string when blank; not trimmed) | **Yes** | `SRF:145, :474-479`; `SCC:30` |

**Requester details as the web shows them.** After a page load the web's signed-in user comes from `/auth/me`
(`FE:router/index.tsx:70`), whose payload is `{ id, email, displayName, role, ldapSamAccount, countryId }`
(`BE:middleware/auth.middleware.ts:46-53`). It has no phone, department or site, so the web shows "Phone: - |
Department: -" and Site "—" (`SRF:326-337`).

**Prefilling.** Subject and Description are prefilled from the item (`SRF:93-97`). Group and Technician would be
prefilled from `item.defaultTeamId` / `item.defaultAssigneeId` (`SRF:98-103`), which are not `ServiceItem` columns
(`schema:941-960`), so they never are. **No custom field is ever prefilled** (§4).

**Priority.** When Impact and Urgency are **both** chosen, a hard-coded map sets Priority (`SRF:107-122`):

| Impact ↓ / Urgency → | HIGH | MEDIUM ("Normal") | LOW |
|---|---|---|---|
| HIGH | URGENT | HIGH | HIGH |
| MEDIUM | HIGH | MEDIUM | MEDIUM |
| LOW | MEDIUM | LOW | LOW |
| MINIMAL | LOW | LOW | LOW |

- It is not the server's priority matrix (LKP-6); this endpoint never consults that matrix (`SCC:135-159`).
- With only one of the two chosen, Priority stays empty, so `priority` is not sent and the server stores **MEDIUM**
  (`SRF:149`; `SCC:28`). END_USER never has these fields, so their requests are always MEDIUM.
- **The value is sticky:** the effect only ever sets it (`SRF:110-121`). Choosing both, then clearing one, leaves the
  last computed Priority on screen and in the payload. "Reset" clears it (`SRF:237-242`, `reset()` to the defaults at
  `:70-90`).

## 4. The dynamic fields (`formFields`)

**Where the definition comes from.** `ServiceItem.formFields` is free JSON (`Json? @default("[]")`, `schema:950`). The
server never validates it (`formFields: z.any()`, `SCC:22`). **No web page edits it** (§2, Admin), and no seed or
script in the repo sets it (search of `backend/` for `formFields`: the schema and the controller only). So the only
definition of what a field may be is **the renderer** (`SRF:183-235`). The live data on UAT and production was not
inspected (no database access, R2).

**The keys the renderer reads**, and nothing else: `name`, `label`, `type`, `required`, `placeholder`, `options`
(`SRF:183-235`). There is **no** `min`, `max`, `minLength`, `maxLength`, `pattern`, `defaultValue`, help text,
`multiple`, `accept`, or any dependency key.

**Every field type the web supports: seven.** The switch is on the exact string, case-sensitive (`SRF:191-221`):

| `type` | Control | Placeholder | Browser check (§4.2) | Value put in `formData` | Source |
|---|---|---|---|---|---|
| `textarea` | multi-line box, 3 rows | `placeholder` | none | the text as typed | `SRF:192-193` |
| `date` | date picker (`input type="date"`) | none | must be a real date (the picker guarantees it) | `"YYYY-MM-DD"`, or `""` | `SRF:195-196` |
| `phone` | `input type="tel"` | `placeholder ?? 'Enter phone number'` | **none** (no pattern) | the text, line breaks removed | `SRF:198-199` |
| `email` | `input type="email"` | `placeholder` | if not empty, must be a valid e-mail address | the text, **trimmed** | `SRF:201-202` |
| `number` | `input type="number"` (no `min`, `max` or `step`) | `placeholder` | if not empty, must be a number **and a whole number** (the default step is 1) | **the text as typed**, e.g. `"42"`: a string, not a number (`register` has no `valueAsNumber`) | `SRF:204-205, :184-186` |
| `select` | drop-down; first entry `placeholder ?? '-- Select --'` with value `""`; then each option: a string is both value and label, an object gives `value` and `label` | as left | none | the chosen option's value, or `""` | `SRF:207-217` |
| **anything else**: `text`, a missing `type`, a misspelling, `Textarea`, and also `checkbox`, `radio`, `multiselect`, `file`, `time`, `url` … | single-line text box (`input type="text"`) | `placeholder` | none | the text, line breaks removed | `SRF:219-220` |

So the web has **no** checkbox, radio, multi-select, file, time or date-time field: any such `type` renders as a
plain text box.

**Layout of a row.** Label on the left (a red `*` before it when required), the control on the right, the error message
under the control in red (`SRF:224-233`).

### 4.1 Validation (react-hook-form, `register` at `SRF:184-186`)
- **`required`** is the only rule. Any truthy `required` counts (`field.required ? … : false`).
- **Message:** `` `${field.label} is required` `` (`SRF:185`), shown under the field (`SRF:231`).
- **What counts as empty:** react-hook-form 7 (`frontend/package.json:39`, `^7.51.0`) fails `required` only for an
  empty string (and null/undefined). **A value of only spaces passes.** (Library behaviour; `node_modules` is not in
  the clone.)
- **When:** on "Add Request". Every field is checked; every message shows at once; the first failing field gets focus.
  After that first attempt each field re-checks as it changes (react-hook-form defaults `mode: 'onSubmit'`,
  `reValidateMode: 'onChange'`, `shouldFocusError: true`; `useForm` at `SRF:70` sets none of them).
- **The only other rule on the page** is Subject's (`SRF:392`), not a custom field.
- **No** minimum, maximum, length, pattern, format or cross-field rule exists for any type.

### 4.2 Browser checks (HTML constraint validation)
The form has no `noValidate` (`SRF:246`), so the browser checks the input types before react-hook-form runs. If one
fails, the browser shows its own bubble on the first failing field and **the submit does not happen**; no
react-hook-form message shows until it passes. (HTML Standard behaviour, not code in the repo.)
- `email`: a non-empty value must be a "valid e-mail address" (`local@domain`; the domain needs no dot). The browser
  trims spaces from the value first. Empty passes (no `required` attribute: react-hook-form adds none unless asked).
- `number`: a non-empty entry must be a valid number ("12", "-3", "1e3"; not "1.5", "abc" or "1,000"). Decimals fail
  because the default step is 1 from a base of 0. There is no minimum or maximum.
- `date`, `tel`, `text`, `textarea`, `select`: nothing beyond what the control allows.

### 4.3 Conditional fields
**None.** No field's visibility or rule depends on another field: the renderer reads only the field's own keys, and
`watch` is used only for impact, urgency and the category drop-downs (`SRF:108-109, :127-128`).

### 4.4 Defaults and prefilling
**None for custom fields.** `defaultValues.formData` is `{}` (`SRF:87`); every field starts empty and a select starts on
its placeholder. Every rendered field is still submitted: react-hook-form records each registered input's value, so an
untouched field is sent as `""`. "Reset" empties them again (`SRF:237-242`).

### 4.5 Malformed definitions (what the web does; possible because nothing validates `formFields`)
| Definition | Web behaviour | Source |
|---|---|---|
| `formFields` null or missing | No custom-field section | `SRF:405` (`\|\| []`) |
| `formFields` an object that is not an array | `.length` is undefined, so no section | `SRF:405` |
| `formFields` a non-empty string | `.length > 0` passes, then `.map` throws: **the page crashes** | `SRF:405, :411` |
| An entry with no `name` | Registered as `formData.undefined`; all nameless entries share that one key | `SRF:184` |
| Two entries with the same `name` | Two controls bound to one value | `SRF:184` |
| A `name` containing `.` or `[ ]` | react-hook-form treats it as a path, so `formData` gets a nested object or array; the error lookup uses the flat name (`errors.formData[name]`), so **a required error on it is never displayed**, though it still blocks the submit | `SRF:184, :187` |
| No `label` | No label text; the message reads "undefined is required" | `SRF:185, :227` |
| `options` missing | Only the placeholder entry | `SRF:211` |
| `options` a truthy non-array | `.map` throws: the page crashes | `SRF:211` |
| An option that is `null` | `opt.value` throws: the page crashes | `SRF:212-213` |
| An option that is a number or boolean | A blank entry whose value is `""` | `SRF:212-213` |
| An option object with a numeric `value` | Submitted as a string | `SRF:212` |

## 5. Submitting, and what happens next

| Question | Web behaviour | Source |
|---|---|---|
| Confirmation | **None.** "Add Request" submits straight away | `SRF:246, :486-488` |
| Endpoint | `POST /service-catalog/requests` (SCR-5) | `SRF:156`; `FE:api/service-catalog.api.ts:20` |
| Body sent | `{ serviceItemId, formData, notes, impact, urgency, priority, categoryId, teamId, assignedToId, title, description }` | `SRF:142-155` |
| Body kept | `{ serviceItemId, priority (default MEDIUM), formData (default {}), notes }`; the rest is dropped | `SCC:26-31` (05 §B.24) |
| Attachments | Not sent (§3) | `SRF:158-165` |
| Requester | Always the signed-in user; there is no "on behalf of" | `SCC:141` |
| Server checks | The item must exist and be active, else **404 "Service item not found"**; zod 400 otherwise | `SCC:136-138` |
| Approvals | If the item `requiresApproval` **and** has `approverIds`, one PENDING approval per approver, stage 1, 2, 3… in list order. They are created after the request, so the 201's `approvals` is `[]` | `SCC:140-156` |
| Ticket | **None is created**, and no `ticketId` is returned | `SCC:135-159`; `schema:962-997` |
| Notifications, e-mail, audit, SLA | **None** in `createRequest`. Status starts OPEN, priority as sent or MEDIUM | `SCC:135-159`; `schema:970-971` |
| Success message | Toast "Service request submitted", plus " — pending approval" when the item `requiresApproval` (even if it has no approvers, so no approval was created) | `SRF:169` |
| Where it goes | `req.ticketId` is never present, so **back to `/service-catalog`**: the catalogue's Home view (a fresh page: view `browse`, no category, no search) | `SRF:172-173`; `SCP:28-29` |
| Cache | Invalidates `['service-requests']` | `SRF:170` |
| Failure | Toast with the server's `error`, or "Failed to submit request" | `SRF:175` |

## 6. My Requests

| Question | Web behaviour | Source |
|---|---|---|
| Data | `GET /service-catalog/requests?page=1&limit=50` (SCR-4), loaded when the view opens. No status filter | `SCP:44-48` |
| Paging | **None**: only the newest 50 are ever shown | `SCP:46, :52` |
| Whose requests | **END_USER: their own** (the server filters). **ADMIN, AGENT, L2_MANAGER: everyone's**: the server applies no filter for them, though the view is labelled "My Requests" | `SCC:117`; `SCP:185` |
| Order | Newest first | `SCC:120` |
| Columns | **#** `SR-<requestNumber>`, **Service** (item name), **Status**, **Requested** (`createdAt`, browser locale date and time). No requester, priority or approval column | `SCP:333-352` |
| Status display | The raw value with `_` replaced by spaces ("IN PROGRESS"), one blue pill for every status, "OPEN" when missing | `SCP:348` |
| Empty | "No service requests yet" | `SCP:353-355` |
| Rows | **Not clickable** | `SCP:344` |
| How it differs from the ticket list | A separate list of a separate model: no search, filters, sort, SLA, assignee or paging | `SCP:328-361` vs `FE:pages/tickets/TicketsListPage.tsx` |

**Status values.** `ServiceRequest.status` is the ticket status enum (`TicketStatus`, `schema:970`, values
`schema:21-34`), so the values map one-to-one to ticket statuses; there is no linked ticket. Only the staff-only route
`POST /requests/:id/status` changes it, to OPEN, IN_PROGRESS, PENDING, ON_HOLD, RESOLVED or CLOSED (`SCC:171-178`;
`SCRT:26`). **No web page calls that route**: the web's `updateRequestStatus` uses `PUT /requests/:id`, which drops
`status` (`FE:api/service-catalog.api.ts:21-22`; `SCC:161-166`; 01 §0.6 #7), and nothing calls it. So from the web, a
request stays OPEN.

## 7. A request's detail; cancel, edit, comment

| Question | Web behaviour | Source |
|---|---|---|
| Detail screen | **None.** My Requests rows are not links, and `GET /service-catalog/requests/:id` (SCR-6) is defined in the web's API file but **called by no page** | `SCP:344`; `FE:api/service-catalog.api.ts:19`; repo-wide search |
| Where else a request appears | Approvals page: "Service Request: <item name>" for a request approval | `FE:pages/approvals/ApprovalsPage.tsx:79` |
| Form answers after submitting | **Never shown** anywhere in the web UI | (no reader of `formData` in `frontend/src`) |
| Cancel | No UI and no route | `SCRT:22-27` |
| Edit | No UI. `PUT /requests/:id` (notes, priority, formData) exists for ADMIN and AGENT only | `SCRT:25`; `SCC:161-169` |
| Comment | No UI and no model: `ServiceRequest` has no comments relation | `schema:962-997` |
| Assign, change status | No UI. Staff-only routes | `SCRT:26-27`; `SCC:171-191` |
| SCR-6 server rule | 404 "Service request not found"; 403 "Forbidden" for an END_USER who is not the requester; any other role reads any request | `SCC:126-133` |

## 8. Dead code and defects (report only, R3)

- **D1. The catalogue page's own request form is unreachable.** `SCP:192-325` renders a form when `selectedItem` is
  set, but `setSelectedItem` is only ever called with `null` (`SCP:95, :176, :201, :214, :286`); tapping an item
  navigates to `SRF` instead (`SCP:460`). That dead form differs from the live one: it sends `{ serviceItemId,
  formData, notes }` only, shows "Estimated Time: <n> hours" (`SCP:311-316`; the column is minutes, `schema:947`), and
  goes to My Requests after submitting (`SCP:97`).
- **D2. Attachments on the request form are silently discarded** (§3). The user picks files and nothing tells them they
  were not saved. Already 05 §B.24.
- **D3. Most of the request form is inert.** Thirteen controls are never sent or are thrown away by the server (Request
  Type, Status, Impact Details, Mode, Level, Assets, Category, Sub Category, Item, Group, Technician, Subject,
  Description; §3), and four carry a `*` that nothing checks (Requester Name, Category, Sub Category, Group). The Subject
  the user is required to keep is discarded.
- **D4. "My Requests" lists everyone's requests for ADMIN, AGENT and L2_MANAGER** (§6), under a "My" label and with no
  requester column. Already flagged in 01 SCR-4 (⚠).
- **D5. Request status cannot be changed from the web** (§6): the only caller uses a PUT that drops `status`.
- **D6. The success toast says "pending approval" when no approval was created** (an item with `requiresApproval` but
  no `approverIds`, §5).
- **D7. Malformed field definitions can crash the form page** (§4.5): a string `formFields`, a non-array `options`, or a
  `null` option.
- **D8. The priority map is hard-coded and differs from the priority matrix** (§3, 05 §A.17), and it is sticky.
- **D9. No loading or error state on the catalogue**: "No service categories yet." also means "still loading" and
  "failed" (§2).

## 9. What mobile does differently, and why

The governing rule for G4 is Ronit's: reproduce the web's actual behaviour, except where the web shows a control that
fails or exposes data (`docs/WEB-VS-MOBILE-ROLES.md` §5). Where mobile differs, this is why.

| Web | Mobile | Why |
|---|---|---|
| Sidebar "Service Request" and a 5th bottom tab "Requests" | Drawer row **"Service Request"** (the web sidebar's label), after Knowledge base | 04-SCREEN-MAP P2 places it in the drawer; the drawer is the web sidebar's counterpart, and the bottom bar keeps its three tabs (08 §3.1) |
| Request form: the thirteen inert controls and the attachment box (§3, D2, D3) | **Not shown.** Only what reaches the server: the custom fields, Notes ("Resolution", collapsed), and for staff Impact, Urgency and the auto Priority | B.24: send only the kept fields; don't offer attachments. A control whose value is thrown away is not a capability on the web either (the same treatment as the L2 country select, WEB-VS-MOBILE-ROLES §5 note) |
| Requester details: name, "Phone: - \| Department: -", Site "—" | Name and e-mail | The phone, department and site the web shows are always blank (§3) |
| Browser check bubbles first, then all required messages | Every message at once, under its field, plus a line above the button naming the fields | Same rules, same blocking; a phone has no browser bubble. Messages for the browser checks are the app's own wording |
| A required error on a dotted `name` is never displayed (§4.5) | Displayed | The submit is blocked either way; mobile says why |
| Malformed definitions crash the page or produce blank options (§4.5) | Entries without a usable `name`, duplicate names, `null`/number options and a non-array `formFields` or `options` are skipped, and the form says that some fields couldn't be shown | A crash or a blank option helps nobody; the skipped entries are exactly those the web cannot use either |
| No label: "undefined is required" | The field's `name` is used as its label | — |
| An empty `placeholder` (`""`) is kept (`??`), so a phone box shows none and a drop-down's first entry is blank | An empty placeholder counts as none: "Enter phone number" and "-- Select --" | A blank entry helps nobody |
| An inactive item's form opens, then fails with 404 | The form says the service is no longer available, with no submit | 01 SCR-3: "mobile checks `isActive`" |
| My Requests for staff: everyone's requests | **The person's own requests, for every role** | D4, and 01 SCR-4's mobile rule. A 🔒 SAFER row (WEB-VS-MOBILE-ROLES §5) |
| My Requests: the newest 50, no paging | Pages of 50, loaded as the list scrolls | The same rows first; older ones are reachable |
| Status: raw value in one blue pill | The app's status badge (`StatusBadge`, label and colour from 05 §A.10) | Same value; the existing ticket component is reused, as the G4 brief requires |
| No request detail | **A detail screen for the person's own request** (SCR-6): status, priority, dates, the answers, notes, approvals | The G4 brief asks for it; it shows only the requester's own data. ➕ MOBILE ONLY |
| No loading or error state (D9) | Skeleton, error with Retry, offline state | UI-STANDARDS S11 |
| Toast "Service request submitted[ — pending approval]" | The same text (Android toast) | Same wording, including D6 |
