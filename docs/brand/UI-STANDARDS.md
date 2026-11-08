# UI standards — Setu (Phase C, 2026-10-20; Phase C2 fixes the same day; app name 2026-10-23)

Phase C polished the 16 MVP screens (M1–M16, `docs/RELEASE.md` §9) plus the task list and task detail on the Phase B
token foundation (`docs/brand/WEB-TOKENS.md`, `src/theme/`). This file has the consistency audit that came first (§1),
the one standard chosen for each finding (§2), the contrast report (§3) and the layout checks (§4). Phase C2 fixed two
defects found on a device, the Home KPI tiles and the drawer layout (§5), and updated S2, S12 and §4 to match. On
2026-10-23 the app was renamed "Setu" (§6), which changed S12's drawer header and §4. Phase A1 (2026-10-23) added
motion and the empty-list illustrations (S7, S11; `docs/PERFORMANCE.md` §10). §8 (2026-10-27) restates the inline
property-editor pattern on the ticket, now that the technician has one too. §9 (2026-10-29) sets the rule for the
time-of-day greeting on Home. §10 (2026-10-30) is the login's "arc split" layout and the motion palette (white
ground, yellow accent); the motion itself is `docs/PERFORMANCE.md` §12. §14 (2026-11-03) is the polish pass: the people
row on ticket cards, the greeting mark, the window captions on Home's counts, swipe actions, haptics, the SLA deadline,
press feedback, the count cross-fade and the drawn paperclip (its motion is `docs/PERFORMANCE.md` §13). §15 is Login's
footer year and the email sign-in, with the fix for its missing "Sign in" (§15.3, 2026-11-05). §16 (2026-11-05) is the
ticket card's raised and due dates.

**On iPhone, §iOS-A (Phase iOS-4, 2026-10-29; §9 until iOS-5b, when Android's §9 arrived) is the standard.** It supersedes S0's sizes, S1's header, S12's navigation
chrome, the large-text rules of §4 and the separator colour of S2 and §8, and adds targets, VoiceOver, haptics, sheets,
search and keyboard rules from Apple's Human Interface Guidelines. Everything else here still applies. §10 (the login
and the motion palette, iOS-5c) applies on iPhone as written; its iPhone differences are §iOS-A.12.

Not touched: `DevTokenScreen.tsx` and its dev-only `PlaceholderScreen.tsx` (both deleted in Phase 8), the auth flow and
`auth.config.ts`, every API call, query, mutation and business rule, and the navigation structure.

---

## 1. Consistency audit (before Phase C)

Sizes are as the app rendered them before Phase C, at NativeWind's default 1rem = 14 dp.

| Area | What the screens did | Standard (§2) |
|---|---|---|
| Type scale | 1rem = 14 dp, so `text-xs` was 10.5 dp and `text-sm` 12.25 dp, while HTML bodies (HtmlText) were 14. Eight arbitrary sizes: `text-[10px]` (TicketCard "New reply", priority "Auto", ticket source, private-note chip) and `text-[11px]` (KB tags ×2, two dev-only lines on Login) | S0 |
| Screen padding | Gutters were `mx-4` everywhere. Bottom padding varied: insets + 24, + 32 or + 96. The offline banner sat below the filter bar on 4 screens and inside a rounded box on Login | S1 |
| Cards | Four local `Card` copies (ticket detail, profile, task detail, approval detail) plus `FormCard`. Card titles were 8 dp above content in three of them and 12 dp in two. 16 cards had no border, 5 had `border-gray-100`. Notification and attachment cards used `p-3` with 8 dp gaps; all others `p-4` and 12 dp | S2 |
| Headings | Record titles were `text-lg font-bold` (ticket, task, article) or `text-base font-bold` (approval context, change, service request). Card titles were `text-base font-semibold`, but rows used `text-sm semibold` (recent tickets) or `text-sm medium` (tasks) | S3 |
| Text colour | 26 × `text-gray-800` and 29 × `text-gray-600`, neither of them a token. 15 × `text-gray-400` for text, plus 13 gray-400 placeholders, all about 2.5:1 | S4 |
| Buttons | Primary actions were blue-600 (Login, "Raise a ticket" as a 56 dp `rounded-xl text-lg` block, both FABs) next to brand-red SubmitButtons. Nine local outline-button variants used `py-2`, `py-2.5` or `py-3`, labels in gray-800 or gray-900, and icons of 16 or 18. EmptyState's action was `py-2`; ErrorState said "Try again", the banners "Retry" | S5 |
| Filters, search | Five chip copies (Tickets, KB, Approvals, Tasks, task editor): active was blue-600, or a blue-50 outline in the editor, and chips were about 26 dp tall. Sort and country pills were `text-xs`, about 22 dp tall. Four search boxes were 35 dp with a gray-100 fill and gray-400 placeholder | S5 |
| Rows, separators | Rows used `py-2`, `py-2.5` or `py-3`. Separators were gray-100; structural borders gray-200; the history card drew a separator under its last row. OptionSheet rows had no separators, PersonPicker rows did | S6 |
| Icons | Header icons were 24 but the ⋮ button was 22, drawer icons 22 and tab icons React Navigation's default. Leading list icons were 18–22, chevrons 16, chip icons 10–16, empty states 40 and the crash screen 44 | S7 |
| Touch targets < 44 dp | 21 controls were below 44 dp (§3.4) | S8 |
| Accent | Blue-600 was used for primary actions, active chips, the selection bar, spinners and pull-to-refresh in 15 files, while the brand primary is red | S4, S5 |
| Avatars | Profile used a solid blue-600 circle, the requester and comment avatars blue-100; the drawer avatar used `primary/10` | S3 |
| Home KPI tiles | Tinted tiles (blue-50 …) in hand-picked hues; the KPI tokens from Phase B (`colors.kpi`) were unused | S2 |
| Loading | The ticket-card skeleton stood in for notifications, announcements, KB, approvals, the task list, comments, history and attachments. The KB article used the ticket-detail skeleton | S11 |
| Status bar | Always dark, including on the blue selection bar and the black image viewer | S12 |

## 2. The standards (applied everywhere in Phase C)

**S0 Scale.** `inlineRem: 16` in `metro.config.js`: 1rem = 16 dp, as on the web. Tokens are unchanged.
- Sizes: `text-xs` 12, `text-sm` 14, `text-base` 16, `text-lg` 18, `text-xl` 20, `text-2xl` 24; `p-4` 16; `h-11` 44.
- Nothing smaller than `text-xs`, and no arbitrary `text-[…]` sizes.
- One exception, Login only (§10): its display sizes (42, 21, 15, 13 dp) are named styles in `src/theme/typography.ts`
  (`loginType`), not classes.
- This makes everything 14 % larger than before. To revert, delete `inlineRem: 16`; nothing else depends on it.

**S1 Screen frame.**
- Order: canvas `bg-gray-50` → ScreenHeader (white, 56 dp, `border-border`) → OfflineBanner → search or filter bar (white, `px-4 py-2`) → QueryBanner → content.
- Gutters 16 dp (`mx-4`). The first item sits 12 dp below the bars, cards are 12 dp apart and Home sections 16 dp apart.
- Bottom padding: insets + 24, or insets + 96 under a FAB.

**S2 Card** (`src/components/Card.tsx`). This is the web card:
- `rounded-xl border border-border bg-white p-4`, no shadow, `mx-4 mb-3`.
- The title is the section caption, 12 dp above the content.
- `flush` gives a card of rows (`px-4` only).
- Tinted variants (private note, unread notification, selected ticket, announcement banner) change colour only.
- KPI tiles are this card with a coloured 32 dp square from `colors.kpi`, the label in `text-sm gray-500` and the count in `text-2xl font-bold`, like the web's KPICard. Since G6 (§11) they also have a 4 dp left edge in the same colour.
  - Arrangement: the square top-left, the label under it at the tile's full width, the count at the tile's foot. The web puts the label beside the square, but a phone tile leaves only about 80 dp for that.
  - Grid: two per row, 12 dp apart both ways, built as explicit rows with tile widths in dp from the grid's measured width. An odd last tile spans its row. Tiles in a row stretch to the taller one, so the counts line up. Minimum height 128 dp (`min-h-32`).
  - Labels are never truncated and never break inside a word. Each word may take a line (two lines at most). A word that is still too wide shrinks to fit (`adjustsFontSizeToFit`, no `minimumFontScale`).
  - **No percentage widths in a wrapping row** (`w-[48%]` + `flex-wrap`) for a grid, anywhere. On a device the tiles came out as wide as their content (§5).

