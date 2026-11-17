// The bottom-sheet frame (2026-11-17): grab handle, title, then the content; Android back and a tap above it close it.
// The same frame OptionSheet, PersonPickerSheet and TemplatePickerSheet draw. With `avoidKeyboard` (a sheet with a text
// field) it rises above the keyboard and shrinks to the room left, so its list still scrolls and stays usable.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Literal class names, so Tailwind sees them. */
const HEIGHTS = { regular: 'max-h-[70%]', tall: 'max-h-[80%]' } as const;

export function Sheet({
  visible, title, onClose, children, avoidKeyboard = false, height = 'regular',
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  avoidKeyboard?: boolean;
  height?: keyof typeof HEIGHTS;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" enabled={avoidKeyboard} style={styles.fill}>
        <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 bg-black/40" />
        {/* shrink: with the keyboard up, the sheet gives up height (its list scrolls) rather than going off the top. */}
        <View style={{ paddingBottom: insets.bottom + 8 }} className={`${HEIGHTS[height]} shrink rounded-t-2xl bg-white pt-2`}>
          <View className="mb-1 h-1 w-10 self-center rounded-full bg-gray-300" />
          <Text className="px-4 py-3 text-base font-semibold text-gray-900" accessibilityRole="header">
            {title}
          </Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
