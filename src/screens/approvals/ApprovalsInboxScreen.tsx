// M12 Approvals inbox (04 §2.1 M12, 08 1.47–1.48). APR-1 only — my PENDING approvals, oldest first, not paginated.
// - Filter chips All · Tickets · Service requests · Changes, applied on the device (APR-1 has no filter; S2).
// - Card: short id, type, subject, requester (when known), requested date, stage.
//   Ticket approvals carry no ticket data (01 §10.1): the first 10 are looked up with TKT-3 (cached, shared with the
//   ticket screen) and show subject + requester only on a 200; otherwise "Details on open". Never relies on the AGENT
//   scope gap (05 C.6) — a 403 just leaves the card generic.
// - Visibility (G7): the drawer shows this module to every role, always, and the route is registered for every role
//   (permissions.ts drawerItems, drawerRoutes). APR-1 never refuses a role: with nothing pending it returns `[]`
//   (approvals.controller.ts:105-112), which is the "Nothing waiting for you" state below, not an error.
// - No delegation: the backend has none (A26). Never the unscoped GET /approvals (05 C.16).
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #13): the root of the Approvals tab (ADMIN, AGENT), and pushed from More for
// END_USER and L2_MANAGER, always since G7 (iOS-5e; permissions.ts moreSections, hasApprovalsTab). The More stack
// registers it for every role (navigation/routes.ts; Android's drawerRoutes). An approval opens in the stack it is in
// (getId: one screen per approval).
// iOS-8a (device finding: the chips sat under the status bar): a solid navigation bar with a standard title; under it,
// as on Android, the offline banner, the type chips and the error banner, which do not scroll; then the list.
// No search: APR-1 has none and neither the web nor Android offers one.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View, type RefreshControlProps } from 'react-native';

import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, FilterChip, LIST_TOP_GAP, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR,
  OfflineBanner, OfflineState, QueryBanner, listBottomInset,
} from '@/components';
import { MAX_CARD_TICKET_LOOKUPS, useApprovalTickets, usePendingApprovals } from '@/hooks';
import { colors } from '@/theme';
import type { Approval, SharedStackScreenProps, TicketDetail } from '@/types';
import {
  APPROVAL_FILTERS, approvalRequester, approvalSubject, entityLabel, shortApprovalId, type ApprovalFilter,
} from '@/utils/approvals';
import { formatDateTime, formatRelative } from '@/utils/format';

export function ApprovalsInboxScreen({ navigation }: SharedStackScreenProps<'ApprovalsInbox'>) {
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
  // Stable (Phase P): the ticket lookups are a new Map on every render, so the list re-renders its rows each time;
  // memoised cards with stable props skip the ones that did not change.
  const openApproval = useCallback((approvalId: string) => navigation.navigate('ApprovalDetail', { approvalId }), [navigation]);

  const ticketApprovalCount = (query.data ?? []).filter((a) => a.entityType === 'ticket').length;
  const hasData = query.data !== undefined;
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />;
  let content;
  if (!hasData && query.fetchStatus === 'paused') {
    content = (
      <StateScroll refreshControl={refreshControl}>
        <OfflineState what="Your approvals" />
      </StateScroll>
    );
  } else if (!hasData && query.isError) {
    content = (
      <StateScroll refreshControl={refreshControl}>
        <ErrorState error={query.error} title="Couldn't load approvals" onRetry={() => void query.refetch()} />
      </StateScroll>
    );
  } else if (!hasData) {
    content = (
      <StateScroll>
        <LoadingSkeleton variant="approvals" rows={3} />
      </StateScroll>
    );
  } else {
    content = (
      <FlashList
        data={rows}
        keyExtractor={approvalKey}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        renderItem={({ item, index }) => {
          const lookup = item.entityType === 'ticket' ? tickets.get(item.entityId) : undefined;
          return (
            <ListEntry index={index}>
              <ApprovalCard approval={item} ticket={lookup?.ticket} ticketLoading={!!lookup?.loading} onPress={openApproval} />
            </ListEntry>
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
            illustration="clear"
            title={filter === 'ALL' ? 'Nothing waiting for you' : 'Nothing of this type'}
            message="Approvals assigned to you appear here. Pull down to refresh."
            actionLabel={filter === 'ALL' ? undefined : 'Show all approvals'}
            onAction={() => setFilter('ALL')}
          />
        }
        contentContainerStyle={LIST_PADDING}
        refreshControl={refreshControl}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner />
      {/* The type chips (iOS-8a, Android's): below the navigation bar, never under it, and they do not scroll. */}
      <View className="border-b border-border bg-white px-4 py-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 py-1">
          {APPROVAL_FILTERS.map((f) => (
            <FilterChip
              key={f.value}
              label={`${f.label}${hasData ? ` (${counts[f.value]})` : ''}`}
              active={f.value === filter}
              onPress={() => setFilter(f.value)}
            />
          ))}
        </ScrollView>
      </View>
      <QueryBanner error={query.error} hasData={hasData} onRetry={() => void onRefresh()} />
      <ListEntryScope>{content}</ListEntryScope>
    </View>
  );
}

/** The list's padding (iOS-8a): Android's top gap, and the end gap above the tab bar (no "+" button here). */
const LIST_PADDING = { paddingTop: LIST_TOP_GAP, paddingBottom: listBottomInset(), flexGrow: 1 };

/** A first-load state (offline, loading, error) in a scroll view, so it can be pulled to refresh. */
function StateScroll({ refreshControl, children }: { refreshControl?: ReactElement<RefreshControlProps>; children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={LIST_PADDING} refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
}

const approvalKey = (a: Approval) => a.id;

/** Memoised (Phase P); `onPress` takes the approval's id, so it keeps one identity. */
const ApprovalCard = memo(function ApprovalCard({
  approval, ticket, ticketLoading, onPress,
}: {
  approval: Approval;
  ticket: TicketDetail | undefined;
  ticketLoading: boolean;
  onPress: (approvalId: string) => void;
}) {
  const requester = approvalRequester(approval, ticket);
  const subject = approvalSubject(approval, ticket);
  const genericTicket = approval.entityType === 'ticket' && !ticket;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entityLabel(approval.entityType)} approval: ${subject}`}
      onPress={() => onPress(approval.id)}
      className="mx-4 mb-3 min-h-11 rounded-xl border border-border bg-white p-4 active:opacity-80"
    >
      <View className="mb-2 flex-row items-center">
        <View className="rounded-full bg-yellow-100 px-2.5 py-0.5">
          <Text className="text-xs font-medium text-yellow-800">{entityLabel(approval.entityType)}</Text>
        </View>
        <Text className="ml-2 text-xs font-semibold text-gray-500">#{shortApprovalId(approval.id)}</Text>
        <Text className="ml-auto text-xs text-gray-500">Stage {approval.stage ?? '—'}</Text>
      </View>
      <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
        {subject}
      </Text>
      <Text className="mt-1 text-xs text-gray-500" numberOfLines={1}>
        {requester ? `Requester: ${requester}` : genericTicket ? (ticketLoading ? 'Loading ticket…' : 'Details on open') : 'Requester not shown'}
      </Text>
      <View className="mt-1 flex-row items-center">
        <Ionicons name="time-outline" size={14} color={colors.text.secondary} />
        <Text className="ml-1 shrink text-xs text-gray-500" accessibilityLabel={`Requested ${formatDateTime(approval.createdAt)}`}>
          Requested {formatRelative(approval.createdAt)} · {formatDateTime(approval.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
});
