import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { describeError } from '@/api/errors';

interface ErrorStateProps {
  /** Anything thrown by src/api/ (an ApiClientError) or any other error. */
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, title = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
      <Text className="mt-3 text-center text-base font-semibold text-gray-800">{title}</Text>
      <Text className="mt-1 text-center text-sm text-gray-500">{describeError(error)}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} className="mt-4 rounded-lg border border-gray-300 px-4 py-2">
          <Text className="font-medium text-gray-800">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
