// The Technician editor on the ticket detail screen (M4, 2026-10-27): a "Change technician" link on the Technician row,
// an inline picker, Save and Cancel, like the impact/urgency, category and country editors. It is PLACEMENT, not a new
// capability: it saves through useAssignTicket → sendAssignment → TKT-5, the path Pick up and the assign picker (M7)
// already use, behind the same guard (assertAssignment) and the same rule (canAssignTickets). The web's picker, with
// sources: docs/ROLE-MATRIX.md §15.
//
// Written to FAIL when the editor becomes MORE permissive: each persona's full answer is spelled out for OPEN, RESOLVED,
// CLOSED and CANCELED; the link, More options › Assign and the write guard must agree in every status; and L2_MANAGER
// and END_USER are driven through the real write path with the UI bypassed, where nothing may leave the device.
//
// What is real: permissions.ts, assignment.ts, the write guards, useAssignTicket's sendAssignment, tickets.api.ts and
// the axios client. What is faked: the network (axios's transport adapter records requests). Nothing calls UAT.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { ApiClientError, describeFieldWriteError } from '../../src/api/errors.ts';
import { assignTicket } from '../../src/api/tickets.api.ts';
import { sendAssignment } from '../../src/hooks/useAssignTicket.ts';
import { assertAssignment, wasRefusedOnDevice } from '../../src/hooks/writeGuards.ts';
import { TICKET_STATUSES } from '../../src/types/index.ts';
import {
  INACTIVE_TECHNICIAN_NOTE, TECHNICIAN_ROLES, assignmentDoneMessage, assignmentTeamId, recommendedTechnicians, teamMembers,
  technicianOptions,
} from '../../src/utils/assignment.ts';
import {
  AGENT_LOCK_REASON, bulkActions, canAssignTickets, fieldEditProblem, ticketDetailPermissions, ticketFieldPermissions,
} from '../../src/utils/permissions.ts';
import { NAMES, OTHER_USER, PERSONAS, forEachPersona } from './personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const EDIT = { mode: 'edit' };
const VIEW = { mode: 'view' };
const AGENT_LOCKED = { mode: 'locked', reason: AGENT_LOCK_REASON };

/** The four states the brief names. RESOLVED is not locked for an AGENT (web :619-622: CLOSED and CANCELED only). */
const FOUR = ['OPEN', 'RESOLVED', 'CLOSED', 'CANCELED'];

const technician = (persona, status) => ticketFieldPermissions(persona, { status }).technician;
/** FieldAction renders the "Change technician" link for `edit` only; `locked` gets the reason, `view` nothing. */
const linkShown = (persona, status) => technician(persona, status).mode === 'edit';

// ── 1. Who sees "Change technician", by ticket state ─────────

describe('Change technician: every persona, OPEN, RESOLVED, CLOSED and CANCELED', () => {
  const LIVE = { END_USER: VIEW, AGENT: EDIT, TRIAGE_AGENT: EDIT, L2_MANAGER: VIEW, ADMIN: EDIT };
  const LOCKED = { END_USER: VIEW, AGENT: AGENT_LOCKED, TRIAGE_AGENT: AGENT_LOCKED, L2_MANAGER: VIEW, ADMIN: EDIT };
  const EXPECTED = { OPEN: LIVE, RESOLVED: LIVE, CLOSED: LOCKED, CANCELED: LOCKED };
  for (const status of FOUR) {
    forEachPersona(`${status} ticket: the Technician row`, EXPECTED[status], (p) => technician(p, status));
  }

  forEachPersona(
    'the "Change technician" link shows on',
    { END_USER: [], AGENT: ['OPEN', 'RESOLVED'], TRIAGE_AGENT: ['OPEN', 'RESOLVED'], L2_MANAGER: [], ADMIN: FOUR },
    (p) => FOUR.filter((status) => linkShown(p, status)),
  );

  test('L2_MANAGER and END_USER never get the link, in any of the 11 statuses: the value only, with no lock reason', () => {
    for (const name of ['L2_MANAGER', 'END_USER']) {
      for (const status of TICKET_STATUSES) assert.deepEqual(technician(PERSONAS[name], status), VIEW, `${name} ${status}`);
    }
  });

  test('every AGENT edits in every status except CLOSED and CANCELED, where the lock reason shows; ADMIN in every status', () => {
    for (const name of ['AGENT', 'TRIAGE_AGENT']) {
      for (const status of TICKET_STATUSES) {
        const expected = status === 'CLOSED' || status === 'CANCELED' ? AGENT_LOCKED : EDIT;
        assert.deepEqual(technician(PERSONAS[name], status), expected, `${name} ${status}`);
      }
    }
    for (const status of TICKET_STATUSES) assert.deepEqual(technician(PERSONAS.ADMIN, status), EDIT, status);
  });

  test('no signed-in user, or a role the app does not know: the value only', () => {
    for (const status of TICKET_STATUSES) {
      assert.deepEqual(ticketFieldPermissions(null, { status }).technician, VIEW, status);
      assert.deepEqual(ticketFieldPermissions({ role: 'GUEST', countryId: null }, { status }).technician, VIEW, status);
    }
  });
});

