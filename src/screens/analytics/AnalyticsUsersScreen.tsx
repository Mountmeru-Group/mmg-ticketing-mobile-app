// Analytics, screen two (2026-11-26, ADMIN only): who is using Setu. ANL-2 (docs/ANALYTICS-BACKEND.md §4b, NOT YET
// DEPLOYED), for the period chosen on screen one.
// - Three sort chips: Last seen (the default), Most actions, Name. Each is ANL-2's `sortBy`: the SERVER sorts, and the
//   app never re-sorts the rows it holds (that would sort only the pages loaded so far).
// - NO SEARCH FIELD. ANL-2 has no search parameter (18 §4b: range, page, limit, sortBy, countryId), the app may not invent
//   one (CLAUDE.md rule 1), and filtering the rows on the phone would answer from the pages loaded so far as if they were
//   everyone (the audit log's rule). It needs `search` added to 18 §4b first; reported to Ronit.
// - A row per person: initials, name, a phone icon when hasMobileApp, what they last did and when ("Status Changed on
//   #10482 · 2h ago", the audit log's labels), then "184 actions · 17 days active". Someone with nothing in the period
//   is muted: "Nothing in this period" and the day they were last seen. Tapping a row opens screen three.
// - Infinite scroll by page (50), capped at 500 rows, as the audit log: never all 1,631.
// - Not deployed: one plain line. A JSON error: the error state, with Retry. Pull-to-refresh reloads the first page only.
import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, FilterChip, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR, OfflineBanner,
  OfflineState, PressableCard, QueryBanner, ScreenHeader,
} from '@/components';
import { useAnalyticsUsers } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { AnalyticsStackScreenProps, AnalyticsUserRow, AnalyticsUserSort } from '@/types';
import {
  ANALYTICS_SORT_OPTIONS, DEFAULT_ANALYTICS_SORT, analyticsRangeLabel, formatCount, isInactiveInPeriod, lastSeenDateLine,
  personActivityLine, personCountsLine, personName,
} from '@/utils/analytics';
import { canViewAnalytics } from '@/utils/permissions';
import { NotAvailableLine, PersonAvatar } from './AnalyticsParts';

export const USERS_NOT_AVAILABLE_TEXT = "The list of people isn't available yet. The Service Desk hasn't switched it on.";

const rowKey = (row: AnalyticsUserRow, index: number) => row.userId ?? `row:${index}`;

