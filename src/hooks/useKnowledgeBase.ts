// M14/M15 Knowledge base — KB-1 categories, KB-2 articles, KB-3 search, KB-4 article, KB-5 helpful vote (01 §10.3).
// Read and vote only: authoring is out of scope. Published, public content only (05 B.26) — `published` is never sent.
// The KB routes don't check the token today (05 C.15); the Bearer header is sent anyway so this keeps working when
// ask A7 adds auth.
//
// "Was this helpful?" — KB-5 has no server de-duplication (01 KB-5), so the app allows one vote per article per
// device. The flag is kept in expo-secure-store (the only persistent storage installed; it holds no secret) under
// `mmg.kb.helpful.<articleId>`, and survives sign-out on purpose: it is per device, not per session.
import * as SecureStore from 'expo-secure-store';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { assertArray, assertObject, assertPaginated, checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { getKbArticle, listKbArticles, listKbCategories, markKbArticleHelpful, searchKb } from '@/api/kb.api';
import { normalisePage } from '@/api/pagination';
import {
  KB_ARTICLE_ITEM_SPEC, KB_ARTICLE_SPEC, KB_CATEGORY_SPEC, KB_SEARCH_SPEC,
} from '@/api/responseSpecs';
import type { KBArticle, KBArticleListItem, KBCategory, KBSearchResult, Paginated } from '@/types';
import { isReadableArticle, publicKbCategories } from '@/utils/kb';
import { queryKeys } from './queryKeys';
import { refuse, requireOnline, wasRefusedOnDevice } from './writeGuards';

export const KB_PAGE_SIZE = 20;
const KB_STALE_TIME_MS = 5 * 60_000; // articles change rarely; still ≥ 60 s

export function useKbCategories() {
  return useQuery({
    queryKey: queryKeys.kb.categories(),
    queryFn: async (): Promise<KBCategory[]> => {
      const res = await listKbCategories();
      assertArray<KBCategory>('KB-1', res);
      checkFields('KB-1', res[0], KB_CATEGORY_SPEC, '[0].');
      return res;
    },
    select: publicKbCategories,
    staleTime: KB_STALE_TIME_MS,
  });
}

/** KB-2, 20 per page, newest first. `null` = every category. Non-public rows are dropped on display. */
export function useKbArticles(categoryId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => queryKeys.kb.articles(categoryId), [categoryId]);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<Paginated<KBArticleListItem>> => {
      const res = await listKbArticles({ page: pageParam, limit: KB_PAGE_SIZE, categoryId: categoryId ?? undefined });
      assertPaginated<KBArticleListItem>('KB-2', res);
      checkFields('KB-2', res.data[0], KB_ARTICLE_ITEM_SPEC, 'data[0].');
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (normalisePage(last).hasNext ? last.page + 1 : undefined),
    staleTime: KB_STALE_TIME_MS,
  });

  const articles = useMemo(() => {
    const seen = new Set<string>();
    const rows: KBArticleListItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const a of page.data) {
        if (!a || typeof a.id !== 'string' || seen.has(a.id) || !isReadableArticle(a)) continue;
        seen.add(a.id);
        rows.push(a);
      }
    }
    return rows;
  }, [query.data]);

  /** Pull-to-refresh: first page only (one request). */
  const refreshFirstPage = useCallback(async () => {
    queryClient.setQueryData<InfiniteData<Paginated<KBArticleListItem>, number>>(queryKey, (data) =>
      data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
    );
    await query.refetch();
  }, [queryClient, queryKey, query.refetch]);

  return { ...query, articles, refreshFirstPage };
}

/** KB-3 — pass an already-debounced term. Under 2 characters nothing is requested (the server answers [] anyway). */
export function useKbSearch(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: queryKeys.kb.search(q),
    queryFn: async (): Promise<KBSearchResult[]> => {
      const res = await searchKb(q);
      assertArray<KBSearchResult>('KB-3', res);
      checkFields('KB-3', res[0], KB_SEARCH_SPEC, '[0].');
      return res.filter((r) => r && typeof r.slug === 'string');
    },
    enabled: q.length >= 2,
    staleTime: KB_STALE_TIME_MS,
  });
}

/** KB-4 by slug. Each request adds a view on the server, so the cached copy is reused (no refetch on reopen). */
export function useKbArticle(slug: string) {
  return useQuery({
    queryKey: queryKeys.kb.article(slug),
    queryFn: async (): Promise<KBArticle> => {
      const res = await getKbArticle(slug);
      assertObject<KBArticle>('KB-4', res);
      if (typeof res.id !== 'string') throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from KB-4' });
      checkFields('KB-4', res, KB_ARTICLE_SPEC);
      return res;
    },
    enabled: !!slug,
    staleTime: KB_STALE_TIME_MS,
  });
}

// ── Helpful vote (KB-5) ──────────────────────────────────────

/** SecureStore keys allow [A-Za-z0-9._-] only; anything else is not persisted (the vote still counts once per screen). */
function voteKey(articleId: string): string | null {
  return /^[A-Za-z0-9._-]{1,100}$/.test(articleId) ? `mmg.kb.helpful.${articleId}` : null;
}

/** Whether this device already voted for the article (read from device storage — not a server call). */
export function useKbVoted(articleId: string | undefined) {
  const [voted, setVoted] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const key = articleId ? voteKey(articleId) : null;
    if (!key) {
      setVoted(false);
      return;
    }
    SecureStore.getItemAsync(key)
      .then((v) => alive && setVoted(v === '1'))
      .catch(() => alive && setVoted(false));
    return () => {
      alive = false;
    };
  }, [articleId]);
  return { voted, markVoted: () => setVoted(true) };
}

export function useKbHelpfulVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ article, alreadyVoted }: { article: KBArticle; alreadyVoted: boolean }) => {
      requireOnline();
      if (alreadyVoted) throw refuse('You already marked this article as helpful on this device.');
      if (!isReadableArticle(article)) throw refuse('This article is not available.');
      const res = await markKbArticleHelpful(article.id);
      const key = voteKey(article.id);
      if (key) await SecureStore.setItemAsync(key, '1').catch(() => undefined);
      return res;
    },
    onSuccess: (_res, { article }) => {
      // KB-5 only answers a message; the server added exactly one vote (no de-duplication), so the cached count is
      // moved by one rather than re-fetching KB-4 (which would also add a view).
      queryClient.setQueryData<KBArticle>(queryKeys.kb.article(article.slug), (a) =>
        a ? { ...a, helpfulCount: (typeof a.helpfulCount === 'number' ? a.helpfulCount : 0) + 1 } : a,
      );
    },
    onSettled: (_res, error) => {
      if (wasRefusedOnDevice(error)) return;
      // List rows carry helpfulCount too: mark them stale (no request).
      void queryClient.invalidateQueries({ queryKey: queryKeys.kb.allArticles(), refetchType: 'none' });
    },
  });
}
