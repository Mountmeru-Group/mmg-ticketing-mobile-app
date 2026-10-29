// Compact ticket row for Home's recent list. Takes either a TKT-1 row or a DSH-1 `recent` item (scalars plus
// requester/assignee names only), so it reads nothing beyond what both shapes carry.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme';
import type { DashboardRecentTicket, Ticket } from '@/types';
import { formatDisplayName, formatRelative } from '@/utils/format';
import { PriorityBadge } from './PriorityBadge';
import { SlaBadge } from './SlaBadge';
import { StatusBadge } from './StatusBadge';

interface RecentTicketRowProps {
  ticket: Ticket | DashboardRecentTicket;
  /** Staff see the requester; END_USER sees the technician. */
  showRequester: boolean;
  onPress: (ticketId: string) => void;
  last?: boolean;
}

export function RecentTicketRow({ ticket, showRequester, onPress, last = false }: RecentTicketRowProps) {
  const technician = formatDisplayName(ticket.assignedTo?.displayName);
  const requester = formatDisplayName(ticket.requester?.displayName);
  const who = showRequester
    ? `${requester || 'Unknown requester'} · ${technician ? technician : 'Unassigned'}`
    : technician
      ? `Technician: ${technician}`
      : 'Not yet assigned';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ticket ${ticket.ticketNumber}: ${ticket.title}`}
      onPress={() => onPress(ticket.id)}
      className={`min-h-11 flex-row items-center py-3 active:opacity-70 ${last ? '' : 'border-b border-border'}`}
    >
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-xs font-semibold text-gray-500">#{ticket.ticketNumber ?? '—'}</Text>
          <Text className="ml-2 flex-1 text-xs text-gray-500" numberOfLines={1}>
            Updated {formatRelative(ticket.updatedAt)}
          </Text>
        </View>
        <Text className="mt-0.5 text-sm font-semibold text-gray-900" numberOfLines={2}>
          {ticket.title || '(no subject)'}
        </Text>
        <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
          <StatusBadge status={ticket.status} recordId={ticket.id} />
          <PriorityBadge priority={ticket.priority} />
          <SlaBadge ticket={ticket} />
        </View>
        <Text className="mt-2 text-xs text-gray-500" numberOfLines={1}>
          {who}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text.muted} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}
