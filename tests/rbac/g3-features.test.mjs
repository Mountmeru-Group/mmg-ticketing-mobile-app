// Phase G3: reply templates, delete a file, submit a ticket for approval. The expected behaviour is the web portal's,
// read from its source: docs/G3-WEB-BEHAVIOUR.md (every statement there cites a file and line).
//
// For each of END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin who sees each feature and in which
// ticket states, written out in full so that a feature reaching one more role, or one more state, is a failing diff.
// Then the last checks before sending (refused on the device, nothing sent), the exact requests, the pure rules
// (template search, grouping and insertion) and the wiring (screens and hooks take these decisions from
// utils/permissions.ts and write only through the guarded hooks).
//
// What is real: the app's own permission, rule, cache and API modules, unchanged. What is faked: the network (axios's
// transport adapter records requests), as in the other rbac suites. Nothing calls UAT.
//
// iOS (docs/ios/00-PORT-MANIFEST.md §3.15): copied in iOS-3b with every expectation unchanged. One wiring line differs:
// "Submit for approval" is a root sheet on iOS, registered in RootNavigator.tsx, not in Android's TicketStack.tsx.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { QueryClient } from '@tanstack/react-query';
import { AxiosHeaders } from 'axios';

import { submitTicketForApproval } from '../../src/api/approvals.api.ts';
import { deleteAttachment } from '../../src/api/attachments.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { ApiClientError, describeActionWriteError } from '../../src/api/errors.ts';
import { listCannedResponses } from '../../src/api/lookups.api.ts';
import { removeAttachmentFromCache } from '../../src/hooks/cache.ts';
import { queryKeys } from '../../src/hooks/queryKeys.ts';
import { assertCanDeleteAttachment, assertCanSubmitForApproval } from '../../src/hooks/writeGuards.ts';
import { TICKET_STATUSES } from '../../src/types/index.ts';
import { joinNames, submitApprovalMessage, submitApprovalOutcome } from '../../src/utils/approvals.ts';
import { plainTextToHtml } from '../../src/utils/compose.ts';
import {
  canDeleteAttachments, canSubmitForApproval, canUseReplyTemplates, composerPermissions, ticketDetailPermissions,
} from '../../src/utils/permissions.ts';
import {
  GENERAL_CATEGORY, filterTemplates, groupTemplates, insertTemplate, templateHasImages, templatePreview, templateText,
} from '../../src/utils/templates.ts';
import { deleteAttachmentMessage } from '../../src/utils/writeCopy.ts';
import { NAMES, OTHER_USER, PERSONAS, forEachPersona } from './personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

/** For a persona, the statuses (all 11) in which `pick(ticketDetailPermissions(...))` is true. */
function statusesWhere(persona, pick) {
  return TICKET_STATUSES.filter((status) => pick(ticketDetailPermissions(persona, { status, assignedToId: OTHER_USER })));
}

// ── The network, faked ───────────────────────────────────────

const sent = [];
let reply = { status: 200, body: {} };
apiClient.defaults.adapter = async (config) => {
  sent.push({
    method: config.method,
    url: config.url,
    params: config.params,
    data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
  });
  const response = {
    status: reply.status,
    statusText: String(reply.status),
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(reply.body),
    config,
    request: {},
  };
  if (reply.status >= 400) {
    const error = new Error(`Request failed with status code ${reply.status}`);
    error.isAxiosError = true;
    error.response = { ...response, data: reply.body };
    error.config = config;
    throw error;
  }
  return response;
};
beforeEach(() => {
  sent.length = 0;
  reply = { status: 200, body: {} };
});

// ═════════════════════════════════════════════════════════════
// 1. Reply templates (canned responses) — docs/G3-WEB-BEHAVIOUR.md §1
// ═════════════════════════════════════════════════════════════

