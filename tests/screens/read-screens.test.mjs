// iOS-3a: the read screens (Home, Ticket list, Ticket detail, plus the list's Filters sheet and the ticket-link resolver),
// ported from Android c84d53a (docs/ios/00-PORT-MANIFEST.md §6 #1–#5). Android's own suites still pin every role answer
// (tests/rbac/role-gating, list-filters); these add what the iOS port itself must hold:
//   1. no write action is reachable from these screens in iOS-3a (utils/phase-gate.ts), for every persona and status;
//   2. the animations skip when iOS's Reduce Motion is on;
//   3. the 500-ticket cap stops the list and the footer says so;
//   4. which Home tiles each role sees, and where they lead, is Android's;
//   5. no Android-only API and no colour literal outside src/theme; the built screens are registered.
// What is real: the app's permission, gate, rule and hook modules. What is faked: React Native's AccessibilityInfo
// (tests/support/stubs/react-native.mjs). Screens are .tsx files that need a phone, so their wiring is read as text.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { __changeReduceMotion, __setReduceMotion } from 'react-native';

import { TICKET_PAGE_SIZE } from '../../src/api/tickets.api.ts';
import { hasLargeTitle } from '../../src/navigation/routes.ts';
import { TICKET_LIST_CAP, isTicketListCapped, nextTicketListPage } from '../../src/hooks/useTickets.ts';
import { motion } from '../../src/theme/motion.ts';
import { TICKET_STATUSES } from '../../src/types/index.ts';
import {
  bulkActions, hasApprovalsTab, homeTiles, homeVariant, inlineStatusTransitions, showApprovalsShortcut,
  ticketDetailPermissions, ticketFieldPermissions,
} from '../../src/utils/permissions.ts';
import { WRITE_CONTROLS, readOnlyActions, readOnlyDetail, readOnlyFields } from '../../src/utils/phase-gate.ts';
import { OTHER_USER, PERSONAS, forEachPersona } from '../rbac/personas.mjs';

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

