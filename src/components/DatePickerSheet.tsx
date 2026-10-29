// iOS date picker (docs/ios/00-PORT-MANIFEST.md §7): replaces Android's system date dialog (DateTimePickerAndroid.open).
// - The native inline calendar (UIDatePicker, @react-native-community/datetimepicker) in a page sheet (iOS-4: the native
//   sheet, ./PageSheet.tsx), with Cancel and Done in its bar, as iOS presents a date choice that applies only when
//   confirmed. Picking a day stages it; Done hands the Date to the caller, which turns it into the same calendar day the
//   Android dialog gave (utils/tasks dayFromDate).
// - Cancel or a swipe down changes nothing.
// - Light only, as the app (decision D9); the accent is the brand colour, as the web's date inputs.
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { colors } from '@/theme';
import { PageSheet, SheetTextButton } from './PageSheet';

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
    <PageSheet
      visible={visible}
      title={title}
      onClose={onClose}
      left={<SheetTextButton label="Cancel" onPress={onClose} />}
      right={<SheetTextButton label="Done" onPress={done} bold />}
    >
        <View className="items-center px-2 pt-2">
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
    </PageSheet>
  );
}
