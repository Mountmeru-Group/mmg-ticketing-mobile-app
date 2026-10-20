// M13 Approval detail + Take action (04 §2.1 M13, 08 1.49–1.50).
// - The row comes from the APR-1 cache (there is no GET /approvals/:id). It is kept on screen after the decision,
//   when APR-1 no longer lists it.
// - Context, by type:
//     ticket          → TKT-3 by `entityId`; subject, status, requester, description, counts and "Open the ticket" ONLY on
//                       a 200. A 403 says the details aren't available to this account on mobile (08 S8) — no fallback,
//                       and nothing relies on the AGENT scope gap (05 C.6).
//     service_request → the embedded `serviceRequest` (SCR-6 is Phase 2 and not called).
//     change          → `{ changeNumber, title, status }` only, plus "open the web for full details" (08 S2).
// - Take action: a comment, then Approve (comment optional, APR-2) or Reject (reason required, APR-3). Each asks for
//   confirmation naming exactly what happens — a decision can't be undone.
// - Afterwards the screen states what actually happened: a ticket's status does NOT change (05 B.22).
// - No delegation (A26).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiClientError } from '@/api/errors';
import {
  EmptyState, ErrorState, FieldLabel, HtmlText, LoadingSkeleton, Notice, OfflineBanner, OfflineState, PriorityBadge,
  ScreenHeader, StatusBadge, SubmitButton,
} from '@/components';
import { useDecideApproval, useDiscardGuard, usePendingApprovals, useSingleFlight, useTicket, type ApprovalDecision } from '@/hooks';
import { palette } from '@/theme';
import type { Approval, ApprovalsStackScreenProps, TicketDetail } from '@/types';
import { decisionMessage, decisionOutcome, entityLabel, shortApprovalId } from '@/utils/approvals';
import { confirmAction, reportWriteError } from '@/utils/dialogs';
import { formatDateTime, formatDisplayName, statusLabel } from '@/utils/format';
import { htmlToDisplayText } from '@/utils/html';

