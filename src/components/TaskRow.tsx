// One task, as embedded in a ticket (TKT-1 / TKT-3). Shared by the ticket's Tasks tab (M4) and the standalone task
// list, so both show a task the same way.
// - `onToggle` (staff only, ticket screen only): the done/not-done checkbox (TSK-3). Without it the icon is display-only.
// - `parent`: shows the parent ticket line (standalone list).
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors, palette } from '@/theme';
import type { TicketTaskEmbedded } from '@/types';
import { TASK_STATUS_LABELS, formatDisplayName } from '@/utils/format';
import { formatDueDay, isTaskOverdue } from '@/utils/tasks';

export const TASK_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  OPEN: { name: 'ellipse-outline', color: palette.gray[500] },
  IN_PROGRESS: { name: 'time-outline', color: palette.yellow[600] },
  COMPLETED: { name: 'checkmark-circle', color: palette.green[600] },
  CANCELLED: { name: 'close-circle-outline', color: palette.gray[400] },
};

export function taskStatusLabel(status: string): string {
  return (TASK_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

interface TaskRowProps {
  task: TicketTaskEmbedded;
  onPress?: () => void;
  /** Present only for staff, on screens where the ticket was opened with TKT-3. */
  onToggle?: () => void;
  toggling?: boolean;
  parent?: { ticketNumber: number; title: string };
  /** Last row in a card: no bottom border. */
  last?: boolean;
}

function TaskRowImpl({ task, onPress, onToggle, toggling = false, parent, last = false }: TaskRowProps) {
  const icon = TASK_ICONS[task.status] ?? TASK_ICONS.OPEN!;
  const done = task.status === 'COMPLETED';
  const assignee = formatDisplayName(task.assignedTo?.displayName);
  const overdue = isTaskOverdue(task);

  const statusIcon = onToggle ? (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done, disabled: toggling, busy: toggling }}
      accessibilityLabel={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      disabled={toggling}
      onPress={onToggle}
      hitSlop={10}
      className="mr-3 h-6 w-6 items-center justify-center active:opacity-60"
    >
      {toggling ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={done ? 'checkbox' : 'square-outline'} size={20} color={done ? palette.green[600] : palette.gray[600]} />
      )}
    </Pressable>
  ) : (
    <View className="mr-3 h-6 w-6 items-center justify-center">
      <Ionicons name={icon.name} size={20} color={icon.color} />
    </View>
  );

  const body = (
    <View className="flex-1">
      {parent ? (
        <Text className="mb-0.5 text-xs text-gray-500" numberOfLines={1}>
          #{parent.ticketNumber} · {parent.title || '(no subject)'}
        </Text>
      ) : null}
      <Text className={`text-sm font-semibold ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`} numberOfLines={2}>
        {task.title || '(untitled task)'}
      </Text>
      {task.description && !parent ? (
        <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}
      <Text className="mt-1 text-xs text-gray-500">
        {taskStatusLabel(task.status)}
        {assignee ? ` · ${assignee}` : ' · Unassigned'}
        {task.dueDate ? ' · ' : ''}
        {task.dueDate ? (
          <Text className={overdue ? 'font-semibold text-red-700' : undefined}>
            {overdue ? 'Overdue · ' : 'Due '}
            {formatDueDay(task.dueDate)}
          </Text>
        ) : null}
      </Text>
    </View>
  );

  return (
    <View className={`flex-row items-start py-3 ${last ? '' : 'border-b border-gray-100'}`}>
      {statusIcon}
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens the task"
          onPress={onPress}
          className="flex-1 flex-row items-center active:opacity-70"
        >
          {body}
          <Ionicons name="chevron-forward" size={18} color={colors.text.muted} style={{ marginLeft: 8 }} />
        </Pressable>
      ) : (
        body
      )}
    </View>
  );
}

export const TaskRow = memo(TaskRowImpl);
