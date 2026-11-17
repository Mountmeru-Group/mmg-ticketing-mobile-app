// Saved ticket filters (2026-11-17, Ronit's decision): kept ON THIS PHONE ONLY. They never sync with the web portal and
// no backend call reads or writes them. Pure functions; the store is src/store/savedFilters.store.ts.
//
// - Scope: the signed-in user AND the environment. A UAT filter holds UAT technician and category ids, which mean
//   nothing on production, so it is never offered there; nor is one person's filter offered to another on the phone.
// - What one holds (SavedFilterContent): the quick filter, the applied search, the sort, the country (only for the
//   roles that switch it), and the Filters sheet's five: priority, category, created date (From/To), technician, group.
//   NOT the Home period's name (a Home tile's "This month" chip): its dates are kept as the plain created-date filter.
// - Role: a saved filter only ever holds what that role may send. The five come from ticketListFilters()
//   (utils/permissions.ts), the quick filter from isTicketFilterAllowed() and the country from countrySelectorMode()
//   (utils/ticket-filters.ts): nothing is re-derived here. sanitizeSavedFilter() applies them on save, on load and on
//   apply, so a filter never outlives its role's permissions.
import type { AppEnvironment } from '@/config/env';
import { TICKET_PRIORITIES, type AuthUser, type TicketPriority } from '@/types';
import { PRIORITY_LABELS } from './format';
import { ticketListFilters } from './permissions';
import {
  NO_ADVANCED_FILTERS, TICKET_FILTER_LABELS, TICKET_SORT_LABELS, countrySelectorMode, dateRangeLabel, isFilterDay,
  isTicketFilterAllowed, namedFilterSetsTechnician, normaliseTicketSearch, type FilterPick, type TicketAdvancedFilters,
  type TicketListPeriod, type TicketNamedFilter, type TicketSortOption,
} from './ticket-filters';

/** Up to 20 per user per environment. */
export const SAVED_FILTER_LIMIT = 20;
/** A name's length cap, after trimming. */
export const SAVED_FILTER_NAME_MAX = 40;
/** The longest search a saved filter keeps; a longer one is not kept (the list's box has no limit). */
export const SAVED_FILTER_SEARCH_MAX = 200;

export type SavedFilterViewer = Pick<AuthUser, 'id' | 'role' | 'countryId'>;

export interface SavedFilterScope {
  environment: AppEnvironment;
  userId: string;
}

/** "All countries", or one country (its name for the chips). */
export type SavedCountry = 'ALL' | FilterPick;

/** Exactly what a saved filter holds. */
export interface SavedFilterContent {
  /** The quick filter; 'ALL' when none. */
  filter: TicketNamedFilter;
  /** The search as applied (normalised), or null. */
  search: string | null;
  sort: TicketSortOption;
  /** null = not captured: the role has no country selector (country AGENT, L2_MANAGER, END_USER), so it is left alone. */
  country: SavedCountry | null;
  /** The Filters sheet's five; any the role may not send is null. */
  advanced: TicketAdvancedFilters;
}

export interface SavedTicketFilter extends SavedFilterContent {
  id: string;
  name: string;
  environment: AppEnvironment;
  userId: string;
  /** Epoch ms. */
  createdAt: number;
}

/** The ticket list's state, as ui.store holds it, plus the country's name (from the countries lookup) for the chips. */
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

// ── Scope ────────────────────────────────────────────────────

/** SecureStore allows letters, digits, `.`, `-` and `_` in a key; user ids are UUIDs. Anything else is not stored. */
const KEY_PART = /^[A-Za-z0-9_-]{1,64}$/;

/** The phone storage key for one user in one environment, or null when the id cannot be part of a key. */
export function savedFiltersKey(scope: SavedFilterScope): string | null {
  if (!KEY_PART.test(scope.userId) || !KEY_PART.test(scope.environment)) return null;
  return `mmg.savedFilters.${scope.environment}.${scope.userId}`;
}

export function sameScope(a: SavedFilterScope | null, b: SavedFilterScope | null): boolean {
  return !!a && !!b && a.environment === b.environment && a.userId === b.userId;
}

// ── What a role may hold ─────────────────────────────────────

function isPick(value: unknown): value is FilterPick {
  if (typeof value !== 'object' || value === null) return false;
  const pick = value as Partial<FilterPick>;
  return typeof pick.id === 'string' && pick.id.length > 0 && typeof pick.name === 'string';
}

const asPick = (value: unknown): FilterPick | null => (isPick(value) ? { id: value.id, name: value.name } : null);

function isSort(value: unknown): value is TicketSortOption {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TICKET_SORT_LABELS, value);
}

function isPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(value);
}

