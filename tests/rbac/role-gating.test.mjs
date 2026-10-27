// Role-based access control (Phase D-pre). The expected behaviour is docs/ROLE-MATRIX.md, built from the web portal's
// code (read-only) and 04 / 05. Every role-gated element in the app is decided by src/utils/permissions.ts and the rule
// modules it uses (ticket-rules, activity, ticket-filters); the screens only render what those return.
//
// These tests pin the answer for each of the four roles plus the triage AGENT. They are written to FAIL when the app
// becomes MORE permissive: each one lists exactly what a role gets, so a new button, drawer row, composer mode,
// transition or bulk action for a role breaks a test. The last suite checks the wiring: the screens take these
// decisions from permissions.ts instead of deciding again themselves.
//
// What is real: the app's own permission, rule and API modules, unchanged. What is faked: the network (axios's
// transport adapter records requests), as in tests/auth. Nothing calls UAT.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { createComment } from '../../src/api/comments.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { assertAssignment, assertCanAttach, assertStatusChange } from '../../src/hooks/writeGuards.ts';
import { TICKET_STATUSES } from '../../src/types/index.ts';
import { visibleAuditItems, visibleComments } from '../../src/utils/activity.ts';
import {
  bulkActions, composerPermissions, drawerItems, homeTiles, homeVariant, inlineStatusTransitions, isCommentVisible,
  mainTabs, showApprovalsShortcut, ticketDetailPermissions, ticketsTitle,
} from '../../src/utils/permissions.ts';
import {
  availableTicketFilters, countrySelectorMode, isTicketFilterAllowed, listCountryParam, roleDefaultTicketQuery,
} from '../../src/utils/ticket-filters.ts';
import { STATUS_TRANSITIONS, canCloseInBulk, getAvailableTransitions } from '../../src/utils/ticket-rules.ts';
import { NAMES, OTHER_USER, PERSONAS, forEachPersona } from './personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const targets = (transitions) => transitions.map((t) => t.target);

// ── Drawer and tab bar ───────────────────────────────────────

describe('drawer and tab bar', () => {
  // G4: "Service Request" (the catalogue) for every role, after Knowledge base as in the web sidebar (AppLayout.tsx:21, :30).
  const ALWAYS = ['tasks', 'knowledge', 'catalog', 'announcements', 'settings'];
  const WITH_APPROVALS = ['approvals', ...ALWAYS];

  forEachPersona(
    'drawer rows with no pending approvals',
    { END_USER: ALWAYS, AGENT: WITH_APPROVALS, TRIAGE_AGENT: WITH_APPROVALS, L2_MANAGER: ALWAYS, ADMIN: WITH_APPROVALS },
    (p) => drawerItems(p.role, 0),
  );

  // 08 S1: END_USER and L2_MANAGER see Approvals only while APR-1 (scoped to them as approver) returns something.
  forEachPersona(
    'drawer rows with 2 pending approvals',
    { END_USER: WITH_APPROVALS, AGENT: WITH_APPROVALS, TRIAGE_AGENT: WITH_APPROVALS, L2_MANAGER: WITH_APPROVALS, ADMIN: WITH_APPROVALS },
    (p) => drawerItems(p.role, 2),
  );

  forEachPersona(
    'Home "Pending approvals" shortcut follows the drawer rule (0 pending)',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: false, ADMIN: true },
    (p) => showApprovalsShortcut(p.role, 0),
  );

  const STAFF_TABS = [
    { name: 'HomeTab', title: 'Home' },
    { name: 'TicketsTab', title: 'Tickets' },
    { name: 'AlertsTab', title: 'Alerts' },
  ];
  forEachPersona(
    'bottom tabs',
    {
      END_USER: [{ name: 'HomeTab', title: 'Home' }, { name: 'TicketsTab', title: 'My Tickets' }, { name: 'AlertsTab', title: 'Alerts' }],
      AGENT: STAFF_TABS,
      TRIAGE_AGENT: STAFF_TABS,
      L2_MANAGER: STAFF_TABS,
      ADMIN: STAFF_TABS,
    },
    (p) => mainTabs(p.role),
  );

  test('the list header uses the same title as the tab', () => {
    for (const p of Object.values(PERSONAS)) {
      assert.equal(ticketsTitle(p.role), mainTabs(p.role)[1].title);
    }
  });
});

