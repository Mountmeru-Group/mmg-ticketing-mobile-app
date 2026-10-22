# Performance on low-end Android (Phase P, 2026-10-22)

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
| 1 | **Cap the ticket list's rows** (Part 3) | A cap stops the user scrolling past it, and the brief forbids changing what the user can do. Dropping old pages instead (TanStack's `maxPages`) would re-request them when scrolling back up: more traffic on production hardware | If Ronit approves: stop loading at **500 tickets (25 pages)** with a footer "Showing the first 500 — search or filter to narrow" (the footer already says "Showing n of N"). Same for notifications at 500 |
| 2 | Inline HTML images decoded at full size | Needs a custom `img` renderer for `react-native-render-html` | Next candidate: a renderer passing `resizeMethod="resize"`. No visible change; more code to own |
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

1. **Metro `inlineRequires: true`** (`metro.config.js`, `transformer.getTransformOptions`). Modules then run on first use, not all at launch.
   - This is React Native's own default, and the largest start-up lever left.
   - **Estimate:** 200–600 ms off a cold start on a 2016 phone.
   - It is not applied because a wrong module order shows up only at runtime, on a device.
   - Test the cold start, sign-in, the drawer, a ticket and the catalogue before keeping it.
2. **`freezeOnBlur: true`** on the stacks, tabs and drawer (react-native-screens). Hidden screens stop re-rendering when the shared cache changes, such as the ticket list under an open ticket after a write. Same reason to test first.
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

- **Server data goes in a `FlatList` or `SectionList`, never in `.map()` inside a `ScrollView`.** The only exception is a list hard-bounded at about 20 rows or fewer, and the code says so.
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
