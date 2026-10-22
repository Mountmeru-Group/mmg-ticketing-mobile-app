# G1 — How the web portal edits five ticket fields

**Phase G1, 2026-10-22.** Read-only inspection of the web repo clone at HEAD `d7f3887` (unchanged before and after).

> **G2 update (2026-10-22):** Ronit resolved D1, D2 and D3 below by "match the web" (ROLE-MATRIX §8 items 11, 12 and 2). D1: ADMIN and AGENT now send the matrix `priority` with an impact/urgency change, as the web does. D2: the country stays locked for a country AGENT. D3: the L2 API allow-list no longer has `categoryId` or `teamId`. The rest of this file is the G1 record, unchanged.

> **G5 note (2026-10-22):** the create page's preview (§2, "Create page" and "Create page quirk") is now built on mobile, from this page's preview component (`PriorityPreviewBox`, `target: create`). The quirk is not copied. On the web, after one pair computes a priority, a pair with no matrix row keeps that stale value on screen and in the body, and the server stores it (`CTP:67-72`; `TC:193-201`). Mobile shows, and the server stores, Medium for such a pair: mobile sends no `priority` (01 TKT-2), so the validator's default applies. Recorded as W-G5-1 in `ROLE-MATRIX.md` §14.5.
This file records what the web portal **actually does** for impact, urgency, category, country and resolution on the
ticket detail page, and for the priority preview. Every statement cites the source. Where the source does not settle
something, this file says so.

**Paths**
- `FE:` = `frontend/src/`; `TDP` = `FE:pages/tickets/TicketDetailPage.tsx`; `CTP` = `FE:pages/tickets/CreateTicketPage.tsx`.
- `BE:` = `backend/src/`; `TC` = `BE:modules/tickets/tickets.controller.ts`.
- Line numbers are as of today.

**Two facts that apply to every field**
- **The web saves on selection.** Every select calls its mutation from `onChange` (`TDP:1744, :1761, :1981, :1990, :2000, :2203`). There is no Save button except for the resolution text (`TDP:1473-1477`). Mobile uses an explicit Save instead (G1 brief), so the *moment* of saving differs; the request bodies below are what mobile copies.
- **The AGENT lock** is `role === 'AGENT' && status ∈ {CLOSED, CANCELED}` (`TDP:619-622`). It exists only in the UI; the server checks nothing (`TC:531-560`). It applies to impact, urgency and category. **It does not apply to country or resolution** (no `isResolvedLocked` check at `TDP:1438-1486` or `TDP:2199`).

---

## 1. Impact and urgency

| Question | Web behaviour | Source |
|---|---|---|
| Who sees them editable | AGENT, L2_MANAGER, ADMIN: a `<select>` each in Properties | `TDP:1737-1774` (`user?.role !== 'END_USER'`) |
| Who sees them read-only | END_USER: not in Properties at all; chips in the Details tab, only when set. Staff also see those chips | `TDP:1737`, `:1212-1234` |
| States | Editable in every status except for a **locked AGENT** (CLOSED, CANCELED), who sees the label text instead | `TDP:1740, :1753, :1757, :1770` |
| Allowed values | Impact: Not Set, `MINIMAL` "Affects User", `LOW` "Affects Group", `MEDIUM` "Affects Department", `HIGH` "Affects Business". Urgency: Not Set, `LOW`, `MEDIUM`, `HIGH`, `URGENT` | `TDP:1746-1750, :1763-1767`; labels `:108-119`; enums `BE:../prisma/schema.prisma:83-95` |
| "Not Set" | Sends `impact: undefined`, which JSON drops. It cannot clear a value: the body is `{}`, or `{ priority }` for the current pair (next row) | `TDP:1744, :1761, :306-315` |
| Validation | None on the client. Server: enum values only; `null` is a 400 | `BE:modules/tickets/tickets.validator.ts:20-21, :35-37`; 01 TKT-4 |
| Request | `PUT /tickets/:id` with the changed field, **plus `priority`** when both effective values are set and the matrix has that pair: `{ impact }` or `{ urgency }` (+ `priority`) | `TDP:304-317` |
| Disabled while saving | No | `TDP:1741-1751, :1758-1768` |
| After save | Invalidate `['ticket', id]` and `['ticket-activity', id]` (refetch), toast **"Updated"**. No optimistic update: the select is bound to the server value | `TDP:318-322, :1743, :1760` |
| On error | Toast: the server's `error`, else "Failed to update". The select still shows the server value, so it reverts by itself | `TDP:323` |

