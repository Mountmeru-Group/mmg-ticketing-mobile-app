// iOS-3a: the read screens (Home, Ticket list, Ticket detail, plus the list's Filters sheet and the ticket-link resolver),
// ported from Android c84d53a (docs/ios/00-PORT-MANIFEST.md §6 #1–#5). Android's own suites still pin every role answer
// (tests/rbac/role-gating, list-filters); these add what the iOS port itself must hold:
//   1. the write controls render from Android's role answers, unfiltered (iOS-3b removed iOS-3a's phase gate, which
//      left every write out; tests/screens/write-screens.test.mjs covers the write sheets themselves);
//   2. the animations skip when iOS's Reduce Motion is on;
//   3. the 500-ticket cap stops the list and the footer says so;
//   4. which Home tiles each role sees, and where they lead, is Android's;
//   5. no Android-only API and no colour literal outside src/theme; the built screens are registered.
// What is real: the app's permission, rule and hook modules. What is faked: React Native's AccessibilityInfo
// (tests/support/stubs/react-native.mjs). Screens are .tsx files that need a phone, so their wiring is read as text.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { __changeReduceMotion, __setReduceMotion } from 'react-native';

import { TICKET_PAGE_SIZE } from '../../src/api/tickets.api.ts';
import { SHEET_ROUTES, STACK_ROUTES, hasLargeTitle } from '../../src/navigation/routes.ts';
import { TICKET_LIST_CAP, isTicketListCapped, nextTicketListPage } from '../../src/hooks/useTickets.ts';
import { motion } from '../../src/theme/motion.ts';
import { TICKET_STATUSES } from '../../src/types/index.ts';
import {
  bulkActions, hasApprovalsTab, homeTiles, homeVariant, inlineStatusTransitions, showApprovalsShortcut,
  ticketDetailPermissions, ticketFieldPermissions,
} from '../../src/utils/permissions.ts';
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

// ── 1. The writes render from Android's role answers (iOS-3b) ─

