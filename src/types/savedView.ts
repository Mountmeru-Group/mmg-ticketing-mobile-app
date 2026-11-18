// Copied verbatim from 03-DATA-MODEL.md §C ("Saved views", 2026-11-17). Do not edit by hand.
import type { ISODateString, UUID } from './api';

// ── Saved views (SVW-1..4, 2026-11-17; 16-SAVED-VIEWS.md) ────
/** One `saved_views` row, every column, as SVW-1/2/3 return it (schema.prisma:1783-1796; no include). */
export interface SavedView {
  id: UUID; name: string;                       // name: not trimmed, not unique, no maximum (05 B.42)
  entityType: string;                           // the web writes and lists 'ticket' only
  filters: unknown;                             // Json: whatever the client sent; never trusted to be an object
  columns: string[];                            // table columns (a newer web branch), not filters
  userId: UUID; isDefault: boolean;             // isDefault: at most one per user and entityType; nothing reads it
  createdAt: ISODateString;                     // no updatedAt
}
/** The keys the web's ticket list writes into `filters` and reads back (TicketsListPage.tsx:190-199, :223-232). */
export interface SavedViewFilters {
  status?: string;                              // one TicketStatus, or a comma list
  priority?: string; sortBy?: string;           // priority: one or a comma list; sortBy: 'priority' | 'sla'
  assignedToId?: string;                        // a user id, 'unassigned', or a comma list of user ids
  teamId?: string; categoryId?: string;         // an id, or a comma list of ids (as TKT-1 takes them, 2026-11-18)
  fromDate?: string; toDate?: string;           // 'YYYY-MM-DD'
}
/** SVW-2 POST /saved-views as the app sends it: never `columns`, never `isDefault`. */
export interface CreateSavedViewBody { name: string; entityType: 'ticket'; filters: SavedViewFilters; }
/** SVW-3 PUT /saved-views/:id as the app sends it: the name only, so stored filters are never rewritten. */
export interface RenameSavedViewBody { name: string; }
