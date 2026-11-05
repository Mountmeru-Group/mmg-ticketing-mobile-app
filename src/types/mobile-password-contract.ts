// AUTH-P1  email and password sign-in for the app   (ask A32; 01 §1.4, 02-AUTH.md §8)
// ⚠ ASSUMED, NOT VERIFIED AGAINST SOURCE (2026-11-05).
//   The backend team told Ronit that a mobile password-login endpoint is deployed on UAT with local auth on, but its
//   source has not been pushed: no branch of the web clone has it (docs/G9-PASSWORD-LOGIN.md). So the path, the
//   request keys and the response keys below are the plausible ones, each tolerated, not one confirmed shape. When the
//   backend team sends the contract, cut this file down to it, as AUTH-P2's was (mobile-sso-contract.ts).
//
//   paths    tried in MOBILE_PASSWORD_PATHS order; the next only after a 404 with an HTML body ("no such route")
//   request  { username, email, password }: the same input under both names (the clone's /auth/login reads `username`)
//   200      a token, a user with an id and a role; everything else optional, under any of the aliases below
//   errors   400 · 401 · 403 · 429 · 5xx as the clone's /auth/login and AUTH-P2 answer them (02-AUTH.md §8)
//
// EVERY wire name the app relies on for this endpoint is in THIS file. Like mobile-sso-contract.ts, and unlike the
// rest of src/types/, it is not copied from 03-DATA-MODEL.md. src/api/auth.api.ts readSession() maps it onto AuthUser.
import type { UUID } from './api';
import type { UserRole } from './enums';

/**
 * Under `/api/v1`, in the order they are tried. The first three are guesses at the new route; the last is the clone's
 * cookie-only web login (01 §1.5), tried in case the backend team added a token to its body. `withCredentials: false`
 * keeps that route's `sd_session` cookie out of the native cookie jar: React Native's Android networking swaps in
 * `CookieJar.NO_COOKIES` for such a request (react-native NetworkingModule.kt:371-373).
 */
export const MOBILE_PASSWORD_PATHS = ['/auth/mobile/login', '/auth/login/mobile', '/auth/mobile', '/auth/login'] as const;

export type MobilePasswordPath = (typeof MOBILE_PASSWORD_PATHS)[number];

/**
 * Request body. The person's input goes under BOTH `username` (the clone's /auth/login, `auth.controller.ts:9-12`) and
 * `email` (A32's proposal): a server ignores the key it does not read. `password` is never logged, stored or put into
 * an error; it exists only in the Login form's state and in this one request.
 */
export interface MobilePasswordRequest {
  username: string;
  email: string;
  password: string;
}

/**
 * `user` in the 200 body.
 * - REQUIRED: `id`, `role`. Missing, blank or the wrong type → sign-in fails with `unexpected-response`.
 * - OPTIONAL: the rest. `email` falls back to what the person typed; the name to the email.
 * - `countryId`: a string or null is kept as sent. MISSING, the app asks AUTH-2 (GET /auth/me) for it before the
 *   sign-in completes, and refuses the sign-in if that fails: a missing countryId would make an AGENT a triage agent
 *   in the UI (05 §A.12). The clone's /auth/login sends no countryId (auth.service.ts:167).
 * - Unknown extra keys are ignored.
 */
export interface MobilePasswordUser {
  id: UUID;
  role: UserRole;
  email?: string;
  /** The name, under the first of these that holds a non-blank string: AUTH-P2 says `name`, AUTH-2 `displayName`. */
  name?: string;
  displayName?: string;
  fullName?: string;
  countryId?: string | null;
  ldapSamAccount?: string | null;
}

/** 200 body. There must be no `Set-Cookie`: a cookie overrides the Bearer header (02 §2 #5). */
export interface MobilePasswordResponse {
  /** REQUIRED, under the first of these that holds a non-blank string. The MMG session token. Never logged. */
  token?: string;
  accessToken?: string;
  sessionToken?: string;
  /** REQUIRED (for its `id` and `role`). */
  user: MobilePasswordUser;
  /** OPTIONAL, under any of these. Read but not used, as AUTH-P2's: the app's 8-hour clock applies (02 §5.4). */
  expiresAt?: string;
  expires_at?: string;
  expiry?: string;
}