// ── 2. One rule for every way in ─────────────────────────────

describe('one rule: the link, More options › Assign, bulk Assign, M7 and the write guard agree', () => {
  test('the link shows exactly where More options offers Assign (every persona × status × assignee)', () => {
    for (const name of NAMES) {
      const p = PERSONAS[name];
      for (const status of TICKET_STATUSES) {
        for (const assignedToId of [null, OTHER_USER, p.id]) {
          const assign = ticketDetailPermissions(p, { status, assignedToId }).moreActions.includes('assign');
          assert.equal(linkShown(p, status), assign, `${name} ${status} ${assignedToId}`);
        }
      }
    }
  });

  test('the write guard refuses exactly where the link is not shown, and nowhere else', () => {
    for (const name of NAMES) {
      const p = PERSONAS[name];
      for (const status of TICKET_STATUSES) {
        for (const assignedToId of ['user-x', null]) {
          if (linkShown(p, status)) assert.doesNotThrow(() => assertAssignment(p.role, status, assignedToId), `${name} ${status}`);
          else assert.throws(() => assertAssignment(p.role, status, assignedToId), `${name} ${status} should be refused`);
        }
      }
    }
  });

  test('canAssignTickets: ADMIN and AGENT only; bulk Pick up and Assign follow it', () => {
    assert.deepEqual(['END_USER', 'AGENT', 'L2_MANAGER', 'ADMIN', 'GUEST'].map((r) => canAssignTickets(r)), [false, true, false, true, false]);
    for (const name of NAMES) {
      assert.equal(bulkActions(PERSONAS[name]).includes('assign'), canAssignTickets(PERSONAS[name].role), name);
    }
  });

  test('TKT-4 can never carry an assignment or a group, for anyone, in any status (the editor has no second path)', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const status of TICKET_STATUSES) {
        for (const body of [{ assignedToId: 'user-x' }, { assignedToId: null }, { teamId: 'team-1' }]) {
          assert.equal(fieldEditProblem(p, status, body), "This field can't be changed from the app.", `${p.id} ${status} ${JSON.stringify(body)}`);
        }
      }
    }
  });
});

// ── 3. The call itself, with the UI bypassed ─────────────────

