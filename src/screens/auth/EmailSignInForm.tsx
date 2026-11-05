// Login's email and password sign-in (M1, G9, 2026-11-05; docs/brand/UI-STANDARDS.md §15.2, 02-AUTH.md §8). UAT builds only
// (EMAIL_SIGN_IN_ENABLED, src/config/env.ts).
// - Under the Microsoft pill, which stays the primary action: an OR divider (hairline, "OR", hairline), then a quiet
//   "Sign in with email instead" with a chevron: text only, no border, no fill.
// - Tapped, the fields open IN PLACE on the same screen (no route): email, password with a show/hide toggle, and a
//   52 dp brand-red "Sign in". Opening fades and lifts the form on the native driver; with "Remove animations" it shows
//   at once. Nothing's layout is animated: the fields take their place in the first frame.
// - The attempt itself is attemptPasswordSignIn() (./signInAttempt.ts), against an ASSUMED contract (src/api/auth.api.ts).
// - The password lives in this component's state ONLY. It is never logged or stored, and it goes nowhere but that one
//   call. It is cleared on success, on failure and on unmount.
// - LoginScreen keeps the Sign in button above the keyboard: `onOpen` tells it the form is open.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { OutlineButton } from '@/components';
import { reduceMotionEnabled } from '@/hooks';
import { colors, loginLayout, loginType, motion, palette } from '@/theme';
import {
  PASSWORD_FAILURE_COPY,
  attemptPasswordSignIn,
  checkEmailSignIn,
  createStaleFailureGuard,
  passwordFailureRef,
  passwordFailureText,
  type PasswordFailure,
  type PasswordSignInOutcome,
} from './signInAttempt';

const form = loginLayout.emailForm;
const { duration, rise, curve } = motion.emailReveal;
const ease = Easing.bezier(...curve);

type FieldErrors = { email?: string; password?: string };

export interface EmailSignInFormProps {
  /** Microsoft sign-in is running: "Sign in" is disabled, and an old email failure is cleared. */
  ssoBusy: boolean;
  /** LoginScreen's single flight, shared with Microsoft sign-in, so the two can never run at once. */
  run: (handler: () => Promise<void>) => Promise<void>;
  /** An email sign-in started (true) or ended without signing in (false): LoginScreen locks the Microsoft pill meanwhile. */
  onBusyChange: (busy: boolean) => void;
  /** "Sign in with Microsoft", offered by a failure that only Microsoft can get past. */
  onMicrosoft: () => void;
  /** The fields opened. */
  onOpen: () => void;
}

