// Saved filters = the web portal's saved VIEWS (2026-11-17, Ronit's brief): stored on the Service Desk, per user, and the
// same list on the phone and on the web (SVW-1..4). Contract and sources: docs/web-system/16-SAVED-VIEWS.md. Pure
// functions; the requests are src/api/savedViews.api.ts, the hooks src/hooks/useSavedViews.ts.
//
// - What a view holds is the WEB's shape, and only it: one JSON object with up to eight keys, `status`, `priority`,
//   `sortBy`, `assignedToId`, `teamId`, `categoryId`, `fromDate`, `toDate`, each a string (TicketsListPage.tsx:190-199).
//   The app writes exactly those, with the meanings TKT-1 gives them, so the web reads a phone's view back as the same
//   tickets. It writes no key of its own: the web would ignore it and show other tickets under the same name.
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
import { TICKET_PRIORITIES, TICKET_STATUSES, type AuthUser, type SavedViewFilters, type TicketPriority, type TicketStatus } from '@/types';
import { PRIORITY_LABELS, statusLabel } from './format';
import { ticketListFilters } from './permissions';
import {
  NO_ADVANCED_FILTERS, TICKET_FILTER_LABELS, TICKET_SORT_LABELS, availableTicketFilters, cleanStatusList,
  countrySelectorMode, dateRangeLabel, isFilterDay, isTicketFilterAllowed, namedFilterSetsStatus, namedFilterSetsTechnician,
  ticketFilterQuery, ticketListQuery, type FilterPick, type TicketAdvancedFilters, type TicketListPeriod,
  type TicketNamedFilter, type TicketSortOption,
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

/** A server id as the app sends it: UUID characters only (never a comma, so never a list). */
const ID = /^[A-Za-z0-9-]{1,64}$/;

function isPick(value: unknown): value is FilterPick {
  if (typeof value !== 'object' || value === null) return false;
  const pick = value as Partial<FilterPick>;
  return typeof pick.id === 'string' && ID.test(pick.id) && typeof pick.name === 'string';
}

const asPick = (value: unknown): FilterPick | null => (isPick(value) ? { id: value.id, name: value.name } : null);

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
    priority: allowed.includes('priority') && isPriority(raw.priority) ? raw.priority : null,
    category: allowed.includes('category') ? asPick(raw.category) : null,
    fromDate: dateAllowed && isFilterDay(raw.fromDate as string) ? (raw.fromDate as string) : null,
    toDate: dateAllowed && isFilterDay(raw.toDate as string) ? (raw.toDate as string) : null,
    technician: allowed.includes('technician') && !namedFilterSetsTechnician(filter) ? asPick(raw.technician) : null,
    group: allowed.includes('group') ? asPick(raw.group) : null,
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
    const parts = typeof raw.status === 'string' ? raw.status.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (parts.length > 0 && parts.every(isStatus)) statuses = cleanStatusList(parts);
    else leftOut.push(`Status ${quoted(raw.status)} (not a status the app knows)`);
  }

  // Technician: one user id, or the web's `unassigned`.
  let assignee: string | null = null;
  if (isSet(raw.assignedToId)) {
    if (typeof raw.assignedToId === 'string' && ID.test(raw.assignedToId)) assignee = raw.assignedToId;
    else leftOut.push(`Technician ${quoted(raw.assignedToId)} (not readable by the app)`);
  }

  // The quick filter, when the view is exactly one of this role's.
  let filter: TicketNamedFilter = 'ALL';
  let status: TicketStatus[] = [];
  let technician: FilterPick | null = null;
  const named = availableTicketFilters(viewer.role).find((f) => f !== 'ALL' && matchesNamedFilter(f, viewer, statuses, assignee));
  if (named) {
    filter = named;
  } else {
    if (assignee === 'unassigned') {
      if (isTicketFilterAllowed(viewer.role, 'UNASSIGNED')) filter = 'UNASSIGNED';
      else leftOut.push('Unassigned tickets only (not available to your role)');
    } else if (assignee !== null) {
      if (allowed.includes('technician')) technician = { id: assignee, name: names.technician(assignee) ?? 'Unknown technician' };
      else leftOut.push('Technician (not available to your role)');
    }
    if (statuses !== null) {
      if (allowed.includes('status')) status = statuses;
      else leftOut.push('Status (not available to your role)');
    }
  }

  let priority: TicketPriority | null = null;
  if (isSet(raw.priority)) {
    if (!isPriority(raw.priority)) leftOut.push(`Priority ${quoted(raw.priority)} (not a priority the app knows)`);
    else if (allowed.includes('priority')) priority = raw.priority;
    else leftOut.push('Priority (not available to your role)');
  }

  const pick = (key: 'categoryId' | 'teamId', filterKey: 'category' | 'group', word: string, name: (id: string) => string | null) => {
    const value = raw[key];
    if (!isSet(value)) return null;
    if (typeof value !== 'string' || !ID.test(value)) {
      leftOut.push(`${word} ${quoted(value)} (not readable by the app)`);
      return null;
    }
    if (!allowed.includes(filterKey)) {
      leftOut.push(`${word} (not available to your role)`);
      return null;
    }
    return { id: value, name: name(value) ?? `Unknown ${word.toLowerCase()}` };
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

/**
 * A view's `filters` reduced to what decides the tickets: each set key as a trimmed string, a status list in option
 * order. Keys outside the web's eight are kept (so a view holding one never equals a phone's). Null when unreadable.
 */
export function savedViewKey(filters: unknown): string | null {
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters)) return null;
  const raw = filters as Record<string, unknown>;
  const out: [string, unknown][] = [];
  for (const key of Object.keys(raw).sort()) {
    const value = raw[key];
    if (!isSet(value)) continue;
    if (key === 'status' && typeof value === 'string') {
      const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
      out.push([key, parts.every(isStatus) ? cleanStatusList(parts).join(',') : value]);
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
  const statuses = cleanStatusList(a.status);
  if (statuses.length > 0) chips.push(`Status: ${statuses.map(statusLabel).join(', ')}`);
  if (a.priority) chips.push(`Priority: ${PRIORITY_LABELS[a.priority]}`);
  if (a.category) chips.push(`Category: ${a.category.name}`);
  const dates = dateRangeLabel(a.fromDate, a.toDate);
  if (dates) chips.push(dates);
  if (a.technician) chips.push(`Technician: ${a.technician.name}`);
  if (a.group) chips.push(`Group: ${a.group.name}`);
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

// ── The phone-only list of versionCode 6 (not uploaded: 16-SAVED-VIEWS.md §9) ──

/** SecureStore allows letters, digits, `.`, `-` and `_` in a key; user ids are UUIDs. */
const KEY_PART = /^[A-Za-z0-9_-]{1,64}$/;

/** Where versionCode 6 kept one user's filters in one environment, or null when the id cannot be part of a key. */
export function legacySavedFiltersKey(environment: string, userId: string): string | null {
  if (!KEY_PART.test(userId) || !KEY_PART.test(environment)) return null;
  return `mmg.savedFilters.${environment}.${userId}`;
}

export interface LegacySavedFilter {
  name: string;
  /** What it held, in words. */
  chips: string[];
}

/** The old list as the notice shows it: each entry's name and what it held. Tolerant: anything unreadable is skipped. */
export function parseLegacySavedFilters(raw: string | null): LegacySavedFilter[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: LegacySavedFilter[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string' || !e.name.trim()) continue;
    const a = (typeof e.advanced === 'object' && e.advanced !== null ? e.advanced : {}) as Record<string, unknown>;
    const chips: string[] = [];
    if (isNamedFilter(e.filter)) chips.push(`Quick filter: ${TICKET_FILTER_LABELS[e.filter]}`);
    if (typeof e.search === 'string' && e.search) chips.push(`Search: “${e.search}”`);
    if (isPriority(a.priority)) chips.push(`Priority: ${PRIORITY_LABELS[a.priority]}`);
    const category = asPick(a.category);
    if (category) chips.push(`Category: ${category.name}`);
    const dates = dateRangeLabel(typeof a.fromDate === 'string' ? a.fromDate : null, typeof a.toDate === 'string' ? a.toDate : null);
    if (dates) chips.push(dates);
    const technician = asPick(a.technician);
    if (technician) chips.push(`Technician: ${technician.name}`);
    const group = asPick(a.group);
    if (group) chips.push(`Group: ${group.name}`);
    if (isSort(e.sort)) chips.push(`Sort: ${TICKET_SORT_LABELS[e.sort]}`);
    if (e.country === 'ALL') chips.push('All countries');
    else if (asPick(e.country)) chips.push(`Country: ${(e.country as FilterPick).name}`);
    out.push({ name: cleanSavedFilterName(e.name), chips });
  }
  return out;
}