export function ApprovalDetailScreen({ navigation, route }: ApprovalsStackScreenProps<'ApprovalDetail'>) {
  const { approvalId } = route.params;
  const insets = useSafeAreaInsets();
  const approvals = usePendingApprovals();
  const found = approvals.data?.find((a) => a.id === approvalId);
  const [snapshot, setSnapshot] = useState<Approval | null>(null);
  useEffect(() => {
    if (found) setSnapshot(found);
  }, [found]);
  const approval = found ?? snapshot;

  const ticketQuery = useTicket(approval?.entityType === 'ticket' ? approval.entityId : '');
  const decide = useDecideApproval();
  const once = useSingleFlight();
  const [comment, setComment] = useState('');
  const [result, setResult] = useState<Approval | null>(null);

  const { leave } = useDiscardGuard({ dirty: !result && !!comment.trim(), busy: decide.isPending, what: 'comment' });

  const openTicket = (ticketId: string) =>
    navigation.navigate('MainTabs', { screen: 'TicketsTab', params: { screen: 'TicketDetail', params: { ticketId }, initial: false } });

  const submit = (decision: ApprovalDecision) =>
    void once(async () => {
      if (!approval) return;
      if (decision === 'reject' && !comment.trim()) return;
      const ok = await confirmAction({
        title: decision === 'approve' ? 'Approve?' : 'Reject?',
        message: decisionMessage(approval, decision, ticketQuery.data?.status ?? null),
        confirmLabel: decision === 'approve' ? 'Approve' : 'Reject',
        destructive: decision === 'reject',
      });
      if (!ok) return;
      try {
        const res = await decide.mutateAsync({ approval, decision, comments: comment });
        setResult(res);
      } catch (e) {
        reportWriteError(decision === 'approve' ? "Couldn't approve" : "Couldn't reject", e);
      }
    });

  if (!approval) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="Approval" variant="back" />
        {approvals.fetchStatus === 'paused' && !approvals.data ? (
          <OfflineState what="This approval" />
        ) : approvals.isError && !approvals.data ? (
          <ErrorState error={approvals.error} title="Couldn't load approvals" onRetry={() => void approvals.refetch()} />
        ) : !approvals.data ? (
          <LoadingSkeleton variant="detail" />
        ) : (
          <EmptyState
            icon="checkmark-done-outline"
            title="No longer waiting for you"
            message="It was decided, cancelled or moved. Your pending approvals are in the inbox."
            actionLabel="Back to approvals"
            onAction={() => navigation.navigate('ApprovalsInbox', undefined, { pop: true })}
          />
        )}
      </View>
    );
  }

  const shown = result ?? approval;
  const decided = !!result || shown.status !== 'PENDING';

  return (
    <KeyboardAvoidingView behavior="height" className="flex-1 bg-gray-50">
      <ScreenHeader title={`${entityLabel(shown.entityType)} approval`} variant="back" />
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Card>
          <View className="mb-1 flex-row items-center">
            <View className="rounded-full bg-yellow-100 px-2.5 py-0.5">
              <Text className="text-xs font-medium text-yellow-800">{entityLabel(shown.entityType)}</Text>
            </View>
            <Text className="ml-2 text-xs font-semibold text-gray-500">#{shortApprovalId(shown.id)}</Text>
            <ApprovalStatusChip status={shown.status} />
          </View>
          <Row label="Requested">{formatDateTime(shown.createdAt)}</Row>
          <Row label="Stage">{String(shown.stage ?? '—')}</Row>
          {shown.decidedAt ? <Row label="Decided">{formatDateTime(shown.decidedAt)}</Row> : null}
          {shown.comments ? <Row label="Your comment">{shown.comments}</Row> : null}
        </Card>

        {shown.entityType === 'ticket' ? (
          <TicketContext query={ticketQuery} onOpen={openTicket} />
        ) : shown.entityType === 'change' ? (
          <ChangeContext approval={shown} />
        ) : (
          <ServiceRequestContext approval={shown} />
        )}

        {result ? (
          <Card title="What happened">
            {decisionOutcome(result, ticketQuery.data?.status ?? null).map((line) => (
              <View key={line} className="mb-1.5 flex-row items-start">
                <Ionicons name="checkmark-circle-outline" size={16} color={palette.green[700]} style={{ marginTop: 2 }} />
                <Text className="ml-2 flex-1 text-sm text-gray-800">{line}</Text>
              </View>
            ))}
            <View className="mt-2">
              <SubmitButton label="Back to approvals" tone="muted" onPress={() => leave(() => navigation.navigate('ApprovalsInbox', undefined, { pop: true }))} />
            </View>
          </Card>
        ) : decided ? (
          <Card>
            <Text className="text-sm text-gray-700">This approval is {shown.status.toLowerCase()} and can't be changed.</Text>
          </Card>
        ) : (
          <Card title="Take action">
            <FieldLabel label="Comment" hint="Optional to approve. Required to reject. It is sent to the requester for ticket approvals." />
            <TextInput
              value={comment}
              onChangeText={setComment}
              editable={!decide.isPending}
              multiline
              textAlignVertical="top"
              placeholder="Add a comment"
              placeholderTextColor={palette.gray[400]}
              className="mb-3 min-h-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <SubmitButton
                  label="Approve"
                  tone="success"
                  onPress={() => submit('approve')}
                  loading={decide.isPending && decide.variables?.decision === 'approve'}
                  disabled={decide.isPending}
                />
              </View>
              <View className="flex-1">
                <SubmitButton
                  label="Reject"
                  tone="danger"
                  onPress={() => submit('reject')}
                  loading={decide.isPending && decide.variables?.decision === 'reject'}
                  disabled={decide.isPending || !comment.trim()}
                />
              </View>
            </View>
            {!comment.trim() ? <Text className="mt-2 text-xs text-gray-500">Write a reason to enable Reject.</Text> : null}
            {shown.entityType === 'ticket' ? (
              <View className="mt-3">
                <Notice tone="info">Approving or rejecting doesn't change the ticket's status. A technician moves it afterwards.</Notice>
              </View>
            ) : null}
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Context cards ────────────────────────────────────────────

function TicketContext({
  query, onOpen,
}: {
  query: { data?: TicketDetail; error: unknown; isError: boolean; fetchStatus: 'fetching' | 'paused' | 'idle'; refetch: () => Promise<unknown> };
  onOpen: (ticketId: string) => void;
}) {
  const t = query.data;
  if (!t) {
    const status = query.error instanceof ApiClientError ? query.error.status : null;
    if (status === 403) {
      return (
        <Card title="Ticket">
          <Text className="text-sm text-gray-700">
            You can approve this, but the ticket's details aren't available to your account on mobile.
          </Text>
        </Card>
      );
    }
    if (status === 404) {
      return (
        <Card title="Ticket">
          <Text className="text-sm text-gray-700">The ticket for this approval wasn't found.</Text>
        </Card>
      );
    }
    if (query.isError) {
      return (
        <Card title="Ticket">
          <ErrorState error={query.error} title="Couldn't load the ticket" onRetry={() => void query.refetch()} />
        </Card>
      );
    }
    return (
      <Card title="Ticket">
        {query.fetchStatus === 'paused' ? (
          <Text className="text-sm text-gray-500">The ticket loads when you reconnect.</Text>
        ) : (
          <LoadingSkeleton variant="lines" rows={3} />
        )}
      </Card>
    );
  }
  const attachments = t._count?.attachments ?? 0;
  return (
    <Card title="Ticket">
      <Text className="text-xs font-semibold text-gray-500">#{t.ticketNumber}</Text>
      <Text selectable className="text-base font-bold text-gray-900">
        {t.title || '(no subject)'}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-1.5">
        <StatusBadge status={t.status} />
        <PriorityBadge priority={t.priority} />
      </View>
      <View className="mt-2">
        <Row label="Requester">{formatDisplayName(t.requester?.displayName) || 'Unknown'}</Row>
        <Row label="Created">{formatDateTime(t.createdAt)}</Row>
        <Row label="Attachments">{String(attachments)}</Row>
      </View>
      <Text className="mb-1 mt-3 text-xs font-semibold text-gray-500">Description</Text>
      <HtmlText html={t.description} collapsedHeight={200} emptyText="No description" />
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen(t.id)}
        className="mt-3 flex-row items-center justify-center rounded-lg border border-gray-300 py-2.5 active:bg-gray-50"
      >
        <Ionicons name="open-outline" size={16} color={palette.gray[800]} />
        <Text className="ml-1.5 text-sm font-medium text-gray-900">Open the ticket (conversation, files)</Text>
      </Pressable>
    </Card>
  );
}

function ChangeContext({ approval }: { approval: Approval }) {
  const c = approval.change;
  return (
    <Card title="Change">
      {c ? (
        <>
          <Text className="text-xs font-semibold text-gray-500">Change #{c.changeNumber}</Text>
          <Text selectable className="text-base font-bold text-gray-900">
            {c.title || '(no title)'}
          </Text>
          <Row label="Status">{c.status ? c.status.replace(/_/g, ' ') : '—'}</Row>
        </>
      ) : (
        <Text className="text-sm text-gray-700">This approval carries no change details.</Text>
      )}
      <View className="mt-3">
        <Notice tone="info">Open the Service Desk on the web for the full change details.</Notice>
      </View>
    </Card>
  );
}

function ServiceRequestContext({ approval }: { approval: Approval }) {
  const sr = approval.serviceRequest;
  if (!sr) {
    return (
      <Card title="Service request">
        <Text className="text-sm text-gray-700">This approval carries no request details.</Text>
      </Card>
    );
  }
  // formData is free-form (the server does not validate it, 05 §A.17): only simple values are shown, as text.
  const fields = Object.entries(sr.formData && typeof sr.formData === 'object' ? sr.formData : {}).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
  const notes = htmlToDisplayText(sr.notes);
  return (
    <Card title="Service request">
      <Text className="text-xs font-semibold text-gray-500">Request #{sr.requestNumber}</Text>
      <Text className="text-base font-bold text-gray-900">{sr.serviceItem?.name ?? 'Service request'}</Text>
      <Row label="Status">{statusLabel(sr.status)}</Row>
      <Row label="Priority">
        <PriorityBadge priority={sr.priority} />
      </Row>
      <Row label="Created">{formatDateTime(sr.createdAt)}</Row>
      {fields.map(([key, value]) => (
        <Row key={key} label={key}>
          {String(value)}
        </Row>
      ))}
      {notes ? (
        <>
          <Text className="mb-1 mt-3 text-xs font-semibold text-gray-500">Notes</Text>
          <Text selectable className="text-sm text-gray-800">
            {notes}
          </Text>
        </>
      ) : null}
    </Card>
  );
}

// ── Layout pieces ────────────────────────────────────────────

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="mx-4 mb-3 rounded-xl bg-white p-4">
      {title ? <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</Text> : null}
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row border-b border-gray-100 py-2">
      <Text className="w-28 text-sm text-gray-500" numberOfLines={2}>
        {label}
      </Text>
      <View className="flex-1">{typeof children === 'string' ? <Text selectable className="text-sm text-gray-900">{children}</Text> : children}</View>
    </View>
  );
}

// 05 §A.10: APPROVED green, REJECTED red, CANCELLED gray, else yellow.
function ApprovalStatusChip({ status }: { status: string }) {
  const style =
    status === 'APPROVED'
      ? { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' }
      : status === 'REJECTED'
        ? { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' }
        : status === 'CANCELLED'
          ? { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Cancelled' }
          : { bg: 'bg-yellow-100', text: 'text-yellow-800', label: status === 'PENDING' ? 'Pending' : status };
  return (
    <View className={`ml-auto rounded-full px-2.5 py-0.5 ${style.bg}`}>
      <Text className={`text-xs font-medium ${style.text}`}>{style.label}</Text>
    </View>
  );
}
