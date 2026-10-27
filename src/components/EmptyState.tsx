// Empty and offline states (docs/brand/UI-STANDARDS.md, S11): a 40 dp icon, a title that says what is missing, a
// message that says what would appear here, and an action where one makes sense.
// An empty list shows an illustration instead of the icon (Phase A1): `empty` (nothing here yet, or nothing matches)
// or `clear` (nothing waiting for you: approvals, alerts). Every other state keeps its icon: offline, no access, not
// found, "keep typing".
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme';

// Flat SVGs in the brand colours (assets/illustrations/, 160 × 120). expo-image draws them as vectors on the UI thread;
// no SVG library is bundled. Static: no animation.
const ILLUSTRATIONS = {
  empty: require('../../assets/illustrations/nothing-here.svg') as number,
  clear: require('../../assets/illustrations/all-clear.svg') as number,
};
/** 128 × 96 dp (`w-32 h-24`), the art's 4:3. */
const ILLUSTRATION_SIZE = { width: 128, height: 96 };

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Replaces the icon on an empty list. */
  illustration?: keyof typeof ILLUSTRATIONS;
  actionLabel?: string;
  onAction?: () => void;
}

/** A first load that is waiting for the network (the query is paused while offline). */
export function OfflineState({ what }: { what: string }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="You're offline"
      message={`${what} will load automatically when you reconnect.`}
    />
  );
}

export function EmptyState({ title, message, icon = 'file-tray-outline', illustration, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      {illustration ? (
        <Image source={ILLUSTRATIONS[illustration]} style={ILLUSTRATION_SIZE} contentFit="contain" accessible={false} />
      ) : (
        <Ionicons name={icon} size={40} color={colors.text.muted} />
      )}
      <Text className="mt-3 text-center text-base font-semibold text-gray-900">{title}</Text>
      {message ? <Text className="mt-1 text-center text-sm text-gray-500">{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          className="mt-4 min-h-11 justify-center rounded-lg bg-primary px-5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-primary-foreground">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
