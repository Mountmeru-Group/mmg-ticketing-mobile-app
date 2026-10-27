import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';

import { describeError, isOfflineError } from '@/api/errors';
import { palette } from '@/theme';
import { OutlineButton } from './Form';

interface ErrorStateProps {
  /** Anything thrown by src/api/ (an ApiClientError) or any other error. Only describeError() text is shown. */
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

/**
 * Full-screen error with a Retry button (docs/brand/UI-STANDARDS.md, S11). No response at all (server unreachable
 * while the device is online) gets connection wording; a device with no network never gets here — its queries pause
 * (OfflineState).
 */
export function ErrorState({ error, title = 'Something went wrong', onRetry }: ErrorStateProps) {
  const unreachable = isOfflineError(error);
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Ionicons name={unreachable ? 'cloud-offline-outline' : 'alert-circle-outline'} size={40} color={unreachable ? palette.amber[600] : palette.red[600]} />
      <Text className="mt-3 text-center text-base font-semibold text-gray-900">{unreachable ? "Can't reach the Service Desk" : title}</Text>
      <Text className="mt-1 text-center text-sm text-gray-500">{describeError(error)}</Text>
      {onRetry ? (
        <View className="mt-4">
          <OutlineButton label="Retry" icon="refresh" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
