// M1 Login, email and password, without the UI (G9; 02-AUTH.md §8): one sign-in attempt, the form's own checks, and what
// each failure says. Android keeps this in signInAttempt.ts (d8626bc); on iOS (iOS-5g) it is its own module, which only
// EmailSignInForm.tsx imports, so a production bundle (no email sign-in, LoginScreen.tsx) carries none of it. The code
// and every message are Android's. Tests run this exact code under Node: tests/auth/password-sign-in.test.mjs.
import {
  PasswordSignInError,
  signInWithPassword,
  type PasswordSignInFailure,
  type PasswordSignInSession,
} from '@/api/passwordSignIn.api';
import { useAuthStore } from '@/store/auth.store';
import type { MobilePasswordPath } from '@/types/mobile-password-contract';

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
