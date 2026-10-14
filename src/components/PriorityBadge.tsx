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

interface PriorityBadgeProps {
  priority: TicketPriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const style = PRIORITY_STYLES[priority];
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${style.container}`}>
      <Text className={`text-xs font-medium ${style.text}`}>{PRIORITY_LABELS[priority]}</Text>
    </View>
  );
}
