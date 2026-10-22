// TKT-6 POST /tickets/:id/status — the ONLY way this app changes a status. PUT /tickets/:id silently drops
// `status` (05 B.1), so nothing here or anywhere else sends status through PUT.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { uploadAttachments, type UploadFile } from '@/api/attachments.api';
import { checkFields } from '@/api/drift';
import { TICKET_SPEC } from '@/api/responseSpecs';
import { changeTicketStatus } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import type { ChangeStatusBody, Ticket, TicketStatus } from '@/types';
import { patchTicketInLists, refreshTicket } from './cache';
import {
  afterPartialSuccess, assertStatusChange, assertStatusUnchanged, requireOnline, requireRole, wasRefusedOnDevice,
} from './writeGuards';

export interface ChangeStatusVariables {
  ticketId: string;
  /** The status the person saw when choosing the transition. */
  from: TicketStatus;
  body: ChangeStatusBody;
  /** Closure attachments (05 §A.2). Uploaded FIRST; the status is posted only if the upload succeeded. */
  files?: readonly UploadFile[];
}

export function useChangeStatus() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  return useMutation({
    mutationFn: async ({ ticketId, from, body, files }: ChangeStatusVariables): Promise<Ticket> => {
      requireOnline();
      assertStatusChange(requireRole(role), from, body); // on the device: nothing is sent if this fails
      await assertStatusUnchanged(ticketId, from); // against the server's current status (one GET)
      const uploaded: readonly UploadFile[] = files && files.length > 0 ? files : [];
      if (uploaded.length > 0) {
        try {
          await uploadAttachments(ticketId, uploaded);
        } catch (error) {
          throw afterPartialSuccess('The files could not be uploaded, so the status was NOT changed.', error);
        }
      }
      let ticket: Ticket;
      try {
        ticket = await changeTicketStatus(ticketId, body);
      } catch (error) {
        // The files are on the ticket already (ATT-2 has no rollback): say so, and let the form drop them before a retry.
        if (uploaded.length === 0) throw error;
        throw afterPartialSuccess('Your files were uploaded to the ticket, but the status was NOT changed.', error, uploaded);
      }
      checkFields('TKT-6', ticket, TICKET_SPEC);
      return ticket;
    },
    onSuccess: (ticket) => patchTicketInLists(queryClient, ticket),
    // Refresh even after a server-side failure: some writes land before the error (01 §0.2). Not after a
    // device-side refusal, when nothing was sent.
    onSettled: (_data, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      void refreshTicket(queryClient, ticketId);
    },
  });
}
