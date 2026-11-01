# Performance on low-end Android (Phase P, 2026-10-22; Phase P2 and Phase A1, 2026-10-23)

> **Phase P2** applied the approved items of §4 and §5 (ticket list cap, inline requires, `freezeOnBlur`, FlashList,
> expo-image) and a transition-smoothness pass. §9 records it; §1–§8 are the Phase P baseline, kept as written.
>
> **Phase A1** added motion: four of the five approved animations, and two empty-state illustrations. §10 records
> what was built, what was skipped, the bundle cost and what to watch on a device. §3's line on the skeleton pulse is
> the Phase P state; §10 replaces it.
>
> **2026-10-29:** a third bundle pass, alongside the KB/announcements ADMIN-only change and the Home greeting. §11 has
> the measurement and the per-package attribution, including `react-native-render-html`'s exact cost. **Little was
> left to gain safely, and no bundle reduction was applied.** The release bundle grew by 2.7 KB of Hermes bytecode
> (+0.05 %).
>
> **2026-10-30:** the login's "arc split" layout and a four-stage motion sequence (start-up, sign-in, return to Home).
> §12 records it. **Bundle +22.1 KB of Hermes (+0.42 %), no JavaScript per frame, but the start-up intro adds up to
> about 1.1 s before the first screen on a cold start** (§12.2): that is the item to weigh.

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

---

## 10. Phase A1 — motion (2026-10-23)

Approved by Ronit: five animations and two illustrations, built only if each runs on the native driver, animates only
transform and opacity, never blocks a press, respects "reduce motion" and adds no library.

| # | Item | Result |
|---|---|---|
| 1 | Skeleton shimmer | **Built** (§10.2) |
| 2 | Staggered list entry | **Built, as a stagger** (§10.3). It does not fight FlashList's recycling, so the single-fade fallback was not needed |
| 3 | Status change feedback | **Built** (§10.4) |
| 4 | Pull-to-refresh droplet | **Skipped**: Android's refresh control cannot show a custom indicator (§10.5). The default brand-red spinner stays |
| 5 | Empty-state illustrations | **Built**: two flat SVGs (§10.6) |

Rules kept:
- No library added. `react-native-svg` is not installed, so the SVGs are drawn by `expo-image` (approved in P2).
- No behaviour, permission, business rule, API call or navigation change.
- Screen transitions unchanged.
- Auth flow, `auth.config.ts` and the dev-token screen untouched.
- No EAS build; nothing committed.

**Not run on a device:** there was no build in this phase. Frame rates are not measured; §10.9 says what to check.

### 10.1 The rules, and how each was verified

All motion values are in **`src/theme/motion.ts`**: durations, distances, the scale peak, the band width and opacities,
row limits and curves. No component holds a motion number of its own.

| Animation | File | Driver | What is animated | JS per frame | Stops |
|---|---|---|---|---|---|
| Skeleton shimmer | `components/Shimmer.tsx` | native, one looping timing per skeleton | the band's `translateX` | none | when the skeleton unmounts |
| List entry | `components/ListEntry.tsx` | native, **one** timing per list appearance | each animated row's `opacity` and `translateY` | none, and no timers | when the list's scope unmounts |
| Status change | `components/StatusBadge.tsx` | native, one timing per change | the badge's `scale`, the old pill's `opacity` | none | on unmount, or when a recycled cell gets another record |

**Native driver.**
- Source: `src/` has exactly three `Animated.timing` calls (`Shimmer.tsx:24`, `ListEntry.tsx:57`, `StatusBadge.tsx:55`), each with `useNativeDriver: true`.
- Release bundle: each `useNativeDriver` literal was traced to its source through the source map.
  - Before: the app's two were the old pulse (`LoadingSkeleton.tsx`).
  - After: the app's three are the files above, all `true`.
  - The only `false` literals are two React Native defaults (`AnimatedImplementation.js:442`, `AnimatedEvent.js:160`), unchanged.
- No `LayoutAnimation`, no Reanimated import, no JS-driven animation anywhere in `src/`.

**Transform and opacity only.**
- Every value bound to an animated node is `opacity` or a `transform` (`translateX`, `translateY`, `scale`), read file by file.
- The animated views' other styles are static, from `StyleSheet`: the band's absolute position and width, the old pill's absolute position, the badge's `alignSelf`.
- React Native's native driver also checks this at run time: it rejects any style it cannot animate natively.

**No JavaScript per frame.**
- A native-driven timing sends its frames to native once, at start.
- `Animated.loop` of a single native timing hands the whole loop to native (`AnimatedImplementation.js:488-489`), so the shimmer never returns to JS.
- The old pulse was `loop(sequence(…))`. A sequence cannot loop natively (`:357-358`), so JS restarted it every 1.4 s. That is gone.
- The list stagger uses no `delay`: Animated's `delay` is a JS `setTimeout` (`TimingAnimation.js:136-137`), which a busy JS thread fires late. The stagger is in each row's interpolation ranges on one shared timeline instead.
- Native interpolation cannot take an easing function (`NativeAnimatedValidation.js:22-30`), so the entry curve is 8 straight segments sampled from it, at row mount.

**Never blocks a press.**
- No handler waits for an animation, and no `pointerEvents` change gates a touch.
- An entering row can be tapped while it fades in.
- The shimmer band is `pointerEvents="none"`.
- The badge's animation runs after the status has already changed.

**Reduce motion** (`hooks/useReduceMotion.ts`):
- React Native reports Android's "Remove animations" (or animator scale 0) as reduce motion. The app holds one listener for its lifetime.
- Shimmer: no band; the grey bars are the end state. It reacts to a change while showing.
- List entry: rows render without a wrapper, at full opacity.
- Status badge: the new pill shows at once.
- Until the first answer (a few ms after start-up), motion counts as allowed.

**Cleanup.** Every timing is stopped in an effect cleanup. The list scope stops every timing it started when it unmounts.

### 10.2 Skeleton shimmer

