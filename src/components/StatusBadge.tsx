import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { reduceMotionEnabled } from '@/hooks';
import { colors, motion, type BadgeTone } from '@/theme';
import type { TicketStatus } from '@/types';
import { statusLabel } from '@/utils/format';

// Colours are the web's StatusBadge.tsx pairs (05 §A.10), from src/theme/colors.ts.
//
// Status change (Phase A1, docs/PERFORMANCE.md §10): when the same record's status changes, the pill pulses (scale
// 1 → 1.14 → 1) while the old pill fades out over the new one, so the colour crossfades instead of blinking. One
// native timing drives both (the wrapper's scale, the old pill's opacity). The pill is a plain View at rest; the animated layers exist
// only for the 280 ms of a change. Never on first render, on a re-render with the same status, or when a list cell is
// recycled for another record (its `recordId` changes).

const { duration, scale, curve } = motion.statusChange;
const ease = Easing.bezier(...curve);

interface StatusBadgeProps {
  /** Unknown values render raw, in grey (05 §A.10). */
  status: TicketStatus | (string & {});
  /** The ticket or service request this status belongs to. Without it the badge never animates. */
  recordId?: string;
}

function Pill({ status }: { status: string }) {
  const tone = (colors.status as Record<string, BadgeTone>)[status] ?? colors.badgeFallback;
  return (
    <View className="self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: tone.bg }}>
      <Text className="text-xs font-medium" style={{ color: tone.fg }} numberOfLines={1}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

interface Change {
  from: string;
  progress: Animated.Value;
}

export function StatusBadge({ status, recordId }: StatusBadgeProps) {
  const [shown, setShown] = useState({ recordId, status });
  const [change, setChange] = useState<Change | null>(null);
  if (shown.recordId !== recordId || shown.status !== status) {
    // React's "adjust state while rendering" pattern: this render is the only place the previous status is known.
    const sameRecord = recordId !== undefined && shown.recordId === recordId;
    setShown({ recordId, status });
    setChange(sameRecord && !reduceMotionEnabled() ? { from: shown.status, progress: new Animated.Value(0) } : null);
  }

  useEffect(() => {
    if (!change) return;
    const pulse = Animated.timing(change.progress, { toValue: 1, duration, easing: ease, useNativeDriver: true });
    pulse.start(({ finished }) => {
      if (finished) setChange(null);
    });
    return () => pulse.stop();
  }, [change]);

  if (!change) return <Pill status={status} />;
  const { from, progress } = change;
  return (
    <Animated.View
      style={[
        styles.start,
        { transform: [{ scale: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, scale, 1] }) }] },
      ]}
    >
      <Pill status={status} />
      <Animated.View
        style={[styles.over, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Pill status={from} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start' },
  over: { position: 'absolute', top: 0, left: 0 },
});
