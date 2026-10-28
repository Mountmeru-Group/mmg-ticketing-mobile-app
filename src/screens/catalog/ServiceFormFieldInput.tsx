// One custom field of a service request form (Phase G4), for each of the seven types the web renders
// (FE:pages/service-catalog/ServiceRequestFormPage.tsx:191-221; docs/G4-WEB-CATALOGUE.md §4). Types the web does not
// know arrive here as `text`, as on the web. The field only edits its text; the rules live in utils/service-catalog.ts.
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #21): a date is picked on the iOS calendar in a sheet (DatePickerSheet) instead of
// Android's date dialog, and fills the same calendar day. A drop-down keeps the scrollable sheet: its options are the
// service's own list, of any length. A number field opens the iOS keyboard with digits and punctuation, so "-" can be
// typed (the decimal pad that `numeric` gives on iOS has none, though the web accepts "-3"); the rules are unchanged.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useState } from 'react';
import { Pressable, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { DatePickerSheet, FieldLabel, OptionSheet, SelectField, type SheetOption } from '@/components';
import { colors, palette } from '@/theme';
import { formatDate } from '@/utils/format';
import { localDateFromDay, type ServiceField } from '@/utils/service-catalog';
import { dayFromDate } from '@/utils/tasks';

/** The sheet's value for the select's empty entry ("-- Select --"); never a real option value. */
const EMPTY = '__EMPTY__';

const INPUT_CLASS = 'min-h-11 rounded-lg border bg-white px-3 py-2 text-base text-gray-900';

const KEYBOARD: Partial<Record<ServiceField['type'], KeyboardTypeOptions>> = {
  phone: 'phone-pad',
  email: 'email-address',
  number: 'numbers-and-punctuation',
};

interface Props {
  field: ServiceField;
  value: string;
  /** Shown under the control once "Add Request" has been tried (the web's react-hook-form messages). */
  error: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
}

function ServiceFormFieldInputImpl({ field, value, error, onChange, disabled }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The day the date sheet opened on; null while it is closed. */
  const [dateSheet, setDateSheet] = useState<Date | null>(null);
  const border = error ? 'border-red-600' : 'border-gray-300';
  const a11yLabel = `${field.label}${field.required ? ', required' : ''}`;

  let control;
  switch (field.type) {
    case 'select': {
      const options: SheetOption<string>[] = [{ value: EMPTY, label: field.emptyLabel }, ...field.options];
      const chosen = field.options.find((o) => o.value === value);
      control = (
        <>
          <SelectField
            label={field.label}
            required={field.required}
            value={chosen ? chosen.label : null}
            placeholder={field.emptyLabel}
            onPress={() => setSheetOpen(true)}
            disabled={disabled}
          />
          <OptionSheet
            visible={sheetOpen}
            title={field.label}
            options={options}
            selected={chosen ? chosen.value : EMPTY}
            onSelect={(v) => onChange(v === EMPTY ? '' : v)}
            onClose={() => setSheetOpen(false)}
          />
        </>
      );
      // SelectField draws its own label and bottom margin; the error goes just under the box.
      return (
        <View>
          {control}
          {error ? (
            <View className="-mt-2 mb-3">
              <FieldError message={error} />
            </View>
          ) : null}
        </View>
      );
    }
    case 'date': {
      const day = localDateFromDay(value);
      // Done only fills the field; "Add Request" sends it. The device's calendar day, as the web's date input, which sets
      // no earliest or latest day.
      const open = () => setDateSheet(day ?? new Date());
      control = (
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${a11yLabel}: ${day ? formatDate(day) : 'not set'}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={open}
            className={`flex-1 flex-row items-center ${INPUT_CLASS} ${border} ${disabled ? 'bg-gray-100' : ''} active:bg-gray-50`}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.text.secondary} />
            <Text className={`ml-2 flex-1 text-base ${day ? 'text-gray-900' : 'text-gray-500'}`}>{day ? formatDate(day) : 'Pick a date'}</Text>
          </Pressable>
          {value && !disabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Clear ${field.label}`}
              onPress={() => onChange('')}
              className="ml-1 h-11 w-11 items-center justify-center active:opacity-60"
            >
              <Ionicons name="close-circle" size={18} color={colors.text.muted} />
            </Pressable>
          ) : null}
          <DatePickerSheet
            visible={dateSheet !== null}
            title={field.label}
            value={dateSheet ?? new Date()}
            onDone={(date) => onChange(dayFromDate(date))}
            onClose={() => setDateSheet(null)}
          />
        </View>
      );
      break;
    }
    case 'textarea':
      control = (
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          multiline
          textAlignVertical="top"
          placeholder={field.placeholder}
          placeholderTextColor={colors.text.secondary}
          accessibilityLabel={a11yLabel}
          className={`min-h-24 ${INPUT_CLASS} ${border}`}
        />
      );
      break;
    default:
      // text, phone, email, number — and every type the web does not know (rendered as text there too).
      control = (
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          keyboardType={KEYBOARD[field.type] ?? 'default'}
          autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
          autoCorrect={field.type !== 'email'}
          autoComplete={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : undefined}
          placeholder={field.placeholder}
          placeholderTextColor={colors.text.secondary}
          accessibilityLabel={a11yLabel}
          className={`${INPUT_CLASS} ${border}`}
        />
      );
  }

  return (
    <View className="mb-3">
      <FieldLabel label={field.label} required={field.required} />
      {control}
      <FieldError message={error} />
    </View>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" className="mt-1 flex-row items-center">
      <Ionicons name="alert-circle" size={14} color={palette.red[700]} />
      <Text className="ml-1 flex-1 text-xs text-red-700">{message}</Text>
    </View>
  );
}

/** Memoised (Phase P2): typing in one field no longer redraws every other field of the form. */
export const ServiceFormFieldInput = memo(ServiceFormFieldInputImpl);
