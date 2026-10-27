// Dashboard (01 §8). DSH-1 is the only dashboard endpoint every role may call.
import type { DashboardAll, DashboardRange } from '@/types';
import { apiClient } from './client';

export interface DashboardQuery {
  /** Default `month`. Unknown values also mean `month`. */
  range?: DashboardRange;
  /** If present, `range` is ignored. */
  from?: string;
  to?: string;
  /** From the country selector. Ignored by the server for L2_MANAGER — don't send it for L2. */
  countryId?: string;
}

/**
 * DSH-1 — GET /api/v1/dashboard/all
 * Show ONLY the correctly scoped KPIs (total, open, inProgress, onHold, resolved, slaBreached, totalOpen,
 * currentlyOpen) and `recent`. The technician/team widgets are unscoped for some roles (05 B.20, C.19).
 * Pull-to-refresh, no polling.
 */
export async function getDashboard(query: DashboardQuery = {}): Promise<DashboardAll> {
  const params = {
    range: query.range ?? 'month',
    from: query.from,
    to: query.from ? query.to : undefined,
    countryId: query.countryId,
  };
  const res = await apiClient.get<DashboardAll>('/dashboard/all', { params });
  return res.data;
}
