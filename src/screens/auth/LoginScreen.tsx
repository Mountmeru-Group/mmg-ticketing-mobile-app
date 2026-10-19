// M1 Login (04 §2.1, 02-AUTH.md §7).
// - "Sign in with Microsoft" runs the native flow in src/api/auth.api.ts (ask A2): Microsoft's page in the system
//   browser, then AUTH-P2. The session goes to setSession(); RootNavigator then switches to the app.
// - Every failure reason has its own message (05 §A.13 wording where one applies) and a Retry only where trying
//   again can help. Closing Microsoft's page just returns here: no error, no spinner.
// - The environment badge stays visible (04 M1).
// TODO(later phase):
// - AUTH-1 decides which buttons show; `microsoftEnabled` describes the WEB SSO only (01 AUTH-1).
// - SYS-1 health check on start / after a network error.
// - Never: password form (production is SSO only), /auth/test-login, WebView cookie lifting (02 §6).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  MicrosoftSignInError,
  signInWithMicrosoft,
  type MicrosoftSignInFailure,
  type MicrosoftSignInResult,
} from '@/api/auth.api';
import { useIsOffline } from '@/api/network';
import { OfflineBanner } from '@/components';
import { getAuthRedirectUri } from '@/config/auth.config';
import { ENVIRONMENT_LABEL } from '@/config/env';
import { useSingleFlight } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import type { AuthStackScreenProps } from '@/types';

/** `storage`: signed in, but SecureStore refused the session. */
type FailureReason = MicrosoftSignInFailure | 'storage';

interface Failure {
  reason: FailureReason;
  status: number | null;
  /** Developer detail from MicrosoftSignInError. Never holds a token. Shown in __DEV__ builds only. */
  detail: string;
}