export function EmailSignInForm({ ssoBusy, run, onBusyChange, onMicrosoft, onOpen }: EmailSignInFormProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors | null>(null);
  const [failure, setFailure] = useState<PasswordFailure | null>(null);
  const [reveal] = useState(() => new Animated.Value(0));
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const passwordInput = useRef<TextInput>(null);
  // Read by the AppState listener, which must not re-subscribe on every render.
  const inFlight = useRef(false);

  useEffect(() => () => running.current?.stop(), []);
  // Unmount (signed in, or Login left): drop the password. A JS string cannot be wiped from memory; this lets go of the
  // last reference the app holds to it.
  useEffect(() => () => setPassword(''), []);

  // Microsoft sign-in started: an email failure no longer belongs on screen.
  useEffect(() => {
    if (ssoBusy) setFailure(null);
  }, [ssoBusy]);

  // An old failure must not greet someone reopening the app as if it had just failed (signInAttempt.ts).
  useEffect(() => {
    const isStale = createStaleFailureGuard(() => inFlight.current);
    const subscription = AppState.addEventListener('change', (next) => {
      if (isStale(next)) setFailure(null);
    });
    return () => subscription.remove();
  }, []);

  function openForm() {
    setOpen(true);
    onOpen();
    if (reduceMotionEnabled()) {
      reveal.setValue(1);
      return;
    }
    const timing = Animated.timing(reveal, { toValue: 1, duration, easing: ease, useNativeDriver: true });
    running.current = timing;
    timing.start();
  }

  async function submit() {
    const typed = email.trim();
    const problems = checkEmailSignIn({ email: typed, password });
    setErrors(problems);
    setFailure(null);
    if (problems) return; // nothing is sent

    setBusy(true);
    onBusyChange(true);
    inFlight.current = true;
    let outcome: PasswordSignInOutcome;
    try {
      outcome = await attemptPasswordSignIn(typed, password);
    } finally {
      inFlight.current = false;
      setPassword(''); // signed in or not, the password goes
    }
    // signed-in: RootNavigator switches to the app and Login unmounts, so the button stays busy until then.
    if (outcome.type === 'signed-in') return;
    setShown(false);
    setFailure(outcome.failure);
    setBusy(false);
    onBusyChange(false);
  }

  const startSubmit = () => void run(submit);
  const locked = busy || ssoBusy;
  const text = failure ? passwordFailureText(failure) : null;

  const style = {
    form: {
      opacity: reveal,
      transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
    },
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <View style={styles.hairline} />
        <Text style={styles.or}>OR</Text>
        <View style={styles.hairline} />
      </View>

      {!open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Shows email and password fields"
          onPress={openForm}
          style={styles.action}
        >
          {({ pressed }) => (
            <>
              <Text style={[styles.actionLabel, pressed ? styles.actionPressed : null]}>Sign in with email instead</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
            </>
          )}
        </Pressable>
      ) : (
        <Animated.View style={[styles.form, style.form]}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (errors?.email) setErrors({ ...errors, email: undefined });
            }}
            autoFocus
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordInput.current?.focus()}
            editable={!busy}
            placeholder="name@mountmerugroup.com"
            placeholderTextColor={colors.text.secondary}
            accessibilityLabel="Email"
            style={[styles.field, errors?.email ? styles.fieldInvalid : null]}
          />
          {errors?.email ? (
            <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
              {errors.email}
            </Text>
          ) : null}

          <Text style={[styles.label, styles.secondLabel]}>Password</Text>
          <View>
            <TextInput
              ref={passwordInput}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (errors?.password) setErrors({ ...errors, password: undefined });
              }}
              secureTextEntry={!shown}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={startSubmit}
              editable={!busy}
              accessibilityLabel="Password"
              style={[styles.field, styles.passwordField, errors?.password ? styles.fieldInvalid : null]}
            />
            <Pressable
              accessibilityRole="button"
              aria-label={shown ? 'Hide password' : 'Show password'}
              onPress={() => setShown((now) => !now)}
              style={styles.toggle}
            >
              <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.text.secondary} />
            </Pressable>
          </View>
          {errors?.password ? (
            <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
              {errors.password}
            </Text>
          ) : null}

          {failure && text ? (
            <View accessibilityRole="alert" className="mt-4 self-stretch rounded-lg bg-red-50 p-3">
              <View className="flex-row items-start">
                <Ionicons name="alert-circle" size={18} color={palette.red[700]} />
                <View className="ml-2 flex-1">
                  <Text className="text-sm font-semibold text-red-900">{text.title}</Text>
                  <Text className="mt-1 text-sm text-red-800">{text.message}</Text>
                  {text.quote ? <Text className="mt-1 text-sm text-red-800">The Service Desk said: “{text.quote}”</Text> : null}
                  <Text className="mt-2 text-xs text-red-700">Ref: {passwordFailureRef(failure)}</Text>
                  {__DEV__ ? <Text className="mt-1 font-mono text-xs text-red-700">{failure.detail}</Text> : null}
                </View>
              </View>
              {PASSWORD_FAILURE_COPY[failure.reason].microsoft ? (
                <View className="mt-3 self-end">
                  <OutlineButton label="Sign in with Microsoft" tone="danger" onPress={onMicrosoft} disabled={locked} />
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityState={{ disabled: locked, busy }}
            disabled={locked}
            onPress={startSubmit}
            style={({ pressed }) => [styles.submit, ssoBusy ? styles.submitLocked : null, pressed ? styles.submitPressed : null]}
          >
            {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
            <Text style={[styles.submitLabel, busy ? styles.submitLabelBusy : null]}>{busy ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  divider: { flexDirection: 'row', alignItems: 'center', marginTop: form.dividerGap },
  hairline: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  // "Muted grey" in the brief; text.secondary is the lightest grey that passes AA on white (UI-STANDARDS.md §10.2).
  or: { marginHorizontal: form.orGap, color: colors.text.secondary, ...loginType.orLabel },
  action: { minHeight: form.actionHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingHorizontal: form.orGap },
  actionLabel: { marginRight: 4, color: colors.text.body, ...loginType.link },
  actionPressed: { color: colors.text.primary },
  form: { alignSelf: 'stretch', marginTop: form.orGap },
  label: { marginBottom: form.labelGap, color: colors.text.body, ...loginType.fieldLabel },
  secondLabel: { marginTop: form.fieldGap },
  field: {
    height: form.fieldHeight,
    paddingHorizontal: form.fieldPadX,
    borderRadius: form.fieldRadius,
    borderWidth: 1,
    borderColor: colors.login.buttonBorder,
    backgroundColor: colors.surface,
    color: colors.text.primary,
    ...loginType.field,
  },
  passwordField: { paddingRight: form.toggle },
  fieldInvalid: { borderColor: palette.red[700] },
  fieldError: { marginTop: 4, color: palette.red[700], ...loginType.prompt },
  toggle: { position: 'absolute', right: 0, top: 0, width: form.toggle, height: form.toggle, alignItems: 'center', justifyContent: 'center' },
  submit: {
    height: form.submit.height,
    marginTop: form.submit.gap,
    borderRadius: form.submit.radius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  submitLocked: { opacity: 0.5 },
  submitPressed: { opacity: motion.press.opacity },
  submitLabel: { color: colors.primaryForeground, ...loginType.button },
  submitLabelBusy: { marginLeft: 8 },
});
