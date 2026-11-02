# G6 — the web dashboard's period, KPI tiles and status chips

**2026-11-02.** Read-only inspection of the web repo clone (`MMG-Ticketing-Platform`, branch `master`, commit `d7f3887`,
2026-10-09). Nothing in it was run, written or changed. No database was touched.

- `BE:` = `backend/src/`, `FE:` = `frontend/src/` in that clone.
- `APP@f4fad10:` = this repo before G6 (`git show f4fad10:<path>`).
- **The clone is 24 days older than the live web portal** Ronit compared against. Every statement below is about the
  clone. Where the live portal could differ, it says so.

---

## 0. Answers in one place

| Question | Answer | Where |
|---|---|---|
| Does `GET /dashboard/all` take a date range? | **Yes.** `range` (9 presets), or `from` + `to` (custom). | §1 |
| What does the web send per button? | `range=<button value>`; Custom sends `range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` once both days are set. | §2 |
| What happens with no date parameter? | `range` defaults to `month` = **the last 30 days**, ending tonight. | §1.2 |
| What did the app send before G6? | `range=month`, explicitly. The "last 30 days" caption described a parameter the app sent, and it is the **same window the web's default "This Month" uses**. | §3 |
| Is the count mismatch explained? | **Partly.** Open (47 vs 16) is explained: the web's Open card reads a different field. In Progress and SLA Breached are **not** explained by the date window, because both sides sent `range=month`. | §4 |
| Which KPIs does the web show? | Total, Open, In Progress, Resolved, SLA Breached; then, for staff, Closed, Unassigned, five pending reasons and On Hold. | §5 |
| Is anything here mis-scoped server-side? | Only `unassigned`, for an AGENT whose scope is "assigned to me" alone; and every L2 number (per-role cache). The other tiles are scoped correctly. | §7 |

---

## 1. What DSH-1 accepts

Route: `GET /api/v1/dashboard/all`, `requireAuth` only, every role (`BE:modules/dashboard/dashboard.router.ts:8`).

### 1.1 Parameters

| Param | Read at | Behaviour |
|---|---|---|
| `range` | `BE:modules/dashboard/dashboard.controller.ts:234` | `req.query.range` or `'month'`. Turned into a window by `resolveRange` (`:206-228`), table below. |
| `from` | `:236`, `:300-301` | If present, `range` is ignored. `from = new Date(from)` (`:301`). |
| `to` | `:237`, `:302` | Used only with `from`: `endOfDay(new Date(to))`; without `to`, end of today (`:302`). |
| `countryId` | `:240-242`, `:289-295` | Explicit only (the user's own country is never applied, `:240-241`). ANDed with the role scope (`:292-294`). **Ignored for L2_MANAGER** (`:290`). |

No other query parameter is read by `getAll` (`:231-581`).

### 1.2 The presets

Every preset window ends at `23:59:59.999` today, in the server's local time (`:207-209`; the server's timezone is
unknown, 01 DSH-1). `from` is the start of that day (`startOfDay`) N days ago.

| `range` | From | Source | Calendar days included |
|---|---|---|---|
| `today` | 00:00 today | `:211-214` | 1 |
| `yesterday` | 00:00 yesterday → 23:59:59.999 yesterday | `:215-218` | 1 |
| `last7` | today − 7 days | `:219` | **8** (today and the 7 days before) |
| `last30` | today − 30 days | `:220` | 31 |
| `week` | today − 7 days | `:221` | 8, **identical to `last7`** |
| `month` | today − 30 days | `:225-226` | 31, **identical to `last30`** |
| `quarter` | today − 90 days | `:222` | 91 |
| `year` | today − 365 days | `:223` | 366 |
| `all` | 2000-01-01 | `:224` | everything |
| anything else, or no `range` | today − 30 days | `:225-226` (`default`), `:234` | 31 |

- **No calendar periods.** "week", "month", "quarter" and "year" are rolling windows, not this calendar week, month, quarter or year (`:221-226`).
- **No date parameter at all** gives `range = 'month'` (`:234`) → the last 30 days (`:226`).

### 1.3 Custom

