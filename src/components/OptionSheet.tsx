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
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, FlatList, Pressable, Text, View, type ListRenderItem } from 'react-native';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useStableCallback } from '@/hooks/useStableCallback';
import { colors } from '@/theme';
import { filterOptionsByLabel, isSearchableList, noOptionMatchText, optionSearchAnnouncement } from '@/utils/option-search';
import { SearchField } from './Filters';
import { Sheet } from './Sheet';

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface OptionSheetProps<T extends string> {
  visible: boolean;
  title: string;
  options: readonly SheetOption<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
  /** Shown in place of the options, e.g. a loading or error state. */
  children?: ReactNode;
}

/** Enough rows to fill the sheet (70 % of the tallest phone screen) on the first render. */
const FIRST_RENDER_ROWS = 20;
/** How long the list must stay the same before TalkBack hears the count: not on every keystroke. */
const ANNOUNCE_AFTER_MS = 500;

const optionKey = (option: SheetOption<string>) => option.value;

export function OptionSheet<T extends string>({
  visible, title, options, selected, onSelect, onClose, children,
}: OptionSheetProps<T>) {
  const [query, setQuery] = useState('');
  // A loading or error state replaces the list: no field above it.
  const searchable = children === undefined && isSearchableList(options.length);
  const shown = useMemo(
    () => (searchable ? filterOptionsByLabel(options as readonly SheetOption<string>[], query) : (options as readonly SheetOption<string>[])),
    [searchable, options, query],
  );

  // Cleared whenever the sheet closes, however it closed.
  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const close = useStableCallback(() => {
    setQuery('');
    onClose();
  });
  // One identity while the sheet is open (callers pass inline functions), so unchanged rows are not re-rendered.
  const pick = useStableCallback((value: string) => {
    setQuery('');
    onSelect(value as T);
    onClose();
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

  const renderOption = useCallback<ListRenderItem<SheetOption<string>>>(
    ({ item }) => <OptionRow option={item} active={item.value === selected} onPick={pick} />,
    [selected, pick],
  );
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
      {children ?? (
        <FlatList
          data={shown}
          keyExtractor={optionKey}
          renderItem={renderOption}
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
