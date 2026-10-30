// One screen per record on iOS (docs/PERFORMANCE.md §9.7, docs/ios/00-PORT-MANIFEST.md §4.5).
// React Navigation reuses the current screen when the same route name is opened again. Without getId, a ticket, task or
// approval opened over another of its kind took over that screen and its state (staged files, a typed comment, the
// approval Approve acts on). On iOS every tab stack registers the record screens, so this is checked for all five.
// - Coverage: every route whose params name a record has getId, or is listed with its reason in WITHOUT_GET_ID.
// - Behaviour: randomised navigation on the installed StackRouter, with the stacks and getId functions the app builds
//   its navigators from (src/navigation/routes.ts). Zero screen-reuse events are required; the same runs without getId
//   must find some, which proves the check can see one.
// - iOS-3b: the write sheets (reply, status, assign, submit for approval) get getId too, by their ticket or tickets, so
//   a typed reply, staged files or a closure form can't move to another ticket. Checked the same way on the root stack.
// - iOS-3c: the task editor gets one too, by its task (the ticket, then the task or "new"). The modules' own routes get
//   focused runs (Approvals, Tasks, Knowledge, Catalogue: 2,000 runs of 40 actions on each stack the module lives in),
//   and on the approval screens the runs also check what Approve and Reject would act on: always the approval the
//   screen shows (utils/approvals.ts approvalOnScreen), and Android's rule alone would not hold that without getId.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import { AxiosHeaders } from 'axios';

import { approveApproval, rejectApproval } from '../../src/api/approvals.api.ts';
import { apiClient } from '../../src/api/client.ts';

import {
  RECORD_ID_PARAM,
  RECORD_ROUTES,
  SHEET_ID_PARAM,
  SHEET_ROUTES,
  STACK_ROUTES,
  WITHOUT_GET_ID,
  getIdFor,
} from '../../src/navigation/routes.ts';
import { approvalOnScreen } from '../../src/utils/approvals.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const TABS = Object.keys(STACK_ROUTES);

/** Route → its param names, read from the param lists in src/types/navigation.ts. */
function paramNamesByRoute() {
  const src = read('src/types/navigation.ts');
  const routes = new Map();
  for (const match of src.matchAll(/^\s+(\w+):\s*\{([^}]*)\}/gm)) {
    const names = [...match[2].matchAll(/(\w+)\??:/g)].map((m) => m[1]);
    routes.set(match[1], names);
  }
  return routes;
}

