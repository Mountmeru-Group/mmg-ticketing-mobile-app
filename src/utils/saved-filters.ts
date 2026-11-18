// Saved filters = the web portal's saved VIEWS (2026-11-17, Ronit's brief): stored on the Service Desk, per user, and the
// same list on the phone and on the web (SVW-1..4). Contract and sources: docs/web-system/16-SAVED-VIEWS.md. Pure
// functions; the requests are src/api/savedViews.api.ts, the hooks src/hooks/useSavedViews.ts.
//
// - What a view holds is the WEB's shape, and only it: one JSON object with up to eight keys, `status`, `priority`,
//   `sortBy`, `assignedToId`, `teamId`, `categoryId`, `fromDate`, `toDate`, each a string (TicketsListPage.tsx:190-199).
//   The app writes exactly those, with the meanings TKT-1 gives them, so the web reads a phone's view back as the same
//   tickets. It writes no key of its own: the web would ignore it and show other tickets under the same name.
// - Several values (2026-11-18): a key holds them as ONE comma-separated string, `"categoryId": "a,b,c"`, exactly what
//   TKT-1 is sent. That is the web's own form for `status` in the source (a comma list kept as a string,
//   16-SAVED-VIEWS.md §6) and the live portal's form in its URL. The deployed web's code for multi-value views is not in
//   the clone, so it cannot be read; an ARRAY in a view is not guessed at: it is listed as left out, like any value the
//   app cannot read.
// - On the phone a view is a quick filter, a sort and the Filters sheet's filters (SavedFilterContent). The quick filter
//   is written as what TKT-1 sends for it (`status`, `assignedToId`). The ones that send `sla` (Overdue, Due soon, the
//   Home tiles' "SLA breached") cannot be held: saving them is REFUSED, never quietly dropped.
// - Not part of a view, on the web either: the search (the web clears it when a view loads, TicketsListPage.tsx:235) and
//   the country (the web keeps its navbar's, :161-164). The save sheet lists them as "not kept"; applying a view clears
//   the search and keeps the country, as the web does.
// - Role: a view only ever holds what that role may send, from ticketListFilters() and isTicketFilterAllowed()
//   (utils/permissions.ts, utils/ticket-filters.ts). Reading a view applies the same rules: anything this role cannot
//   send, or the app cannot read (a key from a newer web, a value outside the 03 enums), is NOT sent and is listed as
//   left out. The app never writes a view's filters back (rename sends the name only), so nothing the web saved is lost.
// iOS (iOS-5i): behind the build-time flag SAVED_VIEWS_ENABLED (src/screens/tickets/savedViewsGate.ts); only the
// saved-views modules import this file at run time (others use `import type`), so a production bundle with the flag off
// holds none of it. Android's versionCode-6 section (the phone-only list) is not on iOS: no iOS build ever kept one.
import { TICKET_PRIORITIES, TICKET_STATUSES, type AuthUser, type TicketPriority, type TicketStatus } from '@/types';
import type { SavedViewFilters } from '@/types/savedView';
import { PRIORITY_LABELS, statusLabel } from './format';
import { ticketListFilters } from './permissions';
import {
  NO_ADVANCED_FILTERS, TICKET_FILTER_LABELS, TICKET_SORT_LABELS, availableTicketFilters, cleanPicks, cleanPriorityList,
  cleanStatusList, countrySelectorMode, dateRangeLabel, isFilterDay, isFilterId, isTicketFilterAllowed, namedFilterSetsStatus,
  namedFilterSetsTechnician, ticketFilterQuery, ticketListQuery, type FilterPick, type TicketAdvancedFilters,
  type TicketListPeriod, type TicketNamedFilter, type TicketSortOption,
} from './ticket-filters';

/** A name's length cap for the names the app writes, after trimming. The server has none (05 B.42). */
export const SAVED_FILTER_NAME_MAX = 40;

/** The keys of a view's `filters`, in the web's order (TicketsListPage.tsx:190-199). */
export const SAVED_VIEW_KEYS = [
  'status', 'priority', 'sortBy', 'assignedToId', 'teamId', 'categoryId', 'fromDate', 'toDate',
] as const satisfies readonly (keyof SavedViewFilters)[];

export type SavedFilterViewer = Pick<AuthUser, 'id' | 'role' | 'countryId'>;

/** What a saved view holds, on the phone. */
export interface SavedFilterContent {
  /** The quick filter; 'ALL' when none. */
  filter: TicketNamedFilter;
  sort: TicketSortOption;
  /** The Filters sheet's filters; any the role may not send is empty. */
  advanced: TicketAdvancedFilters;
}

