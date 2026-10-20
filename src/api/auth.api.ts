// Auth + health endpoints used by M1 Login and session start-up (01 §1, 02-AUTH.md).
//
// ── Native Microsoft sign-in (ask A2, 02-AUTH.md §7) ─────────
// 1. signInWithMicrosoft() opens Microsoft's sign-in page in the system browser (expo-auth-session): authorization code
//    + PKCE (S256) against the PUBLIC-client app registration in src/config/auth.config.ts. There is no client secret.
// 2. The code is redeemed at Microsoft's token endpoint with the PKCE verifier. Only the ID token is kept, in memory,
//    for one request. Microsoft's access and refresh tokens are dropped unused: there is no refresh in this app (02 §1.1).
// 3. exchangeMicrosoftIdToken() posts the ID token to AUTH-P2 and reads the MMG session `{ token, expiresAt, user }`
//    from the JSON body (no cookie). The caller stores it with the auth store's setSession().
// AUTH-P2's request and response shapes were CONFIRMED by the backend team on 2026-10-19. They live in one file:
// src/types/mobile-sso-contract.ts. Only five response fields can fail sign-in (readSession()).
// Every failure is a MicrosoftSignInError with its own `reason`, so the Login screen can tell them apart.
// Never: scrape Set-Cookie, call /auth/test-login, lift the session out of a WebView, ship a secret (02 §6), or call
// the cookie-setting web endpoints /auth/login and /auth/microsoft* (02 §5.2). No token, ID token or authorization
// code is ever logged, shown, or put into an error.
import * as AuthSession from 'expo-auth-session';

import {
  AZURE_CLIENT_ID,
  AZURE_ENDPOINTS,
  AZURE_SCOPES,
  getAuthRedirectUri,
  isMicrosoftSignInConfigured,
} from '@/config/auth.config';
import { API_HOST, HEALTH_URL } from '@/config/env';
import {
  MOBILE_SSO_PATH,
  USER_ROLES,
  type AuthConfigResponse,
  type AuthMeResponse,
  type AuthUser,
  type MobileLoginResponse,
  type MobileSsoRequest,
  type MobileSsoResponse,
  type MobileSsoUser,
  type UserRole,
} from '@/types';
import { apiClient, type MessageResponse } from './client';
import { checkFields } from './drift';
import { ApiClientError } from './errors';
import { MOBILE_SSO_OPTIONAL_SPEC } from './responseSpecs';

/** SYS-1 response (01 §1). */
export interface HealthResponse {
  status: 'ok';
  ts: string;
}

/**
 * SYS-1 — GET https://<host>/health (outside /api/v1; no auth, not rate-limited).
 * Connectivity / maintenance check on app start or after a network error.
 */
export async function getHealth(): Promise<HealthResponse> {
  const res = await apiClient.get<HealthResponse>(HEALTH_URL, { skipAuth: true });
  return res.data;
}

/**
 * AUTH-1 — GET /api/v1/auth/config (no auth).
 * Which login methods the server has enabled. `microsoftEnabled` describes the WEB SSO;
 * the mobile SSO (A2) will need its own flag once it ships.
 */
export async function getAuthConfig(): Promise<AuthConfigResponse> {
  const res = await apiClient.get<AuthConfigResponse>('/auth/config', { skipAuth: true });
  return res.data;
}

/**
 * AUTH-2 — GET /api/v1/auth/me (Bearer, any role).
 * Current user from the Redis session cache; may be stale after a profile/role/country change (05 B.28).
 */
export async function getMe(): Promise<AuthMeResponse> {
  const res = await apiClient.get<AuthMeResponse>('/auth/me');
  return res.data;
}

/**
 * AUTH-3 — POST /api/v1/auth/logout (Bearer; not behind requireAuth). Always 200 `{ message: "Logged out" }`.
 * Call it, ignore the result, then wipe local state with endSession() (02 §5.5).
 */
export async function logout(): Promise<MessageResponse> {
  const res = await apiClient.post<MessageResponse>('/auth/logout');
  return res.data;
}

// ── Microsoft sign-in (ask A2) ───────────────────────────────