/**
 * The content, cut down to what this viewer's role may send. Anything malformed is dropped too. Used on save, on load
 * and on apply, so a stored filter can never put a filter on the list that the role cannot send.
 */
export function sanitizeSavedFilter(content: Partial<SavedFilterContent> | null | undefined, viewer: SavedFilterViewer): SavedFilterContent {
  const source = (content ?? {}) as Partial<Record<keyof SavedFilterContent, unknown>>;
  const allowed = ticketListFilters(viewer);
  const rawFilter = source.filter;
  const filter: TicketNamedFilter =
    typeof rawFilter === 'string' && isTicketFilterAllowed(viewer.role, rawFilter as TicketNamedFilter)
      ? (rawFilter as TicketNamedFilter)
      : 'ALL';
  const sort = isSort(source.sort) ? source.sort : 'UPDATED';
  const search =
    typeof source.search === 'string' && source.search.trim().length <= SAVED_FILTER_SEARCH_MAX
      ? (normaliseTicketSearch(source.search) ?? null)
      : null;

  let country: SavedCountry | null = null;
  if (countrySelectorMode(viewer) === 'switch') {
    if (source.country === 'ALL') country = 'ALL';
    else country = asPick(source.country);
  }

  const raw = (typeof source.advanced === 'object' && source.advanced !== null ? source.advanced : {}) as Partial<
    Record<keyof TicketAdvancedFilters, unknown>
  >;
  const dateAllowed = allowed.includes('date');
  const advanced: TicketAdvancedFilters = {
    priority: allowed.includes('priority') && isPriority(raw.priority) ? raw.priority : null,
    category: allowed.includes('category') ? asPick(raw.category) : null,
    fromDate: dateAllowed && isFilterDay(raw.fromDate as string) ? (raw.fromDate as string) : null,
    toDate: dateAllowed && isFilterDay(raw.toDate as string) ? (raw.toDate as string) : null,
    // One technician slot: "My open" / "Unassigned" win over a Technician filter, as ticketListQuery() sends them.
    technician: allowed.includes('technician') && !namedFilterSetsTechnician(filter) ? asPick(raw.technician) : null,
    group: allowed.includes('group') ? asPick(raw.group) : null,
  };
  return { filter, search, sort, country, advanced };
}

/** The list's current state as a saved filter would hold it, for this viewer. */
export function captureSavedFilter(state: TicketListFilterState, viewer: SavedFilterViewer): SavedFilterContent {
  const country: SavedCountry | null =
    state.ticketCountryId === null
      ? 'ALL'
      : { id: state.ticketCountryId, name: state.countryName?.trim() || 'Selected country' };
  return sanitizeSavedFilter(
    {
      filter: state.ticketFilter,
      search: state.ticketSearch ?? null,
      sort: state.ticketSort,
      country,
      advanced: state.ticketAdvanced,
    },
    viewer,
  );
}

/**
 * The ui.store fields to set when a saved filter is applied: everything it holds replaces the list's state at once,
 * and anything it does not hold is cleared (as a Home tile does), except the country when it was not captured.
 */
export function savedFilterUiState(content: SavedFilterContent): {
  ticketFilter: TicketNamedFilter;
  ticketSort: TicketSortOption;
  ticketSearch: string | undefined;
  ticketSearchText: string;
  ticketAdvanced: TicketAdvancedFilters;
  ticketPeriod: TicketListPeriod | null;
  ticketCountryId?: string | null;
} {
  return {
    ticketFilter: content.filter,
    ticketSort: content.sort,
    ticketSearch: content.search ?? undefined,
    ticketSearchText: content.search ?? '',
    ticketAdvanced: { ...NO_ADVANCED_FILTERS, ...content.advanced },
    ticketPeriod: null,
    ...(content.country === null ? {} : { ticketCountryId: content.country === 'ALL' ? null : content.country.id }),
  };
}

// ── Comparing ────────────────────────────────────────────────

/** Ids only: a renamed category or technician is still the same filter. */
function comparable(content: SavedFilterContent): string {
  const id = (pick: FilterPick | null) => pick?.id ?? null;
  const { advanced: a } = content;
  return JSON.stringify([
    content.filter, content.search, content.sort,
    content.country === null ? null : content.country === 'ALL' ? 'ALL' : content.country.id,
    a.priority, id(a.category), a.fromDate, a.toDate, id(a.technician), id(a.group),
  ]);
}

/** True when the two put exactly the same filters on the list. The Filters sheet fills the chip that matches. */
export function sameSavedFilterContent(a: SavedFilterContent, b: SavedFilterContent): boolean {
  return comparable(a) === comparable(b);
}

// ── Words ────────────────────────────────────────────────────

/**
 * Every part of a saved filter, in words, as the save sheet lists it ("so nothing is a surprise later") and Manage
 * summarises it. The quick filter and the sort are always listed; the country whenever it is captured.
 */
