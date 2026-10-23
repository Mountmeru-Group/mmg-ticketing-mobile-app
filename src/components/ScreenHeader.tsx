import Ionicons from '@expo/vector-icons/Ionicons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  /**
   * - `drawer`: the three tab roots (Home, Tickets, Alerts) — ☰ on the left opens the drawer (08 §3.1).
   * - `back`:   every other screen, the drawer modules' first screens included — back arrow. It is `goBack()`, the
   *             same action as Android back, so both return to where the user came from.
   * - `close`:  modal sheets — ✕.
   */
  variant?: 'drawer' | 'back' | 'close';
  /** Right-hand slot: search icon (Tickets), "Mark all read" (Alerts) … */
  right?: ReactNode;
}

export function ScreenHeader({ title, variant = 'back', right }: ScreenHeaderProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const leftIcon = variant === 'drawer' ? 'menu' : variant === 'close' ? 'close' : 'arrow-back';
  const leftLabel = variant === 'drawer' ? 'Open menu' : variant === 'close' ? 'Close' : 'Go back';
  const onLeftPress = () => {
    if (variant === 'drawer') navigation.dispatch(DrawerActions.openDrawer());
    else if (navigation.canGoBack()) navigation.goBack();
  };

  // 56 dp bar, 44 dp icon buttons, 24 dp icons (docs/brand/UI-STANDARDS.md, S1). White, so the status bar is dark.
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
