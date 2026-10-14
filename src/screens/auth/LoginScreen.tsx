// M1 Login (04 §2.1).
// TODO(Phase 3, blocked on ask A2) — frontend-only rules to reimplement:
// - 05 §A.13 login error messages (verbatim), for the SSO error codes that apply to mobile:
//   oauth_denied, oauth_failed, oauth_not_configured, oauth_state_mismatch, account_deactivated, inactivity.
// - AUTH-1 decides which buttons show; `microsoftEnabled` describes the WEB SSO only (01 AUTH-1).
// - SYS-1 health check on start / after a network error; show an offline banner on failure.
// - Environment label on every non-prod build (04 M1).
// - Never: password form (production is SSO only), /auth/test-login, WebView cookie lifting (02 §6).
import { Pressable, Text, View } from 'react-native';

import { APP_ENV } from '@/config/env';
import { useAuthStore } from '@/store/auth.store';
import type { AuthStackScreenProps } from '@/types';
import { PlaceholderScreen, Section } from '../PlaceholderScreen';

export function LoginScreen({ navigation }: AuthStackScreenProps<'Login'>) {
  const signOutMessage = useAuthStore((s) => s.signOutMessage);

  return (
    <PlaceholderScreen
      screenId="M1"
      title="Sign in"
      headerVariant="none"
      visibility="Public (not signed in)"
      endpoints={[
        'SYS-1 · GET /health (outside /api/v1)',
        'AUTH-1 · GET /auth/config',
        'AUTH-P2 · POST /auth/microsoft/mobile (PENDING — ask A2)',
        'AUTH-2 · GET /auth/me',
      ]}
    >
      <Section heading="MMG Service Desk">
        <View className="mb-3 self-start rounded-full bg-amber-100 px-2.5 py-0.5">
          <Text className="text-xs font-semibold text-amber-800">{APP_ENV}</Text>
        </View>

        {signOutMessage ? (
          <View className="mb-3 rounded-lg bg-red-50 p-3">
            <Text className="text-sm text-red-800">{signOutMessage}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          className="rounded-lg bg-gray-300 px-4 py-3"
        >
          <Text className="text-center font-medium text-gray-600">Sign in with Microsoft</Text>
        </Pressable>
        <Text className="mt-2 text-xs text-gray-500">
          Blocked: backend ask A2 (native Microsoft SSO) has not shipped. See docs/web-system/02-AUTH.md.
        </Text>

        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('DevToken')}
            className="mt-4 rounded-lg border border-amber-500 bg-amber-50 px-4 py-3"
          >
            <Text className="text-center font-medium text-amber-900">Developer: use a UAT session token</Text>
          </Pressable>
        ) : null}
      </Section>
    </PlaceholderScreen>
  );
}
