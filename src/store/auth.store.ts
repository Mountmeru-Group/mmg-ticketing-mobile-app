// Session state (02-AUTH.md §5).
// - The token lives ONLY in expo-secure-store and in memory. Never AsyncStorage, logs or analytics (02 §5.1).
// - The Axios interceptor reads the in-memory copy, never SecureStore, on each request (02 §5.1).
// - There is NO refresh token and NO refresh endpoint (02 §1.1). A session is good for 8 hours from
//   `issuedAt`, then it is treated as logged out. A 401 from the server is still the final word (02 §5.4).
// - On top of that, every 15 days the user is signed out and Microsoft must challenge the next sign-in (02 §5.8).
//   That clock is `fullAuthAt`, kept under its own key: an 8-hour sign-out never touches it.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { USER_ROLES, type AuthUser } from '@/types';

/** SESSION_TTL_HOURS default is 8 and absolute (02 §1.1). */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const SESSION_ENDED_MESSAGE = 'Your session has ended. Please sign in again.';

const KEYS = {
  token: 'mmg.session.token',
  issuedAt: 'mmg.session.issuedAt',
  // AuthUser holds no secret. It is stored here only because AsyncStorage is not installed.
  // From Phase 3 it is refreshed from GET /auth/me on every cold start (02 §5.1).
  user: 'mmg.session.user',
} as const;

export function isSessionExpired(issuedAt: number, now: number = Date.now()): boolean {
  return now - issuedAt >= SESSION_TTL_MS;
}

// ── 15-day forced re-authentication (02 §5.8) ────────────────

/**
 * The forced re-authentication interval: 15 days. Once this long has passed since the last sign-in that Microsoft was
 * told to challenge (prompt=login), the session ends and the next sign-in is challenged again.
 * Change it here and nowhere else: the checks, the next challenge and the Login notice ("every 15 days") all read it.
 * Keep it a whole number of days, so the notice reads well.
 */
export const REAUTH_INTERVAL_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * How far in the future the stored date may be before it counts as a clock moved back rather than network-time drift.
 * Beyond it, the date can no longer be trusted, so re-authentication is due.
 */
export const REAUTH_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

const REAUTH_DAYS = Math.round(REAUTH_INTERVAL_MS / (24 * 60 * 60 * 1000));

/** Login's notice after the 15-day sign-out: why it happened, not an error. The message is the store's signOutMessage. */
export const REAUTH_NOTICE = {
  title: 'Signed out for security',
  message: `Please sign in again. Setu asks for a fresh Microsoft sign-in every ${REAUTH_DAYS === 1 ? 'day' : `${REAUTH_DAYS} days`}.`,
} as const;

/** Epoch ms of the last challenged sign-in. Not in KEYS: wipeStoredSession() (every 8-hour sign-out) leaves it alone. */
const FULL_AUTH_KEY = 'mmg.auth.fullAuthAt';

/**
 * True when Microsoft must challenge the next sign-in, and a live session must end:
 * - no date (first sign-in, after a sign-out) or one that was missing, corrupt or unreadable (null);
 * - REAUTH_INTERVAL_MS or more since it, including a clock moved forward past it;
 * - a date more than REAUTH_CLOCK_TOLERANCE_MS in the future: the clock was moved back, so the date proves nothing.
 */
export function isReauthDue(fullAuthAt: number | null, now: number = Date.now()): boolean {
  if (fullAuthAt === null || !Number.isFinite(fullAuthAt)) return true;
  const elapsed = now - fullAuthAt;
  return elapsed >= REAUTH_INTERVAL_MS || elapsed < -REAUTH_CLOCK_TOLERANCE_MS;
}

/** The stored date, or null when it is missing or not what setSession() writes (a positive whole number). */
function parseFullAuthAt(raw: string | null): number | null {
  if (raw === null || !/^\d{1,15}$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 ? value : null;
}

/** Never throws: an unreadable Keystore counts as no date, so re-authentication is due. */
async function readFullAuthAt(): Promise<number | null> {
  try {
    return parseFullAuthAt(await SecureStore.getItemAsync(FULL_AUTH_KEY));
  } catch {
    return null;
  }
}

async function forgetStoredFullAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(FULL_AUTH_KEY).catch(() => undefined);
}

export interface NewSession {
  token: string;
  user: AuthUser;
  /**
   * Epoch ms. Defaults to now. AUTH-P2 also returns `expiresAt`, but it is not used yet: the 8-hour rule from
   * `issuedAt` stays until the backend confirms the contract (02 §7), and a 401 is still the final word.
   */
  issuedAt?: number;
  /**
   * Epoch ms of this sign-in, only when Microsoft was told to challenge it (prompt=login): the 15 days restart from it.
   * Left out, the stored date is kept: an ordinary re-sign-in within the 15 days, or re-storing the same session
   * (useProfile.ts), never moves it (02 §5.8).
   */
  fullAuthAt?: number;
}

