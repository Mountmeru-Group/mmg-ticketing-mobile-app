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
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #25): pushed from More (its account card and "Settings" row), with the native
// navigation bar. The form scrolls the focused field above the keyboard and the tab bar (automaticallyAdjustKeyboardInsets)
// and a drag down puts the keyboard away. The country list keeps its scrollable sheet (a server list).
// iOS-4:
// - the Account card (docs/ios/APP-STORE-COMPLIANCE.md H1, H6): Privacy Policy opens MMG's policy in Safari, and Request
//   Account Deletion files a ticket for IT through the existing TKT-2 after a confirmation (utils/accountDeletion.ts).
//   Each row shows only once its release value is set in config/legal.ts; a production build refuses empty ones.
// - the fields: Return moves Name → Phone → Department → Timezone; the phone pad, which has no Return key, gets the
//   keyboard's Done bar; Name and Phone offer AutoFill (textContentType). The email wraps instead of being cut.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type ReturnKeyTypeOptions,
  type TextInputProps,
} from 'react-native';

import { describeWriteError, isSessionEndedError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import { APP_VERSION, ENVIRONMENT_LABEL } from '@/config/env';
import { ACCOUNT_DELETION_CATEGORY, ACCOUNT_DELETION_WORKING_DAYS, PRIVACY_POLICY_URL } from '@/config/legal';
import {
  Card, ErrorState, FieldLabel, InlineError, KeyboardDoneBar, LoadingSkeleton, Notice, OfflineBanner, OptionSheet, QueryBanner,
  SubmitButton, type SheetOption,
} from '@/components';
import {
  countryName, profileChanges, useCategories, useCountryOptions, useCreateTicket, useProfile, useSignOut, useSingleFlight,
  useUpdateProfile, validateProfile, type ProfileForm,
} from '@/hooks';
import { requireOnline } from '@/hooks/writeGuards';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors, maxTextScale, palette } from '@/theme';
import type { MoreStackScreenProps, UserProfile } from '@/types';
import {
  DELETION_CONFIRM_LABEL, DELETION_CONFIRM_TITLE, accountDeletionTicket, accountRows, deletionConfirmMessage,
  findDeletionCategory,
} from '@/utils/accountDeletion';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import { formatDateTime, formatDisplayName, initials } from '@/utils/format';
import { hapticOutcome } from '@/utils/haptics';
import { ROLE_LABELS } from '@/utils/roles';
import { isPlaceholderUser } from '@/utils/session';
import { countrySelectorMode } from '@/utils/ticket-filters';

const ALL_COUNTRIES = '__ALL__';
const EMPTY_FORM: ProfileForm = { displayName: '', phone: '', department: '', timezone: '' };
/** The profile form's keyboard Done bar (iOS-4, components/KeyboardDoneBar.tsx). */
const PROFILE_KEYBOARD = 'profile-keyboard';
/** Which Account rows this build shows (config/legal.ts, set per release). */
const ACCOUNT_ROWS = accountRows({
  privacyPolicyUrl: PRIVACY_POLICY_URL,
  deletionCategory: ACCOUNT_DELETION_CATEGORY,
  deletionWorkingDays: ACCOUNT_DELETION_WORKING_DAYS,
});

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

