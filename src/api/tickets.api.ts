// Ticket endpoints (01 §2). Every `:id` is the ticket UUID; no endpoint accepts a ticket number.
//
// STATUS RULE (05 B.1, 08 §4.1): changeTicketStatus() → POST /tickets/:id/status is the ONLY way this app
// changes a ticket's status. PUT /tickets/:id silently strips `status` and still returns 200, so
// updateTicket() can never carry it: its body is built from an allow-list that has no `status` key.
//
// ASSIGNMENT CHOICE (01 TKT-5 "pick one and use it consistently"): every assignment, pick up and bulk
// assign uses TKT-5 assignTicket(), always sending `teamId` when it is known (08 S5, 05 B.14), followed
// by a TKT-3 refetch (05 B.18). TKT-4 is used for field edits only.
import type {
  ActivityPage,
  AssignTicketBody,
  ChangeStatusBody,
  CreateTicketBodyEndUser,
  CreateTicketBodyStaff,
  EmailRecipients,
  Paginated,
  SuggestedAssignee,
  Ticket,
  TicketDetail,
  TicketListQuery,
  TicketSource,
  UpdateTicketBody,
  UserRole,
} from '@/types';
import { apiClient } from './client';
import { pickDefined, seg, toPositiveInt } from './helpers';

/** D5 (05 §A.18): mobile-created tickets use `source: 'API'` until ask A15 adds a MOBILE value. */
export const MOBILE_TICKET_SOURCE: TicketSource = 'API';

/** 01 TKT-1 "Always send limit (20–25)". */
export const TICKET_PAGE_SIZE = 20;

const LIST_QUERY_KEYS = [
  'status', 'priority', 'impact', 'urgency', 'assignedToId', 'teamId', 'categoryId', 'requesterId',
  'sla', 'fromDate', 'toDate', 'search', 'countryId', 'sortBy',
] as const satisfies readonly (keyof TicketListQuery)[];

/**
 * TKT-1 — GET /api/v1/tickets
 * Role-scoped, filtered list. Pagination shape (a). Reads `limit`; `pageSize` is IGNORED and never sent.
 * `countryId: ''` is sent as `countryId=` (key present = no country filter); END_USER always sends it (D8).
 */
export async function listTickets(query: TicketListQuery = {}): Promise<Paginated<Ticket>> {
  const params = {
    ...pickDefined(query, LIST_QUERY_KEYS),
    page: toPositiveInt(query.page, 1),
    limit: Math.min(toPositiveInt(query.limit, TICKET_PAGE_SIZE), 100),
  };
  const res = await apiClient.get<Paginated<Ticket>>('/tickets', { params });
  return res.data;
}

const CREATE_KEYS_END_USER = ['title', 'description', 'categoryId', 'source'] as const;
const CREATE_KEYS_STAFF = [
  ...CREATE_KEYS_END_USER, 'impact', 'urgency', 'teamId', 'assignedToId', 'requesterId',
] as const;

/**
 * TKT-2 — POST /api/v1/tickets
 * Body from the per-role allow-list in 01 TKT-2: END_USER sends only title, description, categoryId, source.
 * Flow afterwards (05 §A.8): upload attachments to the new id (ATT-2), then open the detail screen.
 */
export async function createTicket(
  input: CreateTicketBodyEndUser | CreateTicketBodyStaff,
  role: UserRole,
): Promise<Ticket> {
  const body =
    role === 'END_USER'
      ? pickDefined(input, CREATE_KEYS_END_USER)
      : pickDefined(input as CreateTicketBodyStaff, CREATE_KEYS_STAFF);
  const res = await apiClient.post<Ticket>('/tickets', body);
  return res.data;
}

/**
 * TKT-3 — GET /api/v1/tickets/:id
 * Ticket detail; `slaPolicy` is the full row. Call sub-resources (TKT-7..10, CMT, ATT, TSK) only for a
 * ticket this call has returned successfully in the session (05 §C hygiene rules).
 */
export async function getTicket(id: string): Promise<TicketDetail> {
  const res = await apiClient.get<TicketDetail>(`/tickets/${seg(id)}`);
  return res.data;
}

/**
 * Fields mobile may send to TKT-4, by role (01 TKT-4; 05 §A.3 for `resolution` and `countryId`).
 * Never `status` (stripped server-side, 05 B.1), `requesterId`, `slaPolicyId`, `priority` or `customFields`.
 */
