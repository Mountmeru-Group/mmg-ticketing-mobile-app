// Narrow cache updates after a write (Phase 3b). Never queryClient.clear() — that is reserved for sign-out.
//
// After a successful write:
// - the affected ticket's detail and its open tabs refetch (05 B.18: some fields change after the response);
// - the ticket's row in every loaded list is replaced with the server's returned Ticket (not optimistic — this is
//   the server's answer), and lists are marked stale WITHOUT refetching; pull-to-refresh brings the order and
//   filter membership up to date;
// - creating a ticket refreshes only the FIRST page of the list on screen (one request).
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { ActivityPage, Paginated, Ticket } from '@/types';
import { queryKeys } from './queryKeys';

type ListData = InfiniteData<Paginated<Ticket>, number>;

function looksLikeTicket(value: unknown): value is Ticket {
  return typeof value === 'object' && value !== null && typeof (value as Ticket).id === 'string';
}

/** Replace a ticket's row in every cached list with the server's returned copy, then mark lists stale. */
export function patchTicketInLists(queryClient: QueryClient, ticket: unknown): void {
  if (looksLikeTicket(ticket)) {
    queryClient.setQueriesData<ListData>({ queryKey: queryKeys.tickets.lists() }, (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          data: page.data.map((row) =>
            row.id === ticket.id
              ? // The write responses don't merge lastRequesterReplyAt (01 TKT-1); keep the list's value.
                { ...row, ...ticket, lastRequesterReplyAt: ticket.lastRequesterReplyAt ?? row.lastRequesterReplyAt }
              : row,
          ),
        })),
      };
    });
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists(), refetchType: 'none' });
}

/** Refetch one ticket and its open tabs (history trimmed to its newest page first). */
export async function refreshTicket(queryClient: QueryClient, ticketId: string): Promise<void> {
  queryClient.setQueriesData<InfiniteData<ActivityPage, number>>(
    { queryKey: [...queryKeys.tickets.detail(ticketId), 'history'] },
    (data) => (data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data),
  );
  await queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketId), refetchType: 'active' });
}

/** Mark one ticket stale without refetching (bulk results that are not on screen). */
export function markTicketStale(queryClient: QueryClient, ticketId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(ticketId), refetchType: 'none' });
}

/** Refresh the list on screen with ONE request: trim every cached list to its first page, refetch active ones. */
export async function refreshListsFirstPage(queryClient: QueryClient): Promise<void> {
  queryClient.setQueriesData<ListData>({ queryKey: queryKeys.tickets.lists() }, (data) =>
    data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
  );
  await queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists(), refetchType: 'active' });
}

/** A ticket already in the cache (detail first, then any loaded list page), without a network call. */
export function findCachedTicket(queryClient: QueryClient, ticketId: string): Ticket | undefined {
  const detail = queryClient.getQueryData<Ticket>(queryKeys.tickets.detail(ticketId));
  if (detail) return detail;
  for (const [, data] of queryClient.getQueriesData<ListData>({ queryKey: queryKeys.tickets.lists() })) {
    for (const page of data?.pages ?? []) {
      const row = page.data.find((t) => t.id === ticketId);
      if (row) return row;
    }
  }
  return undefined;
}