export interface ClearSessionOptions {
  /**
   * Also delete the 15-day date, so the next sign-in is challenged and starts a new 15 days: a sign-out by the user,
   * or the 15-day sign-out itself. Left out (401, 8-hour expiry), the date is kept.
   */
  forgetFullAuth?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** Epoch ms when the session was obtained. */
  issuedAt: number | null;
  /**
   * Epoch ms of the last sign-in Microsoft was told to challenge, or null (none, or unreadable). Outlives the session:
   * the next sign-in reads it to decide whether to challenge (02 §5.8).
   */
  fullAuthAt: number | null;
  isAuthenticated: boolean;
  /** True until restoreSession() has run on boot. */
  isLoading: boolean;
  /** Shown once on the Login screen after a forced sign-out (02 §5.3). */
  signOutMessage: string | null;

  setSession: (session: NewSession) => Promise<void>;
  clearSession: (message?: string | null, options?: ClearSessionOptions) => Promise<void>;
  restoreSession: () => Promise<void>;
}

const LOGGED_OUT = {
  user: null,
  token: null,
  issuedAt: null,
  isAuthenticated: false,
  isLoading: false,
} as const;

async function wipeStoredSession(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined)),
  );
}

function parseStoredUser(raw: string | null): AuthUser | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const candidate = value as Partial<AuthUser>;
    if (typeof candidate.id !== 'string' || typeof candidate.displayName !== 'string') return null;
    if (!USER_ROLES.includes(candidate.role as AuthUser['role'])) return null;
    return candidate as AuthUser;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...LOGGED_OUT,
  isLoading: true,
  signOutMessage: null,
  fullAuthAt: null,

  setSession: async ({ token, user, issuedAt = Date.now(), fullAuthAt }) => {
    await SecureStore.setItemAsync(KEYS.token, token);
    await SecureStore.setItemAsync(KEYS.issuedAt, String(issuedAt));
    await SecureStore.setItemAsync(KEYS.user, JSON.stringify(user));
    // Last, so a failed session write never leaves a fresh date behind (a cold start wipes the partial session).
    if (fullAuthAt !== undefined) await SecureStore.setItemAsync(FULL_AUTH_KEY, String(fullAuthAt));
    set({
      token, user, issuedAt, isAuthenticated: true, isLoading: false, signOutMessage: null,
      ...(fullAuthAt !== undefined ? { fullAuthAt } : {}),
    });
  },

  clearSession: async (message = null, { forgetFullAuth = false } = {}) => {
    // Flip state synchronously first, so a burst of parallel 401s produces one sign-out (02 §5.3).
    set({ ...LOGGED_OUT, signOutMessage: message, ...(forgetFullAuth ? { fullAuthAt: null } : {}) });
    await wipeStoredSession();
    if (forgetFullAuth) await forgetStoredFullAuth();
  },

  restoreSession: async () => {
    set({ isLoading: true });
    // Read on its own: a missing, corrupt or unreadable date means "due", and never fails the session read (02 §5.8).
    const fullAuthAt = await readFullAuthAt();
    set({ fullAuthAt });
    try {
      const [token, issuedAtRaw, userRaw] = await Promise.all([
        SecureStore.getItemAsync(KEYS.token),
        SecureStore.getItemAsync(KEYS.issuedAt),
        SecureStore.getItemAsync(KEYS.user),
      ]);
      const issuedAt = issuedAtRaw === null ? Number.NaN : Number(issuedAtRaw);
      const user = parseStoredUser(userRaw);

      if (!token || !Number.isFinite(issuedAt) || !user) {
        await wipeStoredSession();
        set({ ...LOGGED_OUT, signOutMessage: null });
        return;
      }
      // Before the 8-hour rule: when both are due, Login says why and Microsoft challenges the next sign-in.
      if (isReauthDue(fullAuthAt)) {
        await wipeStoredSession();
        await forgetStoredFullAuth();
        set({ ...LOGGED_OUT, signOutMessage: REAUTH_NOTICE.message, fullAuthAt: null });
        return;
      }
      if (isSessionExpired(issuedAt)) {
        await wipeStoredSession();
        set({ ...LOGGED_OUT, signOutMessage: SESSION_ENDED_MESSAGE });
        return;
      }
      set({ token, user, issuedAt, isAuthenticated: true, isLoading: false, signOutMessage: null });
    } catch {
      // Android Keystore can fail to decrypt after a device restore (08 §8.2). Treat as logged out.
      await wipeStoredSession();
      set({ ...LOGGED_OUT, signOutMessage: null });
    }
  },
}));
