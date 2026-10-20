# Web portal design tokens — MMG Service Desk

Extracted on 2026-10-20 (Phase B) from a **read-only** reading of the web repo clone `MMG-Ticketing-Platform`, commit
`d7f3887`. Every path below is relative to `MMG-Ticketing-Platform/frontend/`. Nothing in the web repo was run or
changed.

- The web styles everything with Tailwind CSS **3.4.19** (`package-lock.json`, `node_modules/tailwindcss`). The mobile
  app has the same version, so every Tailwind class name below means the same hex on both sides.
- Hex values for Tailwind classes come from Tailwind 3.4.19's default palette (`tailwindcss/colors`).
- The web's CSS variables are written in HSL. The hex values here are exact conversions, rounded per channel.
- **Mobile mapping:** `src/theme/colors.ts` (`colors.*`, `palette.*`), `src/theme/typography.ts` and
  `src/theme/spacing.ts`.
- Values that could not be found are listed in §5. None are invented.

---

## 1. Colour

### 1.1 Brand and base colours: CSS variables

Source: `src/index.css:6-25` (`:root`), mapped to Tailwind names in `tailwind.config.js:7-37`.

| Variable | HSL (as written) | Hex | Same as Tailwind | Mobile token |
|---|---|---|---|---|
| `--primary` | `355 85% 44.5%` | **`#D21121`** (brand red) | — | `colors.primary` |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | white | `colors.primaryForeground` |
| `--secondary` | `48 100% 50%` | **`#FFCC00`** (brand yellow) | — | `colors.secondary` |
| `--secondary-foreground` | `0 0% 10%` | `#1A1A1A` | — | `colors.secondaryForeground` |
| `--accent` | `48 100% 50%` | `#FFCC00` | — | `colors.accent` |
| `--accent-foreground` | `0 0% 10%` | `#1A1A1A` | — | `colors.accentForeground` |
| `--destructive` | `0 84.2% 60.2%` | `#EF4444` | red-500 | `colors.destructive` |
| `--destructive-foreground` | `210 40% 98%` | `#F8FAFC` | slate-50 | `colors.destructiveForeground` |
| `--background` | `0 0% 100%` | `#FFFFFF` | white | `colors.background` |
| `--foreground` | `222.2 84% 4.9%` | `#020817` | — (slate-950 is `#020617`) | `colors.foreground` |
| `--card` | `0 0% 100%` | `#FFFFFF` | white | `colors.card` |
| `--card-foreground` | `222.2 84% 4.9%` | `#020817` | — | `colors.cardForeground` |
| `--muted` | `210 40% 96.1%` | `#F1F5F9` | slate-100 | `colors.muted` |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `#64748B` | slate-500 | `colors.mutedForeground` |
| `--border` | `214.3 31.8% 91.4%` | `#E2E8F0` | slate-200 | `colors.border` |
| `--input` | `214.3 31.8% 91.4%` | `#E2E8F0` | slate-200 | `colors.input` |
| `--ring` | `355 85% 44.5%` | `#D21121` | — | `colors.ring` |
| `--radius` | `0.5rem` | — | — | `radius.lg` (§3) |

- `src/index.css:29-35` applies `border-border` to every element. So a bare `border` class on the web draws `#E2E8F0`,
  not Tailwind's gray-200.
- The body is `bg-background text-foreground`.

### 1.2 Surfaces and text, as the pages actually paint them

The pages mostly use Tailwind greys, not the CSS variables above. Counts are occurrences across `src/`.

| Role | Class (count) | Hex | Mobile token | Source |
|---|---|---|---|---|
| Page background | `bg-gray-50` (184) | `#F9FAFB` | `colors.canvas` | `src/layouts/AppLayout.tsx:214` |
| Cards, sidebar, top bar | `bg-white` (177) | `#FFFFFF` | `colors.surface` | `AppLayout.tsx:216,233`; `src/pages/dashboard/DashboardPage.tsx:870` |
| Text, primary (headings, values) | `text-gray-900` (230) | `#111827` | `colors.text.primary` | e.g. `DashboardPage.tsx:876` |
| Text, body (form labels, cells) | `text-gray-700` (260) | `#374151` | `colors.text.body` | e.g. `src/pages/auth/LoginPage.tsx:147` |
| Text, secondary (labels, captions) | `text-gray-500` (444) | `#6B7280` | `colors.text.secondary` | e.g. `DashboardPage.tsx:875` |
| Text, muted (hints, chevrons) | `text-gray-400` (351) | `#9CA3AF` | `colors.text.muted` | e.g. `AppLayout.tsx:102` |
| Input border | `border-gray-300` (146) | `#D1D5DB` | `palette.gray[300]` | `LoginPage.tsx:153` |
| Brand accent text | `text-primary` (69) | `#D21121` | `colors.primary` | e.g. `AppLayout.tsx:280` |

