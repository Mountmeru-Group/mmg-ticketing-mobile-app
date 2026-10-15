// Knowledge base display rules (05 B.26, C.15). Pure functions.
// The KB routes never authenticate, so the server cannot tell staff from anyone else: the app shows published,
// public content only, for every role. Hiding non-public rows here is that display rule — not a security fix.
import type { KBArticle, KBArticleListItem, KBCategory } from '@/types';

export interface KbCategoryOption {
  id: string;
  name: string;
  /** 0 = top level, 1 = child (KB-1 returns one level of `children`). */
  depth: number;
}

/**
 * KB-1 returns top-level categories with their children and does not filter `isPublic` (01 KB-1). Keep public ones
 * only — a child of a non-public parent is dropped with its parent — in the server's order.
 */
export function publicKbCategories(categories: readonly KBCategory[]): KbCategoryOption[] {
  const out: KbCategoryOption[] = [];
  for (const top of categories) {
    if (!top || top.isPublic !== true || typeof top.id !== 'string') continue;
    out.push({ id: top.id, name: top.name, depth: 0 });
    for (const child of Array.isArray(top.children) ? top.children : []) {
      if (!child || child.isPublic !== true || typeof child.id !== 'string') continue;
      out.push({ id: child.id, name: child.name, depth: 1 });
    }
  }
  return out;
}

/** An article the app may show: published AND public (drafts are reachable by slug, 01 KB-4). */
export function isReadableArticle(article: Pick<KBArticle | KBArticleListItem, 'isPublished' | 'isPublic'>): boolean {
  return article.isPublished === true && article.isPublic === true;
}
