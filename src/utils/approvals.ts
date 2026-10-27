// Approvals: labels, card text and the exact consequences of a decision. Pure functions.
// Side effects verified in backend approvals.controller.ts (read-only, 2026-10-15) — 01 APR-2/APR-3, 05 B.22:
//   approve  ticket          → ticket status UNCHANGED (stays as it is, normally Pending with Management Review);
//                               requester emailed (with your comment) and notified in the app
//            change          → the change becomes Approved only once EVERY approver has approved
//            service_request → nothing else changes; no one is notified
//   reject   ticket          → ticket status UNCHANGED; other pending approvals for it are cancelled; requester emailed
//                               (with your reason) and notified
//            change          → the change becomes Rejected at once; other pending approvals cancelled
//            service_request → other pending approvals cancelled; the request's status does not change
//
// Submitting a ticket for approval (APR-4, Phase G3) — approvals.controller.ts:16-88, docs/G3-WEB-BEHAVIOUR.md §3:
//   every PENDING approval on the ticket is cancelled; one approval per approver; each approver is emailed (with the
//   ticket's public replies and its files) and notified; the ticket is set to PENDING_MGMT_REVIEW from ANY status by a
//   direct update — no history entry, no email to the requester, and the SLA clock is not paused (05 B.35).
import type { Approval, ApprovalEntityType, TicketDetail, TicketStatus } from '@/types';
import { HOLD_STATUSES } from '@/types';
import { formatDisplayName, statusLabel } from './format';

export const APPROVAL_ENTITY_LABELS: Record<ApprovalEntityType, string> = {
  ticket: 'Ticket',
  service_request: 'Service request',
  change: 'Change',
};

export type ApprovalFilter = 'ALL' | ApprovalEntityType;

export const APPROVAL_FILTERS: readonly { value: ApprovalFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ticket', label: 'Tickets' },
  { value: 'service_request', label: 'Service requests' },
  { value: 'change', label: 'Changes' },
];

export function entityLabel(type: string): string {
  return (APPROVAL_ENTITY_LABELS as Record<string, string>)[type] ?? type;
}

/** First 8 characters of the approval id — the only identifier an approval has. */
export function shortApprovalId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** Card / header subject. A ticket approval has no data of its own: the ticket (TKT-3) is used when it loaded. */
export function approvalSubject(approval: Approval, ticket?: Pick<TicketDetail, 'ticketNumber' | 'title'> | null): string {
  switch (approval.entityType) {
    case 'change':
      return approval.change ? `Change #${approval.change.changeNumber} · ${approval.change.title}` : 'Change approval';
    case 'service_request': {
      const sr = approval.serviceRequest;
      return sr ? `Request #${sr.requestNumber} · ${sr.serviceItem?.name ?? 'Service request'}` : 'Service request approval';
    }
    default:
      return ticket ? `#${ticket.ticketNumber} · ${ticket.title || '(no subject)'}` : 'Ticket approval';
  }
}

/** Requester name, when anything in reach carries it (tickets only; APR-1 rows carry no requester). */
export function approvalRequester(approval: Approval, ticket?: Pick<TicketDetail, 'requester'> | null): string | null {
  if (approval.entityType === 'ticket' && ticket) return formatDisplayName(ticket.requester?.displayName) || null;
  return null;
}

/** Confirmation text: names exactly what will and will not happen. */
export function decisionMessage(approval: Approval, decision: 'approve' | 'reject', ticketStatus: string | null): string {
  const parts: string[] = [];
  if (approval.entityType === 'ticket') {
    parts.push(
      decision === 'approve'
        ? 'The requester is emailed and notified that you approved, with your comment if you add one.'
        : 'The requester is emailed and notified that you rejected, with your reason. Any other pending approvals for this ticket are cancelled.',
    );
    parts.push(
      `The ticket's status does NOT change${ticketStatus ? ` — it stays ${statusLabel(ticketStatus)}` : ''} until a technician moves it.`,
    );
  } else if (approval.entityType === 'change') {
    parts.push(
      decision === 'approve'
        ? 'The change becomes Approved only when every approver has approved.'
        : 'The change becomes Rejected now, and any other pending approvals for it are cancelled.',
    );
  } else {
    parts.push(
      decision === 'approve'
        ? "The request's status does not change, and no one is notified by the Service Desk."
        : "Any other pending approvals for this request are cancelled. The request's status does not change.",
    );
  }
  parts.push("A decision can't be undone.");
  return parts.join(' ');
}

