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
// Every role-gated element reads ticketDetailPermissions() (utils/permissions.ts), pinned per role by tests/rbac.
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
//   Properties (Phase G1, ./TicketPropertyEditors.tsx): impact and urgency with the priority preview, category,
//     country, and the resolution text — each from ticketFieldPermissions(), saved only on an explicit Save via
//     TKT-4 PUT (never status, never priority). docs/G1-WEB-BEHAVIOUR.md has the web's rules.
//   Phase G3 (docs/G3-WEB-BEHAVIOUR.md): a delete button on each file for ADMIN, AGENT and L2_MANAGER, in any status,
//     confirmed by name, then ATT-5 (permanent); "Submit for approval…" in More options for ADMIN and AGENT, in any
//     status, opening ./SubmitApprovalScreen.tsx.
//
// PERFORMANCE (Phase P, docs/PERFORMANCE.md): the screen is ONE FlatList. Everything above the tab rows is its header;
// the open tab's replies, history entries, files or tasks are its rows, memoised, laid out as they scroll into view
// instead of all at once (a long email thread is the most expensive thing the app renders). "Show more" on a reply and
// a file's details are held here, not in the row, so a row that scrolls far away and back keeps them.
import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useMemo, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openAttachmentExternally } from '@/api/attachmentDownload';
import { getAttachmentViewRequest, type UploadFile } from '@/api/attachments.api';
import { describeError, isSessionEndedError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import {
  AttachmentPicker, Card, EmptyState, ErrorState, HtmlText, ImageViewerModal, LoadingSkeleton, Notice, OfflineBanner,
  OfflineState, OptionSheet, OutlineButton, PriorityBadge, QueryBanner, ScreenHeader, SlaBadge, StatusBadge, SubmitButton, TaskRow,
  type SheetOption,
} from '@/components';
import {
  useAssignTicket, useChangeStatus, useDeleteAttachment, useSingleFlight, useStableCallback, useTicket, useTicketAttachments,
  useTicketComments, useTicketHistory, useToggleTask, useUploadAttachment,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { ActivityAuditItem, Attachment, Comment, TicketDetail, TicketStackScreenProps, TicketTaskEmbedded } from '@/types';
import { describeAudit } from '@/utils/activity';
import { confirmAction, notify, reportActionWriteError, reportWriteError } from '@/utils/dialogs';
import {
  effectiveResolveDue, formatBytes, formatDateTime, formatDisplayName, formatRelative, initials, sourceLabel,
} from '@/utils/format';
import {
  isCommentVisible, ticketDetailPermissions, ticketFieldPermissions, type ComposerMode, type MoreAction,
  type TicketDetailPermissions, type TicketFieldPermissions,
} from '@/utils/permissions';
import { requiresClosureForm, transitionTone, type StatusTransition } from '@/utils/ticket-rules';
import { deleteAttachmentMessage, statusChangeMessage } from '@/utils/writeCopy';
import {
  CategorySection, ClassificationSection, CountrySection, ResolutionSection, Row, usePropertyEditing, type PropertyEditing,
} from './TicketPropertyEditors';

type DetailTab = 'conversation' | 'history' | 'attachments' | 'tasks';

/** Labels for the role-gated buttons; WHICH ones show is decided by ticketDetailPermissions() alone. */
const MORE_ACTION_LABELS: Record<MoreAction, { label: string; description: string }> = {
  pickup: { label: 'Pick up', description: 'Assign this ticket to yourself' },
  assign: { label: 'Assign…', description: 'Choose a group and technician' },
  close: { label: 'Close…', description: 'Opens the closure form' },
  approval: { label: 'Submit for approval…', description: 'Choose who approves; the ticket moves to Pending with Management Review' },
};
const CONVERSATION_ACTIONS: Record<ComposerMode, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  reply: { label: 'Reply', icon: 'arrow-undo-outline' },
  replyAll: { label: 'Reply all', icon: 'arrow-undo-circle-outline' },
  note: { label: 'Note', icon: 'lock-closed-outline' },
};

/** Images (not SVG) open in the in-app viewer; PDFs and other types show their details only. */
function isViewableImage(mimeType: string): boolean {
  const type = (mimeType || '').toLowerCase();
  return type.startsWith('image/') && !type.startsWith('image/svg');
}

export function TicketDetailScreen({ navigation, route }: TicketStackScreenProps<'TicketDetail'>) {
  const { ticketId } = route.params;
  const user = useAuthStore((s) => s.user);
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
  const removeFile = useDeleteAttachment();
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
  // Property editors (G1): one open at a time, saved only on Save; leaving with unsaved changes asks first.
  const edit = usePropertyEditing(ticket);
  const writing = changeStatus.isPending || assign.isPending || edit.saving;

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

  // G3: permanent, so it asks first, naming the file (web: `confirm("Delete <fileName>?")`, :1346).
  async function deleteFile(attachment: Attachment) {
    const name = attachment.fileName || 'this file';
    const ok = await confirmAction({
      title: `Delete ${name}?`,
      message: deleteAttachmentMessage(name),
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeFile.mutateAsync({ ticketId, attachmentId: attachment.id });
      notify('Attachment deleted');
    } catch (e) {
      // Nothing was removed on the device, so there is nothing to revert; the list refetches.
      reportActionWriteError('Failed to delete attachment', 'delete files from a ticket', e);
    }
  }

  // ── Row state and handlers for the virtualised tab rows (Phase P) ──
  // Held here, not in the rows, so a row unmounted by the list (far off screen) comes back as it was left.
  const [expandedComments, setExpandedComments] = useState<ReadonlySet<string>>(() => new Set());
  const [openFileDetails, setOpenFileDetails] = useState<ReadonlySet<string>>(() => new Set());
  const toggleComment = useCallback((id: string) => setExpandedComments((prev) => toggledSet(prev, id)), []);
  const toggleFileDetails = useCallback((id: string) => setOpenFileDetails((prev) => toggledSet(prev, id)), []);
  // One identity for the screen's lifetime, so memoised rows re-render only when their own data changes.
  const viewImage = useCallback((a: Attachment) => setViewing(a), []);
  const openFile = useStableCallback((a: Attachment) => void once(() => openExternally(a)));
  const askDelete = useStableCallback((a: Attachment) => void once(() => deleteFile(a)));
  const openTask = useStableCallback((task: TicketTaskEmbedded) => navigation.navigate('TaskDetail', { ticketId, taskId: task.id }));
  const toggleTaskDone = useStableCallback((task: TicketTaskEmbedded) => void once(() => onToggleTask(task)));
  const contentStyle = useMemo(() => ({ paddingTop: 12, paddingBottom: insets.bottom + 24 }), [insets.bottom]);

  const title = ticket ? `Ticket #${ticket.ticketNumber}` : 'Ticket';

  if (!ticket) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="back" />
        <OfflineBanner />
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

  // Every role-gated element below reads these two objects (utils/permissions.ts, pinned per role by tests/rbac).
  const can = ticketDetailPermissions(user, ticket);
  const fields = ticketFieldPermissions(user, ticket);
  const moreActions: SheetOption<MoreAction>[] = can.moreActions.map((value) => ({ value, ...MORE_ACTION_LABELS[value] }));
  const onMore = (action: MoreAction) => {
    if (action === 'pickup') void once(pickUp);
    else if (action === 'assign') navigation.navigate('AssignPicker', { ticketIds: [ticket.id] });
    else if (action === 'approval') navigation.navigate('SubmitApproval', { ticketId: ticket.id });
    else navigation.navigate('StatusClosure', { ticketIds: [ticket.id], target: 'CLOSED' });
  };

  // ── The open tab: its placeholder or stale-data banner (in the list header) and its rows (virtualised) ──
  const tasks = Array.isArray(ticket.tasks) ? ticket.tasks : [];
  let body: TabBodyView;
  let rows: DetailRow[] = [];
  if (tab === 'conversation') {
    body = tabBodyView(comments, {
      what: 'The conversation',
      loading: 'comments',
      loadingRows: 2,
      errorTitle: "Couldn't load the conversation",
      isEmpty: (comments.data?.length ?? 0) === 0,
      empty: <EmptyState icon="chatbubbles-outline" title="No replies yet" message="Replies on this ticket will appear here." />,
    });
    if (body.showRows) rows = (comments.data ?? []).map((c) => ({ kind: 'comment', key: `c:${c.id}`, comment: c }));
  } else if (tab === 'history') {
    body = tabBodyView(
      // A failed "Load older history" is reported on its button, not as a "Couldn't refresh" banner.
      {
        data: history.data,
        error: history.isFetchNextPageError ? null : history.error,
        isError: history.isError && !history.isFetchNextPageError,
        fetchStatus: history.fetchStatus,
        refetch: history.refreshFirstPage,
      },
      {
        what: 'The history',
        loading: 'history',
        loadingRows: 4,
        errorTitle: "Couldn't load the history",
        isEmpty: history.audits.length === 0,
        empty: <EmptyState icon="time-outline" title="No history yet" message="Changes to this ticket will appear here." />,
      },
    );
    if (body.showRows) {
      rows = history.audits.map((a, i) => ({ kind: 'audit', key: `h:${a.id}`, audit: a, first: i === 0, last: i === history.audits.length - 1 }));
    }
  } else if (tab === 'attachments') {
    body = tabBodyView(attachments, {
      what: 'The attachment list',
      loading: 'attachments',
      loadingRows: 2,
      errorTitle: "Couldn't load the attachments",
      isEmpty: (attachments.data?.length ?? 0) === 0,
      empty: <EmptyState icon="attach-outline" title="No attachments" message="Files added to this ticket will appear here." />,
    });
    if (body.showRows) rows = (attachments.data ?? []).map((a) => ({ kind: 'attachment', key: `a:${a.id}`, attachment: a }));
  } else {
    // Tasks are embedded in TKT-3: no query of their own, so no loading or error state.
    body = {
      top: tasks.length === 0 ? <EmptyState icon="checkbox-outline" title="No tasks" message="Tasks added to this ticket will appear here." /> : null,
      showRows: tasks.length > 0,
    };
    rows = tasks.map((t, i) => ({ kind: 'task', key: `t:${t.id}`, task: t, first: i === 0, last: i === tasks.length - 1 }));
  }

  const togglingTaskId = toggleTask.isPending ? (toggleTask.variables?.taskId ?? null) : null;
  const renderRow: ListRenderItem<DetailRow> = ({ item }) => {
    switch (item.kind) {
      case 'comment':
        return (
          <CommentItem
            comment={item.comment}
            privateNotes={can.privateNotes}
            recipients={can.recipients}
            expanded={expandedComments.has(item.comment.id)}
            onToggleExpanded={toggleComment}
          />
        );
      case 'audit':
        return <AuditItem audit={item.audit} first={item.first} last={item.last} />;
      case 'attachment': {
        const a = item.attachment;
        return (
          <AttachmentRow
            attachment={a}
            onView={isViewableImage(a.mimeType) ? viewImage : undefined}
            onOpen={openFile}
            opening={openingId === a.id}
            // Staff, any file, any status (can.deleteAttachments); absent for END_USER.
            onDelete={can.deleteAttachments ? askDelete : undefined}
            deleting={removeFile.isPending && removeFile.variables?.attachmentId === a.id}
            busy={removeFile.isPending || upload.isPending}
            detailsOpen={openFileDetails.has(a.id)}
            onToggleDetails={toggleFileDetails}
          />
        );
      }
      case 'task':
        return (
          <TaskItem
            task={item.task}
            first={item.first}
            last={item.last}
            onOpen={openTask}
            onToggle={can.editTasks ? toggleTaskDone : undefined}
            toggling={togglingTaskId === item.task.id}
          />
        );
    }
  };

  const listHeader = (
    <>
      <HeaderCard ticket={ticket} can={can} />
      <StatusActionBar can={can} busy={writing} onTransition={(t) => void once(() => onTransition(t))} />

      <Card title="Description">
        <HtmlText html={ticket.description} emptyText="No description" />
      </Card>

      <PropertiesCard ticket={ticket} can={can} fields={fields} edit={edit} busy={writing} />
      <RequesterCard ticket={ticket} />
      <ResolutionSection ticket={ticket} can={fields} edit={edit} busy={writing} />

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
        // Reply: everyone. Reply all: staff. Note: ADMIN and AGENT only — not offered at all to END_USER or L2_MANAGER.
        <View className="mx-4 mb-3 flex-row gap-2">
          {can.conversationActions.map((mode) => (
            <ActionChip
              key={mode}
              icon={CONVERSATION_ACTIONS[mode].icon}
              label={CONVERSATION_ACTIONS[mode].label}
              onPress={() => navigation.navigate('ReplyComposer', { ticketId, mode })}
            />
          ))}
        </View>
      ) : null}

      {tab === 'attachments' && can.addAttachments ? (
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
      {tab === 'attachments' && !can.addAttachments ? (
        // A state, not a role limit (ROLE-MATRIX.md §3): say why "Add files" is missing instead of dropping it silently.
        <View className="mx-4 mb-3">
          <Notice>Closed and canceled tickets are locked for technicians, so files can't be added here.</Notice>
        </View>
      ) : null}
      {tab === 'tasks' && can.editTasks ? (
        <View className="mx-4 mb-3 flex-row">
          <ActionChip icon="add-circle-outline" label="Add task" onPress={() => navigation.navigate('TaskEditor', { ticketId })} />
        </View>
      ) : null}

      {body.top}
      {tab === 'attachments' && body.showRows ? (
        <Text className="mx-4 mb-2 text-xs text-gray-500">
          Tap an image to view it, or any other file to open or share it. Long-press for details.
        </Text>
      ) : null}
    </>
  );

  const listFooter =
    tab === 'history' && body.showRows && history.hasNextPage ? (
      <View className="mx-4">
        <OutlineButton
          label={
            offline
              ? 'Older history loads when you reconnect'
              : history.isFetchNextPageError
                ? "Couldn't load more — tap to retry"
                : 'Load older history'
          }
          onPress={() => void history.fetchNextPage()}
          loading={history.isFetchingNextPage}
          disabled={offline}
        />
      </View>
    ) : null;

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
              className="h-11 w-11 items-center justify-center rounded-full active:bg-gray-100"
            >
              {assign.isPending ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="ellipsis-vertical" size={24} color={colors.text.primary} />}
            </Pressable>
          ) : undefined
        }
      />
      <OfflineBanner />
      <QueryBanner error={ticketQuery.error} hasData onRetry={() => void onRefresh()} />
      <FlatList
        data={rows}
        keyExtractor={detailRowKey}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        // The header (ticket, properties, tabs) usually fills the first screen: a few rows are enough for the first
        // paint, and the rest are laid out in idle batches as they near the screen.
        initialNumToRender={6}
        // Was a ScrollView: keep its native handling of the header's text inputs (FlatList clips by default on Android).
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={contentStyle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      />

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
    <View className="flex-1">
      <OutlineButton icon={icon} label={label} onPress={onPress} compact />
    </View>
  );
}

