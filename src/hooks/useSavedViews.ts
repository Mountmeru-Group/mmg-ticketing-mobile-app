// Saved filters = the Service Desk's saved ticket views (2026-11-17), the same list as the web portal's "Views".
// Requests: src/api/savedViews.api.ts (SVW-1..4). Rules: src/utils/saved-filters.ts. Contract: 16-SAVED-VIEWS.md.
// - SVW-1 loads while the Filters sheet is open. staleTime 60 s (UAT shares Production's hardware, 00 §3), and it is
//   re-read when the sheet opens only once that has passed, so a view saved on the web shows up without a request per
//   visit. The whole cache, these views included, is cleared on sign-out and on the environment switch.
// - Writes run only when tapped, never retried, refused offline before anything is sent (requireOnline). Never
//   optimistic: the list changes only with the server's answer. After a failure that may have reached the server
//   (network, timeout, 5xx), the list is re-read, so a view that did save appears and none is shown that did not.
// - The options are plain objects built here (savedViewsQuery, savedViewMutations) so tests run them under Node with the
//   real QueryClient; the hooks only bind them to React.
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { assertArray, assertObject, checkFields } from '@/api/drift';
import { ApiClientError, isSessionEndedError } from '@/api/errors';
import { MIN_STALE_TIME_MS } from '@/api/queryClient';
import { SAVED_VIEW_SPEC } from '@/api/responseSpecs';
import { createTicketView, deleteSavedView, listTicketViews, renameSavedView } from '@/api/savedViews.api';
import { getUser } from '@/api/users.api';
import { useAuthStore } from '@/store/auth.store';
import { useEnvironmentStore } from '@/store/environment.store';
import { discardLegacySavedFilters, readLegacySavedFilters } from '@/store/legacySavedFilters';
import type { SavedView, SavedViewFilters, UserProfile } from '@/types';
import { formatDisplayName } from '@/utils/format';
import { ticketListFilters } from '@/utils/permissions';
import {
  cleanSavedFilterName, savedFilterNameProblem, type LegacySavedFilter, type SavedFilterViewer, type SavedViewNames,
} from '@/utils/saved-filters';
import { useCategories, useTeams } from './useLookups';
import { queryKeys } from './queryKeys';
import { refuse, requireOnline, wasRefusedOnDevice } from './writeGuards';

/** At least the app-wide floor (60 s): never lower. */
export const SAVED_VIEWS_STALE_TIME_MS = MIN_STALE_TIME_MS;
/** Names change rarely: as the lookups (01 LKP-1). */
const NAMES_STALE_TIME_MS = 10 * 60_000;

/** What the person reads when a view was deleted elsewhere before their rename reached the server. */
export const SAVED_VIEW_GONE = "That saved filter isn't on the Service Desk any more (deleted on the web, or on another phone).";

function isViewRow(value: unknown): value is SavedView {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<SavedView>;
  return typeof row.id === 'string' && row.id !== '' && typeof row.name === 'string';
}

function checkedView(endpoint: string, value: unknown): SavedView {
  assertObject<SavedView>(endpoint, value);
  if (!isViewRow(value)) throw new ApiClientError('shape', 200, { error: `Unexpected response shape from ${endpoint}` });
  checkFields(endpoint, value, SAVED_VIEW_SPEC);
  return value;
}

/** SVW-1's query: the signed-in person's ticket views, newest first, as the web lists them. */
export function savedViewsQuery() {
  return {
    queryKey: queryKeys.savedViews.tickets(),
    queryFn: async (): Promise<SavedView[]> => {
      const res = await listTicketViews();
      assertArray<SavedView>('SVW-1', res);
      checkFields('SVW-1', res[0], SAVED_VIEW_SPEC, '[0].');
      return res.filter(isViewRow);
    },
    staleTime: SAVED_VIEWS_STALE_TIME_MS,
    // The one exception to "no refetch on mount" (queryClient.ts): another client (the web) changes this list. Only when
    // the cached copy is older than the stale time.
    refetchOnMount: true,
  } as const;
}

export function useSavedTicketViews({ enabled }: { enabled: boolean }) {
  const signedIn = useAuthStore((s) => !!s.user);
  return useQuery({ ...savedViewsQuery(), enabled: enabled && signedIn });
}

export interface CreateSavedViewVariables { name: string; filters: SavedViewFilters; existing: readonly SavedView[] }
export interface RenameSavedViewVariables { id: string; name: string; existing: readonly SavedView[] }
export interface DeleteSavedViewVariables { id: string }