const sent = [];
/** What TKT-3 says the ticket's status is now (the guard's second check). */
let serverStatus = 'OPEN';
/** A TicketDTO as TKT-3 and TKT-5 return it (TICKET_INCLUDE), so the drift check (dev builds) has nothing to report. */
const TICKET = {
  id: 'ticket-1', ticketNumber: 1042, title: 'Printer offline', description: '<p>Second floor</p>', priority: 'MEDIUM',
  impact: null, urgency: null, source: 'API', slaStatus: 'WITHIN_SLA', slaResponseDue: null, slaResolveDue: null,
  firstResponseAt: null, resolvedAt: null, slaHoldStartedAt: null, slaHoldMinutes: 0, resolution: null, closureCode: null,
  isFcr: null, closureComments: null, createdAt: '2026-10-27T08:00:00.000Z', updatedAt: '2026-10-27T08:00:00.000Z',
  requester: { id: 'user-end', displayName: 'End User', email: 'end@example.test', phone: null, department: null },
  assignedToId: null, assignedTo: null, teamId: 'team-desk', team: { id: 'team-desk', name: 'Service Desk' }, country: null,
  category: null, _count: { comments: 0, attachments: 0 }, tasks: [],
};
apiClient.defaults.adapter = async (config) => {
  const data = config.data ? JSON.parse(config.data) : undefined;
  sent.push({ method: config.method, url: config.url, data });
  const ticket = { ...TICKET, status: serverStatus, ...(data ?? {}) };
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(ticket),
    config,
    request: {},
  };
};
const calls = () => sent.map((r) => [r.method, r.url]);
const READ_THEN_ASSIGN = [['get', '/tickets/ticket-1'], ['post', '/tickets/ticket-1/assign']];

const refusedOnDevice = (pattern) => (error) => {
  assert.ok(error instanceof ApiClientError, 'an ApiClientError');
  assert.ok(wasRefusedOnDevice(error), 'refused on the device');
  assert.match(error.body.error, pattern);
  return true;
};

describe('TKT-5: L2_MANAGER and END_USER never reach the call, even with the UI bypassed', () => {
  beforeEach(() => {
    sent.length = 0;
    serverStatus = 'OPEN';
  });

  for (const name of ['L2_MANAGER', 'END_USER']) {
    test(`${name}: refused before any request, in every status, to assign or to remove`, async () => {
      for (const status of TICKET_STATUSES) {
        serverStatus = status;
        for (const vars of [{ assignedToId: 'user-x', teamId: 'team-1' }, { assignedToId: null }]) {
          await assert.rejects(
            sendAssignment(PERSONAS[name].role, { ticketId: 'ticket-1', status, ...vars }),
            refusedOnDevice(/Only Admins and Technicians can assign tickets/),
            `${name} ${status}`,
          );
        }
      }
      assert.deepEqual(sent, [], 'not even the status read was sent');
    });
  }

  test('no session: refused before any request', async () => {
    await assert.rejects(sendAssignment(undefined, { ticketId: 'ticket-1', status: 'OPEN', assignedToId: 'user-x' }), refusedOnDevice(/not signed in/));
    assert.deepEqual(sent, []);
  });

  test('an AGENT on a CLOSED or CANCELED ticket: refused before any request', async () => {
    for (const p of [PERSONAS.AGENT, PERSONAS.TRIAGE_AGENT]) {
      for (const status of ['CLOSED', 'CANCELED']) {
        await assert.rejects(
          sendAssignment(p.role, { ticketId: 'ticket-1', status, assignedToId: 'user-x' }),
          refusedOnDevice(/locked for technicians/),
          `${p.id} ${status}`,
        );
      }
    }
    assert.deepEqual(sent, []);
  });

  test('an AGENT whose ticket was closed since the screen loaded: one status read, no assignment', async () => {
    serverStatus = 'CLOSED';
    await assert.rejects(sendAssignment('AGENT', { ticketId: 'ticket-1', status: 'OPEN', assignedToId: 'user-x' }), refusedOnDevice(/locked for technicians/));
    assert.deepEqual(calls(), [['get', '/tickets/ticket-1']]);
  });

  test('AGENT, triage AGENT and ADMIN on OPEN and RESOLVED: the status read, then POST /tickets/:id/assign', async () => {
    for (const name of ['AGENT', 'TRIAGE_AGENT', 'ADMIN']) {
      for (const status of ['OPEN', 'RESOLVED']) {
        sent.length = 0;
        serverStatus = status;
        const ticket = await sendAssignment(PERSONAS[name].role, { ticketId: 'ticket-1', status, assignedToId: 'user-x' });
        assert.deepEqual(calls(), READ_THEN_ASSIGN, `${name} ${status}`);
        assert.equal(ticket.assignedToId, 'user-x');
      }
    }
  });

  test('ADMIN on CLOSED and CANCELED: sent (ADMIN has no lock)', async () => {
    for (const status of ['CLOSED', 'CANCELED']) {
      sent.length = 0;
      serverStatus = status;
      await sendAssignment('ADMIN', { ticketId: 'ticket-1', status, assignedToId: null });
      assert.deepEqual(calls(), READ_THEN_ASSIGN, status);
    }
  });
});

