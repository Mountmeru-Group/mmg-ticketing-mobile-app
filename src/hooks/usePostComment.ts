// CMT-2 POST /tickets/:ticketId/comments — public reply or private note (05 §A.5).
// Flow: upload files first (ATT-2), then post the comment with their ids. No optimistic insert: the composer
// closes only after the server has answered, and the conversation then refetches.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { uploadAttachments, type UploadFile } from '@/api/attachments.api';
import { createComment } from '@/api/comments.api';
import { checkFields } from '@/api/drift';
import { COMMENT_CREATED_SPEC } from '@/api/responseSpecs';
import { useAuthStore } from '@/store/auth.store';
import type { Comment, CommentType } from '@/types';
import { canSeePrivateNotes } from '@/utils/activity';
import { isBlankBody, plainTextToHtml } from '@/utils/compose';
import { patchTicketInLists, refreshTicket } from './cache';
import { afterPartialSuccess, refuse, requireOnline, requireRole, wasRefusedOnDevice } from './writeGuards';

export interface PostCommentVariables {
  ticketId: string;
  type: CommentType;
  /** Plain text; wrapped as escaped <p> HTML (05 §A.16). */
  text: string;
  to?: string[];
  cc?: string[];
  files?: readonly UploadFile[];
}

export function usePostComment() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  return useMutation({
    mutationFn: async ({ ticketId, type, text, to = [], cc = [], files = [] }: PostCommentVariables): Promise<Comment> => {
      requireOnline();
      const authorRole = requireRole(role);
      // The server silently turns an END_USER/L2 note into a PUBLIC emailed reply — refuse it here (05 §A.5).
      if (type === 'PRIVATE' && !canSeePrivateNotes(authorRole)) {
        throw refuse('Only Admins and Technicians can add internal notes.');
      }
      // The server accepts an empty body; the client must not (05 §A.5).
      if (isBlankBody(text) && files.length === 0) throw refuse('Write a message or attach a file.');

      let attachmentIds: string[] = [];
      if (files.length > 0) {
        const uploaded = await uploadAttachments(ticketId, files);
        attachmentIds = (Array.isArray(uploaded) ? uploaded : []).map((a) => a?.id).filter((id): id is string => typeof id === 'string');
      }
      const what = type === 'PRIVATE' ? 'note' : 'reply';
      try {
        const comment = await createComment(
          ticketId,
          // END_USER and L2 never send recipients: the server builds them (01 CMT-2).
          { body: plainTextToHtml(text), type, to: type === 'PUBLIC' ? to : [], cc: type === 'PUBLIC' ? cc : [], attachmentIds },
          authorRole,
        );
        checkFields('CMT-2', comment, COMMENT_CREATED_SPEC);
        return comment;
      } catch (error) {
        if (files.length === 0) throw error;
        throw afterPartialSuccess(`Your files were uploaded to the ticket, but the ${what} was not confirmed.`, error, files);
      }
    },
    onSettled: (_data, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      patchTicketInLists(queryClient, null); // lastRequesterReplyAt changed server-side: lists go stale
      void refreshTicket(queryClient, ticketId);
    },
  });
}
