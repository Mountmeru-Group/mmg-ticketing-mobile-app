// The SLA deadline on ticket detail only (2026-11-03, docs/brand/UI-STANDARDS.md §14.6): "Resolution", then a dot in
// green, amber or red and "Due Mon 11:00" ("Breached" in red). No bar and no countdown: what it shows, and why, is
// utils/sla-deadline.ts. Static: nothing here animates.
// The clock is read when the screen renders it, when the screen gains focus and when the app returns to the foreground,
// the Home greeting's pattern (UI-STANDARDS.md §9): "today" becomes "Breached" without a timer.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { colors } from '@/theme';
import type { SlaFields } from '@/utils/format';
import { slaDeadline } from '@/utils/sla-deadline';

export function SlaDeadline({ ticket }: { ticket: SlaFields }) {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const subscription = AppState.addEventListener('change', (next) => {
        if (next === 'active') setNow(Date.now());
      });
      return () => subscription.remove();
    }, []),
  );

  const deadline = slaDeadline(ticket, now);
  if (!deadline) return null;
  const { tone, label, paused } = deadline;
  return (
    <View
      className="mt-3 flex-row items-center"
      accessible
      accessibilityLabel={`Resolution: ${label}${paused ? '. The SLA clock is paused while the ticket is on hold' : ''}`}
    >
      <Text className="flex-1 text-xs font-semibold text-gray-500">Resolution</Text>
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.slaDeadline[tone] }} />
      <Text className={`ml-1.5 text-xs font-semibold ${tone === 'BREACHED' ? 'text-red-700' : 'text-gray-900'}`}>{label}</Text>
    </View>
  );
}
