// SAVED FILTERS, at the top of the M3 Filters sheet (2026-11-17). On this phone only: nothing is sent to the Service
// Desk and nothing syncs with the web portal (src/store/savedFilters.store.ts). Rules: src/utils/saved-filters.ts.
// - The saved ones as chips. Tapping one applies its whole set at once; the chip whose set is on the list right now is
//   filled brand red. "Manage" renames and deletes (a delete asks first).
// - "Save these filters" (dashed) opens a sheet: a name, and the exact list of what is being captured.
// - Every role that has the Filters sheet can save; a filter holds only what that role may send.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FieldLabel, FilterChip, OutlineButton, Sheet, SubmitButton } from '@/components';
import { useSavedTicketFilters } from '@/hooks';
import { colors, palette } from '@/theme';
import { confirmAction, notify } from '@/utils/dialogs';
import {
  SAVED_FILTER_LIMIT, SAVED_FILTER_NAME_MAX, SavedFilterError, sameSavedFilterContent, savedFilterChips,
  savedFilterSaveProblem, type SavedFilterContent, type SavedTicketFilter,
} from '@/utils/saved-filters';

const failure = (error: unknown) => (error instanceof SavedFilterError ? error.message : "Couldn't save that on this phone. Try again.");

/** `current`: the list's filters right now, as a saved filter would hold them (captureSavedFilter). */
export function SavedFiltersBlock({ current, onApply }: { current: SavedFilterContent; onApply: (filter: SavedTicketFilter) => void }) {
  const { items, ready, save, rename, remove } = useSavedTicketFilters();
  const [sheet, setSheet] = useState<'save' | 'manage' | null>(null);
  const saveProblem = ready ? savedFilterSaveProblem(items, current) : null;

  return (
    <View className="mx-4 mb-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500" accessibilityRole="header">
          Saved filters
        </Text>
        {items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage saved filters"
            onPress={() => setSheet('manage')}
            className="h-11 justify-center pl-3 active:opacity-60"
          >
            <Text className="text-sm font-medium text-blue-700">Manage</Text>
          </Pressable>
        ) : null}
      </View>

      {items.length > 0 ? (
        <View className="mb-2 flex-row flex-wrap" style={{ gap: 8 }}>
          {items.map((f) => (
            <FilterChip key={f.id} label={f.name} role="button" active={sameSavedFilterContent(f, current)} onPress={() => onApply(f)} />
          ))}
        </View>
      ) : ready ? (
        <Text className="mb-2 text-xs text-gray-500">Save the filters you use often, then tap one to apply it. Kept on this phone only.</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || !!saveProblem }}
        disabled={!ready || !!saveProblem}
        onPress={() => setSheet('save')}
        className={`min-h-11 flex-row items-center justify-center rounded-lg border border-dashed px-4 py-2 ${saveProblem ? 'border-gray-300' : 'border-gray-400 active:bg-gray-100'}`}
      >
        <Ionicons name="bookmark-outline" size={16} color={saveProblem ? colors.text.muted : colors.text.body} />
        <Text className={`ml-2 text-sm font-medium ${saveProblem ? 'text-gray-500' : 'text-gray-700'}`}>Save these filters</Text>
      </Pressable>
      {saveProblem ? <Text className="mt-1 text-xs text-gray-600">{saveProblem}</Text> : null}

      <SaveFilterSheet
        visible={sheet === 'save'}
        content={current}
        onClose={() => setSheet(null)}
        onSave={async (name) => {
          const saved = await save(name, current);
          notify(`Saved “${saved.name}”.`);
        }}
      />
      <ManageFiltersSheet visible={sheet === 'manage'} items={items} onClose={() => setSheet(null)} onRename={rename} onRemove={remove} />
    </View>
  );
}