- `from` is parsed with `new Date('YYYY-MM-DD')` (`:301`). JavaScript reads a bare date string as **UTC midnight**.
- `to` is `endOfDay(new Date('YYYY-MM-DD'))` (`:302`). That is the end of that instant's day in **server-local time**. The two ends of a custom window use different clocks.
- There is no validation (`:300-302`). From after To simply matches nothing. What an unparseable value does was not traced (nothing was run).

### 1.4 Caching

- Cache key: `custom:<from>:<to>` or the `range` value (`:244`), plus `:country:<id>` (`:245`).
  - Per user for END_USER and AGENT (`:246-247`).
  - Per **role** for everyone else (`:248`). Two ADMINs, or an ADMIN on the web and on the phone, share one entry. **So do all L2 managers.**
- TTL: 60 s for END_USER, AGENT and L2 (`:250`); `CACHE_TTL.DASHBOARD` = 300 s for ADMIN (`BE:config/redis.ts:31`).
- Every `role:*` and `user:*` key is dropped on any ticket mutation (`:16-57`; callers in 01 DSH-1).

---

## 2. What the web sends, button by button

- State: `const [range, setRange] = useState<RangeOption>('month')` (`FE:pages/dashboard/DashboardPage.tsx:61`). It lives in the component, so every visit to the dashboard starts on "This Month" again.
- Buttons: `:294-304`, in this order; a tap calls `setRange` (`:308`).
- Request: `dashboardApi.getAll(range === 'custom' ? 'custom' : range, effectiveFrom, effectiveTo, effectiveCountryId)` (`:99`).
  - `from`/`to` exist only for Custom (`:68-69`).
  - The query is disabled for Custom until both days are set (`:106`).
- The API client sends each of `range`, `from`, `to`, `countryId` **only when truthy** (`FE:api/dashboard.api.ts:50-58`). So the triage agent's `countryId=''` (`DashboardPage.tsx:94`) is never sent.

| # | Button (`:294-304`) | Sent to DSH-1 | Server window (§1.2) |
|---|---|---|---|
| 1 | Today | `range=today` | today |
| 2 | Yesterday | `range=yesterday` | yesterday |
| 3 | Last 7 Days | `range=last7` | today − 7 d → tonight |
| 4 | Last 30 Days | `range=last30` | today − 30 d → tonight |
| 5 | This Week | `range=week` | **same as Last 7 Days** |
| 6 | This Month **(default)** | `range=month` | **same as Last 30 Days** |
| 7 | Quarterly | `range=quarter` | today − 90 d → tonight |
| 8 | This Year | `range=year` | today − 365 d → tonight |
| 9 | All Time | `range=all` | from 2000-01-01 |
| 10 | Custom | `range=custom&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>`, once both `<input type="date">` values are set (`:320-336`, `:106`) | §1.3. `range=custom` is never read: `from` wins (`:300`), and the cache key uses `from`/`to` (`:244`) |

Plus `countryId=<id>` when a country is selected and the user is not L2_MANAGER (`:88-95`).

The web's query also sets `staleTime: 0`, `refetchOnMount: 'always'` and `refetchOnWindowFocus: true` (`:100-103`). The app does **not** copy these: UAT shares hardware with production (`src/api/queryClient.ts:7-30`).

**The labels are wrong for four buttons** (§1.2): "This Week" and "Last 7 Days" give the same numbers, and so do "This Month" and "Last 30 Days". "Quarterly" and "This Year" are rolling 90- and 365-day windows. The chart titles even say "This Quarter" for the same button (`:139` vs `:301`). Reported as 05 B.36.

---

## 3. What the app sent before G6

- `const DASHBOARD_RANGE = 'month'` (`APP@f4fad10:src/hooks/useHome.ts:30`), sent on every DSH-1 call (`:77`). `getDashboard` also defaulted to `'month'` (`APP@f4fad10:src/api/dashboard.api.ts:23`).
- The caption "Created in the last 30 days, except Active (right now)" (`APP@f4fad10:src/screens/dashboard/HomeScreen.tsx:163`) and END_USER's "Tickets you raised in the last 30 days" (`:162`) described that parameter. It was **not** a server default the app relied on, and it was accurate: `month` is 30 days (§1.2).
- **It was the same window as the web's default.** The web's "This Month" sends `range=month` too (§2, row 6).
- The app's **Open** tile read `kpis.open` (`APP@f4fad10:src/hooks/useHome.ts:55`, `HomeScreen.tsx:232`). That is OPEN tickets **created in the window** (`BE:dashboard.controller.ts:334`).

