// Switches on isAuthenticated between the Auth stack and the App tabs (docs/ios/00-PORT-MANIFEST.md §4.5).
// The sheets sit beside the tabs in this stack, so they present over the whole app as iOS page sheets and cover the
// tab bar (HIG, Tab bars: "The exception is when a modal view covers the tab bar, because a modal is temporary and
// self-contained"). A sheet closes with a swipe down or the standard Close button.
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { AppState, Pressable, View } from 'react-native';

import { endSession } from '@/api/client';
import { PlaceholderRoute } from '@/screens/placeholders';
import { SESSION_ENDED_MESSAGE, isSessionExpired, useAuthStore } from '@/store/auth.store';
import { wipeSessionLeftByPreviousInstall } from '@/store/installMarker';
import { colors } from '@/theme';
import type { RootStackParamList } from '@/types';
import { AppTabs } from './AppTabs';
import { AuthStack } from './AuthStack';
import { navigationRef } from './navigationRef';
import { SHEET_ROUTES, routeTitle } from './routes';
import { hideSplash } from './splash';
import { STACK_SCREEN_OPTIONS } from './TabStacks';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** 8-hour hard expiry also applies while the app sits in the background (02 §5.4). */
function useExpireSessionOnForeground() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const { isAuthenticated, issuedAt } = useAuthStore.getState();
      if (isAuthenticated && (issuedAt === null || isSessionExpired(issuedAt))) {
        void endSession(SESSION_ENDED_MESSAGE);
      }
    });
    return () => subscription.remove();
  }, []);
}

/** The standard Close button of a sheet: the ✕ symbol, no text label (HIG, Toolbars), a 44 pt target. */
function SheetCloseButton() {
  const navigation = useNavigation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}
      onPress={() => navigation.goBack()}
      className="h-11 w-11 items-center justify-center"
    >
      <Ionicons name="close" size={24} color={colors.text.primary} />
    </Pressable>
  );
}

const SHEET_OPTIONS: NativeStackNavigationOptions = {
  ...STACK_SCREEN_OPTIONS,
  presentation: 'modal',
  headerShown: true,
  headerLeft: () => <SheetCloseButton />,
};

export function RootNavigator() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    // iOS keeps Keychain items after the app is deleted: a reinstall must not start in the old session (installMarker.ts).
    void (async () => {
      await wipeSessionLeftByPreviousInstall();
      await useAuthStore.getState().restoreSession();
    })();
  }, []);
  useExpireSessionOnForeground();

  // While the stored session is read, the native splash is still on screen (./splash.ts): this view is never seen.
  if (isLoading) return <View className="flex-1 bg-white" />;

  return (
    // The first screen is mounted: hand over from the native splash.
    <NavigationContainer ref={navigationRef} onReady={hideSplash}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="App" component={AppTabs} />
            <Stack.Group screenOptions={SHEET_OPTIONS}>
              {SHEET_ROUTES.map((name) => (
                <Stack.Screen key={name} name={name} component={PlaceholderRoute} options={{ title: routeTitle(name, role) }} />
              ))}
            </Stack.Group>
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
