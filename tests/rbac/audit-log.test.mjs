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
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, DrawerActions, DrawerRouter, StackActions } from '@react-navigation/routers';
import { AxiosHeaders } from 'axios';

import { AUDIT_PAGE_SIZE, listAuditLog } from '../../src/api/auditLog.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { findTicketIdByNumber } from '../../src/hooks/useAuditLog.ts';
import { NO_AUDIT_FILTERS, activeAuditFilterCount, auditLogQuery } from '../../src/utils/audit-log.ts';
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
    const body = src.slice(src.indexOf('export function AuditLogScreen'), src.indexOf('\nfunction LookupLine'));
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
