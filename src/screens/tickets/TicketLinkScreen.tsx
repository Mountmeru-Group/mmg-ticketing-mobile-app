// In-app deep-link resolver (04 "Deep-link handler", 05 §A.11). Not a screen people browse to: it opens when a ticket
// link is tapped inside server HTML, or pasted into the Tickets search box, and replaces itself with M4.
// - `…/tickets/<uuid>` → M4 directly (TKT-3 there does the access check).
// - `…/ticket/<n>`, `…/tickets/<n>`, "#n" → TKT-1 `search=<n>&limit=5` (digits = exact ticket number, so the C.7
//   text-search scope bug does not apply) with the role's normal scope (END_USER sends `countryId=`, D8). Opens the row
//   whose ticketNumber matches, else the first row; none → "not found". There is no by-number endpoint (ask A8).
// - Links to another environment are refused: their numbers and ids belong to another database (00 §3).
// - OS-level app links (tapping a link in the mail app) need ask A18 and are not handled.
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #5): a record screen in every tab's stack, so the resolved ticket replaces it in
// the tab the person is in. "Go to tickets" switches to the Tickets tab's list (Android popped to the list in its one
// ticket stack). The title comes from the navigation bar.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { assertPaginated } from '@/api/drift';
import { listTickets } from '@/api/tickets.api';
import { EmptyState, ErrorState, OfflineBanner, OfflineState } from '@/components';
import { queryKeys, type TicketListKeyParams } from '@/hooks/queryKeys';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import type { RecordScreenProps, Ticket } from '@/types';
import { APP_ORIGIN, parseTicketLink } from '@/utils/deep-links';
import { roleDefaultTicketQuery } from '@/utils/ticket-filters';

export function TicketLinkScreen({ navigation, route }: RecordScreenProps<'TicketLink'>) {
  const { link } = route.params;
  const parsed = useMemo(() => parseTicketLink(link), [link]);
  const role = useAuthStore((s) => s.user?.role);

  const ticketId = parsed.ok && parsed.target.kind === 'id' ? parsed.target.id : null;
  const ticketNumber = parsed.ok && parsed.target.kind === 'number' ? parsed.target.ticketNumber : null;
  const params = useMemo<TicketListKeyParams>(
    () => (role ? { ...roleDefaultTicketQuery(role), search: String(ticketNumber ?? '') } : {}),
    [role, ticketNumber],
  );

  const lookup = useQuery({
    queryKey: queryKeys.tickets.byNumber(ticketNumber ?? 0, params),
    queryFn: async (): Promise<Ticket | null> => {
      const res = await listTickets({ ...params, page: 1, limit: 5 });
      assertPaginated<Ticket>('TKT-1', res);
      const rows = res.data.filter((t) => t && typeof t.id === 'string');
      return rows.find((t) => t.ticketNumber === ticketNumber) ?? rows[0] ?? null;
    },
    enabled: ticketNumber !== null && !!role,
  });

  useEffect(() => {
    if (ticketId) navigation.replace('TicketDetail', { ticketId });
  }, [ticketId, navigation]);

  const found = lookup.data;
  useEffect(() => {
    if (found) navigation.replace('TicketDetail', { ticketId: found.id });
  }, [found, navigation]);

  const goToList = () => navigation.navigate('TicketsTab', { screen: 'TicketList', pop: true });

  let body;
  if (!parsed.ok && parsed.reason === 'other-environment') {
    body = (
      <EmptyState
        icon="swap-horizontal-outline"
        title="Link from another Service Desk"
        message={`This app is connected to ${APP_ORIGIN.replace(/^https?:\/\//, '')}, so it can't open tickets from other environments. You can open the link in your browser instead.`}
        actionLabel="Open in browser"
        onAction={() => {
          if (/^https?:\/\//i.test(link.trim())) Linking.openURL(link.trim()).catch(() => undefined);
        }}
      />
    );
  } else if (!parsed.ok) {
    body = (
      <EmptyState
        icon="link-outline"
        title="Not a ticket link"
        message="Ticket links look like …/ticket/1234 or …/tickets/<id>."
        actionLabel="Go to tickets"
        onAction={goToList}
      />
    );
  } else if (ticketId || found) {
    body = <Resolving text="Opening the ticket…" />;
  } else if (lookup.fetchStatus === 'paused') {
    body = <OfflineState what={`Ticket #${ticketNumber}`} />;
  } else if (lookup.isError) {
    body = <ErrorState error={lookup.error} title={`Couldn't look up ticket #${ticketNumber}`} onRetry={() => void lookup.refetch()} />;
  } else if (lookup.data === null) {
    body = (
      <EmptyState
        icon="search-outline"
        title={`Ticket #${ticketNumber} not found`}
        message="It doesn't exist, or your account can't see it."
        actionLabel="Go to tickets"
        onAction={goToList}
      />
    );
  } else {
    body = <Resolving text={`Looking up ticket #${ticketNumber}…`} />;
  }

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner />
      {body}
    </View>
  );
}

function Resolving({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <ActivityIndicator size="large" color={colors.primary} />
      <View className="mt-3 flex-row items-center">
        <Ionicons name="link-outline" size={18} color={colors.text.secondary} />
        <Text className="ml-1.5 text-sm text-gray-500">{text}</Text>
      </View>
    </View>
  );
}