/** The ticket list's state, as ui.store holds it, plus the country's name (from the countries lookup) for the notes. */
export interface TicketListFilterState {
  ticketFilter: TicketNamedFilter;
  ticketSort: TicketSortOption;
  ticketSearch: string | undefined;
  ticketCountryId: string | null;
  ticketAdvanced: TicketAdvancedFilters;
  countryName?: string | null;
}

/** Thrown for a refused save, rename or delete: `message` is for the person. */
export class SavedFilterError extends Error {}

// ── Small checks ─────────────────────────────────────────────

/** The parts of a comma-separated value, trimmed, empty parts dropped. Null when it is not a string. */
function commaParts(value: unknown): string[] | null {
  return typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : null;
}

/** One id or a comma list of ids, each once, in the order stored. Null when any part is not an id the app can send. */
function idList(value: unknown): string[] | null {
  const parts = commaParts(value);
  if (!parts || parts.length === 0 || !parts.every(isFilterId)) return null;
  return [...new Set(parts)];
}

function isSort(value: unknown): value is TicketSortOption {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TICKET_SORT_LABELS, value);
}

function isPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(value);
}

function isStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

function isNamedFilter(value: unknown): value is TicketNamedFilter {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TICKET_FILTER_LABELS, value);
}

/** Set in a view: the web leaves out what is not set (undefined is dropped by JSON); '' and null count as not set. */
function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

// ── What a role may hold ─────────────────────────────────────

/**
 * The content, cut down to what this viewer's role may send; anything malformed is dropped too. Used on save and on
 * apply, so a view can never put a filter on the list that the role cannot send. One technician slot and one status
 * slot, as the request has them: a quick filter that sends either wins.
 */
export function sanitizeSavedFilter(content: Partial<SavedFilterContent> | null | undefined, viewer: SavedFilterViewer): SavedFilterContent {
  const source = (content ?? {}) as Partial<Record<keyof SavedFilterContent, unknown>>;
  const allowed = ticketListFilters(viewer);
  const filter: TicketNamedFilter =
    isNamedFilter(source.filter) && isTicketFilterAllowed(viewer.role, source.filter) ? source.filter : 'ALL';
  const sort = isSort(source.sort) ? source.sort : 'UPDATED';
  const raw = (typeof source.advanced === 'object' && source.advanced !== null ? source.advanced : {}) as Partial<
    Record<keyof TicketAdvancedFilters, unknown>
  >;
  const dateAllowed = allowed.includes('date');
  const advanced: TicketAdvancedFilters = {
    status: allowed.includes('status') && !namedFilterSetsStatus(filter) ? cleanStatusList(raw.status) : [],
    priority: allowed.includes('priority') ? cleanPriorityList(raw.priority) : [],
    category: allowed.includes('category') ? cleanPicks(raw.category) : [],
    fromDate: dateAllowed && isFilterDay(raw.fromDate as string) ? (raw.fromDate as string) : null,
    toDate: dateAllowed && isFilterDay(raw.toDate as string) ? (raw.toDate as string) : null,
    technician: allowed.includes('technician') && !namedFilterSetsTechnician(filter) ? cleanPicks(raw.technician) : [],
    group: allowed.includes('group') ? cleanPicks(raw.group) : [],
  };
  return { filter, sort, advanced };
}

// ── Phone → view (SVW-2) ─────────────────────────────────────

/** The view's `filters` for this content: exactly what TKT-1 would send for it, in the web's keys. */
export function savedViewFiltersFor(
  content: SavedFilterContent,
  viewer: SavedFilterViewer,
): { filters: SavedViewFilters; sla: boolean } {
  const query = ticketListQuery({
    me: viewer, filter: content.filter, sort: content.sort, advanced: content.advanced, allowed: ticketListFilters(viewer),
  });
  const filters: SavedViewFilters = {};
  for (const key of SAVED_VIEW_KEYS) {
    const value = (query as Record<string, unknown>)[key];
    if (typeof value === 'string' && value !== '') filters[key] = value;
  }
  return { filters, sla: query.sla !== undefined };
}

export interface SavedViewCapture {
  /** The list's filters as a view would hold them, cut to the role. */
  content: SavedFilterContent;
  /** What SVW-2 sends as `filters`. */
  filters: SavedViewFilters;
  /** What is on the list but is not part of a view (on the web either), in words, for the save sheet. */
  notKept: string[];
  /** Why these filters cannot be saved as a view at all, or null. */
  refusal: string | null;
}

