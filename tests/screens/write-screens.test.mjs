// iOS-3b: the write path (create, reply, note, status and closure, assign, submit for approval, property editing,
// files, bulk), ported from Android c84d53a (docs/ios/00-PORT-MANIFEST.md §6 #7–#12, §4.11). Android's own suites pin
// every role answer and request (tests/rbac/role-gating, g3-features, g5-audit, technician-editor, property-editing);
// these add what the iOS port itself must hold:
//   1. the iOS action sheets list exactly what permissions.ts returns, in its order, with Cancel last;
//   2. destructive confirmations are iOS Alerts with the red, destructive style;
//   3. a success notice is the non-modal SuccessNotice, read out by VoiceOver: never an Alert or a toast;
//   4. each Android safety rule, carried over: status only through POST /status; no files on a private note (05 §C.26,
//      stricter than Android); no internal note for L2_MANAGER or END_USER (§C.27); no Assign for L2_MANAGER; bulk at
//      most 20, one at a time, Android's stop rule, a result per ticket; one sheet per ticket (getId); a non-JSON 200 is
//      an error; every role decision from permissions.ts;
//   5. the sheets: registered, keyboard handling, the new ticket opening in the tab underneath, the attachment sources.
// What is real: the app's permission, rule, guard, hook-function and API modules, unchanged. What is faked: the network
// (axios's transport adapter records requests, as in tests/rbac) and React Native's ActionSheetIOS, Alert and
// AccessibilityInfo (tests/support/stubs/react-native.mjs). Nothing calls UAT. Screens are .tsx files that need a phone,
// so their wiring is read as text.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';
import {
  __actionSheet, __alerts, __announcements, __clearAlerts, __pickActionSheet, __pressAlertButton,
} from 'react-native';

import { submitTicketForApproval } from '../../src/api/approvals.api.ts';
import { deleteAttachment, uploadAttachments } from '../../src/api/attachments.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { createComment } from '../../src/api/comments.api.ts';
import { ApiClientError } from '../../src/api/errors.ts';
import { assignTicket, changeTicketStatus, createTicket, updateTicket } from '../../src/api/tickets.api.ts';
import { sendAssignment } from '../../src/hooks/useAssignTicket.ts';
import { runBulkSequence, stopReasonFor } from '../../src/hooks/useBulkRunner.ts';
import { sendComment } from '../../src/hooks/usePostComment.ts';
import { wasRefusedOnDevice } from '../../src/hooks/writeGuards.ts';
import { RECORD_ID_PARAM, SHEET_ID_PARAM, getIdFor, tabUnderSheets } from '../../src/navigation/routes.ts';
import { colors } from '../../src/theme/index.ts';
import { TICKET_STATUSES } from '../../src/types/index.ts';
import {
  CANCEL_LABEL, MORE_ACTION_LABELS, chooseFromActionSheet, moreActionChoices, transitionChoices,
} from '../../src/utils/actionSheet.ts';
import { confirmAction, notify } from '../../src/utils/dialogs.ts';
import {
  bulkActions, composerPermissions, fieldEditProblem, inlineStatusTransitions, ticketDetailPermissions,
} from '../../src/utils/permissions.ts';
import { subscribeToSuccessNotices } from '../../src/utils/successNotice.ts';
import {
  BULK_ACTION_LIMIT, canChangeStatus, getAvailableTransitions, isResolvedLocked,
} from '../../src/utils/ticket-rules.ts';
import { NAMES, OTHER_USER, PERSONAS, forEachPersona } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const count = (src, text) => src.split(text).length - 1;

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry).split(path.sep).join('/');
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel] : [];
  });
}

/** Code without its comments, so a comment that names an API (to say what replaced it) is not a use of it. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const T = 'src/screens/tickets';
const CREATE = `${T}/CreateTicketScreen.tsx`;
const REPLY = `${T}/ReplyComposerScreen.tsx`;
const STATUS = `${T}/StatusClosureScreen.tsx`;
const ASSIGN = `${T}/AssignPickerScreen.tsx`;
const APPROVAL = `${T}/SubmitApprovalScreen.tsx`;
const DETAIL = `${T}/TicketDetailScreen.tsx`;
const LIST = `${T}/TicketListScreen.tsx`;
const EDITORS = `${T}/TicketPropertyEditors.tsx`;
const SHEET_SCREENS = [CREATE, REPLY, STATUS, ASSIGN, APPROVAL];

// ── The network, faked ───────────────────────────────────────

const JSON_TYPE = 'application/json; charset=utf-8';
const HTML = '<!DOCTYPE html><html><head><title>MMG Service Desk</title></head><body><div id="root"></div></body></html>';
const sent = [];
/** The server's answer to each request: { status, body, contentType? }. Default: 200 JSON from `answer`. */
let answer = () => ({ status: 200, body: {} });

apiClient.defaults.adapter = async (config) => {
  const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  sent.push({ method: config.method, url: config.url, data });
  const { status, body, contentType = JSON_TYPE } = answer(config);
  const response = {
    status,
    statusText: String(status),
    headers: AxiosHeaders.from({ 'content-type': contentType }),
    data: typeof body === 'string' ? body : JSON.stringify(body),
    config,
    request: {},
  };
  if (status >= 400) {
    const error = new Error(`Request failed with status code ${status}`);
    error.isAxiosError = true;
    error.response = { ...response, data: body };
    error.config = config;
    throw error;
  }
  return response;
};