`text-blue-600` (66 uses) is also common, for links and info accents. Blue is a legitimate secondary accent on the web,
not only a leftover.

### 1.3 Sidebar and navigation (the clearest brand signal)

Source: `src/layouts/AppLayout.tsx`.

| Element | Classes | Colours | Lines |
|---|---|---|---|
| **Active nav item** | `bg-primary text-white`, `rounded-lg px-3 py-2 text-sm font-medium` | `#D21121` bg, `#FFFFFF` text and icon | 119-126 |
| Idle nav item | `text-gray-600 hover:bg-gray-100 hover:text-gray-900` | `#4B5563`; hover `#F3F4F6` / `#111827` | 124 |
| Active admin sub-item | `bg-primary text-white` | as above | 162-166 |
| Admin section header, open | `bg-primary/10 text-primary` | `#D21121` at 10% / `#D21121` | 141-143 |
| User avatar | `bg-primary/10` circle, `text-primary` initials, bold | as above | 186-187 |
| Sign out | `text-red-600 hover:bg-red-50` | `#DC2626` / `#FEF2F2` | 201 |
| Sidebar header | logo `h-10`, "ServiceDesk" `font-bold text-gray-900 text-sm`, "IT Support Portal" `text-xs text-gray-400` | — | 98-103 |
| Sidebar panel | `w-56 bg-white border-r` | `#FFFFFF`, border `#E2E8F0` | 216 |
| Mobile bottom nav, active | `text-primary` | `#D21121` | 280-281 |
| Mobile bottom nav, idle | `text-gray-400` | `#9CA3AF` | 280-281 |
| Dashboard tab, active | `text-red-700 border-b-2 border-red-600` | `#B91C1C` / `#DC2626` | `DashboardPage.tsx:180` |

Mobile tokens: `colors.nav.activeBg / activeFg / idleFg / tabActive / tabIdle`.

### 1.4 Dashboard KPI tiles

Source: `src/pages/dashboard/DashboardPage.tsx`. `KPICard` (lines 856-881) is a white card (`bg-white rounded-xl border p-5`)
with a coloured `p-3 rounded-lg` square holding a white icon. Its title is `text-sm text-gray-500` and its value is
`text-2xl font-bold text-gray-900`.

| Tile | Class | Hex | Lines | Mobile token |
|---|---|---|---|---|
| Total Tickets ("My Total Requests" for END_USER) | `bg-purple-500` | `#A855F7` | 341-347 | `colors.kpi.total` |
| Open Tickets ("My Open Requests") | `bg-blue-500` | `#3B82F6` | 348-354 | `colors.kpi.open` |
| In Progress | `bg-yellow-500` | `#EAB308` | 355-361 | `colors.kpi.inProgress` |
| Resolved / Resolved Today | `bg-green-500` | `#22C55E` | 362-368 | `colors.kpi.resolved` |
| SLA Breached | `bg-red-500` | `#EF4444` | 369-375 | `colors.kpi.slaBreached` |
| Closed (staff only) | `bg-zinc-600` | `#52525B` | 381-387 | `colors.kpi.closed` |
| Unassigned (staff only) | `bg-orange-500` | `#F97316` | 388-394 | `colors.kpi.unassigned` |

The pending sub-status mini-tiles (lines 396-417) are staff only and shown only when the count is above 0. Each is a
`w-2 h-2` dot. Mobile token: `colors.kpiPending.<STATUS>`.

| Mini-tile | Status | Class | Hex |
|---|---|---|---|
| Mgmt Review | `PENDING_MGMT_REVIEW` | `bg-amber-400` | `#FBBF24` |
| With Partner | `PENDING_PARTNER` | `bg-purple-400` | `#C084FC` |
| User Confirm | `PENDING_USER_CONFIRM` | `bg-sky-400` | `#38BDF8` |
| More Info | `PENDING_USER_INFO` | `bg-indigo-400` | `#818CF8` |
| Master Data | `PENDING_MASTER_DATA` | `bg-teal-400` | `#2DD4BF` |
| On Hold | `ON_HOLD` | `bg-gray-400` | `#9CA3AF` |

### 1.5 Status badges

