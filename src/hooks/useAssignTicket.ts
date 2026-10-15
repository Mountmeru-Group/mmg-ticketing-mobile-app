// TKT-5 POST /tickets/:id/assign — every assignment, pick up and team change (the choice recorded in
// tickets.api.ts). Send `teamId` when it is known (05 B.14, 08 S5); `teamId: null` cannot clear a team, so it is
// never sent. ADMIN and AGENT only; the UI hides it for others.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { checkFields } from '@/api/drift';
import { TICKET_SPEC } from '@/api/responseSpecs';
import { assignTicket } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import type { Ticket, TicketStatus } from '@/types';
import { patchTicketInLists, refreshTicket } from './cache';
import { assertAssignment, fetchCurrentStatus, requireOnline, requireRole, wasRefusedOnDevice } from './writeGuards';

export interface AssignVariables {
  ticketId: string;
  /** Current status (AGENT lock check, 05 §A.1). */
  status: TicketStatus;
  /** A user id, or null to remove the assignment. */
  assignedToId: string | null;
  teamId?: string;
}

export function useAssignTicket() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  return useMutation({
    mutationFn: async ({ ticketId, status, assignedToId, teamId }: AssignVariables): Promise<Ticket> => {
      requireOnline();
      const assignerRole = requireRole(role);
      assertAssignment(assignerRole, status, assignedToId); // on the device: nothing is sent if this fails
      assertAssignment(assignerRole, await fetchCurrentStatus(ticketId), assignedToId); // AGENT lock vs the server's status
      const ticket = await assignTicket(ticketId, teamId ? { assignedToId, teamId } : { assignedToId });
      checkFields('TKT-5', ticket, TICKET_SPEC);
      return ticket;
    },
    onSuccess: (ticket) => patchTicketInLists(queryClient, ticket),
    onSettled: (_data, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      void refreshTicket(queryClient, ticketId); // 05 §A.4: refetch TKT-3 after assigning
    },
  });
}