- **One shared component, `Shimmer`,** used by `LoadingSkeleton` (every variant, so every skeleton in the app) and by `Skeleton` (Home's tile counts). No screen changed for it.
- **How it looks:**
  - A 96 dp band of five white strips (opacity 0.12 → 0.45 → 0.12) sweeps from off the left edge to off the right edge in 1.4 s, then repeats.
  - It is drawn once, over the whole skeleton. On the white cards it is invisible, so it shows only where it crosses the grey bars. The bars are static grey; the old opacity pulse is removed.
- **Cost per skeleton:**
  - One looping native animation, as before.
  - One band view with five strip views (+6 views).
  - The travel distance is the window width (`useWindowDimensions`), so no layout measurement is needed.
- **A skeleton on a hidden screen** (frozen by `freezeOnBlur`) keeps its native loop running until the data arrives, as the pulse did. It costs one transform update per frame, and no JavaScript.

### 10.3 Staggered list entry

- **Where:** the ten data lists:
  - tickets, Alerts, approvals;
  - knowledge base (articles and search);
  - tasks, announcements;
  - the catalogue's categories, services and My Requests.
- **Not used:** ticket detail's tabs, Home's recent tickets, the bottom sheets.
- **How it looks:**
  - When a list first shows its data, rows 0–7 fade in (opacity 0 → 1) and rise 10 dp, in 340 ms each, starting 70 ms apart.
  - The last animated row is in place 830 ms after the first starts.
  - Rows 8 and later, rows from the next page (index 20 or later), and rows added later by a refresh or a search appear at once.
- **How:**
  - Each screen wraps its content in `ListEntryScope` (no view) and each row in `ListEntry`.
  - The first row to mount starts one native timing for the list. Every animated row is two native interpolations of it.
  - When the scope has no rows left (the list made way for a skeleton, an error or an empty state), the next rows to mount are a new appearance and enter again. For example: a new filter that loads, or a new search term.

**FlashList recycling, checked against its source** (`recyclerview/RenderStackManager.js`):
- FlashList v2 recycles a cell by re-rendering the same component with another item, and keeps a cell on the same item across data changes (by `keyExtractor`).
- `ListEntry` decides once, when its cell first mounts, whether to animate. That decision never changes for the cell's life.
- So:
  - a recycled cell never replays the entry: its values are already at the end;
  - a cell's element type never changes, so recycling never remounts a row. Cells that do not animate get no wrapper at all;
  - a cell recycled during the first 830 ms finishes its entry with the new item. This happens only on a fling in that window, and is at worst a short fade.

**Cost:**
- During the entry: at most 8 wrapper views and one native timing per list.
- After it: nothing runs. A finished wrapper is a plain view, at opacity 1.
- No timers: the timing starts from the first row's mount effect, straight after the list's first commit. Until then
  the first rows sit at opacity 0, so a JS thread still busy with that commit is the only thing that can delay them.

### 10.4 Status change feedback

- `StatusBadge` takes the record's id (`recordId`). All ten call sites pass the ticket's or request's id.
- **When the same record's status changes:**
  - the badge scales 1 → 1.14 → 1;
  - the old pill fades out over the new one, so the colour crossfades.
  - Both run on one native timing of 280 ms.
- **Never animates:**
  - on first render;
  - on a re-render with the same status;
  - without `recordId`;
  - when a FlashList cell is recycled for another ticket (the id changes; any change in flight is dropped).
- **At rest the pill is the same plain view as before.** The animated layers exist only during the 280 ms, so the ticket list's cards cost nothing extra.
- **Seen on:**
  - the ticket list after an inline status change or a refresh;
  - the ticket header when returning from the status sheet;
  - Home's recent tickets, task detail, approval detail;
  - the catalogue's requests.
- **During the 280 ms** the old pill sits over the new one at its own width, so a longer old label briefly overlaps the next badge while it fades.

### 10.5 Pull-to-refresh droplet: skipped

- **Why:** React Native's Android `RefreshControl` is the platform's `SwipeRefreshLayout`.
  - Its props are only `enabled`, `colors`, `progressBackgroundColor`, `size`, `refreshing` and `progressViewOffset` (`SwipeRefreshLayoutManager.kt:44-105`).
  - It cannot show a custom view.
  - It does not report how far the user has pulled.
- **The two ways round it, both rejected:**
  - **Hide the spinner and overlay a droplet** only while refreshing. The pull itself would show nothing, which feels broken, and the spinner's elevated circle may still show its shadow (not checked on a device).
  - **Build our own pull gesture.** That means a pan gesture over every list, competing with FlashList's scrolling and the drawer's edge swipe, and moving the list content. That is the kind of JS-thread gesture work this phase must not add.
- **Kept:** the default spinner in brand red, unchanged on every refresh surface.

### 10.6 Empty-state illustrations

- **Two flat SVGs**, 160 × 120 in `assets/illustrations/`, about 1.1 KB each, shown at 128 × 96 dp:
  - **`empty`** (`nothing-here.svg`): an empty tray under the yellow Meru drop. Used on empty or no-match lists:
    - tickets (all five empty states);
    - tasks, knowledge base (×3), announcements;
    - catalogue categories and services, My Requests.
  - **`clear`** (`all-clear.svg`): the Meru drop with a tick. Used on Approvals ("Nothing waiting for you", "Nothing of this type") and Alerts ("No notifications").
- **Colours:** only `src/theme/colors.ts` tokens, listed in each file's comment:
  - gray-100, gray-200, gray-300, white;
  - brand yellow (`secondary`), brand red (`primary`), `secondaryForeground`.
- **Style:** no gradient, no shadow, no animation.
- **Text unchanged:** headlines, messages and actions are exactly as they were. `EmptyState` takes `illustration` in place of `icon`.
- **Kept their icon:** offline, no access, not found, "Keep typing", "Too many tickets", ticket-detail tabs and Home's recent tickets. These are not empty list screens.
- **How they draw:**
  - expo-image's Android side decodes SVG (AndroidSVG, on Glide's background thread) into a `PictureDrawable`, a vector recording drawn at the view's size.
  - It holds no bitmap, and no SVG library is bundled.
  - It loads asynchronously, so on a slow phone the art may appear a frame or two after the text. Its box is fixed, so nothing moves when it does.
