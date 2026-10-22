// M9 Notifications — the "Alerts" tab (04 §2.1 M9, 08 §3.1). NTF-1 list (20 per page), NTF-2 badge, NTF-3/NTF-4.
//
// - Unread first: the loaded rows are split into "Unread" and "Earlier" on the device. The server orders by date only.
// - Tap: marks the row read (NTF-3, the tap is the explicit action) and opens its ticket by `ticketId` — never by
//   `type`, because approvals arrive as TICKET_UPDATED (05 B.23). If an approval of mine is pending for that ticket
//   (APR-1, already cached for the drawer), the approval opens instead: an approver may not be allowed to open the
//   ticket itself (08 1.49). A row with no ticketId just becomes read.
// - "Mark all read" (NTF-4) asks first: there is no "mark unread".
// - No live updates (SSE is broken, 05 B.3) and no push (05 B.4); this phase also forbids polling. The screen says so,
//   and pull-to-refresh reloads the newest page and the badge. Details: hooks/useNotifications.ts.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeWriteError, isSessionEndedError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import { EmptyState, ErrorState, LoadingSkeleton, Notice, OfflineBanner, OfflineState, QueryBanner, ScreenHeader } from '@/components';
import {
  useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, usePendingApprovals, useSingleFlight, useStableCallback,
  useUnreadCount,
} from '@/hooks';
import { colors, palette } from '@/theme';
import type { MainTabScreenProps, Notification } from '@/types';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import { formatDateTime, formatRelative } from '@/utils/format';
import { htmlToDisplayText } from '@/utils/html';

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  TICKET_ASSIGNED: 'person-add-outline',
  TICKET_UPDATED: 'create-outline',
  TICKET_RESOLVED: 'checkmark-circle-outline',
  SLA_WARNING: 'alarm-outline',
  SLA_BREACHED: 'warning-outline',
  COMMENT_ADDED: 'chatbubble-ellipses-outline',
  MENTION: 'at-outline',
};

interface Section {
  key: 'unread' | 'read';
  title: string;
  data: Notification[];
}

export function NotificationsScreen({ navigation }: MainTabScreenProps<'AlertsTab'>) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const list = useNotifications();
  const unread = useUnreadCount({ enabled: true });
  const approvals = usePendingApprovals();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const once = useSingleFlight();
  const [refreshing, setRefreshing] = useState(false);

  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = list;
  const hasData = list.data !== undefined;

  const sections = useMemo<Section[]>(() => {
    const unreadRows = list.items.filter((n) => !n.isRead);
    const readRows = list.items.filter((n) => n.isRead);
    const out: Section[] = [];
    if (unreadRows.length > 0) out.push({ key: 'unread', title: 'Unread', data: unreadRows });
    if (readRows.length > 0) out.push({ key: 'read', title: 'Earlier', data: readRows });
    return out;
  }, [list.items]);

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

  const openRelated = (n: Notification) => {
    if (!n.ticketId) return;
    const approval = approvals.data?.find((a) => a.entityType === 'ticket' && a.entityId === n.ticketId);
    if (approval) {
      navigation.navigate('Approvals', { screen: 'ApprovalDetail', params: { approvalId: approval.id }, initial: false });
      return;
    }
    navigation.navigate('TicketsTab', { screen: 'TicketDetail', params: { ticketId: n.ticketId }, initial: false });
  };

  // Stable identities (Phase P): they are props of every memoised row, and SectionList re-renders all its rows on each
  // render of this screen, so a new function per render would redo every row (and its HTML-to-text body).
  const onPressRow = useStableCallback((n: Notification) => {
    // Marking read is part of opening it; a failure (e.g. offline) never blocks opening the ticket, but it is always
    // reported (the row stays unread). The per-call promise reports every tap, even when several overlap.
    if (!n.isRead) {
      markRead.mutateAsync(n.id).catch((e: unknown) => {
        if (!isSessionEndedError(e)) notify(`Couldn't mark it read: ${describeWriteError(e)}`);
      });
    }
    openRelated(n);
  });

  const onMarkOne = useStableCallback((n: Notification) =>
    void once(async () => {
      try {
        await markRead.mutateAsync(n.id);
      } catch (e) {
        reportWriteError("Couldn't mark it read", e);
      }
    }),
  );

  const unreadCount = unread.data ?? 0;
  const onMarkAll = () =>
    void once(async () => {
      const ok = await confirmAction({
        title: 'Mark all as read?',
        message: `${unreadCount === 1 ? '1 unread notification' : `All ${unreadCount} unread notifications`} will be marked read, including any not loaded yet. This can't be undone.`,
        confirmLabel: 'Mark all read',
      });
      if (!ok) return;
      try {
        await markAll.mutateAsync();
        notify('All notifications marked read');
      } catch (e) {
        reportWriteError("Couldn't mark all read", e);
      }
    });

  const headerRight = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unreadCount === 0 || markAll.isPending }}
      disabled={unreadCount === 0 || markAll.isPending}
      onPress={onMarkAll}
      className="min-h-11 justify-center rounded-lg px-3 active:bg-gray-100"
    >
      {markAll.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Text className={`text-sm font-medium ${unreadCount === 0 ? 'text-gray-400' : 'text-blue-700'}`}>Mark all read</Text>
      )}
    </Pressable>
  );

  let content;
  if (!hasData && list.fetchStatus === 'paused') {
    content = <OfflineState what="Notifications" />;
  } else if (!hasData && list.isError) {
    content = <ErrorState error={list.error} title="Couldn't load notifications" onRetry={() => void list.refetch()} />;
  } else if (!hasData) {
    content = <LoadingSkeleton variant="notifications" rows={5} />;
  } else {
    content = (
      <SectionList
        sections={sections}
        keyExtractor={notificationKey}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text className="mx-4 mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {section.key === 'unread' && unread.data !== undefined ? `Unread · ${unread.data}` : section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <NotificationRow
            notification={item}
            onPress={onPressRow}
            onMarkRead={onMarkOne}
            marking={markRead.isPending && markRead.variables === item.id}
          />
        )}
        ListHeaderComponent={
          <View className="mx-4">
            <Notice>
              Alerts don't arrive live or while the app is closed — the Service Desk has no push yet. Pull down to check for new ones.
            </Notice>
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="notifications-outline" title="No notifications" message="Updates on your tickets will appear here. Pull down to refresh." />
        }
        ListFooterComponent={
          <Footer
            loading={isFetchingNextPage}
            failed={isFetchNextPageError}
            hasMore={!!hasNextPage}
            offline={offline}
            onRetry={() => void fetchNextPage()}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Notifications" variant="drawer" right={headerRight} />
      <OfflineBanner />
      <QueryBanner error={isFetchNextPageError ? null : list.error} hasData={hasData} onRetry={() => void onRefresh()} />
      {content}
    </View>
  );
}

