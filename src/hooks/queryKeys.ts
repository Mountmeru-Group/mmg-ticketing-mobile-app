// Every React Query key in the app comes from here, so the hooks and Phase 3b's invalidations agree.
//
//   ['tickets', 'list', query]                       TKT-1   infinite; `query` = TKT-1 params minus page/limit
//   ['tickets', 'recent', query]                     TKT-1   one page of 5 (Home: END_USER and L2_MANAGER) — NOT infinite
//   ['tickets', 'link', number, query]               TKT-1   ticket-number lookup for a deep link (05 §A.11)
//   ['tickets', 'detail', id]                         TKT-3   one ticket (tasks are embedded; no TSK-1 call)
//   ['tickets', 'detail', id, 'comments']             CMT-1   conversation
//   ['tickets', 'detail', id, 'attachments']          ATT-1   attachment metadata
//   ['tickets', 'detail', id, 'history', pageSize]    TKT-7   infinite audit history
//   ['tickets', 'detail', id, 'recipients']           TKT-9   Reply-All To/CC (staff, composer only)
//   ['tickets', 'detail', id, 'suggested']            TKT-10  recommended technicians (assign picker only)
//   ['lookups', 'countries', 'mine' | 'all']          LKP-4 / LKP-5
//   ['lookups', 'categories']                         LKP-1   flat category list (create form, M4 category editor)
//   ['lookups', 'teams']                              LKP-2   groups + members (assign picker, create form)
//   ['lookups', 'priority-matrix']                    LKP-6   impact × urgency → priority (M4 preview; ADMIN, AGENT)
//   ['lookups', 'canned-responses']                   LKP-7   reply templates (M5 composer; staff)
//   ['users', 'search', term, roles]                  USR-3   typeahead (≥ 2 characters)
//   ['users', 'profile', id]                          USR-1   own profile (M10)
//   ['dashboard', range, countryId]                   DSH-1   Home KPIs (never for L2_MANAGER)
//   ['notifications', 'list']                         NTF-1   infinite, 20 per page
//   ['notifications', 'count']                        NTF-2   unread badge
//   ['approvals', 'pending']                          APR-1   my pending approvals (not paginated)
//   ['announcements', 'active']                       ANN-1
//   ['kb', 'categories']                              KB-1
//   ['kb', 'articles', categoryId]                    KB-2    infinite, 20 per page
//   ['kb', 'search', term]                            KB-3    (≥ 2 characters)
//   ['kb', 'article', slug]                           KB-4
//
// Keys nest by prefix: invalidating ['tickets', 'detail', id] also hits that ticket's comments, attachments
// and history. Writes invalidate the narrowest key that changed; the whole cache is cleared ONLY on sign-out (02 §5.5).
// ['tickets', 'list'] holds infinite data only (cache.ts maps its `pages`): one-page lists live under other keys.
import type { TicketListQuery } from '@/types';

export type TicketListKeyParams = Omit<TicketListQuery, 'page' | 'limit'>;

export const queryKeys = {
  tickets: {
    all: () => ['tickets'] as const,
    lists: () => ['tickets', 'list'] as const,
    list: (params: TicketListKeyParams) => ['tickets', 'list', params] as const,
    recents: () => ['tickets', 'recent'] as const,
    recent: (params: TicketListKeyParams) => ['tickets', 'recent', params] as const,
    byNumber: (ticketNumber: number, params: TicketListKeyParams) => ['tickets', 'link', ticketNumber, params] as const,
    detail: (id: string) => ['tickets', 'detail', id] as const,
    comments: (id: string) => ['tickets', 'detail', id, 'comments'] as const,
    attachments: (id: string) => ['tickets', 'detail', id, 'attachments'] as const,
    history: (id: string, pageSize: number) => ['tickets', 'detail', id, 'history', pageSize] as const,
    recipients: (id: string) => ['tickets', 'detail', id, 'recipients'] as const,
    suggested: (id: string) => ['tickets', 'detail', id, 'suggested'] as const,
  },

  lookups: {
    countries: (source: 'mine' | 'all') => ['lookups', 'countries', source] as const,
    categories: () => ['lookups', 'categories'] as const,
    teams: () => ['lookups', 'teams'] as const,
    priorityMatrix: () => ['lookups', 'priority-matrix'] as const,
    cannedResponses: () => ['lookups', 'canned-responses'] as const,
  },

  users: {
    search: (term: string, roles: readonly string[]) => ['users', 'search', term, roles.join(',')] as const,
    profile: (id: string) => ['users', 'profile', id] as const,
  },

  dashboard: {
    all: () => ['dashboard'] as const,
    summary: (range: string, countryId: string | undefined) => ['dashboard', range, countryId ?? null] as const,
  },

  notifications: {
    all: () => ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    count: () => ['notifications', 'count'] as const,
  },

  approvals: {
    pending: () => ['approvals', 'pending'] as const,
  },

  announcements: {
    active: () => ['announcements', 'active'] as const,
  },

  kb: {
    categories: () => ['kb', 'categories'] as const,
    allArticles: () => ['kb', 'articles'] as const,
    articles: (categoryId: string | null) => ['kb', 'articles', categoryId] as const,
    search: (term: string) => ['kb', 'search', term] as const,
    article: (slug: string) => ['kb', 'article', slug] as const,
  },
} as const;
