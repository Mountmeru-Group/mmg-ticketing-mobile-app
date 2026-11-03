// The SLA countdown bar on ticket detail only (2026-11-03, docs/brand/UI-STANDARDS.md §14): "Time to resolve", the time
// left ("6h left", "Breached") and a bar in green, amber or red. What it computes, and what the bar does not mean:
// utils/sla-countdown.ts. Static: the bar never animates.
// The clock is read when the screen renders it, when the screen gains focus and when the app returns to the foreground,
// the Home greeting's pattern (UI-STANDARDS.md §9): never on a timer, so a screen nobody is looking at does no work.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { colors } from '@/theme';
import type { SlaFields } from '@/utils/format';
import { slaCountdown } from '@/utils/sla-countdown';

export function SlaCountdown({ ticket }: { ticket: SlaFields & { createdAt: string } }) {
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

  const countdown = slaCountdown(ticket, now);
  if (!countdown) return null;
  const { tone, label, paused, elapsed } = countdown;
  const text = paused ? `Paused · ${label}` : label;
  return (
    <View
      className="mt-3"
      accessible
      accessibilityLabel={`Time to resolve: ${text}${paused ? ', the SLA clock is paused while the ticket is on hold' : ''}`}
    >
      <View className="flex-row items-center">
        <Text className="flex-1 text-xs font-semibold text-gray-500">Time to resolve</Text>
        <Text className={`text-xs font-semibold ${tone === 'BREACHED' ? 'text-red-700' : 'text-gray-900'}`}>{text}</Text>
      </View>
      <View className="mt-1 h-1.5 flex-row overflow-hidden rounded-full" style={{ backgroundColor: colors.slaBar.track }}>
        <View className="rounded-full" style={{ flex: elapsed, backgroundColor: colors.slaBar[tone] }} />
        <View style={{ flex: 1 - elapsed }} />
      </View>
    </View>
  );
}
