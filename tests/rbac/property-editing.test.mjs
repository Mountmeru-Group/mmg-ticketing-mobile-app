// Phase G1: editing impact, urgency, category, country and resolution on the ticket detail screen (M4), and the
// priority preview. The expected behaviour is the web portal's, read from its source (docs/G1-WEB-BEHAVIOUR.md), with
// the G1 brief's country rule (05 §A.12) and the deliberate 🔒 SAFER exclusions.
//
// Like role-gating.test.mjs, these are written to FAIL when the app becomes MORE permissive: every persona's full answer
// is spelled out per ticket state, the on-device write guard is checked for every refusal, and the request that does
// leave the device is checked for what it carries (never status; `priority` only as the matrix value riding along with
// an impact or urgency change, ADMIN and AGENT only — the web's behaviour, applied in G2, ROLE-MATRIX §8 item 11).
//
// What is real: permissions.ts, ticket-properties.ts, the write guard, tickets.api.ts and the axios client.
// What is faked: the network (axios's transport adapter records requests). Nothing calls UAT.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { AxiosHeaders } from 'axios';

import { ApiClientError, describeFieldWriteError } from '../../src/api/errors.ts';
import { apiClient } from '../../src/api/client.ts';
import { changeTicketStatus, updateTicket } from '../../src/api/tickets.api.ts';
import { assertFieldEdits } from '../../src/hooks/writeGuards.ts';
import { TICKET_STATUSES } from '../../src/types/index.ts';
import {
  AGENT_LOCK_REASON, COUNTRY_LOCK_REASON, PRIORITY_ALONE_REASON, RESOLUTION_STATE_REASON, fieldEditProblem,
  ticketFieldPermissions,
} from '../../src/utils/permissions.ts';
import {
  NO_CATEGORY, categoryChoices, categoryIdToSave, categorySavedMessage, categorySelectionOf, classificationChanges,
  previewPriority, selectCategoryLevel,
} from '../../src/utils/ticket-properties.ts';
import { NAMES, PERSONAS, forEachPersona } from './personas.mjs';

const EDIT = { mode: 'edit' };
const VIEW = { mode: 'view' };
const HIDDEN = { mode: 'hidden' };
const AGENT_LOCKED = { mode: 'locked', reason: AGENT_LOCK_REASON };
const COUNTRY_LOCKED = { mode: 'locked', reason: COUNTRY_LOCK_REASON };
const RESOLUTION_LOCKED = { mode: 'locked', reason: RESOLUTION_STATE_REASON };

const FIELDS = ['impact', 'urgency', 'category', 'country', 'resolution'];
const BODY_KEY = { impact: 'impact', urgency: 'urgency', category: 'categoryId', country: 'countryId', resolution: 'resolution' };
const SAMPLE_VALUE = { impact: 'HIGH', urgency: 'URGENT', categoryId: 'cat-new', countryId: 'country-ke', resolution: 'Replaced the cable' };

const fieldsFor = (persona, status) => ticketFieldPermissions(persona, { status });

// ── 1. Who edits what, by ticket state ───────────────────────

