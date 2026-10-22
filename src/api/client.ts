// The one HTTP client for `/api/v1` (01 §0, 02 §5.2–§5.3).
import axios, { type AxiosResponse } from 'axios';

import { API_BASE_URL } from '@/config/env';
import { SESSION_ENDED_MESSAGE, isSessionExpired, useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { ApiError } from '@/types';
import { ApiClientError } from './errors';
import { queryClient } from './queryClient';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Public endpoints (SYS-1, AUTH-1) are sent without the Authorization header (02 §3). */
    skipAuth?: boolean;
  }
}

/** `{ "message": "…" }` — the success body of several write endpoints (01: AUTH-3, NTF-3/4, TSK-4, KB-5). */
export interface MessageResponse {
  message: string;
}

export const DEFAULT_TIMEOUT_MS = 30_000; // 02 §5.2
export const UPLOAD_TIMEOUT_MS = 120_000;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  // Never send or accept cookies: an `sd_session` cookie overrides the Bearer header server-side (02 §2 #5).
  withCredentials: false,
  headers: { Accept: 'application/json' },
});

// ── Session end (401, 8 h expiry, sign-out) ──────────────────

const UNAUTHORIZED_MESSAGES: Record<string, string> = {
  'Session expired': SESSION_ENDED_MESSAGE,
  'Account deactivated': 'Your account is disabled. Contact IT.',
};

/**
 * Wipe everything tied to the session (02 §5.3 step 2, §5.5): token, cached server data, UI state.
 * Flipping the auth store to logged out makes RootNavigator switch to the Login stack.
 * There is no refresh token, so there is nothing to retry.
 */
export async function endSession(message: string | null): Promise<void> {
  queryClient.clear();
  useUiStore.getState().reset();
  await useAuthStore.getState().clearSession(message);
}

function handleUnauthorized(serverMessage: string): void {
  // De-duplicate: the first 401 of a burst flips isAuthenticated synchronously; later ones stop here.
  if (!useAuthStore.getState().isAuthenticated) return;
  void endSession(UNAUTHORIZED_MESSAGES[serverMessage] ?? SESSION_ENDED_MESSAGE);
}

// ── Response checks ──────────────────────────────────────────

function isJsonResponse(response: AxiosResponse): boolean {
  const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
  return contentType.includes('application/json') || contentType.includes('+json');
}

function isApiErrorBody(data: unknown): data is ApiError {
  return typeof data === 'object' && data !== null && typeof (data as ApiError).error === 'string';
}

function fallbackMessage(status: number): string {
  if (status === 429) return 'Too many requests, try again shortly';
  if (status === 401) return 'Unauthorized';
  if (status >= 500) return 'Internal server error';
  return `Unexpected response from the server (HTTP ${status})`;
}

/** Map anything thrown by axios into ApiClientError carrying the documented `{ error, details? }` shape. */
function normaliseError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;

  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (response) {
      const { status } = response;
      if (isJsonResponse(response) && isApiErrorBody(response.data)) {
        const { error: message, details } = response.data;
        const body: ApiError = details && typeof details === 'object' ? { error: message, details } : { error: message };
        return new ApiClientError('http', status, body);
      }
      // Plain-text 429 from express-rate-limit, Express HTML 404 on unknown writes, IIS error pages (01 §0.2, §0.5).
      return new ApiClientError('not-json', status, { error: fallbackMessage(status) });
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiClientError('timeout', null, { error: 'Request timed out' });
    }
    return new ApiClientError('network', null, { error: 'Network error' });
  }

  return new ApiClientError('client', null, {
    error: error instanceof Error ? error.message : 'Unexpected error',
  });
}

// ── Interceptors ─────────────────────────────────────────────

apiClient.interceptors.request.use((config) => {
  if (config.skipAuth) return config;

  const { token, issuedAt } = useAuthStore.getState();
  if (!token) return config;

  // 8-hour hard expiry: don't send a token we already know is dead (02 §5.4).
  if (issuedAt === null || isSessionExpired(issuedAt)) {
    void endSession(SESSION_ENDED_MESSAGE);
    throw new ApiClientError('client', 401, { error: 'Session expired' });
  }

  config.headers.set('Authorization', `Bearer ${token}`); // capital B, one space (02 §3)
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    // CRITICAL (00 §2, 01 §0.5, 05 B.8): in production an unknown GET under /api returns
    // 200 text/html (the SPA's index.html). Anything that is not JSON is an error, even on a 200.
    if (!isJsonResponse(response)) {
      throw new ApiClientError('not-json', response.status, { error: 'Unexpected non-JSON response from the server' });
    }
    // A JSON content-type is not enough: axios silently hands back the raw text when the body does not
    // parse (silentJSONParsing), so an HTML page labelled application/json would arrive as a string.
    // Every documented /api/v1 success body is an object or an array (01), never a bare string or null.
    if (typeof response.data !== 'object' || response.data === null) {
      throw new ApiClientError('not-json', response.status, { error: 'Response body is not a JSON object or array' });
    }
    return response;
  },
  (error: unknown) => {
    const normalised = normaliseError(error);
    // Only the endpoint's own JSON `{ error }` answer ends the session (02 §5.3 step 2, §7.4). A non-JSON 401 is an
    // IIS/ARR or captive-portal page, not the backend rejecting the token: it surfaces as a `not-json` error instead.
    // A `client` 401 (8 h expiry) already ended the session in the request interceptor.
    if (normalised.status === 401 && normalised.kind === 'http') {
      handleUnauthorized(normalised.body.error);
    }
    return Promise.reject(normalised);
  },
);
