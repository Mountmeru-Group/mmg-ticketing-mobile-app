// Copied verbatim from 03-DATA-MODEL.md §C ("Audit log (AUD-1)", G8). Do not edit by hand.
import type { ISODateString, UUID } from './api';
import type { AuditAction } from './enums';

// ── Audit log (AUD-1) ────────────────────────────────────────
/** One AUD-1 row: the full `audit_logs` row plus `actor` and `ticket` (auditLog.controller.ts:17-25). */
export interface AuditLogEntry {
  id: UUID; ticketId: UUID | null; actorId: UUID | null; action: AuditAction;
  entityType: string;                           // 'Ticket' | 'Comment' | 'Attachment' | 'ticket' (auto-close job)
  entityId: string;
  oldValues: unknown;                           // Json? — normally an object, never trusted to be one
  newValues: unknown;
  ipAddress: string | null;                     // never display
  createdAt: ISODateString;
  actor: { id: UUID; displayName: string; email: string } | null;   // null: a job, or the user was deleted
  ticket: { id: UUID; ticketNumber: number; title: string } | null; // null: no ticket, or the ticket was deleted
}
/**
 * AUD-1 query: the backend team's written contract (2026-11-05), plus `actorId`, which the source also reads
 * (auditLog.controller.ts:7 at 7df97c8) but the written list leaves out. Each filter is exact; they combine with AND.
 */
export interface AuditLogQuery {
  page?: number; limit?: number;                // limit 1–100, default 25 (utils/pagination.ts:16-20)
  action?: AuditAction;                         // exact enum match
  entityType?: string;                          // exact, case-sensitive
  dateFrom?: ISODateString; dateTo?: ISODateString; // createdAt ≥ dateFrom, ≤ dateTo, each read with `new Date()`
  ticketId?: UUID;
  ticketNumber?: number;                        // the server looks the ticket up; an unknown number filters NOTHING (05 B.40)
  actorId?: UUID;                               // in the source, not in the written contract
}
