// M12/M13 Approvals — APR-1 my pending approvals, APR-2 approve, APR-3 reject (01 §10.1).
// - APR-1 is the only list used. `GET /approvals` is unscoped (05 C.16) and never called.
// - There is no GET /approvals/:id: the detail screen reads its row from the APR-1 cache.
// - Approving or rejecting NEVER changes a ticket's status: it stays PENDING_MGMT_REVIEW (05 B.22).
// - Delegation does not exist in this backend (A26) and is not built.
// - Ticket approvals carry no ticket data (01 §10.1). Cards and the detail screen try TKT-3 by `entityId` and use it
//   only on a 200; a 403 (END_USER / out-of-scope approver) shows "details not available". Never relies on the AGENT
//   scope gap (05 C.6).
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { approveApproval, listPendingApprovals, rejectApproval, submitTicketForApproval } from '@/api/approvals.api';
import { assertArray, assertObject, checkFields } from '@/api/drift';
import { APPROVAL_SPEC } from '@/api/responseSpecs';
import { useAuthStore } from '@/store/auth.store';
import type { Approval, TicketDetail } from '@/types';
import { markHomeStale, markTicketStale, patchTicketInLists, refreshTicket } from './cache';
import { queryKeys } from './queryKeys';
import { fetchTicketDetail } from './useTicket';
import { assertCanSubmitForApproval, refuse, requireOnline, requireRole, wasRefusedOnDevice } from './writeGuards';

/** Cards look up at most this many ticket approvals with TKT-3 (one GET each, cached), to keep the inbox cheap. */
export const MAX_CARD_TICKET_LOOKUPS = 10;

/** APR-1. Used by the drawer (visibility + badge), Home's tile and the inbox — one cached query. */
export function usePendingApprovals({ enabled = true }: { enabled?: boolean } = {}) {
  const signedIn = useAuthStore((s) => !!s.user);
  return useQuery({
    queryKey: queryKeys.approvals.pending(),
    queryFn: async (): Promise<Approval[]> => {
      const res = await listPendingApprovals();
      assertArray<Approval>('APR-1', res);
      checkFields('APR-1', res[0], APPROVAL_SPEC, '[0].');
      return res.filter((a) => a && typeof a.id === 'string');
    },
    enabled: enabled && signedIn,
  });
}

/**
 * TKT-3 for the first MAX_CARD_TICKET_LOOKUPS ticket approvals, so cards can show subject and requester. Same cache
 * key as the ticket screen, so opening the approval or the ticket afterwards costs nothing. 403/404 are not retried.
 */
export function useApprovalTickets(approvals: readonly Approval[] | undefined, { enabled }: { enabled: boolean }) {
  const ids = [...new Set((approvals ?? []).filter((a) => a.entityType === 'ticket').map((a) => a.entityId))].slice(
    0,
    MAX_CARD_TICKET_LOOKUPS,
  );
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.tickets.detail(id),
      queryFn: () => fetchTicketDetail(id),
      enabled,
    })),
  });
  const byId = new Map<string, { ticket?: TicketDetail; error?: unknown; loading: boolean }>();
  ids.forEach((id, i) => {
    const r = results[i];
    byId.set(id, { ticket: r?.data, error: r?.error ?? undefined, loading: !!r?.isPending && r?.fetchStatus !== 'idle' });
  });
  return byId;
}

export type ApprovalDecision = 'approve' | 'reject';

export interface DecideVariables {
  approval: Approval;
  decision: ApprovalDecision;
  comments: string;
}

/** APR-2 / APR-3. Confirmed by the screen first — a decision can't be undone. */
export function useDecideApproval() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: async ({ approval, decision, comments }: DecideVariables): Promise<Approval> => {
      requireOnline();
      if (!userId) throw refuse('You are not signed in.');
      if (approval.status !== 'PENDING') throw refuse('This approval has already been decided.');
      if (approval.approverId && approval.approverId !== userId) throw refuse('This approval is assigned to someone else.');
      const text = comments.trim();
      if (decision === 'reject' && !text) throw refuse('A reason is required to reject.');
      const res = decision === 'approve' ? await approveApproval(approval.id, text || undefined) : await rejectApproval(approval.id, text);
      assertObject<Approval>(decision === 'approve' ? 'APR-2' : 'APR-3', res);
      checkFields(decision === 'approve' ? 'APR-2' : 'APR-3', res, APPROVAL_SPEC);
      return res;
    },
    onSettled: (_res, error, { approval }) => {
      if (wasRefusedOnDevice(error)) return;
      // The inbox, drawer badge and Home tile share this one query: one request.
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.pending() });
      if (approval.entityType === 'ticket') {
        markTicketStale(queryClient, approval.entityId);
        markHomeStale(queryClient);
      }
    },
  });
}

export interface SubmitApprovalVariables {
  ticketId: string;
  approverIds: readonly string[];
  comments: string;
}

/**
 * APR-4 "Submit for approval" (Phase G3; docs/G3-WEB-BEHAVIOUR.md §3). Confirmed by the screen first. ADMIN and AGENT
 * only, in every status; anyone else is refused on the device and nothing is sent. The server moves the ticket to
 * PENDING_MGMT_REVIEW, so the ticket is refetched and its list rows marked stale.
 */
export function useSubmitForApproval() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  return useMutation({
    mutationFn: async ({ ticketId, approverIds, comments }: SubmitApprovalVariables): Promise<Approval[]> => {
      requireOnline();
      const who = requireRole(role);
      assertCanSubmitForApproval(who, approverIds);
      const res = await submitTicketForApproval({ ticketId, approverIds, comments }, who);
      assertArray<Approval>('APR-4', res);
      checkFields('APR-4', res[0], APPROVAL_SPEC, '[0].');
      return res;
    },
    onSettled: (_res, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      patchTicketInLists(queryClient, null);
      void refreshTicket(queryClient, ticketId);
      // The person may have named themselves as an approver.
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.pending() });
    },
  });
}