/**
 * Why Microsoft sign-in failed. The Login screen shows a different message for each.
 * Before the Service Desk is called:
 * - `not-configured`      — this build still has the placeholder client/tenant IDs (src/config/auth.config.ts).
 * - `microsoft`           — Microsoft returned an error, or no ID token. The Service Desk was never called.
 * From AUTH-P2. Its confirmed statuses are 400, 401, 403 and 500, each with a JSON `{ error }` (02-AUTH.md §7.5):
 * - `bad-request`         — 400: the server could not read the request. An app-side problem; a retry won't help.
 * - `token-rejected`      — 401: the endpoint ran and refused the Microsoft token.
 * - `account-disabled`    — 403: the Service Desk account exists but is deactivated.
 * - `server`              — 500, any other 5xx, or any status not listed here.
 * - `endpoint-missing`    — any 404 or 405, HTML or JSON. AUTH-P2 itself never answers 404 (there is no "no account"
 *                           case), so it means the route is not deployed on this server.
 * - `rate-limited`        — 429. Not a confirmed status; kept in case a limiter is put on the route.
 * - `unexpected-response` — 2xx, but a REQUIRED field is missing or the wrong type, or the body is not JSON.
 * Either side:
 * - `network`             — no answer at all: offline, DNS failure, timeout.
 * Closing Microsoft's page is not a failure: signInWithMicrosoft() resolves `{ type: 'cancelled' }`.
 */
export type MicrosoftSignInFailure =
  | 'not-configured'
  | 'microsoft'
  | 'bad-request'
  | 'token-rejected'
  | 'account-disabled'
  | 'endpoint-missing'
  | 'rate-limited'
  | 'unexpected-response'
  | 'server'
  | 'network';

export class MicrosoftSignInError extends Error {
  readonly reason: MicrosoftSignInFailure;
  /** HTTP status from the Service Desk, or null when there was none. */
  readonly status: number | null;
  /** For developers: what failed and where (status, server message, AADSTS code). Never contains a token or code. */
  readonly detail: string;

  constructor(reason: MicrosoftSignInFailure, detail: string, status: number | null = null) {
    super(`${reason}: ${detail}`);
    this.name = 'MicrosoftSignInError';
    this.reason = reason;
    this.status = status;
    this.detail = detail;
  }
}

export type MicrosoftSignInResult = { type: 'cancelled' } | { type: 'signed-in'; session: MobileLoginResponse };

/**
 * Steps 1–3. Resolves `cancelled` when the person closes Microsoft's page or presses Cancel there; otherwise resolves
 * the session or rejects with a MicrosoftSignInError. Stores nothing: the caller passes `session` to setSession().
 */
export async function signInWithMicrosoft(): Promise<MicrosoftSignInResult> {
  if (!isMicrosoftSignInConfigured()) {
    throw new MicrosoftSignInError(
      'not-configured',
      'The Entra client ID or tenant ID is still a placeholder or not a GUID. Fill them in src/config/auth.config.ts ' +
        'or set EXPO_PUBLIC_AZURE_CLIENT_ID / EXPO_PUBLIC_AZURE_TENANT_ID.',
    );
  }
  const idToken = await getMicrosoftIdToken();
  if (idToken === null) return { type: 'cancelled' };
  return { type: 'signed-in', session: await exchangeMicrosoftIdToken(idToken) };
}

/** The error's class name only: a message could quote a redirect URL, which carries the authorization code. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** `AADSTS50011` etc. from Microsoft's error_description, which otherwise holds trace and correlation IDs. */
function aadstsCode(description: string | undefined): string {
  const match = /AADSTS\d+/.exec(description ?? '');
  return match ? ` (${match[0]})` : '';
}

/** React Native's fetch rejects with `TypeError: Network request failed` when there is no answer. */
function isFetchNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && /network request failed/i.test(error.message);
}

