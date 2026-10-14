// Switches on isAuthenticated between the Auth stack and the App drawer.
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { endSession } from '@/api/client';
import { SESSION_ENDED_MESSAGE, isSessionExpired, useAuthStore } from '@/store/auth.store';
import type { RootStackParamList } from '@/types';
import { AppDrawer } from './AppDrawer';
import { AuthStack } from './AuthStack';

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

export function RootNavigator() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    void useAuthStore.getState().restoreSession();
  }, []);
  useExpireSessionOnForeground();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="App" component={AppDrawer} />
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
