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
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import { EmptyState, ErrorState, LoadingSkeleton, OfflineBanner, OfflineState, QueryBanner, ScreenHeader } from '@/components';
import {
  useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, usePendingApprovals, useSingleFlight, useUnreadCount,
} from '@/hooks';
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

  const onPressRow = (n: Notification) => {
    // Marking read is part of opening it; a failure (e.g. offline) never blocks opening the ticket.
    if (!n.isRead) markRead.mutate(n.id);
    openRelated(n);
  };

  const onMarkOne = (n: Notification) =>
    void once(async () => {
      try {
        await markRead.mutateAsync(n.id);
      } catch (e) {
        reportWriteError("Couldn't mark it read", e);
      }
    });

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
      hitSlop={8}
      className="px-2 py-1"
    >
      {markAll.isPending ? (
        <ActivityIndicator color="#2563eb" />
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
    content = <LoadingSkeleton rows={5} />;
  } else {
    content = (
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text className="mx-4 mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {section.key === 'unread' && unread.data !== undefined ? `Unread · ${unread.data}` : section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <NotificationRow
            notification={item}
            onPress={() => onPressRow(item)}
            onMarkRead={item.isRead ? undefined : () => onMarkOne(item)}
            marking={markRead.isPending && markRead.variables === item.id}
          />
        )}
        ListHeaderComponent={
          <View className="mx-4 mb-3 flex-row items-start rounded-lg bg-blue-50 p-3">
            <Ionicons name="information-circle-outline" size={16} color="#1d4ed8" />
            <Text className="ml-2 flex-1 text-xs leading-4 text-blue-900">
              Alerts don't arrive live or while the app is closed — the Service Desk has no push yet. Pull down to check for new ones.
            </Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
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

function NotificationRow({
  notification: n, onPress, onMarkRead, marking,
}: {
  notification: Notification;
  onPress: () => void;
  onMarkRead?: () => void;
  marking: boolean;
}) {
  const icon = TYPE_ICONS[n.type] ?? 'notifications-outline';
  const body = htmlToDisplayText(n.body);
  const ticket = n.ticket && typeof n.ticket.ticketNumber === 'number' ? n.ticket : null;
  return (
    <View className={`mx-4 mb-2 flex-row rounded-xl border p-3 ${n.isRead ? 'border-gray-100 bg-white' : 'border-blue-200 bg-blue-50'}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${n.isRead ? '' : 'Unread. '}${n.title}`}
        accessibilityHint={n.ticketId ? 'Opens the ticket' : undefined}
        onPress={onPress}
        className="flex-1 flex-row active:opacity-70"
      >
        <View className="mr-3 mt-0.5">
          <Ionicons name={icon} size={20} color={n.isRead ? '#6b7280' : '#1d4ed8'} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            {!n.isRead ? <View className="mr-1.5 h-2 w-2 rounded-full bg-blue-600" /> : null}
            <Text className={`flex-1 text-sm text-gray-900 ${n.isRead ? 'font-medium' : 'font-bold'}`} numberOfLines={2}>
              {n.title || 'Notification'}
            </Text>
          </View>
          {body ? (
            <Text className="mt-0.5 text-xs text-gray-700" numberOfLines={3}>
              {body}
            </Text>
          ) : null}
          {ticket ? (
            <Text className="mt-1 text-xs text-gray-500" numberOfLines={1}>
              #{ticket.ticketNumber} · {ticket.title}
            </Text>
          ) : null}
          <Text className="mt-1 text-xs text-gray-400" accessibilityLabel={formatDateTime(n.createdAt)}>
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
          hitSlop={8}
          className="ml-2 h-8 w-8 items-center justify-center self-start"
        >
          {marking ? <ActivityIndicator size="small" color="#2563eb" /> : <Ionicons name="checkmark-done-outline" size={20} color="#1d4ed8" />}
        </Pressable>
      ) : null}
    </View>
  );
}

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
  if (loading) return <ActivityIndicator style={{ marginVertical: 16 }} color="#2563eb" />;
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
