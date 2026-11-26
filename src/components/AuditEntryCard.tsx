// One audit entry as a card: the audit log's renderer (M20, G8), shared since 2026-11-26 with the Analytics person
// screen, whose timeline is the audit log filtered to one person (docs/ANALYTICS-BACKEND.md §4c). One renderer, so an
// action reads the same in both places: the same pill (label, icon, tone), the same ticket link, the same Details lines.
// - The action as a pill: utils/audit-log.ts auditActionLabel (the audit log's labels), an icon per action, and the
//   action's tone (theme/colors.ts auditAction). An action the app does not know (a newer server; a sign-in, if the
//   Service Desk logs one) is shown in words with a neutral pill, never dropped.
// - The entity and the time; the ticket number as a link (through the deep-link resolver); the person and their email;
//   the details in a tinted box (formatAuditDetails). Never the IP address the row carries.
// - `showActor`: false on the person screen, where every entry is that person's own.
// - `inset`: false when the caller lays the card out itself (the person screen's timeline rail).
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors, type AuditActionTone } from '@/theme';
import type { AuditAction, AuditLogEntry } from '@/types';
import { auditActionLabel, auditTicketLink, auditTime, formatAuditDetails, isKnownAuditAction } from '@/utils/audit-log';
import { formatDisplayName } from '@/utils/format';

/** One icon per action, so a pill never relies on its colour (docs/brand/UI-STANDARDS.md §13). */
const ACTION_ICONS: Record<AuditAction, keyof typeof Ionicons.glyphMap> = {
  CREATED: 'add-circle-outline',
  UPDATED: 'create-outline',
  DELETED: 'trash-outline',
  STATUS_CHANGED: 'swap-horizontal-outline',
  ASSIGNED: 'person-add-outline',
  COMMENTED: 'chatbubble-outline',
  ATTACHMENT_ADDED: 'attach-outline',
  SLA_BREACHED: 'alarm-outline',
  ESCALATED: 'trending-up-outline',
};

/** The action as a pill: label, icon and the action's tone (theme/colors.ts auditAction). */
export function AuditActionPill({ action }: { action: string }) {
  const known = isKnownAuditAction(action);
  const tone: AuditActionTone = known ? colors.auditAction[action] : colors.badgeFallback;
  // Every pill has a 1 dp border, in its own fill colour unless the tone names one, so all pills are the same height.
  const border = tone.border ?? tone.bg;
  return (
    <View
      className="flex-row items-center rounded-full border px-2.5 py-0.5"
      style={{ backgroundColor: tone.bg, borderColor: border }}
    >
      <Ionicons name={known ? ACTION_ICONS[action] : 'ellipse-outline'} size={12} color={tone.fg} />
      <Text className="ml-1 text-xs font-medium" style={{ color: tone.fg }}>
        {auditActionLabel(action)}
      </Text>
    </View>
  );
}

/** The entity in words; the auto-close job's lowercase `ticket` reads as "Ticket" (05 B.38). */
function entityLabel(entityType: string): string {
  return entityType ? entityType.charAt(0).toUpperCase() + entityType.slice(1) : '';
}

export const AuditEntryCard = memo(function AuditEntryCard({
  entry, onOpenTicket, showActor = true, inset = true,
}: {
  entry: AuditLogEntry;
  onOpenTicket: (link: string) => void;
  showActor?: boolean;
  inset?: boolean;
}) {
  const details = useMemo(() => formatAuditDetails(entry), [entry]);
  const link = auditTicketLink(entry.ticket);
  const ticket = entry.ticket;
  // A null actor is a job (auto-close) or a deleted user (onDelete: SetNull, schema.prisma:571); the web says "System".
  const actor = formatDisplayName(entry.actor?.displayName) || 'System';
  const email = entry.actor?.email;

  return (
    <View className={`${inset ? 'mx-4 ' : ''}mb-3 rounded-xl border border-border bg-white p-4`}>
      <View className="flex-row items-center">
        <AuditActionPill action={entry.action} />
        <Text className="ml-2 flex-1 text-xs text-gray-500" numberOfLines={1}>
          {entityLabel(entry.entityType)}
        </Text>
        <Text className="text-xs text-gray-500">{auditTime(entry.createdAt)}</Text>
      </View>

      {ticket && link ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ticket ${ticket.ticketNumber}: ${ticket.title}`}
          onPress={() => onOpenTicket(link)}
          className="mt-1 min-h-11 flex-row items-center active:opacity-60"
        >
          <Text className="text-sm font-semibold text-blue-700">#{ticket.ticketNumber}</Text>
          <Text className="ml-2 flex-1 text-sm text-gray-700" numberOfLines={1}>
            {ticket.title}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
        </Pressable>
      ) : (
        <Text className="mt-2 text-sm text-gray-500">No ticket linked</Text>
      )}

      {showActor ? (
        <View className={ticket && link ? '' : 'mt-2'}>
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
            {actor}
          </Text>
          {email ? (
            <Text className="text-xs text-gray-500" numberOfLines={1}>
              {email}
            </Text>
          ) : null}
        </View>
      ) : null}

      {details.lines.length > 0 || details.raw ? (
        <View className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
          {details.lines.map((line, i) => (
            <Text key={i} className={`text-sm text-gray-700 ${i > 0 ? 'mt-1' : ''}`}>
              {line}
            </Text>
          ))}
          {details.raw ? (
            <Text selectable className={`font-mono text-xs text-gray-700 ${details.lines.length > 0 ? 'mt-2' : ''}`}>
              {details.raw}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
