// Phase G5: the priority preview on the create form (the last ❌ NOT BUILT row), the fixes from the G1–G4 role audit,
// and audit pins for the brief's four questions. The expected behaviour is the web portal's, read from its source:
// FE:pages/tickets/CreateTicketPage.tsx (:26, :49-76, :346-403) and BE:modules/tickets/tickets.controller.ts:185-201;
// the rest is cited in docs/ROLE-MATRIX.md §14 and docs/WEB-VS-MOBILE-ROLES.md.
//
// Written, like the other rbac suites, to FAIL when the app becomes more permissive: every persona's full answer is
// spelled out, the request that leaves the device is checked key by key, and the wiring is checked so that the create
// form cannot grow a second preview or decide a role itself.
//
// What is real: permissions.ts, ticket-properties.ts, tickets.api.ts and the axios client. What is faked: the network
// (axios's transport adapter records requests), as in the other rbac suites. Nothing calls UAT.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { createTicket } from '../../src/api/tickets.api.ts';
import { TICKET_IMPACTS, TICKET_URGENCIES } from '../../src/types/index.ts';
import {
  canDeleteAttachments, composerPermissions, createTicketPermissions, ticketDetailPermissions, ticketFieldPermissions,
} from '../../src/utils/permissions.ts';
import { newTicketPriority, previewPriority } from '../../src/utils/ticket-properties.ts';
import { NAMES, PERSONAS, forEachPersona } from './personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

// ── The network, faked ───────────────────────────────────────

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push({ method: config.method, url: config.url, data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data });
  return {
    status: 201,
    statusText: '201',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify({ id: 'ticket-new' }),
    config,
    request: {},
  };
};
beforeEach(() => {
  sent.length = 0;
});

// The 9 rows LKP-6 seeds (BE:priorityMatrix.controller.ts:9-19); MINIMAL and URGENT have none.
const MATRIX = [
  ['HIGH', 'HIGH', 'URGENT'], ['HIGH', 'MEDIUM', 'HIGH'], ['HIGH', 'LOW', 'MEDIUM'],
  ['MEDIUM', 'HIGH', 'HIGH'], ['MEDIUM', 'MEDIUM', 'MEDIUM'], ['MEDIUM', 'LOW', 'LOW'],
  ['LOW', 'HIGH', 'MEDIUM'], ['LOW', 'MEDIUM', 'LOW'], ['LOW', 'LOW', 'LOW'],
].map(([impact, urgency, priority], i) => ({ id: `m${i}`, impact, urgency, priority }));

// ══ 1. The create form: who sees what ═══════════════════════

describe('create form (M8): who sees what (FE:CreateTicketPage.tsx :26 isStaff, :346-470)', () => {
  const ADMIN_AGENT = { classification: true, priorityPreview: true, routing: true, raiseOnBehalf: true, routingNotice: false };
  forEachPersona(
    'createTicketPermissions',
    {
      END_USER: { classification: false, priorityPreview: false, routing: false, raiseOnBehalf: false, routingNotice: true },
      AGENT: ADMIN_AGENT,
      TRIAGE_AGENT: ADMIN_AGENT,
      // L2: impact and urgency as on the web; no preview (LKP-6 is a 403 for L2, so the web's box never computes);
      // no group or technician (403, always empty on the web, CR3); no requester (CR4 is ADMIN/AGENT only).
      L2_MANAGER: { classification: true, priorityPreview: false, routing: false, raiseOnBehalf: false, routingNotice: false },
      ADMIN: ADMIN_AGENT,
    },
    (p) => createTicketPermissions(p),
  );

  test('a role the app does not know, or no session, gets the END_USER form at most', () => {
    assert.deepEqual(createTicketPermissions({ role: 'GUEST' }), {
      classification: false, priorityPreview: false, routing: false, raiseOnBehalf: false, routingNotice: false,
    });
    assert.deepEqual(createTicketPermissions(null), createTicketPermissions(PERSONAS.END_USER));
  });

  test('the preview is offered exactly where M4 offers it on an open ticket (one rule for both screens)', () => {
    for (const name of NAMES) {
      const p = PERSONAS[name];
      assert.equal(createTicketPermissions(p).priorityPreview, ticketFieldPermissions(p, { status: 'OPEN' }).priorityPreview, name);
    }
  });
});

// ══ 2. The preview says what TKT-2 will store ═══════════════

