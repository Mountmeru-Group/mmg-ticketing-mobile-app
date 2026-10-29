// One row of the M3 ticket list (04 M3): #, subject, status, priority, hold-adjusted SLA, people, "new reply".
// - Inline status chip (08 §4.1): tappable only when the list passes onStatusPress, i.e. staff with at least one valid
//   transition for this ticket. The chip itself never writes; the list asks first.
// - Selection (08 §4.2): tap-and-hold starts multi-select; the list owns the selection and its 20-ticket cap.
// - iOS-4, VoiceOver: the card is one element, so the status chip inside it can't be reached on its own. Changing the
//   status and selecting are the card's custom actions instead (the VoiceOver rotor's Actions), the same two callbacks.
// - iOS-4, large text: at the accessibility text sizes the header line stacks (HIG Typography: "consider using a
//   stacked layout where text appears above secondary items").
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAccessibilityTextSize } from '@/hooks/useTextSize';
import { colors, palette } from '@/theme';
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
  const largeText = useAccessibilityTextSize();
  const actions = [
    ...(chipInteractive && !statusBusy ? [{ name: 'changeStatus', label: 'Change status' }] : []),
    ...(onLongPress && !selectionMode ? [{ name: 'select', label: 'Select' }] : []),
  ];

  // The standard card (Card.tsx). Selected: brand primary edge, as every selected state. New reply: the blue accent
  // edge, the app's information colour.
  const border = selected
    ? 'border-primary bg-red-50'
    : newReply
      ? 'border-blue-200 border-l-4 border-l-blue-600 bg-white'
      : 'border-border bg-white';
  // Meta text one shade darker on the selected tint: gray-500 on red-50 is 4.4:1, below WCAG AA.
  const meta = selected ? 'text-gray-600' : 'text-gray-500';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selectionMode ? { selected } : undefined}
      accessibilityLabel={`Ticket ${ticket.ticketNumber}: ${ticket.title}${newReply ? ', new reply' : ''}`}
      accessibilityHint={onLongPress && !selectionMode ? 'Long press to select several tickets' : undefined}
      accessibilityActions={actions.length > 0 ? actions : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'changeStatus') onStatusPress?.(ticket);
        else if (event.nativeEvent.actionName === 'select') onLongPress?.(ticket.id);
      }}
      onPress={() => onPress(ticket.id)}
      onLongPress={onLongPress ? () => onLongPress(ticket.id) : undefined}
      delayLongPress={350}
      className={`mx-4 mb-3 min-h-11 rounded-xl border p-4 active:opacity-80 ${border}`}
    >
      <View className={largeText ? 'mb-1 items-start' : 'mb-1 flex-row items-center'}>
        {selectionMode ? (
          <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? colors.primary : colors.text.secondary} style={{ marginRight: 6 }} />
        ) : null}
        <Text className={`text-xs font-semibold ${meta}`}>#{ticket.ticketNumber ?? '—'}</Text>
        <Text className={largeText ? `text-xs ${meta}` : `ml-2 flex-1 text-xs ${meta}`} numberOfLines={largeText ? undefined : 1}>
          Updated {formatRelative(ticket.updatedAt)}
        </Text>
        {newReply ? (
          <View className={`rounded-full bg-blue-600 px-2.5 py-0.5 ${largeText ? 'mt-1' : ''}`}>
            <Text className="text-xs font-semibold text-white">New reply</Text>
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
            hitSlop={12}
            className="min-h-5 flex-row items-center active:opacity-70"
          >
            <StatusBadge status={ticket.status} recordId={ticket.id} />
            {statusBusy ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4 }} />
            ) : (
              <Ionicons name="chevron-down" size={14} color={palette.gray[600]} style={{ marginLeft: 2 }} />
            )}
          </Pressable>
        ) : (
          <StatusBadge status={ticket.status} recordId={ticket.id} />
        )}
        <PriorityBadge priority={ticket.priority} />
        <SlaBadge ticket={ticket} />
      </View>

      <Text className={`mt-2 text-xs ${meta}`} numberOfLines={1}>
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
