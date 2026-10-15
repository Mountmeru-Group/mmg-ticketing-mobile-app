// Signed-in shell gate: load the real user from AUTH-2 GET /auth/me before any screen renders (02 §5.1).
// Until it answers, the app does not know the token's true role, id or country — the stored copy may be stale,
// and after the dev-token screen it is a placeholder. A 401 here is handled by the API client (session cleared,
// back to Login), like everywhere else.
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { endSession } from '@/api/client';
import { ErrorState, LoadingSkeleton } from '@/components';
import { useSessionUser } from '@/hooks';
import { AppDrawer } from './AppDrawer';

export function SessionGate() {
  const me = useSessionUser();
  const insets = useSafeAreaInsets();

  if (me.isSuccess) return <AppDrawer />;

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-gray-50">
      {me.isError ? (
        <>
          <ErrorState error={me.error} title="Couldn't load your account" onRetry={() => void me.refetch()} />
          <Pressable
            accessibilityRole="button"
            // Local sign-out only: no API call (AUTH-3 is a write, outside Phase 3a).
            onPress={() => void endSession(null)}
            style={{ marginBottom: insets.bottom + 24 }}
            className="items-center py-3"
          >
            <Text className="text-sm font-medium text-gray-600">Sign out</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text className="px-4 pb-1 pt-4 text-sm text-gray-500">Loading your account…</Text>
          <LoadingSkeleton rows={4} />
        </>
      )}
    </View>
  );
}
