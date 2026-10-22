// M10 Profile & settings — opened from the drawer's account card and "Settings" (04 §2.1 M10, 08 §3.2).
// - Read: email, role, country from the signed-in user (the AUTH-2 /auth/me answer stored at sign-in); name, phone,
//   department, timezone from USR-1 (AUTH-2 doesn't carry them, 01 AUTH-2).
// - Edit: name, phone, department, timezone only (USR-2 allow-list in users.api). Never countryId (05 C.10), role or
//   isActive. Only changed fields are sent; an emptied phone/department is sent as "" (null is a 400).
//   After saving, the stored name is updated from the USR-2 answer, because /auth/me stays stale (05 B.28).
// - Country selector (05 §A.12): ADMIN and the UI's triage AGENT pick (LKP-5 / LKP-4); a country AGENT sees it locked;
//   hidden for L2_MANAGER (the server ignores it) and END_USER (always all own tickets, D8). It only filters the Tickets
//   list and Home counts on this device; it is never saved to the account.
// - Theme (System/Light/Dark, 04 M10) is not in this phase's brief and is not built.
// - Sign out: confirmation → AUTH-3 (result ignored) → SecureStore, cache and stores wiped → Login (02 §5.5).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeWriteError, isSessionEndedError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import { APP_VERSION, ENVIRONMENT_LABEL } from '@/config/env';
import {
  Card, ErrorState, FieldLabel, InlineError, LoadingSkeleton, Notice, OfflineBanner, OptionSheet, QueryBanner, ScreenHeader,
  SubmitButton, type SheetOption,
} from '@/components';
import {
  countryName, profileChanges, useCountryOptions, useProfile, useSignOut, useSingleFlight, useUpdateProfile, validateProfile,
  type ProfileForm,
} from '@/hooks';
import { requestReminderPermission } from '@/notifications/localReminders';
import { useAuthStore } from '@/store/auth.store';
import { usePrefsStore } from '@/store/prefs.store';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { AppDrawerScreenProps, UserProfile } from '@/types';
import { notify } from '@/utils/dialogs';
import { formatDateTime, formatDisplayName, initials } from '@/utils/format';
import { ROLE_LABELS, isStaff } from '@/utils/roles';
import { isPlaceholderUser } from '@/utils/session';
import { countrySelectorMode } from '@/utils/ticket-filters';

const ALL_COUNTRIES = '__ALL__';
const EMPTY_FORM: ProfileForm = { displayName: '', phone: '', department: '', timezone: '' };

