// Typed param lists for every navigator. iOS structure (docs/ios/00-PORT-MANIFEST.md §4.5), replacing Android's drawer:
// Root → (Auth stack | App tabs + the sheets); App tabs → Home · Tickets · Approvals (ADMIN, AGENT) · Alerts · More, each
// a native stack. The record screens (ticket, task, approval, ticket link) are registered in EVERY tab stack, so a
// record opens in the tab the person is in. The sheets sit above the tabs in the root stack and cover the tab bar.
// Which routes each stack has, their getId and their titles: src/navigation/routes.ts.
// This file is client navigation, not an API shape, so it is the one file in src/types/ that does not come from 03.
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

// ── Record screens: in every tab stack ───────────────────────
export type RecordScreensParamList = {
  /** M4 */
  TicketDetail: { ticketId: UUID };
  /** Task detail (tasks module). */
  TaskDetail: { ticketId: UUID; taskId: UUID };
  /** M13. The approval row comes from the APR-1 list (there is no GET /approvals/:id in 01). */
  ApprovalDetail: { approvalId: UUID };
  /**
   * In-app deep-link resolver (05 §A.11): `link` is an email link (`…/ticket/<n>`, `…/tickets/<uuid or n>`) or "#1234".
   * OS-level app links are not handled (they need ask A18).
   */
  TicketLink: { link: string };
};

// ── Tab stacks ───────────────────────────────────────────────
export type HomeStackParamList = RecordScreensParamList & {
  /** M2 */
  Home: undefined;
  /** M16, from Home's announcement banner. */
  Announcements: undefined;
};

export type TicketsStackParamList = RecordScreensParamList & {
  /** M3. `filter` lets Home tiles open the list with a named filter pre-applied (08 §3.3, §4.5). */
  TicketList: { filter?: TicketNamedFilter } | undefined;
};

/** ADMIN and AGENT only (permissions.ts hasApprovalsTab). */
export type ApprovalsStackParamList = RecordScreensParamList & {
  /** M12 */
  ApprovalsInbox: undefined;
};

export type AlertsStackParamList = RecordScreensParamList & {
  /** M9 */
  Notifications: undefined;
};

/** The drawer's modules, flat in one stack, so each module's first screen swipes back to More. */
export type MoreStackParamList = RecordScreensParamList & {
  /** The More list (permissions.ts moreSections). */
  More: undefined;
  /** M12 for END_USER and L2_MANAGER, while APR-1 returns ≥ 1 (08 S1). */
  ApprovalsInbox: undefined;
  /** Standalone tasks. Built from the tickets in TKT-1 pages — there is no task-list endpoint (A20). */
  TaskList: undefined;
  /** M14 */
  KnowledgeBase: undefined;
  /** M15. KB-4 takes the slug, not the id. */
  KbArticle: { slug: string };
  /**
   * Service catalogue (Phase G4; docs/G4-WEB-CATALOGUE.md): the catalogue and My Requests, as the web's two views.
   * `resetAt` changes after a request is sent: the catalogue returns to its Home view, as the web reopens it fresh.
   */
  ServiceCatalog: { view?: 'catalog' | 'requests'; resetAt?: number } | undefined;
  /** An item's request form (SCR-3, SCR-5). */
  ServiceRequestForm: { itemId: UUID };
  /** One of my requests (SCR-6). Mobile only: the web has no request detail. */
  ServiceRequestDetail: { requestId: UUID };
  /** M16 */
  Announcements: undefined;
  /** M10 — from the account card and the "Settings" row. */
  Profile: undefined;
};

export type AppTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  TicketsTab: NavigatorScreenParams<TicketsStackParamList>;
  ApprovalsTab: NavigatorScreenParams<ApprovalsStackParamList>;
  AlertsTab: NavigatorScreenParams<AlertsStackParamList>;
  MoreTab: NavigatorScreenParams<MoreStackParamList>;
};

// ── Sheets: above the tabs, in the root stack ────────────────
export type SheetsParamList = {
  /** M8. A sheet on iOS; on success it closes and the new ticket opens in the tab underneath. */
  CreateTicket: undefined;
  /** M5 */
  ReplyComposer: { ticketId: UUID; mode: 'reply' | 'replyAll' | 'note' };
  /** M6. One ticket from M4, or up to 20 from M3 bulk mode (08 §4.2). */
  StatusClosure: { ticketIds: UUID[]; target?: TicketStatus };
  /** M7. One ticket from M4, or up to 20 from M3 bulk mode (08 §4.2). */
  AssignPicker: { ticketIds: UUID[] };
  /** "Submit for approval" from M4's More options (Phase G3, APR-4). ADMIN and AGENT. */
  SubmitApproval: { ticketId: UUID };
  /** M11. No `taskId` = create. */
  TaskEditor: { ticketId: UUID; taskId?: UUID };
  /** M3's Filters sheet (Phase G2): priority, category, created date, technician, group. State lives in ui.store. */
  TicketFilters: undefined;
};

// ── Root ─────────────────────────────────────────────────────
export type RootStackParamList = SheetsParamList & {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppTabParamList>;
};

// ── Screen props ─────────────────────────────────────────────
export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export type AuthStackScreenProps<T extends keyof AuthStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<AuthStackParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

export type AppTabScreenProps<T extends keyof AppTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

export type HomeStackScreenProps<T extends keyof HomeStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, T>,
  AppTabScreenProps<keyof AppTabParamList>
>;

export type TicketsStackScreenProps<T extends keyof TicketsStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<TicketsStackParamList, T>,
  AppTabScreenProps<keyof AppTabParamList>
>;

export type ApprovalsStackScreenProps<T extends keyof ApprovalsStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<ApprovalsStackParamList, T>,
  AppTabScreenProps<keyof AppTabParamList>
>;

export type AlertsStackScreenProps<T extends keyof AlertsStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<AlertsStackParamList, T>,
  AppTabScreenProps<keyof AppTabParamList>
>;

export type MoreStackScreenProps<T extends keyof MoreStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<MoreStackParamList, T>,
  AppTabScreenProps<keyof AppTabParamList>
>;

/**
 * Props of the record screens, which are registered in all five tab stacks. Typed against their shared param list
 * plus the tabs, so a screen can reach any tab; at runtime `navigate` stays in the stack it is in.
 */
export type RecordScreenProps<T extends keyof RecordScreensParamList> = CompositeScreenProps<
  NativeStackScreenProps<RecordScreensParamList, T>,
  AppTabScreenProps<keyof AppTabParamList>
>;

export type SheetScreenProps<T extends keyof SheetsParamList> = RootStackScreenProps<T>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
