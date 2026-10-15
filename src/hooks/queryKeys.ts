// Every React Query key in the app comes from here, so the hooks and Phase 3b's invalidations agree.
//
//   ['auth', 'me']                                    AUTH-2  current user, once per cold start / sign-in
//   ['tickets', 'list', query]                        TKT-1   infinite; `query` = TKT-1 params minus page/limit
//   ['tickets', 'detail', id]                         TKT-3   one ticket (tasks are embedded; no TSK-1 call)
//   ['tickets', 'detail', id, 'comments']             CMT-1   conversation
//   ['tickets', 'detail', id, 'attachments']          ATT-1   attachment metadata
//   ['tickets', 'detail', id, 'history', pageSize]    TKT-7   infinite audit history
//   ['lookups', 'countries', 'mine' | 'all']          LKP-4 / LKP-5
//
// Keys nest by prefix: invalidating ['tickets', 'detail', id] also hits that ticket's comments, attachments
// and history; ['tickets'] hits every list and detail. The whole cache is cleared on sign-out (02 §5.5).
import type { TicketListQuery } from '@/types';

export type TicketListKeyParams = Omit<TicketListQuery, 'page' | 'limit'>;

export const queryKeys = {
  me: () => ['auth', 'me'] as const,

  tickets: {
    all: () => ['tickets'] as const,
    lists: () => ['tickets', 'list'] as const,
    list: (params: TicketListKeyParams) => ['tickets', 'list', params] as const,
    detail: (id: string) => ['tickets', 'detail', id] as const,
    comments: (id: string) => ['tickets', 'detail', id, 'comments'] as const,
    attachments: (id: string) => ['tickets', 'detail', id, 'attachments'] as const,
    history: (id: string, pageSize: number) => ['tickets', 'detail', id, 'history', pageSize] as const,
  },

  lookups: {
    countries: (source: 'mine' | 'all') => ['lookups', 'countries', source] as const,
  },
} as const;
