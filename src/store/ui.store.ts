// Transient UI state. Nothing here is persisted, and reset() runs on every sign-out (02 §5.5) — that
// includes the country selection, which the web forgets to clear (05 §A.12), and the M3 filters, which the web keeps in
// sessionStorage across a logout (docs/G2-WEB-FILTERS.md W-G2-4).
// The Home period (G6) lives here too: kept while the app is open, back to the web's default ("This month") after a
// restart or a sign-out. The web keeps it in component state, so it is back to "This Month" on every visit to its
// dashboard (FE:DashboardPage.tsx:61); the app keeps it a little longer, across tabs, but writes nothing to disk.
// Saved filters are the Service Desk's saved views (2026-11-17, src/hooks/useSavedViews.ts); applying one only sets the
// fields below. reset() also runs on the environment switch (src/api/environmentSwitch.ts).
import { create } from 'zustand';

import {
  DEFAULT_DASHBOARD_PERIOD, NO_CUSTOM_RANGE, type CustomDayRange, type DashboardPeriod,
} from '@/utils/dashboard-period';
import { savedFilterUiState, type SavedFilterContent } from '@/utils/saved-filters';
import {
  NO_ADVANCED_FILTERS, withAdvancedFilters, withNamedFilter,
  type TicketAdvancedFilters, type TicketListPeriod, type TicketNamedFilter, type TicketSortOption,
} from '@/utils/ticket-filters';

interface UiState {
  /** M3 named filter (08 §4.5). */
  ticketFilter: TicketNamedFilter;
  /** M3 sort sheet (08 §4.3). */
  ticketSort: TicketSortOption;
  /** M3 country selector (05 §A.12): a country id, or null for "All countries". Only ADMIN and triage AGENT change it. */
  ticketCountryId: string | null;
  /** M3 Filters sheet (Phase G2): status (several, 2026-11-17), priority, category, created date, technician, group. */
  ticketAdvanced: TicketAdvancedFilters;
  /** M3 search box as typed, and the search applied (on the keyboard's search key, normalised). */
  ticketSearchText: string;
  ticketSearch: string | undefined;
  /** G7: the Home period a tile put on the list (its dates are in ticketAdvanced). Shown and cleared as one chip. */
  ticketPeriod: TicketListPeriod | null;
  /** Announcements hidden from the Home banner for this session only — no server state (ANN-1 is read-only). */
  dismissedAnnouncementIds: readonly string[];
  /** Home PERIOD row (G6): which window the DSH-1 counts cover. */
  homePeriod: DashboardPeriod;
  /** The Custom period's From and To. Kept when another period is picked, so going back to Custom restores them. */
  homeCustomRange: CustomDayRange;

  setTicketFilter: (filter: TicketNamedFilter) => void;
  setTicketSort: (sort: TicketSortOption) => void;
  setTicketCountryId: (countryId: string | null) => void;
  setTicketAdvanced: (patch: Partial<TicketAdvancedFilters>) => void;
  setTicketSearchText: (text: string) => void;
  setTicketSearch: (search: string | undefined) => void;
  /** The web's "Clear" (TicketsListPage.tsx:284-295): named filter, search, the five filters and the sort. Not the country. */
  clearTicketFilters: () => void;
  /**
   * A Home tile, like a web dashboard link: that filter alone, nothing else carried over (TicketsListPage.tsx:89-90),
   * plus the Home period as the created-date filter when the tile carries it (G7; the web's link sets fromDate/toDate).
   */
  openTicketList: (filter: TicketNamedFilter, period?: TicketListPeriod | null) => void;
  /** The period chip's ✕ (G7): drops the created-date filter the tile set. Nothing else changes. */
  clearTicketPeriod: () => void;
  /**
   * A saved view's chip on the Filters sheet, as the web's loadView: its quick filter, sort and sheet filters at once; the
   * search and the Home period are cleared; the country is kept (a view holds none). Pass what decodeSavedView() gave for
   * the viewer (the Filters sheet does).
   */
  applySavedTicketFilter: (content: SavedFilterContent) => void;
  dismissAnnouncement: (id: string) => void;
  restoreAnnouncement: (id: string) => void;
  setHomePeriod: (period: DashboardPeriod) => void;
  setHomeCustomRange: (patch: Partial<CustomDayRange>) => void;
  reset: () => void;
}