/** The three writes' options for this QueryClient. */
export function savedViewMutations(queryClient: QueryClient) {
  const key = queryKeys.savedViews.tickets();
  const setList = (update: (list: SavedView[]) => SavedView[]) =>
    queryClient.setQueryData<SavedView[]>(key, (list) => (list ? update(list) : list));
  /** Re-read after a write that may or may not have reached the server. Not after a refusal on the phone or a 401. */
  const reread = (error: unknown) => {
    if (wasRefusedOnDevice(error) || isSessionEndedError(error)) return;
    void queryClient.invalidateQueries({ queryKey: key });
  };

  return {
    /** SVW-2 "Save these filters". `existing`: the list on screen, for the name rules. */
    create: {
      mutationFn: async ({ name, filters, existing }: CreateSavedViewVariables): Promise<SavedView> => {
        requireOnline();
        const problem = savedFilterNameProblem(name, existing);
        if (problem) throw refuse(problem);
        return checkedView('SVW-2', await createTicketView(cleanSavedFilterName(name), filters));
      },
      onSuccess: (view: SavedView) => {
        queryClient.setQueryData<SavedView[]>(key, (list) => [view, ...(list ?? []).filter((v) => v.id !== view.id)]);
      },
      onError: reread,
    },
    /** SVW-3 Rename: `{ name }` only, so the view's filters (even ones the app cannot show) are never rewritten. */
    rename: {
      mutationFn: async ({ id, name, existing }: RenameSavedViewVariables): Promise<SavedView> => {
        requireOnline();
        const problem = savedFilterNameProblem(name, existing, id);
        if (problem) throw refuse(problem);
        try {
          return checkedView('SVW-3', await renameSavedView(id, cleanSavedFilterName(name)));
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 404) {
            setList((list) => list.filter((v) => v.id !== id));
            throw new ApiClientError('client', 404, { error: SAVED_VIEW_GONE });
          }
          throw error;
        }
      },
      onSuccess: (view: SavedView) => setList((list) => list.map((v) => (v.id === view.id ? view : v))),
      onError: reread,
    },
    /** SVW-4 Delete. A view already gone (404) is taken off the list, and the person is told. */
    remove: {
      mutationFn: async ({ id }: DeleteSavedViewVariables): Promise<{ alreadyGone: boolean }> => {
        requireOnline();
        try {
          await deleteSavedView(id);
          return { alreadyGone: false };
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 404) return { alreadyGone: true };
          throw error;
        }
      },
      onSuccess: (_result: { alreadyGone: boolean }, { id }: DeleteSavedViewVariables) => setList((list) => list.filter((v) => v.id !== id)),
      onError: reread,
    },
  };
}

export function useCreateSavedView() {
  return useMutation(savedViewMutations(useQueryClient()).create);
}

export function useRenameSavedView() {
  return useMutation(savedViewMutations(useQueryClient()).rename);
}

export function useDeleteSavedView() {
  return useMutation(savedViewMutations(useQueryClient()).remove);
}

/**
 * Names for the ids the views hold, from the lookups the Filters sheet already uses: categories (LKP-1), groups (LKP-2)
 * and technicians (USR-1), each only for a role that may filter by it and only while a view holds one.
 */
export function useSavedViewNames(views: readonly SavedView[] | undefined): SavedViewNames {
  const user = useAuthStore((s) => s.user);
  const allowed = useMemo(() => (user ? ticketListFilters(user) : []), [user]);
  const ids = useMemo(() => {
    const out = { category: new Set<string>(), group: new Set<string>(), technician: new Set<string>() };
    for (const view of views ?? []) {
      const f = (typeof view.filters === 'object' && view.filters !== null ? view.filters : {}) as SavedViewFilters;
      if (allowed.includes('category') && typeof f.categoryId === 'string' && f.categoryId) out.category.add(f.categoryId);
      if (allowed.includes('group') && typeof f.teamId === 'string' && f.teamId) out.group.add(f.teamId);
      const who = f.assignedToId;
      if (allowed.includes('technician') && typeof who === 'string' && who && who !== 'unassigned' && who !== user?.id) {
        out.technician.add(who);
      }
    }
    return { category: [...out.category], group: [...out.group], technician: [...out.technician].sort() };
  }, [views, allowed, user?.id]);

  const categories = useCategories({ enabled: ids.category.length > 0 });
  const teams = useTeams({ enabled: ids.group.length > 0, includeInactive: true });
  const people = useQueries({
    queries: ids.technician.map((id) => ({
      queryKey: queryKeys.users.profile(id),
      queryFn: async (): Promise<UserProfile> => {
        const res = await getUser(id);
        assertObject<UserProfile>('USR-1', res);
        return res;
      },
      staleTime: NAMES_STALE_TIME_MS,
      retry: false,
    })),
  });

  // Rebuilt each render (a handful of views): useQueries hands back a new array every time anyway.
  const byId = new Map<string, string>();
  for (const { data } of people) {
    if (data && typeof data.id === 'string') byId.set(data.id, formatDisplayName(data.displayName) || data.email);
  }
  return {
    category: (id) => categories.data?.find((c) => c.id === id)?.name ?? null,
    group: (id) => teams.data?.find((t) => t.id === id)?.name ?? null,
    technician: (id) => (id === user?.id ? formatDisplayName(user.displayName) || 'Me' : (byId.get(id) ?? null)),
  };
}

/**
 * The phone-only filters versionCode 6 kept for this person in this environment (never uploaded; 16-SAVED-VIEWS §9),
 * and Dismiss, which deletes them from the phone.
 */
export function useLegacySavedFilters(viewer: SavedFilterViewer | null) {
  const environment = useEnvironmentStore((s) => s.environment);
  const userId = viewer?.id ?? null;
  const [items, setItems] = useState<LegacySavedFilter[]>([]);

  useEffect(() => {
    let live = true;
    setItems([]);
    if (userId) void readLegacySavedFilters(environment, userId).then((found) => live && setItems(found));
    return () => {
      live = false;
    };
  }, [environment, userId]);

  const dismiss = useCallback(async () => {
    if (!userId) return;
    await discardLegacySavedFilters(environment, userId);
    setItems([]);
  }, [environment, userId]);

  return { items, dismiss };
}
