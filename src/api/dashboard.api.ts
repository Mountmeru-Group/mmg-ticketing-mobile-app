// Dashboard (01 §8). DSH-1 is the only dashboard endpoint every role may call.
// The backend team's written contract (2026-11-05): `GET /api/v1/dashboard?range=last7`, ranges today, yesterday, last7,
// last30, week, month, quarter, year, all; custom `?from=2026-10-01&to=2026-10-31`. The params are exactly what this
// sends. The path stays /dashboard/all (Ronit's call, 2026-11-05): the source has no handler on /dashboard itself
// (dashboard.router.ts at 7df97c8), and the web dashboard calls /dashboard/all with these same params, so the written
// path is read as the module's base. `countryId` is not in the written list; the source and the web both use it.
import type { DashboardAll, DashboardRange } from '@/types';
import { apiClient } from './client';

export interface DashboardQuery {
  /** Default `month`. Unknown values also mean `month`. Not sent with `from`: the server ignores it then. */
  range?: DashboardRange;
  /** `YYYY-MM-DD`. If present, `range` is ignored. */
  from?: string;
  /** `YYYY-MM-DD`, only with `from`. */
  to?: string;
  /** From the country selector. Ignored by the server for L2_MANAGER — don't send it for L2. */
  countryId?: string;
}

/**
 * DSH-1 — GET /api/v1/dashboard/all
 * Show ONLY the correctly scoped parts: the KPIs SafeDashboard lists (hooks/useHome.ts) and `recent`. The
 * technician/team widgets are unscoped for some roles (05 B.20, C.19). Pull-to-refresh, no polling.
 */
export async function getDashboard(query: DashboardQuery = {}): Promise<DashboardAll> {
  const params = {
    range: query.from ? undefined : (query.range ?? 'month'),
    from: query.from,
    to: query.from ? query.to : undefined,
    countryId: query.countryId,
  };
  const res = await apiClient.get<DashboardAll>('/dashboard/all', { params });
  return res.data;
}
