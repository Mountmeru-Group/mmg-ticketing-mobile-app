// Task detail (Phase 4 tasks module). Registered in the Tickets stack (from a ticket's Tasks tab) and the Tasks stack
// (from the standalone list).
// - Reads TKT-3 for the parent ticket — the task is embedded there — so the ticket is opened (05 §C hygiene gate)
//   before any task write, and the ticket screen shares the same cache.
// - Shows title, description, status, owner, due date and the parent ticket; "View parent ticket" opens M4.
// - Staff (ADMIN, AGENT, L2_MANAGER): mark done / not done (TSK-3, reversible: no confirmation), Edit (M11),
//   Delete (TSK-4, "Remove this task?" first, 05 §A.15). END_USER: read-only (D4).
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #16): a record screen, in every tab's stack (one screen per task, getId), with
// the native navigation bar. "View parent ticket" goes back when that ticket is the screen underneath, and otherwise
// opens it in the same tab (Android switched to the Tickets tab). "Edit task" opens the task editor as a root sheet.
// "Remove task" keeps its red destructive confirmation. Who may act: taskPermissions() (utils/permissions.ts).
import type Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { useIsOffline } from '@/api/network';
import {
  Card, EmptyState, ErrorState, LoadingSkeleton, Notice, OfflineBanner, OfflineState, OutlineButton, QueryBanner,
  StatusBadge, taskStatusLabel,
} from '@/components';
import { useDeleteTask, useSingleFlight, useTicket, useToggleTask } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, maxTextScale } from '@/theme';
import type { RecordScreenProps } from '@/types';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import { formatDateTime, formatDisplayName } from '@/utils/format';
import { taskPermissions } from '@/utils/permissions';
import { formatDueDay, isTaskOverdue } from '@/utils/tasks';

