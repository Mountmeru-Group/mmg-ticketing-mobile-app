// Empty and offline states (docs/brand/UI-STANDARDS.md, S11): a 40 dp icon, a title that says what is missing, a
// message that says what would appear here, and an action where one makes sense.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme';

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
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

export function EmptyState({ title, message, icon = 'file-tray-outline', actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Ionicons name={icon} size={40} color={colors.text.muted} />
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
