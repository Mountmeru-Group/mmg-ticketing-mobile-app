// G8: the Audit log (M20) is ADMIN only — the drawer row AND the route (docs/G8-WEB-AUDIT.md, ROLE-MATRIX.md §19).
// The server agrees: AUD-1 is `requireAuth, adminOnly` (auditLog.router.ts:8), a 403 for every other role.
//
// For END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin:
//   1. the drawer row: ADMIN only, after Announcements below a divider, before Settings;
//   2. that no other role can REACH the route by any path: the drawer does not register it, so React Navigation's own
//      drawer router (the installed @react-navigation/routers, run here) refuses every action that names it;
//   3. that the screen and its hook send AUD-1 for ADMIN only, and that nothing else in src/ navigates there;
//   4. the requests themselves, through the real axios client: the filters become exactly the params of the backend
//      team's written contract (2026-11-05) plus actorId (in the source), on /audit-logs first and the source's
//      /audit-log only when the server has no such route; a ticket number with no ticket is caught.
// What is real: permissions.ts, React Navigation's router, the AUD-1 module and the axios client. Faked: the network.
// Read as text: the screen and navigators, which need a phone to render.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, DrawerActions, DrawerRouter, StackActions } from '@react-navigation/routers';
import { AxiosHeaders } from 'axios';

import { AUDIT_FILTER_KEYS, AUDIT_PAGE_SIZE, forgetAuditLogPath, listAuditLog } from '../../src/api/auditLog.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { ApiClientError } from '../../src/api/errors.ts';
import { useAuthStore } from '../../src/store/auth.store.ts';
import {
  NO_AUDIT_FILTERS, activeAuditFilterCount, auditDatesLabel, auditLogQuery, auditPresetDays, auditPresetOf,
  auditTicketFilterIgnored, withAuditDay,
} from '../../src/utils/audit-log.ts';
import { canViewAuditLog, drawerItems, drawerRoutes } from '../../src/utils/permissions.ts';
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

// ── 1. The drawer row ────────────────────────────────────────

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
    assert.equal(drawerRoutes('GUEST').includes('AuditLog'), false);
  });

  test('the row is "Audit log", opens the AuditLog route and sits below a divider (DrawerContent.tsx)', () => {
    const src = read('src/navigation/DrawerContent.tsx');
    assert.match(src, /auditLog: \{ label: 'Audit log', icon: '[\w-]+', route: 'AuditLog', dividerBefore: true \}/);
    assert.match(src, /\{row\.dividerBefore \? <View className="mx-4 my-2 border-t border-border" \/> : null\}/);
    // Rows come from drawerItems() alone; the generic navigate(route) only ever receives a row's route.
    assert.match(src, /const rows: DrawerRow\[\] = drawerItems\(role\)\.map\(/);
    assert.match(src, /onPress: go\(DRAWER_ROWS\[item\]\.route\)/);
  });
});

// ── 2. The route: registered for ADMIN only, unreachable for the other four ──

function drawerFor(role) {
  const router = DrawerRouter({ initialRouteName: 'MainTabs', backBehavior: 'fullHistory' });
  const routeNames = drawerRoutes(role);
  const options = { routeNames, routeParamList: Object.fromEntries(routeNames.map((n) => [n, undefined])), routeGetIdList: {} };
  return { router, options, state: router.getInitialState(options) };
}

/** Every action that could put AuditLog on screen: a row, a link, a reset or a stale history entry. */
const ACTIONS = {
  'navigate(AuditLog)': CommonActions.navigate('AuditLog'),
  'navigate(AuditLog) with pop': CommonActions.navigate('AuditLog', undefined, { pop: true }),
  'jumpTo(AuditLog)': DrawerActions.jumpTo('AuditLog'),
  'push(AuditLog)': StackActions.push('AuditLog'),
  'replace(AuditLog)': StackActions.replace('AuditLog'),
  'preload(AuditLog)': CommonActions.preload('AuditLog'),
  'reset to a state that contains it': CommonActions.reset({ index: 1, routes: [{ name: 'MainTabs' }, { name: 'AuditLog' }] }),
};

