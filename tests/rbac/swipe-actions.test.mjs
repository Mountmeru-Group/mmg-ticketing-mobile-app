// Swipe actions on the ticket list (2026-11-03, docs/brand/UI-STANDARDS.md §14). Swipe left reveals Assign and Resolve,
// role-gated through src/utils/permissions.ts with exactly the rules of the buttons they shortcut. A swipe must never
// allow something a tap would not.
//
// What runs for real: permissions.ts and ticket-rules.ts. The wiring (the card and the list) is checked in source, as
// tests/rbac/role-gating.test.mjs does: no React Native renderer is installed.
//
// iOS (iOS-5f, STEP 2): ported from Android dev d8626bc. The rules are verbatim. The wiring checks join with the iOS
// card and list in STEP 6, together with the VoiceOver actions (an iOS-only addition, ANDROID-DELTA.md §10, decision 3).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { TICKET_STATUSES } from '../../src/types/index.ts';
import {
  canSwipeTickets, inlineStatusTransitions, ticketDetailPermissions, ticketSwipeActions,
} from '../../src/utils/permissions.ts';
import { NAMES, OTHER_USER, PERSONAS, forEachPersona } from './personas.mjs';

/** The statuses whose transition map has "Resolve" (05 §A.1, ticket-rules.ts STATUS_TRANSITIONS). */
const RESOLVE_FROM = ['IN_PROGRESS', 'PENDING_MGMT_REVIEW', 'PENDING_MASTER_DATA', 'PENDING_PARTNER', 'PENDING_USER_CONFIRM', 'PENDING_USER_INFO'];
/** The AGENT lock (05 §A.1): no assignment and no transitions on these. */
const LOCKED = ['CLOSED', 'CANCELED'];

const ticket = (status, assignedToId = OTHER_USER) => ({ status, assignedToId });

/** For one persona: status → the actions a swipe reveals, written out. */
function expectedFor(name) {
  const out = {};
  for (const status of TICKET_STATUSES) {
    const actions = [];
    const assign = name === 'ADMIN' || ((name === 'AGENT' || name === 'TRIAGE_AGENT') && !LOCKED.includes(status));
    if (assign) actions.push('assign');
    if (name !== 'END_USER' && RESOLVE_FROM.includes(status)) actions.push('resolve');
    out[status] = actions;
  }
  return out;
}

describe('swipe actions: role-gated per persona and status', () => {
  forEachPersona(
    'the list rows are swipeable at all',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: true, ADMIN: true },
    (p) => canSwipeTickets(p.role),
  );

  forEachPersona(
    'what a swipe reveals, every status (assigned to someone else)',
    Object.fromEntries(NAMES.map((n) => [n, expectedFor(n)])),
    (p) => Object.fromEntries(TICKET_STATUSES.map((s) => [s, ticketSwipeActions(p, ticket(s))])),
  );

  test('END_USER: nothing is revealed for any ticket, whoever it is assigned to', () => {
    for (const status of TICKET_STATUSES) {
      for (const assignee of [null, OTHER_USER, PERSONAS.END_USER.id]) {
        assert.deepEqual(ticketSwipeActions(PERSONAS.END_USER, ticket(status, assignee)), [], status);
      }
    }
  });

  test('no viewer at all gets nothing', () => {
    for (const status of TICKET_STATUSES) assert.deepEqual(ticketSwipeActions(null, ticket(status)), []);
  });
});

describe('a swipe never allows what a tap would not', () => {
  for (const name of NAMES) {
    test(`${name}: every swipe action has its tap path, for every status and assignee`, () => {
      const p = PERSONAS[name];
      for (const status of TICKET_STATUSES) {
        for (const assignee of [null, OTHER_USER, p.id]) {
          const t = ticket(status, assignee);
          const swipe = ticketSwipeActions(p, t);
          // Assign ⇔ ticket detail's More options offers "Assign…" for the same ticket.
          assert.equal(swipe.includes('assign'), ticketDetailPermissions(p, t).moreActions.includes('assign'), `${status} assign`);
          // Resolve ⇔ the row's status chip offers "Resolve".
          const chip = inlineStatusTransitions(p.role, status).map((x) => x.target);
          assert.equal(swipe.includes('resolve'), chip.includes('RESOLVED'), `${status} resolve`);
          // And never anything else.
          assert.ok(swipe.every((a) => a === 'assign' || a === 'resolve'));
        }
      }
    });
  }

  test('a role that can do neither (END_USER) is never swipeable', () => {
    for (const name of NAMES) {
      const p = PERSONAS[name];
      const anyAction = TICKET_STATUSES.some((s) => ticketSwipeActions(p, ticket(s)).length > 0);
      assert.equal(canSwipeTickets(p.role), anyAction, name);
    }
  });
});

// iOS (iOS-5f): the brief's per-role summary, written out, so a change for any role shows as a literal diff.
// END_USER nothing; AGENT Assign (not under the CLOSED/CANCELED lock) and Resolve; triage AGENT the same; L2_MANAGER
// Resolve only; ADMIN both, CLOSED included.
describe('swipe actions: every role pinned on four statuses (iOS)', () => {
  forEachPersona(
    'OPEN, IN_PROGRESS, RESOLVED, CLOSED (assigned to someone else)',
    {
      END_USER: { OPEN: [], IN_PROGRESS: [], RESOLVED: [], CLOSED: [] },
      AGENT: { OPEN: ['assign'], IN_PROGRESS: ['assign', 'resolve'], RESOLVED: ['assign'], CLOSED: [] },
      TRIAGE_AGENT: { OPEN: ['assign'], IN_PROGRESS: ['assign', 'resolve'], RESOLVED: ['assign'], CLOSED: [] },
      L2_MANAGER: { OPEN: [], IN_PROGRESS: ['resolve'], RESOLVED: [], CLOSED: [] },
      ADMIN: { OPEN: ['assign'], IN_PROGRESS: ['assign', 'resolve'], RESOLVED: ['assign'], CLOSED: ['assign'] },
    },
    (p) => Object.fromEntries(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => [s, ticketSwipeActions(p, ticket(s))])),
  );
});