/** A TicketDTO with the fields the drift check (dev builds) expects, so it has nothing to report. */
const TICKET = {
  id: 'ticket-1', ticketNumber: 1042, title: 'Printer offline', description: '<p>Second floor</p>', status: 'OPEN',
  priority: 'MEDIUM', impact: null, urgency: null, source: 'API', slaStatus: 'WITHIN_SLA', slaResponseDue: null,
  slaResolveDue: null, firstResponseAt: null, resolvedAt: null, slaHoldStartedAt: null, slaHoldMinutes: 0, resolution: null,
  closureCode: null, isFcr: null, closureComments: null, createdAt: '2026-10-28T08:00:00.000Z',
  updatedAt: '2026-10-28T08:00:00.000Z',
  requester: { id: 'user-end', displayName: 'End User', email: 'end@example.test', phone: null, department: null },
  assignedToId: null, assignedTo: null, teamId: 'team-desk', team: { id: 'team-desk', name: 'Service Desk' }, country: null,
  category: null, _count: { comments: 0, attachments: 0 }, tasks: [],
};
/** A comment as CMT-2 returns it (responseSpecs.ts COMMENT_CREATED_SPEC). */
const COMMENT = {
  id: 'comment-1', ticketId: 'ticket-1', authorId: 'user-agent', body: '<p>Hi</p>', type: 'PUBLIC', isEdited: false,
  toRecipients: [], ccRecipients: [], createdAt: '2026-10-28T08:00:00.000Z',
  author: { id: 'user-agent', displayName: 'Agent', email: 'agent@example.test' }, attachments: [],
};
const FILE = { uri: 'file:///var/mobile/photo.jpg', name: 'photo.jpg', type: 'image/jpeg', size: 1024 };

beforeEach(() => {
  sent.length = 0;
  answer = () => ({ status: 200, body: {} });
  __clearAlerts();
});

/** A refusal on the device: an ApiClientError the guard made, with nothing sent. */
const refusedOnDevice = (pattern) => (error) => {
  assert.ok(error instanceof ApiClientError, 'an ApiClientError');
  assert.ok(wasRefusedOnDevice(error), 'refused on the device');
  assert.match(error.body.error, pattern);
  return true;
};

// ═════════════════════════════════════════════════════════════
// 1. Action sheets list exactly what permissions.ts allows
// ═════════════════════════════════════════════════════════════

describe('action sheets: More options on a ticket (M4)', () => {
  const at = (p, status) => moreActionChoices(ticketDetailPermissions(p, { status, assignedToId: OTHER_USER }).moreActions).map((c) => c.label);
  const ALL = ['Pick up', 'Assign…', 'Close…', 'Submit for approval…'];
  // Written out in full, so an extra choice for a role is a failing diff (the role answers are tests/rbac/role-gating's).
  forEachPersona('OPEN ticket, assigned to someone else', { END_USER: [], AGENT: ALL, TRIAGE_AGENT: ALL, L2_MANAGER: ['Close…'], ADMIN: ALL }, (p) => at(p, 'OPEN'));
  forEachPersona(
    'CLOSED ticket (the AGENT lock)',
    {
      END_USER: [],
      AGENT: ['Submit for approval…'],
      TRIAGE_AGENT: ['Submit for approval…'],
      L2_MANAGER: [],
      ADMIN: ['Pick up', 'Assign…', 'Submit for approval…'],
    },
    (p) => at(p, 'CLOSED'),
  );

  test('every persona, status and assignee: the sheet is exactly can.moreActions, in its order, nothing added', () => {
    for (const name of NAMES) {
      const p = PERSONAS[name];
      for (const status of TICKET_STATUSES) {
        for (const assignedToId of [null, OTHER_USER, p.id]) {
          const { moreActions } = ticketDetailPermissions(p, { status, assignedToId });
          const choices = moreActionChoices(moreActions);
          assert.deepEqual(choices.map((c) => c.value), moreActions, `${name} ${status} ${assignedToId}`);
          assert.deepEqual(choices.map((c) => c.label), moreActions.map((a) => MORE_ACTION_LABELS[a]));
          assert.ok(choices.every((c) => !c.destructive), 'More options only opens sheets or confirms first');
        }
      }
    }
  });

  test('what iOS shows: the labels, then Cancel last; a tap resolves that action; Cancel resolves nothing', async () => {
    const { moreActions } = ticketDetailPermissions(PERSONAS.AGENT, { status: 'OPEN', assignedToId: OTHER_USER });
    const picked = chooseFromActionSheet({ title: 'More options', choices: moreActionChoices(moreActions) });
    assert.deepEqual(__actionSheet(), {
      title: 'More options',
      message: undefined,
      options: [...ALL, CANCEL_LABEL],
      cancelButtonIndex: 4,
      destructiveButtonIndex: undefined,
      tintColor: colors.primary,
    });
    __pickActionSheet(1);
    assert.equal(await picked, 'assign');
    const cancelled = chooseFromActionSheet({ title: 'More options', choices: moreActionChoices(moreActions) });
    __pickActionSheet(4);
    assert.equal(await cancelled, null);
  });

  test('TicketDetailScreen shows the sheet only when there is something in it, built from can.moreActions', () => {
    const src = read(DETAIL);
    assert.match(src, /headerRight: hasMoreActions\s*\?/);
    assert.match(src, /chooseFromActionSheet\(\{ title: 'More options', choices: moreActionChoices\(can\.moreActions\) \}\)/);
    assert.doesNotMatch(code(src), /MORE_ACTION_LABELS|label: 'Pick up'/, 'no second list of More options in the screen');
  });
});

