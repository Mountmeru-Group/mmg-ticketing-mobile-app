// SAVED FILTERS, at the top of the M3 Filters sheet. Since the second brief of 2026-11-17 they are the Service Desk's saved
// ticket views: the same list as the web portal's "Views", per user and per environment (SVW-1..4, 16-SAVED-VIEWS.md).
// Rules: src/utils/saved-filters.ts. Requests and cache: src/hooks/useSavedViews.ts.
// - The views as chips, newest first (the web's order). Tapping one applies it at once, cut to this role; the chip whose
//   filters are on the list right now is filled brand red. A view holding something the app cannot apply carries a
//   warning icon, and after tapping it a note under the chips says exactly what was left out.
// - "Save these filters" (dashed) opens a sheet: what the view will hold, what it will not (the search, the country), and
//   a name. Refused, with the reason, when the quick filter cannot be held (an SLA one) or the same filters are saved.
// - "Manage" renames (the name only: the view's filters are never rewritten) and deletes (asks first; it is deleted on
//   the web too).
// - Nothing is shown as saved, renamed or deleted until the Service Desk says so. Failures are said where they happened.
//
// iOS (iOS-5i, Android 723e2fc; docs/brand/UI-STANDARDS.md §iOS-A.17): in every build, as on Android.
// - Save and Manage are page sheets (components/PageSheet.tsx): ✕ or a swipe down closes them; the name field stays above
//   the keyboard (SheetKeyboardView) and Return saves.
// - VoiceOver: iOS has no live region, so the "applied without" note, a load failure and a name error are ANNOUNCED when
//   they appear. A name error also plays the error haptic, as the app's other inline form errors (iOS-4, iOS-5f).
// - Manage stays open after a delete, so it shows its own success notice (PageSheet `notices`; Ronit, decision 4).
// - Android's versionCode-6 notice (the phone-only list of Android build 6) is not on iOS: no iOS build kept one (S3).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { describeError, describeWriteError } from '@/api/errors';
import { FieldLabel, FilterChip, OutlineButton, PageSheet, SheetKeyboardView, SubmitButton } from '@/components';
import { useCreateSavedView, useDeleteSavedView, useRenameSavedView, useSavedTicketViews, useSavedViewNames } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { SavedView } from '@/types';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import { hapticOutcome } from '@/utils/haptics';
import {
  SAVED_FILTER_NAME_MAX, captureSavedView, cleanSavedFilterName, decodeSavedView, sameSavedViewFilters, savedViewChips,
  savedViewSaveProblem, type DecodedSavedView, type SavedFilterContent, type SavedViewCapture, type TicketListFilterState,
} from '@/utils/saved-filters';

type DecodedView = DecodedSavedView & { view: SavedView };

/** iOS: VoiceOver hears `text` each time it appears or changes (Android: a live region). */
function useAnnounce(text: string | null) {
  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}

