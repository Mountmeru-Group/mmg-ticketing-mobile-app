// M1 Login (04 §2.1, 02-AUTH.md §7). Layout: "arc split" (2026-10-30, docs/brand/UI-STANDARDS.md §10).
// - "Sign in with Microsoft" runs the native flow in src/api/auth.api.ts (ask A2): Microsoft's page in the system
//   browser, then AUTH-P2. The session goes to setSession(); RootNavigator then switches to the app.
// - Every failure reason has its own message (05 §A.13 wording where one applies) and a Retry only where trying
//   again can help. Closing Microsoft's page just returns here: no error, and the button is a button again.
// - The attempt itself, the messages and the stale-banner rule are in ./signInAttempt.ts; the button and its motion
//   are ./SignInButton.tsx; this file only lays out.
// - The environment chip shows on every build except production (SHOW_ENVIRONMENT_CHIP, src/config/env.ts).
// - This is the only way into the app: the __DEV__ developer-token screen was deleted on 2026-10-29.
// TODO(later phase):
// - AUTH-1 decides which buttons show; `microsoftEnabled` describes the WEB SSO only (01 AUTH-1).
// - SYS-1 health check on start / after a network error.
// - Never: password form (production is SSO only), /auth/test-login, WebView cookie lifting (02 §6).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo, OfflineBanner, OutlineButton } from '@/components';
import { getAuthRedirectUri } from '@/config/auth.config';
import { ENVIRONMENT_LABEL, SHOW_ENVIRONMENT_CHIP } from '@/config/env';
import { useSingleFlight } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, loginLayout, loginType, palette } from '@/theme';
import type { AuthStackScreenProps } from '@/types';
import { SignInButton } from './SignInButton';
import { FAILURE_COPY, attemptSignIn, createStaleFailureGuard, type Failure, type SignInOutcome } from './signInAttempt';

const { reference, logoCard } = loginLayout;

/** The redirect URI this build sends to Microsoft (src/config/auth.config.ts), for the __DEV__ hint. */
function describeRedirectUri(): string {
  try {
    return getAuthRedirectUri();
  } catch {
    return '(could not be built: check `scheme` in app.json)';
  }
}

export function LoginScreen(_props: AuthStackScreenProps<'Login'>) {
  const signOutMessage = useAuthStore((s) => s.signOutMessage);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
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

  // The circles follow the screen: x and size with its width, y with its height (390 × 844 reference).
  const sx = width / reference.width;
  const sy = height / reference.height;

  return (
    <View style={styles.screen}>
      {/* White icons on the red card. Leaving Login restores the app's dark ones (App.tsx). */}
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={[styles.card, { minHeight: height * loginLayout.cardHeight, paddingTop: insets.top }]}>
          {loginLayout.circles.map((c) => {
            const size = c.size * sx;
            return (
              <View
                key={`${c.x},${c.y}`}
                style={[styles.circle, { width: size, height: size, borderRadius: size / 2, left: c.x * sx - size / 2, top: c.y * sy - size / 2 }]}
              />
            );
          })}
          {/* Same place as on every other screen: the top of the screen, full width. */}
          <OfflineBanner />
          <View style={styles.cardContent}>
            <View style={styles.logoCard}>
              <BrandLogo width={logoCard.width - 2 * logoCard.padX} height={logoCard.height - 2 * logoCard.padY} />
            </View>
            <View style={styles.grow} />
            <Text accessibilityRole="header" maxFontSizeMultiplier={loginType.headlineMaxScale} style={styles.headline}>
              {'One portal\nfor all your\nIT needs.'}
            </Text>
            <Text style={styles.subline}>Raise, track and resolve issues across the whole of Mount Meru Group.</Text>
          </View>
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
          {signOutMessage && !failure ? (
            <View className="mb-4 self-stretch rounded-lg bg-red-50 p-3">
              <Text className="text-sm text-red-800">{signOutMessage}</Text>
            </View>
          ) : null}

          {failure && copy ? (
            <View accessibilityRole="alert" className="mb-4 self-stretch rounded-lg bg-red-50 p-3">
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

          <View style={styles.signIn}>
            <Text style={styles.wordmark}>Setu</Text>
            <Text style={styles.prompt}>Sign in with your work account</Text>
            <View style={styles.button}>
              <SignInButton busy={signingIn} onPress={startSignIn} />
            </View>
            {/* Which backend this build talks to, for testers (04 M1). Never on a production build. */}
            {SHOW_ENVIRONMENT_CHIP ? (
              <View accessibilityLabel={`Connected to ${ENVIRONMENT_LABEL}`} className="mt-3 rounded-full bg-amber-100 px-2.5 py-0.5">
                <Text className="text-xs font-semibold text-amber-800">{ENVIRONMENT_LABEL}</Text>
              </View>
            ) : null}
            {__DEV__ ? (
              <View className="mt-4 self-stretch rounded-xl border border-dashed border-amber-400 bg-amber-50 p-4">
                <Text className="font-mono text-xs text-amber-900">
                  Redirect URI sent to Microsoft: {describeRedirectUri()}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.footer}>Mount Meru Group IT</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1 },
  // Under the status bar (paddingTop is the inset), rounded at the bottom only. It clips the circles.
  card: {
    backgroundColor: colors.login.card,
    borderBottomLeftRadius: loginLayout.cardRadius,
    borderBottomRightRadius: loginLayout.cardRadius,
    overflow: 'hidden',
  },
  circle: { position: 'absolute', backgroundColor: colors.login.circle },
  cardContent: {
    flexGrow: 1,
    paddingHorizontal: loginLayout.gutter,
    paddingTop: loginLayout.cardTopPadding,
    paddingBottom: loginLayout.cardBottomPadding,
  },
  logoCard: {
    width: logoCard.width,
    height: logoCard.height,
    borderRadius: logoCard.radius,
    paddingHorizontal: logoCard.padX,
    paddingVertical: logoCard.padY,
    backgroundColor: colors.login.logoCard,
  },
  grow: { flexGrow: 1, minHeight: loginLayout.cardTopPadding },
  headline: { color: colors.login.headline, ...loginType.headline },
  subline: { marginTop: 12, maxWidth: loginLayout.sublineMaxWidth, color: colors.login.subline, ...loginType.subline },
  bottom: { flexGrow: 1, alignItems: 'center', paddingHorizontal: loginLayout.gutter, paddingTop: 28 },
  signIn: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  wordmark: { color: colors.text.primary, ...loginType.wordmark },
  prompt: { marginTop: 2, color: colors.text.secondary, ...loginType.prompt },
  button: { marginTop: 20 },
  // "Light grey" in the design, but gray-400 is 2.5:1 on white: text.secondary (4.8:1) is the lightest that passes.
  footer: { marginTop: 20, color: colors.text.secondary, textAlign: 'center', ...loginType.footer },
});
