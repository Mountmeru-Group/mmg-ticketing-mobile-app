// G8: the Audit log (M20) is ADMIN only — the drawer row AND the route (docs/G8-WEB-AUDIT.md, ROLE-MATRIX.md §19).
// The server agrees: AUD-1 is `requireAuth, adminOnly` (auditLog.router.ts:8), a 403 for every other role.
//
// For END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin:
//   1. the drawer row: ADMIN only, after Announcements below a divider, before Settings;
//   2. that no other role can REACH the route by any path: the drawer does not register it, so React Navigation's own
//      drawer router (the installed @react-navigation/routers, run here) refuses every action that names it;
//   3. that the screen and its hook send AUD-1 for ADMIN only, and that nothing else in src/ navigates there;
//   4. the requests themselves, through the real axios client: the filters become exactly the three params the server
//      reads, and nothing it does not (no action, date or text filter exists, G8 §2).
// What is real: permissions.ts, React Navigation's router, the AUD-1 and TKT-1 modules and the axios client. Faked: the
// network. Read as text: the screen and navigators, which need a phone to render.
//
// iOS-5e: Android's tests/rbac/audit-log.test.mjs (8b522e3), the same 48 tests, adapted where Android reads its drawer,
// as iOS-5b adapted kb-announcements: iOS has no drawer, so the row is a More row in a section of its own
// (MoreScreen.tsx, moreSections) and the route is the More stack's (TabStacks.tsx, routes.ts stackRoutes, the iOS form
// of drawerRoutes); the drawer router's checks run on every tab's StackRouter. Section 5 is new on iOS: persona by
// persona, no tab, More row, deep link or notification tap reaches the Audit log for anyone but ADMIN.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, StackActions, StackRouter, TabRouter } from '@react-navigation/routers';
import { AxiosHeaders } from 'axios';

import { AUDIT_PAGE_SIZE, listAuditLog } from '../../src/api/auditLog.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { findTicketIdByNumber } from '../../src/hooks/useAuditLog.ts';
import { STACK_ROUTES, getIdFor, stackRoutes } from '../../src/navigation/routes.ts';
import { NO_AUDIT_FILTERS, activeAuditFilterCount, auditLogQuery } from '../../src/utils/audit-log.ts';
import { APP_ORIGIN, notificationDestination, ticketLinkDestination } from '../../src/utils/deep-links.ts';
import { appTabs, canViewAuditLog, drawerItems, moreSections } from '../../src/utils/permissions.ts';
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
const TABS = ['HomeTab', 'TicketsTab', 'ApprovalsTab', 'AlertsTab', 'MoreTab'];

// ── 1. The drawer row (iOS: a More row) ──────────────────────