/** `list`: the ticket list's filters right now. `onApply`: put a view's content on the list (ui.store). */
export function SavedFiltersBlock({ list, onApply }: { list: TicketListFilterState; onApply: (content: SavedFilterContent) => void }) {
  const user = useAuthStore((s) => s.user);
  const views = useSavedTicketViews({ enabled: !!user });
  const names = useSavedViewNames(views.data);
  const [sheet, setSheet] = useState<'save' | 'manage' | null>(null);
  // After applying a view the app could not apply whole: what it left out. Cleared by the next tap.
  const [note, setNote] = useState<string | null>(null);
  useAnnounce(note);
  if (!user) return null;

  const capture = captureSavedView(list, user);
  const decoded: DecodedView[] = (views.data ?? []).map((view) => ({ view, ...decodeSavedView(view.filters, user, names) }));
  const ready = views.data !== undefined;
  const saveProblem = ready ? savedViewSaveProblem(views.data, capture) : null;
  const isActive = (d: DecodedView) =>
    !list.ticketSearch && !capture.refusal && d.leftOut.length === 0 && sameSavedViewFilters(d.view.filters, capture.filters);

  const apply = (d: DecodedView) => {
    const name = cleanSavedFilterName(d.view.name);
    if (!d.content) {
      setNote(`“${name}” can't be applied: the app can't read its filters. It is unchanged on the web portal.`);
      return;
    }
    onApply(d.content);
    setNote(d.leftOut.length > 0 ? `“${name}” is applied without: ${d.leftOut.join('; ')}.` : null);
  };

  return (
    <View className="mx-4 mb-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500" accessibilityRole="header">
          Saved filters
        </Text>
        {decoded.length > 0 ? (
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

      {decoded.length > 0 ? (
        <View className="mb-2 flex-row flex-wrap" style={{ gap: 8 }}>
          {decoded.map((d) => (
            <FilterChip
              key={d.view.id}
              label={cleanSavedFilterName(d.view.name)}
              role="button"
              icon={d.leftOut.length > 0 ? 'alert-circle-outline' : undefined}
              accessibilityLabel={`${cleanSavedFilterName(d.view.name)}${d.leftOut.length > 0 ? ', parts not on the app' : ''}`}
              active={isActive(d)}
              onPress={() => apply(d)}
            />
          ))}
        </View>
      ) : null}
      <ListState query={views} empty={ready && decoded.length === 0} />

      {note ? (
        <View accessibilityRole="alert" className="mb-2 flex-row items-start rounded-lg bg-amber-50 p-3">
          <Ionicons name="alert-circle" size={16} color={palette.amber[800]} />
          <Text className="ml-2 flex-1 text-xs text-amber-900">{note}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save these filters"
        accessibilityState={{ disabled: !ready || !!saveProblem }}
        disabled={!ready || !!saveProblem}
        onPress={() => setSheet('save')}
        className={`min-h-11 flex-row items-center justify-center rounded-lg border border-dashed px-4 py-2 ${saveProblem || !ready ? 'border-gray-300' : 'border-gray-400 active:bg-gray-100'}`}
      >
        <Ionicons name="bookmark-outline" size={16} color={saveProblem || !ready ? colors.text.muted : colors.text.body} />
        <Text className={`ml-2 text-sm font-medium ${saveProblem || !ready ? 'text-gray-500' : 'text-gray-700'}`}>Save these filters</Text>
      </Pressable>
      {saveProblem ? <Text className="mt-1 text-xs text-gray-600">{saveProblem}</Text> : null}

      <SaveFilterSheet visible={sheet === 'save'} capture={capture} existing={views.data ?? []} onClose={() => setSheet(null)} />
      <ManageFiltersSheet visible={sheet === 'manage'} items={decoded} existing={views.data ?? []} onClose={() => setSheet(null)} />
    </View>
  );
}

/** Loading, offline and failed states of the list; nothing once it has loaded (or the hint when it is empty). */
function ListState({
  query, empty,
}: {
  query: { data: unknown; isError: boolean; error: unknown; fetchStatus: string; refetch: () => Promise<unknown> };
  empty: boolean;
}) {
  const failed = query.data === undefined && query.fetchStatus !== 'paused' && query.isError;
  useAnnounce(failed ? `Couldn't load your saved filters. ${describeError(query.error)}` : null);
  if (empty) {
    return (
      <Text className="mb-2 text-xs text-gray-500">
        Save the filters you use often, then tap one to apply it. They are on the web portal's Views too.
      </Text>
    );
  }
  if (query.data !== undefined) return null;
  if (query.fetchStatus === 'paused') {
    return <Text className="mb-2 text-xs text-gray-500">Your saved filters load when you're back online.</Text>;
  }
  if (query.isError) {
    return (
      <View accessibilityRole="alert" className="mb-2 flex-row items-center">
        <Text className="flex-1 text-xs text-red-700">Couldn't load your saved filters. {describeError(query.error)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading your saved filters"
          onPress={() => void query.refetch()}
          className="h-11 justify-center pl-3 active:opacity-60"
        >
          <Text className="text-sm font-medium text-blue-700">Retry</Text>
        </Pressable>
      </View>
    );
  }
  return <Text className="mb-2 text-xs text-gray-500">Loading your saved filters…</Text>;
}

/** A name field with its rules: required, trimmed, at most SAVED_FILTER_NAME_MAX characters, not a name already used. */
function NameForm({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial: string;
  submitLabel: string;
  /** Resolves when done; throws with the reason to show. */
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useAnnounce(error);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name);
    } catch (e) {
      hapticOutcome('error'); // iOS: as the app's other inline form errors (iOS-5f)
      setError(describeWriteError(e));
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
        // A name from the web can be longer: then nothing is cut, and the rule is said on Save.
        maxLength={initial.length > SAVED_FILTER_NAME_MAX ? undefined : SAVED_FILTER_NAME_MAX}
        autoFocus
        returnKeyType="done"
        enablesReturnKeyAutomatically
        clearButtonMode="while-editing"
        onSubmitEditing={() => void submit()}
        placeholder="e.g. My urgent network tickets"
        placeholderTextColor={colors.text.secondary}
        accessibilityLabel="Name, required"
        className={`min-h-11 rounded-lg border bg-white px-3 py-2 text-base text-gray-900 ${error ? 'border-red-600' : 'border-gray-300'}`}
      />
      {error ? (
        <Text accessibilityRole="alert" className="mt-1 text-sm text-red-700">
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

function Pills({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <View className="mb-4 flex-row flex-wrap" style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${items.join(', ')}`}>
      {items.map((item) => (
        <View key={item} className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1">
          <Text className="text-xs text-gray-700">{item}</Text>
        </View>
      ))}
    </View>
  );
}

function SaveFilterSheet({
  visible, capture, existing, onClose,
}: {
  visible: boolean;
  capture: SavedViewCapture;
  existing: readonly SavedView[];
  onClose: () => void;
}) {
  const create = useCreateSavedView();
  return (
    <PageSheet visible={visible} title="Save these filters" onClose={onClose}>
      <SheetKeyboardView>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}
        >
          {/* Exactly what is captured, read-only, so nothing is a surprise when it is applied later, here or on the web. */}
          <FieldLabel
            label="What this filter holds"
            hint="Saved on the Service Desk: it is on the web portal's Views too. Applying it later sets exactly these."
          />
          <Pills items={savedViewChips(capture.content)} label="This filter holds" />
          {capture.notKept.length > 0 ? (
            <>
              <FieldLabel label="Not kept in a saved filter" hint="As on the web portal: applying one clears the search and keeps the country." />
              <Pills items={capture.notKept} label="Not kept" />
            </>
          ) : null}
          {visible ? (
            <NameForm
              initial=""
              submitLabel="Save filter"
              onSubmit={async (name) => {
                const view = await create.mutateAsync({ name, filters: capture.filters, existing });
                onClose();
                notify(`Saved “${cleanSavedFilterName(view.name)}”. It's on the web portal too.`);
              }}
              onCancel={onClose}
            />
          ) : null}
        </ScrollView>
      </SheetKeyboardView>
    </PageSheet>
  );
}

function ManageFiltersSheet({
  visible, items, existing, onClose,
}: {
  visible: boolean;
  items: readonly DecodedView[];
  existing: readonly SavedView[];
  onClose: () => void;
}) {
  const rename = useRenameSavedView();
  const remove = useDeleteSavedView();
  const [renaming, setRenaming] = useState<SavedView | null>(null);
  useEffect(() => {
    if (!visible) setRenaming(null);
  }, [visible]);

  const askToDelete = async (view: SavedView) => {
    const name = cleanSavedFilterName(view.name);
    const ok = await confirmAction({
      title: `Delete “${name}”?`,
      message: 'It is deleted from the Service Desk, so it goes from the web portal too. Your tickets are not changed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const { alreadyGone } = await remove.mutateAsync({ id: view.id });
      notify(alreadyGone ? `“${name}” was already deleted.` : `Deleted “${name}”.`);
    } catch (e) {
      reportWriteError(`Couldn't delete “${name}”`, e);
    }
  };

  return (
    <PageSheet
      visible={visible}
      title={renaming ? `Rename “${cleanSavedFilterName(renaming.name)}”` : `Saved filters (${items.length})`}
      onClose={onClose}
      notices
    >
      {renaming ? (
        <SheetKeyboardView>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}
          >
            <NameForm
              key={renaming.id}
              initial={cleanSavedFilterName(renaming.name)}
              submitLabel="Save name"
              onSubmit={async (name) => {
                await rename.mutateAsync({ id: renaming.id, name, existing });
                setRenaming(null);
              }}
              onCancel={() => setRenaming(null)}
            />
          </ScrollView>
        </SheetKeyboardView>
      ) : (
        <ScrollView>
          {items.length === 0 ? <Text className="px-4 py-6 text-center text-sm text-gray-500">No saved filters.</Text> : null}
          {items.map((d) => {
            const name = cleanSavedFilterName(d.view.name);
            return (
              <View key={d.view.id} className="min-h-14 flex-row items-center border-b border-border py-2 pl-4">
                <View className="flex-1">
                  <Text className="text-base text-gray-900">{name}</Text>
                  {d.content ? (
                    <Text className="text-xs text-gray-500" numberOfLines={2}>
                      {savedViewChips(d.content).join(' · ')}
                    </Text>
                  ) : null}
                  {d.leftOut.length > 0 ? (
                    <Text className="text-xs text-amber-800" numberOfLines={3}>
                      Not on the app: {d.leftOut.join('; ')}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Rename ${name}`}
                  onPress={() => setRenaming(d.view)}
                  className="h-11 w-11 items-center justify-center active:opacity-60"
                >
                  <Ionicons name="pencil-outline" size={20} color={colors.text.body} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${name}`}
                  disabled={remove.isPending}
                  onPress={() => void askToDelete(d.view)}
                  className="mr-1 h-11 w-11 items-center justify-center active:opacity-60"
                >
                  <Ionicons name="trash-outline" size={20} color={palette.red[700]} />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </PageSheet>
  );
}
