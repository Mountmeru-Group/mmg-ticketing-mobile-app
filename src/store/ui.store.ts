// Transient UI state. Nothing here is persisted, and reset() runs on every sign-out (02 §5.5) — that
// includes the country selection, which the web forgets to clear (05 §A.12).
import { create } from 'zustand';

import type { TicketNamedFilter, TicketSortOption } from '@/utils/ticket-filters';

interface UiState {
  /** M3 named filter (08 §4.5). */
  ticketFilter: TicketNamedFilter;
  /** M3 sort sheet (08 §4.3). */
  ticketSort: TicketSortOption;
  /** M3 country selector (05 §A.12): a country id, or null for "All countries". Only ADMIN and triage AGENT change it. */
  ticketCountryId: string | null;

  setTicketFilter: (filter: TicketNamedFilter) => void;
  setTicketSort: (sort: TicketSortOption) => void;
  setTicketCountryId: (countryId: string | null) => void;
  reset: () => void;
}

const INITIAL = {
  ticketFilter: 'ALL',
  ticketSort: 'UPDATED',
  ticketCountryId: null,
} as const satisfies Pick<UiState, 'ticketFilter' | 'ticketSort' | 'ticketCountryId'>;

export const useUiStore = create<UiState>()((set) => ({
  ...INITIAL,
  setTicketFilter: (ticketFilter) => set({ ticketFilter }),
  setTicketSort: (ticketSort) => set({ ticketSort }),
  setTicketCountryId: (ticketCountryId) => set({ ticketCountryId }),
  reset: () => set({ ...INITIAL }),
}));