- **In a release build** each SVG ships as a raw resource (`raw/assets_illustrations_*.svg`). expo-image resolves raw resources by name (`ResourceIdHelper.kt`).

### 10.7 Bundle (measured, `4d3784b` → this change)

Same method as §1.4 and §9.3: a release `export:embed`, then `hermesc -O`, with bytes attributed through the source map.

| | Before | After | Change |
|---|---|---|---|
| Release JS, minified | 3,597.6 KB | 3,605.1 KB | **+7.5 KB (+0.21 %)** |
| gzip | 838.9 KB | 841.0 KB | +2.1 KB |
| Hermes bytecode | 5,284.0 KB | 5,296.7 KB | **+12.8 KB (+0.24 %)** (13,074 bytes) |
| Modules | 2,293 | 2,299 | +6 (4 source files, 2 SVG asset entries) |
| Bundled assets | 24 files, 405.2 KB | 26 files, 407.4 KB | +2 SVGs (2.1 KB), and 73 bytes in the resource keep list |

- **No library code changed.** Every byte of growth is app code (+6.1 KB mapped to source) or module wrappers (about 1.5 KB):
  - `ListEntry` 1.4 KB;
  - `StatusBadge` +1.1 KB;
  - `Shimmer` 1.0 KB;
  - `useReduceMotion` 0.4 KB, `motion.ts` 0.4 KB;
  - the two SVG asset entries 0.4 KB;
  - the screens' wrappers and `recordId` props about 1.0 KB;
  - the three index files 0.5 KB, `EmptyState` 0.2 KB;
  - `LoadingSkeleton` −0.5 KB (the pulse removed).
- **Verdict:** not meaningful weight. The cost of this phase, if any, is at run time, on the GPU, during the animations themselves (§10.9).

### 10.8 Patterns to follow

- **Motion values go in `src/theme/motion.ts`,** never in a component.
- **`Animated` with `useNativeDriver: true`,** and only `opacity` and `transform`. Never `width`, `height`, `margin`, `padding`, `top`, `left` or `LayoutAnimation`.
- **No `delay`:** it is a JS timer. Put the offset in the interpolation or the easing.
- **No `Animated.sequence` or `parallel` inside a loop:** they cannot loop natively. Loop a single timing and shape it with an interpolation.
- **Check `useReduceMotion()` or `reduceMotionEnabled()`** and show the end state when it is on.
- **Stop every animation in an effect cleanup.**
- **In a FlashList row:**
  - decide on any animation once per cell mount;
  - key anything that compares old and new values on the record's id, because a recycled cell gets another record.
- **New loading states use `LoadingSkeleton` or `Skeleton`** (they shimmer). New empty lists use `EmptyState illustration`.

### 10.9 What Ronit should watch on a real low-end phone

Use the same phone and method as §6. Turn on Developer options → **Profile HWUI rendering → On screen as bars**, or
use `dumpsys gfxinfo`.

1. **Shimmer.** Open Tickets, Alerts and the knowledge base on a slow network.
   - The band should glide, with no stepping. The bars stay under the 16 ms line.
   - It is a 96 dp translucent band moving over the skeleton: pure GPU blending, and the first thing to drop frames if the GPU is weak.
   - **If it stutters:** set `motion.shimmer.bandOpacities` to three strips, or narrow `bandWidth`.
2. **List entry on the first load** of the ticket list and Alerts.
   - Rows should cascade in under a second. The first row must start moving as the skeleton disappears, with no blank pause.
   - Fling straight away: nothing should look held back.
   - **If it feels slow:** lower `motion.listEntry.stagger` or `maxRows`. Raise `maxRows` if, on a tall phone, row 9 appears before row 8 has finished.
   - **On the task list,** rows share one card. During the entry the card's rows separate by up to 10 dp for a moment. Check that this reads as intended.
3. **Status change.** Change a status from the ticket list's chip, and from the ticket screen.
   - The badge should pulse once, crossfade, and settle.
   - Scroll the list fast afterwards: no badge may pulse while scrolling.
4. **Scrolling.** `gfxinfo` jank % on the ticket list, against the P2 build.
   - Rows past the first screen carry no animation, so the numbers should match.
5. **Remove animations.** Settings → Accessibility → Remove animations (or animator scale off) → reopen the app.
   - No band, no row entry, no badge pulse. Every end state must show at once.
6. **Illustrations.** Empty Approvals, empty Alerts, a ticket search with no match.
   - The art should be sharp at the phone's density, not blurry.
   - **It must appear in a release build:** raw-resource SVG loading has not been run on a device.
   - If it is missing, the text and action still show.
7. **Battery while waiting.** A skeleton left on screen (offline first load shows the offline state, not a skeleton, so use a very slow network). Its loop runs only while it shows, as the pulse did.

### 10.10 Verification

- `npx tsc --noEmit`: clean. With `--noUnusedLocals --noUnusedParameters`, nothing reported in any file this phase touched.
- `npm test`: **533 / 533** passing. The count is unchanged and no test was edited. The source lines the rbac tests pin are unchanged.
- Release bundle built twice with the method above (§10.7). The native-driver trace is in §10.1.
- The two illustrations were rendered in a desktop browser at 2× to check the drawing. That is not the phone's renderer: see §10.9 item 6.
- No EAS build. No network call to the backend. The web repo was not opened.
- Branch `dev`, nothing committed.

---

## 11. Third bundle pass (2026-10-29)

Done alongside two other changes: Knowledge base and Announcements became ADMIN only (`docs/ROLE-MATRIX.md` §16), and
Home greets by time of day (`docs/brand/UI-STANDARDS.md` §9).

**Rules kept:**
- no library added or replaced (`react-native-render-html`: report only);
- no polling, no shorter `staleTime`;
- no navigation-structure or transition change;
- auth flow, `auth.config.ts` and the dev-token screen untouched;
- no EAS build, nothing committed.

