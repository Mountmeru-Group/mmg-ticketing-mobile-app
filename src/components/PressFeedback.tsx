// Press feedback for every tappable card and list row (2026-11-03, docs/PERFORMANCE.md §13): while a finger is down the
// card dips to 97 % and dims to 85 %, and it returns when the finger lifts. It replaces the cards' `active:opacity-80`.
// - One Animated.Value per card. One native-driven timing per press-in and one per press-out, on `scale` and `opacity`
//   only: no JavaScript per frame, and no re-render on a press (NativeWind's `active:` re-rendered the Pressable twice).
// - Decoration only: the Pressable's own handlers fire exactly as before, and nothing waits for the animation.
// - A touch that turns into a scroll within `motion.press.pressDelay` shows nothing (Pressable's `unstable_pressDelay`).
// - "Remove animations": no scale; the tint shows and clears at once, as `active:opacity-80` did.
// - Never loops. A running timing is stopped when the next one starts and when the card unmounts.
//
// iOS (iOS-5f): "Remove animations" is Reduce Motion (useReduceMotion reads it), so under Reduce Motion the card only
// dims. The Pressable keeps every prop the card passes (its role, label, hint and actions), so VoiceOver reads the card
// as before; a VoiceOver double-tap fires onPress without a touch, and so without the dip. The wrapper adds no size: the
// card's own 44 pt minimum holds (UI-STANDARDS.md §iOS-A.4).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated, Easing, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';

import { reduceMotionEnabled, useReduceMotion } from '@/hooks';
import { motion } from '@/theme';

const { scale, opacity, pressIn, pressOut, curve, pressDelay } = motion.press;
const ease = Easing.bezier(...curve);

type PressHandler = ((event: GestureResponderEvent) => void) | null | undefined;

export interface PressFeedback {
  /** For the Animated.View around the Pressable. */
  style: Animated.WithAnimatedObject<ViewStyle>;
  /** For the Pressable: the delay and the two handlers, each calling the Pressable's own handler too. */
  pressProps: (own?: { onPressIn?: PressHandler; onPressOut?: PressHandler }) => Pick<
    PressableProps,
    'onPressIn' | 'onPressOut' | 'unstable_pressDelay'
  >;
}

/** For a card whose Pressable is not the card itself (the card wraps it, as on Alerts). Otherwise use PressableCard. */
export function usePressFeedback(): PressFeedback {
  const reduceMotion = useReduceMotion();
  const [held] = useState(() => new Animated.Value(0));
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const go = useCallback(
    (toValue: 0 | 1) => {
      running.current?.stop();
      running.current = null;
      if (reduceMotionEnabled()) {
        held.setValue(toValue);
        return;
      }
      const press = Animated.timing(held, { toValue, duration: toValue === 1 ? pressIn : pressOut, easing: ease, useNativeDriver: true });
      running.current = press;
      press.start();
    },
    [held],
  );
  useEffect(() => () => running.current?.stop(), []);

  const style = useMemo(
    () =>
      reduceMotion
        ? { opacity: held.interpolate({ inputRange: [0, 1], outputRange: [1, opacity] }) }
        : {
            opacity: held.interpolate({ inputRange: [0, 1], outputRange: [1, opacity] }),
            transform: [{ scale: held.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }],
          },
    [held, reduceMotion],
  );

  const pressProps = useCallback<PressFeedback['pressProps']>(
    (own) => ({
      unstable_pressDelay: pressDelay,
      onPressIn: (event) => {
        go(1);
        own?.onPressIn?.(event);
      },
      onPressOut: (event) => {
        go(0);
        own?.onPressOut?.(event);
      },
    }),
    [go],
  );

  return { style, pressProps };
}

interface PressableCardProps extends PressableProps {
  /**
   * Style of the animated wrapper, for sizing that must sit outside the Pressable: a grid tile's width, or `flex: 1`
   * in a row. The Pressable keeps its own classes (margins, border, padding).
   */
  wrapperStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** A tappable card or list row with the standard press feedback. Takes every Pressable prop. */
export function PressableCard({ wrapperStyle, onPressIn, onPressOut, children, ...props }: PressableCardProps) {
  const feedback = usePressFeedback();
  return (
    <Animated.View style={[feedback.style, wrapperStyle]}>
      <Pressable {...props} {...feedback.pressProps({ onPressIn, onPressOut })}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
