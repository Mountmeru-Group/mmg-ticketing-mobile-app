import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

interface LoadingSkeletonProps {
  /** Number of placeholder rows (e.g. ticket cards). */
  rows?: number;
}

export function LoadingSkeleton({ rows = 4 }: LoadingSkeletonProps) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View style={{ opacity }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="mx-4 mb-3 rounded-xl bg-white p-4">
          <View className="mb-2 h-3 w-1/4 rounded bg-gray-200" />
          <View className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
          <View className="h-3 w-1/2 rounded bg-gray-200" />
        </View>
      ))}
    </Animated.View>
  );
}
