// Knowledge base and Announcements: ADMIN only (Ronit, 2026-10-29). A product decision to simplify the mobile app, not a
// 🔒 SAFER case: on the web every role has both in the sidebar and they work there (docs/WEB-VS-MOBILE-ROLES.md §5a).
//
// For END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin:
//   1. which drawer rows appear: only ADMIN gets "Knowledge base" and "Announcements";
//   2. that no other role can REACH either route by any path: the drawer does not register them, so React Navigation's
//      own drawer router (the installed @react-navigation/routers, run here) refuses every action that names them;
//   3. that no other entry point remains: every place in src/ that names either route, the Home banner and its
//      "Read more", the ANN-1 read behind it, URL deep links and links tapped inside server HTML.
// What is real: the app's permission module, its deep-link parser and React Navigation's router. What is read as text:
// the screens and navigators, which need a phone to render.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, DrawerActions, DrawerRouter, StackActions } from '@react-navigation/routers';

import { APP_ORIGIN, parseTicketLink } from '../../src/utils/deep-links.ts';
import {
  canReadAnnouncements, canUseKnowledgeBase, drawerItems, drawerRoutes, showAnnouncementBanner,
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

const ADMIN_ONLY = ['Knowledge', 'Announcements'];
const NON_ADMIN = NAMES.filter((name) => name !== 'ADMIN');

// ── 1. Drawer rows ───────────────────────────────────────────

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

  test('the two rows open the two ADMIN-only routes (DrawerContent.tsx), and rows come only from drawerItems()', () => {
    const src = read('src/navigation/DrawerContent.tsx');
    assert.match(src, /knowledge: \{ label: 'Knowledge base', icon: '[\w-]+', route: 'Knowledge' \}/);
    assert.match(src, /announcements: \{ label: 'Announcements', icon: '[\w-]+', route: 'Announcements' \}/);
    assert.match(src, /const rows: DrawerRow\[\] = drawerItems\(role, pendingApprovals\)\.map\(/);
  });
});

// ── 2. Routes: registered for ADMIN only, so unreachable for anyone else ──

/** DrawerContent's DRAWER_ROWS: each row's route (pinned by the source test above and by service-catalog.test.mjs). */
const ROW_ROUTE = { approvals: 'Approvals', tasks: 'Tasks', knowledge: 'Knowledge', catalog: 'Catalog', announcements: 'Announcements', settings: 'Profile' };

/** The App drawer exactly as AppDrawer.tsx configures it, for this role's registered routes. */
function drawerFor(role) {
  const router = DrawerRouter({ initialRouteName: 'MainTabs', backBehavior: 'fullHistory' });
  const routeNames = drawerRoutes(role);
  const options = { routeNames, routeParamList: Object.fromEntries(routeNames.map((n) => [n, undefined])), routeGetIdList: {} };
  return { router, options, state: router.getInitialState(options) };
}

/** Every action that could put `name` on screen: what a row, a banner, a nested `screen` param or a reset would send. */
function actionsTo(name) {
  return {
    'navigate(name)': CommonActions.navigate(name),
    'navigate(name, { screen })': CommonActions.navigate(name, name === 'Knowledge' ? { screen: 'KbArticle', params: { slug: 'vpn' } } : undefined),
    'navigate(name) with pop (as the drawer rows send it)': CommonActions.navigate(name, { screen: 'KnowledgeBase' }, { pop: true }),
    'jumpTo(name)': DrawerActions.jumpTo(name),
    'push(name)': StackActions.push(name),
    'replace(name)': StackActions.replace(name),
    'preload(name)': CommonActions.preload(name),
    'reset to a state that contains it': CommonActions.reset({ index: 1, routes: [{ name: 'MainTabs' }, { name }] }),
  };
}

