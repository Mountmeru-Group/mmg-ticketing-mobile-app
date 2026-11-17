// Bottom sheet with a single-choice list (M3 sort sheet, country selector, every dropdown). Android back closes it.
// Phase P: the options are a FlatList of memoised rows, so a long list (categories, groups) is laid out as it scrolls.
// The first 20 render at once — more than the sheet shows — so a short list looks exactly as before and a long one
// never grows while it is on screen.
// 2026-11-17: a LONG list (more than OPTION_SEARCH_THRESHOLD options, utils/option-search.ts) gets a search field pinned
// above it. This is the one place dropdown search lives: every picker built on OptionSheet gets it, none adds its own.
// - Case-insensitive, anywhere in the label. No match: a plain line saying so, never an empty sheet.
// - The sheet rises above the keyboard and its list still scrolls (Sheet `avoidKeyboard`); a tap on an option with the
//   keyboard up picks it at once.
// - The field clears whenever the sheet closes (a pick, back, a tap outside, or the caller hiding it).
// - TalkBack: the field has a real label ("Search <title>"), and the number of matches is announced as it changes.
// 2026-11-17 (second brief): `multiple` — the same sheet with checkboxes, for a filter the SERVER reads several values
// for (only the ticket list's Status today; utils/multi-select.ts says why). One component, not a second.
// - A "Select all" row pinned under the search, with the count as the web shows it ("1/12": chosen / all options). With
//   a search typed it applies to the options the search shows, and only to them.
// - Ticks change a draft; the choice is handed to the caller once, when the sheet closes (Done, back, a tap outside), so
//   the list behind makes one request, not one per tick. "Clear" unticks everything.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, FlatList, Pressable, Text, View, type ListRenderItem } from 'react-native';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useStableCallback } from '@/hooks/useStableCallback';
import { colors } from '@/theme';
import { inOptionOrder, sameChoices, selectAllState, selectionCount, toggleAllShown, toggleChoice } from '@/utils/multi-select';
import { filterOptionsByLabel, isSearchableList, noOptionMatchText, optionSearchAnnouncement } from '@/utils/option-search';
import { OutlineButton, SubmitButton } from './Form';
import { SearchField } from './Filters';
import { Sheet } from './Sheet';

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
  /** Shown in place of the options, e.g. a loading or error state. */
  children?: ReactNode;
}

interface SingleProps<T extends string> extends CommonProps<T> {
  multiple?: false;
  selected: T | null;
  onSelect: (value: T) => void;
}

interface MultipleProps<T extends string> extends CommonProps<T> {
  /** Checkboxes. Only for a filter the server reads several values for. */
  multiple: true;
  selectedValues: readonly T[];
  /** Called once, when the sheet closes, and only if the choice changed. */
  onChange: (values: T[]) => void;
}

export type OptionSheetProps<T extends string> = SingleProps<T> | MultipleProps<T>;

/** Enough rows to fill the sheet (70 % of the tallest phone screen) on the first render. */
const FIRST_RENDER_ROWS = 20;
/** How long the list must stay the same before TalkBack hears the count: not on every keystroke. */
const ANNOUNCE_AFTER_MS = 500;

const optionKey = (option: SheetOption<string>) => option.value;