/** Code without its comments, so a comment that names an Android API (to say what replaced it) is not a use of it. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const DETAIL = 'src/screens/tickets/TicketDetailScreen.tsx';
const EDITORS = 'src/screens/tickets/TicketPropertyEditors.tsx';
const LIST = 'src/screens/tickets/TicketListScreen.tsx';
const HOME = 'src/screens/dashboard/HomeScreen.tsx';

// ── 1. No write action is reachable in iOS-3a ────────────────

describe('iOS-3a: no write action is reachable from the read screens', () => {
  test('the phase gate is off', () => {
    assert.equal(WRITE_CONTROLS, false);
  });

  const ticketsFor = (p) =>
    TICKET_STATUSES.flatMap((status) => [null, OTHER_USER, p.id].map((assignedToId) => ({ status, assignedToId })));

  test('ticket detail: no status card, More options, composer buttons, file or task changes, for anyone, in any state', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const t of ticketsFor(p)) {
        const android = ticketDetailPermissions(p, t);
        assert.deepEqual(
          readOnlyDetail(android),
          {
            locked: false,
            statusBar: false,
            transitions: [],
            moreActions: [],
            conversationActions: [],
            // What a person may READ is Android's answer, untouched.
            privateNotes: android.privateNotes,
            classification: android.classification,
            recipients: android.recipients,
            addAttachments: false,
            deleteAttachments: false,
            editTasks: false,
          },
          `${p.role} ${t.status} ${t.assignedToId}`,
        );
      }
    }
  });

  test('ticket detail: every property shows its value only; a field Android hides stays hidden; no priority preview', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const t of ticketsFor(p)) {
        const android = ticketFieldPermissions(p, t);
        const gated = readOnlyFields(android);
        for (const field of ['impact', 'urgency', 'category', 'country', 'resolution', 'technician']) {
          const expected = android[field].mode === 'hidden' ? 'hidden' : 'view';
          assert.deepEqual(gated[field], { mode: expected }, `${p.role} ${t.status} ${field}`);
        }
        assert.equal(gated.priorityPreview, false);
      }
    }
  });

  test('ticket list: no status chip and no selection, for anyone, in any state', () => {
    for (const p of Object.values(PERSONAS)) {
      assert.deepEqual(readOnlyActions(bulkActions(p)), [], p.role);
      for (const status of TICKET_STATUSES) assert.deepEqual(readOnlyActions(inlineStatusTransitions(p.role, status)), [], `${p.role} ${status}`);
    }
  });

  test('the test can tell: without the gate, Android offers these writes (so it is the gate that removes them)', () => {
    const admin = PERSONAS.ADMIN;
    const ticket = { status: 'OPEN', assignedToId: OTHER_USER };
    const can = ticketDetailPermissions(admin, ticket);
    assert.equal(can.statusBar, true);
    assert.ok(can.moreActions.length > 0 && can.conversationActions.length > 0 && can.addAttachments && can.deleteAttachments && can.editTasks);
    assert.equal(ticketFieldPermissions(admin, ticket).impact.mode, 'edit');
    assert.ok(bulkActions(admin).length > 0);
    assert.ok(inlineStatusTransitions(admin.role, 'OPEN').length > 0);
    const agentLocked = ticketDetailPermissions(PERSONAS.AGENT, { status: 'CLOSED', assignedToId: OTHER_USER });
    assert.equal(agentLocked.locked, true);
    assert.equal(ticketFieldPermissions(PERSONAS.AGENT, { status: 'CLOSED' }).category.mode, 'locked');
  });

  test('TicketDetailScreen reads its role answers only through the gate', () => {
    const src = read(DETAIL);
    const c = code(src);
    assert.ok(src.includes('readOnlyDetail(ticketDetailPermissions(user, ticket))'));
    assert.ok(src.includes('readOnlyFields(ticketFieldPermissions(user, ticket))'));
    assert.equal(count(c, 'ticketDetailPermissions('), 1);
    assert.equal(count(c, 'ticketFieldPermissions('), 1);
  });

  test('TicketDetailScreen: each write control renders only from its gated list or flag', () => {
    const src = read(DETAIL);
    const c = code(src);
    const GUARDED = {
      'More options (header)': /const hasMoreActions = \(can\?\.moreActions\.length \?\? 0\) > 0;[\s\S]*headerRight: hasMoreActions\s*\?/,
      'status card': /if \(!can\.statusBar\) return null;/,
      'Reply / Reply all / Note': /can\.conversationActions\.map\(\(mode\) => \([\s\S]{0,400}navigation\.navigate\('ReplyComposer', \{ ticketId, mode \}\)/,
      'Add files': /tab === 'attachments' && can\.addAttachments \? \(\s*<Card title="Add files">\s*<AttachmentPicker/,
      'delete a file': /onDelete=\{can\.deleteAttachments \? askDelete : undefined\}/,
      'task checkbox': /onToggle=\{can\.editTasks \? toggleTaskDone : undefined\}/,
      'Add task': /tab === 'tasks' && can\.editTasks \? \([\s\S]{0,300}navigation\.navigate\('TaskEditor', \{ ticketId \}\)/,
      'lock reason for "Add files"': /tab === 'attachments' && can\.locked \? \(/,
    };
    for (const [control, guard] of Object.entries(GUARDED)) assert.match(src, guard, control);
    // Every write handler is referenced exactly where the guarded control uses it, and nowhere else.
    const USES = {
      "setMoreOpen(true)": 1, // the header button
      'onMore': 2, // defined, and the More options sheet (open only after setMoreOpen(true))
      'transitionStatus': 2, // defined, and the status card
      'uploadStaged': 2, // defined, and the Add files card
      'askDelete': 2, // defined, and the guarded onDelete
      'toggleTaskDone': 2, // defined, and the guarded onToggle
      "navigate('ReplyComposer'": 1,
      "navigate('TaskEditor'": 1,
      "navigate('AssignPicker'": 1, // More options
      "navigate('SubmitApproval'": 1, // More options
      "navigate('StatusClosure'": 2, // the status card's closure targets, and More options' Close
      "navigate('CreateTicket'": 0,
    };
    for (const [ref, n] of Object.entries(USES)) {
      const found = ref.includes('(') ? count(c, ref) : (c.match(new RegExp(`\\b${ref}\\b`, 'g')) ?? []).length;
      assert.equal(found, n, ref);
    }
    assert.match(src, /async function pickUp\(\)/);
    assert.equal(count(c, 'once(pickUp)'), 1); // More options only
  });

  test('TicketPropertyEditors: an editor opens only from a field whose access is "edit"', () => {
    const src = read(EDITORS);
    assert.match(src, /if \(access\.mode !== 'edit'\) return null;/);
    assert.match(src, /const open = edit\.editing === key && access\.mode === 'edit';/);
    const opens = count(code(src), 'edit.open(');
    const fromFieldAction = (src.match(/<FieldAction access=\{access\} label="[^"]+" onPress=\{\(\) => edit\.open\('/g) ?? []).length;
    assert.equal(opens, 5);
    assert.equal(fromFieldAction, opens);
  });

  test('TicketListScreen: the status chip, selection and "+" render only from the gate', () => {
    const src = read(LIST);
    const c = code(src);
    assert.ok(src.includes('const bulk = readOnlyActions(bulkActions(user));'));
    assert.ok(src.includes('const canSelect = bulk.length > 0;'));
    assert.ok(src.includes('onLongPress={canSelect ? toggle : undefined}'));
    assert.ok(src.includes('const interactive = readOnlyActions(inlineStatusTransitions(role, item.status)).length > 0;'));
    assert.ok(src.includes('onStatusPress={interactive ? onStatusPress : undefined}'));
    assert.equal(count(c, 'setStatusFor(t)'), 1); // the status chip's handler only
    assert.ok(src.includes("onCreate={WRITE_CONTROLS ? () => navigation.navigate('CreateTicket') : undefined}"));
    assert.match(src, /\) : WRITE_CONTROLS \? \(\s*\/\/ "\+" FAB[\s\S]{0,300}onPress=\{\(\) => navigation\.navigate\('CreateTicket'\)\}/);
    assert.equal(count(c, "navigate('CreateTicket')"), 2);
    assert.equal(count(c, 'bulkActions('), 1);
    assert.equal(count(c, 'inlineStatusTransitions('), 3); // the gated chip; then, behind it, its sheet and its write
  });

  test('HomeScreen: "Raise a ticket" and "+" render only from the gate', () => {
    const src = read(HOME);
    assert.match(src, /isEndUser && WRITE_CONTROLS \? \([\s\S]{0,250}onPress=\{createTicket\}/);
    assert.ok(src.includes('const showFab = !isEndUser && WRITE_CONTROLS;'));
    assert.match(src, /\{showFab \? \([\s\S]{0,300}onPress=\{createTicket\}/);
    assert.equal((code(src).match(/\bcreateTicket\b/g) ?? []).length, 3); // defined, and the two gated buttons
  });
});

// ── 2. Reduce Motion ─────────────────────────────────────────

describe('animations skip when iOS Reduce Motion is on', () => {
  test('the setting is read from React Native AccessibilityInfo (iOS: Reduce Motion), and followed when it changes', async () => {
    __setReduceMotion(true);
    const { reduceMotionEnabled } = await import('../../src/hooks/useReduceMotion.ts');
    assert.equal(reduceMotionEnabled(), false, 'before the first answer, motion counts as allowed');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reduceMotionEnabled(), true, 'the device says Reduce Motion is on');
    __changeReduceMotion(false);
    assert.equal(reduceMotionEnabled(), false, 'turned off in Settings while the app runs');
    __changeReduceMotion(true);
    assert.equal(reduceMotionEnabled(), true, 'turned on again');
  });

  const CHECKS = {
    // Staggered entry: a row decides once, and gets no animated wrapper at all with Reduce Motion on.
    'src/components/ListEntry.tsx': /index >= maxRows \|\| reduceMotionEnabled\(\)\) return null;/,
    // Status change: no pulse with Reduce Motion on.
    'src/components/StatusBadge.tsx': /sameRecord && !reduceMotionEnabled\(\)/,
    // Skeleton shimmer: no loop and no band with Reduce Motion on.
    'src/components/Shimmer.tsx': /if \(reduceMotion\) return;[\s\S]*\{reduceMotion \? null :/,
  };
  for (const [file, check] of Object.entries(CHECKS)) {
    test(`${path.basename(file)} checks Reduce Motion before it animates`, () => {
      assert.match(read(file), check);
    });
  }

  test('every file that starts an animation checks Reduce Motion', () => {
    const animated = sourceFiles('src').filter((rel) => /Animated\.(timing|loop|spring|decay)\(|LayoutAnimation\./.test(code(read(rel))));
    assert.deepEqual(animated.sort(), Object.keys(CHECKS).sort());
    for (const rel of animated) assert.match(read(rel), /reduceMotionEnabled\(\)|useReduceMotion\(\)/, rel);
  });

  test('the staggered entry still animates the first 8 rows only', () => {
    assert.equal(motion.listEntry.maxRows, 8);
  });
});

// ── 3. The 500-ticket cap ────────────────────────────────────

describe('ticket list: the 500-ticket cap and its footer', () => {
  const page = (n, hasNext) => ({ data: [], total: 1200, page: n, limit: TICKET_PAGE_SIZE, totalPages: 60, hasNext, hasPrev: n > 1 });
  const pages = (n, lastHasNext) => Array.from({ length: n }, (_, i) => page(i + 1, i < n - 1 || lastHasNext));

  test('20 per page, capped at 500: 25 pages', () => {
    assert.equal(TICKET_PAGE_SIZE, 20);
    assert.equal(TICKET_LIST_CAP, 500);
  });

  test('page 25 is the last one loaded, even when the server has more; the list then says it is capped', () => {
    const at24 = pages(24, true);
    assert.equal(nextTicketListPage(at24.at(-1), at24), 25);
    assert.equal(isTicketListCapped(at24), false);
    const at25 = pages(25, true);
    assert.equal(nextTicketListPage(at25.at(-1), at25), undefined);
    assert.equal(isTicketListCapped(at25), true);
  });

  test('a list that ends on its own is never capped', () => {
    const short = pages(3, false);
    assert.equal(nextTicketListPage(short.at(-1), short), undefined);
    assert.equal(isTicketListCapped(short), false);
    const exactly25 = pages(25, false);
    assert.equal(isTicketListCapped(exactly25), false);
    assert.equal(isTicketListCapped(undefined), false);
  });

  test('useTickets pages and caps with these two functions', () => {
    const src = read('src/hooks/useTickets.ts');
    assert.ok(src.includes('getNextPageParam: nextTicketListPage,'));
    assert.ok(src.includes('const capped = isTicketListCapped(query.data?.pages);'));
  });

  test('the footer shows "search or filter to narrow" when capped, before any other end-of-list line', () => {
    const src = read(LIST);
    assert.ok(src.includes('capped={list.capped}'));
    const footer = src.slice(src.indexOf('function ListFooter('));
    assert.match(footer, /if \(capped\) \{\s*return \([\s\S]{0,200}Showing the first \$\{count\}\$\{total !== undefined \? ` of \$\{total\}` : ''\} — search or filter to narrow/);
    assert.ok(footer.indexOf('if (capped)') < footer.indexOf('if (!hasMore && count > 0)'));
  });
});

// ── 4. Home tiles per role, as on Android ────────────────────

describe('Home: which tiles each role sees, and where they lead, is Android\'s', () => {
  // Android c84d53a tests/rbac/role-gating.test.mjs "home tiles", unchanged.
  const STAFF = ['open', 'inProgress', 'onHold', 'slaBreached', 'totalOpen'];
  forEachPersona(
    'KPI tiles',
    { END_USER: ['open', 'resolved'], AGENT: STAFF, TRIAGE_AGENT: [...STAFF, 'unassigned'], L2_MANAGER: STAFF, ADMIN: [...STAFF, 'unassigned'] },
    (p) => homeTiles(p),
  );
  forEachPersona(
    'variant (L2_MANAGER: tiles without counts)',
    { END_USER: 'endUser', AGENT: 'staff', TRIAGE_AGENT: 'staff', L2_MANAGER: 'l2', ADMIN: 'staff' },
    (p) => homeVariant(p.role),
  );
  forEachPersona(
    '"Pending approvals" shortcut with 0 and with 2 pending',
    { END_USER: [false, true], AGENT: [true, true], TRIAGE_AGENT: [true, true], L2_MANAGER: [false, true], ADMIN: [true, true] },
    (p) => [showApprovalsShortcut(p.role, 0), showApprovalsShortcut(p.role, 2)],
  );
  // iOS: the shortcut opens the Approvals tab, or More's Approvals row screen for the roles without that tab.
  forEachPersona(
    '"Pending approvals" opens',
    { END_USER: 'MoreTab', AGENT: 'ApprovalsTab', TRIAGE_AGENT: 'ApprovalsTab', L2_MANAGER: 'MoreTab', ADMIN: 'ApprovalsTab' },
    (p) => (hasApprovalsTab(p.role) ? 'ApprovalsTab' : 'MoreTab'),
  );

  test('HomeScreen builds its tiles, shortcut and approvals destination from permissions.ts', () => {
    const src = read(HOME);
    assert.ok(src.includes('buildTiles(homeTiles(user)'));
    assert.ok(src.includes('homeVariant(role)'));
    assert.ok(src.includes('showApprovalsShortcut(role, pendingCount)'));
    assert.match(src, /hasApprovalsTab\(role\)\s*\? navigation\.navigate\('ApprovalsTab', \{ screen: 'ApprovalsInbox', pop: true \}\)\s*: navigation\.navigate\('MoreTab', \{ screen: 'ApprovalsInbox', initial: false, pop: true \}\)/);
  });

  test('each tile opens the Tickets tab with the same filter as on Android', () => {
    const src = read(HOME);
    const table = src.slice(src.indexOf('const TILES'), src.indexOf('function buildTiles'));
    const filters = Object.fromEntries([...table.matchAll(/^\s*(\w+): \{[^}]*filter: '(\w+)' \},$/gm)].map((m) => [m[1], m[2]]));
    assert.deepEqual(filters, {
      open: 'OPEN',
      resolved: 'RESOLVED',
      inProgress: 'IN_PROGRESS_KPI',
      onHold: 'ON_HOLD_KPI',
      slaBreached: 'BREACHED_KPI',
      totalOpen: 'ACTIVE_KPI',
      unassigned: 'UNASSIGNED_KPI',
    });
    assert.ok(src.includes("navigation.navigate('TicketsTab', { screen: 'TicketList', params: { filter }, pop: true })"));
  });
});

// ── 5. iOS hygiene and registration ──────────────────────────

describe('iOS: no Android-only API, no colour outside the theme, the built screens registered', () => {
  const ANDROID_ONLY = {
    BackHandler: /\bBackHandler\b/,
    DateTimePickerAndroid: /\bDateTimePickerAndroid\b/,
    PermissionsAndroid: /\bPermissionsAndroid\b/,
    'android_ripple': /\bandroid_ripple\b/,
    elevation: /\belevation\s*:/,
    'RefreshControl colors (Android; iOS uses tintColor)': /<RefreshControl[^>]*\scolors=/,
    'the ⋮ glyph': /ellipsis-vertical/,
    'the Android share glyph': /share-social/,
    'KeyboardAvoidingView "height"': /behavior="height"/,
  };

  test('no Android-only API in src', () => {
    for (const rel of sourceFiles('src')) {
      const src = code(read(rel));
      for (const [name, pattern] of Object.entries(ANDROID_ONLY)) assert.doesNotMatch(src, pattern, `${rel}: ${name}`);
    }
  });

  test('ToastAndroid only in utils/dialogs.ts, behind Platform.OS === \'android\'', () => {
    const users = sourceFiles('src').filter((rel) => /\bToastAndroid\./.test(code(read(rel))));
    assert.deepEqual(users, ['src/utils/dialogs.ts']);
    const calls = code(read('src/utils/dialogs.ts')).split('\n').filter((line) => /ToastAndroid\./.test(line));
    for (const line of calls) assert.match(line, /if \(Platform\.OS === 'android'\) ToastAndroid\./);
  });

  test('no colour literal outside src/theme', () => {
    const colour = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b|['"`]#[0-9a-fA-F]{3}['"`]|\[#[0-9a-fA-F]{3,8}\]|\brgba?\(/;
    const offenders = sourceFiles('src').filter((rel) => !rel.startsWith('src/theme/') && colour.test(read(rel)));
    assert.deepEqual(offenders, []);
  });

  test('signed-in screens use the native navigation bar: only the developer-token placeholder draws its own', () => {
    const users = sourceFiles('src/screens').filter((rel) => /\bScreenHeader\b/.test(code(read(rel))));
    assert.deepEqual(users, ['src/screens/PlaceholderScreen.tsx']);
  });

  test('the read screens replace their placeholders; every other route keeps it', () => {
    const stacks = read('src/navigation/TabStacks.tsx');
    for (const line of ['More: MoreScreen,', 'Home: HomeScreen,', 'TicketList: TicketListScreen,', 'TicketDetail: TicketDetailScreen,', 'TicketLink: TicketLinkScreen,']) {
      assert.ok(stacks.includes(line), line);
    }
    assert.ok(stacks.includes('component={SCREENS[name] ?? PlaceholderRoute}'));
    const root = read('src/navigation/RootNavigator.tsx');
    assert.ok(root.includes('TicketFilters: TicketFiltersScreen,'));
    assert.ok(root.includes('component={SHEETS[name] ?? PlaceholderRoute}'));
  });

  test('large titles: on the tab roots, except the ticket list with its pinned search bar', () => {
    assert.equal(hasLargeTitle('HomeTab', 'Home'), true);
    assert.equal(hasLargeTitle('TicketsTab', 'TicketList'), false);
    assert.equal(hasLargeTitle('ApprovalsTab', 'ApprovalsInbox'), true);
    assert.equal(hasLargeTitle('AlertsTab', 'Notifications'), true);
    assert.equal(hasLargeTitle('MoreTab', 'More'), true);
    assert.equal(hasLargeTitle('HomeTab', 'TicketDetail'), false);
    assert.equal(hasLargeTitle('MoreTab', 'ApprovalsInbox'), false);
  });
});
