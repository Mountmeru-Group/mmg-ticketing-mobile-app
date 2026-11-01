import './global.css';
// Keeps the native splash up until the first screen is ready (src/navigation/splash.ts). Must load before rendering.
import '@/navigation/splash';

import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { startConnectivityMonitoring } from '@/api/network';
import { queryClient } from '@/api/queryClient';
import { ErrorBoundary, HtmlRenderProvider } from '@/components';
import { RootNavigator } from '@/navigation/RootNavigator';
import { SplashIntro } from '@/navigation/SplashIntro';

// Offline → queries pause instead of failing (src/api/network.ts). Must run before the first query.
startConnectivityMonitoring();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Conservative defaults (staleTime ≥ 60 s, no polling, no focus/reconnect/remount refetch, ≤ 2 GET
            retries, never on 4xx) are set where the client is created: src/api/queryClient.ts. */}
        <QueryClientProvider client={queryClient}>
          <HtmlRenderProvider>
            <StatusBar barStyle="dark-content" />
            {/* A render crash below shows a recoverable screen, not a white screen or a redbox. */}
            <ErrorBoundary>
              <RootNavigator />
              {/* The start-up intro, over the first screen while it mounts; then gone (docs/PERFORMANCE.md §12). */}
              <SplashIntro />
            </ErrorBoundary>
          </HtmlRenderProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