/** "Alice", "Alice and Bob", "Alice, Bob and Carol". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const REOPENED_BY_SUBMIT: ReadonlySet<TicketStatus> = new Set<TicketStatus>(['RESOLVED', 'CLOSED', 'CANCELED']);

/**
 * The server counts the SLA clock as paused only in a hold status with `slaHoldStartedAt` set (BE:utils/sla.ts:15-19).
 * Submitting sets the status but never `slaHoldStartedAt` (05 B.35), so the clock is paused afterwards only if it
 * already was — not, for example, on a ticket an earlier request moved to Pending with Management Review.
 */
function slaClockPaused(ticket: Pick<TicketDetail, 'status' | 'slaHoldStartedAt'>): boolean {
  return HOLD_STATUSES.includes(ticket.status) && !!ticket.slaHoldStartedAt;
}

/** Confirmation for "Submit for approval" (APR-4): exactly what the server does (see the header of this file). */
export function submitApprovalMessage(
  ticket: Pick<TicketDetail, 'ticketNumber' | 'status' | 'slaHoldStartedAt'>,
  approverNames: readonly string[],
): string {
  const from: TicketStatus = ticket.status;
  const target = statusLabel('PENDING_MGMT_REVIEW');
  const parts = [
    `#${ticket.ticketNumber} goes to ${joinNames(approverNames)} for approval. ${approverNames.length === 1 ? 'They are' : 'Each is'} emailed the ticket with its public replies and files, and notified in the app.`,
    'Any approval still pending on this ticket is cancelled.',
  ];
  if (from === 'PENDING_MGMT_REVIEW') {
    parts.push(`The ticket stays ${target}.`);
  } else {
    parts.push(
      `The ticket moves from ${statusLabel(from)} to ${target} now${REOPENED_BY_SUBMIT.has(from) ? ', which reopens it' : ''}. The requester is not emailed about this change and it is not added to the history.`,
    );
  }
  parts.push(slaClockPaused(ticket) ? 'The SLA clock stays paused.' : 'The SLA clock keeps running: this change does not pause it.');
  parts.push('Approving or rejecting does not move the ticket again: a technician changes its status afterwards.');
  return parts.join(' ');
}

/**
 * What happened, shown after the server accepted the request. `statusNow` is the status re-read from the server
 * (TKT-3) after the submit, or null when that read failed: the app never claims a status it has not seen.
 */
export function submitApprovalOutcome(approverNames: readonly string[], statusNow: TicketStatus | null): string[] {
  return [
    `Sent to ${joinNames(approverNames)}. ${approverNames.length === 1 ? 'They were' : 'Each was'} emailed and notified in the app.`,
    statusNow
      ? `The ticket is now ${statusLabel(statusNow)}.`
      : `The server moves the ticket to ${statusLabel('PENDING_MGMT_REVIEW')}, but the app couldn't re-read it. Pull to refresh the ticket to check.`,
    'Any approval that was still pending on this ticket was cancelled.',
    "Approving or rejecting won't change the ticket's status: once the approvers have decided, a technician has to move it on.",
  ];
}

/** What happened, shown after the server confirmed the decision. */
export function decisionOutcome(result: Approval, ticketStatus: string | null): string[] {
  const approved = result.status === 'APPROVED';
  const lines = [approved ? 'You approved this.' : result.status === 'REJECTED' ? 'You rejected this.' : `The approval is now ${result.status}.`];
  if (result.entityType === 'ticket') {
    lines.push(
      ticketStatus
        ? `The ticket is still ${statusLabel(ticketStatus)}. Approving or rejecting doesn't move a ticket — a technician has to change its status.`
        : "The ticket's status was not changed. Approving or rejecting doesn't move a ticket — a technician has to change its status.",
    );
    lines.push(approved ? 'The requester was emailed and notified.' : 'The requester was emailed and notified; other pending approvals for this ticket were cancelled.');
  } else if (result.entityType === 'change') {
    lines.push(approved ? 'The change becomes Approved once every approver has approved.' : 'The change is now Rejected.');
  } else if (!approved) {
    lines.push('Other pending approvals for this request were cancelled.');
  }
  return lines;
}