// ── Header ───────────────────────────────────────────────────

function HeaderCard({ ticket, can }: { ticket: TicketDetail; can: TicketDetailPermissions }) {
  // "Auto" pill when the server computed priority from impact × urgency (05 §A.3, staff).
  const autoPriority = can.classification && !!ticket.impact && !!ticket.urgency;
  const attachmentCount = ticket._count?.attachments ?? 0;
  return (
    <Card>
      <View className="mb-1 flex-row items-center">
        <Text className="text-xs font-semibold text-gray-500">#{ticket.ticketNumber}</Text>
        <View className="ml-2 rounded-full px-2.5 py-0.5" style={{ backgroundColor: colors.badgeFallback.bg }}>
          <Text className="text-xs font-medium" style={{ color: colors.badgeFallback.fg }}>{sourceLabel(ticket.source)}</Text>
        </View>
      </View>
      <Text selectable className="text-lg font-bold text-gray-900">
        {ticket.title || '(no subject)'}
      </Text>
      <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
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
  can, busy, onTransition,
}: {
  can: TicketDetailPermissions;
  busy: boolean;
  onTransition: (t: StatusTransition) => void;
}) {
  if (!can.statusBar) return null;
  const { locked, transitions } = can;
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
              className={`min-h-11 justify-center rounded-lg border px-4 ${toneClass[transitionTone(t.target)]} ${busy ? 'opacity-50' : 'active:opacity-70'}`}
            >
              <Text className="text-sm font-medium text-gray-900">{t.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text className="text-sm text-gray-700">
          {locked ? 'Closed and canceled tickets are locked for technicians.' : 'No status changes are available from this status.'}
        </Text>
      )}
      {busy ? <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} /> : null}
    </Card>
  );
}

