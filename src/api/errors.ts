import type { ApiError } from '@/types';

/**
 * Why a request failed.
 * - `http`     — the server answered with a non-2xx status and a JSON `{ error }` body (01 §0.2).
 * - `not-json` — the response was not JSON. Includes the 200 `text/html` SPA fallback for unknown GETs,
 *                Express's HTML 404 for unknown writes, and the plain-text 429 body (01 §0.2, §0.5; 05 B.8).
 * - `network`  — no response at all (offline, DNS, IIS restart at 03:00 — 05 B.32).
 * - `timeout`  — no response within the client timeout.
 * - `client`   — rejected on the device before sending (validation, expired session).
 * - `shape`    — valid JSON, but not the documented envelope (e.g. an object where 01 promises an array).
 *                Rejected so a screen never renders something it does not understand (src/api/drift.ts).
 */
export type ApiErrorKind = 'http' | 'not-json' | 'network' | 'timeout' | 'client' | 'shape';

/**
 * Every rejection from src/api/ is an ApiClientError whose `body` is the documented error envelope
 * (`ApiError`, 03 §C / 01 §0.2), so screens handle one shape only.
 * Deliberately carries no request config: axios errors include headers, i.e. the Bearer token (02 §5.1).
 */
export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, or null when no response was received / the request never left the device. */
  readonly status: number | null;
  readonly body: ApiError;

  constructor(kind: ApiErrorKind, status: number | null, body: ApiError) {
    super(body.error);
    this.name = 'ApiClientError';
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
}

export function clientError(message: string): ApiClientError {
  return new ApiClientError('client', null, { error: message });
}

/** User-facing message for an error (02 §5.3; 01 §0.2 "map 500 to Something went wrong"). */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'Something went wrong';
  switch (error.kind) {
    case 'network':
      return "Can't reach the Service Desk. Check your connection and try again.";
    case 'timeout':
      return 'The Service Desk took too long to respond. Try again.';
    case 'client':
      return error.body.error;
    default:
      break;
  }
  if (error.status === 403) return "You don't have permission to do that";
  if (error.status === 429) return 'Too many requests, try again shortly';
  if (error.status !== null && error.status >= 500) return 'Something went wrong';
  if (error.kind === 'not-json') {
    // Most often the 200 text/html SPA fallback for an unknown GET (00 §2). Nothing from it was shown.
    return 'The Service Desk sent a web page instead of data, so nothing was shown. Try again; if it keeps happening, report it.';
  }
  if (error.kind === 'shape') {
    return "The Service Desk's reply was not in the expected format, so nothing was shown. Report it if it keeps happening.";
  }
  return error.body.error;
}

/** No response at all: offline, DNS failure, or the server restarting. Screens show the offline banner for it. */
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiClientError && error.kind === 'network';
}
