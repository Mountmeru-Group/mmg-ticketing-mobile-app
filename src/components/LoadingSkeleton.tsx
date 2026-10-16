import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, View } from 'react-native';

interface LoadingSkeletonProps {
  /**
   * Full-width layouts (own cards and top padding):
   * - `list`:     ticket-style cards (M3 and the other card lists).
   * - `detail`:   header, properties and a conversation (M4 and every screen that opens one record).
   * - `formPage`: a card of labelled fields and the submit button (M5–M8, M11 while their ticket or lookups load).
   * Inline layouts, placed inside a section or card the screen already draws:
   * - `rows`:   compact ticket rows (M2 recent tickets).
   * - `form`:   labelled fields (M10 profile).
   * - `lines`:  a heading and a few text lines (small cards).
   * - `chips`:  one row of filter chips.
   */
  variant?: 'list' | 'detail' | 'formPage' | 'rows' | 'form' | 'lines' | 'chips';
  /** Number of placeholder items: cards (`list`), rows, fields, text lines or chips. */
  rows?: number;
}

function usePulse() {
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
  return opacity;
}

function Bar({ className }: { className: string }) {
  return <View className={`rounded bg-gray-200 ${className}`} />;
}

function Card({ children }: { children: ReactNode }) {
  return <View className="mx-4 mb-3 rounded-xl bg-white p-4">{children}</View>;
}

/** One pulsing placeholder bar, for a single value inside real layout (e.g. a tile's count). */
export function Skeleton({ className }: { className: string }) {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Bar className={className} />
    </Animated.View>
  );
}

function body(variant: NonNullable<LoadingSkeletonProps['variant']>, rows: number): ReactNode {
  const items = Array.from({ length: rows }, (_, i) => i);
  switch (variant) {
    case 'detail':
      return (
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
      );
    case 'formPage':
      return (
        <>
          <View className="mx-4 mb-3">
            <Bar className="h-3 w-3/5" />
          </View>
          <Card>
            {body('form', rows)}
          </Card>
          <View className="mx-4">
            <Bar className="h-12 w-full rounded-lg" />
          </View>
        </>
      );
    case 'rows':
      return items.map((i) => (
        <View key={i} className={`py-3 ${i === rows - 1 ? '' : 'border-b border-gray-100'}`}>
          <View className="flex-row">
            <Bar className="h-3 w-12" />
            <Bar className="ml-2 h-3 w-24" />
          </View>
          <Bar className="mt-1.5 h-4 w-4/5" />
          <View className="mt-2 flex-row">
            <Bar className="mr-1.5 h-4 w-16 rounded-full" />
            <Bar className="mr-1.5 h-4 w-14 rounded-full" />
            <Bar className="h-4 w-20 rounded-full" />
          </View>
          <Bar className="mt-1.5 h-3 w-1/2" />
        </View>
      ));
    case 'form':
      return items.map((i) => (
        <View key={i} className="mb-3">
          <Bar className="mb-1.5 h-3 w-24" />
          <Bar className="h-11 w-full rounded-lg" />
        </View>
      ));
    case 'lines':
      return (
        <View>
          <Bar className="mb-2 h-3 w-1/5" />
          <Bar className="mb-3 h-4 w-4/5" />
          {items.map((i) => (
            <Bar key={i} className={`mb-2 h-3 ${i === rows - 1 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </View>
      );
    case 'chips':
      return (
        <View className="flex-row">
          {items.map((i) => (
            <Bar key={i} className={`mr-2 h-8 rounded-full ${i % 2 === 0 ? 'w-20' : 'w-28'}`} />
          ))}
        </View>
      );
    default:
      return items.map((i) => (
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
      ));
  }
}

export function LoadingSkeleton({ variant = 'list', rows = 4 }: LoadingSkeletonProps) {
  const opacity = usePulse();
  const fullWidth = variant === 'list' || variant === 'detail' || variant === 'formPage';
  return (
    // Animated.View takes no className under NativeWind without cssInterop, so its own styles are inline.
    <Animated.View
      style={{ opacity, paddingTop: fullWidth ? 12 : 0 }}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {body(variant, rows)}
    </Animated.View>
  );
}
