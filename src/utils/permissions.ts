// Every role-gated UI element, decided in ONE place (Phase D-pre RBAC audit; expected behaviour: docs/ROLE-MATRIX.md).
// - Screens render the lists and flags returned here; they never compare roles themselves.
// - tests/rbac/role-gating.test.mjs pins every answer for each role and the triage AGENT, so a screen can only become
//   more permissive by changing this file, and then a test fails.
// - Rule for unavailable actions (ROLE-MATRIX.md §3):
//   - a capability the role will NEVER have is left out of the list (HIDDEN);
//   - one the role has but the ticket's state blocks is still decided here, and the screen DISABLES it or explains why.
// Gating mirrors the web UI for UX only; the server stays the authority (05 §C rule 3). Pure functions, no UI.
import type { AuthUser, TicketStatus, UpdateTicketBody, UserRole } from '@/types';
import { canSeePrivateNotes } from './activity';
import { isAgentOrAdmin, isStaff, isTriageAgent } from './roles';
import { canAssignToSelf } from './session';
import { countrySelectorMode } from './ticket-filters';
import { canChangeStatus, getAvailableTransitions, isResolvedLocked, type StatusTransition } from './ticket-rules';
import type { TicketListFilterKey } from './ticket-filters';

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
  /** The "Templates" button, in every mode (Phase G3). */
  templates: boolean;
}

export function composerPermissions(role: UserRole): ComposerPermissions {
  return {
    modes: composerModes(role),
    recipients: isStaff(role),
    suggestRecipients: isAgentOrAdmin(role),
    templates: canUseReplyTemplates(role),
  };
}

// ── Phase G3 (the web's behaviour, with sources: docs/G3-WEB-BEHAVIOUR.md) ──

/** Every role the app knows; anything else (a malformed session) gets no templates. */
const REPLY_TEMPLATE_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(['END_USER', 'AGENT', 'L2_MANAGER', 'ADMIN']);

/**
 * Reply templates (LKP-7): every role, in Reply, Reply all and Private note. The web's picker has no role check
 * (FE:TicketDetailPage.tsx:1046) and the server lists active templates to anyone signed in (cannedResponses.router.ts:15).
 */
export function canUseReplyTemplates(role: UserRole): boolean {
  return REPLY_TEMPLATE_ROLES.has(role);
}

/**
 * Delete a file (ATT-5): ADMIN, AGENT, L2_MANAGER (web :1345 `role !== 'END_USER'`; the server refuses END_USER).
 * Any file on the ticket, whoever uploaded it, in every status: the AGENT lock does not apply (web :1268 vs :1345).
 */
export function canDeleteAttachments(role: UserRole): boolean {
  return isStaff(role);
}

/**
 * Submit for approval (APR-4): ADMIN and AGENT, the server's `agentOrAdmin` (approvals.router.ts:8). The web also shows
 * it to END_USER and L2_MANAGER, who always get 403, so it is hidden for them (WEB-VS-MOBILE-ROLES.md §5). Every
 * status, with no AGENT lock: neither the web (:697, :1585) nor the server checks one.
 */
export function canSubmitForApproval(role: UserRole): boolean {
  return isAgentOrAdmin(role);
}

export type MoreAction = 'pickup' | 'assign' | 'close' | 'approval';

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
  /** The delete button on each file of the Attachments tab (G3): staff, never lock-gated. */
  deleteAttachments: boolean;
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
  if (canSubmitForApproval(role)) moreActions.push('approval');

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
    deleteAttachments: canDeleteAttachments(role),
    editTasks: isStaff(role),
  };
}

// ── Ticket property editors on M4 (Phase G1; the web's behaviour, with sources: docs/G1-WEB-BEHAVIOUR.md) ──

/** The fields M4 edits through TKT-4. Impact and urgency share one rule and one editor. */
export type TicketField = 'impact' | 'urgency' | 'category' | 'country' | 'resolution';

export type FieldAccess =
  /** The editor is offered. */
  | { mode: 'edit' }
  /** The role has this edit, but the ticket's state (or the person's country lock) blocks it: show the value and why. */
  | { mode: 'locked'; reason: string }
  /** The role never edits it: the value only, with no editor and no reason (ROLE-MATRIX.md §3 rule 1). */
  | { mode: 'view' }
  /** Not shown at all. */
  | { mode: 'hidden' };

export interface TicketFieldPermissions extends Record<TicketField, FieldAccess> {
  /** Show, before Save, the priority the server will compute. LKP-6 is ADMIN/AGENT only (403 for L2, as on the web). */
  priorityPreview: boolean;
}

export const AGENT_LOCK_REASON = 'Closed and canceled tickets are locked for technicians.';
export const COUNTRY_LOCK_REASON = "You're locked to your own country, so only an Admin or a triage technician can change a ticket's country.";
export const RESOLUTION_STATE_REASON = 'The resolution can be edited only while the ticket is Resolved or Closed.';
export const PRIORITY_ALONE_REASON = 'The priority follows impact and urgency, so it is only sent with an impact or urgency change.';

/** Statuses in which the web offers the resolution editor (FE:TicketDetailPage.tsx:1440). CANCELED is not one. */
export const RESOLUTION_EDIT_STATUSES: ReadonlySet<TicketStatus> = new Set<TicketStatus>(['RESOLVED', 'CLOSED']);

