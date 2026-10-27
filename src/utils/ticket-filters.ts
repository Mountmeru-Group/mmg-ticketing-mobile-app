// M3 named filters and sorts → TKT-1 query params (08-SDP-PARITY.md §4.3, §4.5). Pure functions.
// Status lists are always sent as ONE comma-separated `status` value built from the 03 enum only:
// an unknown status value gives a 500 (01 TKT-1).
// Phase G2 adds the web's "More Filters" (priority, category, created date, technician, group): docs/G2-WEB-FILTERS.md.
import {
  TICKET_PRIORITIES, TICKET_STATUSES, type AuthUser, type Category, type Team, type TicketListQuery, type TicketPriority,
  type TicketStatus, type UserRole,
} from '@/types';
import { PRIORITY_LABELS } from './format';
import { isAgentOrAdmin } from './roles';
import { dayToDueDate, formatDueDay } from './tasks';

export type TicketNamedFilter =
  | 'ALL'
  | 'OPEN'
  | 'MY_OPEN'
  | 'UNASSIGNED'
  | 'PENDING'
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'RESOLVED'
  | 'CLOSED'
  | HomeTileFilter;

/**
 * Filters reachable only from a Home KPI tile (Phase 4). Each one sends exactly the status set the DSH-1 KPI counts
 * (backend dashboard.controller.ts, read 2026-10-15), so the list matches the tile. They never appear in the M3
 * drop-down; M3 shows the active one as an extra chip until another filter is picked.
 *   IN_PROGRESS_KPI  kpis.inProgress = IN_PROGRESS + PENDING (the server's IN_PROGRESS_STATUSES)
 *   ON_HOLD_KPI      kpis.onHold     = ON_HOLD
 *   ACTIVE_KPI       kpis.totalOpen  = OPEN + IN_PROGRESS + ON_HOLD + PENDING (the server's ACTIVE_STATUSES)
 *   BREACHED_KPI     kpis.slaBreached = slaStatus BREACHED and status not RESOLVED / CLOSED
 *   UNASSIGNED_KPI   kpis.unassigned = unassigned and ACTIVE_STATUSES
 * DSH-1 counts tickets CREATED in the last 30 days (range=month, 01 DSH-1) except totalOpen; the list has no date
 * filter, so it can hold more rows than the tile says. Home says so under the tiles.
 */
export type HomeTileFilter = 'IN_PROGRESS_KPI' | 'ON_HOLD_KPI' | 'ACTIVE_KPI' | 'BREACHED_KPI' | 'UNASSIGNED_KPI';

export const HOME_TILE_FILTERS: readonly HomeTileFilter[] = [
  'IN_PROGRESS_KPI', 'ON_HOLD_KPI', 'ACTIVE_KPI', 'BREACHED_KPI', 'UNASSIGNED_KPI',
];

export function isHomeTileFilter(filter: TicketNamedFilter): filter is HomeTileFilter {
  return (HOME_TILE_FILTERS as readonly string[]).includes(filter);
}

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
  IN_PROGRESS_KPI: 'In progress',
  ON_HOLD_KPI: 'On hold',
  ACTIVE_KPI: 'Active',
  BREACHED_KPI: 'SLA breached (active)',
  UNASSIGNED_KPI: 'Unassigned (active)',
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

/** The backend dashboard's ACTIVE_STATUSES / IN_PROGRESS_STATUSES (dashboard.controller.ts:61-72). */
const KPI_ACTIVE_STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'PENDING'];
const KPI_IN_PROGRESS_STATUSES: readonly TicketStatus[] = ['IN_PROGRESS', 'PENDING'];
const NOT_RESOLVED_OR_CLOSED: readonly TicketStatus[] = TICKET_STATUSES.filter((s) => s !== 'RESOLVED' && s !== 'CLOSED');

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

/**
 * Whether the list may apply this filter for this role: the drop-down filters above, plus the Home-tile filters
 * (which never appear in the drop-down). Unassigned, in either form, stays ADMIN/AGENT only.
 */