export function OptionSheet<T extends string>(props: OptionSheetProps<T>) {
  const { visible, title, options, onClose, children } = props;
  const multiple = props.multiple === true;
  const committed = props.multiple === true ? props.selectedValues : null;
  const [query, setQuery] = useState('');
  // A loading or error state replaces the list: no field above it.
  const searchable = children === undefined && isSearchableList(options.length);
  const shown = useMemo(
    () => (searchable ? filterOptionsByLabel(options as readonly SheetOption<string>[], query) : (options as readonly SheetOption<string>[])),
    [searchable, options, query],
  );

  // Multiple: the ticks while the sheet is open, from the caller's choice each time it opens.
  const [draft, setDraft] = useState<string[]>([]);
  useEffect(() => {
    if (visible && committed) setDraft(inOptionOrder(options as readonly SheetOption<string>[], committed));
    // Only when it opens: a re-render of the caller must not undo the ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Cleared whenever the sheet closes, however it closed.
  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const close = useStableCallback(() => {
    setQuery('');
    if (props.multiple === true && !sameChoices(draft, props.selectedValues)) props.onChange(draft as T[]);
    onClose();
  });
  // One identity while the sheet is open (callers pass inline functions), so unchanged rows are not re-rendered.
  const pick = useStableCallback((value: string) => {
    setQuery('');
    if (props.multiple !== true) props.onSelect(value as T);
    onClose();
  });
  const toggle = useStableCallback((value: string) => {
    setDraft((now) => toggleChoice(options as readonly SheetOption<string>[], now, value));
  });

  // The count, once typing pauses. Nothing is said for an empty field: the whole list is back.
  const settled = useDebouncedValue(query, ANNOUNCE_AFTER_MS);
  const settledCount = useMemo(
    () => (searchable && settled.trim() ? filterOptionsByLabel(options as readonly SheetOption<string>[], settled).length : null),
    [searchable, options, settled],
  );
  useEffect(() => {
    if (visible && settledCount !== null) AccessibilityInfo.announceForAccessibility(optionSearchAnnouncement(settledCount));
  }, [visible, settledCount]);

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

  const allState = selectAllState(shown, draft);
  return (
    <Sheet visible={visible} title={title} onClose={close} avoidKeyboard={searchable}>
      {searchable ? (
        <View className="mx-4 mb-2">
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            placeholder="Search…"
            accessibilityLabel={`Search ${title}`}
          />
        </View>
      ) : null}
      {multiple && children === undefined ? (
        // Pinned above the list, so it never scrolls away. Applies to what the search shows.
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allState === 'all' ? true : allState === 'some' ? 'mixed' : false, disabled: shown.length === 0 }}
          accessibilityLabel={`${query.trim() ? 'Select all shown' : 'Select all'}, ${draft.length} of ${options.length} selected`}
          disabled={shown.length === 0}
          onPress={() => setDraft((now) => toggleAllShown(options as readonly SheetOption<string>[], shown, now))}
          className="min-h-12 flex-row items-center border-b border-gray-200 px-4 py-3 active:bg-gray-50"
        >
          <CheckIcon state={allState} />
          <Text className="ml-3 flex-1 text-base font-medium text-gray-900">{query.trim() ? 'Select all shown' : 'Select all'}</Text>
          <Text className="text-sm text-gray-600">{selectionCount(draft.length, options.length)}</Text>
        </Pressable>
      ) : null}
      {children ?? (
        <FlatList
          data={shown}
          keyExtractor={optionKey}
          renderItem={renderOption}
          extraData={multiple ? draft : singleSelected}
          initialNumToRender={FIRST_RENDER_ROWS}
          removeClippedSubviews={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searchable && query.trim() ? (
              <Text className="px-4 py-6 text-center text-sm text-gray-500">{noOptionMatchText(query)}</Text>
            ) : null
          }
        />
      )}
      {multiple ? (
        <View className="flex-row border-t border-gray-100 px-4 pt-3" style={{ gap: 12 }}>
          <View className="flex-1">
            <OutlineButton label="Clear" onPress={() => setDraft([])} disabled={draft.length === 0} />
          </View>
          <View className="flex-1">
            <SubmitButton label="Done" onPress={close} />
          </View>
        </View>
      ) : null}
    </Sheet>
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
      accessibilityState={{ selected: active }}
      onPress={() => onPick(option.value)}
      className="min-h-12 flex-row items-center border-b border-gray-100 px-4 py-3 active:bg-gray-50"
    >
      <View className="flex-1">
        <Text className={`text-base ${active ? 'font-semibold text-primary' : 'text-gray-900'}`}>{option.label}</Text>
        {option.description ? <Text className="text-xs text-gray-500">{option.description}</Text> : null}
      </View>
      {active ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
});

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
      onPress={() => onToggle(option.value)}
      className="min-h-12 flex-row items-center border-b border-gray-100 px-4 py-3 active:bg-gray-50"
    >
      <CheckIcon state={checked ? 'all' : 'none'} />
      <View className="ml-3 flex-1">
        <Text className={`text-base ${checked ? 'font-semibold text-gray-900' : 'text-gray-900'}`}>{option.label}</Text>
        {option.description ? <Text className="text-xs text-gray-500">{option.description}</Text> : null}
      </View>
    </Pressable>
  );
});