// ── 4. The request body ──────────────────────────────────────

describe('TKT-5: the body is what 01 TKT-5 allows', () => {
  // assignTicketSchema (BE:tickets.validator.ts:44-47): { assignedToId?: uuid|null|'', teamId?: uuid|null|'' }. The app
  // sends assignedToId always (an id, or null to remove) and teamId only when known, never null (it cannot clear a group).
  const member = (id, displayName) => ({ id: `m-${id}`, teamId: 'team-desk', userId: id, isLead: false, joinedAt: '', user: { id, displayName, email: `${id}@example.test` } });
  const DESK = { id: 'team-desk', name: 'Service Desk', isActive: true, members: [member('user-bo', 'Bo'), member('user-ann', 'Ann')] };
  const members = teamMembers(DESK);
  const post = () => sent.find((r) => r.method === 'post');

  beforeEach(() => {
    sent.length = 0;
    serverStatus = 'OPEN';
  });

  /** What the editor's Save sends for a choice on a ticket in group `teamId` (TechnicianForm → edit.assign). */
  async function save(role, assignedToId, ticketTeamId) {
    const teamId = assignmentTeamId(assignedToId, members, ticketTeamId);
    await sendAssignment(role, { ticketId: 'ticket-1', status: 'OPEN', assignedToId, teamId });
    return post().data;
  }

  test("a member of the ticket's group: { assignedToId, teamId }, so the ticket stays in its group", async () => {
    assert.deepEqual(await save('AGENT', 'user-ann', 'team-desk'), { assignedToId: 'user-ann', teamId: 'team-desk' });
  });

  test('someone outside the group (recommended or searched): { assignedToId } alone, as the web sends it', async () => {
    assert.deepEqual(await save('AGENT', 'user-outside', 'team-desk'), { assignedToId: 'user-outside' });
  });

  test('a ticket with no group: { assignedToId } alone', async () => {
    assert.deepEqual(await save('ADMIN', 'user-ann', null), { assignedToId: 'user-ann' });
  });

  test('Unassigned: { assignedToId: null }, with no group', async () => {
    assert.deepEqual(await save('ADMIN', null, 'team-desk'), { assignedToId: null });
  });

  test('every body: only assignedToId and teamId; assignedToId an id or null; teamId never null or empty', async () => {
    for (const role of ['AGENT', 'ADMIN']) {
      for (const assignedToId of ['user-ann', 'user-outside', null]) {
        for (const ticketTeamId of ['team-desk', 'team-other', null, undefined]) {
          sent.length = 0;
          const body = await save(role, assignedToId, ticketTeamId);
          const where = `${role} ${assignedToId} ${ticketTeamId}`;
          assert.ok(Object.keys(body).every((k) => k === 'assignedToId' || k === 'teamId'), where);
          assert.ok(typeof body.assignedToId === 'string' || body.assignedToId === null, where);
          if ('teamId' in body) assert.ok(typeof body.teamId === 'string' && body.teamId.length > 0, where);
        }
      }
    }
  });

  test('the API layer drops any other key on its own', async () => {
    await assignTicket('ticket-1', { assignedToId: 'u', teamId: 't', status: 'CLOSED', categoryId: 'c', priority: 'HIGH' });
    assert.deepEqual(Object.keys(post().data).sort(), ['assignedToId', 'teamId']);
  });

  test('always POST /tickets/:id/assign: never PUT /tickets/:id, never /status', async () => {
    await save('AGENT', 'user-ann', 'team-desk');
    assert.deepEqual(calls(), READ_THEN_ASSIGN);
  });
});

// ── 5. Who is offered (the assign picker's rules, now shared) ──