describe('coverage', () => {
  test('the record screens are in every tab stack', () => {
    for (const tab of TABS) {
      for (const route of RECORD_ROUTES) assert.ok(STACK_ROUTES[tab].includes(route), `${tab} lacks ${route}`);
    }
  });

  test('sheets are never in a tab stack (they cover the tab bar from the root stack)', () => {
    for (const tab of TABS) {
      for (const sheet of SHEET_ROUTES) assert.equal(STACK_ROUTES[tab].includes(sheet), false, `${tab} has ${sheet}`);
    }
  });

  test('every route whose params name a record has getId, or a written reason not to', () => {
    const params = paramNamesByRoute();
    const recordParam = /(Id|Ids|slug)$/;
    const named = [...params].filter(([, names]) => names.some((n) => recordParam.test(n))).map(([route]) => route);
    assert.ok(named.length >= 10, `parsed too few routes: ${named.join(', ')}`);
    for (const route of named) {
      assert.ok(
        route in RECORD_ID_PARAM || route in SHEET_ID_PARAM || route in WITHOUT_GET_ID,
        `${route} has a record param but no getId`,
      );
    }
  });

  test('the write sheets have getId by their ticket(s) (iOS-3b), and the task editor by its task (iOS-3c)', () => {
    const params = paramNamesByRoute();
    assert.deepEqual(SHEET_ID_PARAM, {
      ReplyComposer: 'ticketId',
      StatusClosure: 'ticketIds',
      AssignPicker: 'ticketIds',
      SubmitApproval: 'ticketId',
      TaskEditor: 'ticketId',
    });
    for (const [route, key] of Object.entries(SHEET_ID_PARAM)) {
      assert.ok(SHEET_ROUTES.includes(route), `${route} is not a sheet`);
      assert.ok(params.get(route)?.includes(key), `${route} has no param ${key}`);
      assert.equal(route in WITHOUT_GET_ID, false, `${route} is also listed without getId`);
    }
    assert.ok(params.get('TaskEditor')?.includes('taskId'));
    for (const route of ['CreateTicket', 'TicketFilters']) assert.equal(getIdFor(route), undefined, route);
  });

  test('the task editor\'s id: the ticket, then the task or "new"; another task or ticket is another sheet (iOS-3c)', () => {
    const id = (params) => getIdFor('TaskEditor')({ params });
    assert.equal(id({ ticketId: 't-1' }), 't-1/new');
    assert.equal(id({ ticketId: 't-1', taskId: 'k-1' }), 't-1/k-1');
    assert.notEqual(id({ ticketId: 't-1', taskId: 'k-2' }), id({ ticketId: 't-1', taskId: 'k-1' }));
    assert.notEqual(id({ ticketId: 't-2' }), id({ ticketId: 't-1' }));
    assert.equal(id({ taskId: 'k-1' }), undefined);
    assert.equal(id(undefined), undefined);
  });

  test('a sheet id: the ticket id, or a batch\'s ids joined in order; nothing for an empty or malformed list', () => {
    assert.equal(getIdFor('ReplyComposer')({ params: { ticketId: 't-1', mode: 'note' } }), 't-1');
    assert.equal(getIdFor('SubmitApproval')({ params: { ticketId: 't-2' } }), 't-2');
    assert.equal(getIdFor('StatusClosure')({ params: { ticketIds: ['t-1'], target: 'RESOLVED' } }), 't-1');
    assert.equal(getIdFor('AssignPicker')({ params: { ticketIds: ['t-1', 't-2', 't-3'] } }), 't-1,t-2,t-3');
    assert.notEqual(getIdFor('AssignPicker')({ params: { ticketIds: ['t-1', 't-2'] } }), getIdFor('AssignPicker')({ params: { ticketIds: ['t-1'] } }));
    for (const ticketIds of [[], undefined, [1, 2], 't-1']) {
      const expected = typeof ticketIds === 'string' ? 't-1' : undefined;
      assert.equal(getIdFor('StatusClosure')({ params: { ticketIds } }), expected, JSON.stringify(ticketIds));
    }
  });

  test('each getId reads a param the route really has', () => {
    const params = paramNamesByRoute();
    for (const [route, key] of Object.entries(RECORD_ID_PARAM)) {
      assert.ok(params.get(route)?.includes(key), `${route} has no param ${key}`);
      assert.equal(getIdFor(route)({ params: { [key]: 'rec-1' } }), 'rec-1');
      assert.equal(getIdFor(route)({ params: undefined }), undefined);
    }
  });

  test('every getId route is registered in a stack, and the detail routes in the iOS-2 brief are among them', () => {
    const registered = new Set(TABS.flatMap((tab) => STACK_ROUTES[tab]));
    for (const route of Object.keys(RECORD_ID_PARAM)) assert.ok(registered.has(route), route);
    assert.deepEqual(Object.keys(RECORD_ID_PARAM).sort(), [
      'ApprovalDetail', 'KbArticle', 'ServiceRequestDetail', 'ServiceRequestForm', 'TaskDetail', 'TicketDetail',
    ]);
  });

  test('routes without a record take no getId', () => {
    for (const route of ['Home', 'TicketList', 'More', 'TicketLink', 'ServiceCatalog']) assert.equal(getIdFor(route), undefined);
  });

  test('the navigators are built from the table, with getIdFor on every screen', () => {
    const stacks = read('src/navigation/TabStacks.tsx');
    // iOS-5b: through stackRoutes(), which keeps STACK_ROUTES' order and leaves out only the routes the role may not open
    // (the knowledge base and Announcements, ADMIN only; tests/rbac/kb-announcements.test.mjs).
    assert.ok(stacks.includes('const routes = stackRoutes(tab, role);'), 'TabStacks must build each stack from stackRoutes()');
    assert.ok(read('src/navigation/routes.ts').includes('const routes: readonly StackRoute[] = STACK_ROUTES[tab];'), 'stackRoutes() must read STACK_ROUTES');
    assert.ok(stacks.includes('getId={getIdFor(name)}'), 'TabStacks must pass getIdFor to every screen');
    assert.equal(/<Stack\.Screen[^>]*name="/.test(stacks), false, 'TabStacks hard-codes a screen');
    const root = read('src/navigation/RootNavigator.tsx');
    assert.ok(root.includes('SHEET_ROUTES.map('), 'RootNavigator must build the sheets from SHEET_ROUTES');
    assert.ok(root.includes('getId={getIdFor(name)}'), 'RootNavigator must pass getIdFor to every sheet');
  });
});

// ── Randomised navigation on the real StackRouter ────────────

/** mulberry32: a small PRNG whose every bit varies (§9.7's first run used one whose low bits did not). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDS = ['rec-a', 'rec-b', 'rec-c'];

function paramsFor(route, id) {
  const key = RECORD_ID_PARAM[route];
  if (route === 'TaskDetail') return { ticketId: 'ticket-x', taskId: id };
  if (route === 'TicketLink') return { link: `#${IDS.indexOf(id) + 1}` };
  return key ? { [key]: id } : undefined;
}

/**
 * Runs `runs` sequences of `steps` actions on one stack and counts screen-reuse events: a record route whose key, once
 * shown with one record, later shows another.
 */
function reuseEvents(routeNames, { withGetId, runs, steps, seed }) {
  const router = StackRouter({ initialRouteName: routeNames[0] });
  const routeGetIdList = withGetId ? Object.fromEntries(routeNames.map((n) => [n, getIdFor(n)])) : {};
  const options = { routeNames, routeParamList: {}, routeGetIdList };
  const records = routeNames.filter((n) => n in RECORD_ID_PARAM);
  const others = routeNames.filter((n) => !(n in RECORD_ID_PARAM));
  const next = random(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  let events = 0;

  for (let run = 0; run < runs; run += 1) {
    let state = router.getInitialState(options);
    const seen = new Map();
    for (let step = 0; step < steps; step += 1) {
      const roll = next();
      const target = roll < 0.75 ? pick(records) : pick(others);
      const params = paramsFor(target, pick(IDS));
      let action;
      if (roll < 0.45) action = CommonActions.navigate(target, params);
      else if (roll < 0.6) action = CommonActions.navigate(target, params, { pop: true });
      else if (roll < 0.75) action = StackActions.replace(target, params);
      else if (roll < 0.85) action = CommonActions.navigate(target, params);
      else action = state.routes.length > 1 ? StackActions.pop() : CommonActions.navigate(routeNames[0]);
      state = router.getStateForAction(state, action, options) ?? state;

      for (const route of state.routes) {
        const key = RECORD_ID_PARAM[route.name];
        if (!key) continue;
        const id = route.params?.[key];
        if (seen.has(route.key) && seen.get(route.key) !== id) events += 1;
        seen.set(route.key, id);
      }
    }
  }
  return events;
}

describe('randomised navigation: 2,000 runs of 40 actions per tab stack', () => {
  const RUNS = 2000;
  const STEPS = 40;
  TABS.forEach((tab, i) => {
    const routes = [...STACK_ROUTES[tab]];
    test(`${tab}: 0 screen-reuse events with getId; the same runs without it find some`, () => {
      const seed = 0x5e70 + i;
      const without = reuseEvents(routes, { withGetId: false, runs: RUNS, steps: STEPS, seed });
      const withGetId = reuseEvents(routes, { withGetId: true, runs: RUNS, steps: STEPS, seed });
      assert.ok(without > 0, `the check found no reuse even without getId (${without})`);
      assert.equal(withGetId, 0);
    });
  });
});

// ── iOS-3b: the write sheets on the root stack ───────────────

describe('the write sheets: one sheet per ticket or batch (root stack, iOS-3b)', () => {
  const ROOT = ['App', ...SHEET_ROUTES];
  const sheetParams = (route, ids) =>
    ({
      ReplyComposer: { ticketId: ids[0], mode: 'reply' },
      StatusClosure: { ticketIds: ids, target: 'CLOSED' },
      AssignPicker: { ticketIds: ids },
      SubmitApproval: { ticketId: ids[0] },
      // iOS-3c: a second id is the task being edited; one id alone opens a new task on that ticket.
      TaskEditor: ids[1] ? { ticketId: ids[0], taskId: ids[1] } : { ticketId: ids[0] },
    })[route];
  const rootOptions = (withGetId) => ({
    routeNames: ROOT,
    routeParamList: {},
    routeGetIdList: withGetId ? Object.fromEntries(ROOT.map((n) => [n, getIdFor(n)])) : {},
  });
  const sheetId = (route) => (route.name in SHEET_ID_PARAM ? getIdFor(route.name)({ params: route.params }) : undefined);

  for (const sheet of Object.keys(SHEET_ID_PARAM)) {
    test(`${sheet}: opened for ticket B over ticket A's, it is a new sheet; without getId A's sheet would take B`, () => {
      for (const withGetId of [true, false]) {
        const router = StackRouter({ initialRouteName: 'App' });
        const options = rootOptions(withGetId);
        let state = router.getInitialState(options);
        state = router.getStateForAction(state, CommonActions.navigate(sheet, sheetParams(sheet, ['ticket-a'])), options);
        const keyA = state.routes.at(-1).key;
        state = router.getStateForAction(state, CommonActions.navigate(sheet, sheetParams(sheet, ['ticket-b'])), options);
        const top = state.routes.at(-1);
        const idOf = (ids) => getIdFor(sheet)({ params: sheetParams(sheet, ids) });
        assert.equal(sheetId(top), idOf(['ticket-b']));
        if (withGetId) {
          assert.equal(state.routes.length, 3);
          assert.notEqual(top.key, keyA, 'B got its own sheet');
          assert.equal(sheetId(state.routes[1]), idOf(['ticket-a']), "A's sheet still holds A");
        } else {
          assert.equal(state.routes.length, 2);
          assert.equal(top.key, keyA, "without getId, A's sheet (and what was typed in it) now shows B");
        }
      }
    });
  }

  test('2,000 runs of 40 actions over the sheets: 0 reuse events with getId; the same runs without it find some', () => {
    const sheets = Object.keys(SHEET_ID_PARAM);
    const batches = [['rec-a'], ['rec-b'], ['rec-a', 'rec-b'], ['rec-b', 'rec-c']];
    function events(withGetId) {
      const router = StackRouter({ initialRouteName: 'App' });
      const options = rootOptions(withGetId);
      const next = random(0x5ee7);
      const pick = (list) => list[Math.floor(next() * list.length)];
      let count = 0;
      for (let run = 0; run < 2000; run += 1) {
        let state = router.getInitialState(options);
        const seen = new Map();
        for (let step = 0; step < 40; step += 1) {
          const roll = next();
          const sheet = pick(sheets);
          const action =
            roll < 0.7
              ? CommonActions.navigate(sheet, sheetParams(sheet, pick(batches)))
              : state.routes.length > 1
                ? StackActions.pop()
                : CommonActions.navigate('App');
          state = router.getStateForAction(state, action, options) ?? state;
          for (const route of state.routes) {
            const id = sheetId(route);
            if (id === undefined) continue;
            if (seen.has(route.key) && seen.get(route.key) !== id) count += 1;
            seen.set(route.key, id);
          }
        }
      }
      return count;
    }
    const without = events(false);
    assert.ok(without > 0, `the check found no reuse even without getId (${without})`);
    assert.equal(events(true), 0);
  });
});

// ── iOS-3c: the module stacks ────────────────────────────────

/**
 * Each module's routes, in every tab stack the module lives in. The router knows the whole stack (STACK_ROUTES), as the
 * navigator does; the actions target only the module's routes, so they reach them far more often than the whole-stack
 * runs above. The first route is the stack's root.
 */
const MODULES = {
  Approvals: {
    ApprovalsTab: ['ApprovalsInbox', 'ApprovalDetail', 'TicketDetail'],
    MoreTab: ['More', 'ApprovalsInbox', 'ApprovalDetail', 'TicketDetail'],
    AlertsTab: ['Notifications', 'ApprovalDetail', 'TicketDetail'],
  },
  Tasks: {
    MoreTab: ['More', 'TaskList', 'TaskDetail', 'TicketDetail'],
    TicketsTab: ['TicketList', 'TicketDetail', 'TaskDetail'],
  },
  Knowledge: {
    MoreTab: ['More', 'KnowledgeBase', 'KbArticle', 'TicketLink', 'TicketDetail'],
  },
  Catalogue: {
    MoreTab: ['More', 'ServiceCatalog', 'ServiceRequestForm', 'ServiceRequestDetail'],
  },
};

/** Android's rule for the approval on screen: APR-1's row by id, else whatever copy the screen kept. */
const ANDROID_RULE = (approvalId, pending, kept) => pending.find((a) => a.id === approvalId) ?? kept;

/**
 * Random runs on one module, counting (a) screen-reuse events, as above, and (b) on the approval screens, decisions that
 * would act on an approval other than the one the screen's route names: each ApprovalDetail route keeps a copy of its
 * row while APR-1 lists it, as the screen does, and APR-1 changes under it at every step (decided elsewhere, new ones).
 */
function moduleRun(tab, moduleRoutes, { withGetId, seed, rule = approvalOnScreen, runs = 2000, steps = 40 }) {
  const routeNames = [...STACK_ROUTES[tab]];
  const router = StackRouter({ initialRouteName: routeNames[0] });
  const routeGetIdList = withGetId ? Object.fromEntries(routeNames.map((n) => [n, getIdFor(n)])) : {};
  const options = { routeNames, routeParamList: {}, routeGetIdList };
  const records = moduleRoutes.filter((n) => n in RECORD_ID_PARAM);
  const others = moduleRoutes.filter((n) => !(n in RECORD_ID_PARAM));
  const next = random(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  const counts = { reuse: 0, wrongDecisions: 0, approvalScreens: 0 };

  for (let run = 0; run < runs; run += 1) {
    let state = router.getInitialState(options);
    const seen = new Map();
    const kept = new Map();
    for (let step = 0; step < steps; step += 1) {
      const roll = next();
      const target = roll < 0.75 ? pick(records) : pick(others);
      const params = paramsFor(target, pick(IDS));
      let action;
      if (roll < 0.45) action = CommonActions.navigate(target, params);
      else if (roll < 0.6) action = CommonActions.navigate(target, params, { pop: true });
      else if (roll < 0.75) action = StackActions.replace(target, params);
      else if (roll < 0.85) action = CommonActions.navigate(target, params);
      else action = state.routes.length > 1 ? StackActions.pop() : CommonActions.navigate(routeNames[0]);
      state = router.getStateForAction(state, action, options) ?? state;
      const pending = IDS.filter(() => next() < 0.6).map((id) => ({ id, entityType: 'ticket', entityId: `ticket-${id}`, status: 'PENDING' }));

      for (const route of state.routes) {
        const key = RECORD_ID_PARAM[route.name];
        if (!key) continue;
        const id = route.params?.[key];
        if (seen.has(route.key) && seen.get(route.key) !== id) counts.reuse += 1;
        seen.set(route.key, id);
        if (route.name !== 'ApprovalDetail') continue;
        counts.approvalScreens += 1;
        const shown = rule(id, pending, kept.get(route.key) ?? null);
        if (shown && shown.id !== id) counts.wrongDecisions += 1;
        const found = pending.find((a) => a.id === id);
        if (found) kept.set(route.key, found);
      }
    }
  }
  return counts;
}

describe('iOS-3c: the module stacks — 2,000 runs of 40 actions on each stack a module lives in', () => {
  Object.entries(MODULES).forEach(([module, stacks], m) => {
    Object.entries(stacks).forEach(([tab, routes], s) => {
      test(`${module} in ${tab}: 0 screen-reuse events with getId; the same runs without it find some`, (t) => {
        for (const route of routes) assert.ok(STACK_ROUTES[tab].includes(route), `${tab} has no ${route}`);
        assert.equal(routes[0], STACK_ROUTES[tab][0], 'runs start at the stack root');
        const seed = 0x3c00 + m * 16 + s;
        const without = moduleRun(tab, routes, { withGetId: false, seed });
        const withGetId = moduleRun(tab, routes, { withGetId: true, seed });
        t.diagnostic(`${module}/${tab}: reuse without getId ${without.reuse}, with getId ${withGetId.reuse}`);
        assert.ok(without.reuse > 0, `the check found no reuse even without getId (${without.reuse})`);
        assert.equal(withGetId.reuse, 0);
      });
    });
  });

  for (const [tab, routes] of Object.entries(MODULES.Approvals)) {
    test(`Approvals in ${tab}: Approve and Reject always act on the approval the screen shows`, (t) => {
      const seed = 0x3ca0 + Object.keys(MODULES.Approvals).indexOf(tab);
      const withGetId = moduleRun(tab, routes, { withGetId: true, seed });
      const withoutGetId = moduleRun(tab, routes, { withGetId: false, seed });
      const androidRuleWithGetId = moduleRun(tab, routes, { withGetId: true, seed, rule: ANDROID_RULE });
      const androidRuleWithout = moduleRun(tab, routes, { withGetId: false, seed, rule: ANDROID_RULE });
      t.diagnostic(
        `${tab}: approval screens checked ${withGetId.approvalScreens}; wrong decisions with getId ${withGetId.wrongDecisions}, ` +
          `with Android's rule and no getId ${androidRuleWithout.wrongDecisions}`,
      );
      assert.ok(withGetId.approvalScreens > 10_000, `too few approval screens checked (${withGetId.approvalScreens})`);
      assert.equal(withGetId.wrongDecisions, 0, 'an approval screen would act on another approval');
      assert.equal(androidRuleWithGetId.wrongDecisions, 0, 'with getId, Android\'s rule holds too');
      // Defence in depth: even on a reused screen, approvalOnScreen never hands Approve another approval…
      assert.equal(withoutGetId.wrongDecisions, 0);
      // …while Android's rule would, which proves the check can see it.
      assert.ok(androidRuleWithout.wrongDecisions > 0, 'the check found no wrong decision even with Android\'s rule and no getId');
    });
  }
});

describe('iOS-3c: Approve and Reject act on the approval on screen', () => {
  const row = (id) => ({ id, entityType: 'ticket', entityId: `ticket-${id}`, status: 'PENDING' });
  const sent = [];
  apiClient.defaults.adapter = async (config) => {
    sent.push({ method: config.method, url: config.url, data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data });
    const id = /\/approvals\/([^/]+)\//.exec(config.url)?.[1] ?? 'x';
    return {
      status: 200,
      statusText: '200',
      headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
      data: JSON.stringify({ ...row(decodeURIComponent(id)), status: config.url.endsWith('/approve') ? 'APPROVED' : 'REJECTED' }),
      config,
      request: {},
    };
  };

  test('approvalOnScreen: APR-1\'s row with the route\'s id, else the copy kept from it, else nothing', () => {
    const a = row('rec-a');
    const b = row('rec-b');
    assert.equal(approvalOnScreen('rec-a', [b, a], null), a);
    assert.equal(approvalOnScreen('rec-a', [b], a), a, 'decided: APR-1 no longer lists it, the kept copy shows');
    assert.equal(approvalOnScreen('rec-b', [], a), null, 'a copy of another approval is never shown');
    assert.equal(approvalOnScreen('rec-b', undefined, a), null);
    assert.equal(approvalOnScreen('rec-c', [a, b], null), null);
  });

  test('the screen decides on approvalOnScreen()\'s approval, and the hook posts that approval\'s own id', () => {
    const screen = readFileSync(path.join(REPO, 'src/screens/approvals/ApprovalDetailScreen.tsx'), 'utf8');
    assert.match(screen, /const \{ approvalId \} = route\.params;/);
    assert.match(screen, /const approval = approvalOnScreen\(approvalId, approvals\.data, snapshot\);/);
    assert.match(screen, /decide\.mutateAsync\(\{ approval, decision, comments: comment \}\)/);
    assert.doesNotMatch(screen, /found \?\? snapshot/, "Android's rule is not used");
    const hook = readFileSync(path.join(REPO, 'src/hooks/useApprovals.ts'), 'utf8');
    assert.match(hook, /approveApproval\(approval\.id, text \|\| undefined\)/);
    assert.match(hook, /rejectApproval\(approval\.id, text\)/);
  });

  test('APR-2 and APR-3 post to the approval they are given, and nowhere else (network mocked)', async () => {
    sent.length = 0;
    await approveApproval('rec-a');
    await rejectApproval('rec-b', ' Not needed ');
    assert.deepEqual(sent, [
      { method: 'post', url: '/approvals/rec-a/approve', data: {} },
      { method: 'post', url: '/approvals/rec-b/reject', data: { comments: 'Not needed' } },
    ]);
  });
});
