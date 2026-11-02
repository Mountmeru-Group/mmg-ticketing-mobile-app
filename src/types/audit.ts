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
/** AUD-1 query. Only these five keys are read by the server (auditLog.controller.ts:6-7); each filter is exact. */
export interface AuditLogQuery {
  page?: number; limit?: number;                // limit 1–100, default 25 (utils/pagination.ts:16-20)
  entityType?: string; actorId?: UUID; ticketId?: UUID;
}