describe("the editor's list: the web picker's order (TDP:1809-1873), from utils/assignment.ts", () => {
  const user = (id, displayName) => ({ id, displayName, email: `${id}@example.test` });
  const team = (id, isActive, people) => ({ id, name: id, isActive, members: people.map((u) => ({ id: `m-${u.id}`, teamId: id, userId: u.id, isLead: false, joinedAt: '', user: u })) });

  test('search (USR-3, when the group has no members) asks for AGENT and ADMIN, as the web does', () => {
    assert.deepEqual(TECHNICIAN_ROLES, ['AGENT', 'ADMIN']);
  });

  test("the group's members, by name", () => {
    const ids = teamMembers(team('desk', true, [user('u-zed', 'Zed'), user('u-amy', 'Amy'), user('u-mo', 'mo.li@x.test')])).map((m) => m.id);
    assert.deepEqual(ids, ['u-amy', 'u-mo', 'u-zed']);
    assert.deepEqual(teamMembers(undefined), []);
  });

  test('recommended (TKT-10): those in an active group first, the rest last, flagged (05 B.30)', () => {
    const suggested = [user('u-gone', 'Gone'), user('u-amy', 'Amy')];
    const rec = recommendedTechnicians(suggested, [team('desk', true, [user('u-amy', 'Amy')])]);
    assert.deepEqual(rec.map((p) => [p.id, p.active]), [['u-amy', true], ['u-gone', false]]);
  });

  test('recommended first, then the members of the group; each person once; the current technician marked', () => {
    const rec = recommendedTechnicians([user('u-amy', 'Amy'), user('u-gone', 'Gone')], [team('desk', true, [user('u-amy', 'Amy'), user('u-bo', 'Bo')])]);
    const options = technicianOptions({
      recommended: rec,
      members: teamMembers(team('desk', true, [user('u-bo', 'Bo'), user('u-amy', 'Amy')])),
      currentId: 'u-bo',
      countryName: 'Tanzania',
      groupName: 'Service Desk',
    });
    assert.deepEqual(options.map((o) => [o.id, o.note]), [
      ['u-amy', 'Recommended for Tanzania'],
      ['u-gone', `Recommended for Tanzania · ${INACTIVE_TECHNICIAN_NOTE}`],
      ['u-bo', 'Current technician · Service Desk'],
    ]);
  });

  test("M7's toast: the person's name, or the removal (an empty name is still an assignment)", () => {
    assert.equal(assignmentDoneMessage('Bo Smith'), 'Assigned to Bo Smith');
    assert.equal(assignmentDoneMessage(null), 'Assignment removed');
    assert.equal(assignmentDoneMessage(''), 'Assigned to ');
  });

  test("the group sent is the ticket's own, and only for one of its members", () => {
    const members = [{ id: 'u-bo' }];
    assert.equal(assignmentTeamId('u-bo', members, 'desk'), 'desk');
    assert.equal(assignmentTeamId('u-out', members, 'desk'), undefined);
    assert.equal(assignmentTeamId(null, members, 'desk'), undefined);
    assert.equal(assignmentTeamId('u-bo', members, null), undefined);
  });
});

// ── 6. Exactly one assignment implementation in src/ ─────────

