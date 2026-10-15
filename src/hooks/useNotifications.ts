// M9 Notifications — NTF-1 list, NTF-2 unread count (Alerts tab badge), NTF-3 mark read, NTF-4 mark all read.
//
// Known backend quirks and what the app does about each (05 B.3, B.4, B.23) — the Alerts screen also tells the user:
// - B.3  The SSE stream never delivers events, so nothing arrives live. The app does not open the stream.
// - B.4  No push exists, so nothing arrives while the app is closed.
//        → The list and the badge load when first shown, and refresh on pull-to-refresh (Alerts or Home) and after a
//          mark-read. This phase forbids polling, so the 60-second NTF-2 poll the docs allow (01 NTF-2) is NOT used:
//          the badge can be behind until the person pulls to refresh.
// - B.23 Approval requests and decisions arrive as TICKET_UPDATED and MENTION is never produced, so `type` can't
//        route a tap. Taps route by `ticketId` only (the screen; an approval waiting on me for that ticket wins).
// - NTF-3 answers 200 even for unknown or foreign ids (01 NTF-3), so the badge is re-read from the server after
//   every mark-read instead of being decremented on the device.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { assertObject, assertPaginated, checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { normalisePage } from '@/api/pagination';
import {
  getUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead,
} from '@/api/notifications.api';
import { NOTIFICATION_SPEC, UNREAD_COUNT_SPEC } from '@/api/responseSpecs';
import type { Notification, Paginated, UnreadCount } from '@/types';
import { queryKeys } from './queryKeys';
import { requireOnline, wasRefusedOnDevice } from './writeGuards';

export const NOTIFICATION_PAGE_SIZE = 20;

type ListData = InfiniteData<Paginated<Notification>, number>;

export function useNotifications() {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => queryKeys.notifications.list(), []);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<Paginated<Notification>> => {
      const res = await listNotifications({ page: pageParam, limit: NOTIFICATION_PAGE_SIZE });
      assertPaginated<Notification>('NTF-1', res);
      checkFields('NTF-1', res.data[0], NOTIFICATION_SPEC, 'data[0].');
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (normalisePage(last).hasNext ? last.page + 1 : undefined),
  });

  // New notifications shift offset pages, so a row can repeat across pages.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const rows: Notification[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const n of page.data) {
        if (!n || typeof n.id !== 'string' || seen.has(n.id)) continue;
        seen.add(n.id);
        rows.push(n);
      }
    }
    return rows;
  }, [query.data]);

  /** Pull-to-refresh: newest page only (one request), plus the badge count (one request). */
  const refreshFirstPage = useCallback(async () => {
    queryClient.setQueryData<ListData>(queryKey, (data) =>
      data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
    );
    await Promise.all([query.refetch(), queryClient.invalidateQueries({ queryKey: queryKeys.notifications.count() })]);
  }, [queryClient, queryKey, query.refetch]);

  return { ...query, items, total: query.data?.pages[0]?.total, refreshFirstPage };
}

/** NTF-2 — the Alerts tab badge. Loaded once when the tabs mount; refreshed only as described at the top. */
export function useUnreadCount({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications.count(),
    queryFn: async (): Promise<UnreadCount> => {
      const res = await getUnreadCount();
      assertObject<UnreadCount>('NTF-2', res);
      if (typeof res.count !== 'number') {
        checkFields('NTF-2', res, UNREAD_COUNT_SPEC);
        throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from NTF-2' });
      }
      return res;
    },
    select: (res) => Math.max(0, Math.trunc(res.count)),
    enabled,
  });
}

/** Mark loaded rows read after the SERVER confirmed it (not optimistic). */
function markLoadedRead(queryClient: ReturnType<typeof useQueryClient>, match: (n: Notification) => boolean): void {
  queryClient.setQueryData<ListData>(queryKeys.notifications.list(), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            data: page.data.map((n) => (n && match(n) ? { ...n, isRead: true } : n)),
          })),
        }
      : data,
  );
}

/** NTF-3 — runs when the person opens (taps) a notification or taps its "mark read" button. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      requireOnline();
      return markNotificationRead(id);
    },
    onSuccess: (_res, id) => markLoadedRead(queryClient, (n) => n.id === id),
    onSettled: (_res, error) => {
      if (wasRefusedOnDevice(error)) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.count() });
    },
  });
}

/** NTF-4 — "Mark all read" (confirmed first: there is no "mark unread"). */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      requireOnline();
      return markAllNotificationsRead();
    },
    onSuccess: () => markLoadedRead(queryClient, () => true),
    onSettled: (_res, error) => {
      if (wasRefusedOnDevice(error)) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.count() });
    },
  });
}