describe('templates: who gets them', () => {
  // The web's picker sits in the composer with no role check (FE:TicketDetailPage.tsx:1046), and LKP-7 is open to
  // every signed-in role (cannedResponses.router.ts:15): every persona, in every mode it has.
  forEachPersona(
    'composer: Templates button and the modes it is offered in',
    {
      END_USER: { templates: true, modes: ['reply'] },
      AGENT: { templates: true, modes: ['reply', 'replyAll', 'note'] },
      TRIAGE_AGENT: { templates: true, modes: ['reply', 'replyAll', 'note'] },
      L2_MANAGER: { templates: true, modes: ['reply', 'replyAll'] },
      ADMIN: { templates: true, modes: ['reply', 'replyAll', 'note'] },
    },
    (p) => {
      const can = composerPermissions(p.role);
      return { templates: can.templates, modes: can.modes };
    },
  );

  forEachPersona(
    'the LKP-7 query is allowed',
    { END_USER: true, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: true, ADMIN: true },
    (p) => canUseReplyTemplates(p.role),
  );

  test('a role the app does not know gets no templates', () => {
    for (const role of ['GUEST', '', undefined, null, 'admin']) assert.equal(canUseReplyTemplates(role), false, String(role));
  });

  test('the ticket state never matters: templates are a composer feature, not a ticket permission', () => {
    // Nothing on M4 gates them; the composer is open in every status for every role (web :841-883 has no lock).
    for (const name of NAMES) {
      for (const status of TICKET_STATUSES) {
        assert.ok(ticketDetailPermissions(PERSONAS[name], { status, assignedToId: null }).conversationActions.includes('reply'));
      }
    }
  });
});

describe('templates: the request', () => {
  test('LKP-7 is GET /canned-responses with no parameters (no search, no category: the web sends neither)', async () => {
    reply = { status: 200, body: { data: [{ id: 't1', title: 'Hello', body: '<p>Hi</p>', category: null }] } };
    const res = await listCannedResponses();
    assert.deepEqual(sent, [{ method: 'get', url: '/canned-responses', params: undefined, data: undefined }]);
    assert.deepEqual(res.data.map((t) => t.id), ['t1']);
  });
});