describe('property editors: every field, every persona, by ticket state', () => {
  // OPEN (any live status): AGENT edits impact/urgency/category; L2 only impact/urgency; country per 05 §A.12;
  // the resolution is not editable yet (web: only while RESOLVED or CLOSED).
  const STAFF_OPEN = { impact: EDIT, urgency: EDIT, category: EDIT, resolution: RESOLUTION_LOCKED };
  const OPEN = {
    END_USER: { impact: HIDDEN, urgency: HIDDEN, category: VIEW, country: VIEW, resolution: VIEW, priorityPreview: false },
    AGENT: { ...STAFF_OPEN, country: COUNTRY_LOCKED, priorityPreview: true },
    TRIAGE_AGENT: { ...STAFF_OPEN, country: EDIT, priorityPreview: true },
    L2_MANAGER: { ...STAFF_OPEN, category: VIEW, country: VIEW, priorityPreview: false },
    ADMIN: { ...STAFF_OPEN, country: EDIT, priorityPreview: true },
  };
  forEachPersona('OPEN ticket', OPEN, (p) => fieldsFor(p, 'OPEN'));

  const resolutionEditable = (expected) =>
    Object.fromEntries(Object.entries(expected).map(([name, e]) => [name, name === 'END_USER' ? e : { ...e, resolution: EDIT }]));

  // RESOLVED: the same, plus the resolution text for staff. END_USER stays read-only (🔒 SAFER, D3).
  forEachPersona('RESOLVED ticket', resolutionEditable(OPEN), (p) => fieldsFor(p, 'RESOLVED'));

  // CLOSED: the AGENT lock takes impact, urgency and category from every AGENT; country and resolution are not
  // lock-gated on the web (FE:TicketDetailPage.tsx:2199, :1438-1486). ADMIN and L2 are never locked.
  const CLOSED = {
    END_USER: OPEN.END_USER,
    AGENT: { impact: AGENT_LOCKED, urgency: AGENT_LOCKED, category: AGENT_LOCKED, country: COUNTRY_LOCKED, resolution: EDIT, priorityPreview: false },
    TRIAGE_AGENT: { impact: AGENT_LOCKED, urgency: AGENT_LOCKED, category: AGENT_LOCKED, country: EDIT, resolution: EDIT, priorityPreview: false },
    L2_MANAGER: { ...OPEN.L2_MANAGER, resolution: EDIT },
    ADMIN: { ...OPEN.ADMIN, resolution: EDIT },
  };
  forEachPersona('CLOSED ticket', CLOSED, (p) => fieldsFor(p, 'CLOSED'));

  // CANCELED: the AGENT lock as on CLOSED; the resolution is NOT editable (the web offers it for RESOLVED/CLOSED only).
  const CANCELED = Object.fromEntries(
    Object.entries(CLOSED).map(([name, e]) => [name, name === 'END_USER' ? e : { ...e, resolution: RESOLUTION_LOCKED }]),
  );
  forEachPersona('CANCELED ticket', CANCELED, (p) => fieldsFor(p, 'CANCELED'));

  test('with no signed-in user nothing is editable', () => {
    for (const status of TICKET_STATUSES) {
      assert.deepEqual(ticketFieldPermissions(null, { status }), OPEN.END_USER, status);
    }
  });
});

describe('property editors: what may never be edited, from any status', () => {
  const editable = (persona, status, field) => fieldsFor(persona, status)[field].mode === 'edit';

  test('END_USER edits none of the five fields', () => {
    for (const status of TICKET_STATUSES) {
      for (const field of FIELDS) assert.equal(editable(PERSONAS.END_USER, status, field), false, `${status} ${field}`);
      assert.equal(fieldsFor(PERSONAS.END_USER, status).priorityPreview, false, status);
    }
  });

  test('L2_MANAGER never edits the category or the country, and never loads the priority matrix (403)', () => {
    for (const status of TICKET_STATUSES) {
      assert.equal(editable(PERSONAS.L2_MANAGER, status, 'category'), false, status);
      assert.equal(editable(PERSONAS.L2_MANAGER, status, 'country'), false, status);
      assert.equal(fieldsFor(PERSONAS.L2_MANAGER, status).priorityPreview, false, status);
    }
  });

  test('a country-locked AGENT never edits the country; only ADMIN and the triage AGENT do', () => {
    for (const status of TICKET_STATUSES) {
      const who = NAMES.filter((name) => editable(PERSONAS[name], status, 'country'));
      assert.deepEqual(who, ['TRIAGE_AGENT', 'ADMIN'], status);
    }
  });

  test('an AGENT never edits impact, urgency or category on a CLOSED or CANCELED ticket', () => {
    for (const persona of [PERSONAS.AGENT, PERSONAS.TRIAGE_AGENT]) {
      for (const status of ['CLOSED', 'CANCELED']) {
        for (const field of ['impact', 'urgency', 'category']) {
          assert.deepEqual(fieldsFor(persona, status)[field], AGENT_LOCKED, `${persona.id} ${status} ${field}`);
        }
      }
    }
  });

  test('the resolution is editable only while RESOLVED or CLOSED, and only by staff', () => {
    for (const name of NAMES) {
      const statuses = TICKET_STATUSES.filter((status) => editable(PERSONAS[name], status, 'resolution'));
      assert.deepEqual(statuses, name === 'END_USER' ? [] : ['RESOLVED', 'CLOSED'], name);
    }
  });

  test('impact and urgency always share one rule (one editor)', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const status of TICKET_STATUSES) assert.deepEqual(fieldsFor(p, status).impact, fieldsFor(p, status).urgency);
    }
  });
});