describe('exactly one assignment implementation in src/', () => {
  function sourceFiles(dir) {
    return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
      const rel = path.join(dir, entry).split(path.sep).join('/');
      if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
      return /\.tsx?$/.test(entry) ? [rel] : [];
    });
  }
  const SRC = sourceFiles('src').map((rel) => ({ rel, code: read(rel) }));
  const filesWith = (pattern) => SRC.filter(({ code }) => pattern.test(code)).map(({ rel }) => rel).sort();

  test('one TKT-5 function, and it holds the only request to /assign', () => {
    assert.deepEqual(filesWith(/export async function assignTicket\(/), ['src/api/tickets.api.ts']);
    assert.deepEqual(filesWith(/\/assign`/), ['src/api/tickets.api.ts']);
  });

  test('one single-ticket hook: Pick up and Assign… (M4, M7) and the Technician editor all use useAssignTicket', () => {
    assert.deepEqual(filesWith(/\buseAssignTicket\(\)/), [
      'src/hooks/useAssignTicket.ts',
      'src/screens/tickets/AssignPickerScreen.tsx',
      'src/screens/tickets/TicketDetailScreen.tsx',
      'src/screens/tickets/TicketPropertyEditors.tsx',
    ]);
  });

  test('assignTicket() is called only by that hook and the two bulk loops, each after the guard on both statuses', () => {
    const callers = filesWith(/(?<![\w.])assignTicket\(/).filter((rel) => rel !== 'src/api/tickets.api.ts');
    assert.deepEqual(callers, ['src/hooks/useAssignTicket.ts', 'src/screens/tickets/AssignPickerScreen.tsx', 'src/screens/tickets/TicketListScreen.tsx']);
    for (const rel of callers) {
      const code = read(rel);
      const guarded = /assertAssignment\([^;]*\);\s*(?:\/\/[^\n]*\n\s*)?assertAssignment\([^;]*await fetchCurrentStatus\([^;]*\);[\s\S]{0,200}?(?<![\w.])assignTicket\(/;
      assert.match(code, guarded, `${rel}: the guard, then the guard against the server's status, then the call`);
    }
  });

  test('the Technician editor: from ticketFieldPermissions(), saved through useAssignTicket, never through the API or TKT-4', () => {
    const editors = read('src/screens/tickets/TicketPropertyEditors.tsx');
    assert.match(editors, /<FieldAction access=\{access\} label="Change technician" onPress=\{\(\) => edit\.open\('technician'\)\} blocked=\{blocked\} \/>/);
    assert.match(editors, /sectionState\('technician', props\)/);
    assert.match(editors, /assignment\.mutateAsync\(\{ ticketId: t\.id, status: t\.status, assignedToId: person \? person\.id : null, teamId \}\)/);
    assert.match(editors, /technician: \{ field: 'the technician', failed: 'Failed to assign'/);
    assert.doesNotMatch(editors, /(?<![\w.])assignTicket\(|sendAssignment\(|assertAssignment\(|canAssignTickets\(|isAgentOrAdmin\(|apiClient/);
    assert.doesNotMatch(editors, /update\.mutateAsync\([^)]*assignedToId/, 'TKT-4 never carries the technician');
    assert.equal(SRC.filter(({ code }) => code.includes('label="Change technician"')).length, 1, 'one link, in one place');
  });

  test('M4 shows the Technician row only through TechnicianSection, beside the other editors', () => {
    const detail = read('src/screens/tickets/TicketDetailScreen.tsx');
    assert.match(detail, /<CategorySection \{\.\.\.section\} \/>\s*<Row label="Group">[^\n]*\n\s*<TechnicianSection \{\.\.\.section\} \/>\s*<CountrySection \{\.\.\.section\} \/>/);
    assert.doesNotMatch(detail, /<Row label="Technician">/);
  });

  test('M7 takes who may assign from canAssignTickets(), and its lists and group rule from utils/assignment.ts', () => {
    const picker = read('src/screens/tickets/AssignPickerScreen.tsx');
    assert.match(picker, /if \(!canAssignTickets\(role\)\)/);
    for (const name of ['teamMembers(', 'recommendedTechnicians(', 'assignmentTeamId(']) assert.ok(picker.includes(name), name);
    assert.doesNotMatch(picker, /isAgentOrAdmin\(|function membersOf/);
  });
});

// ── 7. A failed save says why ────────────────────────────────

describe('a failed technician save says why', () => {
  test('a 403 says plainly that the role cannot change the technician', () => {
    const forbidden = new ApiClientError('http', 403, { error: 'Forbidden: insufficient role' });
    assert.equal(describeFieldWriteError('the technician', forbidden), "Your role can't change the technician on this ticket. Nothing was saved.");
  });

  test("any other answer shows the server's own message", () => {
    assert.equal(describeFieldWriteError('the technician', new ApiClientError('http', 400, { error: 'Validation error' })), 'Validation error');
  });
});