// ── Home ─────────────────────────────────────────────────────

describe('home tiles', () => {
  const STAFF = ['open', 'inProgress', 'onHold', 'slaBreached', 'totalOpen'];
  forEachPersona(
    'variant',
    { END_USER: 'endUser', AGENT: 'staff', TRIAGE_AGENT: 'staff', L2_MANAGER: 'l2', ADMIN: 'staff' },
    (p) => homeVariant(p.role),
  );
  // Unassigned only for ADMIN and the triage AGENT (04 M2): for anyone else the DSH-1 count is mis-scoped (05 B.20).
  forEachPersona(
    'KPI tiles',
    {
      END_USER: ['open', 'resolved'],
      AGENT: STAFF,
      TRIAGE_AGENT: [...STAFF, 'unassigned'],
      L2_MANAGER: STAFF,
      ADMIN: [...STAFF, 'unassigned'],
    },
    (p) => homeTiles(p),
  );
});

// ── Ticket detail ────────────────────────────────────────────

/** Everything role-gated on M4, minus the transitions (shown as their targets). */
function detail(viewer, ticket) {
  const { transitions, ...rest } = ticketDetailPermissions(viewer, ticket);
  return { ...rest, transitions: targets(transitions) };
}

describe('ticket detail: action buttons', () => {
  const END_USER_VIEW = {
    locked: false,
    statusBar: false,
    transitions: [],
    moreActions: [],
    conversationActions: ['reply'],
    privateNotes: false,
    classification: false,
    recipients: false,
    addAttachments: true,
    deleteAttachments: false,
    editTasks: false,
  };
  // G3: 'approval' (Submit for approval, ADMIN/AGENT) and deleteAttachments (staff) — docs/G3-WEB-BEHAVIOUR.md.
  const ADMIN_AGENT_OPEN = {
    locked: false,
    statusBar: true,
    transitions: ['IN_PROGRESS', 'CLOSED'],
    moreActions: ['pickup', 'assign', 'close', 'approval'],
    conversationActions: ['reply', 'replyAll', 'note'],
    privateNotes: true,
    classification: true,
    recipients: true,
    addAttachments: true,
    deleteAttachments: true,
    editTasks: true,
  };

  forEachPersona(
    'OPEN ticket assigned to someone else',
    {
      END_USER: END_USER_VIEW,
      AGENT: ADMIN_AGENT_OPEN,
      TRIAGE_AGENT: ADMIN_AGENT_OPEN,
      // No Pick up / Assign / Submit for approval (server 403, D2, G3) and no Note (sent as a PUBLIC email).
      L2_MANAGER: { ...ADMIN_AGENT_OPEN, moreActions: ['close'], conversationActions: ['reply', 'replyAll'], privateNotes: false },
      ADMIN: ADMIN_AGENT_OPEN,
    },
    (p) => detail(p, { status: 'OPEN', assignedToId: OTHER_USER }),
  );

  // AGENT lock (05 §A.1, FE:TicketDetailPage.tsx:622): no transitions, no assignment, no "Add files" (web :669, :1268).
  // The composer and tasks are not lock-gated on the web either (:841-883, :1376-1425), nor are Submit for approval
  // (:697, :1585) and Delete a file (:1345) — G3.
  const AGENT_LOCKED = {
    ...ADMIN_AGENT_OPEN,
    locked: true,
    transitions: [],
    moreActions: ['approval'],
    addAttachments: false,
  };
  forEachPersona(
    'CLOSED ticket assigned to someone else',
    {
      END_USER: END_USER_VIEW,
      AGENT: AGENT_LOCKED,
      TRIAGE_AGENT: AGENT_LOCKED,
      L2_MANAGER: { ...ADMIN_AGENT_OPEN, transitions: [], moreActions: [], conversationActions: ['reply', 'replyAll'], privateNotes: false },
      ADMIN: { ...ADMIN_AGENT_OPEN, transitions: [], moreActions: ['pickup', 'assign', 'approval'] },
    },
    (p) => detail(p, { status: 'CLOSED', assignedToId: OTHER_USER }),
  );

  test('no "Pick up" on a ticket already assigned to the viewer', () => {
    const agent = PERSONAS.AGENT;
    assert.deepEqual(ticketDetailPermissions(agent, { status: 'OPEN', assignedToId: agent.id }).moreActions, ['assign', 'close', 'approval']);
  });

  test('with no signed-in user the screen falls back to the END_USER view', () => {
    assert.deepEqual(detail(null, { status: 'IN_PROGRESS', assignedToId: null }), END_USER_VIEW);
  });

  test('END_USER and L2_MANAGER never get Pick up, Assign or Note, from any status', () => {
    for (const name of ['END_USER', 'L2_MANAGER']) {
      for (const status of TICKET_STATUSES) {
        const can = ticketDetailPermissions(PERSONAS[name], { status, assignedToId: null });
        assert.ok(!can.moreActions.includes('pickup'), `${name} ${status}: pickup`);
        assert.ok(!can.moreActions.includes('assign'), `${name} ${status}: assign`);
        assert.ok(!can.conversationActions.includes('note'), `${name} ${status}: note`);
        assert.equal(can.privateNotes, false, `${name} ${status}: privateNotes`);
      }
    }
  });

  test('END_USER never gets the status bar, Close, task edits or impact/urgency, from any status', () => {
    for (const status of TICKET_STATUSES) {
      const can = ticketDetailPermissions(PERSONAS.END_USER, { status, assignedToId: null });
      assert.equal(can.statusBar, false, status);
      assert.deepEqual(can.transitions, [], status);
      assert.deepEqual(can.moreActions, [], status);
      assert.equal(can.editTasks, false, status);
      assert.equal(can.classification, false, status);
      assert.equal(can.recipients, false, status);
    }
  });
});

