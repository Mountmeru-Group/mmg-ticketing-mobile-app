// M10 Profile & settings — opened from the drawer header and "Settings" (04 §2.1, 08 §3.2).
// TODO(Phase 3) — frontend-only rules to reimplement:
// - Editable: displayName, phone, department, timezone only (USR-2 allow-list). Never countryId (05 C.10).
//   `department`/`phone` cleared with "" (not null). Update the local store from the USR-2 response (05 B.28).
// - Role label via ROLE_LABELS (08 S3), never the raw enum.
// - 05 §A.12 country selector: ADMIN and triage AGENT can switch (triage → LKP-4, others → LKP-5); country agent
//   locked with "Locked to …"; hidden for L2_MANAGER; read-only for END_USER. Value only feeds TKT-1/DSH-1 countryId.
// - Theme: System / Light / Dark, stored on the device (08 1.57).
// - Sign out (02 §5.5): AUTH-3 (ignore the result) → wipe SecureStore → queryClient.clear() → reset every store,
//   including the country selection. Phase 1 skips AUTH-3: the dev token is the developer's own browser session.
// - 02 §5.6 / D7: no idle logout; optional biometric app-lock instead.
import { Text } from 'react-native';

import { endSession } from '@/api/client';
import { APP_ENV, APP_VERSION } from '@/config/env';
import { useAuthStore } from '@/store/auth.store';
import type { AppDrawerScreenProps } from '@/types';
import { ROLE_LABELS } from '@/utils/roles';
import { PlaceholderScreen, Section } from '../PlaceholderScreen';

export function ProfileScreen(_props: AppDrawerScreenProps<'Profile'>) {
  const user = useAuthStore((s) => s.user);

  return (
    <PlaceholderScreen
      screenId="M10"
      title="Profile & settings"
      headerVariant="drawer"
      visibility="All roles. Country selector: ADMIN and triage AGENT (locked for country agents, hidden for L2)."
      endpoints={[
        'AUTH-2 · GET /auth/me',
        'USR-1 · GET /users/:id',
        'USR-2 · PUT /users/:id',
        'LKP-4 · GET /countries/my-countries',
        'LKP-5 · GET /countries',
        'AUTH-3 · POST /auth/logout',
      ]}
      actions={[{ label: 'Sign out', onPress: () => void endSession(null) }]}
    >
      {user ? (
        <Section heading="Signed in">
          <Text className="text-base font-semibold text-gray-900">{user.displayName}</Text>
          <Text className="text-sm text-gray-600">{ROLE_LABELS[user.role]}</Text>
        </Section>
      ) : null}
      <Section heading="App">
        <Text className="text-sm text-gray-800">
          Version {APP_VERSION} · {APP_ENV}
          {__DEV__ ? ' · development build' : ''}
        </Text>
      </Section>
    </PlaceholderScreen>
  );
}
