import Ionicons from '@expo/vector-icons/Ionicons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  /**
   * - `drawer`: root screens — ☰ on the left opens the drawer (08 §3.1).
   * - `back`:   pushed screens — back arrow.
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

  return (
    <View style={{ paddingTop: insets.top }} className="border-b border-gray-200 bg-white">
      <View className="h-14 flex-row items-center px-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={leftLabel}
          onPress={onLeftPress}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <Ionicons name={leftIcon} size={24} color={colors.text.primary} />
        </Pressable>
        <Text className="ml-2 flex-1 text-lg font-semibold text-gray-900" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <View className="min-w-10 flex-row items-center justify-end">{right}</View>
      </View>
    </View>
  );
}
