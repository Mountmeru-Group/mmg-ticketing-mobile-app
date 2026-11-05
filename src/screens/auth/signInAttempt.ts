// M1 Login without the UI: one sign-in attempt, what each failure says, and when a failure banner goes stale.
// Kept out of LoginScreen.tsx (which only renders) so tests run this exact code under Node: tests/auth/mobile-sso.test.mjs
// (Microsoft) and tests/auth/password-sign-in.test.mjs (email and password).
import type { AppStateStatus } from 'react-native';

import {
  MicrosoftSignInError,
  PasswordSignInError,
  signInWithMicrosoft,
  signInWithPassword,
  type MicrosoftSignInFailure,
  type MicrosoftSignInResult,
  type PasswordSignInFailure,
  type PasswordSignInSession,
} from '@/api/auth.api';
import { isReauthDue, useAuthStore } from '@/store/auth.store';
import type { MobilePasswordPath } from '@/types';

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

// ── Email and password (AUTH-P1, ASSUMED contract; 02-AUTH.md §8) ──

/** `invalid-input`: refused on the phone, nothing sent. `storage`: signed in, but SecureStore refused the session. */
export type PasswordFailureReason = PasswordSignInFailure | 'invalid-input' | 'storage';

export interface PasswordFailure {
  reason: PasswordFailureReason;
  status: number | null;
  /** The path that answered, for the Ref line. */
  path: MobilePasswordPath | null;
  /** The server's own words, fit to show: they never say whether the email or the password was wrong. */
  serverMessage: string | null;
  /** Developer detail from PasswordSignInError. Never holds the password or a token. Shown in __DEV__ builds only. */
  detail: string;
}

export type PasswordSignInOutcome = { type: 'signed-in' } | { type: 'failed'; failure: PasswordFailure };

/** "name@domain.tld" with no spaces: enough to catch a typo before sending, never a full RFC 5322 check. */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export interface EmailSignInInput {
  /** Trimmed. */
  email: string;
  password: string;
}

/**
 * What is wrong with the form before anything is sent, per field, or null when it may be sent. The email is checked
 * trimmed; the password is never trimmed (a space can be part of it) and must not be empty.
 */
export function checkEmailSignIn({ email, password }: EmailSignInInput): { email?: string; password?: string } | null {
  const problems: { email?: string; password?: string } = {};
  if (email.trim() === '') problems.email = 'Enter your email address.';
  else if (!EMAIL_FORMAT.test(email.trim())) problems.email = 'Enter a valid email address, like name@mountmerugroup.com.';
  if (password === '') problems.password = 'Enter your password.';
  return problems.email || problems.password ? problems : null;
}

/**
 * Email and password, then setSession(). On `signed-in` the session is stored and RootNavigator switches to the app.
 * The password is passed straight to the one sign-in request and is never kept, logged or put into the outcome.
 *
 * The session is stored exactly as after Microsoft sign-in: same store, same 8-hour rule from now (issuedAt), same
 * 15-day clock (02 §5.8). A password is a full credential check, as a challenged Microsoft sign-in is, so the 15 days
 * start again from it (fullAuthAt). Without that, a phone with no 15-day date would sign the person out again on the
 * app's next cold start.
 */
export async function attemptPasswordSignIn(email: string, password: string): Promise<PasswordSignInOutcome> {
  const typed = email.trim();
  // Belt and braces: the form checks first, and nothing invalid is ever sent.
  if (checkEmailSignIn({ email: typed, password }) !== null) {
    return {
      type: 'failed',
      failure: { reason: 'invalid-input', status: null, path: null, serverMessage: null, detail: 'Refused on the phone: email format or empty password' },
    };
  }
  let session: PasswordSignInSession;
  try {
    session = await signInWithPassword(typed, password);
  } catch (e) {
    return {
      type: 'failed',
      failure:
        e instanceof PasswordSignInError
          ? { reason: e.reason, status: e.status, path: e.path, serverMessage: e.serverMessage, detail: e.detail }
          : { reason: 'server', status: null, path: null, serverMessage: null, detail: 'Unexpected error outside the sign-in flow' },
    };
  }

  try {
    await useAuthStore.getState().setSession({ token: session.token, user: session.user, fullAuthAt: Date.now() });
    return { type: 'signed-in' };
  } catch {
    return {
      type: 'failed',
      failure: { reason: 'storage', status: null, path: session.path, serverMessage: null, detail: 'SecureStore refused to save the session' },
    };
  }
}