---

## 4. The count mismatch

Observed by Ronit, same ADMIN account, same moment:

| KPI | Web "This Month" | App (before G6) | Same field? | Same window? | Explained? |
|---|---|---|---|---|---|
| Open | 47 | 16 | **No.** Web: `currentlyOpen`, OPEN now, **any creation date** (`FE:DashboardPage.tsx:350`; `BE:dashboard.controller.ts:433`). App: `open`, OPEN and created in the last 30 days (`:334`). | n/a: `currentlyOpen` has no window | **Yes.** All OPEN tickets ≥ the OPEN tickets created in the last 30 days. G6 switches the app to `currentlyOpen`. |
| In Progress | 167 | 180 | Yes, `inProgress` (`FE:DashboardPage.tsx:357`; app `useHome.ts:56`) | Yes, `range=month` on both (§3) | **No** |
| SLA Breached | 170 | 173 | Yes, `slaBreached` (`FE:DashboardPage.tsx:371`; app `useHome.ts:58`) | Yes | **No** |

**Ronit's theory (different date windows) does not hold against the clone.** Both clients asked for the same 30 days.

For In Progress and SLA Breached, an ADMIN on the web and on the phone share **one** cache entry when they send the same parameters (`:248`, TTL 300 s). The two reads would then have returned identical numbers. They didn't, so one of these is true (not verifiable from source):

1. **Different `countryId`.** The likeliest explanation.
   - The web's country choice is persisted in the browser (`FE:store/country.store.ts:14-31`, key `sd-country`), and an ADMIN keeps their last pick (`FE:components/CountrySelector.tsx:59-61`).
   - The app's choice is in memory, `null` = All countries, sent only when set (`src/utils/ticket-filters.ts`, `listCountryParam`).
   - The app's numbers are the larger on both rows. That fits the web having one country selected and the app all of them.
2. **A ticket changed between the two reads.** Any mutation drops every cached dashboard (`:16-57`). Within the same few seconds, a 13-ticket gap is unlikely.
3. **The live portal differs from the 2026-10-09 clone**, for example a dashboard change deployed since.

To settle it: put both on "All countries", pick This Month on both, and read them within a minute. After G6, Open will match by construction. In Progress and SLA Breached should then match too, if (1) was the cause.

---

## 5. What the web shows, in order

Card component (`FE:DashboardPage.tsx:856-888`):
- white `rounded-xl border p-5`;
- a coloured `p-3 rounded-lg` square with a white icon;
- the title in `text-sm text-gray-500`, the value in `text-2xl font-bold`;
- a chevron when it links.

**There is no coloured left edge in the clone.** G6 adds one because Ronit's brief asks for it (§6). The live portal may have one.

### 5.1 Row 1: every role (`:340-376`)

Grid: 1 column, 2 at `md`, 5 at `lg` (`:340`).

| # | Title (END_USER title) | Value | Colour | Icon | Links to | Source |
|---|---|---|---|---|---|---|
| 1 | Total Tickets (My Total Requests) | `kpis.total`: created in the window (`BE:…controller.ts:332`) | `bg-purple-500` | Ticket | `/tickets?<window>` | `:341-347` |
| 2 | Open Tickets (My Open Requests) | `kpis.currentlyOpen`: OPEN now, any date (`:433`) | `bg-blue-500` | Ticket | `/tickets?status=OPEN`, **no window** | `:348-354` |
| 3 | In Progress | `kpis.inProgress`: IN_PROGRESS or PENDING, in the window (`:335`, `:69-72`) | `bg-yellow-500` | Clock | `status=IN_PROGRESS,PENDING` + window | `:355-361` |
| 4 | Resolved; **"Resolved Today"** when the range is Today | `kpis.resolved`: RESOLVED, not CLOSED, in the window (`:337`); Today: `kpis.resolvedToday`, RESOLVED and created today (`:336`) | `bg-green-500` | CheckCircle | `status=RESOLVED` + window | `:362-368` |
| 5 | SLA Breached | `kpis.slaBreached`: BREACHED and not RESOLVED/CLOSED, in the window (`:338`) | `bg-red-500` | AlertTriangle | `sla=BREACHED&status=<all 9 active>` + window | `:369-375` |

