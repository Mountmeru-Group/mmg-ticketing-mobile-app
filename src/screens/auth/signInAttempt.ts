// M1 Login without the UI: one sign-in attempt, what each failure says, and when a failure banner goes stale.
// Kept out of LoginScreen.tsx (which only renders) so tests run this exact code under Node: tests/auth/mobile-sso.test.mjs.
import type { AppStateStatus } from 'react-native';

import {
  MicrosoftSignInError,
  signInWithMicrosoft,
  type MicrosoftSignInFailure,
  type MicrosoftSignInResult,
} from '@/api/auth.api';
import { isReauthDue, useAuthStore } from '@/store/auth.store';

/** `storage`: signed in, but SecureStore refused the session. */
export type FailureReason = MicrosoftSignInFailure | 'storage';

export interface Failure {
  reason: FailureReason;
  status: number | null;
  /** Developer detail from MicrosoftSignInError. Never holds a token. Shown in __DEV__ builds only. */
  detail: string;
}

export type SignInOutcome = { type: 'cancelled' } | { type: 'signed-in' } | { type: 'failed'; failure: Failure };

/**
 * Microsoft sign-in, then AUTH-P2, then setSession(). On `signed-in` the session is stored and RootNavigator switches
 * to the app. On `cancelled` (the person closed Microsoft's page) nothing happened and there is nothing to report.
 *
 * The 15-day re-authentication (02 §5.8) is decided here, before Microsoft's page opens. When it is due (no date, or
 * the 15 days are up), Microsoft is told to challenge (prompt=login), and only that sign-in starts a new 15 days. An
 * ordinary re-sign-in within them (after the 8-hour expiry or a 401) offers the account picker and keeps the date.
 */
export async function attemptSignIn(): Promise<SignInOutcome> {
  const challenge = isReauthDue(useAuthStore.getState().fullAuthAt);
  let result: MicrosoftSignInResult;
  try {
    result = await signInWithMicrosoft({ challenge });
  } catch (e) {
    return {
      type: 'failed',
      failure:
        e instanceof MicrosoftSignInError
          ? { reason: e.reason, status: e.status, detail: e.detail }
          : { reason: 'microsoft', status: null, detail: 'Unexpected error outside the sign-in flow' },
    };
  }
  if (result.type === 'cancelled') return { type: 'cancelled' };

  try {
    // The 8-hour rule runs from now (issuedAt), as before; AUTH-P2's expiresAt is not used yet (02 §5.4).
    // fullAuthAt only after a challenged sign-in; left undefined, setSession() keeps the stored date.
    const fullAuthAt = challenge ? Date.now() : undefined;
    await useAuthStore.getState().setSession({ token: result.session.token, user: result.session.user, fullAuthAt });
    return { type: 'signed-in' };
  } catch {
    return { type: 'failed', failure: { reason: 'storage', status: null, detail: 'SecureStore refused to save the session' } };
  }
}

export const FAILURE_COPY: Record<FailureReason, { title: string; message: string; retryLabel?: string }> = {
  // ── AUTH-P2's own answers: 401, 403, 400 (500 is `server`, below) ──
  'token-rejected': {
    title: 'Sign-in was refused',
    message:
      'The Service Desk did not accept your Microsoft sign-in. Make sure you chose your Mount Meru work account, then ' +
      'try again. If it keeps happening, contact IT support.',
    retryLabel: 'Try again',
  },
  'account-disabled': {
    title: 'Account deactivated',
    message: 'Your account has been deactivated. Contact IT support.', // 05 §A.13 account_deactivated
  },
  'bad-request': {
    title: "Sign-in request wasn't accepted",
    message:
      "The Service Desk couldn't read this app's sign-in request, so you were not signed in. Please report this to IT " +
      'support.',
  },
  // ── the rest ──
  'endpoint-missing': {
    title: "App sign-in isn't available yet",
    message:
      "Microsoft accepted your sign-in, but this Service Desk server can't sign in the mobile app yet. Your account " +
      'is fine. Try again after the Service Desk has been updated.',
  },
  network: {
    title: "Can't connect",
    message: "Couldn't reach Microsoft or the Service Desk. Check your connection and try again.",
    retryLabel: 'Try again',
  },
  'not-configured': {
    title: 'Microsoft sign-in is not configured.', // 05 §A.13 oauth_not_configured
    message: 'This build of the app is missing its Microsoft sign-in settings. Contact IT support.',
  },
  microsoft: {
    title: 'Microsoft sign-in failed',
    message: 'Microsoft sign-in failed. Please try again.', // 05 §A.13 oauth_failed
    retryLabel: 'Try again',
  },
  'rate-limited': {
    title: 'Too many attempts',
    message: 'There have been too many sign-in attempts from this network. Wait a few minutes, then try again.',
  },
  'unexpected-response': {
    title: "Sign-in couldn't be completed",
    message:
      "The Service Desk replied in a way this version of the app doesn't understand, so you were not signed in. " +
      'Please report this to IT support.',
  },
  server: {
    title: 'The Service Desk had a problem',
    message: "The Service Desk couldn't complete your sign-in. Try again in a few minutes.",
    retryLabel: 'Try again',
  },
  storage: {
    title: "Couldn't save your sign-in",
    message: "You signed in, but this phone couldn't store the session securely. Try again.",
    retryLabel: 'Try again',
  },
};

/** How long the person must have been away before an old failure banner is dropped on their return. */
export const STALE_FAILURE_AFTER_MS = 5 * 60 * 1000;

/**
 * A failure banner belongs to the attempt the person just made. A cold start already clears it (it is component state),
 * but Android keeps the app alive in the background, and Back on Login only backgrounds it. Reopened later, an old
 * banner would read as a fresh failure.
 *
 * Feed every AppState change to the returned function. It answers true when the app comes back after being away for
 * STALE_FAILURE_AFTER_MS or more while no sign-in was running. Microsoft's page itself sends the app to the background
 * mid-sign-in: that does not count as leaving.
 */
export function createStaleFailureGuard(
  isSigningIn: () => boolean,
  now: () => number = Date.now,
): (next: AppStateStatus) => boolean {
  let leftIdleAt: number | null = null;
  return (next) => {
    if (next === 'background') {
      leftIdleAt = isSigningIn() ? null : now();
      return false;
    }
    if (next !== 'active' || leftIdleAt === null) return false;
    const stale = now() - leftIdleAt >= STALE_FAILURE_AFTER_MS;
    leftIdleAt = null;
    return stale;
  };
}
