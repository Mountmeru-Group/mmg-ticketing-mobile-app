// M2 Home reads: DSH-1 counts and a short recent-tickets list. Pull-to-refresh only — no polling (01 DSH-1).
//
// WHICH DSH-1 KPIs ARE SHOWN (05 B.20, re-checked against backend dashboard.controller.ts on 2026-10-15):
//   used     open, inProgress, onHold, slaBreached, totalOpen, resolved (END_USER), and `recent` — each query keeps the
//            caller's scope; unassigned for ADMIN and the UI's triage AGENT only (brief + 04 M2).
//   skipped  total, pending*, resolvedToday, closed, createdToday/Yesterday, currentlyOpen, slaBreachPercent (not
//            needed); closedToday / closedYesterday (their `OR` overwrites the scope: global for AGENT/L2); byStatus,
//            byPriority (not needed); workload, trends, technician*/team matrices, bySource, countryGroupRows,
//            monthlyTrends (unscoped or mis-scoped, 05 B.20 / C.19).
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
import { listCountryParam, roleDefaultTicketQuery } from '@/utils/ticket-filters';
import { queryKeys, type TicketListKeyParams } from './queryKeys';

/** 01 DSH-1: "Default range=month" — counts cover tickets created in the last 30 days (totalOpen: right now). */
const DASHBOARD_RANGE = 'month';
const RECENT_COUNT = 5;

/** The only parts of DSH-1 a screen may read. Everything else in the response never leaves this hook. */
export interface SafeDashboard {
  kpis: {
    open: number;
    inProgress: number;
    onHold: number;
    slaBreached: number;
    totalOpen: number;
    resolved: number;
    unassigned: number;
  };
  recent: DashboardRecentTicket[];
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function pickSafe(res: DashboardAll): SafeDashboard {
  const k = res.kpis;
  return {
    kpis: {
      open: num(k.open),
      inProgress: num(k.inProgress),
      onHold: num(k.onHold),
      slaBreached: num(k.slaBreached),
      totalOpen: num(k.totalOpen),
      resolved: num(k.resolved),
      unassigned: num(k.unassigned),
    },
    recent: Array.isArray(res.recent) ? res.recent.filter((t) => t && typeof t.id === 'string') : [],
  };
}

/** DSH-1 for ADMIN, AGENT and END_USER. Never enabled for L2_MANAGER (see above). */
export function useDashboard() {
  const user = useAuthStore((s) => s.user);
  const selectedCountry = useUiStore((s) => s.ticketCountryId);
  // Same country rule as the ticket list (05 §A.12). `''` means "no filter" to DSH-1 too, so it is not sent.
  const countryId = (user ? listCountryParam(user, selectedCountry) : undefined) || undefined;

  return useQuery({
    queryKey: queryKeys.dashboard.summary(DASHBOARD_RANGE, countryId),
    queryFn: async (): Promise<DashboardAll> => {
      const res = await getDashboard({ range: DASHBOARD_RANGE, countryId });
      assertObject<DashboardAll>('DSH-1', res);
      if (typeof res.kpis !== 'object' || res.kpis === null) {
        throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from DSH-1' });
      }
      checkFields('DSH-1', res, DASHBOARD_SPEC);
      if (Array.isArray(res.recent)) checkFields('DSH-1', res.recent[0], DASHBOARD_RECENT_SPEC, 'recent[0].');
      return res;
    },
    select: pickSafe,
    enabled: !!user && user.role !== 'L2_MANAGER',
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
