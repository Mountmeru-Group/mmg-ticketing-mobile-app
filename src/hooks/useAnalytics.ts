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
// - Lists page by 50, capped at ANALYTICS_MAX_PAGES (10 pages, 500 rows): never all 1,631 people.
// - "Not deployed" is data ({ deployed: false }), not an error, so it is cached like an answer and never retried.
//
// SCREEN TWO LOADS EVERY PAGE (2026-11-27, Ronit's decision: search runs on the phone, ANL-2 has no `search`):
// - On opening, useAnalyticsUsers asks for page after page until the rows reach `total`, the server says it was the
//   last, or the cap. ONE AT A TIME (loadNextPageIfDue): the next request only after the last answer.
// - It stops at the first failure and keeps what arrived; screen two says the list is incomplete (peopleCoverage).
// - The pages are one infinite query, cached together under one key per period and sort: reopening within staleTime
//   asks for nothing, and an interrupted load carries on from the page it reached. Typing never asks for anything: the
//   search is not part of any key. Pull-to-refresh keeps page one, asks for it again, then loads the rest in order.
// - Screen three (one person's timeline) still loads a page as it is scrolled to.
import {
  infiniteQueryOptions, queryOptions, skipToken, useInfiniteQuery, useQuery, useQueryClient, type FetchStatus,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

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
/** THE CAP: at most 10 pages of a list (Ronit's brief, 2026-11-27). Screen two loads up to here on opening. */
export const ANALYTICS_MAX_PAGES = 10;
/** What the cap holds: 500 rows at ANALYTICS_PAGE_SIZE (50) a page, as the audit log. */
export const ANALYTICS_LIST_CAP = ANALYTICS_MAX_PAGES * ANALYTICS_PAGE_SIZE;

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

function rowsIn<T>(pages: readonly LooseDeployablePage<T>[]): number {
  return pages.reduce((n, page) => n + (page.deployed ? page.data.rows.length : 0), 0);
}

/**
 * The page after `last`, the cap aside. None when the route is not there, the server says `last` was the last page, or
 * the rows already reach the server's `total`.
 */
function pageAfter<T>(last: LooseDeployablePage<T>, pages: readonly LooseDeployablePage<T>[]): number | undefined {
  if (!last.deployed) return undefined;
  const { hasNext, total } = normaliseLoosePage(last.data);
  if (!hasNext || (total !== null && rowsIn(pages) >= total)) return undefined;
  return last.data.page + 1;
}

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
      pages.length < ANALYTICS_MAX_PAGES ? pageAfter(last, pages) : undefined,
    enabled: allowed,
    ...NO_AUTO_REFETCH,
  });
}

/**
 * ANL-2 requests go ONE AT A TIME across the whole app, not just within one list: TanStack keeps one page of a list in
 * flight, but a sort chip tapped (or a pull-to-refresh) mid-load starts a request while the last one still runs on the
 * server. Each waits here for the one before it to answer, or fail.
 */
let usersInFlight: Promise<unknown> = Promise.resolve();
function oneUsersRequestAtATime<R>(send: () => Promise<R>): Promise<R> {
  const next = usersInFlight.then(send, send);
  usersInFlight = next.catch(() => undefined);
  return next;
}

