// G7: Approvals for every role (Ronit, 2026-11-02). The web's rules, with sources: docs/G7-PERIOD-APPROVALS-PUSH.md §2.
// For END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin:
//   1. the drawer row, whatever is pending;
//   2. that the route is REACHABLE, not merely listed: registered for every role, and React Navigation's own drawer
//      router (the installed @react-navigation/routers) opens it with the action the row sends;
//   3. that the inbox reads APR-1 only, never the unscoped GET /approvals (05 C.16), and that an empty answer is the
//      "Nothing waiting for you" state, not an error.
// What is real: permissions.ts, React Navigation's router, the APR module and the axios client. Faked: the network.
//
// iOS-5e: Android's tests/rbac/approvals-visibility.test.mjs (51f5554), the same 25 tests, adapted where Android reads
// its drawer. iOS has no drawer: the drawer row is the Approvals TAB for ADMIN and AGENT and a permanent More row for
// END_USER and L2_MANAGER (permissions.ts hasApprovalsTab, moreSections; Ronit's Q1 (a)), and the routes are the tab
// stacks' (routes.ts stackRoutes, the iOS form of drawerRoutes), so the drawer router's checks run on React Navigation's
// TabRouter and on the More tab's StackRouter. Section 4 is new on iOS: every persona's tabs, More rows and badges equal
// permissions.ts, and G7's push client (G7c) is not in this app at all.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, StackRouter, TabRouter } from '@react-navigation/routers';
import { AxiosHeaders } from 'axios';

import { listPendingApprovals } from '../../src/api/approvals.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { getIdFor, stackRoutes } from '../../src/navigation/routes.ts';
import { appTabs, drawerItems, hasApprovalsTab, moreSections, tabBadges } from '../../src/utils/permissions.ts';
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

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, params: config.params });
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: '[]', // APR-1 for someone with nothing pending (approvals.controller.ts:105-112): 200 []
    config,
    request: {},
  };
};

/** Where each persona's Approvals lives on iOS: the tab, or the first More row (Q1 (a)). */
const WHERE = { END_USER: 'more', AGENT: 'tab', TRIAGE_AGENT: 'tab', L2_MANAGER: 'more', ADMIN: 'tab' };

describe('Approvals: the drawer row', () => {
  forEachPersona(
    'row shown with nothing pending',
    { END_USER: true, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: true, ADMIN: true },
    (p) => drawerItems(p.role).includes('approvals'),
  );
  forEachPersona(
    'it is the first row, as before for ADMIN and AGENT',
    { END_USER: 0, AGENT: 0, TRIAGE_AGENT: 0, L2_MANAGER: 0, ADMIN: 0 },
    (p) => drawerItems(p.role).indexOf('approvals'),
  );
  test('iOS: the More row opens the inbox with the pending count as the badge (MoreScreen.tsx); the tab has it too (AppTabs.tsx)', () => {
    const src = read('src/navigation/MoreScreen.tsx');
    assert.match(src, /approvals: \{ label: 'Approvals', icon: '[\w-]+' \}/);
    assert.match(src, /case 'approvals':\s*return navigation\.navigate\('ApprovalsInbox'\);/);
    assert.match(src, /badge=\{item === 'approvals' \? pendingApprovals : 0\}/);
    assert.match(read('src/navigation/AppTabs.tsx'), /const badges = tabBadges\(role, \{ unread, pendingApprovals \}\);/);
  });
});

// ── 2. The route is reachable for every role ─────────────────

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

/** The tab navigator exactly as AppTabs.tsx configures it: this role's tabs (appTabs), Home first. */
function tabsFor(role) {
  const routeNames = appTabs(role).map((t) => t.name);
  const router = TabRouter({ initialRouteName: 'HomeTab', backBehavior: 'firstRoute' });
  const options = { routeNames, routeParamList: Object.fromEntries(routeNames.map((n) => [n, undefined])), routeGetIdList: {} };
  return { router, options, state: router.getInitialState(options) };
}

