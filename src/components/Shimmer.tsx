// The loading shimmer (Phase A1, docs/PERFORMANCE.md §10): a soft white band sweeps across the placeholder, left to
// right, while it shows. One band per skeleton, drawn over all of it: on the white cards it is invisible, so it shows
// only where it crosses the grey bars. Shared by LoadingSkeleton and Skeleton; no screen has its own.
// - Native driver, `translateX` only: once started, the loop runs on the UI thread with no JavaScript per frame
//   (Animated.loop hands a native-driven timing to native as one looping animation).
// - "Remove animations" on: no band; the static bars are the end state.
// - The loop stops when the skeleton unmounts, i.e. when the data arrives.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useReduceMotion } from '@/hooks';
import { motion, palette } from '@/theme';

const { duration, curve, bandWidth, bandOpacities } = motion.shimmer;

export function Shimmer({ paddingTop = 0, children }: { paddingTop?: number; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const sweep = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration, easing: Easing.bezier(...curve), useNativeDriver: true }),
    );
    sweep.start();
    return () => sweep.stop();
  }, [progress, reduceMotion]);

  // From just off the left edge to just off the right one, measured in the window so no layout pass is needed.
  const translateX = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [-bandWidth, width] }),
    [progress, width],
  );

  return (
    <View style={[styles.clip, { paddingTop }]} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {children}
      {reduceMotion ? null : (
        <Animated.View pointerEvents="none" style={[styles.band, { transform: [{ translateX }] }]}>
          {bandOpacities.map((opacity, i) => (
            <View key={i} style={[styles.strip, { opacity }]} />
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, width: bandWidth, flexDirection: 'row' },
  strip: { flex: 1, backgroundColor: palette.white },
});
