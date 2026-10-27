// Approval endpoints (01 §10.1). Moved into the MVP as M12/M13 (04, 08 §5.1); 01 still labels them P2.
// Ticket approvals carry no ticket data, and approving/rejecting NEVER changes the ticket's status — it stays
// PENDING_MGMT_REVIEW (05 B.22). `GET /approvals` (unscoped, 05 C.16) is out of scope. `POST /approvals` (APR-4,
// submit a ticket for approval) was added in Phase G3.
import type { Approval, CreateApprovalBody, UserRole } from '@/types';
import { canSubmitForApproval } from '@/utils/permissions';
import { apiClient } from './client';
import { clientError } from './errors';
import { seg } from './helpers';

/** APR-1 — GET /api/v1/approvals/pending. Caller's PENDING approvals, oldest first, not paginated. */
export async function listPendingApprovals(): Promise<Approval[]> {
  const res = await apiClient.get<Approval[]>('/approvals/pending');
  return res.data;
}

/** APR-2 — POST /api/v1/approvals/:id/approve `{ comments? }`. Comment optional. */
export async function approveApproval(id: string, comments?: string): Promise<Approval> {
  const trimmed = comments?.trim();
  const body = trimmed ? { comments: trimmed } : {};
  const res = await apiClient.post<Approval>(`/approvals/${seg(id)}/approve`, body);
  return res.data;
}

/** APR-3 — POST /api/v1/approvals/:id/reject `{ comments }`. A reason is required (server: min 1). */
export async function rejectApproval(id: string, comments: string): Promise<Approval> {
  const trimmed = comments.trim();
  if (!trimmed) throw clientError('Rejection reason required');
  const res = await apiClient.post<Approval>(`/approvals/${seg(id)}/reject`, { comments: trimmed });
  return res.data;
}

export interface SubmitTicketApprovalInput {
  ticketId: string;
  /** People picked in the form (USR-3, any role). At least one. */
  approverIds: readonly string[];
  /** Optional; left out when blank. */
  comments?: string;
}

/**
 * APR-4 — POST /api/v1/approvals `{ entityType: 'ticket', entityId, approverIds, comments? }` (Phase G3).
 * ADMIN and AGENT only: the server's `agentOrAdmin` answers 403 to anyone else, so their request is refused here
 * before it is sent. The body is built from this allow-list only.
 * Server side effects (approvals.controller.ts:16-88): every PENDING approval on the ticket is CANCELLED; one approval
 * per approver; the ticket is set to PENDING_MGMT_REVIEW from any status by a direct update (no history row, no email
 * to the requester, SLA clock not paused: 05 B.35); each approver is emailed and notified. 201: the new `Approval[]`.
 */
export async function submitTicketForApproval(input: SubmitTicketApprovalInput, role: UserRole): Promise<Approval[]> {
  if (!canSubmitForApproval(role)) throw clientError("Your role can't submit tickets for approval.");
  const approverIds = [...new Set(input.approverIds)];
  if (approverIds.length === 0) throw clientError('Choose at least one approver.');
  const comments = input.comments?.trim();
  const body: CreateApprovalBody = { entityType: 'ticket', entityId: input.ticketId, approverIds, ...(comments ? { comments } : {}) };
  const res = await apiClient.post<Approval[]>('/approvals', body);
  return res.data;
}
