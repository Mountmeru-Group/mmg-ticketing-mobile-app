// M4 History — TKT-7 GET /tickets/:id/activity, audit entries only (the conversation comes from CMT-1).
// - Page size 20 (the server default is 50; this phase never asks for more than 20).
// - Every page repeats ALL comments (05 B.12); they are dropped here, and pages are merged by `_type` + `id`.
// - Newest first, with "Load older history"; the web sorts one 50-row page oldest-first instead, which does not
//   page coherently on a phone.
// ⚠ No server access check on TKT-7 for any role (05 C.1): the caller passes `enabled` only after TKT-3 succeeded.
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { assertObject, checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { mergeActivityItems, normalisePage } from '@/api/pagination';
import { ACTIVITY_PAGE_SPEC, AUDIT_ITEM_SPEC } from '@/api/responseSpecs';
import { getTicketActivity } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import type { ActivityAuditItem, ActivityPage } from '@/types';
import { visibleAuditItems } from '@/utils/activity';
import { queryKeys } from './queryKeys';

const HISTORY_PAGE_SIZE = 20;

export function useTicketHistory(ticketId: string, { enabled }: { enabled: boolean }) {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => queryKeys.tickets.history(ticketId, HISTORY_PAGE_SIZE), [ticketId]);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<ActivityPage> => {
      const res = await getTicketActivity(ticketId, { page: pageParam, pageSize: HISTORY_PAGE_SIZE });
      assertObject<ActivityPage>('TKT-7', res);
      if (!Array.isArray(res.items)) {
        throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from TKT-7' });
      }
      checkFields('TKT-7', res, ACTIVITY_PAGE_SPEC);
      checkFields('TKT-7', res.items.find((i) => i?._type === 'audit'), AUDIT_ITEM_SPEC, 'items[audit].');
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (normalisePage(last).hasNext ? last.page + 1 : undefined),
    enabled: enabled && !!ticketId,
  });

  const audits = useMemo(() => {
    const merged = mergeActivityItems((query.data?.pages ?? []).map((p) => p.items));
    const onlyAudits = merged.filter((i): i is ActivityAuditItem => i?._type === 'audit');
    return visibleAuditItems(onlyAudits, role);
  }, [query.data, role]);

  /** Pull-to-refresh: refetch the newest page only (see useTickets.refreshFirstPage). */
  const refreshFirstPage = useCallback(async () => {
    queryClient.setQueryData<InfiniteData<ActivityPage, number>>(queryKey, (data) =>
      data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
    );
    await query.refetch();
  }, [queryClient, queryKey, query.refetch]);

  return { ...query, audits, refreshFirstPage };
}