describe("action sheets: a list card's status chip (M3)", () => {
  const chip = (p, status) =>
    transitionChoices(inlineStatusTransitions(p.role, status)).map((c) => (c.destructive ? `${c.label} (red)` : c.label));
  const FROM_IN_PROGRESS = [
    'On-hold', 'Pending with Management Review', 'Pending with Master Data Team', 'Pending with Partner',
    'Pending with User for Confirmation/Testing', 'Pending with User for more Information', 'Resolve', 'Close', 'Canceled (red)',
  ];
  forEachPersona(
    'OPEN',
    { END_USER: [], AGENT: ['In Progress', 'Close'], TRIAGE_AGENT: ['In Progress', 'Close'], L2_MANAGER: ['In Progress', 'Close'], ADMIN: ['In Progress', 'Close'] },
    (p) => chip(p, 'OPEN'),
  );
  forEachPersona(
    'IN_PROGRESS (Canceled is the one red choice)',
    { END_USER: [], AGENT: FROM_IN_PROGRESS, TRIAGE_AGENT: FROM_IN_PROGRESS, L2_MANAGER: FROM_IN_PROGRESS, ADMIN: FROM_IN_PROGRESS },
    (p) => chip(p, 'IN_PROGRESS'),
  );
  forEachPersona('CLOSED: nothing for anyone', { END_USER: [], AGENT: [], TRIAGE_AGENT: [], L2_MANAGER: [], ADMIN: [] }, (p) => chip(p, 'CLOSED'));

  test('every persona and status: exactly the transition map, in order; END_USER never gets a tappable chip', () => {
    for (const name of NAMES) {
      const p = PERSONAS[name];
      for (const status of TICKET_STATUSES) {
        const transitions = inlineStatusTransitions(p.role, status);
        const choices = transitionChoices(transitions);
        assert.deepEqual(choices.map((c) => c.value), transitions.map((t) => t.target), `${name} ${status}`);
        assert.deepEqual(choices.map((c) => c.label), transitions.map((t) => t.label));
        assert.deepEqual(choices.filter((c) => c.destructive).map((c) => c.value), transitions.some((t) => t.target === 'CANCELED') ? ['CANCELED'] : []);
        if (name === 'END_USER') assert.deepEqual(choices, []);
      }
    }
  });

  test('what iOS shows: Canceled marked destructive (red), Cancel last', async () => {
    const choices = transitionChoices(inlineStatusTransitions('AGENT', 'IN_PROGRESS'));
    const picked = chooseFromActionSheet({ title: 'Change status · #1042', choices });
    const shown = __actionSheet();
    assert.equal(shown.options.at(-1), CANCEL_LABEL);
    assert.equal(shown.cancelButtonIndex, choices.length);
    assert.deepEqual(shown.destructiveButtonIndex, [choices.findIndex((c) => c.value === 'CANCELED')]);
    __pickActionSheet(shown.options.indexOf('Resolve'));
    assert.equal(await picked, 'RESOLVED');
  });

  test('TicketListScreen builds the sheet from that ticket\'s inlineStatusTransitions(), and taps run single-flight', () => {
    const src = read(LIST);
    assert.ok(src.includes('const transitions = inlineStatusTransitions(role, t.status);'));
    assert.ok(src.includes('choices: transitionChoices(transitions),'));
    assert.ok(src.includes('const onStatusPress = useStableCallback((t: Ticket) => void once(() => pickStatus(t)));'));
    assert.doesNotMatch(code(src), /statusFor/, 'the bottom sheet the chip used on Android is gone');
  });
});

describe('action sheets: the short fixed lists', () => {
  test('impact and urgency (create form, impact/urgency editor) and the closure code are action sheets', () => {
    const create = code(read(CREATE));
    assert.match(create, /chooseFromActionSheet\(\{ title: 'Impact', choices: impactChoices \}\)/);
    assert.match(create, /chooseFromActionSheet\(\{ title: 'Urgency', choices: urgencyChoices \}\)/);
    assert.doesNotMatch(create, /title="Impact"|title="Urgency"/, 'no bottom sheet for impact or urgency');
    const editors = code(read(EDITORS));
    assert.match(editors, /chooseFromActionSheet\(\{ title: 'Impact', choices: impactChoices \}\)/);
    assert.match(editors, /chooseFromActionSheet\(\{ title: 'Urgency', choices: urgencyChoices \}\)/);
    // G1: the editor offers the four real values only (the web's "Not Set" saves nothing); create keeps "Not set".
    assert.match(editors, /TICKET_IMPACTS\.map\(\(v\) => \(\{ value: v, label: IMPACT_LABELS\[v\] \}\)\)/);
    assert.match(create, /\[\{ value: NOT_SET, label: 'Not set' \}, \.\.\.TICKET_IMPACTS\.map/);
    const status = code(read(STATUS));
    assert.match(status, /chooseFromActionSheet\(\{ title: 'Closure code', choices: CODE_CHOICES \}\)/);
    assert.match(status, /\.\.\.CLOSURE_CODE_OPTIONS\.map\(\(code\) => \(\{ value: code, label: code \}\)\)/);
  });

  test('long server lists stay scrollable sheets: categories, groups, people, approvers, countries', () => {
    assert.match(read(CREATE), /<OptionSheet[\s\S]*title="Category"/);
    assert.match(read(CREATE), /<PersonPickerSheet/);
    assert.match(read(ASSIGN), /<OptionSheet[\s\S]*title="Group"/);
    assert.match(read(APPROVAL), /<PersonPickerSheet[\s\S]*searchRoles=\{ANY_ROLE\}/);
    assert.match(read(EDITORS), /<OptionSheet[\s\S]*title="Country"/);
  });
});

// ═════════════════════════════════════════════════════════════
// 2. Destructive confirmations
// ═════════════════════════════════════════════════════════════

describe('destructive confirmations are iOS Alerts in the destructive style', () => {
  test('confirmAction: Cancel first (the cancel style), the action red when destructive; only the action confirms', async () => {
    const asked = confirmAction({ title: 'Delete invoice.pdf?', message: 'Permanent.', confirmLabel: 'Delete', destructive: true });
    const alert = __alerts().at(-1);
    assert.equal(alert.title, 'Delete invoice.pdf?');
    assert.deepEqual(alert.buttons.map((b) => [b.text, b.style]), [['Cancel', 'cancel'], ['Delete', 'destructive']]);
    __pressAlertButton('Delete');
    assert.equal(await asked, true);

    const cancelled = confirmAction({ title: 'Close 3 tickets?', message: '…', confirmLabel: 'Close tickets', destructive: true });
    __pressAlertButton('Cancel');
    assert.equal(await cancelled, false);

    const plain = confirmAction({ title: 'Assign to Bo?', message: '…', confirmLabel: 'Assign' });
    assert.deepEqual(__alerts().at(-1).buttons.map((b) => b.style), ['cancel', 'default']);
    __alerts().at(-1).options.onDismiss();
    assert.equal(await plain, false, 'dismissed: nothing happens');
  });

  test('every destructive write asks first, in the destructive style', () => {
    const SITES = {
      'delete a file (M4)': [DETAIL, /title: `Delete \$\{name\}\?`,[\s\S]{0,120}destructive: true/],
      'close or cancel with the closure form (M6)': [STATUS, /confirmLabel: closureSaveLabel\(closure\.label\),\s*destructive: closure\.target !== 'RESOLVED'/],
      'bulk close (M6)': [STATUS, /title: `Close \$\{eligible\.length\}[\s\S]{0,200}destructive: true/],
      'remove the assignment (M7)': [ASSIGN, /confirmLabel: confirm\.label, destructive: person === null/],
      'bulk assign (M7)': [ASSIGN, /title: `Assign \$\{eligible\.length\}[\s\S]{0,200}destructive: true/],
      'bulk pick up (M3)': [LIST, /title: `Pick up \$\{eligible\}[\s\S]{0,200}destructive: true/],
      'drop staged files to write a note (M5, §C.26)': [REPLY, /title: `Remove[\s\S]{0,400}destructive: true/],
    };
    for (const [site, [file, pattern]] of Object.entries(SITES)) assert.match(read(file), pattern, site);
  });
});

// ═════════════════════════════════════════════════════════════
// 3. Success notices
// ═════════════════════════════════════════════════════════════

describe('a success notice is the non-modal SuccessNotice, read out by VoiceOver', () => {
  test('notify(): every SuccessNoticeHost gets it, VoiceOver queues it, and no Alert opens', () => {
    const seen = [];
    const stop = subscribeToSuccessNotices((n) => seen.push(n));
    const before = __announcements().length;
    notify('Reply sent');
    notify('Reply sent');
    stop();
    notify('Not seen after unsubscribing');
    assert.deepEqual(seen.map((n) => n.message), ['Reply sent', 'Reply sent']);
    assert.notEqual(seen[0].id, seen[1].id, 'the same words twice still show twice');
    assert.deepEqual(__announcements().slice(before), [
      { announcement: 'Reply sent', options: { queue: true } },
      { announcement: 'Reply sent', options: { queue: true } },
      { announcement: 'Not seen after unsubscribing', options: { queue: true } },
    ]);
    assert.deepEqual(__alerts(), []);
  });

  test('the host: mounted once above the navigator, takes no touches, hidden from VoiceOver (it is announced instead)', () => {
    const root = read('src/navigation/RootNavigator.tsx');
    assert.equal(count(code(root), '<SuccessNoticeHost />'), 1);
    assert.match(root, /<\/NavigationContainer>\s*<SuccessNoticeHost \/>/);
    const host = read('src/components/SuccessNotice.tsx');
    assert.match(host, /pointerEvents="none"/);
    assert.match(host, /accessibilityElementsHidden/);
    assert.match(host, /}, visible\);/, 'it goes by itself');
    assert.equal(sourceFiles('src').filter((rel) => code(read(rel)).includes('<SuccessNoticeHost')).length, 1);
  });
});

