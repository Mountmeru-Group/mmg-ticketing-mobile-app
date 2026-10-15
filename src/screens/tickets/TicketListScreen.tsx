// M3 Ticket list (04 §2.1 M3, 08 §4). Live data from TKT-1 (Phase 3a) plus inline status and bulk actions (Phase 3b).
//
// WHERE EACH FILTER IS APPLIED (08 §4.5) — every named filter is a SERVER-SIDE TKT-1 param (ticket-filters.ts):
//   All         → no extra params; the server applies the role scope (END_USER also sends `countryId=`, D8)
//   Open        → status=OPEN
//   My open     → assignedToId=<me>&status=<the 9 open statuses>   (END_USER: the status list only — scope is own)
//   Unassigned  → assignedToId=unassigned                          (ADMIN / AGENT only)
//   Pending     → status=<the 7 hold statuses>
//   Overdue     → sla=BREACHED          (server slaStatus)
//   Due soon    → sla=DUE_SOON          (server slaStatus, ≤ 30 min left)
//   Resolved    → status=RESOLVED
//   Closed      → status=CLOSED
//   Sort        → sortBy=priority | sortBy=sla | omitted (= updatedAt desc). No direction param exists (08 §4.3).
//   Search      → search=<digits> exact ticket # (a leading # is stripped) | search=<text> subject, requester,
//                 technician (08 §4.4). Submitted on the keyboard's search key, not per keystroke. A pasted ticket
//                 link (…/ticket/<n>, …/tickets/<id>) opens the in-app link resolver instead (05 §A.11).
//   Home tiles  → tile-only filters with the KPI's exact status set (ticket-filters.ts HomeTileFilter); shown as an
//                 extra chip until another filter is picked.
//   Country     → countryId per 05 §A.12 (listCountryParam).
// CLIENT-SIDE — display only, never used to hide or reorder rows:
//   the "New reply" highlight (lastRequesterReplyAt, 05 §A.9) and the hold-adjusted SLA badge (05 §A.9), which can
//   disagree with the server slaStatus behind Overdue / Due soon. Results are never filtered on the device to
//   "fix" the search-scope bug (05 C.7).
//
// WRITES (Phase 3b) — every one is an explicit action with a confirmation naming who is emailed:
//   Inline status chip (08 §4.1): staff only, transitions from ticket-rules.ts for that ticket only; RESOLVED /
//     CLOSED / CANCELED open M6 for the closure fields instead of writing here. TKT-6 POST only — never PUT.
//   Tap-and-hold multi-select (08 §4.2): staff only, hard cap BULK_ACTION_LIMIT (20). Pick up (ADMIN/AGENT) runs
//     here; Assign → M7 and Close → M6 in bulk mode. Sequential, Stop button, per-ticket results, one list refresh.
//   No bulk delete or merge: those endpoints don't exist (08 §4.2).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import { assignTicket } from '@/api/tickets.api';
import {
  BulkProgressModal, EmptyState, ErrorState, LoadingSkeleton, OfflineBanner, OfflineState, OptionSheet, QueryBanner,
  ScreenHeader, TicketCard, type SheetOption,
} from '@/components';
import {
  assertAssignment, countryName, fetchCurrentStatus, useBulkRunner, useChangeStatus, useCountryOptions, useSingleFlight, useTickets,
  type BulkTarget,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { Ticket, TicketStackScreenProps, TicketStatus } from '@/types';
import { looksLikeUrl } from '@/utils/deep-links';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import { statusLabel } from '@/utils/format';
import { isAgentOrAdmin, isStaff } from '@/utils/roles';
import { canAssignToSelf } from '@/utils/session';
import {
  TICKET_FILTER_LABELS, TICKET_SORT_LABELS, availableTicketFilters, countrySelectorMode, isHomeTileFilter,
  listCountryParam, normaliseTicketSearch, type TicketNamedFilter, type TicketSortOption,
} from '@/utils/ticket-filters';
import {
  BULK_ACTION_LIMIT, canChangeStatus, getAvailableTransitions, isResolvedLocked, requiresClosureForm,
} from '@/utils/ticket-rules';
import { bulkPickUpMessage, statusChangeMessage } from '@/utils/writeCopy';

const SORT_OPTIONS: readonly SheetOption<TicketSortOption>[] = [
  { value: 'UPDATED', label: TICKET_SORT_LABELS.UPDATED, description: 'Newest first' },
  { value: 'PRIORITY', label: TICKET_SORT_LABELS.PRIORITY, description: 'Urgent first' },
  { value: 'DUE', label: TICKET_SORT_LABELS.DUE, description: 'Soonest resolve deadline first' },
];

const ALL_COUNTRIES = '__ALL__';

export function TicketListScreen({ navigation, route }: TicketStackScreenProps<'TicketList'>) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'END_USER';
  const insets = useSafeAreaInsets();
  const { ticketFilter, ticketSort, ticketCountryId, setTicketFilter, setTicketSort, setTicketCountryId } = useUiStore();

  // Home tiles open this tab with a named filter pre-applied (08 §3.3).
  const requestedFilter = route.params?.filter;
  useEffect(() => {
    if (requestedFilter) setTicketFilter(requestedFilter);
  }, [requestedFilter, setTicketFilter]);

  const filters = availableTicketFilters(role);
  // Home tile filters are valid here too, except Unassigned for roles that can't use it (ADMIN/AGENT only).
  const tileFilterAllowed = isHomeTileFilter(ticketFilter) && (ticketFilter !== 'UNASSIGNED_KPI' || isAgentOrAdmin(role));
  const activeFilter: TicketNamedFilter = filters.includes(ticketFilter) || tileFilterAllowed ? ticketFilter : 'ALL';

  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [sheet, setSheet] = useState<'sort' | 'country' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const countryMode = user ? countrySelectorMode(user) : 'hidden';
  const countryId = user ? listCountryParam(user, ticketCountryId) : undefined;
  // Fetched only when a name must be shown or the picker is opened — never prefetched.
  const countries = useCountryOptions({
    enabled: sheet === 'country' || countryMode === 'locked' || (countryMode === 'switch' && ticketCountryId !== null),
  });

  const list = useTickets({ filter: activeFilter, sort: ticketSort, search, countryId });
  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = list;
  const hasData = list.data !== undefined;

  const openTicket = useCallback(
    (ticketId: string) => navigation.navigate('TicketDetail', { ticketId }),
    [navigation],
  );

  const offline = useIsOffline();

  // Offline, a refetch would only pause until reconnect and leave the spinner turning; the banner explains.
  const onRefresh = useCallback(async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await refreshFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [offline, refreshFirstPage]);

  // Guarded: FlatList can fire onEndReached repeatedly, and a failed page must wait for an explicit retry.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !refreshing && !offline) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, refreshing, offline, fetchNextPage]);

  const submitSearch = () => {
    // A pasted email link opens that ticket (in-app resolver) instead of searching for the URL text.
    if (looksLikeUrl(searchText)) {
      navigation.navigate('TicketLink', { link: searchText.trim() });
      return;
    }
    setSearch(normaliseTicketSearch(searchText));
  };
  const clearSearch = () => {
    setSearchText('');
    setSearch(undefined);
  };

  const countryOptions = useMemo<SheetOption<string>[]>(
    () => [
      { value: ALL_COUNTRIES, label: 'All countries' },
      ...(countries.data ?? []).map((c) => ({ value: c.id, label: countryName(c) ?? c.id })),
    ],
    [countries.data],
  );
  const selectedCountryLabel =
    countryMode === 'locked'
      ? (countryName(countries.data?.find((c) => c.id === user?.countryId)) ?? 'Your country')
      : ticketCountryId === null
        ? 'All countries'
        : (countryName(countries.data?.find((c) => c.id === ticketCountryId)) ?? 'Selected country');

  // ── Multi-select (08 §4.2) ─────────────────────────────────
  const staff = isStaff(role);
  const agentOrAdmin = isAgentOrAdmin(role);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const selectionMode = selected.size > 0;
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const toggle = useCallback(
    (ticketId: string) => {
      if (selected.has(ticketId)) {
        const next = new Set(selected);
        next.delete(ticketId);
        setSelected(next);
      } else if (selected.size >= BULK_ACTION_LIMIT) {
        Alert.alert('Selection limit', `You can act on up to ${BULK_ACTION_LIMIT} tickets at a time`);
      } else {
        setSelected(new Set(selected).add(ticketId));
      }
    },
    [selected],
  );
  const onCardPress = useCallback((ticketId: string) => (selectionMode ? toggle(ticketId) : openTicket(ticketId)), [selectionMode, toggle, openTicket]);
  // Rows can vanish when the query changes; start over rather than act on tickets no longer shown.
  useEffect(() => clearSelection(), [activeFilter, ticketSort, search, countryId, clearSelection]);
  // Android back clears the selection first.
  useFocusEffect(
    useCallback(() => {
      if (!selectionMode) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        clearSelection();
        return true;
      });
      return () => sub.remove();
    }, [selectionMode, clearSelection]),
  );
  const selectedTickets = useMemo(() => list.tickets.filter((t) => selected.has(t.id)), [list.tickets, selected]);

  // ── Inline status chip (08 §4.1) ───────────────────────────
  const changeStatus = useChangeStatus();
  const once = useSingleFlight();
  const [statusFor, setStatusFor] = useState<Ticket | null>(null);
  const statusBusyId = changeStatus.isPending ? changeStatus.variables?.ticketId : undefined;
  const onStatusPress = useCallback((t: Ticket) => setStatusFor(t), []);

  async function applyTransition(t: Ticket, target: TicketStatus) {
    const transition = getAvailableTransitions(role, t.status).find((x) => x.target === target);
    if (!transition) return;
    if (requiresClosureForm(target)) {
      navigation.navigate('StatusClosure', { ticketIds: [t.id], target }); // closure fields are required (05 §A.2)
      return;
    }
    const ok = await confirmAction({
      title: `${transition.label}?`,
      message: statusChangeMessage(t.ticketNumber, t.status, target),
      confirmLabel: transition.label,
    });
    if (!ok) return;
    try {
      await changeStatus.mutateAsync({ ticketId: t.id, from: t.status, body: { status: target } });
      notify('Status updated');
    } catch (e) {
      reportWriteError('Failed to update status', e);
    }
  }

  // ── Bulk pick up (runs here; Assign and Close open M7 / M6) ─
  const bulk = useBulkRunner();
  async function bulkPickUp() {
    if (!user) return;
    const me = user;
    const targets: BulkTarget[] = selectedTickets.map((t) => ({
      id: t.id,
      label: `#${t.ticketNumber}`,
      skipReason: isResolvedLocked(role, t.status)
        ? `${statusLabel(t.status)} tickets are locked for technicians.`
        : t.assignedToId === me.id
          ? 'Already assigned to you.'
          : undefined,
    }));
    const eligible = targets.filter((t) => !t.skipReason).length;
    if (eligible === 0) {
      Alert.alert('Nothing to pick up', 'None of the selected tickets can be picked up.');
      return;
    }
    const ok = await confirmAction({
      title: `Pick up ${eligible} ${eligible === 1 ? 'ticket' : 'tickets'}?`,
      message: bulkPickUpMessage(eligible, targets.length - eligible),
      confirmLabel: 'Pick up',
      destructive: true,
    });
    if (!ok) return;
    const byId = new Map(selectedTickets.map((t) => [t.id, t]));
    await bulk.run('Picking up tickets', targets, async (id) => {
      const t = byId.get(id);
      if (!t) throw new Error('Ticket not loaded');
      assertAssignment(role, t.status, me.id); // same guards as a single assignment,
      assertAssignment(role, await fetchCurrentStatus(id), me.id); // against the server's current status too
      // 08 S5 / 05 B.14: send the row's team so the server doesn't pick an arbitrary one.
      await assignTicket(id, t.teamId ? { assignedToId: me.id, teamId: t.teamId } : { assignedToId: me.id });
    });
  }

  function openBulk(screen: 'AssignPicker' | 'StatusClosure') {
    const ticketIds = selectedTickets.map((t) => t.id);
    if (ticketIds.length === 0) return;
    if (screen === 'AssignPicker') navigation.navigate('AssignPicker', { ticketIds });
    else navigation.navigate('StatusClosure', { ticketIds, target: 'CLOSED' });
    clearSelection();
  }

  const renderItem = useCallback(
    ({ item }: { item: Ticket }) => {
      const interactive = canChangeStatus(role) && getAvailableTransitions(role, item.status).length > 0;
      return (
        <TicketCard
          ticket={item}
          role={role}
          onPress={onCardPress}
          onLongPress={staff ? toggle : undefined}
          selectionMode={selectionMode}
          selected={selected.has(item.id)}
          onStatusPress={interactive ? onStatusPress : undefined}
          statusBusy={statusBusyId === item.id}
        />
      );
    },
    [role, onCardPress, staff, toggle, selectionMode, selected, onStatusPress, statusBusyId],
  );

  let content: ReactNode;
  if (!hasData && list.fetchStatus === 'paused') {
    content = <OfflineState what="Tickets" />;
  } else if (list.isPending && !hasData) {
    content = <LoadingSkeleton rows={5} />;
  } else if (list.isError && !hasData) {
    content = <ErrorState error={list.error} title="Couldn't load tickets" onRetry={() => void list.refetch()} />;
  } else {
    content = (
      <FlatList
        data={list.tickets}
        extraData={selected}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 96, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
        ListEmptyComponent={
          <ListEmpty role={role} filter={activeFilter} search={search} onClearSearch={clearSearch} />
        }
        ListFooterComponent={
          <ListFooter
            count={list.tickets.length}
            total={list.total}
            loading={isFetchingNextPage}
            failed={isFetchNextPageError && !offline}
            hasMore={!!hasNextPage}
            offline={offline}
            onRetry={() => void fetchNextPage()}
          />
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {selectionMode ? (
        <View style={{ paddingTop: insets.top }} className="bg-blue-600">
          <View className="h-14 flex-row items-center px-2">
            <Pressable accessibilityRole="button" accessibilityLabel="Clear selection" onPress={clearSelection} hitSlop={8} className="h-10 w-10 items-center justify-center">
              <Ionicons name="close" size={24} color="#ffffff" />
            </Pressable>
            <Text className="ml-2 flex-1 text-lg font-semibold text-white" accessibilityRole="header">
              {selected.size} selected
            </Text>
            <Text className="mr-2 text-xs text-blue-100">max {BULK_ACTION_LIMIT}</Text>
          </View>
        </View>
      ) : (
        <ScreenHeader title={role === 'END_USER' ? 'My Tickets' : 'Tickets'} variant="drawer" />
      )}

      {/* Search (08 §4.4): one box, no field selector (A22). */}
      <View className="border-b border-gray-200 bg-white px-4 pb-2 pt-2">
        <View className="h-10 flex-row items-center rounded-lg bg-gray-100 px-3">
          <Ionicons name="search" size={18} color="#6b7280" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            placeholder="Ticket #, subject, requester or technician"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search tickets"
            className="ml-2 flex-1 text-base text-gray-900"
          />
          {searchText ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={clearSearch} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>

        {/* Named filters (08 §4.5) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2" keyboardShouldPersistTaps="handled">
          {isHomeTileFilter(activeFilter) ? (
            <View
              accessibilityRole="radio"
              accessibilityState={{ selected: true }}
              accessibilityLabel={`Filter from Home: ${TICKET_FILTER_LABELS[activeFilter]}`}
              className="mr-2 flex-row items-center rounded-full border border-blue-600 bg-blue-600 px-3 py-1.5"
            >
              <Ionicons name="home-outline" size={12} color="#ffffff" />
              <Text className="ml-1 text-sm font-medium text-white">{TICKET_FILTER_LABELS[activeFilter]}</Text>
            </View>
          ) : null}
          {filters.map((f) => {
            const active = f === activeFilter;
            return (
              <Pressable
                key={f}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setTicketFilter(f)}
                className={`mr-2 rounded-full border px-3 py-1.5 ${active ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}
              >
                <Text className={active ? 'text-sm font-medium text-white' : 'text-sm text-gray-800'}>{TICKET_FILTER_LABELS[f]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sort (08 §4.3) · country (05 §A.12) · count */}
        <View className="mt-2 flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${TICKET_SORT_LABELS[ticketSort]}`}
            onPress={() => setSheet('sort')}
            className="mr-2 flex-row items-center rounded-full border border-gray-300 bg-white px-3 py-1"
          >
            <Ionicons name="swap-vertical" size={14} color="#374151" />
            <Text className="ml-1 text-xs text-gray-800">{TICKET_SORT_LABELS[ticketSort]}</Text>
          </Pressable>
          {countryMode === 'switch' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Country: ${selectedCountryLabel}`}
              onPress={() => setSheet('country')}
              className="mr-2 flex-row items-center rounded-full border border-gray-300 bg-white px-3 py-1"
            >
              <Ionicons name="globe-outline" size={14} color="#374151" />
              <Text className="ml-1 text-xs text-gray-800" numberOfLines={1}>{selectedCountryLabel}</Text>
              <Ionicons name="chevron-down" size={12} color="#374151" style={{ marginLeft: 2 }} />
            </Pressable>
          ) : null}
          {countryMode === 'locked' ? (
            <View
              accessibilityLabel={`Locked to ${selectedCountryLabel}`}
              className="mr-2 flex-row items-center rounded-full bg-gray-100 px-3 py-1"
            >
              <Ionicons name="lock-closed" size={12} color="#6b7280" />
              <Text className="ml-1 text-xs text-gray-600" numberOfLines={1}>{selectedCountryLabel}</Text>
            </View>
          ) : null}
          <View className="flex-1" />
          {list.total !== undefined ? (
            <Text className="text-xs text-gray-500">
              {list.total} {list.total === 1 ? 'ticket' : 'tickets'}
            </Text>
          ) : null}
        </View>
      </View>

      <OfflineBanner />
      <QueryBanner
        error={isFetchNextPageError ? null : list.error}
        hasData={hasData}
        onRetry={() => void onRefresh()}
      />

      {content}

      {selectionMode ? (
        // Selection action bar (08 §4.2). Pick up / Assign: ADMIN and AGENT. Close: staff.
        <View style={{ paddingBottom: insets.bottom + 8 }} className="absolute bottom-0 left-0 right-0 flex-row gap-2 border-t border-gray-200 bg-white px-4 pt-3">
          {agentOrAdmin && canAssignToSelf(user) ? <BarButton icon="hand-left-outline" label="Pick up" onPress={() => void once(bulkPickUp)} /> : null}
          {agentOrAdmin ? <BarButton icon="person-add-outline" label="Assign" onPress={() => openBulk('AssignPicker')} /> : null}
          {canChangeStatus(role) ? <BarButton icon="checkmark-done-outline" label="Close" onPress={() => openBulk('StatusClosure')} /> : null}
        </View>
      ) : (
        // "+" FAB → M8 Create ticket (04 §2.1).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create ticket"
          onPress={() => navigation.navigate('CreateTicket')}
          style={{ bottom: insets.bottom + 20 }}
          className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg active:bg-blue-700"
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </Pressable>
      )}

      <OptionSheet
        visible={statusFor !== null}
        title={statusFor ? `Change status · #${statusFor.ticketNumber}` : 'Change status'}
        options={(statusFor ? getAvailableTransitions(role, statusFor.status) : []).map((t) => ({
          value: t.target,
          label: t.label,
          description: requiresClosureForm(t.target) ? 'Opens the closure form' : undefined,
        }))}
        selected={null}
        onSelect={(target) => {
          const t = statusFor;
          if (t) void once(() => applyTransition(t, target));
        }}
        onClose={() => setStatusFor(null)}
      />
      <BulkProgressModal
        progress={bulk.progress}
        onStop={bulk.stop}
        onClose={() => {
          bulk.reset();
          clearSelection();
        }}
      />

      <OptionSheet
        visible={sheet === 'sort'}
        title="Sort by"
        options={SORT_OPTIONS}
        selected={ticketSort}
        onSelect={setTicketSort}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'country'}
        title="Country"
        options={countryOptions}
        selected={ticketCountryId ?? ALL_COUNTRIES}
        onSelect={(value) => setTicketCountryId(value === ALL_COUNTRIES ? null : value)}
        onClose={() => setSheet(null)}
      >
        {countries.fetchStatus === 'paused' && !countries.data ? (
          <Text className="px-4 py-8 text-center text-sm text-gray-500">Countries load when you reconnect.</Text>
        ) : countries.isPending ? (
          <View className="items-center py-8">
            <ActivityIndicator color="#2563eb" />
            <Text className="mt-2 text-sm text-gray-500">Loading countries…</Text>
          </View>
        ) : countries.isError && !countries.data ? (
          <ErrorState error={countries.error} title="Couldn't load countries" onRetry={() => void countries.refetch()} />
        ) : undefined}
      </OptionSheet>
    </View>
  );
}

function ListEmpty({
  role, filter, search, onClearSearch,
}: {
  role: string;
  filter: TicketNamedFilter;
  search: string | undefined;
  onClearSearch: () => void;
}) {
  if (search) {
    return (
      <EmptyState
        icon="search-outline"
        title={`No tickets match “${search}”`}
        message="Search covers the ticket number, subject, requester and technician."
        actionLabel="Clear search"
        onAction={onClearSearch}
      />
    );
  }
  if (filter !== 'ALL') {
    return (
      <EmptyState
        title={`No tickets in “${TICKET_FILTER_LABELS[filter]}”`}
        message="Try another filter, or pull down to refresh."
      />
    );
  }
  return role === 'END_USER' ? (
    <EmptyState title="You haven't raised any tickets yet" message="Tickets you raise will appear here. Pull down to refresh." />
  ) : (
    <EmptyState title="No tickets in your queue" message="Tickets assigned to you or your groups will appear here. Pull down to refresh." />
  );
}

function ListFooter({
  count, total, loading, failed, hasMore, offline, onRetry,
}: {
  count: number;
  total: number | undefined;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  offline: boolean;
  onRetry: () => void;
}) {
  if (hasMore && offline) {
    return <Text className="py-4 text-center text-xs text-gray-500">More tickets load when you reconnect.</Text>;
  }
  if (loading) {
    return (
      <View className="flex-row items-center justify-center py-4">
        <ActivityIndicator color="#2563eb" />
        <Text className="ml-2 text-sm text-gray-500">Loading more…</Text>
      </View>
    );
  }
  if (failed) {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry} className="items-center py-4">
        <Text className="text-sm text-red-700">Couldn't load more tickets.</Text>
        <Text className="mt-1 text-sm font-semibold text-blue-700">Tap to retry</Text>
      </Pressable>
    );
  }
  if (!hasMore && count > 0) {
    return (
      <Text className="py-4 text-center text-xs text-gray-400">
        {total !== undefined && total !== count ? `Showing ${count} of ${total}` : `All ${count} shown`}
      </Text>
    );
  }
  return null;
}

function BarButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="h-12 flex-1 flex-row items-center justify-center rounded-lg border border-gray-300 bg-white active:bg-gray-50">
      <Ionicons name={icon} size={18} color="#1f2937" />
      <Text className="ml-1.5 text-sm font-semibold text-gray-900">{label}</Text>
    </Pressable>
  );
}
