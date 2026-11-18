// A sheet with a choice list (M3 sort sheet, country selector, categories, groups, every dropdown). iOS-4: a native page
// sheet (./PageSheet.tsx) that a swipe down or the ✕ closes; picking a row closes it too.
// Phase P: the options are a FlatList of memoised rows, so a long list (categories, groups) is laid out as it scrolls.
// The first 20 render at once — more than the sheet shows — so a short list looks exactly as before and a long one
// never grows while it is on screen.
// 2026-11-17 (Android 7d0a19d; iOS-5i): a LONG list (more than OPTION_SEARCH_THRESHOLD options, utils/option-search.ts)
// gets a search field pinned above it. This is the one place dropdown search lives: every picker built on OptionSheet
// gets it, none adds its own.
// - Case-insensitive, anywhere in the label. No match: a plain line saying so, never an empty sheet.
// - iOS: the list's insets follow the keyboard (`automaticallyAdjustKeyboardInsets`), so every row stays reachable; a
//   drag on the list puts the keyboard away; a tap on an option with the keyboard up picks it at once.
// - The field clears whenever the sheet closes (a pick, the ✕ or Done, a swipe down, or the caller hiding it).
// - VoiceOver: the field has a real label ("Search <title>"), and the number of matches is announced as it changes.
// `multiple` (Android 4d0e51e, 723e2fc; iOS-5i): the same sheet with checkboxes. One component, not a second. Every
// ticket-list filter uses it (status, priority, category, technician, group; utils/multi-select.ts).
// - A "Select all" row pinned under the search, with the count as the web shows it ("1/38": chosen / all options). With
//   a search typed it applies to the options the search shows, and only to them.
// - `allLabel` ("All categories") is the first row: it CLEARS the choice. It is not a value and is never sent.
// - Ticks change a draft; the choice is handed to the caller once, when the sheet closes, so the list behind makes one
//   request, not one per tick. iOS: Clear (left) and Done (right) sit in the sheet's bar, in place of ✕ and Android's
//   footer (Ronit, iOS-5i decision 4). Done and a swipe down both close it, and closing applies the ticks, as Android's
//   Done, back and tap outside do.
// - `selectedOptions`: the names of chosen values the options may not hold (a saved view's category no longer listed, or
//   a technician found by an earlier search). They keep their rows, so opening and closing never drops a choice, even
//   while the options are still loading.
// - `remoteSearch`: the options come from a SERVER search the caller runs (technicians, USR-3, which only answers a
//   search). The field is always there; with it empty the sheet shows the choices; typed, it shows what the caller
//   passes. The count reads "2 selected": a search has no known total. iOS has no live region, so the caller's
//   `announcement` (what the footer says) is read to VoiceOver when it changes.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, FlatList, Pressable, Text, View, type ListRenderItem } from 'react-native';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useStableCallback } from '@/hooks/useStableCallback';
import { colors } from '@/theme';
import {
  byLabel, inOptionOrder, mergeOptions, sameChoices, selectAllState, selectionCount, selectionCountUnknownTotal, toggleAllShown,
  toggleChoice,
} from '@/utils/multi-select';
import { filterOptionsByLabel, isSearchableList, noOptionMatchText, optionSearchAnnouncement } from '@/utils/option-search';
import { SearchField } from './Filters';
import { PageSheet, SheetTextButton } from './PageSheet';

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface CommonProps<T extends string> {
  visible: boolean;
  title: string;
  options: readonly SheetOption<T>[];
  onClose: () => void;
  /** Once the sheet has left the screen (PageSheet onDismiss): where a sheet that follows this one opens. */
  onDismiss?: () => void;
  /** Shown in place of the options, e.g. a loading or error state. */
  children?: ReactNode;
}

interface SingleProps<T extends string> extends CommonProps<T> {
  multiple?: false;
  selected: T | null;
  onSelect: (value: T) => void;
}

/** The field and its results belong to the caller, who runs the search (debounced) and passes the results as `options`. */
export interface OptionSheetRemoteSearch {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  /** Under the rows: searching, "type 2 letters", a failed search, no match. */
  footer?: ReactNode;
  /** iOS: the footer in words, read to VoiceOver when it changes (Android: a live region). */
  announcement?: string | null;
}

interface MultipleProps<T extends string> extends CommonProps<T> {
  /** Checkboxes. */
  multiple: true;
  selectedValues: readonly T[];
  /** Names for chosen values that `options` may not hold. */
  selectedOptions?: readonly SheetOption<T>[];
  /** Called once, when the sheet closes, and only if the choice changed. `chosen`: the same values, with their names. */
  onChange: (values: T[], chosen: SheetOption<T>[]) => void;
  /** The first row, e.g. "All categories": clears the choice. Not a value. */
  allLabel?: string;
  remoteSearch?: OptionSheetRemoteSearch;
}

export type OptionSheetProps<T extends string> = SingleProps<T> | MultipleProps<T>;

