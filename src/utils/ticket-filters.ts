// M3 named filters and sorts → TKT-1 query params (08-SDP-PARITY.md §4.3, §4.5). Pure functions.
// Status lists are always sent as ONE comma-separated `status` value built from the 03 enum only:
// an unknown status value gives a 500 (01 TKT-1).
import type { AuthUser, TicketListQuery, TicketStatus, UserRole } from '@/types';
import { isAgentOrAdmin } from './roles';

export type TicketNamedFilter =
  | 'ALL'
  | 'OPEN'
  | 'MY_OPEN'
  | 'UNASSIGNED'
  | 'PENDING'
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'RESOLVED'
  | 'CLOSED';

export type TicketSortOption = 'UPDATED' | 'PRIORITY' | 'DUE';

export const TICKET_FILTER_LABELS: Record<TicketNamedFilter, string> = {
  ALL: 'All',
  OPEN: 'Open',
  MY_OPEN: 'My open',
  UNASSIGNED: 'Unassigned',
  PENDING: 'Pending',
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const TICKET_SORT_LABELS: Record<TicketSortOption, string> = {
  UPDATED: 'Last updated',
  PRIORITY: 'Priority',
  DUE: 'Due date',
};

const MY_OPEN_STATUSES: readonly TicketStatus[] = [
  'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'PENDING', 'PENDING_USER_INFO', 'PENDING_USER_CONFIRM',
  'PENDING_PARTNER', 'PENDING_MASTER_DATA', 'PENDING_MGMT_REVIEW',
];

/** Same set as the SLA hold statuses (03 §A). */
const PENDING_STATUSES: readonly TicketStatus[] = [
  'PENDING', 'PENDING_USER_INFO', 'PENDING_USER_CONFIRM', 'PENDING_PARTNER', 'PENDING_MASTER_DATA',
  'PENDING_MGMT_REVIEW', 'ON_HOLD',
];

/** Filters shown in the drop-down for this role. "Unassigned" is ADMIN/AGENT only (08 §4.5). */
export function availableTicketFilters(role: UserRole): TicketNamedFilter[] {
  const all: TicketNamedFilter[] = ['ALL', 'OPEN', 'MY_OPEN', 'UNASSIGNED', 'PENDING', 'OVERDUE', 'DUE_SOON', 'RESOLVED', 'CLOSED'];
  return isAgentOrAdmin(role) ? all : all.filter((f) => f !== 'UNASSIGNED');
}

export function ticketFilterQuery(
  filter: TicketNamedFilter,
  me: Pick<AuthUser, 'id' | 'role'>,
): Pick<TicketListQuery, 'status' | 'assignedToId' | 'sla'> {
  switch (filter) {
    case 'ALL':
      return {};
    case 'OPEN':
      return { status: 'OPEN' };
    case 'MY_OPEN':
      // END_USER scope is already "own", so My open = All + the status list.
      return me.role === 'END_USER'
        ? { status: MY_OPEN_STATUSES.join(',') }
        : { assignedToId: me.id, status: MY_OPEN_STATUSES.join(',') };
    case 'UNASSIGNED':
      return { assignedToId: 'unassigned' };
    case 'PENDING':
      return { status: PENDING_STATUSES.join(',') };
    case 'OVERDUE':
      // Server slaStatus; the badge uses the hold-adjusted value, so the two can differ (05 §A.9).
      return { sla: 'BREACHED' };
    case 'DUE_SOON':
      // ≤ 30 min left. Stands in for "Due today" until A23 (08 S6).
      return { sla: 'DUE_SOON' };
    case 'RESOLVED':
      return { status: 'RESOLVED' };
    case 'CLOSED':
      return { status: 'CLOSED' };
  }
}

/** Three fixed sorts, no direction toggle (08 §4.3; more needs A21). */
export function ticketSortQuery(sort: TicketSortOption): Pick<TicketListQuery, 'sortBy'> {
  if (sort === 'PRIORITY') return { sortBy: 'priority' };
  if (sort === 'DUE') return { sortBy: 'sla' };
  return {};
}

/** END_USER always sends `countryId=` so every own ticket shows regardless of country (D8, 01 TKT-1). */
export function roleDefaultTicketQuery(role: UserRole): Pick<TicketListQuery, 'countryId'> {
  return role === 'END_USER' ? { countryId: '' } : {};
}