export function isTicketFilterAllowed(role: UserRole, filter: TicketNamedFilter): boolean {
  if (isHomeTileFilter(filter)) return filter !== 'UNASSIGNED_KPI' || isAgentOrAdmin(role);
  return availableTicketFilters(role).includes(filter);
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
    case 'IN_PROGRESS_KPI':
      return { status: KPI_IN_PROGRESS_STATUSES.join(',') };
    case 'ON_HOLD_KPI':
      return { status: 'ON_HOLD' };
    case 'ACTIVE_KPI':
      return { status: KPI_ACTIVE_STATUSES.join(',') };
    case 'BREACHED_KPI':
      return { sla: 'BREACHED', status: NOT_RESOLVED_OR_CLOSED.join(',') };
    case 'UNASSIGNED_KPI':
      return { assignedToId: 'unassigned', status: KPI_ACTIVE_STATUSES.join(',') };
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

// ── More filters (Phase G2; the web's "More Filters" row, docs/G2-WEB-FILTERS.md) ──
// All five are SERVER-SIDE TKT-1 params, as on the web (TicketsListPage.tsx:256-268): nothing is filtered on the device.
// Which roles get which filter is decided in permissions.ts (ticketListFilters); this file only builds the query.

/** The five filters of the Filters sheet. `date` is the created-date range (From and To). */
export type TicketListFilterKey = 'priority' | 'category' | 'date' | 'technician' | 'group';

export const TICKET_LIST_FILTER_KEYS: readonly TicketListFilterKey[] = ['priority', 'category', 'date', 'technician', 'group'];

/** A picked category, technician or group, with its name for the summary line (the technician comes from a search). */
export interface FilterPick {
  id: string;
  name: string;
}

export interface TicketAdvancedFilters {
  priority: TicketPriority | null;
  /** A top-level category: the web offers only those (TicketsListPage.tsx:580). */
  category: FilterPick | null;
  /** Created on or after this day, `YYYY-MM-DD` (the device's calendar day, as the browser's date input gives it). */
  fromDate: string | null;
  /** Created on or before this day, `YYYY-MM-DD`. */
  toDate: string | null;
  technician: FilterPick | null;
  group: FilterPick | null;
}

export const NO_ADVANCED_FILTERS: TicketAdvancedFilters = {
  priority: null, category: null, fromDate: null, toDate: null, technician: null, group: null,
};

/** The web's technician list is active users with role AGENT only (TicketsListPage.tsx:155): the same people via USR-3. */
export const TECHNICIAN_FILTER_ROLES: readonly UserRole[] = ['AGENT'];

/** Priorities in the web's order (TicketsListPage.tsx:58). */
export const PRIORITY_FILTER_OPTIONS: readonly TicketPriority[] = TICKET_PRIORITIES;

/** A day the server accepts: anything but `YYYY-MM-DD` gives a 500 (01 TKT-1), so nothing else is ever sent. */
export function isFilterDay(day: string | null | undefined): day is string {
  return !!day && /^\d{4}-\d{2}-\d{2}$/.test(day) && dayToDueDate(day) !== null;
}

function isActive(filters: TicketAdvancedFilters, key: TicketListFilterKey): boolean {
  switch (key) {
    case 'priority':
      return filters.priority !== null;
    case 'category':
      return filters.category !== null;
    case 'date':
      return isFilterDay(filters.fromDate) || isFilterDay(filters.toDate);
    case 'technician':
      return filters.technician !== null;
    case 'group':
      return filters.group !== null;
  }
}

/** The filters in effect: the ones set AND allowed for this role. Anything else in the state is ignored. */
export function activeAdvancedFilters(
  filters: TicketAdvancedFilters,
  allowed: readonly TicketListFilterKey[],
): TicketListFilterKey[] {
  return TICKET_LIST_FILTER_KEYS.filter((key) => allowed.includes(key) && isActive(filters, key));
}

/** The TKT-1 params for the five filters, only for the allowed ones (the date range counts as one filter). */
export function advancedFilterQuery(
  filters: TicketAdvancedFilters,
  allowed: readonly TicketListFilterKey[],
): Pick<TicketListQuery, 'priority' | 'categoryId' | 'fromDate' | 'toDate' | 'assignedToId' | 'teamId'> {
  const on = new Set(activeAdvancedFilters(filters, allowed));
  return {
    ...(on.has('priority') && filters.priority ? { priority: filters.priority } : {}),
    ...(on.has('category') && filters.category ? { categoryId: filters.category.id } : {}),
    ...(on.has('date') && isFilterDay(filters.fromDate) ? { fromDate: filters.fromDate } : {}),
    ...(on.has('date') && isFilterDay(filters.toDate) ? { toDate: filters.toDate } : {}),
    ...(on.has('technician') && filters.technician ? { assignedToId: filters.technician.id } : {}),
    ...(on.has('group') && filters.group ? { teamId: filters.group.id } : {}),
  };
}

/**
 * Named filters that already set `assignedToId`. TKT-1 has one technician slot, so these and the Technician filter
 * replace each other: the web's last choice wins (one `assignedToId` key, TicketsListPage.tsx:256-258).
 */
const SETS_TECHNICIAN: ReadonlySet<TicketNamedFilter> = new Set<TicketNamedFilter>(['MY_OPEN', 'UNASSIGNED', 'UNASSIGNED_KPI']);

export function namedFilterSetsTechnician(filter: TicketNamedFilter): boolean {
  return SETS_TECHNICIAN.has(filter);
}

export interface TicketFilterState {
  filter: TicketNamedFilter;
  advanced: TicketAdvancedFilters;
}

/** Pick a named filter. "My open" or "Unassigned" drops a technician filter (one slot, last choice wins). */
export function withNamedFilter(state: TicketFilterState, filter: TicketNamedFilter): TicketFilterState {
  const advanced = namedFilterSetsTechnician(filter) && state.advanced.technician ? { ...state.advanced, technician: null } : state.advanced;
  return { filter, advanced };
}

/** Change some of the five. Picking a technician while "My open" or "Unassigned" is on moves the named filter to All. */
export function withAdvancedFilters(state: TicketFilterState, patch: Partial<TicketAdvancedFilters>): TicketFilterState {
  const advanced = { ...state.advanced, ...patch };
  const filter = patch.technician && namedFilterSetsTechnician(state.filter) ? 'ALL' : state.filter;
  return { filter, advanced };
}

export interface TicketListQueryInput {
  me: Pick<AuthUser, 'id' | 'role'>;
  filter: TicketNamedFilter;
  sort: TicketSortOption;
  /** Already normalised (normaliseTicketSearch); undefined = no `search` key. */
  search?: string;
  /** From listCountryParam(); undefined = no `countryId` key. */
  countryId?: string;
  advanced?: TicketAdvancedFilters;
  /** permissions.ts ticketListFilters() for this person. */
  allowed?: readonly TicketListFilterKey[];
}

/**
 * The one TKT-1 query for M3 (minus page/limit): role default, country, named filter, the five filters, sort, search.
 * The server ANDs them all (BE:tickets.controller.ts:98-131). If a named filter sets the technician, it wins over a
 * stale Technician filter.
 */
export function ticketListQuery({
  me, filter, sort, search, countryId, advanced = NO_ADVANCED_FILTERS, allowed = [],
}: TicketListQueryInput): Omit<TicketListQuery, 'page' | 'limit'> {
  return {
    ...roleDefaultTicketQuery(me.role),
    ...(countryId !== undefined ? { countryId } : {}),
    ...advancedFilterQuery(advanced, allowed),
    // After the five, so a named filter's `assignedToId` (My open, Unassigned) replaces a Technician filter's.
    ...ticketFilterQuery(filter, me),
    ...ticketSortQuery(sort),
    ...(search ? { search } : {}),
  };
}

/** "01 Oct 2026" for a filter day, as that calendar day (never shifted by the device timezone). */
export function formatFilterDay(day: string): string {
  return formatDueDay(dayToDueDate(day));
}

/** The created-date range in words, or null when neither day is set. */
export function dateRangeLabel(fromDate: string | null, toDate: string | null): string | null {
  const from = isFilterDay(fromDate) ? formatFilterDay(fromDate) : null;
  const to = isFilterDay(toDate) ? formatFilterDay(toDate) : null;
  if (from && to) return `Created ${from} – ${to}`;
  if (from) return `Created from ${from}`;
  if (to) return `Created until ${to}`;
  return null;
}

/**
 * Everything that narrows the list, in words, for the line under the quick filters: the named filter, the search and
 * the five. Empty = nothing to clear (the web shows its Clear button on the same condition, :395-397; sort excluded).
 */
export function activeFilterLabels({
  filter, search, advanced, allowed,
}: {
  filter: TicketNamedFilter;
  search: string | undefined;
  advanced: TicketAdvancedFilters;
  allowed: readonly TicketListFilterKey[];
}): string[] {
  const labels: string[] = [];
  if (filter !== 'ALL') labels.push(TICKET_FILTER_LABELS[filter]);
  if (search) labels.push(`“${search}”`);
  for (const key of activeAdvancedFilters(advanced, allowed)) {
    if (key === 'priority' && advanced.priority) labels.push(`${PRIORITY_LABELS[advanced.priority]} priority`);
    if (key === 'category' && advanced.category) labels.push(advanced.category.name);
    if (key === 'date') labels.push(dateRangeLabel(advanced.fromDate, advanced.toDate) ?? '');
    if (key === 'technician' && advanced.technician) labels.push(advanced.technician.name);
    if (key === 'group' && advanced.group) labels.push(advanced.group.name);
  }
  return labels.filter(Boolean);
}

/** Category options, as the web lists them: active top-level categories (LKP-1 flat), sorted by name (:579-585). */
export function categoryFilterOptions(categories: readonly Category[]): FilterPick[] {
  return categories
    .filter((c) => !c.level || c.level === 'CATEGORY')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Group options, as the web lists them: every team from LKP-2, inactive ones included, in the server's order (by name). */
export function groupFilterOptions(teams: readonly Team[]): (FilterPick & { inactive: boolean })[] {
  return teams.map((t) => ({ id: t.id, name: t.name, inactive: t.isActive === false }));
}

/**
 * The search box (08 §4.4, 05 §A.11): a leading `#` is stripped, so "#1234" and "1234" both hit the server's
 * digits-only branch (exact ticketNumber). Anything else is sent as a keyword (subject, requester, technician).
 * Returns undefined for a blank box, so the `search` key is not sent at all.
 */
export function normaliseTicketSearch(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const asNumber = trimmed.replace(/^#\s*/, '');
  return /^\d+$/.test(asNumber) ? asNumber : trimmed;
}

// ── Country selector (05 §A.12) ──────────────────────────────

/**
 * - `switch`: ADMIN and triage AGENT (AGENT without a country) pick a country, default "All".
 * - `locked`: country AGENT, forced to their own country.
 * - `hidden`: L2_MANAGER (server ignores countryId for them) and END_USER (D8: always `countryId=`, so a
 *   read-only country label would be misleading on mobile).
 */
export type CountrySelectorMode = 'switch' | 'locked' | 'hidden';

export function countrySelectorMode(user: Pick<AuthUser, 'role' | 'countryId'>): CountrySelectorMode {
  if (user.role === 'ADMIN') return 'switch';
  if (user.role === 'AGENT') return user.countryId ? 'locked' : 'switch';
  return 'hidden';
}

/**
 * `countryId` for TKT-1, or undefined to omit the key (05 §A.12): the value is sent only as `countryId`.
 * - locked AGENT → their own country;
 * - triage AGENT → the selection, or `''` for "All";
 * - ADMIN → the selection, or omitted for "All" (no filter either way for non-END_USER, 01 TKT-1);
 * - END_USER → handled by roleDefaultTicketQuery (`''`); L2 → omitted (the server ignores it).
 */
export function listCountryParam(user: Pick<AuthUser, 'role' | 'countryId'>, selected: string | null): string | undefined {
  if (user.role === 'AGENT') return user.countryId ? user.countryId : (selected ?? '');
  if (user.role === 'ADMIN') return selected ?? undefined;
  return undefined;
}
