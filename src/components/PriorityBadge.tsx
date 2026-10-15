import { Text, View } from 'react-native';

import type { TicketPriority } from '@/types';
import { PRIORITY_LABELS } from '@/utils/format';

// 05 §A.10 (FE:components/ui/PriorityBadge.tsx): LOW gray · MEDIUM blue · HIGH orange · URGENT red.
// Shades are a mobile choice. Priority is always read-only: the server computes it (05 §A.3).
const PRIORITY_STYLES: Record<TicketPriority, { container: string; text: string }> = {
  LOW: { container: 'bg-gray-100', text: 'text-gray-700' },
  MEDIUM: { container: 'bg-blue-100', text: 'text-blue-800' },
  HIGH: { container: 'bg-orange-100', text: 'text-orange-800' },
  URGENT: { container: 'bg-red-100', text: 'text-red-800' },
};

const FALLBACK = { container: 'bg-gray-100', text: 'text-gray-800' };

interface PriorityBadgeProps {
  /** Unknown values render raw, in grey (logged as drift in __DEV__). */
  priority: TicketPriority | (string & {});
  /** "Auto" pill: priority computed by the server from impact × urgency (05 §A.3, staff only). */
  auto?: boolean;
}

export function PriorityBadge({ priority, auto = false }: PriorityBadgeProps) {
  const style = (PRIORITY_STYLES as Record<string, { container: string; text: string }>)[priority] ?? FALLBACK;
  const label = (PRIORITY_LABELS as Record<string, string>)[priority] ?? priority;
  return (
    <View className={`flex-row items-center self-start rounded-full px-2.5 py-0.5 ${style.container}`}>
      <Text className={`text-xs font-medium ${style.text}`} numberOfLines={1}>
        {label}
      </Text>
      {auto ? <Text className={`ml-1 text-[10px] font-semibold uppercase ${style.text}`}>Auto</Text> : null}
    </View>
  );
}
