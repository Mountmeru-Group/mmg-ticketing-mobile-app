// "Submit for approval" from M4's More options (Phase G3; the web's behaviour, with sources: docs/G3-WEB-BEHAVIOUR.md §3).
// - ADMIN and AGENT only (perm canSubmitForApproval: the server's `agentOrAdmin`). The web also shows it to END_USER
//   and L2_MANAGER, who always get 403, so the entry point is hidden for them and this screen refuses them too.
// - Every status, no AGENT lock: neither the web nor the server has a state rule. On a Resolved, Closed or Canceled
//   ticket the server reopens it to Pending with Management Review, and the confirmation says so.
// - Approvers *: any active user (USR-3 with no role filter, as the web), from 2 letters; people already chosen are
//   left out of the results. Comments: optional. "Submit (n)" is disabled until one approver is chosen.
// - The only write is APR-4, after a confirmation that names what the server does. Then the ticket's status is re-read
//   from the server and shown as it is, with the fact that an approval decision does not move the ticket (05 B.22).
//   The web's "until all approvers respond" is not repeated, because it is not what happens.
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #12): a root sheet, one per ticket (routes.ts getId), titled in the native bar.
// The form lifts above the keyboard (SheetKeyboardView); the approver search stays a scrollable sheet.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeActionWriteError, isSessionEndedError } from '@/api/errors';
import {
  EmptyState, ErrorState, FieldLabel, FormCard, InlineError, LoadingSkeleton, Notice, OfflineBanner, OfflineState,
  OutlineButton, PersonPickerSheet, SheetKeyboardView, StatusBadge, SubmitButton, type Person,
} from '@/components';
import { fetchCurrentStatus, useDiscardGuard, useSingleFlight, useSubmitForApproval, useTicket } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { SheetScreenProps, TicketDetail, UserRole } from '@/types';
import { submitApprovalMessage, submitApprovalOutcome } from '@/utils/approvals';
import { confirmAction, notify } from '@/utils/dialogs';
import { formatDisplayName, statusLabel } from '@/utils/format';
import { canSubmitForApproval, navRole } from '@/utils/permissions';

type Props = SheetScreenProps<'SubmitApproval'>;

/** USR-3 with no role filter: approvers can be anyone (FE:TicketDetailPage.tsx:415-421). Module-level: stable. */
const ANY_ROLE: readonly UserRole[] = [];

export function SubmitApprovalScreen(props: Props) {
  const role = navRole(useAuthStore((s) => s.user?.role));
  if (!canSubmitForApproval(role)) {
    return (
      <View className="flex-1 bg-gray-50">
        <EmptyState
          icon="lock-closed-outline"
          title="Not available for your role"
          message="Only Admins and Technicians can submit a ticket for approval."
        />
      </View>
    );
  }
  return <SubmitApprovalForm {...props} />;
}