const notificationKey = (n: Notification) => n.id;

/** Memoised (Phase P). The mark-read button shows only on an unread row, as before. */
const NotificationRow = memo(function NotificationRow({
  notification: n, onPress: onPressRow, onMarkRead: onMarkOne, marking,
}: {
  notification: Notification;
  onPress: (n: Notification) => void;
  onMarkRead: (n: Notification) => void;
  marking: boolean;
}) {
  const onPress = () => onPressRow(n);
  const onMarkRead = n.isRead ? undefined : () => onMarkOne(n);
  const icon = TYPE_ICONS[n.type] ?? 'notifications-outline';
  const body = htmlToDisplayText(n.body);
  const ticket = n.ticket && typeof n.ticket.ticketNumber === 'number' ? n.ticket : null;
  // Meta text one shade darker on the unread tint: gray-500 on blue-50 is 4.4:1, below WCAG AA.
  const meta = n.isRead ? 'text-gray-500' : 'text-gray-600';
  // The standard card; unread ones tinted with the app's information blue.
  return (
    <View className={`mx-4 mb-3 flex-row rounded-xl border p-4 ${n.isRead ? 'border-border bg-white' : 'border-blue-200 bg-blue-50'}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${n.isRead ? '' : 'Unread. '}${n.title}`}
        accessibilityHint={n.ticketId ? 'Opens the ticket' : undefined}
        onPress={onPress}
        className="flex-1 flex-row active:opacity-70"
      >
        <View className="mr-3 mt-0.5">
          <Ionicons name={icon} size={20} color={n.isRead ? palette.gray[500] : palette.blue[700]} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            {!n.isRead ? <View className="mr-1.5 h-2 w-2 rounded-full bg-blue-600" /> : null}
            <Text className={`flex-1 text-sm text-gray-900 ${n.isRead ? 'font-medium' : 'font-bold'}`} numberOfLines={2}>
              {n.title || 'Notification'}
            </Text>
          </View>
          {body ? (
            <Text className="mt-0.5 text-sm text-gray-700" numberOfLines={3}>
              {body}
            </Text>
          ) : null}
          {ticket ? (
            <Text className={`mt-1 text-xs ${meta}`} numberOfLines={1}>
              #{ticket.ticketNumber} · {ticket.title}
            </Text>
          ) : null}
          <Text className={`mt-1 text-xs ${meta}`} accessibilityLabel={formatDateTime(n.createdAt)}>
            {formatRelative(n.createdAt)}
          </Text>
        </View>
      </Pressable>
      {onMarkRead ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark as read"
          disabled={marking}
          onPress={onMarkRead}
          hitSlop={6}
          className="-mr-2 -mt-2 ml-1 h-8 w-8 items-center justify-center self-start rounded-full active:bg-blue-100"
        >
          {marking ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="checkmark-done-outline" size={20} color={palette.blue[700]} />}
        </Pressable>
      ) : null}
    </View>
  );
});

function Footer({
  loading, failed, hasMore, offline, onRetry,
}: {
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  offline: boolean;
  onRetry: () => void;
}) {
  if (hasMore && offline) return <Text className="py-4 text-center text-xs text-gray-500">More load when you reconnect.</Text>;
  if (loading) return <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />;
  if (failed) {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry} className="items-center py-4">
        <Text className="text-sm text-red-700">Couldn't load more notifications.</Text>
        <Text className="mt-1 text-sm font-semibold text-blue-700">Tap to retry</Text>
      </Pressable>
    );
  }
  return null;
}