// ── Composer ─────────────────────────────────────────────────

describe('composer: modes and the Note option', () => {
  // `templates` (G3): every role, as on the web (FE:TicketDetailPage.tsx:1046).
  const FULL = { modes: ['reply', 'replyAll', 'note'], recipients: true, suggestRecipients: true, templates: true };
  forEachPersona(
    'composer permissions',
    {
      END_USER: { modes: ['reply'], recipients: false, suggestRecipients: false, templates: true },
      AGENT: FULL,
      TRIAGE_AGENT: FULL,
      L2_MANAGER: { modes: ['reply', 'replyAll'], recipients: true, suggestRecipients: false, templates: true },
      ADMIN: FULL,
    },
    (p) => composerPermissions(p.role),
  );

  test('the Conversation buttons on M4 are exactly the composer modes', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const status of TICKET_STATUSES) {
        assert.deepEqual(ticketDetailPermissions(p, { status, assignedToId: null }).conversationActions, composerPermissions(p.role).modes);
      }
    }
  });
});

describe('composer: a PRIVATE note from END_USER or L2_MANAGER never leaves the device', () => {
  // The server silently turns their "note" into a PUBLIC reply emailed to the requester (comments.controller.ts:56).
  const sent = [];
  apiClient.defaults.adapter = async (config) => {
    sent.push({ method: config.method, url: config.url, data: JSON.parse(config.data) });
    return {
      status: 201,
      statusText: '201',
      headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
      data: JSON.stringify({ id: 'comment-1', type: JSON.parse(config.data).type }),
      config,
      request: {},
    };
  };
  beforeEach(() => {
    sent.length = 0;
  });
  const NOTE = { body: '<p>internal</p>', type: 'PRIVATE', to: [], cc: [], attachmentIds: [] };

  for (const role of ['END_USER', 'L2_MANAGER']) {
    test(`${role}: refused, nothing sent`, async () => {
      await assert.rejects(createComment('ticket-1', NOTE, role), /Only Admins and Technicians can add internal notes/);
      assert.equal(sent.length, 0);
    });
  }
  for (const role of ['AGENT', 'ADMIN']) {
    test(`${role}: sent as PRIVATE`, async () => {
      await createComment('ticket-1', NOTE, role);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].data.type, 'PRIVATE');
    });
  }
});

