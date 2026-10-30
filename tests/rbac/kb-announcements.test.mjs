// Knowledge base and Announcements: ADMIN only (Ronit, 2026-10-29). A product decision to simplify the mobile app, not a
// 🔒 SAFER case: on the web every role has both in the sidebar and they work there (docs/WEB-VS-MOBILE-ROLES.md §5a).
//
// For END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin:
//   1. which drawer rows appear (on iOS, More rows): only ADMIN gets "Knowledge base" and "Announcements";
//   2. that no other role can REACH either module by any path: the tab stacks do not register KnowledgeBase, KbArticle
//      or Announcements, so React Navigation's own stack router (the installed @react-navigation/routers, run here)
//      refuses every action that names them;
//   3. that no other entry point remains: every place in src/ that names those routes, the Home banner and its
//      "Read more", the ANN-1 read behind it, URL deep links and links tapped inside server HTML;
//   4. (iOS-5b, iOS only) persona by persona: no tab, More row, deep link or notification tap reaches them.
// What is real: the app's permission module, its route table, its deep-link and notification rules, and React
// Navigation's routers. What is read as text: the screens and navigators, which need a phone to render.
//
// iOS-5b: Android's tests/rbac/kb-announcements.test.mjs (4063df3), the same 56 tests, adapted where Android reads its
// drawer: iOS has no drawer, so its rows are More rows (MoreScreen.tsx, moreSections) and its routes are the tab stacks'
// (TabStacks.tsx, routes.ts stackRoutes, the iOS form of drawerRoutes); the drawer router's checks run on each tab's
// StackRouter. Section 4 is new on iOS.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, StackActions, StackRouter, TabRouter } from '@react-navigation/routers';

import { SHEET_ROUTES, STACK_ROUTES, getIdFor, stackRoutes } from '../../src/navigation/routes.ts';
import { APP_ORIGIN, notificationDestination, parseTicketLink, ticketLinkDestination } from '../../src/utils/deep-links.ts';
import {
  appTabs, canReadAnnouncements, canUseKnowledgeBase, drawerItems, moreSections, showAnnouncementBanner,
} from '../../src/utils/permissions.ts';
import { NAMES, PERSONAS, forEachPersona } from './personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry).replace(/\\/g, '/');
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel] : [];
  });
}
const SRC = sourceFiles('src');

/** Android's two drawer routes (Knowledge, Announcements) are three stack routes on iOS: the KB list, an article, M16. */
const ADMIN_ONLY = ['KnowledgeBase', 'KbArticle', 'Announcements'];
const NON_ADMIN = NAMES.filter((name) => name !== 'ADMIN');
const TABS = ['HomeTab', 'TicketsTab', 'ApprovalsTab', 'AlertsTab', 'MoreTab'];
const paramsFor = (route) => (route === 'KbArticle' ? { slug: 'vpn' } : undefined);

// ── 1. Drawer rows (iOS: More rows) ──────────────────────────