// ── 2. The last check on the device, before TKT-4 ────────────

describe('write guard: a field a persona may not edit is refused before anything is sent', () => {
  /** Every (persona, status, field) the matrix above does not give as `edit` must be refused, and every `edit` allowed. */
  test('the guard agrees with ticketFieldPermissions() everywhere', () => {
    for (const name of NAMES) {
      for (const status of TICKET_STATUSES) {
        const can = fieldsFor(PERSONAS[name], status);
        for (const field of FIELDS) {
          const key = BODY_KEY[field];
          const problem = fieldEditProblem(PERSONAS[name], status, { [key]: SAMPLE_VALUE[key] });
          if (can[field].mode === 'edit') assert.equal(problem, null, `${name} ${status} ${field}`);
          else assert.ok(problem, `${name} ${status} ${field} should be refused`);
        }
      }
    }
  });

  test('refusals name the reason', () => {
    assert.throws(() => assertFieldEdits(PERSONAS.L2_MANAGER, 'OPEN', { categoryId: 'cat-new' }), /Your role can't change the category/);
    assert.throws(() => assertFieldEdits(PERSONAS.L2_MANAGER, 'OPEN', { countryId: 'country-ke' }), /Your role can't change the country/);
    assert.throws(() => assertFieldEdits(PERSONAS.AGENT, 'OPEN', { countryId: 'country-ke' }), /locked to your own country/);
    assert.throws(() => assertFieldEdits(PERSONAS.AGENT, 'CLOSED', { impact: 'HIGH' }), /locked for technicians/);
    assert.throws(() => assertFieldEdits(PERSONAS.END_USER, 'RESOLVED', { resolution: 'mine now' }), /Your role can't change the resolution/);
    assert.throws(() => assertFieldEdits(PERSONAS.ADMIN, 'CANCELED', { resolution: 'x' }), /only while the ticket is Resolved or Closed/);
  });

  test('one forbidden key refuses the whole body', () => {
    assert.throws(() => assertFieldEdits(PERSONAS.L2_MANAGER, 'OPEN', { impact: 'HIGH', categoryId: 'cat-new' }), /category/);
  });

  test('status and every field no editor offers are refused for every role', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const body of [{ status: 'CLOSED' }, { title: 'x' }, { teamId: 't' }, { assignedToId: 'u' }, { tags: [] }]) {
        assert.throws(() => assertFieldEdits(p, 'OPEN', body), /can't be changed from the app/, `${p.id} ${JSON.stringify(body)}`);
      }
    }
  });

  test('a priority on its own is refused for every role, in every status', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const status of TICKET_STATUSES) {
        assert.equal(fieldEditProblem(p, status, { priority: 'URGENT' }), PRIORITY_ALONE_REASON, `${p.id} ${status}`);
      }
    }
  });

  // G2 (ROLE-MATRIX §8 item 11): the web sends the matrix priority with an impact/urgency change, ADMIN and AGENT only
  // (L2's matrix is a 403). Exactly the people who get the preview, in exactly the states they get it.
  test('a priority with an impact or urgency change goes through only where the preview is offered', () => {
    for (const name of NAMES) {
      for (const status of TICKET_STATUSES) {
        const can = fieldsFor(PERSONAS[name], status);
        for (const body of [{ impact: 'HIGH', priority: 'URGENT' }, { urgency: 'LOW', priority: 'LOW' }]) {
          const problem = fieldEditProblem(PERSONAS[name], status, body);
          if (can.priorityPreview) assert.equal(problem, null, `${name} ${status} ${JSON.stringify(body)}`);
          else assert.ok(problem, `${name} ${status} ${JSON.stringify(body)} should be refused`);
        }
      }
    }
    assert.throws(() => assertFieldEdits(PERSONAS.L2_MANAGER, 'OPEN', { impact: 'HIGH', priority: 'URGENT' }), /Your role can't change the priority/);
    assert.throws(() => assertFieldEdits(PERSONAS.AGENT, 'CLOSED', { priority: 'URGENT', impact: 'HIGH' }), /locked for technicians/);
  });

  test('an empty body is refused', () => {
    assert.throws(() => assertFieldEdits(PERSONAS.ADMIN, 'OPEN', {}), /Nothing to save/);
    assert.throws(() => assertFieldEdits(PERSONAS.ADMIN, 'OPEN', { impact: undefined }), /Nothing to save/);
  });

  test('what the web allows goes through', () => {
    assert.doesNotThrow(() => assertFieldEdits(PERSONAS.TRIAGE_AGENT, 'CLOSED', { countryId: null }));
    assert.doesNotThrow(() => assertFieldEdits(PERSONAS.AGENT, 'CLOSED', { resolution: '' }));
    assert.doesNotThrow(() => assertFieldEdits(PERSONAS.L2_MANAGER, 'CANCELED', { urgency: 'LOW', impact: 'MINIMAL' }));
    assert.doesNotThrow(() => assertFieldEdits(PERSONAS.ADMIN, 'CANCELED', { categoryId: null }));
  });
});

