// A5 (iOS-5f, ANDROID-DELTA.md §10): Android's haptics (e85c602, utils/haptics.ts performAndroidHapticsAsync) are not
// ported: they are Android's system effects. iOS has its own since iOS-4 (UI-STANDARDS.md §iOS-A.6): success, warning,
// error and selection, each with one meaning. This file checks that every event Android buzzes on is felt on iOS too.
//
// The Android list is written out from Android dev d8626bc (`git grep "haptic('" d8626bc -- src`), 22 calls:
//   success  ApprovalDetail (a decision), ServiceRequestForm, AssignPicker, CreateTicket, ReplyComposer, StatusClosure
//            (two), SubmitApproval, TicketDetail (status, pick up), TicketList (status), TicketPropertyEditors
//   error    dialogs.ts reportWriteError / reportActionWriteError / reportFieldWriteError; the inline form errors of
//            ServiceRequestForm, CreateTicket (and its failed attachments), ReplyComposer, StatusClosure, SubmitApproval
//   select   TicketList, the long-press that selects
// On iOS: every success but one goes through notify(), which plays the success haptic; ApprovalDetail plays it itself.
// The three reporters play the error haptic. The five inline form errors had none on iOS until iOS-5f, which added
// it (the gap). The long-press selects through toggle(), which plays the selection haptic. One iOS difference, kept
// from iOS-4: a ticket created with failed attachments plays the WARNING haptic (iOS-4: a partial success), where
// Android plays its error effect.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { __clearHaptics, __haptics } from 'expo-haptics';

import { notify, reportActionWriteError, reportFieldWriteError, reportWriteError } from '../../src/utils/dialogs.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Android's success sites, by file: the iOS file plays success through notify() (or, for a decision, itself). */
const SUCCESS = {
  'src/screens/approvals/ApprovalDetailScreen.tsx': /hapticOutcome\('success'\)/,
  'src/screens/catalog/ServiceRequestFormScreen.tsx': /notify\(submittedMessage\(item\)\)/,
  'src/screens/tickets/AssignPickerScreen.tsx': /notify\(confirm\.done \?\? assignmentDoneMessage\(/,
  'src/screens/tickets/CreateTicketScreen.tsx': /\bnotify\(/,
  'src/screens/tickets/ReplyComposerScreen.tsx': /notify\(isPublic \? 'Reply sent' : 'Note saved'\)/,
  'src/screens/tickets/StatusClosureScreen.tsx': /notify\('Status updated'\)[\s\S]*notify\('Status updated'\)/,
  'src/screens/tickets/SubmitApprovalScreen.tsx': /notify\('Approval request submitted'\)/,
  'src/screens/tickets/TicketDetailScreen.tsx': /notify\('Status updated'\)[\s\S]*notify\('Assigned to you'\)/,
  'src/screens/tickets/TicketListScreen.tsx': /notify\('Status updated'\)/,
  'src/screens/tickets/TicketPropertyEditors.tsx': /notify\(await write\(ticket\)\)/,
};

/** Android's inline form errors (haptic('error') before setError): iOS plays the error haptic there too (iOS-5f). */
const INLINE_ERRORS = {
  'src/screens/catalog/ServiceRequestFormScreen.tsx': "setError(describeWriteError(e) || 'Failed to submit request')",
  'src/screens/tickets/CreateTicketScreen.tsx': "setError(describeWriteError(e) || 'Failed to create ticket')",
  'src/screens/tickets/ReplyComposerScreen.tsx': 'setError(describeWriteError(e))',
  'src/screens/tickets/StatusClosureScreen.tsx': 'setError(describeWriteError(e))',
  'src/screens/tickets/SubmitApprovalScreen.tsx': "setError(describeActionWriteError('submit tickets for approval', e))",
};

beforeEach(() => __clearHaptics());

describe('A5: every Android haptic event has an iOS haptic', () => {
  test('success: notify() plays the success haptic (iOS-4), once', () => {
    notify('Status updated');
    assert.deepEqual(__haptics(), ['success']);
  });

  test('error: the three write-error reporters play the error haptic (Android: haptic(\'error\') in each)', () => {
    const failure = Object.assign(new Error('Internal server error'), { kind: 'http', status: 500, body: { error: 'Internal server error' } });
    reportWriteError('Failed', failure);
    reportActionWriteError('Failed', 'delete files from a ticket', failure);
    reportFieldWriteError('Failed', 'impact', failure);
    assert.deepEqual(__haptics(), ['error', 'error', 'error']);
  });

  for (const [rel, pattern] of Object.entries(SUCCESS)) {
    test(`success: ${path.basename(rel)} plays it where Android does`, () => {
      assert.match(code(rel), pattern);
    });
  }

  for (const [rel, call] of Object.entries(INLINE_ERRORS)) {
    test(`error: ${path.basename(rel)}'s inline form error plays the error haptic first (the iOS-5f gap)`, () => {
      const src = code(rel);
      const at = src.indexOf(call);
      assert.ok(at > 0, call);
      const before = src.slice(Math.max(0, at - 160), at);
      assert.match(before, /if \(!isSessionEndedError\(e\)\) \{\s*hapticOutcome\('error'\);\s*$/);
      assert.match(src, /import \{[^}]*\bhapticOutcome\b[^}]*\} from '@\/utils\/haptics';/);
    });
  }

  test('error, kept as iOS-4: a ticket created with failed attachments plays the warning haptic (a partial success)', () => {
    assert.match(code('src/screens/tickets/CreateTicketScreen.tsx'), /hapticOutcome\('warning'\)/);
  });

  test('select: the long-press that selects a ticket plays the selection haptic, through toggle()', () => {
    const list = code('src/screens/tickets/TicketListScreen.tsx');
    assert.match(list, /onLongPress=\{canSelect \? toggle : undefined\}/);
    assert.match(list, /setSelected\(new Set\(selected\)\.add\(ticketId\)\);\s*hapticSelection\(\);/);
  });

  test('no Android haptic API on iOS: no performAndroidHapticsAsync, no haptic(\'…\') helper', () => {
    for (const rel of [...Object.keys(SUCCESS), ...Object.keys(INLINE_ERRORS), 'src/utils/dialogs.ts', 'src/utils/haptics.ts']) {
      assert.doesNotMatch(code(rel), /performAndroidHapticsAsync|AndroidHaptics|\bhaptic\('/, rel);
    }
  });
});