// ── Private notes ────────────────────────────────────────────

describe('private notes are not shown to END_USER or L2_MANAGER', () => {
  // What a careless server could send: CMT-1 filters notes for both roles, TKT-7 only for END_USER (tickets.controller.ts:1014).
  const COMMENTS = [
    { id: 'c1', type: 'PUBLIC' },
    { id: 'c2', type: 'PRIVATE' },
    { id: 'c3', type: 'PUBLIC' },
  ];
  const AUDITS = [
    { id: 'a1', action: 'COMMENTED', newValues: { type: 'PRIVATE' } },
    { id: 'a2', action: 'COMMENTED', newValues: { type: 'PUBLIC' } },
    { id: 'a3', action: 'STATUS_CHANGED', newValues: { status: 'IN_PROGRESS' } },
  ];
  const ids = (rows) => rows.map((r) => r.id);

  forEachPersona(
    'conversation rows (the Conversation tab count is this list\'s length)',
    {
      END_USER: ['c1', 'c3'],
      AGENT: ['c1', 'c2', 'c3'],
      TRIAGE_AGENT: ['c1', 'c2', 'c3'],
      L2_MANAGER: ['c1', 'c3'],
      ADMIN: ['c1', 'c2', 'c3'],
    },
    (p) => ids(visibleComments(COMMENTS, p.role)),
  );

  forEachPersona(
    'a PRIVATE comment that reaches the screen anyway is not rendered',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: false, ADMIN: true },
    (p) => isCommentVisible({ type: 'PRIVATE' }, ticketDetailPermissions(p, { status: 'OPEN', assignedToId: null })),
  );

  test('PUBLIC comments render for every role', () => {
    for (const p of Object.values(PERSONAS)) {
      assert.equal(isCommentVisible({ type: 'PUBLIC' }, ticketDetailPermissions(p, { status: 'OPEN', assignedToId: null })), true);
    }
  });

  // 05 §A.7: "added a comment" for a note reveals that internal notes exist.
  forEachPersona(
    'history rows',
    {
      END_USER: ['a2', 'a3'],
      AGENT: ['a1', 'a2', 'a3'],
      TRIAGE_AGENT: ['a1', 'a2', 'a3'],
      L2_MANAGER: ['a2', 'a3'],
      ADMIN: ['a1', 'a2', 'a3'],
    },
    (p) => ids(visibleAuditItems(AUDITS, p.role)),
  );
});

// ── Status transitions ───────────────────────────────────────

