// M2 Home reads: DSH-1 counts and a short recent-tickets list. Pull-to-refresh only — no polling (01 DSH-1).
//
// WHICH DSH-1 KPIs ARE SHOWN (05 B.20; re-checked against backend dashboard.controller.ts:331-455 for G6, 2026-11-02):
//   used     the web dashboard's set (utils/home-kpis.ts HomeKpis): total, currentlyOpen, inProgress, resolved,
//            resolvedToday, slaBreached, closed, onHold, the five pending* counts, plus totalOpen (Active, app only),
//            and `recent`. Each of those queries keeps the caller's scope. unassigned too, but shown to ADMIN and the
//            UI's triage AGENT only (04 M2, permissions.ts homeChips).
//   skipped  open (the web shows currentlyOpen instead), pending (plain PENDING: no web tile), createdToday/Yesterday,
//            slaBreachPercent (not shown on the web dashboard); closedToday / closedYesterday (their `OR` overwrites the
//            scope: global for AGENT/L2); byStatus, byPriority (charts); workload, trends, technician*/team matrices,
//            bySource, countryGroupRows, monthlyTrends (unscoped or mis-scoped, 05 B.20 / C.19).
// PERIOD (G6): the Home PERIOD row's choice (ui.store homePeriod), sent as the web sends it (utils/dashboard-period.ts).
//            A Custom period with no valid From–To sends nothing: the query waits, as the web's does (:106).
//   L2_MANAGER: DSH-1 is NOT called at all. The server caches /dashboard/all per ROLE for L2 (cache key
//            `role:L2_MANAGER`, 01 DSH-1, 05 C.19), so every number in it can be another L2 manager's — including the
//            `recent` list. L2 Home gets shortcut tiles without counts and a TKT-1 recent list instead.
//   `unassigned` caveat: for an AGENT with no group and not on the server's triage list, the server drops the scope on
//            this one count. The app can't see the server's triage list (A4), so it shows the count to ADMIN and the
//            UI's triage AGENT (no country) only, as the brief says.
import { useQuery } from '@tanstack/react-query';

import { getDashboard } from '@/api/dashboard.api';
import { assertObject, assertPaginated, checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { DASHBOARD_RECENT_SPEC, DASHBOARD_SPEC, TICKET_LIST_ROW_SPEC } from '@/api/responseSpecs';
import { listTickets } from '@/api/tickets.api';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { DashboardAll, DashboardRecentTicket, Ticket } from '@/types';
import { dashboardPeriodKey, dashboardPeriodQuery } from '@/utils/dashboard-period';
import { HOME_KPI_KEYS, type HomeKpis } from '@/utils/home-kpis';
import { listCountryParam, roleDefaultTicketQuery } from '@/utils/ticket-filters';
import { queryKeys, type TicketListKeyParams } from './queryKeys';

const RECENT_COUNT = 5;

/** The only parts of DSH-1 a screen may read. Everything else in the response never leaves this hook. */
export interface SafeDashboard {
  kpis: HomeKpis;
  recent: DashboardRecentTicket[];
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function pickSafe(res: DashboardAll): SafeDashboard {
  const kpis = {} as HomeKpis;
  for (const key of HOME_KPI_KEYS) kpis[key] = num(res.kpis[key]);
  return {
    kpis,
    recent: Array.isArray(res.recent) ? res.recent.filter((t) => t && typeof t.id === 'string') : [],
  };
}

/** DSH-1 for ADMIN, AGENT and END_USER, for the Home period. Never enabled for L2_MANAGER (see above). */
export function useDashboard() {
  const user = useAuthStore((s) => s.user);
  const selectedCountry = useUiStore((s) => s.ticketCountryId);
  const period = useUiStore((s) => s.homePeriod);
  const customRange = useUiStore((s) => s.homeCustomRange);
  // Same country rule as the ticket list (05 §A.12). `''` means "no filter" to DSH-1 too, so it is not sent.
  const countryId = (user ? listCountryParam(user, selectedCountry) : undefined) || undefined;
  // null = Custom without a valid From–To: nothing to ask yet.
  const periodQuery = dashboardPeriodQuery(period, customRange);
  const queryKey = queryKeys.dashboard.summary(periodQuery ? dashboardPeriodKey(periodQuery) : 'custom:incomplete', countryId);

  return useQuery({
    queryKey,
    // When only the period changed, the last response stays as placeholder data while the new one loads (or while a
    // Custom range is incomplete), so `recent` — which no period filters (01 DSH-1) — does not blank out. Its KPIs are
    // another period's: Home never shows counts while `isPlaceholderData` is true. A different country starts empty.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === queryKey[2] ? previous : undefined),
    queryFn: async (): Promise<DashboardAll> => {
      // refetch() runs even on a disabled query: never let it ask for the default window under a Custom key.
      if (!periodQuery) throw new Error('Pick a From day and a To day to see the counts.');
      const res = await getDashboard({ ...periodQuery, countryId });
      assertObject<DashboardAll>('DSH-1', res);
      if (typeof res.kpis !== 'object' || res.kpis === null) {
        throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from DSH-1' });
      }
      checkFields('DSH-1', res, DASHBOARD_SPEC);
      if (Array.isArray(res.recent)) checkFields('DSH-1', res.recent[0], DASHBOARD_RECENT_SPEC, 'recent[0].');
      return res;
    },
    select: pickSafe,
    enabled: !!user && user.role !== 'L2_MANAGER' && periodQuery !== null,
  });
}

/**
 * The 5 most recently updated tickets in the caller's scope, from TKT-1 (correctly scoped, not cached server-side).
 * END_USER ("my 5 most recent tickets", sends `countryId=` per D8) and L2_MANAGER (instead of DSH-1 `recent`).
 */
export function useRecentTickets({ enabled }: { enabled: boolean }) {
  const user = useAuthStore((s) => s.user);
  const selectedCountry = useUiStore((s) => s.ticketCountryId);
  const params: TicketListKeyParams = user
    ? { ...roleDefaultTicketQuery(user.role), ...withCountry(listCountryParam(user, selectedCountry)) }
    : {};

  return useQuery({
    queryKey: queryKeys.tickets.recent(params),
    queryFn: async (): Promise<Ticket[]> => {
      const res = await listTickets({ ...params, page: 1, limit: RECENT_COUNT });
      assertPaginated<Ticket>('TKT-1', res);
      checkFields('TKT-1', res.data[0], TICKET_LIST_ROW_SPEC, 'data[0].');
      return res.data.filter((t) => t && typeof t.id === 'string');
    },
    enabled: enabled && !!user,
  });
}

function withCountry(countryId: string | undefined): Pick<TicketListKeyParams, 'countryId'> {
  return countryId !== undefined ? { countryId } : {};
}
