// Swipe actions on the ticket list (2026-11-03, docs/brand/UI-STANDARDS.md §14). Swipe left reveals Assign and Resolve,
// role-gated through src/utils/permissions.ts with exactly the rules of the buttons they shortcut. A swipe must never
// allow something a tap would not.
//
// What runs for real: permissions.ts and ticket-rules.ts. The wiring (the card and the list) is checked in source, as
// tests/rbac/role-gating.test.mjs does: no React Native renderer is installed.
//
// iOS (iOS-5f): ported from Android dev d8626bc, all of it. iOS additions at the end: each role pinned, and the
// VoiceOver actions that offer exactly the swipe (ANDROID-DELTA.md §10, decision 3).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TICKET_STATUSES } from '../../src/types/index.ts';
import {
  canSwipeTickets, inlineStatusTransitions, ticketDetailPermissions, ticketSwipeActions,
} from '../../src/utils/permissions.ts';
import { NAMES, OTHER_USER, PERSONAS, forEachPersona } from './personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

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

describe('wiring: the card and the list take the swipe from permissions.ts', () => {
  const card = read('src/components/TicketCard.tsx');
  const list = read('src/screens/tickets/TicketListScreen.tsx');

  test('the card reveals exactly ticketSwipeActions(); none = the row does not move; off while selecting', () => {
    assert.match(card, /const actions = ticketSwipeActions\(swipeViewer, ticket\);/);
    assert.match(card, /enabled=\{!selectionMode && actions\.length > 0\}/);
    assert.match(card, /renderRightActions=\{actions\.length > 0 \? renderActions : undefined\}/);
    assert.match(card, /\{actions\.map\(\(action\) => \{/);
    // No action is hard-coded outside that list.
    assert.doesNotMatch(card, /onAction\?\.\('(assign|resolve)'/);
  });

  test('the list makes rows swipeable per role, and each action takes the tap path it shortcuts', () => {
    assert.match(list, /const swipeable = canSwipeTickets\(role\);/);
    assert.match(list, /swipeViewer=\{swipeable \? user : undefined\}/);
    // Assign: More options' Assign… (M7). Resolve: the status chip's handler, which checks the transition and opens M6.
    assert.match(list, /if \(action === 'assign'\) navigation\.navigate\('AssignPicker', \{ ticketIds: \[t\.id\] \}\);/);
    assert.match(list, /else void once\(\(\) => applyTransition\(t, 'RESOLVED'\)\);/);
    assert.match(list, /const transition = inlineStatusTransitions\(role, t\.status\)\.find\(\(x\) => x\.target === target\);\s*if \(!transition\) return;/);
    assert.match(list, /if \(requiresClosureForm\(target\)\) \{\s*navigation\.navigate\('StatusClosure', \{ ticketIds: \[t\.id\], target \}\);/);
  });

  test('Swipeable appears in the ticket card only', () => {
    const files = (function walk(dir) {
      return readdirSync(path.join(REPO, dir)).flatMap((e) => {
        const rel = path.join(dir, e);
        if (statSync(path.join(REPO, rel)).isDirectory()) return walk(rel);
        return /\.tsx?$/.test(e) ? [rel.replace(/\\/g, '/')] : [];
      });
    })('src');
    // A JSX element starts its line; `useRef<Swipeable | null>` (the list's open-row ref) is a type, not a use.
    const users = files.filter((rel) => /^\s*<Swipeable\b/m.test(read(rel)));
    assert.deepEqual(users, ['src/components/TicketCard.tsx']);
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

// ── iOS (iOS-5f, decision 3): the swipe's actions as VoiceOver actions ──
// VoiceOver users rarely swipe a row: the card offers Assign and Resolve in the rotor's Actions instead, under exactly the
// swipe's rules. The card is read as source; what it offers is computed here from the same rule the card calls.

describe('VoiceOver actions = the swipe, per role (iOS)', () => {
  const card = read('src/components/TicketCard.tsx');
  const list = read('src/screens/tickets/TicketListScreen.tsx');

  /**
   * What the card offers VoiceOver beyond Change status and Select, as TicketCard computes it: the list passes
   * swipeViewer only for a swipeable role (canSwipeTickets), and nothing while selecting.
   */
  const voiceOverSwipe = (p, t, selecting = false) => {
    const swipeViewer = canSwipeTickets(p.role) ? p : undefined;
    return swipeViewer !== undefined && !selecting ? ticketSwipeActions(swipeViewer, t) : [];
  };
  /** What the row reveals when swiped, as TicketCard's SwipeRow gets it (none while selecting: the row is disabled). */
  const swipeReveals = (p, t, selecting = false) => {
    if (!canSwipeTickets(p.role) || selecting) return [];
    return ticketSwipeActions(p, t);
  };

  for (const name of NAMES) {
    test(`${name}: VoiceOver gets exactly the swipe's actions, for every status and assignee, selecting or not`, () => {
      const p = PERSONAS[name];
      for (const status of TICKET_STATUSES) {
        for (const assignee of [null, OTHER_USER, p.id]) {
          for (const selecting of [false, true]) {
            const t = ticket(status, assignee);
            assert.deepEqual(voiceOverSwipe(p, t, selecting), swipeReveals(p, t, selecting), `${status} ${assignee} ${selecting}`);
          }
        }
      }
    });
  }

  test('END_USER: no VoiceOver Assign or Resolve on any ticket (the list passes no swipeViewer)', () => {
    for (const status of TICKET_STATUSES) assert.deepEqual(voiceOverSwipe(PERSONAS.END_USER, ticket(status)), []);
  });

  test('the card computes them from ticketSwipeActions, only while the row would swipe, and labels them as the buttons', () => {
    assert.match(card, /const swipeActions = swipeable && !selectionMode \? ticketSwipeActions\(swipeViewer, ticket\) : \[\];/);
    assert.match(card, /\.\.\.swipeActions\.map\(\(action\) => \(\{ name: action, label: ACTION_LOOK\[action\]\.label \}\)\),/);
    assert.match(card, /assign: \{ label: 'Assign',/);
    assert.match(card, /resolve: \{ label: 'Resolve',/);
    // The swipe's own enabled rule is the same: a swipeable row, not selecting, with at least one action.
    assert.match(card, /enabled=\{!selectionMode && actions\.length > 0\}/);
  });

  test('a VoiceOver action runs the same handler as the revealed button, and only an action the swipe offers', () => {
    assert.match(card, /const swipe = swipeActions\.find\(\(action\) => action === actionName\);\s*if \(swipe\) onSwipeAction\?\.\(swipe, ticket\);/);
    // The revealed button: close the row, then the same handler.
    assert.match(card, /ref\.current\?\.close\(\);\s*onAction\?\.\(action, ticket\);/);
    assert.match(list, /onSwipeAction=\{onSwipeAction\}/);
    // Change status and Select are still there (iOS-4).
    assert.match(card, /actionName === 'changeStatus'\) onStatusPress\?\.\(ticket\)/);
    assert.match(card, /actionName === 'select'\) onLongPress\?\.\(ticket\.id\)/);
  });

  test('the revealed buttons are 44 pt tall and labelled for VoiceOver', () => {
    assert.match(card, /accessibilityLabel=\{`\$\{look\.label\} ticket \$\{ticket\.ticketNumber\}`\}/);
    assert.match(card, /className="min-h-11 items-center justify-center active:opacity-80"/);
  });
});
