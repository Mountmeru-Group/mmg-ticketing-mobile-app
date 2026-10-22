// TKT-4 PUT /tickets/:id — the M4 property editors (Phase G1): impact, urgency, category, country, resolution.
// ⛔ NEVER status: PUT silently drops `status` and still answers 200 (05 B.1). UpdateTicketBody has no status
// field, and updateTicket() copies only allow-listed keys, so a status cannot leak into this request.
// ⛔ NEVER priority: the server computes it from impact × urgency (01 TKT-4); the editor only previews it.
// Guards, all before anything is sent: online; every key is a field ticketFieldPermissions() gives this person as
// `edit` in the status on screen; then the same check against the server's current status (one TKT-3 GET), so a
// ticket closed or reopened meanwhile can't be edited past its lock.
// A category change may auto-reassign the ticket (G1 §3). After a save the detail shows the server's answer at once
// and is refetched with its open tabs (05 B.18); the editor then shows the saved value.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { checkFields } from '@/api/drift';
import { clientError } from '@/api/errors';
import { TICKET_SPEC } from '@/api/responseSpecs';
import { updateTicket } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import type { Ticket, TicketStatus, UpdateTicketBody } from '@/types';
import { statusLabel } from '@/utils/format';
import { fieldEditProblem } from '@/utils/permissions';
import { patchTicketDetail, patchTicketInLists, refreshTicket } from './cache';
import { assertFieldEdits, fetchCurrentStatus, refuse, requireOnline, wasRefusedOnDevice } from './writeGuards';

export interface UpdateTicketVariables {
  ticketId: string;
  /** Status on screen (AGENT lock, resolution window). Re-checked against the server's before sending. */
  status: TicketStatus;
  input: UpdateTicketBody;
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ ticketId, status, input }: UpdateTicketVariables): Promise<Ticket> => {
      requireOnline();
      if (!user) throw refuse('You are not signed in.');
      assertFieldEdits(user, status, input); // on the device: nothing is sent if this fails
      const current = await fetchCurrentStatus(ticketId);
      const late = fieldEditProblem(user, current, input);
      // Not refuse(): the ticket DID change since it was opened, so the refresh afterwards should still run.
      if (late) throw clientError(`This ticket is now ${statusLabel(current)}. ${late} Nothing was changed.`);
      const ticket = await updateTicket(ticketId, input, user.role);
      checkFields('TKT-4', ticket, TICKET_SPEC);
      return ticket;
    },
    onSuccess: (ticket) => {
      patchTicketDetail(queryClient, ticket);
      patchTicketInLists(queryClient, ticket);
    },
    onSettled: (_data, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      void refreshTicket(queryClient, ticketId);
    },
  });
}