Source: `src/components/ui/StatusBadge.tsx:4-17`, fallback at line 20. Shape: `rounded-full px-2 py-0.5 text-xs
font-medium`. Mobile token: `colors.status.<STATUS>`, fallback `colors.badgeFallback`.

| Status | Label | Classes | Background | Text |
|---|---|---|---|---|
| OPEN | Open | `bg-blue-100 text-blue-700` | `#DBEAFE` | `#1D4ED8` |
| IN_PROGRESS | In Progress | `bg-yellow-100 text-yellow-700` | `#FEF9C3` | `#A16207` |
| PENDING | Pending | `bg-orange-100 text-orange-700` | `#FFEDD5` | `#C2410C` |
| ON_HOLD | On Hold | `bg-slate-200 text-slate-700` | `#E2E8F0` | `#334155` |
| PENDING_MGMT_REVIEW | Pending with Management Review | `bg-purple-100 text-purple-700` | `#F3E8FF` | `#7E22CE` |
| PENDING_MASTER_DATA | Pending with Master Data Team | `bg-indigo-100 text-indigo-700` | `#E0E7FF` | `#4338CA` |
| PENDING_PARTNER | Pending with Partner | `bg-amber-100 text-amber-700` | `#FEF3C7` | `#B45309` |
| PENDING_USER_CONFIRM | Pending with User for Confirmation | `bg-cyan-100 text-cyan-700` | `#CFFAFE` | `#0E7490` |
| PENDING_USER_INFO | Pending with User for Info | `bg-teal-100 text-teal-700` | `#CCFBF1` | `#0F766E` |
| RESOLVED | Resolved | `bg-green-100 text-green-700` | `#DCFCE7` | `#15803D` |
| CANCELED | Canceled | `bg-red-100 text-red-600` | `#FEE2E2` | `#DC2626` |
| CLOSED | Closed | `bg-zinc-700 text-white` | `#3F3F46` | `#FFFFFF` |
| *(unknown)* | raw value | `bg-gray-100 text-gray-600` | `#F3F4F6` | `#4B5563` |

### 1.6 Priority badges

Source: `src/components/ui/PriorityBadge.tsx:3-8`, fallback at line 11. Same shape as the status badge. Mobile token:
`colors.priority.<PRIORITY>`.

| Priority | Classes | Background | Text |
|---|---|---|---|
| LOW | `bg-gray-100 text-gray-600` | `#F3F4F6` | `#4B5563` |
| MEDIUM | `bg-blue-100 text-blue-700` | `#DBEAFE` | `#1D4ED8` |
| HIGH | `bg-orange-100 text-orange-700` | `#FFEDD5` | `#C2410C` |
| URGENT | `bg-red-100 text-red-700` | `#FEE2E2` | `#B91C1C` |
| *(unknown)* | `bg-gray-100 text-gray-600` | `#F3F4F6` | `#4B5563` |

### 1.7 SLA badges

Source: `src/components/ui/SLABadge.tsx:35-39`, fallback at line 50. Mobile token: `colors.sla.<STATUS>`.

| SLA status | Label | Classes | Background | Text |
|---|---|---|---|---|
| WITHIN_SLA | Within SLA | `bg-green-100 text-green-700` | `#DCFCE7` | `#15803D` |
| DUE_SOON | Due Soon | `bg-yellow-100 text-yellow-700` | `#FEF9C3` | `#A16207` |
| BREACHED | Breached, or the breach label (lines 28-33) | `bg-red-100 text-red-700` | `#FEE2E2` | `#B91C1C` |

### 1.8 Dashboard chart colours (hex in source)

Source: `DashboardPage.tsx:30-51` and `:524-525`. Mobile token: `colors.chart.*`.

| Series | Hex | Tailwind equivalent |
|---|---|---|
| Status OPEN | `#3B82F6` | blue-500 |
| Status IN_PROGRESS | `#F59E0B` | amber-500 |
| Status ON_HOLD | `#8B5CF6` | violet-500 |
| Status PENDING | `#F97316` | orange-500 |
| Status RESOLVED | `#10B981` | emerald-500 |
| Status CLOSED | `#6B7280` | gray-500 |
| Status PENDING_MGMT_REVIEW | `#EC4899` | pink-500 |
| Status PENDING_USER_CONFIRM | `#06B6D4` | cyan-500 |
| Status PENDING_USER_INFO | `#84CC16` | lime-500 |
| Status PENDING_MASTER_DATA | `#EF4444` | red-500 |
| Status PENDING_PARTNER | `#A855F7` | purple-500 |
| Priority LOW / MEDIUM / HIGH / URGENT | `#10B981` / `#F59E0B` / `#F97316` / `#EF4444` | emerald / amber / orange / red-500 |
| SLA met / breached | `#10B981` / `#EF4444` | emerald-500 / red-500 |

