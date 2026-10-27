// Ticket status workflow rules that live ONLY in the web frontend (05-RULES-AND-GAPS.md §A.1–§A.2).
// The backend enforces NONE of this: POST /tickets/:id/status accepts any status from any status and
// never requires closure fields (05 B.2). The app must enforce it. When backend ask A6 ships a server-side
// workflow, delete this file and use the server's `allowedTransitions` (CLAUDE.md, 05 §A).
// Pure functions only — no UI, no I/O.
import type { ChangeStatusBody, TicketStatus, UserRole } from '@/types';
import { CLOSURE_CODES } from '@/types';

export interface StatusTransition {
  /** Button label — part of the rule (05 §A.1). */
  label: string;
  target: TicketStatus;
}

/**
 * The transition map, verbatim from FE:pages/tickets/TicketDetailPage.tsx:45-106 (05 §A.1).
 * `PENDING` (legacy) deliberately has no entry, so it gets no transitions.
 */
export const STATUS_TRANSITIONS: Readonly<Partial<Record<TicketStatus, readonly StatusTransition[]>>> = {
  OPEN: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Close', target: 'CLOSED' },
  ],
  IN_PROGRESS: [
    { label: 'On-hold', target: 'ON_HOLD' },
    { label: 'Pending with Management Review', target: 'PENDING_MGMT_REVIEW' },
    { label: 'Pending with Master Data Team', target: 'PENDING_MASTER_DATA' },
    { label: 'Pending with Partner', target: 'PENDING_PARTNER' },
    { label: 'Pending with User for Confirmation/Testing', target: 'PENDING_USER_CONFIRM' },
    { label: 'Pending with User for more Information', target: 'PENDING_USER_INFO' },
    { label: 'Resolve', target: 'RESOLVED' },
    { label: 'Close', target: 'CLOSED' },
    { label: 'Canceled', target: 'CANCELED' },
  ],
  ON_HOLD: [
    { label: 'In-Progress', target: 'IN_PROGRESS' },
    { label: 'On hold to open', target: 'OPEN' },
  ],
  PENDING_MGMT_REVIEW: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
  ],
  PENDING_MASTER_DATA: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
  ],
  PENDING_PARTNER: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
  ],
  PENDING_USER_CONFIRM: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
    { label: 'Close', target: 'CLOSED' },
  ],
  PENDING_USER_INFO: [
    { label: 'In Progress', target: 'IN_PROGRESS' },
    { label: 'Open', target: 'OPEN' },
    { label: 'Resolve', target: 'RESOLVED' },
    { label: 'Close', target: 'CLOSED' },
  ],
  RESOLVED: [
    { label: 'Resolve to open', target: 'OPEN' },
    { label: 'Close', target: 'CLOSED' },
  ],
  CLOSED: [],
  CANCELED: [],
};

/** `LOCKED_STATUSES` (FE:TicketDetailPage.tsx:612-623). */
export const LOCKED_STATUSES: ReadonlySet<TicketStatus> = new Set<TicketStatus>(['CLOSED', 'CANCELED']);

/** `canChangeStatus = user?.role !== 'END_USER'` — END_USER has no status bar at all. */
export function canChangeStatus(role: UserRole): boolean {
  return role !== 'END_USER';
}

/**
 * `isResolvedLocked = role === 'AGENT' && LOCKED_STATUSES.has(status)`.
 * When true the AGENT gets no transitions and the property edits of 05 §A.3 become read-only.
 */
export function isResolvedLocked(role: UserRole, status: TicketStatus): boolean {
  return role === 'AGENT' && LOCKED_STATUSES.has(status);
}

/** Transitions to offer for this role and status: the map only, never "any status" (decision D1). */
export function getAvailableTransitions(role: UserRole, status: TicketStatus): readonly StatusTransition[] {
  if (!canChangeStatus(role)) return [];
  if (isResolvedLocked(role, status)) return [];
  return STATUS_TRANSITIONS[status] ?? [];
}

export function isTransitionAllowed(role: UserRole, from: TicketStatus, to: TicketStatus): boolean {
  return getAvailableTransitions(role, from).some((t) => t.target === to);
}

// ── Closure (05 §A.2) ────────────────────────────────────────

/** Targets that open the closure form instead of posting `{ status }` straight away. */
export const CLOSURE_TARGETS: ReadonlySet<TicketStatus> = new Set<TicketStatus>(['RESOLVED', 'CLOSED', 'CANCELED']);

export function requiresClosureForm(target: TicketStatus): boolean {
  return CLOSURE_TARGETS.has(target);
}

export type ClosureCode = (typeof CLOSURE_CODES)[number];

/** Closure code options in display order. Empty selection ("— Select —") sends `undefined`. */
export const CLOSURE_CODE_OPTIONS: readonly ClosureCode[] = CLOSURE_CODES;

export interface ClosureForm {
  /** Required (trim non-empty). */
  resolution: string;
  /** Optional; '' = not selected. */
  closureCode: ClosureCode | '';
  /** "Is FCR (First Call Resolution)", default false. */
  isFcr: boolean;
  /** Required (trim non-empty). Posted by the server as a PUBLIC comment the requester sees. */
  closureComments: string;
}

export const EMPTY_CLOSURE_FORM: ClosureForm = { resolution: '', closureCode: '', isFcr: false, closureComments: '' };

export const REQUIRED_CLOSURE_FIELDS = ['resolution', 'closureComments'] as const satisfies readonly (keyof ClosureForm)[];

/** Save is disabled (verbatim rule, :2514): `!resolution.trim() || !closureComments.trim() || isPending`. */
export function canSubmitClosure(form: ClosureForm, isPending: boolean): boolean {
  return !(!form.resolution.trim() || !form.closureComments.trim() || isPending);
}

/** Request body, verbatim from :2518-2524. */
export function buildClosureBody(target: TicketStatus, form: ClosureForm): ChangeStatusBody {
  return {
    status: target,
    resolution: form.resolution.trim(),
    closureCode: form.closureCode || undefined,
    isFcr: form.isFcr,
    closureComments: form.closureComments.trim(),
  };
}

/** Modal title and save label (05 §A.2). */
export function closureTitle(label: string): string {
  return `Transition · ${label}`;
}
export function closureSaveLabel(label: string): string {
  return `Save & ${label}`;
}

/** Button tone (05 §A.1, :771-777): RESOLVED green, CLOSED grey, others neutral. */
export function transitionTone(target: TicketStatus): 'success' | 'muted' | 'neutral' {
  if (target === 'RESOLVED') return 'success';
  if (target === 'CLOSED') return 'muted';
  return 'neutral';
}

// ── Bulk actions (08 §4.2, S4) ───────────────────────────────

/** Max tickets per bulk action until A14/A24 ship. Run sequentially; stop at the first 429 or 5xx. */
export const BULK_ACTION_LIMIT = 20;

/** Bulk Close skips a ticket unless its current status's map contains CLOSED (and the role isn't locked). */
export function canCloseInBulk(role: UserRole, status: TicketStatus): boolean {
  return isTransitionAllowed(role, status, 'CLOSED');
}