**How it was measured.** The same method as §1.4, §9.3 and §10.7:
- a release `expo export:embed` (`--dev false --minify true`, `EXPO_PUBLIC_APP_ENV=UAT`), then the project's `hermesc -O`;
- into a scratch folder outside the repo;
- with bytes attributed to packages through the source map.

Two numbers below are new, and both are measured, not estimated:
- **A package's exclusive cost** is every module reachable only through it in the bundle's dependency graph. It is counted as whole modules, including each module's `__d(…)` wrapper and data modules the source map does not attribute.
- **Its Hermes cost** is measured directly: the release bundle is recompiled with exactly those modules emptied, and the two `.hbc` files are compared.

### 11.1 Before and after

| | Before (`c84d53a`) | After (this change) | Change |
|---|---|---|---|
| Release JS, minified | 3,609.6 KB | 3,610.7 KB | **+1.1 KB (+0.03 %)** |
| gzip | 842.2 KB | 842.4 KB | +0.2 KB |
| Hermes bytecode (what ships) | 5,304.9 KB | 5,307.6 KB | **+2.7 KB (+0.05 %)** (2,772 bytes) |
| Modules | 2,300 | 2,301 | +1 (`utils/greeting.ts`) |
| Bundled assets | 26 files, 407.4 KB | 26 files, 407.4 KB | none |

- **No library code changed.** The whole difference is app code:
  - `utils/greeting.ts` +0.5 KB;
  - `utils/permissions.ts` +0.4 KB (the two rules and `drawerRoutes`);
  - `HomeScreen` +0.3 KB;
  - `useAnnouncements` +0.05 KB;
  - `AppDrawer` −0.2 KB (the table replaced seven JSX screens).
- **The ADMIN-only change removes no bytes.** ADMIN still uses every KB and announcements file, so all of it ships. It costs 22.6 KB of JS, 0.6 % (39.1 KB of Hermes), across 9 modules: `KnowledgeBaseScreen` 7.4, `KbArticleScreen` 4.1, `AnnouncementCard` 3.8, `useKnowledgeBase` 3.6, `AnnouncementsScreen` 1.8 and four small files.
- **What it does save is at run time, for the other four personas:**
  - **One request fewer on Home's first paint:** ANN-1 is no longer requested for END_USER, AGENT, triage AGENT or L2_MANAGER, or refreshed on pull-to-refresh. Home's parallel reads drop from five to four. This also lightens UAT, which shares its hardware with production.
  - **No banner work:** no announcement banner is laid out, and no HTML-to-text pass is run on its body.

### 11.2 Can the KB and announcements code load on demand? It already does

Checked in the release bundle:
- With `inlineRequires` (P2), each module is required at its use site.
- **`KnowledgeBaseScreen` and `KbArticleScreen`** are required only inside `KnowledgeStack()`'s body. That function first runs when the Knowledge route first mounts (drawer screens are lazy).
  - For ADMIN: on the first visit to the Knowledge base.
  - For every other role: **never**, because the route is not registered.
- **`AnnouncementsScreen`'s module** is required when the drawer's module first runs, after sign-in, never on Login. That is the same moment as before: its `component={…}` was evaluated on the drawer's first render.
  - Running that module only defines one component function.
  - Its imports (FlashList, `AnnouncementCard`, `HtmlText`…) are inline. They run only when the screen renders: for ADMIN on first open, for anyone else never.
- Code splitting into separate files is not available here. Metro builds one bundle for Hermes; Hermes memory-maps the file and only touches what runs.
- **Nothing to change.**

### 11.3 Where the bytes are now

**Largest packages** (KB of minified JS, attributed through the source map, after this change):

| Package | KB | | Package | KB |
|---|---|---|---|---|
| react-native-reanimated | 741.5 | | @shopify/flash-list | 80.0 |
| react-native | 568.0 | | ramda (render-html) | 77.6 |
| **the app (`src/`)** | **437.0** | | axios | 51.1 |
| module wrappers and unmapped data | 107.9 | | @tanstack/query-core | 50.4 |
| react-native-gesture-handler | 104.6 | | react-native-render-html | 49.0 |
| expo | 91.4 | | @react-native/virtualized-lists | 48.6 |
| react-native-worklets | 90.9 | | react-native-css-interop | 46.2 |
| entities (render-html) | 86.3 | | react-native-screens | 43.8 |
| @react-navigation/core | 85.9 | | urijs (render-html) | 41.4 |

The app's 437.0 KB: screens 215.2, components 63.0, hooks 50.0, utils 47.1, api 33.5, navigation 13.4, theme 5.8, types 4.4, store 2.9, config 1.7.

### 11.4 `react-native-render-html`: its exact cost (report only, not replaced)

| | Minified JS | Hermes bytecode |
|---|---|---|
| **The renderer and every module only it pulls in** (571 modules) | **486.7 KB, 13.5 %** | **665.7 KB, 12.5 %** |
| What a replacement that keeps `htmlparser2` and `domhandler` would save (542 modules) | 314.7 KB, 8.7 % | 443.3 KB, 8.4 % |

**The 486.7 KB, by package:**

| Part | KB |
|---|---|
| `ramda` | 94.1 |
| `entities` | 86.6 |
| data modules the source map does not attribute: 37.1 are `entities`' tables (they stay with `htmlparser2`), 8.2 the renderer's own | 45.3 |
| the renderer itself | 66.9 |
| `urijs` | 42.3 |
| `@native-html/transient-render-engine` | 38.5 |
| `@native-html/css-processor` | 30.5 |
| `htmlparser2` | 23.3 |
| `domutils`, `@jsamr/counter-style` | 9.9 each |
| `css-to-react-native` 9.2, `domhandler` 8.7, `dom-serializer` 5.8, `postcss-value-parser` 4.9, `@jsamr/react-native-li` 4.8, six smaller | 39.5 |

**Why §9.3 said 388.5 KB.** That figure counted only the bytes the source map attributes to each package. This one counts whole modules: each module's wrapper, and the entity tables the map leaves unattributed. §9.3's Hermes figure (about 570 KB) was a proportional estimate; 665.7 KB is measured.

