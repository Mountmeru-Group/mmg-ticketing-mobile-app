// Last check before every write request (single and bulk). The backend enforces none of these rules for most
// roles (05 B.2, §C.5–C.6), so the app is the only guard: a refused write throws a `client` error and nothing is sent.
// These mirror the web UI for UX; they are not a security fix (05 §C rule 3).
import { onlineManager } from '@tanstack/react-query';

import { ApiClientError, clientError, describeWriteError, isSessionEndedError } from '@/api/errors';
import { getTicket } from '@/api/tickets.api';
import type { AuthUser, ChangeStatusBody, TicketStatus, UpdateTicketBody, UserRole } from '@/types';
import { statusLabel } from '@/utils/format';
import { canDeleteAttachments, canSubmitForApproval, fieldEditProblem } from '@/utils/permissions';
import { isAgentOrAdmin } from '@/utils/roles';
import { isPlaceholderUser } from '@/utils/session';
import { canChangeStatus, isResolvedLocked, isTransitionAllowed, requiresClosureForm } from '@/utils/ticket-rules';

/** Errors created by refuse(): the request was never sent, so there is nothing to refresh afterwards. */
const refusedOnDevice = new WeakSet<object>();

export function refuse(message: string): ApiClientError {
  const error = clientError(message);
  refusedOnDevice.add(error);
  return error;
}

/** True only for a guard refusal. Anything else (including partial success) may have changed server data. */
export function wasRefusedOnDevice(error: unknown): boolean {
  return typeof error === 'object' && error !== null && refusedOnDevice.has(error);
}

export function requireRole(role: UserRole | undefined): UserRole {
  if (!role) throw refuse('You are not signed in.');
  return role;
}

/** Writes happen only when tapped: offline, they are refused rather than queued for later (queryClient.ts). */
export function requireOnline(): void {
  if (!onlineManager.isOnline()) throw refuse("You're offline. Nothing was sent — try again when you're connected.");
}

/** 05 §A.1 transition map + §A.2 required closure fields. Status only ever goes through TKT-6 (POST), never PUT. */
export function assertStatusChange(role: UserRole, from: TicketStatus, body: ChangeStatusBody): void {
  if (!canChangeStatus(role)) throw refuse("Your role can't change a ticket's status.");
  if (isResolvedLocked(role, from)) throw refuse('Closed and canceled tickets are locked for technicians.');
  if (!isTransitionAllowed(role, from, body.status)) {
    throw refuse(`${statusLabel(from)} tickets can't be moved to ${statusLabel(body.status)}.`);
  }
  if (requiresClosureForm(body.status) && (!body.resolution?.trim() || !body.closureComments?.trim())) {
    throw refuse('Resolution and closure comments are both required.');
  }
}

/**
 * The status the SERVER has now (one TKT-3 GET). Cached data can be minutes old (staleTime ≥ 60 s, no refetch on
 * mount), and the server accepts any transition (05 B.2) — so a guard checked against a stale status could reopen a
 * closed ticket and email its requester. Every status change and assignment re-reads the status first.
 */
export async function fetchCurrentStatus(ticketId: string): Promise<TicketStatus> {
  const ticket = await getTicket(ticketId);
  if (typeof ticket?.status !== 'string') {
    throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from TKT-3' });
  }
  return ticket.status;
}

/** Re-check against the server's current status; refuses (nothing written) when it moved since the screen loaded. */
export async function assertStatusUnchanged(ticketId: string, expected: TicketStatus): Promise<void> {
  const current = await fetchCurrentStatus(ticketId);
  if (current !== expected) {
    // Not refuse(): the ticket DID change, so the caller's refresh should still run and show the new status.
    throw clientError(
      `This ticket is now ${statusLabel(current)} — it changed after you opened it. Nothing was changed; review it and try again.`,
    );
  }
}

/** 05 §A.4 / §A.3: ADMIN and AGENT only (L2_MANAGER and END_USER get 403); AGENT locked on CLOSED/CANCELED. */
export function assertAssignment(role: UserRole, status: TicketStatus, assignedToId: string | null): void {
  if (!isAgentOrAdmin(role)) throw refuse('Only Admins and Technicians can assign tickets.');
  if (isResolvedLocked(role, status)) throw refuse('Closed and canceled tickets are locked for technicians.');
  if (assignedToId && isPlaceholderUser({ id: assignedToId })) {
    throw refuse('This session has a placeholder user that cannot be assigned. Sign out and paste the developer token again.');
  }
}

/**
 * TKT-4 property edits (Phase G1): every key must be a field ticketFieldPermissions() gives this person as `edit` in
 * this status. Status is never one of them (05 B.1: PUT drops it), and neither is anything no screen edits.
 */
export function assertFieldEdits(
  viewer: Pick<AuthUser, 'role' | 'countryId'>,
  status: TicketStatus,
  input: UpdateTicketBody,
): void {
  const problem = fieldEditProblem(viewer, status, input);
  if (problem) throw refuse(problem);
}

/** 05 §A.3: adding attachments is blocked only where the AGENT lock applies. */
export function assertCanAttach(role: UserRole, status: TicketStatus): void {
  if (isResolvedLocked(role, status)) throw refuse('Closed and canceled tickets are locked for technicians.');
}

/** G3, ATT-5: deleting a file is for ADMIN, AGENT and L2_MANAGER, in every status (no AGENT lock, web :1345). */
export function assertCanDeleteAttachment(role: UserRole): void {
  if (!canDeleteAttachments(role)) throw refuse("Your role can't delete files from a ticket.");
}

/** G3, APR-4: ADMIN and AGENT only (server `agentOrAdmin`), in every status; at least one approver (server: min 1). */
export function assertCanSubmitForApproval(role: UserRole, approverIds: readonly string[]): void {
  if (!canSubmitForApproval(role)) throw refuse('Only Admins and Technicians can submit a ticket for approval.');
  if (approverIds.length === 0) throw refuse('Choose at least one approver.');
}

/**
 * Wrap the failure of a step that ran AFTER an earlier step succeeded (e.g. files uploaded, then the reply failed),
 * so the person learns what did happen. Keeps the HTTP status, so a 401 still reads as "session ended".
 * The result is an already-worded message: describeWriteError() passes it through unchanged.
 */
export function afterPartialSuccess(done: string, error: unknown): ApiClientError {
  if (isSessionEndedError(error)) return error as ApiClientError;
  const status = error instanceof ApiClientError ? error.status : null;
  return new ApiClientError('client', status, { error: `${done} ${describeWriteError(error)}` });
}
