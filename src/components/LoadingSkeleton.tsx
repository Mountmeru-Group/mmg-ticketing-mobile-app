import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, View } from 'react-native';

interface LoadingSkeletonProps {
  /** `list`: ticket cards (M3). `detail`: header, properties and a conversation (M4). */
  variant?: 'list' | 'detail';
  /** Number of placeholder cards in the `list` variant. */
  rows?: number;
}

function Bar({ className }: { className: string }) {
  return <View className={`rounded bg-gray-200 ${className}`} />;
}

function Card({ children }: { children: ReactNode }) {
  return <View className="mx-4 mb-3 rounded-xl bg-white p-4">{children}</View>;
}

export function LoadingSkeleton({ variant = 'list', rows = 4 }: LoadingSkeletonProps) {
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
    // Animated.View takes no className under NativeWind without cssInterop, so its own styles are inline.
    <Animated.View style={{ opacity, paddingTop: 12 }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {variant === 'detail' ? (
        <>
          <Card>
            <Bar className="mb-2 h-3 w-1/5" />
            <Bar className="mb-3 h-5 w-4/5" />
            <View className="flex-row">
              <Bar className="mr-2 h-5 w-20 rounded-full" />
              <Bar className="mr-2 h-5 w-16 rounded-full" />
              <Bar className="h-5 w-24 rounded-full" />
            </View>
          </Card>
          <Card>
            {Array.from({ length: 5 }, (_, i) => (
              <View key={i} className="mb-3 flex-row justify-between">
                <Bar className="h-3 w-1/4" />
                <Bar className="h-3 w-2/5" />
              </View>
            ))}
          </Card>
          <Card>
            <Bar className="mb-2 h-3 w-1/3" />
            <Bar className="mb-2 h-3 w-full" />
            <Bar className="h-3 w-2/3" />
          </Card>
        </>
      ) : (
        Array.from({ length: rows }, (_, i) => (
          <Card key={i}>
            <Bar className="mb-2 h-3 w-1/4" />
            <Bar className="mb-2 h-4 w-3/4" />
            <View className="mb-2 flex-row">
              <Bar className="mr-2 h-4 w-16 rounded-full" />
              <Bar className="mr-2 h-4 w-14 rounded-full" />
              <Bar className="h-4 w-20 rounded-full" />
            </View>
            <Bar className="h-3 w-1/2" />
          </Card>
        ))
      )}
    </Animated.View>
  );
}
