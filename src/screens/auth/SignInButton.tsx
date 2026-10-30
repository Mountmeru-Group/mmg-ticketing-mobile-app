// Login's one action (M1, "arc split" 2026-10-30; docs/brand/UI-STANDARDS.md §10, docs/PERFORMANCE.md §12).
// - Idle: an outlined pill as wide as its content, 52 dp tall: Microsoft's four-square logo, then "Sign in with
//   Microsoft".
// - Signing in: the pill collapses into a 52 dp circle, a yellow arc spins on a pale yellow ring, and "Opening
//   Microsoft…" shows beneath. The collapse starts in the press handler itself, so it is under way before Microsoft's
//   page opens (that takes several async steps, src/api/auth.api.ts).
// - Back to the pill, in reverse, when the attempt ends without signing in: cancelled at Microsoft, or failed.
//
// How the collapse stays transform-only: the pill is drawn as three pieces, a left half-circle, a straight middle and
// a right half-circle. The middle shrinks to nothing (scaleX) while the halves slide in (translateX) until they meet as
// a circle. Nothing's width changes and nothing is laid out again; the button keeps its size, so nothing around it
// moves. One native timing drives it all, and one native loop turns the arc. "Remove animations": the end state shows
// at once and the arc stands still (the caption still says what is happening).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { reduceMotionEnabled, useReduceMotion } from '@/hooks';
import { colors, loginLayout, loginType, motion } from '@/theme';

const { height: H, radius, padX, border, logo, logoGap, ring, captionGap } = loginLayout.button;
const CAP = H / 2;
/** The middle runs 1 dp under each half-circle, so no hairline shows where the pieces meet. */
const OVERLAP = 1;
const { collapse: duration, collapseCurve, labelFadeEnd, ringFadeStart, captionRise, spin } = motion.signIn;
const ease = Easing.bezier(...collapseCurve);

const LABEL = 'Sign in with Microsoft';
const CAPTION = 'Opening Microsoft…';

/** Microsoft's logo: four squares in Microsoft's colours. */
function MicrosoftLogo() {
  return (
    <View style={styles.msLogo}>
      <View style={[styles.msSquare, { backgroundColor: colors.microsoft.red }]} />
      <View style={[styles.msSquare, { backgroundColor: colors.microsoft.green }]} />
      <View style={[styles.msSquare, { backgroundColor: colors.microsoft.blue }]} />
      <View style={[styles.msSquare, { backgroundColor: colors.microsoft.yellow }]} />
    </View>
  );
}

