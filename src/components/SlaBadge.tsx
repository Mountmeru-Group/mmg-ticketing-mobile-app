import { Text, View } from 'react-native';

import type { SLAStatus } from '@/types';
import { getDisplaySlaStatus, slaLabel, type SlaFields } from '@/utils/format';

// 05 §A.10 (SLABadge.tsx): WITHIN_SLA green · DUE_SOON yellow · BREACHED red (with the breach label).
// Always the hold-adjusted value from 05 §A.9, on list AND detail (decision D6).
const SLA_STYLES: Record<SLAStatus, { container: string; text: string }> = {
  WITHIN_SLA: { container: 'bg-green-100', text: 'text-green-800' },
  DUE_SOON: { container: 'bg-yellow-100', text: 'text-yellow-800' },
  BREACHED: { container: 'bg-red-100', text: 'text-red-800' },
};

interface SlaBadgeProps {
  ticket: SlaFields;
  /** Injectable clock for tests. */
  now?: number;
}

export function SlaBadge({ ticket, now }: SlaBadgeProps) {
  const display = getDisplaySlaStatus(ticket, now);
  const style = SLA_STYLES[display.status];
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${style.container}`}>
      <Text className={`text-xs font-medium ${style.text}`} numberOfLines={1}>
        {slaLabel(display)}
      </Text>
    </View>
  );
}
