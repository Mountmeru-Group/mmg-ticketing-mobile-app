// Small form building blocks shared by M5–M8.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

/** Label with a visible, announced "required" marker. */
export function FieldLabel({ label, required = false, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <View className="mb-1">
      <Text className="text-sm font-medium text-gray-800" accessibilityLabel={required ? `${label}, required` : label}>
        {label}
        {required ? <Text className="text-red-600"> *</Text> : null}
      </Text>
      {hint ? <Text className="text-xs text-gray-500">{hint}</Text> : null}
    </View>
  );
}

export function FormCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="mx-4 mb-3 rounded-xl bg-white p-4">
      {title ? <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</Text> : null}
      {children}
    </View>
  );
}

/** A field that opens a picker sheet. */
export function SelectField({
  label, required, value, placeholder = 'Select', onPress, disabled = false, hint,
}: {
  label: string;
  required?: boolean;
  value: string | null;
  placeholder?: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <View className="mb-3">
      <FieldLabel label={label} required={required} hint={hint} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        className={`min-h-11 flex-row items-center rounded-lg border border-gray-300 px-3 py-2 ${disabled ? 'bg-gray-100' : 'bg-white'}`}
      >
        <Text className={`flex-1 text-base ${value ? 'text-gray-900' : 'text-gray-400'}`} numberOfLines={2}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#6b7280" />
      </Pressable>
    </View>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" className="mx-4 mb-3 flex-row items-start rounded-lg bg-red-50 p-3">
      <Ionicons name="alert-circle" size={18} color="#b91c1c" />
      <Text className="ml-2 flex-1 text-sm text-red-800">{message}</Text>
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const warning = tone === 'warning';
  return (
    <View className={`mb-3 flex-row items-start rounded-lg p-3 ${warning ? 'bg-amber-50' : 'bg-blue-50'}`}>
      <Ionicons name={warning ? 'warning-outline' : 'information-circle-outline'} size={16} color={warning ? '#92400e' : '#1d4ed8'} />
      <Text className={`ml-2 flex-1 text-xs leading-4 ${warning ? 'text-amber-900' : 'text-blue-900'}`}>{children}</Text>
    </View>
  );
}

const BUTTON_TONES = {
  primary: { bg: 'bg-blue-600', text: 'text-white' },
  success: { bg: 'bg-green-600', text: 'text-white' },
  danger: { bg: 'bg-red-600', text: 'text-white' },
  muted: { bg: 'bg-gray-700', text: 'text-white' },
} as const;

/** The one explicit "write" button of a form: disabled while in flight, with a spinner. */
export function SubmitButton({
  label, onPress, disabled = false, loading = false, tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: keyof typeof BUTTON_TONES;
}) {
  const off = disabled || loading;
  const style = BUTTON_TONES[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      className={`h-12 flex-row items-center justify-center rounded-lg px-4 ${off ? 'bg-gray-300' : style.bg}`}
    >
      {loading ? <ActivityIndicator color="#ffffff" /> : null}
      <Text className={`text-base font-semibold ${off ? 'text-gray-600' : style.text} ${loading ? 'ml-2' : ''}`}>{label}</Text>
    </Pressable>
  );
}