/** The list's current state as a view would hold it, for this viewer. */
export function captureSavedView(state: TicketListFilterState, viewer: SavedFilterViewer): SavedViewCapture {
  const content = sanitizeSavedFilter({ filter: state.ticketFilter, sort: state.ticketSort, advanced: state.ticketAdvanced }, viewer);
  const { filters, sla } = savedViewFiltersFor(content, viewer);
  const notKept: string[] = [];
  if (state.ticketSearch) notKept.push(`Search “${state.ticketSearch}”`);
  if (countrySelectorMode(viewer) === 'switch' && state.ticketCountryId !== null) {
    notKept.push(`Country: ${state.countryName?.trim() || 'the country you picked'}`);
  }
  const refusal = sla
    ? `“${TICKET_FILTER_LABELS[content.filter]}” can't be saved: the web portal's views have no SLA filter. Pick another quick filter first.`
    : null;
  return { content, filters, notKept, refusal };
}

// ── View → phone (SVW-1) ─────────────────────────────────────

/** Names for the ids a view holds. Null when the name is not known (yet). */
export interface SavedViewNames {
  category: (id: string) => string | null;
  group: (id: string) => string | null;
  technician: (id: string) => string | null;
}

export const NO_NAMES: SavedViewNames = { category: () => null, group: () => null, technician: () => null };

export interface DecodedSavedView {
  /** What the app applies; null when the view's filters cannot be read at all (then it is not applied). */
  content: SavedFilterContent | null;
  /** Each part of the view the app does NOT apply, and why, in words. Empty: the view is applied whole. */
  leftOut: string[];
}

function quoted(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `“${(text ?? '').slice(0, 40)}”`;
}

/** True when this named filter sends exactly this status set and this assignee, and nothing else a view can hold. */
function matchesNamedFilter(
  filter: TicketNamedFilter,
  viewer: SavedFilterViewer,
  statuses: readonly TicketStatus[] | null,
  assignee: string | null,
): boolean {
  const query = ticketFilterQuery(filter, viewer);
  if (query.sla !== undefined) return false;
  const own = query.status ? cleanStatusList(query.status.split(',')) : null;
  const sameStatus =
    own === null ? statuses === null : statuses !== null && own.length === statuses.length && own.every((s, i) => s === statuses[i]);
  return sameStatus && (query.assignedToId ?? null) === assignee;
}

/**
 * A view's `filters` as this viewer can apply them. Never throws: anything it cannot use is in `leftOut`.
 * - `status` and `assignedToId` that are exactly one of the role's quick filters come back as that quick filter;
 *   otherwise as the Status filter, "Unassigned", or the Technician filter.
 * - Any key outside the web's eight, any value outside the 03 enums or not in its expected form, and any filter this
 *   role cannot send are left out.
 */
