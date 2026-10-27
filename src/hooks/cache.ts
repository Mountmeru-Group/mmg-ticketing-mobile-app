// Narrow cache updates after a write (Phase 3b). Never queryClient.clear() — that is reserved for sign-out.
//
// After a successful write:
// - the affected ticket's detail and its open tabs refetch (05 B.18: some fields change after the response);
// - the ticket's row in every loaded list is replaced with the server's returned Ticket (not optimistic — this is
//   the server's answer), and lists are marked stale WITHOUT refetching; pull-to-refresh brings the order and
//   filter membership up to date;
// - creating a ticket refreshes only the FIRST page of the list on screen (one request).
// - Home's one-page lists and DSH-1 counts are marked stale (no request); pull-to-refresh on Home reloads them.
// - a task write replaces that one task in the ticket's cached detail and list rows with the server's returned task.
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { ActivityPage, Attachment, Paginated, Ticket, TicketDetail, TicketTaskEmbedded } from '@/types';
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
  markHomeStale(queryClient);
}

/**
 * Put the server's answer to a TKT-4 field edit or a TKT-5 assignment into the ticket's cached detail, so the saved
 * values show at once instead of the old ones until the refetch lands. Not optimistic: called on success. `slaPolicy`
 * is kept, because TKT-4 and TKT-5 return a reference where TKT-3 has the full row; refreshTicket() brings the rest up
 * to date.
 */
export function patchTicketDetail(queryClient: QueryClient, ticket: unknown): void {
  if (!looksLikeTicket(ticket)) return;
  queryClient.setQueryData<TicketDetail>(queryKeys.tickets.detail(ticket.id), (detail) =>
    detail ? { ...detail, ...ticket, slaPolicy: detail.slaPolicy } : detail,
  );
}

/**
 * After ATT-5 succeeded (G3): drop the file from the ticket's cached list and lower `_count.attachments`, so the row and
 * both counts change at once. Not optimistic: called on success. refreshTicket() then brings both up to date.
 */
export function removeAttachmentFromCache(queryClient: QueryClient, ticketId: string, attachmentId: string): void {
  let removed = false;
  queryClient.setQueryData<Attachment[]>(queryKeys.tickets.attachments(ticketId), (list) => {
    if (!Array.isArray(list)) return list;
    const next = list.filter((a) => a?.id !== attachmentId);
    removed = next.length < list.length;
    return next;
  });
  if (!removed) return;
  queryClient.setQueryData<TicketDetail>(queryKeys.tickets.detail(ticketId), (detail) =>
    detail?._count && typeof detail._count.attachments === 'number'
      ? { ...detail, _count: { ...detail._count, attachments: Math.max(0, detail._count.attachments - 1) } }
      : detail,
  );
}

/** Home's recent list and DSH-1 counts: marked stale, never refetched here (pull-to-refresh on Home does that). */
export function markHomeStale(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.recents(), refetchType: 'none' });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(), refetchType: 'none' });
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
  markHomeStale(queryClient);
}

/** A task the server returned (TSK-2/TSK-3), `{ deletedId }` after TSK-4. */
export type TaskChange = { task: TicketTaskEmbedded } | { deletedId: string };

function applyTaskChange(tasks: unknown, change: TaskChange): TicketTaskEmbedded[] | unknown {
  if (!Array.isArray(tasks)) return tasks;
  const list = tasks as TicketTaskEmbedded[];
  if ('deletedId' in change) return list.filter((t) => t?.id !== change.deletedId);
  const { task } = change;
  const exists = list.some((t) => t?.id === task.id);
  // The embedded shape has assignedTo without avatarUrl (03 B.5); keep only the embedded fields.
  const embedded: TicketTaskEmbedded = {
    ...task,
    assignedTo: task.assignedTo ? { id: task.assignedTo.id, displayName: task.assignedTo.displayName, email: task.assignedTo.email } : null,
  };
  const next = exists ? list.map((t) => (t?.id === task.id ? embedded : t)) : [...list, embedded];
  return next.sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0));
}

/**
 * Put the server's answer to a task write into the ticket's cached copies: the detail (TKT-3) and every loaded list
 * row (TKT-1 embeds tasks, and the standalone task list reads them from there). Not optimistic — called on success.
 * The detail is then refetched by refreshTicket(); lists are only marked stale.
 */
export function patchTaskInCaches(queryClient: QueryClient, ticketId: string, change: TaskChange): void {
  queryClient.setQueryData<Ticket>(queryKeys.tickets.detail(ticketId), (ticket) =>
    ticket ? { ...ticket, tasks: applyTaskChange(ticket.tasks, change) as TicketTaskEmbedded[] } : ticket,
  );
  queryClient.setQueriesData<ListData>({ queryKey: queryKeys.tickets.lists() }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        data: page.data.map((row) =>
          row?.id === ticketId ? { ...row, tasks: applyTaskChange(row.tasks, change) as TicketTaskEmbedded[] } : row,
        ),
      })),
    };
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists(), refetchType: 'none' });
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