export function TaskDetailScreen({ navigation, route }: RecordScreenProps<'TaskDetail'>) {
  const { ticketId, taskId } = route.params;
  const offline = useIsOffline();
  const canEdit = taskPermissions(useAuthStore((s) => s.user?.role)).edit;
  const ticketQuery = useTicket(ticketId);
  const ticket = ticketQuery.data;
  const task = ticket?.tasks?.find((t) => t?.id === taskId);
  const toggle = useToggleTask();
  const remove = useDeleteTask();
  const once = useSingleFlight();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await ticketQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  /** Back to the ticket if it is the screen underneath; otherwise open it in this tab (every tab's stack has it). */
  const viewParent = () => {
    const state = navigation.getState();
    const below = state.routes[state.index - 1] as { name?: string; params?: { ticketId?: string } } | undefined;
    if (below?.name === 'TicketDetail' && below.params?.ticketId === ticketId) {
      navigation.goBack();
      return;
    }
    navigation.navigate('TicketDetail', { ticketId });
  };

  const onToggle = () =>
    void once(async () => {
      if (!task) return;
      try {
        await toggle.mutateAsync({ ticketId, taskId: task.id, status: task.status });
        notify(task.status === 'COMPLETED' ? 'Marked as not done' : 'Marked as done');
      } catch (e) {
        reportWriteError("Couldn't update the task", e);
      }
    });

  const onDelete = () =>
    void once(async () => {
      if (!task) return;
      const ok = await confirmAction({
        title: 'Remove this task?',
        message: `"${task.title}" will be deleted from ticket #${ticket?.ticketNumber ?? ''}. This can't be undone.`,
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (!ok) return;
      try {
        await remove.mutateAsync({ ticketId, taskId: task.id });
        notify('Task removed');
        navigation.goBack();
      } catch (e) {
        reportWriteError("Couldn't remove the task", e);
      }
    });

  let content: ReactNode;
  if (!ticket && ticketQuery.fetchStatus === 'paused') {
    content = <OfflineState what="This task" />;
  } else if (!ticket && ticketQuery.isError) {
    content = <ErrorState error={ticketQuery.error} title="Couldn't load this task's ticket" onRetry={() => void ticketQuery.refetch()} />;
  } else if (!ticket) {
    content = <LoadingSkeleton variant="detail" />;
  } else if (!task) {
    content = (
      <EmptyState
        icon="checkbox-outline"
        title="This task no longer exists"
        message="It may have been removed. The ticket's Tasks tab shows its current tasks."
        actionLabel="View parent ticket"
        onAction={viewParent}
      />
    );
  } else {
    const done = task.status === 'COMPLETED';
    const overdue = isTaskOverdue(task);
    const busy = toggle.isPending || remove.isPending;
    content = (
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Card>
          <View className="mb-2 self-start rounded-full bg-gray-100 px-2.5 py-0.5">
            <Text className="text-xs font-medium text-gray-700">{taskStatusLabel(task.status)}</Text>
          </View>
          <Text selectable className={`text-lg font-bold ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`} maxFontSizeMultiplier={maxTextScale.title3}>
            {task.title || '(untitled task)'}
          </Text>
          {task.description ? (
            <Text selectable className="mt-2 text-sm leading-5 text-gray-700">
              {task.description}
            </Text>
          ) : (
            <Text className="mt-2 text-sm italic text-gray-500">No description</Text>
          )}
          <View className="mt-3">
            <Row label="Owner">{formatDisplayName(task.assignedTo?.displayName) || 'Unassigned'}</Row>
            <Row label="Due">
              {task.dueDate ? (
                <Text className={`text-sm ${overdue ? 'font-semibold text-red-700' : 'text-gray-900'}`}>
                  {formatDueDay(task.dueDate)}
                  {overdue ? ' · overdue' : ''}
                </Text>
              ) : (
                'No due date'
              )}
            </Row>
            {task.completedAt ? <Row label="Completed">{formatDateTime(task.completedAt)}</Row> : null}
            <Row label="Created">{formatDateTime(task.createdAt)}</Row>
            <Row label="Updated">{formatDateTime(task.updatedAt)}</Row>
          </View>
        </Card>

        <Card title="Parent ticket">
          <Text className="text-xs font-semibold text-gray-500">#{ticket.ticketNumber}</Text>
          <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
            {ticket.title || '(no subject)'}
          </Text>
          <View className="mt-2">
            <StatusBadge status={ticket.status} recordId={ticket.id} />
          </View>
          <View className="mt-3">
            <OutlineButton icon="ticket-outline" label="View parent ticket" onPress={viewParent} />
          </View>
        </Card>

        {canEdit ? (
          <Card title="Actions">
            <ActionButton
              icon={done ? 'square-outline' : 'checkbox-outline'}
              label={done ? 'Mark as not done' : 'Mark as done'}
              onPress={onToggle}
              disabled={busy}
              loading={toggle.isPending}
            />
            <ActionButton
              icon="create-outline"
              label="Edit task"
              onPress={() => navigation.navigate('TaskEditor', { ticketId, taskId: task.id })}
              disabled={busy}
            />
            <ActionButton icon="trash-outline" label="Remove task" tone="danger" onPress={onDelete} disabled={busy} loading={remove.isPending} />
          </Card>
        ) : (
          <View className="mx-4">
            <Notice tone="info">Tasks are read-only for your role.</Notice>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner />
      <QueryBanner error={ticketQuery.error} hasData={!!ticket} onRetry={() => void onRefresh()} />
      {content}
    </View>
  );
}

/** A label / value line in a card (UI-STANDARDS S6). */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row border-b border-border py-2">
      <Text className="w-28 pr-2 text-sm text-gray-500">{label}</Text>
      <View className="flex-1">{typeof children === 'string' ? <Text className="text-sm text-gray-900">{children}</Text> : children}</View>
    </View>
  );
}

/** One action in the card's stack: the standard outline button, left-aligned. */
function ActionButton({
  icon, label, onPress, disabled = false, loading = false, tone = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <View className="mb-2">
      <OutlineButton icon={icon} label={label} onPress={onPress} disabled={disabled} loading={loading} tone={tone} align="start" />
    </View>
  );
}
