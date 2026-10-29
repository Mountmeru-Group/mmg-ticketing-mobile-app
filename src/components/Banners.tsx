// Thin banners above a screen's content.
// - OfflineBanner: the device has no connection (NetInfo, src/api/network.ts). One per screen, always directly under
//   the screen header (above any search or filter bar); on Login, at the top of the screen.
// - QueryBanner:   a request failed while older data is still on screen — the server could not be reached
//                  (amber) or answered with an error (red). Silent while the device is offline: OfflineBanner
//                  already says so, and queries pause rather than fail.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { describeError, isOfflineError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import { palette } from '@/theme';

function Banner({
  tone, title, detail, onRetry,
}: {
  tone: 'amber' | 'red';
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  const amber = tone === 'amber';
  const textClass = amber ? 'text-amber-900' : 'text-red-800';
  return (
    <View accessibilityRole="alert" className={`flex-row items-center px-4 py-2 ${amber ? 'bg-amber-100' : 'bg-red-50'}`}>
      <Ionicons name={amber ? 'cloud-offline-outline' : 'alert-circle-outline'} size={18} color={amber ? palette.amber[800] : palette.red[700]} />
      <View className="ml-2 flex-1">
        <Text className={`text-sm font-semibold ${textClass}`}>{title}</Text>
        <Text className={`text-xs ${textClass}`}>{detail}</Text>
      </View>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={onRetry} className="-mr-2 ml-2 min-h-11 justify-center rounded-md px-3 active:opacity-60">
          <Text className={`text-sm font-semibold ${textClass}`}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OfflineBanner() {
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <Banner
      tone="amber"
      title="You're offline"
      detail="Showing what is already loaded. New data loads when you reconnect."
    />
  );
}

interface QueryBannerProps {
  /** The query's current error, or null. Renders nothing when null. */
  error: unknown;
  /** True when older data is still on screen below the banner. */
  hasData: boolean;
  onRetry?: () => void;
}

export function QueryBanner({ error, hasData, onRetry }: QueryBannerProps) {
  const offline = useIsOffline();
  if (!error || offline || !hasData) return null; // no data: the screen shows a full ErrorState instead
  if (isOfflineError(error)) {
    return (
      <Banner
        tone="amber"
        title="Can't reach the Service Desk"
        detail="Showing the last loaded data. Pull down to try again."
        onRetry={onRetry}
      />
    );
  }
  return <Banner tone="red" title="Couldn't refresh" detail={`${describeError(error)} Showing the last loaded data.`} onRetry={onRetry} />;
}
