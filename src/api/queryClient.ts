import { QueryClient } from '@tanstack/react-query';

import { ApiClientError } from './errors';

const MAX_GET_RETRIES = 2;

/**
 * Retry policy (02 §5.3; 05 B.32):
 * - Queries are GETs only in this app, so they may retry: at most twice, with exponential backoff,
 *   and only for 429, 5xx and transient network failures.
 * - Never retry 4xx, and never retry a 200 that turned out to be HTML (`not-json`).
 */
function shouldRetryGet(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_GET_RETRIES) return false;
  if (!(error instanceof ApiClientError)) return false;
  if (error.kind === 'network' || error.kind === 'timeout') return true;
  return error.status === 429 || (error.status !== null && error.status >= 500);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryGet,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 30_000,
    },
    mutations: {
      // Never auto-retry POST/PUT/DELETE: none of them is idempotent (duplicate tickets/comments, 02 §5.3).
      retry: false,
    },
  },
});
