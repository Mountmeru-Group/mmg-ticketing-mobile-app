// ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
// ║  ⚠  ASSUMED CONTRACT — NOT CONFIRMED BY THE BACKEND TEAM  ⚠                                  ║
// ║  AUTH-P2  POST /api/v1/auth/microsoft/mobile   (ask A2; 01 §1.4, 02-AUTH.md §7)               ║
// ║                                                                                              ║
// ║  ASSUMED:  request  { idToken: string }                                                      ║
// ║            200      { token: string, expiresAt: ISO-8601 string, user: AuthUser }, NO cookie  ║
// ║                                                                                              ║
// ║  The endpoint did not exist on any web branch on 2026-10-19 (docs/web-system/10-A2-STATUS.md).║
// ║  EVERY wire name the app relies on for it is in THIS file. If the backend team answers with   ║
// ║  different names or statuses, change them here — one line each — and nothing else.           ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
// The app's own copy of a session is `MobileLoginResponse` (user.ts, from 03 §C). It keeps its names whatever the
// wire uses: src/api/auth.api.ts reads the wire through MOBILE_SSO_WIRE and builds a MobileLoginResponse from it.
// Unlike the rest of src/types/ this file is not copied from 03-DATA-MODEL.md: the endpoint is not in the API yet.
import type { ISODateString } from './api';
import type { AuthUser } from './user';

/** AUTH-P2 path under `/api/v1`. */
export const MOBILE_SSO_PATH = '/auth/microsoft/mobile';

/** ⚠ ASSUMED wire field names. The types below and the request/response handling in auth.api.ts follow them. */
export const MOBILE_SSO_WIRE = {
  /** Request: the Microsoft ID token (a JWT; `aud` = the mobile app's client ID). Never logged. */
  idToken: 'idToken',
  /** Response: the MMG session token, the same opaque UUID the web keeps in the `sd_session` cookie. Never logged. */
  token: 'token',
  /** Response: absolute session expiry, ISO-8601. Read but not used yet: the app keeps its 8-hour rule (02 §5.4). */
  expiresAt: 'expiresAt',
  /** Response: the signed-in account, all six AuthUser fields (03 §C, the same shape as AUTH-2 `user`). */
  user: 'user',
} as const;

type Wire = typeof MOBILE_SSO_WIRE;

/** ⚠ ASSUMED request body. */
export type MobileSsoRequest = Record<Wire['idToken'], string>;

/** ⚠ ASSUMED 200 body. There must be no `Set-Cookie`: a cookie overrides the Bearer header (02 §2 #5). */
export type MobileSsoResponse = Record<Wire['token'], string> &
  Record<Wire['expiresAt'], ISODateString> &
  Record<Wire['user'], AuthUser>;

/**
 * ⚠ ASSUMED — how the endpoint says "the Microsoft sign-in is valid, but no Service Desk account matches it":
 * this status with a JSON `{ error }` body, e.g. `404 { "error": "User not found" }`.
 * - Today's web flow never says this: it auto-creates unknown users as END_USER (10-A2-STATUS §4.3), so the case may
 *   never happen. The backend team must confirm either way.
 * - A 404 that is NOT JSON (Express's HTML "Cannot POST …", or an IIS page) means the route itself is not deployed.
 *   So does a JSON 404 whose error is exactly MOBILE_SSO_ROUTE_NOT_FOUND_ERROR (the catch-all ask A11 proposes).
 */
export const MOBILE_SSO_NO_ACCOUNT_STATUS = 404;
export const MOBILE_SSO_ROUTE_NOT_FOUND_ERROR = 'Not found';

/**
 * ⚠ ASSUMED — a 401/403 whose `error` matches this means the account exists but is deactivated. The service throws
 * 'Account is deactivated'; the middleware says 'Account deactivated' (10-A2-STATUS §4.3 decision 2). Any other
 * 401/403 means the Microsoft token itself was refused.
 */
export const MOBILE_SSO_DEACTIVATED_ERROR = /deactivated/i;