describe('create form: the priority preview is the priority TKT-2 stores', () => {
  // BE:tickets.controller.ts:192-201: both set and a matrix row → that row; otherwise the body's priority, which mobile
  // never sends, so the validator's default MEDIUM (tickets.validator.ts:19).
  const serverStores = (impact, urgency) =>
    (impact && urgency && MATRIX.find((r) => r.impact === impact && r.urgency === urgency)?.priority) || 'MEDIUM';

  for (const impact of [null, ...TICKET_IMPACTS]) {
    for (const urgency of [null, ...TICKET_URGENCIES]) {
      test(`impact ${impact ?? 'not set'} × urgency ${urgency ?? 'not set'}`, () => {
        const preview = previewPriority(MATRIX, { impact, urgency });
        assert.equal(newTicketPriority(preview), serverStores(impact, urgency));
        const expectedKind = !impact || !urgency ? 'incomplete' : MATRIX.some((r) => r.impact === impact && r.urgency === urgency) ? 'computed' : 'noRow';
        assert.equal(preview.kind, expectedKind);
      });
    }
  }

  test('recomputed from the pair alone: changing either value changes the preview, as the web\'s effect does (:64-76)', () => {
    assert.deepEqual(previewPriority(MATRIX, { impact: 'HIGH', urgency: 'HIGH' }), { kind: 'computed', priority: 'URGENT' });
    assert.deepEqual(previewPriority(MATRIX, { impact: 'HIGH', urgency: 'LOW' }), { kind: 'computed', priority: 'MEDIUM' });
    assert.deepEqual(previewPriority(MATRIX, { impact: 'HIGH', urgency: null }), { kind: 'incomplete' });
  });
});

// ══ 3. TKT-2: what each role's create request may carry ═════

describe('TKT-2 body per role (G5 audit fix: L2_MANAGER carries no group, technician or requester)', () => {
  const FULL = {
    title: 'Printer offline', description: '<p>It is offline</p>', categoryId: 'cat-1', source: 'API',
    impact: 'HIGH', urgency: 'HIGH', teamId: 'team-1', assignedToId: 'user-x', requesterId: 'user-y',
    priority: 'URGENT', countryId: 'country-ke', tags: ['x'], level: 'L1', mode: 'PHONE',
  };
  const BASE = ['categoryId', 'description', 'source', 'title'];
  const ADMIN_AGENT = [...BASE, 'assignedToId', 'impact', 'requesterId', 'teamId', 'urgency'].sort();

  for (const [name, expected] of Object.entries({
    END_USER: BASE,
    AGENT: ADMIN_AGENT,
    TRIAGE_AGENT: ADMIN_AGENT,
    L2_MANAGER: [...BASE, 'impact', 'urgency'].sort(),
    ADMIN: ADMIN_AGENT,
  })) {
    test(`${name}: exactly these keys, never priority`, async () => {
      await createTicket(FULL, PERSONAS[name].role);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].method, 'post');
      assert.equal(sent[0].url, '/tickets');
      assert.deepEqual(Object.keys(sent[0].data).sort(), expected);
    });
  }

  test('a role the app does not know sends END_USER\'s keys (before G5 it got the staff set)', async () => {
    await createTicket(FULL, 'GUEST');
    assert.deepEqual(Object.keys(sent[0].data).sort(), BASE);
  });
});

// ══ 4. Wiring: one preview, gated by permissions.ts ═════════