describe('KB and announcements: drawer rows (ADMIN only)', () => {
  const STAFF = ['approvals', 'tasks', 'catalog', 'settings'];
  const REQUESTER = ['tasks', 'catalog', 'settings'];
  const ADMIN = ['approvals', 'tasks', 'knowledge', 'catalog', 'announcements', 'settings'];

  forEachPersona(
    'drawer rows, no pending approvals',
    { END_USER: REQUESTER, AGENT: STAFF, TRIAGE_AGENT: STAFF, L2_MANAGER: REQUESTER, ADMIN },
    (p) => drawerItems(p.role, 0),
  );

  // A pending approval adds the Approvals row (08 S1) and nothing else: it never brings KB or Announcements back.
  forEachPersona(
    'drawer rows, 3 pending approvals',
    { END_USER: STAFF, AGENT: STAFF, TRIAGE_AGENT: STAFF, L2_MANAGER: STAFF, ADMIN },
    (p) => drawerItems(p.role, 3),
  );

  forEachPersona(
    'canUseKnowledgeBase',
    { END_USER: false, AGENT: false, TRIAGE_AGENT: false, L2_MANAGER: false, ADMIN: true },
    (p) => canUseKnowledgeBase(p.role),
  );

  forEachPersona(
    'canReadAnnouncements',
    { END_USER: false, AGENT: false, TRIAGE_AGENT: false, L2_MANAGER: false, ADMIN: true },
    (p) => canReadAnnouncements(p.role),
  );

  test('a role the app does not know gets neither row', () => {
    assert.equal(drawerItems('GUEST', 5).includes('knowledge'), false);
    assert.equal(drawerItems('GUEST', 5).includes('announcements'), false);
  });

  test('the two More rows open the ADMIN-only routes (MoreScreen.tsx), and rows come only from moreSections() → drawerItems()', () => {
    const src = read('src/navigation/MoreScreen.tsx');
    assert.match(src, /knowledge: \{ label: 'Knowledge base', icon: '[\w-]+' \}/);
    assert.match(src, /announcements: \{ label: 'Announcements', icon: '[\w-]+' \}/);
    assert.match(src, /case 'knowledge':\s*return navigation\.navigate\('KnowledgeBase'\);/);
    assert.match(src, /case 'announcements':\s*return navigation\.navigate\('Announcements'\);/);
    assert.match(src, /\{moreSections\(user\?\.role, pendingApprovals\)\.map\(\(section\) =>/);
    assert.match(read('src/utils/permissions.ts'), /const rows = drawerItems\(who, pendingApprovals\);/);
  });
});

// ── 2. Routes: registered for ADMIN only, so unreachable for anyone else ──

/** MoreScreen's open(): each More row's route, read from the source (pinned row by row by the test above). */
function moreRowRoutes() {
  const src = read('src/navigation/MoreScreen.tsx');
  return Object.fromEntries([...src.matchAll(/case '(\w+)':\s*return navigation\.navigate\('(\w+)'/g)].map((m) => [m[1], m[2]]));
}

/** A tab's native stack exactly as TabStacks.tsx configures it, for this role's registered routes. */
function stackFor(tab, role, initialRouteName) {
  const routeNames = stackRoutes(tab, role);
  const router = StackRouter({ initialRouteName: initialRouteName ?? routeNames[0] });
  const options = {
    routeNames,
    routeParamList: Object.fromEntries(routeNames.map((n) => [n, undefined])),
    routeGetIdList: Object.fromEntries(routeNames.flatMap((n) => (getIdFor(n) ? [[n, getIdFor(n)]] : []))),
  };
  return { router, options, state: router.getInitialState(options) };
}

/** Every action that could put `name` on screen: what a row, a banner, a link, a back target or a reset would send. */
function actionsTo(name, root) {
  const params = paramsFor(name);
  return {
    'navigate(name)': CommonActions.navigate(name, params),
    'navigate(name) with pop (as the More rows and the tab shortcuts send it)': CommonActions.navigate(name, params, { pop: true }),
    'push(name)': StackActions.push(name, params),
    'replace(name)': StackActions.replace(name, params),
    'popTo(name)': StackActions.popTo(name, params),
    'preload(name)': CommonActions.preload(name, params),
    'reset to a state that contains it': CommonActions.reset({ index: 1, routes: [{ name: root }, { name, params }] }),
  };
}

const R = ['TicketDetail', 'TaskDetail', 'ApprovalDetail', 'TicketLink'];
const EVERYONE_ELSE = {
  HomeTab: ['Home', ...R],
  TicketsTab: ['TicketList', ...R],
  ApprovalsTab: ['ApprovalsInbox', ...R],
  AlertsTab: ['Notifications', ...R],
  MoreTab: ['More', 'ApprovalsInbox', 'TaskList', 'ServiceCatalog', 'ServiceRequestForm', 'ServiceRequestDetail', 'Profile', ...R],
};
const ADMIN_STACKS = {
  ...EVERYONE_ELSE,
  HomeTab: ['Home', 'Announcements', ...R],
  MoreTab: [
    'More', 'ApprovalsInbox', 'TaskList', 'KnowledgeBase', 'KbArticle', 'ServiceCatalog', 'ServiceRequestForm',
    'ServiceRequestDetail', 'Announcements', 'Profile', ...R,
  ],
};
const allStacks = (role) => Object.fromEntries(TABS.map((tab) => [tab, stackRoutes(tab, role)]));

describe('KB and announcements: the routes exist for ADMIN only', () => {
  forEachPersona(
    'routes each tab stack registers',
    { END_USER: EVERYONE_ELSE, AGENT: EVERYONE_ELSE, TRIAGE_AGENT: EVERYONE_ELSE, L2_MANAGER: EVERYONE_ELSE, ADMIN: ADMIN_STACKS },
    (p) => allStacks(p.role),
  );

  test('a role the app does not know gets none of the routes; no user yet reads as END_USER', () => {
    for (const tab of TABS) {
      for (const name of ADMIN_ONLY) assert.equal(stackRoutes(tab, 'GUEST').includes(name), false, `${tab} ${name}`);
      assert.deepEqual(stackRoutes(tab, null), stackRoutes(tab, 'END_USER'), tab);
      assert.deepEqual(stackRoutes(tab, undefined), stackRoutes(tab, 'END_USER'), tab);
    }
  });

  test('every More row a person sees opens a route that is registered for them (no dead row, no dead "Read more")', () => {
    const ROW_ROUTE = moreRowRoutes();
    assert.deepEqual(Object.keys(ROW_ROUTE).sort(), ['announcements', 'approvals', 'catalog', 'knowledge', 'myRequests', 'settings', 'tasks']);
    for (const name of NAMES) {
      const role = PERSONAS[name].role;
      for (const pending of [0, 1]) {
        const routes = stackRoutes('MoreTab', role);
        for (const row of moreSections(role, pending).flatMap((s) => s.items)) assert.ok(routes.includes(ROW_ROUTE[row]), `${name}: ${row}`);
      }
      if (showAnnouncementBanner(role)) assert.ok(stackRoutes('HomeTab', role).includes('Announcements'), `${name}: the banner's "Read more"`);
    }
  });

  for (const name of NON_ADMIN) {
    test(`${name}: React Navigation's stack router refuses every way to open the knowledge base or Announcements, in every tab`, () => {
      for (const tab of TABS) {
        const { router, options, state } = stackFor(tab, PERSONAS[name].role);
        for (const route of ADMIN_ONLY) {
          for (const [label, action] of Object.entries(actionsTo(route, options.routeNames[0]))) {
            // null = "not handled": React Navigation then offers the action to the parent (the tab navigator, then the
            // root stack, which have only tabs, sheets, Auth and App) and, unhandled there too, drops it.
            assert.equal(router.getStateForAction(state, action, options), null, `${tab} ${route}: ${label}`);
          }
        }
      }
    });

    test(`${name}: a saved or stale navigation state naming any of them is rehydrated without it`, () => {
      for (const tab of TABS) {
        const { router, options } = stackFor(tab, PERSONAS[name].role);
        const root = options.routeNames[0];
        for (const route of ADMIN_ONLY) {
          const rehydrated = router.getRehydratedState({ stale: true, index: 1, routes: [{ name: root }, { name: route, params: paramsFor(route) }] }, options);
          assert.deepEqual(rehydrated.routes.filter((r) => ADMIN_ONLY.includes(r.name)), [], `${tab} ${route}`);
          assert.equal(rehydrated.routes[rehydrated.index].name, root, `${tab} ${route}`);
        }
      }
    });

    test(`${name}: walking every other route and back never puts any of them on a stack`, () => {
      for (const tab of TABS) {
        const { router, options } = stackFor(tab, PERSONAS[name].role);
        let { state } = stackFor(tab, PERSONAS[name].role);
        const seen = new Set();
        for (const route of [...options.routeNames, ...ADMIN_ONLY, ...options.routeNames.slice().reverse()]) {
          state = router.getStateForAction(state, CommonActions.navigate(route, paramsFor(route)), options) ?? state;
          for (const r of state.routes) seen.add(r.name);
        }
        for (let i = 0; i < 20; i++) {
          state = router.getStateForAction(state, CommonActions.goBack(), options) ?? state;
          for (const r of state.routes) seen.add(r.name);
        }
        for (const route of ADMIN_ONLY) assert.equal(seen.has(route), false, `${tab} ${route}`);
      }
    });
  }

  test('ADMIN: the same actions do open them (the gate is the role, not a broken route)', () => {
    const where = { KnowledgeBase: ['MoreTab'], KbArticle: ['MoreTab'], Announcements: ['HomeTab', 'MoreTab'] };
    for (const route of ADMIN_ONLY) {
      for (const tab of where[route]) {
        const { router, options, state } = stackFor(tab, 'ADMIN');
        for (const label of ['navigate(name)', 'push(name)', 'reset to a state that contains it']) {
          const next = router.getStateForAction(state, actionsTo(route, options.routeNames[0])[label], options);
          assert.ok(next, `${tab} ${route}: ${label}`);
          assert.equal(next.routes[next.index].name, route, `${tab} ${route}: ${label}`);
        }
      }
    }
  });

  test('TabStacks.tsx registers exactly stackRoutes(tab, role): no screen is registered by hand', () => {
    const src = read('src/navigation/TabStacks.tsx');
    assert.match(src, /const role = useAuthStore\(\(s\) => s\.user\?\.role\);\r?\n\s*const routes = stackRoutes\(tab, role\);/);
    assert.match(src, /\{routes\.map\(\(name\) => \(\s*<Stack\.Screen\s+key=\{name\}\s+name=\{name\}\s+component=\{SCREENS\[name\]\}/);
    assert.doesNotMatch(src, /<Stack\.Screen[^>]*name="/, 'a literal registration would bypass stackRoutes()');
    assert.match(src, /\r?\n {2}KnowledgeBase: KnowledgeBaseScreen,\r?\n/);
    assert.match(src, /\r?\n {2}KbArticle: KbArticleScreen,\r?\n/);
    assert.match(src, /\r?\n {2}Announcements: AnnouncementsScreen,\r?\n/);
    // The rule itself is the permission module's: routes.ts names the routes, never a role.
    const routes = read('src/navigation/routes.ts');
    assert.match(routes, /if \(name === 'KnowledgeBase' \|\| name === 'KbArticle'\) return canUseKnowledgeBase\(role\);/);
    assert.match(routes, /if \(name === 'Announcements'\) return canReadAnnouncements\(role\);/);
  });

  test('no other navigator registers them: their screens are TabStacks\' SCREENS entries, and no sheet is one of them', () => {
    assert.deepEqual(SRC.filter((rel) => /name="(KnowledgeBase|KbArticle|Announcements)"/.test(read(rel))), []);
    for (const route of ADMIN_ONLY) assert.equal(SHEET_ROUTES.includes(route), false, route);
    // Every stack that can hold them is a tab stack built by stackRoutes(); STACK_ROUTES alone is never registered.
    assert.deepEqual(SRC.filter((rel) => /\bSTACK_ROUTES\b/.test(read(rel))), ['src/navigation/routes.ts']);

    const users = (word) => SRC.filter((rel) => new RegExp(`\\b${word}\\b`).test(read(rel)));
    assert.deepEqual(users('KnowledgeBaseScreen'), ['src/navigation/TabStacks.tsx', 'src/screens/knowledge/KnowledgeBaseScreen.tsx']);
    assert.deepEqual(users('KbArticleScreen'), ['src/navigation/TabStacks.tsx', 'src/screens/knowledge/KbArticleScreen.tsx']);
    assert.deepEqual(users('AnnouncementsScreen'), ['src/navigation/TabStacks.tsx', 'src/screens/dashboard/AnnouncementsScreen.tsx']);
  });
});

// ── 3. Every entry point ─────────────────────────────────────

describe('KB and announcements: no entry point remains for anyone but ADMIN', () => {
  test('only three places in src/ navigate to either module, each behind the ADMIN rule', () => {
    const NAV = /navigate\(\s*['"](KnowledgeBase|KbArticle|Announcements)['"]|screen:\s*['"](KnowledgeBase|KbArticle|Announcements)['"]/;
    assert.deepEqual(SRC.filter((rel) => NAV.test(read(rel))), [
      // The More rows: moreSections() → drawerItems() (above).
      'src/navigation/MoreScreen.tsx',
      // The Home banner's "Read more": shown only when showAnnouncementBanner() (below).
      'src/screens/dashboard/HomeScreen.tsx',
      // List → article, inside the More stack, where both are registered for ADMIN only.
      'src/screens/knowledge/KnowledgeBaseScreen.tsx',
    ]);
    // MoreScreen's open() only ever receives a row that moreSections() returned.
    const more = read('src/navigation/MoreScreen.tsx');
    assert.match(more, /onPress=\{\(\) => open\(item\)\}/);
    assert.equal((more.match(/\bopen\(/g) ?? []).length, 1, 'open() is called from the rows alone');
  });

  forEachPersona(
    'Home announcement banner (and its "Read more")',
    { END_USER: false, AGENT: false, TRIAGE_AGENT: false, L2_MANAGER: false, ADMIN: true },
    (p) => showAnnouncementBanner(p.role),
  );

  test('Home: the banner, its "Read more" and its refresh exist only under showAnnouncementBanner()', () => {
    const src = read('src/screens/dashboard/HomeScreen.tsx');
    assert.match(src, /const showBanner = showAnnouncementBanner\(role\);/);
    assert.match(src, /const activeAnnouncements = showBanner \? \(announcements\.data \?\? \[\]\) : \[\];/);
    assert.match(src, /const banner = visibleAnnouncements\[0\];/);
    assert.match(src, /\{banner \? \(\s*<AnnouncementBanner[\s\S]*?onOpen=\{\(\) => navigation\.navigate\('Announcements'\)\}/);
    assert.equal((src.match(/navigate\('Announcements'\)/g) ?? []).length, 1, 'one "Read more", inside the banner');
    // TanStack's refetch() runs even when a query is disabled, so pull-to-refresh must skip it itself.
    assert.match(src, /showBanner \? announcements\.refetch\(\) : Promise\.resolve\(\)/);
    assert.equal((src.match(/announcements\.refetch\(\)/g) ?? []).length, 1);
  });

  test('ANN-1 is requested for ADMIN only: the one hook that reads it is gated by canReadAnnouncements()', () => {
    const hook = read('src/hooks/useAnnouncements.ts');
    assert.match(hook, /const allowed = useAuthStore\(\(s\) => !!s\.user && canReadAnnouncements\(s\.user\.role\)\);/);
    assert.match(hook, /enabled: allowed,/);
    assert.deepEqual(SRC.filter((rel) => /listActiveAnnouncements\(/.test(read(rel))), ['src/api/announcements.api.ts', 'src/hooks/useAnnouncements.ts']);
    assert.deepEqual(SRC.filter((rel) => /useAnnouncements\(\)/.test(read(rel))), [
      'src/hooks/useAnnouncements.ts',
      'src/screens/dashboard/AnnouncementsScreen.tsx',
      'src/screens/dashboard/HomeScreen.tsx',
    ]);
  });

  test('the KB reads and the helpful vote are called only from the KB screens (ADMIN-only routes)', () => {
    const KB_HOOK = /\buseKb(Categories|Articles|Search|Article|Voted|HelpfulVote)\(/;
    assert.deepEqual(SRC.filter((rel) => KB_HOOK.test(read(rel))), [
      'src/hooks/useKnowledgeBase.ts',
      'src/screens/knowledge/KbArticleScreen.tsx',
      'src/screens/knowledge/KnowledgeBaseScreen.tsx',
    ]);
    const KB_API = /\b(listKbCategories|listKbArticles|searchKb|getKbArticle|markKbArticleHelpful)\(/;
    assert.deepEqual(SRC.filter((rel) => KB_API.test(read(rel))), ['src/api/kb.api.ts', 'src/hooks/useKnowledgeBase.ts']);
  });

  test('URL deep links: none are routed into the app, so none can open either screen', () => {
    // No `linking` config: the OS never maps a URL to a screen (ask A18). The app's URL scheme is for sign-in only.
    assert.doesNotMatch(read('src/navigation/RootNavigator.tsx'), /\blinking\s*=/);
    const URL_ROUTING = /\blinking\s*=|getInitialURL|addEventListener\(\s*['"]url['"]|useURL\(|from 'expo-linking'/;
    assert.deepEqual([...SRC, 'App.tsx', 'index.ts'].filter((rel) => URL_ROUTING.test(read(rel))), []);
  });

  test('a KB or announcement link tapped inside a description, reply or email is not an in-app link', () => {
    // Only ticket links resolve in the app (TicketLink screen); anything else opens in the browser (HtmlText).
    for (const link of [
      `${APP_ORIGIN}/kb`,
      `${APP_ORIGIN}/kb/articles/reset-your-vpn`,
      `${APP_ORIGIN}/knowledge-base/reset-your-vpn`,
      `${APP_ORIGIN}/announcements`,
      `${APP_ORIGIN}/announcements/123`,
    ]) {
      assert.deepEqual(parseTicketLink(link), { ok: false, reason: 'not-a-ticket-link' }, link);
      for (const tab of [...TABS, null]) assert.equal(ticketLinkDestination(link, tab), null, `${link} in ${tab}`);
    }
    assert.doesNotMatch(read('src/navigation/navigationRef.ts'), /Knowledge|Announcements|KbArticle/);
  });

  test('screens and navigators still decide nothing by role themselves', () => {
    for (const rel of [
      'src/navigation/TabStacks.tsx',
      'src/navigation/routes.ts',
      'src/navigation/MoreScreen.tsx',
      'src/screens/dashboard/HomeScreen.tsx',
      'src/hooks/useAnnouncements.ts',
    ]) {
      assert.doesNotMatch(read(rel), /['"]ADMIN['"]/, rel);
    }
  });
});

// ── 4. iOS-5b: persona by persona, by tab, More, deep link and notification tap ──

/** The tab navigator exactly as AppTabs.tsx configures it: this role's tabs (appTabs), Home first. */
function tabsFor(role) {
  const routeNames = appTabs(role).map((t) => t.name);
  const router = TabRouter({ initialRouteName: 'HomeTab', backBehavior: 'firstRoute' });
  const options = { routeNames, routeParamList: Object.fromEntries(routeNames.map((n) => [n, undefined])), routeGetIdList: {} };
  return { router, options, state: router.getInitialState(options) };
}

/**
 * Where a tab's stack lands when the tab is opened with `screen` (navigate('<Tab>', { screen })), as
 * useNavigationBuilder applies it: on the stack's FIRST visit the param becomes a partial state that the router
 * rehydrates (an unregistered name is dropped, so the root shows); on a LATER visit it becomes navigate(screen), which an
 * unregistered name leaves unhandled, so the stack stays where it was. Both are run; the later visit starts at the root.
 */
function landings(tab, role, screen) {
  const params = paramsFor(screen);
  const first = stackFor(tab, role);
  const firstVisit = first.router.getRehydratedState({ stale: true, routes: [{ name: screen, params }] }, first.options);
  const later = stackFor(tab, role);
  const laterVisit = later.router.getStateForAction(later.state, CommonActions.navigate(screen, params), later.options) ?? later.state;
  return [firstVisit, laterVisit].map((s) => s.routes[s.index ?? s.routes.length - 1].name);
}

const LINKS = [
  `${APP_ORIGIN}/kb`,
  `${APP_ORIGIN}/kb/articles/reset-your-vpn`,
  `${APP_ORIGIN}/knowledge/9`,
  `${APP_ORIGIN}/knowledge-base/reset-your-vpn`,
  `${APP_ORIGIN}/announcements`,
  `${APP_ORIGIN}/announcements/123`,
  // Ticket links do open in the app: in the TicketLink resolver, never a KB or announcements screen.
  `${APP_ORIGIN}/ticket/19421`,
  `${APP_ORIGIN}/tickets/3f2a8a4e-1c2b-4c3d-8e9f-0a1b2c3d4e5f`,
  '#19421',
];

const NOTIFICATION_TYPES = ['TICKET_ASSIGNED', 'TICKET_UPDATED', 'TICKET_RESOLVED', 'SLA_WARNING', 'SLA_BREACHED', 'COMMENT_ADDED', 'MENTION'];
const PENDING_SETS = [
  undefined,
  [],
  [{ id: 'apr-1', entityType: 'ticket', entityId: 't-1' }],
  [{ id: 'apr-2', entityType: 'service_request', entityId: 't-1' }],
];

/** Every screen a person can land on from each of the four channels. */
function reachable(role) {
  const by = { tab: new Set(), more: new Set(), deepLink: new Set(), notification: new Set() };

  // Tab: the tab bar's own buttons, a navigate() naming a module route at tab level, and each tab opened with `screen`.
  const tabs = tabsFor(role);
  for (const tab of tabs.options.routeNames) {
    by.tab.add(tab);
    for (const screen of stackRoutes(tab, role)) by.tab.add(screen);
    for (const route of ADMIN_ONLY) {
      if (tabs.router.getStateForAction(tabs.state, CommonActions.navigate(route), tabs.options)) by.tab.add(route);
      const opened = tabs.router.getStateForAction(tabs.state, CommonActions.navigate(tab, { screen: route }), tabs.options);
      assert.ok(opened, `${tab} itself opens`);
      for (const landed of landings(tab, role, route)) by.tab.add(landed);
    }
  }

  // More: every row, with 0–3 approvals waiting, opened in the More stack.
  const ROW_ROUTE = moreRowRoutes();
  for (const pending of [0, 1, 2, 3]) {
    for (const row of moreSections(role, pending).flatMap((s) => s.items)) {
      for (const landed of landings('MoreTab', role, ROW_ROUTE[row])) by.more.add(landed);
    }
  }

  // Deep link: a link tapped in server HTML or pasted into search, in each tab (null: a sheet or sign-in on top).
  for (const link of LINKS) {
    for (const tab of [...TABS, null]) {
      const destination = ticketLinkDestination(link, tab);
      if (destination) for (const landed of landings(destination.tab, role, 'TicketLink')) by.deepLink.add(landed);
    }
  }

  // Notification tap: every type, with and without a ticket, with and without a pending approval; opened in Alerts.
  for (const type of NOTIFICATION_TYPES) {
    for (const ticketId of ['t-1', null, '', undefined]) {
      for (const pending of PENDING_SETS) {
        const destination = notificationDestination({ type, ticketId }, pending);
        if (destination) for (const landed of landings('AlertsTab', role, destination.route)) by.notification.add(landed);
      }
    }
  }
  return by;
}

describe('KB and announcements: no non-ADMIN persona can reach them by tab, More, deep link or notification tap (iOS-5b)', () => {
  for (const name of NON_ADMIN) {
    test(`${name}: no tab, More row, deep link or notification tap reaches KnowledgeBase, KbArticle or Announcements`, () => {
      const by = reachable(PERSONAS[name].role);
      for (const [channel, screens] of Object.entries(by)) {
        for (const route of ADMIN_ONLY) assert.equal(screens.has(route), false, `${channel} reaches ${route}`);
      }
      // Not vacuous: each channel does land somewhere.
      assert.ok(by.tab.has('HomeTab') && by.tab.has('More'), 'tabs');
      assert.ok(by.more.has('TaskList') && by.more.has('ServiceCatalog') && by.more.has('Profile'), 'More rows');
      assert.deepEqual([...by.deepLink].sort(), ['TicketLink'], 'deep links open only the ticket-link resolver');
      assert.deepEqual([...by.notification].sort(), ['ApprovalDetail', 'TicketDetail'], 'notifications open only a ticket or an approval');
      // And the Home banner, the fifth way in on Android, is not shown.
      assert.equal(showAnnouncementBanner(PERSONAS[name].role), false);
    });
  }

  test('ADMIN (control): the tab and More paths do reach all three, so the checks above can fail; links and notifications never do', () => {
    const by = reachable('ADMIN');
    for (const route of ADMIN_ONLY) assert.ok(by.tab.has(route), `tab: ${route}`);
    assert.ok(by.more.has('KnowledgeBase') && by.more.has('Announcements'), 'More rows');
    assert.deepEqual([...by.deepLink].sort(), ['TicketLink']);
    assert.deepEqual([...by.notification].sort(), ['ApprovalDetail', 'TicketDetail']);
    assert.ok(STACK_ROUTES.MoreTab.includes('KbArticle'), 'the article is reached from the list, inside the More stack');
  });
});
