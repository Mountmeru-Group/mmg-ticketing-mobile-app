// M11 Task editor — create (TSK-2) or edit (TSK-3) a task on a ticket (04 §2.1 M11, 05 §A.15). Opened from a
// ticket's Tasks tab or from task detail; registered in both the Tickets and the Tasks stacks.
// - Staff only (ADMIN, AGENT, L2_MANAGER). The server checks nothing (05 C.3); END_USER is read-only (D4).
// - TKT-3 loads the ticket first (05 §C hygiene), which also gives the current task when editing.
// - Title required (1–255). Create sends { title, description?, assignedToId?, dueDate? } — the server defaults the
//   status to OPEN. Edit sends only the fields that changed; clearing description, technician or due date sends null.
// - Due date: a calendar day sent as UTC midnight, a full ISO string — never `YYYY-MM-DD` (05 B.25).
// - Technician: ADMIN/AGENT pick through USR-3 (active users). L2_MANAGER can't search users (USR-3 is 403 for L2),
//   so for L2 the technician is shown but not changeable.
// - Save is the only write. Create/edit are reversible (edit or remove the task), so they are not confirmed; delete
//   lives on task detail and is confirmed there.
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeWriteError, isSessionEndedError } from '@/api/errors';
import {
  EmptyState, ErrorState, FieldLabel, FormCard, InlineError, LoadingSkeleton, OfflineState, OptionSheet, PersonPickerSheet,
  ScreenHeader, SelectField, SubmitButton, type Person, type SheetOption,
} from '@/components';
import { useDiscardGuard, useSaveTask, useSingleFlight, useTicket } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { TASK_STATUSES, type TaskBody, type TaskScreenProps, type TaskStatus, type UserRole } from '@/types';
import { notify } from '@/utils/dialogs';
import { TASK_STATUS_LABELS, formatDisplayName } from '@/utils/format';
import { isAgentOrAdmin, isStaff } from '@/utils/roles';
import { canAssignToSelf } from '@/utils/session';
import { dayFromToday, dayToDueDate, dueDateToDay, formatDueDay } from '@/utils/tasks';

const TECHNICIAN_ROLES: readonly UserRole[] = ['ADMIN', 'AGENT', 'L2_MANAGER'];
const STATUS_OPTIONS: readonly SheetOption<TaskStatus>[] = TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }));

interface Draft {
  title: string;
  description: string;
  assignee: Person | null;
  status: TaskStatus;
  /** The due-date field as typed: "YYYY-MM-DD", or "" for none. Validated on save. */
  dueDay: string;
}