/** Steps 1–2. The ID token, or null when the person closed Microsoft's page or pressed Cancel on it. */
async function getMicrosoftIdToken(): Promise<string | null> {
  const redirectUri = getAuthRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId: AZURE_CLIENT_ID,
    redirectUri,
    scopes: [...AZURE_SCOPES],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true, // S256; the library refuses `plain`
    prompt: AuthSession.Prompt.SelectAccount, // as the web flow does, so a shared phone can switch account
  });

  let result: AuthSession.AuthSessionResult;
  try {
    result = await request.promptAsync(AZURE_ENDPOINTS);
  } catch (e) {
    throw new MicrosoftSignInError('microsoft', `Could not open the Microsoft sign-in page (${errorName(e)})`);
  }

  // `result.url` and `result.params` hold the authorization code: never log or display them.
  if (result.type === 'error') {
    const code = result.error?.code ?? result.params.error ?? 'unknown_error';
    // Cancel on Microsoft's own page comes back as access_denied with error_subcode=cancel.
    if (code === 'access_denied' && result.params.error_subcode === 'cancel') return null;
    throw new MicrosoftSignInError(
      'microsoft',
      `Microsoft sign-in returned "${code}"${aadstsCode(result.params.error_description)}`,
    );
  }
  if (result.type !== 'success') return null; // cancel / dismiss (page closed, Back pressed), locked, opened

  const authorizationCode = result.params.code;
  if (!authorizationCode) {
    throw new MicrosoftSignInError('microsoft', 'Microsoft redirected back without an authorization code');
  }

  let idToken: string | undefined;
  try {
    const tokens = await AuthSession.exchangeCodeAsync(
      {
        clientId: AZURE_CLIENT_ID,
        code: authorizationCode,
        redirectUri,
        scopes: [...AZURE_SCOPES],
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      AZURE_ENDPOINTS,
    );
    idToken = tokens.idToken; // Microsoft's access and refresh tokens are not kept
  } catch (e) {
    if (e instanceof AuthSession.TokenError) {
      throw new MicrosoftSignInError(
        'microsoft',
        `Microsoft's token endpoint returned "${e.code}"${aadstsCode(e.description)}`,
      );
    }
    if (isFetchNetworkFailure(e)) {
      throw new MicrosoftSignInError('network', 'No answer from login.microsoftonline.com while finishing sign-in');
    }
    throw new MicrosoftSignInError('microsoft', `Could not finish Microsoft sign-in (${errorName(e)})`);
  }
  if (!idToken) throw new MicrosoftSignInError('microsoft', 'Microsoft returned no ID token');
  return idToken;
}

const AUTH_P2 = `POST /api/v1${MOBILE_SSO_PATH}`;

/**
 * AUTH-P2 — POST /api/v1/auth/microsoft/mobile `{ idToken }` → `{ token, user, expiresAt }`, no cookie.
 * Contract confirmed 2026-10-19 and deployed to UAT (src/types/mobile-sso-contract.ts).
 */
export async function exchangeMicrosoftIdToken(idToken: string): Promise<MobileLoginResponse> {
  const body: MobileSsoRequest = { idToken };
  let data: unknown;
  try {
    // skipAuth: there is no session yet, and a stale token must not ride along.
    const res = await apiClient.post<unknown>(MOBILE_SSO_PATH, body, { skipAuth: true });
    if (__DEV__ && res.headers['set-cookie'] !== undefined) {
      console.warn('[API drift] AUTH-P2 sent Set-Cookie; the contract says no cookie (02 §2 #5)');
    }
    data = res.data;
  } catch (e) {
    throw classifyExchangeFailure(e);
  }
  return readSession(data);
}