const UPDATE_KEYS_BY_ROLE: Record<UserRole, readonly (keyof UpdateTicketBody)[]> = {
  END_USER: ['title', 'description'],
  AGENT: ['title', 'description', 'categoryId', 'impact', 'urgency', 'teamId', 'assignedToId', 'tags', 'resolution', 'countryId'],
  ADMIN: ['title', 'description', 'categoryId', 'impact', 'urgency', 'teamId', 'assignedToId', 'tags', 'resolution', 'countryId'],
  L2_MANAGER: ['title', 'description', 'categoryId', 'impact', 'urgency', 'teamId', 'tags', 'resolution'],
};

/**
 * TKT-4 — PUT /api/v1/tickets/:id
 * Field edits only. NOT for status (use changeTicketStatus). A category change may auto-reassign;
 * refetch TKT-3 afterwards (05 B.18).
 */
export async function updateTicket(id: string, input: UpdateTicketBody, role: UserRole): Promise<Ticket> {
  const body = pickDefined(input, UPDATE_KEYS_BY_ROLE[role]);
  const res = await apiClient.put<Ticket>(`/tickets/${seg(id)}`, body);
  return res.data;
}

/**
 * TKT-5 — POST /api/v1/tickets/:id/assign (ADMIN, AGENT; server 403 for others).
 * `assignedToId: null` unassigns. Send `teamId` when known (05 B.14). Unknown ticket → 500, not 404.
 */
export async function assignTicket(id: string, input: AssignTicketBody): Promise<Ticket> {
  const body = pickDefined(input, ['assignedToId', 'teamId'] as const);
  const res = await apiClient.post<Ticket>(`/tickets/${seg(id)}/assign`, body);
  return res.data;
}

/**
 * TKT-6 — POST /api/v1/tickets/:id/status
 * The ONLY status write in the app. The server enforces no transitions and no closure fields, so callers
 * must go through src/utils/ticket-rules.ts first (05 §A.1–§A.2). Sends only
 * `{ status, resolution?, closureCode?, isFcr?, closureComments? }` — never teamId/categoryId/assignedToId,
 * which this endpoint writes unvalidated (01 TKT-6).
 */
export async function changeTicketStatus(id: string, input: ChangeStatusBody): Promise<Ticket> {
  const body = pickDefined(input, ['status', 'resolution', 'closureCode', 'isFcr', 'closureComments'] as const);
  const res = await apiClient.post<Ticket>(`/tickets/${seg(id)}/status`, body);
  return res.data;
}

export interface TicketActivityQuery {
  page?: number;
  /** TKT-7 is the one ticket endpoint that reads `pageSize` (default 50, max 100). Shape (c). */
  pageSize?: number;
}

/**
 * TKT-7 — GET /api/v1/tickets/:id/activity
 * Comments + audit history, newest first. Comments repeat on every page (05 B.12) — merge with
 * mergeActivityItems(). ⚠ No server access check: only call after getTicket() succeeded.
 */
export async function getTicketActivity(id: string, query: TicketActivityQuery = {}): Promise<ActivityPage> {
  const params = {
    page: toPositiveInt(query.page, 1),
    pageSize: Math.min(toPositiveInt(query.pageSize, 50), 100),
  };
  const res = await apiClient.get<ActivityPage>(`/tickets/${seg(id)}/activity`, { params });
  return res.data;
}

/**
 * TKT-9 — GET /api/v1/tickets/:id/email-recipients
 * Pre-fills Reply-All To/CC. Mobile calls it only for ADMIN, AGENT and L2_MANAGER (01 TKT-9).
 */
export async function getEmailRecipients(id: string): Promise<EmailRecipients> {
  const res = await apiClient.get<EmailRecipients>(`/tickets/${seg(id)}/email-recipients`);
  return res.data;
}

/**
 * TKT-10 — GET /api/v1/tickets/:id/suggested-assignees
 * "Recommended" technicians in M7. ADMIN and AGENT only. May include inactive users (05 B.30).
 */
export async function getSuggestedAssignees(id: string): Promise<SuggestedAssignee[]> {
  const res = await apiClient.get<SuggestedAssignee[]>(`/tickets/${seg(id)}/suggested-assignees`);
  return res.data;
}
