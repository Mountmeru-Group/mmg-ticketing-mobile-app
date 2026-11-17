// The phone-only saved filters of versionCode 6 (2026-11-17, first brief), one SecureStore entry per user per environment.
// Since saved filters became the Service Desk's saved views (second brief, same day), these are NOT uploaded and never
// applied (docs/web-system/16-SAVED-VIEWS.md §9): the Filters sheet lists them once, by name and what each held, and
// they are deleted from the phone only when the person taps Dismiss. So nothing is lost without the person seeing it.
import * as SecureStore from 'expo-secure-store';

import { legacySavedFiltersKey, parseLegacySavedFilters, type LegacySavedFilter } from '@/utils/saved-filters';

/** This person's old list in this environment, readable entries only. Never throws: an unreadable Keystore is none. */
export async function readLegacySavedFilters(environment: string, userId: string): Promise<LegacySavedFilter[]> {
  const key = legacySavedFiltersKey(environment, userId);
  if (!key) return [];
  try {
    return parseLegacySavedFilters(await SecureStore.getItemAsync(key));
  } catch {
    return [];
  }
}

/** Dismiss: delete the old list from the phone. */
export async function discardLegacySavedFilters(environment: string, userId: string): Promise<void> {
  const key = legacySavedFiltersKey(environment, userId);
  if (key) await SecureStore.deleteItemAsync(key);
}
