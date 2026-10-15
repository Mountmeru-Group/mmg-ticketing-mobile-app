// One row of the M3 ticket list (04 M3): #, subject, status, priority, hold-adjusted SLA, people, "new reply".
// - Inline status chip (08 §4.1): tappable only when the list passes onStatusPress, i.e. staff with at least one valid
//   transition for this ticket. The chip itself never writes; the list asks first.
// - Selection (08 §4.2): tap-and-hold starts multi-select; the list owns the selection and its 20-ticket cap.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { Ticket, UserRole } from '@/types';
import { formatDisplayName, formatRelative, statusLabel } from '@/utils/format';
import { isStaff } from '@/utils/roles';
import { PriorityBadge } from './PriorityBadge';
import { SlaBadge } from './SlaBadge';
import { StatusBadge } from './StatusBadge';

interface TicketCardProps {
  ticket: Ticket;
  role: UserRole;
  onPress: (ticketId: string) => void;
  onLongPress?: (ticketId: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  /** Present only when this ticket has valid transitions for this role. */
  onStatusPress?: (ticket: Ticket) => void;
  /** A status change for this ticket is in flight. */
  statusBusy?: boolean;
}

function TicketCardImpl({
  ticket, role, onPress, onLongPress, selectionMode = false, selected = false, onStatusPress, statusBusy = false,
}: TicketCardProps) {
  const staff = isStaff(role);
  // 05 §A.9: highlight rows whose requester replied last. Staff only — for END_USER the requester is themselves.
  const newReply = staff && !!ticket.lastRequesterReplyAt;
  const requester = formatDisplayName(ticket.requester?.displayName) || 'Unknown requester';
  const technician = formatDisplayName(ticket.assignedTo?.displayName);
  const chipInteractive = !!onStatusPress && !selectionMode;

  const border = selected
    ? 'border-blue-500 bg-blue-50'
    : newReply
      ? 'border-blue-300 border-l-4 border-l-blue-600 bg-white'
      : 'border-gray-100 bg-white';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selectionMode ? { selected } : undefined}
      accessibilityLabel={`Ticket ${ticket.ticketNumber}: ${ticket.title}${newReply ? ', new reply' : ''}`}
      accessibilityHint={onLongPress && !selectionMode ? 'Long press to select several tickets' : undefined}
      onPress={() => onPress(ticket.id)}
      onLongPress={onLongPress ? () => onLongPress(ticket.id) : undefined}
      delayLongPress={350}
      className={`mx-4 mb-3 rounded-xl border p-4 active:opacity-80 ${border}`}
    >
      <View className="mb-1 flex-row items-center">
        {selectionMode ? (
          <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? '#2563eb' : '#9ca3af'} style={{ marginRight: 6 }} />
        ) : null}
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

      <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
        {chipInteractive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Status ${statusLabel(ticket.status)}. Change status`}
            accessibilityState={{ disabled: statusBusy, busy: statusBusy }}
            disabled={statusBusy}
            onPress={() => onStatusPress?.(ticket)}
            hitSlop={6}
            className="flex-row items-center"
          >
            <StatusBadge status={ticket.status} />
            {statusBusy ? (
              <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 4 }} />
            ) : (
              <Ionicons name="chevron-down" size={14} color="#4b5563" style={{ marginLeft: 2 }} />
            )}
          </Pressable>
        ) : (
          <StatusBadge status={ticket.status} />
        )}
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
