import { Text, View } from 'react-native';

import { colors, type BadgeTone } from '@/theme';
import type { TicketPriority } from '@/types';
import { PRIORITY_LABELS } from '@/utils/format';

// 05 §A.10 (FE:components/ui/PriorityBadge.tsx): LOW gray · MEDIUM blue · HIGH orange · URGENT red, the web's exact
// pairs from src/theme/colors.ts. Priority is always read-only: the server computes it (05 §A.3).

interface PriorityBadgeProps {
  /** Unknown values render raw, in grey (logged as drift in __DEV__). */
  priority: TicketPriority | (string & {});
  /** "Auto" pill: priority computed by the server from impact × urgency (05 §A.3, staff only). */
  auto?: boolean;
}

export function PriorityBadge({ priority, auto = false }: PriorityBadgeProps) {
  const tone = (colors.priority as Record<string, BadgeTone>)[priority] ?? colors.badgeFallback;
  const label = (PRIORITY_LABELS as Record<string, string>)[priority] ?? priority;
  return (
    <View className="flex-row items-center self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: tone.bg }}>
      <Text className="text-xs font-medium" style={{ color: tone.fg }} numberOfLines={1}>
        {label}
      </Text>
      {auto ? <Text className="ml-1 text-[10px] font-semibold uppercase" style={{ color: tone.fg }}>Auto</Text> : null}
    </View>
  );
}
