// M6 Status & closure sheet (04 M6, 05 §A.1–§A.2, 08 §4.2).
// - Transitions come ONLY from ticket-rules.ts for the ticket's status and the user's role (05 §A.1, D1); invalid
//   ones are not shown. All buttons are disabled while a request is in flight.
// - RESOLVED / CLOSED / CANCELED open the closure form: Resolution* and Closure comments* (trimmed, required),
//   Closure code (exact strings), FCR, attachments (uploaded FIRST; the status is posted only if they succeed).
// - Every change asks for confirmation naming who is emailed and what becomes public.
// - Status is written ONLY through TKT-6 POST /tickets/:id/status (useChangeStatus / changeTicketStatus). Never PUT.
// - Bulk mode (2–20 tickets from M3): Close only, one shared form, sequential, stop on 429/5xx, per-ticket results.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UploadFile } from '@/api/attachments.api';
import { describeWriteError, isSessionEndedError } from '@/api/errors';
import { changeTicketStatus } from '@/api/tickets.api';
import {
  AttachmentPicker, BulkProgressModal, EmptyState, ErrorState, FieldLabel, FormCard, InlineError, LoadingSkeleton, Notice,
  OfflineBanner, OfflineState, OptionSheet, ScreenHeader, SelectField, StatusBadge, SubmitButton, type SheetOption,
} from '@/components';
import {
  assertStatusChange, assertStatusUnchanged, findCachedTicket, useBulkRunner, useChangeStatus, useDiscardGuard, useSingleFlight, useTicket,
  type BulkTarget,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { TicketStackScreenProps, TicketStatus, UserRole } from '@/types';
import { notify, confirmAction, reportWriteError } from '@/utils/dialogs';
import { statusLabel } from '@/utils/format';
import {
  BULK_ACTION_LIMIT, CLOSURE_CODE_OPTIONS, EMPTY_CLOSURE_FORM, buildClosureBody, canChangeStatus, canCloseInBulk,
  canSubmitClosure, closureSaveLabel, closureTitle, getAvailableTransitions, isResolvedLocked, requiresClosureForm,
  transitionTone, type ClosureForm, type StatusTransition,
} from '@/utils/ticket-rules';
import { bulkCloseMessage, closureMessage, statusChangeMessage } from '@/utils/writeCopy';

type Props = TicketStackScreenProps<'StatusClosure'>;

export function StatusClosureScreen(props: Props) {
  return props.route.params.ticketIds.length > 1 ? <BulkClose {...props} /> : <SingleStatus {...props} />;
}

// ── Shared closure fields (05 §A.2) ──────────────────────────

const CODE_OPTIONS: SheetOption<string>[] = [
  { value: '', label: '— Select —' },
  ...CLOSURE_CODE_OPTIONS.map((code) => ({ value: code, label: code })),
];

function ClosureFields({ form, onChange, disabled }: { form: ClosureForm; onChange: (form: ClosureForm) => void; disabled: boolean }) {
  const [codeSheet, setCodeSheet] = useState(false);
  return (
    <>
      <FieldLabel label="Resolution" required />
      <TextInput
        value={form.resolution}
        onChangeText={(resolution) => onChange({ ...form, resolution })}
        editable={!disabled}
        multiline
        textAlignVertical="top"
        placeholder="What was done to resolve the issue"
        placeholderTextColor={colors.text.secondary}
        accessibilityLabel="Resolution, required"
        className="mb-3 min-h-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
      />
      <SelectField
        label="Closure code"
        value={form.closureCode || null}
        placeholder="— Select —"
        onPress={() => setCodeSheet(true)}
        disabled={disabled}
      />
      <View className="mb-3 min-h-11 flex-row items-center justify-between">
        <Text className="flex-1 text-sm font-medium text-gray-700">Is FCR (First Call Resolution)</Text>
        <Switch
          value={form.isFcr}
          onValueChange={(isFcr) => onChange({ ...form, isFcr })}
          disabled={disabled}
          trackColor={{ false: palette.gray[300], true: colors.primary }}
          thumbColor={palette.white}
          accessibilityLabel="First call resolution"
        />
      </View>
      <FieldLabel label="Closure comments" required hint="Posted as a PUBLIC reply the requester sees, and included in the closed email." />
      <TextInput
        value={form.closureComments}
        onChangeText={(closureComments) => onChange({ ...form, closureComments })}
        editable={!disabled}
        multiline
        textAlignVertical="top"
        placeholder="Message to the requester"
        placeholderTextColor={colors.text.secondary}
        accessibilityLabel="Closure comments, required"
        className="mb-3 min-h-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
      />
      <OptionSheet
        visible={codeSheet}
        title="Closure code"
        options={CODE_OPTIONS}
        selected={form.closureCode}
        onSelect={(code) => onChange({ ...form, closureCode: code as ClosureForm['closureCode'] })}
        onClose={() => setCodeSheet(false)}
      />
    </>
  );
}

function saveTone(target: TicketStatus) {
  // 05 §A.1: RESOLVED green, CLOSED grey; CANCELED red (destructive).
  return target === 'RESOLVED' ? 'success' : target === 'CLOSED' ? 'muted' : 'danger';
}

const TONE_CLASS = { success: 'border-green-300 bg-green-50', muted: 'border-gray-400 bg-gray-100', neutral: 'border-gray-300 bg-white' } as const;

// ── One ticket ───────────────────────────────────────────────

function SingleStatus({ navigation, route }: Props) {
  const ticketId = route.params.ticketIds[0] ?? '';
  const requested = route.params.target;
  const insets = useSafeAreaInsets();
  const role: UserRole = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const ticketQuery = useTicket(ticketId);
  const ticket = ticketQuery.data;
  const change = useChangeStatus();
  const once = useSingleFlight();

  const transitions = ticket ? getAvailableTransitions(role, ticket.status) : [];
  const [closure, setClosure] = useState<StatusTransition | null>(null);
  const [form, setForm] = useState<ClosureForm>(EMPTY_CLOSURE_FORM);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Opened for a specific closure target (inline chip, detail bar): go straight to its form — once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !ticket || !requested) return;
    opened.current = true;
    const match = getAvailableTransitions(role, ticket.status).find((t) => t.target === requested);
    if (match && requiresClosureForm(match.target)) setClosure(match);
  }, [ticket, requested, role]);

  const dirty = closure !== null && (!!form.resolution.trim() || !!form.closureComments.trim() || files.length > 0);
  const { leave } = useDiscardGuard({ dirty, busy: change.isPending, what: 'status change' });

  async function quickChange(t: StatusTransition) {
    if (!ticket) return;
    if (requiresClosureForm(t.target)) {
      setClosure(t);
      return;
    }
    const ok = await confirmAction({
      title: `${t.label}?`,
      message: statusChangeMessage(ticket.ticketNumber, ticket.status, t.target),
      confirmLabel: t.label,
    });
    if (!ok) return;
    try {
      await change.mutateAsync({ ticketId, from: ticket.status, body: { status: t.target } });
      notify('Status updated');
      leave(() => navigation.goBack());
    } catch (e) {
      reportWriteError('Failed to update status', e);
    }
  }

  async function submitClosure() {
    if (!ticket || !closure) return;
    setError(null);
    const ok = await confirmAction({
      title: `${closureTitle(closure.label)}?`,
      message: closureMessage(ticket.ticketNumber, closure.target, role, files.length),
      confirmLabel: closureSaveLabel(closure.label),
      destructive: closure.target !== 'RESOLVED',
    });
    if (!ok) return;
    try {
      await change.mutateAsync({ ticketId, from: ticket.status, body: buildClosureBody(closure.target, form), files });
      notify('Status updated');
      leave(() => navigation.goBack());
    } catch (e) {
      if (!isSessionEndedError(e)) setError(describeWriteError(e));
    }
  }

  const title = closure ? closureTitle(closure.label) : ticket ? `Change status · #${ticket.ticketNumber}` : 'Change status';

  if (!ticket) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="close" />
        <OfflineBanner />
        {ticketQuery.fetchStatus === 'paused' ? (
          <OfflineState what="This ticket" />
        ) : ticketQuery.isError ? (
          <ErrorState error={ticketQuery.error} title="Couldn't load this ticket" onRetry={() => void ticketQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="formPage" rows={3} />
        )}
      </View>
    );
  }

  if (!canChangeStatus(role)) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="close" />
        <EmptyState icon="lock-closed-outline" title="Not available for your role" message="Only staff can change a ticket's status." />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: palette.gray[50] }}>
      <ScreenHeader title={title} variant="close" />
      <OfflineBanner />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
        <FormCard>
          <Text className="text-sm text-gray-500" numberOfLines={2}>
            #{ticket.ticketNumber} · {ticket.title}
          </Text>
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <Text className="text-sm text-gray-700">Current status</Text>
            <StatusBadge status={ticket.status} />
          </View>
        </FormCard>

        {closure === null ? (
          <FormCard title="Move to">
            {transitions.length === 0 ? (
              <Text className="text-sm text-gray-700">
                {isResolvedLocked(role, ticket.status)
                  ? 'Closed and canceled tickets are locked for technicians.'
                  : 'No status changes are available from this status.'}
              </Text>
            ) : (
              transitions.map((t) => (
                <Pressable
                  key={t.target}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: change.isPending }}
                  disabled={change.isPending}
                  onPress={() => void once(() => quickChange(t))}
                  className={`mb-2 min-h-12 flex-row items-center justify-between rounded-lg border px-4 py-3 ${TONE_CLASS[transitionTone(t.target)]} ${change.isPending ? 'opacity-50' : 'active:opacity-70'}`}
                >
                  <Text className="flex-1 text-base font-medium text-gray-900">{t.label}</Text>
                  {requiresClosureForm(t.target) ? <Text className="ml-2 text-xs text-gray-500">Needs closure details</Text> : null}
                </Pressable>
              ))
            )}
          </FormCard>
        ) : (
          <>
            <FormCard title={`${statusLabel(ticket.status)} → ${statusLabel(closure.target)}`}>
              <ClosureFields form={form} onChange={setForm} disabled={change.isPending} />
              <FieldLabel label="Attachments" />
              <AttachmentPicker files={files} onChange={setFiles} disabled={change.isPending} />
            </FormCard>
            <InlineError message={error} />
            <View className="mx-4">
              <SubmitButton
                label={closureSaveLabel(closure.label)}
                onPress={() => void once(submitClosure)}
                disabled={!canSubmitClosure(form, change.isPending)}
                loading={change.isPending}
                tone={saveTone(closure.target)}
              />
              {!change.isPending ? (
                <Pressable accessibilityRole="button" onPress={() => setClosure(null)} className="mt-2 min-h-11 items-center justify-center">
                  <Text className="text-sm font-medium text-blue-700">Choose a different status</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Bulk close (08 §4.2) ─────────────────────────────────────

function BulkClose({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const role: UserRole = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const bulk = useBulkRunner();
  const once = useSingleFlight();
  const [form, setForm] = useState<ClosureForm>(EMPTY_CLOSURE_FORM);

  // Status and number come from the list already on screen; nothing is fetched to build the batch.
  const { targets, statusById } = useMemo(() => {
    const statuses = new Map<string, TicketStatus>();
    const list: BulkTarget[] = route.params.ticketIds.slice(0, BULK_ACTION_LIMIT).map((id) => {
      const t = findCachedTicket(queryClient, id);
      if (!t) return { id, label: `Ticket ${id.slice(0, 8)}`, skipReason: 'Not loaded on this device. Refresh the list and try again.' };
      statuses.set(id, t.status);
      return canCloseInBulk(role, t.status)
        ? { id, label: `#${t.ticketNumber}` }
        : { id, label: `#${t.ticketNumber}`, skipReason: `${statusLabel(t.status)} tickets can't move to Closed.` };
    });
    return { targets: list, statusById: statuses };
  }, [route.params.ticketIds, queryClient, role]);

  const eligible = targets.filter((t) => !t.skipReason);
  const skipped = targets.filter((t) => t.skipReason);
  const running = bulk.progress?.running ?? false;
  const { leave } = useDiscardGuard({
    dirty: !bulk.progress && (!!form.resolution.trim() || !!form.closureComments.trim()),
    busy: running,
    what: 'bulk close',
  });

  async function submit() {
    const ok = await confirmAction({
      title: `Close ${eligible.length} ${eligible.length === 1 ? 'ticket' : 'tickets'}?`,
      message: bulkCloseMessage(eligible.length, skipped.length, role),
      confirmLabel: 'Close tickets',
      destructive: true,
    });
    if (!ok) return;
    const body = buildClosureBody('CLOSED', form);
    await bulk.run('Closing tickets', targets, async (id) => {
      const from = statusById.get(id);
      if (!from) throw new Error('Status unknown');
      assertStatusChange(role, from, body); // same guards as a single change:
      await assertStatusUnchanged(id, from); // …including the server's current status
      await changeTicketStatus(id, body); // TKT-6 POST — never PUT
    });
  }

  const invalidRequest = route.params.target !== 'CLOSED' || !canChangeStatus(role) || route.params.ticketIds.length > BULK_ACTION_LIMIT;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: palette.gray[50] }}>
      <ScreenHeader title={`Close ${route.params.ticketIds.length} tickets`} variant="close" />
      <OfflineBanner />
      {invalidRequest ? (
        <EmptyState icon="alert-circle-outline" title="Not available" message={`Bulk changes are limited to closing up to ${BULK_ACTION_LIMIT} tickets, by staff.`} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
          <FormCard title={`${eligible.length} will be closed`}>
            <Text className="text-sm text-gray-700">{eligible.map((t) => t.label).join(', ') || 'None of the selected tickets can be closed.'}</Text>
            {skipped.length > 0 ? (
              <View className="mt-3">
                <Text className="text-xs font-semibold text-gray-500">Skipped</Text>
                {skipped.map((t) => (
                  <Text key={t.id} className="mt-1 text-sm text-gray-500">
                    {t.label}: {t.skipReason}
                  </Text>
                ))}
              </View>
            ) : null}
          </FormCard>
          <FormCard title="Closure details (applied to every ticket)">
            <ClosureFields form={form} onChange={setForm} disabled={running} />
            <Notice>Attachments can't be added in bulk. Close a ticket on its own to attach files.</Notice>
          </FormCard>
          <View className="mx-4">
            <SubmitButton
              label={`Save & Close ${eligible.length}`}
              onPress={() => void once(submit)}
              disabled={eligible.length === 0 || !canSubmitClosure(form, running) || bulk.progress !== null}
              loading={running}
              tone="muted"
            />
          </View>
        </ScrollView>
      )}
      <BulkProgressModal
        progress={bulk.progress}
        onStop={bulk.stop}
        onClose={() => {
          bulk.reset();
          leave(() => navigation.goBack());
        }}
      />
    </KeyboardAvoidingView>
  );
}
