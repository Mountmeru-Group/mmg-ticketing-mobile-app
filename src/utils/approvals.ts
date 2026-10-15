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
import type { Approval, ApprovalEntityType, TicketDetail } from '@/types';
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
