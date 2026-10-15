// TKT-2 POST /tickets, then ATT-2 for staged files (05 §A.8: attachments upload AFTER create, to the new id).
// The body is built from the per-role allow-list in tickets.api.ts (END_USER: title, description, categoryId,
// source). `source` is 'API' until ask A15 (D5). level/mode are never collected (05 B.13).
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { uploadAttachments, type UploadFile } from '@/api/attachments.api';
import { checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { TICKET_SPEC } from '@/api/responseSpecs';
import { MOBILE_TICKET_SOURCE, createTicket } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import type { Ticket, TicketImpact, TicketUrgency } from '@/types';
import { isBlankBody, plainTextToHtml } from '@/utils/compose';
import { refreshListsFirstPage } from './cache';
import { refuse, requireOnline, requireRole } from './writeGuards';

export interface CreateTicketVariables {
  title: string;
  /** Plain text; sent as escaped <p> HTML (05 §A.16). */
  description: string;
  /** Deepest selected level (item || sub || top, 05 §A.8). */
  categoryId: string | null;
  // Staff only — dropped for END_USER by the allow-list in createTicket().
  impact?: TicketImpact;
  urgency?: TicketUrgency;
  teamId?: string;
  assignedToId?: string;
  requesterId?: string;
  files?: readonly UploadFile[];
}

export interface CreateTicketResult {
  ticket: Ticket;
  /** Set when the ticket was created but the attachments failed (05 §A.8 toast). */
  uploadError: unknown | null;
}

/** 05 §A.8 validation, plus the server's 3-character title minimum. Returns a message, or null when valid. */
export function validateNewTicket(v: Pick<CreateTicketVariables, 'title' | 'description' | 'categoryId'>): string | null {
  const title = v.title.trim();
  if (!title) return 'Title is required';
  if (title.length < 3) return 'Title must be at least 3 characters';
  if (title.length > 255) return 'Title must be 255 characters or fewer';
  if (isBlankBody(v.description)) return 'Description is required';
  if (!v.categoryId) return 'Please select a Category';
  return null;
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  return useMutation({
    mutationFn: async (v: CreateTicketVariables): Promise<CreateTicketResult> => {
      requireOnline();
      const creatorRole = requireRole(role);
      const problem = validateNewTicket(v);
      if (problem) throw refuse(problem);

      const ticket = await createTicket(
        {
          title: v.title.trim(),
          description: plainTextToHtml(v.description),
          categoryId: v.categoryId as string,
          source: MOBILE_TICKET_SOURCE,
          impact: v.impact,
          urgency: v.urgency,
          teamId: v.teamId,
          assignedToId: v.assignedToId,
          requesterId: v.requesterId,
        },
        creatorRole,
      );
      if (typeof ticket?.id !== 'string') {
        // The ticket very likely exists, but without its id the app cannot open it or attach files.
        throw new ApiClientError('shape', 201, { error: 'Unexpected response shape from TKT-2' });
      }
      checkFields('TKT-2', ticket, TICKET_SPEC);

      let uploadError: unknown | null = null;
      if (v.files && v.files.length > 0) {
        try {
          await uploadAttachments(ticket.id, v.files);
        } catch (error) {
          uploadError = error;
        }
      }
      return { ticket, uploadError };
    },
    // Settled, not success: after a 500 or timeout the ticket may still exist. One list request (first page only).
    onSettled: () => void refreshListsFirstPage(queryClient),
  });
}