describe('Approvals: the route is reachable for every role', () => {
  forEachPersona(
    'registered (iOS: the More stack registers ApprovalsInbox for every role)',
    { END_USER: true, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: true, ADMIN: true },
    (p) => stackRoutes('MoreTab', p.role).includes('ApprovalsInbox'),
  );

  for (const name of NAMES) {
    test(`${name}: React Navigation's routers open Approvals with the row's action (iOS: the ${WHERE[name] === 'tab' ? 'Approvals tab' : 'More row'})`, () => {
      const role = PERSONAS[name].role;
      if (WHERE[name] === 'tab') {
        const tabs = tabsFor(role);
        const next = tabs.router.getStateForAction(tabs.state, CommonActions.navigate('ApprovalsTab'), tabs.options);
        assert.notEqual(next, null, 'the tab is handled');
        assert.equal(next.routes[next.index].name, 'ApprovalsTab');
        assert.equal(stackRoutes('ApprovalsTab', role)[0], 'ApprovalsInbox', 'the tab opens on the inbox');
      } else {
        const tabs = tabsFor(role);
        assert.equal(tabs.router.getStateForAction(tabs.state, CommonActions.navigate('ApprovalsTab'), tabs.options), null, 'no tab');
      }
      // The More row's action (MoreScreen.tsx open('approvals')), in the More stack. It is registered for ADMIN and AGENT
      // too, where Home's shortcut never uses it (hasApprovalsTab) and no More row sends it.
      const more = stackFor('MoreTab', role);
      const next = more.router.getStateForAction(more.state, CommonActions.navigate('ApprovalsInbox'), more.options);
      assert.notEqual(next, null, 'handled');
      assert.equal(next.routes[next.index].name, 'ApprovalsInbox');
    });
  }

  test('TabStacks.tsx registers exactly stackRoutes(), and AppTabs.tsx exactly appTabs(), so a listed route is a mounted one', () => {
    assert.match(read('src/navigation/TabStacks.tsx'), /const routes = stackRoutes\(tab, role\);/);
    assert.match(read('src/navigation/AppTabs.tsx'), /\{appTabs\(role\)\.map\(/);
  });
});

describe('Approvals: APR-1 only, and nothing pending is not an error', () => {
  beforeEach(() => {
    sent.length = 0;
  });

  test('the inbox reads GET /approvals/pending and gets [] (200) for anyone with nothing pending', async () => {
    const rows = await listPendingApprovals();
    assert.deepEqual(rows, []);
    assert.deepEqual(sent.map((r) => `${r.method} ${r.url}`), ['get /approvals/pending']);
  });

  test('no file in src/ sends the unscoped GET /approvals (05 C.16)', () => {
    for (const file of sourceFiles('src')) {
      assert.doesNotMatch(read(file), /\.get(<[^>]*>)?\(\s*['"`]\/approvals['"`?]/, file);
    }
  });

  test('the empty inbox reads as "nothing waiting", with no error wording', () => {
    const src = read('src/screens/approvals/ApprovalsInboxScreen.tsx');
    assert.match(src, /title=\{filter === 'ALL' \? 'Nothing waiting for you' : 'Nothing of this type'\}/);
    assert.match(src, /illustration="clear"/);
  });
});

// ── 4. iOS-5e: each persona's tabs, More rows and badges, from permissions.ts alone ──

describe('Approvals on iOS: tab or More row per persona, equal to permissions.ts (iOS-5e)', () => {
  const TAB = ['HomeTab', 'TicketsTab', 'ApprovalsTab', 'AlertsTab', 'MoreTab'];
  const NO_TAB = ['HomeTab', 'TicketsTab', 'AlertsTab', 'MoreTab'];

  forEachPersona(
    'tabs',
    { END_USER: NO_TAB, AGENT: TAB, TRIAGE_AGENT: TAB, L2_MANAGER: NO_TAB, ADMIN: TAB },
    (p) => appTabs(p.role).map((t) => t.name),
  );

  forEachPersona(
    'Approvals in More (first row of the first section), whatever is pending',
    { END_USER: true, AGENT: false, TRIAGE_AGENT: false, L2_MANAGER: true, ADMIN: false },
    (p) => moreSections(p.role)[0].items[0] === 'approvals',
  );

  for (const pending of [0, 2]) {
    forEachPersona(
      `badges with ${pending} pending`,
      pending
        ? { END_USER: { MoreTab: 2 }, AGENT: { ApprovalsTab: 2 }, TRIAGE_AGENT: { ApprovalsTab: 2 }, L2_MANAGER: { MoreTab: 2 }, ADMIN: { ApprovalsTab: 2 } }
        : { END_USER: {}, AGENT: {}, TRIAGE_AGENT: {}, L2_MANAGER: {}, ADMIN: {} },
      (p) => tabBadges(p.role, { unread: 0, pendingApprovals: pending }),
    );
  }

  test('every persona reaches Approvals exactly once: the tab XOR the More row (one route per screen)', () => {
    for (const name of NAMES) {
      const role = PERSONAS[name].role;
      const inTab = appTabs(role).some((t) => t.name === 'ApprovalsTab');
      const inMore = moreSections(role).some((s) => s.items.includes('approvals'));
      assert.equal(inTab, hasApprovalsTab(role), name);
      assert.ok(inTab !== inMore, `${name}: tab ${inTab}, More ${inMore}`);
      assert.equal(inTab ? 'tab' : 'more', WHERE[name], name);
    }
  });

  test('Home\'s shortcut opens the tab or the More row by hasApprovalsTab(), never by role (HomeScreen.tsx)', () => {
    const src = read('src/screens/dashboard/HomeScreen.tsx');
    assert.match(src, /hasApprovalsTab\(role\)\s*\? navigation\.navigate\('ApprovalsTab', \{ screen: 'ApprovalsInbox', pop: true \}\)\s*: navigation\.navigate\('MoreTab', \{ screen: 'ApprovalsInbox', initial: false, pop: true \}\)/);
  });
});

describe('G7c (push) is not in the iOS app (iOS-5e: not ported)', () => {
  test('expo-notifications is not a dependency, not an app.json plugin, and not imported anywhere', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal('expo-notifications' in { ...pkg.dependencies, ...pkg.devDependencies }, false, 'package.json');
    assert.doesNotMatch(read('app.json'), /expo-notifications/, 'app.json');
    assert.doesNotMatch(read('package-lock.json'), /"node_modules\/expo-notifications"/, 'package-lock.json');
    for (const file of [...sourceFiles('src'), 'App.tsx', 'index.ts']) {
      assert.doesNotMatch(read(file), /from ['"]expo-notifications['"]|require\(['"]expo-notifications['"]\)/, file);
    }
  });

  test('none of Android\'s push files or calls came across: no src/push, no push store, no NTF-5/NTF-6 call, no PushBridge', () => {
    const files = sourceFiles('src');
    assert.deepEqual(files.filter((f) => /^src\/push\/|\/push\.store\.ts$|\/utils\/push\.ts$/.test(f)), []);
    for (const file of [...files, 'App.tsx']) {
      const src = read(file);
      assert.doesNotMatch(src, /device-token|registerDeviceToken|unregisterPushForSignOut|PushBridge|requestPushOnAlertsOpen/, file);
    }
  });
});