**What replacing it would involve.** §9.3's plan still holds, with one correction:
- **Keeping `htmlparser2` and `domhandler` also keeps `entities`, `domutils` and `dom-serializer`,** since the parser needs them. The saving is therefore **314.7 KB of JS and 443.3 KB of Hermes**, not the whole 486.7 KB.
- **To save it all,** the renderer would need its own tokenizer for the sanitised element set, and its own entity decoding.
- **`htmlparser2` would become a direct dependency.** Today it is only a dependency of the renderer.
- **The work, as §9.3 lists it:**
  - a small renderer mapping the sanitised element set to nested `Text` and `View`;
  - keeping link routing, selectable text, the style allowlist, image sizing through expo-image, the "Show more" measurement and the plain-text fallback;
  - regression testing against real UAT emails (no WebView: 05 §A.6).
- **Estimate:** 2–4 days. It is the only large reduction left in the bundle.

### 11.5 What else was checked

| Candidate | Finding | Applied? |
|---|---|---|
| Unused code, now that two screens are ADMIN only | None: ADMIN uses all of it (§11.1). `src/screens/PlaceholderScreen.tsx` is still imported by nothing and is not in the bundle (§1.4) | No: nothing to remove |
| Whole-library imports | 7 `import * as`, all small single-purpose expo modules (`expo-secure-store` ×2, `expo-auth-session`, `expo-document-picker`, `expo-image-picker`, `expo-sharing`, `expo-splash-screen`). Metro does not tree-shake, so a named import bundles the same code. Ionicons is already a deep import. `expo-file-system` (20.1 KB) is a named import from its root; the three classes used (`File`, `Directory`, `Paths`) are most of that entry | No: no saving |
| `semver` (18.6 KB JS, **36.2 KB Hermes**, measured) | Pulled in at run time by NativeWind's `react-native-css-interop` (`css-to-rn/feature-flags.js`). It compares React Native's version with "<0.75" and "<0.74" | **No.** Only a Metro resolver alias to a hand-written stand-in could remove it, and every `className` in the app goes through that runtime. A mistake there breaks styling app-wide, and only a device run would show it. 0.7 % is not worth that risk |
| Drift specs (`src/api/responseSpecs.ts`, 9.6 KB JS, at most **7.5 KB Hermes**, measured) | `checkFields()` returns at once unless `__DEV__`, so in release the specs are built and never read | **No.** Wrapping each of 36 specs in `__DEV__ ? […] : []` would let the minifier drop them. It is safe, but saves 0.14 % at the cost of a rule every new spec must follow. Ronit can approve it in one line |
| Barrel files (`hooks/index.ts` 7.6 KB, `components/index.ts` 4.5 KB) | The cost of re-export getters | No: rewriting about 70 imports to save about 12 KB |
| Assets | The Ionicons font is 380.6 KB of the 407.4 KB (§9.3: about 60 of ~1,300 glyphs used). The brand mark is 17.4 KB, decoded at view size by expo-image. Launcher and splash PNGs are 4.5–57 KB and are not in the JS bundle | No: subsetting the font needs a font tool that is not installed, and replacing the icon set is a UI change |
| Work blocking a first paint | Home: for non-ADMIN roles one request and the banner's text pass are gone (§11.1). Already reported and unchanged: `HtmlRenderProvider` builds its engine at the root, before Login (§5.3, needs a Hermes profile); `KbArticleScreen` lays out a cached body during the push, now ADMIN only (§9.2) | Only the Part 1 effect |

**Verdict.** After P, P2 and A1, the bundle has no safe saving left that is worth having. The one large lever is replacing `react-native-render-html` (443–666 KB of Hermes), which needs approval and 2–4 days. Everything else measured is under 1 % each and carries either risk or churn. This pass added 2.7 KB.

### 11.6 Verification

- `npx tsc --noEmit`: clean.
- `npm test`: **661 / 661** passing (593 before; +56 in `tests/rbac/kb-announcements.test.mjs`, +12 in `tests/home/greeting.test.mjs`). Thirteen existing cases changed because of the ADMIN-only decision; why each one changed is in `docs/ROLE-MATRIX.md` §16.6.
- Release bundle built twice with the method above (§11.1); the navigator modules were read in the release output (§11.2).
- No EAS build. No call to the backend. The web repo was not opened.
- Branch `dev`, nothing committed.

---

## 12. Login "arc split" and the motion sequence (2026-10-30)

Approved by Ronit: the login redesign (`docs/brand/UI-STANDARDS.md` §10) and four motion stages, under the same rules as
Phase A1 (§10.1): native driver; transform and opacity only; never blocking a press; no animation library; skipped
under "Remove animations"; stopped on unmount; every value in `src/theme/motion.ts`.

| Stage | What | Result |
|---|---|---|
| 1 | App open: on white, the yellow drop falls in and settles | **Built** (§12.2). Needed a new native splash image: the drop alone |
| 2 | The full logo resolves, "Setu" fades up over a yellow rule, hand-off to the first screen | **Built** (§12.2) |
| 3 | Sign-in pressed: the pill collapses to a spinning circle, "Opening Microsoft…" | **Built** (§12.3) |
| 4 | Home lays out as skeletons; the shimmer sweeps yellow; tiles fill without a jump | **Built** (§12.4). Home already did the first; one tile fix for large text |

Nothing in the brief was skipped. Deviations, each explained where it is described:
- the native splash image changed (§12.2);
- two colours are paler than the design's words, for WCAG AA (UI-STANDARDS §10.2);
- "Opening Microsoft…" stays up while the sign-in completes after Microsoft (§12.3).

Rules kept:
- No library added: React Native's `Animated` only (Reanimated is installed but not used for this).
- No change to the auth flow, `auth.config.ts`, the redirect URI, screen transitions, the navigation structure or any
  permission.
- No EAS build; nothing committed.

**Not run on a device:** there was no build. Frame rates and start-up times are not measured; §12.6 says what to
check. Everything marked **estimate** is arithmetic.