export function AnalyticsUsersScreen({ navigation }: AnalyticsStackScreenProps<'AnalyticsUsers'>) {
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const range = useUiStore((s) => s.analyticsRange);
  const offline = useIsOffline();
  const [sortBy, setSortBy] = useState<AnalyticsUserSort>(DEFAULT_ANALYTICS_SORT);
  const [refreshing, setRefreshing] = useState(false);

  const list = useAnalyticsUsers(range, sortBy);
  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = list;
  const hasData = list.data !== undefined;

  const onRefresh = useCallback(async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await refreshFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [offline, refreshFirstPage]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !refreshing && !offline) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, refreshing, offline, fetchNextPage]);

  const openPerson = useCallback(
    (row: AnalyticsUserRow) => {
      if (row.userId) navigation.navigate('AnalyticsPerson', { userId: row.userId, person: row });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: AnalyticsUserRow; index: number }) => (
      <ListEntry index={index}>
        <PersonRow row={item} onOpen={openPerson} />
      </ListEntry>
    ),
    [openPerson],
  );
  const contentStyle = useMemo(() => ({ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }), [insets.bottom]);

  // Unreachable for anyone else (the route is not registered for them).
  if (!canViewAnalytics(role)) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="Who is using Setu" variant="back" />
        <EmptyState icon="lock-closed-outline" title="Admins only" message="Analytics is available to administrators." />
      </View>
    );
  }

  let content: ReactNode;
  if (!hasData && list.fetchStatus === 'paused') {
    content = <OfflineState what="The list of people" />;
  } else if (list.isPending && !hasData) {
    content = <LoadingSkeleton variant="list" rows={6} />;
  } else if (list.isError && !hasData) {
    content = <ErrorState error={list.error} title="Couldn't load the list of people" onRetry={() => void list.refetch()} />;
  } else if (list.notDeployed) {
    content = <View className="pt-3"><NotAvailableLine text={USERS_NOT_AVAILABLE_TEXT} /></View>;
  } else if (list.unlisted) {
    content = <View className="pt-3"><NotAvailableLine text="The Service Desk's answer had no list of people." /></View>;
  } else {
    content = (
      <FlashList
        data={list.rows}
        keyExtractor={rowKey}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        contentContainerStyle={contentStyle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <EmptyState illustration="empty" title="No one to show" message="Nobody is listed for this period. Pull down to refresh." />
        }
        ListFooterComponent={
          <ListFooter
            count={list.rows.length}
            total={list.total}
            capped={list.capped}
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
      <ScreenHeader title="Who is using Setu" variant="back" />
      <OfflineBanner />
      <View className="border-b border-border bg-white px-4 py-2">
        <Text className="text-xs text-gray-500">
          {analyticsRangeLabel(range)}
          {list.total !== null && list.total !== undefined && !list.notDeployed
            ? ` · ${formatCount(list.total)} ${list.total === 1 ? 'person' : 'people'}`
            : ''}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2"
          contentContainerClassName="gap-2 py-1"
          accessibilityRole="radiogroup"
          accessibilityLabel="Sort by"
        >
          {ANALYTICS_SORT_OPTIONS.map((o) => (
            <FilterChip key={o.value} label={o.label} active={o.value === sortBy} onPress={() => setSortBy(o.value)} />
          ))}
        </ScrollView>
      </View>
      <QueryBanner error={isFetchNextPageError ? null : list.error} hasData={hasData} onRetry={() => void onRefresh()} />
      <ListEntryScope>{content}</ListEntryScope>
    </View>
  );
}

const PersonRow = memo(function PersonRow({ row, onOpen }: { row: AnalyticsUserRow; onOpen: (row: AnalyticsUserRow) => void }) {
  const name = personName(row);
  const inactive = isInactiveInPeriod(row);
  const activity = inactive ? 'Nothing in this period' : personActivityLine(row);
  const secondLine = inactive ? lastSeenDateLine(row) : personCountsLine(row);
  const tappable = !!row.userId;
  const label = [name, row.hasMobileApp ? 'has the app' : null, activity, secondLine].filter(Boolean).join(', ');

  return (
    <PressableCard
      accessibilityRole={tappable ? 'button' : undefined}
      accessibilityLabel={label}
      disabled={!tappable}
      onPress={() => onOpen(row)}
      className="mx-4 mb-2 flex-row items-center rounded-xl border border-border bg-white px-4 py-3"
    >
      <PersonAvatar name={name} muted={inactive} />
      <View className="ml-3 flex-1">
        <View className="flex-row items-center">
          <Text className={`flex-shrink text-base font-semibold ${inactive ? 'text-gray-500' : 'text-gray-900'}`} numberOfLines={1}>
            {name}
          </Text>
          {row.hasMobileApp ? (
            <View className="ml-1.5">
              <Ionicons name="phone-portrait-outline" size={14} color={inactive ? colors.text.secondary : colors.text.body} />
            </View>
          ) : null}
        </View>
        {activity ? (
          <Text className={`mt-0.5 text-sm ${inactive ? 'text-gray-500' : 'text-gray-700'}`} numberOfLines={1}>
            {activity}
          </Text>
        ) : null}
        {secondLine ? <Text className="mt-0.5 text-xs text-gray-500">{secondLine}</Text> : null}
      </View>
      {tappable ? <Ionicons name="chevron-forward" size={18} color={colors.text.muted} /> : null}
    </PressableCard>
  );
});

function ListFooter({
  count, total, capped, loading, failed, hasMore, offline, onRetry,
}: {
  count: number;
  total: number | null;
  capped: boolean;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  offline: boolean;
  onRetry: () => void;
}) {
  if (hasMore && offline) return <Text className="py-4 text-center text-xs text-gray-500">More people load when you reconnect.</Text>;
  if (loading) {
    return (
      <View className="flex-row items-center justify-center py-4">
        <ActivityIndicator color={colors.primary} />
        <Text className="ml-2 text-sm text-gray-500">Loading more…</Text>
      </View>
    );
  }
  if (failed) {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry} className="items-center py-4 active:opacity-60">
        <Text className="text-sm text-red-700">Couldn't load more people.</Text>
        <Text className="mt-1 text-sm font-semibold text-blue-700">Tap to retry</Text>
      </Pressable>
    );
  }
  if (capped) {
    return (
      <Text className="px-4 py-4 text-center text-xs text-gray-500">
        {`Showing the first ${formatCount(count)}${total !== null ? ` of ${formatCount(total)}` : ''}`}
      </Text>
    );
  }
  if (!hasMore && count > 0) {
    return (
      <Text className="py-4 text-center text-xs text-gray-500">
        {total !== null && total !== count ? `Showing ${formatCount(count)} of ${formatCount(total)}` : `All ${formatCount(count)} shown`}
      </Text>
    );
  }
  return null;
}
