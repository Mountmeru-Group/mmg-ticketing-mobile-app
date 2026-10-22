// Transient UI state. Nothing here is persisted, and reset() runs on every sign-out (02 §5.5) — that
// includes the country selection, which the web forgets to clear (05 §A.12), and the M3 filters, which the web keeps in
// sessionStorage across a logout (docs/G2-WEB-FILTERS.md W-G2-4).
import { create } from 'zustand';

import {
  NO_ADVANCED_FILTERS, withAdvancedFilters, withNamedFilter,
  type TicketAdvancedFilters, type TicketNamedFilter, type TicketSortOption,
} from '@/utils/ticket-filters';

interface UiState {
  /** M3 named filter (08 §4.5). */
  ticketFilter: TicketNamedFilter;
  /** M3 sort sheet (08 §4.3). */
  ticketSort: TicketSortOption;
  /** M3 country selector (05 §A.12): a country id, or null for "All countries". Only ADMIN and triage AGENT change it. */
  ticketCountryId: string | null;
  /** M3 Filters sheet (Phase G2): priority, category, created date, technician, group. */
  ticketAdvanced: TicketAdvancedFilters;
  /** M3 search box as typed, and the search applied (on the keyboard's search key, normalised). */
  ticketSearchText: string;
  ticketSearch: string | undefined;
  /** Announcements hidden from the Home banner for this session only — no server state (ANN-1 is read-only). */
  dismissedAnnouncementIds: readonly string[];

  setTicketFilter: (filter: TicketNamedFilter) => void;
  setTicketSort: (sort: TicketSortOption) => void;
  setTicketCountryId: (countryId: string | null) => void;
  setTicketAdvanced: (patch: Partial<TicketAdvancedFilters>) => void;
  setTicketSearchText: (text: string) => void;
  setTicketSearch: (search: string | undefined) => void;
  /** The web's "Clear" (TicketsListPage.tsx:284-295): named filter, search, the five filters and the sort. Not the country. */
  clearTicketFilters: () => void;
  /** A Home tile, like a web dashboard link: that filter alone, nothing else carried over (TicketsListPage.tsx:89-90). */
  openTicketList: (filter: TicketNamedFilter) => void;
  dismissAnnouncement: (id: string) => void;
  restoreAnnouncement: (id: string) => void;
  reset: () => void;
}

const CLEARED_TICKET_FILTERS = {
  ticketFilter: 'ALL',
  ticketSort: 'UPDATED',
  ticketAdvanced: NO_ADVANCED_FILTERS,
  ticketSearchText: '',
  ticketSearch: undefined,
} as const satisfies Pick<UiState, 'ticketFilter' | 'ticketSort' | 'ticketAdvanced' | 'ticketSearchText' | 'ticketSearch'>;

const INITIAL = {
  ...CLEARED_TICKET_FILTERS,
  ticketCountryId: null,
  dismissedAnnouncementIds: [],
} as const satisfies Pick<
  UiState,
  'ticketFilter' | 'ticketSort' | 'ticketAdvanced' | 'ticketSearchText' | 'ticketSearch' | 'ticketCountryId' | 'dismissedAnnouncementIds'
>;

export const useUiStore = create<UiState>()((set) => ({
  ...INITIAL,
  // One technician slot: "My open" / "Unassigned" and the Technician filter replace each other (ticket-filters.ts).
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
  openTicketList: (filter) => set({ ...CLEARED_TICKET_FILTERS, ticketFilter: filter }),
  dismissAnnouncement: (id) =>
    set((s) => (s.dismissedAnnouncementIds.includes(id) ? s : { dismissedAnnouncementIds: [...s.dismissedAnnouncementIds, id] })),
  restoreAnnouncement: (id) => set((s) => ({ dismissedAnnouncementIds: s.dismissedAnnouncementIds.filter((d) => d !== id) })),
  reset: () => set({ ...INITIAL }),
}));
