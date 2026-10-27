// The iOS route table (docs/ios/00-PORT-MANIFEST.md §4.5): which routes each tab stack registers, which routes take a
// record id (and so get getId), the sheets above the tabs, and every route's title. The navigators are built from it
// and tests/navigation reads it, so what is tested is what runs. Plain data and pure functions: no React Native here.
import type {
  AlertsStackParamList,
  ApprovalsStackParamList,
  HomeStackParamList,
  MoreStackParamList,
  RecordScreensParamList,
  SheetsParamList,
  TicketsStackParamList,
  UserRole,
} from '@/types';
import { appTabs, type AppTab } from '@/utils/permissions';

/** Registered in every tab stack, so a record opens in the tab the person is in (Android switched to Tickets). */
export const RECORD_ROUTES = ['TicketDetail', 'TaskDetail', 'ApprovalDetail', 'TicketLink'] as const;

/** Each tab's native stack, root first. */
export const STACK_ROUTES = {
  HomeTab: ['Home', 'Announcements', ...RECORD_ROUTES],
  TicketsTab: ['TicketList', ...RECORD_ROUTES],
  ApprovalsTab: ['ApprovalsInbox', ...RECORD_ROUTES],
  AlertsTab: ['Notifications', ...RECORD_ROUTES],
  MoreTab: [
    'More',
    'ApprovalsInbox',
    'TaskList',
    'KnowledgeBase',
    'KbArticle',
    'ServiceCatalog',
    'ServiceRequestForm',
    'ServiceRequestDetail',
    'Announcements',
    'Profile',
    ...RECORD_ROUTES,
  ],
} as const;

/** Sheets: in the root stack above the tabs, presented as iOS page sheets that cover the tab bar. */
export const SHEET_ROUTES = [
  'CreateTicket',
  'ReplyComposer',
  'StatusClosure',
  'AssignPicker',
  'SubmitApproval',
  'TaskEditor',
  'TicketFilters',
] as const;

// Compile-time: each list holds exactly its param list's routes, no more and no fewer.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Routes<T extends AppTab> = (typeof STACK_ROUTES)[T][number];
const exact: {
  home: Same<Routes<'HomeTab'>, keyof HomeStackParamList>;
  tickets: Same<Routes<'TicketsTab'>, keyof TicketsStackParamList>;
  approvals: Same<Routes<'ApprovalsTab'>, keyof ApprovalsStackParamList>;
  alerts: Same<Routes<'AlertsTab'>, keyof AlertsStackParamList>;
  more: Same<Routes<'MoreTab'>, keyof MoreStackParamList>;
  records: Same<(typeof RECORD_ROUTES)[number], keyof RecordScreensParamList>;
  sheets: Same<(typeof SHEET_ROUTES)[number], keyof SheetsParamList>;
} = { home: true, tickets: true, approvals: true, alerts: true, more: true, records: true, sheets: true };
void exact;

export type StackRoute = Routes<AppTab>;
export type SheetRoute = (typeof SHEET_ROUTES)[number];

/**
 * One screen per record (docs/PERFORMANCE.md §9.7): the param that names the record a route shows. React Navigation
 * reuses the current screen when the same route name is opened again; with getId, another record always gets its own
 * screen, so a staged upload, a typed comment or an Approve can't move to another ticket or approval.
 */
export const RECORD_ID_PARAM = {
  TicketDetail: 'ticketId',
  TaskDetail: 'taskId',
  ApprovalDetail: 'approvalId',
  KbArticle: 'slug',
  ServiceRequestForm: 'itemId',
  ServiceRequestDetail: 'requestId',
} as const satisfies Partial<Record<StackRoute, string>>;

/**
 * Routes with params but no getId, on purpose (as Android, §9.7). Anything else with params must be in RECORD_ID_PARAM
 * (tests/navigation/get-id.test.mjs).
 */
export const WITHOUT_GET_ID: Partial<Record<StackRoute | SheetRoute, string>> = {
  TicketLink: 'Holds no state of its own: everything comes from `link`, so a reused resolver resolves the new link.',
  TicketList: 'The list root; a filter from Home replaces the one shown, as on Android (`pop: true`).',
  ServiceCatalog: 'The catalogue root; `view` and `resetAt` switch what it shows, as on Android.',
  ReplyComposer: 'A sheet: it opens only from the screen beneath it and covers everything, so it is never current when opened again.',
  StatusClosure: 'A sheet (as ReplyComposer).',
  AssignPicker: 'A sheet (as ReplyComposer).',
  SubmitApproval: 'A sheet (as ReplyComposer).',
  TaskEditor: 'A sheet (as ReplyComposer).',
};

type GetId = (options: { params: Readonly<object | undefined> }) => string | undefined;

/** The route's getId, or undefined when it shows no single record. */
export function getIdFor(name: string): GetId | undefined {
  const key = (RECORD_ID_PARAM as Record<string, string>)[name];
  if (!key) return undefined;
  return ({ params }) => {
    const value = (params as Record<string, unknown> | undefined)?.[key];
    return typeof value === 'string' ? value : undefined;
  };
}

/** Tab roots get the iOS large title; every pushed screen a standard one (HIG, Toolbars). */
export function isStackRoot(tab: AppTab, name: string): boolean {
  return STACK_ROUTES[tab][0] === name;
}

/** Header titles, as on Android. Screens that show a record's own title set it themselves (iOS-4). */
const TITLES: Record<Exclude<StackRoute | SheetRoute, 'TicketList'>, string> = {
  Home: 'Home',
  Announcements: 'Announcements',
  TicketDetail: 'Ticket',
  TaskDetail: 'Task',
  ApprovalDetail: 'Approval',
  TicketLink: 'Ticket link',
  ApprovalsInbox: 'Approvals',
  Notifications: 'Notifications',
  More: 'More',
  TaskList: 'Tasks',
  KnowledgeBase: 'Knowledge base',
  KbArticle: 'Article',
  ServiceCatalog: 'Service Request',
  ServiceRequestForm: 'New request',
  ServiceRequestDetail: 'Service request',
  Profile: 'Profile & settings',
  CreateTicket: 'New ticket',
  ReplyComposer: 'Reply',
  StatusClosure: 'Change status',
  AssignPicker: 'Assign',
  SubmitApproval: 'Submit for approval',
  TaskEditor: 'Task',
  TicketFilters: 'Filters',
};

/** The list's title is the Tickets tab's ("My Tickets" for END_USER), from permissions.ts. */
export function routeTitle(name: StackRoute | SheetRoute, role: UserRole | null | undefined): string {
  if (name !== 'TicketList') return TITLES[name];
  return appTabs(role).find((tab) => tab.name === 'TicketsTab')?.title ?? TITLES.TicketDetail;
}

/**
 * The tab on screen, read from the navigation state: null while the sign-in screens or a sheet are on top (nothing
 * should open under them), 'HomeTab' before the tabs have a state of their own (they start on Home).
 */
export function focusedAppTab(rootState: unknown): AppTab | null {
  const root = rootState as { index?: number; routes?: { name: string; state?: unknown }[] } | undefined;
  const routes = root?.routes;
  if (!routes?.length) return null;
  const top = routes[root?.index ?? routes.length - 1];
  if (top?.name !== 'App') return null;
  const tabs = top.state as { index?: number; routes?: { name: string }[] } | undefined;
  const name = tabs?.routes?.[tabs.index ?? 0]?.name;
  return (name as AppTab | undefined) ?? 'HomeTab';
}
