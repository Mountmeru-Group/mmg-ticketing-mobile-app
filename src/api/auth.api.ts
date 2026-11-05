// Auth + health endpoints used by M1 Login and session start-up (01 §1, 02-AUTH.md).
//
// ── Native Microsoft sign-in (ask A2, 02-AUTH.md §7) ─────────
// 1. signInWithMicrosoft() opens Microsoft's sign-in page in the system browser (expo-auth-session): authorization code
//    + PKCE (S256) against the PUBLIC-client app registration in src/config/auth.config.ts. There is no client secret.
//    `prompt=select_account`, or `prompt=login` when the 15-day re-authentication is due (02-AUTH.md §5.8).
// 2. The code is redeemed at Microsoft's token endpoint with the PKCE verifier. Only the ID token is kept, in memory,
//    for one request. Microsoft's access and refresh tokens are dropped unused: there is no refresh in this app (02 §1.1).
// 3. exchangeMicrosoftIdToken() posts the ID token to AUTH-P2 and reads the MMG session `{ token, expiresAt, user }`
//    from the JSON body (no cookie). The caller stores it with the auth store's setSession().
// AUTH-P2's request and response shapes were CONFIRMED by the backend team on 2026-10-19. They live in one file:
// src/types/mobile-sso-contract.ts. Only five response fields can fail sign-in (readSession()).
// Every failure is a MicrosoftSignInError with its own `reason`, so the Login screen can tell them apart.
// Never: scrape Set-Cookie, call /auth/test-login, lift the session out of a WebView, ship a secret (02 §6), or call
// the cookie-setting web endpoint /auth/microsoft* (02 §5.2). No token, ID token or authorization code is ever logged,
// shown, or put into an error.
//
// ── Email and password sign-in (AUTH-P1, ask A32, 02-AUTH.md §8) ──
// ⚠ ASSUMED contract: the endpoint is deployed on UAT but its source is not in the web clone, so nothing here is
// verified against source (src/types/mobile-password-contract.ts). signInWithPassword() is built to survive several
// plausible shapes instead of one guessed one:
// - the input goes under both `username` and `email`; the paths in MOBILE_PASSWORD_PATHS are tried in order, the next
//   only after a 404 with an HTML body, and the one that answers is remembered for this run of the app;
// - the 200 body goes through the SAME readSession() as AUTH-P2, with AUTH-P1's options: token, name and expiry
//   aliases, and only the token, user.id and user.role required;
// - a body without `user.countryId` is completed from AUTH-2 (GET /auth/me) or refused, never stored without it.
// The last path is the clone's /auth/login, which sets the `sd_session` cookie: harmless, because `withCredentials:
// false` keeps it out of the native cookie jar (mobile-password-contract.ts). The password is never logged, stored or
// put into an error: it exists only in the request body.
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
  MOBILE_PASSWORD_PATHS,
  MOBILE_SSO_PATH,
  USER_ROLES,
  type AuthConfigResponse,
  type AuthMeResponse,
  type AuthUser,
  type MobileLoginResponse,
  type MobilePasswordPath,
  type MobilePasswordRequest,
  type MobilePasswordResponse,
  type MobilePasswordUser,
  type MobileSsoRequest,
  type MobileSsoResponse,
  type MobileSsoUser,
  type UserRole,
} from '@/types';
import { apiClient, type MessageResponse } from './client';
import { checkFields, reportDrift, type FieldSpec } from './drift';
import { ApiClientError } from './errors';
import { AUTH_ME_OPTIONAL_SPEC, MOBILE_PASSWORD_OPTIONAL_SPEC, MOBILE_SSO_OPTIONAL_SPEC } from './responseSpecs';

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
      'The Entra client ID or tenant ID is still a placeholder or not a GUID. Fill them in src/config/auth.config.ts ' +
        'or set EXPO_PUBLIC_AZURE_CLIENT_ID / EXPO_PUBLIC_AZURE_TENANT_ID.',
    );
  }
  const idToken = await getMicrosoftIdToken(challenge);
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
async function getMicrosoftIdToken(challenge: boolean): Promise<string | null> {
  const redirectUri = getAuthRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId: AZURE_CLIENT_ID,
    redirectUri,
    scopes: [...AZURE_SCOPES],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true, // S256; the library refuses `plain`
    // Login: credentials even with a live Microsoft session (15-day rule). SelectAccount: as the web flow does.
    prompt: challenge ? AuthSession.Prompt.Login : AuthSession.Prompt.SelectAccount,
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

function isRecord(value: unknown): value is Record<string, unknown> {
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
interface UserReader {
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
interface SessionReader extends UserReader {
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

/** AUTH-P1, ASSUMED (mobile-password-contract.ts): every plausible name; only the token, user.id and user.role required. */
const AUTH_P1_READER: SessionReader = {
  endpoint: 'AUTH-P1',
  token: ['token', 'accessToken', 'sessionToken'] satisfies (keyof MobilePasswordResponse)[],
  expiry: ['expiresAt', 'expires_at', 'expiry'] satisfies (keyof MobilePasswordResponse)[],
  expiryRequired: false,
  name: ['name', 'displayName', 'fullName'] satisfies (keyof MobilePasswordUser)[],
  emailRequired: false,
  optionalSpec: MOBILE_PASSWORD_OPTIONAL_SPEC,
};

/** AUTH-2 `user` (01 AUTH-2; 03 §C AuthUser), read during an email sign-in to confirm `countryId`. */
const AUTH_2_READER: UserReader = {
  endpoint: 'AUTH-2',
  name: ['displayName'] satisfies (keyof AuthUser)[],
  emailRequired: false,
  optionalSpec: AUTH_ME_OPTIONAL_SPEC,
};

/** The value under `key` only when the object itself holds it, never one inherited from Object.prototype. */
function own(record: Record<string, unknown>, key: string): unknown {
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

interface UserReadout {
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
function readUser(value: unknown, reader: UserReader, problems: string[], knownEmail?: string): UserReadout | null {
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

interface SessionReadout<Expiry> extends UserReadout {
  token: string;
  /** null only where the reader allows it (AUTH-P1). Read but not used: the 8-hour clock applies (02 §5.4). */
  expiresAt: Expiry;
  /** The keys the token and the expiry came under. Key names only, for the email sign-in's log line. */
  tokenKey: string;
  expiryKey: string | null;
}

type SessionRead<Expiry> =
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
function readSession(data: unknown, reader: SessionReader & { readonly expiryRequired: true }): SessionRead<string>;
function readSession(data: unknown, reader: SessionReader, knownEmail?: string): SessionRead<string | null>;
function readSession(data: unknown, reader: SessionReader, knownEmail?: string): SessionRead<string | null> {
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

// ── Email and password sign-in (AUTH-P1, ASSUMED; ask A32) ───

/**
 * Why an email sign-in failed. The Login form shows a different message for each (signInAttempt.ts).
 * A JSON `{ error }` answer is the route's own: it exists and refused the request. Mapped by status, not by its text:
 * - `bad-request`          — 400: the server could not read the request. An app-side problem.
 * - `credentials-rejected` — 401: the email or the password was wrong. Never says which (neutralCredentialMessage).
 * - `account-disabled`     — 403.
 * - `refused`              — any other 4xx, a JSON 404 included.
 * - `server`               — 5xx; also a non-JSON error page, and a 404 whose body is not HTML.
 * JSON or not:
 * - `rate-limited`         — 429. The clone's login limiter allows 20 attempts per 15 minutes per IP (app.ts:87-92).
 * Path discovery and the 200 body:
 * - `unavailable`          — every path in MOBILE_PASSWORD_PATHS answered 404 with an HTML body: no such route here.
 * - `no-token`             — a 2xx JSON body with no token under any accepted key: no session the app can use.
 * - `unexpected-response`  — a 2xx that is not a JSON object, or `user`, `user.id` or `user.role` missing or wrong.
 * - `session-unconfirmed`  — the answer had no `user.countryId`, and AUTH-2 failed or disagreed, so it was refused.
 * Either side:
 * - `network`              — no answer at all: offline, DNS failure, timeout.
 */
export type PasswordSignInFailure =
  | 'bad-request'
  | 'credentials-rejected'
  | 'account-disabled'
  | 'refused'
  | 'server'
  | 'rate-limited'
  | 'unavailable'
  | 'no-token'
  | 'unexpected-response'
  | 'session-unconfirmed'
  | 'network';

export class PasswordSignInError extends Error {
  readonly reason: PasswordSignInFailure;
  /** HTTP status from the Service Desk, or null when there was none. */
  readonly status: number | null;
  /** The path that answered, e.g. `/auth/mobile/login`; null when none did. Shown on Login's Ref line. */
  readonly path: MobilePasswordPath | null;
  /** The `error` text of a JSON answer, fit to show (neutralCredentialMessage); null otherwise. */
  readonly serverMessage: string | null;
  /** For developers: what failed and where. Never holds the password or a token. */
  readonly detail: string;

  constructor(
    reason: PasswordSignInFailure,
    detail: string,
    { status = null, path = null, serverMessage = null }: { status?: number | null; path?: MobilePasswordPath | null; serverMessage?: string | null } = {},
  ) {
    super(`${reason}: ${detail}`);
    this.name = 'PasswordSignInError';
    this.reason = reason;
    this.status = status;
    this.path = path;
    this.serverMessage = serverMessage;
    this.detail = detail;
  }
}

/** A message that names both fields, or neither ("Invalid credentials", "Invalid email or password"). */
const NAMES_BOTH = /\bcredentials?\b|\b(e-?mail|user ?name|login)\b.{0,24}\b(or|and)\b.{0,24}\bpassword\b|\bpassword\b.{0,24}\b(or|and)\b.{0,24}\b(e-?mail|user ?name)\b/i;
/** A message that tells which one was wrong ("User not found in Active Directory", "Incorrect password"). */
const NAMES_ONE = /\bnot found\b|\bdoes ?n[o']?t exist\b|\bno such\b|\bunknown (user|account|e-?mail)\b|\bnot registered\b|\b(wrong|incorrect|invalid|bad)\b.{0,12}\b(password|e-?mail|user ?name)\b|\b(password|e-?mail|user ?name)\b.{0,12}\b(is )?(wrong|incorrect|invalid)\b/i;

/**
 * The server's `error` text, fit to show on Login: trimmed, or null when it is empty, longer than 200 characters, or
 * would tell the person whether the email or the password was wrong. The clone's LDAP path does that ("User not found
 * in Active Directory", 05 C.23); its local path does not ("Invalid credentials" for both, auth.service.ts:129-136).
 */
export function neutralCredentialMessage(said: string): string | null {
  const text = said.trim();
  if (text === '' || text.length > 200) return null;
  if (NAMES_ONE.test(text) && !NAMES_BOTH.test(text)) return null;
  return text;
}

export interface PasswordSignInSession {
  token: string;
  user: AuthUser;
  /** The path that answered. */
  path: MobilePasswordPath;
}

/**
 * The path that last gave a JSON answer, in this run of the app: later attempts start there. Only memory: a cold start
 * discovers it again. A 429 does not count, because the general limiter answers it in front of every route.
 */
let answeringPath: MobilePasswordPath | null = null;

/** Starts the next email sign-in from the first path again, as a fresh run of the app does. For tests. */
export function forgetPasswordSignInPath(): void {
  answeringPath = null;
}

function tryOrder(): readonly MobilePasswordPath[] {
  if (answeringPath === null) return MOBILE_PASSWORD_PATHS;
  return [answeringPath, ...MOBILE_PASSWORD_PATHS.filter((path) => path !== answeringPath)];
}

/** Express's "Cannot POST …" (01 §0.5): a 404 with an HTML body. The only answer that moves on to the next path. */
function isNoSuchRoute(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.kind === 'not-json' &&
    error.status === 404 &&
    (error.contentType ?? '').includes('text/html')
  );
}

/**
 * One `[auth]` line per answer, at debug level, in every build (as push's `[push]` lines): Metro, and logcat on a
 * device. Paths, statuses and key names only: never the email, the password, a token or a message from the server.
 */
function logAuth(message: string): void {
  console.debug(`[auth] email sign-in: ${message}`);
}

/**
 * AUTH-P1 — an email and a password → the app's session (ASSUMED contract, src/types/mobile-password-contract.ts).
 * Stores nothing: the caller passes the result to setSession(). Rejects with a PasswordSignInError.
 * `email` must already be trimmed and valid, and `password` non-empty: attemptPasswordSignIn() checks both first.
 */
export async function signInWithPassword(email: string, password: string): Promise<PasswordSignInSession> {
  // The same input under both names: the clone's /auth/login reads `username`, A32's proposal `email`.
  const body: MobilePasswordRequest = { username: email, email, password };
  let answer: { path: MobilePasswordPath; status: number; data: unknown } | null = null;

  for (const path of tryOrder()) {
    try {
      // skipAuth: there is no session yet, and a stale token must not ride along.
      const res = await apiClient.post<unknown>(path, body, { skipAuth: true });
      if (__DEV__ && res.headers['set-cookie'] !== undefined) {
        console.warn(`[API drift] AUTH-P1 POST /api/v1${path} sent Set-Cookie; the app expects no cookie (02 §2 #5)`);
      }
      answer = { path, status: res.status, data: res.data };
      break;
    } catch (e) {
      if (isNoSuchRoute(e)) {
        if (answeringPath === path) answeringPath = null;
        logAuth(`POST /api/v1${path} → 404 with an HTML body (no such route)`);
        continue;
      }
      // A JSON `{ error }` is the route's own answer, so the route exists: later attempts start here.
      if (e instanceof ApiClientError && e.kind === 'http' && e.status !== 429) answeringPath = path;
      const failure = classifyPasswordFailure(e, path);
      logAuth(`POST /api/v1${path} answered ${failure.status === null ? 'nothing' : `HTTP ${failure.status}`} (${failure.reason})`);
      throw failure;
    }
  }

  if (answer === null) {
    logAuth(`none of ${MOBILE_PASSWORD_PATHS.join(', ')} exists on ${API_HOST}`);
    throw new PasswordSignInError(
      'unavailable',
      `POST /api/v1{${MOBILE_PASSWORD_PATHS.join(', ')}} each answered 404 with an HTML body: no such route on ${API_HOST}`,
      { status: 404 },
    );
  }
  answeringPath = answer.path;
  return completeSession(answer, email);
}

/** Maps a failed request on `path` to the reason Login shows. Server messages are quoted in `detail`; they hold no token. */
function classifyPasswordFailure(error: unknown, path: MobilePasswordPath): PasswordSignInError {
  const at = `POST /api/v1${path}`;
  if (!(error instanceof ApiClientError)) {
    return new PasswordSignInError('server', `${at} failed on the device (${errorName(error)})`, { path });
  }
  const { kind, status } = error;
  if (kind === 'network' || kind === 'timeout') {
    return new PasswordSignInError('network', `${at}: ${kind === 'timeout' ? 'timed out' : 'no answer'} (${API_HOST})`, { path });
  }
  const http = `${at} → HTTP ${status ?? '?'}`;
  // Only a JSON `{ error }` holds the route's own words; for anything else `body.error` is the client's fallback text.
  const said = kind === 'http' ? error.body.error : null;
  const answer = said === null ? ` with a non-JSON body (${error.contentType || 'no content-type'})` : ` "${said}"`;
  const options = { status, path, serverMessage: said === null ? null : neutralCredentialMessage(said) };

  if (status === 429) return new PasswordSignInError('rate-limited', `${http}${answer}`, options);
  if (kind !== 'http') {
    if (status !== null && status >= 200 && status < 300) {
      return new PasswordSignInError('unexpected-response', `${http}, but the body is not a JSON object`, options);
    }
    // An IIS or proxy error page, or a 404 that is not HTML: not the route's own answer, so not read as 401/403.
    return new PasswordSignInError('server', `${http}${answer}`, options);
  }
  if (status === 400) return new PasswordSignInError('bad-request', `${http}${answer}: the request body was refused`, options);
  if (status === 401) return new PasswordSignInError('credentials-rejected', `${http}${answer}: the email or password was refused`, options);
  if (status === 403) return new PasswordSignInError('account-disabled', `${http}${answer}: the account is deactivated`, options);
  if (status !== null && status >= 400 && status < 500) return new PasswordSignInError('refused', `${http}${answer}`, options);
  return new PasswordSignInError('server', `${http}${answer}`, options);
}

/** The 2xx body as the session, completed from AUTH-2 when it has no `user.countryId`. */
async function completeSession(
  answer: { path: MobilePasswordPath; status: number; data: unknown },
  typedEmail: string,
): Promise<PasswordSignInSession> {
  const at = `POST /api/v1${answer.path}`;
  const read = readSession(answer.data, AUTH_P1_READER, typedEmail);
  if (!read.ok) {
    logAuth(`${at} answered HTTP ${answer.status} ${read.tokenMissing ? 'with no token' : 'without a usable user'}`);
    throw new PasswordSignInError(
      read.tokenMissing ? 'no-token' : 'unexpected-response',
      `${at} → ${answer.status}, but a required field is missing or wrong: ${read.problems.join('; ')}`,
      { status: answer.status, path: answer.path },
    );
  }
  const session = read.session;
  logAuth(
    `${at} answered HTTP ${answer.status}: token as "${session.tokenKey}", ` +
      `name as ${session.nameKey === null ? 'none (the email stands in)' : `"${session.nameKey}"`}, ` +
      `expiry as ${session.expiryKey === null ? 'none (the 8-hour clock applies)' : `"${session.expiryKey}"`}, ` +
      `countryId ${session.countryIdSent ? 'sent' : 'not sent, so asking GET /auth/me'}`,
  );
  const user = session.countryIdSent ? session.user : await confirmFromAuthMe(session, answer.path);
  return { token: session.token, user, path: answer.path };
}

/**
 * The answer had no `user.countryId`. Without it an AGENT would read as a triage agent in the UI (05 §A.12), so it is
 * taken from AUTH-2, the server's own record of the new session (auth.middleware.ts:46-53), before the sign-in
 * completes. Any failure, or an AUTH-2 user other than the one just signed in, REFUSES the sign-in: the new session is
 * ended on the server (AUTH-3) and nothing is stored. AUTH-2 also fills the name and email where the answer had none.
 */
async function confirmFromAuthMe(signedIn: SessionReadout<string | null>, path: MobilePasswordPath): Promise<AuthUser> {
  const refuse = async (why: string, status: number | null): Promise<never> => {
    await endUnusedSession(signedIn.token);
    logAuth(`GET /api/v1/auth/me ${why}; the sign-in was refused`);
    throw new PasswordSignInError(
      'session-unconfirmed',
      `the AUTH-P1 answer had no user.countryId, and AUTH-2 GET /api/v1/auth/me ${why}, so it could not be confirmed (05 §A.12)`,
      { status, path },
    );
  };

  let data: unknown;
  try {
    // The new token, by hand: it is not in the store yet. skipAuth keeps the interceptor from adding any other.
    const res = await apiClient.get<unknown>('/auth/me', { skipAuth: true, headers: { Authorization: `Bearer ${signedIn.token}` } });
    data = res.data;
  } catch (e) {
    if (!(e instanceof ApiClientError)) return refuse(`failed on the device (${errorName(e)})`, null);
    return refuse(e.status === null ? `got no answer (${e.kind})` : `→ HTTP ${e.status}`, e.status);
  }

  const problems: string[] = [];
  if (isRecord(data)) checkFields(AUTH_2_READER.endpoint, data, AUTH_2_READER.optionalSpec);
  const me = readUser(isRecord(data) ? own(data, 'user') : undefined, AUTH_2_READER, problems, signedIn.user.email);
  if (me === null) return refuse(`→ 200, but ${problems.join('; ')}`, 200);
  if (!me.countryIdSent) return refuse('→ 200, but user.countryId is missing or neither a string nor null', 200);
  if (me.user.id !== signedIn.user.id) return refuse('→ 200, but for a different user.id', 200);
  if (me.user.role !== signedIn.user.role) return refuse('→ 200, but with a different user.role', 200);

  return {
    ...signedIn.user,
    countryId: me.user.countryId,
    // Only where the sign-in answer had nothing of its own.
    displayName: signedIn.nameKey !== null ? signedIn.user.displayName : me.user.displayName,
    email: signedIn.emailSent ? signedIn.user.email : me.user.email,
    ldapSamAccount: signedIn.user.ldapSamAccount ?? me.user.ldapSamAccount,
  };
}

/** AUTH-3 for a session the app refused: best effort, and its answer is not read (02 §5.5). */
async function endUnusedSession(token: string): Promise<void> {
  try {
    await apiClient.post('/auth/logout', undefined, { skipAuth: true, headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // Nothing more to do: the session still ends on the server's own 8-hour clock.
  }
}
