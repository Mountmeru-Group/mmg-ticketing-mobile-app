// One row of the M3 ticket list (04 M3): #, subject, status, priority, hold-adjusted SLA, people, "new reply".
// Read-only in Phase 3a: no inline status chip and no multi-select (both are Phase 3b writes).
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Ticket, UserRole } from '@/types';
import { formatDisplayName, formatRelative } from '@/utils/format';
import { isStaff } from '@/utils/roles';
import { PriorityBadge } from './PriorityBadge';
import { SlaBadge } from './SlaBadge';
import { StatusBadge } from './StatusBadge';

interface TicketCardProps {
  ticket: Ticket;
  role: UserRole;
  onPress: (ticketId: string) => void;
}

function TicketCardImpl({ ticket, role, onPress }: TicketCardProps) {
  const staff = isStaff(role);
  // 05 §A.9: highlight rows whose requester replied last. Staff only — for END_USER the requester is themselves.
  const newReply = staff && !!ticket.lastRequesterReplyAt;
  const requester = formatDisplayName(ticket.requester?.displayName) || 'Unknown requester';
  const technician = formatDisplayName(ticket.assignedTo?.displayName);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ticket ${ticket.ticketNumber}: ${ticket.title}${newReply ? ', new reply' : ''}`}
      onPress={() => onPress(ticket.id)}
      className={`mx-4 mb-3 rounded-xl border bg-white p-4 active:bg-gray-50 ${newReply ? 'border-blue-300 border-l-4 border-l-blue-600' : 'border-gray-100'}`}
    >
      <View className="mb-1 flex-row items-center">
        <Text className="text-xs font-semibold text-gray-500">#{ticket.ticketNumber ?? '—'}</Text>
        <Text className="ml-2 flex-1 text-xs text-gray-400" numberOfLines={1}>
          Updated {formatRelative(ticket.updatedAt)}
        </Text>
        {newReply ? (
          <View className="rounded-full bg-blue-600 px-2 py-0.5">
            <Text className="text-[10px] font-semibold uppercase text-white">New reply</Text>
          </View>
        ) : null}
      </View>

      <Text className={`text-base text-gray-900 ${newReply ? 'font-bold' : 'font-semibold'}`} numberOfLines={2}>
        {ticket.title || '(no subject)'}
      </Text>

      <View className="mt-2 flex-row flex-wrap gap-1.5">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        <SlaBadge ticket={ticket} />
      </View>

      <Text className="mt-2 text-xs text-gray-600" numberOfLines={1}>
        {staff
          ? `${requester} · ${technician ? `Technician: ${technician}` : 'Unassigned'}`
          : technician
            ? `Technician: ${technician}`
            : 'Not yet assigned to a technician'}
      </Text>
    </Pressable>
  );
}

export const TicketCard = memo(TicketCardImpl);