const CLEARED_TICKET_FILTERS = {
  ticketFilter: 'ALL',
  ticketSort: 'UPDATED',
  ticketAdvanced: NO_ADVANCED_FILTERS,
  ticketSearchText: '',
  ticketSearch: undefined,
  ticketPeriod: null,
} as const satisfies Pick<UiState, 'ticketFilter' | 'ticketSort' | 'ticketAdvanced' | 'ticketSearchText' | 'ticketSearch' | 'ticketPeriod'>;

const INITIAL = {
  ...CLEARED_TICKET_FILTERS,
  ticketCountryId: null,
  dismissedAnnouncementIds: [],
  homePeriod: DEFAULT_DASHBOARD_PERIOD,
  homeCustomRange: NO_CUSTOM_RANGE,
} as const satisfies Pick<
  UiState,
  | 'ticketFilter' | 'ticketSort' | 'ticketAdvanced' | 'ticketSearchText' | 'ticketSearch' | 'ticketCountryId' | 'dismissedAnnouncementIds'
  | 'homePeriod' | 'homeCustomRange' | 'ticketPeriod'
>;

export const useUiStore = create<UiState>()((set) => ({
  ...INITIAL,
  // One technician slot and one status slot: "My open" / "Unassigned" and the Technician filter, and a quick filter that
  // sends a status and the Status filter, replace each other (ticket-filters.ts).
  setTicketFilter: (filter) =>
    set((s) => {
      const next = withNamedFilter({ filter: s.ticketFilter, advanced: s.ticketAdvanced }, filter);
      return { ticketFilter: next.filter, ticketAdvanced: next.advanced };
    }),
  setTicketSort: (ticketSort) => set({ ticketSort }),
  setTicketCountryId: (ticketCountryId) => set({ ticketCountryId }),
  setTicketAdvanced: (patch) =>
    set((s) => {
      const next = withAdvancedFilters({ filter: s.ticketFilter, advanced: s.ticketAdvanced }, patch);
      return { ticketFilter: next.filter, ticketAdvanced: next.advanced };
    }),
  setTicketSearchText: (ticketSearchText) => set({ ticketSearchText }),
  setTicketSearch: (ticketSearch) => set({ ticketSearch }),
  clearTicketFilters: () => set({ ...CLEARED_TICKET_FILTERS }),
  openTicketList: (filter, period = null) =>
    set({
      ...CLEARED_TICKET_FILTERS,
      ticketFilter: filter,
      ...(period
        ? { ticketAdvanced: { ...NO_ADVANCED_FILTERS, fromDate: period.fromDate, toDate: period.toDate }, ticketPeriod: period }
        : {}),
    }),
  clearTicketPeriod: () =>
    set((s) => ({ ticketAdvanced: { ...s.ticketAdvanced, fromDate: null, toDate: null }, ticketPeriod: null })),
  applySavedTicketFilter: (content) => set(savedFilterUiState(content)),
  dismissAnnouncement: (id) =>
    set((s) => (s.dismissedAnnouncementIds.includes(id) ? s : { dismissedAnnouncementIds: [...s.dismissedAnnouncementIds, id] })),
  restoreAnnouncement: (id) => set((s) => ({ dismissedAnnouncementIds: s.dismissedAnnouncementIds.filter((d) => d !== id) })),
  setHomePeriod: (homePeriod) => set({ homePeriod }),
  setHomeCustomRange: (patch) => set((s) => ({ homeCustomRange: { ...s.homeCustomRange, ...patch } })),
  reset: () => set({ ...INITIAL }),
}));
