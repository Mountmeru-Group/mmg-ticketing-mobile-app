# Performance on low-end Android (Phase P, 2026-10-22; Phase P2, 2026-10-23)

> **Phase P2** applied the approved items of §4 and §5 (ticket list cap, inline requires, `freezeOnBlur`, FlashList,
> expo-image) and a transition-smoothness pass. §9 records it; §1–§8 are the Phase P baseline, kept as written.

**Target.** `minSdkVersion` 24: Android 7.0 and later, including 2016-era phones with 1–2 GB of RAM, a slow CPU and slow storage. Ronit's standing requirement is the best possible experience on those phones, treated as a constant priority.

**Rules this phase kept.**
- Performance only: no behaviour, permission or business rule changed.
- No polling, and no shorter `staleTime`: UAT shares its VM, database and Redis with PRODUCTION (`docs/web-system/00-OVERVIEW.md` §3).
- No library added. No EAS build. Auth flow, `auth.config.ts` and the dev-token screen untouched. Nothing committed.

**How this was measured.**
- **Measured:**
  - the release bundle, built the way `npm run verify:release-bundle` builds it (`expo export:embed --dev false --minify true`, `EXPO_PUBLIC_APP_ENV=UAT`, then the project's `hermesc -O`), into a temporary folder outside the repo, with a source map to attribute bytes to packages;
  - every list, query and image in the source, read file by file;
  - React Native's own list and image code, read in `node_modules` to confirm how it behaves.
- **Not measured (no device, no build, no network call in this phase):** frame times, start-up time, memory. Every such figure below is marked **estimate**. §6 says how to measure them on a real phone.

---

## 1. Baseline (before any change, at `de5c50a`)

### 1.1 Lists

How React Native's lists decide to redraw a row, from its source:
- **`FlatList` rows** skip a redraw when their `item` and `renderItem` are unchanged: each cell is a `PureComponent` (`@react-native/virtualized-lists/Lists/VirtualizedListCellRenderer.js:63`). An inline `renderItem` therefore redraws every visible row whenever the screen renders.
- **`SectionList`** builds a new `renderItem` on every render (`VirtualizedSectionList.js:206`), so its rows redraw every time unless they are memoised.
- On Android `FlatList` clips off-screen views by default (`FlatList.js:162-167`).

| Screen / component | How it rendered | Stable keys | `getItemLayout` | Rows memoised | Inline closures in `renderItem` | Why it matters on a weak phone |
|---|---|---|---|---|---|---|
| **Ticket detail (M4): conversation, history, files, tasks** | **`.map()` inside one `ScrollView`** | ids | n/a | no | yes (`() => setViewing(a)`, `() => onOpen(task)` …) | **The worst case in the app.** Every reply was parsed and laid out at once, each through the HTML renderer, before the screen could scroll. An email thread of 40–100 replies (quoted history, signatures) is the heaviest work the app does. **Estimate:** 30–80 ms per HTML reply on a 2016 phone, so 1–5 s of blocked UI on a long ticket. `can` was a new object each render, and nothing was memoised, so any state change (pull-to-refresh, More sheet, upload, opening an image) re-rendered every reply |
| Ticket list (M3) | `FlatList`, `initialNumToRender` 8, `windowSize` 7, clipped | `t.id` (inline) | none: rows vary in height (2-line title, wrapping badges) | `TicketCard` yes | no (`renderItem` in `useCallback`) | Good already, except multi-select: `toggle` depended on the selection, so each tap gave every card a new `onPress`/`onLongPress` and **every visible card redrew** (about 7 at a time) |
| Notifications (M9) | `SectionList` | `n.id` (inline) | none (variable) | **no** | yes | `SectionList` redraws all rows on each screen render, and each row ran the regex HTML-to-text conversion on its body every time (mark read, refresh, count change) |
| Approvals inbox (M12) | `FlatList` | `a.id` (inline) | none | **no** | yes | The ticket lookups are a **new `Map` every render**, so `renderItem` could never be stable; every card redrew on each render |
| Knowledge base (M14): articles, search | `FlatList` ×2 | ids (inline) | none | **no** | yes | The screen renders on every keystroke in the search box; every visible result redrew per keystroke |
| Task list | `FlatList` | `task.id` (inline) | none | `TaskRow` yes, but defeated | yes (`onPress={() => navigate…}`) | Client-side search filters on every keystroke; `TaskRow`'s memo never held |
| Announcements (M16) | `FlatList` | `a.id` (inline) | none | **no** | yes | Each card renders an HTML body |
| Service catalogue: categories, services, My Requests | `FlatList` ×3 | ids (inline) | none | **no** | yes | Search re-renders per keystroke; every category row also counted its items over the whole item list on every render (categories × items) |
| `OptionSheet` (sort, country, category, group, status …) | **`.map()` in a `ScrollView`** | values | n/a | no | yes | Categories and groups can run to dozens; the whole list drew when the sheet opened |
| `PersonPickerSheet` (assignee, requester, approvers) | **`.map()` in a `ScrollView`** | ids | n/a | no | yes | Redraws every row on every keystroke; default `[]` props were new arrays each render |
| `TemplatePickerSheet` | **nested `.map()` in a `ScrollView`** | ids | n/a | no | yes | Every template's HTML preview was recomputed on every keystroke |

**Bounded `.map()` lists, left as they are by design** (fixed small size, or a section inside a form where a nested virtual list would be wrong):
- Home: KPI tiles (≤ 6) and recent tickets (5).
- Drawer rows (≤ 6); filter and status chips; status transitions (≤ 3).
- Bulk "skipped" lists (≤ 20, `BULK_ACTION_LIMIT`).
- Assign picker's recommended technicians (the category/country candidates, a handful).
- A request's answers and approvals; a form's fields; e-mail chips; staged files (≤ the upload limit); a reply's attached file names; skeletons.

### 1.2 Re-render cost

- **Rows not memoised, or memo defeated by new function props:** as in §1.1.
- **Store subscriptions:**
  - `TicketListScreen` reads the whole UI store with no selector. That store holds almost only the list's own filter state, so the extra renders come from one rare event: dismissing an announcement on Home. The rows were not redrawn by it. **Left as is:** not worth the change.
  - Every other screen selects single fields.
- **Expensive work in render:**
  - per-row HTML-to-text (notifications);
  - per-row template preview (template sheet);
  - the per-row item count (catalogue);
  - long HTML bodies laid out in full and then collapsed (below).
- **HTML parsing is already memoised:**
  - `RenderHTMLSource` is `memo` with a shallow compare on `source` (`react-native-render-html/src/RenderHTMLSource.tsx:103-140`);
  - parsing is memoised on the HTML string (`useTTree.ts:33`);
  - so a re-render never re-parsed a body. The cost is the first mount.
- **Framework cost to know about:** every element with a `className` goes through NativeWind's runtime (`react-native-css-interop`, 45 KB). This cannot be removed without rewriting the styling, so fewer re-renders is the lever.

### 1.3 Images

| Image | Finding | Why it matters |
|---|---|---|
| **Full-screen attachment viewer** (`ImageViewerModal`) | Decoded at **full resolution**. Android's default `resizeMethod="auto"` downsamples only local files (`ReactImageView.kt:570-580`), and attachments are network images | A 12-megapixel photo is 4000 × 3000 × 4 bytes ≈ **48 MB of bitmap** (calculated), in a view about 1080 px wide. On a 1 GB phone that is the likeliest out-of-memory kill in the app |
| Images inside HTML (inline base64 only; the sanitiser drops every other image) | Decoded at full resolution; `react-native-render-html` passes no `resizeMethod` (`IMGElementContentSuccess.tsx`) | Rare: a screenshot pasted into a reply. A 1920 × 1080 image is about 8 MB |
| Attachment thumbnails | **None exist**: rows show a file-type icon; the image loads only when tapped | Nothing to downsize |
| Brand logo (`BrandLogo`) | 566 × 346 PNG (≈ 0.8 MB bitmap) shown at 44–64 dp, with explicit width and height | Negligible |
| Layout thrash | Every `<Image>` has explicit dimensions | None from images |

### 1.4 Bundle (measured)

| | Before (`de5c50a`) |
|---|---|
| Release JS, minified | **3,456.7 KB** (gzip 818.3 KB) |
| Hermes bytecode (what ships in the APK) | **4,977.0 KB** |
| Modules | 2,234 (157 of them the app's own) |
| Bundled assets | 24 files, 405.2 KB (the Ionicons font is 389.7 KB of that) |

**Largest packages** (bytes of minified JS attributed through the source map):

| Package | KB | Note |
|---|---|---|
| react-native-reanimated | 737.5 | Required by the drawer (`react-native-drawer-layout` peer). The app never imports it |
| react-native | 565.3 | |
| the app (`src/`) | 381.0 | screens 193.3, components 54.8, hooks 47.2, utils 43.9, api 32.9, navigation 11.2 |
| HTML renderer stack | ≈ 340 | react-native-render-html 49.2, entities 86.2, ramda 80.2, urijs 41.4, transient-render-engine 35.1, css-processor 26.2, htmlparser2 23.0 |
| react-native-gesture-handler | 104.5 | drawer, screens |
| expo, expo-modules-core, expo-auth-session, expo-file-system | ≈ 149 | |
| react-native-worklets | 90.5 | reanimated |
| @react-navigation/* | ≈ 237 | |
| axios, @tanstack/query-core + react-query | 51.1, 65.2 | |

**Whole-library imports:** none that cost anything.
- Metro does not tree-shake, so `import * as X` and a named import bundle the same code. What matters is a package's root entry versus a deep path.
- The one library where that counts, `@expo/vector-icons`, is already imported by deep path (`@expo/vector-icons/Ionicons`, 37 files): only Ionicons ships, not every icon set.

**Unused dependencies:** none.
- `expo-crypto` is imported by no app file, but it is a direct dependency of `expo-auth-session` (sign-in).
- `expo-font`, `nativewind`, `react-native-reanimated`, `react-native-screens` and `react-native-worklets` are used by configuration, plugins or other libraries.

**Unused app files:**
- `src/screens/PlaceholderScreen.tsx` is imported by nothing and is not in the bundle (checked in the source map). UI-STANDARDS says it was deleted in Phase 8; it was not. Cleanup only, no runtime cost; left for Ronit.
- `DevTokenScreen` is stripped from release by its `__DEV__` guard, as `verify:release-bundle` requires.

### 1.5 Network

The rules are already strict, and are unchanged. `src/api/queryClient.ts`:
- `staleTime` at least 60 s;
- no `refetchInterval` anywhere;
- no refetch on focus, reconnect or remount;
- GET retries at most 2, with backoff, only for network errors, 429 and 5xx, never 4xx or HTML;
- mutations never retried.

NetInfo's reachability ping is off (`src/api/network.ts`).

| Query | `staleTime` | Retry | Loads when |
|---|---|---|---|
| Ticket list TKT-1 (20 / page) | 60 s | default | the Tickets tab opens; next page on scroll; pull-to-refresh refetches **page 1 only** |
| Ticket TKT-3 | 60 s | default | the ticket opens |
| Comments CMT-1, history TKT-7 (20 / page), files ATT-1 | 60 s | default | **only after TKT-3 succeeded, and only when their tab is first opened** (05 §C) |
| Dashboard DSH-1, recent tickets, ANN-1, APR-1, unread count | 60 s | default | Home (first screen); APR-1 is shared with the drawer, one request |
| Lookups (categories, countries, teams, priority matrix) | 10 min | default | only when a picker or editor needs them |
| KB (categories, articles, search, article) | 5 min | default | KB screens; search from 2 characters, debounced 350 ms |
| Catalogue (SCR-1, SCR-2, SCR-3) | 5 min | default | catalogue screens |
| Templates LKP-7 | 60 s | default | only while the template sheet is open |
| E-mail recipients | 60 s | **none** | "Reply all" only |
| Notifications NTF-1 (20 / page) | 60 s | default | the Alerts tab opens |

- **Fired on mount that could wait:** none without changing what the first screen shows. Each of Home's five reads feeds something visible on it (tiles, banner, approvals tile, Alerts badge, recent tickets), and they run **in parallel**.
- **Waterfalls:**
  - TKT-3 → comments on ticket detail: **deliberate**. Sub-resources only after the ticket itself loaded (05 §C hygiene).
  - SCR-6 → SCR-3: the answers' labels need the request's item id, so this one is inherent.
  - The status re-read before each write: deliberate (05 §A).
- **Over-fetching:**
  - The approvals inbox reads TKT-3 for up to 10 ticket approvals so its cards can show a subject and requester (capped, `MAX_CARD_TICKET_LOOKUPS`).
  - The task list reads TKT-1 pages to collect embedded tasks; there is no task endpoint (ask A20). It shares its cache with the Tickets tab, so nothing is fetched twice.
  - Counts come from count endpoints or already-loaded data, never a list fetched only for its length. The one exception is the approvals count: APR-1's list, which the inbox shows anyway.

### 1.6 Start-up

Before the first screen paints:
1. The 4.98 MB Hermes bundle loads.
2. **Every module's top-level code runs.** Expo's Metro default is `inlineRequires: false` (`@expo/metro-config/build/ExpoMetroConfig.js:343-347`), and with `experimentalImportSupport` on, `babel-preset-expo` leaves imports to Metro (`index.js:44-51`). So all 2,234 modules evaluate at launch: every screen, the HTML renderer, axios, reanimated and the rest. React Native's own template turns inline requires on.
3. `App.tsx` runs: NativeWind styles, the splash hold, the NetInfo listener, the `QueryClient`, the HTML render engine (`HtmlRenderProvider` at the root).
4. `restoreSession()`: **three SecureStore reads in parallel** (Android Keystore decryption, slow on old phones), behind the native splash.
5. The first screen mounts, its queries start, the skeletons show, and the splash hides on `NavigationContainer.onReady`.

Deferrable until after first paint: the module evaluation in step 2 (§5.1), and possibly the HTML engine (§5.3). Nothing else waits that could.

---

## 2. Changes made, highest impact first

Every change is performance-only. The 533 tests pass unchanged, and no test was edited.

| # | Change | Files | Expected effect (estimate) |
|---|---|---|---|
| 1 | **Ticket detail virtualised.** The screen is one `FlatList`. Everything above the tabs is its header; the open tab's replies, history entries, files and tasks are memoised rows. `initialNumToRender` 6, because the header already fills the first screen and the rest are laid out in idle batches. History and Tasks rows each carry their part of the card's edge, so they still look like one card (the task list's existing pattern). `removeClippedSubviews={false}` keeps the old `ScrollView`'s native handling of the header's text inputs. "Show more" on a reply and a file's long-press details are held by the screen, so a row that leaves the list's window and returns is unchanged. Every row handler is stable (`useStableCallback`), and replies take `privateNotes`/`recipients` as values instead of a new `can` object | `TicketDetailScreen.tsx`, `hooks/useStableCallback.ts` (new) | **The biggest win.** Opening a long ticket lays out about 6 replies instead of all of them: on a 60-reply thread, roughly 1–4 s less blocked UI on a 2016 phone. Taps, refreshes and sheets no longer redraw the conversation |
| 2 | **`HtmlText` memoised, source object stable, long bodies held to the "Show more" threshold until measured.** Before, a long body laid out at full height for a frame and then collapsed, which is a second layout of everything below it. The end state is identical: same threshold (`collapsedHeight` + 40), same "Show more" | `components/HtmlText.tsx` | One layout per long reply instead of two; no visible collapse jump |
| 3 | **Ticket list: stable `toggle`** (same logic, `useStableCallback`), module-level `keyExtractor`, memoised content style | `TicketListScreen.tsx` | In multi-select, one card redraws per tap instead of every visible card (about 7×) |
| 4 | **Notifications:** `NotificationRow` memoised, handlers take the notification (stable) | `NotificationsScreen.tsx` | Mark-read, refresh and badge changes redraw only the rows that changed; the HTML-to-text body is not redone per row |
| 5 | **Approvals inbox:** `ApprovalCard` memoised, stable `onPress(approvalId)` | `ApprovalsInboxScreen.tsx` | Cards redraw only when their approval or its ticket changes |
| 6 | **Knowledge base:** stable `renderItem`s, memoised `ArticleRow`/`SearchRow` | `KnowledgeBaseScreen.tsx` | No row redraws per keystroke |
| 7 | **Task list:** memoised row wrapper, stable `renderItem` | `TaskListScreen.tsx` | `TaskRow`'s memo now holds; no row redraws per keystroke |
| 8 | **Announcements:** `AnnouncementCard` memoised, `onShowOnHome(id)` stable | `AnnouncementCard.tsx`, `AnnouncementsScreen.tsx` | HTML cards redraw only when they change |
| 9 | **Service catalogue:** item counts computed once per item list; `CategoryRow`, `ServiceRow`, `RequestRow` memoised; stable renderers. The two lines the tests pin are unchanged | `ServiceCatalogScreen.tsx` | Search keystrokes no longer redraw or recount every row |
| 10 | **Sheets virtualised:** `OptionSheet` and `PersonPickerSheet` are `FlatList`s, `TemplatePickerSheet` a `SectionList`, all with memoised rows. The first 20 rows render at once, more than a sheet shows, so short lists look exactly as before and long ones never grow on screen. Stable defaults in the person picker | `OptionSheet.tsx`, `PersonPickerSheet.tsx`, `TemplatePickerSheet.tsx` | Long category or group lists open faster; typing in a picker redraws only changed rows; template previews computed once |
| 11 | **Attachment viewer decodes at view size** (`resizeMethod="resize"`) | `ImageViewerModal.tsx` | A 12 MP photo: about 48 MB → about 3.5 MB of bitmap (calculated for a 1080 px-wide view). The viewer has no zoom, so the picture on screen is the same |
| 12 | **Home KPI tile:** the "right now" hint's line is reserved (invisible, hidden from screen readers) while the count loads | `HomeScreen.tsx` | The Active tile's row no longer grows by about 16 dp and pushes the screen down when the data arrives. The skeleton rule "nothing jumps when the data arrives" (`LoadingSkeleton.tsx`) now holds there too |

**Deferred work (Part 2 #4):** no request was moved. Every request on the first screen feeds something visible on it, and they already run in parallel (§1.5). The start-up deferral that would matter is §5.1, which needs a device run.

**Bundle (Part 2 #5):** nothing to replace or drop (§1.4). Before and after: §2.1.

### 2.1 Bundle before and after (measured)

| | Before (`de5c50a`) | After (this change) | Change |
|---|---|---|---|
| Release JS, minified | 3,456.7 KB | 3,461.2 KB | **+4.5 KB (+0.13 %)** |
| gzip | 818.3 KB | 819.7 KB | +1.3 KB |
| Hermes bytecode | 4,977.0 KB | 4,984.5 KB | **+7.5 KB (+0.15 %)** |
| Modules | 2,234 | 2,235 | +1 (`useStableCallback`) |
| Assets | 24 files, 405.2 KB | 24 files, 405.2 KB | none |

- The growth is the memoised row components and their comments: `src/screens` +2.6 KB, `src/components` +1.4 KB, `src/hooks` +0.3 KB.
- The bundle was not the target here: no dependency was removable without changing the UI (§4).
- The wins in this phase are runtime ones: less work per render and per screen open, and less bitmap memory.

---

## 3. Low-end specifics

- **Animations:** already cheap.
  - The only `Animated` use is the skeleton pulse: native driver, no JS per frame (`LoadingSkeleton.tsx:38-51`).
  - Modals fade natively, the drawer runs on Reanimated's UI thread, and there is no `LayoutAnimation` and no JS-driven animation.
  - The pulse is decorative but is the documented loading state (UI-STANDARDS S11), so it stays.
  - Each `Skeleton` on Home's tiles runs its own native loop (≤ 6); sharing one would save almost nothing.
- **Layout thrash:**
  - fixed for long HTML bodies (#2) and the Home KPI hint (#12);
  - skeletons already mirror their layouts;
  - every image has explicit dimensions;
  - the tile count's skeleton box matches the count's line (`h-8` = `text-2xl`'s 32 dp).
  - Remaining: an inline HTML image takes its height when it loads (rare; §4).
- **Bounded memory:**
  - **Rendered views are bounded:** every data list is virtualised; the ticket list keeps about 7 screens of cards (`windowSize` 7, clipped).
  - **Data held is not:** the ticket list keeps every page scrolled through (20 per page), until pull-to-refresh trims it to page 1. **Estimate:** 3–5 KB of JS heap per ticket row, so about 1.5–2.5 MB at 500 rows and 15–25 MB at 5,000.
  - **Not capped:** a cap changes what the user can do (see §4, item 1).
  - Notifications, KB articles, history and My Requests grow the same way, more slowly.
  - Each visited ticket's detail and replies stay cached 5 minutes after leaving it (React Query's default `gcTime`). Shortening that would mean more requests on return, which the network rule forbids.
- **Skeletons appear immediately:**
  - every list and tab shows its skeleton on the first render with no data;
  - there is no delay, timer or `InteractionManager` anywhere;
  - the native splash covers only the session read.

---

## 4. Not fixed, because it would change behaviour or needs a decision

| # | What | Why not now | Proposal |
|---|---|---|---|
| 1 | **Cap the ticket list's rows** (Part 3) — **done in P2, §9.1** | A cap stops the user scrolling past it, and the brief forbids changing what the user can do. Dropping old pages instead (TanStack's `maxPages`) would re-request them when scrolling back up: more traffic on production hardware | If Ronit approves: stop loading at **500 tickets (25 pages)** with a footer "Showing the first 500 — search or filter to narrow" (the footer already says "Showing n of N"). Same for notifications at 500 |
| 2 | Inline HTML images decoded at full size — **done in P2 (expo-image), §9.1** | Needs a custom `img` renderer for `react-native-render-html` | Next candidate: a renderer passing `resizeMethod="resize"`. No visible change; more code to own |
| 3 | The HTML stack is about 340 KB of the bundle | Replacing it changes how every description and reply renders | None |
| 4 | Reanimated is 738 KB | The drawer needs it; another drawer is a different UI | None |
| 5 | Approvals inbox reads up to 10 tickets for its cards | Fewer reads means cards without subject or requester | None (already capped) |
| 6 | Screen transition animations on old GPUs | `animation: 'fade'` or `'none'` changes what the user sees | Decide after a device run |
| 7 | `AttachmentPicker` reads a whole file to learn its size when the picker does not report one (`fetch(uri).blob()`) | Rare; `expo-file-system`'s size lookup could differ on content URIs | Replace after testing on a device |

**Libraries that could help, listed for approval, none installed:**
- `@shopify/flash-list`: list cell recycling, the standard answer for long lists on low-end Android; the ticket list and conversation would benefit most.
- `expo-image`: memory-aware decoding and a disk cache for the attachment viewer.

Neither is needed for this phase's fixes.

---

## 5. Recommended, but needs a device run first

1. **Metro `inlineRequires: true`** — **applied in P2 (§9.1); the device run below still decides whether it stays.** (`metro.config.js`, `transformer.getTransformOptions`). Modules then run on first use, not all at launch.
   - This is React Native's own default, and the largest start-up lever left.
   - **Estimate:** 200–600 ms off a cold start on a 2016 phone.
   - It is not applied because a wrong module order shows up only at runtime, on a device.
   - Test the cold start, sign-in, the drawer, a ticket and the catalogue before keeping it.
2. **`freezeOnBlur: true`** — **applied in P2 (§9.1).** on the stacks, tabs and drawer (react-native-screens). Hidden screens stop re-rendering when the shared cache changes, such as the ticket list under an open ticket after a write. Same reason to test first.
3. **The HTML engine at the root.** `HtmlRenderProvider` builds the render engine on the first render, even on the sign-in screen. Measure its cost with a Hermes profile before moving it.

---

## 6. What Ronit should measure on a real low-end phone, and how

**Phone:** Android 7–8.1 with 1–2 GB RAM (for example a Galaxy J5 2016 or a Moto G4), with developer options on and USB debugging. Compare a preview build of `de5c50a` (before) with this branch (after). Same account and same UAT data. Close other apps first.

| What | How | Where to look |
|---|---|---|
| Cold start | `adb shell am force-stop com.mountmeru.servicedesk`, then `adb shell am start -W -n com.mountmeru.servicedesk/.MainActivity`, 10 times each build | `TotalTime`; also `adb logcat -s ActivityTaskManager` for "Displayed". Compare medians |
| Scrolling | `adb shell dumpsys gfxinfo com.mountmeru.servicedesk reset`, scroll for 10 s, then `adb shell dumpsys gfxinfo com.mountmeru.servicedesk` | "Janky frames" % and the 90th/99th percentile frame time. Do it on: the ticket list; **a ticket with 40+ replies** (open it, then scroll the conversation); Notifications; the knowledge base while typing a search |
| Opening a long ticket | Stopwatch or screen recording from tap to a scrollable screen, on the same 40+ reply ticket | Before vs after: this is change #1 |
| Multi-select | Long-press a ticket, then tap 10 more | Each tap should respond at once (change #3) |
| Memory | `adb shell dumpsys meminfo com.mountmeru.servicedesk` before and after opening a large photo attachment; and after scrolling the ticket list 25 pages | "TOTAL PSS", "Graphics" and "Native Heap". The photo is change #11; the list is §4 item 1 |
| Frame rate while working | A development build: Dev Menu → "Perf Monitor" | UI and JS frame rates while typing in KB search, picking a category, selecting tickets |
| Layout jumps | Watch Home while it loads, and a ticket whose first reply is a long email | The Active tile and the reply should not jump (changes #12, #2) |
| Inline requires (§5.1) | One build with it, one without; repeat the cold start test and walk every screen | Keep it only if nothing breaks and the start-up is faster |

---

## 7. Patterns to follow so this does not regress

- **Server data goes in a `FlashList` (Phase P2), never in `.map()` inside a `ScrollView`.** The only exception is a list hard-bounded at about 20 rows or fewer, and the code says so. Bottom sheets with auto height keep `FlatList` (§9.1).
- **Every FlashList** sets `maintainVisibleContentPosition={NO_SCROLL_ANCHOR}` and, when its rows differ in kind, `getItemType`. State inside a row resets per item with `useRecyclingState` (a recycled cell gets another item); state that must survive scrolling lives in the screen.
- **Every list:**
  - a module-level `keyExtractor` on a stable id;
  - `renderItem` through `useCallback`;
  - rows wrapped in `memo`;
  - no inline arrow or object props on a row. Pass handlers that take the item (`onOpen(item)`), made stable with `useCallback` or `useStableCallback`.
- **State that must survive scrolling** (expanded, open, selected) lives in the screen, keyed by id, not in the row: a virtualised row can unmount.
- **A screen with a header and a list is one `FlatList`** with the header as `ListHeaderComponent`. Do not nest a list in a `ScrollView`. Use `removeClippedSubviews={false}` when that header holds text inputs.
- **Memoise where identity reaches a memoised child or a list, not everywhere.** A plain computation in render is fine.
- **Images:** explicit width and height always; `resizeMethod="resize"` for any network or user image larger than its view. No thumbnails unless the server provides them.
- **HTML only through `HtmlText`.** Never a second renderer; never render server HTML in a loop outside a virtualised list.
- **Skeletons mirror the final layout,** including lines that appear only once data arrives.
- **Network rules are unchanged and still apply:** `staleTime` ≥ 60 s, no polling, `enabled` gates, writes only on a tap.
- **Bundle:** deep-import icon sets and large libraries. Measure before adding a dependency with the release build (`npm run verify:release-bundle` builds the same bundle); the method in §1.4 attributes bytes to packages.

---

## 8. Verification

- `npx tsc --noEmit`: clean.
- `npm test`: **533 / 533** passing. The count is unchanged and no test was edited. The source lines the tests pin (the catalogue's `canOpen` and `onPress`, the delete confirmation, More options) are unchanged.
- Release bundle built twice with the method above: §1.4 and §2.1.
- No EAS build. No network call. The web repo was not opened in this phase.
- Branch `dev`, nothing committed.

---

## 9. Phase P2 (2026-10-23)

Approved by Ronit:
- the ticket list cap;
- Metro `inlineRequires` and `freezeOnBlur`;
- `@shopify/flash-list` and `expo-image`;
- the expo patch updates.

Not approved: transition animations, which are unchanged.

Rules kept from Phase P:
- no polling and no shorter `staleTime`;
- no behaviour or permission change;
- auth flow, `auth.config.ts` and the dev-token screen untouched;
- no EAS build, nothing committed.

**Not run on a device:** every timing below is an estimate. §9.8 lists what to measure.

### 9.1 The approved items, and how each was verified

**Patch versions**
- **Change:** `expo` 57.0.30 → 57.0.31 and `expo-sharing` 57.0.23 → 57.0.24 (`npx expo install --fix`).
- **Verified:** `npx expo install --check` reports "Dependencies are up to date".
- **app.json:** the installer also added `expo-sharing` and `expo-image` to the `app.json` plugins. Both were removed again, because with no options neither does anything on Android:
  - `expo-sharing`'s plugin only adds share-intent filters when `android.enabled` is set;
  - `expo-image`'s plugin only writes an iOS Podfile property.
- `app.json` is byte-identical to `acc04fc`.

**Ticket list cap**
- **Change:** `useTickets` stops at **500 tickets (25 pages)**. The footer reads "Showing the first N of T — search or filter to narrow".
- **Verified:**
  - `getNextPageParam` returns nothing after 25 pages.
  - Each filter, search, sort and country is its own query key, so a filtered list loads normally up to its own 500.
  - Pull-to-refresh still trims to page 1.
- **Side effect:** the task feed reads the same query (`useTaskFeed` → `useTickets`), so "Load 20 more tickets" also stops at 500. Its footer now says so, instead of "All your tickets are loaded".

**`inlineRequires`**
- **Change:** `metro.config.js` wraps Expo's `getTransformOptions` and turns on only `inlineRequires`. NativeWind wraps it and returns its result.
- **Verified:** in the release bundle, requires moved to their use sites.
  - Example: `SwitchRouter` reads `_r(d[0]).BaseRouter` instead of a module-top binding.
  - Require call sites across the bundle went from 5,535 to 11,658.
  - The same code built with the flag off is in §9.3.

**`freezeOnBlur`**
- **Change:** set in `screenOptions` on the drawer, the tabs, the Tickets stack and the four module stacks. The Auth stack is not touched.
- **Verified:**
  - Each navigator passes the option to react-native-screens' `Screen`. That freezes only inactive screens (`activityState === 0`), and its global default is off.
  - The release bundle holds 4 `freezeOnBlur:!0` (baseline: 0).

**FlashList**
- **Change:** 11 lists:
  - ticket list and ticket detail;
  - notifications (sections flattened into heading items; the headings were never sticky);
  - approvals;
  - knowledge base ×2;
  - task list;
  - announcements;
  - service catalogue ×3.
- **Verified:** `tsc` and the 533 tests.
- **Scroll anchoring:**
  - Every list sets `maintainVisibleContentPosition={NO_SCROLL_ANCHOR}` (`components/listDefaults.ts`).
  - FlashList v2 anchors the visible row by default; FlatList never did.
  - So a refresh that adds rows at the top still shows them.
- **Recycling:**
  - `getItemType` is set on the mixed lists (ticket detail rows, alert headings).
  - `HtmlText` resets its measured height, "Show more" and renderer-failure state when a recycled cell gets another body (`useRecyclingState`, keyed on the HTML).
- **Left on FlatList:** `OptionSheet`, `PersonPickerSheet` and `TemplatePickerSheet`. They are short lists in auto-height bottom sheets, where FlashList's `flex: 1` container would collapse to zero.

**expo-image**
- **Change:** `BrandLogo`, `ImageViewerModal`, and inline HTML images through a custom `img` renderer. The renderer keeps the library's own sizing, loading and error states; only the success view changed.
- **Verified:** `tsc`. expo-image decodes at the view's size by default, which replaces `resizeMethod="resize"` and closes §4 item 2.
- **New:** expo-image's memory and disk caches hold opened attachments. They are cleared when the session ends, through an auth-store subscription in `HtmlText.tsx`. The auth flow itself is untouched.

### 9.2 Page-to-page smoothness: what blocked, what changed

**1. HTML bodies** (`components/HtmlText.tsx`, `utils/html.ts`)
- **Why it blocked:**
  - Every body mount ran about 110 full-string regex scans.
  - It **compiled 64 regular expressions** each time.
  - It sanitised twice: once for the renderer, once for the fallback text.
  - This hit every ticket description, reply, KB article and announcement in the first render.
- **Change:**
  - Patterns are compiled once.
  - One sanitiser pass feeds both outputs.
  - Recent results are cached (`prepareHtmlBody`), cleared at sign-out. The cache is bounded at 1,000,000 characters (≈ 2 MB), and bodies over 200,000 characters are never kept.
- **Output proven identical:** 3,058 inputs (hand cases plus 3,000 generated documents), 18,948 comparisons against the original module, 0 differences.

**2. Ticket detail tab bar** (`TicketDetailScreen.tsx`)
- **Why it blocked:**
  - A tab tap re-rendered the whole screen (≈ 100 header nodes plus the row swap) before the highlight moved.
  - The tabs had no pressed state.
- **Change:**
  - The highlight moves on the tap.
  - The content swap runs in `startTransition`, which React can interrupt.
  - A pressed state was added.

**3. Ticket detail header** (`TicketDetailScreen.tsx`)
- **Why it blocked:** `can` and `fields` were new objects on every render. So every render redrew every header card: a sheet opening, the refresh flag, a tab's data arriving, any write in flight.
- **Change:**
  - `can` and `fields` are memoised on the user and the ticket.
  - `HeaderCard`, `StatusActionBar`, `RequesterCard` and `TabBar` are memoised, with stable handlers.

**4. Every long list**
- **Why it blocked:** FlatList created a new cell for every row that scrolled in.
- **Change:** FlashList recycles cells and draws only what is near the screen (§9.1).

**5. Hidden screens**
- **Why it blocked:** the ticket list under an open ticket, the other tabs and the drawer modules re-rendered on every cache write.
- **Change:** `freezeOnBlur` (§9.1).

**6. Ticket list selection** (`TicketListScreen.tsx`)
- **Why it blocked:**
  - The selection reset wrote a new empty set on mount, and again after every filter, sort or search change.
  - The selection is the list's `extraData`, so every visible card redrew.
- **Change:** the same empty set is kept when nothing is selected.

**7. Home announcement banner** (`AnnouncementCard.tsx`)
- **Why it blocked:** about 30 regex passes on every Home render, and Home renders about five times while its queries settle.
- **Change:** the preview is memoised on the body.

**8. Service request form** (`ServiceRequestFormScreen.tsx`, `ServiceFormFieldInput.tsx`)
- **Why it blocked:** each field had an inline `onChange`, so each keystroke redrew every field of the form.
- **Change:** the field component is memoised, with one stable setter per field.

**9. Controls with no pressed state** (38, listed in §9.6)
- **Why it blocked:** a tap gave no feedback until the next screen drew.
- **Change:** `active:` feedback, either opacity or a tint on bordered, dark or red surfaces.

**Found, not changed** (each needs a decision or a larger change):
- **`KbArticleScreen`:** a cached article lays out its whole body during the push. Mounting it after `transitionEnd` would show the skeleton for about 300 ms, which is a visible change.
- **`CreateTicketScreen`:** a keystroke re-renders the whole form, its closed sheets and their option lists. This is controlled-input state, and fixing it means splitting the form state.
- **`PropertiesCard` / `ResolutionSection`:**
  - They still redraw with the screen, because `usePropertyEditing` returns a new object each render.
  - `TicketPropertyEditors.tsx` is pinned by the rbac tests, so memoising it is a medium-risk change.
- **`TicketLinkScreen`:** its spinner shows "Looking up ticket #n…". It is a resolver, not a data screen, so the text stays.
- **Home:** the KPI tiles and recent rows are not memoised. They are cheap next to item 7.
- **`initial: false` navigations to a ticket:** on the Tickets tab's first visit, they also mount the ticket list underneath. Changing that would change how back works.

Every screen already showed its skeleton on the first render; this was checked branch by branch. Nothing waits on a timer.

### 9.3 Bundle (measured, `acc04fc` → this change)

Same method as §1.4: a release `export:embed`, then `hermesc -O`, with bytes attributed from the source map.

| | Before | After | Change |
|---|---|---|---|
| Release JS, minified | 3,463.2 KB | 3,597.3 KB | **+134.1 KB (+3.9 %)** |
| gzip | 820.2 KB | 838.8 KB | +18.6 KB |
| Hermes bytecode | 4,988.0 KB | 5,283.3 KB | **+295.3 KB (+5.9 %)** |
| Modules | 2,229 | 2,293 | +64 |
| Bundled assets | 24 files, 405.2 KB | 24 files, 405.2 KB | none |

**Where the change comes from:**
- **Approved libraries:** `@shopify/flash-list` +80.0 KB, its `tslib` +10.8 KB, `expo-image` +11.1 KB. That is +101.9 KB of the JS growth.
- **App code:** +21.8 KB (screens 15.3, components 3.3, hooks 1.8, utils 0.8, api 0.6).
- **`inlineRequires`, isolated** (the same code built with the flag off):

| | Flag off | Flag on | Change |
|---|---|---|---|
| Release JS | 3,573.2 KB | 3,597.3 KB | +24.1 KB |
| gzip | 850.4 KB | 838.8 KB | −11.6 KB |
| **Hermes bytecode** | 5,155.1 KB | 5,283.3 KB | **+128.2 KB** |

- The extra bytecode is the cost of calling `require` at each use site.
- It buys a cold start that no longer evaluates every module.
- Keep it only if the §6 cold-start test shows the gain.

**Largest packages after** (KB of minified JS):

| Package | KB | | Package | KB |
|---|---|---|---|---|
| react-native-reanimated | 741.5 | | @react-navigation/core | 85.9 |
| react-native | 568.0 | | @shopify/flash-list | 80.0 |
| the app (`src/`) | 427.2 | | axios | 51.1 |
| **react-native-render-html stack** | **388.5** | | @tanstack/query-core | 50.4 |
| react-native-gesture-handler | 104.6 | | @react-native/virtualized-lists | 48.6 |
| expo | 91.4 | | react-native-css-interop | 46.2 |
| react-native-worklets | 90.9 | | react-native-screens | 43.8 |

**react-native-render-html** costs **388.5 KB** of minified JS, 10.8 % of the bundle. That counts the package plus every dependency nothing else uses, worked out from the dependency graph:

| Part | KB |
|---|---|
| `entities` | 86.3 |
| `ramda` | 77.6 |
| the renderer itself | 49.0 |
| `urijs` | 41.4 |
| `@native-html/transient-render-engine` | 35.2 |
| `@native-html/css-processor` | 26.4 |
| `htmlparser2` | 23.1 |
| `domutils`, `css-to-react-native`, `domhandler`, `@jsamr/*`, `dom-serializer` and smaller | 49.5 |

Proportionally, that is about 570 KB of the Hermes file (estimate).

**Replacing it** (not done in this phase) would involve:
- **A small renderer of our own:** `htmlparser2` and `domhandler` (≈ 32 KB) are kept. They map the sanitised element set to nested `Text` and `View`:
  - p, br, b/strong, i/em, u, a;
  - ul/ol/li with numbering;
  - blockquote, h1–h4, pre/code;
  - tables, which email replies use;
  - base64 `img`.
- **Keeping what HtmlText does today:**
  - link routing (ticket deep links, http(s) and mailto only);
  - selectable text;
  - the inline-style allowlist;
  - image sizing;
  - the "Show more" measurement;
  - the plain-text fallback.
- **Regression testing** against real UAT emails. A WebView is not an option (05 §A.6: native views only).
- **Estimate:** 2–4 days. It would save about 350 KB of JS, and the CSS-processing step of every first render.

**Reductions found, not applied** (each needs a decision):
- **The Ionicons font** (380.6 KB, the largest asset):
  - About 60 of its ~1,300 glyphs are used.
  - A subset font through `createIconSet` would be about 25 KB (estimate).
  - This needs a font-subsetting tool, which is not installed.
- **axios → `fetch`** (51.1 KB): React Native already ships `fetch`, so this is duplicate functionality. The change means rewriting the API client.
- **react-native-reanimated** (741.5 KB): the drawer needs it.
- **Unused code:**
  - `makeRedirectUri` and `AUTH_REDIRECT_PATH` are unused in `auth.config.ts`, which is off-limits.
  - Removing them would save nothing, because `expo-auth-session` is needed for sign-in.
  - Nothing else is unused (`tsc --noUnusedLocals`).
- **Whole-library imports:** none cost anything. The 7 `import * as` imports are small single-purpose expo modules, and Metro bundles the same code either way.
- **`assets/brand/meru-mark.png`** (566 × 346, 17.4 KB): expo-image now decodes it at its 44–64 dp display size. A smaller file would save about 6 KB.

**The release-bundle check (`npm run verify:release-bundle`) fails, before and after this phase alike.**
- The developer-token strings are 0 in release, as required. The failure comes from the forbidden-marker and UUID checks.
- **`client_secret` and `clientSecret`:** all 28 occurrences are parameter names inside `expo-auth-session` (`AuthRequest.js`, `TokenRequest.js`). They are code, not a value.
- **UUID-v4 literals:**
  - Two come from `src/config/auth.config.ts`, which holds the Entra tenant and client IDs. These are public identifiers.
  - Two more cannot be attributed through the source map.
- **The counts are identical** in the `acc04fc` baseline. The check has failed since SSO added these; it is not a P2 change.
- **Ronit decides** whether the guard should allow these. RELEASE.md §5 requires the check to pass.

### 9.4 Bounded memory

**Ticket list, and the task feed that reads it**
- **Before:** every page scrolled through was kept, until pull-to-refresh.
- **Now:** at most 500 tickets per filter combination.

**Ticket history pages**
- **Before:** each page cached the whole conversation again (05 B.12), HTML bodies included. Five pages of a 60-reply ticket held five copies.
- **Now:** only the audit entries are kept. Paging reads `page`/`auditPages`, never the items.

**Prepared HTML bodies**
- **Before:** recomputed on every mount.
- **Now:** cached, at most about 2 MB, cleared at sign-out.

**Images**
- **Before:** the attachment viewer downsampled, but inline HTML images and the logo were decoded at full size.
- **Now:** all three go through expo-image and are decoded at view size. Its caches are cleared at sign-out.

**Row views**
- **Before:** FlatList windows.
- **Now:** FlashList recycles a small pool of cells.

**Still unbounded:**
- Notifications (20 per page), knowledge-base articles (20 per page) and My Requests (50 per page) keep every page scrolled through.
- My Requests' pull-to-refresh re-requests **every** loaded page (`ServiceCatalogScreen.tsx`, `list.refetch()`). Every other list refreshes page 1 only.
- Each fix changes what the user sees after scrolling or refreshing, so each needs approval. Proposed: the same 500-row cap, and first-page refresh for My Requests.
- Drawer and tab screens never unmount, so their queries are never garbage-collected. That is by design: `freezeOnBlur` stops their renders, not their data.

### 9.5 Modularity and code health

Reported only. The only changes made are ones that improve performance or remove duplication.

**Changed:**
- **`prepare()` moved from `HtmlText` to `utils/html.ts`**, as `prepareHtmlBody`. This removes the second sanitiser pass, shares the cache, and lets the sign-out wipe reach it.
- **One `NO_SCROLL_ANCHOR`** constant for every list.
- **One `SCREEN_OPTIONS`** object per stack file.

**Not touched** (tidiness only, pinned by tests, or a behaviour decision):
- **Large files:**
  - `TicketDetailScreen.tsx` (≈ 1,000 lines): data and writes, tab rows, the header, and eleven presentational components. The rbac tests read its source.
  - `TicketListScreen.tsx` (≈ 700): multi-select, inline status, bulk pick-up, filters, empty and footer states.
  - `permissions.ts` (483): also holds row de-duplication and request validation. The rbac tests pin it.
  - `service-catalog.ts` (432): filtering, form definition, validation, priority and answers.
  - `TicketPropertyEditors.tsx` (697) does one job, so it is not a candidate.
- **Duplicated:**
  - paged-list de-duplication with first-page refresh (4 hooks);
  - `getNextPageParam` (5 hooks);
  - the load-more guard (3 screens);
  - list footers (4 screens);
  - the pull-to-refresh handler (≈ 12 places);
  - bulk target building (Status and Assign);
  - date-string parsing (tasks and catalogue, with deliberately different year ranges).
- **Inconsistent:**
  - `utils/dialogs.ts` versus raw `Alert.alert` (ticket detail, ticket list, `AttachmentPicker`);
  - `KeyboardAvoidingView style={{…}}` versus `className` for the screen background (6 screens);
  - whole-store `useUiStore()` reads (ticket list, Filters sheet);
  - `?? 'END_USER'` repeated 22 times;
  - first-page versus all-page refresh (§9.4).

### 9.6 Press feedback added (38 controls)

**Text links and retry rows** (opacity 60 %):
- "Show more", "Show it again", "Download and share";
- "Use this device's timezone", "Choose a different status";
- "Back to all categories", "Clear all filters…";
- the list footers' "Tap to retry", the banner Retry, and LookupError Retry.

**Chips and the banner** (opacity 70 %):
- the e-mail and approver chips;
- the ticket card's status chip;
- the KB categories retry chip;
- the reply-all retry box;
- the Home banner.

**Bordered fields** (gray-50 tint):
- `SelectField`;
- the profile country field;
- the catalogue's date field.

**Icon buttons:**
- search and date clear, the task checkbox and the attachment remove button: opacity 60 %;
- the image viewer's Close and Share, and the selection bar's Clear: white 20 %.

**Other:**
- Bulk progress: Stop (red-50) and Done (opacity 80 %).
- Reply-mode tabs: white 60 % when not selected.

**Left without feedback:**
- the three sheet backdrops, because a tap outside closes the sheet;
- the dev-only developer-token button on Login, which is part of the auth flow.

### 9.7 A detail screen could be reused for another record (bug, **fixed 2026-10-23**)

**The cause:**
- React Navigation 7 reuses the **current** route when you navigate to the same route name. In `routers/src/StackRouter.tsx`, NAVIGATE: "If the route matches the current one, then navigate to it".
- The app set no `getId`.

**Effect on tickets:**
- Ticket A's detail could be the top of the Tickets stack while ticket B was opened from Alerts, Home, an approval or a task. B then showed in **A's screen instance**.
- A's local state carried over:
  - the open tab;
  - expanded replies;
  - unsaved impact/urgency;
  - **files staged for upload**, which would then upload to B.

**Effect on approvals:** Alerts opens `ApprovalDetail` from any tab.
- With approval A on top of the Approvals stack, opening B reused A's screen.
- **A's typed comment** went into B's decision.
- The screen shows `found ?? snapshot`. So when B was not in the cached pending list, it kept showing **A**, and Approve or Reject acted on A.

**The fix:** one screen per record, through `getId` on every detail screen that takes an id.

| Screen | Stack | `getId` | Reachable by reuse before the fix? |
|---|---|---|---|
| `TicketDetail` | Tickets | `ticketId` | **Yes** (Alerts, Home, approval, task) |
| `TaskDetail` | Tickets, Tasks | `taskId` | Yes in principle (a task above a task); state is small |
| `ApprovalDetail` | Approvals (the only stack that registers it) | `approvalId` | **Yes** (Alerts) |
| `KbArticle` | Knowledge | `slug` | No: opened only from the article list. Added for consistency |
| `ServiceRequestForm` | Catalog | `itemId` | No: opened only from the catalogue. Added: if it were ever reached, it carries answers into same-named fields of another item (`initialFormValues` + `pickExisting`) |
| `ServiceRequestDetail` | Catalog | `requestId` | No: opened only from My Requests. Added for consistency |

What `getId` changes:
- A different record always gets its own screen.
- Opening a record already in the stack brings that screen, with its own state, to the top, instead of stacking a second copy.
- The task screen's "view ticket" already went back when its ticket was underneath.

**Id-taking screens left without `getId`, on purpose:**
- **The ticket sheets:** `ReplyComposer`, `StatusClosure`, `AssignPicker`, `SubmitApproval` and `TaskEditor` (in both stacks).
  - Each is opened only from the screen beneath it, and nothing navigates to a sheet's name from elsewhere.
  - So none is ever the current route when it is opened again.
- **`TicketLink`:**
  - It is reachable while current: it stays on screen in its error and not-found states, and any HTML ticket link opens it.
  - But it holds no local state: everything comes from `route.params.link` (`useMemo`) and a query keyed by the ticket number.
  - So a reused resolver resolves the new link correctly.

**Verified** on the installed `StackRouter`, with the app's routes and the same `getId` functions:
- **The reported cases:**
  - Without `getId`, opening ticket B or approval B over A put B into **A's route key**.
  - With it, A keeps its screen and B gets a new one.
- **Randomised check:** 2,000 runs of 40 actions per stack (navigate, navigate with `pop`, replace, back; Tickets also the composer and back to the list). It counted how often a detail screen's id changed after it was first shown.

| Stack | Without `getId` | With `getId` |
|---|---|---|
| Tickets | 49,339 | **0** |
| Approvals | 39,271 | **0** |
| Tasks | 39,271 | **0** |
| Knowledge | 39,271 | **0** |
| Catalog (both screens) | 77,570 | **0** |

- **About these numbers:**
  - Every choice was drawn evenly: each id about 20,000 times, each action about 8,900 or 13,300 times, each catalogue screen about 40,000 times.
  - An earlier run, which put "110 vs 0" in this section, used a random generator whose low bits were not random. It barely varied its choices, so its counts were too low. The conclusion (0 with `getId`) was the same.
  - Approvals, Tasks and Knowledge each have one detail screen and share a seed, so their action sequences, and counts, are identical.
- **Inside the screens:**
  - Nothing calls `setParams`, so a screen's id is fixed for its lifetime.
  - **Tickets:** staged files are that screen's state (`newFiles`), and upload sends them to that screen's `route.params.ticketId`.
  - **Approvals:** `snapshot` is set only from the approval matching the screen's `approvalId`, and the comment is that screen's state. The decision sends that screen's approval with that screen's comment.
- **Therefore:**
  - a staged upload cannot reach another ticket;
  - a typed comment cannot reach another approval;
  - Approve or Reject cannot act on a different approval from the one the screen shows.
- `tsc` is clean; 533/533 tests pass.

### 9.8 Measure on a real device (§6 still applies)

**Cold start with and without `inlineRequires`**
- It costs 128 KB of bytecode. Keep it only if start-up is faster and nothing breaks.
- Walk:
  - sign-in;
  - the drawer and every module;
  - a ticket and its tabs;
  - the catalogue;
  - Microsoft sign-in returning to the app.

**FlashList**
- Scroll the ticket list and a ticket with 40+ replies (gfxinfo jank %).
- Pull to refresh the ticket list and Alerts: new rows must appear at the top.
- Scroll a long reply away and back: "Show more" must stay correct.
- The catalogue's empty states must still be centred.

**`freezeOnBlur`**
- After a write on ticket detail, going back must show the ticket list updated.

**Tab switching**
- On a long ticket, the highlight must move at once.

**expo-image**
- The attachment viewer.
- An inline screenshot in a reply.
- Sign out, sign in as someone else, and reopen an attachment: it must load again, not come from cache.

**The task feed**
- At more than 500 tickets: check the footer text.

**Memory** (`dumpsys meminfo`)
- After scrolling 25 pages of tickets.
- After opening five pages of the History tab.