describe('templates: search, groups and order, as the web picker (CannedResponsePicker.tsx:31-42, :84)', () => {
  // As the server sends them: category asc (nulls last in Postgres), then title asc.
  const LIST = [
    { id: 'a', title: 'Acknowledge', body: '<p>We got your request.</p>', category: 'First Response' },
    { id: 'b', title: 'Password reset done', body: '<p>Your <b>password</b> was reset.</p>', category: 'Resolution' },
    { id: 'c', title: 'VPN steps', body: '<p>Install the VPN client.</p>', category: 'Resolution' },
    { id: 'd', title: 'Thanks', body: '<p>Thank you.</p>', category: null },
    { id: 'e', title: 'Escalated', body: '<p>Sent to L2.</p>', category: '' },
  ];
  const ids = (list) => list.map((t) => t.id);

  test('an empty search lists everything', () => {
    assert.deepEqual(ids(filterTemplates(LIST, '')), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(ids(filterTemplates(LIST, '   ')), ['a', 'b', 'c', 'd', 'e']);
  });

  test('search matches the title or the category, ignoring case, and never the body', () => {
    assert.deepEqual(ids(filterTemplates(LIST, 'vpn')), ['c']); // title
    assert.deepEqual(ids(filterTemplates(LIST, 'RESOLUTION')), ['b', 'c']); // category
    assert.deepEqual(ids(filterTemplates(LIST, 'install')), []); // body only: not matched, as on the web
    assert.deepEqual(ids(filterTemplates(LIST, 'general')), []); // "General" is a label, not a category
  });

  test('groups: by category, "General" for none or empty, sorted by name; the server order inside a group', () => {
    const groups = groupTemplates(LIST);
    assert.deepEqual(
      groups.map((g) => [g.category, ids(g.templates)]),
      [['First Response', ['a']], [GENERAL_CATEGORY, ['d', 'e']], ['Resolution', ['b', 'c']]],
    );
    assert.equal(GENERAL_CATEGORY, 'General');
  });

  test('no match: no groups (the sheet says "No templates found")', () => {
    assert.deepEqual(groupTemplates(filterTemplates(LIST, 'zzz')), []);
  });
});

describe('templates: inserting, as the web composer (FE:TicketDetailPage.tsx:1046-1051)', () => {
  test('a blank message is replaced by the template', () => {
    assert.equal(insertTemplate('', '<p>Hello</p>'), 'Hello');
    assert.equal(insertTemplate('  \n ', '<p>Hello</p>'), 'Hello');
  });

  test('otherwise the template is appended at the end, as a new paragraph (never at the cursor)', () => {
    assert.equal(insertTemplate('Hi Sam,', '<p>Your password was reset.</p>'), 'Hi Sam,\n\nYour password was reset.');
    assert.equal(insertTemplate('Line one\n\n', '<p>Two</p>'), 'Line one\n\nTwo');
    // Sent as two <p>, as the web's `prev + body` gives two paragraphs.
    assert.equal(plainTextToHtml(insertTemplate('Hi Sam,', '<p>Done.</p>')), '<p>Hi Sam,</p><p>Done.</p>');
  });

  test('inserting twice appends twice', () => {
    const once = insertTemplate('', '<p>A</p>');
    assert.equal(insertTemplate(once, '<p>B</p>'), 'A\n\nB');
  });

  test('an empty template leaves the message as it was', () => {
    assert.equal(insertTemplate('Keep me', '<p></p>'), 'Keep me');
  });

  test('no placeholders: the text goes in verbatim, as on the web', () => {
    assert.equal(insertTemplate('', '<p>Dear {{requester}}, ticket #[number]</p>'), 'Dear {{requester}}, ticket #[number]');
  });

  test('the HTML becomes the composer\'s plain text: paragraphs, breaks and bullets kept, tags gone', () => {
    assert.equal(templateText('<p>Hello <b>there</b></p><p>Line<br>two</p><ul><li>One</li><li>Two</li></ul>'), 'Hello there\n\nLine\ntwo\n\n• One\n• Two');
    assert.equal(templateText('&lt;not a tag&gt; &amp; more'), '<not a tag> & more');
  });

  test('images are left out (the app never sends inline images) and flagged so the composer can say so', () => {
    const html = '<p>See:</p><p><img src="data:image/png;base64,AAAA"></p><p>Thanks</p>';
    assert.equal(templateHasImages(html), true);
    assert.equal(templateHasImages('<p>No pictures</p>'), false);
    const text = templateText(html);
    assert.doesNotMatch(text, /image|base64|data:/);
    assert.equal(text, 'See:\n\nThanks');
  });

  test('the picker\'s preview line is the text on one line', () => {
    assert.equal(templatePreview('<p>Hello</p><p>World</p>'), 'Hello World');
  });
});

// ═════════════════════════════════════════════════════════════
// 2. Delete a file (attachment) — docs/G3-WEB-BEHAVIOUR.md §2
// ═════════════════════════════════════════════════════════════

describe('delete a file: who, and in which states', () => {
  // Web: `role !== 'END_USER'` (FE:TicketDetailPage.tsx:1345), not lock-gated (contrast "Add" at :1268); the server
  // refuses END_USER (attachments.controller.ts:149). So: staff, in all 11 statuses, CLOSED and CANCELED included.
  const ALL = [...TICKET_STATUSES];
  forEachPersona(
    'statuses in which the delete button is offered',
    { END_USER: [], AGENT: ALL, TRIAGE_AGENT: ALL, L2_MANAGER: ALL, ADMIN: ALL },
    (p) => statusesWhere(p, (can) => can.deleteAttachments),
  );

  forEachPersona(
    'canDeleteAttachments',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: true, ADMIN: true },
    (p) => canDeleteAttachments(p.role),
  );

  test('with no signed-in user there is no delete button', () => {
    assert.equal(ticketDetailPermissions(null, { status: 'OPEN', assignedToId: null }).deleteAttachments, false);
  });

  test('a locked AGENT cannot add files but can still delete them, as on the web', () => {
    for (const status of ['CLOSED', 'CANCELED']) {
      const can = ticketDetailPermissions(PERSONAS.AGENT, { status, assignedToId: null });
      assert.equal(can.locked, true);
      assert.equal(can.addAttachments, false);
      assert.equal(can.deleteAttachments, true);
    }
  });
});

