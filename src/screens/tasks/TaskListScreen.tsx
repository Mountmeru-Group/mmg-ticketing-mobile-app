// Standalone task list (Phase 4 tasks module; drawer "Tasks").
//
// There is no cross-ticket task endpoint (ask A20). The list reads the tasks TKT-1 embeds in each ticket row — the
// same query as the Tickets tab's "All / Last updated" list, 20 tickets per page — so nothing is fetched per ticket.
// The status chips, "Assigned to me" and the search box filter the tickets loaded so far, on the device; "Load 20 more
// tickets" is an explicit tap (never automatic, so an empty filter can't page through everything). The screen says so.
// Tap a task → task detail (read for everyone; done / edit / remove for staff).
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, FilterChip, LoadingSkeleton, OfflineBanner, OfflineState, OutlineButton, QueryBanner,
  ScreenHeader, SearchField, TaskRow,
} from '@/components';
import { useTaskFeed } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import type { TasksStackScreenProps } from '@/types';
import { isStaff } from '@/utils/roles';
import { TASK_FILTER_LABELS, type FeedTask, type TaskFeedFilter, type TaskStatusFilter } from '@/utils/tasks';

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
  // Stable renderer and memoised rows (Phase P): the search box filters on every keystroke.
  const openTask = useCallback(
    (row: FeedTask) => navigation.navigate('TaskDetail', { ticketId: row.ticket.id, taskId: row.task.id }),
    [navigation],
  );
  const lastIndex = feed.items.length - 1;
  const renderTask = useCallback<ListRenderItem<FeedTask>>(
    ({ item, index }) => <TaskListRow row={item} first={index === 0} last={index === lastIndex} onOpen={openTask} />,
    [lastIndex, openTask],
  );
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
  // Every loaded task: the "All" chip, everyone's tasks, no search.
  const showAll = () => {
    setStatus('ALL');
    setMine(false);
    setSearchText('');
  };
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
    content = <LoadingSkeleton variant="tasks" rows={5} />;
  } else {
    content = (
      <FlatList
        data={feed.items}
        keyExtractor={taskKey}
        renderItem={renderTask}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          scopeLine || filtered ? (
            <View className="mx-4 mb-2">
              {scopeLine ? <Text className="text-xs text-gray-500">{scopeLine}.</Text> : null}
              {filtered ? <Text className="text-xs text-gray-500">Filters apply to the tickets loaded so far.</Text> : null}
            </View>
          ) : null
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
                  : 'Tasks that match these filters will appear here.'
            }
            actionLabel={feed.loadedTaskCount > 0 && filtered ? 'Show all tasks' : undefined}
            onAction={showAll}
          />
        }
        ListFooterComponent={
          <View className="items-center px-4 pb-4 pt-1">
            {hasNextPage && offline ? (
              <Text className="text-xs text-gray-500">More tickets load when you reconnect.</Text>
            ) : hasNextPage ? (
              <OutlineButton
                label={isFetchNextPageError ? "Couldn't load more — tap to retry" : 'Load 20 more tickets'}
                onPress={() => void fetchNextPage()}
                loading={isFetchingNextPage}
              />
            ) : isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} />
            ) : feed.ticketsLoaded > 0 ? (
              <Text className="text-xs text-gray-500">All your tickets are loaded.</Text>
            ) : null}
          </View>
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Tasks" variant="back" />
      <OfflineBanner />
      <View className="border-b border-border bg-white px-4 py-2">
        <SearchField
          value={searchText}
          onChangeText={setSearchText}
          onClear={() => setSearchText('')}
          placeholder="Task, ticket # or subject"
          accessibilityLabel="Search loaded tasks"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2"
          contentContainerClassName="gap-2 py-1"
          keyboardShouldPersistTaps="handled"
        >
          {staff ? (
            <FilterChip label="Assigned to me" active={mine} onPress={() => setMine((v) => !v)} icon="person-outline" role="button" />
          ) : null}
          {STATUS_FILTERS.map((f) => (
            <FilterChip key={f} label={TASK_FILTER_LABELS[f]} active={status === f} onPress={() => setStatus(f)} />
          ))}
        </ScrollView>
      </View>
      <QueryBanner error={isFetchNextPageError ? null : feed.error} hasData={hasData} onRetry={() => void onRefresh()} />
      {content}
    </View>
  );
}

const taskKey = (row: FeedTask) => row.task.id;

/** The rows form one card (Card.tsx `flush`): the first and last row carry its top and bottom edge. Memoised (Phase P). */
const TaskListRow = memo(function TaskListRow({
  row, first, last, onOpen,
}: {
  row: FeedTask;
  first: boolean;
  last: boolean;
  onOpen: (row: FeedTask) => void;
}) {
  return (
    <View
      className={`mx-4 border-x border-border bg-white px-4 ${first ? 'rounded-t-xl border-t' : ''} ${last ? 'mb-3 rounded-b-xl border-b' : ''}`}
    >
      <TaskRow task={row.task} parent={row.ticket} last={last} onPress={() => onOpen(row)} />
    </View>
  );
});
