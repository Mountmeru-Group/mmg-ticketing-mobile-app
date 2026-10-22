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

/**
 * User-facing message for a failed WRITE (Phase 3b). Same rules as describeError(), plus the facts a person needs
 * before trying again: some failures happen after the server has already saved (01 §0.2: a 500 can follow a
 * created comment; a timeout means the request may have arrived), and mutations are never retried automatically.
 */
export function describeWriteError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'Something went wrong. Nothing was retried.';
  const maybeSaved = 'It may have been saved — refresh before trying again.';
  switch (error.kind) {
    case 'client':
      return error.body.error; // rejected on the device: nothing was sent
    case 'network':
      return `Couldn't reach the Service Desk. ${maybeSaved}`;
    case 'timeout':
      return `The Service Desk took too long to answer. ${maybeSaved}`;
    case 'shape':
      return `The Service Desk accepted the request but replied in an unexpected format. ${maybeSaved}`;
    default:
      break;
  }
  const status = error.status;
  if (status === 403) return "Your role doesn't allow this action.";
  if (status === 429) return 'Too many requests right now. Wait a minute, then try again.';
  if (status !== null && status >= 500) return `The Service Desk reported an error. ${maybeSaved}`;
  if (error.kind === 'not-json') return `Unexpected response from the Service Desk. ${maybeSaved}`;
  if (status === 400 && error.body.details) {
    const fields = Object.entries(error.body.details)
      .map(([field, messages]) => `${field}: ${(messages ?? []).join(', ')}`)
      .join('; ');
    return fields ? `${error.body.error} — ${fields}` : error.body.error;
  }
  return error.body.error;
}

/**
 * The API client has already ended the session and the app is returning to Login (02 §5.3): the endpoint's own
 * JSON 401 (`http`) or the device-side 8 h expiry (`client`). A non-JSON 401 — a proxy or captive-portal page — is
 * not one: the session is kept and the request fails like any other `not-json` response.
 */
export function isSessionEndedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401 && (error.kind === 'http' || error.kind === 'client');
}

/** No response at all: offline, DNS failure, or the server restarting. Screens show the offline banner for it. */
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiClientError && error.kind === 'network';
}