export function ProfileScreen({ navigation }: MoreStackScreenProps<'Profile'>) {
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

  // ── Account (iOS-4): the privacy policy, and a deletion request for IT through TKT-2 ──
  const createTicket = useCreateTicket();
  // LKP-1 only when a request is being sent (refetch runs even while the query is disabled), never on opening Profile.
  const categories = useCategories({ enabled: false });
  const canRequestDeletion = ACCOUNT_ROWS.requestDeletion && !!user && !placeholder;
  const openPrivacyPolicy = () => {
    Linking.openURL(PRIVACY_POLICY_URL).catch(() => Alert.alert("Couldn't open the privacy policy", 'Try again.'));
  };
  const requestDeletion = () =>
    void once(async () => {
      if (!user) return;
      const ok = await confirmAction({
        title: DELETION_CONFIRM_TITLE,
        message: deletionConfirmMessage(ACCOUNT_DELETION_WORKING_DAYS),
        confirmLabel: DELETION_CONFIRM_LABEL,
      });
      if (!ok) return;
      try {
        // Offline, the lookup below would wait for the network: say so now, as every write does.
        requireOnline();
        const lookup = categories.data ? { data: categories.data, error: null } : await categories.refetch();
        if (!lookup.data) throw lookup.error ?? new Error('No categories');
        const category = findDeletionCategory(lookup.data, ACCOUNT_DELETION_CATEGORY);
        if (!category) {
          hapticOutcome('error');
          Alert.alert("Couldn't send the request", `The Service Desk has no "${ACCOUNT_DELETION_CATEGORY}" category. Nothing was sent. Contact IT.`);
          return;
        }
        const { ticket } = await createTicket.mutateAsync(
          accountDeletionTicket(user, { appVersion: APP_VERSION, requestedAt: new Date(), categoryId: category.id }),
        );
        hapticOutcome('success');
        Alert.alert('Request Sent', `Ticket #${ticket.ticketNumber} was created. IT will reply on it; updates appear in Alerts.`, [
          { text: 'View Ticket', onPress: () => navigation.navigate('TicketDetail', { ticketId: ticket.id }) },
          { text: 'OK', style: 'cancel' },
        ]);
      } catch (e) {
        reportWriteError("Couldn't send the request", e);
      }
    });

  const set = (key: keyof ProfileForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  // Return moves through the fields in order (iOS-4).
  const phoneInput = useRef<TextInput>(null);
  const departmentInput = useRef<TextInput>(null);
  const timezoneInput = useRef<TextInput>(null);
  const tz = deviceTimezone();
  const displayName = formatDisplayName(profile.data?.displayName ?? user?.displayName);

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner />
      <QueryBanner error={profile.error} hasData={!!profile.data} onRetry={() => void onRefresh()} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Card>
          <View className="flex-row items-center">
            {/* The web's avatar (AppLayout.tsx): brand red at 10 % with red initials, as in the drawer. */}
            <View
              className="h-14 w-14 items-center justify-center rounded-full bg-primary/10"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text className="text-lg font-bold text-primary" maxFontSizeMultiplier={1.4}>{initials(profile.data?.displayName ?? user?.displayName)}</Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-lg font-bold text-gray-900" numberOfLines={2} maxFontSizeMultiplier={maxTextScale.title3}>
                {displayName || 'Signed in'}
              </Text>
              {/* Wraps (iOS-4): the email is shown nowhere else, so it is never cut off (HIG Typography). */}
              <Text selectable className="text-sm text-gray-500">
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
            <Field
              label="Name"
              required
              value={form.displayName}
              onChange={set('displayName')}
              autoCapitalize="words"
              textContentType="name"
              editable={!update.isPending}
              next={phoneInput}
            />
            <ReadOnly label="Email" value={user?.email ?? profile.data.email} />
            <ReadOnly label="Role" value={user ? ROLE_LABELS[user.role] : ''} />
            <Field
              label="Phone"
              value={form.phone}
              onChange={set('phone')}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              editable={!update.isPending}
              inputRef={phoneInput}
            />
            <Field
              label="Department"
              value={form.department}
              onChange={set('department')}
              autoCapitalize="words"
              editable={!update.isPending}
              inputRef={departmentInput}
              next={timezoneInput}
            />
            <Field
              label="Timezone"
              required
              hint="A name like Africa/Dar_es_Salaam, or UTC"
              value={form.timezone}
              onChange={set('timezone')}
              editable={!update.isPending}
              inputRef={timezoneInput}
            />
            {tz && tz !== form.timezone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Use this device's timezone, ${tz}`}
                onPress={() => set('timezone')(tz)}
                className="-mt-3 mb-2 min-h-11 justify-center self-start active:opacity-60"
              >
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
                accessibilityLabel="Discard changes"
                onPress={() => {
                  setError(null);
                  if (profile.data) setForm(formFrom(profile.data));
                }}
                className="mt-2 min-h-11 items-center justify-center active:opacity-60"
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
                  className="min-h-11 flex-row items-center rounded-lg border border-gray-300 bg-white px-3 py-2 active:bg-gray-50"
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

        {ACCOUNT_ROWS.privacyPolicy || canRequestDeletion ? (
          <Card title="Account" flush>
            {ACCOUNT_ROWS.privacyPolicy ? (
              <AccountRow icon="shield-checkmark-outline" label="Privacy Policy" hint="Opens in Safari" onPress={openPrivacyPolicy} trailing="open-outline" />
            ) : null}
            {canRequestDeletion ? (
              <AccountRow
                icon="person-remove-outline"
                label="Request Account Deletion"
                hint="Asks you to confirm, then sends IT a request to delete your Service Desk account"
                onPress={requestDeletion}
                busy={createTicket.isPending}
                destructive
                divider={ACCOUNT_ROWS.privacyPolicy}
              />
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
      <KeyboardDoneBar id={PROFILE_KEYBOARD} />

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
    </View>
  );
}

function Field({
  label, value, onChange, required, hint, editable = true, keyboardType, autoCapitalize = 'none', textContentType, inputRef,
  next,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  editable?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  autoCapitalize?: 'none' | 'words';
  textContentType?: TextInputProps['textContentType'];
  inputRef?: RefObject<TextInput | null>;
  /** The field Return moves to; without one, Return is Done. */
  next?: RefObject<TextInput | null>;
}) {
  const returnKeyType: ReturnKeyTypeOptions = next ? 'next' : 'done';
  return (
    <View className="mb-3">
      <FieldLabel label={label} required={required} hint={hint} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        submitBehavior={next ? 'submit' : 'blurAndSubmit'}
        onSubmitEditing={next ? () => next.current?.focus() : undefined}
        inputAccessoryViewID={PROFILE_KEYBOARD}
        accessibilityLabel={label}
        className={`min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 ${editable ? 'bg-white' : 'bg-gray-100'}`}
      />
    </View>
  );
}

/** A row of the Account card: an iOS settings row, 44 pt or more, with a red label for the deletion request. */
function AccountRow({
  icon, label, hint, onPress, trailing = 'chevron-forward', busy = false, destructive = false, divider = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  trailing?: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  destructive?: boolean;
  divider?: boolean;
}) {
  const tint = destructive ? palette.red[700] : colors.text.body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      className={`min-h-11 flex-row items-center py-3 active:opacity-60 ${divider ? 'border-t border-border' : ''}`}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text className={`ml-3 flex-1 text-base ${destructive ? 'text-red-700' : 'text-gray-900'}`}>{label}</Text>
      {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name={trailing} size={18} color={colors.text.muted} />}
    </Pressable>
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
