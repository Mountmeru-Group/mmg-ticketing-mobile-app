// Analytics (2026-11-26): ANL-1..4 (src/api/analytics.api.ts), ADMIN only, NOT YET DEPLOYED.
//
// COST AND SAFETY (Ronit's brief; 18 §5): these are heavy aggregations, and UAT shares Production's hardware (00 §3).
// - Every query is gated on canViewAnalytics(role) in the HOOK, not only by the hidden row and the unregistered route:
//   `enabled: allowed`, AND `queryFn` is TanStack's skipToken when not allowed, so not even a manual refetch() (Retry,
//   pull-to-refresh) can send one. No ANL request is ever sent for another role. The options are built by the exported
//   *Query() functions, so tests/rbac/analytics.test.mjs runs these very options through TanStack's own observers.
// - They run only when their screen is open: React Navigation mounts a drawer screen on its first visit and a stack
//   screen when it is pushed, and nothing else starts them. Then nothing refetches by itself:
//   staleTime 5 minutes, no polling, no timers, no refetch on focus, reconnect or remount. Pull-to-refresh and the
//   period chips are the only ways to ask again.
// - Lists page by 50, capped at 500 rows (as the audit log): never all 1,631 people.
// - "Not deployed" is data ({ deployed: false }), not an error, so it is cached like an answer and never retried.
import {
  infiniteQueryOptions, queryOptions, skipToken, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  ANALYTICS_PAGE_SIZE, getAnalyticsInstalls, getAnalyticsOverview, listAnalyticsUserActivity, listAnalyticsUsers,
  type Deployable,
} from '@/api/analytics.api';
import { normaliseLoosePage, type LoosePage } from '@/api/pagination';
import { useAuthStore } from '@/store/auth.store';
import type { AnalyticsRange, AnalyticsUserRow, AnalyticsUserSort, AuditLogEntry, UserRole } from '@/types';
import { canViewAnalytics } from '@/utils/permissions';
import { queryKeys } from './queryKeys';

/** At least five minutes on all of them (Ronit's brief; 18 §5 "Cache it"). */
export const ANALYTICS_STALE_TIME_MS = 5 * 60_000;
/** As the audit log: 10 pages of 50. */
export const ANALYTICS_LIST_CAP = 500;
const MAX_PAGES = Math.ceil(ANALYTICS_LIST_CAP / ANALYTICS_PAGE_SIZE);