export function TaskEditorScreen({ navigation, route }: TaskScreenProps<'TaskEditor'>) {
  const { ticketId, taskId } = route.params;
  const editing = taskId !== undefined;
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'END_USER';
  const canPickTechnician = isAgentOrAdmin(role);

  const ticketQuery = useTicket(ticketId);
  const ticket = ticketQuery.data;
  const task = editing ? ticket?.tasks?.find((t) => t?.id === taskId) : undefined;
  const save = useSaveTask();
  const once = useSingleFlight();

  const initial = useMemo<Draft>(
    () => ({
      title: task?.title ?? '',
      description: task?.description ?? '',
      assignee: task?.assignedTo ? { id: task.assignedTo.id, displayName: task.assignedTo.displayName, email: task.assignedTo.email } : null,
      status: task?.status ?? 'OPEN',
      dueDay: dueDateToDay(task?.dueDate),
    }),
    [task],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // Fill the form once the task has loaded (edit), without overwriting what the person is typing afterwards.
  useEffect(() => {
    const key = task ? task.id : editing ? null : 'new';
    if (key && key !== loadedFor) {
      setDraft(initial);
      setLoadedFor(key);
    }
  }, [task, editing, initial, loadedFor]);

  const [sheet, setSheet] = useState<'status' | 'technician' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const body = useMemo(() => buildBody(draft, editing ? initial : null), [draft, editing, initial]);
  // Create: anything typed. Edit: anything that differs from the loaded task.
  const dirty = editing
    ? Object.keys(body).length > 0
    : !!(draft.title.trim() || draft.description.trim() || draft.assignee || draft.dueDay.trim());
  const { leave } = useDiscardGuard({ dirty, busy: save.isPending, what: 'task' });

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const dueDay = draft.dueDay.trim();
  const dueValid = !dueDay || !!dayToDueDate(dueDay);

  const submit = () =>
    void once(async () => {
      setError(null);
      const title = draft.title.trim();
      if (!title) return setError('Title is required');
      if (title.length > 255) return setError('Title must be 255 characters or fewer');
      if (!dueValid) return setError('Due date must be a real date written as YYYY-MM-DD');
      try {
        await save.mutateAsync({ ticketId, taskId, body });
        notify(editing ? 'Task saved' : 'Task added');
        leave(() => navigation.goBack());
      } catch (e) {
        if (!isSessionEndedError(e)) setError(describeWriteError(e));
      }
    });

  const title = editing ? 'Edit task' : 'New task';

  if (!isStaff(role)) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="close" />
        <EmptyState icon="lock-closed-outline" title="Tasks are read-only for your role" />
      </View>
    );
  }
  if (!ticket) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="close" />
        {ticketQuery.fetchStatus === 'paused' ? (
          <OfflineState what="The ticket" />
        ) : ticketQuery.isError ? (
          <ErrorState error={ticketQuery.error} title="Couldn't load the ticket" onRetry={() => void ticketQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="detail" />
        )}
      </View>
    );
  }
  if (editing && !task) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="close" />
        <EmptyState icon="checkbox-outline" title="This task no longer exists" message="It may have been removed." />
      </View>
    );
  }

  const quickDays: { label: string; day: string }[] = [
    { label: 'Today', day: dayFromToday(0) },
    { label: 'Tomorrow', day: dayFromToday(1) },
    { label: 'In a week', day: dayFromToday(7) },
  ];

  return (
    <KeyboardAvoidingView behavior="height" className="flex-1 bg-gray-50">
      <ScreenHeader title={title} variant="close" />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Text className="mx-4 mb-2 text-xs text-gray-500" numberOfLines={1}>
          On ticket #{ticket.ticketNumber} · {ticket.title}
        </Text>
        <FormCard>
          <FieldLabel label="Title" required />
          <TextInput
            value={draft.title}
            onChangeText={(v) => update({ title: v })}
            editable={!save.isPending}
            maxLength={255}
            placeholder="What needs doing"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Title"
            className="mb-3 min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
          />
          <FieldLabel label="Description" />
          <TextInput
            value={draft.description}
            onChangeText={(v) => update({ description: v })}
            editable={!save.isPending}
            multiline
            textAlignVertical="top"
            placeholder="Optional details"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Description"
            className="mb-3 min-h-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
          />

          {canPickTechnician ? (
            <SelectField
              label="Technician"
              value={draft.assignee ? formatDisplayName(draft.assignee.displayName) || draft.assignee.email : null}
              placeholder="Unassigned"
              onPress={() => setSheet('technician')}
              disabled={save.isPending}
            />
          ) : (
            <View className="mb-3">
              <FieldLabel label="Technician" hint="Your role can't search for people, so this can't be changed here." />
              <Text className="text-base text-gray-900">{draft.assignee ? formatDisplayName(draft.assignee.displayName) : 'Unassigned'}</Text>
            </View>
          )}

          {editing ? (
            <SelectField label="Status" value={TASK_STATUS_LABELS[draft.status]} onPress={() => setSheet('status')} disabled={save.isPending} />
          ) : null}

          <FieldLabel label="Due date" hint="YYYY-MM-DD, or pick one below" />
          <TextInput
            value={draft.dueDay}
            onChangeText={(v) => update({ dueDay: v })}
            editable={!save.isPending}
            placeholder="No due date"
            placeholderTextColor="#9ca3af"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Due date"
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
          />
          <View className="mb-1 mt-2 flex-row flex-wrap gap-2">
            {quickDays.map((q) => (
              <Chip key={q.label} label={q.label} active={dueDay === q.day} onPress={() => update({ dueDay: q.day })} />
            ))}
            <Chip label="No due date" active={!dueDay} onPress={() => update({ dueDay: '' })} />
          </View>
          {dueDay ? (
            <Text className={`mb-1 text-xs ${dueValid ? 'text-gray-500' : 'text-red-700'}`}>
              {dueValid ? `Due ${formatDueDay(dayToDueDate(dueDay))}` : 'Not a valid date — use YYYY-MM-DD'}
            </Text>
          ) : null}
        </FormCard>

        <InlineError message={error} />
        <View className="mx-4">
          <SubmitButton
            label={editing ? 'Save task' : 'Add task'}
            onPress={submit}
            disabled={!draft.title.trim() || !dueValid || (editing && !dirty)}
            loading={save.isPending}
          />
        </View>
      </ScrollView>

      <OptionSheet
        visible={sheet === 'status'}
        title="Status"
        options={STATUS_OPTIONS}
        selected={draft.status}
        onSelect={(status) => update({ status })}
        onClose={() => setSheet(null)}
      />
      <PersonPickerSheet
        visible={sheet === 'technician'}
        title="Technician"
        searchRoles={TECHNICIAN_ROLES}
        extraOptions={[
          ...(canAssignToSelf(user) && user
            ? [{ key: 'me', label: 'Assign to me', onPress: () => { update({ assignee: { id: user.id, displayName: user.displayName, email: user.email } }); setSheet(null); } }]
            : []),
          { key: 'none', label: 'Unassigned', onPress: () => { update({ assignee: null }); setSheet(null); } },
        ]}
        onPick={(p) => {
          update({ assignee: p });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
    </KeyboardAvoidingView>
  );
}

/** The request body: on create, the filled fields; on edit, only what differs from the loaded task. */
function buildBody(draft: Draft, before: Draft | null): TaskBody {
  const title = draft.title.trim();
  const description = draft.description.trim();
  const day = draft.dueDay.trim();
  const dueDate = day ? dayToDueDate(day) : null; // invalid text is refused before sending
  if (!before) {
    const body: TaskBody = { title };
    if (description) body.description = description;
    if (draft.assignee) body.assignedToId = draft.assignee.id;
    if (dueDate) body.dueDate = dueDate;
    return body;
  }
  const body: TaskBody = {};
  if (title !== before.title.trim()) body.title = title;
  if (description !== before.description.trim()) body.description = description || null;
  if ((draft.assignee?.id ?? null) !== (before.assignee?.id ?? null)) body.assignedToId = draft.assignee?.id ?? null;
  if (draft.status !== before.status) body.status = draft.status;
  if (day !== before.dueDay) body.dueDate = dueDate;
  return body;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`rounded-full border px-3 py-1.5 ${active ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'}`}
    >
      <Text className={`text-sm ${active ? 'font-medium text-blue-700' : 'text-gray-800'}`}>{label}</Text>
    </Pressable>
  );
}