function SubmitApprovalForm({ navigation, route }: Props) {
  const { ticketId } = route.params;
  const insets = useSafeAreaInsets();
  const ticketQuery = useTicket(ticketId);
  const ticket = ticketQuery.data;
  const submit = useSubmitForApproval();
  const once = useSingleFlight();

  const [approvers, setApprovers] = useState<Person[]>([]);
  const [comments, setComments] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the server accepted the request: what happened, shown in place of the form. */
  const [outcome, setOutcome] = useState<string[] | null>(null);
  const { leave } = useDiscardGuard({
    dirty: outcome === null && (approvers.length > 0 || comments.trim() !== ''),
    busy: submit.isPending,
    what: 'approval request',
  });

  const chosenIds = useMemo(() => approvers.map((p) => p.id), [approvers]);
  const names = approvers.map((p) => formatDisplayName(p.displayName) || p.email);

  const title = ticket ? `Submit for approval · #${ticket.ticketNumber}` : 'Submit for approval';
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  function addApprover(person: Person) {
    setPickerOpen(false);
    setApprovers((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]));
  }

  async function send(current: TicketDetail) {
    setError(null);
    const ok = await confirmAction({
      title: 'Submit for approval?',
      message: submitApprovalMessage(current, names),
      confirmLabel: 'Submit',
    });
    if (!ok) return;
    try {
      await submit.mutateAsync({ ticketId, approverIds: chosenIds, comments });
    } catch (e) {
      // The form keeps everything as it was, so the person can correct it and try again.
      if (!isSessionEndedError(e)) setError(describeActionWriteError('submit tickets for approval', e));
      return;
    }
    notify('Approval request submitted');
    // Show the status the server now has, not the one it should have: one TKT-3 read.
    const statusNow = await fetchCurrentStatus(ticketId).catch(() => null);
    setOutcome(submitApprovalOutcome(names, statusNow));
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-gray-50">
        <OfflineBanner />
        {ticketQuery.fetchStatus === 'paused' ? (
          <OfflineState what="This ticket" />
        ) : ticketQuery.isError ? (
          <ErrorState error={ticketQuery.error} title="Couldn't load this ticket" onRetry={() => void ticketQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="formPage" rows={2} />
        )}
      </View>
    );
  }

  if (outcome) {
    return (
      <View className="flex-1 bg-gray-50">
        <OfflineBanner />
        <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
          <FormCard title="Approval requested">
            {outcome.map((line) => (
              <View key={line} className="mb-2 flex-row items-start">
                <Ionicons name="checkmark-circle-outline" size={18} color={palette.green[700]} />
                <Text className="ml-2 flex-1 text-sm text-gray-700">{line}</Text>
              </View>
            ))}
          </FormCard>
          <View className="mx-4">
            <SubmitButton label="Done" onPress={() => leave(() => navigation.goBack())} />
          </View>
        </ScrollView>
      </View>
    );
  }

  const busy = submit.isPending;

  return (
    <SheetKeyboardView>
      <OfflineBanner />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      >
        <FormCard>
          <Text className="text-sm text-gray-500" numberOfLines={2}>#{ticket.ticketNumber} · {ticket.title}</Text>
          <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
            <Text className="text-sm text-gray-700">Current status</Text>
            <StatusBadge status={ticket.status} recordId={ticket.id} />
          </View>
        </FormCard>

        <FormCard title="Approvers">
          <FieldLabel label="Approver(s)" required hint="Anyone with a Service Desk account. Search by name or email." />
          {approvers.length > 0 ? (
            <View className="mb-2 flex-row flex-wrap">
              {approvers.map((p, i) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${names[i]}`}
                  disabled={busy}
                  onPress={() => setApprovers((prev) => prev.filter((x) => x.id !== p.id))}
                  hitSlop={6}
                  className="m-0.5 h-8 flex-row items-center rounded-full bg-primary/10 px-2.5 active:opacity-70"
                >
                  <Text className="text-xs font-medium text-primary">{names[i]}</Text>
                  <Ionicons name="close" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <OutlineButton
            icon="person-add-outline"
            label={approvers.length > 0 ? 'Add another approver' : 'Add an approver'}
            onPress={() => setPickerOpen(true)}
            disabled={busy}
            align="start"
          />
        </FormCard>

        <FormCard title="Comments">
          <FieldLabel label="Comments (optional)" />
          <TextInput
            value={comments}
            onChangeText={setComments}
            editable={!busy}
            multiline
            textAlignVertical="top"
            placeholder="Context for the approver…"
            placeholderTextColor={colors.text.secondary}
            accessibilityLabel="Comments for the approver"
            className="min-h-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
          />
        </FormCard>

        <View className="mx-4">
          <Notice>
            {ticket.status === 'PENDING_MGMT_REVIEW'
              ? `The ticket stays ${statusLabel('PENDING_MGMT_REVIEW')}.`
              : `The ticket moves to ${statusLabel('PENDING_MGMT_REVIEW')} as soon as you submit.`}{' '}
            Each approver is emailed and notified, and any approval still pending on this ticket is cancelled. Approving
            or rejecting doesn't move the ticket again: a technician changes its status afterwards.
          </Notice>
        </View>

        <InlineError message={error} />

        <View className="mx-4">
          <SubmitButton
            label={`Submit (${approvers.length})`}
            onPress={() => void once(() => send(ticket))}
            disabled={approvers.length === 0}
            loading={busy}
          />
        </View>
      </ScrollView>

      <PersonPickerSheet
        visible={pickerOpen}
        title="Add an approver"
        searchRoles={ANY_ROLE}
        excludeIds={chosenIds}
        onPick={addApprover}
        onClose={() => setPickerOpen(false)}
      />
    </SheetKeyboardView>
  );
}
