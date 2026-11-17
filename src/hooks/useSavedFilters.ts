// The signed-in person's saved ticket filters in the environment in use (2026-11-17), for the Filters sheet.
// On the phone only: no request is made (src/store/savedFilters.store.ts). Another user's or another environment's
// filters are never returned, even for the moment before the right list is read.
import { useCallback, useEffect, useMemo } from 'react';

import { useAuthStore } from '@/store/auth.store';
import { useEnvironmentStore } from '@/store/environment.store';
import { useSavedFiltersStore } from '@/store/savedFilters.store';
import {
  sameScope, sanitizeSavedFilter, type SavedFilterContent, type SavedFilterScope, type SavedFilterViewer,
  type SavedTicketFilter,
} from '@/utils/saved-filters';

export function useSavedTicketFilters() {
  const id = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.user?.role);
  const countryId = useAuthStore((s) => s.user?.countryId ?? null);
  const environment = useEnvironmentStore((s) => s.environment);
  const store = useSavedFiltersStore();

  const viewer = useMemo<SavedFilterViewer | null>(() => (id && role ? { id, role, countryId } : null), [id, role, countryId]);
  const scope = useMemo<SavedFilterScope | null>(() => (id ? { environment, userId: id } : null), [environment, id]);
  const held = sameScope(store.scope, scope);
  const { load } = store;

  useEffect(() => {
    if (viewer && scope && !held) void load(viewer, scope);
  }, [viewer, scope, held, load]);

  // Cut to the role again as shown: a role changed since they were read (a fresh /auth/me) is applied at once.
  const items = useMemo<SavedTicketFilter[]>(
    () => (held && viewer ? store.items.map((f) => ({ ...f, ...sanitizeSavedFilter(f, viewer) })) : []),
    [held, viewer, store.items],
  );

  const need = useCallback(() => {
    if (!viewer || !scope) throw new Error('Not signed in.');
    return { viewer, scope };
  }, [viewer, scope]);

  const save = useCallback(
    (name: string, content: SavedFilterContent) => {
      const { viewer: v, scope: s } = need();
      return store.save(v, s, name, content);
    },
    [need, store],
  );
  const rename = useCallback(
    (filterId: string, name: string) => {
      const { viewer: v, scope: s } = need();
      return store.rename(v, s, filterId, name);
    },
    [need, store],
  );
  const remove = useCallback(
    (filterId: string) => {
      const { viewer: v, scope: s } = need();
      return store.remove(v, s, filterId);
    },
    [need, store],
  );

  return { viewer, items, ready: held, save, rename, remove };
}