const FAILURE_COPY: Record<FailureReason, { title: string; message: string; retryLabel?: string }> = {
  // ── the four cases that must be told apart ──
  'endpoint-missing': {
    title: "App sign-in isn't available yet",
    message:
      "Microsoft accepted your sign-in, but this Service Desk server can't sign in the mobile app yet. Your account " +
      'is fine. Try again after the Service Desk has been updated.',
  },
  'token-rejected': {
    title: 'Sign-in was refused',
    message:
      'The Service Desk did not accept your Microsoft sign-in. Make sure you chose your Mount Meru work account, then ' +
      'try again. If it keeps happening, contact IT support.',
    retryLabel: 'Try again',
  },
  'no-account': {
    title: 'No Service Desk account',
    message:
      'You signed in to Microsoft, but there is no Service Desk account for that Microsoft account. Contact IT ' +
      'support to get access, or sign in with a different account.',
    retryLabel: 'Use a different account',
  },
  network: {
    title: "Can't connect",
    message: "Couldn't reach Microsoft or the Service Desk. Check your connection and try again.",
    retryLabel: 'Try again',
  },
  // ── the rest ──
  'not-configured': {
    title: 'Microsoft sign-in is not configured.', // 05 §A.13 oauth_not_configured
    message: 'This build of the app is missing its Microsoft sign-in settings. Contact IT support.',
  },
  microsoft: {
    title: 'Microsoft sign-in failed',
    message: 'Microsoft sign-in failed. Please try again.', // 05 §A.13 oauth_failed
    retryLabel: 'Try again',
  },
  'account-disabled': {
    title: 'Account deactivated',
    message: 'Your account has been deactivated. Contact IT support.', // 05 §A.13 account_deactivated
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

/** The redirect URI this build sends to Microsoft (src/config/auth.config.ts), for the __DEV__ hint. */
function describeRedirectUri(): string {
  try {
    return getAuthRedirectUri();
  } catch {
    return '(could not be built: check `scheme` in app.json)';
  }
}

export function LoginScreen({ navigation }: AuthStackScreenProps<'Login'>) {
  const signOutMessage = useAuthStore((s) => s.signOutMessage);
  const setSession = useAuthStore((s) => s.setSession);
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  const [signingIn, setSigningIn] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // `disabled` applies only after a re-render: a fast double-tap must not open Microsoft's page twice.
  const once = useSingleFlight();

  async function signIn() {
    setFailure(null);
    setSigningIn(true);

    let result: MicrosoftSignInResult;
    try {
      result = await signInWithMicrosoft();
    } catch (e) {
      setFailure(
        e instanceof MicrosoftSignInError
          ? { reason: e.reason, status: e.status, detail: e.detail }
          : { reason: 'microsoft', status: null, detail: 'Unexpected error outside the sign-in flow' },
      );
      setSigningIn(false);
      return;
    }
    if (result.type === 'cancelled') {
      setSigningIn(false); // closed Microsoft's page: back to the button, nothing to report
      return;
    }

    try {
      // The 8-hour rule runs from now (issuedAt), as before; AUTH-P2's expiresAt is not used yet (02 §5.4).
      await setSession({ token: result.session.token, user: result.session.user });
      // RootNavigator switches to the app; this screen unmounts.
    } catch {
      setFailure({ reason: 'storage', status: null, detail: 'SecureStore refused to save the session' });
      setSigningIn(false);
    }
  }

  const startSignIn = () => void once(signIn);
  const copy = failure ? FAILURE_COPY[failure.reason] : null;

  return (
    <View className="flex-1 bg-gray-50">
      <View style={{ paddingTop: insets.top }} className="bg-gray-50" />
      <ScrollView contentContainerClassName="p-4 pb-12">
        {offline ? (
          <View className="mb-3 overflow-hidden rounded-lg">
            <OfflineBanner />
          </View>
        ) : null}

        <View className="mb-4 rounded-xl bg-white p-4">
          <Text className="text-2xl font-bold text-gray-900">MMG Service Desk</Text>
          <Text className="mt-1 text-sm text-gray-600">Sign in with your Mount Meru work account.</Text>
          {/* Which backend this build talks to, always visible to testers (04 M1). */}
          <View
            accessibilityLabel={`Connected to ${ENVIRONMENT_LABEL}`}
            className="mt-3 self-start rounded-lg bg-amber-100 px-2.5 py-1"
          >
            <Text className="text-xs font-semibold text-amber-800">{ENVIRONMENT_LABEL}</Text>
          </View>
        </View>

        {signOutMessage && !failure ? (
          <View className="mb-3 rounded-lg bg-red-50 p-3">
            <Text className="text-sm text-red-800">{signOutMessage}</Text>
          </View>
        ) : null}

        {failure && copy ? (
          <View accessibilityRole="alert" className="mb-3 rounded-lg bg-red-50 p-3">
            <View className="flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#b91c1c" />
              <View className="ml-2 flex-1">
                <Text className="text-sm font-semibold text-red-900">{copy.title}</Text>
                <Text className="mt-1 text-sm text-red-800">{copy.message}</Text>
                <Text className="mt-2 text-xs text-red-700">
                  Ref: {failure.reason}
                  {failure.status !== null ? ` · HTTP ${failure.status}` : ''}
                </Text>
                {__DEV__ ? <Text className="mt-1 font-mono text-[11px] text-red-700">{failure.detail}</Text> : null}
              </View>
            </View>
            {copy.retryLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={startSignIn}
                disabled={signingIn}
                className="mt-3 self-end rounded-lg border border-red-300 bg-white px-3 py-2"
              >
                <Text className="text-sm font-semibold text-red-800">{copy.retryLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: signingIn, busy: signingIn }}
          disabled={signingIn}
          onPress={startSignIn}
          className={`h-12 flex-row items-center justify-center rounded-lg px-4 ${signingIn ? 'bg-gray-300' : 'bg-blue-600 active:bg-blue-700'}`}
        >
          {signingIn ? (
            <ActivityIndicator color="#4b5563" />
          ) : (
            <Ionicons name="logo-microsoft" size={18} color="#ffffff" />
          )}
          <Text className={`ml-2 text-base font-semibold ${signingIn ? 'text-gray-600' : 'text-white'}`}>
            {signingIn ? 'Signing in…' : 'Sign in with Microsoft'}
          </Text>
        </Pressable>
        {signingIn ? (
          <Text className="mt-2 text-center text-xs text-gray-500">
            Finish on the Microsoft page. Close it to cancel.
          </Text>
        ) : null}

        {__DEV__ ? (
          <View className="mt-6 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-4">
            <Text className="text-xs text-amber-900">
              Developer build: if Microsoft sign-in is not ready yet (AUTH-P2 not deployed), the developer token
              below is the fallback.
            </Text>
            <Text className="mt-2 font-mono text-[11px] text-amber-900">
              Redirect URI sent to Microsoft: {describeRedirectUri()}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('DevToken')}
              className="mt-3 rounded-lg border border-amber-500 bg-white px-4 py-3"
            >
              <Text className="text-center font-medium text-amber-900">Developer: use a UAT session token</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