/** A name field with its rules: required, trimmed, at most SAVED_FILTER_NAME_MAX characters, not a name already used. */
function NameForm({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial: string;
  submitLabel: string;
  /** Resolves when done; throws SavedFilterError with the reason to show. */
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <FieldLabel label="Name" required hint={`Up to ${SAVED_FILTER_NAME_MAX} characters.`} />
      <TextInput
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError(null);
        }}
        maxLength={SAVED_FILTER_NAME_MAX}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        placeholder="e.g. My urgent network tickets"
        placeholderTextColor={colors.text.secondary}
        accessibilityLabel="Name, required"
        className={`min-h-11 rounded-lg border bg-white px-3 py-2 text-base text-gray-900 ${error ? 'border-red-600' : 'border-gray-300'}`}
      />
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="mt-1 text-sm text-red-700">
          {error}
        </Text>
      ) : null}
      <View className="mt-4">
        <SubmitButton label={submitLabel} onPress={() => void submit()} loading={busy} />
      </View>
      <View className="mt-2">
        <OutlineButton label="Cancel" onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

function SaveFilterSheet({
  visible, content, onClose, onSave,
}: {
  visible: boolean;
  content: SavedFilterContent;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const chips = savedFilterChips(content);
  return (
    <Sheet visible={visible} title="Save these filters" onClose={onClose} avoidKeyboard height="tall">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        {/* Exactly what is captured, read-only, so nothing is a surprise when it is applied later. */}
        <FieldLabel label="What this filter holds" hint="Applying it later sets exactly these. Anything else is cleared." />
        <View className="mb-4 flex-row flex-wrap" style={{ gap: 6 }} accessibilityLabel={`This filter holds: ${chips.join(', ')}`}>
          {chips.map((chip) => (
            <View key={chip} className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1">
              <Text className="text-xs text-gray-700">{chip}</Text>
            </View>
          ))}
        </View>
        {visible ? (
          <NameForm
            initial=""
            submitLabel="Save filter"
            onSubmit={async (name) => {
              await onSave(name);
              onClose();
            }}
            onCancel={onClose}
          />
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function ManageFiltersSheet({
  visible, items, onClose, onRename, onRemove,
}: {
  visible: boolean;
  items: readonly SavedTicketFilter[];
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState<SavedTicketFilter | null>(null);
  useEffect(() => {
    if (!visible) setRenaming(null);
  }, [visible]);

  const askToDelete = async (filter: SavedTicketFilter) => {
    const ok = await confirmAction({
      title: `Delete “${filter.name}”?`,
      message: 'The saved filter is removed from this phone. Your tickets and the filters on the list are not changed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await onRemove(filter.id);
    } catch (e) {
      notify(failure(e));
    }
  };

  return (
    <Sheet
      visible={visible}
      title={renaming ? `Rename “${renaming.name}”` : `Saved filters (${items.length} of ${SAVED_FILTER_LIMIT})`}
      onClose={onClose}
      avoidKeyboard={renaming !== null}
      height="tall"
    >
      {renaming ? (
        <View className="px-4 pb-2">
          <NameForm
            key={renaming.id}
            initial={renaming.name}
            submitLabel="Save name"
            onSubmit={async (name) => {
              await onRename(renaming.id, name);
              setRenaming(null);
            }}
            onCancel={() => setRenaming(null)}
          />
        </View>
      ) : (
        <ScrollView>
          {items.length === 0 ? <Text className="px-4 py-6 text-center text-sm text-gray-500">No saved filters.</Text> : null}
          {items.map((f) => (
            <View key={f.id} className="min-h-14 flex-row items-center border-b border-gray-100 py-2 pl-4">
              <View className="flex-1">
                <Text className="text-base text-gray-900">{f.name}</Text>
                <Text className="text-xs text-gray-500" numberOfLines={2}>
                  {savedFilterChips(f).join(' · ')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Rename ${f.name}`}
                onPress={() => setRenaming(f)}
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name="pencil-outline" size={20} color={colors.text.body} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${f.name}`}
                onPress={() => void askToDelete(f)}
                className="mr-1 h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name="trash-outline" size={20} color={palette.red[700]} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}