// ── 3. What leaves the device ────────────────────────────────

describe('TKT-4: the request never carries status, and carries priority only for ADMIN and AGENT', () => {
  const sent = [];
  apiClient.defaults.adapter = async (config) => {
    const data = config.data ? JSON.parse(config.data) : undefined;
    sent.push({ method: config.method, url: config.url, data });
    return {
      status: 200,
      statusText: '200',
      headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
      data: JSON.stringify({ id: 'ticket-1', ...data }),
      config,
      request: {},
    };
  };
  beforeEach(() => {
    sent.length = 0;
  });

  // The API allow-list is the layer under the write guard: it alone must already keep priority from END_USER and
  // L2_MANAGER (the web never sends one for them), and category and group from L2_MANAGER (ROLE-MATRIX §8 item 2).
  const PRIORITY_SENT = { END_USER: false, AGENT: true, L2_MANAGER: false, ADMIN: true };
  for (const role of ['END_USER', 'AGENT', 'L2_MANAGER', 'ADMIN']) {
    test(`${role}: PUT /tickets/:id drops status${PRIORITY_SENT[role] ? '' : ' and priority'}`, async () => {
      await updateTicket('ticket-1', { status: 'CLOSED', priority: 'URGENT', impact: 'HIGH', resolution: 'Fixed' }, role);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].method, 'put');
      assert.equal(sent[0].url, '/tickets/ticket-1');
      assert.equal('status' in sent[0].data, false);
      assert.equal('priority' in sent[0].data, PRIORITY_SENT[role]);
    });
  }

  test('L2_MANAGER: the API layer cannot send a category, group, assignee or country change', async () => {
    await updateTicket('ticket-1', { categoryId: 'cat-new', teamId: 'team-1', assignedToId: 'u', countryId: 'country-ke', urgency: 'LOW' }, 'L2_MANAGER');
    assert.deepEqual(sent[0].data, { urgency: 'LOW' });
  });

  test('every role: exactly the TKT-4 keys 01 allows it', async () => {
    const everything = {
      title: 't', description: 'd', categoryId: 'c', impact: 'HIGH', urgency: 'LOW', priority: 'HIGH', teamId: 'g',
      assignedToId: 'u', tags: [], resolution: 'r', countryId: 'k', status: 'CLOSED', requesterId: 'x', slaPolicyId: 'y',
    };
    const STAFF = ['title', 'description', 'categoryId', 'impact', 'urgency', 'priority', 'teamId', 'assignedToId', 'tags', 'resolution', 'countryId'];
    const ALLOWED = {
      END_USER: ['title', 'description'],
      AGENT: STAFF,
      ADMIN: STAFF,
      L2_MANAGER: ['title', 'description', 'impact', 'urgency', 'tags', 'resolution'],
    };
    for (const role of Object.keys(ALLOWED)) {
      sent.length = 0;
      await updateTicket('ticket-1', everything, role);
      assert.deepEqual(Object.keys(sent[0].data).sort(), [...ALLOWED[role]].sort(), role);
    }
  });

  test('a status change is a POST to /status, never a PUT', async () => {
    await changeTicketStatus('ticket-1', { status: 'IN_PROGRESS' });
    assert.deepEqual(sent.map((r) => [r.method, r.url]), [['post', '/tickets/ticket-1/status']]);
  });

  test('each editor sends only its own key', async () => {
    const bodies = [
      classificationChanges({ impact: 'LOW', urgency: 'LOW' }, { impact: 'HIGH', urgency: 'LOW' }),
      { categoryId: categoryIdToSave({ topId: 'c1', subId: 's1', itemId: null }) },
      { countryId: null },
      { resolution: 'Replaced the cable' },
    ];
    for (const body of bodies) await updateTicket('ticket-1', body, 'ADMIN');
    assert.deepEqual(sent.map((r) => r.data), [{ impact: 'HIGH' }, { categoryId: 's1' }, { countryId: null }, { resolution: 'Replaced the cable' }]);
  });
});

