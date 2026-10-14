// One adapter for the pagination shapes in 01 §0.3 (CLAUDE.md rule 7).
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
