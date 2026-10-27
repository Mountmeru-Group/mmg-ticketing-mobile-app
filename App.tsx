// ⚠ DEV ONLY — replaced in iOS-2 (docs/ios/00-PORT-MANIFEST.md §2).
// iOS-1b foundation root: the two app-wide providers and one temporary screen that proves the ported foundation
// (theme, NativeWind, assets, src/config/env.ts) runs on iOS. There is no navigation, no sign-in and no API call.
// - The foundation screen exists only when __DEV__ is true: a release bundle renders nothing, so this file can't ship.
// - iOS-2 replaces this file with the real root (navigation, error boundary, splash hand-over, connectivity monitor).
import './global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryClient } from '@/api/queryClient';
import { BrandLogo } from '@/components/BrandLogo';
import { APP_VERSION, ENVIRONMENT_LABEL } from '@/config/env';

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Conservative query defaults live where the client is created (src/api/queryClient.ts). Nothing queries yet. */}
      <QueryClientProvider client={queryClient}>{__DEV__ ? <FoundationScreen /> : null}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** DEV ONLY — replaced in iOS-2. */
function FoundationScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 items-center justify-center bg-gray-50 px-4"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <BrandLogo height={64} />
      <Text accessibilityRole="header" className="mt-4 text-2xl font-bold text-gray-900">
        Setu
      </Text>
      <Text className="mt-1 text-center text-sm text-gray-500">iOS foundation (iOS-1b)</Text>
      <View className="mt-3 rounded-full bg-amber-100 px-2.5 py-0.5">
        <Text className="text-xs font-semibold text-amber-800">{ENVIRONMENT_LABEL}</Text>
      </View>
      <Text className="mt-6 text-xs font-semibold text-red-700">DEV ONLY — replaced in iOS-2</Text>
      <Text className="mt-1 text-xs text-gray-500">v{APP_VERSION}</Text>
    </View>
  );
}
