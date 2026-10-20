import { Text, View } from 'react-native';

import { colors, type BadgeTone } from '@/theme';
import { getDisplaySlaStatus, slaLabel, type SlaFields } from '@/utils/format';

// 05 §A.10 (SLABadge.tsx): WITHIN_SLA green · DUE_SOON yellow · BREACHED red (with the breach label), the web's exact
// pairs from src/theme/colors.ts. Always the hold-adjusted value from 05 §A.9, on list AND detail (decision D6).

interface SlaBadgeProps {
  ticket: SlaFields;
  /** Injectable clock for tests. */
  now?: number;
}

export function SlaBadge({ ticket, now }: SlaBadgeProps) {
  const display = getDisplaySlaStatus(ticket, now);
  const tone = (colors.sla as Record<string, BadgeTone>)[display.status] ?? colors.badgeFallback;
  return (
    <View className="self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: tone.bg }}>
      <Text className="text-xs font-medium" style={{ color: tone.fg }} numberOfLines={1}>
        {slaLabel(display)}
      </Text>
    </View>
  );
}
