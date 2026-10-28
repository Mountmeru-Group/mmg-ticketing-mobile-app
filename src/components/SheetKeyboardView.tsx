// Keyboard avoidance for the write sheets (iOS, docs/ios/00-PORT-MANIFEST.md §4.11): KeyboardAvoidingView with
// behavior "padding", as on Android, plus the offset a page sheet needs. KeyboardAvoidingView compares the keyboard's top
// edge (screen coordinates) with its own frame as laid out in its parent (react-native KeyboardAvoidingView.js
// `_relativeKeyboardHeight`). In a page sheet, below the sheet's navigation bar, that frame starts at 0 although the view
// sits lower on screen, so the form would stop short of the keyboard by the sheet's top gap plus the bar. The offset is
// that distance, measured on screen once the sheet is laid out. The form below it scrolls, and the screens dismiss the
// keyboard on a tap outside an input or a drag (keyboardShouldPersistTaps "handled", keyboardDismissMode "interactive").
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';

import { palette } from '@/theme';

export function SheetKeyboardView({ children }: { children: ReactNode }) {
  const frame = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  // The wrapper and the KeyboardAvoidingView share one frame, so the wrapper's top on screen is the offset.
  const measure = useCallback(() => {
    frame.current?.measureInWindow((_x, y) => setOffset(Math.max(0, y)));
  }, []);

  return (
    <View ref={frame} onLayout={measure} style={{ flex: 1, backgroundColor: palette.gray[50] }}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={offset} style={{ flex: 1 }}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}