- CANCELED has no chart colour; the web falls back to `FALLBACK_COLORS` by index (line 51).
- Chart label text is `#374151`.

### 1.9 Other brand-relevant styling

- **Button** (`src/components/ui/Button.tsx:11-23`):
  - primary: `bg-primary text-white` (hover: see §6);
  - secondary: `bg-secondary text-secondary-foreground`, yellow `#FFCC00` with `#1A1A1A` text;
  - destructive: `bg-destructive text-white`;
  - outline: `border-gray-300 text-gray-700`;
  - radius: `rounded-md` (sm) or `rounded-lg` (md, lg);
  - disabled: `opacity-50`.
- **Spinner** (`src/components/ui/Spinner.tsx:5`): `border-gray-200 border-t-primary`, a brand-red arc.
- **Login backdrop** (`src/layouts/AuthLayout.tsx:9`): `bg-gradient-to-br from-red-50 to-yellow-50` (`#FEF2F2` →
  `#FEFCE8`).
  - Logo: `h-20`, centred.
  - Title: "Mt. Meru ServiceDesk", `text-2xl font-bold text-gray-900`.
  - Subtitle: "IT Support Portal", `text-sm text-gray-500`.
  - Card: `bg-white rounded-2xl shadow-lg p-8`.
- **Input focus** (`LoginPage.tsx:153`): `focus:border-primary focus:ring-primary`.

### 1.10 The logo file

- `assets/brand/meru-logo.png` (mobile) is byte-identical (MD5 `22c6fb47…af`) to the web's `public/meru-logo.png`,
  which the web uses for the favicon, the sidebar and the login card.
- It is **689 × 478, 8-bit RGB with no alpha channel**: the logo sits on a solid white field. It is not transparent.
- Logo content occupies `x 120-685, y 8-353` (566 × 346). The rest is white margin.
- Sampled solid colours: red **`#D51B28`**, yellow **`#FECB03`**. These are close to, but not the same as, the CSS
  variables `#D21121` / `#FFCC00`. The app's tokens follow the CSS variables, because the brief is to match the
  portal's UI. The logo pixels are untouched.

## 2. Typography

- **Font family.** None is defined.
  - `tailwind.config.js` has no `fontFamily`, `index.html` loads no font, and there is no `@font-face`.
  - So the web renders Tailwind's default `font-sans` stack: `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji",
    "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`. That is Roboto on Android and Segoe UI on Windows.
  - `src/index.css:34` adds `font-feature-settings: "rlig" 1, "calt" 1`.
  - `font-mono` is used only for asset tags and IDs.
- **Mobile:** no font is loaded; React Native's Android default is Roboto, which matches.

**Size scale.** This is Tailwind's default; no override exists. Counts are uses in `src/`. The mobile px column is
explained below the table.

| Class | rem / line-height | Web px | Mobile px | Uses |
|---|---|---|---|---|
| `text-xs` | 0.75 / 1rem | 12 / 16 | 10.5 / 14 | 560 |
| `text-sm` | 0.875 / 1.25rem | 14 / 20 | 12.25 / 17.5 | 660 |
| `text-base` | 1 / 1.5rem | 16 / 24 | 14 / 21 | 12 |
| `text-lg` | 1.125 / 1.75rem | 18 / 28 | 15.75 / 24.5 | 20 |
| `text-xl` | 1.25 / 1.75rem | 20 / 28 | 17.5 / 24.5 | 11 |
| `text-2xl` | 1.5 / 2rem | 24 / 32 | 21 / 28 | 49 |
| `text-3xl` | 1.875 / 2.25rem | 30 / 36 | 26.25 / 31.5 | 4 |

- **Mobile px column.** NativeWind resolves 1rem to **14px** on native: `withNativeWind`'s default
  `inlineRem = 14` (`node_modules/nativewind/dist/metro/index.js`, `react-native-css-interop/.../parseDeclaration.js:1132`).
  The web uses 16px.
  - So every class renders at 7/8 of the web's pixel size in the app today. This was confirmed from the compiled
    NativeWind output: `text-sm` → `fontSize 12.25`, `p-4` → `padding 14`.
  - Matching the web pixel-for-pixel means setting `inlineRem: 16` in `metro.config.js` (or `:root { font-size: 16px }`
    in `global.css`).
  - That would enlarge every screen by 14%, so it is a **Phase C decision**, not done here.