### 5.2 Row 2: the status chips, every role but END_USER (`:379`)

Grid: 2 columns, 3 at `md`, 5 at `lg` (`:380`).

| # | Label | Value | Colour | Shown | Links to | Source |
|---|---|---|---|---|---|---|
| 1 | Closed | `kpis.closed ?? kpis.resolved`: CLOSED, in the window (`BE:…:429`) | `bg-zinc-600` (full KPI card) | always | `status=CLOSED` + window | `:381-387` |
| 2 | Unassigned | `kpis.unassigned`: unassigned and OPEN/IN_PROGRESS/ON_HOLD/PENDING, in the window (`:339`) | `bg-orange-500` (full KPI card) | always | `assignedToId=unassigned&status=OPEN,IN_PROGRESS,ON_HOLD,PENDING` + window | `:388-394` |
| 3 | Mgmt Review | `kpis.pendingMgmtReview` | dot `bg-amber-400` | **only when > 0** (`:405`) | `status=PENDING_MGMT_REVIEW`, no window | `:397`, `:407` |
| 4 | With Partner | `kpis.pendingPartner` | dot `bg-purple-400` | > 0 | `status=PENDING_PARTNER` | `:398` |
| 5 | User Confirm | `kpis.pendingUserConfirm` | dot `bg-sky-400` | > 0 | `status=PENDING_USER_CONFIRM` | `:399` |
| 6 | More Info | `kpis.pendingUserInfo` | dot `bg-indigo-400` | > 0 | `status=PENDING_USER_INFO` | `:400` |
| 7 | Master Data | `kpis.pendingMasterData` | dot `bg-teal-400` | > 0 | `status=PENDING_MASTER_DATA` | `:401` |
| 8 | On Hold | `kpis.onHold` | dot `bg-gray-400` | > 0 | `status=ON_HOLD` | `:402` |

- Rows 3–8 are mini-cards: an 8 px (`w-2 h-2`) coloured dot, the label in `text-xs text-gray-500`, the count in `text-2xl font-bold` (`:408-413`).
- Their counts come from the `byStatus` groupBy, created in the window (`BE:…:346`, `:436-442`).
- "Window" in the links is the client's date filter for the list (`FE:DashboardPage.tsx:72-86`), built from `toISOString()` dates, which are UTC days (`:74`).

The web dashboard shows **no** `totalOpen` (the app's "Active") anywhere: `DashboardPage.tsx` never reads it.

---

## 6. The app after G6

| | Web (clone) | App (G6) | Source |
|---|---|---|---|
| Period values, order | §2 | Same ten, same order | `src/utils/dashboard-period.ts` `DASHBOARD_PERIODS` |
| Period labels | Title Case | Same words, sentence case | same |
| Default | This Month (`range=month`) | This month (`range=month`) | `DEFAULT_DASHBOARD_PERIOD` |
| Preset request | `range=<value>` | `range=<value>` | `dashboardPeriodQuery`; `tests/home/dashboard.test.mjs` §1 |
| Custom request | `range=custom&from&to` | `from&to`. `range` is left out: the server never reads it when `from` is sent (`BE:…:244`, `:300`), and `custom` is not a DSH-1 range in 03 §C. Same window, same cache key | `src/api/dashboard.api.ts` |
| Custom validation | none (waits for both days) | waits for both; refuses From after To; only real `YYYY-MM-DD` days; the picker stops at today | `customRangeProblem` |
| Period kept | until the page unmounts (`:61`) | while the app is open, across tabs; back to This month after a restart or sign-out (in memory, `src/store/ui.store.ts`) | |
| Refresh | staleTime 0, refetch on mount and focus | 60 s staleTime, pull-to-refresh; a new period is a new query key, so it fetches | `src/api/queryClient.ts` |
| Row 1 tiles | §5.1 | Total tickets, Open (`currentlyOpen`, "right now"), In progress, Resolved / Resolved today, SLA breached. Same colours (`colors.kpi`). 2-column grid, the fifth spans both | `src/utils/home-kpis.ts`, `HomeScreen.tsx` |
| Tile look | no left edge | 4 dp left edge in the tile's colour (Ronit's brief) | `HomeScreen.tsx` `KpiTile` |
| Row 2 | §5.2 | Pills, each with a dot, its count and its label, in the web's order, then **Active now** (app only). Pending reasons and On hold hidden at 0, as on the web | `homeChips`, `visibleHomeChips` |
| Unassigned | every staff role | ADMIN and the UI's triage AGENT (04 M2; §7) | `homeChips` |
| END_USER | the five cards ("My …"), no row 2 | Open and Resolved only, no chips (04 M2 decision, kept) | `homeTiles` |
| L2_MANAGER | every count | no counts, no period row; the tiles and chips stay as shortcuts | `showHomePeriod`, 05 C.19 |