// ── Properties ───────────────────────────────────────────────

/**
 * Impact / urgency (hidden for END_USER, 05 §A.3), category and country each come with their editor or lock reason
 * from ticketFieldPermissions(); group and technician change through Assign (M7), so they are read-only here.
 */
function PropertiesCard({
  ticket, can, fields, edit, busy,
}: {
  ticket: TicketDetail;
  can: TicketDetailPermissions;
  fields: TicketFieldPermissions;
  edit: PropertyEditing;
  busy: boolean;
}) {
  const resolveBy = effectiveResolveDue(ticket);
  const technician = formatDisplayName(ticket.assignedTo?.displayName);
  const section = { ticket, can: fields, edit, busy };
  return (
    <Card title="Properties">
      <ClassificationSection {...section} />
      <CategorySection {...section} />
      <Row label="Group">{ticket.team?.name ?? 'Not set'}</Row>
      <Row label="Technician">{technician || 'Unassigned'}</Row>
      <CountrySection {...section} />
      <Row label="Resolve by">{resolveBy ? formatDateTime(resolveBy) : 'No SLA'}</Row>
      {ticket.slaHoldStartedAt ? <Row label="SLA paused">{`Since ${formatDateTime(ticket.slaHoldStartedAt)}`}</Row> : null}
      {can.classification ? (
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
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Text className="text-sm font-semibold text-primary">{initials(r?.displayName)}</Text>
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-sm font-semibold text-gray-900">{name}</Text>
          {r?.email ? <Text selectable className="text-xs text-gray-500">{r.email}</Text> : null}
          {r?.phone ? <Text selectable className="text-xs text-gray-500">{r.phone}</Text> : null}
          {r?.department ? <Text className="text-xs text-gray-500">{r.department}</Text> : null}
        </View>
      </View>
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
  // Segmented control (UI-STANDARDS S5): 44 dp tabs on a grey track; the active tab is white. Labels shrink a little,
  // then wrap to a second line, so nothing is cut off at 360 dp or with large text.
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
            className={`min-h-11 flex-1 items-center justify-center rounded-lg px-1 ${active ? 'bg-white' : ''}`}
          >
            <Text
              className={`text-center text-xs ${active ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
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

/** What the open tab shows above its rows: a first-load placeholder, or a stale-data banner; and whether rows show. */
interface TabBodyView {
  top: ReactNode;
  showRows: boolean;
}

/** Loading / offline / error / empty / rows for one tab, plus a stale-data banner when a refresh failed. */
function tabBodyView(
  query: TabQueryState,
  {
    what, loading, loadingRows, errorTitle, isEmpty, empty,
  }: {
    /** For the offline message, e.g. "The conversation". */
    what: string;
    /** The skeleton that mirrors this tab's rows. */
    loading: ComponentProps<typeof LoadingSkeleton>['variant'];
    loadingRows: number;
    errorTitle: string;
    isEmpty: boolean;
    empty: ReactElement;
  },
): TabBodyView {
  const hasData = query.data !== undefined;
  if (!hasData && query.fetchStatus === 'paused') return { top: <OfflineState what={what} />, showRows: false };
  if (!hasData && query.isError) {
    return { top: <ErrorState error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />, showRows: false };
  }
  if (!hasData) return { top: <LoadingSkeleton variant={loading} rows={loadingRows} topGap={false} />, showRows: false };
  const banner = query.isError ? (
    <View className="mx-4 mb-3 overflow-hidden rounded-lg">
      <QueryBanner error={query.error} hasData onRetry={() => void query.refetch()} />
    </View>
  ) : null;
  return {
    top: (
      <>
        {banner}
        {isEmpty ? empty : null}
      </>
    ),
    showRows: !isEmpty,
  };
}

/** One row of the open tab (Phase P: the tab body is virtualised). Keys are unique across tabs. */
type DetailRow =
  | { kind: 'comment'; key: string; comment: Comment }
  | { kind: 'audit'; key: string; audit: ActivityAuditItem; first: boolean; last: boolean }
  | { kind: 'attachment'; key: string; attachment: Attachment }
  | { kind: 'task'; key: string; task: TicketTaskEmbedded; first: boolean; last: boolean };

const detailRowKey = (row: DetailRow) => row.key;

function toggledSet(prev: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * A group of rows that looks like one `Card flush` (Card.tsx): each row is its own list item, so the first and the
 * last carry the card's top and bottom edge (the standalone task list does the same).
 */
function CardRow({ first, last, children }: { first: boolean; last: boolean; children: ReactNode }) {
  return (
    <View className={`mx-4 border-x border-border bg-white px-4 ${first ? 'rounded-t-xl border-t' : ''} ${last ? 'mb-3 rounded-b-xl border-b' : ''}`}>
      {children}
    </View>
  );
}

const CommentItem = memo(function CommentItem({
  comment, privateNotes, recipients, expanded, onToggleExpanded,
}: {
  comment: Comment;
  /** can.privateNotes and can.recipients (ticketDetailPermissions), passed as values so the row can be memoised. */
  privateNotes: boolean;
  recipients: boolean;
  expanded: boolean;
  onToggleExpanded: (commentId: string) => void;
}) {
  const isPrivate = comment.type === 'PRIVATE';
  // visibleComments() already dropped notes for END_USER/L2; this is a second guard at the point of display.
  if (!isCommentVisible(comment, { privateNotes })) return null;
  const author = formatDisplayName(comment.author?.displayName) || 'Unknown';
  const to = Array.isArray(comment.toRecipients) ? comment.toRecipients : [];
  const cc = Array.isArray(comment.ccRecipients) ? comment.ccRecipients : [];
  const files = Array.isArray(comment.attachments) ? comment.attachments : [];

  // The standard card; a private note is the same card tinted amber.
  return (
    <View className={`mx-4 mb-3 rounded-xl border p-4 ${isPrivate ? 'border-amber-200 bg-amber-50' : 'border-border bg-white'}`}>
      <View className="mb-2 flex-row items-center">
        <View className={`h-8 w-8 items-center justify-center rounded-full ${isPrivate ? 'bg-amber-200' : 'bg-primary/10'}`}>
          <Text className={`text-xs font-semibold ${isPrivate ? 'text-amber-900' : 'text-primary'}`}>{initials(comment.author?.displayName)}</Text>
        </View>
        <View className="ml-2 flex-1">
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{author}</Text>
          <Text className="text-xs text-gray-500">
            {formatDateTime(comment.createdAt)} · {formatRelative(comment.createdAt)}
            {comment.isEdited ? ' · edited' : ''}
          </Text>
        </View>
        {isPrivate ? (
          <View className="ml-2 flex-row items-center rounded-full bg-amber-200 px-2.5 py-0.5">
            <Ionicons name="lock-closed" size={12} color={palette.amber[900]} />
            <Text className="ml-1 text-xs font-semibold text-amber-900">Private note</Text>
          </View>
        ) : null}
      </View>

      {/* Recipient addresses: staff only, public replies only (05 §A.5). */}
      {recipients && !isPrivate && (to.length > 0 || cc.length > 0) ? (
        <Text className="mb-2 text-xs text-gray-500" numberOfLines={2}>
          {to.length > 0 ? `To: ${to.join(', ')}` : ''}
          {to.length > 0 && cc.length > 0 ? '  ·  ' : ''}
          {cc.length > 0 ? `Cc: ${cc.join(', ')}` : ''}
        </Text>
      ) : null}

      <HtmlText html={comment.body} emptyText="(no text)" expanded={expanded} onToggleExpanded={() => onToggleExpanded(comment.id)} />

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
});

const AuditItem = memo(function AuditItem({ audit, first, last }: { audit: ActivityAuditItem; first: boolean; last: boolean }) {
  const { actor, action } = describeAudit(audit);
  return (
    <CardRow first={first} last={last}>
      <View className={`flex-row py-3 ${last ? '' : 'border-b border-gray-100'}`}>
        <View className="mr-3 mt-1.5 h-2 w-2 rounded-full bg-gray-300" />
        <View className="flex-1">
          <Text className="text-sm text-gray-700">
            <Text className="font-semibold">{actor}</Text> {action}
          </Text>
          <Text className="mt-0.5 text-xs text-gray-500">{formatDateTime(audit.createdAt)}</Text>
        </View>
      </View>
    </CardRow>
  );
});

function attachmentIcon(mimeType: string): keyof typeof Ionicons.glyphMap {
  const type = (mimeType || '').toLowerCase();
  if (type.startsWith('image/')) return 'image-outline';
  if (type === 'application/pdf') return 'document-text-outline';
  return 'document-outline';
}

/**
 * Tap: images open in the in-app viewer (ATT-3); every other type — PDFs included — downloads (ATT-4) and opens the
 * system share sheet. Long-press: details. `storagePath` (a server disk path) is never displayed (03 B.4).
 * `onDelete` (G3) adds a 44 dp delete button; it is passed only for a role that may delete (can.deleteAttachments).
 * Memoised (Phase P): the handlers take the file, so they keep one identity and only a changed row re-renders.
 */
const AttachmentRow = memo(function AttachmentRow({
  attachment, onView, onOpen, opening, onDelete, deleting = false, busy = false, detailsOpen, onToggleDetails,
}: {
  attachment: Attachment;
  onView?: (attachment: Attachment) => void;
  onOpen: (attachment: Attachment) => void;
  opening: boolean;
  onDelete?: (attachment: Attachment) => void;
  deleting?: boolean;
  /** Another file write is in flight: the delete button is disabled. */
  busy?: boolean;
  /** The long-press details; held by the screen so they survive the row scrolling out of the list's window. */
  detailsOpen: boolean;
  onToggleDetails: (attachmentId: string) => void;
}) {
  const name = attachment.fileName || 'Unnamed file';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: opening || deleting, expanded: detailsOpen }}
      accessibilityHint={onView ? 'Opens the image. Long-press for details' : 'Downloads the file and opens the share sheet. Long-press for details'}
      disabled={opening || deleting}
      onPress={() => (onView ?? onOpen)(attachment)}
      onLongPress={() => onToggleDetails(attachment.id)}
      className="mx-4 mb-3 rounded-xl border border-border bg-white p-4 active:bg-gray-50"
    >
      <View className="flex-row items-center">
        <Ionicons name={attachmentIcon(attachment.mimeType)} size={20} color={palette.gray[600]} />
        <View className="ml-3 flex-1">
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{name}</Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {formatBytes(attachment.sizeBytes)} · {attachment.mimeType || 'unknown type'}
          </Text>
        </View>
        {opening ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Ionicons name={onView ? 'eye-outline' : 'open-outline'} size={18} color={colors.text.secondary} />
        )}
        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${name}`}
            accessibilityHint="Asks you to confirm. Deleting can't be undone"
            accessibilityState={{ disabled: busy || opening, busy: deleting }}
            disabled={busy || opening}
            onPress={() => onDelete(attachment)}
            className={`-my-2 -mr-2 ml-1 h-11 w-11 items-center justify-center rounded-full ${busy || opening ? 'opacity-50' : 'active:bg-red-50'}`}
          >
            {deleting ? <ActivityIndicator color={palette.red[700]} /> : <Ionicons name="trash-outline" size={18} color={palette.red[700]} />}
          </Pressable>
        ) : null}
      </View>
      {detailsOpen ? (
        <View className="mt-2 border-t border-gray-100 pt-1">
          <Row label="Uploaded by">{formatDisplayName(attachment.uploaderName) || 'Unknown'}</Row>
          <Row label="Uploaded">{formatDateTime(attachment.createdAt)}</Row>
          <Row label="Type">{attachment.mimeType || 'Unknown'}</Row>
          <Row label="Size">{formatBytes(attachment.sizeBytes)}</Row>
          <Row label="Added with">{attachment.commentId ? 'A reply' : 'The ticket'}</Row>
          <Pressable accessibilityRole="button" disabled={opening} onPress={() => onOpen(attachment)} className="mt-1 min-h-11 justify-center self-start">
            <Text className="text-sm font-medium text-blue-700">Download and share</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
});

/**
 * A task embedded in TKT-3, in sortOrder: one row of the Tasks tab's card. Tap → task detail (every role). Staff:
 * the checkbox (TSK-3; `onToggle` is passed only for them). END_USER sees the same rows without the checkbox (D4).
 */
const TaskItem = memo(function TaskItem({
  task, first, last, onOpen, onToggle, toggling,
}: {
  task: TicketTaskEmbedded;
  first: boolean;
  last: boolean;
  onOpen: (task: TicketTaskEmbedded) => void;
  onToggle?: (task: TicketTaskEmbedded) => void;
  toggling: boolean;
}) {
  return (
    <CardRow first={first} last={last}>
      <TaskRow
        task={task}
        onPress={() => onOpen(task)}
        onToggle={onToggle ? () => onToggle(task) : undefined}
        toggling={toggling}
        last={last}
      />
    </CardRow>
  );
});