**What the server does** (`TC:562-573, :675-693, :716-733, :775-784`)
- It recomputes the priority from the matrix whenever the *effective* impact and urgency are both set and the pair has a row, **whatever the body says**. So the `priority` the web sends never changes the outcome.
- A priority or team change recalculates the SLA policy and due dates.
- **But the `priority` key has two side effects of its own**, both keyed on `data.priority` (the request body), not on the computed value:
  - the UPDATED audit row records the priority change (`TC:719`);
  - the requester and the assignee are emailed "priority changed" (`TC:776-784`).
- L2_MANAGER cannot read the matrix (403, `BE:modules/priorityMatrix/priorityMatrix.router.ts:8`), so the web never sends `priority` for L2, and an L2 edit causes no priority email.

## 2. Priority and the priority matrix preview

| Question | Web behaviour | Source |
|---|---|---|
| Can anyone set the priority by hand on a ticket? | **No.** The Priority row is read-only for every role, with an "Auto" pill for staff when impact and urgency are both set. A `priorityMutation` exists but nothing calls it | `TDP:1725-1734` (comment at `:1726`), dead code `:497-505` |
| Is there a preview on the ticket detail page? | **No visible preview.** The page computes the priority silently at save time (the row above) and then shows the server's value after the refetch | `TDP:304-322` |
| Where the matrix comes from | `GET /priority-matrix` (LKP-6), cached 10 minutes. **No role gate on the query**: END_USER and L2 trigger a 403 on every ticket they open | `TDP:294-301`; `BE:…/priorityMatrix.router.ts:8` |
| Recalculation rule | `newImpact = picked ?? ticket.impact`, `newUrgency = picked ?? ticket.urgency`; if both are set, find the row with that exact pair; if found, that row's priority; if not found, nothing is computed | `TDP:306-315`; the server uses the same rule `TC:563-573` |
| Matrix contents | Seeded with 9 rows (HIGH/MEDIUM/LOW × HIGH/MEDIUM/LOW) on the first GET if empty. Impact `MINIMAL` and urgency `URGENT` have no default row, so such a pair keeps the current priority | `BE:modules/priorityMatrix/priorityMatrix.controller.ts:9-39` |
| Create page (for comparison) | A visible preview: "Auto-computed from Impact × Urgency" with the badge, recomputed whenever impact, urgency or the matrix changes; "Set Impact and Urgency above to compute priority" otherwise. Not user-selectable. The AI panel can overwrite it | `CTP:49-52, :64-76, :366-387, :220-223` |
| Create page quirk | When both are set but the pair has no row, the previous preview stays on screen (no `else` inside the `if (entry)`) | `CTP:67-72` |

## 3. Category (three levels)

| Question | Web behaviour | Source |
|---|---|---|
| Who edits | **ADMIN and AGENT only** (`isStaff` is redefined here as ADMIN or AGENT) | `TDP:1951` |
| Who sees it read-only | END_USER, L2_MANAGER, and a locked AGENT: Category, Sub Category and Item as text | `TDP:1953-1960` |
| States | Every status except a locked AGENT | `TDP:1953` |
| Current selection | Derived from `ticket.category.level`: ITEM → item, its parent, its grandparent; SUBCATEGORY → sub and its parent; CATEGORY → itself | `TDP:1936-1950` |
| Options | `GET /categories?flat=true` (cached 5 min), filtered by `level` and `parentId`, in the server's order (`sortOrder`); **not sorted by name** on this page | `TDP:476-480, :1962-1974`; `BE:modules/categories/categories.controller.ts:29-38` |
| Inactive or deleted current category | Flat mode returns active rows only. The page **synthesises** the ticket's current category and sub-category from the ticket's own chain so they still show. An inactive current **item** is not synthesised: its select shows "— None —" | `TDP:1963-1973` |
| Which selects show | Category always; Sub Category whenever a category is set (even with no sub-categories); Item whenever a sub-category is set | `TDP:1986, :1996` |
| What each change sends | Category: `value \|\| null` ("— None —" clears the category). Sub: `value \|\| curCatId \|\| null`. Item: `value \|\| curSubId \|\| null` | `TDP:1981, :1990, :2000` |
| Cascade | Choosing a new category saves that category alone, so the ticket's sub-category and item disappear; the Sub and Item selects then list the new parent's children. Choosing "— None —" on a level saves its parent | same |
| Validation | None on the client. Server: a UUID or null | `tickets.validator.ts:5-8, :23, :35-37` |
| Request | `PUT /tickets/:id { categoryId }` | `TDP:482` |
| Disabled while saving | No | `TDP:1979-1984` |
| After save | Refetch ticket and activity. Toast **"Category updated — auto-assigned to {name}"** when the response has *any* `assignedTo`, otherwise **"Category updated"** | `TDP:483-493` |
| On error | Toast: the server's `error`, else "Failed to update category" | `TDP:494` |

