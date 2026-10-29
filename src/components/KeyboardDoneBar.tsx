// iOS-4: a bar above the keyboard with Done, for the long forms' multiline fields, whose Return key starts a new line and
// so can't close the keyboard (HIG, Virtual keyboards: "Place custom controls above the keyboard thoughtfully … make
// sure they're relevant to the current task"). A field opts in with `inputAccessoryViewID={id}`; each form mounts one
// bar with its own id. Single-line fields don't need it: their Return key is Next or Done.
import { InputAccessoryView, Keyboard, Pressable, Text, View } from 'react-native';

export function KeyboardDoneBar({ id }: { id: string }) {
  return (
    <InputAccessoryView nativeID={id}>
      <View className="flex-row justify-end border-t border-border bg-gray-100 px-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          accessibilityHint="Hides the keyboard"
          onPress={() => Keyboard.dismiss()}
          className="min-h-11 min-w-11 justify-center px-3 active:opacity-60"
        >
          <Text className="text-base font-semibold text-primary">Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
