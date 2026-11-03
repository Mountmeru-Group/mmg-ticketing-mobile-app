// The greeting mark (2026-11-03, docs/brand/UI-STANDARDS.md §14): a small drawn sun, sun behind a cloud, or moon beside
// "Good morning, Ronit", one per greeting band (utils/greeting.ts greetingMark). Flat SVGs in assets/illustrations/ in
// brand yellow, drawn by expo-image as vectors, as the Phase A1 empty-state art is (react-native-svg is not installed).
// Never an emoji: emoji come from the phone's font, which differs between Android versions and lacks some glyphs on
// older ones.
// - Hidden from screen readers: the greeting already says the time of day.
// - ONE rise and fade (opacity and translateY, native driver), the first time the art is on screen after Home mounts.
//   Never again while Home stays mounted: a later band change swaps the art in place. Never loops.
// - "Remove animations": in place at once, no wrapper animation.
// - Stopped on unmount.
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { reduceMotionEnabled } from '@/hooks';
import { motion } from '@/theme';
import type { GreetingMarkName } from '@/utils/greeting';

const MARKS: Record<GreetingMarkName, number> = {
  sun: require('../../assets/illustrations/greeting-sun.svg') as number,
  cloudSun: require('../../assets/illustrations/greeting-cloud-sun.svg') as number,
  moon: require('../../assets/illustrations/greeting-moon.svg') as number,
};

const { duration, rise, curve } = motion.greetingMark;
const ease = Easing.bezier(...curve);

export function GreetingMark({ mark }: { mark: GreetingMarkName }) {
  // Decided once, at mount: null = show it in place (no animation at all).
  const [entry] = useState(() => (reduceMotionEnabled() ? null : new Animated.Value(0)));
  const played = useRef(false);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => () => running.current?.stop(), []);

  // expo-image loads the art asynchronously; starting on its first display means the rise is seen, not spent on an
  // empty box. A failed load leaves nothing to show either way.
  const onDisplay = () => {
    if (!entry || played.current) return;
    played.current = true;
    const appear = Animated.timing(entry, { toValue: 1, duration, easing: ease, useNativeDriver: true });
    running.current = appear;
    appear.start();
  };

  return (
    <Animated.View
      style={[
        styles.box,
        entry ? { opacity: entry, transform: [{ translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] } : null,
      ]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={MARKS[mark]} style={styles.art} contentFit="contain" accessible={false} onDisplay={onDisplay} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 26 dp beside the 20 dp greeting (text-xl, 28 dp line), 8 dp after it (S7, UI-STANDARDS.md §14).
  box: { marginLeft: 8 },
  art: { width: 26, height: 26 },
});
