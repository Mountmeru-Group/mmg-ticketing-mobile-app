// ╔════════════════════════════════════════════════════════════════════════════════════╗
// ║  ⚠  REMOVE BEFORE RELEASE — Phase 5.  ⚠                                            ║
// ║  INTERIM DEVELOPER BRIDGE until SSO (backend ask A2) ships. Authorised in writing ║
// ║  by Ronit for Phases 3–4 so screens can run against live UAT data.                 ║
// ║  - Only registered in AuthStack when __DEV__ is true, via a `require` inside the   ║
// ║    dead branch, so release bundles do not contain this module at all.             ║
// ║  - Also self-guards: renders nothing if __DEV__ is false.                          ║
// ║  - UAT tokens only. Never paste a production token (05 C.12).                      ║
// ║  - 02-AUTH.md §6 lists "asking users to paste a token" as a forbidden workaround;  ║
// ║    this screen is a dev-only exception and must never reach users.                 ║
// ╚════════════════════════════════════════════════════════════════════════════════════╝
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useAuthStore } from '@/store/auth.store';
import { USER_ROLES, type AuthStackScreenProps, type AuthUser, type UserRole } from '@/types';
import { ROLE_LABELS } from '@/utils/roles';
import { PlaceholderScreen, Section } from '../PlaceholderScreen';

/** `sd_session` is an opaque UUID v4 (02 §1.1). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts the bare value, or `sd_session=<value>` / a trailing `;` copied from DevTools. */
function normaliseToken(raw: string): string {
  return raw.trim().replace(/^sd_session=/, '').replace(/;$/, '').trim();
}

/**
 * Phase 1 has no data fetching, so the user is a local fixture with the chosen role (08 §6 Phase A:
 * "role-switchable with fixture users"). From Phase 3 the real user comes from AUTH-2 GET /auth/me.
 */
function buildFixtureUser(role: UserRole): AuthUser {
  return {
    id: '00000000-0000-4000-8000-0000000000ff',
    email: 'dev-fixture@example.invalid',
    displayName: `Dev fixture (${ROLE_LABELS[role]})`,
    role,
    ldapSamAccount: null,
    countryId: null,
  };
}

export function DevTokenScreen(props: AuthStackScreenProps<'DevToken'>) {
  if (!__DEV__) return null;
  return <DevTokenForm {...props} />;
}

function DevTokenForm(_props: AuthStackScreenProps<'DevToken'>) {
  const setSession = useAuthStore((s) => s.setSession);
  const [rawToken, setRawToken] = useState('');
  const [role, setRole] = useState<UserRole>('AGENT');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submitToken() {
    const token = normaliseToken(rawToken);
    if (!UUID_RE.test(token)) {
      setError('That is not an sd_session value. Expected a UUID such as 3f1c…-…-…-…-….');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // On success the root navigator switches to the app; this screen unmounts.
      await setSession({ token, user: buildFixtureUser(role) });
    } catch {
      setError('Could not save the token to secure storage.');
      setSaving(false);
    }
  }

  return (
    <PlaceholderScreen
      screenId="DEV"
      title="Developer session token"
      headerVariant="back"
      visibility="__DEV__ builds only. Not present in release builds. REMOVE BEFORE RELEASE (Phase 5)."
      endpoints={['AUTH-2 · GET /auth/me — run by the app shell (SessionGate) right after this screen, to load the real user.']}
    >
      <Section heading="sd_session from a UAT browser session">
        <Text className="mb-2 text-sm text-gray-700">
          Sign in to UAT in a browser, copy the sd_session cookie value (DevTools → Application → Cookies) and paste it
          here. It is stored in SecureStore only. UAT only — never paste a production token.
        </Text>
        <TextInput
          value={rawToken}
          onChangeText={setRawToken}
          placeholder="Paste sd_session value"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          spellCheck={false}
          secureTextEntry
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
        />
        {error ? <Text className="mt-2 text-sm text-red-700">{error}</Text> : null}
      </Section>

      <Section heading="Placeholder role (replaced on sign-in)">
        <Text className="mb-2 text-xs text-gray-500">
          From Phase 3 the app loads your real name, role and country from GET /auth/me before any screen opens, so
          this choice no longer changes what you see. The role is the one the token belongs to.
        </Text>
        <View className="flex-row flex-wrap">
          {USER_ROLES.map((r) => (
            <Pressable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ selected: r === role }}
              onPress={() => setRole(r)}
              className={`mb-2 mr-2 rounded-full border px-3 py-1.5 ${r === role ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}
            >
              <Text className={r === role ? 'text-sm font-medium text-white' : 'text-sm text-gray-800'}>{ROLE_LABELS[r]}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Pressable
        accessibilityRole="button"
        disabled={saving || rawToken.trim().length === 0}
        onPress={submitToken}
        className={`rounded-lg px-4 py-3 ${saving || rawToken.trim().length === 0 ? 'bg-gray-300' : 'bg-amber-600'}`}
      >
        <Text className="text-center font-semibold text-white">{saving ? 'Saving…' : 'Use this token'}</Text>
      </Pressable>
      <Text className="mt-3 text-xs text-gray-500">
        Signing out of the app does not revoke this token (it is your browser session). Sign out in the browser to end it.
      </Text>
    </PlaceholderScreen>
  );
}
