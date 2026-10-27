// M4 — TKT-3 GET /tickets/:id. Its success is the gate for every sub-resource call (05 §C hygiene).
// Tasks come embedded in this response (TICKET_INCLUDE), so the Tasks tab needs no TSK-1 call.
import { useQuery } from '@tanstack/react-query';

import { assertObject, checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { TASK_SPEC, TICKET_SPEC } from '@/api/responseSpecs';
import { getTicket } from '@/api/tickets.api';
import type { TicketDetail } from '@/types';
import { queryKeys } from './queryKeys';

/** TKT-3 with the envelope check. Shared by useTicket and the approval cards (same cache key). */
export async function fetchTicketDetail(ticketId: string): Promise<TicketDetail> {
  const res = await getTicket(ticketId);
  assertObject<TicketDetail>('TKT-3', res);
  // The id is what every sub-resource call uses; without it nothing else on the screen is trustworthy.
  if (typeof res.id !== 'string') {
    throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from TKT-3' });
  }
  checkFields('TKT-3', res, TICKET_SPEC);
  if (Array.isArray(res.tasks)) checkFields('TKT-3', res.tasks[0], TASK_SPEC, 'tasks[0].');
  return res;
}

export function useTicket(ticketId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.detail(ticketId),
    queryFn: () => fetchTicketDetail(ticketId),
    enabled: !!ticketId,
  });
}
