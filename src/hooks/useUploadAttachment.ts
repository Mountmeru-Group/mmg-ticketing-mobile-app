// ATT-2 POST /tickets/:ticketId/attachments — files checked on the device first (count, size, blocked
// extensions; 05 B.9): every server-side limit violation is an opaque 500.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { uploadAttachments, type UploadFile } from '@/api/attachments.api';
import { assertArray, checkFields } from '@/api/drift';
import { ATTACHMENT_SPEC } from '@/api/responseSpecs';
import { useAuthStore } from '@/store/auth.store';
import type { Attachment, TicketStatus } from '@/types';
import { patchTicketInLists, refreshTicket } from './cache';
import { assertCanAttach, requireOnline, requireRole, wasRefusedOnDevice } from './writeGuards';

export interface UploadVariables {
  ticketId: string;
  status: TicketStatus;
  files: readonly UploadFile[];
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  return useMutation({
    mutationFn: async ({ ticketId, status, files }: UploadVariables): Promise<Attachment[]> => {
      requireOnline();
      assertCanAttach(requireRole(role), status);
      const res = await uploadAttachments(ticketId, files); // validates on the device before sending
      assertArray<Attachment>('ATT-2', res);
      checkFields('ATT-2', res[0], ATTACHMENT_SPEC, '[0].');
      return res;
    },
    onSettled: (_data, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      patchTicketInLists(queryClient, null);
      void refreshTicket(queryClient, ticketId); // attachment list + `_count.attachments`
    },
  });
}
