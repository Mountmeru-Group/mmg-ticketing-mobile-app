// iOS-3c: the module screens (notifications, approvals, tasks, knowledge base, announcements, the service catalogue and
// My Requests, profile), ported from Android c84d53a (docs/ios/00-PORT-MANIFEST.md §6 #6, #13–#25, §4.12). Android's own
// suites pin the role answers and requests (tests/rbac/role-gating, service-catalog), and tests/navigation/get-id runs
// the module stacks. These add what the iOS port itself must hold:
//   1. no placeholder route, placeholder module or "DEV PLACEHOLDER" text remains anywhere in src/;
//   2. notifications: a tap opens the linked record through deep-links.ts, inside Alerts; the badge is the one NTF-2
//      query, never polled; "Mark all read" in the native bar;
//   3. approvals: Reject asks in red and needs a reason; the inbox reads APR-1 only; the tab's own navigation;
//   4. tasks: the editor's iOS controls (action sheet, calendar sheet, keyboard), the guard before every task write;
//   5. knowledge base: article HTML through the app's sanitiser and react-native-render-html's own engine, with links,
//      images and tables, never throwing; the KB requests;
//   6. the catalogue and profile on iOS: action sheets, the date sheet, keyboard insets, no hardware back, USR-2;
//   7. every module screen: the native bar, pull-to-refresh in the brand tint, no tab-bar inset, iOS props.
// What is real: the app's permission, rule, sanitiser, API modules and the renderer's tree engine. What is faked: the
// network (axios's transport adapter records requests) and React Native's ActionSheetIOS and Alert
// (tests/support/stubs/react-native.mjs). Nothing calls UAT. Screens are .tsx files that need a phone, so their wiring
// is read as text.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TRenderEngine } from '@native-html/transient-render-engine';
import { AxiosHeaders } from 'axios';
import { __actionSheet, __alerts, __clearAlerts, __pickActionSheet, __pressAlertButton } from 'react-native';

import { listPendingApprovals, rejectApproval } from '../../src/api/approvals.api.ts';
import { apiClient } from '../../src/api/client.ts';
import { getKbArticle, listKbArticles, markKbArticleHelpful, searchKb } from '../../src/api/kb.api.ts';
import { MIN_STALE_TIME_MS } from '../../src/api/queryClient.ts';
import { updateOwnProfile } from '../../src/api/users.api.ts';
import { SHEET_ROUTES, STACK_ROUTES, getIdFor, hasLargeTitle } from '../../src/navigation/routes.ts';
import { TASK_STATUSES } from '../../src/types/index.ts';
import { CANCEL_LABEL, chooseForField } from '../../src/utils/actionSheet.ts';
import { TASK_ASSIGNEE_ROLES } from '../../src/utils/assignment.ts';
import { notificationDestination, parseTicketLink } from '../../src/utils/deep-links.ts';
import { confirmAction } from '../../src/utils/dialogs.ts';
import { TASK_STATUS_LABELS } from '../../src/utils/format.ts';
import { BLOCKED_TAGS, sanitizeForRender } from '../../src/utils/html.ts';
import { taskPermissions } from '../../src/utils/permissions.ts';
import { isStaff } from '../../src/utils/roles.ts';
import { REQUEST_IMPACT_OPTIONS, REQUEST_URGENCY_OPTIONS } from '../../src/utils/service-catalog.ts';
import { dayFromDate, dayToDueDate } from '../../src/utils/tasks.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

/** Source without comments, so a comment that names an API is not mistaken for a call. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel] : [];
  });
}

/** The text of one exported function in a source file, up to the next top-level declaration. */
function fn(src, name) {
  const start = src.search(new RegExp(`export (async )?function ${name}\\b`));
  assert.ok(start >= 0, `${name} not found`);
  const rest = src.slice(start + 1);
  const end = rest.search(/\n(export |function |const |\/\*\*)/);
  return end < 0 ? rest : rest.slice(0, end);
}

