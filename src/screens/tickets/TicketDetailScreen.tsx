// M4 Ticket detail (04 §2.1 M4). Live data (Phase 3a reads) plus the ticket write actions (Phase 3b).
//
// Calls: TKT-3 first. Only after it succeeds (05 §C hygiene) are the tab queries allowed, and each one loads the
// first time its tab is opened — nothing is prefetched:
//   Conversation → CMT-1 · History → TKT-7 (audit entries, 20 per page) · Attachments → ATT-1 (metadata only)
//   Tasks → embedded in TKT-3, no extra call.
// Pull-to-refresh reloads the ticket and the tab on screen.
//
// Role rules (05 §A.3): impact/urgency hidden for END_USER; PRIVATE notes shown to ADMIN/AGENT only, checked here
// even though the server already withholds them (visibleComments); status bar hidden for END_USER (05 §A.1).
//
// WRITES (Phase 3b) — each an explicit action, confirmed where it emails people or can't be undone:
//   Status bar: transitions from ticket-rules.ts only; RESOLVED/CLOSED/CANCELED open M6 for the closure fields.
//     TKT-6 POST /tickets/:id/status — PUT /tickets/:id is never used for status (05 B.1).
//   More options: Pick up (ADMIN/AGENT, not locked, not the dev placeholder user), Assign → M7, Close → M6.
//   Conversation: Reply / Reply all (staff) / Note (ADMIN/AGENT) → M5.
//   Attachments: images open inline via ATT-3 with the Bearer header; staged files upload via ATT-2 (unless locked).
//   Tasks (Phase 4): every role taps a task to open task detail. Staff (ADMIN, AGENT, L2) also tick it done / not done
//     (TSK-3, reversible) and add tasks (→ M11, TSK-2); edit and remove live on task detail. END_USER: read-only (D4).
//     The rows are the shared TaskRow, also used by the standalone task list.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openAttachmentExternally } from '@/api/attachmentDownload';
import { getAttachmentViewRequest, type UploadFile } from '@/api/attachments.api';
import { describeError, isSessionEndedError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import {
  AttachmentPicker, EmptyState, ErrorState, HtmlText, ImageViewerModal, LoadingSkeleton, OfflineBanner, OfflineState,
  OptionSheet, PriorityBadge, QueryBanner, ScreenHeader, SlaBadge, StatusBadge, SubmitButton, TaskRow, type SheetOption,
} from '@/components';
import {
  useAssignTicket, useChangeStatus, useSingleFlight, useTicket, useTicketAttachments, useTicketComments, useTicketHistory,
  useToggleTask, useUploadAttachment,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { palette } from '@/theme';
import type {
  ActivityAuditItem, Attachment, Comment, TicketDetail, TicketImpact, TicketStackScreenProps, TicketTaskEmbedded,
  TicketUrgency, UserRole,
} from '@/types';
import { canSeePrivateNotes, describeAudit } from '@/utils/activity';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import {
  IMPACT_LABELS, URGENCY_LABELS, categoryCascade, effectiveResolveDue, formatBytes, formatDateTime, formatDisplayName,
  formatRelative, initials, sourceLabel,
} from '@/utils/format';
import { isAgentOrAdmin, isStaff } from '@/utils/roles';
import { canAssignToSelf } from '@/utils/session';
import {
  canChangeStatus, getAvailableTransitions, isResolvedLocked, requiresClosureForm, transitionTone, type StatusTransition,
} from '@/utils/ticket-rules';
import { statusChangeMessage } from '@/utils/writeCopy';

type DetailTab = 'conversation' | 'history' | 'attachments' | 'tasks';
type MoreAction = 'pickup' | 'assign' | 'close';

/** Images (not SVG) open in the in-app viewer; PDFs and other types show their details only. */
function isViewableImage(mimeType: string): boolean {
  const type = (mimeType || '').toLowerCase();
  return type.startsWith('image/') && !type.startsWith('image/svg');
}

export function TicketDetailScreen({ navigation, route }: TicketStackScreenProps<'TicketDetail'>) {
  const { ticketId } = route.params;
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'END_USER';
  const insets = useSafeAreaInsets();

  const ticketQuery = useTicket(ticketId);
  const ticket = ticketQuery.data;
  // Data present = TKT-3 has succeeded for this ticket in this session (05 §C: gate for every sub-resource).
  const ready = ticket !== undefined;

  const [tab, setTab] = useState<DetailTab>('conversation');
  // A tab's query stays enabled once visited, so switching back never triggers an automatic refetch.
  const [visited, setVisited] = useState<ReadonlySet<DetailTab>>(() => new Set<DetailTab>(['conversation']));
  const selectTab = (next: DetailTab) => {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  const comments = useTicketComments(ticketId, { enabled: ready && visited.has('conversation') });
  const history = useTicketHistory(ticketId, { enabled: ready && visited.has('history') });
  const attachments = useTicketAttachments(ticketId, { enabled: ready && visited.has('attachments') });

  const offline = useIsOffline();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    if (offline) return; // a refetch would only pause until reconnect; the offline banner explains
    setRefreshing(true);
    try {
      await ticketQuery.refetch();
      if (tab === 'conversation') await comments.refetch();
      else if (tab === 'history') await history.refreshFirstPage();
      else if (tab === 'attachments') await attachments.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Writes ─────────────────────────────────────────────────
  const changeStatus = useChangeStatus();
  const assign = useAssignTicket();
  const upload = useUploadAttachment();
  const toggleTask = useToggleTask();
  const once = useSingleFlight();
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  // ATT-3 with the Bearer header, built once per opened image so a background refetch doesn't reload it. The token
  // is read from the auth store at this moment and never logged.
  const viewRequest = useMemo(() => (viewing ? getAttachmentViewRequest(ticketId, viewing.id) : null), [ticketId, viewing]);
  // ATT-4 download-then-share for PDFs and other files (and "Share" on an open image). A read, not a write.
  const [openingId, setOpeningId] = useState<string | null>(null);
  async function openExternally(attachment: Attachment) {
    if (offline) {
      Alert.alert("You're offline", 'Files can be opened once you reconnect.');
      return;
    }
    setOpeningId(attachment.id);
    try {
      await openAttachmentExternally(ticketId, attachment);
    } catch (e) {
      if (!isSessionEndedError(e)) Alert.alert("Couldn't open the file", describeError(e));
    } finally {
      setOpeningId(null);
    }
  }
  const [newFiles, setNewFiles] = useState<UploadFile[]>([]);
  const writing = changeStatus.isPending || assign.isPending;

  async function onTransition(t: StatusTransition) {
    if (!ticket) return;
    if (requiresClosureForm(t.target)) {
      navigation.navigate('StatusClosure', { ticketIds: [ticket.id], target: t.target });
      return;
    }
    const ok = await confirmAction({
      title: `${t.label}?`,
      message: statusChangeMessage(ticket.ticketNumber, ticket.status, t.target),
      confirmLabel: t.label,
    });
    if (!ok) return;
    try {
      await changeStatus.mutateAsync({ ticketId, from: ticket.status, body: { status: t.target } });
      notify('Status updated');
    } catch (e) {
      reportWriteError('Failed to update status', e);
    }
  }

  async function pickUp() {
    if (!ticket || !user) return;
    const ok = await confirmAction({
      title: 'Pick up this ticket?',
      message: `#${ticket.ticketNumber} will be assigned to you${ticket.team ? ` in ${ticket.team.name}` : ''}.`,
      confirmLabel: 'Pick up',
    });
    if (!ok) return;
    try {
      // 08 S5 / 05 B.14: send the current team so the server doesn't pick an arbitrary one.
      await assign.mutateAsync({ ticketId, status: ticket.status, assignedToId: user.id, teamId: ticket.teamId ?? undefined });
      notify('Assigned to you');
    } catch (e) {
      reportWriteError('Failed to pick up', e);
    }
  }

  async function onToggleTask(task: TicketTaskEmbedded) {
    try {
      await toggleTask.mutateAsync({ ticketId, taskId: task.id, status: task.status });
    } catch (e) {
      reportWriteError("Couldn't update the task", e);
    }
  }

  async function uploadStaged() {
    if (!ticket || newFiles.length === 0) return;
    try {
      await upload.mutateAsync({ ticketId, status: ticket.status, files: newFiles });
      notify(`${newFiles.length} ${newFiles.length === 1 ? 'file' : 'files'} uploaded`);
      setNewFiles([]);
    } catch (e) {
      reportWriteError('Upload failed', e);
    }
  }

  const title = ticket ? `Ticket #${ticket.ticketNumber}` : 'Ticket';

  if (!ticket) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="back" />
        {ticketQuery.fetchStatus === 'paused' ? (
          <OfflineState what="This ticket" />
        ) : ticketQuery.isError ? (
          <ErrorState error={ticketQuery.error} title="Couldn't load this ticket" onRetry={() => void ticketQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="detail" />
        )}
      </View>
    );
  }

  const locked = isResolvedLocked(role, ticket.status);
  const moreActions: SheetOption<MoreAction>[] = [];
  if (isAgentOrAdmin(role) && !locked && canAssignToSelf(user) && ticket.assignedToId !== user?.id) {
    moreActions.push({ value: 'pickup', label: 'Pick up', description: 'Assign this ticket to yourself' });
  }
  if (isAgentOrAdmin(role) && !locked) moreActions.push({ value: 'assign', label: 'Assign…', description: 'Choose a group and technician' });
  if (getAvailableTransitions(role, ticket.status).some((t) => t.target === 'CLOSED')) {
    moreActions.push({ value: 'close', label: 'Close…', description: 'Opens the closure form' });
  }
  const onMore = (action: MoreAction) => {
    if (action === 'pickup') void once(pickUp);
    else if (action === 'assign') navigation.navigate('AssignPicker', { ticketIds: [ticket.id] });
    else navigation.navigate('StatusClosure', { ticketIds: [ticket.id], target: 'CLOSED' });
  };

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader
        title={title}
        variant="back"
        right={
          moreActions.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More options"
              disabled={writing}
              onPress={() => setMoreOpen(true)}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full"
            >
              {assign.isPending ? <ActivityIndicator color={palette.blue[600]} /> : <Ionicons name="ellipsis-vertical" size={22} color={palette.gray[900]} />}
            </Pressable>
          ) : undefined
        }
      />
      <OfflineBanner />
      <QueryBanner error={ticketQuery.error} hasData onRetry={() => void onRefresh()} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[palette.blue[600]]} />}
      >
        <HeaderCard ticket={ticket} role={role} />
        <StatusActionBar ticket={ticket} role={role} busy={writing} onTransition={(t) => void once(() => onTransition(t))} />

        <Card title="Description">
          <HtmlText html={ticket.description} emptyText="No description" />
        </Card>

        <PropertiesCard ticket={ticket} role={role} />
        <RequesterCard ticket={ticket} />
        <ResolutionCard ticket={ticket} />

        <TabBar
          tab={tab}
          onSelect={selectTab}
          counts={{
            // `_count.comments` includes private notes, so it is not shown; the loaded, filtered count is.
            conversation: comments.data?.length,
            attachments: ticket._count?.attachments,
            tasks: Array.isArray(ticket.tasks) ? ticket.tasks.length : undefined,
          }}
        />

        {tab === 'conversation' ? (
          <View className="mx-4 mb-3 flex-row gap-2">
            <ActionChip icon="arrow-undo-outline" label="Reply" onPress={() => navigation.navigate('ReplyComposer', { ticketId, mode: 'reply' })} />
            {isStaff(role) ? (
              <ActionChip icon="arrow-undo-circle-outline" label="Reply all" onPress={() => navigation.navigate('ReplyComposer', { ticketId, mode: 'replyAll' })} />
            ) : null}
            {/* Private note: ADMIN and AGENT only — not offered at all to END_USER or L2_MANAGER. */}
            {canSeePrivateNotes(role) ? (
              <ActionChip icon="lock-closed-outline" label="Note" onPress={() => navigation.navigate('ReplyComposer', { ticketId, mode: 'note' })} />
            ) : null}
          </View>
        ) : null}
        {tab === 'conversation' ? (
          <TabBody
            query={comments}
            what="The conversation"
            loadingRows={2}
            errorTitle="Couldn't load the conversation"
            isEmpty={(comments.data?.length ?? 0) === 0}
            empty={<EmptyState icon="chatbubbles-outline" title="No replies yet" message="Replies on this ticket will appear here." />}
          >
            {(comments.data ?? []).map((c) => (
              <CommentItem key={c.id} comment={c} role={role} />
            ))}
          </TabBody>
        ) : null}

        {tab === 'history' ? (
          <TabBody
            // A failed "Load older history" is reported on its button, not as a "Couldn't refresh" banner.
            query={{
              data: history.data,
              error: history.isFetchNextPageError ? null : history.error,
              isError: history.isError && !history.isFetchNextPageError,
              fetchStatus: history.fetchStatus,
              refetch: history.refreshFirstPage,
            }}
            what="The history"
            loadingRows={2}
            errorTitle="Couldn't load the history"
            isEmpty={history.audits.length === 0}
            empty={<EmptyState icon="time-outline" title="No history yet" message="Changes to this ticket will appear here." />}
          >
            <View className="mx-4 rounded-xl bg-white px-4 py-2">
              {history.audits.map((a) => (
                <AuditRow key={a.id} audit={a} />
              ))}
            </View>
            {history.hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                disabled={history.isFetchingNextPage || offline}
                onPress={() => void history.fetchNextPage()}
                className={`mx-4 mt-3 items-center rounded-lg border border-gray-300 bg-white py-2.5 ${offline ? 'opacity-50' : ''}`}
              >
                {history.isFetchingNextPage ? (
                  <ActivityIndicator color={palette.blue[600]} />
                ) : (
                  <Text className="text-sm font-medium text-gray-800">
                    {offline
                      ? 'Older history loads when you reconnect'
                      : history.isFetchNextPageError
                        ? "Couldn't load more — tap to retry"
                        : 'Load older history'}
                  </Text>
                )}
              </Pressable>
            ) : null}
          </TabBody>
        ) : null}

        {tab === 'attachments' && !locked ? (
          <Card title="Add files">
            <AttachmentPicker files={newFiles} onChange={setNewFiles} disabled={upload.isPending} />
            {newFiles.length > 0 ? (
              <View className="mt-3">
                <SubmitButton
                  label={`Upload ${newFiles.length} ${newFiles.length === 1 ? 'file' : 'files'}`}
                  onPress={() => void once(uploadStaged)}
                  loading={upload.isPending}
                />
              </View>
            ) : null}
          </Card>
        ) : null}
        {tab === 'attachments' ? (
          <TabBody
            query={attachments}
            what="The attachment list"
            loadingRows={2}
            errorTitle="Couldn't load the attachments"
            isEmpty={(attachments.data?.length ?? 0) === 0}
            empty={<EmptyState icon="attach-outline" title="No attachments" message="Files added to this ticket will appear here." />}
          >
            <Text className="mx-4 mb-2 text-xs text-gray-500">
              Tap an image to view it, or any other file to open or share it. Long-press for details.
            </Text>
            {(attachments.data ?? []).map((a) => (
              <AttachmentRow
                key={a.id}
                attachment={a}
                onView={isViewableImage(a.mimeType) ? () => setViewing(a) : undefined}
                onOpen={() => void once(() => openExternally(a))}
                opening={openingId === a.id}
              />
            ))}
          </TabBody>
        ) : null}

        {tab === 'tasks' ? (
          <TasksTab
            tasks={Array.isArray(ticket.tasks) ? ticket.tasks : []}
            canEdit={isStaff(role)}
            togglingId={toggleTask.isPending ? (toggleTask.variables?.taskId ?? null) : null}
            onOpen={(task) => navigation.navigate('TaskDetail', { ticketId, taskId: task.id })}
            onToggle={(task) => void once(() => onToggleTask(task))}
            onAdd={() => navigation.navigate('TaskEditor', { ticketId })}
          />
        ) : null}
      </ScrollView>

      <OptionSheet visible={moreOpen} title="More options" options={moreActions} selected={null} onSelect={onMore} onClose={() => setMoreOpen(false)} />
      <ImageViewerModal
        request={viewRequest}
        title={viewing?.fileName ?? ''}
        onShare={viewing ? () => void once(() => openExternally(viewing)) : undefined}
        sharing={!!viewing && openingId === viewing.id}
        onClose={() => setViewing(null)}
      />
    </View>
  );
}

