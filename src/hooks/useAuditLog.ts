// M20 Audit log (G8) — AUD-1 GET /audit-logs (api/auditLog.api.ts says which path) as an infinite list,
// AUDIT_PAGE_SIZE (50) per page, ADMIN only.
// Sent only when canViewAuditLog(role): the route is registered for ADMIN alone too, so no other role ever sends AUD-1.
// No polling, default staleTime (src/api/queryClient.ts): UAT shares production hardware (00 §3).
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { AUDIT_PAGE_SIZE, listAuditLog } from '@/api/auditLog.api';
import { assertPaginated, checkFields } from '@/api/drift';
import { normalisePage } from '@/api/pagination';
import { AUDIT_LOG_ROW_SPEC } from '@/api/responseSpecs';
import { useAuthStore } from '@/store/auth.store';
import type { AuditLogEntry, Paginated } from '@/types';
import { auditLogQuery, auditTicketFilterIgnored, type AuditLogFilters } from '@/utils/audit-log';
import { canViewAuditLog } from '@/utils/permissions';
import { queryKeys } from './queryKeys';

/**
 * Memory cap, as the ticket list's (useTickets TICKET_LIST_CAP, docs/PERFORMANCE.md §4 item 1): the list stops after
 * 500 entries (10 pages). Each filter combination is its own query, so each one loads normally up to the cap.
 */
export const AUDIT_LOG_CAP = 500;
const AUDIT_LOG_MAX_PAGES = Math.ceil(AUDIT_LOG_CAP / AUDIT_PAGE_SIZE);

export function useAuditLog(filters: AuditLogFilters) {
  const role = useAuthStore((s) => s.user?.role);
  const allowed = !!role && canViewAuditLog(role);
  const queryClient = useQueryClient();

  // Every filter is a server-side AUD-1 param; nothing is filtered on the device.
  const params = useMemo(() => auditLogQuery(filters), [filters]);
  const queryKey = useMemo(() => queryKeys.auditLog.list(params), [params]);
  const { ticketNumber } = params;

  /** The server ignored the ticket number (no such ticket) and sent the whole log: show none of it (05 B.40). */
  const ignored = (first: Paginated<AuditLogEntry> | undefined) =>
    ticketNumber !== undefined && !!first && auditTicketFilterIgnored(first.data, ticketNumber);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<Paginated<AuditLogEntry>> => {
      const res = await listAuditLog({ ...params, page: pageParam, limit: AUDIT_PAGE_SIZE });
      assertPaginated<AuditLogEntry>('AUD-1', res);
      checkFields('AUD-1', res.data[0], AUDIT_LOG_ROW_SPEC, 'data[0].');
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      !ignored(pages[0]) && normalisePage(last).hasNext && pages.length < AUDIT_LOG_MAX_PAGES ? last.page + 1 : undefined,
    enabled: allowed,
  });

  const ticketMissing = ignored(query.data?.pages[0]);

  // Offset paging over a log that grows at the top repeats rows when entries are written between page loads.
  const entries = useMemo(() => {
    if (ticketMissing) return [];
    const seen = new Set<string>();
    const rows: AuditLogEntry[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const entry of page.data) {
        if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) continue;
        seen.add(entry.id);
        rows.push(entry);
      }
    }
    return rows;
  }, [query.data, ticketMissing]);

  const total = ticketMissing ? 0 : query.data?.pages[0]?.total;
  const pages = query.data?.pages;
  // The server has more, but the cap stopped the list; the footer says so.
  const capped = !!pages && pages.length >= AUDIT_LOG_MAX_PAGES && normalisePage(pages[pages.length - 1]).hasNext;

  /** Pull-to-refresh: keep only the first page, then refetch it: ONE request (as useTickets). */
  const refreshFirstPage = useCallback(async () => {
    queryClient.setQueryData<InfiniteData<Paginated<AuditLogEntry>, number>>(queryKey, (data) =>
      data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
    );
    await query.refetch();
  }, [queryClient, queryKey, query.refetch]);

  return { ...query, entries, total, capped, ticketMissing, refreshFirstPage };
}
