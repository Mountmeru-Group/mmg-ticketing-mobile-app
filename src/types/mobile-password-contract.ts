// AUTH-P1  email and password sign-in for the app   (ask A32; 01 §1.4, 02-AUTH.md §8)
// iOS (iOS-5g, 2026-11-06): the PATH is confirmed by the backend team: POST /api/v1/auth/mobile/login, live on UAT. It is
// the only sign-in path iOS calls. No list of paths, no fallback, never POST /auth/login (01 §iOS-A).
// The request and the 200 are Android's, as d8626bc sends and accepts them on that path (Ronit, 2026-11-06: 1a, 2a):
//
//   request  { username, email, password }: the same input under both names, exactly Android's body
//   200      a token, a user with an id and a role; everything else optional, under any of the aliases below
//   errors   400 · 401 · 403 · 429 · 5xx as the clone's /auth/login and AUTH-P2 answer them (02-AUTH.md §8)
//   cookie   ⏳ whether the 200 sets one is NOT yet confirmed: an open item that blocks shipping to testers
//            (docs/ios/APP-STORE-COMPLIANCE.md, G9 section)
//
// EVERY wire name the app relies on for this endpoint is in THIS file. Like mobile-sso-contract.ts, and unlike the
// rest of src/types/, it is not copied from 03-DATA-MODEL.md. src/api/passwordSignIn.api.ts reads it through
// readSession() (src/api/auth.api.ts) and maps it onto AuthUser.
// iOS: imported directly, never through src/types/index.ts, so that a production bundle, which has no email sign-in
// (LoginScreen.tsx), does not carry this module either.
import type { UUID } from './api';
import type { UserRole } from './enums';

/**
 * Under `/api/v1`: the one path, confirmed by the backend team (2026-11-06). `withCredentials: false` (client.ts) sets
 * `HTTPShouldHandleCookies = NO` on the request in React Native's iOS networking (RCTNetworking.mm:319), so no cookie
 * from the shared jar rides along; whether iOS stores a `Set-Cookie` from the answer is the open item above.
 */
export const MOBILE_PASSWORD_PATH = '/auth/mobile/login';

export type MobilePasswordPath = typeof MOBILE_PASSWORD_PATH;

/**
 * Request body: Android's. The person's input goes under BOTH `username` (the clone's /auth/login, `auth.controller.ts:9-12`)
 * and `email` (A32's proposal): a server ignores the key it does not read. `password` is never logged, stored or put
 * into an error; it exists only in the Login form's state and in this one request.
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
