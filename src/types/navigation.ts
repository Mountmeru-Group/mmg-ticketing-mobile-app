// Typed param lists for every navigator. Structure follows 08-SDP-PARITY.md §3:
// Root → (Auth stack | App drawer); drawer → (bottom tabs Home · Tickets · Alerts | Approvals | Tasks | Knowledge |
// Announcements | Profile); Tickets tab → TicketStack (list → detail → reply / status / assign / create / task).
// Task detail and the task editor are registered in BOTH the Tickets stack (from a ticket's Tasks tab) and the Tasks
// stack (from the standalone list), with the same params (TaskScreensParamList).
// This file is client navigation, not an API shape, so it is the one file in src/types/ that does not come from 03.
import type { DrawerScreenProps } from '@react-navigation/drawer';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TicketNamedFilter } from '@/utils/ticket-filters';
import type { UUID } from './api';
import type { TicketStatus } from './enums';

// ── Auth ─────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  /** __DEV__ only — interim bridge until SSO (ask A2). Not registered in release builds. */
  DevToken: undefined;
};

// ── Tickets tab (TicketStack) ────────────────────────────────
export type TicketStackParamList = {
  /** M3. `filter` lets Home tiles open the list with a named filter pre-applied (08 §3.3, §4.5). */
  TicketList: { filter?: TicketNamedFilter } | undefined;
  /** M3's Filters sheet (Phase G2): priority, category, created date, technician, group. State lives in ui.store. */
  TicketFilters: undefined;
  /** M4 */
  TicketDetail: { ticketId: UUID };
  /** M5 */
  ReplyComposer: { ticketId: UUID; mode: 'reply' | 'replyAll' | 'note' };
  /** M6. One ticket from M4, or up to 20 from M3 bulk mode (08 §4.2). */
  StatusClosure: { ticketIds: UUID[]; target?: TicketStatus };
  /** M7. One ticket from M4, or up to 20 from M3 bulk mode (08 §4.2). */
  AssignPicker: { ticketIds: UUID[] };
  /** M8 */
  CreateTicket: undefined;
  /** M11. No `taskId` = create. */
  TaskEditor: { ticketId: UUID; taskId?: UUID };
  /** Task detail (Phase 4 tasks module). */
  TaskDetail: { ticketId: UUID; taskId: UUID };
  /**
   * In-app deep-link resolver (05 §A.11): `link` is an email link (`…/ticket/<n>`, `…/tickets/<uuid or n>`) or "#1234".
   * OS-level app links are not handled (they need ask A18).
   */
  TicketLink: { link: string };
};

/** Screens registered in both TicketStack and TasksStack. */
export type TaskScreensParamList = Pick<TicketStackParamList, 'TaskDetail' | 'TaskEditor'>;

// ── Bottom tabs (inside the drawer) ──────────────────────────
export type MainTabParamList = {
  HomeTab: undefined;
  TicketsTab: NavigatorScreenParams<TicketStackParamList>;
  AlertsTab: undefined;
};

// ── Drawer modules ───────────────────────────────────────────
export type ApprovalsStackParamList = {
  /** M12 */
  ApprovalsInbox: undefined;
  /** M13. The approval row comes from the APR-1 list (there is no GET /approvals/:id in 01). */
  ApprovalDetail: { approvalId: UUID };
};

/** Standalone tasks module (drawer). Tasks are read from the tickets in TKT-1 pages — there is no task-list endpoint (A20). */
export type TasksStackParamList = TaskScreensParamList & {
  TaskList: undefined;
};

export type KnowledgeStackParamList = {
  /** M14 */
  KnowledgeBase: undefined;
  /** M15. KB-4 takes the slug, not the id. */
  KbArticle: { slug: string };
};

export type AppDrawerParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Approvals: NavigatorScreenParams<ApprovalsStackParamList>;
  Tasks: NavigatorScreenParams<TasksStackParamList>;
  Knowledge: NavigatorScreenParams<KnowledgeStackParamList>;
  /** M16 */
  Announcements: undefined;
  /** M10 — opened from the drawer's account card and the "Settings" item. */
  Profile: undefined;
};

// ── Root ─────────────────────────────────────────────────────
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppDrawerParamList>;
};

// ── Screen props ─────────────────────────────────────────────
export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export type AuthStackScreenProps<T extends keyof AuthStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<AuthStackParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

export type AppDrawerScreenProps<T extends keyof AppDrawerParamList> = CompositeScreenProps<
  DrawerScreenProps<AppDrawerParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  AppDrawerScreenProps<keyof AppDrawerParamList>
>;

export type TicketStackScreenProps<T extends keyof TicketStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<TicketStackParamList, T>,
  MainTabScreenProps<keyof MainTabParamList>
>;

export type ApprovalsStackScreenProps<T extends keyof ApprovalsStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<ApprovalsStackParamList, T>,
  AppDrawerScreenProps<keyof AppDrawerParamList>
>;

/**
 * Props of TaskDetail / TaskEditor, which are registered in BOTH TicketStack and TasksStack. Typed against the shared
 * param list plus the drawer, so a screen can reach any module; at runtime `navigate` bubbles up from either stack.
 */
export type TaskScreenProps<T extends keyof TaskScreensParamList> = CompositeScreenProps<
  NativeStackScreenProps<TaskScreensParamList, T>,
  AppDrawerScreenProps<keyof AppDrawerParamList>
>;

export type TasksStackScreenProps<T extends keyof TasksStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<TasksStackParamList, T>,
  AppDrawerScreenProps<keyof AppDrawerParamList>
>;

export type KnowledgeStackScreenProps<T extends keyof KnowledgeStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<KnowledgeStackParamList, T>,
  AppDrawerScreenProps<keyof AppDrawerParamList>
>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
