// Saved views, the web portal's "Views" (01 SVW-1..4; contract and sources: docs/web-system/16-SAVED-VIEWS.md).
// - Per user, per environment (each has its own database). No role guard on the server: every role has its own.
// - The app lists, creates, renames and deletes TICKET views only (`entityType: 'ticket'`, as the web).
// - Bodies are built from allow-lists: create sends name, entityType and the web's eight filter keys; rename sends the
//   name ONLY, so a filter the web saved (one the app cannot show) is never rewritten. `columns` and `isDefault` are
//   never sent.
import type { CreateSavedViewBody, RenameSavedViewBody, SavedView, SavedViewFilters } from '@/types';
import type { MessageResponse } from './client';
import { apiClient } from './client';
import { seg } from './helpers';

/** The entity type the web's ticket list writes and lists (TicketsListPage.tsx:183, :189). */
export const TICKET_VIEW_ENTITY = 'ticket';

/** The keys the web writes into `filters`, in its order (TicketsListPage.tsx:190-199). Nothing else is ever sent. */
export const SAVED_VIEW_FILTER_KEYS = [
  'status', 'priority', 'sortBy', 'assignedToId', 'teamId', 'categoryId', 'fromDate', 'toDate',
] as const satisfies readonly (keyof SavedViewFilters)[];

/** SVW-1 — GET /api/v1/saved-views?entityType=ticket. The caller's ticket views, newest first; a plain array. */
export async function listTicketViews(): Promise<SavedView[]> {
  const res = await apiClient.get<SavedView[]>('/saved-views', { params: { entityType: TICKET_VIEW_ENTITY } });
  return res.data;
}

/** Only the web's keys, only non-empty strings, in the web's order. */
export function savedViewFiltersBody(filters: SavedViewFilters): SavedViewFilters {
  const out: SavedViewFilters = {};
  for (const key of SAVED_VIEW_FILTER_KEYS) {
    const value = filters[key];
    if (typeof value === 'string' && value !== '') out[key] = value;
  }
  return out;
}

/** SVW-2 — POST /api/v1/saved-views. 201 with the new row. */
export async function createTicketView(name: string, filters: SavedViewFilters): Promise<SavedView> {
  const body: CreateSavedViewBody = { name, entityType: TICKET_VIEW_ENTITY, filters: savedViewFiltersBody(filters) };
  const res = await apiClient.post<SavedView>('/saved-views', body);
  return res.data;
}

/** SVW-3 — PUT /api/v1/saved-views/:id with `{ name }` only. 200 with the row; 404 when it was deleted elsewhere. */
export async function renameSavedView(id: string, name: string): Promise<SavedView> {
  const body: RenameSavedViewBody = { name };
  const res = await apiClient.put<SavedView>(`/saved-views/${seg(id)}`, body);
  return res.data;
}

/** SVW-4 — DELETE /api/v1/saved-views/:id. 200 `{ message: 'View deleted' }`; 404 when it was already gone. */
export async function deleteSavedView(id: string): Promise<MessageResponse> {
  const res = await apiClient.delete<MessageResponse>(`/saved-views/${seg(id)}`);
  return res.data;
}