function ActionChip({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center rounded-lg border border-gray-300 bg-white py-2.5 active:bg-gray-50"
    >
      <Ionicons name={icon} size={16} color={palette.gray[800]} />
      <Text className="ml-1.5 text-sm font-medium text-gray-900">{label}</Text>
    </Pressable>
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
      <Text className="w-32 text-sm text-gray-500">{label}</Text>
      <View className="flex-1">{typeof children === 'string' ? <Text className="text-sm text-gray-900">{children}</Text> : children}</View>
    </View>
  );
}

const CHIP_STYLES = {
  red: { bg: 'bg-red-100', text: 'text-red-800' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-800' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  green: { bg: 'bg-green-100', text: 'text-green-800' },
} as const;

function Chip({ label, tone }: { label: string; tone: keyof typeof CHIP_STYLES }) {
  const style = CHIP_STYLES[tone];
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${style.bg}`}>
      <Text className={`text-xs font-medium ${style.text}`}>{label}</Text>
    </View>
  );
}

// ── Header ───────────────────────────────────────────────────

function HeaderCard({ ticket, role }: { ticket: TicketDetail; role: UserRole }) {
  // "Auto" pill when the server computed priority from impact × urgency (05 §A.3, staff).
  const autoPriority = isStaff(role) && !!ticket.impact && !!ticket.urgency;
  const attachmentCount = ticket._count?.attachments ?? 0;
  return (
    <Card>
      <View className="mb-1 flex-row items-center">
        <Text className="text-xs font-semibold text-gray-500">#{ticket.ticketNumber}</Text>
        <View className="ml-2 rounded bg-gray-100 px-1.5 py-0.5">
          <Text className="text-[10px] font-medium uppercase text-gray-600">{sourceLabel(ticket.source)}</Text>
        </View>
      </View>
      <Text selectable className="text-lg font-bold text-gray-900">
        {ticket.title || '(no subject)'}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-1.5">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} auto={autoPriority} />
        <SlaBadge ticket={ticket} />
      </View>
      <Text className="mt-2 text-xs text-gray-500">
        Created {formatDateTime(ticket.createdAt)} · Updated {formatRelative(ticket.updatedAt)}
      </Text>
      <View className="mt-1 flex-row items-center">
        <Ionicons name="attach" size={14} color={palette.gray[500]} />
        <Text className="ml-1 text-xs text-gray-500">
          {attachmentCount} {attachmentCount === 1 ? 'attachment' : 'attachments'}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Status bar (05 §A.1): only the transition map for this role and status. Hidden for END_USER; empty for AGENT on
 * CLOSED/CANCELED. All buttons disabled while a write is in flight. Closure targets open M6; others confirm, then
 * post TKT-6 (never PUT).
 */
function StatusActionBar({
  ticket, role, busy, onTransition,
}: {
  ticket: TicketDetail;
  role: UserRole;
  busy: boolean;
  onTransition: (t: StatusTransition) => void;
}) {
  if (!canChangeStatus(role)) return null;
  const locked = isResolvedLocked(role, ticket.status);
  const transitions = getAvailableTransitions(role, ticket.status);
  const toneClass = { success: 'border-green-300 bg-green-50', muted: 'border-gray-400 bg-gray-100', neutral: 'border-gray-300 bg-white' } as const;

  return (
    <Card title="Change status">
      {transitions.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {transitions.map((t) => (
            <Pressable
              key={t.target}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              accessibilityHint={requiresClosureForm(t.target) ? 'Opens the closure form' : 'Asks you to confirm'}
              onPress={() => onTransition(t)}
              className={`rounded-lg border px-3 py-2 ${toneClass[transitionTone(t.target)]} ${busy ? 'opacity-50' : 'active:opacity-70'}`}
            >
              <Text className="text-sm text-gray-800">{t.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text className="text-sm text-gray-600">
          {locked ? 'Closed and canceled tickets are locked for technicians.' : 'No status changes are available from this status.'}
        </Text>
      )}
      {busy ? <ActivityIndicator style={{ marginTop: 8 }} color={palette.blue[600]} /> : null}
    </Card>
  );
}

// ── Properties ───────────────────────────────────────────────

function impactTone(impact: TicketImpact): 'red' | 'yellow' | 'green' {
  // 05 §A.10: HIGH red, MEDIUM yellow, else green.
  if (impact === 'HIGH') return 'red';
  if (impact === 'MEDIUM') return 'yellow';
  return 'green';
}

function urgencyTone(urgency: TicketUrgency): 'red' | 'orange' | 'yellow' | 'green' {
  // 05 §A.10: URGENT red, HIGH orange, MEDIUM yellow, else green.
  if (urgency === 'URGENT') return 'red';
  if (urgency === 'HIGH') return 'orange';
  if (urgency === 'MEDIUM') return 'yellow';
  return 'green';
}

function PropertiesCard({ ticket, role }: { ticket: TicketDetail; role: UserRole }) {
  const cascade = categoryCascade(ticket.category);
  const resolveBy = effectiveResolveDue(ticket);
  const technician = formatDisplayName(ticket.assignedTo?.displayName);
  return (
    <Card title="Properties">
      {/* Impact / urgency are hidden for END_USER (05 §A.3). */}
      {isStaff(role) ? (
        <>
          <Row label="Impact">
            {ticket.impact ? <Chip label={IMPACT_LABELS[ticket.impact] ?? ticket.impact} tone={impactTone(ticket.impact)} /> : 'Not set'}
          </Row>
          <Row label="Urgency">
            {ticket.urgency ? <Chip label={URGENCY_LABELS[ticket.urgency] ?? ticket.urgency} tone={urgencyTone(ticket.urgency)} /> : 'Not set'}
          </Row>
        </>
      ) : null}
      <Row label="Category">{cascade.category ?? 'Not set'}</Row>
      {cascade.subcategory ? <Row label="Subcategory">{cascade.subcategory}</Row> : null}
      {cascade.item ? <Row label="Item">{cascade.item}</Row> : null}
      <Row label="Group">{ticket.team?.name ?? 'Not set'}</Row>
      <Row label="Technician">{technician || 'Unassigned'}</Row>
      <Row label="Country">{ticket.country?.displayName || ticket.country?.name || 'Not set'}</Row>
      <Row label="Resolve by">{resolveBy ? formatDateTime(resolveBy) : 'No SLA'}</Row>
      {ticket.slaHoldStartedAt ? <Row label="SLA paused">{`Since ${formatDateTime(ticket.slaHoldStartedAt)}`}</Row> : null}
      {isStaff(role) ? (
        <Row label="First response">{ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : 'Not yet'}</Row>
      ) : null}
    </Card>
  );
}

function RequesterCard({ ticket }: { ticket: TicketDetail }) {
  const r = ticket.requester;
  const name = formatDisplayName(r?.displayName) || 'Unknown requester';
  return (
    <Card title="Requester">
      <View className="flex-row items-center">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-100">
          <Text className="font-semibold text-blue-700">{initials(r?.displayName)}</Text>
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-sm font-semibold text-gray-900">{name}</Text>
          {r?.email ? <Text selectable className="text-xs text-gray-600">{r.email}</Text> : null}
          {r?.phone ? <Text selectable className="text-xs text-gray-600">{r.phone}</Text> : null}
          {r?.department ? <Text className="text-xs text-gray-500">{r.department}</Text> : null}
        </View>
      </View>
    </Card>
  );
}

/** Resolution section (04 M4): shown once a ticket is resolved/closed/canceled or has closure data. */
function ResolutionCard({ ticket }: { ticket: TicketDetail }) {
  const done = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' || ticket.status === 'CANCELED';
  const hasData = !!(ticket.resolution || ticket.closureCode || ticket.closureComments);
  if (!done && !hasData) return null;
  return (
    <Card title="Resolution">
      {ticket.resolution ? <HtmlText html={ticket.resolution} collapsedHeight={140} /> : <Text className="text-sm text-gray-500">No resolution recorded</Text>}
      <View className="mt-2">
        <Row label="Closure code">{ticket.closureCode || 'Not set'}</Row>
        <Row label="First call fix">{ticket.isFcr ? 'Yes' : 'No'}</Row>
        {ticket.resolvedAt ? <Row label="Resolved">{formatDateTime(ticket.resolvedAt)}</Row> : null}
        {ticket.closedAt ? <Row label="Closed">{formatDateTime(ticket.closedAt)}</Row> : null}
      </View>
      {ticket.closureComments ? (
        <View className="mt-2">
          <Text className="mb-1 text-xs font-semibold text-gray-500">Closure comments</Text>
          <HtmlText html={ticket.closureComments} collapsedHeight={140} />
        </View>
      ) : null}
    </Card>
  );
}

// ── Tabs ─────────────────────────────────────────────────────

const TAB_LABELS: Record<DetailTab, string> = {
  conversation: 'Conversation',
  history: 'History',
  attachments: 'Attachments',
  tasks: 'Tasks',
};

function TabBar({
  tab, onSelect, counts,
}: {
  tab: DetailTab;
  onSelect: (tab: DetailTab) => void;
  counts: Partial<Record<DetailTab, number | undefined>>;
}) {
  return (
    <View className="mx-4 mb-3 flex-row rounded-xl bg-gray-200 p-1" accessibilityRole="tablist">
      {(Object.keys(TAB_LABELS) as DetailTab[]).map((t) => {
        const active = t === tab;
        const count = counts[t];
        return (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(t)}
            className={`flex-1 items-center rounded-lg py-2 ${active ? 'bg-white' : ''}`}
          >
            <Text
              className={`text-xs ${active ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {TAB_LABELS[t]}
              {count !== undefined ? ` (${count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface TabQueryState {
  data: unknown;
  error: unknown;
  isError: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  refetch: () => Promise<unknown>;
}

/** Loading / offline / error / empty / content for one tab, plus a stale-data banner when a refresh failed. */
function TabBody({
  query, what, loadingRows, errorTitle, isEmpty, empty, children,
}: {
  query: TabQueryState;
  /** For the offline message, e.g. "The conversation". */
  what: string;
  loadingRows: number;
  errorTitle: string;
  isEmpty: boolean;
  empty: ReactNode;
  children: ReactNode;
}) {
  const hasData = query.data !== undefined;
  if (!hasData && query.fetchStatus === 'paused') return <OfflineState what={what} />;
  if (!hasData && query.isError) return <ErrorState error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />;
  if (!hasData) return <LoadingSkeleton rows={loadingRows} />;
  return (
    <View>
      {query.isError ? (
        <View className="mx-4 mb-3 overflow-hidden rounded-lg">
          <QueryBanner error={query.error} hasData onRetry={() => void query.refetch()} />
        </View>
      ) : null}
      {isEmpty ? empty : children}
    </View>
  );
}

function CommentItem({ comment, role }: { comment: Comment; role: UserRole }) {
  const isPrivate = comment.type === 'PRIVATE';
  // visibleComments() already dropped notes for END_USER/L2; this is a second guard at the point of display.
  if (isPrivate && !canSeePrivateNotes(role)) return null;
  const author = formatDisplayName(comment.author?.displayName) || 'Unknown';
  const to = Array.isArray(comment.toRecipients) ? comment.toRecipients : [];
  const cc = Array.isArray(comment.ccRecipients) ? comment.ccRecipients : [];
  const files = Array.isArray(comment.attachments) ? comment.attachments : [];

  return (
    <View className={`mx-4 mb-3 rounded-xl border p-4 ${isPrivate ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'}`}>
      <View className="mb-2 flex-row items-center">
        <View className={`h-8 w-8 items-center justify-center rounded-full ${isPrivate ? 'bg-amber-200' : 'bg-blue-100'}`}>
          <Text className={`text-xs font-semibold ${isPrivate ? 'text-amber-900' : 'text-blue-700'}`}>{initials(comment.author?.displayName)}</Text>
        </View>
        <View className="ml-2 flex-1">
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{author}</Text>
          <Text className="text-xs text-gray-500">
            {formatDateTime(comment.createdAt)} · {formatRelative(comment.createdAt)}
            {comment.isEdited ? ' · edited' : ''}
          </Text>
        </View>
        {isPrivate ? (
          <View className="flex-row items-center rounded-full bg-amber-200 px-2 py-0.5">
            <Ionicons name="lock-closed" size={10} color={palette.amber[900]} />
            <Text className="ml-1 text-[10px] font-semibold uppercase text-amber-900">Private note</Text>
          </View>
        ) : null}
      </View>

      {/* Recipient addresses: staff only, public replies only (05 §A.5). */}
      {isStaff(role) && !isPrivate && (to.length > 0 || cc.length > 0) ? (
        <Text className="mb-2 text-xs text-gray-500" numberOfLines={2}>
          {to.length > 0 ? `To: ${to.join(', ')}` : ''}
          {to.length > 0 && cc.length > 0 ? '  ·  ' : ''}
          {cc.length > 0 ? `Cc: ${cc.join(', ')}` : ''}
        </Text>
      ) : null}

      <HtmlText html={comment.body} emptyText="(no text)" />

      {files.length > 0 ? (
        <View className="mt-2">
          {files.map((f) => (
            <View key={f.id} className="mt-1 flex-row items-center">
              <Ionicons name="attach" size={14} color={palette.gray[500]} />
              <Text className="ml-1 flex-1 text-xs text-gray-700" numberOfLines={1}>{f.fileName}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AuditRow({ audit }: { audit: ActivityAuditItem }) {
  const { actor, action } = describeAudit(audit);
  return (
    <View className="flex-row border-b border-gray-100 py-2.5">
      <View className="mr-3 mt-1.5 h-2 w-2 rounded-full bg-gray-300" />
      <View className="flex-1">
        <Text className="text-sm text-gray-800">
          <Text className="font-semibold">{actor}</Text> {action}
        </Text>
        <Text className="mt-0.5 text-xs text-gray-500">{formatDateTime(audit.createdAt)}</Text>
      </View>
    </View>
  );
}

function attachmentIcon(mimeType: string): keyof typeof Ionicons.glyphMap {
  const type = (mimeType || '').toLowerCase();
  if (type.startsWith('image/')) return 'image-outline';
  if (type === 'application/pdf') return 'document-text-outline';
  return 'document-outline';
}

/**
 * Tap: images open in the in-app viewer (ATT-3); every other type — PDFs included — downloads (ATT-4) and opens the
 * system share sheet. Long-press: details. `storagePath` (a server disk path) is never displayed (03 B.4).
 */
function AttachmentRow({
  attachment, onView, onOpen, opening,
}: {
  attachment: Attachment;
  onView?: () => void;
  onOpen: () => void;
  opening: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: opening, expanded: open }}
      accessibilityHint={onView ? 'Opens the image. Long-press for details' : 'Downloads the file and opens the share sheet. Long-press for details'}
      disabled={opening}
      onPress={onView ?? onOpen}
      onLongPress={() => setOpen((v) => !v)}
      className="mx-4 mb-2 rounded-xl bg-white p-3 active:bg-gray-50"
    >
      <View className="flex-row items-center">
        <Ionicons name={attachmentIcon(attachment.mimeType)} size={22} color={palette.gray[600]} />
        <View className="ml-3 flex-1">
          <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>{attachment.fileName || 'Unnamed file'}</Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {formatBytes(attachment.sizeBytes)} · {attachment.mimeType || 'unknown type'}
          </Text>
        </View>
        {opening ? (
          <ActivityIndicator color={palette.blue[600]} />
        ) : (
          <Ionicons name={onView ? 'eye-outline' : 'open-outline'} size={18} color={palette.gray[500]} />
        )}
      </View>
      {open ? (
        <View className="mt-2 border-t border-gray-100 pt-1">
          <Row label="Uploaded by">{formatDisplayName(attachment.uploaderName) || 'Unknown'}</Row>
          <Row label="Uploaded">{formatDateTime(attachment.createdAt)}</Row>
          <Row label="Type">{attachment.mimeType || 'Unknown'}</Row>
          <Row label="Size">{formatBytes(attachment.sizeBytes)}</Row>
          <Row label="Added with">{attachment.commentId ? 'A reply' : 'The ticket'}</Row>
          <Pressable accessibilityRole="button" disabled={opening} onPress={onOpen} className="mt-2 self-start py-1">
            <Text className="text-sm font-medium text-blue-700">Download and share</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Tasks embedded in TKT-3, in sortOrder. Tap → task detail (every role). Staff: checkbox (TSK-3) and "Add task" (M11).
 * END_USER sees the same rows without the checkbox or the add button (D4).
 */
function TasksTab({
  tasks, canEdit, togglingId, onOpen, onToggle, onAdd,
}: {
  tasks: readonly TicketTaskEmbedded[];
  canEdit: boolean;
  togglingId: string | null;
  onOpen: (task: TicketTaskEmbedded) => void;
  onToggle: (task: TicketTaskEmbedded) => void;
  onAdd: () => void;
}) {
  return (
    <View>
      {canEdit ? (
        <View className="mx-4 mb-3 flex-row">
          <ActionChip icon="add-circle-outline" label="Add task" onPress={onAdd} />
        </View>
      ) : null}
      {tasks.length === 0 ? (
        <EmptyState icon="checkbox-outline" title="No tasks" message="Tasks added to this ticket will appear here." />
      ) : (
        <View className="mx-4 rounded-xl bg-white px-4 py-1">
          {tasks.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              onPress={() => onOpen(task)}
              onToggle={canEdit ? () => onToggle(task) : undefined}
              toggling={togglingId === task.id}
              last={i === tasks.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}