export function SignInButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const reduceMotion = useReduceMotion();
  const [collapse] = useState(() => new Animated.Value(busy ? 1 : 0));
  const [turn] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);
  const target = useRef(busy ? 1 : 0);
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const moveTo = useCallback(
    (to: 0 | 1) => {
      if (target.current === to) return;
      target.current = to;
      running.current?.stop();
      running.current = null;
      if (reduceMotionEnabled()) {
        collapse.setValue(to);
        return;
      }
      const timing = Animated.timing(collapse, { toValue: to, duration, easing: ease, useNativeDriver: true });
      running.current = timing;
      timing.start();
    },
    [collapse],
  );

  // Follows `busy` both ways: collapses when a sign-in starts from elsewhere (the failure box's "Try again"), opens back
  // into the pill when it ends without signing in. A press on the pill has already collapsed it.
  useEffect(() => {
    moveTo(busy ? 1 : 0);
    if (busy) AccessibilityInfo.announceForAccessibility(CAPTION);
  }, [busy, moveTo]);
  useEffect(() => () => running.current?.stop(), []);

  // The arc turns while signing in: one native loop, stopped when the attempt ends or Login unmounts (signed in).
  useEffect(() => {
    if (!busy || reduceMotion) return;
    turn.setValue(0);
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: spin, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [busy, reduceMotion, turn]);

  const style = useMemo(() => {
    const slide = Math.max(0, (width - H) / 2);
    const fadeIn = collapse.interpolate({ inputRange: [ringFadeStart, 1], outputRange: [0, 1], extrapolate: 'clamp' });
    return {
      label: { opacity: collapse.interpolate({ inputRange: [0, labelFadeEnd], outputRange: [1, 0], extrapolate: 'clamp' }) },
      leftCap: { transform: [{ translateX: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, slide] }) }] },
      rightCap: { transform: [{ translateX: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, -slide] }) }] },
      middle: { transform: [{ scaleX: collapse.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }] },
      ring: { opacity: fadeIn },
      arc: { transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
      caption: {
        opacity: fadeIn,
        transform: [{ translateY: collapse.interpolate({ inputRange: [ringFadeStart, 1], outputRange: [captionRise, 0], extrapolate: 'clamp' }) }],
      },
    };
  }, [collapse, turn, width]);

  const press = () => {
    moveTo(1); // this frame, before Microsoft's page opens
    onPress();
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={LABEL}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={press}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={styles.pill}
      >
        {({ pressed }) => {
          const fill = { backgroundColor: pressed ? colors.login.buttonPressed : colors.login.buttonFill };
          return (
            <>
              <Animated.View style={[styles.capLeft, style.leftCap]}>
                <View style={[styles.circle, fill]} />
              </Animated.View>
              <Animated.View style={[styles.capRight, style.rightCap]}>
                <View style={[styles.circle, styles.circleRight, fill]} />
              </Animated.View>
              <Animated.View style={[styles.middle, fill, style.middle]} />
              <Animated.View style={[styles.spinner, style.ring]} pointerEvents="none">
                <View style={styles.ring} />
                <Animated.View style={[styles.ring, styles.arc, style.arc]} />
              </Animated.View>
              <Animated.View style={[styles.content, style.label]}>
                <MicrosoftLogo />
                {/* One line in a 52 dp pill: at very large system text (200 % on a 360 dp phone) it shrinks to fit
                    the screen's width instead of being cut off. */}
                <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
                  {LABEL}
                </Text>
              </Animated.View>
            </>
          );
        }}
      </Pressable>
      {/* Always laid out, so nothing moves when it appears; read out by the announcement above, hidden otherwise. */}
      <Animated.Text
        style={[styles.caption, style.caption]}
        importantForAccessibility={busy ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!busy}
      >
        {CAPTION}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  // Sized by its content (padding, logo, label); the shape pieces are drawn behind it.
  pill: { height: H, minWidth: H, paddingHorizontal: padX, justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center' },
  label: { flexShrink: 1, marginLeft: logoGap, color: colors.login.buttonLabel, ...loginType.button },
  capLeft: { position: 'absolute', left: 0, top: 0, width: CAP, height: H, overflow: 'hidden' },
  capRight: { position: 'absolute', right: 0, top: 0, width: CAP, height: H, overflow: 'hidden' },
  circle: { width: H, height: H, borderRadius: radius, borderWidth: border, borderColor: colors.login.buttonBorder },
  circleRight: { marginLeft: -CAP },
  middle: {
    position: 'absolute',
    left: CAP - OVERLAP,
    right: CAP - OVERLAP,
    top: 0,
    height: H,
    borderTopWidth: border,
    borderBottomWidth: border,
    borderColor: colors.login.buttonBorder,
  },
  spinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: H,
    height: H,
    borderRadius: H / 2,
    borderWidth: ring,
    borderColor: colors.motion.track,
    backgroundColor: colors.motion.ground,
  },
  // A quarter of the ring in brand yellow; the rest of its border is see-through, so the ring shows.
  arc: { borderColor: 'transparent', borderTopColor: colors.motion.accent, backgroundColor: 'transparent' },
  msLogo: { width: logo, height: logo, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between' },
  msSquare: { width: (logo - 1) / 2, height: (logo - 1) / 2 },
  caption: { marginTop: captionGap, color: colors.text.secondary, textAlign: 'center', ...loginType.prompt },
});