### 12.1 The rules, and how each was verified

| Animation | File | Driver | What is animated | JS per frame | Stops |
|---|---|---|---|---|---|
| Start-up intro | `navigation/SplashIntro.tsx` | native: one 900 ms timeline, then one 220 ms fade | the drop's `translateY`; the logo's `opacity`; the rule's `scaleX`; "Setu"'s `opacity` and `translateY`; the whole intro's `opacity` | none | on unmount, and when its phase moves on |
| Sign-in collapse | `screens/auth/SignInButton.tsx` | native: one 240 ms timing per press, and per return | the half-circles' `translateX`; the middle's `scaleX`; the label's, ring's and caption's `opacity`; the caption's `translateY` | none | on unmount |
| Sign-in arc | same | native: `Animated.loop` of one timing (900 ms a turn) | the arc's `rotate` | none: a loop of one native timing runs entirely on the UI thread (§10.1) | when the attempt ends, or Login unmounts (signed in) |
| Shimmer | `components/Shimmer.tsx` | unchanged (§10.2) | unchanged: the band's `translateX`. Only its colour and opacities changed | none | unchanged |

**Native driver, verified three ways.**
- **Source:** `src/` has seven `Animated.timing` calls, each with `useNativeDriver: true`: the three from §10.1, plus
  `SplashIntro.tsx` ×2 and `SignInButton.tsx` ×2.
- **Release bundle:** every `useNativeDriver` literal in the release JS was traced to its source through the source map.
  - Before (`4063df3`): three app literals, all `!0` (true): `ListEntry.tsx:57`, `Shimmer.tsx:24`, `StatusBadge.tsx:55`.
  - After: seven, all `!0`: those three (Shimmer now line 25) plus `SplashIntro.tsx:88` (timeline) and `:98` (hand-off),
    `SignInButton.tsx:60` (collapse) and `:79` (arc).
  - The 18 library literals are identical before and after. The only `!1` are React Native's two defaults
    (`AnimatedImplementation.js:442`, `AnimatedEvent.js:160`), as in §10.1.
  - No `LayoutAnimation` traces to `src/`.
- **Test:** `tests/motion/start-up-and-login.test.mjs` fails on any `useNativeDriver: false` anywhere in `src/`, on any
  `Animated.timing` without `useNativeDriver: true`, and on `LayoutAnimation`, a Reanimated import, `spring`, `decay`,
  `sequence`, `parallel`, `stagger` or `delay`.

**Transform and opacity only, verified two ways.**
- **Read file by file:** the five animating files bind animated values only to `opacity`, `translateX`, `translateY`,
  `scaleX`, `scale` and `rotate`. The animated views' other styles (positions, sizes, borders) are static `StyleSheet`
  values. The native driver also rejects anything it cannot animate natively, at run time.
- **Test:** it reads every interpolation in the five files and fails unless each lands on one of those keys (directly,
  or through a shared progress value that does). It also fails if any layout property (`width`, `height`, `top`,
  `left`, `margin…`, `padding…`, `flex…`, `borderWidth`…) is bound to an animated value.
- **The checks were tested by breaking them.** Seven deliberate violations were made one at a time, the suite run, and
  each file restored byte for byte (hash compared). Every one failed the suite:
  - an animated `width` on the button;
  - an animated `height` through the intro's helper;
  - `useNativeDriver: false` in the shimmer;
  - the button ignoring "Remove animations";
  - the environment label rendered outside its gate;
  - the chip turned on for production;
  - the native splash never hidden.

**How the collapse avoids an animated width.** The pill is drawn as three pieces behind its content: a left
half-circle, a straight middle and a right half-circle (each half is a 52 dp circle clipped to half). The middle shrinks
to nothing with `scaleX` while the halves slide in with `translateX` until they meet as a 52 dp circle. The middle runs
1 dp under each half, so no hairline shows where they join. The button's own box never changes, so nothing around it
is laid out again.

**Never blocks a press.**
- The sign-in press starts the collapse in its own handler, then starts the sign-in, exactly as before. The button is
  disabled while signing in, as `SubmitButton` was.
- The intro covers the screen for at most 1.1 s. A touch on it skips the rest: to the first screen at once if that is
  ready, otherwise to the intro's end state until it is. During the hand-off fade, touches go to the first screen.
- The intro is hidden from TalkBack, which reads the screen underneath.

**"Remove animations".**
- Start-up: no intro. The intro waits for the system's answer (`reduceMotionSettled()`, new in `useReduceMotion.ts`)
  before it does anything, under the native splash. With the setting on it removes itself, and the native splash hides
  when the first screen is ready, exactly as before. Its end state is the first screen itself.
- Sign-in: the button switches straight to the circle (and back); the arc stands still; "Opening Microsoft…" shows, and
  TalkBack announces it.
- Shimmer, list entry, status badge: unchanged (§10.1).
- Tested: the start-up sequence's decisions run under Node (`src/navigation/splashSequence.ts`). The other four are
  checked in their source (no React Native renderer is installed). §12.7.

**Cleanup.** Every timing and the loop are stopped in an effect cleanup. The test pins each cleanup line.

**What still runs JavaScript, and why (none of it per frame).**
- **Starting the intro.** React renders it in the app's first render; two image loads report back (`onDisplay`); the
  system answers "Remove animations"; then one `start()`. Native animations need JavaScript to start. If the JS thread
  is busy, the native splash simply stays up longer (it shows the same picture), so nothing blank appears.
- **Its two ends.** The timeline's end and the fade's end call back into JavaScript once each, and the intro then
  unmounts.
- **Building the interpolation tables:** the intro's five, at 11 points each, once at start-up; the button's eight, once
  when it is first laid out. The curves are sampled in JavaScript because native interpolation cannot run an easing
  function (§10.1).
- **The button:** the press handler starts the collapse; an effect starts the arc's loop after the re-render; an effect
  starts the return on cancel. Once per attempt each.
- **The first screen mounting underneath the intro.** That work existed before. It now overlaps the intro instead of
  the native splash; it does not slow the intro, which runs on the UI thread once started.

