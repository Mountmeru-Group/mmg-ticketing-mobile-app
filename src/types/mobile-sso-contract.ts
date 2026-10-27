// AUTH-P2  POST /api/v1/auth/microsoft/mobile   (ask A2; 01 §1.4, 02-AUTH.md §7.5)
// ✅ CONFIRMED by the backend team on 2026-10-19 and deployed to UAT (docs/web-system/10-A2-STATUS.md §0).
//
//   request  { idToken: string }
//   200      { token, user: MobileSsoUser, expiresAt }, no cookie
//   errors   400 malformed · 401 token rejected · 403 deactivated · 500 server error, all JSON `{ error }`
//   There is NO "no account" answer: the backend auto-creates an unknown Microsoft user as END_USER.
//
// EVERY wire name the app relies on for this endpoint is in THIS file. Unlike the rest of src/types/ it is not copied
// from 03-DATA-MODEL.md: it follows the backend team's answer (02-AUTH.md §7.5).
//
// ⚠ Two different user shapes. Do not merge them into one type:
//   AUTH-P2 `user`  { id, email, name, role, countryId, ldapSamAccount, department, phone }   (MobileSsoUser, below)
//   AUTH-2  `user`  { id, email, displayName, role, ldapSamAccount, countryId }               (AuthUser, user.ts, 03 §C)
// The app's own session (`MobileLoginResponse`, user.ts) holds an AuthUser. src/api/auth.api.ts readSession() is the
// one place that maps the wire shape onto it.
import type { ISODateString, UUID } from './api';
import type { UserRole } from './enums';

/** AUTH-P2 path under `/api/v1`. */
export const MOBILE_SSO_PATH = '/auth/microsoft/mobile';

/** Request body. */
export interface MobileSsoRequest {
  /** The Microsoft ID token (a JWT; `aud` = the mobile app's client ID). Never logged. */
  idToken: string;
}

/**
 * `user` in the 200 body.
 * - REQUIRED: `id`, `email`, `role`. Missing, blank or the wrong type → sign-in fails with `unexpected-response`.
 * - OPTIONAL: the rest (`?` below). Missing or the wrong type → an `[API drift]` line in __DEV__
 *   (MOBILE_SSO_OPTIONAL_SPEC, src/api/responseSpecs.ts). Never a sign-in failure.
 * - Unknown extra keys are ignored.
 * `null` is accepted where the column is nullable in schema.prisma `User`.
 */
export interface MobileSsoUser {
  id: UUID;
  email: string;
  role: UserRole;
  /** The person's name. AuthUser calls it `displayName`. */
  name?: string;
  countryId?: string | null;
  ldapSamAccount?: string | null;
  /** A string, NOT `departmentId`. Not kept in the session: AuthUser has no department (USR-1 does). */
  department?: string | null;
  /** Not kept in the session: AuthUser has no phone (USR-1 does). */
  phone?: string | null;
}

/** 200 body. There must be no `Set-Cookie`: a cookie overrides the Bearer header (02 §2 #5). */
export interface MobileSsoResponse {
  /** REQUIRED. The MMG session token, the same opaque UUID the web keeps in the `sd_session` cookie. Never logged. */
  token: string;
  /** REQUIRED (for its `id`, `email` and `role`). */
  user: MobileSsoUser;
  /** REQUIRED. Absolute session expiry, ISO-8601. Read but not used yet: the app keeps its 8-hour rule (02 §5.4). */
  expiresAt: ISODateString;
}