// ── 4. Impact, urgency and the priority preview ──────────────

describe('priority preview (LKP-6): the web and server rule', () => {
  // The 9 rows LKP-6 seeds (BE:priorityMatrix.controller.ts:9-19).
  const MATRIX = [
    ['HIGH', 'HIGH', 'URGENT'], ['HIGH', 'MEDIUM', 'HIGH'], ['HIGH', 'LOW', 'MEDIUM'],
    ['MEDIUM', 'HIGH', 'HIGH'], ['MEDIUM', 'MEDIUM', 'MEDIUM'], ['MEDIUM', 'LOW', 'LOW'],
    ['LOW', 'HIGH', 'MEDIUM'], ['LOW', 'MEDIUM', 'LOW'], ['LOW', 'LOW', 'LOW'],
  ].map(([impact, urgency, priority], i) => ({ id: `m${i}`, impact, urgency, priority }));

  test('a pair with a matrix row gives that row\'s priority', () => {
    assert.deepEqual(previewPriority(MATRIX, { impact: 'HIGH', urgency: 'HIGH' }), { kind: 'computed', priority: 'URGENT' });
    assert.deepEqual(previewPriority(MATRIX, { impact: 'LOW', urgency: 'MEDIUM' }), { kind: 'computed', priority: 'LOW' });
  });

  test('a pair with no row (MINIMAL or URGENT by default) leaves the priority as it is', () => {
    assert.deepEqual(previewPriority(MATRIX, { impact: 'MINIMAL', urgency: 'HIGH' }), { kind: 'noRow' });
    assert.deepEqual(previewPriority(MATRIX, { impact: 'HIGH', urgency: 'URGENT' }), { kind: 'noRow' });
  });

  test('with one of the two unset nothing is computed', () => {
    assert.deepEqual(previewPriority(MATRIX, { impact: 'HIGH', urgency: null }), { kind: 'incomplete' });
    assert.deepEqual(previewPriority(MATRIX, { impact: null, urgency: null }), { kind: 'incomplete' });
  });

  test('without the matrix (L2_MANAGER, or not loaded yet) the body carries only what changed, never priority, never null', () => {
    const ticket = { impact: 'LOW', urgency: null };
    assert.deepEqual(classificationChanges(ticket, { impact: 'LOW', urgency: null }), {});
    assert.deepEqual(classificationChanges(ticket, { impact: 'HIGH', urgency: null }), { impact: 'HIGH' });
    assert.deepEqual(classificationChanges(ticket, { impact: 'LOW', urgency: 'URGENT' }), { urgency: 'URGENT' });
    assert.deepEqual(classificationChanges({ impact: 'HIGH', urgency: 'HIGH' }, { impact: null, urgency: null }), {});
    assert.deepEqual(classificationChanges({ impact: 'LOW', urgency: 'LOW' }, { impact: 'HIGH', urgency: 'HIGH' }), { impact: 'HIGH', urgency: 'HIGH' });
  });

  // G2: FE:TicketDetailPage.tsx:306-315 — the effective pair (the change, else the ticket's value) looked up in the matrix.
  test('with the matrix (ADMIN, AGENT) a change also carries the matrix priority for the effective pair, as the web sends it', () => {
    // Impact changed; urgency is the ticket's own.
    assert.deepEqual(classificationChanges({ impact: 'LOW', urgency: 'HIGH' }, { impact: 'HIGH', urgency: 'HIGH' }, MATRIX), { impact: 'HIGH', priority: 'URGENT' });
    // Urgency changed; same priority as now is still sent (the web sends it whenever the row exists).
    assert.deepEqual(classificationChanges({ impact: 'LOW', urgency: 'LOW' }, { impact: 'LOW', urgency: 'MEDIUM' }, MATRIX), { urgency: 'MEDIUM', priority: 'LOW' });
    // Both changed.
    assert.deepEqual(classificationChanges({ impact: 'LOW', urgency: 'LOW' }, { impact: 'MEDIUM', urgency: 'HIGH' }, MATRIX), { impact: 'MEDIUM', urgency: 'HIGH', priority: 'HIGH' });
  });

  test('with the matrix, no priority when the pair has no row, one value is unset, or nothing changed', () => {
    assert.deepEqual(classificationChanges({ impact: 'LOW', urgency: 'LOW' }, { impact: 'MINIMAL', urgency: 'LOW' }, MATRIX), { impact: 'MINIMAL' });
    assert.deepEqual(classificationChanges({ impact: 'LOW', urgency: null }, { impact: 'HIGH', urgency: null }, MATRIX), { impact: 'HIGH' });
    assert.deepEqual(classificationChanges({ impact: 'HIGH', urgency: 'HIGH' }, { impact: 'HIGH', urgency: 'HIGH' }, MATRIX), {});
    assert.deepEqual(classificationChanges({ impact: 'HIGH', urgency: 'HIGH' }, { impact: null, urgency: null }, MATRIX), {});
  });

  test('what an ADMIN Save sends: the change plus the matrix priority, never status', async () => {
    const sent = [];
    apiClient.defaults.adapter = async (config) => {
      const data = config.data ? JSON.parse(config.data) : undefined;
      sent.push(data);
      return { status: 200, statusText: '200', headers: AxiosHeaders.from({ 'content-type': 'application/json' }), data: '{}', config, request: {} };
    };
    const body = classificationChanges({ impact: 'LOW', urgency: 'HIGH' }, { impact: 'HIGH', urgency: 'HIGH' }, MATRIX);
    assert.equal(fieldEditProblem(PERSONAS.ADMIN, 'OPEN', body), null);
    await updateTicket('ticket-1', body, 'ADMIN');
    assert.deepEqual(sent, [{ impact: 'HIGH', priority: 'URGENT' }]);
  });
});

