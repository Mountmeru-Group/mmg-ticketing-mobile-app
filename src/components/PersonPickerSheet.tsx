// Searchable people picker: a local list (group members), plus USR-3 search when `searchRoles` is given.
// USR-3 is ADMIN/AGENT only (useUserSearch enforces it). Picking a person writes nothing — the caller confirms.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDebouncedValue, useUserSearch } from '@/hooks';
import { colors } from '@/theme';
import type { UserRole } from '@/types';
import { formatDisplayName } from '@/utils/format';
import { SearchField } from './Filters';
import { LookupError } from './Form';

export interface Person {
  id: string;
  displayName: string;
  email: string;
  /** Short grey note, e.g. "Not in any active group". */
  note?: string;
}

interface PersonPickerSheetProps {
  visible: boolean;
  title: string;
  /** Shown first and filtered as you type. */
  people?: readonly Person[];
  /** When set, typing ≥ 2 characters also searches USR-3 for these roles ([] = all roles). */
  searchRoles?: readonly UserRole[];
  /** Extra rows above the list, e.g. "Unassigned" or "Me". */
  extraOptions?: readonly { key: string; label: string; onPress: () => void }[];
  /** People already chosen (e.g. approvers): left out of the results. */
  excludeIds?: readonly string[];
  onPick: (person: Person) => void;
  onClose: () => void;
}

/** Module-level so the default keeps its identity between renders (it is a memo dependency). */
const NO_ONE: readonly string[] = [];

export function PersonPickerSheet({
  visible, title, people = [], searchRoles, extraOptions = [], excludeIds = NO_ONE, onPick, onClose,
}: PersonPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query, 350);
  const remote = useUserSearch(term, { roles: searchRoles ?? [], enabled: visible && searchRoles !== undefined });

  const q = query.trim().toLowerCase();
  const local = useMemo(
    () =>
      (q ? people.filter((p) => p.displayName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) : [...people]).filter(
        (p) => !excludeIds.includes(p.id),
      ),
    [people, q, excludeIds],
  );
  const remoteOnly = (remote.data ?? []).filter((r) => !local.some((p) => p.id === r.id) && !excludeIds.includes(r.id));

  const close = () => {
    setQuery('');
    onClose();
  };
  const pick = (p: Person) => {
    setQuery('');
    onPick(p);
  };

  const row = (p: Person) => (
    <Pressable key={p.id} accessibilityRole="button" onPress={() => pick(p)} className="min-h-12 border-b border-gray-100 px-4 py-3 active:bg-gray-50">
      <Text className="text-base text-gray-900">{formatDisplayName(p.displayName) || p.email}</Text>
      <Text className="text-xs text-gray-500">
        {p.email}
        {p.note ? ` · ${p.note}` : ''}
      </Text>
    </Pressable>
  );

  // Same sheet frame as OptionSheet: grab handle, title, then the list.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={close} className="flex-1 bg-black/40" />
      <View style={{ paddingBottom: insets.bottom + 8 }} className="max-h-[80%] rounded-t-2xl bg-white pt-2">
        <View className="mb-1 h-1 w-10 self-center rounded-full bg-gray-300" />
        <Text className="px-4 py-3 text-base font-semibold text-gray-900" accessibilityRole="header">{title}</Text>
        <View className="mx-4 mb-2">
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            placeholder={searchRoles !== undefined ? 'Name or email (2+ letters)' : 'Filter by name or email'}
            accessibilityLabel={searchRoles !== undefined ? 'Search people by name or email' : 'Filter people by name or email'}
          />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {extraOptions.map((o) => (
            <Pressable key={o.key} accessibilityRole="button" onPress={o.onPress} className="min-h-12 justify-center border-b border-gray-100 px-4 py-3 active:bg-gray-50">
              <Text className="text-base font-medium text-blue-700">{o.label}</Text>
            </Pressable>
          ))}
          {local.map(row)}
          {remoteOnly.map((r) => row({ id: r.id, displayName: r.displayName, email: r.email }))}
          {remote.isFetching ? <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} /> : null}
          {/* A failed search is said as such, never shown as "No one matches". */}
          <View className="mx-4 mt-2">
            <LookupError query={remote} what="people" />
          </View>
          {!remote.isFetching && !(remote.isError && !remote.data) && local.length === 0 && remoteOnly.length === 0 ? (
            <Text className="px-4 py-6 text-center text-sm text-gray-500">
              {searchRoles !== undefined && q.length < 2 ? 'Type at least 2 letters to search.' : 'No one matches.'}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