- **Weights:** `font-medium` 500 (473 uses), `font-semibold` 600 (116), `font-bold` 700 (94), `font-normal` 400 (5).
- **Roles:**
  - KPI value: `text-2xl font-bold`.
  - Page and login title: `text-2xl font-bold`.
  - Nav item: `text-sm font-medium`.
  - Badges: `text-xs font-medium`.
  - Card titles: `font-semibold`.
  - Body: `text-sm`.
  - Captions: `text-xs`.
- Mobile: `src/theme/typography.ts` (`fontSize`, `fontWeight`, `textRoles`).

## 3. Spacing and radius

- **Spacing:** no custom scale. The web uses Tailwind's default (step n = n × 0.25rem). Common layout values:
  - main content: `p-4 lg:p-6` (`AppLayout.tsx:247`);
  - KPI card: `p-5`;
  - chart cards: `p-6`;
  - grids: `gap-4`;
  - sidebar: `w-56`;
  - nav item: `px-3 py-2`.
- **Radius:** custom. `--radius: 0.5rem` (`src/index.css:24`), mapped in `tailwind.config.js:38-42`:

| Class | Web value | Web px | Tailwind default | Uses on web |
|---|---|---|---|---|
| `rounded-sm` | `calc(var(--radius) - 4px)` | 4 | 0.125rem (2px) | 1 |
| `rounded` | Tailwind default 0.25rem | 4 | same | 130 |
| `rounded-md` | `calc(var(--radius) - 2px)` | 6 | 0.375rem (6px) | 31 |
| `rounded-lg` | `var(--radius)` | 8 | 0.5rem | 291 |
| `rounded-xl` | Tailwind default 0.75rem | 12 | same | 130 |
| `rounded-2xl` | Tailwind default 1rem | 16 | same | 5 |
| `rounded-full` | 9999px | — | same | 110 |

- Only `sm` differs from Tailwind's default, and the mobile app uses no `rounded-sm`.
- Mobile: `src/theme/spacing.ts` (`spacing`, `radius`).

## 4. Shadows

- Cards use `border` plus `hover:shadow-sm`; the login card uses `shadow-lg`. No custom shadow is defined.
- Not tokenised: NativeWind's preset already maps `shadow-*` to Android elevation.

## 5. Not found / not defined on the web

- **Dark theme.** `darkMode: ['class']` is configured (`tailwind.config.js:3`), but no `.dark { … }` variables exist, so
  the web has no dark palette. Mobile stays `userInterfaceStyle: light`.
- **Separate "due soon" vs "overdue" colours** beyond the SLA badge's yellow and red: none.
- **A semantic "success / warning / info" colour set:** none. The pages use raw Tailwind hues: green, amber or yellow,
  and blue. Mobile keeps those as `palette.*`.
- **A chart colour for CANCELED:** none (see §1.8).
- **Brand guidelines document, vector logo, or a logo larger than 689 × 478:** none in the web repo.
  - `public/meru-wordmark.png` (1644 × 421) is a different, right-cropped composition and is not usable as the square
    mark.

## 6. Inconsistencies in the web source (reported, not fixed: R3)

1. **`theme-color` is still blue** (`#2563eb`) in `index.html:7` and `public/manifest.webmanifest:5`, while the brand
   primary is red `#D21121`. The browser or PWA chrome is blue.
2. **The primary button hovers to blue.** `Button.tsx:12` has `bg-primary … hover:bg-blue-600`, so a red button turns
   blue `#2563EB` on hover. It looks like a leftover from before the red rebrand. Mobile does not copy it.
3. The KPI card "Closed" falls back to the resolved count when `closed` is missing (`DashboardPage.tsx:383`). This is
   a data issue, not a colour issue; noted for Phase C's Home screen.

---

## 7. What Phase B changed in the mobile app (old → new)

### 7.1 Badges: text shade now matches the web

Backgrounds are unchanged. Before Phase B, the mobile badges used the 800 shade for text, a "mobile choice" noted in
their comments. They now use the web's exact pairs from §1.5-1.7.

