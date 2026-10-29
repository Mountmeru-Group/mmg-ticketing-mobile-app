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
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #6): the root of the Alerts tab, with the iOS large title. A tap opens the
// record inside Alerts (utils/deep-links.ts notificationDestination(): the approval or the ticket, both registered in
// every tab's stack) instead of switching module. "Mark all read" sits in the native navigation bar. The large-title
// bar is translucent, so every state scrolls under it (contentInsetAdjustmentBehavior "automatic"), and the banners and
// the notice ride in the list's header so the title collapses. The tab badge is AppTabs' NTF-2 query, which this screen
// shares: no second query and no polling.
import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { memo, useCallback, useLayoutEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View, type RefreshControlProps } from 'react-native';

import { describeWriteError, isSessionEndedError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR, Notice, OfflineBanner, OfflineState,
  OutlineButton, QueryBanner,
} from '@/components';
import {
  useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, usePendingApprovals, useSingleFlight, useStableCallback,
  useUnreadCount,
} from '@/hooks';
import { colors, palette } from '@/theme';
import type { AlertsStackScreenProps, Notification } from '@/types';
import { notificationDestination } from '@/utils/deep-links';
import { confirmAction, notify, notifyWarning, reportWriteError } from '@/utils/dialogs';
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

/**
 * One list item (Phase P2: FlashList has no sections). The "Unread" and "Earlier" headings are items of their own, in
 * the places SectionList drew them; headings were never sticky (stickySectionHeadersEnabled was false).
 */
type AlertItem =
  | { kind: 'heading'; key: 'unread' | 'read'; title: string }
  | { kind: 'row'; notification: Notification };

export function NotificationsScreen({ navigation }: AlertsStackScreenProps<'Notifications'>) {
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

  const items = useMemo<AlertItem[]>(() => {
    const unreadRows = list.items.filter((n) => !n.isRead);
    const readRows = list.items.filter((n) => n.isRead);
    const out: AlertItem[] = [];
    if (unreadRows.length > 0) {
      out.push({ kind: 'heading', key: 'unread', title: 'Unread' });
      for (const n of unreadRows) out.push({ kind: 'row', notification: n });
    }
    if (readRows.length > 0) {
      out.push({ kind: 'heading', key: 'read', title: 'Earlier' });
      for (const n of readRows) out.push({ kind: 'row', notification: n });
    }
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

  // iOS: the record opens in this tab's stack (every tab registers it; getId gives each record its own screen).
  const openRelated = (n: Notification) => {
    const destination = notificationDestination(n, approvals.data);
    if (destination?.route === 'ApprovalDetail') navigation.navigate('ApprovalDetail', destination.params);
    else if (destination?.route === 'TicketDetail') navigation.navigate('TicketDetail', destination.params);
  };

  // Stable identities (Phase P): they are props of every memoised row, so a new function per render would redo every
  // visible row (and its HTML-to-text body).
  const onPressRow = useStableCallback((n: Notification) => {
    // Marking read is part of opening it; a failure (e.g. offline) never blocks opening the ticket, but it is always
    // reported (the row stays unread). The per-call promise reports every tap, even when several overlap.
    if (!n.isRead) {
      markRead.mutateAsync(n.id).catch((e: unknown) => {
        // iOS-4: the amber warning notice and haptic, never the green success tick, for a step that failed.
        if (!isSessionEndedError(e)) notifyWarning(`Couldn't mark it read: ${describeWriteError(e)}`);
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

  const unreadTotal = unread.data;
  const markingId = markRead.isPending ? markRead.variables : undefined;
  const renderItem = useCallback<ListRenderItem<AlertItem>>(
    ({ item, index }) => (
      <ListEntry index={index}>
        {item.kind === 'heading' ? (
          <Text className="mx-4 mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {item.key === 'unread' && unreadTotal !== undefined ? `Unread · ${unreadTotal}` : item.title}
          </Text>
        ) : (
          <NotificationRow
            notification={item.notification}
            onPress={onPressRow}
            onMarkRead={onMarkOne}
            marking={markingId === item.notification.id}
          />
        )}
      </ListEntry>
    ),
    [unreadTotal, onPressRow, onMarkOne, markingId],
  );

  const unreadCount = unread.data ?? 0;
  const onMarkAll = useStableCallback(() =>
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
    }),
  );

  // The native navigation bar's right side: a text button in the bar's tint, as Android's header button.
  const markAllDisabled = unreadCount === 0 || markAll.isPending;
  const markAllPending = markAll.isPending;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark all read"
          accessibilityState={{ disabled: markAllDisabled, busy: markAllPending }}
          disabled={markAllDisabled}
          onPress={onMarkAll}
          hitSlop={8}
          className="min-h-11 justify-center px-1 active:opacity-60"
        >
          {markAllPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text className={`text-base ${markAllDisabled ? 'text-gray-400' : 'text-primary'}`}>Mark all read</Text>
          )}
        </Pressable>
      ),
    });
  }, [navigation, markAllDisabled, markAllPending, onMarkAll]);

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />;
  const banners = (
    <>
      <OfflineBanner />
      <QueryBanner error={isFetchNextPageError ? null : list.error} hasData={hasData} onRetry={() => void onRefresh()} />
    </>
  );

  let content;
  if (!hasData && list.fetchStatus === 'paused') {
    content = (
      <StateScroll banners={banners} refreshControl={refreshControl}>
        <OfflineState what="Notifications" />
      </StateScroll>
    );
  } else if (!hasData && list.isError) {
    content = (
      <StateScroll banners={banners} refreshControl={refreshControl}>
        <ErrorState error={list.error} title="Couldn't load notifications" onRetry={() => void list.refetch()} />
      </StateScroll>
    );
  } else if (!hasData) {
    content = (
      <StateScroll banners={banners}>
        <LoadingSkeleton variant="notifications" rows={5} />
      </StateScroll>
    );
  } else {
    content = (
      <FlashList
        data={items}
        keyExtractor={alertItemKey}
        getItemType={alertItemType}
        renderItem={renderItem}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <View>
            {banners}
            <View className="mx-4 mt-3">
              <Notice>
                Alerts don't arrive live or while the app is closed — the Service Desk has no push yet. Pull down to check for new ones.
              </Notice>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState illustration="clear" title="No notifications" message="Updates on your tickets will appear here. Pull down to refresh." />
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
        contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
        refreshControl={refreshControl}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ListEntryScope>{content}</ListEntryScope>
    </View>
  );
}

/**
 * The first-load states (loading, offline, error), in a scroll view under the translucent large-title bar with the
 * banners on top, so nothing sits behind the title.
 */
function StateScroll({
  banners, refreshControl, children,
}: {
  banners: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  children: ReactNode;
}) {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} refreshControl={refreshControl}>
      {banners}
      {children}
    </ScrollView>
  );
}

const alertItemKey = (item: AlertItem) => (item.kind === 'heading' ? `heading:${item.key}` : item.notification.id);
const alertItemType = (item: AlertItem) => item.kind;

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
        className="min-h-11 flex-1 flex-row active:opacity-70"
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
          className="-mr-3 -mt-3 ml-1 h-11 w-11 items-center justify-center self-start rounded-full active:bg-blue-100"
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
    // iOS-4: the same Retry button as every other error state (ErrorState).
    return (
      <View className="items-center py-4">
        <Text className="mb-2 text-sm text-red-700">Couldn't load more notifications.</Text>
        <OutlineButton label="Retry" icon="refresh" onPress={onRetry} />
      </View>
    );
  }
  return null;
}
