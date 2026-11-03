// iOS-8a: solid Android-style navigation bars, nothing under them, lists clear of the tab bar and the "+" button.
// The device finding (TestFlight 0.1.0 (1)): on Home, Tickets, Approvals and Alerts the large title was drawn over the
// content, which scrolled under it and under the status bar; the last rows sat behind the tab bar and the "+".
// 1. no navigator or screen asks for a large title, a translucent bar, a blur, the bar's search field or UIKit's
//    automatic content inset; the shared options give every bar Android's look, from src/theme;
// 2. every scrollable tab root pads from listDefaults: the top gap, and the bottom clear of the "+" or the selection bar;
// 3. the toolbars and banners are drawn under the bar, above the list: not in the bar, not in the list, not over it;
// 4. the tab bar keeps its own space (it is not drawn over the screens), which the bottom padding relies on.
// Source checks read the files as text, as the other screen tests do; pure modules are run.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FAB_BOTTOM, FAB_CLEARANCE, LIST_END_GAP, LIST_TOP_GAP, listBottomInset,
} from '../../src/components/listDefaults.ts';
import { colors, palette } from '../../src/theme/colors.ts';
import { fontWeight } from '../../src/theme/typography.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// LF line ends: the working tree may have CRLF (core.autocrlf), the repository has LF.
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');

/** Source without comments, so a comment that names an option is not mistaken for a use. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel] : [];
  });
}

/** The JSX a screen component returns last (its main layout), without the helpers declared after it. */
function mainReturn(src, component) {
  const start = src.indexOf(`export function ${component}(`);
  assert.ok(start >= 0, `${component} not found`);
  const body = src.slice(start, src.indexOf('\n}\n', start));
  return body.slice(body.lastIndexOf('\n  return ('));
}

const HOME = 'src/screens/dashboard/HomeScreen.tsx';
const TICKETS = 'src/screens/tickets/TicketListScreen.tsx';
const APPROVALS = 'src/screens/approvals/ApprovalsInboxScreen.tsx';
const ALERTS = 'src/screens/notifications/NotificationsScreen.tsx';
const MORE = 'src/navigation/MoreScreen.tsx';
const STACKS = 'src/navigation/TabStacks.tsx';

// ── 1. The navigation bar ────────────────────────────────────

