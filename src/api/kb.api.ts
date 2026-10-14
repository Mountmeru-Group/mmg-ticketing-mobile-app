// Knowledge base endpoints (01 §10.3). Moved into the MVP as M14/M15 (04, 08 §5.1); 01 still labels them P2.
// ⚠ These routes do not authenticate (05 B.26, C.15). The app sends Bearer anyway, so it keeps working once
// A7 adds auth, and shows published, public articles only. Never send `published` (drafts are exposed).
import type { KBArticle, KBArticleListItem, KBCategory, KBSearchResult, Paginated } from '@/types';
import { apiClient, type MessageResponse } from './client';
import { seg, toPositiveInt } from './helpers';

/** KB-1 — GET /api/v1/kb/categories. Top-level with `children`. Hide `isPublic: false` in the UI. */
export async function listKbCategories(): Promise<KBCategory[]> {
  const res = await apiClient.get<KBCategory[]>('/kb/categories');
  return res.data;
}

export interface KbArticleListQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  /** Exact, case-sensitive. */
  tag?: string;
  // No `search` (ignored by KB-2 — use searchKb) and never `published`.
}

/** KB-2 — GET /api/v1/kb/articles. Pagination shape (a), `publishedAt` desc, published only. */
export async function listKbArticles(query: KbArticleListQuery = {}): Promise<Paginated<KBArticleListItem>> {
  const params = {
    page: toPositiveInt(query.page, 1),
    limit: Math.min(toPositiveInt(query.limit, 20), 100),
    categoryId: query.categoryId,
    tag: query.tag,
  };
  const res = await apiClient.get<Paginated<KBArticleListItem>>('/kb/articles', { params });
  return res.data;
}

/**
 * KB-3 — GET /api/v1/kb/search?q=
 * Published + public only, max 20. Under 2 characters the server returns [] — skip the request.
 */
export async function searchKb(q: string): Promise<KBSearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const res = await apiClient.get<KBSearchResult[]>('/kb/search', { params: { q: term } });
  return res.data;
}

/**
 * KB-4 — GET /api/v1/kb/articles/:slug (by SLUG, not id). Increments viewCount.
 * If `isPublished` is false, show "not available" (drafts are reachable by slug, 01 KB-4).
 */
export async function getKbArticle(slug: string): Promise<KBArticle> {
  const res = await apiClient.get<KBArticle>(`/kb/articles/${seg(slug)}`);
  return res.data;
}

/**
 * KB-5 — POST /api/v1/kb/articles/:id/helpful (by ID). No body.
 * No server de-duplication: allow one vote per article per device (01 KB-5).
 */
export async function markKbArticleHelpful(id: string): Promise<MessageResponse> {
  const res = await apiClient.post<MessageResponse>(`/kb/articles/${seg(id)}/helpful`);
  return res.data;
}
