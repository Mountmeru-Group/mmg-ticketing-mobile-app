// iOS date picker (docs/ios/00-PORT-MANIFEST.md §7): replaces Android's system date dialog (DateTimePickerAndroid.open).
// - The native inline calendar (UIDatePicker, @react-native-community/datetimepicker) in a bottom sheet, with Cancel and
//   Done in its bar, as iOS presents a date choice that applies only when confirmed. Picking a day stages it; Done hands
//   the Date to the caller, which turns it into the same calendar day the Android dialog gave (utils/tasks dayFromDate).
// - Cancel, a tap outside the sheet or the system dismiss gesture changes nothing.
// - Light only, as the app (decision D9); the accent is the brand colour, as the web's date inputs.
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

interface DatePickerSheetProps {
  visible: boolean;
  title: string;
  /** The day shown when the sheet opens. Pass the same Date while it is open. */
  value: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Done: the chosen day. The sheet closes itself afterwards (onClose). */
  onDone: (date: Date) => void;
  onClose: () => void;
}

export function DatePickerSheet({ visible, title, value, minimumDate, maximumDate, onDone, onClose }: DatePickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);
  // Each opening starts from the caller's day, never from a day staged and cancelled before.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const done = () => {
    onDone(draft);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Cancel" onPress={onClose} className="flex-1 bg-black/40" />
      <View style={{ paddingBottom: insets.bottom + 8 }} className="rounded-t-2xl bg-white pt-2">
        <View className="mb-1 h-1 w-10 self-center rounded-full bg-gray-300" />
        <View className="flex-row items-center px-2">
          <BarButton label="Cancel" onPress={onClose} />
          <Text className="flex-1 text-center text-base font-semibold text-gray-900" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          <BarButton label="Done" onPress={done} bold />
        </View>
        <View className="items-center px-2">
          <RNDateTimePicker
            value={draft}
            mode="date"
            display="inline"
            themeVariant="light"
            accentColor={colors.primary}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onValueChange={(_event, date) => setDraft(date)}
          />
        </View>
      </View>
    </Modal>
  );
}

/** A text button in the sheet's bar: the iOS Cancel / Done pair, 44 pt tall. */
function BarButton({ label, onPress, bold = false }: { label: string; onPress: () => void; bold?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} className="min-h-11 min-w-16 justify-center px-2 active:opacity-60">
      <Text className={`text-base text-primary ${bold ? 'text-right font-semibold' : ''}`}>{label}</Text>
    </Pressable>
  );
}
