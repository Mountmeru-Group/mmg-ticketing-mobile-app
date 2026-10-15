// M3 — TKT-1 GET /tickets as an infinite list, TICKET_PAGE_SIZE (20) per page. Never `pageSize` (01 TKT-1).
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { assertPaginated, checkFields } from '@/api/drift';
import { normalisePage } from '@/api/pagination';
import { TICKET_LIST_ROW_SPEC } from '@/api/responseSpecs';
import { TICKET_PAGE_SIZE, listTickets } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import type { Paginated, Ticket } from '@/types';
import {
  roleDefaultTicketQuery, ticketFilterQuery, ticketSortQuery,
  type TicketNamedFilter, type TicketSortOption,
} from '@/utils/ticket-filters';
import { queryKeys, type TicketListKeyParams } from './queryKeys';

export interface UseTicketsOptions {
  filter: TicketNamedFilter;
  sort: TicketSortOption;
  /** Already normalised (normaliseTicketSearch); undefined = no `search` key. */
  search?: string;
  /** From listCountryParam(); undefined = no `countryId` key. */
  countryId?: string;
}

export function useTickets({ filter, sort, search, countryId }: UseTicketsOptions) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const params = useMemo<TicketListKeyParams | null>(() => {
    if (!user) return null;
    return {
      ...roleDefaultTicketQuery(user.role),
      ...(countryId !== undefined ? { countryId } : {}),
      ...ticketFilterQuery(filter, user),
      ...ticketSortQuery(sort),
      ...(search ? { search } : {}),
    };
  }, [user, filter, sort, search, countryId]);

  const queryKey = useMemo(() => queryKeys.tickets.list(params ?? {}), [params]);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<Paginated<Ticket>> => {
      const res = await listTickets({ ...params, page: pageParam, limit: TICKET_PAGE_SIZE });
      assertPaginated<Ticket>('TKT-1', res);
      checkFields('TKT-1', res.data[0], TICKET_LIST_ROW_SPEC, 'data[0].');
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (normalisePage(last).hasNext ? last.page + 1 : undefined),
    enabled: params !== null,
  });

  // Offset paging over a list sorted by updatedAt can repeat a row when tickets change between page loads.
  const tickets = useMemo(() => {
    const seen = new Set<string>();
    const rows: Ticket[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const ticket of page.data) {
        if (!ticket || typeof ticket.id !== 'string' || seen.has(ticket.id)) continue;
        seen.add(ticket.id);
        rows.push(ticket);
      }
    }
    return rows;
  }, [query.data]);

  const total = query.data?.pages[0]?.total;

  /**
   * Pull-to-refresh: drop every page but the first, then refetch — ONE request, instead of v5's default of
   * re-requesting every page the user has scrolled through (UAT shares production hardware, 00 §3).
   */
  const refreshFirstPage = useCallback(async () => {
    queryClient.setQueryData<InfiniteData<Paginated<Ticket>, number>>(queryKey, (data) =>
      data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
    );
    await query.refetch();
  }, [queryClient, queryKey, query.refetch]);

  return { ...query, tickets, total, refreshFirstPage };
}
