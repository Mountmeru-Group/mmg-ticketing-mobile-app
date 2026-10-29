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
//
// Sign-in: the pasted token is checked with ONE AUTH-2 GET /auth/me, sent with that token, and the account the
// server returns (real id, role, country) is what gets stored — the same `{ token, user }` pair the A2 login will
// return (02 §4). If /auth/me fails, nothing is stored and the person stays here (Ronit, decision "Option A").
// The token is never logged and never shown.
import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';

import { apiClient } from '@/api/client';
import { ApiClientError, describeError } from '@/api/errors';
import { useAuthStore } from '@/store/auth.store';
import { USER_ROLES, type AuthMeResponse, type AuthStackScreenProps, type AuthUser } from '@/types';
import { ROLE_LABELS } from '@/utils/roles';
import { PlaceholderScreen, Section } from '../PlaceholderScreen';

/** `sd_session` is an opaque UUID v4 (02 §1.1). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts the bare value, or `sd_session=<value>` / a trailing `;` copied from DevTools. */
function normaliseToken(raw: string): string {
  return raw.trim().replace(/^sd_session=/, '').replace(/;$/, '').trim();
}

/** The AUTH-2 user, or null when the response is not the documented `{ user: AuthUser }` (03 §C). */
function parseMe(data: unknown): AuthUser | null {
  const user = (data as Partial<AuthMeResponse> | null)?.user as Partial<AuthUser> | undefined;
  if (!user || typeof user !== 'object') return null;
  if (typeof user.id !== 'string' || typeof user.displayName !== 'string' || typeof user.email !== 'string') return null;
  if (!USER_ROLES.includes(user.role as AuthUser['role'])) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as AuthUser['role'],
    ldapSamAccount: typeof user.ldapSamAccount === 'string' ? user.ldapSamAccount : null,
    countryId: typeof user.countryId === 'string' ? user.countryId : null,
  };
}

/** AUTH-2 with the PASTED token. skipAuth: the store has no token yet, so the header is set here explicitly. */
async function fetchAccount(token: string): Promise<AuthUser> {
  const res = await apiClient.get<AuthMeResponse>('/auth/me', {
    skipAuth: true,
    headers: { Authorization: `Bearer ${token}` }, // capital B, one space (02 §3)
  });
  const user = parseMe(res.data);
  if (!user) throw new ApiClientError('shape', res.status, { error: 'Unexpected response shape from AUTH-2' });
  return user;
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 401) {
    return 'The Service Desk did not accept this token (expired, signed out, or from another environment). Copy a fresh sd_session value from UAT.';
  }
  return `Couldn't verify this token: ${describeError(error)}`;
}

export function DevTokenScreen(props: AuthStackScreenProps<'DevToken'>) {
  if (!__DEV__) return null;
  return <DevTokenForm {...props} />;
}

function DevTokenForm(_props: AuthStackScreenProps<'DevToken'>) {
  const setSession = useAuthStore((s) => s.setSession);
  const [rawToken, setRawToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submitToken() {
    if (checking) return;
    const token = normaliseToken(rawToken);
    if (!UUID_RE.test(token)) {
      setError('That is not an sd_session value. Expected a UUID such as 3f1c…-…-…-…-….');
      return;
    }
    setError(null);
    setChecking(true);
    let user: AuthUser;
    try {
      user = await fetchAccount(token);
    } catch (e) {
      setError(failureMessage(e)); // not signed in — no placeholder user is ever stored
      setChecking(false);
      return;
    }
    try {
      // On success the root navigator switches to the app; this screen unmounts.
      await setSession({ token, user });
    } catch {
      setError('Could not save the token to secure storage.');
      setChecking(false);
    }
  }

  const disabled = checking || rawToken.trim().length === 0;

  return (
    <PlaceholderScreen
      screenId="DEV"
      title="Developer session token"
      headerVariant="back"
      visibility="__DEV__ builds only. Not present in release builds. REMOVE BEFORE RELEASE (Phase 5)."
      endpoints={['AUTH-2 · GET /auth/me — checks the pasted token and loads its real account']}
    >
      <Section heading="sd_session from a UAT browser session">
        <Text className="mb-2 text-sm text-gray-700">
          Sign in to UAT in a browser, copy the sd_session cookie value (DevTools → Application → Cookies) and paste it
          here. It is stored in SecureStore only. UAT only — never paste a production token.
        </Text>
        <TextInput
          value={rawToken}
          onChangeText={setRawToken}
          editable={!checking}
          placeholder="Paste sd_session value"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          spellCheck={false}
          secureTextEntry
          accessibilityLabel="UAT session token"
          className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
        />
        {error ? <Text className="mt-2 text-sm text-red-700">{error}</Text> : null}
      </Section>

      <Section heading="Account">
        <Text className="text-xs text-gray-500">
          The app asks the Service Desk who this token belongs to (GET /auth/me) and signs in as that account — its real
          name, role ({USER_ROLES.map((r) => ROLE_LABELS[r]).join(', ')}) and country. There is nothing to choose here.
        </Text>
      </Section>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={checking ? 'Checking token' : 'Use this token'}
        accessibilityState={{ disabled, busy: checking }}
        disabled={disabled}
        onPress={() => void submitToken()}
        className={`min-h-11 rounded-lg px-4 py-3 ${disabled ? 'bg-gray-300' : 'bg-amber-600'}`}
      >
        <Text className="text-center font-semibold text-white">{checking ? 'Checking token…' : 'Use this token'}</Text>
      </Pressable>
      <Text className="mt-3 text-xs text-gray-500">
        Signing out of the app ends this session on the server, so the UAT browser you copied it from is signed out too.
      </Text>
    </PlaceholderScreen>
  );
}
