// A Home KPI tile's number (2026-11-03, Ronit's option 5 for the count roll; docs/PERFORMANCE.md §13.6). When the
// period changes, the number does not snap:
// - the old number on screen (a period already loaded) cross-fades into the new one: the old fades out over the new,
//   which fades in and rises 4 dp into place;
// - after the loading bar (a period not loaded yet) the new number fades in. A previous period's count is never shown
//   as the new one (G6, hooks/useHome.ts placeholder data), so there is no old number to fade from.
// A refresh that changes a number within the same period still shows it at once, as before.
// Rules (PERFORMANCE.md §10.1): one native timing per change, on `opacity` and `translateY` only, so no JavaScript runs
// per frame; never a loop; `active` false (Home not visible) or "Remove animations" shows the end state at once; stopped
// on unmount. The animated layers exist only during the fade: at rest the number is the same plain Text as before.
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { reduceMotionEnabled } from '@/hooks';
import { motion } from '@/theme';

const { duration, rise, curve } = motion.countFade;
const ease = Easing.bezier(...curve);

interface Fade {
  /** The number fading out, or null when the new one only fades in (it replaced the loading bar). */
  from: number | null;
  progress: Animated.Value;
}

interface CountFadeProps {
  value: number;
  /** The Home period this number counts: a change of value with a change of period fades; a refresh does not. */
  periodKey: string;
  /** Home is visible and the period has been changed: false shows every number at once. */
  active: boolean;
}

function Count({ value }: { value: number }) {
  return (
    <Text className="mt-1 text-2xl font-bold text-gray-900" numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  );
}

export function CountFade({ value, periodKey, active }: CountFadeProps) {
  const [shown, setShown] = useState({ value, periodKey });
  // Mounted in place of the loading bar: fade in, if allowed.
  const [fade, setFade] = useState<Fade | null>(() =>
    active && !reduceMotionEnabled() ? { from: null, progress: new Animated.Value(0) } : null,
  );
  if (shown.value !== value || shown.periodKey !== periodKey) {
    // React's "adjust state while rendering" pattern: this render is the only place the previous number is known.
    const periodChanged = shown.periodKey !== periodKey;
    setShown({ value, periodKey });
    setFade(
      active && periodChanged && shown.value !== value && !reduceMotionEnabled()
        ? { from: shown.value, progress: new Animated.Value(0) }
        : null,
    );
  }
  // Home left the screen mid-fade: the end state at once.
  if (fade && !active) setFade(null);

  useEffect(() => {
    if (!fade) return;
    const run = Animated.timing(fade.progress, { toValue: 1, duration, easing: ease, useNativeDriver: true });
    run.start(({ finished }) => {
      if (finished) setFade(null);
    });
    return () => run.stop();
  }, [fade]);

  if (!fade) return <Count value={value} />;
  const { from, progress } = fade;
  return (
    <View>
      <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] }}>
        <Count value={value} />
      </Animated.View>
      {from !== null ? (
        <Animated.View
          style={[styles.over, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Count value={from} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
});
