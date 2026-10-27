// Comment endpoints (01 §3). Mounted under /api/v1/tickets/:ticketId/comments.
// ⚠ The server does not check that the caller may access the ticket. Only call these for a ticket the
// user already opened with TKT-3 (05 §C hygiene rules).
import type { Comment, CreateCommentBody, UserRole } from '@/types';
import { apiClient } from './client';
import { clientError } from './errors';
import { pickDefined, seg } from './helpers';

/**
 * CMT-1 — GET /api/v1/tickets/:ticketId/comments
 * Newest first, not paginated, with attachments and recipients. END_USER and L2_MANAGER get PUBLIC only.
 */
export async function listComments(ticketId: string): Promise<Comment[]> {
  const res = await apiClient.get<Comment[]>(`/tickets/${seg(ticketId)}/comments`);
  return res.data;
}

/**
 * CMT-2 — POST /api/v1/tickets/:ticketId/comments
 * Upload files first (ATT-2), then send their ids in `attachmentIds` (05 §A.5).
 * The server SILENTLY turns a PRIVATE note from END_USER or L2_MANAGER into a PUBLIC, emailed reply,
 * so a note from those roles is refused here before it can leak to the requester (05 §A.3, §A.5).
 */
export async function createComment(ticketId: string, input: CreateCommentBody, authorRole: UserRole): Promise<Comment> {
  if (input.type === 'PRIVATE' && authorRole !== 'ADMIN' && authorRole !== 'AGENT') {
    throw clientError('Only Admins and Technicians can add internal notes');
  }
  const body = pickDefined(input, ['body', 'type', 'to', 'cc', 'attachmentIds'] as const);
  const res = await apiClient.post<Comment>(`/tickets/${seg(ticketId)}/comments`, body);
  return res.data;
}