| Badge | Value | Text before | Text after |
|---|---|---|---|
| Status | OPEN | blue-800 `#1E40AF` | blue-700 `#1D4ED8` |
| Status | IN_PROGRESS | yellow-800 `#854D0E` | yellow-700 `#A16207` |
| Status | PENDING | orange-800 `#9A3412` | orange-700 `#C2410C` |
| Status | ON_HOLD | slate-800 `#1E293B` | slate-700 `#334155` |
| Status | PENDING_MGMT_REVIEW | purple-800 `#6B21A8` | purple-700 `#7E22CE` |
| Status | PENDING_MASTER_DATA | indigo-800 `#3730A3` | indigo-700 `#4338CA` |
| Status | PENDING_PARTNER | amber-800 `#92400E` | amber-700 `#B45309` |
| Status | PENDING_USER_CONFIRM | cyan-800 `#155E75` | cyan-700 `#0E7490` |
| Status | PENDING_USER_INFO | teal-800 `#115E59` | teal-700 `#0F766E` |
| Status | RESOLVED | green-800 `#166534` | green-700 `#15803D` |
| Status | CANCELED | red-800 `#991B1B` | red-600 `#DC2626` |
| Status | CLOSED | white on zinc-700 | unchanged |
| Status | *(unknown)* | gray-800 `#1F2937` | gray-600 `#4B5563` |
| Priority | LOW | gray-700 `#374151` | gray-600 `#4B5563` |
| Priority | MEDIUM | blue-800 `#1E40AF` | blue-700 `#1D4ED8` |
| Priority | HIGH | orange-800 `#9A3412` | orange-700 `#C2410C` |
| Priority | URGENT | red-800 `#991B1B` | red-700 `#B91C1C` |
| Priority | *(unknown)* | gray-800 `#1F2937` | gray-600 `#4B5563` |
| SLA | WITHIN_SLA | green-800 `#166534` | green-700 `#15803D` |
| SLA | DUE_SOON | yellow-800 `#854D0E` | yellow-700 `#A16207` |
| SLA | BREACHED | red-800 `#991B1B` | red-700 `#B91C1C` |
| SLA | *(unknown)* | gray-800 `#1F2937` | gray-600 `#4B5563` |

### 7.2 Brand red where the web uses `primary`

| Where | Before | After |
|---|---|---|
| `Form.tsx` SubmitButton, `primary` tone | bg blue-600 `#2563EB` | bg primary `#D21121` |
| `EmptyState.tsx` action button | bg `#2563EB` | bg `#D21121` |
| `ErrorBoundary.tsx` "Try again" | bg `#2563EB`, pressed blue-700 `#1D4ED8` | bg `#D21121`, pressed `opacity-80` |
| `BulkProgressModal.tsx` progress bar and "Close" button | `#2563EB` | `#D21121` |
| `OptionSheet.tsx` selected option label and checkmark | blue-700 `#1D4ED8` | `#D21121` |
| Spinners (web Spinner is brand red): `TicketCard` status, `TaskRow` toggle, `AttachmentPicker`, `PersonPickerSheet`, drawer sign-out, `RootNavigator` start-up | `#2563EB` | `#D21121` |
| Drawer, active row background | blue-50 `#EFF6FF` | primary `#D21121` |
| Drawer, active row label and icon | blue-700 `#1D4ED8` / blue-600 `#2563EB` | white `#FFFFFF` |
| Drawer, count badge on the active row | red-600 `#DC2626` bg, white text | white bg, `#D21121` text (so it stays visible) |
| Drawer avatar | blue-600 `#2563EB` circle, white initials | `#D21121` at 10%, `#D21121` initials |
| Bottom tab bar, active tint | `#2563EB` | `#D21121` |
| Bottom tab bar, idle tint | React Navigation default (≈ `#8E8E8F`) | gray-400 `#9CA3AF` |

### 7.3 Same colour, now read from tokens

There is no visual change in these:
- Every other hex literal in `src/components/` (icon, placeholder and HTML-renderer colours).
- `src/navigation/` and `LoginScreen.tsx`.
- All 91 hex literals in the 17 other screens, each replaced by the `palette` entry of the identical value.
  `DevTokenScreen.tsx` had none and is untouched.

`src/` now has no hex literal outside `src/theme/colors.ts`.

### 7.4 Identity

- App name: `MMG Service Desk` → `Mount Meru Service Desk` (`app.json` `name`, and the login heading).
- Logo added: in the login card (64 dp tall) and in a new drawer header (40 dp, with "Service Desk" / "IT Support
  Portal" as on the web sidebar).
- Icons replaced (see `docs/RELEASE.md` §7):
  - adaptive-icon `backgroundColor`: `#1D4ED8` → `#FFFFFF`.
- Unchanged: `slug`, `android.package`, `version`, `versionCode` and `scheme`.