/** Maps an AUTH-P2 failure to the reason the Login screen shows. Server messages are quoted; they hold no token. */
function classifyExchangeFailure(error: unknown): MicrosoftSignInError {
  if (!(error instanceof ApiClientError)) {
    return new MicrosoftSignInError('server', `${AUTH_P2} failed on the device (${errorName(error)})`);
  }
  const { kind, status } = error;
  const said = error.body.error;
  const http = `${AUTH_P2} → HTTP ${status ?? '?'}`;

  if (kind === 'network' || kind === 'timeout') {
    return new MicrosoftSignInError('network', `${AUTH_P2}: ${kind === 'timeout' ? 'timed out' : 'no answer'} (${API_HOST})`);
  }
  // For a non-JSON body `said` is only the client's fallback text, so it is not quoted as the server's.
  const answer = kind === 'not-json' ? ' with a non-JSON body' : ` "${said}"`;

  // AUTH-P2 never answers 404 itself: it auto-creates unknown users, so there is no "no account" case. Any 404/405,
  // Express's HTML "Cannot POST" (01 §0.5) or a JSON catch-all, means the route is not deployed on this server.
  if (status === 404 || status === 405) {
    return new MicrosoftSignInError('endpoint-missing', `${http}${answer}: the route is not deployed on ${API_HOST}`, status);
  }
  if (status === 429) return new MicrosoftSignInError('rate-limited', `${http}${answer}`, status);
  if (kind === 'not-json') {
    if (status !== null && status >= 200 && status < 300) {
      return new MicrosoftSignInError('unexpected-response', `${http}, but the body is not a JSON object`, status);
    }
    // e.g. an IIS error page: not the endpoint's answer, so not read as 401/403.
    return new MicrosoftSignInError('server', `${http}${answer}`, status);
  }
  if (kind === 'shape') {
    return new MicrosoftSignInError('unexpected-response', `${http}: ${said}`, status);
  }

  // A JSON `{ error }` body: the endpoint itself answered. Mapped by the confirmed status, not by the message text.
  if (status === 400) return new MicrosoftSignInError('bad-request', `${http}${answer}: the request body was refused`, status);
  if (status === 401) return new MicrosoftSignInError('token-rejected', `${http}${answer}: the Microsoft token was refused`, status);
  if (status === 403) return new MicrosoftSignInError('account-disabled', `${http}${answer}: the account is deactivated`, status);
  return new MicrosoftSignInError('server', `${http}${answer}`, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type name only, never the value (drift.ts convention, R6). */
function kindOf(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

/**
 * A body seen through the contract's key names, with every value still unchecked. Reading a key the contract does not
 * name is a compile error; keys the contract does not name are never looked at.
 */
type Unchecked<T> = { [K in keyof T]?: unknown };

/** A REQUIRED string field: the value, or null after adding a problem. Blank counts as missing. */
function requiredText(value: unknown, at: string, problems: string[]): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  problems.push(`${at}: expected non-empty string, got ${typeof value === 'string' ? 'blank string' : kindOf(value)}`);
  return null;
}

/** An OPTIONAL string field: the value, or null when missing, null or not a string. checkFields() logs the drift. */
function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

/**
 * AUTH-P2 `user` as the app's AuthUser, or null after adding a problem per bad REQUIRED field.
 * The two shapes differ (mobile-sso-contract.ts). This is the one place that maps one onto the other.
 */
function readUser(value: unknown, problems: string[]): AuthUser | null {
  if (!isRecord(value)) {
    problems.push(`user: expected object, got ${kindOf(value)}`);
    return null;
  }
  const user: Unchecked<MobileSsoUser> = value;
  const id = requiredText(user.id, 'user.id', problems);
  const email = requiredText(user.email, 'user.email', problems);
  // An unknown role is refused: every gate in the app is keyed on it, and the stored session would not load (auth.store).
  const role = isUserRole(user.role) ? user.role : null;
  if (role === null) {
    problems.push(
      typeof user.role === 'string'
        ? `user.role: unknown value "${user.role}" (expected one of ${USER_ROLES.join(', ')})`
        : `user.role: expected string, got ${kindOf(user.role)}`,
    );
  }
  if (id === null || email === null || role === null) return null;

  const name = optionalText(user.name);
  return {
    id,
    email,
    role,
    // `name` on the wire. Without one, the email: formatDisplayName() turns "first.last@…" into "First Last".
    displayName: name !== null && name.trim() !== '' ? name : email,
    ldapSamAccount: optionalText(user.ldapSamAccount),
    // Without one, an AGENT reads as a triage agent in the UI (05 §A.12). The server still scopes the data.
    countryId: optionalText(user.countryId),
    // `department` and `phone` are not kept: AuthUser (03 §C) has neither. Profile reads them from USR-1.
  };
}

/**
 * The 200 body as the app's session.
 * - REQUIRED: token, expiresAt, user.id, user.email, user.role. If one is missing, blank or the wrong type, the result is
 *   `unexpected-response`, naming each bad field. Nothing else can fail sign-in.
 * - OPTIONAL: every other field the contract names. checkFields() logs a missing or wrong one once as `[API drift]` in
 *   __DEV__, and readUser() falls back.
 * - Anything else: never read. The body is accessed only by the key names above. Nothing walks its keys or compares its
 *   key set, so an unknown extra field cannot fail sign-in.
 */
function readSession(data: unknown): MobileLoginResponse {
  const problems: string[] = [];
  if (!isRecord(data)) problems.push(`body: expected object, got ${kindOf(data)}`);
  const body: Unchecked<MobileSsoResponse> = isRecord(data) ? data : {};
  if (isRecord(data)) checkFields('AUTH-P2', data, MOBILE_SSO_OPTIONAL_SPEC);

  const token = requiredText(body.token, 'token', problems);
  const expiresAt = requiredText(body.expiresAt, 'expiresAt', problems);
  const user = readUser(body.user, problems);

  if (token === null || expiresAt === null || user === null) {
    if (__DEV__) for (const problem of problems) console.warn(`[API drift] AUTH-P2 ${problem}`);
    throw new MicrosoftSignInError(
      'unexpected-response',
      `${AUTH_P2} → 200, but a required field is missing or wrong: ${problems.join('; ')}`,
      200,
    );
  }
  return { token, expiresAt, user };
}
