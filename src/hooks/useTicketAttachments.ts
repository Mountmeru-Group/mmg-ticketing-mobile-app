// M4 Attachments — ATT-1 GET /tickets/:ticketId/attachments. Metadata only in Phase 3a: nothing is viewed or
// downloaded (ATT-3/ATT-4 are Phase 3b). Newest first, not paginated, includes reply-linked files.
// Call only after TKT-3 succeeded (05 §C hygiene); the caller passes `enabled`.
import { useQuery } from '@tanstack/react-query';

import { listAttachments } from '@/api/attachments.api';
import { assertArray, checkFields } from '@/api/drift';
import { ATTACHMENT_SPEC } from '@/api/responseSpecs';
import type { Attachment } from '@/types';
import { queryKeys } from './queryKeys';

export function useTicketAttachments(ticketId: string, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: queryKeys.tickets.attachments(ticketId),
    queryFn: async (): Promise<Attachment[]> => {
      const res = await listAttachments(ticketId);
      assertArray<Attachment>('ATT-1', res);
      checkFields('ATT-1', res[0], ATTACHMENT_SPEC, '[0].');
      return res;
    },
    enabled: enabled && !!ticketId,
  });
}