describe('delete a file: the last check before sending', () => {
  test('the guard refuses END_USER only, in any status (it takes no status: there is no state rule)', () => {
    assert.throws(() => assertCanDeleteAttachment('END_USER'), /can't delete files/);
    for (const role of ['AGENT', 'L2_MANAGER', 'ADMIN']) assert.doesNotThrow(() => assertCanDeleteAttachment(role), role);
  });

  test('END_USER: refused, nothing sent', async () => {
    await assert.rejects(deleteAttachment('ticket-1', 'att-1', 'END_USER'), /can't delete files/);
    assert.equal(sent.length, 0);
  });

  for (const name of ['AGENT', 'TRIAGE_AGENT', 'L2_MANAGER', 'ADMIN']) {
    test(`${name}: one DELETE /tickets/:id/attachments/:attachmentId, no body`, async () => {
      reply = { status: 200, body: { message: 'Attachment deleted' } };
      const res = await deleteAttachment('ticket-1', 'att-1', PERSONAS[name].role);
      assert.deepEqual(sent, [{ method: 'delete', url: '/tickets/ticket-1/attachments/att-1', params: undefined, data: undefined }]);
      assert.deepEqual(res, { message: 'Attachment deleted' });
    });
  }

  test('ids are encoded as one path segment each', async () => {
    reply = { status: 200, body: { message: 'Attachment deleted' } };
    await deleteAttachment('t/1', 'a?b', 'ADMIN');
    assert.equal(sent[0].url, '/tickets/t%2F1/attachments/a%3Fb');
  });

  test('the server\'s message is shown on failure; a 403 says plainly the role can\'t do it', async () => {
    reply = { status: 404, body: { error: 'Attachment not found' } };
    const error = await deleteAttachment('ticket-1', 'gone', 'AGENT').catch((e) => e);
    assert.ok(error instanceof ApiClientError);
    assert.equal(describeActionWriteError('delete files from a ticket', error), 'Attachment not found');
    const forbidden = new ApiClientError('http', 403, { error: 'Forbidden' });
    assert.equal(describeActionWriteError('delete files from a ticket', forbidden), "Your role can't delete files from a ticket. Nothing was changed.");
  });
});

describe('delete a file: afterwards, the list and both counts drop (server-confirmed, not optimistic)', () => {
  const ticketId = 'ticket-1';
  function seeded() {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.tickets.attachments(ticketId), [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);
    qc.setQueryData(queryKeys.tickets.detail(ticketId), { id: ticketId, _count: { comments: 4, attachments: 3 } });
    return qc;
  }

  test('the file leaves the list and _count.attachments goes down by one', () => {
    const qc = seeded();
    removeAttachmentFromCache(qc, ticketId, 'a2');
    assert.deepEqual(qc.getQueryData(queryKeys.tickets.attachments(ticketId)).map((a) => a.id), ['a1', 'a3']);
    assert.deepEqual(qc.getQueryData(queryKeys.tickets.detail(ticketId))._count, { comments: 4, attachments: 2 });
  });

  test('a file that is not in the list changes nothing (no double count)', () => {
    const qc = seeded();
    removeAttachmentFromCache(qc, ticketId, 'a2');
    removeAttachmentFromCache(qc, ticketId, 'a2');
    removeAttachmentFromCache(qc, ticketId, 'other');
    assert.equal(qc.getQueryData(queryKeys.tickets.detail(ticketId))._count.attachments, 2);
  });

  test('the confirmation names the file and says it is permanent', () => {
    const message = deleteAttachmentMessage('invoice.pdf');
    assert.match(message, /invoice\.pdf/);
    assert.match(message, /permanently/);
    assert.match(message, /can't be undone/);
    assert.match(message, /requester/);
  });
});

// ═════════════════════════════════════════════════════════════
// 3. Submit a ticket for approval — docs/G3-WEB-BEHAVIOUR.md §3
// ═════════════════════════════════════════════════════════════

describe('submit for approval: who, and in which states', () => {
  // Server: `agentOrAdmin` (approvals.router.ts:8). The web also shows END_USER and L2_MANAGER the action, and they
  // always get 403 — hidden on mobile (WEB-VS-MOBILE-ROLES.md §5). No state rule on the web (:697, :1585) or the
  // server, and no AGENT lock: all 11 statuses.
  const ALL = [...TICKET_STATUSES];
  forEachPersona(
    'statuses in which More options offers "Submit for approval…"',
    { END_USER: [], AGENT: ALL, TRIAGE_AGENT: ALL, L2_MANAGER: [], ADMIN: ALL },
    (p) => statusesWhere(p, (can) => can.moreActions.includes('approval')),
  );

  forEachPersona(
    'canSubmitForApproval',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: false, ADMIN: true },
    (p) => canSubmitForApproval(p.role),
  );

  test('it is the last item in More options, and END_USER / L2_MANAGER never get it from any status', () => {
    for (const name of NAMES) {
      for (const status of TICKET_STATUSES) {
        const actions = ticketDetailPermissions(PERSONAS[name], { status, assignedToId: null }).moreActions;
        if (canSubmitForApproval(PERSONAS[name].role)) assert.equal(actions.at(-1), 'approval', `${name} ${status}`);
        else assert.ok(!actions.includes('approval'), `${name} ${status}`);
      }
    }
  });

  test('with no signed-in user it is not offered', () => {
    assert.ok(!ticketDetailPermissions(null, { status: 'OPEN', assignedToId: null }).moreActions.includes('approval'));
  });
});

describe('submit for approval: the last check before sending', () => {
  test('the guard refuses END_USER and L2_MANAGER, and an empty approver list', () => {
    assert.throws(() => assertCanSubmitForApproval('END_USER', ['u1']), /Only Admins and Technicians/);
    assert.throws(() => assertCanSubmitForApproval('L2_MANAGER', ['u1']), /Only Admins and Technicians/);
    assert.throws(() => assertCanSubmitForApproval('ADMIN', []), /at least one approver/);
    assert.doesNotThrow(() => assertCanSubmitForApproval('AGENT', ['u1']));
    assert.doesNotThrow(() => assertCanSubmitForApproval('ADMIN', ['u1', 'u2']));
  });

  for (const name of ['END_USER', 'L2_MANAGER']) {
    test(`${name}: refused, nothing sent`, async () => {
      await assert.rejects(submitTicketForApproval({ ticketId: 'ticket-1', approverIds: ['u1'] }, PERSONAS[name].role), /can't submit tickets for approval/);
      assert.equal(sent.length, 0);
    });
  }

  for (const name of ['AGENT', 'TRIAGE_AGENT', 'ADMIN']) {
    test(`${name}: one POST /approvals with exactly the web's body`, async () => {
      reply = { status: 201, body: [{ id: 'ap-1' }, { id: 'ap-2' }] };
      const res = await submitTicketForApproval(
        { ticketId: 'ticket-1', approverIds: ['u1', 'u2'], comments: '  Budget sign-off  ' },
        PERSONAS[name].role,
      );
      assert.deepEqual(sent, [{
        method: 'post',
        url: '/approvals',
        params: undefined,
        data: { entityType: 'ticket', entityId: 'ticket-1', approverIds: ['u1', 'u2'], comments: 'Budget sign-off' },
      }]);
      assert.deepEqual(res.map((a) => a.id), ['ap-1', 'ap-2']);
    });
  }

  test('blank comments are left out; a person chosen twice is sent once; no approver: refused, nothing sent', async () => {
    reply = { status: 201, body: [] };
    await submitTicketForApproval({ ticketId: 't', approverIds: ['u1', 'u1'], comments: '   ' }, 'AGENT');
    assert.deepEqual(sent[0].data, { entityType: 'ticket', entityId: 't', approverIds: ['u1'] });
    sent.length = 0;
    await assert.rejects(submitTicketForApproval({ ticketId: 't', approverIds: [] }, 'ADMIN'), /at least one approver/);
    assert.equal(sent.length, 0);
  });

  test('a 400 shows the server\'s message with its field; a 403 says plainly the role can\'t do it', async () => {
    reply = { status: 400, body: { error: 'Validation error', details: { approverIds: ['At least one approver required'] } } };
    const error = await submitTicketForApproval({ ticketId: 't', approverIds: ['u1'] }, 'ADMIN').catch((e) => e);
    assert.equal(describeActionWriteError('submit tickets for approval', error), 'Validation error — approverIds: At least one approver required');
    const forbidden = new ApiClientError('http', 403, { error: 'Forbidden: insufficient role' });
    assert.equal(describeActionWriteError('submit tickets for approval', forbidden), "Your role can't submit tickets for approval. Nothing was changed.");
  });
});

describe('submit for approval: what the person is told (approvals.controller.ts:16-88; 05 B.22, B.35)', () => {
  /** A ticket as TKT-3 returns it, with only the fields the confirmation reads. */
  const at = (status, slaHoldStartedAt = null) => ({ ticketNumber: 1, status, slaHoldStartedAt });

  test('the confirmation names the approvers and what the server does', () => {
    const message = submitApprovalMessage({ ticketNumber: 1234, status: 'IN_PROGRESS', slaHoldStartedAt: null }, ['Alice', 'Bob']);
    assert.match(message, /#1234 goes to Alice and Bob for approval/);
    assert.match(message, /Each is emailed .* and notified in the app/);
    assert.match(message, /Any approval still pending on this ticket is cancelled/);
    assert.match(message, /moves from In Progress to Pending with Management Review now\./);
    assert.match(message, /requester is not emailed/);
    assert.match(message, /SLA clock keeps running/);
    assert.match(message, /Approving or rejecting does not move the ticket again/);
  });

  test('it never repeats the web\'s "until all approvers respond"', () => {
    for (const status of TICKET_STATUSES) {
      assert.doesNotMatch(submitApprovalMessage(at(status), ['A']), /until all approvers respond|until .* respond/i, status);
    }
  });

  test('the SLA clock: paused afterwards only if it already was (hold status AND slaHoldStartedAt, BE:utils/sla.ts:15-19)', () => {
    const since = '2026-10-22T08:00:00.000Z';
    assert.match(submitApprovalMessage(at('ON_HOLD', since), ['A']), /SLA clock stays paused/);
    assert.match(submitApprovalMessage(at('PENDING_MGMT_REVIEW', since), ['A']), /SLA clock stays paused/);
    // Submitting never sets slaHoldStartedAt, so a ticket an earlier request moved to Pending keeps running (05 B.35).
    assert.match(submitApprovalMessage(at('PENDING_MGMT_REVIEW', null), ['A']), /SLA clock keeps running/);
    assert.match(submitApprovalMessage(at('ON_HOLD', null), ['A']), /SLA clock keeps running/);
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELED']) {
      assert.match(submitApprovalMessage(at(status, since), ['A']), /SLA clock keeps running/, status);
    }
  });

  test('from Pending with Management Review the status stays', () => {
    const same = submitApprovalMessage(at('PENDING_MGMT_REVIEW'), ['A']);
    assert.match(same, /stays Pending with Management Review/);
    assert.doesNotMatch(same, /moves from/);
  });

  test('on a Resolved, Closed or Canceled ticket it says the ticket is reopened', () => {
    for (const status of ['RESOLVED', 'CLOSED', 'CANCELED']) assert.match(submitApprovalMessage(at(status), ['A']), /which reopens it/, status);
    for (const status of ['OPEN', 'IN_PROGRESS', 'ON_HOLD']) assert.doesNotMatch(submitApprovalMessage(at(status), ['A']), /reopens/, status);
  });

  test('afterwards: the status the server returned, never an assumed one', () => {
    const seen = submitApprovalOutcome(['Alice'], 'PENDING_MGMT_REVIEW');
    assert.match(seen.join(' '), /The ticket is now Pending with Management Review\./);
    assert.match(seen.join(' '), /Approving or rejecting won't change the ticket's status/);
    // If the server had left it elsewhere, the app says so.
    assert.match(submitApprovalOutcome(['Alice'], 'IN_PROGRESS').join(' '), /The ticket is now In Progress\./);
    // If the re-read failed, the app does not claim a status.
    const unknown = submitApprovalOutcome(['Alice'], null).join(' ');
    assert.doesNotMatch(unknown, /The ticket is now/);
    assert.match(unknown, /couldn't re-read it/);
  });

  test('names are joined as a sentence', () => {
    assert.equal(joinNames(['A']), 'A');
    assert.equal(joinNames(['A', 'B']), 'A and B');
    assert.equal(joinNames(['A', 'B', 'C']), 'A, B and C');
  });
});

// ═════════════════════════════════════════════════════════════
// 4. Wiring
// ═════════════════════════════════════════════════════════════

describe('wiring: G3 decisions come from permissions.ts, writes go through guarded hooks', () => {
  test('templates load only when the sheet is open, never with the composer', () => {
    const sheet = read('src/components/TemplatePickerSheet.tsx');
    assert.match(sheet, /useCannedResponses\(\{ enabled: visible \}\)/);
    assert.doesNotMatch(sheet, /apiClient|listCannedResponses\(/);
    const composer = read('src/screens/tickets/ReplyComposerScreen.tsx');
    assert.doesNotMatch(composer, /useCannedResponses\(/);
    assert.match(composer, /can\.templates \?/);
  });

  test('the template query is gated by canUseReplyTemplates and sends no parameters', () => {
    const lookups = read('src/hooks/useLookups.ts');
    assert.match(lookups, /canUseReplyTemplates\(role\)/);
    assert.match(read('src/api/lookups.api.ts'), /apiClient\.get<\{ data: CannedResponse\[\] \}>\('\/canned-responses'\)/);
  });

  /** `first` is called, and before `then` (both must be present: a missing call would otherwise count as "before"). */
  function callsInOrder(src, first, then) {
    const a = src.indexOf(first);
    const b = src.indexOf(then);
    assert.ok(a >= 0, `${first} is not called`);
    assert.ok(b >= 0, `${then} is not called`);
    assert.ok(a < b, `${first} must come before ${then}`);
  }

  test('the delete hook runs the guard before the API call', () => {
    const hook = read('src/hooks/useDeleteAttachment.ts');
    callsInOrder(hook, 'assertCanDeleteAttachment(who)', 'deleteAttachment(ticketId');
    callsInOrder(hook, 'requireOnline()', 'deleteAttachment(ticketId');
  });

  test('the submit hook runs the guard before the API call', () => {
    const hook = read('src/hooks/useApprovals.ts');
    const body = hook.slice(hook.indexOf('export function useSubmitForApproval'));
    callsInOrder(body, 'assertCanSubmitForApproval(who, approverIds)', 'submitTicketForApproval(');
    callsInOrder(body, 'requireOnline()', 'submitTicketForApproval(');
  });

  test('the delete button and its confirmation are on M4, behind can.deleteAttachments', () => {
    const screen = read('src/screens/tickets/TicketDetailScreen.tsx');
    assert.match(screen, /onDelete=\{can\.deleteAttachments \?/);
    assert.match(screen, /confirmAction\(\{\s*title: `Delete \$\{name\}\?`/);
    assert.match(screen, /destructive: true/);
  });

  test('"Submit for approval" opens its screen from More options only; the route is registered', () => {
    const screen = read('src/screens/tickets/TicketDetailScreen.tsx');
    assert.match(screen, /action === 'approval'\) navigation\.navigate\('SubmitApproval'/);
    assert.match(read('src/navigation/RootNavigator.tsx'), /^\s*SubmitApproval: SubmitApprovalScreen,$/m);
  });

  test('the approval screen asks before sending and re-reads the status afterwards', () => {
    const screen = read('src/screens/tickets/SubmitApprovalScreen.tsx');
    callsInOrder(screen, 'confirmAction(', 'submit.mutateAsync(');
    callsInOrder(screen, 'submit.mutateAsync(', 'fetchCurrentStatus(ticketId)');
    assert.match(screen, /searchRoles=\{ANY_ROLE\}/);
    assert.match(screen, /const ANY_ROLE: readonly UserRole\[\] = \[\];/);
    // Code and on-screen text only (the header comment quotes the web's wording to say why it is not used).
    assert.doesNotMatch(screen.replace(/^\s*\/\/.*$/gm, ''), /until all approvers respond/);
  });

  test('no API client file calls GET /approvals (unscoped, 05 C.16)', () => {
    assert.doesNotMatch(read('src/api/approvals.api.ts'), /apiClient\.get[^(]*\('\/approvals'[,)]/);
  });
});
