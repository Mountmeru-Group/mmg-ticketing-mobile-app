// One screen per record on iOS (docs/PERFORMANCE.md §9.7, docs/ios/00-PORT-MANIFEST.md §4.5).
// React Navigation reuses the current screen when the same route name is opened again. Without getId, a ticket, task or
// approval opened over another of its kind took over that screen and its state (staged files, a typed comment, the
// approval Approve acts on). On iOS every tab stack registers the record screens, so this is checked for all five.
// - Coverage: every route whose params name a record has getId, or is listed with its reason in WITHOUT_GET_ID.
// - Behaviour: randomised navigation on the installed StackRouter, with the stacks and getId functions the app builds
//   its navigators from (src/navigation/routes.ts). Zero screen-reuse events are required; the same runs without getId
//   must find some, which proves the check can see one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';

import {
  RECORD_ID_PARAM,
  RECORD_ROUTES,
  SHEET_ROUTES,
  STACK_ROUTES,
  WITHOUT_GET_ID,
  getIdFor,
} from '../../src/navigation/routes.ts';

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
      assert.ok(route in RECORD_ID_PARAM || route in WITHOUT_GET_ID, `${route} has a record param but no getId`);
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
    assert.ok(stacks.includes('STACK_ROUTES[tab]'), 'TabStacks must build each stack from STACK_ROUTES');
    assert.ok(stacks.includes('getId={getIdFor(name)}'), 'TabStacks must pass getIdFor to every screen');
    assert.equal(/<Stack\.Screen[^>]*name="/.test(stacks), false, 'TabStacks hard-codes a screen');
    const root = read('src/navigation/RootNavigator.tsx');
    assert.ok(root.includes('SHEET_ROUTES.map('), 'RootNavigator must build the sheets from SHEET_ROUTES');
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
