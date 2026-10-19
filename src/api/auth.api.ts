// Auth + health endpoints used by M1 Login and session start-up (01 §1, 02-AUTH.md).
//
// ── Native Microsoft sign-in (ask A2, 02-AUTH.md §7) ─────────
// 1. signInWithMicrosoft() opens Microsoft's sign-in page in the system browser (expo-auth-session): authorization code
//    + PKCE (S256) against the PUBLIC-client app registration in src/config/auth.config.ts. There is no client secret.
// 2. The code is redeemed at Microsoft's token endpoint with the PKCE verifier. Only the ID token is kept, in memory,
//    for one request. Microsoft's access and refresh tokens are dropped unused: there is no refresh in this app (02 §1.1).
// 3. exchangeMicrosoftIdToken() posts the ID token to AUTH-P2 and reads the MMG session `{ token, expiresAt, user }`
//    from the JSON body (no cookie). The caller stores it with the auth store's setSession().
// AUTH-P2's request and response shapes are an ASSUMPTION, kept in one file: src/types/mobile-sso-contract.ts.
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
  MOBILE_SSO_DEACTIVATED_ERROR,
  MOBILE_SSO_NO_ACCOUNT_STATUS,
  MOBILE_SSO_PATH,
  MOBILE_SSO_ROUTE_NOT_FOUND_ERROR,
  MOBILE_SSO_WIRE,
  USER_ROLES,
  type AuthConfigResponse,
  type AuthMeResponse,
  type AuthUser,
  type MobileLoginResponse,
  type MobileSsoRequest,
  type UserRole,
} from '@/types';
import { apiClient, type MessageResponse } from './client';
import { ApiClientError } from './errors';

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
 * From AUTH-P2:
 * - `endpoint-missing`    — a 404 from the routing layer, not from the endpoint: AUTH-P2 is not deployed there yet.
 * - `token-rejected`      — 401/403: the endpoint ran and refused the Microsoft token.
 * - `account-disabled`    — 401/403 "…deactivated": the Service Desk account exists but is switched off.
 * - `no-account`          — the Microsoft sign-in is valid, but no Service Desk account matches it (assumed signal).
 * - `rate-limited`        — 429.
 * - `unexpected-response` — the endpoint answered 2xx, but not in the assumed contract shape.
 * - `server`              — 5xx, 400, 501 or any other status.
 * Either side:
 * - `network`             — no answer at all: offline, DNS failure, timeout.
 * Closing Microsoft's page is not a failure: signInWithMicrosoft() resolves `{ type: 'cancelled' }`.
 */
export type MicrosoftSignInFailure =
  | 'not-configured'
  | 'microsoft'
  | 'endpoint-missing'
  | 'token-rejected'
  | 'account-disabled'
  | 'no-account'
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
 * AUTH-P2 — POST /api/v1/auth/microsoft/mobile `{ idToken }` → `{ token, expiresAt, user }`, no cookie.
 * ⚠ The endpoint was not deployed on 2026-10-19 and its shape is ASSUMED (src/types/mobile-sso-contract.ts).
 * A failure says which it is: `endpoint-missing` = not deployed; `unexpected-response` = deployed, different shape.
 */
