// Session state (02-AUTH.md §5).
// - The token lives ONLY in expo-secure-store and in memory. Never AsyncStorage, logs or analytics (02 §5.1).
// - The Axios interceptor reads the in-memory copy, never SecureStore, on each request (02 §5.1).
// - There is NO refresh token and NO refresh endpoint (02 §1.1). A session is good for 8 hours from
//   `issuedAt`, then it is treated as logged out. A 401 from the server is still the final word (02 §5.4).
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

export interface NewSession {
  token: string;
  user: AuthUser;
  /** Epoch ms. Defaults to now. Replace with the server's `expiresAt` once A2 returns it (02 §4). */
  issuedAt?: number;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** Epoch ms when the session was obtained. */
  issuedAt: number | null;
  isAuthenticated: boolean;
  /** True until restoreSession() has run on boot. */
  isLoading: boolean;
  /** Shown once on the Login screen after a forced sign-out (02 §5.3). */
  signOutMessage: string | null;

  setSession: (session: NewSession) => Promise<void>;
  clearSession: (message?: string | null) => Promise<void>;
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

  setSession: async ({ token, user, issuedAt = Date.now() }) => {
    await SecureStore.setItemAsync(KEYS.token, token);
    await SecureStore.setItemAsync(KEYS.issuedAt, String(issuedAt));
    await SecureStore.setItemAsync(KEYS.user, JSON.stringify(user));
    set({ token, user, issuedAt, isAuthenticated: true, isLoading: false, signOutMessage: null });
  },

  clearSession: async (message = null) => {
    // Flip state synchronously first, so a burst of parallel 401s produces one sign-out (02 §5.3).
    set({ ...LOGGED_OUT, signOutMessage: message });
    await wipeStoredSession();
  },

  restoreSession: async () => {
    set({ isLoading: true });
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
