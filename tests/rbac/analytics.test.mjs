// Analytics (2026-11-26, Ronit's brief): three ADMIN-only screens built against docs/ANALYTICS-BACKEND.md ("18"), a
// contract the backend has NOT deployed. For END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin:
//   1. the drawer row: ADMIN only, directly below Audit log;
//   2. that no other role can REACH any of the three screens: the drawer does not register the Analytics stack, so
//      React Navigation's own router refuses every action, nested ones included, and drops it from saved state;
//   3. that no ANL request fires for them: the hooks' own query options, run by TanStack's own observers, send nothing
//      (not even on a manual refetch), and send for ADMIN only; staleTime ≥ 5 min, no polling, no refetch on focus;
//   4. the requests through the real axios client: allow-listed params, and an HTML answer (404, or index.html with
//      200) read as "not deployed", while a JSON error is a real failure;
//   5. tolerant reading: a missing section or a wrong-typed field is left out, never a throw, never a zero;
//   6. what each section shows: a missing number leaves its tile out, a zero shows "0", the adoption percentage, the
//      Play heading with every Play figure, the audit log's action labels;
//   7. the screens (read as text: they need a phone to render), and the version;
//   8. (2026-11-27) screen two's search, on the phone: every page loaded on opening, one at a time, to the cap, through
//      TanStack's own observer and the hook's own load step; found on a later page, by name or email; the cap line and
//      the "incomplete" line; typing, reopening and the cache asking for nothing; option-search.ts's one rule.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, DrawerActions, DrawerRouter, StackActions } from '@react-navigation/routers';
import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/query-core';
import { AxiosHeaders } from 'axios';

import {
  ANALYTICS_PAGE_SIZE, NOT_DEPLOYED, getAnalyticsInstalls, getAnalyticsOverview, listAnalyticsUserActivity,
  listAnalyticsUsers, readActivityPage, readInstalls, readOverview, readUsersPage,
} from '../../src/api/analytics.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { ApiClientError } from '../../src/api/errors.ts';
import { normaliseLoosePage } from '../../src/api/pagination.ts';
import {
  ANALYTICS_LIST_CAP, ANALYTICS_MAX_PAGES, ANALYTICS_STALE_TIME_MS, analyticsAllowed, installsQuery, keepFirstPage,
  loadNextPageIfDue, looseListState, overviewQuery, userActivityQuery, userRowKey, usersQuery,
} from '../../src/hooks/useAnalytics.ts';
import { useAuthStore } from '../../src/store/auth.store.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import {
  ANALYTICS_RANGE_OPTIONS, ANALYTICS_SORT_OPTIONS, DEFAULT_ANALYTICS_RANGE, DEFAULT_ANALYTICS_SORT, actionBars, actionsTotal,
  adoptionLine, adoptionPercent, analyticsActionLabel, countryBars, filterPeople, formatCount, isInactiveInPeriod,
  lastActionSentence, lastSeenDateLine, peopleCount, peopleCoverage, peopleSearchAnnouncement, peopleTiles,
  personActivityLine, personChips, personCountTiles, personCountsLine, personRoleLabel, playHeading, playSection,
} from '../../src/utils/analytics.ts';
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, auditActionLabel } from '../../src/utils/audit-log.ts';
import { filterByText, filterOptionsByLabel, noOptionMatchText } from '../../src/utils/option-search.ts';
import { canViewAnalytics, drawerItems, drawerRoutes } from '../../src/utils/permissions.ts';
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
const NON_ADMIN = NAMES.filter((name) => name !== 'ADMIN');
const ONLY_ADMIN = { END_USER: false, AGENT: false, TRIAGE_AGENT: false, L2_MANAGER: false, ADMIN: true };
const SCREENS = {
  overview: 'src/screens/analytics/AnalyticsScreen.tsx',
  users: 'src/screens/analytics/AnalyticsUsersScreen.tsx',
  person: 'src/screens/analytics/AnalyticsPersonScreen.tsx',
};

// The spec's own example bodies (18 §4a, §4b, §6d).
const OVERVIEW = {
  range: 'last30', from: '2026-10-20T00:00:00.000Z', to: '2026-11-19T23:59:59.999Z',
  users: { activeToday: 48, activeThisMonth: 212, totalWithAccess: 1631, newThisPeriod: 34 },
  devices: {
    registered: 187, activeThisMonth: 160,
    byCountry: [{ countryId: 'c-tz', country: 'Tanzania', devices: 74 }, { countryId: 'c-zm', country: 'Zambia', devices: 52 }],
  },
  logins: { mobile: 1420, web: 3890 },
  actions: { total: 8740, byType: [{ action: 'COMMENTED', count: 3120 }, { action: 'STATUS_CHANGED', count: 2240 }] },
};
const INSTALLS = {
  range: 'last30', from: '2026-10-20', to: '2026-11-19', dataThrough: '2026-11-17',
  totals: { installs: 142, uninstalls: 18, netGrowth: 124, growthRatePercent: 8.4, currentInstalls: 1598, activeDevices: 1204, audienceSize: 1598 },
  crashRatePercent: 0.42,
  byCountry: [{ country: 'Tanzania', installs: 61, uninstalls: 7, currentInstalls: 640 }],
  daily: [{ date: '2026-11-17', installs: 6, uninstalls: 1, activeDevices: 1204 }],
};
const USER_ROW = {
  userId: 'u-grace', name: 'Grace Banda', email: 'grace.banda@example.test', role: 'AGENT', country: 'Zambia',
  lastSeenAt: '2026-11-19T09:42:00.000Z', lastAction: { type: 'STATUS_CHANGED', ticketNumber: 10482, at: '2026-11-19T09:42:00.000Z' },
  actionsInPeriod: 184, loginsInPeriod: 22, daysActiveInPeriod: 17, hasMobileApp: true,
};
const USERS_PAGE = { page: 1, limit: 50, total: 212, rows: [USER_ROW] };
const AUDIT_ENTRY = {
  id: 'e-1', ticketId: 't-1', actorId: 'u-grace', action: 'STATUS_CHANGED', entityType: 'Ticket', entityId: 't-1',
  oldValues: { status: 'OPEN' }, newValues: { status: 'RESOLVED' }, ipAddress: '10.0.0.1', createdAt: '2026-11-19T09:42:00.000Z',
  actor: { id: 'u-grace', displayName: 'Grace Banda', email: 'grace.banda@example.test' },
  ticket: { id: 't-1', ticketNumber: 10482, title: 'Printer' },
};
const ACTIVITY_PAGE = { data: [AUDIT_ENTRY], total: 1, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false };

// ── 1. The drawer row ────────────────────────────────────────

