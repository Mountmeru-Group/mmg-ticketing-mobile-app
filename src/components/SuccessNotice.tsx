// The success notice (iOS, docs/ios/00-PORT-MANIFEST.md §7; utils/successNotice.ts): a dark capsule near the top of the
// screen, a tick and the message, in place of Android's toast. Non-modal: it takes no touches, so what is under it
// stays usable, and it goes by itself after motion.successNotice.visible. VoiceOver hears it from showSuccessNotice()
// rather than by focusing it, so the capsule is hidden from VoiceOver. Mounted once, by RootNavigator, over the tabs; a
// page sheet that stays open after a write is presented above the app and covers it.
// Reduce Motion (hooks/useReduceMotion.ts): no fade, the capsule appears and goes at once.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { reduceMotionEnabled } from '@/hooks/useReduceMotion';
import { motion, palette } from '@/theme';
import { subscribeToSuccessNotices } from '@/utils/successNotice';

const { fade, visible, curve } = motion.successNotice;
const ease = Easing.bezier(...curve);

interface Shown {
  id: number;
  message: string;
  opacity: Animated.Value;
}

export function SuccessNoticeHost() {
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Shown | null>(null);

  // A new notice replaces the one on screen.
  useEffect(
    () => subscribeToSuccessNotices(({ id, message }) => setShown({ id, message, opacity: new Animated.Value(reduceMotionEnabled() ? 1 : 0) })),
    [],
  );

  useEffect(() => {
    if (!shown) return;
    const fadeTo = (toValue: number) => Animated.timing(shown.opacity, { toValue, duration: fade, easing: ease, useNativeDriver: true });
    const hide = () => setShown((current) => (current?.id === shown.id ? null : current));
    let animation: Animated.CompositeAnimation | null = reduceMotionEnabled() ? null : fadeTo(1);
    animation?.start();
    const timer = setTimeout(() => {
      if (reduceMotionEnabled()) {
        hide();
        return;
      }
      animation = fadeTo(0);
      animation.start(({ finished }) => {
        if (finished) hide();
      });
    }, visible);
    return () => {
      clearTimeout(timer);
      animation?.stop();
    };
  }, [shown]);

  if (!shown) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center' }}
    >
      <Animated.View style={{ opacity: shown.opacity }} className="max-w-full flex-row items-center rounded-full bg-gray-900 px-4 py-2.5">
        <Ionicons name="checkmark-circle" size={18} color={palette.green[500]} />
        <Text className="ml-2 shrink text-sm font-medium text-white">{shown.message}</Text>
      </Animated.View>
    </View>
  );
}