export function savedFilterChips(content: SavedFilterContent): string[] {
  const { advanced: a } = content;
  const chips = [`Quick filter: ${TICKET_FILTER_LABELS[content.filter]}`];
  if (content.search) chips.push(`Search: “${content.search}”`);
  if (a.priority) chips.push(`Priority: ${PRIORITY_LABELS[a.priority]}`);
  if (a.category) chips.push(`Category: ${a.category.name}`);
  const dates = dateRangeLabel(a.fromDate, a.toDate);
  if (dates) chips.push(dates);
  if (a.technician) chips.push(`Technician: ${a.technician.name}`);
  if (a.group) chips.push(`Group: ${a.group.name}`);
  chips.push(`Sort: ${TICKET_SORT_LABELS[content.sort]}`);
  if (content.country !== null) chips.push(content.country === 'ALL' ? 'All countries' : `Country: ${content.country.name}`);
  return chips;
}

// ── Rules for saving and renaming ────────────────────────────

/** The name as stored: trimmed, inner runs of spaces made one. */
export function cleanSavedFilterName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Why this name cannot be used, or null. `exceptId`: the filter being renamed may keep its own name. */
export function savedFilterNameProblem(
  name: string,
  existing: readonly Pick<SavedTicketFilter, 'id' | 'name'>[],
  exceptId?: string,
): string | null {
  const clean = cleanSavedFilterName(name);
  if (!clean) return 'Give the filter a name.';
  if (clean.length > SAVED_FILTER_NAME_MAX) return `Keep the name to ${SAVED_FILTER_NAME_MAX} characters or fewer.`;
  const lower = clean.toLocaleLowerCase();
  const taken = existing.find((f) => f.id !== exceptId && f.name.toLocaleLowerCase() === lower);
  return taken ? `You already have a saved filter called “${taken.name}”. Choose another name.` : null;
}

/** Why the current filters cannot be saved at all (before a name is asked for), or null. */
export function savedFilterSaveProblem(existing: readonly SavedTicketFilter[], content: SavedFilterContent): string | null {
  if (existing.length >= SAVED_FILTER_LIMIT) {
    return `You can keep up to ${SAVED_FILTER_LIMIT} saved filters. Delete one in Manage to save another.`;
  }
  const same = existing.find((f) => sameSavedFilterContent(f, content));
  return same ? `These filters are already saved as “${same.name}”.` : null;
}

// ── On the phone ─────────────────────────────────────────────

/**
 * The stored list for this scope, as this viewer may use it. Each entry must name this scope's environment and user
 * (belt and braces: the storage key already does), have a usable name, and is cut down to the role (sanitizeSavedFilter).
 * `changed` is true when anything was dropped or cut, so the store writes the cleaned list back.
 */
export function parseSavedFilters(
  raw: string | null,
  scope: SavedFilterScope,
  viewer: SavedFilterViewer,
): { items: SavedTicketFilter[]; changed: boolean } {
  if (raw === null) return { items: [], changed: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { items: [], changed: true };
  }
  if (!Array.isArray(parsed)) return { items: [], changed: true };
  const items: SavedTicketFilter[] = [];
  for (const entry of parsed) {
    if (items.length >= SAVED_FILTER_LIMIT) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Partial<SavedTicketFilter>;
    if (e.environment !== scope.environment || e.userId !== scope.userId) continue;
    if (typeof e.id !== 'string' || !e.id || items.some((i) => i.id === e.id)) continue;
    if (typeof e.name !== 'string' || savedFilterNameProblem(e.name, items) !== null) continue;
    const createdAt = typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) ? e.createdAt : 0;
    items.push(savedFilterRecord({ id: e.id, name: e.name, scope, createdAt }, sanitizeSavedFilter(e, viewer)));
  }
  return { items, changed: JSON.stringify(items) !== JSON.stringify(parsed) };
}

/** One stored entry, its keys always in this order (so a list read back unchanged compares equal to what was written). */
export function savedFilterRecord(
  meta: { id: string; name: string; scope: SavedFilterScope; createdAt: number },
  content: SavedFilterContent,
): SavedTicketFilter {
  const a = content.advanced;
  return {
    id: meta.id,
    name: cleanSavedFilterName(meta.name),
    environment: meta.scope.environment,
    userId: meta.scope.userId,
    createdAt: meta.createdAt,
    filter: content.filter,
    search: content.search,
    sort: content.sort,
    country: content.country,
    advanced: {
      priority: a.priority, category: a.category, fromDate: a.fromDate, toDate: a.toDate, technician: a.technician, group: a.group,
    },
  };
}

/** A new id, unique on this phone. Not a secret. */
export function newSavedFilterId(now: number = Date.now()): string {
  return `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
