// Searchable people picker: a local list (group members), plus USR-3 search when `searchRoles` is given.
// USR-3 is ADMIN/AGENT only (useUserSearch enforces it). Picking a person writes nothing — the caller confirms.
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDebouncedValue, useStableCallback, useUserSearch } from '@/hooks';
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

/** Module-level so the defaults keep their identity between renders (they are memo dependencies). */
const NO_ONE: readonly string[] = [];
const NO_PEOPLE: readonly Person[] = [];
const NO_EXTRAS: NonNullable<PersonPickerSheetProps['extraOptions']> = [];

export function PersonPickerSheet({
  visible, title, people = NO_PEOPLE, searchRoles, extraOptions = NO_EXTRAS, excludeIds = NO_ONE, onPick, onClose,
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
  const remoteOnly = useMemo(
    () => (remote.data ?? []).filter((r) => !local.some((p) => p.id === r.id) && !excludeIds.includes(r.id)),
    [remote.data, local, excludeIds],
  );

  const close = () => {
    setQuery('');
    onClose();
  };
  // Stable (Phase P): the rows are memoised and the sheet re-renders on every keystroke.
  const pick = useStableCallback((p: Person) => {
    setQuery('');
    onPick(p);
  });

  // Phase P: one virtualised list — the extra options, then the people (local first, then search results).
  const rows = useMemo<PickerRow[]>(
    () => [
      ...extraOptions.map((o): PickerRow => ({ kind: 'extra', key: `x:${o.key}`, label: o.label, onPress: o.onPress })),
      ...local.map((p): PickerRow => ({ kind: 'person', key: `p:${p.id}`, person: p })),
      ...remoteOnly.map((r): PickerRow => ({
        kind: 'person',
        key: `p:${r.id}`,
        person: { id: r.id, displayName: r.displayName, email: r.email },
      })),
    ],
    [extraOptions, local, remoteOnly],
  );
  const renderRow = useCallback<ListRenderItem<PickerRow>>(
    ({ item }) =>
      item.kind === 'extra' ? (
        <Pressable accessibilityRole="button" onPress={item.onPress} className="min-h-12 justify-center border-b border-gray-100 px-4 py-3 active:bg-gray-50">
          <Text className="text-base font-medium text-blue-700">{item.label}</Text>
        </Pressable>
      ) : (
        <PersonRow person={item.person} onPick={pick} />
      ),
    [pick],
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
        <FlatList
          data={rows}
          keyExtractor={pickerRowKey}
          renderItem={renderRow}
          initialNumToRender={20}
          removeClippedSubviews={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <>
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
            </>
          }
        />
      </View>
    </Modal>
  );
}

type PickerRow =
  | { kind: 'extra'; key: string; label: string; onPress: () => void }
  | { kind: 'person'; key: string; person: Person };

const pickerRowKey = (row: PickerRow) => row.key;

/** Memoised (Phase P): typing filters the list, and only rows that change are redrawn. */
const PersonRow = memo(function PersonRow({ person: p, onPick }: { person: Person; onPick: (person: Person) => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onPick(p)} className="min-h-12 border-b border-gray-100 px-4 py-3 active:bg-gray-50">
      <Text className="text-base text-gray-900">{formatDisplayName(p.displayName) || p.email}</Text>
      <Text className="text-xs text-gray-500">
        {p.email}
        {p.note ? ` · ${p.note}` : ''}
      </Text>
    </Pressable>
  );
});
