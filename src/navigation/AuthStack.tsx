import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '@/screens/auth/LoginScreen';
import type { AuthStackParamList } from '@/types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

// Microsoft and email sign-in (LoginScreen) are the only ways into the app. The __DEV__ developer-token screen was
// deleted (Android 2026-10-29; iOS-5i 2026-11-18, docs/ios/ANDROID-DELTA.md §5 item 1).

export function AuthStack() {
  return (
    <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}
