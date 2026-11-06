// Audit log (01 AUD-1, G8). ADMIN only on the server: the backend team's written contract (2026-11-05) says "Requires an
// ADMIN Bearer token", and the source has `requireAuth, adminOnly` (auditLog.router.ts:8), so every other role gets 403.
// The app registers the screen for ADMIN alone too (utils/permissions.ts canViewAuditLog), but that is UX: the server
// is the gate.
//
// THE PATH. The written contract says /audit-logs (plural). The web source at 7df97c8 mounts /audit-log (singular,
// app.ts:137), on every branch. Ronit's call (2026-11-05): try the written path first; only when the server has no such
// route (isNoSuchGetRoute: an HTML answer, never a JSON error) try the source's, and keep whichever answered for the rest
// of this run of the app. So at most one extra request per run, and only for an ADMIN.
//
// THE PARAMS: the written contract's page, limit, action, entityType, dateFrom, dateTo, ticketId, ticketNumber, plus
// actorId, which the source reads too (auditLog.controller.ts:7) though the written list leaves it out. An allow-list:
// nothing else is ever sent.
import type { AuditLogEntry, AuditLogQuery, Paginated } from '@/types';
import { apiClient } from './client';
import { reportDrift } from './drift';
import { isNoSuchGetRoute } from './errors';
import { pickDefined, toPositiveInt } from './helpers';

/** The app's page size: half the server's ceiling of 100, so the 500-entry cap is 10 requests (useAuditLog). */
export const AUDIT_PAGE_SIZE = 50;

/** The written contract's path, then the web source's. */
export const AUDIT_LOG_PATHS = ['/audit-logs', '/audit-log'] as const;
export type AuditLogPath = (typeof AUDIT_LOG_PATHS)[number];

/** Every AUD-1 filter the app may send. */
export const AUDIT_FILTER_KEYS = ['action', 'entityType', 'dateFrom', 'dateTo', 'ticketId', 'ticketNumber', 'actorId'] as const;

/** The path that last answered, in this run of the app. Memory only: a cold start finds it again. */
let answeringPath: AuditLogPath | null = null;

/** Starts again from the written path, as a fresh run of the app does. For tests. */
export function forgetAuditLogPath(): void {
  answeringPath = null;
}

function tryOrder(): readonly AuditLogPath[] {
  if (answeringPath === null) return AUDIT_LOG_PATHS;
  return [answeringPath, ...AUDIT_LOG_PATHS.filter((path) => path !== answeringPath)];
}

/** AUD-1 — GET /api/v1/audit-logs (or /audit-log, above). Pagination shape (a), `createdAt` desc. */
export async function listAuditLog(query: AuditLogQuery = {}): Promise<Paginated<AuditLogEntry>> {
  const params = {
    ...pickDefined(query, AUDIT_FILTER_KEYS),
    page: toPositiveInt(query.page, 1),
    limit: Math.min(toPositiveInt(query.limit, AUDIT_PAGE_SIZE), 100),
  };
  let missing: unknown = null;
  for (const path of tryOrder()) {
    try {
      const res = await apiClient.get<Paginated<AuditLogEntry>>(path, { params });
      if (path !== AUDIT_LOG_PATHS[0] && answeringPath !== path) reportDrift('AUD-1', `${AUDIT_LOG_PATHS[0]} has no route here; ${path} answered`);
      answeringPath = path;
      return res.data;
    } catch (error) {
      if (!isNoSuchGetRoute(error)) throw error;
      missing = error;
    }
  }
  throw missing;
}