describe('wiring: the create form reuses the G1 preview and takes its roles from permissions.ts', () => {
  const RAW_GATE = /\b(isStaff|isAgentOrAdmin|canSeePrivateNotes|canChangeStatus|isTriageAgent|isCountryLockedAgent|getAvailableTransitions|canAssignToSelf)\(/;
  const create = read('src/screens/tickets/CreateTicketScreen.tsx');

  test('CreateTicketScreen renders the G1 PriorityPreviewBox, imported from TicketPropertyEditors', () => {
    assert.match(create, /import \{ PriorityPreviewBox \} from '\.\/TicketPropertyEditors';/);
    assert.match(create, /<PriorityPreviewBox target=\{\{ kind: 'create' \}\}/);
    assert.match(create, /enabled=\{can\.priorityPreview\}/);
    assert.match(create, /usePriorityMatrix\(\{ enabled: can\.priorityPreview \}\)/);
  });

  test('no second implementation: no matrix lookup or priority rule in the create screen', () => {
    // The screen hands the matrix query to the box and never reads it, nor names the rule.
    assert.doesNotMatch(create, /previewPriority|newTicketPriority|classificationChanges|matrix\.data|\.impact\s*===|\.urgency\s*===/);
    assert.doesNotMatch(create, /priority:/, 'the create body never carries a priority');
  });

  test('exactly one PriorityPreviewBox and one previewPriority in src/', () => {
    const files = (function walk(dir) {
      return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
        const rel = path.join(dir, entry);
        if (statSync(path.join(REPO, rel)).isDirectory()) return walk(rel);
        return /\.tsx?$/.test(entry) ? [rel] : [];
      });
    })('src');
    const defining = (re) => files.filter((f) => re.test(read(f))).map((f) => f.replace(/\\/g, '/'));
    assert.deepEqual(defining(/function PriorityPreviewBox\b/), ['src/screens/tickets/TicketPropertyEditors.tsx']);
    assert.deepEqual(defining(/function previewPriority\b/), ['src/utils/ticket-properties.ts']);
  });

  test('CreateTicketScreen takes every role decision from createTicketPermissions()', () => {
    assert.match(create, /const can = createTicketPermissions\(user\);/);
    assert.doesNotMatch(create, RAW_GATE);
    assert.match(create, /requesterId: can\.raiseOnBehalf \?/);
    assert.match(create, /\{can\.raiseOnBehalf \? \(/);
    assert.match(create, /\{can\.routingNotice && categoryId \?/);
  });
});

// ══ 5. Audit pins: the brief's four questions ═══════════════

describe('audit: nothing on a closed or canceled ticket that the web locks (FE:TicketDetailPage.tsx:619-623)', () => {
  // The web's AGENT lock removes transitions, Pick up / Assign, Add Attachment, impact, urgency and category (:669,
  // :1268, :1740, :1757, :1953). It leaves country (:2199), resolution on RESOLVED/CLOSED (:1440), delete a file
  // (:1345), submit for approval (:697, :1585) and templates (:1046) open. No other role has a lock; CLOSED and
  // CANCELED have no transitions for anyone (:104-105).
  const offered = (p, status) => {
    const d = ticketDetailPermissions(p, { status, assignedToId: null });
    const f = ticketFieldPermissions(p, { status });
    return {
      transitions: d.transitions.length > 0,
      pickupOrAssign: d.moreActions.some((a) => a === 'pickup' || a === 'assign'),
      addFiles: d.addAttachments,
      deleteFiles: d.deleteAttachments,
      submitApproval: d.moreActions.includes('approval'),
      templates: composerPermissions(p.role).templates,
      impactUrgency: f.impact.mode === 'edit',
      category: f.category.mode === 'edit',
      country: f.country.mode === 'edit',
      resolution: f.resolution.mode === 'edit',
    };
  };
  const NONE = {
    transitions: false, pickupOrAssign: false, addFiles: false, deleteFiles: false, submitApproval: false,
    templates: false, impactUrgency: false, category: false, country: false, resolution: false,
  };
  const LOCKED_AGENT = { ...NONE, deleteFiles: true, submitApproval: true, templates: true, resolution: true };
  const CLOSED = {
    END_USER: { ...NONE, addFiles: true, templates: true },
    AGENT: LOCKED_AGENT,
    TRIAGE_AGENT: { ...LOCKED_AGENT, country: true },
    L2_MANAGER: { ...NONE, addFiles: true, deleteFiles: true, templates: true, impactUrgency: true, resolution: true },
    ADMIN: {
      ...NONE, pickupOrAssign: true, addFiles: true, deleteFiles: true, submitApproval: true, templates: true,
      impactUrgency: true, category: true, country: true, resolution: true,
    },
  };
  forEachPersona('CLOSED', CLOSED, (p) => offered(p, 'CLOSED'));
  // CANCELED: the same, except the resolution (the web edits it only while RESOLVED or CLOSED, :1440).
  forEachPersona(
    'CANCELED',
    Object.fromEntries(NAMES.map((n) => [n, { ...CLOSED[n], resolution: false }])),
    (p) => offered(p, 'CANCELED'),
  );
});

describe('audit: a role the app does not know (unreachable: sign-in and the stored session refuse one)', () => {
  test('gets no file delete and edits no ticket field (G5 hardening; isStaff alone said yes)', () => {
    assert.equal(canDeleteAttachments('GUEST'), false);
    for (const status of ['OPEN', 'RESOLVED', 'CLOSED']) {
      assert.deepEqual(ticketFieldPermissions({ role: 'GUEST', countryId: null }, { status }), ticketFieldPermissions(PERSONAS.END_USER, { status }));
    }
  });

  test('the four known roles keep their G3 delete rule: staff yes, END_USER no', () => {
    assert.deepEqual(
      ['END_USER', 'AGENT', 'L2_MANAGER', 'ADMIN'].map((r) => canDeleteAttachments(r)),
      [false, true, true, true],
    );
  });
});
