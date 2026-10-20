import { Text, View } from 'react-native';

import { colors, type BadgeTone } from '@/theme';
import type { TicketStatus } from '@/types';
import { statusLabel } from '@/utils/format';

// Colours are the web's StatusBadge.tsx pairs (05 §A.10), from src/theme/colors.ts.

interface StatusBadgeProps {
  /** Unknown values render raw, in grey (05 §A.10). */
  status: TicketStatus | (string & {});
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const tone = (colors.status as Record<string, BadgeTone>)[status] ?? colors.badgeFallback;
  return (
    <View className="self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: tone.bg }}>
      <Text className="text-xs font-medium" style={{ color: tone.fg }} numberOfLines={1}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}