describe('status transitions', () => {
  // Verbatim from the web portal, FE:pages/tickets/TicketDetailPage.tsx:45-106 (05 §A.1). Labels are part of the rule.
  const WEB_MAP = {
    OPEN: [['In Progress', 'IN_PROGRESS'], ['Close', 'CLOSED']],
    IN_PROGRESS: [
      ['On-hold', 'ON_HOLD'],
      ['Pending with Management Review', 'PENDING_MGMT_REVIEW'],
      ['Pending with Master Data Team', 'PENDING_MASTER_DATA'],
      ['Pending with Partner', 'PENDING_PARTNER'],
      ['Pending with User for Confirmation/Testing', 'PENDING_USER_CONFIRM'],
      ['Pending with User for more Information', 'PENDING_USER_INFO'],
      ['Resolve', 'RESOLVED'],
      ['Close', 'CLOSED'],
      ['Canceled', 'CANCELED'],
    ],
    ON_HOLD: [['In-Progress', 'IN_PROGRESS'], ['On hold to open', 'OPEN']],
    PENDING_MGMT_REVIEW: [['In Progress', 'IN_PROGRESS'], ['Open', 'OPEN'], ['Resolve', 'RESOLVED']],
    PENDING_MASTER_DATA: [['In Progress', 'IN_PROGRESS'], ['Open', 'OPEN'], ['Resolve', 'RESOLVED']],
    PENDING_PARTNER: [['In Progress', 'IN_PROGRESS'], ['Open', 'OPEN'], ['Resolve', 'RESOLVED']],
    PENDING_USER_CONFIRM: [['In Progress', 'IN_PROGRESS'], ['Open', 'OPEN'], ['Resolve', 'RESOLVED'], ['Close', 'CLOSED']],
    PENDING_USER_INFO: [['In Progress', 'IN_PROGRESS'], ['Open', 'OPEN'], ['Resolve', 'RESOLVED'], ['Close', 'CLOSED']],
    RESOLVED: [['Resolve to open', 'OPEN'], ['Close', 'CLOSED']],
    CLOSED: [],
    CANCELED: [],
  };

  test('the map is the web map, label for label (PENDING has no entry)', () => {
    const actual = Object.fromEntries(Object.entries(STATUS_TRANSITIONS).map(([from, list]) => [from, list.map((t) => [t.label, t.target])]));
    assert.deepEqual(actual, WEB_MAP);
    assert.equal(STATUS_TRANSITIONS.PENDING, undefined);
  });

  /** END_USER: nothing (status bar hidden). AGENT: nothing on CLOSED/CANCELED. Everyone else: the map, nothing more. */
  function expectedTargets(role, status) {
    if (role === 'END_USER') return [];
    if (role === 'AGENT' && (status === 'CLOSED' || status === 'CANCELED')) return [];
    return (WEB_MAP[status] ?? []).map(([, target]) => target);
  }

  for (const name of NAMES) {
    test(`offered transitions from every status: ${name}`, () => {
      const p = PERSONAS[name];
      for (const status of TICKET_STATUSES) {
        const expected = expectedTargets(p.role, status);
        assert.deepEqual(targets(getAvailableTransitions(p.role, status)), expected, `status bar from ${status}`);
        assert.deepEqual(targets(inlineStatusTransitions(p.role, status)), expected, `list chip from ${status}`);
        assert.deepEqual(
          targets(ticketDetailPermissions(p, { status, assignedToId: null }).transitions),
          expected,
          `detail screen from ${status}`,
        );
      }
    });
  }

  test('the last check before sending refuses what the screens do not offer', () => {
    const closure = { resolution: 'Fixed', closureComments: 'Done' };
    assert.throws(() => assertStatusChange('END_USER', 'OPEN', { status: 'IN_PROGRESS' }), /role can't change/);
    assert.throws(() => assertStatusChange('AGENT', 'CLOSED', { status: 'OPEN' }), /locked for technicians/);
    assert.throws(() => assertStatusChange('AGENT', 'CANCELED', { status: 'OPEN' }), /locked for technicians/);
    assert.throws(() => assertStatusChange('ADMIN', 'OPEN', { status: 'RESOLVED', ...closure }), /can't be moved/);
    assert.throws(() => assertStatusChange('L2_MANAGER', 'CLOSED', { status: 'OPEN' }), /can't be moved/);
    assert.throws(() => assertStatusChange('ADMIN', 'OPEN', { status: 'CLOSED' }), /both required/);
    assert.doesNotThrow(() => assertStatusChange('ADMIN', 'OPEN', { status: 'IN_PROGRESS' }));
    assert.doesNotThrow(() => assertStatusChange('L2_MANAGER', 'RESOLVED', { status: 'OPEN' }));
    assert.doesNotThrow(() => assertStatusChange('AGENT', 'RESOLVED', { status: 'CLOSED', ...closure }));
  });
});

// ── Bulk actions and assignment ──────────────────────────────

describe('bulk actions are staff-only', () => {
  const FULL = ['pickup', 'assign', 'close'];
  forEachPersona(
    'selection bar (empty = tap-and-hold selects nothing)',
    { END_USER: [], AGENT: FULL, TRIAGE_AGENT: FULL, L2_MANAGER: ['close'], ADMIN: FULL },
    (p) => bulkActions(p),
  );

  test('with no signed-in user there is no selection', () => {
    assert.deepEqual(bulkActions(null), []);
  });

  test('bulk Close never includes a ticket the role could not close one by one', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const status of TICKET_STATUSES) {
        assert.equal(canCloseInBulk(p.role, status), expectedClose(p.role, status), `${p.role} ${status}`);
      }
    }
    function expectedClose(role, status) {
      return getAvailableTransitions(role, status).some((t) => t.target === 'CLOSED');
    }
    assert.equal(canCloseInBulk('END_USER', 'OPEN'), false);
    assert.equal(canCloseInBulk('AGENT', 'CLOSED'), false);
  });

  test('assignment is refused for L2_MANAGER and END_USER, and for a locked AGENT', () => {
    assert.throws(() => assertAssignment('L2_MANAGER', 'OPEN', 'user-x'), /Only Admins and Technicians/);
    assert.throws(() => assertAssignment('END_USER', 'OPEN', 'user-x'), /Only Admins and Technicians/);
    assert.throws(() => assertAssignment('AGENT', 'CLOSED', 'user-x'), /locked for technicians/);
    assert.doesNotThrow(() => assertAssignment('AGENT', 'OPEN', 'user-x'));
    assert.doesNotThrow(() => assertAssignment('ADMIN', 'CLOSED', 'user-x'));
  });

  test('adding files is refused only for a locked AGENT', () => {
    assert.throws(() => assertCanAttach('AGENT', 'CANCELED'), /locked for technicians/);
    for (const role of ['END_USER', 'L2_MANAGER', 'ADMIN']) {
      assert.doesNotThrow(() => assertCanAttach(role, 'CLOSED'), role);
    }
  });
});

