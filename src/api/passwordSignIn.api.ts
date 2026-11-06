// Email and password sign-in (AUTH-P1, ask A32, 02-AUTH.md §8): Android's (d8626bc) on the ONE confirmed path.
// iOS (iOS-5g, 2026-11-06): the backend team confirmed POST /api/v1/auth/mobile/login, live on UAT. It is the only
// sign-in path this module calls: no list of paths, no fallback, never POST /auth/login (01 §iOS-A). Everything else is
// Android's, by Ronit's 1a and 2a: the request `{ username, email, password }`, and the 200 read through the SAME
// readSession() as AUTH-P2 (src/api/auth.api.ts) with AUTH-P1's options (token, name and expiry aliases; only the
// token, user.id and user.role required). A body without `user.countryId` is completed from AUTH-2 (GET /auth/me) or
// refused, never stored without it.
// - Only a UAT build bundles this module: LoginScreen.tsx loads the form behind a build-time gate, so a production
//   bundle has no email sign-in code or string (scripts/verify-release-bundle.js).
// - Cookies: `withCredentials: false` (client.ts) sends no jar cookie (React Native's RCTNetworking.mm:319). Whether the
//   answer sets one is not yet confirmed: an open item that blocks shipping to testers (APP-STORE-COMPLIANCE.md, G9).
// - The password is never logged, stored or put into an error: it exists only in the request body.
import { API_HOST } from '@/config/env';
import type { AuthUser } from '@/types';
import {
  MOBILE_PASSWORD_PATH,
  type MobilePasswordPath,
  type MobilePasswordRequest,
  type MobilePasswordResponse,
  type MobilePasswordUser,
} from '@/types/mobile-password-contract';
import {
  errorName, isRecord, own, readSession, readUser, type SessionReader, type SessionReadout, type UserReader,
} from './auth.api';
import { apiClient } from './client';
import { checkFields, type FieldSpec } from './drift';
import { ApiClientError } from './errors';

const S = ['string'] as const;
const S_NULL = ['string', 'null'] as const;

/**
 * AUTH-P1 200 body (src/types/mobile-password-contract.ts): the OPTIONAL single-name fields only. The alias groups (the
 * token, the name, the expiry) are reported by readSession() itself, as "none of … present". A missing
 * `user.countryId` is also what makes the app ask AUTH-2 for it (below). Android keeps this in responseSpecs.ts; on iOS
 * it lives here, so a production bundle does not carry it.
 */
const MOBILE_PASSWORD_OPTIONAL_SPEC: readonly FieldSpec[] = [
  { path: 'user.email', kinds: S },
  { path: 'user.countryId', kinds: S_NULL },
  { path: 'user.ldapSamAccount', kinds: S_NULL },
];

/**
 * AUTH-2 body when it is read during an email sign-in, to confirm `countryId` (01 AUTH-2, 03 §C `AuthUser`): the
 * OPTIONAL fields only. `user.id`, `user.role` and the presence of `user.countryId` are checked by readUser().
 */
const AUTH_ME_OPTIONAL_SPEC: readonly FieldSpec[] = [
  { path: 'user.email', kinds: S },
  { path: 'user.displayName', kinds: S },
  { path: 'user.ldapSamAccount', kinds: S_NULL },
];

/** AUTH-P1 (mobile-password-contract.ts): Android's names; only the token, user.id and user.role required. */
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

/**
 * Why an email sign-in failed. The Login form shows a different message for each (passwordSignInAttempt.ts).
 * A JSON `{ error }` answer is the route's own: it exists and refused the request. Mapped by status, not by its text:
 * - `bad-request`          — 400: the server could not read the request. An app-side problem.
 * - `credentials-rejected` — 401: the email or the password was wrong. Never says which (neutralCredentialMessage).
 * - `account-disabled`     — 403.
 * - `refused`              — any other 4xx, a JSON 404 included.
 * - `server`               — 5xx; also a non-JSON error page, and a 404 whose body is not HTML.
 * JSON or not:
 * - `rate-limited`         — 429. The clone's login limiter allows 20 attempts per 15 minutes per IP (app.ts:87-92).
 * The route and the 200 body:
 * - `unavailable`          — the path answered 404 with an HTML body: no such route on this server. iOS: one path, so
 *                            this ends the attempt (Android went on to its next path).
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
  /** The path that answered (`/auth/mobile/login`); null when it did not. Shown on Login's Ref line. */
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

/** Express's "Cannot POST …" (01 §0.5): a 404 with an HTML body. The only answer that means "no such route". */
function isNoSuchRoute(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.kind === 'not-json' &&
    error.status === 404 &&
    (error.contentType ?? '').includes('text/html')
  );
}

/**
 * One `[auth]` line per answer, at debug level, in every UAT build (as Android's): Metro, and the device log. The path,
 * statuses and key names only: never the email, the password, a token or a message from the server.
 */
function logAuth(message: string): void {
  console.debug(`[auth] email sign-in: ${message}`);
}

/**
 * AUTH-P1 — an email and a password → the app's session (src/types/mobile-password-contract.ts).
 * Stores nothing: the caller passes the result to setSession(). Rejects with a PasswordSignInError.
 * `email` must already be trimmed and valid, and `password` non-empty: attemptPasswordSignIn() checks both first.
 */
export async function signInWithPassword(email: string, password: string): Promise<PasswordSignInSession> {
  // Android's body: the same input under both names (Ronit, 1a).
  const body: MobilePasswordRequest = { username: email, email, password };
  const path = MOBILE_PASSWORD_PATH;
  let answer: { path: MobilePasswordPath; status: number; data: unknown };
  try {
    // skipAuth: there is no session yet, and a stale token must not ride along.
    const res = await apiClient.post<unknown>(path, body, { skipAuth: true });
    if (res.headers['set-cookie'] !== undefined) {
      // The value is never logged. The open item (no Set-Cookie) is unanswered: say so, in every UAT build.
      logAuth(`POST /api/v1${path} sent Set-Cookie; the app expects no cookie (02 §2 #5)`);
      if (__DEV__) console.warn(`[API drift] AUTH-P1 POST /api/v1${path} sent Set-Cookie; the app expects no cookie (02 §2 #5)`);
    }
    answer = { path, status: res.status, data: res.data };
  } catch (e) {
    if (isNoSuchRoute(e)) {
      logAuth(`POST /api/v1${path} → 404 with an HTML body (no such route on ${API_HOST})`);
      throw new PasswordSignInError(
        'unavailable',
        `POST /api/v1${path} answered 404 with an HTML body: no such route on ${API_HOST}`,
        { status: 404 },
      );
    }
    const failure = classifyPasswordFailure(e, path);
    logAuth(`POST /api/v1${path} answered ${failure.status === null ? 'nothing' : `HTTP ${failure.status}`} (${failure.reason})`);
    throw failure;
  }
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
