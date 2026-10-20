// Every role-gated UI element, decided in ONE place (Phase D-pre RBAC audit; expected behaviour: docs/ROLE-MATRIX.md).
// - Screens render the lists and flags returned here; they never compare roles themselves.
// - tests/rbac/role-gating.test.mjs pins every answer for each role and the triage AGENT, so a screen can only become
//   more permissive by changing this file, and then a test fails.
// - Rule for unavailable actions (ROLE-MATRIX.md §3):
//   - a capability the role will NEVER have is left out of the list (HIDDEN);
//   - one the role has but the ticket's state blocks is still decided here, and the screen DISABLES it or explains why.
// Gating mirrors the web UI for UX only; the server stays the authority (05 §C rule 3). Pure functions, no UI.
import type { AuthUser, TicketStatus, UserRole } from '@/types';
import { canSeePrivateNotes } from './activity';
import { isAgentOrAdmin, isStaff, isTriageAgent } from './roles';
import { canAssignToSelf } from './session';
import { canChangeStatus, getAvailableTransitions, isResolvedLocked, type StatusTransition } from './ticket-rules';

/** The signed-in user, as the gates need it. `id` is only used to hide "Pick up" on one's own ticket. */
export type Viewer = Pick<AuthUser, 'id' | 'role' | 'countryId'>;

// ── Navigation (08 §3) ───────────────────────────────────────

export type DrawerItem = 'approvals' | 'tasks' | 'knowledge' | 'announcements' | 'settings';

/**
 * Drawer rows, top to bottom (08 §3.2). Sign out and the account card are on every drawer and are not listed.
 * Approvals: ADMIN/AGENT always; END_USER and L2_MANAGER only while APR-1 returns ≥ 1 (08 S1).
 */
export function drawerItems(role: UserRole, pendingApprovals: number): DrawerItem[] {
  const items: DrawerItem[] = [];
  if (isAgentOrAdmin(role) || pendingApprovals >= 1) items.push('approvals');
  items.push('tasks', 'knowledge', 'announcements', 'settings');
  return items;
}

export type MainTab = 'HomeTab' | 'TicketsTab' | 'AlertsTab';

/** Bottom tabs: the same three for every role, in this order (08 §3.1). END_USER's Tickets tab is "My Tickets". */
export function mainTabs(role: UserRole): { name: MainTab; title: string }[] {
  return [
    { name: 'HomeTab', title: 'Home' },
    { name: 'TicketsTab', title: ticketsTitle(role) },
    { name: 'AlertsTab', title: 'Alerts' },
  ];
}

/** Title of the Tickets tab and of the list screen's header. */
export function ticketsTitle(role: UserRole): string {
  return role === 'END_USER' ? 'My Tickets' : 'Tickets';
}

// ── Home (04 M2, 05 B.20) ────────────────────────────────────

/** END_USER: own counts and "Raise a ticket". L2_MANAGER: tiles without counts (DSH-1 is per-role cached, C.19). */
export type HomeVariant = 'endUser' | 'staff' | 'l2';

export function homeVariant(role: UserRole): HomeVariant {
  if (role === 'END_USER') return 'endUser';
  if (role === 'L2_MANAGER') return 'l2';
  return 'staff';
}

export type HomeTile = 'open' | 'resolved' | 'inProgress' | 'onHold' | 'slaBreached' | 'totalOpen' | 'unassigned';

/** KPI tiles in order. `unassigned` only for ADMIN and the UI's triage AGENT (04 M2; the count is mis-scoped otherwise). */
export function homeTiles(viewer: Pick<AuthUser, 'role' | 'countryId'>): HomeTile[] {
  if (viewer.role === 'END_USER') return ['open', 'resolved'];
  const tiles: HomeTile[] = ['open', 'inProgress', 'onHold', 'slaBreached', 'totalOpen'];
  if (viewer.role === 'ADMIN' || isTriageAgent(viewer)) tiles.push('unassigned');
  return tiles;
}

/** "Pending approvals" shortcut on Home: the same rule as the drawer row (08 S1). */
export function showApprovalsShortcut(role: UserRole, pendingApprovals: number): boolean {
  return drawerItems(role, pendingApprovals).includes('approvals');
}

// ── Ticket detail (04 M4, 05 §A.1–§A.5) ──────────────────────

/** Composer modes, which are also the Conversation buttons on M4 (05 §A.5). */
export type ComposerMode = 'reply' | 'replyAll' | 'note';

/** Reply: everyone. Reply all: staff. Note (PRIVATE): ADMIN and AGENT only — absent for END_USER and L2_MANAGER. */
export function composerModes(role: UserRole): ComposerMode[] {
  const modes: ComposerMode[] = ['reply'];
  if (isStaff(role)) modes.push('replyAll');
  if (canSeePrivateNotes(role)) modes.push('note');
  return modes;
}

