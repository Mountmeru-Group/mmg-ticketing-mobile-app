// iOS-4: the frame of the picker sheets (OptionSheet, PersonPickerSheet, TemplatePickerSheet, DatePickerSheet), as a
// native iOS page sheet. It replaces a faded-in bottom card that drew a grabber it could not be dragged by (HIG, Sheets:
// "Include a grabber in a resizable sheet. A grabber shows people that they can drag the sheet to resize it").
// - A swipe down closes it, as every iOS sheet (onRequestClose, `allowSwipeDismissal`); so does the ✕ (or Cancel).
// - The system draws the presentation. With Reduce Motion on, it fades instead of sliding (HIG, Accessibility:
//   "Replacing transitions in x-, y-, and z-axes with fades to avoid motion").
// - The page sheet covers the bottom of the screen, so the content keeps clear of the home indicator.
// What a sheet lists, and what picking a row does, is unchanged: only the frame is new.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/hooks/useReduceMotion';
import { colors } from '@/theme';

export function PageSheet({
  visible, title, onClose, left, right, children,
}: {
  visible: boolean;
  title: string;
  /** A swipe down, the ✕, or (with `left`) whatever the caller's leading button does. */
  onClose: () => void;
  /** Replaces the ✕, e.g. DatePickerSheet's Cancel. */
  left?: ReactNode;
  /** The trailing button, e.g. DatePickerSheet's Done. */
  right?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType={reduceMotion ? 'fade' : 'slide'}
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white" style={{ paddingBottom: insets.bottom }}>
        <View className="min-h-14 flex-row items-center border-b border-border px-2">
          <View className="min-w-16 items-start">{left ?? <SheetClose onPress={onClose} />}</View>
          <Text accessibilityRole="header" className="flex-1 text-center text-base font-semibold text-gray-900" numberOfLines={2}>
            {title}
          </Text>
          <View className="min-w-16 items-end">{right ?? null}</View>
        </View>
        {children}
      </View>
    </Modal>
  );
}

/** The standard Close button: the ✕ symbol with no text label (HIG, Toolbars), a 44 pt target. */
function SheetClose({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onPress} className="h-11 w-11 items-center justify-center active:opacity-60">
      <Ionicons name="close" size={24} color={colors.text.primary} />
    </Pressable>
  );
}

/** A text button in a sheet's bar (Cancel, Done), in the brand tint, at least 44 pt. */
export function SheetTextButton({ label, onPress, bold = false }: { label: string; onPress: () => void; bold?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="min-h-11 min-w-11 justify-center px-2 active:opacity-60">
      <Text className={`text-base text-primary ${bold ? 'font-semibold' : ''}`}>{label}</Text>
    </Pressable>
  );
}
