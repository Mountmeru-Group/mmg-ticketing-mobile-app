// Saved ticket filters on this phone (2026-11-17). The rules are in src/utils/saved-filters.ts; this file reads and
// writes them. NO backend call: they never sync with the web portal.
// - One SecureStore entry per user per environment (savedFiltersKey). Not secret; SecureStore only because AsyncStorage
//   is not installed (as auth.store's stored user). They survive restarts and sign-outs, and are never offered to
//   another user or in another environment: this store holds one scope at a time and every read checks it.
// - A sign-out and the environment switch reset() the copy in memory only (client.ts endSession, environmentSwitch.ts).
// - Every entry is cut down to the viewer's role when it is read (parseSavedFilters); if anything was cut or dropped,
//   the cleaned list is written back, so a filter does not outlive its role's permissions on the phone either.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import {
  SavedFilterError, cleanSavedFilterName, newSavedFilterId, parseSavedFilters, sameScope, sanitizeSavedFilter,
  savedFilterNameProblem, savedFilterRecord, savedFilterSaveProblem, savedFiltersKey,
  type SavedFilterContent, type SavedFilterScope, type SavedFilterViewer, type SavedTicketFilter,
} from '@/utils/saved-filters';

const COULD_NOT_STORE = "Couldn't save that on this phone. Try again.";

interface SavedFiltersState {
  /** Whose list `items` is, or null before the first read. */
  scope: SavedFilterScope | null;
  items: readonly SavedTicketFilter[];

  /** Read the list for this viewer in this environment (a no-op when it is already the one held). */
  load: (viewer: SavedFilterViewer, scope: SavedFilterScope) => Promise<void>;
  /** Save the content under `name`. Throws SavedFilterError with the reason when refused. */
  save: (viewer: SavedFilterViewer, scope: SavedFilterScope, name: string, content: SavedFilterContent) => Promise<SavedTicketFilter>;
  rename: (viewer: SavedFilterViewer, scope: SavedFilterScope, id: string, name: string) => Promise<void>;
  remove: (viewer: SavedFilterViewer, scope: SavedFilterScope, id: string) => Promise<void>;
  /** Forget the copy in memory (sign-out, environment switch). The phone's entries stay. */
  reset: () => void;
}

/** Bumped by every load and reset, so a read that finishes after the scope changed is thrown away. */
let generation = 0;

async function read(scope: SavedFilterScope, viewer: SavedFilterViewer): Promise<SavedTicketFilter[]> {
  const key = savedFiltersKey(scope);
  if (!key) return [];
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(key);
  } catch {
    return []; // Keystore could not decrypt (a device restore): as if none were saved.
  }
  const { items, changed } = parseSavedFilters(raw, scope, viewer);
  if (changed) await write(scope, items).catch(() => undefined);
  return items;
}

async function write(scope: SavedFilterScope, items: readonly SavedTicketFilter[]): Promise<void> {
  const key = savedFiltersKey(scope);
  if (!key) throw new SavedFilterError("Saved filters can't be kept for this account on this phone.");
  if (items.length === 0) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, JSON.stringify(items));
}

export const useSavedFiltersStore = create<SavedFiltersState>()((set, get) => {
  /** The list for this scope, read first if another scope (or none) is held. */
  async function current(viewer: SavedFilterViewer, scope: SavedFilterScope): Promise<readonly SavedTicketFilter[]> {
    if (viewer.id !== scope.userId) throw new SavedFilterError('Saved filters belong to the person signed in.');
    if (!sameScope(get().scope, scope)) await get().load(viewer, scope);
    return get().items;
  }

  async function commit(scope: SavedFilterScope, items: SavedTicketFilter[]): Promise<void> {
    try {
      await write(scope, items);
    } catch (error) {
      throw error instanceof SavedFilterError ? error : new SavedFilterError(COULD_NOT_STORE);
    }
    if (sameScope(get().scope, scope)) set({ items });
  }

  return {
    scope: null,
    items: [],

    load: async (viewer, scope) => {
      if (viewer.id !== scope.userId) return;
      const mine = ++generation;
      const items = await read(scope, viewer);
      if (mine !== generation) return;
      set({ scope, items });
    },

    save: async (viewer, scope, name, content) => {
      const items = await current(viewer, scope);
      const clean = sanitizeSavedFilter(content, viewer);
      const problem = savedFilterSaveProblem([...items], clean) ?? savedFilterNameProblem(name, items);
      if (problem) throw new SavedFilterError(problem);
      const saved = savedFilterRecord({ id: newSavedFilterId(), name, scope, createdAt: Date.now() }, clean);
      await commit(scope, [...items, saved]);
      return saved;
    },

    rename: async (viewer, scope, id, name) => {
      const items = await current(viewer, scope);
      if (!items.some((f) => f.id === id)) throw new SavedFilterError('That saved filter no longer exists.');
      const problem = savedFilterNameProblem(name, items, id);
      if (problem) throw new SavedFilterError(problem);
      await commit(scope, items.map((f) => (f.id === id ? { ...f, name: cleanSavedFilterName(name) } : f)));
    },

    remove: async (viewer, scope, id) => {
      const items = await current(viewer, scope);
      await commit(scope, items.filter((f) => f.id !== id));
    },

    reset: () => {
      generation++;
      set({ scope: null, items: [] });
    },
  };
});
