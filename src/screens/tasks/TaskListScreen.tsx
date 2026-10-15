// Standalone task list (Phase 4 tasks module; drawer "Tasks").
//
// There is no cross-ticket task endpoint (ask A20). The list reads the tasks TKT-1 embeds in each ticket row — the
// same query as the Tickets tab's "All / Last updated" list, 20 tickets per page — so nothing is fetched per ticket.
// The status chips, "Assigned to me" and the search box filter the tickets loaded so far, on the device; "Load 20 more
// tickets" is an explicit tap (never automatic, so an empty filter can't page through everything). The screen says so.
// Tap a task → task detail (read for everyone; done / edit / remove for staff).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import { EmptyState, ErrorState, LoadingSkeleton, OfflineBanner, OfflineState, QueryBanner, ScreenHeader, TaskRow } from '@/components';
import { useTaskFeed } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import type { TasksStackScreenProps } from '@/types';
import { isStaff } from '@/utils/roles';
import { TASK_FILTER_LABELS, type TaskFeedFilter, type TaskStatusFilter } from '@/utils/tasks';

const STATUS_FILTERS: readonly TaskStatusFilter[] = ['ACTIVE', 'ALL', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export function TaskListScreen({ navigation }: TasksStackScreenProps<'TaskList'>) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const user = useAuthStore((s) => s.user);
  const staff = !!user && isStaff(user.role);
  const [status, setStatus] = useState<TaskStatusFilter>('ACTIVE');
  const [mine, setMine] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filter = useMemo<TaskFeedFilter>(
    () => ({ status, assignedToId: mine && user ? user.id : undefined, search: searchText }),
    [status, mine, user, searchText],
  );
  const feed = useTaskFeed(filter);
  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = feed;
  const hasData = feed.data !== undefined;

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await refreshFirstPage();
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = status !== 'ALL' || mine || !!searchText.trim();
  const taskWord = `${feed.items.length} ${feed.items.length === 1 ? 'task' : 'tasks'}`;
  const scopeLine =
    feed.ticketsTotal === undefined
      ? null
      : feed.ticketsLoaded >= feed.ticketsTotal
        ? `${taskWord} across all ${feed.ticketsTotal} of your tickets`
        : `${taskWord} from the ${feed.ticketsLoaded} most recently updated of your ${feed.ticketsTotal} tickets`;

  let content;
  if (!hasData && feed.fetchStatus === 'paused') {
    content = <OfflineState what="Tasks" />;
  } else if (!hasData && feed.isError) {
    content = <ErrorState error={feed.error} title="Couldn't load tasks" onRetry={() => void feed.refetch()} />;
  } else if (!hasData) {
    content = <LoadingSkeleton rows={5} />;
  } else {
    content = (
      <FlatList
        data={feed.items}
        keyExtractor={(row) => row.task.id}
        renderItem={({ item, index }) => (
          <View className={`mx-4 bg-white px-4 ${index === 0 ? 'rounded-t-xl' : ''} ${index === feed.items.length - 1 ? 'rounded-b-xl' : ''}`}>
            <TaskRow
              task={item.task}
              parent={item.ticket}
              last={index === feed.items.length - 1}
              onPress={() => navigation.navigate('TaskDetail', { ticketId: item.ticket.id, taskId: item.task.id })}
            />
          </View>
        )}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="mx-4 mb-2">
            {scopeLine ? <Text className="text-xs text-gray-500">{scopeLine}.</Text> : null}
            {filtered ? <Text className="text-xs text-gray-500">Filters apply to the tickets loaded so far.</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkbox-outline"
            title={feed.loadedTaskCount === 0 ? 'No tasks on these tickets' : 'No tasks match'}
            message={
              hasNextPage
                ? 'Load more tickets below to look further.'
                : feed.loadedTaskCount === 0
                  ? 'Tasks added to your tickets will appear here.'
                  : 'Try another filter.'
            }
          />
        }
        ListFooterComponent={
          <View className="items-center py-4">
            {hasNextPage && offline ? (
              <Text className="text-xs text-gray-500">More tickets load when you reconnect.</Text>
            ) : isFetchingNextPage ? (
              <ActivityIndicator color="#2563eb" />
            ) : hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void fetchNextPage()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 active:bg-gray-50"
              >
                <Text className="text-sm font-medium text-gray-800">
                  {isFetchNextPageError ? "Couldn't load more — tap to retry" : 'Load 20 more tickets'}
                </Text>
              </Pressable>
            ) : feed.ticketsLoaded > 0 ? (
              <Text className="text-xs text-gray-400">All your tickets are loaded.</Text>
            ) : null}
          </View>
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Tasks" variant="drawer" />
      <View className="border-b border-gray-200 bg-white px-4 pb-2 pt-2">
        <View className="h-10 flex-row items-center rounded-lg bg-gray-100 px-3">
          <Ionicons name="search" size={18} color="#6b7280" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Task, ticket # or subject"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search loaded tasks"
            className="ml-2 flex-1 text-base text-gray-900"
          />
          {searchText ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2" keyboardShouldPersistTaps="handled">
          {staff ? (
            <Chip label="Assigned to me" active={mine} onPress={() => setMine((v) => !v)} icon="person-outline" />
          ) : null}
          {STATUS_FILTERS.map((f) => (
            <Chip key={f} label={TASK_FILTER_LABELS[f]} active={status === f} onPress={() => setStatus(f)} />
          ))}
        </ScrollView>
      </View>
      <OfflineBanner />
      <QueryBanner error={isFetchNextPageError ? null : feed.error} hasData={hasData} onRetry={() => void onRefresh()} />
      {content}
    </View>
  );
}

function Chip({
  label, active, onPress, icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`mr-2 flex-row items-center rounded-full border px-3 py-1.5 ${active ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? '#ffffff' : '#374151'} style={{ marginRight: 4 }} /> : null}
      <Text className={active ? 'text-sm font-medium text-white' : 'text-sm text-gray-800'}>{label}</Text>
    </Pressable>
  );
}
