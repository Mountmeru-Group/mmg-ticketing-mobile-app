// Approval endpoints (01 §10.1). Moved into the MVP as M12/M13 (04, 08 §5.1); 01 still labels them P2.
// Ticket approvals carry no ticket data, and approving/rejecting NEVER changes the ticket's status — it stays
// PENDING_MGMT_REVIEW (05 B.22). `GET /approvals` (unscoped, 05 C.16) and `POST /approvals` are out of scope.
import type { Approval } from '@/types';
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
