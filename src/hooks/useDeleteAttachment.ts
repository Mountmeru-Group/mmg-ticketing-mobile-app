// ATT-5 DELETE /tickets/:ticketId/attachments/:attachmentId (Phase G3; docs/G3-WEB-BEHAVIOUR.md §2).
// Permanent: the screen confirms "Delete <fileName>?" first. ADMIN, AGENT and L2_MANAGER, any file, in any status;
// END_USER is refused on the device and nothing is sent. Not optimistic: the row goes only once the server said so.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteAttachment } from '@/api/attachments.api';
import { useAuthStore } from '@/store/auth.store';
import { patchTicketInLists, refreshTicket, removeAttachmentFromCache } from './cache';
import { assertCanDeleteAttachment, requireOnline, requireRole, wasRefusedOnDevice } from './writeGuards';

export interface DeleteAttachmentVariables {
  ticketId: string;
  /** From this ticket's ATT-1 list only (the server does not check that the file belongs to the ticket, 05 C.4). */
  attachmentId: string;
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  return useMutation({
    mutationFn: async ({ ticketId, attachmentId }: DeleteAttachmentVariables) => {
      requireOnline();
      const who = requireRole(role);
      assertCanDeleteAttachment(who);
      return deleteAttachment(ticketId, attachmentId, who);
    },
    onSuccess: (_res, { ticketId, attachmentId }) => removeAttachmentFromCache(queryClient, ticketId, attachmentId),
    onSettled: (_res, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      patchTicketInLists(queryClient, null);
      // The attachment list, the tab count, the header's `_count.attachments`, and replies that listed the file.
      void refreshTicket(queryClient, ticketId);
    },
  });
}
