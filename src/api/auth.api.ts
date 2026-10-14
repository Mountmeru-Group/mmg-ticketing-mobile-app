// Auth + health endpoints used by M1 Login and session start-up (01 §1, 02-AUTH.md).
//
// ┌─ WHY THERE IS NO WORKING LOGIN IN THIS FILE (02-AUTH.md §1–§2, §4) ────────────────────────────┐
// │ The backend hands its session token (`sd_session`, an opaque UUID) ONLY as an httpOnly cookie.   │
// │ - React Native JavaScript cannot read httpOnly cookies, so the token can never reach SecureStore. │
// │ - The native cookie jar (OkHttp) may store and replay that cookie on its own, outside app control,│
// │   and the server checks the cookie BEFORE the Bearer header — after user B signs in, requests can │
// │   still run as user A (02 §2 #5). So mobile must never call a cookie-setting endpoint.             │
// │ - Production is Microsoft Entra ID SSO ONLY, via a confidential-client redirect that needs the    │
// │   web client secret and ends on the web domain with the cookie set inside the browser (02 §2 #2). │
// │ Fix = backend ask A2: native SSO with a public-client app registration (PKCE, no secret) plus a  │
// │ token-exchange endpoint, AUTH-P2 `POST /auth/microsoft/mobile { idToken }` → `{ token, expiresAt, │
// │ user }` with no cookie. Until A2 ships the SSO functions below throw.                            │
// │ Never: scrape Set-Cookie, call /auth/test-login, lift the session out of a WebView, ship a secret │
// │ (02 §6). No username/password path exists here: production is SSO only (AUTH-P1 / A1 not used).  │
// └───────────────────────────────────────────────────────────────────────────────────────────────────┘
import { HEALTH_URL } from '@/config/env';
import type { AuthConfigResponse, AuthMeResponse, MobileLoginResponse } from '@/types';
import { apiClient, type MessageResponse } from './client';

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

// ── PENDING: Microsoft SSO (ask A2) — signatures only ────────

/**
 * Interactive Microsoft sign-in: system browser + PKCE against the A2 public-client app registration,
 * then exchangeMicrosoftIdToken(). Needs A2 and an auth library (not installed in Phase 1).
 */
export async function signInWithMicrosoft(): Promise<MobileLoginResponse> {
  throw new Error('BLOCKED: backend ask A2 pending');
}

/**
 * AUTH-P2 — POST /api/v1/auth/microsoft/mobile `{ idToken }` → `{ token, expiresAt, user }`, no cookie.
 * PENDING (01 §1.4): this endpoint does not exist yet. Do not call it until A2 ships.
 */
export async function exchangeMicrosoftIdToken(_idToken: string): Promise<MobileLoginResponse> {
  throw new Error('BLOCKED: backend ask A2 pending');
}
