// Thin banners above a screen's content: offline, or "showing older data because the refresh failed".
// Offline is detected from failed requests (ApiClientError kind `network`); no connectivity library is
// installed (@react-native-community/netinfo is pending approval), so the banner appears after a request fails.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { describeError, isOfflineError } from '@/api/errors';

interface QueryBannerProps {
  /** The query's current error, or null. Renders nothing when null. */
  error: unknown;
  /** True when older data is still on screen below the banner. */
  hasData: boolean;
  onRetry?: () => void;
}

/** Offline → amber "You're offline"; any other error with data still on screen → red "Couldn't refresh". */
export function QueryBanner({ error, hasData, onRetry }: QueryBannerProps) {
  if (!error) return null;
  const offline = isOfflineError(error);
  if (!offline && !hasData) return null; // the screen shows a full ErrorState instead

  const title = offline ? "You're offline" : "Couldn't refresh";
  const detail = offline
    ? hasData
      ? 'Showing the last loaded data. Pull down to try again.'
      : "Can't reach the Service Desk. Check your connection."
    : `${describeError(error)} Showing the last loaded data.`;

  return (
    <View
      accessibilityRole="alert"
      className={`flex-row items-center px-4 py-2 ${offline ? 'bg-amber-100' : 'bg-red-50'}`}
    >
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={18}
        color={offline ? '#92400e' : '#b91c1c'}
      />
      <View className="ml-2 flex-1">
        <Text className={`text-sm font-semibold ${offline ? 'text-amber-900' : 'text-red-800'}`}>{title}</Text>
        <Text className={`text-xs ${offline ? 'text-amber-900' : 'text-red-800'}`}>{detail}</Text>
      </View>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} className="ml-2 rounded-md px-2 py-1">
          <Text className={`text-sm font-semibold ${offline ? 'text-amber-900' : 'text-red-800'}`}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