export interface ComposerPermissions {
  modes: ComposerMode[];
  /** To / Cc chips on public replies: staff. END_USER's recipients are built by the server (04 M5, 01 CMT-2). */
  recipients: boolean;
  /** Address suggestions from USR-3: ADMIN and AGENT (403 for everyone else). */
  suggestRecipients: boolean;
}

export function composerPermissions(role: UserRole): ComposerPermissions {
  return { modes: composerModes(role), recipients: isStaff(role), suggestRecipients: isAgentOrAdmin(role) };
}

export type MoreAction = 'pickup' | 'assign' | 'close';

export interface TicketDetailPermissions {
  /**
   * AGENT on a CLOSED/CANCELED ticket (05 §A.1 `isResolvedLocked`). A state, not a role limit: the status card stays
   * and says why it has no buttons, while Pick up, Assign and "Add files" drop out until the ticket is reopened.
   */
  locked: boolean;
  /** The "Change status" card. Hidden for END_USER; for a locked AGENT it shows why there are no buttons. */
  statusBar: boolean;
  /** Buttons on the status card (05 §A.1 map; none for a locked AGENT). */
  transitions: readonly StatusTransition[];
  /** The header's "More options" sheet; the ⋮ button is hidden when this is empty. */
  moreActions: MoreAction[];
  /** Buttons above the conversation, each opening M5 in that mode. */
  conversationActions: ComposerMode[];
  /** PRIVATE notes, their history entries and their recipients line. */
  privateNotes: boolean;
  /** Impact, urgency, the "Auto" priority pill and first-response time (05 §A.3: hidden for END_USER). */
  classification: boolean;
  /** To / Cc addresses on public replies (staff, 05 §A.5). */
  recipients: boolean;
  /** "Add files" on the Attachments tab (05 §A.3: blocked only by the AGENT lock). */
  addAttachments: boolean;
  /** Tasks: tick done / not done, add, edit, remove (05 §A.3: END_USER read-only, D4). */
  editTasks: boolean;
}

export function ticketDetailPermissions(
  viewer: Viewer | null,
  ticket: { status: TicketStatus; assignedToId: string | null },
): TicketDetailPermissions {
  const role: UserRole = viewer?.role ?? 'END_USER';
  const locked = isResolvedLocked(role, ticket.status);
  const transitions = getAvailableTransitions(role, ticket.status);

  const moreActions: MoreAction[] = [];
  if (isAgentOrAdmin(role) && !locked) {
    if (canAssignToSelf(viewer) && ticket.assignedToId !== viewer?.id) moreActions.push('pickup');
    moreActions.push('assign');
  }
  if (transitions.some((t) => t.target === 'CLOSED')) moreActions.push('close');

  return {
    locked,
    statusBar: canChangeStatus(role),
    transitions,
    moreActions,
    conversationActions: composerModes(role),
    privateNotes: canSeePrivateNotes(role),
    classification: isStaff(role),
    recipients: isStaff(role),
    addAttachments: !locked,
    editTasks: isStaff(role),
  };
}

/**
 * Last guard at the point of display: a PRIVATE note renders only for a role that may see notes, whatever the server
 * sent. CMT-1 already withholds notes from END_USER and L2, but TKT-7 sends them to L2 (`tickets.controller.ts:1014`),
 * so the app never relies on the server's filter (visibleComments() applies the same rule to the list first).
 */
export function isCommentVisible(comment: { type: string }, can: Pick<TicketDetailPermissions, 'privateNotes'>): boolean {
  return comment.type === 'PUBLIC' || (comment.type === 'PRIVATE' && can.privateNotes);
}

// ── Ticket list (04 M3, 08 §4) ───────────────────────────────

export type BulkAction = 'pickup' | 'assign' | 'close';

/**
 * Tap-and-hold multi-select and its action bar: staff only (08 §4.2). Pick up and Assign: ADMIN and AGENT (L2 gets
 * 403); Close: every role that can change status. Empty for END_USER, so the long-press does nothing.
 */
export function bulkActions(viewer: Pick<AuthUser, 'id' | 'role'> | null): BulkAction[] {
  const role: UserRole = viewer?.role ?? 'END_USER';
  if (!isStaff(role)) return [];
  const actions: BulkAction[] = [];
  if (isAgentOrAdmin(role)) {
    if (canAssignToSelf(viewer)) actions.push('pickup');
    actions.push('assign');
  }
  if (canChangeStatus(role)) actions.push('close');
  return actions;
}

/** The inline status chip on a list card (08 §4.1): the transitions for that row, or none (chip not tappable). */
export function inlineStatusTransitions(role: UserRole, status: TicketStatus): readonly StatusTransition[] {
  return canChangeStatus(role) ? getAvailableTransitions(role, status) : [];
}
