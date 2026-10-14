import { Text, View } from 'react-native';

import type { TicketStatus } from '@/types';
import { statusLabel } from '@/utils/format';

// Hues from 05 §A.10 (FE:components/ui/StatusBadge.tsx). The doc names hues only; the 100/800 shade pairing
// is a mobile choice. Class strings are written out in full so Tailwind's content scan finds them.
const STATUS_STYLES: Record<TicketStatus, { container: string; text: string }> = {
  OPEN: { container: 'bg-blue-100', text: 'text-blue-800' },
  IN_PROGRESS: { container: 'bg-yellow-100', text: 'text-yellow-800' },
  PENDING: { container: 'bg-orange-100', text: 'text-orange-800' },
  ON_HOLD: { container: 'bg-slate-200', text: 'text-slate-800' },
  PENDING_MGMT_REVIEW: { container: 'bg-purple-100', text: 'text-purple-800' },
  PENDING_MASTER_DATA: { container: 'bg-indigo-100', text: 'text-indigo-800' },
  PENDING_PARTNER: { container: 'bg-amber-100', text: 'text-amber-800' },
  PENDING_USER_CONFIRM: { container: 'bg-cyan-100', text: 'text-cyan-800' },
  PENDING_USER_INFO: { container: 'bg-teal-100', text: 'text-teal-800' },
  RESOLVED: { container: 'bg-green-100', text: 'text-green-800' },
  CANCELED: { container: 'bg-red-100', text: 'text-red-800' },
  CLOSED: { container: 'bg-zinc-700', text: 'text-white' },
};

const FALLBACK = { container: 'bg-gray-100', text: 'text-gray-800' };

interface StatusBadgeProps {
  /** Unknown values render raw, in grey (05 §A.10). */
  status: TicketStatus | (string & {});
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = (STATUS_STYLES as Record<string, { container: string; text: string }>)[status] ?? FALLBACK;
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${style.container}`}>
      <Text className={`text-xs font-medium ${style.text}`} numberOfLines={1}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}