// ── List filters ─────────────────────────────────────────────

describe('list filters', () => {
  const ALL = ['ALL', 'OPEN', 'MY_OPEN', 'UNASSIGNED', 'PENDING', 'OVERDUE', 'DUE_SOON', 'RESOLVED', 'CLOSED'];
  const NO_UNASSIGNED = ALL.filter((f) => f !== 'UNASSIGNED');
  forEachPersona(
    'named filters in the drop-down',
    { END_USER: NO_UNASSIGNED, AGENT: ALL, TRIAGE_AGENT: ALL, L2_MANAGER: NO_UNASSIGNED, ADMIN: ALL },
    (p) => availableTicketFilters(p.role),
  );
  forEachPersona(
    'the Home "Unassigned" filter is accepted by the list',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: false, ADMIN: true },
    (p) => isTicketFilterAllowed(p.role, 'UNASSIGNED_KPI'),
  );
});

// ── Country selector (05 §A.12) ──────────────────────────────

describe('country selector', () => {
  // 05 §A.12 / FE:CountrySelector.tsx:28-36 and AppLayout.tsx:243: ADMIN and triage AGENT switch; a country AGENT is
  // locked; hidden for L2_MANAGER. END_USER: the web shows a read-only "—"; mobile hides it (D8: END_USER always sends
  // `countryId=`, so a country label would be wrong). Listed for Ronit in docs/ROLE-MATRIX.md.
  forEachPersona(
    'mode',
    { END_USER: 'hidden', AGENT: 'locked', TRIAGE_AGENT: 'switch', L2_MANAGER: 'hidden', ADMIN: 'switch' },
    (p) => countrySelectorMode(p),
  );

  forEachPersona(
    'countryId sent on TKT-1 with "country-ke" selected',
    { END_USER: undefined, AGENT: 'country-tz', TRIAGE_AGENT: 'country-ke', L2_MANAGER: undefined, ADMIN: 'country-ke' },
    (p) => listCountryParam(p, 'country-ke'),
  );

  forEachPersona(
    'countryId sent on TKT-1 with "All countries"',
    { END_USER: undefined, AGENT: 'country-tz', TRIAGE_AGENT: '', L2_MANAGER: undefined, ADMIN: undefined },
    (p) => listCountryParam(p, null),
  );

  test('END_USER always asks for all their own tickets (D8)', () => {
    assert.deepEqual(roleDefaultTicketQuery('END_USER'), { countryId: '' });
    for (const role of ['AGENT', 'L2_MANAGER', 'ADMIN']) assert.deepEqual(roleDefaultTicketQuery(role), {}, role);
  });
});