export async function exchangeMicrosoftIdToken(idToken: string): Promise<MobileLoginResponse> {
  const body: MobileSsoRequest = { [MOBILE_SSO_WIRE.idToken]: idToken };
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
  if (kind === 'not-json') {
    // Express answers an unknown POST with an HTML 404 (01 §0.5): the route does not exist on this server.
    if (status === 404 || status === 405) {
      return new MicrosoftSignInError(
        'endpoint-missing',
        `${http} with an HTML body: the route is not deployed on ${API_HOST}`,
        status,
      );
    }
    if (status === 429) return new MicrosoftSignInError('rate-limited', http, status);
    if (status !== null && status >= 200 && status < 300) {
      return new MicrosoftSignInError('unexpected-response', `${http}, but the body is not a JSON object`, status);
    }
    return new MicrosoftSignInError('server', `${http} with a non-JSON body`, status);
  }
  if (kind === 'shape') {
    return new MicrosoftSignInError('unexpected-response', `${http}: ${said}`, status);
  }

  // A JSON `{ error }` body: the endpoint itself answered.
  if (status === MOBILE_SSO_NO_ACCOUNT_STATUS) {
    if (said === MOBILE_SSO_ROUTE_NOT_FOUND_ERROR) {
      return new MicrosoftSignInError(
        'endpoint-missing',
        `${http} "${said}" (catch-all 404): the route is not deployed on ${API_HOST}`,
        status,
      );
    }
    return new MicrosoftSignInError(
      'no-account',
      `${http} "${said}": deployed; read as "no Service Desk account" (assumed, mobile-sso-contract.ts)`,
      status,
    );
  }
  if (status === 401 || status === 403) {
    if (MOBILE_SSO_DEACTIVATED_ERROR.test(said)) {
      return new MicrosoftSignInError('account-disabled', `${http} "${said}"`, status);
    }
    return new MicrosoftSignInError('token-rejected', `${http} "${said}": deployed; the Microsoft token was refused`, status);
  }
  if (status === 429) return new MicrosoftSignInError('rate-limited', `${http} "${said}"`, status);
  return new MicrosoftSignInError('server', `${http} "${said}"`, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type name only, never the value (drift.ts convention, R6). */
function kindOf(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

/** The AuthUser in the response, or null after adding a problem per wrong field (03 §C). */
function readUser(value: unknown, problems: string[]): AuthUser | null {
  const at = MOBILE_SSO_WIRE.user;
  if (!isRecord(value)) {
    problems.push(`${at}: expected object, got ${kindOf(value)}`);
    return null;
  }
  const before = problems.length;
  const text = (key: keyof AuthUser): string => {
    const v = value[key];
    if (typeof v === 'string') return v;
    problems.push(`${at}.${key}: expected string, got ${kindOf(v)}`);
    return '';
  };
  const textOrNull = (key: keyof AuthUser): string | null => {
    const v = value[key];
    if (typeof v === 'string' || v === null) return v;
    problems.push(`${at}.${key}: expected string | null, got ${kindOf(v)}`);
    return null;
  };
  const user = {
    id: text('id'),
    email: text('email'),
    displayName: text('displayName'),
    role: text('role') as UserRole,
    ldapSamAccount: textOrNull('ldapSamAccount'),
    countryId: textOrNull('countryId'),
  };
  if (problems.length === before && !USER_ROLES.includes(user.role)) {
    problems.push(`${at}.role: unknown value "${user.role}" (expected one of ${USER_ROLES.join(', ')})`);
  }
  return problems.length === before ? user : null;
}

/** The 200 body as the app's session. Anything else is `unexpected-response`, naming each field that is off. */
function readSession(data: unknown): MobileLoginResponse {
  const problems: string[] = [];
  if (!isRecord(data)) problems.push(`body: expected object, got ${kindOf(data)}`);
  const body = isRecord(data) ? data : {};

  const token = body[MOBILE_SSO_WIRE.token];
  if (typeof token !== 'string' || token.trim() === '') {
    problems.push(`${MOBILE_SSO_WIRE.token}: expected non-empty string, got ${kindOf(token)}`);
  }
  const expiresAt = body[MOBILE_SSO_WIRE.expiresAt];
  if (typeof expiresAt !== 'string') {
    problems.push(`${MOBILE_SSO_WIRE.expiresAt}: expected ISO-8601 string, got ${kindOf(expiresAt)}`);
  }
  const user = readUser(body[MOBILE_SSO_WIRE.user], problems);

  if (problems.length > 0 || typeof token !== 'string' || typeof expiresAt !== 'string' || user === null) {
    if (__DEV__) for (const problem of problems) console.warn(`[API drift] AUTH-P2 ${problem}`);
    throw new MicrosoftSignInError(
      'unexpected-response',
      `${AUTH_P2} → 200, but not the assumed contract: ${problems.join('; ')}`,
      200,
    );
  }
  return { token, expiresAt, user };
}
