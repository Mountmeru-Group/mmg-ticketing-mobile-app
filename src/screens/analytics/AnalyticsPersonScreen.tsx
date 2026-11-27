// Analytics, screen three (2026-11-26, ADMIN only): one person. ANL-3 (docs/ANALYTICS-BACKEND.md §4c, NOT YET DEPLOYED).
// - The header: initials, name, role and country, then the chips "Has the app" (only when the server says so) and when
//   they were last active; then three counts (actions, logins, days active), each left out when not sent. All of it is
//   the ANL-2 row that was tapped: ANL-3's shape is not specified, and the app does not invent fields for it.
// - Below, their activity as a timeline, newest first, in the server's order: what they did, which ticket, when. The spec
//   offers AUD-1's shape for ANL-3 ("the audit log filtered to that user"), so each entry is drawn by the audit log's OWN
//   renderer (components/AuditEntryCard.tsx) and grouped by day as the audit log groups them (auditListRows). Sign-ins
//   appear in the same thread as ticket actions, in the audit log's words, if the Service Desk logs them (18 §3c).
// - Paginated (50 per page, capped at 500). Not deployed: one plain line under the header. A JSON error: the error state.
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  AuditEntryCard, EmptyState, ErrorState, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR, OfflineBanner,
  OfflineState, QueryBanner, ScreenHeader,
} from '@/components';
import { useAnalyticsUserActivity } from '@/hooks';
import { openTicketLinkInApp } from '@/navigation/navigationRef';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { AnalyticsStackScreenProps, AnalyticsUserRow } from '@/types';
import {
  analyticsRangeLabel, formatCount, isInactiveInPeriod, personChips, personCountTiles, personName, personRoleLabel,
} from '@/utils/analytics';
import { auditListRows, type AuditListRow } from '@/utils/audit-log';
import { canViewAnalytics } from '@/utils/permissions';
import { NotAvailableLine, PersonAvatar, TileGrid } from './AnalyticsParts';

export const ACTIVITY_NOT_AVAILABLE_TEXT = "This person's activity isn't available yet. The Service Desk hasn't switched it on.";

const rowKey = (row: AuditListRow) => row.key;
const rowType = (row: AuditListRow) => row.kind;

export function AnalyticsPersonScreen({ route }: AnalyticsStackScreenProps<'AnalyticsPerson'>) {
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const range = useUiStore((s) => s.analyticsRange);
  const offline = useIsOffline();
  const { userId, person } = route.params;
  const [refreshing, setRefreshing] = useState(false);

  const activity = useAnalyticsUserActivity(userId, range);
  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = activity;
  const hasData = activity.data !== undefined;
  const rows = useMemo(() => auditListRows(activity.rows), [activity.rows]);

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

  const openTicket = useCallback((link: string) => {
    openTicketLinkInApp(link);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: AuditListRow; index: number }) =>
      item.kind === 'day' ? (
        <Text accessibilityRole="header" className="px-4 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {item.label}
        </Text>
      ) : (
        <ListEntry index={index}>
          {/* The timeline: a rail with a dot, then the audit log's own card for the entry. */}
          <View className="flex-row px-4">
            <View className="w-5 items-center">
              <View className="mt-5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.analytics.bar }} />
              <View className="w-0.5 flex-1" style={{ backgroundColor: colors.border }} />
            </View>
            <View className="ml-2 flex-1">
              <AuditEntryCard entry={item.entry} onOpenTicket={openTicket} showActor={false} inset={false} />
            </View>
          </View>
        </ListEntry>
      ),
    [openTicket],
  );
  const contentStyle = useMemo(() => ({ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }), [insets.bottom]);

  // Unreachable for anyone else (the route is not registered for them).
  if (!canViewAnalytics(role)) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="Person" variant="back" />
        <EmptyState icon="lock-closed-outline" title="Admins only" message="Analytics is available to administrators." />
      </View>
    );
  }

  const name = personName(person);
  const header = <PersonHeader person={person} rangeLabel={analyticsRangeLabel(range)} />;

  let below: ReactNode = null;
  if (!hasData && activity.fetchStatus === 'paused') below = <OfflineState what="Their activity" />;
  else if (activity.isPending && !hasData) below = <LoadingSkeleton variant="audit" rows={3} />;
  else if (activity.isError && !hasData) {
    below = <ErrorState error={activity.error} title="Couldn't load their activity" onRetry={() => void activity.refetch()} />;
  } else if (activity.notDeployed) below = <NotAvailableLine text={ACTIVITY_NOT_AVAILABLE_TEXT} />;

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title={name} variant="back" />
      <OfflineBanner />
      <QueryBanner error={isFetchNextPageError ? null : activity.error} hasData={hasData} onRetry={() => void onRefresh()} />
      <ListEntryScope>
        <FlashList
          // A missing timeline (no `data` array in the answer) is simply not rendered: no rows, no empty message.
          data={below || activity.unlisted ? [] : rows}
          keyExtractor={rowKey}
          getItemType={rowType}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
          contentContainerStyle={contentStyle}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListHeaderComponent={
            <View>
              {header}
              {below}
            </View>
          }
          ListEmptyComponent={
            below || activity.unlisted ? null : (
              <Text className="mx-4 py-6 text-center text-sm text-gray-500">Nothing in this period.</Text>
            )
          }
          ListFooterComponent={
            <TimelineFooter
              loading={isFetchingNextPage}
              failed={isFetchNextPageError && !offline}
              capped={activity.capped}
              count={activity.rows.length}
              total={activity.total}
              offline={offline && !!hasNextPage}
              onRetry={() => void fetchNextPage()}
            />
          }
        />
      </ListEntryScope>
    </View>
  );
}

/** Name, role and country, the chips, then the three counts. Everything from the tapped ANL-2 row; nothing invented. */
function PersonHeader({ person, rangeLabel }: { person: AnalyticsUserRow | undefined; rangeLabel: string }) {
  const name = personName(person);
  const roleLabel = personRoleLabel(person?.role);
  const meta = [roleLabel, person?.country].filter(Boolean).join(' · ');
  const chips = personChips(person);
  const counts = personCountTiles(person);
  const inactive = person ? isInactiveInPeriod(person) : false;

  return (
    <View className="mx-4 mb-3 rounded-xl border border-border bg-white p-4">
      <View className="flex-row items-center">
        <PersonAvatar name={name} muted={inactive} size={56} />
        <View className="ml-3 flex-1">
          <Text className="text-lg font-semibold text-gray-900" numberOfLines={2}>{name}</Text>
          {meta ? <Text className="text-sm text-gray-500">{meta}</Text> : null}
        </View>
      </View>
      {chips.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap" style={{ gap: 6 }}>
          {chips.map((chip) => (
            <View key={chip.key} className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5">
              <Text className="text-xs font-medium text-gray-700">{chip.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {counts.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-2 text-xs text-gray-500">{rangeLabel}</Text>
          <TileGrid figures={counts} />
        </View>
      ) : null}
    </View>
  );
}

function TimelineFooter({
  loading, failed, capped, count, total, offline, onRetry,
}: {
  loading: boolean;
  failed: boolean;
  capped: boolean;
  count: number;
  total: number | null;
  offline: boolean;
  onRetry: () => void;
}) {
  if (offline) return <Text className="py-4 text-center text-xs text-gray-500">More activity loads when you reconnect.</Text>;
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
        <Text className="text-sm text-red-700">Couldn't load more activity.</Text>
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
  return null;
}