/** ANL-2, screen two. Sorted by the server (`sortBy`); the app never re-sorts the rows it holds. No search: none exists. */
export function usersQuery(range: AnalyticsRange, sortBy: AnalyticsUserSort, allowed: boolean) {
  return looseListQuery<AnalyticsUserRow>(
    queryKeys.analytics.users(range, sortBy),
    (page) => oneUsersRequestAtATime(() => listAnalyticsUsers({ range, sortBy, page, limit: ANALYTICS_PAGE_SIZE })),
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

// ── What a list holds (pure: the hooks below and the tests use these) ──

export interface LooseListState<T> {
  /** Every row, once each (by key), in the server's order. */
  rows: T[];
  total: number | null;
  /** The cap stopped the list, and the server has more. */
  capped: boolean;
  /** The server has no such route: the screen says "not available yet". */
  notDeployed: boolean;
  /** The answer had no array of rows at all: the list is left out (not shown as empty). */
  unlisted: boolean;
}

export function looseListState<T>(
  pages: readonly LooseDeployablePage<T>[] | undefined,
  rowKey: (row: T) => string | undefined,
): LooseListState<T> {
  const first = pages?.[0];
  const last = pages?.[pages.length - 1];
  // Offset paging over a list that moves (people act between page loads) repeats rows: keep each key once.
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const page of pages ?? []) {
    if (!page.deployed) continue;
    for (const row of page.data.rows) {
      const key = rowKey(row);
      if (key !== undefined) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push(row);
    }
  }
  return {
    rows,
    total: first?.deployed ? first.data.total : null,
    capped: !!pages && !!last && pages.length >= ANALYTICS_MAX_PAGES && pageAfter(last, pages) !== undefined,
    notDeployed: first?.deployed === false,
    unlisted: !!first && first.deployed && !first.data.listed,
  };
}

/** Pull-to-refresh: the cache keeps page one only, so the refetch is ONE request (as the audit log). */
export function keepFirstPage<D>(data: InfiniteData<D, number> | undefined): InfiniteData<D, number> | undefined {
  return data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data;
}

/** What the load-everything step reads: an infinite query's result. */
export interface LoadAllState {
  hasNextPage: boolean;
  fetchStatus: FetchStatus;
  isError: boolean;
}

/**
 * Screen two's load-everything step, run on opening and again after every answer. It asks for the next page only when
 * there is one (none past the cap or the end), nothing is in flight or waiting for the network, and nothing has
 * failed: so pages come ONE AT A TIME, in order, and a failure stops the load. `cancelRefetch: false` makes a second
 * call while a request is in flight a no-op, never a second request. Returns whether it asked.
 */
export function loadNextPageIfDue(
  state: LoadAllState,
  fetchNextPage: (options: { cancelRefetch: boolean }) => Promise<unknown>,
): boolean {
  if (!state.hasNextPage || state.fetchStatus !== 'idle' || state.isError) return false;
  void fetchNextPage({ cancelRefetch: false }).catch(() => {});
  return true;
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

/**
 * The infinite part both lists share: rows de-duplicated by key, the cap, "not deployed", pull-to-refresh. `loadAll`
 * (screen two): load every page on opening, one at a time (loadNextPageIfDue).
 */
function useLooseList<T>(
  options: ReturnType<typeof looseListQuery<T>>,
  rowKey: (row: T) => string | undefined,
  loadAll: boolean,
) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery(options);
  const { queryKey } = options;

  const pages = query.data?.pages;
  const state = useMemo(() => looseListState(pages, rowKey), [pages, rowKey]);

  const { hasNextPage, fetchStatus, isError, fetchNextPage } = query;
  useEffect(() => {
    if (loadAll) loadNextPageIfDue({ hasNextPage, fetchStatus, isError }, fetchNextPage);
  }, [loadAll, hasNextPage, fetchStatus, isError, fetchNextPage]);

  /** Pull-to-refresh: keep only the first page, then refetch it: ONE request. Screen two then loads the rest again. */
  const refreshFirstPage = useCallback(async () => {
    queryClient.setQueryData<InfiniteData<LooseDeployablePage<T>, number>>(queryKey, keepFirstPage);
    await query.refetch();
  }, [queryClient, queryKey, query.refetch]);

  return { ...query, ...state, refreshFirstPage };
}

/** The key a person is kept once by (rows repeat across pages when the list moves). */
export const userRowKey = (row: AnalyticsUserRow) => row.userId;
const entryKey = (entry: AuditLogEntry) => entry.id;

/** Screen two: every page, loaded on opening (to the cap), so the search on the phone covers everyone it can. */
export function useAnalyticsUsers(range: AnalyticsRange, sortBy: AnalyticsUserSort) {
  const allowed = useAnalyticsAllowed();
  const options = useMemo(() => usersQuery(range, sortBy, allowed), [range, sortBy, allowed]);
  return useLooseList(options, userRowKey, true);
}

/** Screen three: a page as it is scrolled to. */
export function useAnalyticsUserActivity(userId: string, range: AnalyticsRange) {
  const allowed = useAnalyticsAllowed();
  const options = useMemo(() => userActivityQuery(userId, range, allowed), [userId, range, allowed]);
  return useLooseList(options, entryKey, false);
}