/** Enough rows to fill the sheet on the first render. */
const FIRST_RENDER_ROWS = 20;
/** How long the list must stay the same before VoiceOver hears the count: not on every keystroke. */
const ANNOUNCE_AFTER_MS = 500;
const NONE: readonly SheetOption<string>[] = [];

const optionKey = (option: SheetOption<string>) => option.value;

export function OptionSheet<T extends string>(props: OptionSheetProps<T>) {
  const { visible, title, options: given, onClose, onDismiss, children } = props;
  const options = given as readonly SheetOption<string>[];
  const multi = props.multiple === true ? props : null;
  const multiple = multi !== null;
  const remote = multi?.remoteSearch ?? null;
  const committed = multi ? (multi.selectedValues as readonly string[]) : null;
  const named = (multi?.selectedOptions as readonly SheetOption<string>[] | undefined) ?? NONE;

  const [ownQuery, setOwnQuery] = useState('');
  const query = remote ? remote.query : ownQuery;
  const setQuery = (text: string) => (remote ? remote.onQueryChange(text) : setOwnQuery(text));

  // Multiple: the ticks while the sheet is open, from the caller's choice each time it opens.
  const [draft, setDraft] = useState<string[]>([]);
  // Server search: every option met while open (each search's results), and the rows shown with the field empty.
  const [met, setMet] = useState<readonly SheetOption<string>[]>(NONE);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());

  /**
   * Every option the sheet knows, in the order its ticks are kept. Local: the caller's order, then any chosen value the
   * options lack. Server search: everyone met while open, by name (a search has no order of its own).
   */
  const known = useMemo(
    () => (remote ? byLabel(mergeOptions(named, met, options)) : mergeOptions(options, named)),
    [remote, named, met, options],
  );

  // A loading or error state replaces the list: no field above it (except a server search's, which IS the list).
  const searchable = remote !== null || (children === undefined && isSearchableList(known.length));
  const shown = useMemo<readonly SheetOption<string>[]>(() => {
    if (remote) return query.trim() ? options : known.filter((o) => pinned.has(o.value));
    return searchable ? filterOptionsByLabel(known, query) : known;
  }, [remote, query, options, known, pinned, searchable]);

  useEffect(() => {
    if (!visible || !committed) return;
    setDraft(inOptionOrder(remote ? byLabel(mergeOptions(named, options)) : mergeOptions(options, named), committed));
    setMet(NONE);
    setPinned(new Set(committed));
    // Only when it opens: a re-render of the caller must not undo the ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // A server search's results stay known after the next search replaces them: a tick on one is never lost.
  useEffect(() => {
    if (!visible || !remote || options.length === 0) return;
    // The same state when nothing is new, so a caller that rebuilds its results each render cannot loop.
    setMet((now) => {
      const merged = mergeOptions(now, options);
      return merged.length === now.length ? now : merged;
    });
  }, [visible, remote, options]);

  // Cleared whenever the sheet closes, however it closed.
  useEffect(() => {
    if (!visible) setOwnQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = useStableCallback(() => {
    setQuery('');
    if (multi && !sameChoices(draft, committed ?? [])) {
      const byValue = new Map(known.map((o) => [o.value, o]));
      const chosen = draft.map((value) => byValue.get(value) ?? { value, label: value });
      multi.onChange(draft as T[], chosen as SheetOption<T>[]);
    }
    onClose();
  });
  // One identity while the sheet is open (callers pass inline functions), so unchanged rows are not re-rendered.
  const pick = useStableCallback((value: string) => {
    setQuery('');
    if (props.multiple !== true) props.onSelect(value as T);
    onClose();
  });
  const toggle = useStableCallback((value: string) => {
    setDraft((now) => toggleChoice(known, now, value));
    if (remote) setPinned((now) => new Set(now).add(value));
  });
  const toggleAll = () => {
    setDraft((now) => toggleAllShown(known, shown, now));
    if (remote) setPinned((now) => new Set([...now, ...shown.map((o) => o.value)]));
  };

  // The count, once typing pauses. Nothing is said for an empty field: the whole list is back. A server search's
  // footer is said by its own announcement (below).
  const settled = useDebouncedValue(query, ANNOUNCE_AFTER_MS);
  const settledCount = useMemo(
    () => (!remote && searchable && settled.trim() ? filterOptionsByLabel(known, settled).length : null),
    [remote, searchable, known, settled],
  );
  useEffect(() => {
    if (visible && settledCount !== null) AccessibilityInfo.announceForAccessibility(optionSearchAnnouncement(settledCount));
  }, [visible, settledCount]);
  // iOS: a server search's footer in words, when it changes (no live region on iOS).
  const spoken = remote?.announcement ?? null;
  useEffect(() => {
    if (visible && spoken) AccessibilityInfo.announceForAccessibility(spoken);
  }, [visible, spoken]);

  const singleSelected = props.multiple === true ? null : props.selected;
  const chosen = useMemo(() => new Set(draft), [draft]);
  const renderOption = useCallback<ListRenderItem<SheetOption<string>>>(
    ({ item }) =>
      multiple ? (
        <CheckRow option={item} checked={chosen.has(item.value)} onToggle={toggle} />
      ) : (
        <OptionRow option={item} active={item.value === singleSelected} onPick={pick} />
      ),
    [multiple, chosen, toggle, singleSelected, pick],
  );

  const typed = query.trim() !== '';
  const allState = selectAllState(shown, draft);
  const count = remote ? selectionCountUnknownTotal(draft.length) : selectionCount(draft.length, known.length);
  const allLabel = multi?.allLabel;
  return (
    <PageSheet
      visible={visible}
      title={title}
      onClose={close}
      onDismiss={onDismiss}
      left={multiple ? <SheetTextButton label="Clear" onPress={() => setDraft([])} disabled={draft.length === 0} /> : undefined}
      right={multiple ? <SheetTextButton label="Done" onPress={close} bold /> : undefined}
    >
      {searchable ? (
        <View className="mx-4 my-2">
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            placeholder={remote?.placeholder ?? 'Search…'}
            accessibilityLabel={`Search ${title}`}
          />
        </View>
      ) : null}
      {multiple && (children === undefined || remote) ? (
        // Pinned above the list, so it never scrolls away. Applies to what the search shows.
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allState === 'all' ? true : allState === 'some' ? 'mixed' : false, disabled: shown.length === 0 }}
          accessibilityLabel={`${typed ? 'Select all shown' : 'Select all'}, ${count}`}
          disabled={shown.length === 0}
          onPress={toggleAll}
          className="min-h-12 flex-row items-center border-b border-border px-4 py-3 active:bg-gray-50"
        >
          <CheckIcon state={allState} />
          <Text className="ml-3 flex-1 text-base font-medium text-gray-900">{typed ? 'Select all shown' : 'Select all'}</Text>
          <Text className="ml-2 text-sm text-gray-600">{count}</Text>
        </Pressable>
      ) : null}
      {children != null && !remote ? (
        children
      ) : (
        <FlatList
          data={shown}
          keyExtractor={optionKey}
          renderItem={renderOption}
          extraData={multiple ? draft : singleSelected}
          initialNumToRender={FIRST_RENDER_ROWS}
          removeClippedSubviews={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          ListHeaderComponent={
            allLabel && !typed ? <AllRow label={allLabel} active={draft.length === 0} onPress={() => setDraft([])} /> : null
          }
          ListEmptyComponent={
            !remote && searchable && typed ? (
              <Text className="px-4 py-6 text-center text-sm text-gray-500">{noOptionMatchText(query)}</Text>
            ) : null
          }
          ListFooterComponent={remote ? <View>{remote.footer}</View> : null}
        />
      )}
    </PageSheet>
  );
}

const OptionRow = memo(function OptionRow({
  option, active, onPick,
}: {
  option: SheetOption<string>;
  active: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={option.description ? `${option.label}, ${option.description}` : option.label}
      accessibilityState={{ selected: active }}
      onPress={() => onPick(option.value)}
      className="min-h-12 flex-row items-center border-b border-border px-4 py-3 active:bg-gray-50"
    >
      <View className="flex-1">
        <Text className={`text-base ${active ? 'font-semibold text-primary' : 'text-gray-900'}`}>{option.label}</Text>
        {option.description ? <Text className="text-xs text-gray-500">{option.description}</Text> : null}
      </View>
      {active ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
});

/** "All categories": the choice when nothing is ticked. Tapping it unticks everything; it is never a value. */
function AllRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? `${label}, selected` : `${label}: clear the choice`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="min-h-12 flex-row items-center border-b border-border px-4 py-3 active:bg-gray-50"
    >
      <Text className={`flex-1 text-base ${active ? 'font-semibold text-primary' : 'text-gray-900'}`}>{label}</Text>
      {active ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

/** A checkbox: ticked (brand red), part-ticked ("Select all" with some chosen) or empty. */
function CheckIcon({ state }: { state: 'all' | 'some' | 'none' }) {
  if (state === 'all') return <Ionicons name="checkbox" size={22} color={colors.primary} />;
  if (state === 'some') return <Ionicons name="remove-circle" size={22} color={colors.primary} />;
  return <Ionicons name="square-outline" size={22} color={colors.text.secondary} />;
}

const CheckRow = memo(function CheckRow({
  option, checked, onToggle,
}: {
  option: SheetOption<string>;
  checked: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={option.description ? `${option.label}, ${option.description}` : option.label}
      onPress={() => onToggle(option.value)}
      className="min-h-12 flex-row items-center border-b border-border px-4 py-3 active:bg-gray-50"
    >
      <CheckIcon state={checked ? 'all' : 'none'} />
      <View className="ml-3 flex-1">
        <Text className={`text-base ${checked ? 'font-semibold text-gray-900' : 'text-gray-900'}`}>{option.label}</Text>
        {option.description ? <Text className="text-xs text-gray-500">{option.description}</Text> : null}
      </View>
    </Pressable>
  );
});