// ── Wiring: the screens use these decisions instead of making their own ──

describe('wiring: screens take role decisions from utils/permissions.ts', () => {
  const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
  /** Low-level role gates a gated screen must not call directly (it would bypass the tested decision). */
  const RAW_GATE = /\b(isStaff|isAgentOrAdmin|canSeePrivateNotes|canChangeStatus|isTriageAgent|isCountryLockedAgent|getAvailableTransitions|canAssignToSelf)\(/;

  function sourceFiles(dir) {
    return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
      const rel = path.join(dir, entry);
      if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
      return /\.tsx?$/.test(entry) ? [rel] : [];
    });
  }

  test('no screen, navigator or component compares a role string itself', () => {
    const raw = /\brole\s*[!=]==?\s*['"](ADMIN|AGENT|END_USER|L2_MANAGER)['"]|['"](ADMIN|AGENT|END_USER|L2_MANAGER)['"]\s*[!=]==?\s*[\w.?]*role\b/;
    const offenders = ['src/screens', 'src/navigation', 'src/components']
      .flatMap(sourceFiles)
      .filter((rel) => raw.test(read(rel)));
    assert.deepEqual(offenders, []);
  });

  const GATED = [
    { file: 'src/navigation/DrawerContent.tsx', uses: ['drawerItems(', 'countrySelectorMode('] },
    { file: 'src/navigation/MainTabs.tsx', uses: ['mainTabs('], forbid: /name="(HomeTab|TicketsTab|AlertsTab)"/ },
    {
      file: 'src/screens/tickets/TicketDetailScreen.tsx',
      uses: ['ticketDetailPermissions(', 'isCommentVisible(', 'ticketFieldPermissions(', 'can.deleteAttachments', 'useDeleteAttachment('],
      // The Reply / Reply all / Note buttons come from the list; a hard-coded one would bypass it. G3: a file is
      // deleted only through useDeleteAttachment, never by calling the API from the screen.
      forbid: /mode:\s*'(reply|replyAll|note)'|isResolvedLocked\(|deleteAttachment\(|apiClient/,
    },
    {
      // G1 property editors: who/when only from ticketFieldPermissions(); writes only through useUpdateTicket, and the
      // technician (2026-10-27) only through useAssignTicket, never the TKT-5 API or its guard directly.
      file: 'src/screens/tickets/TicketPropertyEditors.tsx',
      uses: ['ticketFieldPermissions(', 'useUpdateTicket(', 'useAssignTicket('],
      forbid: /isResolvedLocked\(|countrySelectorMode\(|RESOLUTION_EDIT_STATUSES|updateTicket\(|apiClient|changeTicketStatus|\bpriority:\s|(?<![\w.])assignTicket\(|sendAssignment\(|canAssignTickets\(/,
    },
    {
      // G5: every role decision on the create form from createTicketPermissions(); the preview is the G1 component.
      file: 'src/screens/tickets/CreateTicketScreen.tsx',
      uses: ['createTicketPermissions(', 'PriorityPreviewBox', 'can.priorityPreview'],
      forbid: /createTicket\(|apiClient|getPriorityMatrix\(/,
    },
    {
      // G3: the Templates button comes from composerPermissions(); the list only through useCannedResponses.
      file: 'src/screens/tickets/ReplyComposerScreen.tsx',
      uses: ['composerPermissions(', 'can.templates'],
      forbid: /listCannedResponses\(|apiClient/,
    },
    {
      // G3: who only from canSubmitForApproval(); the write only through useSubmitForApproval.
      file: 'src/screens/tickets/SubmitApprovalScreen.tsx',
      uses: ['canSubmitForApproval(', 'useSubmitForApproval('],
      forbid: /submitTicketForApproval\(|apiClient|isResolvedLocked\(/,
    },
    {
      file: 'src/screens/tickets/TicketListScreen.tsx',
      uses: ['bulkActions(', 'inlineStatusTransitions(', 'countrySelectorMode(', 'isTicketFilterAllowed(', 'ticketListFilters('],
      // The selection bar's buttons come from bulkActions(); a hard-coded one would bypass it.
      forbid: /<BarButton[^>]*label="/,
    },
    {
      // G2 Filters sheet: which filters only from ticketListFilters(); the query only through useTickets.
      file: 'src/screens/tickets/TicketFiltersScreen.tsx',
      uses: ['ticketListFilters(', 'useTickets('],
      forbid: /listTickets\(|apiClient|searchUsers\(|listTeams\(/,
    },
    {
      // G4: the catalogue's views only from serviceCatalogPermissions(); the lists only through the hooks.
      file: 'src/screens/catalog/ServiceCatalogScreen.tsx',
      uses: ['serviceCatalogPermissions(', 'useMyServiceRequests(', 'can.myRequests'],
      forbid: /listServiceRequests\(|listServiceItems\(|listServiceCategories\(|apiClient/,
    },
    {
      // G4: request properties only from serviceCatalogPermissions(); the write only through useSubmitServiceRequest.
      file: 'src/screens/catalog/ServiceRequestFormScreen.tsx',
      uses: ['serviceCatalogPermissions(', 'useSubmitServiceRequest(', 'can.requestProperties'],
      forbid: /createServiceRequest\(|apiClient|AttachmentPicker|confirmAction\(/,
    },
    {
      // G4: a request is shown only when it is the person's own.
      file: 'src/screens/catalog/ServiceRequestDetailScreen.tsx',
      uses: ['serviceCatalogPermissions(', 'isOwnServiceRequest('],
      forbid: /getServiceRequest\(|apiClient/,
    },
    { file: 'src/screens/dashboard/HomeScreen.tsx', uses: ['homeVariant(', 'homeTiles(', 'showApprovalsShortcut('] },
    { file: 'src/screens/profile/ProfileScreen.tsx', uses: ['countrySelectorMode('] },
  ];

  for (const { file, uses, forbid } of GATED) {
    test(path.basename(file), () => {
      const src = read(file);
      for (const call of uses) assert.ok(src.includes(call), `${file} must call ${call}…)`);
      const exempt = file.endsWith('ProfileScreen.tsx') || file.endsWith('TicketListScreen.tsx');
      if (!exempt) assert.doesNotMatch(src, RAW_GATE, `${file} must not call a role gate directly`);
      if (forbid) assert.doesNotMatch(src, forbid, `${file} hard-codes a role-gated element`);
    });
  }

  test('TicketListScreen calls no role gate except isStaff for the empty-state wording', () => {
    const src = read('src/screens/tickets/TicketListScreen.tsx').replace(/function ListEmpty[\s\S]*?\n}\n/, '');
    assert.doesNotMatch(src, RAW_GATE);
  });
});