// ── 5. The category cascade ──────────────────────────────────

describe('category cascade (LKP-1)', () => {
  const row = (id, name, level, parentId) => ({ id, name, level, parentId, isActive: true });
  // Server order (sortOrder), as the web detail page keeps it: "Zeta" before "Alpha".
  const CATEGORIES = [
    row('c-zeta', 'Zeta', 'CATEGORY', null),
    row('c-alpha', 'Alpha', 'CATEGORY', null),
    row('s-a1', 'A one', 'SUBCATEGORY', 'c-alpha'),
    row('s-z1', 'Z one', 'SUBCATEGORY', 'c-zeta'),
    row('i-a1x', 'A one x', 'ITEM', 's-a1'),
    row('i-z1x', 'Z one x', 'ITEM', 's-z1'),
  ];
  const ITEM_ON_TICKET = {
    id: 'i-a1x', name: 'A one x', level: 'ITEM', parentId: 's-a1',
    parent: { id: 's-a1', name: 'A one', level: 'SUBCATEGORY', parentId: 'c-alpha', parent: { id: 'c-alpha', name: 'Alpha', level: 'CATEGORY' } },
  };

  test('the current selection is read from the ticket\'s chain by level', () => {
    const subOnTicket = {
      id: 's-a1', name: 'A one', level: 'SUBCATEGORY', parentId: 'c-alpha',
      parent: { id: 'c-alpha', name: 'Alpha', level: 'CATEGORY', parentId: null, parent: null },
    };
    assert.deepEqual(categorySelectionOf(ITEM_ON_TICKET), { topId: 'c-alpha', subId: 's-a1', itemId: 'i-a1x' });
    assert.deepEqual(categorySelectionOf(subOnTicket), { topId: 'c-alpha', subId: 's-a1', itemId: null });
    assert.deepEqual(categorySelectionOf({ id: 'c-zeta', name: 'Zeta', level: 'CATEGORY', parentId: null, parent: null }), { topId: 'c-zeta', subId: null, itemId: null });
    assert.deepEqual(categorySelectionOf(null), NO_CATEGORY);
  });

  test('changing the category clears the subcategory and the item', () => {
    const from = categorySelectionOf(ITEM_ON_TICKET);
    assert.deepEqual(selectCategoryLevel(from, 'topId', 'c-zeta'), { topId: 'c-zeta', subId: null, itemId: null });
    assert.deepEqual(selectCategoryLevel(from, 'topId', null), NO_CATEGORY);
  });

  test('changing the subcategory clears the item; changing the item keeps its parents', () => {
    const from = categorySelectionOf(ITEM_ON_TICKET);
    assert.deepEqual(selectCategoryLevel(from, 'subId', null), { topId: 'c-alpha', subId: null, itemId: null });
    assert.deepEqual(selectCategoryLevel(from, 'itemId', null), { topId: 'c-alpha', subId: 's-a1', itemId: null });
  });

  test('Save sends the deepest chosen level, or null for "None" at the top', () => {
    assert.equal(categoryIdToSave({ topId: 'c', subId: 's', itemId: 'i' }), 'i');
    assert.equal(categoryIdToSave({ topId: 'c', subId: 's', itemId: null }), 's');
    assert.equal(categoryIdToSave({ topId: 'c', subId: null, itemId: null }), 'c');
    assert.equal(categoryIdToSave(NO_CATEGORY), null);
  });

  test('each level lists the active children of the level above, in the server\'s order', () => {
    const ids = (list) => list.map((c) => c.id);
    const choices = categoryChoices(CATEGORIES, ITEM_ON_TICKET, categorySelectionOf(ITEM_ON_TICKET));
    assert.deepEqual(ids(choices.tops), ['c-zeta', 'c-alpha']);
    assert.deepEqual(ids(choices.subs), ['s-a1']);
    assert.deepEqual(ids(choices.items), ['i-a1x']);
    assert.ok([...choices.tops, ...choices.subs, ...choices.items].every((c) => !c.inactive));

    const moved = categoryChoices(CATEGORIES, ITEM_ON_TICKET, { topId: 'c-zeta', subId: null, itemId: null });
    assert.deepEqual(ids(moved.subs), ['s-z1']);
    assert.deepEqual(moved.items, [], 'no item list until a subcategory is chosen');
  });

  test('a ticket whose category is no longer active still shows it, marked inactive', () => {
    const active = CATEGORIES.filter((c) => !['c-alpha', 's-a1', 'i-a1x'].includes(c.id));
    const choices = categoryChoices(active, ITEM_ON_TICKET, categorySelectionOf(ITEM_ON_TICKET));
    assert.deepEqual(choices.tops[0], { id: 'c-alpha', name: 'Alpha', inactive: true });
    assert.deepEqual(choices.subs, [{ id: 's-a1', name: 'A one', inactive: true }]);
    assert.deepEqual(choices.items, [{ id: 'i-a1x', name: 'A one x', inactive: true }]);
    // Once another category is chosen, the old subcategory and item no longer belong to the lists.
    const moved = categoryChoices(active, ITEM_ON_TICKET, { topId: 'c-zeta', subId: null, itemId: null });
    assert.ok(!moved.subs.some((c) => c.inactive));
  });

  test('the toast says "auto-assigned" only when the server actually changed the technician', () => {
    const before = { assignedToId: 'u1', teamId: 't1' };
    assert.equal(categorySavedMessage(before, { ...before, assignedTo: { displayName: 'Ann' }, team: { name: 'Desk' } }), 'Category updated');
    assert.equal(
      categorySavedMessage(before, { assignedToId: 'u2', teamId: 't2', assignedTo: { displayName: 'bo.smith@x.test' }, team: { name: 'Network' } }),
      'Category updated — moved to Network and auto-assigned to Bo Smith',
    );
  });
});

// ── 6. Failure wording ───────────────────────────────────────

describe('a failed save says why', () => {
  test('a 403 says plainly that the role cannot change that field', () => {
    const forbidden = new ApiClientError('http', 403, { error: 'Forbidden' });
    assert.equal(describeFieldWriteError('the category', forbidden), "Your role can't change the category on this ticket. Nothing was saved.");
  });

  test('any other answer shows the server\'s own message', () => {
    const missing = new ApiClientError('http', 404, { error: 'Ticket not found' });
    assert.equal(describeFieldWriteError('the country', missing), 'Ticket not found');
  });
});
