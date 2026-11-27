// Analytics, screen two (2026-11-26, ADMIN only): who is using Setu. ANL-2 (docs/ANALYTICS-BACKEND.md §4b, NOT YET
// DEPLOYED), for the period chosen on screen one.
// - Three sort chips: Last seen (the default), Most actions, Name. Each is ANL-2's `sortBy`: the SERVER sorts, and the
//   app never re-sorts the rows it holds.
// - SEARCH ON THE PHONE (2026-11-27, Ronit's decision: ANL-2 has no `search` parameter and will not gain one). A field
//   pinned above the list, "Name or email": anywhere in the name or the email, any case, trimmed: option-search.ts's
//   rule (utils/analytics.ts filterPeople), not a second matcher. Typing sends nothing; the sort chip chosen still
//   orders what it finds. Clearing it brings the whole list back; it clears itself when the screen loses focus.
// - The search is only honest over EVERYONE, so the screen loads every page on opening, one at a time, up to the cap
//   (useAnalyticsUsers: ANALYTICS_MAX_PAGES, 10 pages, 500 people), showing rows as they arrive. Whenever what it holds
//   is not everyone, a plain line above the results says so (peopleCoverage): still loading, stopped by a failure or
//   the network ("The list is incomplete"), or cut by the cap ("Search covers the first 500 of 1,631 people"). Never
//   hidden.
// - A row per person: initials, name, a phone icon when hasMobileApp, what they last did and when ("Status Changed on
//   #10482 · 2h ago", the audit log's labels), then "184 actions · 17 days active". Someone with nothing in the period
//   is muted: "Nothing in this period" and the day they were last seen. Tapping a row opens screen three.
// - Not deployed: one plain line. A JSON error with nothing loaded: the error state, with Retry. Pull-to-refresh asks
//   for page one again, then the rest load in order.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, FilterChip, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR, OfflineBanner,
  OfflineState, PressableCard, ScreenHeader, SearchField,
} from '@/components';
import { useAnalyticsUsers, useDebouncedValue } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors, palette } from '@/theme';
import type { AnalyticsStackScreenProps, AnalyticsUserRow, AnalyticsUserSort } from '@/types';
import {
  ANALYTICS_SORT_OPTIONS, DEFAULT_ANALYTICS_SORT, analyticsRangeLabel, filterPeople, formatCount, isInactiveInPeriod,
  lastSeenDateLine, peopleCoverage, peopleSearchAnnouncement, personActivityLine, personCountsLine, personName,
  type PeopleCoverage,
} from '@/utils/analytics';
import { noOptionMatchText } from '@/utils/option-search';
import { canViewAnalytics } from '@/utils/permissions';
import { NotAvailableLine, PersonAvatar } from './AnalyticsParts';

export const USERS_NOT_AVAILABLE_TEXT = "The list of people isn't available yet. The Service Desk hasn't switched it on.";
export const PEOPLE_SEARCH_PLACEHOLDER = 'Name or email';
export const PEOPLE_SEARCH_LABEL = 'Search people by name or email';
/** The number of matches is read out once typing pauses this long (as OptionSheet). It sends nothing. */
const ANNOUNCE_AFTER_MS = 500;

const rowKey = (row: AnalyticsUserRow, index: number) => row.userId ?? `row:${index}`;

export function AnalyticsUsersScreen({ navigation }: AnalyticsStackScreenProps<'AnalyticsUsers'>) {
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const range = useUiStore((s) => s.analyticsRange);
  const offline = useIsOffline();
  const [sortBy, setSortBy] = useState<AnalyticsUserSort>(DEFAULT_ANALYTICS_SORT);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Loads every page on opening (to the cap), one at a time. The search is not passed in: typing asks for nothing.
  const list = useAnalyticsUsers(range, sortBy);
  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchNextPageError } = list;
  const hasData = list.data !== undefined;

  // The field clears when the screen loses focus (a person opened, back to screen one, another drawer row).
  useFocusEffect(useCallback(() => () => setQuery(''), []));

  // The sort chip's order (the server's), narrowed by the search.
  const shown = useMemo(() => filterPeople(list.rows, query), [list.rows, query]);

  const coverage = peopleCoverage({
    loaded: list.rows.length,
    total: list.total,
    more: !!hasNextPage,
    waiting: list.fetchStatus === 'paused' || offline,
    failed: list.isError && hasData,
    capped: list.capped,
  });

  // TalkBack: the number of matches, then any gap in the list, once typing pauses. Nothing for an empty field.
  const settled = useDebouncedValue(query, ANNOUNCE_AFTER_MS);
  const settledCount = useMemo(() => (settled.trim() ? filterPeople(list.rows, settled).length : null), [list.rows, settled]);
  useEffect(() => {
    if (settledCount !== null) AccessibilityInfo.announceForAccessibility(peopleSearchAnnouncement(settledCount, coverage.note));
  }, [settledCount, coverage.note]);

  const onRefresh = useCallback(async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await refreshFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [offline, refreshFirstPage]);

  // A failed next page: ask for it again, and loading carries on. A failed refresh: refresh again.
  const retryLoad = useCallback(() => {
    if (isFetchNextPageError) void fetchNextPage({ cancelRefetch: false });
    else void onRefresh();
  }, [isFetchNextPageError, fetchNextPage, onRefresh]);

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

  const listShown = hasData && !list.notDeployed && !list.unlisted;
  const typed = query.trim() !== '';

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
        data={shown}
        keyExtractor={rowKey}
        renderItem={renderItem}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          typed ? (
            <Text className="px-4 py-6 text-center text-sm text-gray-500">{noOptionMatchText(query)}</Text>
          ) : (
            <EmptyState illustration="empty" title="No one to show" message="Nobody is listed for this period. Pull down to refresh." />
          )
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
        {listShown ? (
          <View className="mt-2">
            <SearchField
              value={query}
              onChangeText={setQuery}
              onClear={() => setQuery('')}
              returnKeyType="search"
              placeholder={PEOPLE_SEARCH_PLACEHOLDER}
              accessibilityLabel={PEOPLE_SEARCH_LABEL}
            />
          </View>
        ) : null}
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
      {listShown ? <CoverageLine coverage={coverage} onRetry={retryLoad} /> : null}
      <ListEntryScope>{content}</ListEntryScope>
    </View>
  );
}

/**
 * The plain line above the results whenever the list is not everyone (peopleCoverage): loading, incomplete, or cut by
 * the cap. Never hidden while that is true; absent only when the list is known to be whole.
 */
function CoverageLine({ coverage, onRetry }: { coverage: PeopleCoverage; onRetry: () => void }) {
  if (!coverage.text) return null;
  if (coverage.kind === 'failed') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${coverage.text} Tap to retry.`}
        onPress={onRetry}
        className="min-h-11 flex-row items-center border-b border-border bg-white px-4 py-2 active:opacity-60"
      >
        <Ionicons name="alert-circle-outline" size={16} color={palette.red[700]} />
        <Text className="ml-2 flex-1 text-xs text-red-700">
          {coverage.text} <Text className="font-semibold text-blue-700">Tap to retry</Text>
        </Text>
      </Pressable>
    );
  }
  return (
    <View className="flex-row items-center border-b border-border bg-white px-4 py-2">
      {coverage.kind === 'loading' ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="information-circle-outline" size={16} color={colors.text.secondary} />
      )}
      <Text className={`ml-2 flex-1 text-xs ${coverage.kind === 'loading' ? 'text-gray-500' : 'text-gray-700'}`}>{coverage.text}</Text>
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
