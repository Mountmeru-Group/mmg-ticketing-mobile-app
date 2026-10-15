// M12 Approvals inbox (04 §2.1 M12, 08 1.47–1.48). APR-1 only — my PENDING approvals, oldest first, not paginated.
// - Filter chips All · Tickets · Service requests · Changes, applied on the device (APR-1 has no filter; S2).
// - Card: short id, type, subject, requester (when known), requested date, stage.
//   Ticket approvals carry no ticket data (01 §10.1): the first 10 are looked up with TKT-3 (cached, shared with the
//   ticket screen) and show subject + requester only on a 200; otherwise "Details on open". Never relies on the AGENT
//   scope gap (05 C.6) — a 403 just leaves the card generic.
// - Visibility (08 S1): the drawer shows this module to ADMIN/AGENT always, to END_USER/L2 only while they have one.
// - No delegation: the backend has none (A26). Never the unscoped GET /approvals (05 C.16).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import { EmptyState, ErrorState, LoadingSkeleton, OfflineBanner, OfflineState, QueryBanner, ScreenHeader } from '@/components';
import { MAX_CARD_TICKET_LOOKUPS, useApprovalTickets, usePendingApprovals } from '@/hooks';
import type { Approval, ApprovalsStackScreenProps, TicketDetail } from '@/types';
import {
  APPROVAL_FILTERS, approvalRequester, approvalSubject, entityLabel, shortApprovalId, type ApprovalFilter,
} from '@/utils/approvals';
import { formatDateTime, formatRelative } from '@/utils/format';

export function ApprovalsInboxScreen({ navigation }: ApprovalsStackScreenProps<'ApprovalsInbox'>) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const focused = useIsFocused();
  const query = usePendingApprovals();
  const [filter, setFilter] = useState<ApprovalFilter>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const tickets = useApprovalTickets(query.data, { enabled: focused });

  const rows = useMemo(
    () => (query.data ?? []).filter((a) => filter === 'ALL' || a.entityType === filter),
    [query.data, filter],
  );
  const counts = useMemo(() => {
    const c: Record<ApprovalFilter, number> = { ALL: 0, ticket: 0, service_request: 0, change: 0 };
    for (const a of query.data ?? []) {
      c.ALL += 1;
      if (a.entityType in c) c[a.entityType] += 1;
    }
    return c;
  }, [query.data]);

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const ticketApprovalCount = (query.data ?? []).filter((a) => a.entityType === 'ticket').length;
  const hasData = query.data !== undefined;
  let content;
  if (!hasData && query.fetchStatus === 'paused') {
    content = <OfflineState what="Your approvals" />;
  } else if (!hasData && query.isError) {
    content = <ErrorState error={query.error} title="Couldn't load approvals" onRetry={() => void query.refetch()} />;
  } else if (!hasData) {
    content = <LoadingSkeleton rows={3} />;
  } else {
    content = (
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => {
          const lookup = item.entityType === 'ticket' ? tickets.get(item.entityId) : undefined;
          return (
            <ApprovalCard
              approval={item}
              ticket={lookup?.ticket}
              ticketLoading={!!lookup?.loading}
              onPress={() => navigation.navigate('ApprovalDetail', { approvalId: item.id })}
            />
          );
        }}
        ListHeaderComponent={
          ticketApprovalCount > MAX_CARD_TICKET_LOOKUPS ? (
            <Text className="mx-4 mb-2 text-xs text-gray-500">
              Ticket details are shown on the first {MAX_CARD_TICKET_LOOKUPS} ticket approvals; open any other to see its ticket.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-done-outline"
            title={filter === 'ALL' ? 'Nothing waiting for you' : 'Nothing of this type'}
            message="Approvals assigned to you appear here. Pull down to refresh."
          />
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Approvals" variant="drawer" />
      <View className="border-b border-gray-200 bg-white px-4 py-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {APPROVAL_FILTERS.map((f) => {
            const active = f.value === filter;
            return (
              <Pressable
                key={f.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(f.value)}
                className={`mr-2 rounded-full border px-3 py-1.5 ${active ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}
              >
                <Text className={active ? 'text-sm font-medium text-white' : 'text-sm text-gray-800'}>
                  {f.label}
                  {hasData ? ` (${counts[f.value]})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <OfflineBanner />
      <QueryBanner error={query.error} hasData={hasData} onRetry={() => void onRefresh()} />
      {content}
    </View>
  );
}

function ApprovalCard({
  approval, ticket, ticketLoading, onPress,
}: {
  approval: Approval;
  ticket: TicketDetail | undefined;
  ticketLoading: boolean;
  onPress: () => void;
}) {
  const requester = approvalRequester(approval, ticket);
  const subject = approvalSubject(approval, ticket);
  const genericTicket = approval.entityType === 'ticket' && !ticket;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entityLabel(approval.entityType)} approval: ${subject}`}
      onPress={onPress}
      className="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-4 active:opacity-80"
    >
      <View className="mb-1 flex-row items-center">
        <View className="rounded-full bg-yellow-100 px-2.5 py-0.5">
          <Text className="text-xs font-medium text-yellow-800">{entityLabel(approval.entityType)}</Text>
        </View>
        <Text className="ml-2 text-xs font-semibold text-gray-500">#{shortApprovalId(approval.id)}</Text>
        <Text className="ml-auto text-xs text-gray-400">Stage {approval.stage ?? '—'}</Text>
      </View>
      <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
        {subject}
      </Text>
      <Text className="mt-1 text-xs text-gray-600" numberOfLines={1}>
        {requester ? `Requester: ${requester}` : genericTicket ? (ticketLoading ? 'Loading ticket…' : 'Details on open') : 'Requester not shown'}
      </Text>
      <View className="mt-1 flex-row items-center">
        <Ionicons name="time-outline" size={12} color="#9ca3af" />
        <Text className="ml-1 text-xs text-gray-400" accessibilityLabel={`Requested ${formatDateTime(approval.createdAt)}`}>
          Requested {formatRelative(approval.createdAt)} · {formatDateTime(approval.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}