### 12.2 Start-up intro (stages 1 and 2)

| ms after the intro starts | What |
|---|---|
| 0–120 | The drop holds still while the native splash fades out over the same picture |
| 120–400 | The drop falls 18 dp under gravity, runs 0.8 dp past its place and settles (`curve.fall`) |
| 400–620 | The full logo fades in over the drop (opacity only, so the two drops stay one) |
| 560–760 | The yellow rule draws out from its centre (`scaleX`) |
| 620–900 | "Setu" fades up 8 dp into place, over the rule |
| after 900, once the first screen is ready | The intro fades out over the first screen in 220 ms, then unmounts |

These times count from the intro's start, which is when the app's JavaScript has loaded. Before that, from the
icon tap, the native splash shows the same first frame.

**How the native splash hands over, read in `expo-splash-screen` 57's Android code** (`SplashScreenManager.kt`):
- While the splash is kept, the app's views are laid out but **not drawn at all**: a pre-draw listener cancels every
  draw. When it is hidden, the app draws, and the splash view fades out on top. Android always fades it (the `fade`
  option is iOS only); the default is 400 ms.
- So the intro cannot draw anything before the native splash hides. Its first frame must be the native splash's
  picture: the native image is now **only the drop**, raised 18 dp (RELEASE.md §7).
- The intro draws that frame in the same place: a 192 dp box centred on the screen, as the splash plugin places its
  image (`splashArt` in `src/theme/brand.ts`).
- It hides the native splash when both of its images are on their views, and the system has answered "Remove
  animations". expo-image's `onDisplay` fires when the drawable is set on the view, not when it is drawn
  (`ExpoImageViewWrapper.kt:302`), so it fires while the native splash still blocks drawing.
- The fade-out is set to 120 ms (`setOptions`). It runs over an identical picture, so it is not seen, and the drop
  waits for it before falling.

**Never a blank screen, never a white flash.**
- The intro hands off only when its timeline has ended **and** the first screen is ready (`NavigationContainer`'s
  `onReady`, which already hid the native splash before). Until then it holds its end state: the logo, "Setu" and the
  rule. RootNavigator's blank view, shown while the stored session is read, is never revealed.
- The hand-off is a crossfade onto a screen already mounted under the intro.
- If the first screen is ready before the intro can draw its first frame, the native splash waits at most 300 ms
  (`paintWait`), then the intro is skipped and the first screen shows, as before. A failed image skips it too.
- The crash screen hides the native splash as before. The intro unmounts with the rest of the tree.

**Once per launch.** If Android recreates the activity while the JavaScript runtime lives on, there is no intro and
the native splash behaves as before.

**The cost in time, stated plainly (estimate: not measured on a device).**
- **Before:** the native splash hid as soon as the first screen was ready.
- **After:** the first screen starts to show at the later of (intro start + 900 ms) and (first screen ready), and is
  fully shown 220 ms after that.