describe('KB and announcements: the routes exist for ADMIN only', () => {
  const ALL = ['MainTabs', 'Approvals', 'Tasks', 'Catalog', 'Profile'];
  forEachPersona(
    'routes the drawer registers',
    {
      END_USER: ALL,
      AGENT: ALL,
      TRIAGE_AGENT: ALL,
      L2_MANAGER: ALL,
      ADMIN: ['MainTabs', 'Approvals', 'Tasks', 'Knowledge', 'Catalog', 'Announcements', 'Profile'],
    },
    (p) => drawerRoutes(p.role),
  );

  test('a role the app does not know gets neither route', () => {
    for (const name of ADMIN_ONLY) assert.equal(drawerRoutes('GUEST').includes(name), false, name);
  });

  test('every drawer row a person sees opens a route that is registered for them (no dead row)', () => {
    for (const name of NAMES) {
      for (const pending of [0, 1]) {
        const routes = drawerRoutes(PERSONAS[name].role);
        for (const row of drawerItems(PERSONAS[name].role, pending)) assert.ok(routes.includes(ROW_ROUTE[row]), `${name}: ${row}`);
      }
    }
  });

  for (const name of NON_ADMIN) {
    test(`${name}: React Navigation's drawer router refuses every way to open Knowledge or Announcements`, () => {
      const { router, options, state } = drawerFor(PERSONAS[name].role);
      for (const route of ADMIN_ONLY) {
        for (const [label, action] of Object.entries(actionsTo(route))) {
          // null = "not handled": React Navigation then offers the action to the parent (the root stack, which has only
          // Auth and App) and, unhandled there too, drops it. Nothing changes on screen.
          assert.equal(router.getStateForAction(state, action, options), null, `${route}: ${label}`);
        }
      }
    });

    test(`${name}: a saved or stale navigation state naming either route is rehydrated without it`, () => {
      const { router, options } = drawerFor(PERSONAS[name].role);
      for (const route of ADMIN_ONLY) {
        const rehydrated = router.getRehydratedState({ stale: true, index: 1, routes: [{ name: 'MainTabs' }, { name: route }] }, options);
        assert.deepEqual(rehydrated.routes.filter((r) => ADMIN_ONLY.includes(r.name)), [], route);
        assert.equal(rehydrated.routes[rehydrated.index].name, 'MainTabs', route);
      }
    });

    test(`${name}: walking every other route and back never puts either route in the history`, () => {
      const { router, options } = drawerFor(PERSONAS[name].role);
      let { state } = drawerFor(PERSONAS[name].role);
      for (const route of [...options.routeNames, ...ADMIN_ONLY, ...options.routeNames.slice().reverse()]) {
        state = router.getStateForAction(state, CommonActions.navigate(route), options) ?? state;
      }
      for (let i = 0; i < 20; i++) state = router.getStateForAction(state, CommonActions.goBack(), options) ?? state;
      const seen = [...state.routes.map((r) => r.name), ...(state.history ?? []).map((h) => h.key ?? '')];
      for (const route of ADMIN_ONLY) assert.equal(seen.some((s) => s === route || s.startsWith(`${route}-`)), false, route);
    });
  }

  test('ADMIN: the same actions do open both routes (the gate is the role, not a broken route)', () => {
    const { router, options, state } = drawerFor('ADMIN');
    for (const route of ADMIN_ONLY) {
      for (const label of ['navigate(name)', 'navigate(name, { screen })', 'jumpTo(name)']) {
        const next = router.getStateForAction(state, actionsTo(route)[label], options);
        assert.ok(next, `${route}: ${label}`);
        assert.equal(next.routes[next.index].name, route, `${route}: ${label}`);
      }
    }
  });

  test('AppDrawer.tsx registers exactly drawerRoutes(role): no screen is registered by hand', () => {
    const src = read('src/navigation/AppDrawer.tsx');
    assert.match(src, /\{drawerRoutes\(role\)\.map\(\(name\) => \(\s*<Drawer\.Screen key=\{name\} name=\{name\} component=\{DRAWER_SCREENS\[name\]\} \/>/);
    assert.doesNotMatch(src, /<Drawer\.Screen[^>]*name="/, 'a literal registration would bypass drawerRoutes()');
    assert.match(src, /\n {2}Knowledge: KnowledgeStack,\n/);
    assert.match(src, /\n {2}Announcements: AnnouncementsScreen,\n/);
    assert.match(src, /const role = useAuthStore\(\(s\) => s\.user\?\.role\) \?\? 'END_USER';/);
  });

  test('no other navigator registers them: the KB screens live only in KnowledgeStack, used only by AppDrawer', () => {
    const registrations = SRC.filter((rel) => /name="(Knowledge|KnowledgeBase|KbArticle|Announcements)"/.test(read(rel)));
    assert.deepEqual(registrations, ['src/navigation/ModuleStacks.tsx']);
    const stacks = read('src/navigation/ModuleStacks.tsx');
    const knowledgeStack = /export function KnowledgeStack\(\) \{[\s\S]*?\n\}\n/.exec(stacks)?.[0] ?? '';
    assert.match(knowledgeStack, /<Knowledge\.Screen name="KnowledgeBase"/);
    assert.match(knowledgeStack, /<Knowledge\.Screen name="KbArticle"/);
    assert.equal((stacks.match(/name="(KnowledgeBase|KbArticle)"/g) ?? []).length, 2, 'registered once each, inside KnowledgeStack');

    const users = (word) => SRC.filter((rel) => new RegExp(`\\b${word}\\b`).test(read(rel)));
    assert.deepEqual(users('KnowledgeStack'), ['src/navigation/AppDrawer.tsx', 'src/navigation/ModuleStacks.tsx']);
    assert.deepEqual(users('AnnouncementsScreen'), ['src/navigation/AppDrawer.tsx', 'src/screens/dashboard/AnnouncementsScreen.tsx']);
    assert.deepEqual(users('KnowledgeBaseScreen'), ['src/navigation/ModuleStacks.tsx', 'src/screens/knowledge/KnowledgeBaseScreen.tsx']);
    assert.deepEqual(users('KbArticleScreen'), ['src/navigation/ModuleStacks.tsx', 'src/screens/knowledge/KbArticleScreen.tsx']);
  });
});

// ── 3. Every entry point ─────────────────────────────────────

describe('KB and announcements: no entry point remains for anyone but ADMIN', () => {
  test('only three places in src/ navigate to either module, each behind the ADMIN rule', () => {
    const NAV = /navigate\(\s*['"](Knowledge|KnowledgeBase|KbArticle|Announcements)['"]|screen:\s*['"](Knowledge|KnowledgeBase|KbArticle|Announcements)['"]/;
    assert.deepEqual(SRC.filter((rel) => NAV.test(read(rel))), [
      // The drawer rows: drawerItems() (above).
      'src/navigation/DrawerContent.tsx',
      // The Home banner's "Read more": shown only when showAnnouncementBanner() (below).
      'src/screens/dashboard/HomeScreen.tsx',
      // List → article, inside the Knowledge stack, which exists for ADMIN only.
      'src/screens/knowledge/KnowledgeBaseScreen.tsx',
    ]);
    // The drawer's generic `navigate(route)` only ever receives a row's route.
    assert.match(read('src/navigation/DrawerContent.tsx'), /onPress: go\(DRAWER_ROWS\[item\]\.route\)/);
    assert.match(read('src/navigation/DrawerContent.tsx'), /default:\n\s+navigation\.navigate\(route\);/);
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
    // No `linking` config: the OS never maps a URL to a screen (ask A18). The app's URL schemes are for sign-in only.
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
    }
    assert.doesNotMatch(read('src/navigation/navigationRef.ts'), /Knowledge|Announcements|KbArticle/);
  });

  test('screens and navigators still decide nothing by role themselves', () => {
    for (const rel of ['src/navigation/AppDrawer.tsx', 'src/screens/dashboard/HomeScreen.tsx', 'src/hooks/useAnnouncements.ts']) {
      assert.doesNotMatch(read(rel), /['"]ADMIN['"]/, rel);
    }
  });
});