**What the server does on a category change** (`TC:577-673`): a non-null `categoryId` that differs from the current one
re-runs auto-assignment from the category chain. The group becomes the first `defaultTeamId` up the chain, and the
technician is taken from the category-country pool (load-balanced), then from `defaultAssigneeId`. The technician is
applied only if they are in the resolved group. **This replaces the current technician**, even one assigned by hand: the
check is on the request payload (`:604`), although the comment at `:575-576` says otherwise. A null `categoryId` skips
all of this (`:577`). The new technician is emailed (`:750-758`).

## 4. Country

| Question | Web behaviour | Source |
|---|---|---|
| Where | "🌍 Country" in the requester panel. It edits the **ticket's** `countryId`, not the requester's profile | `TDP:2197-2218` |
| Who sees a select | ADMIN, AGENT (triage **and** country-locked) and L2_MANAGER | `TDP:2199` |
| Who sees text | END_USER: the ticket's country, else the requester's, else "Unassigned" | `TDP:2211-2216` |
| States | **Not lock-gated:** a locked AGENT can still change it on a CLOSED or CANCELED ticket | `TDP:2199` (no `isResolvedLocked`) |
| Options | "— Unassigned —" (sends `null`) plus every country in the store with `isActive !== false` | `TDP:2206-2209` |
| Where the list comes from | The country store. `CountrySelector` fills it from `GET /countries/my-countries` for a triage AGENT and `GET /countries` for everyone else; if empty, the detail page loads `GET /countries` | `FE:components/CountrySelector.tsx:38-53`; `TDP:199-209` |
| So a country-locked AGENT | gets the **full** list and can move a ticket to any country | as above |
| Validation | None on the client. Server: any string or null | `tickets.validator.ts:11-14, :27` |
| Request | `PUT /tickets/:id { countryId: value \|\| null }` | `TDP:508, :2203` |
| Server | Keeps `countryId` only for ADMIN and AGENT; **silently drops it for L2_MANAGER** and still answers 200 | `TC:553-556` |
| Disabled while saving | **Yes** | `TDP:2204` |
| After save | Refetch ticket and activity; toast **"Country updated"** (also for L2, where nothing was saved) | `TDP:509-513` |
| On error | Toast: the server's `error`, else "Failed to update country" | `TDP:514` |

## 5. Resolution

