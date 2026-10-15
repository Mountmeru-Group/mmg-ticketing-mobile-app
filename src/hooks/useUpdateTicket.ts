// TKT-4 PUT /tickets/:id — FIELD edits only (title, description, category, impact, urgency, team, assignee, tags,
// resolution, country — per role, from the allow-list in tickets.api.ts).
// ⛔ NEVER status: PUT silently drops `status` and still answers 200 (05 B.1). UpdateTicketBody has no status
// field, and updateTicket() copies only allow-listed keys, so a status cannot leak into this request.
// A category change may auto-reassign the ticket (05 §A.3); the ticket is refetched afterwards (05 B.18).
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { checkFields } from '@/api/drift';
import { TICKET_SPEC } from '@/api/responseSpecs';
import { updateTicket } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import type { Ticket, TicketStatus, UpdateTicketBody } from '@/types';
import { isResolvedLocked } from '@/utils/ticket-rules';
import { patchTicketInLists, refreshTicket } from './cache';
import { refuse, requireOnline, requireRole, wasRefusedOnDevice } from './writeGuards';

export interface UpdateTicketVariables {
  ticketId: string;
  /** Current status (AGENT lock, 05 §A.3). */
  status: TicketStatus;
  input: UpdateTicketBody;
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  return useMutation({
    mutationFn: async ({ ticketId, status, input }: UpdateTicketVariables): Promise<Ticket> => {
      requireOnline();
      const editorRole = requireRole(role);
      if (isResolvedLocked(editorRole, status)) throw refuse('Closed and canceled tickets are locked for technicians.');
      const ticket = await updateTicket(ticketId, input, editorRole);
      checkFields('TKT-4', ticket, TICKET_SPEC);
      return ticket;
    },
    onSuccess: (ticket) => patchTicketInLists(queryClient, ticket),
    onSettled: (_data, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      void refreshTicket(queryClient, ticketId);
    },
  });
}
