// Bottom sheet with a single-choice list (M3 sort sheet, country selector). Android back closes it.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

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

export function OptionSheet<T extends string>({
  visible, title, options, selected, onSelect, onClose, children,
}: OptionSheetProps<T>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 bg-black/40" />
      <View style={{ paddingBottom: insets.bottom + 8 }} className="max-h-[70%] rounded-t-2xl bg-white pt-2">
        <View className="mb-1 h-1 w-10 self-center rounded-full bg-gray-300" />
        <Text className="px-4 py-3 text-base font-semibold text-gray-900" accessibilityRole="header">
          {title}
        </Text>
        {children ?? (
          <ScrollView>
            {options.map((option) => {
              const active = option.value === selected;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  className="flex-row items-center px-4 py-3 active:bg-gray-50"
                >
                  <View className="flex-1">
                    <Text className={`text-base ${active ? 'font-semibold text-primary' : 'text-gray-900'}`}>{option.label}</Text>
                    {option.description ? <Text className="text-xs text-gray-500">{option.description}</Text> : null}
                  </View>
                  {active ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