| Question | Web behaviour | Source |
|---|---|---|
| Where | The Resolution tab. The tab is shown to every role | `TDP:799-810, :1438` |
| When editable | **Only while the status is RESOLVED or CLOSED.** Any other status, CANCELED included, shows "This ticket has not been resolved yet." | `TDP:1440, :1488-1493` |
| Who | **Every role**, END_USER included. No role check and no AGENT lock | `TDP:1447-1455` |
| Outside the closure flow? | **Yes.** The closure modal sets it on Resolve / Close (05 §A.2); this tab edits it afterwards | `TDP:1438-1486` |
| Control | "Edit" opens a 6-row textarea pre-filled with the saved text; Cancel and Save buttons. Save shows a spinner while pending | `TDP:1448-1478` |
| Validation | **None.** No trim, and an empty text can be saved. Server: optional string | `TDP:1476`; `tickets.validator.ts:36` |
| Request | `PUT /tickets/:id { resolution }` (the draft as typed) | `TDP:531` |
| After save | Refetch the ticket only (not the activity), close the editor, toast **"Resolution updated"** | `TDP:532-536` |
| On error | Toast **"Failed to update resolution"** (the server's message is not shown); the editor stays open with the draft | `TDP:537` |
| Display | Plain text with line breaks kept (`whitespace-pre-wrap`), "No resolution notes available." when empty | `TDP:1481-1485` |
| Server | No special handling; the audit row is `UPDATED { updated: true }` | `TC:716-733` |

---

## 6. What mobile builds, and where it deliberately differs

| Field | Mobile (G1) | Same as the web? |
|---|---|---|
| Impact, urgency | AGENT (not locked), L2_MANAGER, ADMIN; END_USER hidden (existing decision, 05 §A.3). The four real values per field; "Not set" is shown but not offered, because on the web it saves nothing | Yes, except no "Not Set" no-op choice |
| Priority | Read-only. Mobile **never sends `priority`** (01 TKT-4). ADMIN and AGENT see, before Save, the priority the server will compute, by the web's rule (§2). L2 sees "recalculated by the Service Desk when you save" because LKP-6 is 403 for L2 | See discrepancy D1 |
| Category | ADMIN, AGENT (not locked). Staged three-level cascade: changing a level clears the levels below it; Save sends the deepest choice, or null for "None". Inactive current levels are shown, marked inactive, item included. Empty levels are not shown. The save notice says the ticket may be re-routed | Same request and roles; one request instead of one per level |
| Country | ADMIN and triage AGENT, in every status (web: not lock-gated). Country-locked AGENT: value plus a lock reason. L2_MANAGER and END_USER: value only, no selector. "Unassigned" option sends null. List: LKP-5 for ADMIN, LKP-4 for a triage AGENT | See discrepancy D2 |
| Resolution | AGENT (even locked), L2_MANAGER, ADMIN, while RESOLVED or CLOSED. Otherwise the saved text plus the reason. END_USER read-only (🔒 SAFER, D3). Sent as typed, empty allowed, as on the web | Yes for staff |
| Every field | Explicit Save; nothing saves on selection, blur or navigation. Controls disabled while saving. On failure: the server's message (403: "Your role can't change …"), then the field shows the saved value again | Mobile rules from the G1 brief |

## 7. Discrepancies between the web source and our docs

| # | Our doc says | The web source does | Mobile now | Needs |
|---|---|---|---|---|
| D1 | 01 TKT-4: "Never send `priority`" | Sends the matrix priority with every impact or urgency change by ADMIN or AGENT (`TDP:311-315`). Same stored result, but the server then emails the requester and the assignee and audits the priority change (`TC:719, :776-784`) | Never sends it, so no "priority changed" email and no priority line in History after a mobile edit | Ronit: keep, or allow `priority` = the LKP-6 value for ADMIN and AGENT |
| D2 | G1 brief, from 05 §A.12: country agents see the ticket country locked | §A.12 is the **list filter** selector. The ticket country select is open to every AGENT, with the full country list (`TDP:2199, :2206-2209`; `CountrySelector.tsx:38-53`) | Locked for a country AGENT, with a reason (the brief's rule, and the stricter one) | Ronit: confirm, or let country AGENTs edit as on the web |
| D3 | 01 TKT-4: L2 may send `categoryId` (and `teamId`) | Category is read-only for L2 (`TDP:1951-1953`) | The editor is hidden for L2 and the write guard refuses `categoryId` from L2 before sending. `UPDATE_KEYS_BY_ROLE.L2_MANAGER` in `src/api/tickets.api.ts` still lists it (ROLE-MATRIX §8 item 2) | Ronit: OK to narrow the API allow-list and 01 |
| D4 | 05 §A.1: for a locked AGENT "the property edits in A.3 become read-only" | Country and resolution have no lock (`TDP:1438-1486, :2199`) | Followed the web: both stay editable on CLOSED | 05 §A.1 wording |
| D5 | 05 §A.3: Resolution "(when RESOLVED/CLOSED)", AGENT "edit" | Same, and CANCELED is excluded (`TDP:1440`) | Same | – |
| D6 | 01 LKP-1: "sort each level by name, as the web does" | True for the create page only; the detail page keeps the server's `sortOrder` (`TDP:1962-1974`) | Detail editor keeps the server order | – |
| D7 | 05 §A.3: toast "auto-assigned to <name>" when the response has `assignedTo` | Accurate, but this claims an auto-assignment even when the technician did not change (`TDP:487-492`) | Says "auto-assigned to …" only when the technician actually changed, and names a group change too | – |

**Web defects found (report only, R3)**
- The matrix query on the detail page has no role gate, so END_USER and L2 get a 403 on every ticket open (`TDP:294-301`), and the GET can write seed rows (`priorityMatrix.controller.ts:27-36`).
- Country: L2_MANAGER gets "Country updated" although the server dropped the change (`TDP:2199`, `TC:553-556`). Already ROLE-MATRIX W5.
- Category: a category change replaces a hand-assigned technician; the code comment says it should not (`TC:575-576` vs `:604`).
- Resolution: the error toast hides the server's message (`TDP:537`).
- END_USER can rewrite the technician's resolution (`TDP:1447`). Already a 🔒 SAFER case (D3).

## 8. Not determinable from the source

- Whether the UAT priority matrix still holds the 9 default rows, or has been edited. Only a GET of LKP-6 would show it; nothing was called.
- Whether any UAT category has `isActive: false` while tickets still point at it. The handling is built and tested on the device; it was not seen on a real ticket.
