// ─────────────────────────────────────────────────────────────
// MMG Ticketing — API types (generated from docs/web-system/03-DATA-MODEL.md, 2026-10-09)
// Source of truth: backend/prisma/schema.prisma + controller include/select
// Copied verbatim from 03 §C "Enums". Do not edit by hand: change the doc first (with Ronit's OK), then re-copy.
// ─────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────
export const USER_ROLES = ['ADMIN', 'AGENT', 'END_USER', 'L2_MANAGER'] as const;
export type UserRole = typeof USER_ROLES[number];

export const TICKET_STATUSES = [
  'OPEN', 'IN_PROGRESS', 'PENDING', 'PENDING_USER_INFO', 'PENDING_USER_CONFIRM', 'PENDING_PARTNER',
  'PENDING_MASTER_DATA', 'PENDING_MGMT_REVIEW', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELED',
] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

export const HOLD_STATUSES: readonly TicketStatus[] = [
  'ON_HOLD', 'PENDING', 'PENDING_MGMT_REVIEW', 'PENDING_MASTER_DATA', 'PENDING_PARTNER',
  'PENDING_USER_CONFIRM', 'PENDING_USER_INFO',
];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketPriority = typeof TICKET_PRIORITIES[number];

export const TICKET_IMPACTS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type TicketImpact = typeof TICKET_IMPACTS[number];

export const TICKET_URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketUrgency = typeof TICKET_URGENCIES[number];

export const TICKET_SOURCES = ['WEB_FORM', 'EMAIL', 'PORTAL', 'API'] as const;
export type TicketSource = typeof TICKET_SOURCES[number];

export const SLA_STATUSES = ['WITHIN_SLA', 'DUE_SOON', 'BREACHED'] as const;
export type SLAStatus = typeof SLA_STATUSES[number];

export type CommentType = 'PUBLIC' | 'PRIVATE';

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export type NotificationType =
  | 'TICKET_ASSIGNED' | 'TICKET_UPDATED' | 'TICKET_RESOLVED'
  | 'SLA_WARNING' | 'SLA_BREACHED' | 'COMMENT_ADDED' | 'MENTION';

export type AuditAction =
  | 'CREATED' | 'UPDATED' | 'DELETED' | 'STATUS_CHANGED' | 'ASSIGNED'
  | 'COMMENTED' | 'ATTACHMENT_ADDED' | 'SLA_BREACHED' | 'ESCALATED';

export type CategoryLevel = 'CATEGORY' | 'SUBCATEGORY' | 'ITEM';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ApprovalEntityType = 'ticket' | 'change' | 'service_request';
export type AnnouncementType = 'INFO' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE';

export const CLOSURE_CODES = [
  'Resolved – Issue Fixed', 'Resolved – Workaround Provided', 'Closed – Duplicate',
  "Closed – Won't Fix", 'Cannot Reproduce', 'Other',
] as const; // U+2013 en dashes — keep exact