**S3 Typography and avatars.**
- Screen title: `text-lg font-semibold`. Home greeting: `text-xl font-bold`. Its text is "Good morning, Ronit" (since 2026-10-29; "Hello, Ronit" before). §9 has the rule.
- Record title: `text-lg font-bold`. Card/list title: `text-base font-semibold`. Row title: `text-sm font-semibold`.
- Section caption: `text-xs font-semibold uppercase tracking-wide text-gray-500`. Sub-label: `text-xs font-semibold text-gray-500`.
- Body `text-sm`, meta `text-xs`, IDs `text-xs font-semibold text-gray-500`.
- Avatars: `bg-primary/10` with `text-primary` initials (the web's avatar); amber on private notes. On a ticket card's
  people row (§14.1) they are 25 dp: the requester in this avatar, the technician in slate-700 with white initials.

**S4 Colour.**

| Use | Token | Value |
|---|---|---|
| Headings, values, row text | `text.primary` | gray-900 |
| Body copy, field labels, outline-button labels | `text.body` | gray-700 |
| Captions, meta, hints, placeholders | `text.secondary` | gray-500 |
| Icons, chevrons, disabled marks (never text) | `text.muted` | gray-400 |

- gray-600 appears only as the badge-fallback pair and as meta text on tinted cards (§3).
- Brand red (`primary`) marks the primary action, every active or selected state, spinners and pull-to-refresh.
- Blue is for links (`text-blue-700`) and information (notices, unread, "New reply").

**S5 Buttons and controls.**

| Control | Size and shape | Colour and text | Placement |
|---|---|---|---|
| `SubmitButton` (primary) | 48 dp, `rounded-lg` | `bg-primary`, `text-base` semibold | One per form, full width at the bottom |
| `OutlineButton` (secondary) | 44 dp, `rounded-lg` | gray-300 border, `text-sm` medium gray-700, 18 dp icon | `compact` for 2–3 across; `align="start"` for a stack of actions |
| Text link | 44 dp target | `text-sm font-medium text-blue-700` | — |
| FAB | 56 dp | `bg-primary`, 28 dp icon | Bottom right, 20 dp above the inset |
| `FilterChip` | 36 dp + 4 dp hit slop, `rounded-full` | Active `bg-primary` | Filters, sort and quick picks |
| `SearchField` | 44 dp, white | `border-gray-300`, gray-500 placeholder | Clear button is 44 dp |
| Segmented tabs | Each tab 44 dp on a grey track | Active tab white | — |

SubmitButton tones are `success` green-700, `danger` red-600 and `muted` gray-700.

**S6 Rows.**
- Tappable rows are at least 44–48 dp (`py-3`), separated by gray-100 lines, with no line after the last row.
- Key/value rows are `py-2`, with a 112 dp `text-sm gray-500` label column and a `text-sm gray-900` value.
- Structural borders are `border-border`.

**S7 Icons.**

| Where | Size (dp) |
|---|---|
| Header, tab bar, drawer | 24 |
| FAB | 28 |
| Leading list icons | 20 |
| Buttons, inputs, banners, chevrons | 18 |
| Chips and beside `text-xs` | 12–14 |
| Empty, error and crash states | 40 |
| Empty list illustration (S11) | 128 × 96 |
| Greeting mark beside the Home greeting (§14.2) | 26 |
| People-row avatar on a ticket card (§14.1) | 25 |
| Paperclip for an e-mail's inline image in a rendered body (§14.9) | 16 |

**S8 Touch targets.** Every control is at least 44 dp: either by size (`h-11`, `min-h-11`, `min-h-12`) or, where a small visual is intended (badge, chip, checkbox, ✕), with a `hitSlop` that makes up the 44 dp.

**S9 Badges.**
- Pill: `rounded-full px-2.5 py-0.5 text-xs font-medium`, colours from `colors.status`, `priority`, `sla` and `badgeFallback`.
- Badge rows: `mt-2 flex-row flex-wrap items-center gap-1.5`.
- Tags and the ticket source use the same pill.

**S10 Callouts.** Notice, InlineError, LookupError and the Login failure box are `rounded-lg p-3`. Errors use an 18 dp icon with `text-sm`; information uses a 16 dp icon with `text-xs`.

**S11 States.**
- Loading: a skeleton that mirrors the layout, with a soft brand-yellow band sweeping across it (yellow since 2026-10-30, §10.3; white in Phase A1; it pulsed before). Variants: `list`, `approvals`, `articles`, `announcements`, `notifications`, `tasks`, `comments`, `history`, `audit` (G8, §13), `attachments`, `detail`, `article`, `formPage`, plus the inline ones.
- Empty: a 40 dp icon, a title, what would appear here, and an action where one helps. Examples: "Raise a ticket", "Show all tickets", "Clear search", "Show all articles", "Show all approvals", "Show all tasks".
  - An empty list screen shows an illustration instead of the icon (Phase A1, `EmptyState illustration`), 128 × 96 dp, flat, in brand tokens only (`assets/illustrations/`):
    - `empty` (an empty tray under the Meru drop): nothing here yet, or nothing matches. Tickets, tasks, knowledge base, announcements, the catalogue and My Requests.
    - `clear` (the Meru drop with a tick): nothing waiting for you. Approvals and Alerts.
  - Everything else keeps its icon: offline, no access, not found, "Keep typing", the ticket-detail tabs and Home's recent tickets (sections inside a screen, not a screen).
- Motion: tokens in `src/theme/motion.ts`, rules in `docs/PERFORMANCE.md` §10.
  - Rows of a list enter with a short stagger the first time it shows.
  - A status badge pulses when its own record's status changes.
  - Since 2026-11-03 (§14.7), every tappable card and list row dips and dims while held (`PressableCard`).
  - Since 2026-11-03 (§14.8), a Home tile's number cross-fades into the new one when the period changes (`CountFade`).
  - Nothing in a list row loops.
- Error: the `describeError()` message plus an outline **Retry** button.
- Offline: the banner directly under the header on every screen, and on Login at the top; OfflineState for a first load.

**S12 Chrome.**
- Tab bar (`src/navigation/AppTabBar.tsx`): on every signed-in screen, in the same place (§7). White with a `border-border` top line. Active red, idle gray-500, 24 dp icons (filled when active), and a red unread badge. On a drawer screen no tab is active, so none is highlighted; the drawer's red row shows the module.
- Header left button: ☰ only on the three tab roots (Home, Tickets, Alerts). Every other screen, including the first screen of each drawer module, has the back arrow (44 dp button, 24 dp icon), which does exactly what Android back does. Sheets have ✕.
- Drawer, top to bottom, as in the web sidebar:
  - Header band: white, 72 dp tall, the logo left at 44 dp, "Setu" beside it on one line (`text-lg font-bold text-gray-900`, S3's title step). Fixed; it does not scroll.
  - Nav rows (Approvals, Tasks, Knowledge base, Service Request, Announcements, Audit log, Settings): 48 dp, active `bg-primary` with white text, idle gray-600 (both as on the web). Only this list scrolls. Since 2026-10-29 Knowledge base and Announcements are ADMIN only (`docs/ROLE-MATRIX.md` §16), and since G8 the Audit log too (§13), so other roles have four rows. Approvals is on every drawer since G7 (§12).
  - **Audit log (G8)** sits below a divider (`border-border`, 16 dp side margins, 8 dp above and below), after Announcements and before Settings: an administrator's tool, set apart from the modules everyone has.
  - A `border-border` separator, then the account card pinned to the bottom. It is the standard card (`rounded-xl border-border`, 8 dp from the drawer edges) and contains:
    - a row with a 40 dp avatar (S3), the name (up to 2 lines), the role, the country-lock chip when it applies, and an 18 dp chevron. Tapping it opens the profile;
    - a gray-100 line;
    - **Sign out**, 48 dp, red-600 icon and label (the web's `text-red-600`), `red-50` when pressed. While signing out, the icon becomes a brand-red spinner and the label reads "Signing out…".
  - The version line under the card. The drawer pads by the top and bottom safe-area insets, so the line stays clear of the gesture bar.
- Status bar: dark on white and grey screens; light on the red selection bar, the black image viewer and Login's red card (§10).

## 3. Contrast (WCAG AA: 4.5:1 for text, 3:1 for UI graphics)

Computed with the WCAG 2.x relative-luminance formula on the exact token hex values.

### 3.1 Failures found and fixed

| Where | Pair | Ratio | Fix | After |
|---|---|---|---|---|
| 14 captions, timestamps and empty-value texts (Updated…, Home captions, drawer caption and version, list footers, KB dates, approval stage and time, notification time, "No description", empty select fields) | gray-400 on white / gray-50 | 2.54 / 2.43 | gray-500 (`text.secondary`) | 4.83 / 4.63 |
| 9 text-field placeholders | gray-400 on white | 2.54 | gray-500 | 4.83 |
| 4 search-box placeholders | gray-400 on the gray-100 fill | 2.31 | gray-500 on a white search field | 4.83 |
| Tab bar idle label | gray-400 on white (web token) | 2.54 | `nav.tabIdle` gray-500 | 4.83 |
| Approve button (`success`) | white on green-600 | 3.30 | green-700 | 5.02 |
| CANCELED status badge | red-600 on red-100 (web pair) | 3.95 | red-700 | 5.30 |
| Alerts tab unread badge | white on React Navigation red `#FF3B30` | 3.55 | brand red | 5.47 |
| Selection bar "max 20" | blue-100 on blue-600 | 4.24 | white on brand red | 5.47 |
| Unread notification meta text | gray-500 on blue-50 | 4.44 | gray-600 | 6.94 |
| Selected ticket card meta text | gray-500 on red-50 | 4.42 | gray-600 | ≈ 7.0 |
| Spinner on an in-flight button (graphic) | white on gray-300 | 1.5 | gray-600 | 5.13 |

### 3.2 Checked and passing

- **White text on brand red `#D21121`: 5.47:1.** This passes AA for normal text. Brand red text on white is also 5.47; brand red on `primary/10` (avatars) is 4.61.
- Body and heading text: gray-900 17.7, gray-700 10.3, gray-500 4.83 on white; links blue-700 6.70 on white and 6.13–6.46 on the tinted banners.
- Every status, priority and SLA badge is 4.51–10.4. The closest are amber-700/amber-100 4.51, orange-700/orange-100 4.52, green-700/green-100 4.57 and yellow-700/yellow-100 4.58. These are the web's pairs: they pass, but with almost no margin.
- Other chips (-800 on -100): 6.4–7.4. Callouts (-800/-900 on -50/-100): 6.4–9.5.
- Segmented tabs: gray-700 on gray-200 is 8.33. Drawer idle gray-600 is 7.56.
- Disabled controls ("Mark all read" with nothing unread, grey in-flight buttons) are exempt under WCAG 1.4.3, and were not changed.

### 3.3 Reported, not changed (UI graphics)

- **White icons on four web KPI colours fall below 3:1:** yellow-500 1.92, green-500 2.28, gray-400 2.54, orange-500 2.80.
- The icons are decorative, because the tile's text label carries the meaning. The colours are the web's KPI tokens, so they were kept.
- The other three KPI colours pass 3:1: purple-500 3.96, blue-500 3.68, red-500 3.76.
- Chevrons in gray-400 (2.54) are decorative.

### 3.4 Touch targets fixed (sizes at the old 14 dp rem)

- **Headers:** header buttons 35 dp, the ⋮ button 35, "Mark all read" 25.
- **Filters and search:** filter chips 26, sort and country pills 22, search clear 34.
- **Buttons:** segmented tabs 29, Reply/Reply all/Note 35, status transition buttons 30, Home shortcuts 31, KB "Yes, this helped" 31, EmptyState action 31, ErrorState retry 31.
- **Small controls:** LookupError Retry 30, attachment remove 36, email-chip remove 22, TicketCard status chip 29.
- **Text links:** "See all", "Show more", "Show it again", "Use this device's timezone" and "Download and share".

All are now at least 44 dp.

## 4. 360 dp width and large system text

This was checked by layout arithmetic on every row that holds more than one control. It was not run on a device: no build in this phase.

- **Text that wraps instead of truncating:** key/value labels; KPI tile labels (a line per word, two at most; a single word shrinks rather than splits, §5); ticket-detail tab labels (shrink to 85 %, then 2 lines); the reply-mode tabs.
- **Equal-width button rows** (Reply/Reply all/Note, Pick up/Assign/Close, Camera/Photos/Files) have about 92–104 dp per button at 360 dp. Their labels shrink to as little as 75 % on one line instead of wrapping (`OutlineButton compact`).
- **Rows with long values:** the country pill and its label shrink with an ellipsis; "Current status" and its badge wrap onto two lines.
- **Fixed-size boxes:** the drawer header (72 dp) and the 44 dp drawer logo leave 188 dp for the app name on the 304 dp drawer. React Navigation's default width at 360 dp is the window minus 56 dp (`react-native-drawer-layout` `getDrawerWidthNative`); this line said 296 dp until Phase C2.
- **To check on the next build:**
  - the Ticket list filter bar with a long country name at 130 % text;
  - the ticket-detail tab labels at 130 %;
  - the splash on Android 12+ (icon circle) and Android 11 or older;
  - the Home KPI tiles and the drawer at 360 dp, at 130 % and at 200 % (§5);
  - a pre-existing drawer item at 200 % text, unchanged in Phase C2: "Announcements" (about 233 dp) is wider than
    the 224 dp row label and may split mid-word. (The header band's clipping risk at 200 %, listed here until
    2026-10-23, is gone: the name is now one line, §6.)

## 5. Phase C2 — device fixes (2026-10-20)

Found on a phone while testing Phase C. Layout only: no API call, query, KPI or data source changed. Checked by layout
arithmetic, with Roboto advance widths and the dp values NativeWind compiles (`inlineRem: 16`). **Not run on a device:**
no build in this phase.

### 5.1 Home KPI tiles

> **G6 (2026-11-02) changed the tile set.** The grid rules below still hold, but the tiles are now the web's five, and Active and Unassigned are status chips. The current pattern and its 360 dp figures are in §11.

**Before.** The tiles were six squeezed into one row, with the sixth wrapping alone. Labels showed as "I", "A" and
"right now".
- The tiles were `w-[48%]` in a `flex-row flex-wrap` row. NativeWind compiles that class correctly (`width: '48%'`), so the percentage was lost at layout time on the device.
- Each tile then took its content width, about 70 dp, so five fit in a row.
- The label beside the icon was `flex-1` with nothing to grow into, so it collapsed to one letter.

**Now (S2).**
- Explicit rows of two, with tile widths in dp. An odd last tile spans its row: Active, for the 5-tile AGENT and L2 sets.
- The label sits under the icon square.
- Rows stretch to their taller tile, and each count sits at its tile's foot.
- The grid sits 16 dp below the greeting block (S1). Every size in it is explicit, so nothing can overlap the "Hello" header.

**At 360 dp.**
- Grid 328 dp, each tile 158 dp, label width 124 dp (after the 1 dp borders and 16 dp padding).
- 6 tiles (ADMIN, triage AGENT): 3 rows. 5 tiles: 2 rows plus a full-width Active tile. END_USER: 1 row.

| Label (`text-sm`) | 100 % (14 dp) | 130 % (18.2 dp, Android ≤ 13 max) | 200 % (28 dp, Android 14+ max) |
|---|---|---|---|
| Open | 1 line | 1 line | 1 line |
| In progress | 69 dp, 1 line | 89 dp, 1 line | 137 dp → 2 lines ("progress" 108) |
| On hold | 47 dp, 1 line | 61 dp, 1 line | 94 dp, 1 line |
| SLA breached | 85 dp, 1 line | 110 dp, 1 line | 170 dp → 2 lines ("breached" 113) |
| Active + "right now" (`text-xs`) | 38 + 49 dp | 49 + 63 dp | 76 + 97 dp |
| Unassigned | 71 dp, 1 line | 93 dp, 1 line | 143 dp, one word → shrinks to about 87 %, 1 line |
| Resolved (END_USER) | 56 dp, 1 line | 72 dp, 1 line | 111 dp, 1 line |

- **Counts** (`text-2xl` bold): "375" is 41, 53 and 82 dp at the three sizes. Four digits fit at 200 % (109 dp). Five digits shrink.
- **Tile heights**, for a one-line label and then with Active's hint:
  - 100 %: 130 dp, and 146 dp with the hint.
  - 130 %: 146 dp, and 166 dp with the hint.
  - 200 %: 182 dp; 222 dp with a two-line label; 214 dp with the hint.
- **6-tile rows at 200 %:** 222, 222 and 214 dp. Rows can differ in height; the two tiles within a row never do.
- **Worst case:** "Unassigned" at 200 % on a 320 dp phone needs about 71 %. With no `minimumFontScale` it still fits in full.
- **Font scaling:** this assumes RN scales linearly. If Android 14's non-linear scaling applies, every 200 % figure is smaller.

### 5.2 Drawer

- **Before.** Logo header, account card, nav rows, Settings, Sign out, then the version line, all in one scroll view.
- **Now (S12).**
  - The header band is fixed. The nav rows and Settings scroll.
  - A separator, then the account card pinned to the bottom, with Sign out inside it.
  - Then the version line.
  - The bottom inset is padded as before.
- **Navigation is unchanged.** Every row calls the same `go()` target: Approvals (same visibility rule, 08 S1), Tasks, Knowledge base, Announcements, and Settings → Profile. The card opens Profile, and Sign out calls the same `useSignOut` (confirmation, AUTH-3, local wipe).

At 360 dp the drawer is 304 dp wide. The account card's name column is 192 dp, and the nav labels get 224 dp.

| | 100 % | 130 % | 200 % |
|---|---|---|---|
| Pinned block (separator + card + version line) | 168 dp | 186 dp | 276 dp (the name wraps to 2 lines) |
| Nav list, ADMIN (5 rows) | 256 dp | 256 dp | about 300 dp |
| Room for the nav list on a 360 × 640 phone (568 dp drawer − 72 header − pinned block) | 328 dp: no scroll | 310 dp: no scroll | 220 dp: the list scrolls, the card stays pinned |

## 6. App name: "Setu" (2026-10-23)

The display name changed from "Mount Meru Service Desk" to "Setu". Only the name text changed. The logo, the icons,
navigation, behaviour, and the package identity (`android.package`, `slug`, `scheme`, `version`, `versionCode`, EAS
`projectId`) did not.

| Where | Before | Now |
|---|---|---|
| Launcher (`app.json` `name`) | Mount Meru Service Desk | Setu |
| Splash image (`assets/splash-icon.png`) | logo + two lines | logo + one line; regenerated, see `docs/RELEASE.md` §7 |
| Login card heading (`text-2xl font-bold`) | Mount Meru Service Desk | Setu |
| Drawer header (`DrawerContent.tsx`) | "Mount Meru" / "Service Desk", two `text-sm font-bold leading-5` lines | "Setu", one `text-lg font-bold` line; TalkBack reads it as the header |

Layout, checked by arithmetic at 360 dp. The widths use Segoe UI Bold advance widths as a stand-in for Roboto.
**Not run on a device:** there was no build.
- **Login card.** The heading has 294 dp. The old name was about 295 dp, right at the limit, so it could break onto
  two lines; at 130 % it always did. "Setu" is about 50 dp at 100 % and 100 dp at 200 %, so it takes one line at
  every size. Where the old name wrapped, the card is now one line (32 dp) shorter. It stays centred by the scroll
  view's `justify-center`. No size or spacing changed: `text-2xl font-bold` is the web login title's size
  (`WEB-TOKENS.md` §1.9).
- **Drawer header.** The name column is 188 dp beside the 44 dp logo.
  - A single `text-sm` line would be a 20 dp line next to a 44 dp logo, leaving the band looking empty. The old two
    lines made a 40 dp block.
  - `text-lg` (18 dp on a 28 dp line) is S3's title step and the closest single line. It stays bold, like the old
    name and the web sidebar's name.
  - "Setu" is about 38 dp wide, and 76 dp at 200 %.
  - The line is 28 dp at 100 %, 36 dp at 130 % and 56 dp at 200 %. All of these fit the fixed 72 dp band, so the
    200 % clipping risk in §4 is gone.
- **Splash.** The block is 559 px tall instead of 679 and is re-centred. Logo and text sizes are unchanged on screen
  (a 120 × 73 dp logo and 19 dp text).

Left as they were, on purpose:
- In-app text that says "the Service Desk" means the backend system or the IT team, not the app. Examples:
  "Can't reach the Service Desk", "contact the Service Desk", "Open the Service Desk on the web".
- "Mount Meru" as the organisation: "Sign in with your Mount Meru work account" and the logo's accessibility label.

Superseded on 2026-10-30 by the "arc split" login (§10): the login card, its `text-2xl` heading and the line "Sign in
with your Mount Meru work account" are gone. Login now says "Sign in with your work account" under a "Setu" wordmark,
and "Mount Meru Group" in its sub-line and footer. The native splash shows only the drop (§10.4); the logo and "Setu"
come in with the start-up intro.

## 7. Tab bar on every screen, back arrow on every non-root screen (2026-10-23)

Found on a device: the bottom bar disappeared on the drawer screens (Approvals, Tasks, Knowledge base, Service
Request, Announcements, Settings), and those screens had no back button. Navigation chrome only: no screen's content,
API call, query or permission changed. **Not run on a device:** there was no build.

### 7.1 Structure

- **The navigator tree did not change:** Root → Drawer → (MainTabs: Home · Tickets · Alerts | Approvals | Tasks |
  Knowledge | Catalog | Announcements | Profile). No screen moved, and none is registered twice.
- **The bar moved instead.** `AppTabBar` is the one bar component, with two hosts:
  - MainTabs passes it to the tab navigator as `tabBar`. A press there is the navigator's own: it emits `tabPress`
    (a second press on Tickets pops its stack to the list) and switches tab.
  - The drawer's `screenLayout` puts it under every other drawer screen.
  - Both hosts draw it at the bottom of the full screen area, so it never moves between screens.
- **Why not hidden tabs.** The textbook fix moves the drawer modules into the tab navigator as hidden tabs. That
  changes who registers each module, and `tests/rbac/service-catalog.test.mjs` pins the drawer registration
  (`<Drawer.Screen name="Catalog" …>` and the drawer's `navigate('Catalog', …)`). Moving the bar keeps every route,
  and its gating, exactly where the tests expect it.
- **Size:** React Navigation's default bar, which the app used until now: 49 dp plus the bottom inset, a hairline
  top line, elevation 8, a 24 dp icon over a 12 dp label. The unread badge reads the cached NTF-2 count; MainTabs
  still owns the only fetch.
- **On a drawer screen** no tab is active, so none is highlighted. The drawer's red row shows the module. Tapping a
  tab opens it with its stack as it was left.

### 7.2 Back

- **Drawer screens use the back arrow** (`ScreenHeader variant="back"`), the same `goBack()` that Android back
  dispatches. The ☰ stays on the three tab roots only. The drawer still opens from every screen by the left-edge
  swipe, as on pushed screens before.
- **The drawer's `backBehavior` is `fullHistory`** (it was `initialRoute`). Back from a drawer screen returns to
  where the user came from. The tabs are the history's first entry, so back always ends on Home, then exits.
- Checked by replaying the app's actions on the installed routers (`@react-navigation/routers` 7.6.5):

| Path | Before (`initialRoute`) | `history` (rejected) | Now (`fullHistory`) |
|---|---|---|---|
| Tickets → Approvals, back ×3 | Tickets, Home, exit | same | Tickets, Home, exit |
| Approvals → Knowledge, back ×3 | **Home** (skips Approvals), exit | Approvals, Home, exit | Approvals, Home, exit |
| Approvals → Home (tab bar), back ×3 | — (no bar there) | Approvals, **exit** | Approvals, Home, exit |
| Approvals → Tickets (tab bar), back ×4 | — | Home, Approvals, **exit** | Home, Approvals, Home, exit |
| Alerts, back ×2 (tab rule) | Home, exit | same | Home, exit |

- **Unchanged:** a non-Home tab root still goes back to Home first (08 §3.1).
- **Known effect of `fullHistory`:** going back to an older visit restores that visit's navigation params, as a
  browser does. For example, back to a MainTabs visit that a drawer-screen tab press opened on Tickets lands on
  Tickets, even if the user had switched tabs after that press.

### 7.3 Every route checked (26; AuditLog added in G8)

| Host of the bar | Routes | Header left |
|---|---|---|
| Tab navigator (`tabBar`) | HomeTab, AlertsTab, TicketList | ☰ |
| Tab navigator (`tabBar`) | TicketDetail, CreateTicket, TaskDetail, TicketLink | back |
| Tab navigator (`tabBar`) | ReplyComposer, StatusClosure, AssignPicker, SubmitApproval, TaskEditor, TicketFilters (sheets) | ✕ |
| Drawer (`screenLayout`) | ApprovalsInbox, TaskList, KnowledgeBase, ServiceCatalog, Announcements, AuditLog (G8), Profile | back (was ☰) |
| Drawer (`screenLayout`) | ApprovalDetail, TaskDetail, KbArticle, ServiceRequestForm, ServiceRequestDetail | back |
| Drawer (`screenLayout`) | TaskEditor (sheet) | ✕ |

- **Nothing can sit behind the bar.** It is laid out below each screen, not over it, so every screen's area ends at
  the bar's top edge.
  - Every scrollable keeps its own bottom padding (inset + 24, or inset + 96 under a FAB).
  - The only pinned elements are the Home FAB, and the Tickets FAB and bulk bar. They are inside their own screen,
    above the bar, as before.
  - Sheets are `presentation: 'modal'` stack screens, drawn inside the stack on Android, so the bar stays under them,
    as it already did under the ticket composer.
- **Keyboard.** Of the keyboard-avoiding screens, ApprovalDetail, Profile, TaskEditor and ServiceRequestForm are new
  above a bar. `KeyboardAvoidingView` measures its own frame, so the bar below it only reduces the padding needed,
  as for the ticket composer.
- **Safe area.** The bar pads the bottom inset (gesture or button bar), as before. Screens did not change, so their
  bottom gap is inset + 24 on drawer screens too, as on the tab screens. Bottom sheets (`OptionSheet`, pickers) are
  window-level modals over the bar and keep their own inset padding.
- **To check on the next build:**
  - on each drawer screen: the bar in the same place as on the tabs, and none highlighted;
  - back from a drawer screen opened from each tab;
  - the left-edge swipe opening the drawer on a gesture-navigation phone, where Android may claim that edge for
    back (the ☰ is then one tab tap away);
  - ServiceRequestForm and ApprovalDetail with the keyboard open.

## 8. Inline property editors on the ticket (restated 2026-10-27)

The ticket's Properties card has four inline editors. Each follows one pattern, from
`src/screens/tickets/TicketPropertyEditors.tsx`: "Change impact and urgency", "Change category", "Change technician"
(added 2026-10-27) and "Change country". "Edit resolution", in the Resolution card, follows it too. A new editor uses
the same pieces and adds no new styles.

- **Closed, the field's rows come first**, as key/value rows (S6). The action goes under them, in `FieldAction`:
  - **Editable:** a text link (S5) at least 44 dp tall, with an 18 dp `create-outline` icon and a `text-sm
    font-medium text-blue-700` label "Change …". It sits on its own row with the gray-100 separator.
  - **Blocked by the ticket's state** (e.g. the AGENT lock): a 14 dp lock icon and the reason in `text-xs
    text-gray-500`, in the same place.
  - **The role never edits it:** nothing under the value. The value always shows; the row is never hidden.
  - While another editor is open or a write is in flight, the link is at 50 % opacity and disabled. Its hint says to
    finish or cancel the open change first.
- **Open, the editor replaces the rows**, in a `py-3` block with the gray-100 separator below:
  - Each choice is a `SelectField` that opens a bottom sheet (`OptionSheet`, or `PersonPickerSheet` for people). A
    choice is only staged in the field.
  - A first load shows a small brand-red spinner beside "Loading …". A failed lookup shows `LookupError`.
  - The consequences of saving go in a `Notice` (info, or warning for a removal), shown only once something has
    changed.
  - **Save** (`SubmitButton`, the one primary action) and **Cancel** (`OutlineButton`, 8 dp below) come last.
- **Behaviour:**
  - Nothing saves on selection, blur or navigation. Leaving with a staged change asks first.
  - Save stays disabled until something has changed. While saving, Save shows its spinner, and Cancel and the fields
    are disabled.
  - One editor is open at a time.
  - Success: a toast, the editor closes and the row shows the server's value.
  - Failure: the server's message (a 403 says the role can't change that field), the editor closes and the row shows
    the saved value. Nothing is optimistic.

## 9. Time-of-day text: the Home greeting (2026-10-29)

Home's first line greets by the time of day: "Good morning, Ronit". Same place, same `text-xl font-bold
text-gray-900` header as the "Hello, Ronit" it replaces (S3), with the role under it as before.

- **Three greetings only,** from `src/utils/greeting.ts`: "Good morning" 05:00–11:59, "Good afternoon" 12:00–16:59,
  "Good evening" 17:00–04:59. The small hours stay "evening", because there is no fourth greeting and "Good morning" at
  2 a.m. reads as wrong to someone still on a late shift.
- **Format:** the greeting, a comma, then the first word of the display name. With no name, the greeting alone ("Good
  evening"). An e-mail-style display name gives the same first name the drawer shows.
- **Clock:** the phone's local time. No server time, and not the timezone in the person's profile: the phone's clock is
  what they see beside the app.
- **When it is recomputed, and the pattern for any later time-dependent text:**
  - read the clock on first render, when the screen gains focus, and when the app returns to the foreground on that
    screen (`AppState` → `active`), so an app left open overnight shows the right greeting when it is picked up;
  - never on a timer or by polling: a screen nobody is looking at does no work;
  - keep the derived value (the greeting), not the time, in state, so a check that finds the same band does not
    re-render the screen.

## 10. Login "arc split", and the motion palette (2026-10-30)

The approved login design replaces the Phase C login card. Layout only: the sign-in flow, `auth.config.ts`, the
redirect URI, the failure messages, navigation and every permission are unchanged. The motion that goes with it
(start-up, sign-in, return to Home) is in `docs/PERFORMANCE.md` §12. **Not run on a device:** there was no build.

### 10.1 Layout

Reference phone 390 × 844 dp. Every value is a token: `loginLayout` in `src/theme/brand.ts`, `loginType` in
`src/theme/typography.ts`, `colors.login` and `colors.microsoft` in `src/theme/colors.ts`.

**Top: the red card.**
- Brand red, at least **63 %** of the screen's height, from the top of the screen (under the status bar, whose icons
  are white here) down. Only its bottom corners are rounded: **46 dp**.
- Two decorative circles in a lighter red (`#de1223`, hsl 355 85 % 47 %) behind the content, clipped by the card:
  - 260 dp, centred at (352, 36): it bleeds off the top right;
  - 150 dp, centred at (−22, 372): smaller, off the left at the card's lower third.
  - Their x and size scale with the screen's width, their y with its height.
- The offline banner, when offline, at the top of the card (S1: on Login, at the top of the screen).
- Padding 28 dp at the sides, 24 dp under the status bar, 44 dp above the rounded edge.
- **Logo card:** white, 124 × 84 dp, radius 20, padding 12 dp top and bottom and 16 dp at the sides. The mark is
  contained in the 92 × 60 dp inside (it is about 1.6 : 1, so it fills the width). Not a square: a square would leave
  the mark floating.
- **Headline:** white, 42 dp, weight 800, line height 44 (1.05), letter spacing −1.3 dp, three lines: "One portal /
  for all your / IT needs." It is the screen's header for TalkBack. Its text size follows the system's up to 1.3 ×
  (`maxFontSizeMultiplier`): at 42 dp it is already display text. Estimate: the widest line, "One portal", is about
  200–210 dp at 42 dp, so about 270 dp at 1.3 ×, inside the 304 dp a 360 dp phone leaves. Check on a device.
- **Sub-line:** 15 dp, line height 22.5 (1.5), at most 270 dp wide, 12 dp under the headline: "Raise, track and
  resolve issues across the whole of Mount Meru Group." Colour `#fff3f4`, a pale red tint (see 10.2).
- The space between the logo card and the headline grows; the card grows instead of clipping when its text needs more
  room (large system text, the offline banner), and the page scrolls.

**Bottom: white.**
- Under the card, top to bottom, centred: the sign-out or failure message when there is one (unchanged, full
  width), then:
  - **"Setu"**, 21 dp, weight 800, `text.primary` (gray-900);
  - **"Sign in with your work account"**, 13 dp, `text.secondary` (gray-500), 2 dp below;
  - **the sign-in button**, 20 dp below (10.5);
  - "Opening Microsoft…", 8 dp below the button. Its line is always reserved, so nothing moves when it appears;
  - the **environment chip** (amber-100 / amber-800 pill, as before), 12 dp below, **only when the build is not
    production** (10.6);
  - in `__DEV__` builds only, the redirect-URI hint (unchanged).
- **"Copyright © <year> Mount Meru Group"**, 12 dp, `text.secondary`, at the bottom, 20 dp above the bottom inset + 20. The year is the device's (§15). Until 2026-11-04 the footer read "Mount Meru Group IT".

### 10.2 Colour and contrast (WCAG 2.x, on the exact values)

| Text | On | Ratio | Need |
|---|---|---|---|
| Headline, white | brand red / the lighter circles | 5.47 / 4.98 | 3 (large) |
| Sub-line `#fff3f4` | brand red / the lighter circles | 5.04 / 4.60 | 4.5 |
| "Setu", gray-900 | white | 17.7 | 4.5 |
| Prompt and footer, gray-500 | white | 4.83 | 4.5 |
| Button label, gray-900 | white | 17.7 | 4.5 |
| Environment chip, amber-800 | amber-100 | 6.37 | 4.5 |

Two deviations from the design's words, both for AA:
- **The sub-line is a very pale tint.** A visibly pink tint such as `#ffd6da` is 3.8 : 1 on brand red. The circle
  overlaps the sub-line's first letters, so the tint must pass on the lighter red too: `#fff3f4` is the palest red tint
  that passes on both with some margin.
- **The footer is gray-500, not a lighter grey.** gray-400 is 2.5 : 1 on white (S4: never text). gray-500 is the
  lightest grey that passes; the footer differs from the prompt by size (12 against 13 dp).

### 10.3 The motion palette

Every animation plays on a **white ground** with **brand yellow (`#ffcc00`) as the working accent**. Red appears only
where the logo itself is red. Tokens: `colors.motion` (`ground` white, `accent` brand yellow, `track` `#fff0b3`, brand
yellow at about 30 % on white).

| Where | White | Yellow | Red |
|---|---|---|---|
| Start-up intro | the whole ground | the drop, the rule under "Setu" | the logo's own "m" and "meru" |
| Sign-in spinner | the circle's fill | the arc (accent) on a pale ring (track) | none |
| Loading shimmer | the cards it crosses | the sweeping band (S11) | none |
| Login's red card | — | — | the card is a layout surface, not motion |

The spinner's ring and arc are decoration: yellow on white is about 1.1–1.5 : 1, below the 3 : 1 for graphics, so the
caption "Opening Microsoft…" says what is happening (and TalkBack announces it).

### 10.4 The logo asset

- `assets/brand/meru-mark.png` (566 × 346) **has a transparent background**: its corners and 51 % of its pixels are
  fully transparent.
- **The mark itself is not fully opaque.** It was made by "colour to alpha" against white (RELEASE.md §7), so the red is
  at alpha 228 / 255 (89 %) and the yellow at 252 / 255. On white it composites back to the exact brand colours. On any
  other background the red takes on that background's colour.
- So the design works because the mark sits in a **white card**. On the red card directly, the "m" would disappear,
  and a tinted card would tint the logo. A future change of the card's colour needs either the white card or an opaque
  (vector) mark from brand: the same request as RELEASE.md §7's "Resolution".
- New: `assets/brand/meru-drop.png`, the mark with everything but the drop cleared, same canvas (the start-up intro
  animates the drop alone). The native splash, `assets/splash-icon.png`, now shows only the drop. Both are drawn by
  `scripts/make-splash-assets.py`; RELEASE.md §7 has the details.

### 10.5 The sign-in button

- **Outlined pill, as wide as its content:** white fill, 1.5 dp gray-300 border (S5's outline grey), radius 26.
- Padding 24 dp at the sides, then Microsoft's four-square logo (21 dp, Microsoft's red `#f25022`, green `#7fba00`, blue
  `#00a4ef`, yellow `#ffb900`), 12 dp, then "Sign in with Microsoft", 15 dp weight 600, gray-900.
- **Exactly 52 dp tall**, which is also its touch target. It never shrinks: its height is fixed, and the collapse
  (PERFORMANCE.md §12.3) moves pieces drawn inside the button, never the button itself.
- At 200 % system text on a 360 dp phone the label would be wider than the screen, so it shrinks to fit on one line
  (`adjustsFontSizeToFit`), like the KPI labels (S2).
- Pressed: the fill turns gray-50. While signing in it is disabled and announced as busy.

### 10.6 The environment chip

- Shown on every build **except production**: `SHOW_ENVIRONMENT_CHIP` in `src/config/env.ts` is `APP_ENV !== 'PROD'`.
  `APP_ENV` is PROD only in a release build of the `production` EAS profile: development builds refuse PROD, and
  `scripts/eas-build-guard.js` refuses PROD on every other profile.
- Login renders it inside `{SHOW_ENVIRONMENT_CHIP ? (…) : null}`, so on production it is not in the tree at all, not
  just hidden.
- Profile (M10) still shows the environment line on every build; only Login's chip changed.
- Tests: `tests/motion/start-up-and-login.test.mjs` evaluates `env.ts` as a production release build (false), a
  preview release build, a build with nothing set and a development build (true), and checks the label is rendered
  nowhere else on Login.

### 10.7 Layout checks (arithmetic, not run on a device)

The card's content at 100 % text: status bar (~32) + 24 + 84 + at least 24 + 132 (headline) + 12 + 45 (two sub-line
lines) + 44 = **397 dp**. The white area's content, with the chip: about **282 dp** (including a 20 dp gesture-bar inset).

| Phone | Card (63 %) | Card content | White area | White content | Result |
|---|---|---|---|---|---|
| 390 × 844 | 532 | 397 | 312 | 282 | Everything on one screen |
| 360 × 640, preview build | 403 | 397 | 237 | 282 | Button fully visible (bottom at 551); chip and footer need a 45 dp scroll |
| 360 × 640, production (no chip) | 403 | 397 | 237 | 250 | Footer needs a 13 dp scroll |
| 360 × 640, 130 % text | 403 → grows to 480 | 480 | 160 | about 310 | The page scrolls; nothing is clipped |

Check on the next build: 360 dp phones at 100 %, 130 % and 200 % text; the headline's weight (800 is drawn with the
nearest system weight, Roboto Black on most phones); the offline banner on the red card.

## 11. Home: the PERIOD row, KPI tiles and status chips (G6, 2026-11-02)

Home's counts now match the web dashboard: the same periods, the same five tiles, the same second row. Web behaviour with
sources: `docs/G6-WEB-DASHBOARD.md`. **Not run on a device:** no build in this phase; the 360 dp figures are arithmetic.

Order on Home:
1. greeting;
2. ADMIN's announcement banner;
3. END_USER's "Raise a ticket";
4. **PERIOD** (16 dp below);
5. TICKETS: the tiles, then the chips 12 dp under the grid;
6. Shortcuts;
7. Recent tickets.

### 11.1 The PERIOD row

- **Caption:** "PERIOD", the S3 section caption (`text-xs font-semibold uppercase tracking-wide text-gray-500`), 4 dp above the chips.
- **Chips:** `FilterChip` (S5), unchanged. 36 dp + 4 dp hit slop. Active `bg-primary` with white `font-medium` text (5.47:1); idle white with a `gray-300` border and gray-700 text.
- **Row:** one horizontal `ScrollView`, no scroll bar, 8 dp between chips. The 16 dp gutters are *inside* the scrolling content, so chips scroll to the screen edge. `radiogroup` with `radio` chips.
- **Periods:** the web's ten, in its order and with its words in sentence case. Today, Yesterday, Last 7 days, Last 30 days, This week, **This month (default)**, Quarterly, This year, All time, Custom.
- **Scroll into view:** "This month" is the sixth chip, off-screen at 360 dp. On first layout the row scrolls so the chosen chip shows with about 48 dp of the chip before it, a hint that the row scrolls. Only once: a chip the person tapped is already in view.
- **Who:** every role but L2_MANAGER (no counts, so nothing for a period to change; `showHomePeriod`).
- **Lifetime:** in memory (`ui.store`). Kept across tabs while the app is open; back to This month after a restart or sign-out. Nothing on disk.

**Custom.** Tapping Custom selects it and, if no From day is set, opens the system date dialog for From straight away.
- **Fields:** under the row (8 dp), two buttons side by side, 8 dp apart.
  - Each is ≥ 44 dp, `rounded-lg border-gray-300` white, with an 18 dp calendar icon.
  - "From" or "To" in `text-xs gray-500` over the day: `text-sm font-medium gray-900`, or "Pick a day" in gray-500.
- **Dialog:** the same system date dialog as the Filters sheet (`DateTimePickerAndroid`). From is capped at To, or today. To starts at From and is capped at today.
- **Message,** `text-xs`, live region, under the fields:
  - "Pick a From day to see the counts." / "Pick a To day…" in gray-500;
  - "The From day must be on or before the To day." in red-700.
- **No request until the range is valid.** Tiles show "–" (gray-500) in place of a count; the recent list keeps the last response.

### 11.2 KPI tiles

- **Card:** the S2 KPI card, unchanged, plus a **4 dp left edge** in the tile's colour (Ronit's brief; the 2026-10-09 web clone's card has none).
- **Colours:** from the web (`colors.kpi`):

  | Tile | Colour | Contrast on white |
  |---|---|---|
  | Total tickets | purple-500 | 3.96 |
  | Open | blue-500 | 3.68 |
  | In progress | yellow-500 | 1.92 |
  | Resolved | green-500 | 2.28 |
  | SLA breached | red-500 | 3.76 |

  - The square and the edge are decoration: the white icon on its square is the web's, and the label carries the meaning.
- **Set:**
  - Staff: Total tickets, Open, In progress, Resolved, SLA breached, in that order. "Resolved today" when the period is Today.
  - END_USER: Open and Resolved.
- **Open's hint:** `text-xs` "right now" under the label. Open counts every open ticket whatever the period, as on the web.
- **Grid:** S2, unchanged. Two per row, 12 dp apart. Five tiles make two rows plus a full-width **SLA breached**; END_USER has one row.
- **No count:** "–" in `text-2xl` gray-500 when counts are expected but not available (Custom not picked; the error card shows above the grid). L2_MANAGER keeps "View tickets".

**At 360 dp.**
- **Width:** grid 328 dp, tile 158 dp. The label width is 121 dp: 158 − 4 (left edge) − 1 (right border) − 32 (padding). It was 124 dp before G6.
- **Labels:** the widths below scale the §5.1 Roboto measurements at about 7 dp a character at 100 %, so they are estimates.

| Label | 100 % | 130 % | 200 % |
|---|---|---|---|
| Total tickets | ~82 dp, 1 line | ~107 dp, 1 line | ~164 dp → 2 lines ("tickets" ~98) |
| In progress | 69, 1 line | 89, 1 line | 137 → 2 lines ("progress" 108) |
| Resolved today (Today only) | ~98, 1 line | ~127 → 2 lines | 2 lines ("Resolved" 111) |
| SLA breached (full width, 291 dp) | 85 | 110 | 170, 1 line |

- **Widest word:** "breached" (113 dp at 200 %) still fits a half-width tile, so no tile label needs to shrink. "Unassigned", the only word that did (§5.1), is a chip now.

### 11.3 Status chips

- **The web's second row** (staff only), as pills, in the web's order: Closed, Unassigned (ADMIN and the UI's triage AGENT only), Mgmt review, With partner, User confirm, More info, Master data, On hold. Then **Active now**, the app's own.
- **Pill:** `h-9` (36 dp) + 4 dp hit slop = 44 dp (S8), `rounded-full`, white, `border-border`, `px-3`. Inside:
  - an 8 dp dot in the chip's colour;
  - the count, `text-sm font-semibold gray-900`;
  - the label, `text-sm gray-700`, 6 dp apart.
- **Row:** `flex-row flex-wrap`, 8 dp both ways. Every chip stays visible; nothing scrolls sideways.
- **Shown:**
  - As on the web, a pending reason or On hold appears only when its count is above 0. Closed, Unassigned and Active always appear.
  - While counts load, only those three, with a small skeleton for the count, so a zero chip never flashes up.
  - L2_MANAGER: every chip, without counts, as shortcuts.
- **Tap:** opens the Tickets tab with that chip's filter, as a tile does. The list shows it as the "from Home" chip.
- **Dot colours:**

  | Chip | Colour | Source | Contrast on white |
  |---|---|---|---|
  | Closed | zinc-600 | web | 7.73 |
  | Unassigned | orange-500 | web | 2.80 |
  | Mgmt review | amber-400 | web | 1.67 |
  | With partner | purple-400 | web | 2.64 |
  | User confirm | sky-400 | web | 2.14 |
  | More info | indigo-400 | web | 2.98 |
  | Master data | teal-400 | web | 1.86 |
  | On hold | gray-400 | web | 2.54 |
  | Active now | slate-500 (`colors.kpi.active`) | app only, the web's muted-foreground | 4.76 |

### 11.4 Reported, not changed

- **Contrast:** most dots and tile edges are below 3:1 on white. They are the web's colours, and they are decoration: every chip and tile names itself in gray-700 or gray-500 text. They are kept for parity, like the UI graphics in §3.3.
- **Device check:** check on the next build at 360 dp with 100 %, 130 % and 200 % text:
  - the period row's first-layout scroll;
  - the chips' wrap;
  - the full-width SLA breached tile;
  - the From → To flow.

## 12. G7 (2026-11-02): the period on the list, Approvals, the push notice

**The period chip on the ticket list.**
- **When:** a tile that carries the Home period opens M3 with it as the Created filter (§11; `docs/G7-PERIOD-APPROVALS-PUSH.md` §1). The quick-filter row then starts with a **period chip**.
- **Look:** the active `FilterChip` look (36 dp, `rounded-full`, `bg-primary`, white `text-sm font-medium`). Inside: a 14 dp calendar icon, the period's name ("This month", "Custom"), and a 14 dp ✕. Hit slop 4 dp (S8).
- **Tap:** clears the period (the Created days) and nothing else.
- **Order:** it sits before the "from Home" filter chip, which keeps its home icon.
- **Screen reader:** "Period from Home: This month, Created 03 Oct 2026 – 02 Nov 2026. Clear the period".
- **When it goes:** it shows only while the Created days are still the tile's. Changing a day in the Filters sheet removes the chip; the days stay as the person's own. The summary line under the row still lists "Created … – …", and Clear all clears everything.

**Approvals on every drawer.** The row is the first drawer row for every role (it was already first for ADMIN and AGENT), with the pending count as its badge. Its empty inbox is the S11 "clear" state: "Nothing waiting for you". No new component.

**The Alerts push notice.**
- **What changed:** the fixed sentence ("the Service Desk has no push yet") is replaced by the state of push on this phone (`src/utils/push.ts` `pushNotice`).
- **Look:** the S10 info `Notice` (blue-50, a 16 dp icon, `text-xs`).
- **Its button:** "Turn on notifications" or "Open settings", an `OutlineButton` in its `compact`, `align="start"` form (44 dp, S5) with an 18 dp icon. It shows only for the "off" and "not asked yet" states.
- **Tone:** never the warning tone. "Not switched on at the Service Desk yet" is a fact, not a fault, and nothing on the screen is broken by it.
- **Permission timing:** the system dialog for the permission appears on the first visit to Alerts only, never at launch (Android 13+; Android 12 and older grant it at install).

**A notification in the status bar.**
- **Icon:** the logo silhouette from `assets/adaptive-icon.png`. Android draws only its alpha channel, and the file is 92 % transparent around the logo.
- **Tint:** `#D21121`.
- **Channel:** "Ticket alerts" (`setu_tickets`, high importance).
- **Device check:** check the icon's size on the next build. The adaptive-icon artwork keeps a safe-zone margin, so the logo may look small; a dedicated 24 dp white-on-transparent asset would fill the space.

## 13. The audit log, M20 (G8, 2026-11-02; ADMIN only)

**Why cards.** The web page is a six-column table (as Ronit describes it). At 390 dp that leaves about 60 dp per column, so the app stacks each entry into a card and groups the cards by day. The web page itself is not in the analysed clone (`docs/G8-WEB-AUDIT.md` §1), so there is no web file to copy its look from.

**Frame (S1).** The standard screen frame:
- ScreenHeader "Audit log" with the back arrow (a drawer screen, §7), then OfflineBanner;
- a white filter bar (`px-4 py-2`), then QueryBanner;
- the list, 12 dp below the bar, with insets + 24 at the bottom (no FAB).

**The filter bar, top to bottom** (filters completed 2026-11-05, from the backend team's written AUD-1 contract; `01` §10.5):
- **SearchField** (44 dp, S5): "Ticket number, e.g. 1234". It takes a number, "#1234" or a ticket link. On the keyboard's search key the number goes to the server as `ticketNumber`: no lookup of its own any more.
- **The line under it** (S10's info size: a 16 dp icon, `text-xs`):
  - "No ticket #1234." in red-700, read out as an alert, when the server had no such ticket (it then returns the whole log, which the app does not show: `05` B.40);
  - grey help when the text is not a number.
- **The chip row** (S5 FilterChip, 36 dp + hit slop), scrolling sideways:
  - when a ticket is set, a filled brand-red chip first (a ticket icon, "#1234" and ✕), the period chip's look from §12; tapping it clears the ticket;
  - "All actions" (or the chosen action; a `flash` icon), which opens the Action sheet;
  - "Any date" (or the span: "Today", "Last 7 days", "2 Nov", "28 Oct – 2 Nov", "From 1 Nov", "Until 5 Nov"; a `calendar` icon), which opens the Dates sheet;
  - "All types" (or the chosen type), which opens the Entity type sheet;
  - "Person" (or the person's name), which opens the people picker, with "Anyone" to clear.
  - Active chips are brand red (S4).
- **The count line:** "1,234 entries" (`text-xs gray-500`), and "Clear all" as a text link (S5) when any filter is on.

**A day heading** sits above each day's cards. It uses the section caption (S3: `text-xs font-semibold uppercase tracking-wide text-gray-500`) and reads "Today", "Yesterday" or "Mon 02 Nov 2026", on the phone's calendar.

**The card** (S2: `rounded-xl border-border bg-white p-4`, `mx-4 mb-3`):
1. **The action pill**, then the entity ("Comment", `text-xs gray-500`), then the time on the right ("14:05", `text-xs gray-500`).
2. **The ticket**, a 44 dp row (S8):
   - "#1234" as a link (`text-sm font-semibold text-blue-700`, S4 links), then the title (`text-sm gray-700`, one line), then an 18 dp chevron;
   - it opens the ticket through the deep-link resolver;
   - no ticket: "No ticket linked" (`text-sm gray-500`).
3. **The person:** the name (`text-sm font-semibold gray-900`; "System" for the auto-close job), and the email under it (`text-xs gray-500`). Never the IP address.
4. **The details box**, tinted (`rounded-lg border-gray-100 bg-gray-50 p-3`, 12 dp below):
   - readable lines in `text-sm gray-700`, 4 dp apart;
   - anything shown raw in `font-mono text-xs gray-700`, selectable;
   - no box when nothing was recorded.

**The action pill.** S9's pill (`rounded-full px-2.5 py-0.5`, `text-xs font-medium`) with a 12 dp icon before the label. Every pill has a 1 dp border in its own fill colour, so all are the same height; the white one's border is gray-300.

**Colours are told apart by lightness, not hue alone.**
- The five actions the server writes most each have their own lightness band, at least 15 CIELAB L* from every other.
- The bands are pinned by `tests/audit/audit-details.test.mjs`. Values from `src/theme/colors.ts` `auditAction`; contrast is WCAG 2.x on the exact values.

| Action | Label | Icon | Fill (L*) | Text | Contrast |
|---|---|---|---|---|---|
| UPDATED | Updated | create | blue-900 (27) | white | 10.4:1 |
| CREATED | Created | add-circle | green-700 (47) | white | 5.0:1 |
| ASSIGNED | Assigned | person-add | orange-500 (64) | gray-900 | 6.3:1 |
| STATUS_CHANGED | Status Changed | swap-horizontal | sky-300 (81) | blue-900 | 6.2:1 |
| COMMENTED | Commented | chatbubble | white (100) + gray-300 outline | gray-700 | 10.3:1 |
| ATTACHMENT_ADDED | Attachment Added | attach | purple-100 (93) | purple-700 | 5.9:1 |
| DELETED | Deleted | trash | zinc-700 (27) | white | 10.4:1 |
| SLA_BREACHED | SLA Breached | alarm | red-700 (40) | white | 6.5:1 |
| ESCALATED | Escalated | trending-up | amber-500 (72) | gray-900 | 8.3:1 |
| anything else | the value in words | ellipse | badgeFallback gray-100 | gray-600 | — |

- The last four share a band with one of the first five and differ in hue.
- DELETED, SLA_BREACHED and ESCALATED are never written today (G8 §7).
- ATTACHMENT_ADDED shares the pale end with STATUS_CHANGED and COMMENTED. Its icon and label tell it apart.
- **WCAG 1.4.1:** every pill has its label and its icon, so no meaning rests on colour.
- **Not the web's colours.** The clone has no audit page, so the deployed page's colours could not be read (G8 §7). If Ronit wants them matched, they replace this table; the lightness test still applies.

**States (S11):**
- **Loading:** the `audit` skeleton, a day heading bar over cards with a pill, ticket, person and details box.
- **No such ticket:** "No ticket #1234", "The Service Desk has no ticket with that number. Check it and search again.", with "Clear the ticket filter".
- **Empty with filters:** "No entries match these filters", with "Clear all filters".
- **Empty without filters:** "No audit entries yet". Both use the `empty` illustration.
- **Error:** ErrorState with Retry.
- **Offline:** OfflineState, then the footer's "More entries load when you reconnect".
- **Footer:** "Loading more…", "Couldn't load more entries. Tap to retry", and at the 500 cap "Showing the first 500 of N — search or filter to narrow", the ticket list's words.

**Sheets.**
- **Action** is OptionSheet: All actions, then the nine actions by their pill labels. Deleted, SLA Breached and Escalated say "Not written by the Service Desk today" (G8 §8).
- **Dates** is OptionSheet: Any date, Today, Yesterday, Last 7 days (today and the 6 before), Last 30 days, then "From a day…" and "Until a day…", which open the system date dialog (no day after today). A picked end never lands on the wrong side of the other: the other moves with it. The days are the phone's calendar days; the server gets each as its first or last instant (`01` §10.5).
- **Entity type** is OptionSheet: All types, Ticket, Comment, Attachment. Each has a one-line description; Ticket's says automatic closes are not included (`05` B.38).
- **Person** is PersonPickerSheet, searching every role.

## 14. Polish pass (2026-11-03): people row, greeting mark, window captions, five refinements

Ronit's brief, UAT only. The motion side (native driver, cost, what a device must confirm) is `docs/PERFORMANCE.md` §13.
**Not run on a device:** there was no build. Every dp figure below is arithmetic on the classes.

| # | Item | Result |
|---|---|---|
| 1 | People row on ticket cards | **Built** (§14.1) |
| 2 | Greeting mark | **Built**: three drawn SVGs, one rise and fade (§14.2) |
| 3 | Total vs Open: window captions | **Built**; no count changed (§14.3) |
| 4.1 | Swipe actions | **Built** (§14.4) |
| 4.2 | Haptics | **Built**, `expo-haptics` (§14.5) |
| 4.3 | SLA countdown bar, detail only | **Changed to the deadline** ("Due Mon 11:00", no bar), Ronit's option C. A real countdown is backend ask A31 (§14.6) |
| 4.4 | Press feedback | **Built** on every tappable card and list row (§14.7) |
| 4.5 | Count roll on Home | **A cross-fade instead** (Ronit's option 5). A count-up needs JavaScript every frame (§14.8) |

**Ronit's decisions after the first pass (2026-11-03), all made:**
- the SLA line shows the deadline, not a countdown, and A31 is filed (§14.6);
- the count roll is a cross-fade (§14.8);
- the paperclip emoji is a drawn icon (§14.9);
- VIBRATE is kept (§14.5);
- "Active now" became "Active" (§14.3, already done).

Not touched: every count, query and API call; navigation; every permission (the swipe reuses the existing rules);
`auth.config.ts`, the 15-day re-authentication and the production profile.

### 14.1 The people row on ticket cards

`[RJ] Rohit Jadhav  →  [SD] Sarthak D.` replaces "Rohit Jadhav · Technician: Sarthak Darekar" (`components/PeopleRow.tsx`).

- **Place:** the last row of the card, under the badges, after a hairline rule (`StyleSheet.hairlineWidth`, `border-border`): `mt-3` above the rule, `pt-2.5` below it.
- **Avatars:** 25 dp circles with two initials (`text-xs font-semibold`). The initials grow with system text only up to 1.2×, so they stay inside the circle at 200 % text. The name beside each avatar grows without limit.
- **Colours** (`colors.avatar`). They differ in **lightness**, not hue alone; tested at ≥ 15 L* apart:

  | Who | Fill (L*) | Initials | Contrast |
  |---|---|---|---|
  | Requester | S3's avatar, `bg-primary/10` as hex `#fbe7e9` (93) | brand red | 4.6:1 |
  | Technician | slate-700 (27) | white | 10.4:1 |
  | Unassigned | none: a 1 dp **dashed** gray-500 ring with a 14 dp plus | — | ring 4.8:1 on white (UI graphic ≥ 3:1) |

- **Names:** `text-xs font-medium text-gray-700`. The requester's full name, and the technician's first name and last initial ("Sarthak D.", `shortName`). Both go through `formatDisplayName`, as the drawer does, so `rohit.jadhav@…` reads "Rohit Jadhav" and its initials are "RJ".
- **Unassigned:** "Unassigned", `text-xs italic` in gray-500. On the selected card's red-50 tint it is gray-600, like the card's other meta text.
- **The arrow:** a static 14 dp `arrow-forward` icon in `text.muted`, 8 dp either side. Nothing in the row animates.
- **One line, always:** each name has `numberOfLines={1}` and shrinks; the row never wraps. At 100 % text the row is exactly 25 dp.
- **END_USER** sees the technician (or "Unassigned") only: the requester is themselves.
- **Screen readers:** the row itself is hidden, and the card's label now ends with it.
  - Staff: "… Requested by Rohit Jadhav, technician Sarthak Darekar".
  - END_USER: "Technician …" or "Unassigned".
  - The words come from `peopleRowLabel` in `utils/format.ts`.
- **Height:** each card is taller.
  - The old line took 24 dp (8 + 16). The new row takes 47 dp (12 + the rule + 10 + 25).
  - So **each card grows by 23 dp** at 100 % text, 18 dp at 130 % and 14 dp at 200 %.
  - About one card in seven fewer fits on a screen.
- **FlashList:** there was nothing to update.
  - v2 has no item-size estimate (`estimatedItemSize` is gone in v2): it measures each card, and nothing in the app sets one.
  - The `list` skeleton now ends with the rule and two 25 dp circles, so the first load does not jump.
- **Not changed:** Home's recent-ticket rows (`RecentTicketRow`) keep their plain line ("Rohit · Sarthak"). The brief named the ticket cards; say if Home should match.

### 14.2 The greeting mark

- **What:** a small drawn mark after "Good morning, Ronit", one for each band of §9:
  - a **sun** for morning (05:00–11:59);
  - a **sun behind a cloud** for afternoon (12:00–16:59);
  - a **moon** for evening (17:00–04:59).
  It changes when the greeting does (`greetingMark` in `utils/greeting.ts`).
- **Drawn, never an emoji.** Emoji come from the phone's font: they differ across Android versions, and some older fonts lack them.
  - The marks are three flat SVGs in `assets/illustrations/`: `greeting-sun.svg`, `greeting-cloud-sun.svg` and `greeting-moon.svg`.
  - Each is 48 × 48 and about 0.4–1.1 KB.
- **Not inline `<svg>`:** `react-native-svg` is not installed, and the brief allowed no library other than `expo-haptics`. expo-image draws the files as vectors, as it draws Phase A1's empty-state art.
- **Colours** (each file lists them): brand yellow (`secondary`) for the sun and the moon, and a white cloud with a gray-400 outline (gray-300 was too faint at 26 dp in a desktop render). The yellow is 1.45:1 on the grey canvas. That is fine for decoration: the greeting text already says the time of day.
- **Size and place:** 26 dp, 8 dp after the greeting. It is centred on the greeting's line (`text-xl`, 28 dp) and stays beside the text when a long name makes it wrap.
- **Motion:** ONE rise and fade (6 dp, 420 ms, `curve.enter`).
  - It plays the first time the art is on screen after Home mounts.
  - It never plays again while Home stays mounted, and it never loops.
  - "Remove animations": the mark shows in place at once.
- **Screen readers:** hidden.

### 14.3 Total vs Open: the window captions

**Why:** on Ronit's phone Home showed Total 199 and Open 342. The web counts Total within the period and Open with no date filter (`docs/G6-WEB-DASHBOARD.md` §5.1).

**Ronit's decision:** keep the web's numbers and label the windows. No count, query or request changed; `tests/home/window-captions.test.mjs` pins the values.

**Which window each count covers** (G6 §5 and §7, `BE:dashboard.controller.ts:331-442`; `HOME_TILE_WINDOW`, `HOME_CHIP_WINDOW`):

| Count | Field | Window | Caption |
|---|---|---|---|
| Total tickets | `total` | created in the period | the period |
| **Open** | `currentlyOpen` | status OPEN **right now**, any creation date | **right now** |
| In progress | `inProgress` | created in the period | the period |
| Resolved / Resolved today | `resolved` / `resolvedToday` | created in the period | the period |
| SLA breached | `slaBreached` | created in the period | the period |
| Chips: Closed, Unassigned, the pending reasons, On hold | `closed`, `unassigned`, `byStatus` | created in the period | none: they all share the period |
| **Active** chip | `totalOpen` | open statuses **right now**, any date | **right now** |

- **"right now", not "all time":** Open and Active count what is open at this moment, not everything ever. The window agrees with G7's rule for which tiles hand the period to the list (tested).
- **The period's words** (`PERIOD_CAPTIONS`, `periodCaption`):

  | Period | Caption |
  |---|---|
  | Today, Yesterday | today, yesterday |
  | Last 7 days, Last 30 days | last 7 days, last 30 days |
  | This week, This month, This year | this week, this month, this year |
  | Quarterly | this quarter (the web's own name for it, in its chart titles) |
  | All time | all time |
  | Custom | its two days: "01 Oct – 15 Oct", with years when they differ; "custom range" until both days are valid |

  These are the periods' names, as on the chips. "This month" is still the last 30 days on the server (05 B.36, unchanged).
- **On a tile:** `text-xs text-gray-500` (4.8:1), directly under the count, up to two lines.
  - It shows whenever counts are expected, including while they load, so nothing moves when the number arrives.
  - Not for L2_MANAGER, who has no counts.
  - It replaces Open's old "right now" hint under the label.
- **On the chips:** only Active has a caption, because it is the one chip counted differently from its neighbours. It reads "Active" then a muted `text-xs` "right now". The label was "Active now" until now, so "now" is not said twice.
- **Screen readers:** "Total tickets: 199, this month. Opens the list" and "Active: 342, right now. Opens the list".
- **Height:** each tile gains one 16 dp line, from about 128 dp to 136 dp at 100 % text. The tiles of a row still stretch to the taller one.

### 14.4 Swipe actions on ticket-list rows

- **Gesture:** swipe a row left to reveal **Assign** and **Resolve** on its right.
  - A tap on an open row closes it.
  - A scroll, a selection, or opening another row also closes it.
- **Who sees what** (`ticketSwipeActions`, `canSwipeTickets` in `utils/permissions.ts`). Each action appears exactly where a tap already offers it; this is not a new permission.
  - **Assign:** where ticket detail's More options offers "Assign…": ADMIN, and AGENT except on a Closed or Canceled ticket. It opens the same M7 screen.
  - **Resolve:** where the row's status chip offers "Resolve". It runs the chip's own handler, which checks the transition and opens M6 for the closure fields.
  - **END_USER:** nothing; the rows do not swipe at all.
  - **A ticket with neither action** does not move.
- **Tests** (`tests/rbac/swipe-actions.test.mjs`): the actions are written out for all five personas and every status, and checked against the tap paths for every status and assignee.
- **Look:** each action is 80 dp wide and the card's full height, with a 20 dp icon over a `text-xs font-semibold` white label. The pair has rounded right corners, like the card.

  | Action | Fill (L*) | Label contrast |
  |---|---|---|
  | Assign (`person-add-outline`) | slate-700 (27) | 10.4:1 |
  | Resolve (`checkmark-circle-outline`) | green-700 (47) | 5.0:1 |
- **Screen readers:** the swipe is not offered as an accessibility action. TalkBack users reach Assign and Resolve on the ticket screen, as before.

### 14.5 Haptics

| When | Android effect | Android 10 and older (no CONFIRM / REJECT) |
|---|---|---|
| A save succeeds: a status change, an assignment (Assign, Pick up, the technician editor), a property save, or a submit (new ticket, reply or note, closure, approval request, approval decision, service request) | CONFIRM | VIRTUAL_KEY |
| A save fails: every write error the app reports (`utils/dialogs.ts`), and the forms that show their error inline | REJECT | LONG_PRESS |
| A long-press selects a ticket on the list | LONG_PRESS | — |

- **The phone's setting is respected.**
  - Only `performAndroidHapticsAsync` is used. It calls View.performHapticFeedback, which Android silences when touch feedback is off.
  - expo-haptics' `impactAsync`, `notificationAsync` and `selectionAsync` drive the Vibrator directly, which that setting does not govern. The app never calls them, and a test fails if anything in `src/` does.
- **VIBRATE is kept** (Ronit, 2026-11-03).
  - expo-haptics declares it in its manifest, and `app.json` does not block it. The first pass blocked it.
  - The calls the app makes do not need it, so the OS setting governs every haptic either way.
  - It is a normal install-time permission: no prompt. The Play listing shows "control vibration".
- **Fire and forget:** nothing waits for a haptic, and a phone without one stays silent. A signed-out (401) error plays nothing, just as it shows nothing.
- **Not covered:** the bulk runner's per-ticket results, and saves outside the brief's list (a task ticked, a profile saved). Those play no confirm on success, though their failures still get REJECT.

### 14.6 The SLA deadline (ticket detail only)

**Ronit's decision (option C):** show the deadline, not a countdown, and no bar.

**Why the first pass's countdown was replaced:**
- The server sets the deadline in business hours (09:00–18:00, Monday to Friday by default; SLAPolicy in 03 §B).
- The countdown and its bar measured clock time to it.
- So on a Friday at 17:00, a Monday 11:00 deadline read "66h left" with 3 working hours to go, and the bar filled over the weekend while the SLA clock stood still.

A real countdown needs the server's own figure: backend ask **A31** in `docs/web-system/06-BACKEND-ASKS.md`, with that example.

- **Place:** in the header card, under the badges (`components/SlaDeadline.tsx`). Since 2026-11-05 the same deadline is also on every ticket card, in its own words (§16). One `text-xs font-semibold` row:
  - "Resolution" in gray-500 on the left;
  - on the right, an 8 dp dot in the status colour, then the deadline in gray-900. "Breached" is red-700 (6.5:1).
- **Words** (`formatDueTime` in `utils/sla-deadline.ts`), on the phone's clock and calendar:

  | When the deadline falls | Reads |
  |---|---|
  | Later today | "Due today 16:30" |
  | Tomorrow | "Due tomorrow 09:05" |
  | Within the next 6 days | "Due Mon 11:00" |
  | Further out, or in another year | "Due 13 Nov 10:00", "Due 04 Jan 2027 09:00" |
  | Already passed | "Breached" |
  | On hold, not yet breached | "Paused while on hold" |

  - A weekday is never more than 6 days away, so "Mon" never means next week's Monday.
  - No label ever says "left" (tested).
  - **Why no time is given on hold:** the hold-adjusted deadline moves later minute by minute while a ticket is on hold. The Properties card's "Resolve by" row still shows it, as before.
- **From the existing fields only:**
  - The deadline is `effectiveResolveDue()`, the web's hold-adjusted resolve deadline (05 §A.9), the same value as "Resolve by".
  - The colour follows the SLA badge's own `getDisplaySlaStatus()`. Amber is the server's DUE_SOON (≤ 30 min left); the app sets no threshold of its own.
  - A first-response breach alone leaves the resolution line green: the badge above already shows that breach.
  - Nothing shows without a resolve deadline, or once the ticket is Resolved, Closed or Canceled.
- **Colours** (`colors.slaDeadline`, the dot), told apart by lightness. The words carry the meaning; the dot is decoration.

  | Status | Colour (L*) |
  |---|---|
  | Within SLA | green-600 (59) |
  | Due soon | amber-400 (81) |
  | Breached | red-700 (40) |
- **Screen readers:** "Resolution: Due Mon 11:00". On hold, it adds "The SLA clock is paused while the ticket is on hold".
- **Clock:** read on render, on focus and on return to the app (the §9 pattern), never on a timer, so "Due today" turns into "Breached" when the screen is next shown. Static: nothing animates.

### 14.7 Press feedback

- **What:** while held, a card dips to 0.97 and dims to 85 % opacity: a slight tint towards the grey canvas. It returns when the finger lifts.
  - Code: `components/PressFeedback.tsx`; values in `motion.press`.
  - It replaces the cards' `active:opacity-80` and the attachment card's `active:bg-gray-50`.
- **Where:**
  - every tappable card: ticket, approval, catalogue category and service, My Requests, knowledge-base article and search result, notification, attachment, and Home's KPI tiles;
  - the list rows: Home's recent tickets and the task rows. Their separators stay still.
- **Unchanged:** chips, buttons, text links and icon buttons keep their §9.6 feedback (PERFORMANCE.md). A notification's mark-read button keeps its own.
- **A touch that becomes a scroll shows nothing:** the press shows 60 ms after touch-down (`pressDelay`). A quicker tap still shows it and still fires.
- **"Remove animations":** no dip; the 85 % tint shows and clears at once, as before.

### 14.8 Count roll on Home: a cross-fade

**No count-up.** A count-up shows every number in between, so the text must change on every frame. The native driver animates only transforms and opacity, never text, so a count-up would need JavaScript on every frame, which this phase must not add.

**Ronit's choice (option 5):** cross-fade the old number into the new one (`components/CountFade.tsx`, `motion.countFade`).

- **What it looks like:** the old number fades out over the new one, which fades in and rises 4 dp into place. One native timing of 300 ms on `opacity` and `translateY`.
- **When it runs:**
  - **A period already loaded** (cached): the old number cross-fades into the new one.
  - **A period not loaded yet:** the old number gives way to the loading bar at once, as before, and the new number fades in when it arrives.
  - **Why the old number does not stay while loading:** G6's rule is that a previous period's count is never shown as the new one (placeholder data supplies no count). That rule is unchanged.
- **When it does not run** (the number appears at once, as before):
  - a refresh within the same period;
  - Home's first numbers, before the person has changed the period;
  - Home not in view (it ends at once on blur);
  - "Remove animations".
- **Not on the chips:** pending-reason chips appear and disappear at 0, and their pills change width. Only the KPI tiles fade.
- **Screen readers:** they read the new number only; the fading one is hidden.

### 14.9 Reported, not changed (and one fixed)

- **Fixed (Ronit, 2026-11-03): the paperclip emoji.**
  - Since Phase 3a, `utils/html.ts` wrote the web's emoji placeholder for an e-mail's inline (`cid:`) image.
  - It now writes a `<cid-image>` element. A rendered body draws it as a 16 dp paperclip (a flat SVG in gray-500, `assets/illustrations/paperclip.svg`, drawn by expo-image) with "Image in attachments" in `text-sm italic` gray-500 (`HtmlText.tsx`).
  - Plain text reads "[image in attachments]".
  - An inline `<svg>` was not possible: the sanitiser strips `<svg>` on purpose, and the renderer cannot draw one without `react-native-svg`.
  - `src/` now has no emoji at all (tested). The web keeps its emoji (05 §A.6, mobile deviation noted there).
- **Home's recent-ticket rows** keep the old people line (§14.1).
- **TalkBack** has no swipe actions (§14.4).

### 14.10 Device checks (next build, 360 dp, 100 / 130 / 200 % text)

1. **People row:** long names truncate on one line; the dashed ring is round, not clipped; the initials fit at 200 %.
2. **Greeting mark:** sharp at the phone's density and centred on the greeting's line; the rise plays once.
3. **Captions:** the tiles stay aligned; the Custom caption fits or wraps to two lines.
4. **Swipe:**
   - a vertical fling never drags a row;
   - a left swipe opens a row, and a tap closes it;
   - long-press still selects;
   - the drawer's edge swipe still opens the drawer;
   - after scrolling, no row shows open on another ticket.
5. **Haptics:**
   - each event plays once;
   - with Settings → Sound & vibration → Touch feedback (or "Vibration & haptics") off, none plays;
   - check on Android 10 or older too (the fallbacks).
6. **SLA deadline:** the three dot colours; "Due Mon 11:00" against the Properties card's "Resolve by"; "Paused while on hold" on a ticket on hold.
7. **Press:** no flicker while scrolling a list; the dip shows on a held card.
8. **Count fade:**
   - switch between two periods already loaded: the numbers cross-fade;
   - pick a new period: the loading bar, then the numbers fade in;
   - pull to refresh: nothing fades.
9. **Paperclip:** a reply with an inline e-mail image shows the drawn paperclip and "Image in attachments", sharp at the phone's density.

## 15. Login: the footer's year (G9, 2026-11-04), and the email sign-in (built 2026-11-05)

### 15.1 The footer's year

- **Text:** "Copyright © 2026 Mount Meru Group" in 2026, "… 2027 …" from 1 January 2027, and so on: the G9 brief's wording.
  - It replaces "Mount Meru Group IT" (§10.1). That footer had no year: the brief's "copyright © 2026" had never been in the app.
  - The new wording, without "IT", is the brief's. Ronit to confirm.
- **Look:** unchanged. 12 dp, `text.secondary` (4.83 : 1 on white, §10.2), centred, same place.
- **The year** is the device's local calendar year (`src/utils/copyright.ts`). It follows §9's pattern for time-dependent text:
  - read on first render, on focus, and when the app returns to the foreground on Login, so an app left on Login over New Year shows the new year when it is picked up;
  - never on a timer or by polling;
  - the state is the year, not the time, so a check that finds the same year does not re-render Login.
- **TalkBack** reads "Copyright 2026 Mount Meru Group" (`accessibilityLabel`). It reads "©" as "copyright", so the visible text would be spoken as "copyright copyright 2026 …".
- **Width:** about 33 characters at 12 dp, roughly 210 dp: one line on a 360 dp phone at 100 % and 130 % text. At 200 % it wraps to two centred lines, and the page scrolls (§10.7).
- **Rule for any later text:** no year is ever written into a user-facing string in `src/`.
  - `tests/login/copyright-year.test.mjs` parses every source file and fails on a four-digit year in a string, template text, JSX text, or a number placed straight into text.
  - In `src/`, years appear only in comments, and in the due-date picker's numeric bounds 2000–2100 (`src/utils/tasks.ts:60, 92-93`), which are not text.

### 15.2 Email and password sign-in: built 2026-11-05; on every build (UAT and PROD) since 2026-11-06

Not built on 2026-11-04, because no endpoint was in the source. Built on 2026-11-05 against an ASSUMED contract, after the backend team confirmed the endpoint is on UAT (`docs/web-system/02-AUTH.md` §8). It shows on every build, UAT and PROD (the `EMAIL_SIGN_IN_ENABLED` flag was deleted 2026-11-06). Code: `src/screens/auth/EmailSignInForm.tsx`. Tokens: `loginLayout.emailForm`, `loginType.orLabel` / `link` / `fieldLabel` / `field`, `motion.emailReveal`. **Not run on a device:** no build.

**Above the fold: unchanged.** The arc split, the message slot, "Setu", the prompt, and the outlined Microsoft pill as the primary action, with "Opening Microsoft…" under it. Then, centred in the white area:
- **OR divider**, 20 dp below the caption: hairline (`StyleSheet.hairlineWidth`, `colors.border`), "OR" (12 dp, weight 600, letter spacing 1), hairline.
  - "Muted grey" in the brief. The word is `text.secondary` (gray-500, 4.83 : 1), the lightest grey that passes AA (§10.2). `text.muted` is never text.
- **"Sign in with email instead"** with a 16 dp `chevron-forward`: 14 dp weight 600 in `text.body` (gray-700), the chevron `text.muted`.
  - Text only: no border, no fill. The touch target is 48 dp tall.
  - Pressed, the label darkens to `text.primary`.

**The form, opened in place** (no route, no new screen). The text action is replaced by:
- "Email", 13 dp weight 500 `text.body`, over a 48 dp field.
  - Radius 12, 1 dp gray-300 border (the pill's), 16 dp text.
  - Email keyboard (`keyboardType="email-address"`, `inputMode="email"`), no autocapitalise, no autocorrect, no spell check.
  - Autofill `email`. Return key "next". It takes focus when the form opens.
- "Password", 12 dp below, over the same field.
  - Masked (`secureTextEntry`), no autocapitalise, no autocorrect. Autofill `current-password`. Return key "go" signs in.
  - **Show/hide toggle:** a 48 × 48 dp eye icon inside the field's right end, with `aria-label` "Show password" / "Hide password". The field keeps 48 dp of right padding for it.
- **Field errors** under the field, 13 dp red-700, announced politely. The fields are checked on "Sign in" before anything is sent:
  - "Enter your email address.";
  - "Enter a valid email address, like name@mountmerugroup.com.";
  - "Enter your password.".
  - An invalid field's border turns red-700.
- **The failure box**, 16 dp above "Sign in", in the same style as the Microsoft failure box (red-50, alert icon):
  - title, message, "The Service Desk said: “…”" where its words are fit to show;
  - `Ref: <reason> · HTTP <status> · <path>`, and the developer detail in `__DEV__`;
  - "Sign in with Microsoft" (outline, danger tone) where only Microsoft can get past the failure (`02-AUTH.md` §8.6).
- **"Sign in"**: brand red (`colors.primary`), white 15 dp weight 600 label, **52 dp tall**, radius 26, as wide as the form, 16 dp below the last field.
  - Pressed: opacity 0.85.
  - While signing in: disabled, a white spinner, and "Signing in…".
  - While Microsoft sign-in runs: disabled, at half opacity.

**Motion.** Opening fades the form in and lifts it 8 dp, over 220 ms on the `enter` curve: opacity and translateY only, on the native driver. With "Remove animations" it shows at once. No layout property is animated: the fields take their place in the first frame. It is stopped on unmount. `tests/motion/start-up-and-login.test.mjs` now lists nine animating files.

**The keyboard never covers "Sign in."** (Rebuilt on 2026-11-05: §15.3.)
- Login sits in a `KeyboardAvoidingView` (`padding`, as the app's other forms), and its scroll view keeps taps (`keyboardShouldPersistTaps="handled"`), so one tap on "Sign in" signs in with the keyboard up.
- With the form open, Login measures "Sign in" and scrolls just enough to show all of it (§15.3). Events only, no timer.
- **Arithmetic, 360 × 640 dp at 100 %, with a 280 dp keyboard:** about 336 dp is visible. From the bottom: footer and insets (about 76), the chip (32), "Sign in" (52), and both fields with their labels (about 160). That is about 320 dp, so the focused field and "Sign in" fit together. At 130 % and 200 % text, or with a failure box, the email field may scroll above the top while the password field and "Sign in" stay in view. **Check on a device.**

**The Microsoft pill while an email sign-in runs:** half opacity, `pointerEvents: 'none'`, and hidden from TalkBack. It never collapses into a spinner for a sign-in it is not running. Its own failure box's "Try again" is disabled too.

### 15.3 The missing "Sign in" (UAT, fixed 2026-11-05)

**What testers saw.** "Sign in with email instead" opened the Email and Password fields, then the UAT chip and the copyright line followed straight after the password field: no "Sign in".

**Why.** The button's Pressable took a **function** as `style`: `({ pressed }) => [...]`.
- NativeWind wraps every Pressable in the app (`babel.config.js`, `jsxImportSource: 'nativewind'`) and merges `style` as data. A function has no keys, so it came out as `{}` (`react-native-css-interop`, `native-interop.js` `applyRules`). Reproduced in Node with NativeWind's own runtime (`tests/support/nativewind.mjs`).
- The button kept its label but lost its 52 dp height, its brand-red fill, its radius and its 16 dp top margin. What was left was the 20 dp line of the label: **white text on the white page**. It was laid out and tappable in a thin strip, but invisible.
- It was the only Pressable in `src/` with a function style; every other one uses `className` (with `active:`) or a static style.
- Not the keyboard, not a conditional, not clipping. The keyboard scroll had a second, smaller flaw, fixed too (below).
- The tests passed because they read the source and found a "Sign in" Pressable.

**The fix** (`src/screens/auth/emailFormLayout.ts`, `EmailSignInForm.tsx`):
- The Pressable has static styles: 52 dp tall, `alignSelf: 'stretch'` (the form's full width), radius 26, 16 dp below the password field. Half opacity while Microsoft sign-in runs.
- An inner face, drawn through the Pressable's children function, carries the brand red (`colors.primary`) and the centred spinner and label. Held, it dims to the app's press opacity (0.85).
- A tap runs `startSubmit` → `attemptPasswordSignIn`, as before.
- **Rule for the whole app:** never a function as `style`. A pressed look goes on an inner view through the children function. `tests/login/sign-in-button.test.mjs` scans `src/` for it.

**Keeping it in view** (`LoginScreen.tsx`, `revealScrollY`):
- When the form opens, Login measures "Sign in" against its scroll content and scrolls just enough to show all of it, 16 dp clear of the screen's foot. So it shows **at once, without the person scrolling**: on a 360 × 640 phone the fields open below the fold (the button starts about 797 dp down).
- When the keyboard opens, the visible area ends at the keyboard's top (`endCoordinates.screenY`), and Login scrolls so the button sits 16 dp above it.
- It runs again whenever the button moves (a field error or failure box above it), the content grows, or the scroll view is resized. The old code scrolled to the end on `keyboardDidShow` only: that event arrives before KeyboardAvoidingView's padding lands, so the scroll could be computed for the full-height view.
- Events only, no timer. Refs, so none of it re-renders Login.

**What the tests now check** (`tests/login/sign-in-button.test.mjs`):
- the old function style, run through NativeWind's runtime, reaches the native Pressable as `{}`;
- the new styles reach it as 52 dp, `stretch`, 16 dp margin, and a brand-red face;
- after Login's scroll rule, on measured layouts, the whole button is in view and at least 48 dp tall: keyboard down, keyboard up before and after the padding lands, an error above it, 200 % text. The broken 20 dp label fails the same check wherever it sits.

**Device checks (next UAT build):**
1. Open the form: "Sign in" shows at once, red, full width, 52 dp, with the keyboard up.
2. Close the keyboard (back): still in view. Reopen it: "Sign in" sits just above it.
3. Submit empty: the field errors appear and "Sign in" stays in view.
4. One tap on "Sign in" with the keyboard up signs in.
5. 360 dp phone at 200 % text: same.

## 16. Ticket cards: raised and due dates (approved design, 2026-11-05)

`src/components/TicketCard.tsx`. Only the M3 ticket list's cards; Home's recent-ticket rows are unchanged.

**Top line:** "#19445 · Raised 2 Nov · updated 2d ago", `text-xs` gray-500 (gray-600 on the selected tint), the number semibold.
- The raised date is `createdAt` on the phone's calendar, "2 Nov", with the year only outside the current one ("30 Dec 2025"): `formatShortDate`.
- "updated 2d ago" stays: how agents spot a stale ticket. It is the short form of the old "Updated 2 days ago", as the approved design writes it: "just now", "5m", "3h", "2d", "4mo", "1y" ago (`formatRelativeShort`).
- **Room:** on a 360 dp phone a card with the "New reply" badge has about 213 dp for this line, and it needs about 235 at 100 % text. Only "· Raised …" shrinks and ends in "…"; the number and "· updated …" never do. On wider phones, and on cards without the badge, it fits.
- The "New reply" badge keeps its place at the right, 8 dp from the text.

**Badge row:** status (with its chevron where it is tappable) and priority. **The SLA chip is gone**: the due line says the same, more precisely.
- One thing it said that the due line does not: a **first-response** breach. The due line follows detail's rule, where a first-response breach alone leaves the resolution deadline green. On detail the SLA badge still shows it; on the card nothing does now. Ronit to decide whether the card should say so.

**Due line**, at the foot, 8 dp under the people row: a 14 dp `time-outline` clock and the words, `text-xs font-semibold`, both in the SLA colour.

| When | Reads |
|---|---|
| Later today | "Due today 5 Nov, 16:30" |
| Tomorrow | "Due tomorrow 6 Nov, 09:00" |
| Any later day | "Due Fri 13 Nov, 17:00" (weekday, date, time; the year only outside the current one) |
| Missed | "Breached 3 Nov, 12:00": when it was missed |
| On hold or any pending status | "Paused while on hold" (or "Breached" if it was missed before): no time, as detail |
| No SLA; Resolved, Closed or Canceled | **no line at all**: the row is absent, not empty |

- **One rule:** `slaDueLine()` words what `slaDeadline()` (detail, §14.6) decides: the same deadline (`effectiveResolveDue`), the same colour, the same cases with nothing to show (`utils/sla-deadline.ts`). There is no second SLA implementation.
- **Never a countdown.** The SLA runs in business hours, so "66h left" on a Friday evening would be wrong (§14.6, ask A31). No label says "left", or hours or minutes to go (tested).
- **Colours** (`colors.slaDue`): green on track, amber only when the **server** says due soon, red when breached. These are text, so each passes AA as 12 dp text on the white card and on the selected card's red-50, and they differ in **lightness**:

| Status | Colour | L* | On white | On red-50 |
|---|---|---|---|---|
| Within SLA | green-700 | 47 | 5.0:1 | 4.6:1 |
| Due soon | amber-800 | 38 | 7.1:1 | 6.5:1 |
| Breached | red-900 | 28 | 10.0:1 | 9.2:1 |

  - 9 L* apart, not the detail dots' 15: three colours that all pass AA as text only have L* 28–48 between them. The words carry the meaning (WCAG 1.4.1).
  - red-900 is new in `palette` (Tailwind 3.4's `#7f1d1d`).
- **Static.** No animation on the row. The time is read when the card renders, from the list's clock: read on every list render, and on focus and return to the app, kept to the minute (§9's pattern). So "Due today 16:30" seen again at 16:31 reads "Breached 5 Nov, 16:30". Never a timer.
- **Screen readers:** the card's label now ends "… Raised 2 Nov, updated 2 days ago. Due Fri 13 Nov, 17:00".

**Height:** +24 dp for a card with a due line (8 dp gap + the 16 dp line); unchanged for one without. A card whose three chips used to wrap to a second row (a long breach label on a 360 dp phone) is now 4 dp shorter. The list skeleton gained the same 24 dp row and lost its third chip, so the first load does not jump (`docs/PERFORMANCE.md` §14).

**Device checks (next UAT build), 360 dp at 100 / 130 / 200 % text:**
1. A card with "New reply": the number and "updated …" whole, "Raised …" shortened if anything is.
2. The three colours on white and on a selected card; "Breached …" with its date and time.
3. A ticket on hold: "Paused while on hold", no time. A resolved one: no line, no gap.
4. First load: the skeleton and the cards line up; no jump.

## iOS-A. iOS (Phase iOS-4, 2026-10-29)

> Numbered iOS-A, not 9, since iOS-5b (Ronit, 2026-10-30): Android's sections keep Android's numbers (Android's §9 is
> the Home greeting, above), and the iOS-only sections take a letter Android never uses. The greeting's text and type
> are Android's on iOS too; iOS-A.1 caps how far it grows (Title 2, `maxTextScale.title2`).

The standard on iPhone. Each rule names the Human Interface Guidelines page it follows; the quotes are in
`docs/ios/APP-STORE-COMPLIANCE.md` (section E). The tests that pin these rules are in
`tests/screens/hig-polish.test.mjs`. pt and dp use the same numbers.

### iOS-A.1 Type: iOS text styles (HIG, Typography)
The `text-*` classes keep their names, but each one now resolves to an iOS text style at the default text size
("Large"). `src/theme/typography.ts` is the single source.

| Class | iOS text style | Size / leading (pt) | Was (web, S0) |
|---|---|---|---|
| `text-xs` | Caption 1 | 12 / 16 | 12 / 16 |
| `text-sm` | Subheadline | 15 / 20 | 14 / 20 |
| `text-base` | Body | 17 / 22 | 16 / 24 |
| `text-lg` | Title 3 | 20 / 25 | 18 / 28 |
| `text-xl` | Title 2 | 22 / 28 | 20 / 28 |
| `text-2xl` | Title 1 | 28 / 34 | 24 / 32 |
| `text-3xl` | Large Title | 34 / 41 | 30 / 36 |

- **Server HTML** (`HtmlText`): body text at 15 pt; h1 at 20, h2 at 17, h4 at 15; code at 13 (Footnote).
- **Minimum size:** nothing below 11 pt, iOS's minimum.
- **Dynamic Type:** React Native scales every size by the person's text size, up to ×3.571 at AX5.
- **Caps (`maxFontSizeMultiplier`):** iOS's titles grow less than body text, so titles stop at iOS's own AX5 size (`maxTextScale`): Title 1 ×2.07, Title 2 ×2.55, Title 3 ×2.75. That applies only to text of 20 pt and more: the Home greeting, the KPI counts, and the ticket, task, article, request and Profile titles. Initials in avatars and badge counts stop at ×1.4 so they stay inside their circle. Body and caption text is never capped.

### iOS-A.2 Screen frame
> **iOS-8a (2026-11-02) replaced iOS-4's large titles, the pinned-nothing rule and the bar's search field.** Why: §iOS-A.13.
- **Header:** the native navigation bar (replaces S1's ScreenHeader), solid and in the look of Android's top bar, on every stack screen and sheet (§iOS-A.13).
  - Every screen has a standard title; none has a large title.
  - Pushed screens have the back chevron with no label; sheets have ✕.
- **Under the bar, as on Android:** the offline banner, then the screen's toolbar (Tickets: search, Filters, the filter chips, sort, country, count, Clear all; Approvals: the type chips), then the error banner, then the list. None of them scrolls; the list starts below them.
  - At the accessibility text sizes, only the Tickets search row stays fixed: its filter rows ride at the top of the list, so the tickets keep room (§iOS-A.3).
- **Search** (HIG, Search fields):
  - On Tickets, search is Android's `SearchField`, fixed under the bar with the Filters button beside it (a count badge when any of the five are on).
  - On pushed screens (Knowledge base, the catalogue, the people and template pickers), the inline `SearchField` stays above what it searches.
- **Sheets:**
  - The write sheets are root page sheets with ✕ on the left.
  - The picker sheets (`OptionSheet`, `PersonPickerSheet`, `TemplatePickerSheet`, `DatePickerSheet`) are native page sheets through `PageSheet`: a swipe down closes them, and the title sits between ✕ (or Cancel) and an optional Done.
  - No drawn grabber (HIG, Sheets: a grabber means the sheet can be dragged to resize). Done always comes with Cancel.

### iOS-A.3 Large text (HIG, Typography: "Consider adjusting your layout at large font sizes")
- **Accessibility sizes:** these start at AX1 (`fontScale` ≥ 1.786, `useAccessibilityTextSize()`). From there:
  - Home's KPI tiles are one per row.
  - The ticket's four tabs are two rows of two.
  - The ticket card's header (number, Updated, New reply) stacks.
  - The bulk-selection bar's buttons stack, and the list clears the bar at its measured height (iOS-8a).
  - The Filters sheet's date rows put the label above the field.
  - The ticket list's filter rows (chips, sort, country, count, Clear all) leave the fixed toolbar and ride at the top of the list; the search row stays fixed (iOS-8a).
- **No `adjustsFontSizeToFit` at the accessibility sizes:** the text wraps instead. One exception since iOS-5c: the sign-in label in Login's fixed 52 pt pill (§iOS-A.12).
- **Controls grow with the text:** `min-h-*`, never `h-*`, on any button, field or chip that holds text (`SubmitButton` 48, `SearchField` 44, chips 36 plus slop).
- **Icons:** icons that carry meaning grow with the text, up to twice their size (`useScaledIconSize()`). These are More's row icons and the KPI glyph with its square.
- **Knowledge-base tables:** each column is at least 120 pt × the text size, and a table wider than the screen scrolls sideways (`utils/html.ts` `tableLayoutWidth`).
- **Truncation:** keep it to text you can read in full elsewhere. The Profile email is never cut.

### iOS-A.4 Targets (HIG, Buttons: "a hit region of at least 44x44 pt")
- **44 pt minimum:** every Pressable is at least 44 pt tall (and wide, when its width is set), from its own size or its hit slop. A test enforces this on every Pressable in `src/`.
- **Icon buttons** (✕, mark read, remove, the task checkbox, the notification and announcement corners) are 44 × 44 pt boxes. A hit slop is only for chips in a row (36 pt + 4 pt slop).

### iOS-A.5 VoiceOver (HIG, VoiceOver)
- **Labels:** every Pressable, TextInput and Switch has an `accessibilityLabel` that says what is visible (and the state, e.g. "Filters, 2 on"). A test enforces this.
- **No control inside another:** VoiceOver can't reach a control nested in another, so it is offered as one of the outer element's custom actions instead.
  - Ticket card: Change status, Select.
  - Attachment row: Show details, Download and share, Delete.
- **Decorative avatars:** initials circles are hidden from VoiceOver; the name is beside them.
- **Announcements:** a success notice is read out (`SuccessNotice`). The ticket's priority preview announces a new priority, since its live region works on Android only.

### iOS-A.6 Haptics (HIG, Playing haptics: "Use system-provided haptic patterns according to their documented meanings")
Only `src/utils/haptics.ts` plays haptics, and each one has a single meaning:

| Haptic | When |
|---|---|
| Success | A write finished: every `notify()`, an approval decision, the account-deletion request |
| Warning | It finished only in part: a ticket created but its files failed; a bulk run with failures, skips or a Stop; a mark-read that failed while the notification still opened (`notifyWarning()`, amber notice) |
| Error | A write failed: every `reportWriteError*()` |
| Selection | A filter chip that changes, a segmented tab (ticket detail, reply mode), a ticket added to or taken out of a selection |

Nothing else plays one. iOS's System Haptics switch turns them all off.

### iOS-A.7 Motion (HIG, Motion; Accessibility)
- **Rules:** S7 and `docs/PERFORMANCE.md` §10 stand (timing curves, no springs or bounce, transform and opacity only).
- **Reduce Motion:** every animation is skipped, the success notice appears without a fade, and the picker sheets fade instead of sliding.
- **iOS-5c (2026-10-30):** the start-up intro and the sign-in button (§10, `docs/PERFORMANCE.md` §12) keep these rules. With Reduce Motion on there is no intro (the launch screen goes straight to the first screen, as before), the sign-in pill becomes the ring at once and the ring does not turn; "Opening Microsoft…" still says what is happening. Where §10 and PERFORMANCE §12 say "Remove animations", read Reduce Motion.

### iOS-A.8 Keyboard (HIG, Virtual keyboards)
- **Return key:** a single-line field's Return key is Next to the following field, and Done on the last one (Profile, the ticket's title, the task's title).
- **Done bar:** multiline fields, and the phone pad (which has no Return key), get the Done bar above the keyboard (`KeyboardDoneBar`, one per form).
- **Keyboard types:** match the content: email, phone, `numbers-and-punctuation` for a number.
- **AutoFill:** name, phone and email fields set `textContentType`.

### iOS-A.9 Feedback
- **Success notice:** a non-modal notice for a write. Green tick for success, amber mark for a partial outcome; never the tick for anything that failed.
- **Alerts:** confirmations name exactly what happens. Destructive style only for a destructive result the person didn't directly choose; the account-deletion request uses the default style (HIG, Alerts). Cancel is always "Cancel".

### iOS-A.10 Appearance and colour
- **Light only (D9):** `userInterfaceStyle: "light"`. Nothing reads the system appearance: no `dark:` classes, no `useColorScheme`, a dark-content status bar, a light date picker. A dark-mode phone shows the light app and light system controls.
- **Brand yellow:** `#FFCC00` (the web's CSS variable; the logo's sampled `#FECB03` is not in the app) is 1.5:1 on white, below the 4.5:1 text minimum and the 3:1 graphics minimum. It is never a text, icon or control colour; it appears only in the two decorative empty-state illustrations. Its accessible use is as a fill behind `#1A1A1A` text (11.5:1), as on the web's secondary button. A test enforces this.
- **Brand red:** `#D21121` is 5.5:1 on white and passes for text either way.
- **Separators:** `border-border` (`#e2e8f0`), the card edge, everywhere. gray-100 (S2, §8) was too faint on white (1.06:1).

### iOS-A.11 Empty, loading and error states
S11 stands; the shared `EmptyState`, `ErrorState`, `OfflineState` and `LoadingSkeleton` are on every screen. A list footer whose next page failed shows its message and the same `OutlineButton` "Retry" as `ErrorState`, not a "Tap to retry" text.

### iOS-A.12 Login and start-up on iPhone (iOS-5c, 2026-10-30)
§10 applies as written, in pt for dp; the code is Android's (`docs/ios/00-PORT-MANIFEST.md` §4.16). The differences:
- **Development builds** keep the developer-token button and its hint in the dashed amber box under the sign-in button, `__DEV__` only, until iOS-9 (`docs/ios/ANDROID-DELTA.md` §5, item 1). No TestFlight or release bundle contains it (`verify-release-bundle`).
- **Sign-in is unchanged.** Login still runs `attemptSignIn()`; the iOS redirect and the private (ephemeral) browser session in `src/api/auth.api.ts` and `src/config/auth.config.ts` were not touched.
- **Type:** the headline's weight 800 is SF Pro Heavy (Android draws Roboto Black). The headline stops growing at 1.3 × (Android's cap, so a line never wraps), sooner than iOS's Large Title (× 1.76). It is the only title capped below its iOS style's ratio. "Setu" (21 pt), the sub-line, prompt and footer follow the text size uncapped.
- **The sign-in label is the one text that shrinks to fit** (iOS-A.3 says nothing does at the accessibility sizes). The pill is a fixed 52 pt by design, so the label stays on one line and shrinks to the screen's width instead. On a 375 pt iPhone it starts to shrink at about the largest standard size (× 1.35) and is about 20 pt at AX5 (15 pt at the default size). These are estimates from SF Pro's average width, not measured; check on a device in iOS-7.
- **Screens:** iOS 16.4 is the minimum (Expo SDK 57), so the smallest iPhone is 375 × 667 pt (iPhone SE, 2nd and 3rd generation). That is wider and taller than §10.7's 360 × 640 case, so §10.7's results are the worst case on iPhone too.
- **Status bar:** Login asks for white status-bar icons over the red card (`StatusBar barStyle="light-content"`); leaving Login restores the dark ones (App.tsx). On a cold start to Login, the start-up intro is white while Login mounts under it, so for up to about a second the clock and battery are white on white. Android does the same. Check on a device (`docs/ios/UAT-TEST-PLAN-IOS.md` A5).
- **Launch screen:** expo-splash-screen builds the iOS launch screen from `assets/splash-icon.png`: the 192 × 192 pt image centred on the whole screen, which is the box the intro draws (`splashArt`), so the intro's first frame is the launch screen. iOS hides the launch screen without a fade (`fade` is false by default; the `duration` that `splash.ts` sets has no effect on iOS), over that identical frame.
- **Light only** (iOS-A.10): the red card and the white ground stay as they are in Dark Mode.

### iOS-A.13 Solid navigation bars, Android's look (iOS-8a, 2026-11-02)
**The device finding (TestFlight 0.1.0 (1)):**
- On Home, Tickets, Approvals and Alerts the large title was drawn over the content, and the content scrolled under the title and under the status bar.
- Tickets' search and Filters sat over the title, and the first card was hidden. Approvals' chips sat under the clock. Alerts' "Mark all read" and "Earlier" overlapped the title.
- The last rows of the lists sat behind the tab bar and the "+".

**Why it happened:**
- **The large title made the bar see-through.** In the installed native-stack (7.21), a large title or a search field in the bar makes the bar translucent unless `headerTransparent: false` is set. A large title also makes its background transparent.
- **The screen was then laid out under the bar.** react-native-screens (4.26) lays a translucent bar's screen out from the top of the display (`edgesForExtendedLayout`). The content relied on UIKit moving the scroll view down (`contentInsetAdjustmentBehavior="automatic"`), and on the device that did not happen.
- **The bottom is a separate question.** React Navigation's tab bar takes its own space under the screens; it is not drawn over them. So a list already ends at the bar's top edge, and code alone does not show why rows sat behind it. The likely cause is the same UIKit inset handling. What was found and fixed: the ticket list's selection bar is about 170 pt tall at the accessibility sizes, but the list padded only 96.

**The rule since iOS-8a:**
- **One solid bar on every stack screen and sheet,** from `STACK_SCREEN_OPTIONS` (`src/navigation/TabStacks.tsx`):
  - opaque white (`colors.surface`, `headerTransparent: false`), with UIKit's hairline under it (Android's `border-b`);
  - the title 18 pt semibold gray-900 (Android's `text-lg font-semibold text-gray-900`);
  - the back chevron and icon buttons gray-900; text buttons in the bar `text-sm font-medium text-blue-700`, as Android's "Mark all read" and "Clear all";
  - no iOS 26 glass capsule behind bar buttons (`headerLeftBackgroundVisible` and `headerRightBackgroundVisible` false).
- **Nothing in a screen sets the bar's look.**
- **Where iOS keeps its own:** UIKit's 44 pt bar height (Android: 56 dp); the centred title (native-stack: title alignment is "Not supported on iOS"); the back chevron with no label; the native edge swipe; the sheets' ✕.
- **Never:**
  - a large title, `headerTransparent: true`, a header background view or a blur;
  - the bar's own search field (`headerSearchBarOptions`);
  - `contentInsetAdjustmentBehavior`.

  Each of these lays the screen out under the bar, or leaves its content to UIKit.
- **Toolbars and banners go under the bar, above the list, as on Android** (§iOS-A.2). They never go in the bar, inside the list, or over the screen. "Mark all read" stays at the bar's right, as on Android.
- **List padding, from `src/components/listDefaults.ts`:**
  - 12 pt above the first row (`LIST_TOP_GAP`), 24 pt under the last (`LIST_END_GAP`);
  - 96 pt on a screen with the "+" button (`FAB_CLEARANCE`: the button's 20 pt offset, its 56 pt and a 20 pt gap);
  - while tickets are selected, the selection bar's measured height + 24, when that is more (`listBottomInset`).
  - **No tab-bar height is added,** because the bar is under the screens, not over them. A test fails if that changes (`tests/screens/solid-headers.test.mjs` §4).

**HIG:**
- **Layout, Guides and safe areas:** *"A safe area defines the area within a window that isn't covered on the edge by a hardware feature or another view within the window, like a toolbar, tab bar, or status bar. Respecting the safe area is essential to make sure system UI and hardware features like the Dynamic Island don't obstruct content and controls."* The solid bar keeps every screen's content out of the area under the status bar and the bar.
- **Toolbars, Phone (iOS):** *"Use a large title to help people stay oriented as they navigate and scroll."*
  - This is a recommendation, and iOS-8a no longer follows it, on purpose: on a device the large title covered the content, and Android's top bar has a standard title.
  - Location is still shown by the selected tab and the bar's title (Toolbars, Titles: *"A title helps people confirm their location as they navigate your app"*).

**Pinned by:** `tests/screens/solid-headers.test.mjs`. Run against the files shipped in 0.1.0 (1) (`30cc239`), its scan flags all six: the large title in TabStacks, the bar's search field in the ticket list, and the automatic inset in Home, Tickets, Approvals, Alerts and More. Also pinned by the updated `hig-polish.test.mjs` §7, `read-screens.test.mjs` and `module-screens.test.mjs`.

**Device check (iOS-8 round 1, after the EAS Update):**
- every tab root at the top and scrolled, with nothing under the bar or the clock;
- the end of every list: the last row fully above the tab bar and the "+";
- Tickets: search, Filters and selection mode, at the default text size and at AX5;
- one pushed screen and one sheet.

### iOS-A.14 Home's period, the list's period chip and the audit log on iPhone (iOS-5e, 2026-11-03)
Android's §11–§13 (G6–G8), on iOS. What is shown, counted and sent is Android's; these are the iOS controls.

**The PERIOD row (§11.1) → a toolbar under the navigation bar** (Ronit, iOS-5e Q2):
- Fixed under the solid bar, like the Tickets toolbar (§iOS-A.13): white, a hairline under it, not in the scroll view. Not shown to L2_MANAGER (`showHomePeriod`).
- One button names the period: 📅 "PERIOD This month ⌄", at least 44 pt, growing with the text. VoiceOver: "Period: This month. Changes the period".
- It opens the **period sheet** (`OptionSheet`, a native page sheet; swipe down or ✕ closes it): the web's ten periods in the web's order and Android's words, the current one ticked. Ten fixed rows are too many for an action sheet, and an action sheet cannot show which one is current.
- **Custom** (Q3): Android's From and To buttons join the toolbar. Each opens `DatePickerSheet` (the iOS inline calendar, Cancel and Done) with Android's limits: From from 1 Jan 2000 to To (or today); To from From to today. No day after today can be picked; there is no extra message for it (Q5). Picking Custom with no From day opens From's calendar as soon as the period sheet has gone (`PageSheet` `onDismiss`: iOS shows one sheet at a time).
- Custom's message is Android's (grey while a day is missing, red for From after To). VoiceOver reads it when it changes; Android's live region is TalkBack's only.
- At the accessibility text sizes From and To stack, so a day is never cut off.

**Tiles and chips (§11.2, §11.3):** Android's, with iOS-4's rules kept: one tile per row at the accessibility sizes, the icon square growing with the text, the counts capped at Title 1. A status chip is **at least** 36 pt (Android: exactly 36 dp) with the 4 pt hit slop, so it grows with the text; its dot grows too.

**The list's period chip (§12):** the first chip of the toolbar's filter row (the list header at the accessibility sizes, §iOS-A.13), red with 📅 and ✕, at least 36 pt + 4 pt slop. VoiceOver: "Period from Home: This month, 03 Oct 2026 – 02 Nov 2026. Clear the period".

**The audit log (§13):** pushed in the More stack, under the solid bar titled "Audit log"; Android's toolbar under it (ticket-number search, the Ticket, entity-type and Person chips, the count, Clear all); the pills, cards and colours are Android's (`colors.auditAction`). The list ends 24 pt above the tab bar (`listBottomInset()`); pull-to-refresh is tinted brand red; the ticket lookup's result is announced to VoiceOver; the footer's retry has a label.

**Push notice (§12, G7c):** not on iOS. Alerts keeps its notice that the Service Desk has no push yet, which stays true on iOS.

**Pinned by:** `tests/home/ios-period.test.mjs`, `tests/rbac/audit-log.test.mjs` §6, and the all-of-`src/` scans in `tests/screens/hig-polish.test.mjs` (44 pt, labels) and `read-screens.test.mjs` (no Android-only API, no colour outside the theme).

### iOS-A.15 Android's polish, the SLA deadline and the audit filters on iPhone (iOS-5f, 2026-11-06)

Android's §14–§16 apply on iOS as written (the same tokens, `src/theme/colors.ts` and `motion.ts`), with these iOS differences. §15.2–§15.3 (the email sign-in) came across in iOS-5g: §iOS-A.16.

**VoiceOver (§14.1, §14.4):**
- The ticket card is one element, as since iOS-4. Its label reads the people row and the dates: "Ticket 19445: <title>. Requested by <name>, technician <name>. Raised 2 Nov, updated 2 days ago. Due Fri 7 Nov, 17:00".
- **The swipe's Assign and Resolve are custom actions** (the rotor's Actions), beside Change status and Select, under exactly the swipe's rules: the same `ticketSwipeActions()`, none while selecting, none for END_USER. They run the revealed buttons' handler (Ronit's decision 3).
- Hidden from VoiceOver: the people row (`accessibilityElementsHidden`), the greeting mark, the fading old count. The SLA deadline is one element ("Resolution: Due Mon 11:00").

**Reduce Motion (§14.2, §14.7, §14.8):** Android's "Remove animations". Press feedback only dims; the count shows at once; the swipe's snap settles at once. **The greeting mark also skips its rise while VoiceOver runs** (`hooks/useScreenReader.ts`), checked at mount and when the art first shows.

**Dynamic Type (§16, §14.1, §14.3):** at the accessibility sizes the card's dates line stacks (the number, then "Raised … · updated …") and its due line wraps; a Home tile's caption wraps (the tile has the row to itself). The people row's names grow on one line and truncate; only the initials stop, at ×1.2 (25 pt circle). The count keeps Title 1's cap (§iOS-A.1).

**44 pt (§14.4, §14.7):** the revealed swipe buttons are `min-h-11` and 80 pt wide. `PressableCard` adds no size of its own; every `<PressableCard>` is checked like a Pressable.

**The audit log's Dates (§13):** "From a day…" and "Until a day…" open `DatePickerSheet` (the iOS calendar, Cancel and Done) once the Dates sheet has gone, instead of Android's date dialog: Android's limits (from `DUE_DATE_MIN` to today), and From never after Until (`withAuditDay`).

**Haptics (§14.5):** not Android's `performAndroidHapticsAsync`. iOS-4's four (§iOS-A.6) already cover Android's three events; iOS-5f added the error haptic to the five forms that show a failed save inline. A ticket created with failed attachments keeps iOS-4's warning.

**Pinned by:** `tests/rbac/swipe-actions.test.mjs` (VoiceOver = swipe, per persona), `tests/polish/haptics-parity.test.mjs`, `tests/home/greeting-mark.test.mjs`, `tests/polish/people-row.test.mjs`, `tests/motion/polish.test.mjs`, `tests/rbac/audit-log.test.mjs` and the scans in `tests/screens/hig-polish.test.mjs`.

### iOS-A.16 The email sign-in on iPhone (iOS-5g, 2026-11-06, UAT builds only)

Android's §15.2 and §15.3 apply on iOS as written: the same tokens (`emailForm`, `loginType`, `emailReveal`), the OR divider, the form opened in place, the failure box, "Sign in" at 52 pt with the face drawn through the children function (never a function `style`), the keyboard rule (`revealScrollY`) and the motion. The sign-in calls only `POST /auth/mobile/login` (`docs/web-system/02-AUTH.md` §iOS-B). The iOS differences:

**Only on UAT builds, twice over.** `EMAIL_SIGN_IN_ENABLED` hides it at run time, as Android did until `6b5e46c`. A build-time gate also keeps the form out of a `production` bundle altogether, so App Review's Login shows only "Sign in with Microsoft" (§iOS-A.12).
- **iOS-5h (Ronit, 2026-11-08):** §15.2's heading and "every build, UAT and PROD" are Android's since `6b5e46c`. On iPhone the form stays on UAT builds only. Matching Android is on the iOS-9 list, after the backend team confirms no `Set-Cookie` and PROD is approved (`docs/ios/ANDROID-DELTA.md` §5, item 7). The form itself, its tokens and its motion do not change.

**Keyboard and AutoFill (§15.2):**
- Email: the email keyboard (`keyboardType`, `inputMode`), no capitals, corrections or spell check, focused when the form opens. `textContentType="username"` with `autoComplete="email"`, so iOS Password AutoFill pairs it with the password. Return key **next**.
- Password: `textContentType="password"`, `autoComplete="current-password"`, masked. Return key **go** signs in. AutoFill offers the person's saved passwords above the keyboard; the app stores none.
- `KeyboardAvoidingView` with `padding`, as on Android and as the app's other forms (iOS's keyboard does not resize the window).

**VoiceOver (§15.2):** iOS has no live region.
- A field error, or the failure box's title and message, is **announced** when it appears (`AccessibilityInfo.announceForAccessibility`). The failure box is also an `alert`.
- The text action is a button, "Sign in with email instead", hint "Shows email and password fields". The toggle is a button, "Show password" / "Hide password" (`accessibilityLabel`, which VoiceOver reads; Android: `aria-label`).
- While an email sign-in runs, the Microsoft pill is hidden from VoiceOver (`accessibilityElementsHidden`; Android hides it from TalkBack).

**Dynamic Type (§16):** the fields, the text action and "Sign in" take `minHeight` (48 pt, 48 pt and 52 pt) in place of a fixed height, and grow with the text. The eye toggle stays 48 × 48 pt. `tests/screens/hig-polish.test.mjs` counts the action, the toggle and "Sign in" among the token-sized targets; `tests/login/sign-in-button.test.mjs` checks the button stays in view and at least 48 pt tall at 200 % text.

**The password** is cleared on success, on failure, on unmount and in the submit's `finally`. It is never stored, logged or put in an error (`02-AUTH.md` §8.5, §iOS-B).

**Light only** (§iOS-A.10), as Login.

**Pinned by:** `tests/auth/password-sign-in.test.mjs` (Android's, one path), `tests/auth/ios-password-sign-in.test.mjs` (iOS: gates, Keychain, password, keyboard, VoiceOver, Dynamic Type), `tests/login/sign-in-button.test.mjs`, and the scans in `tests/motion/start-up-and-login.test.mjs`, `tests/screens/read-screens.test.mjs` and `tests/screens/hig-polish.test.mjs`. Device checks: `docs/ios/UAT-TEST-PLAN-IOS.md` G20.
