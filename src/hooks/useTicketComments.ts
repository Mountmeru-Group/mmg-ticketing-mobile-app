// M4 Conversation — CMT-1 GET /tickets/:ticketId/comments. Newest first, as the server returns it and as the
// web's Conversations tab shows it. Not paginated.
// ⚠ CMT-1 has no ticket access check (05 C.2): the caller passes `enabled` only after TKT-3 succeeded.
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { listComments } from '@/api/comments.api';
import { assertArray, checkFields } from '@/api/drift';
import { COMMENT_SPEC } from '@/api/responseSpecs';
import { useAuthStore } from '@/store/auth.store';
import type { Comment } from '@/types';
import { visibleComments } from '@/utils/activity';
import { queryKeys } from './queryKeys';

export function useTicketComments(ticketId: string, { enabled }: { enabled: boolean }) {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  // PRIVATE notes: the server hides them from END_USER and L2 here, but the UI never relies on that.
  const select = useCallback((comments: Comment[]) => visibleComments(comments, role), [role]);

  return useQuery({
    queryKey: queryKeys.tickets.comments(ticketId),
    queryFn: async (): Promise<Comment[]> => {
      const res = await listComments(ticketId);
      assertArray<Comment>('CMT-1', res);
      checkFields('CMT-1', res[0], COMMENT_SPEC, '[0].');
      return res;
    },
    select,
    enabled: enabled && !!ticketId,
  });
}
