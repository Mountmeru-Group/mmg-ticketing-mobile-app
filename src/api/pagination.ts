// One adapter for the pagination shapes in 01 §0.3 (CLAUDE.md rule 7), plus (e), the analytics pages (2026-11-26).
// Shape (d), a plain array, needs no adapter.
import type { ActivityItem, ActivityPage, Paginated, SimplePage } from '@/types';

export interface NormalisedPage<T> {
  items: T[];
  page: number;
  hasNext: boolean;
  total: number;
}

/** (c) Ticket activity (TKT-7). `total` counts audit entries only; comments repeat on EVERY page (05 B.12). */
export function normalisePage(res: ActivityPage): NormalisedPage<ActivityItem>;
/** (a) Standard (TKT-1, NTF-1, KB-2) and (b) hand-rolled (approvals list, SCR-4). */
export function normalisePage<T>(res: Paginated<T> | SimplePage<T>): NormalisedPage<T>;
export function normalisePage<T>(
  res: Paginated<T> | SimplePage<T> | ActivityPage,
): NormalisedPage<T> | NormalisedPage<ActivityItem> {
  if ('items' in res) {
    return { items: res.items, page: res.page, hasNext: res.page < res.auditPages, total: res.auditTotal };
  }
  if ('hasNext' in res) {
    return { items: res.data, page: res.page, hasNext: res.hasNext, total: res.total };
  }
  return { items: res.data, page: res.page, hasNext: res.page * res.limit < res.total, total: res.total };
}

/**
 * (e) Analytics pages (ANL-2 `{ page, limit, total, rows }`, ANL-3 AUD-1's shape; NOT YET DEPLOYED, 01 §10.7), after
 * src/api/analytics.api.ts has read them tolerantly: the rows that could be read, and the counters only where the server
 * sent a number. `page` and `limit` fall back to what the app asked for.
 */
export interface LoosePage<T> {
  rows: T[];
  /** False when the body had no array of rows at all: then there is no list to show, not an empty one. */
  listed: boolean;
  page: number;
  limit: number;
  /** null: the server sent no usable total. */
  total: number | null;
}

/**
 * Shape (e). With a total: more pages while `page * limit < total`. Without one, a full page means there may be more,
 * a short page that there is not; an empty page ends the list either way.
 */
export function normaliseLoosePage<T>(res: LoosePage<T>): { items: T[]; page: number; hasNext: boolean; total: number | null } {
  const hasNext = res.listed && res.rows.length > 0
    && (res.total !== null ? res.page * res.limit < res.total : res.rows.length >= res.limit);
  return { items: res.rows, page: res.page, hasNext, total: res.total };
}

/** Merge activity pages, de-duplicating by `_type` + `id` (comments are returned on every page, 05 B.12). */
export function mergeActivityItems(pages: readonly ActivityItem[][]): ActivityItem[] {
  const seen = new Set<string>();
  const merged: ActivityItem[] = [];
  for (const page of pages) {
    for (const item of page) {
      const key = `${item._type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}