describe('Audit log: the route', () => {
  forEachPersona('registered', ONLY_ADMIN, (p) => drawerRoutes(p.role).includes('AuditLog'));

  for (const name of NON_ADMIN) {
    test(`${name}: React Navigation's drawer router refuses every way to open AuditLog`, () => {
      const { router, options, state } = drawerFor(PERSONAS[name].role);
      for (const [label, action] of Object.entries(ACTIONS)) {
        // null = not handled: offered to the root stack (Auth, App only), unhandled there too, and dropped.
        assert.equal(router.getStateForAction(state, action, options), null, label);
      }
    });

    test(`${name}: a saved or stale navigation state naming AuditLog is rehydrated without it`, () => {
      const { router, options } = drawerFor(PERSONAS[name].role);
      const rehydrated = router.getRehydratedState({ stale: true, index: 1, routes: [{ name: 'MainTabs' }, { name: 'AuditLog' }] }, options);
      assert.deepEqual(rehydrated.routes.filter((r) => r.name === 'AuditLog'), []);
      assert.equal(rehydrated.routes[rehydrated.index].name, 'MainTabs');
    });
  }

  test('ADMIN: the row\'s action does open it (the gate is the role, not a broken route)', () => {
    const { router, options, state } = drawerFor('ADMIN');
    for (const label of ['navigate(AuditLog)', 'jumpTo(AuditLog)']) {
      const next = router.getStateForAction(state, ACTIONS[label], options);
      assert.ok(next, label);
      assert.equal(next.routes[next.index].name, 'AuditLog', label);
    }
  });

  test('AppDrawer.tsx registers the screen only through drawerRoutes(role)', () => {
    const src = read('src/navigation/AppDrawer.tsx');
    assert.match(src, /\n {2}AuditLog: AuditLogScreen,\n/);
    assert.match(src, /\{drawerRoutes\(role\)\.map\(\(name\) => \(\s*<Drawer\.Screen key=\{name\} name=\{name\} component=\{DRAWER_SCREENS\[name\]\} \/>/);
    const users = SRC.filter((rel) => /\bAuditLogScreen\b/.test(read(rel)));
    assert.deepEqual(users, ['src/navigation/AppDrawer.tsx', 'src/screens/audit/AuditLogScreen.tsx']);
  });

  test('nothing in src/ navigates to AuditLog but the drawer rows', () => {
    const NAV = /navigate\(\s*['"]AuditLog['"]|screen:\s*['"]AuditLog['"]/;
    assert.deepEqual(SRC.filter((rel) => NAV.test(read(rel))), []);
    // The drawer reaches it through its generic navigate(route) for a row's route (above).
    assert.match(read('src/navigation/DrawerContent.tsx'), /default:\s*navigation\.navigate\(route\);/);
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
    const body = src.slice(src.indexOf('export function AuditLogScreen'), src.indexOf('\nfunction SearchLine'));
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

// The network: a path answers what `routes` says, else the JSON page in `reply`.
const sent = [];
let reply;
let routes;
const PAGE = (data = []) => ({ data, total: data.length, page: 1, limit: AUDIT_PAGE_SIZE, totalPages: data.length ? 1 : 0, hasNext: false, hasPrev: false });
const HTML = (status) => ({ status, type: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><body>index</body></html>' });
const JSON_ERROR = (status, error) => ({ status, type: 'application/json; charset=utf-8', body: JSON.stringify({ error }) });

apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, params: { ...config.params }, auth: config.headers?.Authorization });
  const answer = routes[config.url] ?? { status: 200, type: 'application/json; charset=utf-8', body: JSON.stringify(reply) };
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
  reply = PAGE();
  routes = {};
  forgetAuditLogPath();
});

const PERSON = { id: '7b1d2c3e-0000-4000-8000-000000000002', displayName: 'Jane Doe' };
const NOV_5 = new Date(2026, 10, 5, 10, 30);

/** The instant the app sends for a day's first or last moment, on this machine's clock (the phone's, on a phone). */
const startOf = (y, m, d) => new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
const endOf = (y, m, d) => new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();

describe('Audit log: filters → AUD-1 params (the written contract, 2026-11-05)', () => {
  const CASES = [
    ['no filter', NO_AUDIT_FILTERS, {}],
    ['action', { ...NO_AUDIT_FILTERS, action: 'STATUS_CHANGED' }, { action: 'STATUS_CHANGED' }],
    ['entity type', { ...NO_AUDIT_FILTERS, entityType: 'Comment' }, { entityType: 'Comment' }],
    ['one day', { ...NO_AUDIT_FILTERS, dates: { from: '2026-11-05', to: '2026-11-05' } }, { dateFrom: startOf(2026, 11, 5), dateTo: endOf(2026, 11, 5) }],
    ['from a day', { ...NO_AUDIT_FILTERS, dates: { from: '2026-10-01', to: null } }, { dateFrom: startOf(2026, 10, 1) }],
    ['until a day', { ...NO_AUDIT_FILTERS, dates: { from: null, to: '2026-10-31' } }, { dateTo: endOf(2026, 10, 31) }],
    ['ticket number', { ...NO_AUDIT_FILTERS, ticketNumber: 19445 }, { ticketNumber: 19445 }],
    ['person (source only)', { ...NO_AUDIT_FILTERS, person: PERSON }, { actorId: PERSON.id }],
    [
      'all of them combine',
      { action: 'ASSIGNED', entityType: 'Ticket', dates: { from: '2026-11-01', to: '2026-11-05' }, ticketNumber: 19445, person: PERSON },
      { action: 'ASSIGNED', entityType: 'Ticket', dateFrom: startOf(2026, 11, 1), dateTo: endOf(2026, 11, 5), ticketNumber: 19445, actorId: PERSON.id },
    ],
  ];
  for (const [label, filters, expected] of CASES) {
    test(`${label}: auditLogQuery`, () => assert.deepEqual(auditLogQuery(filters), expected));
    test(`${label}: the request the server receives`, async () => {
      await listAuditLog({ ...auditLogQuery(filters), page: 3, limit: AUDIT_PAGE_SIZE });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].method, 'get');
      assert.equal(sent[0].url, '/audit-logs');
      assert.deepEqual(sent[0].params, { ...expected, page: 3, limit: 50 });
    });
  }

  test('only the confirmed params, plus actorId (in the source), can ever be sent', async () => {
    await listAuditLog({ entityType: 'Ticket', action: 'COMMENTED', from: '2026-11-01', to: '2026-11-02', search: 'x', sort: 'asc' });
    assert.deepEqual(Object.keys(sent[0].params).sort(), ['action', 'entityType', 'limit', 'page']);
    const CONFIRMED = ['page', 'limit', 'action', 'entityType', 'dateFrom', 'dateTo', 'ticketId', 'ticketNumber'];
    assert.deepEqual([...AUDIT_FILTER_KEYS].filter((k) => !CONFIRMED.includes(k)), ['actorId']);
  });

  test('dateTo covers all of its day: a bare date would be UTC midnight and drop the rest of it (05 B.40)', () => {
    const { dateFrom, dateTo } = auditLogQuery({ ...NO_AUDIT_FILTERS, dates: { from: '2026-11-05', to: '2026-11-05' } });
    assert.equal(new Date(dateTo) - new Date(dateFrom), 24 * 3600 * 1000 - 1);
    assert.notEqual(dateTo, '2026-11-05');
  });

  test('limit never exceeds the server ceiling of 100, page and limit are positive integers', async () => {
    await listAuditLog({ page: 0, limit: 500 });
    assert.deepEqual(sent[0].params, { page: 1, limit: 100 });
    await listAuditLog({});
    assert.deepEqual(sent[1].params, { page: 1, limit: AUDIT_PAGE_SIZE });
  });

  test('active filter count: each filter once, a span of days once', () => {
    assert.equal(activeAuditFilterCount(NO_AUDIT_FILTERS), 0);
    assert.equal(activeAuditFilterCount({ ...NO_AUDIT_FILTERS, entityType: 'Ticket', ticketNumber: 1, dates: { from: '2026-11-01', to: '2026-11-05' } }), 3);
    assert.equal(activeAuditFilterCount({ action: 'CREATED', entityType: 'Ticket', dates: { from: null, to: '2026-11-05' }, ticketNumber: 1, person: PERSON }), 5);
  });
});

describe('Audit log: the path (the written /audit-logs, then the source\'s /audit-log only if there is no such route)', () => {
  test('the written path answers: one request, and it stays the path', async () => {
    await listAuditLog({});
    await listAuditLog({ page: 2 });
    assert.deepEqual(sent.map((r) => r.url), ['/audit-logs', '/audit-logs']);
  });

  test('no plural route, server in production mode (index.html with 200): the singular, then only the singular', async () => {
    routes['/audit-logs'] = HTML(200);
    reply = PAGE([{ id: 'e1' }]);
    const page = await listAuditLog({ action: 'CREATED' });
    assert.equal(page.data[0].id, 'e1');
    await listAuditLog({ action: 'CREATED', page: 2 });
    assert.deepEqual(sent.map((r) => r.url), ['/audit-logs', '/audit-log', '/audit-log']);
    assert.deepEqual(sent[1].params, sent[0].params, 'the same params on both paths');
  });

  test('no plural route, Express\'s HTML 404 ("Cannot GET"): the singular', async () => {
    routes['/audit-logs'] = HTML(404);
    await listAuditLog({});
    assert.deepEqual(sent.map((r) => r.url), ['/audit-logs', '/audit-log']);
  });

  test('the route\'s own answers never send it to the other path: 403, 500, a plain-text 429', async () => {
    for (const answer of [JSON_ERROR(403, 'Forbidden: insufficient role'), JSON_ERROR(500, 'Internal'), { status: 429, type: 'text/plain', body: 'Too many requests' }]) {
      sent.length = 0;
      forgetAuditLogPath();
      routes = { '/audit-logs': answer };
      await assert.rejects(listAuditLog({}), ApiClientError);
      assert.deepEqual(sent.map((r) => r.url), ['/audit-logs'], String(answer.status));
    }
  });

  test('neither path exists: the screen gets the error, after two requests at most', async () => {
    routes = { '/audit-logs': HTML(404), '/audit-log': HTML(404) };
    await assert.rejects(listAuditLog({}), (error) => error instanceof ApiClientError && error.kind === 'not-json');
    assert.equal(sent.length, 2);
  });

  test('both paths carry the session as a Bearer token', async () => {
    useAuthStore.setState({ token: 'admin-session', user: PERSONAS.ADMIN, issuedAt: Date.now(), isAuthenticated: true, isLoading: false });
    routes['/audit-logs'] = HTML(200);
    await listAuditLog({});
    assert.deepEqual(sent.map((r) => r.auth), ['Bearer admin-session', 'Bearer admin-session']);
  });
});

describe('Audit log: a ticket number with no ticket (the server then filters nothing, 05 B.40)', () => {
  const entry = (n) => ({ id: `e-${n}`, ticket: n === null ? null : { id: `t-${n}`, ticketNumber: n, title: 'x' } });

  test('every entry on that ticket, or none at all: the filter was applied', () => {
    assert.equal(auditTicketFilterIgnored([entry(19445), entry(19445)], 19445), false);
    assert.equal(auditTicketFilterIgnored([], 19445), false);
  });

  test('any entry from another ticket, or from none: the whole log came back, so there is no such ticket', () => {
    assert.equal(auditTicketFilterIgnored([entry(19445), entry(19446)], 19445), true);
    assert.equal(auditTicketFilterIgnored([entry(null)], 19445), true);
  });

  test('useAuditLog then shows no entries and no total and loads no more; the screen says "No ticket #n"', () => {
    const hook = read('src/hooks/useAuditLog.ts');
    assert.match(hook, /if \(ticketMissing\) return \[\];/);
    assert.match(hook, /const total = ticketMissing \? 0 : query\.data\?\.pages\[0\]\?\.total;/);
    assert.match(hook, /!ignored\(pages\[0\]\) && normalisePage\(last\)\.hasNext/);
    assert.match(read('src/screens/audit/AuditLogScreen.tsx'), /title=\{`No ticket #\$\{filters\.ticketNumber\}`\}/);
  });
});

describe('Audit log: the Dates filter', () => {
  test('quick spans are whole days ending today, on the phone\'s calendar', () => {
    assert.deepEqual(auditPresetDays('any', NOV_5), { from: null, to: null });
    assert.deepEqual(auditPresetDays('today', NOV_5), { from: '2026-11-05', to: '2026-11-05' });
    assert.deepEqual(auditPresetDays('yesterday', NOV_5), { from: '2026-11-04', to: '2026-11-04' });
    assert.deepEqual(auditPresetDays('last7', NOV_5), { from: '2026-10-30', to: '2026-11-05' });
    assert.deepEqual(auditPresetDays('last30', NOV_5), { from: '2026-10-07', to: '2026-11-05' });
  });

  test('the chip names the span; the sheet ticks a matching quick span', () => {
    assert.equal(auditDatesLabel({ from: null, to: null }, NOV_5), 'Any date');
    assert.equal(auditDatesLabel(auditPresetDays('last7', NOV_5), NOV_5), 'Last 7 days');
    assert.equal(auditDatesLabel({ from: '2026-11-02', to: '2026-11-02' }, NOV_5), '2 Nov');
    assert.equal(auditDatesLabel({ from: '2026-10-28', to: '2026-11-02' }, NOV_5), '28 Oct – 2 Nov');
    assert.equal(auditDatesLabel({ from: '2025-12-30', to: null }, NOV_5), 'From 30 Dec 2025');
    assert.equal(auditDatesLabel({ from: null, to: '2026-11-02' }, NOV_5), 'Until 2 Nov');
    assert.equal(auditPresetOf(auditPresetDays('yesterday', NOV_5), NOV_5), 'yesterday');
    assert.equal(auditPresetOf({ from: '2026-10-28', to: '2026-11-02' }, NOV_5), null);
  });

  test('a day picked by hand never leaves From after To', () => {
    assert.deepEqual(withAuditDay({ from: null, to: '2026-11-02' }, 'from', '2026-11-04'), { from: '2026-11-04', to: '2026-11-04' });
    assert.deepEqual(withAuditDay({ from: '2026-11-04', to: null }, 'to', '2026-11-01'), { from: '2026-11-01', to: '2026-11-01' });
    assert.deepEqual(withAuditDay({ from: '2026-11-01', to: '2026-11-05' }, 'to', '2026-11-03'), { from: '2026-11-01', to: '2026-11-03' });
  });

  test('the screen offers Action and Dates beside Entity type and Person', () => {
    const screen = read('src/screens/audit/AuditLogScreen.tsx');
    for (const chip of ['icon="flash-outline"', 'icon="calendar-outline"', 'icon="pricetag-outline"', 'icon="person-outline"']) assert.ok(screen.includes(chip), chip);
    assert.match(screen, /title="Action"\s*options=\{ACTION_OPTIONS\}/);
    assert.match(screen, /title="Dates"\s*options=\{dateOptions\}/);
    assert.match(screen, /maximumDate: new Date\(\),/);
  });
});

