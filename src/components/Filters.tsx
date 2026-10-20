// The search box and filter chips above a list — one look on Tickets, Tasks, Knowledge base and Approvals
// (docs/brand/UI-STANDARDS.md, S5 and S8).
// - SearchField: a 44 dp input, white with the form-input border; the clear button is a full 44 dp target.
// - FilterChip: 36 dp pill with a 4 dp hit slop (44 dp to touch). Active = brand primary, as the web's active nav item.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, TextInput, View, type ReturnKeyTypeOptions } from 'react-native';

import { colors } from '@/theme';

export function SearchField({
  value, onChangeText, onClear, onSubmitEditing, returnKeyType, placeholder, accessibilityLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  placeholder: string;
  accessibilityLabel: string;
}) {
  return (
    <View className="h-11 flex-row items-center rounded-lg border border-gray-300 bg-white pl-3">
      <Ionicons name="search" size={18} color={colors.text.secondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        placeholder={placeholder}
        placeholderTextColor={colors.text.secondary}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel}
        className="ml-2 flex-1 text-base text-gray-900"
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={onClear} className="h-11 w-11 items-center justify-center">
          <Ionicons name="close-circle" size={18} color={colors.text.muted} />
        </Pressable>
      ) : (
        <View className="w-3" />
      )}
    </View>
  );
}

export function FilterChip({
  label, active, onPress, icon, role = 'radio',
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** `radio` for one-of-many filters, `button` for an on/off toggle or a quick pick. */
  role?: 'radio' | 'button';
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={4}
      className={`h-9 flex-row items-center rounded-full border px-3 ${active ? 'border-primary bg-primary' : 'border-gray-300 bg-white active:bg-gray-50'}`}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.primaryForeground : colors.text.body} style={{ marginRight: 4 }} /> : null}
      <Text className={`text-sm ${active ? 'font-medium text-primary-foreground' : 'text-gray-700'}`}>{label}</Text>
    </Pressable>
  );
}