export function decodeSavedView(filters: unknown, viewer: SavedFilterViewer, names: SavedViewNames = NO_NAMES): DecodedSavedView {
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters)) {
    return { content: null, leftOut: ["Its filters can't be read by the app"] };
  }
  const raw = filters as Record<string, unknown>;
  const allowed = ticketListFilters(viewer);
  const leftOut: string[] = [];
  const known = SAVED_VIEW_KEYS as readonly string[];
  for (const key of Object.keys(raw)) {
    if (!known.includes(key) && isSet(raw[key])) leftOut.push(`${quoted(key)} (not on the app)`);
  }

  // Status: one value or a comma list of 03 statuses, nothing else (an unknown value is a 500, 01 TKT-1).
  let statuses: TicketStatus[] | null = null;
  if (isSet(raw.status)) {
    const parts = commaParts(raw.status) ?? [];
    if (parts.length > 0 && parts.every(isStatus)) statuses = cleanStatusList(parts);
    else leftOut.push(`Status ${quoted(raw.status)} (not a status the app knows)`);
  }

  // Technician: one user id, a comma list of them, or the web's `unassigned` on its own. `unassigned` inside a list is
  // not something the app can send: Unassigned is a quick filter, and it and technicians replace each other.
  let assignee: string | null = null;
  let technicianIds: string[] | null = null;
  if (isSet(raw.assignedToId)) {
    const ids = idList(raw.assignedToId);
    if (ids && ids.length === 1 && ids[0] === 'unassigned') assignee = 'unassigned';
    else if (ids && !ids.includes('unassigned')) {
      technicianIds = ids;
      assignee = ids.join(',');
    } else leftOut.push(`Technician ${quoted(raw.assignedToId)} (not readable by the app)`);
  }

  // The quick filter, when the view is exactly one of this role's.
  let filter: TicketNamedFilter = 'ALL';
  let status: TicketStatus[] = [];
  let technician: FilterPick[] = [];
  const named = availableTicketFilters(viewer.role).find((f) => f !== 'ALL' && matchesNamedFilter(f, viewer, statuses, assignee));
  if (named) {
    filter = named;
  } else {
    if (assignee === 'unassigned') {
      if (isTicketFilterAllowed(viewer.role, 'UNASSIGNED')) filter = 'UNASSIGNED';
      else leftOut.push('Unassigned tickets only (not available to your role)');
    } else if (technicianIds !== null) {
      if (allowed.includes('technician')) {
        technician = technicianIds.map((id) => ({ id, name: names.technician(id) ?? 'Unknown technician' }));
      } else leftOut.push('Technician (not available to your role)');
    }
    if (statuses !== null) {
      if (allowed.includes('status')) status = statuses;
      else leftOut.push('Status (not available to your role)');
    }
  }

  // Priority: one value or a comma list of 03 priorities (an unknown value is a 500, 01 TKT-1).
  let priority: TicketPriority[] = [];
  if (isSet(raw.priority)) {
    const parts = commaParts(raw.priority) ?? [];
    if (parts.length === 0 || !parts.every(isPriority)) leftOut.push(`Priority ${quoted(raw.priority)} (not a priority the app knows)`);
    else if (allowed.includes('priority')) priority = cleanPriorityList(parts);
    else leftOut.push('Priority (not available to your role)');
  }

  const pick = (key: 'categoryId' | 'teamId', filterKey: 'category' | 'group', word: string, name: (id: string) => string | null) => {
    const value = raw[key];
    if (!isSet(value)) return [];
    const ids = idList(value);
    if (!ids) {
      leftOut.push(`${word} ${quoted(value)} (not readable by the app)`);
      return [];
    }
    if (!allowed.includes(filterKey)) {
      leftOut.push(`${word} (not available to your role)`);
      return [];
    }
    return ids.map((id) => ({ id, name: name(id) ?? `Unknown ${word.toLowerCase()}` }));
  };
  const category = pick('categoryId', 'category', 'Category', names.category);
  const group = pick('teamId', 'group', 'Group', names.group);

  const day = (key: 'fromDate' | 'toDate', word: string): string | null => {
    const value = raw[key];
    if (!isSet(value)) return null;
    if (typeof value !== 'string' || !isFilterDay(value)) {
      leftOut.push(`${word} ${quoted(value)} (not a date the app can send)`);
      return null;
    }
    if (!allowed.includes('date')) {
      leftOut.push(`${word} (not available to your role)`);
      return null;
    }
    return value;
  };
  const fromDate = day('fromDate', 'Created from');
  const toDate = day('toDate', 'Created until');

  // Sort: the web's two (`priority`, `sla`), or none. `updated` is "none" on every server version.
  let sort: TicketSortOption = 'UPDATED';
  if (isSet(raw.sortBy)) {
    if (raw.sortBy === 'priority') sort = 'PRIORITY';
    else if (raw.sortBy === 'sla') sort = 'DUE';
    else if (raw.sortBy !== 'updated') leftOut.push(`Sort ${quoted(raw.sortBy)} (not on the app)`);
  }

  const advanced: TicketAdvancedFilters = { ...NO_ADVANCED_FILTERS, status, priority, category, fromDate, toDate, technician, group };
  return { content: { filter, sort, advanced }, leftOut };
}

// ── Comparing ────────────────────────────────────────────────

/** The comma-list keys whose order does not change the tickets: compared as sorted sets. */
const ID_LIST_KEYS: ReadonlySet<string> = new Set(['assignedToId', 'teamId', 'categoryId']);

/**
 * A view's `filters` reduced to what decides the tickets: each set key as a trimmed string; a status or priority list in
 * option order; a list of ids sorted (the web and the phone may tick them in another order). Keys outside the web's
 * eight are kept (so a view holding one never equals a phone's). Null when unreadable.
 */
