// M3 — TKT-1 GET /tickets as an infinite list, TICKET_PAGE_SIZE (20) per page. Never `pageSize` (01 TKT-1).
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { assertPaginated, checkFields } from '@/api/drift';
import { normalisePage } from '@/api/pagination';
import { TICKET_LIST_ROW_SPEC } from '@/api/responseSpecs';
import { TICKET_PAGE_SIZE, listTickets } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import type { Paginated, Ticket } from '@/types';
import { ticketListFilters } from '@/utils/permissions';
import {
  ticketListQuery, type TicketAdvancedFilters, type TicketNamedFilter, type TicketSortOption,
} from '@/utils/ticket-filters';
import { queryKeys, type TicketListKeyParams } from './queryKeys';

/**
 * Memory cap for low-end phones (docs/PERFORMANCE.md §4 item 1, approved in Phase P2): the list stops loading after
 * 500 tickets (25 pages). Each filter, search and sort is its own query, so each one loads normally up to the cap.
 */
export const TICKET_LIST_CAP = 500;
const TICKET_LIST_MAX_PAGES = Math.ceil(TICKET_LIST_CAP / TICKET_PAGE_SIZE);

/** The page to load after `pages` (getNextPageParam): none past the server's last page, or once the cap is reached. */
export function nextTicketListPage(last: Paginated<Ticket>, pages: readonly Paginated<Ticket>[]): number | undefined {
  return normalisePage(last).hasNext && pages.length < TICKET_LIST_MAX_PAGES ? last.page + 1 : undefined;
}

/** The server has more, but the cap stopped the list; the footer says so. */
export function isTicketListCapped(pages: readonly Paginated<Ticket>[] | undefined): boolean {
  return !!pages && pages.length >= TICKET_LIST_MAX_PAGES && normalisePage(pages[pages.length - 1]).hasNext;
}

export interface UseTicketsOptions {
  filter: TicketNamedFilter;
  sort: TicketSortOption;
  /** Already normalised (normaliseTicketSearch); undefined = no `search` key. */
  search?: string;
  /** From listCountryParam(); undefined = no `countryId` key. */
  countryId?: string;
  /** M3 Filters sheet (G2). Only the filters ticketListFilters() gives this person are sent. */
  advanced?: TicketAdvancedFilters;
}

export function useTickets({ filter, sort, search, countryId, advanced }: UseTicketsOptions) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  // Every filter is a server-side TKT-1 param; nothing is filtered on the device (docs/G2-WEB-FILTERS.md).
  const params = useMemo<TicketListKeyParams | null>(() => {
    if (!user) return null;
    return ticketListQuery({ me: user, filter, sort, search, countryId, advanced, allowed: ticketListFilters(user) });
  }, [user, filter, sort, search, countryId, advanced]);

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
    getNextPageParam: nextTicketListPage,
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
  const capped = isTicketListCapped(query.data?.pages);

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

  return { ...query, tickets, total, capped, refreshFirstPage };
}
