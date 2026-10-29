// The search box and filter chips above a list — one look on Tickets, Tasks, Knowledge base and Approvals
// (docs/brand/UI-STANDARDS.md, S5 and S8).
// - SearchField: at least 44 pt, white with the form-input border; the clear button is a full 44 pt target. It grows
//   with the person's text size (iOS-4: a fixed height cut the text off).
// - FilterChip: at least 36 pt tall with a 4 pt hit slop (44 pt to touch), growing with the text size. Active = brand
//   primary, as the web's active nav item. iOS-4: picking another chip plays the selection haptic.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, TextInput, View, type ReturnKeyTypeOptions } from 'react-native';

import { colors } from '@/theme';
import { hapticSelection } from '@/utils/haptics';

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
    <View className="min-h-11 flex-row items-center rounded-lg border border-gray-300 bg-white pl-3">
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
        className="ml-2 flex-1 py-2 text-base text-gray-900"
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={onClear} className="h-11 w-11 items-center justify-center active:opacity-60">
          <Ionicons name="close-circle" size={18} color={colors.text.muted} />
        </Pressable>
      ) : (
        <View className="w-3" />
      )}
    </View>
  );
}

export function FilterChip({
  label, active, onPress, icon, role = 'radio', accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** `radio` for one-of-many filters, `button` for an on/off toggle or a quick pick. */
  role?: 'radio' | 'button';
  /** What VoiceOver says, when it should say more than the label. */
  accessibilityLabel?: string;
}) {
  const press = () => {
    // A one-of-many chip that is already on changes nothing, so it plays nothing (HIG: avoid overusing haptics).
    if (!(role === 'radio' && active)) hapticSelection();
    onPress();
  };
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      onPress={press}
      hitSlop={4}
      className={`min-h-9 flex-row items-center rounded-full border px-3 py-1 ${active ? 'border-primary bg-primary' : 'border-gray-300 bg-white active:bg-gray-50'}`}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.primaryForeground : colors.text.body} style={{ marginRight: 4 }} /> : null}
      <Text className={`text-sm ${active ? 'font-medium text-primary-foreground' : 'text-gray-700'}`}>{label}</Text>
    </Pressable>
  );
}
