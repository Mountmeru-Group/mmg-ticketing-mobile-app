// SLA reminders (docs/SLA-REMINDERS.md): the planner is pure, so these pin its rules with no device and no network.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  MAX_SCHEDULED_REMINDERS, SLA_REMINDER_LEAD_MS, formatMinutesLeft, nextDeadline, openDeadlines, planReminders, reminderCopy,
} from '../../src/utils/sla-reminders.ts';

const ME = 'me-0000-0000-0000-000000000001';
const OTHER = 'other-000-0000-0000-000000000002';
const NOW = Date.parse('2026-10-22T09:00:00.000Z');
const MIN = 60_000;
const iso = (offsetMin) => new Date(NOW + offsetMin * MIN).toISOString();

/** An open ticket assigned to me with both deadlines ahead; override what a case needs. */
function ticket(overrides = {}) {
  return {
    id: 'tkt-1', ticketNumber: 1001, title: 'Laptop will not boot', status: 'IN_PROGRESS', assignedToId: ME,
    slaStatus: 'WITHIN_SLA', slaResponseDue: iso(90), slaResolveDue: iso(240), firstResponseAt: null, resolvedAt: null,
    slaHoldMinutes: 0, slaHoldStartedAt: null,
    ...overrides,
  };
}

describe('openDeadlines', () => {
  test('both deadlines while nothing has happened yet', () => {
    assert.deepEqual(openDeadlines(ticket(), NOW).map((d) => d.kind), ['response', 'resolution']);
  });
  test('first response done: only resolution remains', () => {
    assert.deepEqual(openDeadlines(ticket({ firstResponseAt: iso(-5) }), NOW).map((d) => d.kind), ['resolution']);
  });
  test('resolved: nothing', () => {
    assert.deepEqual(openDeadlines(ticket({ status: 'RESOLVED', resolvedAt: iso(-1) }), NOW), []);
  });
  test('closed, canceled: nothing even with due times present', () => {
    for (const status of ['CLOSED', 'CANCELED']) assert.deepEqual(openDeadlines(ticket({ status }), NOW), []);
  });
  test('hold statuses: nothing (the server extends the deadline when the hold ends, 05 B.27)', () => {
    for (const status of ['ON_HOLD', 'PENDING', 'PENDING_USER_INFO', 'PENDING_MGMT_REVIEW']) {
      assert.deepEqual(openDeadlines(ticket({ status, slaHoldStartedAt: iso(-10) }), NOW), [], status);
    }
  });
  test('no SLA policy (null due times): nothing', () => {
    assert.deepEqual(openDeadlines(ticket({ slaResponseDue: null, slaResolveDue: null }), NOW), []);
  });
  test('an unparseable due time is ignored, not thrown', () => {
    assert.deepEqual(openDeadlines(ticket({ slaResponseDue: 'not a date' }), NOW).map((d) => d.kind), ['resolution']);
  });
});

describe('planReminders', () => {
  test('fires 30 minutes before each deadline, soonest first', () => {
    const plan = planReminders([ticket()], ME, NOW);
    assert.deepEqual(plan.map((r) => [r.kind, r.fireAt]), [
      ['response', NOW + 90 * MIN - SLA_REMINDER_LEAD_MS],
      ['resolution', NOW + 240 * MIN - SLA_REMINDER_LEAD_MS],
    ]);
    assert.equal(plan[0].key, 'tkt-1:response');
    assert.equal(plan[0].ticketNumber, 1001);
  });
  test('only tickets assigned to me', () => {
    assert.deepEqual(planReminders([ticket({ assignedToId: OTHER }), ticket({ assignedToId: null })], ME, NOW), []);
  });
  test('already inside the window: fires just after now, never in the past', () => {
    const plan = planReminders([ticket({ slaResponseDue: iso(10) })], ME, NOW);
    const response = plan.find((r) => r.kind === 'response');
    assert.ok(response.fireAt > NOW && response.fireAt < NOW + MIN);
  });
  test('already missed: skipped (the server sends SLA_BREACHED)', () => {
    const plan = planReminders([ticket({ slaResponseDue: iso(-1) })], ME, NOW);
    assert.deepEqual(plan.map((r) => r.kind), ['resolution']);
  });
  test('capped at the soonest MAX_SCHEDULED_REMINDERS', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      ticket({ id: `tkt-${i}`, ticketNumber: 2000 + i, slaResponseDue: iso(60 + i), slaResolveDue: null }),
    );
    const plan = planReminders(many, ME, NOW);
    assert.equal(plan.length, MAX_SCHEDULED_REMINDERS);
    assert.equal(plan[0].ticketNumber, 2000);
    assert.equal(plan[plan.length - 1].ticketNumber, 2000 + MAX_SCHEDULED_REMINDERS - 1);
  });
  test('a null row in the pool does not throw', () => {
    assert.deepEqual(planReminders([null, ticket({ assignedToId: OTHER })], ME, NOW), []);
  });
});

describe('reminderCopy', () => {
  test('names the ticket, the deadline kind and the minutes left at fire time', () => {
    const [response] = planReminders([ticket()], ME, NOW);
    assert.deepEqual(reminderCopy(response), { title: '#1001 · First response due in 30 min', body: 'Laptop will not boot' });
  });
  test('long titles are cut to one line; an empty title gets a prompt', () => {
    const long = planReminders([ticket({ title: 'x'.repeat(120) })], ME, NOW)[0];
    assert.equal(reminderCopy(long).body.length, 80);
    const empty = planReminders([ticket({ title: '   ' })], ME, NOW)[0];
    assert.match(reminderCopy(empty).body, /Open the ticket/);
  });
});

describe('nextDeadline and formatMinutesLeft', () => {
  test('the nearest deadline ahead, flagged inside the 30-minute window', () => {
    assert.deepEqual(nextDeadline(ticket(), NOW), { kind: 'response', dueAt: NOW + 90 * MIN, minutesLeft: 90, dueSoon: false });
    assert.equal(nextDeadline(ticket({ slaResponseDue: iso(20) }), NOW).dueSoon, true);
    assert.equal(nextDeadline(ticket({ status: 'CLOSED' }), NOW), null);
  });
  test('human durations', () => {
    assert.equal(formatMinutesLeft(12), '12 min');
    assert.equal(formatMinutesLeft(125), '2 h 05 min');
    assert.equal(formatMinutesLeft(120), '2 h');
    assert.equal(formatMinutesLeft(49 * 60), '2 d 1 h');
  });
});