const S = 'src/screens';
const NOTIFICATIONS = `${S}/notifications/NotificationsScreen.tsx`;
const INBOX = `${S}/approvals/ApprovalsInboxScreen.tsx`;
const APPROVAL = `${S}/approvals/ApprovalDetailScreen.tsx`;
const TASK_LIST = `${S}/tasks/TaskListScreen.tsx`;
const TASK = `${S}/tasks/TaskDetailScreen.tsx`;
const TASK_EDITOR = `${S}/tasks/TaskEditorScreen.tsx`;
const KB = `${S}/knowledge/KnowledgeBaseScreen.tsx`;
const ARTICLE = `${S}/knowledge/KbArticleScreen.tsx`;
const ANNOUNCEMENTS = `${S}/dashboard/AnnouncementsScreen.tsx`;
const CATALOG = `${S}/catalog/ServiceCatalogScreen.tsx`;
const FIELD = `${S}/catalog/ServiceFormFieldInput.tsx`;
const FORM = `${S}/catalog/ServiceRequestFormScreen.tsx`;
const REQUEST = `${S}/catalog/ServiceRequestDetailScreen.tsx`;
const PROFILE = `${S}/profile/ProfileScreen.tsx`;

/** The 14 files ported in iOS-3c. */
const MODULE_FILES = [
  NOTIFICATIONS, INBOX, APPROVAL, TASK_LIST, TASK, TASK_EDITOR, KB, ARTICLE, ANNOUNCEMENTS, CATALOG, FIELD, FORM, REQUEST, PROFILE,
];
/** The 13 routes that were DEV placeholders until iOS-3c, and their screens. */
const MODULE_ROUTES = {
  Notifications: NOTIFICATIONS,
  ApprovalsInbox: INBOX,
  ApprovalDetail: APPROVAL,
  TaskList: TASK_LIST,
  TaskDetail: TASK,
  TaskEditor: TASK_EDITOR,
  KnowledgeBase: KB,
  KbArticle: ARTICLE,
  Announcements: ANNOUNCEMENTS,
  ServiceCatalog: CATALOG,
  ServiceRequestForm: FORM,
  ServiceRequestDetail: REQUEST,
  Profile: PROFILE,
};

// ── The network, faked ───────────────────────────────────────

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push({
    method: config.method,
    url: config.url,
    params: config.params,
    data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
  });
  const body = config.url.startsWith('/kb/articles?') || config.url === '/kb/articles' ? { data: [], total: 0, page: 1, limit: 20 } : config.url.startsWith('/kb/search') ? [] : {};
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(body),
    config,
    request: {},
  };
};
beforeEach(() => {
  sent.length = 0;
  __clearAlerts();
});

// ══ 1. No placeholder remains ════════════════════════════════