describe('Audit log: the drawer row (ADMIN only)', () => {
  forEachPersona('canViewAuditLog', ONLY_ADMIN, (p) => canViewAuditLog(p.role));
  forEachPersona('drawer row shown', ONLY_ADMIN, (p) => drawerItems(p.role).includes('auditLog'));

  test('ADMIN: after Announcements, before Settings', () => {
    const rows = drawerItems('ADMIN');
    assert.equal(rows.indexOf('auditLog'), rows.indexOf('announcements') + 1);
    assert.equal(rows.indexOf('settings'), rows.indexOf('auditLog') + 1);
  });

  test('a role the app does not know gets neither the row nor the route', () => {
    assert.equal(canViewAuditLog('GUEST'), false);
    assert.equal(drawerItems('GUEST').includes('auditLog'), false);
    for (const tab of TABS) assert.equal(stackRoutes(tab, 'GUEST').includes('AuditLog'), false, tab);
  });

  test('iOS: the row is "Audit log", opens the AuditLog route and sits in a section of its own before Settings (MoreScreen.tsx)', () => {
    const src = read('src/navigation/MoreScreen.tsx');
    assert.match(src, /auditLog: \{ label: 'Audit log', icon: '[\w-]+' \}/);
    assert.match(src, /case 'auditLog':\s*return navigation\.navigate\('AuditLog'\);/);
    // Android's divider is a list section on iOS: ADMIN's sections, in order.
    assert.deepEqual(moreSections('ADMIN').map((s) => [s.key, s.items]), [
      ['work', ['tasks', 'catalog', 'myRequests']],
      ['information', ['knowledge', 'announcements']],
      ['admin', ['auditLog']],
      ['settings', ['settings']],
    ]);
    // Rows come from moreSections() → drawerItems() alone.
    assert.match(src, /\{moreSections\(user\?\.role\)\.map\(\(section\) =>/);
  });
});

// ── 2. The route: registered for ADMIN only, unreachable for the other four ──

/** A tab's native stack exactly as TabStacks.tsx configures it, for this role's registered routes. */
function stackFor(tab, role) {
  const routeNames = stackRoutes(tab, role);
  const router = StackRouter({ initialRouteName: routeNames[0] });
  const options = {
    routeNames,
    routeParamList: Object.fromEntries(routeNames.map((n) => [n, undefined])),
    routeGetIdList: Object.fromEntries(routeNames.flatMap((n) => (getIdFor(n) ? [[n, getIdFor(n)]] : []))),
  };
  return { router, options, state: router.getInitialState(options) };
}

/** Every action that could put AuditLog on screen: a row, a link, a reset or a stale history entry. */
const actionsTo = (root) => ({
  'navigate(AuditLog)': CommonActions.navigate('AuditLog'),
  'navigate(AuditLog) with pop': CommonActions.navigate('AuditLog', undefined, { pop: true }),
  'push(AuditLog)': StackActions.push('AuditLog'),
  'replace(AuditLog)': StackActions.replace('AuditLog'),
  'popTo(AuditLog)': StackActions.popTo('AuditLog'),
  'preload(AuditLog)': CommonActions.preload('AuditLog'),
  'reset to a state that contains it': CommonActions.reset({ index: 1, routes: [{ name: root }, { name: 'AuditLog' }] }),
});

describe('Audit log: the route', () => {
  forEachPersona('registered', ONLY_ADMIN, (p) => stackRoutes('MoreTab', p.role).includes('AuditLog'));

  for (const name of NON_ADMIN) {
    test(`${name}: React Navigation's stack router refuses every way to open AuditLog, in every tab`, () => {
      const role = PERSONAS[name].role;
      for (const tab of TABS) {
        const { router, options, state } = stackFor(tab, role);
        for (const [label, action] of Object.entries(actionsTo(options.routeNames[0]))) {
          // null = not handled: offered to the tab navigator and the root stack, unhandled there too, and dropped.
          assert.equal(router.getStateForAction(state, action, options), null, `${tab}: ${label}`);
        }
      }
    });

    test(`${name}: a saved or stale navigation state naming AuditLog is rehydrated without it`, () => {
      const { router, options } = stackFor('MoreTab', PERSONAS[name].role);
      const rehydrated = router.getRehydratedState({ stale: true, index: 1, routes: [{ name: 'More' }, { name: 'AuditLog' }] }, options);
      assert.deepEqual(rehydrated.routes.filter((r) => r.name === 'AuditLog'), []);
      assert.equal(rehydrated.routes[rehydrated.index].name, 'More');
    });
  }

  test('ADMIN: the row\'s action does open it (the gate is the role, not a broken route)', () => {
    const { router, options, state } = stackFor('MoreTab', 'ADMIN');
    for (const label of ['navigate(AuditLog)', 'push(AuditLog)']) {
      const next = router.getStateForAction(state, actionsTo('More')[label], options);
      assert.ok(next, label);
      assert.equal(next.routes[next.index].name, 'AuditLog', label);
    }
    // Only the More stack has it, even for ADMIN.
    for (const tab of TABS.filter((t) => t !== 'MoreTab')) assert.equal(STACK_ROUTES[tab].includes('AuditLog'), false, tab);
  });

  test('TabStacks.tsx registers the screen only through stackRoutes(tab, role)', () => {
    const src = read('src/navigation/TabStacks.tsx');
    assert.match(src, /\r?\n {2}AuditLog: AuditLogScreen,\r?\n/);
    assert.match(src, /const routes = stackRoutes\(tab, role\);/);
    const users = SRC.filter((rel) => /\bAuditLogScreen\b/.test(read(rel)));
    assert.deepEqual(users, ['src/navigation/TabStacks.tsx', 'src/screens/audit/AuditLogScreen.tsx']);
  });

  test('nothing in src/ navigates to AuditLog but the More row', () => {
    const NAV = /navigate\(\s*['"]AuditLog['"]|screen:\s*['"]AuditLog['"]/;
    assert.deepEqual(SRC.filter((rel) => NAV.test(read(rel))), ['src/navigation/MoreScreen.tsx']);
    // MoreScreen's open() only ever receives a row that moreSections() returned.
    assert.match(read('src/navigation/MoreScreen.tsx'), /onPress=\{\(\) => open\(item\)\}/);
  });
});

// ── 3. AUD-1 is sent for ADMIN only ──────────────────────────

describe('Audit log: AUD-1 is never sent for another role', () => {
  test('useAuditLog enables the query only when canViewAuditLog(role)', () => {
    const src = read('src/hooks/useAuditLog.ts');
    assert.match(src, /const allowed = !!role && canViewAuditLog\(role\);/);
    assert.match(src, /enabled: allowed,/);
  });
  test('the screen refuses to render the log for anyone else, after its hooks (defence in depth)', () => {
    const src = read('src/screens/audit/AuditLogScreen.tsx');
    const body = src.slice(src.indexOf('export function AuditLogScreen'), src.indexOf('\nfunction lookupText'));
    const gate = body.indexOf('if (!canViewAuditLog(role)) {');
    assert.ok(gate > 0, 'the gate is in the screen');
    assert.doesNotMatch(body.slice(gate), /\buse[A-Z]\w*\(/, 'no hook runs after the early return');
  });
  test('AUD-1 is called from one module only', () => {
    assert.deepEqual(SRC.filter((rel) => /['"`]\/audit-log/.test(read(rel))), ['src/api/auditLog.api.ts']);
    assert.deepEqual(SRC.filter((rel) => /\blistAuditLog\(/.test(read(rel))), ['src/api/auditLog.api.ts', 'src/hooks/useAuditLog.ts']);
  });
});

// ── 4. The requests, through the real client ─────────────────

const sent = [];
let reply = { data: [], total: 0, page: 1, limit: AUDIT_PAGE_SIZE, totalPages: 0, hasNext: false, hasPrev: false };
apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, params: { ...config.params } });
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(reply),
    config,
    request: {},
  };
};
beforeEach(() => {
  sent.length = 0;
});

const TICKET = { id: '3f2a9c1e-0000-4000-8000-000000000001', ticketNumber: 1234 };
const PERSON = { id: '7b1d2c3e-0000-4000-8000-000000000002', displayName: 'Jane Doe' };

describe('Audit log: filters → AUD-1 params', () => {
  const CASES = [
    ['no filter', NO_AUDIT_FILTERS, {}],
    ['entity type', { ...NO_AUDIT_FILTERS, entityType: 'Comment' }, { entityType: 'Comment' }],
    ['ticket', { ...NO_AUDIT_FILTERS, ticket: TICKET }, { ticketId: TICKET.id }],
    ['person', { ...NO_AUDIT_FILTERS, person: PERSON }, { actorId: PERSON.id }],
    ['all three combine', { entityType: 'Ticket', ticket: TICKET, person: PERSON }, { entityType: 'Ticket', ticketId: TICKET.id, actorId: PERSON.id }],
  ];
  for (const [label, filters, expected] of CASES) {
    test(`${label}: auditLogQuery`, () => assert.deepEqual(auditLogQuery(filters), expected));
    test(`${label}: the request the server receives`, async () => {
      await listAuditLog({ ...auditLogQuery(filters), page: 3, limit: AUDIT_PAGE_SIZE });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].method, 'get');
      assert.equal(sent[0].url, '/audit-log');
      assert.deepEqual(sent[0].params, { ...expected, page: 3, limit: 50 });
    });
  }

  test('only the three filters the server reads, plus page and limit, can ever be sent', async () => {
    // Keys a caller might pass by mistake (the web page's Action / From / To / Ticket #): dropped, never sent.
    await listAuditLog({ entityType: 'Ticket', action: 'COMMENTED', from: '2026-11-01', to: '2026-11-02', ticketNumber: 5, search: 'x' });
    assert.deepEqual(Object.keys(sent[0].params).sort(), ['entityType', 'limit', 'page']);
  });

  test('limit never exceeds the server ceiling of 100, page and limit are positive integers', async () => {
    await listAuditLog({ page: 0, limit: 500 });
    assert.deepEqual(sent[0].params, { page: 1, limit: 100 });
    await listAuditLog({});
    assert.deepEqual(sent[1].params, { page: 1, limit: AUDIT_PAGE_SIZE });
  });

  test('active filter count', () => {
    assert.equal(activeAuditFilterCount(NO_AUDIT_FILTERS), 0);
    assert.equal(activeAuditFilterCount({ entityType: 'Ticket', ticket: TICKET, person: null }), 2);
  });
});

describe('Audit log: ticket number → id (TKT-1, the deep-link resolver\'s lookup)', () => {
  test('sends TKT-1 search=<digits>, page 1, limit 5, with the ADMIN scope (no countryId)', async () => {
    reply = { data: [], total: 0, page: 1, limit: 5, totalPages: 0, hasNext: false, hasPrev: false };
    await findTicketIdByNumber('ADMIN', 1234);
    assert.equal(sent[0].url, '/tickets');
    assert.deepEqual(sent[0].params, { search: '1234', page: 1, limit: 5 });
  });
  test('returns the exact ticketNumber match', async () => {
    reply = { data: [{ id: 'other', ticketNumber: 12345 }, { id: TICKET.id, ticketNumber: 1234 }], total: 2, page: 1, limit: 5, totalPages: 1, hasNext: false, hasPrev: false };
    assert.deepEqual(await findTicketIdByNumber('ADMIN', 1234), TICKET);
  });
  test('never "the first row": no exact match → null, so the log is never filtered by the wrong ticket', async () => {
    reply = { data: [{ id: 'other', ticketNumber: 12345 }], total: 1, page: 1, limit: 5, totalPages: 1, hasNext: false, hasPrev: false };
    assert.equal(await findTicketIdByNumber('ADMIN', 1234), null);
  });
});

// ── 5. iOS-5e: persona by persona, by tab, More, deep link and notification tap ──

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
 * unregistered name leaves unhandled, so the stack stays where it was. Both are run (as tests/rbac/kb-announcements).
 */
function landings(tab, role, screen) {
  const first = stackFor(tab, role);
  const firstVisit = first.router.getRehydratedState({ stale: true, routes: [{ name: screen }] }, first.options);
  const later = stackFor(tab, role);
  const laterVisit = later.router.getStateForAction(later.state, CommonActions.navigate(screen), later.options) ?? later.state;
  return [firstVisit, laterVisit].map((s) => s.routes[s.index ?? s.routes.length - 1].name);
}

/** MoreScreen's open(): each More row's route, read from the source (pinned row by row in §1). */
function moreRowRoutes() {
  const src = read('src/navigation/MoreScreen.tsx');
  return Object.fromEntries([...src.matchAll(/case '(\w+)':\s*return navigation\.navigate\('(\w+)'/g)].map((m) => [m[1], m[2]]));
}

const LINKS = [
  `${APP_ORIGIN}/audit-log`,
  `${APP_ORIGIN}/audit-log?page=2&entityType=Ticket`,
  `${APP_ORIGIN}/admin/audit-log`,
  // Ticket links do open in the app: in the TicketLink resolver, never the audit log.
  `${APP_ORIGIN}/ticket/19421`,
  `${APP_ORIGIN}/tickets/3f2a8a4e-1c2b-4c3d-8e9f-0a1b2c3d4e5f`,
  '#19421',
];
const NOTIFICATION_TYPES = ['TICKET_ASSIGNED', 'TICKET_UPDATED', 'TICKET_RESOLVED', 'SLA_WARNING', 'SLA_BREACHED', 'COMMENT_ADDED', 'MENTION'];
const PENDING_SETS = [undefined, [], [{ id: 'apr-1', entityType: 'ticket', entityId: 't-1' }]];

/** Every screen a person can land on from each of the four channels. */
function reachable(role) {
  const by = { tab: new Set(), more: new Set(), deepLink: new Set(), notification: new Set() };

  // Tab: the tab bar's own buttons, a navigate('AuditLog') at tab level, and each tab opened with screen: 'AuditLog'.
  const tabs = tabsFor(role);
  for (const tab of tabs.options.routeNames) {
    by.tab.add(tab);
    for (const screen of stackRoutes(tab, role)) by.tab.add(screen);
    if (tabs.router.getStateForAction(tabs.state, CommonActions.navigate('AuditLog'), tabs.options)) by.tab.add('AuditLog');
    for (const landed of landings(tab, role, 'AuditLog')) by.tab.add(landed);
  }

  // More: every row, opened in the More stack.
  const ROW_ROUTE = moreRowRoutes();
  for (const row of moreSections(role).flatMap((s) => s.items)) {
    for (const landed of landings('MoreTab', role, ROW_ROUTE[row])) by.more.add(landed);
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

describe('Audit log: no non-ADMIN persona can reach it by tab, More, deep link or notification tap (iOS-5e)', () => {
  for (const name of NON_ADMIN) {
    test(`${name}: no tab, More row, deep link or notification tap reaches AuditLog`, () => {
      const by = reachable(PERSONAS[name].role);
      for (const [channel, screens] of Object.entries(by)) assert.equal(screens.has('AuditLog'), false, `${channel} reaches AuditLog`);
      // Not vacuous: each channel does land somewhere.
      assert.ok(by.tab.has('HomeTab') && by.tab.has('More'), 'tabs');
      assert.ok(by.more.has('TaskList') && by.more.has('Profile'), 'More rows');
      assert.deepEqual([...by.deepLink].sort(), ['TicketLink'], 'deep links open only the ticket-link resolver');
      assert.deepEqual([...by.notification].sort(), ['ApprovalDetail', 'TicketDetail'], 'notifications open only a ticket or an approval');
    });
  }

  test('ADMIN (control): the tab and More paths do reach it, so the checks above can fail; links and notifications never do', () => {
    const by = reachable('ADMIN');
    assert.ok(by.tab.has('AuditLog'), 'tab: the More tab opened with screen: AuditLog');
    assert.ok(by.more.has('AuditLog'), 'More row');
    assert.deepEqual([...by.deepLink].sort(), ['TicketLink']);
    assert.deepEqual([...by.notification].sort(), ['ApprovalDetail', 'TicketDetail']);
  });
});

// ── 6. iOS-5e: the screen on iOS ─────────────────────────────

describe('Audit log on iOS: the screen', () => {
  const src = read('src/screens/audit/AuditLogScreen.tsx');
  const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  test('the solid navigation bar titled "Audit log", no drawn header; no record id, so no getId', async () => {
    const { routeTitle } = await import('../../src/navigation/routes.ts');
    assert.equal(routeTitle('AuditLog', 'ADMIN'), 'Audit log');
    assert.doesNotMatch(code, /ScreenHeader/);
    assert.equal(getIdFor('AuditLog'), undefined);
    assert.match(read('src/types/navigation.ts'), /AuditLog: undefined;/);
  });

  test('the list: FlashList, under the toolbar, padded by LIST_TOP_GAP and listBottomInset() (the tab bar takes its own space)', () => {
    assert.match(code, /<FlashList\b/);
    assert.match(code, /paddingTop: LIST_TOP_GAP, paddingBottom: listBottomInset\(\)/);
    assert.doesNotMatch(code, /useSafeAreaInsets|insets\.bottom|contentInsetAdjustmentBehavior/);
    assert.ok(code.indexOf('<OfflineBanner />') < code.indexOf('<SearchField') && code.indexOf('<SearchField') < code.indexOf('<QueryBanner'));
  });

  test('pull-to-refresh (one request: the first page), and every state: loading, offline, error, two empties, footer retry', () => {
    assert.match(code, /refreshControl=\{<RefreshControl refreshing=\{refreshing\} onRefresh=\{onRefresh\} tintColor=\{colors\.primary\} \/>\}/);
    assert.doesNotMatch(code, /RefreshControl[^>]*\bcolors=/);
    assert.match(code, /await refreshFirstPage\(\);/);
    assert.match(code, /<LoadingSkeleton variant="audit" rows=\{4\} \/>/);
    assert.match(code, /<OfflineState what="The audit log" \/>/);
    assert.match(code, /<ErrorState error=\{list\.error\} title="Couldn't load the audit log"/);
    assert.match(code, /title="No entries match these filters"/);
    assert.match(code, /title="No audit entries yet"/);
    assert.match(code, /accessibilityLabel="Couldn't load more entries\. Retry"/);
    assert.match(read('src/components/LoadingSkeleton.tsx'), /case 'audit':/);
  });

  test('VoiceOver hears the ticket lookup (Android\'s live region is TalkBack\'s only); chips grow with the text; no colour literal', () => {
    assert.doesNotMatch(code, /accessibilityLiveRegion=/);
    assert.match(code, /if \(spoken\) AccessibilityInfo\.announceForAccessibility\(spoken\);/);
    assert.match(code, /hitSlop=\{4\}\s+className="min-h-9 /);
    assert.doesNotMatch(code, /className="h-9 /);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?!\d)/);
    // The ticket filter chip's label names the ticket and what a tap does.
    assert.match(code, /accessibilityLabel=\{`Ticket #\$\{filters\.ticket\.ticketNumber\}\. Clear the ticket filter`\}/);
  });

  test('a role is never named in the screen: it reads navRole() and canViewAuditLog() (tests/navigation/shell)', () => {
    assert.match(code, /const role = navRole\(useAuthStore\(\(s\) => s\.user\?\.role\)\);/);
    assert.doesNotMatch(code, /['"`](ADMIN|AGENT|END_USER|L2_MANAGER)['"`]/);
  });
});