// ═════════════════════════════════════════════════════════════
// 4. The Android safety rules, carried over
// ═════════════════════════════════════════════════════════════

describe('rule: a status changes ONLY through POST /tickets/:id/status, never PUT (05 B.1)', () => {
  test('changeTicketStatus is one POST to /status, carrying only the status and closure fields', async () => {
    answer = () => ({ status: 200, body: { ...TICKET, status: 'IN_PROGRESS' } });
    await changeTicketStatus('ticket-1', { status: 'IN_PROGRESS', teamId: 'team-x', assignedToId: 'user-x', categoryId: 'c' });
    assert.deepEqual(sent, [{ method: 'post', url: '/tickets/ticket-1/status', data: { status: 'IN_PROGRESS' } }]);
  });

  test('a PUT (TKT-4) never carries a status, for any role, and the write guard refuses one', async () => {
    answer = () => ({ status: 200, body: TICKET });
    for (const role of ['END_USER', 'AGENT', 'L2_MANAGER', 'ADMIN']) {
      sent.length = 0;
      await updateTicket('ticket-1', { status: 'CLOSED', title: 'New title' }, role);
      assert.equal(sent[0].method, 'put');
      assert.equal('status' in sent[0].data, false, role);
    }
    for (const p of Object.values(PERSONAS)) {
      for (const status of TICKET_STATUSES) assert.ok(fieldEditProblem(p, status, { status: 'CLOSED' }), `${p.id} ${status}`);
    }
  });

  test('only useChangeStatus and the bulk-close loop call TKT-6, the loop after both guards', () => {
    const callers = sourceFiles('src').filter((rel) => rel !== 'src/api/tickets.api.ts' && /(?<![\w.])changeTicketStatus\(/.test(code(read(rel))));
    assert.deepEqual(callers.sort(), ['src/hooks/useChangeStatus.ts', STATUS]);
    assert.match(read(STATUS), /assertStatusChange\(role, from, body\);[^\n]*\n\s*await assertStatusUnchanged\(id, from\);[^\n]*\n\s*await changeTicketStatus\(id, body\);/);
    const hook = read('src/hooks/useChangeStatus.ts');
    assert.ok(hook.indexOf('assertStatusChange(') < hook.indexOf('await changeTicketStatus('));
    assert.ok(hook.indexOf('await assertStatusUnchanged(') < hook.indexOf('await changeTicketStatus('));
  });

  test('the screens change status only through those: no TKT-4 call, no `status` key in an update', () => {
    for (const file of [...SHEET_SCREENS, DETAIL, LIST, EDITORS]) {
      const src = code(read(file));
      assert.doesNotMatch(src, /(?<![\w.])updateTicket\(|apiClient/, file);
    }
  });
});

describe('rule: a private note takes NO files (05 §C.26) — stricter than Android and the web', () => {
  for (const name of ['AGENT', 'TRIAGE_AGENT', 'ADMIN']) {
    test(`${name}: a note with files is refused on the device: no upload, no comment`, async () => {
      await assert.rejects(
        sendComment(PERSONAS[name].role, { ticketId: 'ticket-1', type: 'PRIVATE', text: 'Internal', files: [FILE] }),
        refusedOnDevice(/Files can't be attached to an internal note: the requester can see them/),
      );
      assert.deepEqual(sent, []);
    });
  }

  test('the API layer refuses a note with attachment ids too: nothing sent', async () => {
    await assert.rejects(
      createComment('ticket-1', { body: '<p>x</p>', type: 'PRIVATE', attachmentIds: ['att-1'] }, 'ADMIN'),
      (e) => e instanceof ApiClientError && /Files can't be attached to an internal note/.test(e.body.error),
    );
    assert.deepEqual(sent, []);
  });

  test('a note without files is one POST, PRIVATE, with no recipients and no attachment ids', async () => {
    answer = () => ({ status: 201, body: { ...COMMENT, type: 'PRIVATE' } });
    await sendComment('AGENT', { ticketId: 'ticket-1', type: 'PRIVATE', text: 'Checked the toner', to: ['x@example.test'] });
    assert.deepEqual(sent, [{
      method: 'post',
      url: '/tickets/ticket-1/comments',
      data: { body: '<p>Checked the toner</p>', type: 'PRIVATE', to: [], cc: [], attachmentIds: [] },
    }]);
  });

  test('a reply still takes files: uploaded first (ATT-2), then the reply carries their ids', async () => {
    answer = (config) =>
      config.url.endsWith('/attachments')
        ? { status: 201, body: [{ id: 'att-9', fileName: 'photo.jpg' }] }
        : { status: 201, body: COMMENT };
    await sendComment('AGENT', { ticketId: 'ticket-1', type: 'PUBLIC', text: 'See photo', files: [FILE] });
    assert.deepEqual(sent.map((r) => [r.method, r.url]), [['post', '/tickets/ticket-1/attachments'], ['post', '/tickets/ticket-1/comments']]);
    assert.deepEqual(sent[1].data.attachmentIds, ['att-9']);
  });

  test('the composer: no attachment picker in Note mode, files sent only with a reply, and switching to Note asks first', () => {
    const src = read(REPLY);
    assert.match(src, /\{isPublic \? \(\s*<>\s*<FieldLabel label="Attachments" \/>\s*<AttachmentPicker/);
    assert.equal(count(code(src), '<AttachmentPicker'), 1);
    assert.ok(src.includes('const sendFiles = isPublic ? files : [];'));
    assert.match(src, /files: sendFiles,/);
    assert.match(src, /if \(next === 'note' && files\.length > 0\) \{\s*const ok = await confirmAction\(\{[\s\S]{0,400}destructive: true,\s*\}\);\s*if \(!ok\) return;\s*setFiles\(\[\]\);/);
    assert.match(src, /onPress=\{\(\) => void selectMode\(m\)\}/);
    assert.doesNotMatch(code(src), /onPress=\{\(\) => setMode\(/, 'every mode change goes through selectMode');
    // The note's help no longer suggests its files stay internal (ROLE-MATRIX §8 item 1).
    assert.doesNotMatch(src, /Files are added to the ticket, not to this note/);
  });

  test('the hook checks before it uploads', () => {
    const hook = read('src/hooks/usePostComment.ts');
    assert.ok(hook.indexOf("if (type === 'PRIVATE' && files.length > 0)") < hook.indexOf('await uploadAttachments('));
    assert.match(hook, /mutationFn: \(variables: PostCommentVariables\): Promise<Comment> => sendComment\(role, variables\)/);
  });
});

describe('rule: no internal note for L2_MANAGER or END_USER (05 §C.27), not offered and refused if attempted', () => {
  forEachPersona(
    'the composer offers Note',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: false, ADMIN: true },
    (p) => composerPermissions(p.role).modes.includes('note'),
  );
  forEachPersona(
    'ticket detail offers Note, in any status',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: false, ADMIN: true },
    (p) => TICKET_STATUSES.some((status) => ticketDetailPermissions(p, { status, assignedToId: null }).conversationActions.includes('note')),
  );

  for (const name of ['L2_MANAGER', 'END_USER']) {
    test(`${name}: a note is refused on the device, even text only: nothing sent`, async () => {
      await assert.rejects(
        sendComment(PERSONAS[name].role, { ticketId: 'ticket-1', type: 'PRIVATE', text: 'Internal?' }),
        refusedOnDevice(/Only Admins and Technicians can add internal notes/),
      );
      await assert.rejects(createComment('ticket-1', { body: '<p>x</p>', type: 'PRIVATE' }, PERSONAS[name].role), /Only Admins and Technicians/);
      assert.deepEqual(sent, []);
    });
  }

  test('the composer renders only the role\'s modes, and a route asking for Note opens as a reply for those roles', () => {
    const src = read(REPLY);
    assert.ok(src.includes("const [mode, setMode] = useState<Mode>(modes.includes(route.params.mode) ? route.params.mode : 'reply');"));
    assert.ok(src.includes('const can = composerPermissions(role);'));
    assert.match(src, /\{modes\.map\(\(m\) => \(/);
  });
});

describe('rule: Assign is hidden for L2_MANAGER (the server answers 403)', () => {
  test('every status and assignee: L2_MANAGER\'s More options has no Pick up or Assign; bulk offers Close only', () => {
    for (const status of TICKET_STATUSES) {
      for (const assignedToId of [null, OTHER_USER, PERSONAS.L2_MANAGER.id]) {
        const labels = moreActionChoices(ticketDetailPermissions(PERSONAS.L2_MANAGER, { status, assignedToId }).moreActions).map((c) => c.label);
        assert.ok(!labels.includes('Pick up') && !labels.includes('Assign…'), `${status} ${assignedToId}`);
      }
    }
    assert.deepEqual(bulkActions(PERSONAS.L2_MANAGER), ['close']);
  });

  test('L2_MANAGER: the assignment is refused before any request, even the status read', async () => {
    await assert.rejects(
      sendAssignment('L2_MANAGER', { ticketId: 'ticket-1', status: 'OPEN', assignedToId: 'user-x' }),
      refusedOnDevice(/Only Admins and Technicians can assign tickets/),
    );
    assert.deepEqual(sent, []);
  });

  test('the assign sheet refuses the role before it loads anything', () => {
    const src = read(ASSIGN);
    const screen = src.slice(src.indexOf('export function AssignPickerScreen'), src.indexOf('// ── Group selector'));
    assert.match(screen, /if \(!canAssignTickets\(role\)\) \{[\s\S]*Not available for your role[\s\S]*\}\s*return props\.route\.params\.ticketIds\.length > 1/);
    assert.doesNotMatch(screen, /useTeams|useTicket\(/, 'no query runs for a refused role');
  });
});

describe("rule: bulk actions — at most 20, one at a time, Android's stop rule, a result per ticket (08 §4.2)", () => {
  const targets = (n, skip = []) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, label: `#${i + 1}`, ...(skip.includes(i + 1) ? { skipReason: 'Locked.' } : {}) }));

  test('the limit is 20; 21 tickets are refused before anything is sent', async () => {
    assert.equal(BULK_ACTION_LIMIT, 20);
    let calls = 0;
    await assert.rejects(runBulkSequence(targets(21), async () => { calls += 1; }, () => false), /limited to 20 tickets/);
    assert.equal(calls, 0);
    const twenty = await runBulkSequence(targets(20), async () => { calls += 1; }, () => false);
    assert.equal(calls, 20);
    assert.ok(twenty.outcomes.every((o) => o.state === 'done'));
  });

  test('one request at a time, in order; a skipped ticket is never sent', async () => {
    let inFlight = 0;
    let most = 0;
    const order = [];
    const result = await runBulkSequence(targets(6, [3]), async (id) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      order.push(id);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
    }, () => false);
    assert.equal(most, 1);
    assert.deepEqual(order, ['t1', 't2', 't4', 't5', 't6']);
    assert.deepEqual(result.outcomes.map((o) => o.state), ['done', 'done', 'skipped', 'done', 'done', 'done']);
  });

  test("Android's stop rule, unchanged: a ticket's own 400/403/404 fails that ticket and the batch goes on", async () => {
    const result = await runBulkSequence(targets(4), async (id) => {
      if (id === 't2') throw new ApiClientError('http', 403, { error: 'Forbidden' });
    }, () => false);
    assert.equal(result.stopReason, null);
    assert.deepEqual(result.outcomes.map((o) => o.state), ['done', 'failed', 'done', 'done']);
    assert.equal(result.sent, 4);
  });

  test("…and a 401, 429, 5xx, timeout or network failure stops it; the rest are listed as not sent", async () => {
    for (const [error, reason] of [
      [new ApiClientError('http', 401, { error: 'Unauthorized' }), /session ended/],
      [new ApiClientError('not-json', 429, { error: 'Too many requests' }), /429/],
      [new ApiClientError('http', 500, { error: 'Internal server error' }), /server reported an error/],
      [new ApiClientError('timeout', null, { error: 'Request timed out' }), /couldn't be reached/],
      [new ApiClientError('network', null, { error: 'Network error' }), /couldn't be reached/],
    ]) {
      const result = await runBulkSequence(targets(4), async (id) => {
        if (id === 't2') throw error;
      }, () => false);
      assert.match(result.stopReason, reason);
      assert.deepEqual(result.outcomes.map((o) => o.state), ['done', 'failed', 'not-run', 'not-run']);
      assert.ok(result.outcomes.slice(2).every((o) => o.message.startsWith('Not sent:')));
      assert.equal(result.sent, 2);
    }
    assert.equal(stopReasonFor(new ApiClientError('http', 404, { error: 'Not found' })), null);
  });

  test('Stop lets the request in flight finish, then sends nothing more; offline sends nothing more', async () => {
    let stop = false;
    const stopped = await runBulkSequence(targets(4), async (id) => { if (id === 't2') stop = true; }, () => stop);
    assert.deepEqual(stopped.outcomes.map((o) => o.state), ['done', 'done', 'not-run', 'not-run']);
    assert.equal(stopped.stopReason, 'Stopped by you.');
    const offline = await runBulkSequence(targets(2), async () => undefined, () => false, undefined, () => true);
    assert.deepEqual(offline.outcomes.map((o) => o.state), ['not-run', 'not-run']);
  });

  test('the screens: the selection stops at 20, and the bulk sheets refuse more and guard every ticket', () => {
    assert.match(read(LIST), /selected\.size >= BULK_ACTION_LIMIT\) \{\s*Alert\.alert\('Selection limit'/);
    for (const file of [STATUS, ASSIGN]) {
      assert.ok(read(file).includes('route.params.ticketIds.slice(0, BULK_ACTION_LIMIT)'), file);
      assert.ok(read(file).includes('route.params.ticketIds.length > BULK_ACTION_LIMIT'), file);
    }
    // Assign and pick up: the guard on the status on screen, then on the server's (technician-editor pins the loops).
    assert.match(read(LIST), /assertAssignment\(role, t\.status, me\.id\);[^\n]*\n\s*assertAssignment\(role, await fetchCurrentStatus\(id\), me\.id\);/);
  });
});

describe('rule: one sheet per ticket — typed text and staged files never carry from ticket A to ticket B', () => {
  test('the write sheets and the ticket screen have getId by ticket (tests/navigation/get-id runs the router)', () => {
    assert.equal(RECORD_ID_PARAM.TicketDetail, 'ticketId'); // M4's staged uploads and open property editor
    // iOS-3c: the task editor joins them, one sheet per task (get-id.test.mjs).
    assert.deepEqual(Object.keys(SHEET_ID_PARAM).sort(), ['AssignPicker', 'ReplyComposer', 'StatusClosure', 'SubmitApproval', 'TaskEditor']);
    assert.equal(getIdFor('ReplyComposer')({ params: { ticketId: 'A', mode: 'reply' } }), 'A');
    assert.notEqual(getIdFor('ReplyComposer')({ params: { ticketId: 'B', mode: 'reply' } }), 'A');
    assert.equal(getIdFor('StatusClosure')({ params: { ticketIds: ['A', 'B'] } }), 'A,B');
  });

  test('typed text and staged files live in the sheet or screen that holds them, nowhere shared', () => {
    for (const file of [CREATE, REPLY, STATUS, DETAIL]) {
      assert.match(read(file), /useState<UploadFile\[\]>\(\[\]\)/, file);
    }
    for (const file of sourceFiles('src/store')) assert.doesNotMatch(read(file), /UploadFile|draft/i, file);
  });
});

describe('rule: a non-JSON 200 is an error (the SPA fallback, 05 B.8), on every write', () => {
  const htmlPage = () => ({ status: 200, body: HTML, contentType: 'text/html; charset=utf-8' });
  const WRITES = {
    'TKT-2 create': () => createTicket({ title: 'x', description: '<p>x</p>', categoryId: 'c', source: 'API' }, 'END_USER'),
    'TKT-4 update': () => updateTicket('ticket-1', { title: 'x' }, 'ADMIN'),
    'TKT-5 assign': () => assignTicket('ticket-1', { assignedToId: 'user-x' }),
    'TKT-6 status': () => changeTicketStatus('ticket-1', { status: 'IN_PROGRESS' }),
    'CMT-2 reply': () => createComment('ticket-1', { body: '<p>x</p>', type: 'PUBLIC' }, 'AGENT'),
    'ATT-2 upload': () => uploadAttachments('ticket-1', [FILE]),
    'ATT-5 delete': () => deleteAttachment('ticket-1', 'att-1', 'ADMIN'),
    'APR-4 submit for approval': () => submitTicketForApproval({ ticketId: 'ticket-1', approverIds: ['u1'] }, 'AGENT'),
  };
  for (const [write, call] of Object.entries(WRITES)) {
    test(`${write}: a 200 text/html page is rejected, not taken as success`, async () => {
      answer = htmlPage;
      await assert.rejects(call(), (e) => e instanceof ApiClientError && e.kind === 'not-json' && e.status === 200);
    });
  }

  test('an HTML page labelled JSON is rejected too', async () => {
    answer = () => ({ status: 200, body: HTML, contentType: JSON_TYPE });
    await assert.rejects(changeTicketStatus('ticket-1', { status: 'IN_PROGRESS' }), (e) => e.kind === 'not-json');
  });

  test('through the guarded hooks: an HTML status read stops the assignment (no POST); an HTML reply fails the send', async () => {
    answer = htmlPage;
    await assert.rejects(sendAssignment('AGENT', { ticketId: 'ticket-1', status: 'OPEN', assignedToId: 'user-x' }), (e) => e.kind === 'not-json');
    assert.deepEqual(sent.map((r) => [r.method, r.url]), [['get', '/tickets/ticket-1']]);
    await assert.rejects(sendComment('AGENT', { ticketId: 'ticket-1', type: 'PUBLIC', text: 'Hi' }), (e) => e.kind === 'not-json');
  });

  test('the sheets say "done" only after the write resolved: notify() comes after the awaited mutation', () => {
    for (const file of SHEET_SCREENS) {
      const src = code(read(file));
      const firstWrite = src.indexOf('.mutateAsync(');
      const firstNotice = src.indexOf('notify(');
      assert.ok(firstWrite > 0 && firstNotice > firstWrite, file);
      assert.match(src, /await \w+\.mutateAsync\(/, file);
    }
  });
});

describe('rule: every role decision on the write path comes from permissions.ts', () => {
  test("StatusClosure's gates through permissions.ts are exactly Android's ticket-rules answers, for every role and status", () => {
    const viewers = [...Object.values(PERSONAS), { id: 'user-guest', role: 'GUEST', countryId: null }];
    for (const v of viewers) {
      for (const status of TICKET_STATUSES) {
        const can = ticketDetailPermissions(v, { status, assignedToId: null });
        assert.equal(can.statusBar, canChangeStatus(v.role), `${v.role} ${status}`);
        assert.deepEqual(can.transitions, getAvailableTransitions(v.role, status), `${v.role} ${status}`);
        assert.equal(can.locked, isResolvedLocked(v.role, status), `${v.role} ${status}`);
      }
      assert.equal(bulkActions(v).includes('close'), canChangeStatus(v.role), v.role);
    }
  });

  // iOS-5 mutation check, B8: the answer above was pinned, but not that the bulk sheet applies it. Removing the check
  // left all tests green (Android had no such test either); the device guard still refused each ticket.
  test("the bulk Close sheet refuses a role that bulkActions() gives no Close (iOS-5, mutation B8)", () => {
    const src = read('src/screens/tickets/StatusClosureScreen.tsx');
    assert.match(src, /const invalidRequest =\s*route\.params\.target !== 'CLOSED' \|\| !bulkActions\(user\)\.includes\('close'\) \|\|/);
  });

  test('the write sheets name no role and call no low-level role gate (tests/rbac/role-gating has their rows)', () => {
    const rawGate = /\b(isStaff|isAgentOrAdmin|canSeePrivateNotes|canChangeStatus|isTriageAgent|isCountryLockedAgent|getAvailableTransitions)\(/;
    for (const file of SHEET_SCREENS) {
      const src = read(file);
      assert.doesNotMatch(src, /['"`](ADMIN|AGENT|END_USER|L2_MANAGER)['"`]/, file);
      assert.doesNotMatch(src, rawGate, file);
      assert.doesNotMatch(src, /\?\? 'END_USER'/, `${file}: navRole() instead`);
    }
  });
});

// ═════════════════════════════════════════════════════════════
// 5. The sheets on iOS
// ═════════════════════════════════════════════════════════════

describe('the write sheets on iOS', () => {
  test('each is a root sheet, typed as one, titled in the native bar, with no drawn header', () => {
    for (const file of SHEET_SCREENS) {
      const src = read(file);
      assert.match(src, /SheetScreenProps<'(CreateTicket|ReplyComposer|StatusClosure|AssignPicker|SubmitApproval)'>/, file);
      assert.doesNotMatch(code(src), /\bScreenHeader\b|TicketStackScreenProps/, file);
      if (file !== CREATE) assert.match(src, /navigation\.setOptions\(\{ title \}\)/, file); // Create's title is routes.ts's
    }
  });

  test('the forms lift above the keyboard, and a tap outside an input or a drag down puts it away', () => {
    for (const file of [CREATE, REPLY, STATUS, APPROVAL]) {
      const src = code(read(file));
      assert.doesNotMatch(src, /KeyboardAvoidingView/, `${file}: through SheetKeyboardView`);
      assert.ok(count(src, '<SheetKeyboardView>') >= 1, file);
      assert.equal(count(src, 'keyboardShouldPersistTaps="handled"'), count(src, 'keyboardDismissMode="interactive"'), file);
    }
    const kav = read('src/components/SheetKeyboardView.tsx');
    assert.match(kav, /<KeyboardAvoidingView behavior="padding" keyboardVerticalOffset=\{offset\}/);
    assert.match(kav, /measureInWindow\(\(_x, y\) => setOffset\(Math\.max\(0, y\)\)\)/);
    const detail = read(DETAIL);
    assert.match(detail, /automaticallyAdjustKeyboardInsets\s*\n\s*keyboardDismissMode="interactive"/);
  });

  test('leaving with unsent input asks first, and swipe-down is caught too (native-stack: preventNativeDismiss)', () => {
    for (const file of [CREATE, REPLY, STATUS, APPROVAL]) assert.match(read(file), /useDiscardGuard\(\{/, file);
    const nativeStack = readFileSync(path.join(REPO, 'node_modules/@react-navigation/native-stack/src/views/NativeStackView.native.tsx'), 'utf8');
    assert.match(nativeStack, /preventNativeDismiss=\{isRemovePrevented\}/);
  });

  test('create: on success the sheet closes and the new ticket opens in the tab underneath', () => {
    const src = read(CREATE);
    assert.ok(src.includes('const tab = tabUnderSheets(navigation.getState());'));
    assert.match(src, /leave\(\(\) => navigation\.popTo\('App', \{ screen: tab, params: ticketDetail \}\)\)/);
    assert.match(src, /const ticketDetail = \{ screen: 'TicketDetail', params: \{ ticketId: result\.ticket\.id \}, initial: false \} as const;/);
    assert.doesNotMatch(code(src), /navigation\.replace\(/, "Android's replace() can't cross a sheet");
    const state = (tab) => ({
      index: 1,
      routes: [
        { name: 'App', state: { index: ['HomeTab', 'TicketsTab', 'ApprovalsTab', 'AlertsTab', 'MoreTab'].indexOf(tab), routes: ['HomeTab', 'TicketsTab', 'ApprovalsTab', 'AlertsTab', 'MoreTab'].map((name) => ({ name })) } },
        { name: 'CreateTicket' },
      ],
    });
    assert.equal(tabUnderSheets(state('AlertsTab')), 'AlertsTab');
    assert.equal(tabUnderSheets(state('MoreTab')), 'MoreTab');
    assert.equal(tabUnderSheets({ index: 1, routes: [{ name: 'App' }, { name: 'CreateTicket' }] }), 'HomeTab');
  });

  test('attachments: one "Add attachment" button, an action sheet of sources, iOS pickers, Settings on a refusal', () => {
    const src = read('src/components/AttachmentPicker.tsx');
    assert.match(src, /chooseFromActionSheet\(\{ title: 'Add attachment', choices: ATTACHMENT_SOURCES \}\)/);
    assert.match(src, /\{ value: 'camera', label: 'Take Photo' \},\s*\{ value: 'photos', label: 'Photo Library' \},\s*\{ value: 'files', label: 'Choose File' \},/);
    assert.match(src, /DocumentPicker\.getDocumentAsync\(\{ multiple: true, copyToCacheDirectory: true \}\)/);
    assert.match(src, /\{ text: 'Open Settings', onPress: \(\) => void Linking\.openSettings\(\) \}/);
    assert.match(src, /validateUploadFiles\(\[\.\.\.files, \.\.\.next\]\)/, 'still checked on the device before staging');
  });

  test('"Add task" (staff) opens TaskEditor, the real task editor since iOS-3c', () => {
    assert.match(read(DETAIL), /tab === 'tasks' && can\.editTasks \? \([\s\S]{0,300}navigation\.navigate\('TaskEditor', \{ ticketId \}\)/);
    const root = read('src/navigation/RootNavigator.tsx');
    assert.match(root.slice(root.indexOf('const SHEETS'), root.indexOf('};', root.indexOf('const SHEETS'))), /^\s+TaskEditor: TaskEditorScreen,$/m);
  });

  test('no date field on the write sheets, and no Android-only control anywhere on the write path', () => {
    for (const file of [...SHEET_SCREENS, DETAIL, LIST, EDITORS, 'src/components/AttachmentPicker.tsx', 'src/utils/dialogs.ts']) {
      const src = code(read(file));
      assert.doesNotMatch(src, /DateTimePicker|DatePickerSheet/, `${file}: no date field in iOS-3b`);
      assert.doesNotMatch(src, /\bToastAndroid\b|\bBackHandler\b|\bthumbColor=|statusBarTranslucent|behavior="height"/, file);
    }
  });
});
