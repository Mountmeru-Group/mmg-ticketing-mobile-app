// Small form building blocks shared by M5–M8, and the app's two button styles (docs/brand/UI-STANDARDS.md, S5):
// SubmitButton (the one filled, 48 dp action of a form) and OutlineButton (secondary actions, 44 dp).
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { colors, palette } from '@/theme';
import { Card } from './Card';

/** Label with a visible, announced "required" marker. */
export function FieldLabel({ label, required = false, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <View className="mb-1">
      <Text className="text-sm font-medium text-gray-700" accessibilityLabel={required ? `${label}, required` : label}>
        {label}
        {required ? <Text className="text-red-700"> *</Text> : null}
      </Text>
      {hint ? <Text className="text-xs text-gray-500">{hint}</Text> : null}
    </View>
  );
}

/** A form section: the standard card (./Card.tsx). */
export function FormCard({ title, children }: { title?: string; children: ReactNode }) {
  return <Card title={title}>{children}</Card>;
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
        className={`min-h-11 flex-row items-center rounded-lg border border-gray-300 px-3 py-2 ${disabled ? 'bg-gray-100' : 'bg-white'} active:bg-gray-50`}
      >
        <Text className={`flex-1 text-base ${value ? 'text-gray-900' : 'text-gray-500'}`} numberOfLines={2}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.text.secondary} />
      </Pressable>
    </View>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" className="mx-4 mb-3 flex-row items-start rounded-lg bg-red-50 p-3">
      <Ionicons name="alert-circle" size={18} color={palette.red[700]} />
      <Text className="ml-2 flex-1 text-sm text-red-800">{message}</Text>
    </View>
  );
}

interface LookupQuery {
  data: unknown;
  error: unknown;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * A picker's lookup (groups, people, recommendations) failed and nothing is loaded: the reason and a Retry, inline in
 * the form, so a pick list never just comes up empty.
 */
export function LookupError({ query, what }: { query: LookupQuery; what: string }) {
  if (!query.isError || query.isFetching || query.data !== undefined) return null;
  return (
    <View accessibilityRole="alert" className="mb-3 flex-row items-center rounded-lg bg-red-50 py-1 pl-3">
      <Ionicons name="alert-circle" size={18} color={palette.red[700]} />
      <Text className="ml-2 flex-1 py-2 text-sm text-red-800">
        Couldn't load {what}. {describeError(query.error)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Retry loading ${what}`}
        onPress={() => void query.refetch()}
        className="min-h-11 justify-center px-3 active:opacity-60"
      >
        <Text className="text-sm font-semibold text-red-800">Retry</Text>
      </Pressable>
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const warning = tone === 'warning';
  return (
    <View className={`mb-3 flex-row items-start rounded-lg p-3 ${warning ? 'bg-amber-50' : 'bg-blue-50'}`}>
      <Ionicons name={warning ? 'warning-outline' : 'information-circle-outline'} size={16} color={warning ? palette.amber[800] : palette.blue[700]} />
      <Text className={`ml-2 flex-1 text-xs leading-4 ${warning ? 'text-amber-900' : 'text-blue-900'}`}>{children}</Text>
    </View>
  );
}

// `primary` is the web's primary Button (frontend/src/components/ui/Button.tsx: `bg-primary text-white`).
// `success` is green-700, not the web's green-600: white on green-600 is 3.3:1, below WCAG AA (UI-STANDARDS.md §5).
const BUTTON_TONES = {
  primary: { bg: 'bg-primary', text: 'text-primary-foreground' },
  success: { bg: 'bg-green-700', text: 'text-white' },
  danger: { bg: 'bg-red-600', text: 'text-white' },
  muted: { bg: 'bg-gray-700', text: 'text-white' },
} as const;

/** The one explicit "write" button of a form: disabled while in flight, with a spinner. */
export function SubmitButton({
  label, onPress, disabled = false, loading = false, tone = 'primary', icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: keyof typeof BUTTON_TONES;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const off = disabled || loading;
  const style = BUTTON_TONES[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      className={`h-12 flex-row items-center justify-center rounded-lg px-4 ${off ? 'bg-gray-300' : `${style.bg} active:opacity-80`}`}
    >
      {loading ? (
        // On the grey in-flight background: white would be 1.5:1, the grey label colour is 5.1:1.
        <ActivityIndicator color={palette.gray[600]} />
      ) : icon ? (
        <Ionicons name={icon} size={20} color={off ? palette.gray[600] : colors.text.inverse} />
      ) : null}
      <Text className={`text-base font-semibold ${off ? 'text-gray-600' : style.text} ${loading || icon ? 'ml-2' : ''}`}>{label}</Text>
    </Pressable>
  );
}

/**
 * A secondary action: outlined, 44 dp, icon optional. `align="start"` for a stack of actions in a card.
 * `compact` for a row of equal-width buttons (2–3 across a 360 dp screen): tighter padding, and a long label shrinks a
 * little on one line instead of wrapping, also with large system text.
 */
export function OutlineButton({
  label, onPress, icon, disabled = false, loading = false, tone = 'neutral', align = 'center', compact = false,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'neutral' | 'danger';
  align?: 'center' | 'start';
  compact?: boolean;
}) {
  const danger = tone === 'danger';
  const color = danger ? palette.red[700] : colors.text.body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={`min-h-11 flex-row items-center rounded-lg border bg-white py-2 ${compact ? 'px-2' : 'px-4'} ${align === 'center' ? 'justify-center' : ''} ${danger ? 'border-red-200' : 'border-gray-300'} ${disabled ? 'opacity-50' : 'active:bg-gray-50'}`}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : icon ? <Ionicons name={icon} size={18} color={color} /> : null}
      <Text
        className={`shrink text-sm font-medium ${danger ? 'text-red-700' : 'text-gray-700'} ${loading || icon ? (compact ? 'ml-1.5' : 'ml-2') : ''}`}
        numberOfLines={compact ? 1 : undefined}
        adjustsFontSizeToFit={compact}
        minimumFontScale={compact ? 0.75 : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}
