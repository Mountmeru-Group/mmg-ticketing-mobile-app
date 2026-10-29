// A sheet with a single-choice list (M3 sort sheet, country selector, categories, groups). iOS-4: a native page sheet
// (./PageSheet.tsx) that a swipe down or the ✕ closes; picking a row closes it too.
// Phase P: the options are a FlatList of memoised rows, so a long list (categories, groups) is laid out as it scrolls.
// The first 20 render at once — more than the sheet shows — so a short list looks exactly as before and a long one
// never grows while it is on screen.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, type ReactNode } from 'react';
import { FlatList, Pressable, Text, View, type ListRenderItem } from 'react-native';

import { useStableCallback } from '@/hooks/useStableCallback';
import { colors } from '@/theme';
import { PageSheet } from './PageSheet';

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

/** Enough rows to fill the sheet on the first render. */
const FIRST_RENDER_ROWS = 20;

const optionKey = (option: SheetOption<string>) => option.value;

export function OptionSheet<T extends string>({
  visible, title, options, selected, onSelect, onClose, children,
}: OptionSheetProps<T>) {
  // One identity while the sheet is open (callers pass inline functions), so unchanged rows are not re-rendered.
  const pick = useStableCallback((value: string) => {
    onSelect(value as T);
    onClose();
  });
  const renderOption = useCallback<ListRenderItem<SheetOption<string>>>(
    ({ item }) => <OptionRow option={item} active={item.value === selected} onPick={pick} />,
    [selected, pick],
  );
  return (
    <PageSheet visible={visible} title={title} onClose={onClose}>
        {children ?? (
          <FlatList
            data={options as readonly SheetOption<string>[]}
            keyExtractor={optionKey}
            renderItem={renderOption}
            initialNumToRender={FIRST_RENDER_ROWS}
            removeClippedSubviews={false}
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