/** TKT-4 body key → the field whose rule decides it. A key missing here is not editable from the app at all. */
export const FIELD_OF_UPDATE_KEY: Partial<Record<keyof UpdateTicketBody, TicketField>> = {
  impact: 'impact',
  urgency: 'urgency',
  categoryId: 'category',
  countryId: 'country',
  resolution: 'resolution',
};

const EDIT: FieldAccess = { mode: 'edit' };
const VIEW: FieldAccess = { mode: 'view' };
const HIDDEN: FieldAccess = { mode: 'hidden' };
const lockedBy = (reason: string): FieldAccess => ({ mode: 'locked', reason });

/**
 * Who may edit which property on M4, in this ticket state. The screen renders the editors from this, and the write
 * guard (useUpdateTicket → fieldEditProblem) refuses anything this does not return as `edit`.
 * - Impact, urgency: staff; the AGENT lock applies (web :1737-1774). END_USER: hidden (05 §A.3, a decision).
 * - Category: ADMIN and AGENT; the AGENT lock applies. L2_MANAGER and END_USER see it read-only (web :1951-1960).
 * - Country: the 05 §A.12 roles (G1 brief): ADMIN and triage AGENT edit; a country AGENT sees it locked; L2_MANAGER and
 *   END_USER see the value only. Not lock-gated by status (web :2199). The web lets every AGENT edit (G1 D2); Ronit
 *   decided in G2 to keep it locked (ROLE-MATRIX §8 item 12, RESOLVED).
 * - Resolution: staff while RESOLVED or CLOSED, with no AGENT lock (web :1438-1486). END_USER read-only (D3, 🔒 SAFER).
 */
export function ticketFieldPermissions(
  viewer: Pick<AuthUser, 'role' | 'countryId'> | null,
  ticket: { status: TicketStatus },
): TicketFieldPermissions {
  const role: UserRole = viewer?.role ?? 'END_USER';
  const agentLock = isResolvedLocked(role, ticket.status);

  const classification = !isStaff(role) ? HIDDEN : agentLock ? lockedBy(AGENT_LOCK_REASON) : EDIT;
  const category = !isAgentOrAdmin(role) ? VIEW : agentLock ? lockedBy(AGENT_LOCK_REASON) : EDIT;
  const countryMode = viewer ? countrySelectorMode(viewer) : 'hidden';
  const country = countryMode === 'switch' ? EDIT : countryMode === 'locked' ? lockedBy(COUNTRY_LOCK_REASON) : VIEW;
  const resolution = !isStaff(role) ? VIEW : RESOLUTION_EDIT_STATUSES.has(ticket.status) ? EDIT : lockedBy(RESOLUTION_STATE_REASON);

  return {
    impact: classification,
    urgency: classification,
    category,
    country,
    resolution,
    priorityPreview: isAgentOrAdmin(role) && classification.mode === 'edit',
  };
}

/**
 * Last guard before TKT-4: why this body may not be sent, or null when every key is a field the person may edit in
 * this state. Keys outside FIELD_OF_UPDATE_KEY (title, team, assignee, tags …) are refused: no app screen edits them.
 * `priority` (G2, as the web sends it) only rides along with an impact or urgency change, and only for a person who
 * gets the priority preview (ADMIN, AGENT not locked); its value is the matrix row (classificationChanges).
 */
export function fieldEditProblem(
  viewer: Pick<AuthUser, 'role' | 'countryId'> | null,
  status: TicketStatus,
  input: UpdateTicketBody,
): string | null {
  const keys = (Object.keys(input) as (keyof UpdateTicketBody)[]).filter((key) => input[key] !== undefined);
  if (keys.length === 0) return 'Nothing to save.';
  const can = ticketFieldPermissions(viewer, { status });
  for (const key of keys) {
    if (key === 'priority') {
      if (input.impact === undefined && input.urgency === undefined) return PRIORITY_ALONE_REASON;
      if (can.impact.mode === 'locked') return can.impact.reason;
      if (!can.priorityPreview) return "Your role can't change the priority of a ticket.";
      continue;
    }
    const field = FIELD_OF_UPDATE_KEY[key];
    if (!field) return "This field can't be changed from the app.";
    const access = can[field];
    if (access.mode === 'locked') return access.reason;
    if (access.mode !== 'edit') return `Your role can't change the ${field} of a ticket.`;
  }
  return null;
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

/**
 * The Filters sheet on M3 (Phase G2, docs/G2-WEB-FILTERS.md §2): which of the five filters this person gets.
 * - Priority, category, created date: every role, as on the web (LKP-1 is open to every role).
 * - Technician and group: ADMIN and AGENT (triage and country-locked alike). Their options come from USR-3 and LKP-2,
 *   which are `agentOrAdmin`: the web shows END_USER and L2_MANAGER these selects, but always empty (403), so they are
 *   left out here, and ticketListQuery() never sends them for those roles.
 */
export function ticketListFilters(viewer: Pick<AuthUser, 'role'> | null): TicketListFilterKey[] {
  const role: UserRole = viewer?.role ?? 'END_USER';
  const keys: TicketListFilterKey[] = ['priority', 'category', 'date'];
  if (isAgentOrAdmin(role)) keys.push('technician', 'group');
  return keys;
}

/** The inline status chip on a list card (08 §4.1): the transitions for that row, or none (chip not tappable). */
export function inlineStatusTransitions(role: UserRole, status: TicketStatus): readonly StatusTransition[] {
  return canChangeStatus(role) ? getAvailableTransitions(role, status) : [];
}
