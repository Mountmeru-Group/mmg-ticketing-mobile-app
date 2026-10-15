import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { describeError, isOfflineError } from '@/api/errors';

interface ErrorStateProps {
  /** Anything thrown by src/api/ (an ApiClientError) or any other error. Only describeError() text is shown. */
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

/** Full-screen error with a Retry button. A network failure gets the offline wording instead of an error. */
export function ErrorState({ error, title = 'Something went wrong', onRetry }: ErrorStateProps) {
  const offline = isOfflineError(error);
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={40} color={offline ? '#d97706' : '#dc2626'} />
      <Text className="mt-3 text-center text-base font-semibold text-gray-800">{offline ? "You're offline" : title}</Text>
      <Text className="mt-1 text-center text-sm text-gray-500">{describeError(error)}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} className="mt-4 rounded-lg border border-gray-300 px-4 py-2">
          <Text className="font-medium text-gray-800">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
