import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  /**
   * iOS: signed-in screens use the native navigation bar (src/navigation/TabStacks.tsx); this header remains for the
   * screens outside it, today only the __DEV__ developer-token screen. There is no drawer, so no ☰ variant.
   * - `back`:  the iOS back chevron. It is `goBack()`, the same as the native edge swipe.
   * - `close`: modal sheets — ✕.
   */
  variant?: 'back' | 'close';
  /** Right-hand slot. */
  right?: ReactNode;
}

export function ScreenHeader({ title, variant = 'back', right }: ScreenHeaderProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const leftIcon = variant === 'close' ? 'close' : 'chevron-back';
  const leftLabel = variant === 'close' ? 'Close' : 'Go back';
  const onLeftPress = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  // 56 dp bar, 44 dp icon buttons, 24 dp icons (docs/brand/UI-STANDARDS.md, S1; the iOS sizes are an iOS-5 item).
  // White, so the status bar is dark.
  return (
    <View style={{ paddingTop: insets.top }} className="border-b border-border bg-white">
      <View className="h-14 flex-row items-center px-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={leftLabel}
          onPress={onLeftPress}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-gray-100"
        >
          <Ionicons name={leftIcon} size={24} color={colors.text.primary} />
        </Pressable>
        <Text className="ml-2 flex-1 text-lg font-semibold text-gray-900" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <View className="min-w-11 flex-row items-center justify-end">{right}</View>
      </View>
    </View>
  );
}
