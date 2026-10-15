// M3 Ticket list (04 §2.1 M3, 08 §4). Phase 3a: READ-ONLY, live data from TKT-1.
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
//                 technician (08 §4.4). Submitted on the keyboard's search key, not per keystroke.
//   Country     → countryId per 05 §A.12 (listCountryParam).
// CLIENT-SIDE — display only, never used to hide or reorder rows:
//   the "New reply" highlight (lastRequesterReplyAt, 05 §A.9) and the hold-adjusted SLA badge (05 §A.9), which can
//   disagree with the server slaStatus behind Overdue / Due soon. Results are never filtered on the device to
//   "fix" the search-scope bug (05 C.7).
//
// NOT IN PHASE 3a (writes, Phase 3b): the inline status chip and tap-and-hold bulk actions.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EmptyState, ErrorState, LoadingSkeleton, OptionSheet, QueryBanner, ScreenHeader, TicketCard, type SheetOption,
} from '@/components';
import { countryName, useCountryOptions, useTickets } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { Ticket, TicketStackScreenProps } from '@/types';
import {
  TICKET_FILTER_LABELS, TICKET_SORT_LABELS, availableTicketFilters, countrySelectorMode, listCountryParam,
  normaliseTicketSearch, type TicketNamedFilter, type TicketSortOption,
} from '@/utils/ticket-filters';

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
  const activeFilter: TicketNamedFilter = filters.includes(ticketFilter) ? ticketFilter : 'ALL';

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [refreshFirstPage]);

  // Guarded: FlatList can fire onEndReached repeatedly, and a failed page must wait for an explicit retry.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !refreshing) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, refreshing, fetchNextPage]);

  const submitSearch = () => setSearch(normaliseTicketSearch(searchText));
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

  const renderItem = useCallback(
    ({ item }: { item: Ticket }) => <TicketCard ticket={item} role={role} onPress={openTicket} />,
    [role, openTicket],
  );

  let content: ReactNode;
  if (list.isPending && !hasData) {
    content = <LoadingSkeleton rows={5} />;
  } else if (list.isError && !hasData) {
    content = <ErrorState error={list.error} title="Couldn't load tickets" onRetry={() => void list.refetch()} />;
  } else {
    content = (
      <FlatList
        data={list.tickets}
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
            failed={isFetchNextPageError}
            hasMore={!!hasNextPage}
            onRetry={() => void fetchNextPage()}
          />
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title={role === 'END_USER' ? 'My Tickets' : 'Tickets'} variant="drawer" />

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

      <QueryBanner
        error={isFetchNextPageError ? null : list.error}
        hasData={hasData}
        onRetry={() => void onRefresh()}
      />

      {content}

      {/* "+" FAB → M8 (04 §2.1). M8 itself is still the Phase 1 placeholder; creating tickets is Phase 3b. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create ticket"
        onPress={() => navigation.navigate('CreateTicket')}
        style={{ bottom: insets.bottom + 20 }}
        className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg active:bg-blue-700"
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </Pressable>

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
        {countries.isPending ? (
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
  count, total, loading, failed, hasMore, onRetry,
}: {
  count: number;
  total: number | undefined;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  onRetry: () => void;
}) {
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