export function savedViewKey(filters: unknown): string | null {
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters)) return null;
  const raw = filters as Record<string, unknown>;
  const out: [string, unknown][] = [];
  for (const key of Object.keys(raw).sort()) {
    const value = raw[key];
    if (!isSet(value)) continue;
    const parts = commaParts(value);
    if (key === 'status' && parts) {
      out.push([key, parts.every(isStatus) ? cleanStatusList(parts).join(',') : value]);
    } else if (key === 'priority' && parts) {
      out.push([key, parts.every(isPriority) ? cleanPriorityList(parts).join(',') : value]);
    } else if (ID_LIST_KEYS.has(key) && idList(value)) {
      out.push([key, (idList(value) ?? []).slice().sort().join(',')]);
    } else if (key === 'sortBy' && value === 'updated') {
      continue; // the same order as no sortBy
    } else {
      out.push([key, typeof value === 'string' ? value.trim() : value]);
    }
  }
  return JSON.stringify(out);
}

/** True when the two put exactly the same filters on the list. */
export function sameSavedViewFilters(a: unknown, b: unknown): boolean {
  const left = savedViewKey(a);
  return left !== null && left === savedViewKey(b);
}

// ── Words ────────────────────────────────────────────────────

/** Every part of a view, in words, as the save sheet and Manage list it. The quick filter and the sort always. */
export function savedViewChips(content: SavedFilterContent): string[] {
  const { advanced: a } = content;
  const chips = [`Quick filter: ${TICKET_FILTER_LABELS[content.filter]}`];
  const names = (picks: readonly FilterPick[]) => cleanPicks(picks).map((p) => p.name).join(', ');
  const statuses = cleanStatusList(a.status);
  if (statuses.length > 0) chips.push(`Status: ${statuses.map(statusLabel).join(', ')}`);
  const priorities = cleanPriorityList(a.priority);
  if (priorities.length > 0) chips.push(`Priority: ${priorities.map((p) => PRIORITY_LABELS[p]).join(', ')}`);
  if (cleanPicks(a.category).length > 0) chips.push(`Category: ${names(a.category)}`);
  const dates = dateRangeLabel(a.fromDate, a.toDate);
  if (dates) chips.push(dates);
  if (cleanPicks(a.technician).length > 0) chips.push(`Technician: ${names(a.technician)}`);
  if (cleanPicks(a.group).length > 0) chips.push(`Group: ${names(a.group)}`);
  chips.push(`Sort: ${TICKET_SORT_LABELS[content.sort]}`);
  return chips;
}

// ── Applying ─────────────────────────────────────────────────

/**
 * The ui.store fields to set when a view is applied, as the web's loadView (TicketsListPage.tsx:221-254): the quick
 * filter, the sort and the sheet's filters replace the list's; the search and the Home period are cleared; the country
 * is NOT touched (a view holds none).
 */
export function savedFilterUiState(content: SavedFilterContent): {
  ticketFilter: TicketNamedFilter;
  ticketSort: TicketSortOption;
  ticketSearch: undefined;
  ticketSearchText: string;
  ticketAdvanced: TicketAdvancedFilters;
  ticketPeriod: TicketListPeriod | null;
} {
  return {
    ticketFilter: content.filter,
    ticketSort: content.sort,
    ticketSearch: undefined,
    ticketSearchText: '',
    ticketAdvanced: { ...NO_ADVANCED_FILTERS, ...content.advanced, status: cleanStatusList(content.advanced.status) },
    ticketPeriod: null,
  };
}

// ── Rules for the names the app writes ───────────────────────

/** The name as the app stores it: trimmed, inner runs of spaces made one. */
export function cleanSavedFilterName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Why this name cannot be used, or null. `exceptId`: the view being renamed may keep its own name. */
export function savedFilterNameProblem(
  name: string,
  existing: readonly { id: string; name: string }[],
  exceptId?: string,
): string | null {
  const clean = cleanSavedFilterName(name);
  if (!clean) return 'Give the filter a name.';
  if (clean.length > SAVED_FILTER_NAME_MAX) return `Keep the name to ${SAVED_FILTER_NAME_MAX} characters or fewer.`;
  const lower = clean.toLocaleLowerCase();
  const taken = existing.find((f) => f.id !== exceptId && cleanSavedFilterName(f.name).toLocaleLowerCase() === lower);
  return taken ? `You already have a saved filter called “${cleanSavedFilterName(taken.name)}”. Choose another name.` : null;
}

/** Why the list's filters cannot be saved as a view (before a name is asked for), or null. */
export function savedViewSaveProblem(
  existing: readonly { name: string; filters: unknown }[],
  capture: Pick<SavedViewCapture, 'filters' | 'refusal'>,
): string | null {
  if (capture.refusal) return capture.refusal;
  const same = existing.find((v) => sameSavedViewFilters(v.filters, capture.filters));
  return same ? `These filters are already saved as “${cleanSavedFilterName(same.name)}”.` : null;
}