describe('Analytics: the drawer row (ADMIN only)', () => {
  forEachPersona('canViewAnalytics', ONLY_ADMIN, (p) => canViewAnalytics(p.role));
  forEachPersona('drawer row shown', ONLY_ADMIN, (p) => drawerItems(p.role).includes('analytics'));

  test('ADMIN: directly below Audit log, before Settings', () => {
    const rows = drawerItems('ADMIN');
    assert.equal(rows.indexOf('analytics'), rows.indexOf('auditLog') + 1);
    assert.equal(rows.indexOf('settings'), rows.indexOf('analytics') + 1);
  });

  test('a role the app does not know gets neither the row nor the route', () => {
    assert.equal(canViewAnalytics('GUEST'), false);
    assert.equal(drawerItems('GUEST').includes('analytics'), false);
    assert.equal(drawerRoutes('GUEST').includes('Analytics'), false);
    assert.equal(analyticsAllowed('GUEST'), false);
    assert.equal(analyticsAllowed(undefined), false);
    assert.equal(analyticsAllowed(null), false);
  });

  test('the row is "Analytics", opens the Analytics stack at its first screen, right after the Audit log row', () => {
    const src = read('src/navigation/DrawerContent.tsx');
    assert.match(
      src,
      /auditLog: \{ label: 'Audit log', [^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*analytics: \{ label: 'Analytics', icon: '[\w-]+', route: 'Analytics' \},/,
    );
    assert.match(src, /case 'Analytics':\s*navigation\.navigate\('Analytics', \{ screen: 'AnalyticsOverview', pop: true \}\);/);
    assert.match(src, /const rows: DrawerRow\[\] = drawerItems\(role\)\.map\(/);
  });

  test('no inline role check: the gate is canViewAnalytics in permissions.ts, used by every analytics file', () => {
    const files = [...Object.values(SCREENS), 'src/hooks/useAnalytics.ts', 'src/screens/analytics/AnalyticsParts.tsx',
      'src/api/analytics.api.ts', 'src/utils/analytics.ts'];
    for (const rel of files) assert.doesNotMatch(read(rel), /role\s*[!=]==\s*['"]|\.role\s*[!=]==/, rel);
    for (const rel of [...Object.values(SCREENS), 'src/hooks/useAnalytics.ts']) assert.match(read(rel), /canViewAnalytics\(/, rel);
    assert.match(read('src/utils/permissions.ts'), /export function canViewAnalytics\(role: UserRole\): boolean \{\s*return role === 'ADMIN';\s*\}/);
  });
});

// ── 2. The route: registered for ADMIN only, unreachable for the other four ──

function drawerFor(role) {
  const router = DrawerRouter({ initialRouteName: 'MainTabs', backBehavior: 'fullHistory' });
  const routeNames = drawerRoutes(role);
  const options = { routeNames, routeParamList: Object.fromEntries(routeNames.map((n) => [n, undefined])), routeGetIdList: {} };
  return { router, options, state: router.getInitialState(options) };
}

const PERSON_PARAMS = { userId: 'u-grace', person: USER_ROW };
/** Every action that could put an Analytics screen on show: a row, a link, a nested target, a reset, a stale entry. */
const ACTIONS = {
  'navigate(Analytics)': CommonActions.navigate('Analytics'),
  'navigate(Analytics) with pop': CommonActions.navigate('Analytics', { screen: 'AnalyticsOverview' }, { pop: true }),
  'navigate(Analytics › AnalyticsUsers)': CommonActions.navigate('Analytics', { screen: 'AnalyticsUsers' }),
  'navigate(Analytics › AnalyticsPerson)': CommonActions.navigate('Analytics', { screen: 'AnalyticsPerson', params: PERSON_PARAMS }),
  'navigate(AnalyticsOverview)': CommonActions.navigate('AnalyticsOverview'),
  'navigate(AnalyticsUsers)': CommonActions.navigate('AnalyticsUsers'),
  'navigate(AnalyticsPerson)': CommonActions.navigate('AnalyticsPerson', PERSON_PARAMS),
  'jumpTo(Analytics)': DrawerActions.jumpTo('Analytics'),
  'push(Analytics)': StackActions.push('Analytics'),
  'push(AnalyticsPerson)': StackActions.push('AnalyticsPerson', PERSON_PARAMS),
  'replace(Analytics)': StackActions.replace('Analytics'),
  'preload(Analytics)': CommonActions.preload('Analytics'),
  'reset to a state that contains it': CommonActions.reset({
    index: 1,
    routes: [{ name: 'MainTabs' }, { name: 'Analytics', state: { index: 0, routes: [{ name: 'AnalyticsPerson', params: PERSON_PARAMS }] } }],
  }),
};

describe('Analytics: the route (the whole stack of three screens)', () => {
  forEachPersona('registered', ONLY_ADMIN, (p) => drawerRoutes(p.role).includes('Analytics'));

  for (const name of NON_ADMIN) {
    test(`${name}: React Navigation's drawer router refuses every way to open any Analytics screen`, () => {
      const { router, options, state } = drawerFor(PERSONAS[name].role);
      for (const [label, action] of Object.entries(ACTIONS)) {
        // null = not handled: offered to the root stack (Auth, App only), unhandled there too, and dropped.
        assert.equal(router.getStateForAction(state, action, options), null, label);
      }
    });

    test(`${name}: a saved or stale navigation state naming Analytics (any screen) is rehydrated without it`, () => {
      const { router, options } = drawerFor(PERSONAS[name].role);
      const stale = {
        stale: true,
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'Analytics', state: { index: 2, routes: [{ name: 'AnalyticsOverview' }, { name: 'AnalyticsUsers' }, { name: 'AnalyticsPerson', params: PERSON_PARAMS }] } },
        ],
      };
      const rehydrated = router.getRehydratedState(stale, options);
      assert.deepEqual(rehydrated.routes.filter((r) => r.name === 'Analytics'), []);
      assert.equal(rehydrated.routes[rehydrated.index].name, 'MainTabs');
    });
  }

  test('ADMIN: the row\'s action does open it, at any of its screens (the gate is the role, not a broken route)', () => {
    const { router, options, state } = drawerFor('ADMIN');
    for (const label of ['navigate(Analytics)', 'jumpTo(Analytics)', 'navigate(Analytics › AnalyticsPerson)']) {
      const next = router.getStateForAction(state, ACTIONS[label], options);
      assert.ok(next, label);
      assert.equal(next.routes[next.index].name, 'Analytics', label);
    }
  });

  test('AppDrawer.tsx registers the stack only through drawerRoutes(role); the stack holds exactly the three screens', () => {
    const drawer = read('src/navigation/AppDrawer.tsx');
    assert.match(drawer, /\n {2}Analytics: AnalyticsStack,\n/);
    assert.match(drawer, /\{drawerRoutes\(role\)\.map\(\(name\) => \(\s*<Drawer\.Screen key=\{name\} name=\{name\} component=\{DRAWER_SCREENS\[name\]\} \/>/);
    const stacks = read('src/navigation/ModuleStacks.tsx');
    const body = stacks.slice(stacks.indexOf('export function AnalyticsStack'));
    assert.deepEqual([...body.matchAll(/<Analytics\.Screen name="(\w+)"/g)].map((m) => m[1]), ['AnalyticsOverview', 'AnalyticsUsers', 'AnalyticsPerson']);
    assert.deepEqual(SRC.filter((rel) => /\bAnalyticsStack\b/.test(read(rel))), ['src/navigation/AppDrawer.tsx', 'src/navigation/ModuleStacks.tsx']);
    for (const [component, file] of [['AnalyticsScreen', SCREENS.overview], ['AnalyticsUsersScreen', SCREENS.users], ['AnalyticsPersonScreen', SCREENS.person]]) {
      const users = SRC.filter((rel) => new RegExp(`\\b${component}\\b`).test(read(rel))).sort();
      assert.deepEqual(users, ['src/navigation/ModuleStacks.tsx', file].sort(), component);
    }
  });

  test('nothing navigates there but the drawer row, and each screen only from the one before it', () => {
    const to = (screen) => new RegExp(`navigate\\(\\s*['"]${screen}['"]|screen:\\s*['"]${screen}['"]`);
    assert.deepEqual(SRC.filter((rel) => to('Analytics').test(read(rel))), ['src/navigation/DrawerContent.tsx']);
    assert.deepEqual(SRC.filter((rel) => to('AnalyticsOverview').test(read(rel))), ['src/navigation/DrawerContent.tsx']);
    assert.deepEqual(SRC.filter((rel) => to('AnalyticsUsers').test(read(rel))), [SCREENS.overview]);
    assert.deepEqual(SRC.filter((rel) => to('AnalyticsPerson').test(read(rel))), [SCREENS.users]);
  });

  test('no deep link and no saved navigation state exist to reach it: no linking config, no state persistence', () => {
    const root = read('src/navigation/RootNavigator.tsx');
    assert.doesNotMatch(root, /\blinking=/);
    for (const rel of SRC) assert.doesNotMatch(read(rel), /\binitialState=|\bonStateChange=/, rel);
    // The in-app link resolver opens tickets only.
    for (const rel of ['src/utils/deep-links.ts', 'src/navigation/navigationRef.ts', 'src/push/taps.ts']) {
      assert.doesNotMatch(read(rel), /Analytics/, rel);
    }
  });
});

// ── The network (faked), for sections 3 and 4 ────────────────

const sent = [];
let routes;
const JSON_OK = (body) => ({ status: 200, type: 'application/json; charset=utf-8', body: JSON.stringify(body) });
const HTML = (status) => ({ status, type: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><body>index</body></html>' });
const JSON_ERROR = (status, error) => ({ status, type: 'application/json; charset=utf-8', body: JSON.stringify({ error }) });
const DEFAULT_ANSWERS = {
  '/analytics/overview': JSON_OK(OVERVIEW),
  '/analytics/installs': JSON_OK(INSTALLS),
  '/analytics/users': JSON_OK(USERS_PAGE),
  '/analytics/users/u-grace': JSON_OK(ACTIVITY_PAGE),
};

apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, params: { ...config.params }, auth: config.headers?.Authorization });
  // A route is an answer, or (section 8) a function of the request that answers it, possibly after a while.
  const route = routes[config.url];
  const answer = typeof route === 'function' ? await route(config) : route ?? HTML(404);
  const response = {
    status: answer.status,
    statusText: String(answer.status),
    headers: AxiosHeaders.from({ 'content-type': answer.type }),
    data: answer.body,
    config,
    request: {},
  };
  if (answer.status >= 200 && answer.status < 300) return response;
  const error = new Error(`Request failed with status code ${answer.status}`);
  Object.assign(error, { isAxiosError: true, response, config, toJSON: () => ({}) });
  throw error;
};
beforeEach(() => {
  sent.length = 0;
  routes = { ...DEFAULT_ANSWERS };
  useAuthStore.setState({ token: 'admin-session', user: PERSONAS.ADMIN, issuedAt: Date.now(), environment: 'UAT', isAuthenticated: true, isLoading: false });
});

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};

// ── 3. No query fires for anyone but ADMIN ───────────────────

/** The hooks' own options, exactly as useAnalytics*() build them, for a role. */
const QUERIES = {
  'ANL-1 overview': (allowed) => [QueryObserver, overviewQuery('last30', allowed)],
  'ANL-4 installs': (allowed) => [QueryObserver, installsQuery('last30', allowed)],
  'ANL-2 users': (allowed) => [InfiniteQueryObserver, usersQuery('last30', 'lastSeen', allowed)],
  'ANL-3 one person': (allowed) => [InfiniteQueryObserver, userActivityQuery('u-grace', 'last30', allowed)],
};

describe('Analytics: no ANL request is ever sent for another role (TanStack\'s observers, on the hooks\' options)', () => {
  for (const name of NAMES) {
    const admin = name === 'ADMIN';
    test(`${name}: mounting each query, then a manual refetch (Retry, pull-to-refresh), sends ${admin ? 'one request each' : 'NOTHING'}`, async () => {
      const allowed = analyticsAllowed(PERSONAS[name].role);
      assert.equal(allowed, admin);
      const quiet = console.error;
      console.error = () => {}; // TanStack's dev warning for a refetch of a skipToken query, the very case under test
      try {
        for (const [label, make] of Object.entries(QUERIES)) {
          const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
          const [Observer, options] = make(allowed);
          const observer = new Observer(client, options);
          const unsubscribe = observer.subscribe(() => {});
          await settle();
          assert.equal(sent.length, admin ? 1 : 0, `${label}: on mount`);
          await observer.refetch().catch(() => {});
          await settle();
          assert.equal(sent.length, admin ? 2 : 0, `${label}: after a manual refetch`);
          unsubscribe();
          client.clear();
          sent.length = 0;
        }
      } finally {
        console.error = quiet;
      }
    });
  }

  test('the hooks read the role from the session and pass it to every query', () => {
    const src = read('src/hooks/useAnalytics.ts');
    assert.match(src, /function useAnalyticsAllowed\(\): boolean \{\s*return analyticsAllowed\(useAuthStore\(\(s\) => s\.user\?\.role\)\);/);
    assert.equal(src.match(/const allowed = useAnalyticsAllowed\(\);/g)?.length, 4);
    assert.equal(src.match(/enabled: allowed,/g)?.length, 3);
    assert.equal(src.match(/: skipToken,/g)?.length, 3);
  });

  test('every screen refuses to render analytics for anyone else, after its hooks (defence in depth)', () => {
    for (const [key, rel] of Object.entries(SCREENS)) {
      const src = read(rel);
      const start = src.indexOf('export function Analytics');
      const gate = src.indexOf('if (!canViewAnalytics(role)) {', start);
      assert.ok(gate > start, `${key}: the gate is in the screen`);
      const end = src.indexOf('\n}\n', gate);
      assert.doesNotMatch(src.slice(gate, end), /\buse[A-Z]\w*\(/, `${key}: no hook runs after the early return`);
    }
  });

  test('ANL calls come from one module, and only the hooks call it; the hooks only from their screens', () => {
    assert.deepEqual(SRC.filter((rel) => /['"`]\/analytics\//.test(read(rel))), ['src/api/analytics.api.ts']);
    const callers = SRC.filter((rel) => /\b(getAnalyticsOverview|getAnalyticsInstalls|listAnalyticsUsers|listAnalyticsUserActivity)\(/.test(read(rel)));
    assert.deepEqual(callers, ['src/api/analytics.api.ts', 'src/hooks/useAnalytics.ts']);
    const uses = (hook) => SRC.filter((rel) => new RegExp(`\\b${hook}\\(`).test(read(rel))).filter((rel) => rel !== 'src/hooks/useAnalytics.ts');
    assert.deepEqual(uses('useAnalyticsOverview'), [SCREENS.overview]);
    assert.deepEqual(uses('useAnalyticsInstalls'), [SCREENS.overview]);
    assert.deepEqual(uses('useAnalyticsUsers'), [SCREENS.users]);
    assert.deepEqual(uses('useAnalyticsUserActivity'), [SCREENS.person]);
    // Nothing warms the cache: no prefetch of any query anywhere.
    for (const rel of SRC) assert.doesNotMatch(read(rel), /prefetch(Infinite)?Query|ensureQueryData|ensureInfiniteQueryData/, rel);
  });
});

describe('Analytics: cost (staleTime ≥ 5 minutes; no polling, timers or refetch on focus)', () => {
  test('all four queries: staleTime at least 5 minutes, and every automatic refetch off', () => {
    assert.ok(ANALYTICS_STALE_TIME_MS >= 5 * 60_000);
    for (const [label, make] of Object.entries(QUERIES)) {
      const [, options] = make(true);
      assert.ok(options.staleTime >= 5 * 60_000, label);
      assert.equal(options.refetchInterval, false, label);
      assert.equal(options.refetchOnWindowFocus, false, label);
      assert.equal(options.refetchOnReconnect, false, label);
      assert.equal(options.refetchOnMount, false, label);
    }
  });

  test('no timer, interval or focus listener in any analytics file; screen two\'s one focus effect only clears its search', () => {
    // 2026-11-27: the brief asks for the search field to clear when screen two loses focus. That is the one focus
    // effect in Analytics: its cleanup empties the field, and nothing in it asks the server for anything.
    const FIELD_CLEARS_ON_BLUR = "useFocusEffect(useCallback(() => () => setQuery(''), []));";
    const files = [...Object.values(SCREENS), 'src/screens/analytics/AnalyticsParts.tsx', 'src/hooks/useAnalytics.ts', 'src/api/analytics.api.ts', 'src/utils/analytics.ts'];
    for (const rel of files) {
      let src = read(rel);
      if (rel === SCREENS.users) {
        assert.equal(src.match(/useFocusEffect\(/g)?.length, 1, 'screen two: one focus effect');
        assert.ok(src.includes(FIELD_CLEARS_ON_BLUR), 'screen two: it only clears the field');
        src = src.replace(FIELD_CLEARS_ON_BLUR, '').replace("import { useFocusEffect } from '@react-navigation/native';", '');
      }
      assert.doesNotMatch(src, /setInterval|setTimeout|refetchInterval:\s*\d|useFocusEffect|useIsFocused|addListener\(\s*['"]focus/, rel);
    }
    // The match count is read out once typing pauses (useDebouncedValue, as OptionSheet): it speaks, and asks for nothing.
    const users = read(SCREENS.users);
    assert.match(users, /const settled = useDebouncedValue\(query, ANNOUNCE_AFTER_MS\);/);
    assert.doesNotMatch(users, /useAnalyticsUsers\([^)]*\b(query|settled)\b/);
  });

  test('lists page by 50, capped at 500: never all 1,631', () => {
    assert.equal(ANALYTICS_PAGE_SIZE, 50);
    assert.equal(ANALYTICS_LIST_CAP, 500);
    const [, users] = QUERIES['ANL-2 users'](true);
    const full = (page) => ({ deployed: true, data: { rows: Array.from({ length: 50 }, (_, i) => ({ userId: `u${page}-${i}` })), listed: true, page, limit: 50, total: 1631 } });
    const pages = Array.from({ length: 10 }, (_, i) => full(i + 1));
    assert.equal(users.getNextPageParam(pages[8], pages.slice(0, 9)), 10);
    assert.equal(users.getNextPageParam(pages[9], pages), undefined, 'the 10th page is the last one asked for');
    assert.equal(users.getNextPageParam(NOT_DEPLOYED, [NOT_DEPLOYED]), undefined, 'not deployed: nothing more to load');
  });

  test('the period is memory only: Last 30 days by default, back to it on sign-out (reset)', () => {
    assert.equal(DEFAULT_ANALYTICS_RANGE, 'last30');
    assert.equal(useUiStore.getState().analyticsRange, 'last30');
    useUiStore.getState().setAnalyticsRange('last90');
    assert.equal(useUiStore.getState().analyticsRange, 'last90');
    useUiStore.getState().reset();
    assert.equal(useUiStore.getState().analyticsRange, 'last30');
    assert.doesNotMatch(read('src/store/ui.store.ts'), /\bpersist\(|SecureStore|AsyncStorage/);
  });
});

// ── 4. The requests, through the real client ─────────────────

const CALLS = {
  'ANL-1': [() => getAnalyticsOverview({ range: 'last7' }), '/analytics/overview'],
  'ANL-4': [() => getAnalyticsInstalls({ range: 'last7' }), '/analytics/installs'],
  'ANL-2': [() => listAnalyticsUsers({ range: 'last7', page: 2, sortBy: 'name' }), '/analytics/users'],
  'ANL-3': [() => listAnalyticsUserActivity('u-grace', { range: 'last7', page: 2 }), '/analytics/users/u-grace'],
};

describe('Analytics: the requests (allow-listed params, Bearer token)', () => {
  test('each endpoint: its path, exactly its documented params, the Bearer token', async () => {
    await getAnalyticsOverview({ range: 'today' });
    await getAnalyticsInstalls({});
    await listAnalyticsUsers({ range: 'last90', page: 3, limit: 50, sortBy: 'actions' });
    await listAnalyticsUserActivity('u-grace', { range: 'last7', page: 2, limit: 20 });
    assert.deepEqual(sent.map(({ method, url, params }) => ({ method, url, params })), [
      { method: 'get', url: '/analytics/overview', params: { range: 'today' } },
      { method: 'get', url: '/analytics/installs', params: { range: 'last30' } },
      { method: 'get', url: '/analytics/users', params: { range: 'last90', page: 3, limit: 50, sortBy: 'actions' } },
      { method: 'get', url: '/analytics/users/u-grace', params: { range: 'last7', page: 2, limit: 20 } },
    ]);
    assert.ok(sent.every((r) => r.auth === 'Bearer admin-session'));
  });

  test('nothing undocumented is ever sent: no search, no unknown range or sort; limit ≤ 100; the id is one segment', async () => {
    await listAnalyticsUsers({ range: 'yesterday', sortBy: 'email', search: 'grace', q: 'x', page: 0, limit: 500 });
    assert.deepEqual(sent[0].params, { range: 'last30', page: 1, limit: 100 });
    routes['/analytics/users/a%2F..%2Fb'] = JSON_OK(ACTIVITY_PAGE);
    await listAnalyticsUserActivity('a/../b', {});
    assert.equal(sent[1].url, '/analytics/users/a%2F..%2Fb');
    await getAnalyticsOverview({ range: 'all', countryId: '' });
    assert.deepEqual(sent[2].params, { range: 'last30' });
  });

  test('the four ranges and three sorts are the spec\'s, with the screen\'s defaults', () => {
    assert.deepEqual(ANALYTICS_RANGE_OPTIONS.map((r) => r.value), ['today', 'last7', 'last30', 'last90']);
    assert.deepEqual(ANALYTICS_RANGE_OPTIONS.map((r) => r.label), ['Today', 'Last 7 days', 'Last 30 days', 'Last 90 days']);
    assert.deepEqual(ANALYTICS_SORT_OPTIONS.map((s) => [s.value, s.label]), [['lastSeen', 'Last seen'], ['actions', 'Most actions'], ['name', 'Name']]);
    assert.equal(DEFAULT_ANALYTICS_SORT, 'lastSeen');
  });
});

describe('Analytics: an HTML answer is "not deployed", never an error; a JSON error is a real failure', () => {
  for (const [id, [call, url]] of Object.entries(CALLS)) {
    test(`${id}: Express's HTML 404 → { deployed: false }, one request, no retry`, async () => {
      routes[url] = HTML(404);
      assert.deepEqual(await call(), NOT_DEPLOYED);
      assert.equal(sent.length, 1);
    });
    test(`${id}: the web app's index.html with 200 (production mode) → { deployed: false }`, async () => {
      routes[url] = HTML(200);
      assert.deepEqual(await call(), NOT_DEPLOYED);
    });
    test(`${id}: a JSON 404, 403 or 500, or a plain-text 429, is thrown for the error state`, async () => {
      for (const answer of [JSON_ERROR(404, 'User not found'), JSON_ERROR(403, 'Forbidden: insufficient role'), JSON_ERROR(500, 'Internal'), { status: 429, type: 'text/plain', body: 'Too many requests' }]) {
        routes[url] = answer;
        await assert.rejects(call(), (error) => error instanceof ApiClientError && error.status === answer.status, `${answer.status}`);
      }
    });
  }

  test('a not-deployed answer ends a list: no second page is asked for', () => {
    const [, users] = QUERIES['ANL-2 users'](true);
    assert.equal(users.getNextPageParam(NOT_DEPLOYED, [NOT_DEPLOYED]), undefined);
  });
});

// ── 5. Tolerant reading ──────────────────────────────────────

describe('Analytics: reading is tolerant (a missing or wrong field is left out, never a throw, never a zero)', () => {
  test('the spec\'s own examples are read in full', async () => {
    assert.deepEqual(readOverview(OVERVIEW), OVERVIEW);
    assert.deepEqual(readInstalls(INSTALLS), INSTALLS);
    assert.deepEqual(readUsersPage(USERS_PAGE, { page: 1, limit: 50 }), { page: 1, limit: 50, total: 212, rows: [USER_ROW], listed: true });
    const activity = readActivityPage(ACTIVITY_PAGE, { page: 1, limit: 50 });
    assert.equal(activity.listed, true);
    assert.deepEqual(activity.rows[0], { ...AUDIT_ENTRY, ipAddress: null });
    const overview = await getAnalyticsOverview({});
    assert.deepEqual(overview, { deployed: true, data: OVERVIEW });
  });

  test('an empty object: every section absent, nothing invented', () => {
    assert.deepEqual(readOverview({}), {});
    assert.deepEqual(readInstalls({}), {});
    assert.deepEqual(readUsersPage({}, { page: 2, limit: 50 }), { page: 2, limit: 50, total: null, rows: [], listed: false });
    assert.deepEqual(readActivityPage({}, { page: 1, limit: 50 }), { page: 1, limit: 50, total: null, rows: [], listed: false });
  });

  test('a wrong-typed field is dropped alone; a zero is kept; the rest of the response stands', () => {
    const read = readOverview({
      users: { activeToday: '48', activeThisMonth: 0, totalWithAccess: null, newThisPeriod: Number.NaN },
      devices: 'many',
      logins: { mobile: 0 },
      actions: { total: 12, byType: [{ action: 'COMMENTED', count: 0 }, 'junk', { action: 7, count: 3 }] },
      range: 'fortnight',
    });
    assert.deepEqual(read, {
      users: { activeThisMonth: 0 },
      logins: { mobile: 0 },
      actions: { total: 12, byType: [{ action: 'COMMENTED', count: 0 }, { count: 3 }] },
    });
  });

  test('a body that is not an object at all is the one shape error (as everywhere in the app)', () => {
    for (const body of [[], 'text', null, 42]) {
      assert.throws(() => readOverview(body), (e) => e instanceof ApiClientError && e.kind === 'shape');
      assert.throws(() => readInstalls(body), (e) => e instanceof ApiClientError && e.kind === 'shape');
      assert.throws(() => readUsersPage(body, { page: 1, limit: 50 }), (e) => e instanceof ApiClientError && e.kind === 'shape');
    }
  });

  test('ANL-2 rows: each field optional; a row with no fields at all is kept, junk items are dropped', () => {
    const page = readUsersPage({ rows: [{}, 'junk', { userId: 'u1', lastAction: null, hasMobileApp: 'yes', actionsInPeriod: 0 }], total: 'many' }, { page: 1, limit: 50 });
    assert.deepEqual(page.rows, [{}, { userId: 'u1', actionsInPeriod: 0 }]);
    assert.equal(page.total, null);
  });

  test('ANL-3 entries are made safe for the audit log\'s renderer: no id or action → dropped; bad actor/ticket → none', () => {
    const page = readActivityPage({
      data: [
        { action: 'COMMENTED' },
        { id: 'e2', action: 'LOGIN', actor: 'Grace', ticket: { ticketNumber: '10482' }, entityType: 5, createdAt: 'yesterday' },
      ],
    }, { page: 1, limit: 50 });
    assert.deepEqual(page.rows, [{
      id: 'e2', action: 'LOGIN', entityType: '', entityId: '', ticketId: null, actorId: null, oldValues: null, newValues: null,
      ipAddress: null, createdAt: '', actor: null, ticket: null,
    }]);
  });

  test('the loose page adapter: a total decides; without one, a full page means maybe more; no list means no more', () => {
    const rows = (n) => Array.from({ length: n }, (_, i) => i);
    assert.equal(normaliseLoosePage({ rows: rows(50), listed: true, page: 1, limit: 50, total: 212 }).hasNext, true);
    assert.equal(normaliseLoosePage({ rows: rows(12), listed: true, page: 5, limit: 50, total: 212 }).hasNext, false);
    assert.equal(normaliseLoosePage({ rows: rows(50), listed: true, page: 1, limit: 50, total: null }).hasNext, true);
    assert.equal(normaliseLoosePage({ rows: rows(49), listed: true, page: 1, limit: 50, total: null }).hasNext, false);
    assert.equal(normaliseLoosePage({ rows: [], listed: false, page: 1, limit: 50, total: 212 }).hasNext, false);
  });
});

// ── 6. What each section shows ───────────────────────────────

const NOW = Date.UTC(2026, 10, 26, 12, 0); // the fixtures' instants are UTC

describe('Analytics: a missing number leaves its tile out; a zero is a zero', () => {
  test('People: all four from the spec example, in order', () => {
    assert.deepEqual(peopleTiles(OVERVIEW).map((t) => [t.label, t.value]), [
      ['Active today', '48'], ['Active this month', '212'], ['Logins on Setu', '1,420'], ['New this period', '34'],
    ]);
  });

  test('People: each missing number drops its tile alone; zeros stay as "0"', () => {
    assert.deepEqual(peopleTiles({ users: { activeToday: 0 } }).map((t) => [t.key, t.value]), [['activeToday', '0']]);
    assert.deepEqual(peopleTiles({ users: { activeThisMonth: 5 }, logins: { web: 9 } }).map((t) => t.key), ['activeThisMonth']);
    assert.deepEqual(peopleTiles({}), []);
    assert.deepEqual(peopleTiles(null), []);
    for (const tile of peopleTiles({ users: { activeToday: 0, activeThisMonth: 0, newThisPeriod: 0 }, logins: { mobile: 0 } })) {
      assert.equal(tile.value, '0');
    }
  });

  test('no tile anywhere ever shows a dash or an empty value', () => {
    const all = [
      ...peopleTiles({ users: {} }), ...(playSection({ totals: {} })?.tiles ?? []), ...personCountTiles({}),
      ...peopleTiles(OVERVIEW), ...playSection(INSTALLS).tiles, ...playSection(INSTALLS).banner, ...personCountTiles(USER_ROW),
    ];
    for (const t of all) assert.match(t.value, /^[−-]?[\d,]+(\.\d+)?%?$/, t.key);
  });

  test('screen three\'s counts: each left out when missing, zero shown', () => {
    assert.deepEqual(personCountTiles(USER_ROW).map((t) => [t.label, t.value]), [['Actions', '184'], ['Logins', '22'], ['Days active', '17']]);
    assert.deepEqual(personCountTiles({ loginsInPeriod: 0 }).map((t) => [t.label, t.value]), [['Logins', '0']]);
    assert.deepEqual(personCountTiles(undefined), []);
  });
});

describe('Analytics: section 1, Google Play, always says how recent it is', () => {
  test('the spec example: the heading, the banner and the four tiles', () => {
    const play = playSection(INSTALLS);
    assert.equal(play.heading, 'Google Play · as at 17 Nov 2026');
    assert.deepEqual(play.banner.map((f) => [f.label, f.value]), [['Current installs', '1,598'], ['Active devices', '1,204']]);
    assert.deepEqual(play.tiles.map((f) => [f.label, f.value, f.note]), [
      ['Installs', '142', '+8.4%'], ['Uninstalls', '18', undefined], ['Audience', '1,598', undefined], ['Crash rate', '0.42%', undefined],
    ]);
  });

  test('dataThrough is in the heading whenever ANY Play figure shows, one figure at a time', () => {
    const FIGURES = [
      { totals: { currentInstalls: 1 } }, { totals: { activeDevices: 1 } }, { totals: { installs: 1 } },
      { totals: { uninstalls: 0 } }, { totals: { audienceSize: 1 } }, { crashRatePercent: 0 },
    ];
    for (const body of FIGURES) {
      const play = playSection({ ...body, dataThrough: '2026-11-17' });
      assert.ok(play, JSON.stringify(body));
      assert.equal(play.heading, 'Google Play · as at 17 Nov 2026', JSON.stringify(body));
      assert.equal(play.banner.length + play.tiles.length, 1);
    }
  });

  test('no dataThrough (or an unreadable one): "Google Play" alone, nothing about when', () => {
    assert.equal(playSection({ totals: { installs: 3 } }).heading, 'Google Play');
    assert.equal(playHeading(undefined), 'Google Play');
    assert.equal(playHeading('soon'), 'Google Play');
    assert.equal(readInstalls({ dataThrough: 'yesterday', totals: { installs: 3 } }).dataThrough, undefined);
  });

  test('a YYYY-MM-DD day is the phone\'s calendar day, not UTC midnight', () => {
    assert.equal(playHeading('2026-01-01'), 'Google Play · as at 01 Jan 2026');
  });

  test('no Play figure (or ANL-4 not deployed): the WHOLE section is absent', () => {
    assert.equal(playSection(null), null);
    assert.equal(playSection({}), null);
    assert.equal(playSection({ dataThrough: '2026-11-17', totals: { netGrowth: 5 }, byCountry: [], daily: [] }), null);
    assert.equal(playSection({ dataThrough: '2026-11-17', totals: { growthRatePercent: 8.4 } }), null, 'growth sits beside installs only');
  });

  test('growth is signed; a negative or zero growth is still shown', () => {
    assert.equal(playSection({ totals: { installs: 10, growthRatePercent: -3.1 } }).tiles[0].note, '−3.1%');
    assert.equal(playSection({ totals: { installs: 10, growthRatePercent: 0 } }).tiles[0].note, '0%');
  });
});

describe('Analytics: section 2, the adoption line', () => {
  test('activeThisMonth / totalWithAccess, rounded to a whole percent', () => {
    assert.equal(adoptionPercent(OVERVIEW), 13); // 212 / 1631 = 12.998…
    assert.equal(adoptionLine(OVERVIEW), 'Of 1,631 people with access, 13% used Setu this month');
    assert.equal(adoptionPercent({ users: { activeThisMonth: 1, totalWithAccess: 8 } }), 13); // 12.5 → 13
    assert.equal(adoptionPercent({ users: { activeThisMonth: 1, totalWithAccess: 3 } }), 33);
    assert.equal(adoptionPercent({ users: { activeThisMonth: 0, totalWithAccess: 1631 } }), 0);
    assert.equal(adoptionLine({ users: { activeThisMonth: 0, totalWithAccess: 1631 } }), 'Of 1,631 people with access, 0% used Setu this month');
  });

  test('omitted when either number is missing, or nobody has access', () => {
    assert.equal(adoptionLine({ users: { activeThisMonth: 212 } }), null);
    assert.equal(adoptionLine({ users: { totalWithAccess: 1631 } }), null);
    assert.equal(adoptionLine({ users: { activeThisMonth: 0, totalWithAccess: 0 } }), null);
    assert.equal(adoptionLine({}), null);
    assert.equal(adoptionLine(undefined), null);
  });

  test('the row to screen two carries everyone with access, or no count', () => {
    assert.equal(peopleCount(OVERVIEW), 1631);
    assert.equal(peopleCount({ users: {} }), null);
    assert.equal(formatCount(1631), '1,631');
  });
});

describe('Analytics: sections 3 and 4, the bars', () => {
  test('Where: widest first, each relative to the largest, the count at the right', () => {
    const bars = countryBars({ devices: { byCountry: [{ country: 'Zambia', devices: 52 }, { country: 'Tanzania', devices: 74 }, { country: 'Kenya', devices: 0 }] } });
    assert.deepEqual(bars.map((b) => [b.label, b.valueText, Math.round(b.fraction * 100)]), [['Tanzania', '74', 100], ['Zambia', '52', 70], ['Kenya', '0', 0]]);
  });

  test('Where: absent when the array is empty or missing; a country with no name or no number is left out', () => {
    assert.deepEqual(countryBars({ devices: { byCountry: [] } }), []);
    assert.deepEqual(countryBars({ devices: {} }), []);
    assert.deepEqual(countryBars({}), []);
    assert.deepEqual(countryBars({ devices: { byCountry: [{ devices: 9 }, { country: 'Uganda' }] } }), []);
  });

  test('What they did: the total, then a bar per action, widest first', () => {
    assert.equal(actionsTotal(OVERVIEW), '8,740');
    assert.deepEqual(actionBars(OVERVIEW).map((b) => [b.label, b.valueText]), [['Commented', '3,120'], ['Status Changed', '2,240']]);
    assert.equal(actionsTotal({ actions: { byType: [] } }), null);
    assert.equal(actionsTotal({ actions: { total: 0 } }), '0');
  });
});

describe('Analytics: action names are the audit log\'s own labels', () => {
  test('every AuditAction reads exactly as on the audit log', () => {
    for (const action of AUDIT_ACTIONS) {
      assert.equal(analyticsActionLabel(action), AUDIT_ACTION_LABELS[action], action);
      assert.equal(actionBars({ actions: { byType: [{ action, count: 1 }] } })[0].label, AUDIT_ACTION_LABELS[action], action);
    }
  });

  test('a value the audit log does not know (a sign-in, a newer server) reads as the audit log reads it', () => {
    for (const action of ['LOGIN', 'SIGNED_IN', 'MOBILE_LOGIN']) assert.equal(analyticsActionLabel(action), auditActionLabel(action));
  });

  test('no second wording: utils/analytics.ts holds no label of its own for any AuditAction', () => {
    const src = read('src/utils/analytics.ts');
    assert.match(src, /import \{ auditActionLabel \} from '\.\/audit-log';/);
    for (const label of Object.values(AUDIT_ACTION_LABELS)) assert.ok(!src.includes(`'${label}'`), label);
    for (const action of AUDIT_ACTIONS) assert.ok(!src.includes(`${action}:`), action);
  });

  test('lastAction as a sentence: the label, then the ticket; the label alone without a ticket', () => {
    assert.equal(lastActionSentence(USER_ROW.lastAction), 'Status Changed on #10482');
    assert.equal(lastActionSentence({ type: 'COMMENTED' }), 'Commented');
    assert.equal(lastActionSentence({ type: 'LOGIN', ticketNumber: null }), 'Login');
    assert.equal(lastActionSentence({ ticketNumber: 5 }), null);
    assert.equal(lastActionSentence(undefined), null);
  });
});

describe('Analytics: screens two and three, a person', () => {
  test('an active row: what they last did and when, then "N actions · N days active"', () => {
    assert.equal(personActivityLine(USER_ROW, NOW), 'Status Changed on #10482 · 7d ago');
    assert.equal(personCountsLine(USER_ROW), '184 actions · 17 days active');
    assert.equal(personCountsLine({ actionsInPeriod: 1, daysActiveInPeriod: 1 }), '1 action · 1 day active');
    assert.equal(personCountsLine({ daysActiveInPeriod: 3 }), '3 days active');
    assert.equal(personCountsLine({}), null);
    assert.equal(personActivityLine({ lastSeenAt: '2026-11-26T09:00:00.000Z' }, NOW), 'Last seen 3h ago');
    assert.equal(personActivityLine({}, NOW), null);
  });

  test('nothing in the period: zero days active, or zero actions and zero logins; a missing count never says so', () => {
    assert.equal(isInactiveInPeriod({ daysActiveInPeriod: 0, actionsInPeriod: 4 }), true);
    assert.equal(isInactiveInPeriod({ daysActiveInPeriod: 2 }), false);
    assert.equal(isInactiveInPeriod({ actionsInPeriod: 0, loginsInPeriod: 0 }), true);
    assert.equal(isInactiveInPeriod({ actionsInPeriod: 0 }), false);
    assert.equal(isInactiveInPeriod({}), false);
    assert.equal(lastSeenDateLine({ lastSeenAt: '2026-10-12T10:00:00.000Z' }), 'Last seen 12 Oct 2026');
    assert.equal(lastSeenDateLine({}), null);
  });

  test('the header: role in the app\'s words, "Has the app" only when the server says so', () => {
    assert.equal(personRoleLabel('AGENT'), 'Technician');
    assert.equal(personRoleLabel('SUPER_ADMIN'), 'Super Admin');
    assert.equal(personRoleLabel(undefined), null);
    assert.deepEqual(personChips(USER_ROW, NOW).map((c) => c.label), ['Has the app', 'Active 7d ago']);
    assert.deepEqual(personChips({ hasMobileApp: false }, NOW), []);
  });
});

// ── 7. The screens (read as text) and the version ─────────────

describe('Analytics: the screens', () => {
  const overview = read(SCREENS.overview);
  const users = read(SCREENS.users);
  const person = read(SCREENS.person);

  test('nothing deployed: one plain line, not an error box and not a retry', () => {
    assert.match(overview, /if \(overviewMissing && installsMissing\) \{\s*blocks\.push\(<NotAvailableLine key="none" text=\{NOT_AVAILABLE_TEXT\} \/>\);/);
    assert.match(users, /\} else if \(list\.notDeployed\) \{\s*content = <View className="pt-3"><NotAvailableLine text=\{USERS_NOT_AVAILABLE_TEXT\} \/><\/View>;/);
    assert.match(person, /else if \(activity\.notDeployed\) below = <NotAvailableLine text=\{ACTIVITY_NOT_AVAILABLE_TEXT\} \/>;/);
    const line = read('src/screens/analytics/AnalyticsParts.tsx');
    const body = line.slice(line.indexOf('export function NotAvailableLine'), line.indexOf('export function PersonAvatar'));
    assert.doesNotMatch(body, /onRetry|Retry|ErrorState|red-/);
  });

  test('ANL-4 not deployed: section 1 is absent, not an error inside the page', () => {
    // The Play block shows only from a deployed answer; the loading/error block only while there is no answer at all.
    assert.match(overview, /const installsData = installs\.data\?\.deployed \? installs\.data\.data : null;/);
    assert.match(overview, /\} else if \(!installsData && !installsMissing\) \{\s*blocks\.push\(<QueryBlock key="app"/);
  });

  test('every Play figure renders inside the section whose heading says how recent it is', () => {
    assert.match(overview, /<Section key="app" title="The app" source=\{play\.heading\}>\s*<PlayBanner figures=\{play\.banner\} \/>\s*<TileGrid figures=\{play\.tiles\} \/>\s*<\/Section>/);
    assert.equal(overview.match(/play\.banner/g).length, 1);
    assert.equal(overview.match(/play\.tiles/g).length, 1);
  });

  test('the four sections in the brief\'s order, then the row to screen two', () => {
    const order = ['key="app"', 'key="people"', 'key="where"', 'key="what"', 'key="people-link"'].map((k) => overview.indexOf(k));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(order.every((i) => i > 0));
  });

  test('screen two: sorting is the server\'s; the search narrows the rows held, on the phone, and is sent nowhere', () => {
    assert.match(users, /const list = useAnalyticsUsers\(range, sortBy\);/);
    for (const src of [users, read('src/hooks/useAnalytics.ts')]) assert.doesNotMatch(src, /\.sort\(|localeCompare/);
    // The sort chip's list (the server's order), narrowed by the search; the list shows that and nothing else.
    assert.match(users, /const shown = useMemo\(\(\) => filterPeople\(list\.rows, query\), \[list\.rows, query\]\);/);
    assert.match(users, /<FlashList\s+data=\{shown\}/);
    assert.match(read('src/hooks/useAnalytics.ts'), /export function usersQuery\(range: AnalyticsRange, sortBy: AnalyticsUserSort, allowed: boolean\)/);
    assert.doesNotMatch(read('src/api/analytics.api.ts'), /search:|\bq:/);
  });

  test('screen two: the field is pinned above the list, "Name or email", with a real label; no match is a plain line', () => {
    const field = users.indexOf('<SearchField');
    assert.ok(field > 0 && field < users.indexOf('<CoverageLine') && field > users.indexOf('let content: ReactNode;'));
    assert.doesNotMatch(users, /ListHeaderComponent/); // not inside the list, where it would scroll away
    assert.match(users, /placeholder=\{PEOPLE_SEARCH_PLACEHOLDER\}\s+accessibilityLabel=\{PEOPLE_SEARCH_LABEL\}/);
    assert.match(users, /export const PEOPLE_SEARCH_PLACEHOLDER = 'Name or email';/);
    assert.match(users, /export const PEOPLE_SEARCH_LABEL = 'Search people by name or email';/);
    assert.match(users, /onClear=\{\(\) => setQuery\(''\)\}/);
    assert.match(users, /typed \? \(\s*<Text className="[^"]*">\{noOptionMatchText\(query\)\}<\/Text>/);
    assert.match(users, /AccessibilityInfo\.announceForAccessibility\(peopleSearchAnnouncement\(settledCount, coverage\.note\)\)/);
  });

  test('screen two: loading is the hook\'s (no scroll-to-load), and the coverage line sits above the results, never hidden', () => {
    assert.doesNotMatch(users, /onEndReached/);
    assert.match(users, /\{listShown \? <CoverageLine coverage=\{coverage\} onRetry=\{retryLoad\} \/> : null\}\s*<ListEntryScope>\{content\}<\/ListEntryScope>/);
    const line = users.slice(users.indexOf('function CoverageLine'), users.indexOf('const PersonRow'));
    assert.match(line, /^function CoverageLine[^\n]*\n\s*if \(!coverage\.text\) return null;/m, 'absent only when the list is whole');
    assert.match(users, /failed: list\.isError && hasData,/);
    assert.match(users, /capped: list\.capped,/);
  });

  test('screen two: a muted row for nothing in the period, with "Nothing in this period" and the last-seen date', () => {
    assert.match(users, /const activity = inactive \? 'Nothing in this period' : personActivityLine\(row\);/);
    assert.match(users, /const secondLine = inactive \? lastSeenDateLine\(row\) : personCountsLine\(row\);/);
    assert.match(users, /<PersonAvatar name=\{name\} muted=\{inactive\} \/>/);
    assert.match(users, /phone-portrait-outline/);
  });

  test('screen three REUSES the audit log\'s renderer and day groups; there is one renderer in the app', () => {
    assert.match(person, /<AuditEntryCard entry=\{item\.entry\} onOpenTicket=\{openTicket\} showActor=\{false\} inset=\{false\} \/>/);
    assert.match(person, /auditListRows\(activity\.rows\)/);
    assert.match(read('src/screens/audit/AuditLogScreen.tsx'), /<AuditEntryCard entry=\{item\.entry\} onOpenTicket=\{openTicket\} \/>/);
    assert.deepEqual(SRC.filter((rel) => /const ACTION_ICONS\b/.test(read(rel))), ['src/components/AuditEntryCard.tsx']);
    assert.deepEqual(SRC.filter((rel) => /formatAuditDetails\(/.test(read(rel))).sort(), ['src/components/AuditEntryCard.tsx', 'src/utils/audit-log.ts']);
  });

  test('bars are drawn, not charted: no charting library is installed', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    assert.deepEqual(deps.filter((d) => /chart|victory|svg|d3|skia|plot/i.test(d)), []);
  });

  test('no hex colour outside the theme', () => {
    for (const rel of [...Object.values(SCREENS), 'src/screens/analytics/AnalyticsParts.tsx', 'src/components/AuditEntryCard.tsx']) {
      // A colour literal in quotes; "#10482" in a comment is a ticket number.
      assert.doesNotMatch(read(rel), /['"`]#[0-9a-fA-F]{3,8}['"`]/, rel);
    }
  });
});

// ── 8. Screen two's search, on the phone (2026-11-27) ─────────

// A directory of `total` people, served 50 a page as ANL-2 would, slowly enough that two requests at once would overlap.
// One person is far down the list: index 340, page 7.
const FAR_INDEX = 340;
const FAR_PERSON = { userId: 'u-zawadi', name: 'Zawadi Mwakyusa', email: 'z.mwakyusa@example.test', actionsInPeriod: 3 };
const personAt = (i) => (i === FAR_INDEX ? FAR_PERSON : { userId: `u-${i}`, name: `Person ${String(i).padStart(4, '0')}`, email: `person${i}@example.test` });

function directory(total, { failOn = null, sendTotal = true } = {}) {
  const everyone = Array.from({ length: total }, (_, i) => personAt(i));
  const load = { inFlight: 0, most: 0, failOn };
  const route = async (config) => {
    load.inFlight += 1;
    load.most = Math.max(load.most, load.inFlight);
    try {
      // In flight across a turn of the event loop: a second request started meanwhile would be counted.
      for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
      const { page, limit } = config.params;
      if (page === load.failOn) return JSON_ERROR(500, 'Internal server error');
      const rows = everyone.slice((page - 1) * limit, page * limit);
      return JSON_OK(sendTotal ? { page, limit, total, rows } : { page, limit, rows });
    } finally {
      load.inFlight -= 1;
    }
  };
  return { route, load };
}

const pagesAsked = () => sent.filter((r) => r.url === '/analytics/users').map((r) => r.params.page);
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
async function until(check, what) {
  for (let i = 0; i < 2000; i++) {
    if (check()) {
      for (let j = 0; j < 6; j++) await tick(); // then a quiet spell: nothing more may be asked for
      return;
    }
    await tick();
  }
  throw new Error(`timed out waiting for: ${what}`);
}

/**
 * Screen two, opened: the hook's own options (usersQuery) in TanStack's own observer, and the hook's own load step
 * (loadNextPageIfDue) run on mount and after every change, as useAnalyticsUsers' effect runs it: after the render that
 * follows the change, so a tick later, on the latest state. Closed: the step runs no more (the effect is gone).
 */
function openScreenTwo(client, { sortBy = 'lastSeen', step = loadNextPageIfDue } = {}) {
  const observer = new InfiniteQueryObserver(client, usersQuery('last30', sortBy, true));
  let open = true;
  const run = () => {
    if (open) step(observer.getCurrentResult(), (options) => observer.fetchNextPage(options));
  };
  const stop = observer.subscribe(() => setTimeout(run, 0));
  const unsubscribe = () => {
    open = false;
    stop();
  };
  run();
  const result = () => observer.getCurrentResult();
  const held = () => looseListState(result().data?.pages, userRowKey);
  const settled = () => until(() => {
    const r = result();
    return r.data !== undefined && r.fetchStatus === 'idle' && (!r.hasNextPage || r.isError);
  }, 'the load to settle');
  /** The coverage line, from what the screen reads (AnalyticsUsersScreen: peopleCoverage({...})). */
  const coverage = () => {
    const r = result();
    const s = held();
    return peopleCoverage({
      loaded: s.rows.length, total: s.total, more: !!r.hasNextPage, waiting: r.fetchStatus === 'paused',
      failed: r.isError && r.data !== undefined, capped: s.capped,
    });
  };
  return { observer, unsubscribe, result, held, settled, coverage };
}

describe('Analytics: screen two loads everyone before anyone searches (one page at a time, to the cap)', () => {
  let client;
  let opened = [];
  const open = (options) => {
    const screen = openScreenTwo(client, options);
    opened.push(screen);
    return screen;
  };
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    opened = [];
  });
  const close = () => {
    for (const s of opened) s.unsubscribe();
    client.clear();
  };

  test('the cap is a named constant: 10 pages, 500 people at 50 a page, and no literal in the paging', () => {
    assert.equal(ANALYTICS_MAX_PAGES, 10);
    assert.equal(ANALYTICS_LIST_CAP, ANALYTICS_MAX_PAGES * ANALYTICS_PAGE_SIZE);
    assert.equal(ANALYTICS_LIST_CAP, 500);
    const src = read('src/hooks/useAnalytics.ts');
    assert.match(src, /export const ANALYTICS_MAX_PAGES = 10;/);
    assert.match(src, /pages\.length < ANALYTICS_MAX_PAGES \? pageAfter\(last, pages\) : undefined/);
    assert.match(src, /pages\.length >= ANALYTICS_MAX_PAGES && pageAfter\(last, pages\) !== undefined/);
  });

  test('1,631 people: on opening it asks for pages 1 to 10, in order, ONE at a time, then stops at the cap', async () => {
    const { route, load } = directory(1631);
    routes['/analytics/users'] = route;
    try {
      const screen = open();
      await screen.settled();
      assert.deepEqual(pagesAsked(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assert.equal(load.most, 1, 'never two requests at once');
      assert.ok(sent.every((r) => r.params.limit === 50 && !('search' in r.params) && !('q' in r.params)));
      assert.equal(screen.held().rows.length, 500);
      assert.equal(screen.held().capped, true);
    } finally {
      close();
    }
  });

  test('the rows show while the rest load: a quiet "more are coming" line, not a blocked screen', async () => {
    const { route } = directory(1631);
    routes['/analytics/users'] = route;
    try {
      const screen = open();
      await until(() => (screen.result().data?.pages.length ?? 0) >= 2, 'two pages');
      const midway = screen.coverage();
      assert.equal(midway.kind, 'loading');
      assert.match(midway.text, /^More people are coming: \d+ of 1,631 loaded so far\.$/);
      assert.equal(midway.note, 'More people are still loading.');
      assert.ok(screen.held().rows.length >= 100, 'what arrived is already there to show and search');
      await screen.settled();
    } finally {
      close();
    }
  });

  test('searching finds someone on page 7, not only page one: by name and by email, mid-string, either case', async () => {
    routes['/analytics/users'] = directory(1631).route;
    try {
      const screen = open();
      await screen.settled();
      const { rows } = screen.held();
      assert.equal(rows.findIndex((r) => r.userId === 'u-zawadi'), FAR_INDEX, 'they came on page 7 (rows 301 to 350)');
      assert.deepEqual(pagesAsked().slice(0, 7), [1, 2, 3, 4, 5, 6, 7]);
      for (const query of ['Zawadi', 'mwaky', 'WADI MWA', '  zawadi  ', 'z.mwakyusa@', 'MWAKYUSA@EXAMPLE', 'kyusa@exa']) {
        assert.deepEqual(filterPeople(rows, query).map((r) => r.userId), ['u-zawadi'], query);
      }
      // Clearing brings everyone back, in the same order.
      assert.equal(filterPeople(rows, ''), rows);
      assert.equal(filterPeople(rows, '   '), rows);
      assert.deepEqual(filterPeople(rows, 'nobody-called-this'), []);
    } finally {
      close();
    }
  });

  test('the sort chip still orders what the search finds: the matches keep the server\'s order', () => {
    const serverOrder = [personAt(9), personAt(3), FAR_PERSON, personAt(7), personAt(1)];
    assert.deepEqual(filterPeople(serverOrder, 'person 000').map((r) => r.userId), ['u-9', 'u-3', 'u-7', 'u-1']);
  });

  test('total above the cap: the cap line says "Search covers the first 500 of 1,631 people"', async () => {
    routes['/analytics/users'] = directory(1631).route;
    try {
      const screen = open();
      await screen.settled();
      assert.deepEqual(screen.coverage(), {
        kind: 'capped',
        text: 'Search covers the first 500 of 1,631 people.',
        note: 'Search covers the first 500 of 1,631 people.',
      });
      assert.equal(peopleSearchAnnouncement(0, screen.coverage().note), 'No matches. Search covers the first 500 of 1,631 people.');
    } finally {
      close();
    }
  });

  for (const total of [500, 120, 37]) {
    test(`total ${total} (not above the cap): everyone loads, and there is no cap line or any other line`, async () => {
      routes['/analytics/users'] = directory(total).route;
      try {
        const screen = open();
        await screen.settled();
        assert.deepEqual(pagesAsked(), Array.from({ length: Math.ceil(total / 50) }, (_, i) => i + 1));
        assert.equal(screen.held().rows.length, total);
        assert.equal(screen.held().capped, false);
        assert.deepEqual(screen.coverage(), { kind: 'complete', text: null, note: null });
        assert.equal(peopleSearchAnnouncement(1, screen.coverage().note), '1 match');
      } finally {
        close();
      }
    });
  }

  test('no total sent: it loads until a short page, and a cap with full pages says "there may be more"', async () => {
    routes['/analytics/users'] = directory(120, { sendTotal: false }).route;
    try {
      const small = open();
      await small.settled();
      assert.deepEqual(pagesAsked(), [1, 2, 3]);
      assert.equal(small.coverage().kind, 'complete');
    } finally {
      close();
    }
    sent.length = 0;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    opened = [];
    routes['/analytics/users'] = directory(900, { sendTotal: false }).route;
    try {
      const big = open();
      await big.settled();
      assert.equal(pagesAsked().length, 10);
      assert.equal(big.coverage().text, 'Search covers the first 500 people. There may be more.');
    } finally {
      close();
    }
  });

  test('a page fails mid-load: what arrived is kept, loading stops, and the line says the list is incomplete', async () => {
    const { route, load } = directory(1631, { failOn: 4 });
    routes['/analytics/users'] = route;
    try {
      const screen = open();
      await screen.settled();
      assert.deepEqual(pagesAsked(), [1, 2, 3, 4], 'stopped at the failure: no page 5, no retry loop');
      assert.equal(screen.result().isFetchNextPageError, true);
      assert.equal(screen.held().rows.length, 150, 'pages 1 to 3 are kept');
      assert.deepEqual(screen.coverage(), {
        kind: 'failed',
        text: 'The list is incomplete: 150 of 1,631 people loaded. Search covers only those.',
        note: 'The list is incomplete: 150 of 1,631 people loaded. Search covers only those.',
      });
      // The search covers what arrived, and the line says that is not everyone.
      assert.deepEqual(filterPeople(screen.held().rows, 'person120@').map((r) => r.userId), ['u-120']);
      assert.deepEqual(filterPeople(screen.held().rows, 'zawadi'), []);

      // Retry (the line's "Tap to retry"): page 4 again, then the rest, still one at a time.
      load.failOn = null;
      await screen.observer.fetchNextPage({ cancelRefetch: false });
      await screen.settled();
      assert.deepEqual(pagesAsked(), [1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10]);
      assert.equal(load.most, 1);
      assert.equal(screen.coverage().kind, 'capped');
    } finally {
      close();
    }
  });

  test('a page waiting for the network: the line says incomplete, and the rest load when back online', () => {
    const waiting = peopleCoverage({ loaded: 200, total: 1631, more: true, waiting: true, failed: false, capped: false });
    assert.equal(waiting.kind, 'waiting');
    assert.equal(waiting.text, "The list is incomplete: 200 of 1,631 people loaded. The rest load when you're back online.");
    // Short of the server's total once loading ended (rows moved between pages): still said, never passed off as whole.
    const short = peopleCoverage({ loaded: 498, total: 500, more: false, waiting: false, failed: false, capped: false });
    assert.equal(short.text, 'The list is incomplete: 498 of 500 people loaded. Search covers only those.');
    assert.equal(peopleCoverage({ loaded: 1, total: 1, more: false, waiting: false, failed: false, capped: false }).text, null);
  });

  test('typing sends no request: the search is in no key and no option, and narrowing never touches the network', async () => {
    routes['/analytics/users'] = directory(1631).route;
    try {
      const screen = open();
      await screen.settled();
      const before = sent.length;
      const { rows } = screen.held();
      for (const query of ['z', 'za', 'zaw', 'zawa', 'zawad', 'zawadi', 'zawad', '', 'p', 'pe', 'person 01']) filterPeople(rows, query);
      for (let i = 0; i < 15; i++) await tick();
      assert.equal(sent.length, before);
      assert.deepEqual(usersQuery('last30', 'lastSeen', true).queryKey, ['analytics', 'users', 'last30', 'lastSeen']);
    } finally {
      close();
    }
  });

  test('reopening within staleTime asks for nothing: the ten pages are cached together', async () => {
    routes['/analytics/users'] = directory(1631).route;
    try {
      const first = open();
      await first.settled();
      assert.equal(sent.length, 10);
      first.unsubscribe();
      const again = open();
      await until(() => true, 'a quiet spell');
      assert.equal(sent.length, 10, 'no refetch, not one page');
      assert.equal(again.held().rows.length, 500);
      assert.equal(again.coverage().kind, 'capped');
      assert.ok(usersQuery('last30', 'lastSeen', true).staleTime >= 5 * 60_000);
    } finally {
      close();
    }
  });

  test('left mid-load and reopened: it carries on from the page it reached, never from page one', async () => {
    routes['/analytics/users'] = directory(1631).route;
    try {
      // Left after three pages (the step stops asking, as the effect does once the screen is gone).
      const first = open({ step: (state, fetchNext) => ((state.data?.pages.length ?? 0) < 3 ? loadNextPageIfDue(state, fetchNext) : false) });
      await until(() => first.result().data?.pages.length === 3 && first.result().fetchStatus === 'idle', 'three pages');
      first.unsubscribe();
      const again = open();
      await again.settled();
      assert.deepEqual(pagesAsked(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    } finally {
      close();
    }
  });

  test('pull-to-refresh asks for page one again, then loads the rest in order; still one at a time', async () => {
    const { route, load } = directory(1631);
    routes['/analytics/users'] = route;
    try {
      const screen = open();
      await screen.settled();
      sent.length = 0;
      // The hook's refreshFirstPage: keep page one, then refetch (one request), then the load step carries on.
      client.setQueryData(usersQuery('last30', 'lastSeen', true).queryKey, keepFirstPage);
      await screen.observer.refetch();
      await screen.settled();
      assert.deepEqual(pagesAsked(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assert.equal(load.most, 1);
    } finally {
      close();
    }
  });

  test('a sort chip tapped mid-load: the new list waits for the request in flight; two never run at once', async () => {
    const { route, load } = directory(1631);
    routes['/analytics/users'] = route;
    try {
      const lastSeen = open();
      await until(() => (lastSeen.result().data?.pages.length ?? 0) >= 2, 'two pages');
      const byName = open({ sortBy: 'name' });
      await lastSeen.settled();
      await byName.settled();
      assert.equal(load.most, 1);
      assert.equal(sent.filter((r) => r.params.sortBy === 'name').length, 10);
    } finally {
      close();
    }
  });

  test('the load step: only with a next page, nothing in flight or waiting, and no failure; never cancels one in flight', () => {
    const asked = [];
    const fetchNext = (options) => {
      asked.push(options);
      return Promise.resolve();
    };
    const due = { hasNextPage: true, fetchStatus: 'idle', isError: false };
    assert.equal(loadNextPageIfDue(due, fetchNext), true);
    assert.deepEqual(asked, [{ cancelRefetch: false }]);
    for (const not of [{ hasNextPage: false }, { fetchStatus: 'fetching' }, { fetchStatus: 'paused' }, { isError: true }]) {
      assert.equal(loadNextPageIfDue({ ...due, ...not }, fetchNext), false, JSON.stringify(not));
    }
    assert.equal(asked.length, 1);
    // Only screen two loads everything; screen three still loads as it is scrolled.
    const hook = read('src/hooks/useAnalytics.ts');
    assert.match(hook, /return useLooseList\(options, userRowKey, true\);/);
    assert.match(hook, /return useLooseList\(options, entryKey, false\);/);
    assert.match(hook, /if \(loadAll\) loadNextPageIfDue\(\{ hasNextPage, fetchStatus, isError \}, fetchNextPage\);/);
  });
});

describe('Analytics: screen two\'s search is option-search.ts\'s one rule', () => {
  test('filterByText: any of the texts, anywhere, any case, trimmed; a missing text matches nothing; blank keeps all', () => {
    const items = [{ a: 'Grace Banda', b: 'grace.banda@example.test' }, { a: 'Juma', b: undefined }, { a: null, b: 'ops@example.test' }];
    const texts = (i) => [i.a, i.b];
    assert.deepEqual(filterByText(items, 'BANDA', texts), [items[0]]);
    assert.deepEqual(filterByText(items, ' ops@ ', texts), [items[2]]);
    assert.deepEqual(filterByText(items, 'um', texts), [items[1]]);
    assert.deepEqual(filterByText(items, 'undefined', texts), []);
    assert.equal(filterByText(items, '  ', texts), items);
  });

  test('the dropdowns\' rule is the same function on one text: nothing about their search changed', () => {
    const options = [{ label: 'Network' }, { label: 'ERP - Finance' }];
    assert.deepEqual(filterOptionsByLabel(options, ' NET '), [options[0]]);
    assert.equal(filterOptionsByLabel(options, ''), options);
    const src = read('src/utils/option-search.ts');
    assert.match(src, /return filterByText\(options, query, optionLabel\);/);
    assert.equal(src.match(/toLocaleLowerCase\(\)\.includes/g)?.length, 1, 'one matcher in the file');
  });

  test('people are found by name (as shown and as sent) or email, through filterByText; no second matcher in Analytics', () => {
    const emailAsName = { userId: 'u-e', name: 'amani.kweka@example.test' }; // shown as "Amani Kweka"
    assert.deepEqual(filterPeople([emailAsName], 'amani kweka'), [emailAsName]);
    assert.deepEqual(filterPeople([emailAsName], 'kweka@'), [emailAsName]);
    assert.deepEqual(filterPeople([{ userId: 'u-x' }], 'name not given'), [], 'the stand-in name is not searched');
    const utils = read('src/utils/analytics.ts');
    assert.match(utils, /return filterByText\(rows, query, personSearchTexts\);/);
    for (const rel of [...Object.values(SCREENS), 'src/utils/analytics.ts', 'src/hooks/useAnalytics.ts']) {
      assert.doesNotMatch(read(rel), /(toLowerCase|toLocaleLowerCase)\(\)\.(includes|indexOf|startsWith)\(/, rel);
    }
    assert.equal(noOptionMatchText('  zz '), 'Nothing matches “zz”.');
  });
});

describe('Analytics: the version', () => {
  test('versionCode 9 (8 is on Google Play)', () => {
    assert.equal(JSON.parse(read('app.json')).expo.android.versionCode, 9);
  });
});
