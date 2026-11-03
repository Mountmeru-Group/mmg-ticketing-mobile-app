// Haptics (2026-11-03, src/utils/haptics.ts): a confirm on a successful status change, assignment or submit; an error
// pattern on a failed save; a light tick on the long-press that selects. They must respect the phone's own setting.
//
// What runs for real: src/utils/haptics.ts, against an in-memory expo-haptics (tests/support/stubs/expo-haptics.mjs).
// How the OS setting is respected (read in expo-haptics 57's Android code, HapticsModule.kt): performAndroidHapticsAsync
// is View.performHapticFeedback() without FLAG_IGNORE_GLOBAL_SETTING, which Android drops when touch feedback is off.
// impactAsync, notificationAsync and selectionAsync drive the Vibrator, which that setting does not govern: the app must
// never call them. The wiring in the screens is checked in source.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { __calls, __reset } from '../support/stubs/expo-haptics.mjs';
import { HAPTIC_EFFECTS, haptic } from '../../src/utils/haptics.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const settle = () => new Promise((resolve) => setImmediate(resolve));

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((e) => {
    const rel = path.join(dir, e);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e) ? [rel.replace(/\\/g, '/')] : [];
  });
}

describe('haptic(): one system effect per event, through the OS-governed API only', () => {
  beforeEach(() => __reset());

  test('success → CONFIRM, error → REJECT, select → LONG_PRESS', async () => {
    haptic('success');
    haptic('error');
    haptic('select');
    await settle();
    assert.deepEqual(__calls(), [
      ['performAndroidHapticsAsync', 'confirm'],
      ['performAndroidHapticsAsync', 'reject'],
      ['performAndroidHapticsAsync', 'long-press'],
    ]);
  });

  test('Android 10 and older (no CONFIRM or REJECT): one fallback effect each, still through the same API', async () => {
    __reset(['confirm', 'reject']);
    haptic('success');
    await settle();
    haptic('error');
    await settle();
    assert.deepEqual(__calls(), [
      ['performAndroidHapticsAsync', 'confirm'],
      ['performAndroidHapticsAsync', 'virtual-key'],
      ['performAndroidHapticsAsync', 'reject'],
      ['performAndroidHapticsAsync', 'long-press'],
    ]);
  });

  test('a phone with no haptics at all: silent, and nothing throws or waits', async () => {
    __reset(['confirm', 'reject', 'long-press', 'virtual-key']);
    assert.equal(haptic('success'), undefined);
    assert.equal(haptic('select'), undefined);
    await settle();
    await settle();
  });

  test('never the Vibrator-driven calls, which ignore the OS setting', async () => {
    for (const e of Object.keys(HAPTIC_EFFECTS)) haptic(e);
    await settle();
    assert.ok(__calls().every(([fn]) => fn === 'performAndroidHapticsAsync'));
  });
});

describe('the OS setting, app-wide', () => {
  test('only src/utils/haptics.ts imports expo-haptics, and nothing in src/ vibrates another way', () => {
    for (const rel of sourceFiles('src')) {
      // Code only: haptics.ts names the calls it avoids in its comments.
      const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      if (rel !== 'src/utils/haptics.ts') assert.doesNotMatch(src, /from 'expo-haptics'/, rel);
      assert.doesNotMatch(src, /\b(impactAsync|notificationAsync|selectionAsync)\(|\bVibration\b/, rel);
    }
  });

  test('VIBRATE is kept (Ronit, 2026-11-03): app.json does not block the one expo-haptics declares; the old block stays', () => {
    // View.performHapticFeedback needs no permission, so the OS setting still governs every haptic either way.
    const app = JSON.parse(read('app.json')).expo;
    assert.ok(!app.android.blockedPermissions.includes('android.permission.VIBRATE'));
    assert.ok(app.android.blockedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'), 'the existing block stays');
  });

  test('expo-haptics is the one library added, at the SDK 57 version npx expo install chose', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.dependencies['expo-haptics'], '~57.0.3');
  });
});

describe('where each event fires', () => {
  test('every failed save the app reports gets the error pattern, after the signed-out check', () => {
    const dialogs = read('src/utils/dialogs.ts');
    const reporters = dialogs.split(/export function (reportWriteError|reportActionWriteError|reportFieldWriteError)\(/).slice(1);
    assert.equal(reporters.length, 6, 'three reporters');
    for (let i = 1; i < reporters.length; i += 2) {
      assert.match(reporters[i], /^[^]*?\{\s*if \(isSessionEndedError\(error\)\) return;\s*haptic\('error'\);\s*Alert\.alert\(/);
    }
  });

  test('a successful status change, assignment or submit gets the confirm, beside its success notice', () => {
    const SUCCESS = {
      'src/screens/tickets/TicketListScreen.tsx': [/haptic\('success'\);\s*notify\('Status updated'\);/],
      'src/screens/tickets/TicketDetailScreen.tsx': [/haptic\('success'\);\s*notify\('Status updated'\);/, /haptic\('success'\);\s*notify\('Assigned to you'\);/],
      'src/screens/tickets/StatusClosureScreen.tsx': [/haptic\('success'\);\s*notify\('Status updated'\);[\s\S]*haptic\('success'\);\s*notify\('Status updated'\);/],
      'src/screens/tickets/AssignPickerScreen.tsx': [/haptic\('success'\);\s*notify\(confirm\.done/],
      'src/screens/tickets/TicketPropertyEditors.tsx': [/const done = await write\(ticket\);\s*haptic\('success'\);\s*notify\(done\);/],
      'src/screens/tickets/CreateTicketScreen.tsx': [/haptic\('success'\);\s*notify\('Ticket created successfully'\);/],
      'src/screens/tickets/ReplyComposerScreen.tsx': [/haptic\('success'\);\s*notify\(isPublic \? 'Reply sent' : 'Note saved'\);/],
      'src/screens/tickets/SubmitApprovalScreen.tsx': [/haptic\('success'\);\s*notify\('Approval request submitted'\);/],
      'src/screens/catalog/ServiceRequestFormScreen.tsx': [/haptic\('success'\);\s*notify\(submittedMessage\(item\)\);/],
      'src/screens/approvals/ApprovalDetailScreen.tsx': [/haptic\('success'\);\s*setResult\(res\);/],
    };
    for (const [rel, patterns] of Object.entries(SUCCESS)) {
      for (const p of patterns) assert.match(read(rel), p, rel);
    }
  });

  test('forms that show their error inline get the error pattern too', () => {
    for (const rel of [
      'src/screens/tickets/CreateTicketScreen.tsx', 'src/screens/tickets/ReplyComposerScreen.tsx',
      'src/screens/tickets/SubmitApprovalScreen.tsx', 'src/screens/catalog/ServiceRequestFormScreen.tsx',
      'src/screens/tickets/StatusClosureScreen.tsx',
    ]) {
      assert.match(read(rel), /if \(!isSessionEndedError\(e\)\) \{\s*haptic\('error'\);\s*setError\(/, rel);
    }
  });

  test('the long-press that selects a ticket gets the light tick', () => {
    const list = read('src/screens/tickets/TicketListScreen.tsx');
    assert.match(list, /const onCardLongPress = useStableCallback\(\(ticketId: string\) => \{\s*haptic\('select'\);\s*toggle\(ticketId\);/);
    assert.match(list, /onLongPress=\{canSelect \? onCardLongPress : undefined\}/);
  });
});
