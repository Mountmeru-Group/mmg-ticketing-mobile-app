// M1 Login (04 §2.1, 02-AUTH.md §7). Layout: "arc split" (2026-10-30, docs/brand/UI-STANDARDS.md §10).
// - "Sign in with Microsoft" runs the native flow in src/api/auth.api.ts (ask A2): Microsoft's page in the system
//   browser, then AUTH-P2. The session goes to setSession(); RootNavigator then switches to the app.
// - Every failure reason has its own message (05 §A.13 wording where one applies) and a Retry only where trying
//   again can help. Closing Microsoft's page just returns here: no error, and the button is a button again.
// - After the 15-day sign-out (02 §5.8) the message slot says why ("Signed out for security"), in the info tone.
// - The attempt itself, the messages and the stale-banner rule are in ./signInAttempt.ts; the button and its motion
//   are ./SignInButton.tsx; this file only lays out.
// - The environment chip shows on every build except production (SHOW_ENVIRONMENT_CHIP, src/config/env.ts).
// - The footer's year is the device's (src/utils/copyright.ts), read as the Home greeting reads the time: never written.
// - Below the pill, on UAT builds only (EMAIL_SIGN_IN_ENABLED): email and password sign-in, ./EmailSignInForm.tsx
//   (2026-11-05, ASSUMED contract, 02-AUTH.md §8). Microsoft stays the primary action. The two sign-ins share one
//   single flight, and the pill is locked while an email sign-in runs. With the form open, Login scrolls to its end
//   whenever the keyboard opens or the content grows, so the keyboard never covers the form's Sign in button.
// - These are the only ways into the app: the __DEV__ developer-token screen was deleted on 2026-10-29.
// TODO(later phase):
// - AUTH-1 decides which buttons show; `microsoftEnabled` describes the WEB SSO only (01 AUTH-1).
// - SYS-1 health check on start / after a network error.
// - Never: /auth/test-login, WebView cookie lifting (02 §6).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, KeyboardAvoidingView, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo, OfflineBanner, OutlineButton } from '@/components';
import { getAuthRedirectUri } from '@/config/auth.config';
import { EMAIL_SIGN_IN_ENABLED, ENVIRONMENT_LABEL, SHOW_ENVIRONMENT_CHIP } from '@/config/env';
import { reduceMotionEnabled, useSingleFlight } from '@/hooks';
import { REAUTH_NOTICE, useAuthStore } from '@/store/auth.store';
import { colors, loginLayout, loginType, palette } from '@/theme';
import type { AuthStackScreenProps } from '@/types';
import { copyrightLabel, copyrightLine, copyrightYear } from '@/utils/copyright';
import { EmailSignInForm } from './EmailSignInForm';
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
  // An email sign-in is running: the Microsoft pill is locked until it ends.
  const [emailBusy, setEmailBusy] = useState(false);

  // The keyboard must never cover the email form's Sign in button. With the form open, Login scrolls to its end when the
  // keyboard opens and whenever the content grows under it (a field error, a failure). Events only, no timer.
  const scroll = useRef<ScrollView>(null);
  const emailOpen = useRef(false);
  const keyboardUp = useRef(false);
  const keepSubmitInView = useCallback(() => {
    if (emailOpen.current && keyboardUp.current) scroll.current?.scrollToEnd({ animated: !reduceMotionEnabled() });
  }, []);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      keyboardUp.current = true;
      keepSubmitInView();
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardUp.current = false;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [keepSubmitInView]);

  // The footer's year: from the device clock on first render, again each time Login is focused, and again when the app
  // comes back to the foreground on Login (left open over New Year). Events only: no timer, no polling, as the Home
  // greeting. The state is the year itself, so a check that finds the same year does not re-render.
  const [year, setYear] = useState(() => copyrightYear());
  useFocusEffect(
    useCallback(() => {
      setYear(copyrightYear());
      const subscription = AppState.addEventListener('change', (next) => {
        if (next === 'active') setYear(copyrightYear());
      });
      return () => subscription.remove();
    }, []),
  );

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

  function emailBusyChanged(busy: boolean) {
    setEmailBusy(busy);
    if (busy) setFailure(null); // a Microsoft failure no longer belongs on screen
  }

  // The circles follow the screen: x and size with its width, y with its height (390 × 844 reference).
  const sx = width / reference.width;
  const sy = height / reference.height;

  return (
    <View style={styles.screen}>
      {/* White icons on the red card. Leaving Login restores the app's dark ones (App.tsx). */}
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior="padding" style={styles.keyboard}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.scroll}
          bounces={false}
          // A tap on "Sign in" with the keyboard up signs in; it does not just close the keyboard first.
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={keepSubmitInView}
        >
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
              signOutMessage === REAUTH_NOTICE.message ? (
                // The 15-day sign-out (02 §5.8): says why, in the info tone. It is not a failure.
                <View accessibilityRole="alert" className="mb-4 self-stretch rounded-lg bg-blue-50 p-3">
                  <View className="flex-row items-start">
                    <Ionicons name="lock-closed" size={18} color={palette.blue[700]} />
                    <View className="ml-2 flex-1">
                      <Text className="text-sm font-semibold text-blue-900">{REAUTH_NOTICE.title}</Text>
                      <Text className="mt-1 text-sm text-blue-800">{signOutMessage}</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View className="mb-4 self-stretch rounded-lg bg-red-50 p-3">
                  <Text className="text-sm text-red-800">{signOutMessage}</Text>
                </View>
              )
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
                    <OutlineButton label={copy.retryLabel} tone="danger" onPress={startSignIn} disabled={signingIn || emailBusy} />
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.signIn}>
              <Text style={styles.wordmark}>Setu</Text>
              <Text style={styles.prompt}>Sign in with your work account</Text>
              {/* Locked (no touch, hidden from TalkBack) while an email sign-in runs: the two never overlap. */}
              <View
                style={[styles.button, emailBusy ? styles.locked : null]}
                importantForAccessibility={emailBusy ? 'no-hide-descendants' : 'auto'}
              >
                <SignInButton busy={signingIn} onPress={startSignIn} />
              </View>
              {EMAIL_SIGN_IN_ENABLED ? (
                <EmailSignInForm
                  ssoBusy={signingIn}
                  run={once}
                  onBusyChange={emailBusyChanged}
                  onMicrosoft={startSignIn}
                  onOpen={() => {
                    emailOpen.current = true;
                  }}
                />
              ) : null}
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

            <Text style={styles.footer} accessibilityLabel={copyrightLabel(year)}>
              {copyrightLine(year)}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
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
  locked: { opacity: 0.5, pointerEvents: 'none' },
  // "Light grey" in the design, but gray-400 is 2.5:1 on white: text.secondary (4.8:1) is the lightest that passes.
  footer: { marginTop: 20, color: colors.text.secondary, textAlign: 'center', ...loginType.footer },
});