function formFrom(p: UserProfile): ProfileForm {
  return { displayName: p.displayName ?? '', phone: p.phone ?? '', department: p.department ?? '', timezone: p.timezone ?? '' };
}

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function ProfileScreen(_props: AppDrawerScreenProps<'Profile'>) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const user = useAuthStore((s) => s.user);
  const placeholder = isPlaceholderUser(user);
  const profile = useProfile();
  const update = useUpdateProfile();
  const { signOut, signingOut } = useSignOut();
  const once = useSingleFlight();

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const changes = useMemo(() => (profile.data ? profileChanges(profile.data, form) : {}), [profile.data, form]);
  const dirty = Object.keys(changes).length > 0;

  // Load the server's values into the form, unless the person is mid-edit.
  useEffect(() => {
    if (profile.data && !dirty) setForm(formFrom(profile.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data]);

  // ── Country selector (05 §A.12) ──
  const countryMode = user ? countrySelectorMode(user) : 'hidden';
  const selectedCountry = useUiStore((s) => s.ticketCountryId);
  const setSelectedCountry = useUiStore((s) => s.setTicketCountryId);
  const [countrySheet, setCountrySheet] = useState(false);
  const countries = useCountryOptions({
    enabled: countrySheet || countryMode === 'locked' || (countryMode === 'switch' && selectedCountry !== null),
  });
  const countryOptions = useMemo<SheetOption<string>[]>(
    () => [{ value: ALL_COUNTRIES, label: 'All countries' }, ...(countries.data ?? []).map((c) => ({ value: c.id, label: countryName(c) ?? c.id }))],
    [countries.data],
  );
  const countryLabel =
    countryMode === 'locked'
      ? (countryName(countries.data?.find((c) => c.id === user?.countryId)) ?? 'Your country')
      : selectedCountry === null
        ? 'All countries'
        : (countryName(countries.data?.find((c) => c.id === selectedCountry)) ?? 'Selected country');

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await profile.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const save = () =>
    void once(async () => {
      setError(null);
      if (!profile.data) return;
      const problem = validateProfile(form);
      if (problem) {
        setError(problem);
        return;
      }
      try {
        await update.mutateAsync({ form, before: profile.data });
        notify('Profile saved');
      } catch (e) {
        if (!isSessionEndedError(e)) setError(describeWriteError(e));
      }
    });

  const set = (key: keyof ProfileForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const tz = deviceTimezone();

  // ── SLA reminders (docs/SLA-REMINDERS.md): staff only, this phone only ──
  const slaReminders = usePrefsStore((s) => s.slaReminders);
  const setSlaReminders = usePrefsStore((s) => s.setSlaReminders);
  const reminderPermission = usePrefsStore((s) => s.reminderPermission);
  const setReminderPermission = usePrefsStore((s) => s.setReminderPermission);
  const showReminders = !!user && isStaff(user.role);
  const displayName = formatDisplayName(profile.data?.displayName ?? user?.displayName);

  return (
    <KeyboardAvoidingView behavior="height" className="flex-1 bg-gray-50">
      <ScreenHeader title="Profile & settings" variant="drawer" />
      <OfflineBanner />
      <QueryBanner error={profile.error} hasData={!!profile.data} onRetry={() => void onRefresh()} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <Card>
          <View className="flex-row items-center">
            {/* The web's avatar (AppLayout.tsx): brand red at 10 % with red initials, as in the drawer. */}
            <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Text className="text-lg font-bold text-primary">{initials(profile.data?.displayName ?? user?.displayName)}</Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-lg font-bold text-gray-900" numberOfLines={1}>
                {displayName || 'Signed in'}
              </Text>
              <Text selectable className="text-sm text-gray-500" numberOfLines={1}>
                {user?.email ?? ''}
              </Text>
              <View className="mt-1 self-start rounded-full bg-gray-100 px-2.5 py-0.5">
                <Text className="text-xs font-medium text-gray-700">{user ? ROLE_LABELS[user.role] : ''}</Text>
              </View>
            </View>
          </View>
          {profile.data?.lastLoginAt ? (
            <Text className="mt-3 text-xs text-gray-500">Last sign-in {formatDateTime(profile.data.lastLoginAt)}</Text>
          ) : null}
        </Card>

        {placeholder ? (
          <View className="mx-4 mb-3">
            <Notice tone="warning">
              This session holds a placeholder account, so the profile can't be loaded or edited. Sign out and sign in again.
            </Notice>
          </View>
        ) : !profile.data && profile.isError ? (
          <Card>
            <ErrorState error={profile.error} title="Couldn't load your profile" onRetry={() => void profile.refetch()} />
          </Card>
        ) : !profile.data ? (
          <Card title="Your details">
            {profile.fetchStatus === 'paused' ? (
              <Text className="text-sm text-gray-500">Your profile loads when you reconnect.</Text>
            ) : (
              <LoadingSkeleton variant="form" rows={5} />
            )}
          </Card>
        ) : (
          <Card title="Your details">
            <Field label="Name" required value={form.displayName} onChange={set('displayName')} autoCapitalize="words" editable={!update.isPending} />
            <ReadOnly label="Email" value={user?.email ?? profile.data.email} />
            <ReadOnly label="Role" value={user ? ROLE_LABELS[user.role] : ''} />
            <Field label="Phone" value={form.phone} onChange={set('phone')} keyboardType="phone-pad" editable={!update.isPending} />
            <Field label="Department" value={form.department} onChange={set('department')} autoCapitalize="words" editable={!update.isPending} />
            <Field
              label="Timezone"
              required
              hint="A name like Africa/Dar_es_Salaam, or UTC"
              value={form.timezone}
              onChange={set('timezone')}
              editable={!update.isPending}
            />
            {tz && tz !== form.timezone ? (
              <Pressable accessibilityRole="button" onPress={() => set('timezone')(tz)} className="-mt-3 mb-2 min-h-11 justify-center self-start">
                <Text className="text-sm font-medium text-blue-700">Use this device's timezone ({tz})</Text>
              </Pressable>
            ) : null}
            <Text className="mb-3 text-xs text-gray-500">
              Email and role are managed by IT. Other screens may show your old name until you next sign in.
            </Text>
            <InlineError message={error} />
            <SubmitButton label={dirty ? 'Save changes' : 'No changes'} onPress={save} disabled={!dirty} loading={update.isPending} />
            {dirty ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setError(null);
                  if (profile.data) setForm(formFrom(profile.data));
                }}
                className="mt-2 min-h-11 items-center justify-center"
              >
                <Text className="text-sm font-medium text-blue-700">Discard changes</Text>
              </Pressable>
            ) : null}
          </Card>
        )}

        {countryMode !== 'hidden' ? (
          <Card title="Country">
            {countryMode === 'switch' ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Country: ${countryLabel}`}
                  onPress={() => setCountrySheet(true)}
                  className="min-h-11 flex-row items-center rounded-lg border border-gray-300 bg-white px-3 py-2"
                >
                  <Ionicons name="globe-outline" size={18} color={colors.text.body} />
                  <Text className="ml-2 flex-1 text-base text-gray-900">{countryLabel}</Text>
                  <Ionicons name="chevron-down" size={18} color={colors.text.secondary} />
                </Pressable>
                <Text className="mt-2 text-xs text-gray-500">Filters the Tickets list and Home counts on this device. Not saved to your account.</Text>
              </>
            ) : (
              <View accessibilityLabel={`Locked to ${countryLabel}`} className="flex-row flex-wrap items-center">
                <Ionicons name="lock-closed" size={14} color={colors.text.secondary} />
                <Text className="ml-2 text-base text-gray-900">{countryLabel}</Text>
                <Text className="ml-2 text-xs text-gray-500">Locked to your country</Text>
              </View>
            )}
          </Card>
        ) : null}

        {showReminders ? (
          <Card title="Notifications">
            <View className="flex-row items-center">
              <View className="flex-1 pr-3">
                <Text className="text-base text-gray-900">SLA reminders</Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  A notification 30 minutes before a response or resolution deadline on a ticket assigned to you. Scheduled on
                  this phone from the tickets it has loaded; not saved to your account.
                </Text>
              </View>
              <Switch
                accessibilityLabel="SLA reminders"
                value={slaReminders === true}
                disabled={slaReminders === null}
                onValueChange={(on) => void setSlaReminders(on)}
                trackColor={{ true: colors.primary }}
              />
            </View>
            {slaReminders && reminderPermission === 'undetermined' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void requestReminderPermission().then(setReminderPermission).catch(() => undefined)}
                className="mt-2 min-h-11 justify-center self-start"
              >
                <Text className="text-sm font-medium text-blue-700">Allow notifications</Text>
              </Pressable>
            ) : null}
            {slaReminders && reminderPermission === 'denied' ? (
              <Text className="mt-2 text-xs text-amber-900">Notifications for this app are blocked in Android settings.</Text>
            ) : null}
          </Card>
        ) : null}

        <Card title="App">
          <ReadOnly label="Version" value={APP_VERSION} />
          <ReadOnly label="Environment" value={ENVIRONMENT_LABEL} />
        </Card>

        <View className="mx-4">
          <SubmitButton label={signingOut ? 'Signing out…' : 'Sign out'} tone="danger" onPress={() => void once(signOut)} loading={signingOut} />
        </View>
      </ScrollView>

      <OptionSheet
        visible={countrySheet}
        title="Country"
        options={countryOptions}
        selected={selectedCountry ?? ALL_COUNTRIES}
        onSelect={(value) => setSelectedCountry(value === ALL_COUNTRIES ? null : value)}
        onClose={() => setCountrySheet(false)}
      >
        {countries.fetchStatus === 'paused' && !countries.data ? (
          <Text className="px-4 py-8 text-center text-sm text-gray-500">Countries load when you reconnect.</Text>
        ) : countries.isPending ? (
          <View className="items-center py-8">
            <ActivityIndicator color={colors.primary} />
            <Text className="mt-2 text-sm text-gray-500">Loading countries…</Text>
          </View>
        ) : countries.isError && !countries.data ? (
          <ErrorState error={countries.error} title="Couldn't load countries" onRetry={() => void countries.refetch()} />
        ) : undefined}
      </OptionSheet>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onChange, required, hint, editable = true, keyboardType, autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  editable?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <View className="mb-3">
      <FieldLabel label={label} required={required} hint={hint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        accessibilityLabel={label}
        className={`min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 ${editable ? 'bg-white' : 'bg-gray-100'}`}
      />
    </View>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3">
      <FieldLabel label={label} />
      <Text selectable className="text-base text-gray-900">
        {value || '—'}
      </Text>
    </View>
  );
}
