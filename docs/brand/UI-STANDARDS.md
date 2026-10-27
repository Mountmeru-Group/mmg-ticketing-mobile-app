# UI standards — Setu (Phase C, 2026-10-20; Phase C2 fixes the same day; app name 2026-10-23)

Phase C polished the 16 MVP screens (M1–M16, `docs/RELEASE.md` §9) plus the task list and task detail on the Phase B
token foundation (`docs/brand/WEB-TOKENS.md`, `src/theme/`). This file has the consistency audit that came first (§1),
the one standard chosen for each finding (§2), the contrast report (§3) and the layout checks (§4). Phase C2 fixed two
defects found on a device, the Home KPI tiles and the drawer layout (§5), and updated S2, S12 and §4 to match. On
2026-10-23 the app was renamed "Setu" (§6), which changed S12's drawer header and §4. Phase A1 (2026-10-23) added
motion and the empty-list illustrations (S7, S11; `docs/PERFORMANCE.md` §10). §8 (2026-10-27) restates the inline
property-editor pattern on the ticket, now that the technician has one too.

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
- KPI tiles are this card with a coloured 32 dp square from `colors.kpi`, the label in `text-sm gray-500` and the count in `text-2xl font-bold`, like the web's KPICard.
  - Arrangement: the square top-left, the label under it at the tile's full width, the count at the tile's foot. The web puts the label beside the square, but a phone tile leaves only about 80 dp for that.
  - Grid: two per row, 12 dp apart both ways, built as explicit rows with tile widths in dp from the grid's measured width. An odd last tile spans its row. Tiles in a row stretch to the taller one, so the counts line up. Minimum height 128 dp (`min-h-32`).
  - Labels are never truncated and never break inside a word. Each word may take a line (two lines at most). A word that is still too wide shrinks to fit (`adjustsFontSizeToFit`, no `minimumFontScale`).
  - **No percentage widths in a wrapping row** (`w-[48%]` + `flex-wrap`) for a grid, anywhere. On a device the tiles came out as wide as their content (§5).

**S3 Typography and avatars.**
- Screen title: `text-lg font-semibold`. Home greeting: `text-xl font-bold`.
- Record title: `text-lg font-bold`. Card/list title: `text-base font-semibold`. Row title: `text-sm font-semibold`.
- Section caption: `text-xs font-semibold uppercase tracking-wide text-gray-500`. Sub-label: `text-xs font-semibold text-gray-500`.
- Body `text-sm`, meta `text-xs`, IDs `text-xs font-semibold text-gray-500`.
- Avatars: `bg-primary/10` with `text-primary` initials (the web's avatar); amber on private notes.

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

**S8 Touch targets.** Every control is at least 44 dp: either by size (`h-11`, `min-h-11`, `min-h-12`) or, where a small visual is intended (badge, chip, checkbox, ✕), with a `hitSlop` that makes up the 44 dp.

**S9 Badges.**
- Pill: `rounded-full px-2.5 py-0.5 text-xs font-medium`, colours from `colors.status`, `priority`, `sla` and `badgeFallback`.
- Badge rows: `mt-2 flex-row flex-wrap items-center gap-1.5`.
- Tags and the ticket source use the same pill.

**S10 Callouts.** Notice, InlineError, LookupError and the Login failure box are `rounded-lg p-3`. Errors use an 18 dp icon with `text-sm`; information uses a 16 dp icon with `text-xs`.

**S11 States.**
- Loading: a skeleton that mirrors the layout, with a white band sweeping across it (Phase A1; it pulsed before). Variants: `list`, `approvals`, `articles`, `announcements`, `notifications`, `tasks`, `comments`, `history`, `attachments`, `detail`, `article`, `formPage`, plus the inline ones.
- Empty: a 40 dp icon, a title, what would appear here, and an action where one helps. Examples: "Raise a ticket", "Show all tickets", "Clear search", "Show all articles", "Show all approvals", "Show all tasks".
  - An empty list screen shows an illustration instead of the icon (Phase A1, `EmptyState illustration`), 128 × 96 dp, flat, in brand tokens only (`assets/illustrations/`):
    - `empty` (an empty tray under the Meru drop): nothing here yet, or nothing matches. Tickets, tasks, knowledge base, announcements, the catalogue and My Requests.
    - `clear` (the Meru drop with a tick): nothing waiting for you. Approvals and Alerts.
  - Everything else keeps its icon: offline, no access, not found, "Keep typing", the ticket-detail tabs and Home's recent tickets (sections inside a screen, not a screen).
- Motion: tokens in `src/theme/motion.ts`, rules in `docs/PERFORMANCE.md` §10. Rows of a list enter with a short stagger the first time it shows; a status badge pulses when its own record's status changes.
- Error: the `describeError()` message plus an outline **Retry** button.
- Offline: the banner directly under the header on every screen, and on Login at the top; OfflineState for a first load.

**S12 Chrome.**
- Tab bar (`src/navigation/AppTabBar.tsx`): on every signed-in screen, in the same place (§7). White with a `border-border` top line. Active red, idle gray-500, 24 dp icons (filled when active), and a red unread badge. On a drawer screen no tab is active, so none is highlighted; the drawer's red row shows the module.
- Header left button: ☰ only on the three tab roots (Home, Tickets, Alerts). Every other screen, including the first screen of each drawer module, has the back arrow (44 dp button, 24 dp icon), which does exactly what Android back does. Sheets have ✕.
- Drawer, top to bottom, as in the web sidebar:
  - Header band: white, 72 dp tall, the logo left at 44 dp, "Setu" beside it on one line (`text-lg font-bold text-gray-900`, S3's title step). Fixed; it does not scroll.
  - Nav rows (Approvals when shown, Tasks, Knowledge base, Announcements, Settings): 48 dp, active `bg-primary` with white text, idle gray-600 (both as on the web). Only this list scrolls.
  - A `border-border` separator, then the account card pinned to the bottom. It is the standard card (`rounded-xl border-border`, 8 dp from the drawer edges) and contains:
    - a row with a 40 dp avatar (S3), the name (up to 2 lines), the role, the country-lock chip when it applies, and an 18 dp chevron. Tapping it opens the profile;
    - a gray-100 line;
    - **Sign out**, 48 dp, red-600 icon and label (the web's `text-red-600`), `red-50` when pressed. While signing out, the icon becomes a brand-red spinner and the label reads "Signing out…".
  - The version line under the card. The drawer pads by the top and bottom safe-area insets, so the line stays clear of the gesture bar.
- Status bar: dark on white and grey screens; light on the red selection bar and the black image viewer.

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

### 7.3 Every route checked (25)

| Host of the bar | Routes | Header left |
|---|---|---|
| Tab navigator (`tabBar`) | HomeTab, AlertsTab, TicketList | ☰ |
| Tab navigator (`tabBar`) | TicketDetail, CreateTicket, TaskDetail, TicketLink | back |
| Tab navigator (`tabBar`) | ReplyComposer, StatusClosure, AssignPicker, SubmitApproval, TaskEditor, TicketFilters (sheets) | ✕ |
| Drawer (`screenLayout`) | ApprovalsInbox, TaskList, KnowledgeBase, ServiceCatalog, Announcements, Profile | back (was ☰) |
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
