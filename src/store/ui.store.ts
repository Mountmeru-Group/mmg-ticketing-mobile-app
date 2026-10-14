// Transient UI state. Nothing here is persisted, and reset() runs on every sign-out (02 §5.5).
import { create } from 'zustand';

import type { TicketNamedFilter, TicketSortOption } from '@/utils/ticket-filters';

interface UiState {
  /** M3 named filter (08 §4.5). */
  ticketFilter: TicketNamedFilter;
  /** M3 sort sheet (08 §4.3). */
  ticketSort: TicketSortOption;

  setTicketFilter: (filter: TicketNamedFilter) => void;
  setTicketSort: (sort: TicketSortOption) => void;
  reset: () => void;
}

const INITIAL = {
  ticketFilter: 'ALL',
  ticketSort: 'UPDATED',
} as const satisfies Pick<UiState, 'ticketFilter' | 'ticketSort'>;

export const useUiStore = create<UiState>()((set) => ({
  ...INITIAL,
  setTicketFilter: (ticketFilter) => set({ ticketFilter }),
  setTicketSort: (ticketSort) => set({ ticketSort }),
  reset: () => set({ ...INITIAL }),
}));