- So a cold start reaches a usable screen **up to about 1.1 s later**, less the time the first screen takes to mount
  (it mounts underneath, and Home's requests start meanwhile).
  - Login on a fast phone: close to the full 0.9–1.1 s.
  - Home on a slow phone that needs a second to mount: close to nothing.
- A tap skips it.
- This is a UX cost, not a rendering cost, and **it is the item to weigh**.
- **To drop it:** remove `<SplashIntro />` from `App.tsx` and restore the old `assets/splash-icon.png` (RELEASE.md §7).
  Both together, or the native splash shows the lone drop.

**What people see on a slow cold start.** The native splash now shows only the drop, left of and above the centre
(where it lands in the logo), not the logo and "Setu". On a phone that takes 2–3 s to load the JavaScript, that lone
drop is what they see for that long.

### 12.3 Sign-in (stage 3)

- **Press:** the label fades out in the first 40 % of the collapse (240 ms in all); the half-circles meet as a 52 dp
  circle. In the last 40 %, a pale yellow ring with a brand-yellow quarter arc fades in over it, and "Opening
  Microsoft…" rises 6 dp into place beneath. The arc turns once every 900 ms.
- **The same frame as the press, before the browser opens:**
  - the collapse starts inside the press handler, before the sign-in call;
  - Microsoft's page opens several asynchronous steps later: building the request with its PKCE challenge, then
    `promptAsync` (`src/api/auth.api.ts`).
  - Not measured: whether the first frames are on screen before the Custom Tab covers the app is a device check
    (§12.6).
- **Cancel at Microsoft, or a failure:** the circle opens back into the pill in 240 ms. A failure also shows its box
  above, as before. "Try again" in that box collapses the pill again.
- **Signed in:** the spinner turns until Login unmounts.
- **"Opening Microsoft…" stays up** after Microsoft's page closes, while the app exchanges the token (AUTH-P2). Telling
  "back from Microsoft" apart would need a signal from inside the sign-in flow, which this phase must not change. The
  caption is the brief's wording; it is accurate for most of the wait.
- The old helper line ("Finish on the Microsoft page. Close it to cancel.") is gone, by the design.

### 12.4 Return to Home (stage 4)

- **Home already lays out at once as skeletons in its real layout** (S11, Phases P and A1): the greeting from the stored
  user, every tile with a skeleton in place of its count, and skeleton rows for recent tickets. Nothing changed there.
- **Shimmer: brand yellow, still one shared component.**
  - `Shimmer.tsx` is still the only shimmer. It is used by `LoadingSkeleton` and `Skeleton`, so every skeleton in the
    app sweeps yellow.
  - The band's strips are brand yellow (`colors.motion.accent`) at opacities 0.08–0.26, instead of white at 0.12–0.45.
  - A white band showed only on the grey bars. A yellow band also shows on the white cards, as a pale cream, so the
    sweep reads as warm. Over the grey bars it is a warm beige.
  - Same cost: the band was always blended over the whole skeleton.
- **Tiles fill without a jump, now at every text size.**
  - The count's placeholder was a fixed 32 dp line. At 130 % system text the count's own line is 41.6 dp, so a tile
    grew about 10 dp when its number arrived.
  - Now an invisible "0" in the count's style holds the line, and the skeleton bar sits over it.
  - At 100 % nothing changes.
- **Reported, not changed (they existed before):**
  - ADMIN's announcement banner, and the "Pending approvals" shortcut for END_USER and L2_MANAGER, appear only when
    their data arrives, and push the sections below them down.
  - Reserving their space would show an empty slot to everyone who has nothing there.
  - Recent tickets show 3 skeleton rows and up to 5 real ones. That section is last, so it only grows downwards.

### 12.5 Bundle (measured, `4063df3` → this change)

The same method as §10.7 and §11: release `export:embed` (`EXPO_PUBLIC_APP_ENV=UAT`), then `hermesc -O`, with bytes
attributed through the source map. The "before" is this branch's head, which already includes the production-build
commit after §11.

| | Before | After | Change |
|---|---|---|---|
| Release JS, minified | 3,608.9 KB | 3,623.8 KB | **+14.9 KB (+0.41 %)** |
| gzip | 841.9 KB | 846.6 KB | +4.7 KB |
| Hermes bytecode (what ships) | 5,305.2 KB | 5,327.4 KB | **+22.1 KB (+0.42 %)** (22,679 bytes) |
| Modules | 2,300 | 2,305 | +5: `brand.ts`, `splashSequence.ts`, `SplashIntro.tsx`, `SignInButton.tsx`, the drop image |
| Bundled assets | 26 files, 407.4 KB | 27 files, 415.3 KB | +`meru-drop.png` (8.0 KB), and 32 bytes in the resource keep list |

- **No library code changed.** Every byte is app code (14.2 KB mapped to source) or module wrappers (0.7 KB):
  - `SignInButton` 4.8 KB;
  - `SplashIntro` 3.7 KB;
  - `LoginScreen` +2.1 KB;
  - `splashSequence` 0.8 KB;
  - theme +2.0 KB (`brand.ts` 0.6, `motion.ts` +0.4, `typography.ts` +0.4, `colors.ts` +0.3, `index.ts` +0.3);
  - `splash.ts` +0.3 KB, `HomeScreen` +0.3 KB;
  - `hooks/index`, `env.ts`, `useReduceMotion` +0.3 KB together;
  - `BrandLogo` and `Shimmer` under 0.1 KB.
- **The native splash image** is not in the JS bundle; the build turns it into drawables. Its source PNG went from
  57,000 to 22,384 bytes.
- **Verdict:** not meaningful weight, and no per-frame JavaScript. The real costs are the start-up time in §12.2, and
  GPU blending during the intro's hand-off (§12.6, item 2).

### 12.6 What to watch on a real low-end phone

Use the same phone and method as §6 and §10.9 (Developer options → Profile HWUI rendering → bars, or
`dumpsys gfxinfo`), against a build of `4063df3`.

1. **Cold start, ten times** (swipe the app away first). Native splash (the drop), then the intro, then the first
   screen.
   - The drop must not jump at the hand-over. If it shifts by a few dp, the native splash and the intro are not
     centred on the same point: note which way and how far.
   - No white or blank frame anywhere.
   - Time from the icon tap to a usable first screen, signed out (Login) and signed in (Home): screen-record both
     builds. This is §12.2's cost; decide with the number.
2. **Frames during the intro while Home mounts underneath.**
   - The intro runs on the UI thread, but Home's views are created there at the same time.
   - The 220 ms hand-off is a full-screen alpha blend: on a weak GPU it is the most expensive moment of the sequence.
3. **"Remove animations" on.**
   - No intro: the drop, then the first screen.
   - The button jumps to the circle; the arc stands still; no shimmer band.
4. **Tap during the intro:** the first screen comes at once (or the logo holds until it is ready).
5. **Sign-in.**
   - Press: the pill must visibly start collapsing before Chrome's tab covers the app.
   - Close Microsoft's page: the pill comes back.
   - Airplane mode: the failure box shows, and "Try again" collapses the pill again.
   - With the network slowed: the arc keeps turning smoothly while the token exchange runs.
6. **Shimmer** on Tickets and Alerts over a slow network.
   - The cream band on the white cards must not read as a stain or a highlight.
   - **If it does:** lower `motion.shimmer.bandOpacities`.
7. **Login** on a 360 × 640 phone at 100 %, 130 % and 200 % text.
   - Three headline lines; the button label on one line.
   - The page scrolls rather than clipping (UI-STANDARDS §10.7).
8. **The native splash on Android 12+ and on Android 11 or older:** the drop inside the visible circle, in the same
   place as the intro's first frame.
9. **Weight 800:** Android draws it with the nearest weight the system font has. Check that the headline looks like the
   design.

### 12.7 Verification

- `npx tsc --noEmit`: clean.
- `npm test`: **701 / 701** passing (675 before; +26 in `tests/motion/start-up-and-login.test.mjs`). **One existing
  case was updated:** `tests/release/production-readiness.test.mjs`, "the Login screen navigates nowhere". It pinned
  the old `SubmitButton` label (`'Signing in…' : 'Sign in with Microsoft'`). It now pins the one `SignInButton`, its
  label, and that neither file navigates.
- The 26 new cases cover:
  - the environment chip, with `env.ts` evaluated as a production release, a preview release, nothing set and a
    development build;
  - the start-up sequence's decisions (plays, holds, skips under "Remove animations", image failure, the 300 ms wait,
    touch, crash, hide once);
  - the two start-up images, decoded and measured against the intro's geometry (`tests/support/png.mjs`, Node's zlib
    only);
  - the login's design values;
  - the motion rules in every animating file.
- Seven deliberate violations each failed the suite (§12.1).
- Release bundle built before and after with the method above; the native-driver trace is in §12.1.
- `npm run verify:release-bundle`: **PASS** in both modes (UAT, and `--prod`). "Sign in with Microsoft", its control
  string, is still found.
- No EAS build. No call to the backend. The web repo was not opened, and no database was touched.
- Branch `dev`, nothing committed.
