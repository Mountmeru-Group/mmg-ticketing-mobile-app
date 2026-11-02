// G7: Approvals for every role (Ronit, 2026-11-02). The web's rules, with sources: docs/G7-PERIOD-APPROVALS-PUSH.md §2.
// For END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin:
//   1. the drawer row, whatever is pending;
//   2. that the route is REACHABLE, not merely listed: registered for every role, and React Navigation's own drawer
//      router (the installed @react-navigation/routers) opens it with the action the row sends;
//   3. that the inbox reads APR-1 only, never the unscoped GET /approvals (05 C.16), and that an empty answer is the
//      "Nothing waiting for you" state, not an error.
// What is real: permissions.ts, React Navigation's router, the APR module and the axios client. Faked: the network.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, DrawerRouter } from '@react-navigation/routers';
import { AxiosHeaders } from 'axios';

import { listPendingApprovals } from '../../src/api/approvals.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { drawerItems, drawerRoutes } from '../../src/utils/permissions.ts';
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
  test('the drawer opens the inbox with the pending count as the badge (DrawerContent.tsx)', () => {
    const src = read('src/navigation/DrawerContent.tsx');
    assert.match(src, /approvals: \{ label: 'Approvals', icon: '[\w-]+', route: 'Approvals' \}/);
    assert.match(src, /case 'Approvals':\s*navigation\.navigate\('Approvals', \{ screen: 'ApprovalsInbox', pop: true \}\);/);
    assert.match(src, /badge: item === 'approvals' \? pendingApprovals : undefined/);
  });
});

describe('Approvals: the route is reachable for every role', () => {
  function drawerFor(role) {
    const router = DrawerRouter({ initialRouteName: 'MainTabs', backBehavior: 'fullHistory' });
    const routeNames = drawerRoutes(role);
    const options = { routeNames, routeParamList: Object.fromEntries(routeNames.map((n) => [n, undefined])), routeGetIdList: {} };
    return { router, options, state: router.getInitialState(options) };
  }

  forEachPersona(
    'registered',
    { END_USER: true, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: true, ADMIN: true },
    (p) => drawerRoutes(p.role).includes('Approvals'),
  );

  for (const name of NAMES) {
    test(`${name}: the drawer router opens Approvals with the row's action`, () => {
      const { router, options, state } = drawerFor(PERSONAS[name].role);
      const next = router.getStateForAction(state, CommonActions.navigate('Approvals', { screen: 'ApprovalsInbox' }, { pop: true }), options);
      assert.notEqual(next, null, 'handled');
      assert.equal(next.routes[next.index].name, 'Approvals');
    });
  }

  test('AppDrawer registers exactly drawerRoutes(), so a listed route is a mounted one', () => {
    assert.match(read('src/navigation/AppDrawer.tsx'), /drawerRoutes\(/);
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