**Before G6 the app showed a different set:** Open (`open`), In progress, On hold, SLA breached, Active and Unassigned (`APP@f4fad10:src/utils/permissions.ts:103-108`). Where each went:
- On hold, Active and Unassigned moved from the tile grid to the chip row. None was dropped.
- Unassigned keeps its ADMIN / triage AGENT rule.
- Active is the only app-only count.

**Still different, on purpose or for later:**
1. **The list does not get the period.** A tile opens its list with no date filter, as before G6. The web adds the window to the list link (`FE:DashboardPage.tsx:72-86`) for Total, In Progress, Resolved, SLA Breached, Closed and Unassigned. The mobile list has a created-date filter (G2), so this is possible: a decision for Ronit.
2. END_USER's narrower set, L2's missing counts and Unassigned's narrower audience are unchanged decisions (ROLE-MATRIX H2, H4, H5).
3. Closed: the web shows `resolved` when `closed` is missing (`:383`). The app shows 0, since the field is always sent (`BE:…:454`).

---

## 7. Server-side scoping of every tile (05 B.20)

How it works:
- `...scope` is spread into every count (`BE:…controller.ts:331-433`).
- A clause with the **same key** replaces the scope instead of narrowing it. The AGENT scope is `{ assignedToId: me }` alone when the agent has no team and is not on the server's triage list (`:272-275`).
- A `countryId` wraps the scope in `AND` (`:292-294`), which protects it.

| KPI | Clause | Correctly scoped? |
|---|---|---|
| total | `{...scope, createdAt}` `:332` | Yes |
| currentlyOpen | `{...scope, status: 'OPEN'}` `:433` | Yes |
| inProgress | `{...scope, status, createdAt}` `:335` | Yes |
| resolved | `:337` | Yes |
| resolvedToday | `:336` | Yes |
| slaBreached | `:338` | Yes |
| closed | `:429` | Yes |
| onHold, pending* | the `byStatus` groupBy `{...scope, createdAt}` `:346`, `:436-442` | Yes. But a failed groupBy returns `[]` silently (`:346`), and every chip then reads 0 and hides |
| totalOpen (Active) | `:431` | Yes |
| **unassigned** | `{...scope, assignedToId: null, …}` `:339` | **No, for that AGENT:** `assignedToId: null` replaces `assignedToId: me`, so the count is global. The app shows it only to ADMIN and the UI's triage AGENT (no country), as before. The app cannot see the server's triage list (A4), so a UI-triage AGENT who has no team and is not on that list still gets the global number. Not corrected in the app (R3) |
| *every KPI, L2_MANAGER* | cache key per role `:248` | **No:** one L2 manager's numbers are served to all of them. The app never calls DSH-1 for L2 (unchanged) |

Not used by the app, and mis-scoped for AGENT and L2 (their `OR` replaces the scope's `OR`): `closedToday` (`:342`) and `closedYesterday` (`:344`).

---

## 8. Web findings to report (R3; not fixed)

Logged in `docs/web-system/05-RULES-AND-GAPS.md` as B.36:
1. Four period labels don't describe their windows (§1.2, §2).
2. The windows are one day longer than their names: Last 7 Days covers 8 calendar days (`:219`).
3. A custom window starts at UTC midnight but ends at server-local midnight (§1.3).
4. Custom dates are not validated (`:300-302`).
5. A failed status groupBy silently zeroes every pending-reason count (`:346`).
