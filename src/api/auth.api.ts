// Auth + health endpoints used by M1 Login and session start-up (01 §1, 02-AUTH.md).
//
// ── Native Microsoft sign-in (ask A2, 02-AUTH.md §7) ─────────
// 1. signInWithMicrosoft() opens Microsoft's sign-in page in Apple's sign-in sheet (expo-auth-session →
//    ASWebAuthenticationSession, 02 §7.7): authorization code + PKCE (S256) against the PUBLIC-client app registration
//    in src/config/auth.config.ts. There is no client secret.
//    `prompt=select_account`, or `prompt=login` when the 15-day re-authentication is due (02-AUTH.md §5.8).
// 2. The code is redeemed at Microsoft's token endpoint with the PKCE verifier. Only the ID token is kept, in memory,
//    for one request. Microsoft's access and refresh tokens are dropped unused: there is no refresh in this app (02 §1.1).
// 3. exchangeMicrosoftIdToken() posts the ID token to AUTH-P2 and reads the MMG session `{ token, expiresAt, user }`
//    from the JSON body (no cookie). The caller stores it with the auth store's setSession(). R1: iOS's cookie store is
//    emptied right after AUTH-P2's answer, whatever it is, before the session is read and stored (./cookieShield.ts).
// AUTH-P2's request and response shapes were CONFIRMED by the backend team on 2026-10-19. They live in one file:
// src/types/mobile-sso-contract.ts. Only five response fields can fail sign-in (readSession()).
// Every failure is a MicrosoftSignInError with its own `reason`, so the Login screen can tell them apart.
// Never: scrape Set-Cookie, call /auth/test-login, lift the session out of a WebView, ship a secret (02 §6), or call
// the cookie-setting web endpoint /auth/microsoft* (02 §5.2). No token, ID token or authorization code is ever logged,
// shown, or put into an error.
//
// ── Email and password sign-in (AUTH-P1, ask A32, 02-AUTH.md §8) ──
// iOS (iOS-5g): not in this file. signInWithPassword() is src/api/passwordSignIn.api.ts, which every build bundles since
// iOS-9b opened the email sign-in to PROD (it was UAT only behind a build-time gate). It calls ONE path, POST
// /auth/mobile/login, and reads its answer through the SAME readSession() below, with AUTH-P1's options (Android's,
// d8626bc). This file holds no email-sign-in code or string.
import * as AuthSession from 'expo-auth-session';