/** No background refetch of any kind; the query client's defaults say the same, this says it again, per query. */
const NO_AUTO_REFETCH = {
  staleTime: ANALYTICS_STALE_TIME_MS,
  refetchInterval: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;

/** The one gate for every ANL query: a signed-in ADMIN. */
export function analyticsAllowed(role: UserRole | null | undefined): boolean {
  return !!role && canViewAnalytics(role);
}

function useAnalyticsAllowed(): boolean {
  return analyticsAllowed(useAuthStore((s) => s.user?.role));
}

// ── Query options (pure: the hooks below and the tests use these) ──

/** ANL-1, screen one. */
export function overviewQuery(range: AnalyticsRange, allowed: boolean) {
  return queryOptions({
    queryKey: queryKeys.analytics.overview(range),
    queryFn: allowed ? () => getAnalyticsOverview({ range }) : skipToken,
    enabled: allowed,
    ...NO_AUTO_REFETCH,
  });
}

/** ANL-4, screen one: Google Play's figures. */
export function installsQuery(range: AnalyticsRange, allowed: boolean) {
  return queryOptions({
    queryKey: queryKeys.analytics.installs(range),
    queryFn: allowed ? () => getAnalyticsInstalls({ range }) : skipToken,
    enabled: allowed,
    ...NO_AUTO_REFETCH,
  });
}

type LooseDeployablePage<T> = Deployable<LoosePage<T>>;

function looseListQuery<T>(
  queryKey: readonly unknown[],
  fetchPage: (page: number) => Promise<LooseDeployablePage<T>>,
  allowed: boolean,
) {
  return infiniteQueryOptions({
    queryKey,
    queryFn: allowed ? ({ pageParam }: { pageParam: number }) => fetchPage(pageParam) : skipToken,
    initialPageParam: 1,
    getNextPageParam: (last: LooseDeployablePage<T>, pages: LooseDeployablePage<T>[]) =>
      last.deployed && normaliseLoosePage(last.data).hasNext && pages.length < MAX_PAGES ? last.data.page + 1 : undefined,
    enabled: allowed,
    ...NO_AUTO_REFETCH,
  });
}

/** ANL-2, screen two. Sorted by the server (`sortBy`); the app never re-sorts the rows it holds. */
export function usersQuery(range: AnalyticsRange, sortBy: AnalyticsUserSort, allowed: boolean) {
  return looseListQuery<AnalyticsUserRow>(
    queryKeys.analytics.users(range, sortBy),
    (page) => listAnalyticsUsers({ range, sortBy, page, limit: ANALYTICS_PAGE_SIZE }),
    allowed,
  );
}

/** ANL-3, screen three: one person's activity, newest first, read as AUD-1's entries. */
export function userActivityQuery(userId: string, range: AnalyticsRange, allowed: boolean) {
  return looseListQuery<AuditLogEntry>(
    queryKeys.analytics.user(userId, range),
    (page) => listAnalyticsUserActivity(userId, { range, page, limit: ANALYTICS_PAGE_SIZE }),
    allowed && !!userId,
  );
}

// ── Hooks ────────────────────────────────────────────────────

export function useAnalyticsOverview(range: AnalyticsRange) {
  const allowed = useAnalyticsAllowed();
  return useQuery(overviewQuery(range, allowed));
}

export function useAnalyticsInstalls(range: AnalyticsRange) {
  const allowed = useAnalyticsAllowed();
  return useQuery(installsQuery(range, allowed));
}

/** The infinite part both lists share: rows de-duplicated by key, the cap, "not deployed", pull-to-refresh. */
function useLooseList<T>(options: ReturnType<typeof looseListQuery<T>>, rowKey: (row: T) => string | undefined) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery(options);
  const { queryKey } = options;

  const pages = query.data?.pages;
  const first = pages?.[0];
  /** The server has no such route: the screen says "not available yet". */
  const notDeployed = first?.deployed === false;
  /** The answer had no array of rows at all: the list is left out (not shown as empty). */
  const unlisted = !!first && first.deployed && !first.data.listed;

  // Offset paging over a list that moves (people act between page loads) repeats rows: keep each key once.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const page of pages ?? []) {
      if (!page.deployed) continue;
      for (const row of page.data.rows) {
        const key = rowKey(row);
        if (key !== undefined) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        out.push(row);
      }
    }
    return out;
  }, [pages, rowKey]);

  const total = first?.deployed ? first.data.total : null;
  const last = pages?.[pages.length - 1];
  const capped = !!pages && pages.length >= MAX_PAGES && !!last?.deployed && normaliseLoosePage(last.data).hasNext;

  /** Pull-to-refresh: keep only the first page, then refetch it: ONE request (as the audit log). */
  const refreshFirstPage = useCallback(async () => {
    queryClient.setQueryData<InfiniteData<LooseDeployablePage<T>, number>>(queryKey, (data) =>
      data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
    );
    await query.refetch();
  }, [queryClient, queryKey, query.refetch]);

  return { ...query, rows, total, capped, notDeployed, unlisted, refreshFirstPage };
}

const userRowKey = (row: AnalyticsUserRow) => row.userId;
const entryKey = (entry: AuditLogEntry) => entry.id;

export function useAnalyticsUsers(range: AnalyticsRange, sortBy: AnalyticsUserSort) {
  const allowed = useAnalyticsAllowed();
  const options = useMemo(() => usersQuery(range, sortBy, allowed), [range, sortBy, allowed]);
  return useLooseList(options, userRowKey);
}

export function useAnalyticsUserActivity(userId: string, range: AnalyticsRange) {
  const allowed = useAnalyticsAllowed();
  const options = useMemo(() => userActivityQuery(userId, range, allowed), [userId, range, allowed]);
  return useLooseList(options, entryKey);
}
