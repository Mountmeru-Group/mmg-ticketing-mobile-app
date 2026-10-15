// To / CC recipient chips (05 §A.5): add on Enter, "," or space; skip duplicates; Backspace on an empty input
// removes the last chip; leftover valid text is added on send by the caller (finalRecipients()).
// Suggestions come from USR-3 — ADMIN and AGENT only (others get 403, so the caller passes suggest=false).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useDebouncedValue, useUserSearch } from '@/hooks';
import { addEmailChip } from '@/utils/compose';
import { formatDisplayName } from '@/utils/format';

interface EmailChipsInputProps {
  label: string;
  chips: string[];
  onChangeChips: (chips: string[]) => void;
  input: string;
  onChangeInput: (text: string) => void;
  suggest: boolean;
  disabled?: boolean;
}

export function EmailChipsInput({ label, chips, onChangeChips, input, onChangeInput, suggest, disabled = false }: EmailChipsInputProps) {
  const [invalid, setInvalid] = useState(false);
  const term = useDebouncedValue(input, 350);
  const suggestions = useUserSearch(term, { enabled: suggest && !disabled });
  const shown = (suggestions.data ?? []).filter((u) => !chips.some((c) => c.toLowerCase() === u.email.toLowerCase())).slice(0, 5);

  const commit = (text: string) => {
    if (!text.trim()) return;
    const next = addEmailChip(chips, text);
    if (next) {
      onChangeChips(next);
      onChangeInput('');
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  };

  // "," or a space turn a complete address into a chip (05 §A.5). Anything else stays as typed, so a name with a
  // space can still be searched for suggestions; Enter validates and reports an invalid address.
  const onChangeText = (text: string) => {
    setInvalid(false);
    if (/[,\s]$/.test(text) && addEmailChip(chips, text)) commit(text);
    else onChangeInput(text);
  };

  return (
    <View className="mb-2">
      <View className="flex-row flex-wrap items-center rounded-lg border border-gray-300 bg-white px-2 py-1">
        <Text className="mr-1 text-sm text-gray-500">{label}</Text>
        {chips.map((email) => (
          <Pressable
            key={email}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${email}`}
            disabled={disabled}
            onPress={() => onChangeChips(chips.filter((c) => c !== email))}
            className="m-0.5 flex-row items-center rounded-full bg-blue-100 px-2 py-1"
          >
            <Text className="text-xs text-blue-900">{email}</Text>
            <Ionicons name="close" size={12} color="#1e3a8a" style={{ marginLeft: 2 }} />
          </Pressable>
        ))}
        <TextInput
          value={input}
          editable={!disabled}
          onChangeText={onChangeText}
          onSubmitEditing={() => commit(input)}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === 'Backspace' && input === '' && chips.length > 0) onChangeChips(chips.slice(0, -1));
          }}
          submitBehavior="submit"
          placeholder={chips.length ? '' : 'name@example.com'}
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          accessibilityLabel={`${label} recipients`}
          className="min-w-32 flex-1 py-1 text-sm text-gray-900"
        />
      </View>
      {invalid ? <Text className="mt-1 text-xs text-red-700">Not a valid email address.</Text> : null}
      {suggest && shown.length > 0 && input.trim().length >= 2 ? (
        <View className="mt-1 rounded-lg border border-gray-200 bg-white">
          {shown.map((u) => (
            <Pressable
              key={u.id}
              accessibilityRole="button"
              onPress={() => commit(u.email)}
              className="border-b border-gray-100 px-3 py-2 active:bg-gray-50"
            >
              <Text className="text-sm text-gray-900">{formatDisplayName(u.displayName)}</Text>
              <Text className="text-xs text-gray-500">{u.email}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