describe('iOS-8a: one solid navigation bar, in the look of Android\'s top bar', () => {
  test('no navigator or screen asks for a large title, a see-through bar, a blur, the bar\'s search or UIKit\'s inset', () => {
    // Each of these made react-native-screens lay the screen out under the bar (native-stack useHeaderConfigProps:
    // a large title, a search field or a header background turn on `translucent`), or left the content to UIKit.
    const forbidden = {
      'a large title': /headerLargeTitle(Enabled)?\s*[:=](?!\s*\{?\s*false\b)/,
      'a transparent bar': /headerTransparent\s*[:=]\s*\{?\s*true/,
      'a header background view': /headerBackground\s*:/,
      'a blur': /headerBlurEffect/,
      'the bar\'s search field': /headerSearchBarOptions|SearchBarCommands/,
      'UIKit\'s automatic inset': /contentInsetAdjustmentBehavior/,
    };
    const found = [];
    for (const rel of [...sourceFiles('src'), 'App.tsx']) {
      const src = code(read(rel));
      for (const [what, re] of Object.entries(forbidden)) if (re.test(src)) found.push(`${rel}: ${what}`);
    }
    assert.deepEqual(found, []);
  });

  test('the shared options: opaque white, a hairline under it, Android\'s 18 pt semibold gray-900 title and gray-900 chevron', () => {
    const src = code(read(STACKS));
    const options = src.slice(src.indexOf('export const STACK_SCREEN_OPTIONS'), src.indexOf('};', src.indexOf('export const STACK_SCREEN_OPTIONS')));
    assert.match(options, /headerLargeTitle: false,/);
    assert.match(options, /headerTransparent: false,/, 'explicit: it keeps the bar opaque even if a search field returns');
    assert.match(options, /headerStyle: \{ backgroundColor: colors\.surface \},/);
    assert.match(options, /headerShadowVisible: true,/, 'Android\'s border-b');
    assert.match(options, /headerTintColor: colors\.text\.primary,/);
    assert.match(options, /headerTitleStyle: \{ color: colors\.text\.primary, fontSize: 18, fontWeight: fontWeight\.semibold \},/);
    assert.match(options, /headerBackButtonDisplayMode: 'minimal',/, 'the iOS chevron, no "Back" label');
    assert.match(options, /headerLeftBackgroundVisible: false,\s*headerRightBackgroundVisible: false,/, 'flat bar buttons');
    assert.doesNotMatch(options, /headerLargeTitleStyle|headerLargeTitleShadowVisible|gestureEnabled/);
    // The theme values are Android's ScreenHeader: bg-white, text-gray-900 text-lg font-semibold.
    assert.equal(colors.surface, palette.white);
    assert.equal(colors.text.primary, palette.gray[900]);
    assert.equal(fontWeight.semibold, '600');
  });

  test('every tab stack and every sheet uses those options; only TabStacks.tsx sets how a bar looks', () => {
    assert.match(code(read(STACKS)), /<Stack\.Navigator initialRouteName=\{routes\[0\]\} screenOptions=\{STACK_SCREEN_OPTIONS\}>/);
    assert.match(code(read('src/navigation/RootNavigator.tsx')), /\.\.\.STACK_SCREEN_OPTIONS,\s*presentation: 'modal',/);
    const look = /\bheader(Style|TintColor|TitleStyle|ShadowVisible|Transparent|LargeTitle\w*|Left|Right)BackgroundVisible\b|\bheader(Style|TintColor|TitleStyle|ShadowVisible|Transparent|LargeTitle\w*)\s*:/;
    const elsewhere = sourceFiles('src').filter((rel) => rel !== STACKS && look.test(code(read(rel))));
    assert.deepEqual(elsewhere, []);
  });
});

// ── 2. The lists' padding ────────────────────────────────────

describe('iOS-8a: every tab root\'s list starts below the bar and ends clear of what covers its foot', () => {
  test('listBottomInset: the 24 pt end gap, the "+" button (20 pt up, 56 pt, 20 pt gap), or a measured bar + 24', () => {
    assert.equal(LIST_TOP_GAP, 12);
    assert.equal(LIST_END_GAP, 24);
    assert.equal(FAB_BOTTOM, 20);
    assert.equal(FAB_CLEARANCE, 20 + 56 + 20);
    assert.equal(listBottomInset(), 24);
    assert.equal(listBottomInset({ fab: true }), 96);
    assert.equal(listBottomInset({ fab: true, overlay: 64 }), 96, 'a one-row selection bar is under the "+" clearance');
    assert.equal(listBottomInset({ fab: true, overlay: 170 }), 194, 'stacked buttons at the accessibility sizes');
    assert.equal(listBottomInset({ overlay: 40 }), 64);
  });

  test('each scrollable tab root pads from listDefaults, and the "+" button sits at FAB_BOTTOM', () => {
    const home = code(read(HOME));
    assert.match(home, /contentContainerStyle=\{\{ paddingTop: LIST_TOP_GAP, paddingBottom: listBottomInset\(\{ fab: showFab \}\) \}\}/);
    const tickets = code(read(TICKETS));
    assert.match(tickets, /paddingTop: largeText \? 0 : LIST_TOP_GAP, paddingBottom: listBottomInset\(\{ fab: true, overlay: selectionOverlay \}\)/);
    assert.match(tickets, /<FlashList[\s\S]*?contentContainerStyle=\{contentStyle\}/);
    for (const rel of [APPROVALS, ALERTS]) {
      const src = code(read(rel));
      assert.match(src, /const LIST_PADDING = \{ paddingTop: LIST_TOP_GAP, paddingBottom: listBottomInset\(\), flexGrow: 1 \};/, rel);
      assert.match(src, /<FlashList[\s\S]*?contentContainerStyle=\{LIST_PADDING\}/, rel);
      assert.match(src, /<ScrollView contentContainerStyle=\{LIST_PADDING\}/, `${rel}: the first-load states too`);
    }
    // More: its own 8 (32 pt) under the last row, more than the end gap; nothing floats over it.
    assert.match(code(read(MORE)), /<ScrollView className="flex-1 bg-gray-50" contentContainerClassName="px-4 pb-8 pt-2">/);
    for (const rel of [HOME, TICKETS]) {
      const src = code(read(rel));
      assert.match(src, /style=\{\[\{ bottom: FAB_BOTTOM \}, shadows\.fab\]\}/, rel);
      assert.doesNotMatch(src, /paddingBottom: \d/, `${rel}: no padding number of its own`);
    }
  });

  test('the ticket list clears its selection bar at the height the bar is drawn (taller when its buttons stack)', () => {
    const src = code(read(TICKETS));
    assert.match(src, /onLayout=\{\(e\) => setSelectionBarHeight\(e\.nativeEvent\.layout\.height\)\}/);
    assert.match(src, /const selectionOverlay = selectionMode \? selectionBarHeight : 0;/);
    assert.equal((src.match(/<StateScroll header=\{listHeader\} style=\{contentStyle\}/g) ?? []).length, 3);
  });
});

// ── 3. Toolbars and banners: under the bar, above the list ───

describe('iOS-8a: the toolbars and banners are drawn under the bar and above the list, never under the bar', () => {
  test('Home, Tickets, Approvals and Alerts: one offline and one error banner each, fixed above the list, as on Android', () => {
    const screens = { [HOME]: 'HomeScreen', [TICKETS]: 'TicketListScreen', [APPROVALS]: 'ApprovalsInboxScreen', [ALERTS]: 'NotificationsScreen' };
    for (const [rel, component] of Object.entries(screens)) {
      const src = code(read(rel));
      assert.equal((src.match(/<OfflineBanner \/>/g) ?? []).length, 1, `${rel}: one offline banner`);
      assert.equal((src.match(/<QueryBanner\b/g) ?? []).length, 1, `${rel}: one error banner`);
      const root = mainReturn(src, component);
      const list = Math.max(root.indexOf('<ListEntryScope>'), root.indexOf('<ScrollView'));
      assert.ok(list > 0, rel);
      assert.ok(root.indexOf('<OfflineBanner />') > 0 && root.indexOf('<OfflineBanner />') < list, `${rel}: offline banner above the list`);
      assert.ok(root.indexOf('<QueryBanner') > 0 && root.indexOf('<QueryBanner') < list, `${rel}: error banner above the list`);
    }
  });

  test('Tickets: the search field, Filters and (at standard text sizes) the filter rows are a toolbar above the list', () => {
    const src = code(read(TICKETS));
    const root = mainReturn(src, 'TicketListScreen');
    const order = ['<OfflineBanner />', '{searchRow}', '{largeText ? null : filterRows}', '<QueryBanner', '<ListEntryScope>'].map((s) => root.indexOf(s));
    assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), `banner, search, filters, banner, list: ${order}`);
    const toolbar = root.slice(root.lastIndexOf('<View', order[1]), order[1]);
    assert.match(toolbar, /className="border-b border-border bg-white px-4 pb-1 pt-2"/);
    assert.doesNotMatch(toolbar, /absolute/, 'in the layout, not drawn over the list');
    const searchRow = src.slice(src.indexOf('const searchRow = ('), src.indexOf('const filterRows = ('));
    assert.match(searchRow, /<SearchField\b/);
    assert.match(searchRow, /<FiltersButton on=\{filtersOn\} onPress=\{openFilters\} \/>/);
    // The bar shows only the title (or, while selecting, the count, Cancel and the limit).
    const setOptions = src.slice(src.indexOf('navigation.setOptions('), src.indexOf('}, [navigation, selectionMode'));
    assert.doesNotMatch(setOptions, /SearchField|FiltersButton|filterRows/);
  });

  test('Approvals: the type chips are a toolbar above the list, not its header', () => {
    const src = code(read(APPROVALS));
    const root = mainReturn(src, 'ApprovalsInboxScreen');
    assert.ok(root.indexOf('APPROVAL_FILTERS.map(') > 0 && root.indexOf('APPROVAL_FILTERS.map(') < root.indexOf('<ListEntryScope>'));
    const listHeader = src.slice(src.indexOf('ListHeaderComponent={'), src.indexOf('ListEmptyComponent={'));
    assert.doesNotMatch(listHeader, /FilterChip|OfflineBanner|QueryBanner/);
  });

  test('Alerts: "Mark all read" is the bar\'s right button in Android\'s style; the notice opens the list', () => {
    const src = code(read(ALERTS));
    assert.match(src, /navigation\.setOptions\(\{\s*headerRight: \(\) =>/);
    assert.match(src, /<Text className=\{`text-sm font-medium \$\{markAllDisabled \? 'text-gray-400' : 'text-blue-700'\}`\}>Mark all read<\/Text>/);
    const listHeader = src.slice(src.indexOf('ListHeaderComponent={'), src.indexOf('ListEmptyComponent={'));
    assert.match(listHeader, /<Notice>/);
    assert.doesNotMatch(listHeader, /OfflineBanner|QueryBanner/);
  });

  test('the other header actions take Android\'s colours: gray-900 icons, blue-700 text', () => {
    assert.match(code(read('src/screens/tickets/TicketDetailScreen.tsx')), /name="ellipsis-horizontal-circle" size=\{26\} color=\{colors\.text\.primary\}/);
    assert.match(code(read('src/screens/tickets/TicketFiltersScreen.tsx')), /<Text className="text-sm font-medium text-blue-700">Clear all<\/Text>/);
    assert.match(code(read(TICKETS)), /<Text className="text-sm font-medium text-blue-700">\{label\}<\/Text>/, 'Cancel while selecting');
  });

  test('on the tab roots, only the "+" button and the selection bar are drawn over the list, both at its foot', () => {
    const roots = { [HOME]: 'HomeScreen', [TICKETS]: 'TicketListScreen', [APPROVALS]: 'ApprovalsInboxScreen', [ALERTS]: 'NotificationsScreen', [MORE]: 'MoreScreen' };
    for (const [rel, component] of Object.entries(roots)) {
      const root = mainReturn(code(read(rel)), component);
      const overlays = [...root.matchAll(/className=\{?[`"]([^`"]*\babsolute\b[^`"]*)[`"]/g)].map((m) => m[1]);
      for (const cls of overlays) {
        assert.ok(/\babsolute bottom-0\b/.test(cls) || /\babsolute right-5\b/.test(cls), `${rel}: "${cls}" is not at the list's foot`);
      }
      assert.doesNotMatch(root, /\btop-0\b|\btop: 0\b|absoluteFill/, `${rel}: nothing pinned over the top of the screen`);
    }
  });
});

// ── 4. The tab bar keeps its own space ───────────────────────

describe('iOS-8a: the tab bar is laid out under the screens, not over them', () => {
  test('AppTabs never positions or backs the bar itself, so a list ends at the bar\'s top edge', () => {
    assert.doesNotMatch(code(read('src/navigation/AppTabs.tsx')), /tabBarStyle|tabBarBackground|position:\s*'absolute'/);
  });

  test('the installed bottom-tabs puts the bar after the screens and positions it only while it is hidden', () => {
    // listBottomInset() adds no tab-bar height because of this. A bottom-tabs that draws the bar over the screens would
    // need it: this test then fails, and the padding is re-checked (docs/brand/UI-STANDARDS.md §iOS-A.13).
    const view = read('node_modules/@react-navigation/bottom-tabs/src/views/BottomTabView.tsx');
    assert.match(view, /<MaybeScreenContainer[\s\S]*?\{tabBarPosition === 'bottom' \|\| tabBarPosition === 'right'\s*\? tabBarElement/);
    const bar = read('node_modules/@react-navigation/bottom-tabs/src/views/BottomTabBar.tsx');
    assert.match(bar, /position: isTabBarHidden \? 'absolute' : undefined,/);
  });
});