import {
  AUTH_SESSION_OPTIONS,
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
import type { MobilePasswordUser } from '@/types/mobile-password-contract';
import { apiClient, endSession, type MessageResponse } from './client';
import { clearCookieStore } from './cookieShield';
import { checkFields, reportDrift, type FieldSpec } from './drift';
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

export const LOGOUT_WAIT_MS = 5_000;

/**
 * Sign out (02 §5.5), after the person has confirmed it (useSignOut): AUTH-3 first, while the token is still there to
 * send. Its result is ignored and it is waited for at most `waitMs`. Then, whatever happened, the local wipe: Keychain
 * session, the whole query cache and every store (endSession). The app then shows Login.
 * The 15-day date goes too, so the next sign-in is challenged and starts a new 15 days (02 §5.8).
 */
export async function signOutAndWipe(waitMs: number = LOGOUT_WAIT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      logout().catch(() => undefined),
      new Promise((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await endSession(null, { forgetFullAuth: true });
  }
}

// ── Microsoft sign-in (ask A2) ───────────────────────────────

/**
 * Why Microsoft sign-in failed. The Login screen shows a different message for each.
 * Before the Service Desk is called:
 * - `not-configured`      — not iOS, or this build still has placeholder client/tenant IDs (src/config/auth.config.ts).
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

export interface MicrosoftSignInOptions {
  /**
   * true: `prompt=login`. Microsoft asks for the user's credentials even when its own browser session could let them
   * straight through: the 15-day re-authentication (auth.store.ts, 02-AUTH.md §5.8).
   * false: `prompt=select_account`, as the web flow does: Microsoft's account picker, so a shared phone can switch account.
   */
  challenge: boolean;
}

/**
 * Steps 1–3. Resolves `cancelled` when the person closes Microsoft's page or presses Cancel there; otherwise resolves
 * the session or rejects with a MicrosoftSignInError. Stores nothing: the caller passes `session` to setSession().
 */
export async function signInWithMicrosoft({ challenge }: MicrosoftSignInOptions): Promise<MicrosoftSignInResult> {
  if (!isMicrosoftSignInConfigured()) {
    throw new MicrosoftSignInError(
      'not-configured',
      'Not iOS (the only platform with a registered redirect URI), or the Entra client ID or tenant ID is still a ' +
        'placeholder or not a GUID (src/config/auth.config.ts, or EXPO_PUBLIC_AZURE_CLIENT_ID / _TENANT_ID).',
    );
  }
  const idToken = await getMicrosoftIdToken(challenge);
  if (idToken === null) return { type: 'cancelled' };
  return { type: 'signed-in', session: await exchangeMicrosoftIdToken(idToken) };
}

/** The error's class name only: a message could quote a redirect URL, which carries the authorization code. */
export function errorName(error: unknown): string {
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
async function getMicrosoftIdToken(challenge: boolean): Promise<string | null> {
  const redirectUri = getAuthRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId: AZURE_CLIENT_ID,
    redirectUri,
    scopes: [...AZURE_SCOPES],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    codeChallengeMethod: AuthSession.CodeChallengeMethod.S256, // the library's default, stated; it refuses `plain`
    // Login: credentials even with a live Microsoft session (15-day rule). SelectAccount: as the web flow does.
    prompt: challenge ? AuthSession.Prompt.Login : AuthSession.Prompt.SelectAccount,
  });

  let result: AuthSession.AuthSessionResult;
  try {
    result = await request.promptAsync(AZURE_ENDPOINTS, AUTH_SESSION_OPTIONS);
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
  // iOS answers `cancel` for Cancel on the sheet and for any other way the sheet ends without the redirect. Also
  // dismiss and locked (a sheet already open).
  if (result.type !== 'success') return null;

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
  } finally {
    // R1: whatever the answer, success or error, a cookie it may have set is gone before the caller's setSession()
    // (./cookieShield.ts). Never throws, never blocks.
    await clearCookieStore('microsoft-sign-in');
  }
  return readSsoSession(data);
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type name only, never the value (drift.ts convention, R6). */
function kindOf(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

// ── Reading a sign-in answer: ONE reader, with options per endpoint ──
//
// readSession() turns a 200 body into the app's session and readUser() a `user` object into AuthUser, for AUTH-P2,
// AUTH-P1 and AUTH-2 alike. They read only the key names their reader lists, by own-property lookup. Nothing walks a
// body's keys or compares its key set, so an unknown extra field cannot fail sign-in. AUTH_P2_READER lists AUTH-P2's
// confirmed names alone, so Microsoft sign-in reads exactly what it read before the options existed.

/** How one endpoint's `user` maps onto AuthUser. A key list is tried first to last: the first non-blank string wins. */
export interface UserReader {
  /** Prefix of drift lines and failure details: 'AUTH-P2', 'AUTH-P1', 'AUTH-2'. */
  readonly endpoint: string;
  /** The name's keys. With none of them, the email stands in: formatDisplayName() turns "first.last@…" into "First Last". */
  readonly name: readonly string[];
  /** AUTH-P2: a missing email fails sign-in. AUTH-P1, AUTH-2: optional; the email already known stands in. */
  readonly emailRequired: boolean;
  /** The OPTIONAL single-name fields, for checkFields() (responseSpecs.ts). */
  readonly optionalSpec: readonly FieldSpec[];
}

/** How one endpoint's 200 body maps onto the session. Each key list is checked against its contract type (`satisfies`). */
export interface SessionReader extends UserReader {
  readonly token: readonly string[];
  readonly expiry: readonly string[];
  /** AUTH-P2: a missing expiry fails sign-in. AUTH-P1: optional. Either way the app's 8-hour clock applies (02 §5.4). */
  readonly expiryRequired: boolean;
}

/** AUTH-P2, confirmed 2026-10-19 (mobile-sso-contract.ts): one name per field; all required but the user's name. */
const AUTH_P2_READER: SessionReader & { readonly expiryRequired: true } = {
  endpoint: 'AUTH-P2',
  token: ['token'] satisfies (keyof MobileSsoResponse)[],
  expiry: ['expiresAt'] satisfies (keyof MobileSsoResponse)[],
  expiryRequired: true,
  name: ['name'] satisfies (keyof MobileSsoUser)[],
  emailRequired: true,
  optionalSpec: MOBILE_SSO_OPTIONAL_SPEC,
};

/** The value under `key` only when the object itself holds it, never one inherited from Object.prototype. */
export function own(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/** Keys that every user shape the reader handles has under the same name: AUTH-P2, AUTH-P1 and AUTH-2 (AuthUser). */
type SharedUserKey = keyof MobileSsoUser & keyof MobilePasswordUser & keyof AuthUser;

function userField(user: Record<string, unknown>, key: SharedUserKey): unknown {
  return own(user, key);
}

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

/** An OPTIONAL string that must say something: null when missing, blank or not a string. */
function nonBlankText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** The first of `keys` that holds a non-blank string, with the key it was under; null when none does. */
function firstText(record: Record<string, unknown>, keys: readonly string[]): { value: string; key: string } | null {
  for (const key of keys) {
    const value = nonBlankText(own(record, key));
    if (value !== null) return { value, key };
  }
  return null;
}

/** `token`, or `user.name | user.displayName | user.fullName`: how drift lines and problems name a key list. */
function keyList(keys: readonly string[], prefix = ''): string {
  return keys.map((key) => `${prefix}${key}`).join(' | ');
}

/**
 * A REQUIRED string under any of `keys`: the value and its key, or null after adding a problem. The problem names the
 * type the first present key held, as requiredText() does, so a one-key list reads exactly like requiredText().
 */
function requiredAlias(
  record: Record<string, unknown>,
  keys: readonly string[],
  problems: string[],
): { value: string; key: string } | null {
  const found = firstText(record, keys);
  if (found === null) {
    const held = keys.map((key) => own(record, key)).find((value) => value !== undefined);
    problems.push(`${keyList(keys)}: expected non-empty string, got ${typeof held === 'string' ? 'blank string' : kindOf(held)}`);
  }
  return found;
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

export interface UserReadout {
  user: AuthUser;
  /** The answer held `countryId` as a string or null. False: missing or another type, so `user.countryId` is null. */
  countryIdSent: boolean;
  /** The key the name came under; null when the email stands in. */
  nameKey: string | null;
  /** The answer held a non-blank email; false when the one already known stands in. */
  emailSent: boolean;
}

/**
 * A `user` object as the app's AuthUser, or null after adding a problem per bad REQUIRED field. The wire shapes differ
 * (mobile-sso-contract.ts, mobile-password-contract.ts, 03 §C): this is the one place that maps them onto AuthUser.
 * `knownEmail` stands in for a missing email where the reader allows one: the typed email (AUTH-P1), or the sign-in
 * answer's (AUTH-2).
 */
export function readUser(value: unknown, reader: UserReader, problems: string[], knownEmail?: string): UserReadout | null {
  if (!isRecord(value)) {
    problems.push(`user: expected object, got ${kindOf(value)}`);
    return null;
  }
  const id = requiredText(userField(value, 'id'), 'user.id', problems);
  const sentEmail = reader.emailRequired
    ? requiredText(userField(value, 'email'), 'user.email', problems)
    : nonBlankText(userField(value, 'email'));
  // An unknown role is refused: every gate in the app is keyed on it, and the stored session would not load (auth.store).
  const sentRole = userField(value, 'role');
  const role = isUserRole(sentRole) ? sentRole : null;
  if (role === null) {
    problems.push(
      typeof sentRole === 'string'
        ? `user.role: unknown value "${sentRole}" (expected one of ${USER_ROLES.join(', ')})`
        : `user.role: expected string, got ${kindOf(sentRole)}`,
    );
  }
  const email = sentEmail ?? knownEmail ?? null;
  if (email === null && !reader.emailRequired) problems.push('user.email: expected non-empty string, got none');
  if (id === null || email === null || role === null) return null;

  const name = firstText(value, reader.name);
  // A one-key list is covered by the reader's FieldSpec (AUTH-P2 `user.name`, AUTH-2 `user.displayName`).
  if (name === null && reader.name.length > 1) {
    reportDrift(reader.endpoint, `${keyList(reader.name, 'user.')}: none holds a non-blank string; the email stands in`);
  }
  const countryId = userField(value, 'countryId');
  const countryIdSent = typeof countryId === 'string' || countryId === null;
  return {
    user: {
      id,
      email,
      role,
      displayName: name?.value ?? email,
      ldapSamAccount: optionalText(userField(value, 'ldapSamAccount')),
      // Without one, an AGENT reads as a triage agent in the UI (05 §A.12). AUTH-P1 asks AUTH-2 instead (countryIdSent).
      countryId: countryIdSent ? countryId : null,
      // AUTH-P2's `department` and `phone` are not kept: AuthUser (03 §C) has neither. Profile reads them from USR-1.
    },
    countryIdSent,
    nameKey: name?.key ?? null,
    emailSent: sentEmail !== null,
  };
}

export interface SessionReadout<Expiry> extends UserReadout {
  token: string;
  /** null only where the reader allows it (AUTH-P1). Read but not used: the 8-hour clock applies (02 §5.4). */
  expiresAt: Expiry;
  /** The keys the token and the expiry came under. Key names only, for the email sign-in's log line. */
  tokenKey: string;
  expiryKey: string | null;
}

export type SessionRead<Expiry> =
  | { ok: true; session: SessionReadout<Expiry> }
  | { ok: false; problems: string[]; tokenMissing: boolean };

/**
 * A 200 body as the app's session, read with `reader`'s options.
 * - REQUIRED: the token; `user`, with its id and role; the email and the expiry where the reader says so. If one is
 *   missing, blank or the wrong type, the result is `ok: false`, naming each bad field. Nothing else can fail sign-in.
 * - OPTIONAL: every other field the reader names. checkFields() and reportDrift() log a missing or wrong one once as
 *   `[API drift]` in __DEV__, and the reader falls back.
 * - Anything else: never read. The body is accessed only by the key names the reader lists.
 */
export function readSession(data: unknown, reader: SessionReader & { readonly expiryRequired: true }): SessionRead<string>;
export function readSession(data: unknown, reader: SessionReader, knownEmail?: string): SessionRead<string | null>;
export function readSession(data: unknown, reader: SessionReader, knownEmail?: string): SessionRead<string | null> {
  const problems: string[] = [];
  if (!isRecord(data)) problems.push(`body: expected object, got ${kindOf(data)}`);
  const body: Record<string, unknown> = isRecord(data) ? data : {};
  if (isRecord(data)) checkFields(reader.endpoint, data, reader.optionalSpec);

  const token = requiredAlias(body, reader.token, problems);
  let expiry: { value: string; key: string } | null;
  if (reader.expiryRequired) {
    expiry = requiredAlias(body, reader.expiry, problems);
  } else {
    expiry = firstText(body, reader.expiry);
    if (expiry === null && isRecord(data)) {
      reportDrift(reader.endpoint, `${keyList(reader.expiry)}: none holds a non-blank string; the 8-hour clock applies`);
    }
  }
  const user = readUser(own(body, 'user'), reader, problems, knownEmail);

  if (token === null || (reader.expiryRequired && expiry === null) || user === null) {
    if (__DEV__) for (const problem of problems) console.warn(`[API drift] ${reader.endpoint} ${problem}`);
    // `tokenMissing`: a JSON object without a token, i.e. an answer with no session in it (AUTH-P1's `no-token`).
    return { ok: false, problems, tokenMissing: token === null && isRecord(data) };
  }
  return {
    ok: true,
    session: { ...user, token: token.value, expiresAt: expiry?.value ?? null, tokenKey: token.key, expiryKey: expiry?.key ?? null },
  };
}

/** AUTH-P2's 200 body as the app's session, or `unexpected-response` naming each bad field. */
function readSsoSession(data: unknown): MobileLoginResponse {
  const read = readSession(data, AUTH_P2_READER);
  if (!read.ok) {
    throw new MicrosoftSignInError(
      'unexpected-response',
      `${AUTH_P2} → 200, but a required field is missing or wrong: ${read.problems.join('; ')}`,
      200,
    );
  }
  const { token, expiresAt, user } = read.session;
  return { token, expiresAt, user };
}