describe('no placeholder remains (iOS-3c; compliance 2.1, A2)', () => {
  test('no placeholder route, placeholder module or "DEV PLACEHOLDER" text anywhere in src/', () => {
    for (const gone of ['src/screens/placeholders.ts', 'src/screens/DevPlaceholderScreen.tsx']) {
      assert.equal(existsSync(path.join(REPO, gone)), false, `${gone} still exists`);
    }
    const marker = /DEV PLACEHOLDER|replaced in iOS-\d|PlaceholderRoute|DevPlaceholderScreen|['"][./@\w]*\/?placeholders['"]/;
    const offenders = sourceFiles('src').filter((rel) => marker.test(read(rel)));
    assert.deepEqual(offenders, []);
    assert.ok(sourceFiles('src').length > 150, 'the scan read the source tree');
  });

  test('the one file named PlaceholderScreen is the __DEV__ developer-token layout, loaded only by that screen', () => {
    const users = sourceFiles('src').filter((rel) => /from ['"][^'"]*PlaceholderScreen['"]/.test(read(rel)));
    assert.deepEqual(users, ['src/screens/auth/DevTokenScreen.tsx']);
    assert.ok(read('src/navigation/AuthStack.tsx').includes('__DEV__'), 'the developer-token screen stays behind __DEV__');
  });

  test('the 13 routes that were placeholders each render their real screen', () => {
    const stacks = read('src/navigation/TabStacks.tsx');
    const root = read('src/navigation/RootNavigator.tsx');
    for (const [route, file] of Object.entries(MODULE_ROUTES)) {
      const screen = `${route}Screen`;
      assert.match(read(file), new RegExp(`export function ${screen}\\(`), file);
      const table = SHEET_ROUTES.includes(route) ? root : stacks;
      assert.match(table, new RegExp(`^\\s+${route}: ${screen},$`, 'm'), route);
    }
    const routes = new Set([...Object.values(STACK_ROUTES).flat(), ...SHEET_ROUTES]);
    for (const route of Object.keys(MODULE_ROUTES)) assert.ok(routes.has(route), `${route} is not registered`);
  });
});

// ══ 2. Notifications ═════════════════════════════════════════

describe('notifications (M9): the tap, the badge, the bar', () => {
  const PENDING = [
    { id: 'apr-1', entityType: 'ticket', entityId: 't-1' },
    { id: 'apr-2', entityType: 'service_request', entityId: 't-2' },
  ];
  const ticket = (ticketId) => ({ route: 'TicketDetail', params: { ticketId } });

  test('a tap opens the record through deep-links.ts: an approval waiting on me for that ticket, else the ticket', () => {
    assert.deepEqual(notificationDestination({ ticketId: 't-1' }, PENDING), { route: 'ApprovalDetail', params: { approvalId: 'apr-1' } });
    assert.deepEqual(notificationDestination({ ticketId: 't-2' }, PENDING), ticket('t-2'), 'only a ticket approval wins');
    assert.deepEqual(notificationDestination({ ticketId: 't-3' }, PENDING), ticket('t-3'));
    assert.deepEqual(notificationDestination({ ticketId: 't-1' }, undefined), ticket('t-1'), 'APR-1 not loaded: the ticket');
    assert.deepEqual(notificationDestination({ ticketId: 't-1' }, [null, ...PENDING]), { route: 'ApprovalDetail', params: { approvalId: 'apr-1' } });
  });

  test('no ticketId: nothing opens (the tap only marks the row read), as on Android', () => {
    for (const ticketId of [null, undefined, '']) assert.equal(notificationDestination({ ticketId }, PENDING), null, String(ticketId));
  });

  test('never by type (approvals arrive as TICKET_UPDATED, 05 B.23)', () => {
    for (const type of ['TICKET_ASSIGNED', 'TICKET_UPDATED', 'TICKET_RESOLVED', 'COMMENT_ADDED', 'SLA_BREACHED', 'MENTION']) {
      assert.deepEqual(notificationDestination({ ticketId: 't-9', type }, PENDING), ticket('t-9'), type);
    }
    assert.doesNotMatch(code(fn(read('src/utils/deep-links.ts'), 'notificationDestination')), /\.type\b/);
  });

  test('the screen opens it inside Alerts: both records are in every tab\'s stack; it never switches tab', () => {
    const src = code(read(NOTIFICATIONS));
    assert.match(src, /notificationDestination\(n, approvals\.data\)/);
    assert.match(src, /navigation\.navigate\('ApprovalDetail', destination\.params\)/);
    assert.match(src, /navigation\.navigate\('TicketDetail', destination\.params\)/);
    assert.doesNotMatch(src, /TicketsTab|ApprovalsTab|MainTabs|'Approvals'/);
    for (const tab of Object.keys(STACK_ROUTES)) {
      for (const route of ['ApprovalDetail', 'TicketDetail']) assert.ok(STACK_ROUTES[tab].includes(route), `${tab} lacks ${route}`);
    }
  });

  test('the tab badge: AppTabs\' one NTF-2 query, the app-wide staleTime (≥ 60 s), never polled; the screen shares it', () => {
    assert.ok(MIN_STALE_TIME_MS >= 60_000);
    const client = code(read('src/api/queryClient.ts'));
    for (const line of ['staleTime: MIN_STALE_TIME_MS', 'refetchInterval: false', 'refetchOnWindowFocus: false', 'refetchOnReconnect: false', 'refetchOnMount: false']) {
      assert.ok(client.includes(line), line);
    }
    const count = code(fn(read('src/hooks/useNotifications.ts'), 'useUnreadCount'));
    assert.match(count, /queryKey: queryKeys\.notifications\.count\(\)/);
    assert.doesNotMatch(count, /staleTime|refetchInterval|setInterval/, 'NTF-2 keeps the default: not lowered, not polled');
    const polling = sourceFiles('src').filter((rel) => /refetchInterval:(?!\s*false\b)|\bsetInterval\(/.test(code(read(rel))));
    assert.deepEqual(polling, []);
    const tabs = code(read('src/navigation/AppTabs.tsx'));
    assert.match(tabs, /useUnreadCount\(\{ enabled: true \}\)/);
    assert.match(tabs, /tabBadges\(role, \{ unread, pendingApprovals \}\)/);
    assert.match(code(read(NOTIFICATIONS)), /useUnreadCount\(\{ enabled: true \}\)/);
  });

  test('"Mark all read" sits in the native bar, asks first (not in red: nothing is deleted), then NTF-4', async () => {
    const src = code(read(NOTIFICATIONS));
    assert.match(src, /navigation\.setOptions\(\{\s*headerRight: \(\) =>/);
    assert.match(src, />Mark all read<\/Text>/);
    const onMarkAll = src.slice(src.indexOf('const onMarkAll'), src.indexOf('const markAllDisabled'));
    assert.match(onMarkAll, /confirmAction\(\{\s*title: 'Mark all as read\?'/);
    assert.doesNotMatch(onMarkAll, /destructive/);
    assert.ok(onMarkAll.indexOf('confirmAction(') < onMarkAll.indexOf('markAll.mutateAsync()'), 'asked before the write');
    assert.doesNotMatch(src, /ScreenHeader/);
  });

  test('the large title collapses: every state scrolls under the translucent bar, the banners ride in the list', () => {
    assert.equal(hasLargeTitle('AlertsTab', 'Notifications'), true);
    const src = code(read(NOTIFICATIONS));
    assert.match(src, /<FlashList[\s\S]*?contentInsetAdjustmentBehavior="automatic"/);
    assert.match(src, /<ScrollView contentInsetAdjustmentBehavior="automatic"/, 'loading, offline and error states too');
    const root = src.slice(src.lastIndexOf('return (', src.indexOf('function StateScroll')), src.indexOf('function StateScroll'));
    assert.doesNotMatch(root, /OfflineBanner|QueryBanner/, 'no banner above the list: it would stop the title collapsing');
  });
});

// ══ 3. Approvals ═════════════════════════════════════════════

describe('approvals (M12, M13)', () => {
  test('Reject asks with a red, destructive button; Approve with the default style', async () => {
    const src = code(read(APPROVAL));
    assert.match(src, /title: decision === 'approve' \? 'Approve\?' : 'Reject\?'/);
    assert.match(src, /destructive: decision === 'reject'/);
    const asked = confirmAction({ title: 'Reject?', message: 'Rejecting can’t be undone.', confirmLabel: 'Reject', destructive: true });
    const alert = __alerts().at(-1);
    assert.deepEqual(alert.buttons.map((b) => [b.text, b.style]), [['Cancel', 'cancel'], ['Reject', 'destructive']]);
    __pressAlertButton('Cancel');
    assert.equal(await asked, false, 'Cancel decides nothing');
    const approve = confirmAction({ title: 'Approve?', message: 'm', confirmLabel: 'Approve' });
    assert.deepEqual(__alerts().at(-1).buttons.map((b) => b.style), ['cancel', 'default']);
    __pressAlertButton('Approve');
    assert.equal(await approve, true);
  });

  test('Reject needs a reason: the button waits for one, and the screen and APR-3 both refuse a blank one, unsent', async () => {
    const src = code(read(APPROVAL));
    assert.match(src, /if \(decision === 'reject' && !comment\.trim\(\)\) return;/);
    assert.match(src, /label="Reject"[\s\S]{0,200}disabled=\{decide\.isPending \|\| !comment\.trim\(\)\}/);
    await assert.rejects(rejectApproval('apr-1', '   '));
    assert.equal(sent.length, 0);
  });

  test('the inbox reads APR-1 only (GET /approvals/pending); the unscoped GET /approvals is never called (05 C.16)', async () => {
    await listPendingApprovals();
    assert.deepEqual(sent.map((r) => [r.method, r.url]), [['get', '/approvals/pending']]);
    const gets = [...code(read('src/api/approvals.api.ts')).matchAll(/apiClient\.get<[^>]*>\(\s*([^,)]+)/g)].map((m) => m[1]);
    assert.deepEqual(gets, ["'/approvals/pending'"]);
  });

  test('"Open the ticket" stays in the tab; "Back to approvals" returns to the inbox below, or goes back', () => {
    const src = code(read(APPROVAL));
    assert.match(src, /const openTicket = \(ticketId: string\) => navigation\.navigate\('TicketDetail', \{ ticketId \}\);/);
    assert.match(src, /lastIndexOf\('ApprovalsInbox'\)/);
    assert.match(src, /if \(inbox >= 0\) navigation\.pop\(routes\.length - 1 - inbox\);\s*else navigation\.goBack\(\);/);
    assert.doesNotMatch(src, /MainTabs|TicketsTab/);
    for (const tab of ['ApprovalsTab', 'MoreTab']) assert.ok(STACK_ROUTES[tab].includes('ApprovalsInbox'), tab);
  });

  test('the inbox: the Approvals tab\'s root for ADMIN and AGENT, pushed from More otherwise; iOS-4: chips in the list, a large title', () => {
    assert.equal(STACK_ROUTES.ApprovalsTab[0], 'ApprovalsInbox');
    // iOS-4: the chips ride at the top of the list, so the tab root has the large title (iOS-3c had a standard one).
    assert.equal(hasLargeTitle('ApprovalsTab', 'ApprovalsInbox'), true);
    assert.equal(hasLargeTitle('MoreTab', 'ApprovalsInbox'), false, 'pushed from More: a standard title');
    assert.match(code(read(INBOX)), /navigation\.navigate\('ApprovalDetail', \{ approvalId \}\)/);
  });
});

// ══ 4. Tasks ═════════════════════════════════════════════════

describe('tasks (list, detail, M11 editor)', () => {
  test('status: an iOS action sheet of the four task statuses, Android\'s order and labels, Cancel last', async () => {
    const choices = TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }));
    const picked = chooseForField('Status', choices);
    const sheet = __actionSheet();
    assert.equal(sheet.title, 'Status');
    assert.deepEqual(sheet.options, [...TASK_STATUSES.map((s) => TASK_STATUS_LABELS[s]), CANCEL_LABEL]);
    assert.equal(sheet.cancelButtonIndex, TASK_STATUSES.length);
    assert.equal(sheet.destructiveButtonIndex, undefined);
    __pickActionSheet(2);
    assert.equal(await picked, TASK_STATUSES[2]);
    const cancelled = chooseForField('Status', choices);
    __pickActionSheet(TASK_STATUSES.length);
    assert.equal(await cancelled, null, 'Cancel changes nothing');

    const src = code(read(TASK_EDITOR));
    assert.match(src, /const STATUS_CHOICES: readonly SheetChoice<TaskStatus>\[\] = TASK_STATUSES\.map\(\(s\) => \(\{ value: s, label: TASK_STATUS_LABELS\[s\] \}\)\);/);
    assert.match(src, /chooseForField\('Status', STATUS_CHOICES\)/);
    assert.doesNotMatch(src, /OptionSheet/);
  });

  test('due date: the iOS calendar sheet within 2000–2100; the calendar day picked is sent as UTC midnight (05 B.25)', () => {
    const src = code(read(TASK_EDITOR));
    assert.match(src, /<DatePickerSheet[\s\S]*?minimumDate=\{DUE_DATE_MIN\}[\s\S]*?maximumDate=\{DUE_DATE_MAX\}[\s\S]*?onDone=\{\(date\) => update\(\{ dueDay: dayFromDate\(date\) \}\)\}/);
    assert.doesNotMatch(src, /DateTimePickerAndroid/);
    assert.equal(dayToDueDate(dayFromDate(new Date(2026, 10, 5, 23, 30))), '2026-11-05T00:00:00.000Z');
    assert.equal(dayToDueDate(dayFromDate(new Date(2026, 0, 1, 0, 5))), '2026-01-01T00:00:00.000Z');
  });

  test('the editor: a root sheet, one per task, titled in the bar, above the keyboard, asking before dropping changes', () => {
    assert.ok(SHEET_ROUTES.includes('TaskEditor'));
    assert.equal(getIdFor('TaskEditor')({ params: { ticketId: 't-1', taskId: 'k-1' } }), 't-1/k-1');
    const src = code(read(TASK_EDITOR));
    assert.match(src, /navigation\.setOptions\(\{ title \}\)/);
    assert.match(src, /<SheetKeyboardView>/);
    assert.match(src, /keyboardDismissMode="interactive"/);
    assert.match(src, /useDiscardGuard\(\{ dirty, busy: save\.isPending, what: 'task' \}\)/);
    assert.match(src, /paddingBottom: insets\.bottom \+ 24/, 'a sheet covers the tab bar, so it keeps the home-indicator inset');
  });

  test('END_USER: the editor refuses on screen, and each task write hook refuses on the device before any request', () => {
    assert.match(code(read(TASK_EDITOR)), /if \(!can\.edit\) \{\s*return \(/);
    const hooks = code(read('src/hooks/useTasks.ts'));
    for (const [hook, call] of [['useToggleTask', 'updateTask('], ['useSaveTask', 'createTask('], ['useDeleteTask', 'deleteTask(']]) {
      const body = fn(hooks, hook);
      const guard = body.indexOf('requireTaskEditor(requireRole(role))');
      assert.ok(guard > 0 && guard < body.indexOf(call), `${hook}: the guard runs before ${call}`);
    }
    assert.match(hooks, /function requireTaskEditor\(role[^)]*\): void \{\s*if \(!isStaff\(role\)\) throw refuse/);
    for (const role of ['END_USER', 'AGENT', 'L2_MANAGER', 'ADMIN']) assert.equal(taskPermissions(role).edit, isStaff(role), role);
  });

  test('the technician: ADMIN and AGENT search staff (TASK_ASSIGNEE_ROLES, as Android); L2_MANAGER sees it read-only', () => {
    assert.deepEqual(TASK_ASSIGNEE_ROLES, ['ADMIN', 'AGENT', 'L2_MANAGER']);
    const src = code(read(TASK_EDITOR));
    assert.match(src, /searchRoles=\{TASK_ASSIGNEE_ROLES\}/);
    assert.match(src, /\{canPickTechnician \? \(\s*<SelectField/);
    assert.equal(taskPermissions('L2_MANAGER').pickTechnician, false);
  });

  test('task detail: "Remove task" asks in red; "View parent ticket" goes back, or opens the ticket in the same tab', () => {
    const src = code(read(TASK));
    assert.match(src, /title: 'Remove this task\?'[\s\S]{0,200}destructive: true/);
    assert.match(src, /below\?\.name === 'TicketDetail' && below\.params\?\.ticketId === ticketId/);
    assert.match(src, /navigation\.navigate\('TicketDetail', \{ ticketId \}\);/);
    assert.match(src, /navigation\.navigate\('TaskEditor', \{ ticketId, taskId: task\.id \}\)/);
    assert.doesNotMatch(src, /MainTabs|TicketsTab/);
  });
});

// ══ 5. Knowledge base ════════════════════════════════════════

describe('knowledge base: article HTML through the app\'s sanitiser and react-native-render-html\'s own engine', () => {
  // The engine HtmlRenderProvider configures (TRenderEngineProvider builds the same TRenderEngine), with the app's
  // blocked tags; then the body as HtmlText hands it over: sanitizeForRender() first.
  const engine = new TRenderEngine({ ignoredDomTags: [...BLOCKED_TAGS], htmlParserOptions: { decodeEntities: true } });
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const BODY = `
    <h2>Connect to the VPN</h2>
    <p>Install the client from <a href="https://support.microsoft.com/vpn">Microsoft</a>, or write to
       <a href="mailto:it@mountmerugroup.com">IT</a>. Still stuck? See
       <a href="https://uat-servicedesk.mountmerugroup.com/ticket/1234">ticket #1234</a>.</p>
    <p><a href="javascript:alert(1)">bad</a> <a href="/relative">relative</a></p>
    <img src="${PNG}" alt="The VPN icon" />
    <img src="https://cdn.example.test/screenshot.png" />
    <table>
      <thead><tr><th>Site</th><th>Server</th></tr></thead>
      <tbody><tr><td>Dar es Salaam</td><td>vpn-dar</td></tr><tr><td>Arusha</td><td>vpn-aru</td></tr></tbody>
    </table>
    <ul><li>One</li><li>Two &amp; three</li></ul>
    <script>steal()</script><iframe src="https://evil.test"></iframe><style>p { color: white }</style>
    <form><input name="x"></form>`;

  function nodes(tree) {
    const all = [];
    const walk = (n) => {
      all.push(n);
      for (const child of n.children ?? []) walk(child);
    };
    walk(tree);
    return all;
  }
  const byTag = (all, tag) => all.filter((n) => n.tagName === tag);
  const text = (all) => all.map((n) => n.data ?? '').join('');

  test('builds without throwing, with its links, its inline image and its table', () => {
    const all = nodes(engine.buildTTree(sanitizeForRender(BODY)));
    assert.deepEqual(byTag(all, 'a').map((a) => a.attributes.href), [
      'https://support.microsoft.com/vpn',
      'mailto:it@mountmerugroup.com',
      'https://uat-servicedesk.mountmerugroup.com/ticket/1234',
      'javascript:alert(1)',
      '/relative',
    ]);
    const images = byTag(all, 'img');
    assert.equal(images.length, 1);
    assert.equal(images[0].attributes.src, PNG);
    assert.equal(byTag(all, 'table').length, 1);
    assert.equal(byTag(all, 'tr').length, 3);
    assert.equal(byTag(all, 'th').length, 2);
    assert.equal(byTag(all, 'td').length, 4);
    assert.equal(byTag(all, 'li').length, 2);
    assert.match(text(all), /Two & three/);
  });

  test('a remote image is never fetched: it becomes "[image]", so the renderer has no URL to load', () => {
    const html = sanitizeForRender(BODY);
    assert.doesNotMatch(html, /cdn\.example\.test/);
    assert.match(html, /\[image\]/);
  });

  test('script, frames, styles and forms are gone before the renderer sees them', () => {
    const html = sanitizeForRender(BODY);
    assert.doesNotMatch(html, /<script|steal\(|<iframe|evil\.test|<style|color: white|<form|<input/);
    const all = nodes(engine.buildTTree(html));
    for (const tag of ['script', 'iframe', 'style', 'form', 'input']) assert.equal(byTag(all, tag).length, 0, tag);
  });

  test('broken HTML does not throw either: unclosed tags, a table with no rows, stray entities, empty', () => {
    for (const body of ['<p><b>bold <i>both', '<table><td>lonely cell', '<table></table>', '&bogus; &#xZZ; &', '', '<a>no href</a>', '<img>']) {
      assert.doesNotThrow(() => engine.buildTTree(sanitizeForRender(body)), body);
    }
  });

  test('links: https and mailto open in Safari, a UAT ticket link in the app, anything else is not opened', () => {
    const src = code(read('src/components/HtmlText.tsx'));
    assert.match(src, /if \(!\/\^\(https\?:\|mailto:\)\/i\.test\(url\)\) return;/);
    assert.match(src, /parseTicketLink\(url\)\.ok && openTicketLinkInApp\(url\)\) return;/);
    assert.match(src, /Linking\.openURL\(url\)/);
    assert.equal(parseTicketLink('https://uat-servicedesk.mountmerugroup.com/ticket/1234').ok, true);
    assert.equal(parseTicketLink('https://servicedesk.example.test/ticket/1234').ok, false);
  });

  test('the article renders through HtmlText, whose renderer failure falls back to the plain text', () => {
    assert.match(code(read(ARTICLE)), /<HtmlText html=\{article\.body\}/);
    const html = code(read('src/components/HtmlText.tsx'));
    assert.match(html, /static getDerivedStateFromError\(\) \{\s*return \{ failed: true \};/);
    assert.match(html, /<RendererBoundary fallback=\{plain\(prepared\.fallbackText\)\}/);
  });

  test('the requests: never `published` (drafts, 05 C.15); search through KB-3; an article by slug; the vote by id', async () => {
    await listKbArticles({ categoryId: 'cat-1', page: 2 });
    await searchKb('vpn');
    await getKbArticle('connect-vpn');
    await markKbArticleHelpful('art-1');
    assert.deepEqual(sent.map((r) => [r.method, r.url]), [
      ['get', '/kb/articles'],
      ['get', '/kb/search'],
      ['get', '/kb/articles/connect-vpn'],
      ['post', '/kb/articles/art-1/helpful'],
    ]);
    assert.equal('published' in (sent[0].params ?? {}), false);
    assert.equal(sent[0].params.categoryId, 'cat-1');
    assert.deepEqual(sent[1].params, { q: 'vpn' });
  });
});

// ══ 6. The catalogue and profile on iOS ═══════════════════════

describe('the catalogue and profile on iOS', () => {
  test('Impact and Urgency: action sheets, "Not set" first, then the web form\'s options and labels', async () => {
    for (const [label, options] of [['Impact', REQUEST_IMPACT_OPTIONS], ['Urgency', REQUEST_URGENCY_OPTIONS]]) {
      const choices = [{ value: '__NOT_SET__', label: 'Not set' }, ...options];
      const picked = chooseForField(label, choices);
      assert.deepEqual(__actionSheet().options, ['Not set', ...options.map((o) => o.label), CANCEL_LABEL]);
      __pickActionSheet(1);
      assert.equal(await picked, options[0].value);
    }
    const src = code(read(FORM));
    assert.match(src, /const IMPACT_CHOICES: readonly SheetChoice<string>\[\] = \[\{ value: NOT_SET, label: 'Not set' \}, \.\.\.REQUEST_IMPACT_OPTIONS\];/);
    assert.match(src, /const URGENCY_CHOICES: readonly SheetChoice<string>\[\] = \[\{ value: NOT_SET, label: 'Not set' \}, \.\.\.REQUEST_URGENCY_OPTIONS\];/);
    assert.match(src, /chooseForField\('Impact', IMPACT_CHOICES\)[\s\S]*?if \(v !== null\) chooseImpact\(v\);/);
    assert.match(src, /chooseForField\('Urgency', URGENCY_CHOICES\)[\s\S]*?if \(v !== null\) chooseUrgency\(v\);/);
    assert.doesNotMatch(src, /OptionSheet/);
  });

  test('a date field: the iOS calendar sheet, any year (the web\'s date input sets none); a drop-down keeps its sheet', () => {
    const src = code(read(FIELD));
    assert.match(src, /<DatePickerSheet[\s\S]*?onDone=\{\(date\) => onChange\(dayFromDate\(date\)\)\}/);
    const sheet = src.slice(src.indexOf('<DatePickerSheet'), src.indexOf('/>', src.indexOf('<DatePickerSheet')));
    assert.doesNotMatch(sheet, /minimumDate|maximumDate/);
    assert.match(src, /case 'select': \{[\s\S]*?<OptionSheet/);
    assert.doesNotMatch(src, /DateTimePickerAndroid|\bnotify\(/);
  });

  test('no hardware back: the catalogue\'s "Home" breadcrumb leaves a category or a search; the swipe leaves the screen', () => {
    const src = code(read(CATALOG));
    assert.doesNotMatch(src, /BackHandler|hardwareBackPress|useFocusEffect/);
    assert.match(src, /accessibilityLabel="Back to all categories"[\s\S]{0,200}setCategory\(null\);\s*setSearch\(''\);/);
  });

  test('the long forms keep the focused field above the keyboard and the tab bar; a drag down puts it away', () => {
    for (const file of [FORM, PROFILE, APPROVAL]) {
      const src = code(read(file));
      assert.match(src, /automaticallyAdjustKeyboardInsets/, file);
      assert.match(src, /keyboardDismissMode="interactive"/, file);
      assert.match(src, /keyboardShouldPersistTaps="handled"/, file);
      assert.doesNotMatch(src, /KeyboardAvoidingView/, `${file}: a pushed screen measures the keyboard itself`);
    }
  });

  test('profile: only name, phone, department and timezone are ever sent (USR-2); never country, role or isActive', async () => {
    await updateOwnProfile('user-1', {
      displayName: 'Asha', phone: '', department: 'IT', timezone: 'Africa/Dar_es_Salaam', countryId: 'country-ke', role: 'ADMIN', isActive: false,
    });
    assert.deepEqual(sent, [{
      method: 'put', url: '/users/user-1', params: undefined, data: { displayName: 'Asha', phone: '', department: 'IT', timezone: 'Africa/Dar_es_Salaam' },
    }]);
    const src = code(read(PROFILE));
    assert.match(src, /countrySelectorMode\(user\)/);
    // No theme setting (D9: light only). The privacy link and the deletion request arrived in iOS-4 (H1, H6), pinned by
    // tests/screens/hig-polish.test.mjs.
    assert.doesNotMatch(src, /\bTheme\b|\bAppearance\b|Dark mode/, 'no theme setting (D9)');
  });

  test('a service request: no attachments, no confirmation, back to the catalogue\'s Home view (as the web; Q1)', () => {
    const src = code(read(FORM));
    assert.doesNotMatch(src, /AttachmentPicker|DocumentPicker|ImagePicker|uploadAttachments|confirmAction\(/);
    assert.match(src, /navigation\.popTo\('ServiceCatalog', \{ view: 'catalog', resetAt: Date\.now\(\) \}\)/);
    assert.ok(STACK_ROUTES.MoreTab.indexOf('ServiceCatalog') < STACK_ROUTES.MoreTab.indexOf('ServiceRequestForm'));
  });
});

// ══ 7. Every module screen ═══════════════════════════════════

describe('every module screen on iOS', () => {
  for (const file of MODULE_FILES) {
    test(path.basename(file), () => {
      const src = code(read(file));
      assert.doesNotMatch(src, /ScreenHeader/, 'the native navigation bar, not a drawn header');
      for (const refresh of src.match(/<RefreshControl\s[^>]*>/g) ?? []) assert.match(refresh, /tintColor=\{colors\.primary\}/);
      assert.doesNotMatch(
        src,
        /AppDrawerScreenProps|MainTabScreenProps|TasksStackScreenProps|TaskScreenProps|KnowledgeStackScreenProps|CatalogStackScreenProps|ApprovalsStackScreenProps/,
        'Android\'s drawer and module-stack props',
      );
      if (file !== TASK_EDITOR) assert.doesNotMatch(src, /useSafeAreaInsets/, 'the tab bar already takes the home-indicator inset');
    });
  }

  test('each screen names no role and takes no role from a default of its own', () => {
    for (const file of MODULE_FILES) {
      const src = code(read(file));
      assert.doesNotMatch(src, /['"](ADMIN|AGENT|END_USER|L2_MANAGER)['"]/, file);
      assert.doesNotMatch(src, /\?\? 'END_USER'/, file);
    }
  });
});