describe("iOS-3b: the read screens' write controls come from Android's role answers, unfiltered", () => {
  test('the iOS-3a phase gate is gone: no file, and nothing reads it', () => {
    assert.equal(existsSync(path.join(REPO, 'src/utils/phase-gate.ts')), false);
    const users = sourceFiles('src').filter((rel) => /phase-gate|WRITE_CONTROLS|readOnly(Detail|Fields|Actions)\(/.test(code(read(rel))));
    assert.deepEqual(users, []);
  });

  test("without a gate, the answers are Android's: staff get writes, and the AGENT lock and END_USER limits stay", () => {
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
    assert.equal(agentLocked.addAttachments, false);
    assert.equal(ticketFieldPermissions(PERSONAS.AGENT, { status: 'CLOSED' }).category.mode, 'locked');
    const endUser = ticketDetailPermissions(PERSONAS.END_USER, ticket);
    assert.equal(endUser.statusBar, false);
    assert.deepEqual(endUser.conversationActions, ['reply']);
    assert.equal(endUser.deleteAttachments, false);
    assert.equal(endUser.editTasks, false);
    assert.deepEqual(bulkActions(PERSONAS.END_USER), []);
    for (const status of TICKET_STATUSES) assert.deepEqual(inlineStatusTransitions('END_USER', status), [], status);
  });

  test('TicketDetailScreen reads its role answers straight from permissions.ts, once each', () => {
    const src = read(DETAIL);
    const c = code(src);
    assert.ok(src.includes('const can = useMemo(() => (ticket ? ticketDetailPermissions(user, ticket) : null), [user, ticket]);'));
    assert.ok(src.includes('const fields = useMemo(() => (ticket ? ticketFieldPermissions(user, ticket) : null), [user, ticket]);'));
    assert.equal(count(c, 'ticketDetailPermissions('), 1);
    assert.equal(count(c, 'ticketFieldPermissions('), 1);
  });

  test('TicketDetailScreen: each write control renders only from its role flag', () => {
    const src = read(DETAIL);
    const c = code(src);
    const GUARDED = {
      'More options (header)': /const hasMoreActions = \(can\?\.moreActions\.length \?\? 0\) > 0;[\s\S]*headerRight: hasMoreActions\s*\?/,
      'More options lists exactly can.moreActions': /chooseFromActionSheet\(\{ title: 'More options', choices: moreActionChoices\(can\.moreActions\) \}\)/,
      'status card': /if \(!can\.statusBar\) return null;/,
      'Reply / Reply all / Note': /can\.conversationActions\.map\(\(mode\) => \([\s\S]{0,400}navigation\.navigate\('ReplyComposer', \{ ticketId, mode \}\)/,
      'Add files': /tab === 'attachments' && can\.addAttachments \? \(\s*<Card title="Add files">\s*<AttachmentPicker/,
      'delete a file': /onDelete=\{can\.deleteAttachments \? askDelete : undefined\}/,
      'task checkbox': /onToggle=\{can\.editTasks \? toggleTaskDone : undefined\}/,
      'Add task': /tab === 'tasks' && can\.editTasks \? \([\s\S]{0,300}navigation\.navigate\('TaskEditor', \{ ticketId \}\)/,
      'lock reason for "Add files"': /tab === 'attachments' && !can\.addAttachments \? \(/,
    };
    for (const [control, guard] of Object.entries(GUARDED)) assert.match(src, guard, control);
    // Every write handler is referenced exactly where the guarded control uses it, and nowhere else.
    const USES = {
      'once(openMoreOptions)': 1, // the header button
      'openMoreOptions': 2, // defined, and the header button
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
    assert.equal(count(c, 'await pickUp()'), 1); // More options only
    assert.doesNotMatch(c, /<OptionSheet\b/, 'More options is an iOS action sheet, not a bottom sheet');
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

  test('TicketListScreen: the status chip, selection and "+" render from permissions.ts', () => {
    const src = read(LIST);
    const c = code(src);
    assert.ok(src.includes('const bulk = bulkActions(user);'));
    assert.ok(src.includes('const canSelect = bulk.length > 0;'));
    assert.ok(src.includes('onLongPress={canSelect ? toggle : undefined}'));
    assert.ok(src.includes('const interactive = inlineStatusTransitions(role, item.status).length > 0;'));
    assert.ok(src.includes('onStatusPress={interactive ? onStatusPress : undefined}'));
    assert.ok(src.includes('const transitions = inlineStatusTransitions(role, t.status);'));
    assert.ok(src.includes('choices: transitionChoices(transitions),'));
    assert.ok(src.includes("onCreate={() => navigation.navigate('CreateTicket')}"));
    assert.match(src, /\) : \(\s*\/\/ "\+" FAB[\s\S]{0,300}onPress=\{\(\) => navigation\.navigate\('CreateTicket'\)\}/);
    assert.equal(count(c, "navigate('CreateTicket')"), 2);
    assert.equal(count(c, 'bulkActions('), 1);
    assert.equal(count(c, 'inlineStatusTransitions('), 3); // the chip; then, behind it, its action sheet and its write
  });

  test('HomeScreen: "Raise a ticket" for END_USER and "+" for staff, as on Android', () => {
    const src = read(HOME);
    assert.match(src, /\{isEndUser \? \(\s*<View className="mx-4 mb-4">\s*<SubmitButton label="Raise a ticket"[^\n]*onPress=\{createTicket\}/);
    assert.ok(src.includes('const showFab = !isEndUser;'));
    assert.match(src, /\{showFab \? \([\s\S]{0,300}onPress=\{createTicket\}/);
    assert.equal((code(src).match(/\bcreateTicket\b/g) ?? []).length, 3); // defined, and the two buttons
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
    // iOS-3b success notice: no fade in or out with Reduce Motion on; it appears and goes at once.
    'src/components/SuccessNotice.tsx': /reduceMotionEnabled\(\) \? null : fadeTo\(1\)[\s\S]*if \(reduceMotionEnabled\(\)\) \{\s*hide\(\);/,
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
    // iOS-3b: success notices are SuccessNotice (utils/successNotice.ts); ToastAndroid is gone from src altogether.
    ToastAndroid: /\bToastAndroid\b/,
    "the Switch's thumbColor (Android-only; iOS keeps its white thumb)": /\bthumbColor=/,
  };

  test('no Android-only API in src', () => {
    for (const rel of sourceFiles('src')) {
      const src = code(read(rel));
      for (const [name, pattern] of Object.entries(ANDROID_ONLY)) assert.doesNotMatch(src, pattern, `${rel}: ${name}`);
    }
  });

  test('a success notice is the non-modal SuccessNotice: notify() never opens an Alert or a toast (iOS-3b)', () => {
    const dialogs = code(read('src/utils/dialogs.ts'));
    const notify = dialogs.slice(dialogs.indexOf('export function notify('), dialogs.indexOf('export function reportWriteError('));
    assert.match(notify, /showSuccessNotice\(message\);/);
    assert.doesNotMatch(notify, /Alert\.|ToastAndroid|Platform/);
    assert.doesNotMatch(dialogs, /\bPlatform\b/);
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

  test('every route renders its real screen: the screen tables are complete and nothing falls back (iOS-3c)', () => {
    const table = (src) => {
      const start = src.indexOf(src.includes('const SCREENS') ? 'const SCREENS' : 'const SHEETS');
      return Object.fromEntries([...src.slice(start, src.indexOf('};', start)).matchAll(/^\s+(\w+): (\w+),$/gm)].map((m) => [m[1], m[2]]));
    };
    const stacks = read('src/navigation/TabStacks.tsx');
    const screens = table(stacks);
    const stackRoutes = [...new Set(Object.values(STACK_ROUTES).flat())].sort();
    assert.deepEqual(Object.keys(screens).sort(), stackRoutes);
    for (const [route, screen] of Object.entries(screens)) assert.equal(screen, route === 'More' ? 'MoreScreen' : `${route}Screen`, route);
    assert.match(stacks, /const SCREENS: Record<StackRoute, ComponentType<any>> = \{/, 'a complete table: a missing screen does not compile');
    assert.ok(stacks.includes('component={SCREENS[name]}'));

    const root = read('src/navigation/RootNavigator.tsx');
    const sheets = table(root);
    assert.deepEqual(Object.keys(sheets).sort(), [...SHEET_ROUTES].sort());
    for (const [route, screen] of Object.entries(sheets)) assert.equal(screen, `${route}Screen`, route);
    assert.match(root, /const SHEETS: Record<SheetRoute, ComponentType<any>> = \{/, 'a complete table: a missing sheet does not compile');
    assert.ok(root.includes('component={SHEETS[name]}'));
    for (const src of [stacks, root]) assert.doesNotMatch(src, /Placeholder/);
  });

  test('large titles: on the tab roots, except the ticket list and the approvals inbox with their pinned bars', () => {
    assert.equal(hasLargeTitle('HomeTab', 'Home'), true);
    assert.equal(hasLargeTitle('TicketsTab', 'TicketList'), false);
    // iOS-3c plan Q3: the inbox keeps Android's type chips pinned above the list, so a standard title, as the ticket list.
    assert.equal(hasLargeTitle('ApprovalsTab', 'ApprovalsInbox'), false);
    assert.equal(hasLargeTitle('AlertsTab', 'Notifications'), true);
    assert.equal(hasLargeTitle('MoreTab', 'More'), true);
    assert.equal(hasLargeTitle('HomeTab', 'TicketDetail'), false);
    assert.equal(hasLargeTitle('MoreTab', 'ApprovalsInbox'), false);
  });
});
