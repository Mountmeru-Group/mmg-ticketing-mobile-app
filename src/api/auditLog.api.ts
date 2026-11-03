// Audit log (01 AUD-1, G8). ADMIN only on the server: `requireAuth, adminOnly` (auditLog.router.ts:8), so every other
// role gets 403 "Forbidden: insufficient role" (middleware/rbac.middleware.ts:13-15). The app registers the screen for
// ADMIN alone too (utils/permissions.ts canViewAuditLog), but that is UX: the server is the gate.
// The server reads exactly three filters, each an exact match: entityType, actorId, ticketId (auditLog.controller.ts:7-13).
// There is no action, date, ticket-number or text filter (docs/G8-WEB-AUDIT.md §2): none is ever sent.
import type { AuditLogEntry, AuditLogQuery, Paginated } from '@/types';
import { apiClient } from './client';
import { pickDefined, toPositiveInt } from './helpers';

/** The app's page size: half the server's ceiling of 100, so the 500-entry cap is 10 requests (useAuditLog). */
export const AUDIT_PAGE_SIZE = 50;

const FILTER_KEYS = ['entityType', 'actorId', 'ticketId'] as const;

/** AUD-1 — GET /api/v1/audit-log. Pagination shape (a), `createdAt` desc. */
export async function listAuditLog(query: AuditLogQuery = {}): Promise<Paginated<AuditLogEntry>> {
  const params = {
    ...pickDefined(query, FILTER_KEYS),
    page: toPositiveInt(query.page, 1),
    limit: Math.min(toPositiveInt(query.limit, AUDIT_PAGE_SIZE), 100),
  };
  const res = await apiClient.get<Paginated<AuditLogEntry>>('/audit-log', { params });
  return res.data;
}
