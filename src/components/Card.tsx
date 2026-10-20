// The one card style (docs/brand/UI-STANDARDS.md, S2): the web's `bg-white rounded-xl border` card — white, a 1 dp
// `border-border` edge, 12 dp corners, 16 dp padding, no shadow — 16 dp from the screen edges, 12 dp apart.
// - `title`: the card's section label (uppercase caption), 12 dp above the content.
// - `flush`: no vertical padding, for a card that is a list of rows; the rows bring their own (py-3) and separators.
// Tappable cards (ticket, approval, article, notification …) are Pressables with these same classes.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </Text>
  );
}

export function Card({ title, flush = false, children }: { title?: string; flush?: boolean; children: ReactNode }) {
  return (
    <View className={`mx-4 mb-3 rounded-xl border border-border bg-white ${flush ? 'px-4' : 'p-4'}`}>
      {title ? <CardTitle>{title}</CardTitle> : null}
      {children}
    </View>
  );
}
