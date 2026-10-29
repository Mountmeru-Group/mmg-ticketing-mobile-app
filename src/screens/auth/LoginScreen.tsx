// M1 Login (04 §2.1, 02-AUTH.md §7).
// - "Sign in with Microsoft" runs the native flow in src/api/auth.api.ts (ask A2): Microsoft's page in the system
//   browser, then AUTH-P2. The session goes to setSession(); RootNavigator then switches to the app.
// - Every failure reason has its own message (05 §A.13 wording where one applies) and a Retry only where trying
//   again can help. Closing Microsoft's page just returns here: no error, no spinner.
// - The attempt itself, the messages and the stale-banner rule are in ./signInAttempt.ts; this file only renders.
// - The environment badge stays visible (04 M1).
// TODO(later phase):
// - AUTH-1 decides which buttons show; `microsoftEnabled` describes the WEB SSO only (01 AUTH-1).
// - SYS-1 health check on start / after a network error.
// - Never: password form (production is SSO only), /auth/test-login, WebView cookie lifting (02 §6).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo, OfflineBanner, OutlineButton, SubmitButton } from '@/components';
import { getAuthRedirectUri } from '@/config/auth.config';
import { ENVIRONMENT_LABEL } from '@/config/env';
import { useSingleFlight } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { maxTextScale, palette } from '@/theme';
import type { AuthStackScreenProps } from '@/types';
import { FAILURE_COPY, attemptSignIn, createStaleFailureGuard, type Failure, type SignInOutcome } from './signInAttempt';

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
  const insets = useSafeAreaInsets();
  const [signingIn, setSigningIn] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // `disabled` applies only after a re-render: a fast double-tap must not open Microsoft's page twice.
  const once = useSingleFlight();
  // Read by the AppState listener, which must not re-subscribe on every render.
  const inFlight = useRef(false);

  // An old failure banner must not greet someone reopening the app as if it had just failed (signInAttempt.ts).
  useEffect(() => {
    const isStale = createStaleFailureGuard(() => inFlight.current);
    const subscription = AppState.addEventListener('change', (next) => {
      if (isStale(next)) setFailure(null);
    });
    return () => subscription.remove();
  }, []);

  async function signIn() {
    setFailure(null);
    setSigningIn(true);
    inFlight.current = true;
    let outcome: SignInOutcome;
    try {
      outcome = await attemptSignIn();
    } finally {
      inFlight.current = false;
    }
    // signed-in: RootNavigator switches to the app and this screen unmounts, so the spinner stays until then.
    if (outcome.type === 'signed-in') return;
    if (outcome.type === 'failed') setFailure(outcome.failure);
    setSigningIn(false); // cancelled: closed Microsoft's page, back to the button with nothing to report
  }

  const startSignIn = () => void once(signIn);
  const copy = failure ? FAILURE_COPY[failure.reason] : null;

  return (
    <View className="flex-1 bg-gray-50">
      <View style={{ paddingTop: insets.top }} className="bg-gray-50" />
      {/* Same place as on every other screen: the top of the screen, full width. */}
      <OfflineBanner />
      <ScrollView contentContainerClassName="flex-grow justify-center p-4 pb-12">
        {/* The web's login card: logo centred, the app name as the heading, one line of help. */}
        <View className="mb-4 items-center rounded-xl border border-border bg-white px-4 py-6">
          <BrandLogo height={64} />
          <Text accessibilityRole="header" className="mt-4 text-center text-2xl font-bold text-gray-900" maxFontSizeMultiplier={maxTextScale.title1}>
            Setu
          </Text>
          <Text className="mt-1 text-center text-sm text-gray-500">Sign in with your Mount Meru work account.</Text>
          {/* Which backend this build talks to, always visible to testers (04 M1). */}
          <View
            accessibilityLabel={`Connected to ${ENVIRONMENT_LABEL}`}
            className="mt-3 rounded-full bg-amber-100 px-2.5 py-0.5"
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
              <Ionicons name="alert-circle" size={18} color={palette.red[700]} />
              <View className="ml-2 flex-1">
                <Text className="text-sm font-semibold text-red-900">{copy.title}</Text>
                <Text className="mt-1 text-sm text-red-800">{copy.message}</Text>
                <Text className="mt-2 text-xs text-red-700">
                  Ref: {failure.reason}
                  {failure.status !== null ? ` · HTTP ${failure.status}` : ''}
                </Text>
                {__DEV__ ? <Text className="mt-1 font-mono text-xs text-red-700">{failure.detail}</Text> : null}
              </View>
            </View>
            {copy.retryLabel ? (
              <View className="mt-3 self-end">
                <OutlineButton label={copy.retryLabel} tone="danger" onPress={startSignIn} disabled={signingIn} />
              </View>
            ) : null}
          </View>
        ) : null}

        <SubmitButton
          label={signingIn ? 'Signing in…' : 'Sign in with Microsoft'}
          icon="logo-microsoft"
          onPress={startSignIn}
          loading={signingIn}
        />
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
            <Text className="mt-2 font-mono text-xs text-amber-900">
              Redirect URI sent to Microsoft: {describeRedirectUri()}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Developer: use a UAT session token"
              onPress={() => navigation.navigate('DevToken')}
              className="mt-3 min-h-11 justify-center rounded-lg border border-amber-500 bg-white px-4 py-2"
            >
              <Text className="text-center font-medium text-amber-900">Developer: use a UAT session token</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
