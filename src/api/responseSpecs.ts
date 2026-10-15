// The fields M3/M4 actually read, with the types 03-DATA-MODEL.md §C promises. Used by checkFields() in
// __DEV__ builds to log drift (src/api/drift.ts). Keep in step with 03 §C; never loosen a spec to silence a log.
import {
  TASK_STATUSES, TICKET_IMPACTS, TICKET_PRIORITIES, TICKET_SOURCES, TICKET_STATUSES, TICKET_URGENCIES,
  SLA_STATUSES,
} from '@/types';
import type { FieldSpec } from './drift';

const S = ['string'] as const;
const S_NULL = ['string', 'null'] as const;
const N = ['number'] as const;
const OBJ = ['object'] as const;
const OBJ_NULL = ['object', 'null'] as const;
const ARR = ['array'] as const;

const AUDIT_ACTIONS = [
  'CREATED', 'UPDATED', 'DELETED', 'STATUS_CHANGED', 'ASSIGNED', 'COMMENTED', 'ATTACHMENT_ADDED', 'SLA_BREACHED', 'ESCALATED',
] as const;

/** `Ticket` (TKT-1 rows) / `TicketDetail` (TKT-3). */
export const TICKET_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'ticketNumber', kinds: N },
  { path: 'title', kinds: S },
  { path: 'description', kinds: S },
  { path: 'status', kinds: S, oneOf: TICKET_STATUSES },
  { path: 'priority', kinds: S, oneOf: TICKET_PRIORITIES },
  { path: 'impact', kinds: S_NULL, oneOf: TICKET_IMPACTS },
  { path: 'urgency', kinds: S_NULL, oneOf: TICKET_URGENCIES },
  { path: 'source', kinds: S, oneOf: TICKET_SOURCES },
  { path: 'slaStatus', kinds: S, oneOf: SLA_STATUSES },
  { path: 'slaResponseDue', kinds: S_NULL },
  { path: 'slaResolveDue', kinds: S_NULL },
  { path: 'firstResponseAt', kinds: S_NULL },
  { path: 'resolvedAt', kinds: S_NULL },
  { path: 'slaHoldStartedAt', kinds: S_NULL },
  { path: 'slaHoldMinutes', kinds: N },
  { path: 'resolution', kinds: S_NULL },
  { path: 'closureCode', kinds: S_NULL },
  { path: 'isFcr', kinds: ['boolean', 'null'] },
  { path: 'closureComments', kinds: S_NULL },
  { path: 'createdAt', kinds: S },
  { path: 'updatedAt', kinds: S },
  { path: 'requester', kinds: OBJ },
  { path: 'requester.displayName', kinds: S },
  { path: 'requester.email', kinds: S },
  { path: 'requester.phone', kinds: S_NULL },
  { path: 'requester.department', kinds: S_NULL },
  { path: 'assignedTo', kinds: OBJ_NULL },
  { path: 'team', kinds: OBJ_NULL },
  { path: 'country', kinds: OBJ_NULL },
  { path: 'category', kinds: OBJ_NULL },
  { path: '_count', kinds: OBJ },
  { path: '_count.comments', kinds: N },
  { path: '_count.attachments', kinds: N },
  { path: 'tasks', kinds: ARR },
];

/** `lastRequesterReplyAt` is guaranteed on TKT-1 only (03 B.1, 05 B.17). */
export const TICKET_LIST_ROW_SPEC: readonly FieldSpec[] = [
  ...TICKET_SPEC,
  { path: 'lastRequesterReplyAt', kinds: S_NULL },
];

/** `TicketTaskEmbedded` inside TKT-3. */
export const TASK_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'title', kinds: S },
  { path: 'description', kinds: S_NULL },
  { path: 'status', kinds: S, oneOf: TASK_STATUSES },
  { path: 'dueDate', kinds: S_NULL },
  { path: 'completedAt', kinds: S_NULL },
  { path: 'assignedTo', kinds: OBJ_NULL },
];

/** `Comment` from CMT-1. */
export const COMMENT_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'body', kinds: S },
  { path: 'type', kinds: S, oneOf: ['PUBLIC', 'PRIVATE'] },
  { path: 'isEdited', kinds: ['boolean'] },
  { path: 'toRecipients', kinds: ARR },
  { path: 'ccRecipients', kinds: ARR },
  { path: 'createdAt', kinds: S },
  { path: 'author', kinds: OBJ },
  { path: 'author.displayName', kinds: S },
  { path: 'attachments', kinds: ARR },
];

/** `Attachment` from ATT-1. */
export const ATTACHMENT_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'commentId', kinds: S_NULL },
  { path: 'uploaderName', kinds: S },
  { path: 'fileName', kinds: S },
  { path: 'mimeType', kinds: S },
  { path: 'sizeBytes', kinds: N },
  { path: 'createdAt', kinds: S },
];

/** `ActivityPage` envelope, shape (c), from TKT-7. */
export const ACTIVITY_PAGE_SPEC: readonly FieldSpec[] = [
  { path: 'items', kinds: ARR },
  { path: 'auditTotal', kinds: N },
  { path: 'page', kinds: N },
  { path: 'pageSize', kinds: N },
  { path: 'auditPages', kinds: N },
];

/** `ActivityAuditItem` from TKT-7. */
export const AUDIT_ITEM_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'action', kinds: S, oneOf: AUDIT_ACTIONS },
  { path: 'oldValues', kinds: OBJ_NULL },
  { path: 'newValues', kinds: OBJ_NULL },
  { path: 'createdAt', kinds: S },
  { path: 'actor', kinds: OBJ_NULL },
];

/** CMT-2 201: the created comment. 01 CMT-2: `attachments` are NOT included (so not checked). */
export const COMMENT_CREATED_SPEC: readonly FieldSpec[] = COMMENT_SPEC.filter((s) => s.path !== 'attachments');

/** TKT-9 `{ to, cc, from }`. */
export const EMAIL_RECIPIENTS_SPEC: readonly FieldSpec[] = [
  { path: 'to', kinds: ARR },
  { path: 'cc', kinds: ARR },
  { path: 'from', kinds: S },
];

/** TKT-10 item / USR-3 item (shared fields). */
export const USER_REF_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'displayName', kinds: S },
  { path: 'email', kinds: S },
];

/** LKP-1 `?flat=true` row. */
export const CATEGORY_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'name', kinds: S },
  { path: 'parentId', kinds: S_NULL },
  { path: 'level', kinds: S, oneOf: ['CATEGORY', 'SUBCATEGORY', 'ITEM'] },
  { path: 'defaultTeamId', kinds: S_NULL },
  { path: 'defaultAssigneeId', kinds: S_NULL },
];

/** LKP-2 team. */
export const TEAM_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'name', kinds: S },
  { path: 'isActive', kinds: ['boolean'] },
  { path: 'members', kinds: ARR },
  { path: 'members.0.user', kinds: ['object', 'undefined'] },
];

/** `Country` from LKP-4 / LKP-5. */
export const COUNTRY_SPEC: readonly FieldSpec[] = [
  { path: 'id', kinds: S },
  { path: 'name', kinds: S },
  { path: 'displayName', kinds: S },
];