/** `microsoft`: the failure box offers "Sign in with Microsoft", because only Microsoft can get past it. */
export const PASSWORD_FAILURE_COPY: Record<
  PasswordFailureReason,
  { title: string; message: string; microsoft?: boolean }
> = {
  // ── The route's own JSON answers ──
  'credentials-rejected': {
    title: 'Sign-in was refused',
    // Shown only when the server sent no message fit to show. Never says which of the two was wrong.
    message: "The email or password isn't right. Check both, then try again.",
  },
  'account-disabled': {
    title: 'Account deactivated',
    message: 'Your account has been deactivated. Contact IT support.', // 05 §A.13 account_deactivated
  },
  'bad-request': {
    title: "Sign-in request wasn't accepted",
    message: "The Service Desk couldn't read this app's sign-in request, so you were not signed in. Please report this to IT support.",
    microsoft: true,
  },
  refused: {
    title: "Email sign-in wasn't accepted",
    message: 'The Service Desk turned this email sign-in down. Sign in with Microsoft instead, or contact IT support.',
    microsoft: true,
  },
  'rate-limited': {
    title: 'Too many attempts',
    message: 'Too many sign-in attempts have been made from this network. Wait 15 minutes, then try again.',
  },
  server: {
    title: 'The Service Desk had a problem',
    message: "The Service Desk couldn't complete your sign-in. Try again in a few minutes.",
  },
  // ── No route, or an answer the app can't use: password sign-in is unavailable ──
  unavailable: {
    title: "Email sign-in isn't available",
    message: "This Service Desk server doesn't offer email sign-in to the app. Sign in with Microsoft instead.",
    microsoft: true,
  },
  'no-token': {
    title: "Email sign-in isn't available",
    message: "The Service Desk answered, but without a session this app can use, so you were not signed in. Sign in with Microsoft instead.",
    microsoft: true,
  },
  'unexpected-response': {
    title: "Sign-in couldn't be completed",
    message: "The Service Desk replied in a way this version of the app doesn't understand, so you were not signed in. Please report this to IT support.",
    microsoft: true,
  },
  'session-unconfirmed': {
    title: "Sign-in couldn't be confirmed",
    message: "The Service Desk didn't confirm your account's country, so you were not signed in. Try again, or sign in with Microsoft.",
    microsoft: true,
  },
  // ── Either side ──
  network: {
    title: "Can't connect",
    message: "Couldn't reach the Service Desk. Check your connection and try again.",
  },
  'invalid-input': {
    title: 'Check the form',
    message: 'Enter a valid email address and your password.',
  },
  storage: {
    title: "Couldn't save your sign-in",
    message: "You signed in, but this phone couldn't store the session securely. Try again.",
  },
};

/**
 * What the failure box shows. A refused sign-in (401, or another 4xx) shows the server's own words where they are fit
 * to show (neutralCredentialMessage: never which field was wrong); every other JSON answer adds them as a quote.
 */
export function passwordFailureText(failure: PasswordFailure): { title: string; message: string; quote: string | null } {
  const copy = PASSWORD_FAILURE_COPY[failure.reason];
  const own = failure.reason === 'credentials-rejected' || failure.reason === 'refused';
  if (own && failure.serverMessage !== null) return { title: copy.title, message: failure.serverMessage, quote: null };
  return { title: copy.title, message: copy.message, quote: failure.serverMessage };
}

/** The Ref line: reason, HTTP status and the path that answered. Shown on every build, so a tester can report it. */
export function passwordFailureRef(failure: PasswordFailure): string {
  return [failure.reason, failure.status !== null ? `HTTP ${failure.status}` : null, failure.path]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

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
