import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';

import { LoginScreen } from '@/screens/auth/LoginScreen';
import type { AuthStackParamList, AuthStackScreenProps } from '@/types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

// ⚠ REMOVE BEFORE RELEASE — Phase 5 (with src/screens/auth/DevTokenScreen.tsx).
// The dev-token screen exists only when __DEV__ is true. `require` sits inside the __DEV__ branch, so a
// release build folds the branch to `null` and the module is never bundled; the screen is never registered.
const DevTokenScreen: ComponentType<AuthStackScreenProps<'DevToken'>> | null = __DEV__
  ? (require('@/screens/auth/DevTokenScreen') as typeof import('@/screens/auth/DevTokenScreen')).DevTokenScreen
  : null;

export function AuthStack() {
  return (
    <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      {DevTokenScreen ? <Stack.Screen name="DevToken" component={DevTokenScreen} /> : null}
    </Stack.Navigator>
  );
}
