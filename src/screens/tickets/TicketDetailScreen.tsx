// M4 Ticket detail (04 §2.1 M4). Phase 3a: READ-ONLY, live data.
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
// NOT IN PHASE 3a (Phase 3b): status changes (the bar below is a disabled preview), reply/note, assign, pick up,
// field edits, task edits, and opening or downloading attachments. PUT /tickets/:id is never used for status.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EmptyState, ErrorState, HtmlText, LoadingSkeleton, PriorityBadge, QueryBanner, ScreenHeader, SlaBadge, StatusBadge,
} from '@/components';
import { useTicket, useTicketAttachments, useTicketComments, useTicketHistory } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import type {
  ActivityAuditItem, Attachment, Comment, TicketDetail, TicketImpact, TicketStackScreenProps, TicketTaskEmbedded,
  TicketUrgency, UserRole,
} from '@/types';
import { canSeePrivateNotes, describeAudit } from '@/utils/activity';
import {
  IMPACT_LABELS, TASK_STATUS_LABELS, URGENCY_LABELS, categoryCascade, effectiveResolveDue, formatBytes, formatDate,
  formatDateTime, formatDisplayName, formatRelative, initials, sourceLabel,
} from '@/utils/format';
import { isStaff } from '@/utils/roles';
import { canChangeStatus, getAvailableTransitions, isResolvedLocked, transitionTone } from '@/utils/ticket-rules';

type DetailTab = 'conversation' | 'history' | 'attachments' | 'tasks';

export function TicketDetailScreen({ route }: TicketStackScreenProps<'TicketDetail'>) {
  const { ticketId } = route.params;
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
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

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
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

  const title = ticket ? `Ticket #${ticket.ticketNumber}` : 'Ticket';

  if (!ticket) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title={title} variant="back" />
        {ticketQuery.isError ? (
          <ErrorState error={ticketQuery.error} title="Couldn't load this ticket" onRetry={() => void ticketQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="detail" />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title={title} variant="back" />
      <QueryBanner error={ticketQuery.error} hasData onRetry={() => void onRefresh()} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
      >
        <HeaderCard ticket={ticket} role={role} />
        <StatusActionBar ticket={ticket} role={role} />

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
          <TabBody
            query={comments}
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
              isPending: history.isPending,
              isError: history.isError && !history.isFetchNextPageError,
              refetch: history.refreshFirstPage,
            }}
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
                disabled={history.isFetchingNextPage}
                onPress={() => void history.fetchNextPage()}
                className="mx-4 mt-3 items-center rounded-lg border border-gray-300 bg-white py-2.5"
              >
                {history.isFetchingNextPage ? (
                  <ActivityIndicator color="#2563eb" />
                ) : (
                  <Text className="text-sm font-medium text-gray-800">
                    {history.isFetchNextPageError ? "Couldn't load more — tap to retry" : 'Load older history'}
                  </Text>
                )}
              </Pressable>
            ) : null}
          </TabBody>
        ) : null}

        {tab === 'attachments' ? (
          <TabBody
            query={attachments}
            loadingRows={2}
            errorTitle="Couldn't load the attachments"
            isEmpty={(attachments.data?.length ?? 0) === 0}
            empty={<EmptyState icon="attach-outline" title="No attachments" message="Files added to this ticket will appear here." />}
          >
            <Text className="mx-4 mb-2 text-xs text-gray-500">Tap a file for its details. Opening and downloading files arrive in Phase 3b.</Text>
            {(attachments.data ?? []).map((a) => (
              <AttachmentRow key={a.id} attachment={a} />
            ))}
          </TabBody>
        ) : null}

        {tab === 'tasks' ? <TasksTab tasks={Array.isArray(ticket.tasks) ? ticket.tasks : []} /> : null}
      </ScrollView>
    </View>
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
        <Ionicons name="attach" size={14} color="#6b7280" />
        <Text className="ml-1 text-xs text-gray-500">
          {attachmentCount} {attachmentCount === 1 ? 'attachment' : 'attachments'}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Status bar (05 §A.1) as a DISABLED preview: the transition map for this role and status, nothing pressable.
 * Hidden for END_USER; empty for AGENT on CLOSED/CANCELED. Status changes are Phase 3b (TKT-6 only, never PUT).
 */
function StatusActionBar({ ticket, role }: { ticket: TicketDetail; role: UserRole }) {
  if (!canChangeStatus(role)) return null;
  const locked = isResolvedLocked(role, ticket.status);
  const transitions = getAvailableTransitions(role, ticket.status);
  const toneClass = { success: 'border-green-300 bg-green-50', muted: 'border-gray-300 bg-gray-100', neutral: 'border-gray-300 bg-white' } as const;

  return (
    <Card title="Change status">
      {transitions.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {transitions.map((t) => (
            <Pressable
              key={t.target}
              disabled
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityHint="Available in Phase 3b"
              className={`rounded-lg border px-3 py-2 opacity-50 ${toneClass[transitionTone(t.target)]}`}
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
      <View className="mt-3 flex-row items-center rounded-md bg-blue-50 px-2 py-1.5">
        <Ionicons name="information-circle-outline" size={14} color="#1d4ed8" />
        <Text className="ml-1 flex-1 text-xs text-blue-800">Read-only preview. Changing status arrives in Phase 3b.</Text>
      </View>
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
      {ticket.resolution ? <HtmlText html={ticket.resolution} collapsedLines={6} /> : <Text className="text-sm text-gray-500">No resolution recorded</Text>}
      <View className="mt-2">
        <Row label="Closure code">{ticket.closureCode || 'Not set'}</Row>
        <Row label="First call fix">{ticket.isFcr ? 'Yes' : 'No'}</Row>
        {ticket.resolvedAt ? <Row label="Resolved">{formatDateTime(ticket.resolvedAt)}</Row> : null}
        {ticket.closedAt ? <Row label="Closed">{formatDateTime(ticket.closedAt)}</Row> : null}
      </View>
      {ticket.closureComments ? (
        <View className="mt-2">
          <Text className="mb-1 text-xs font-semibold text-gray-500">Closure comments</Text>
          <HtmlText html={ticket.closureComments} collapsedLines={6} />
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
  isPending: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

/** Loading / error / empty / content for one tab, plus the offline-or-stale banner when data is on screen. */
function TabBody({
  query, loadingRows, errorTitle, isEmpty, empty, children,
}: {
  query: TabQueryState;
  loadingRows: number;
  errorTitle: string;
  isEmpty: boolean;
  empty: ReactNode;
  children: ReactNode;
}) {
  const hasData = query.data !== undefined;
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
            <Ionicons name="lock-closed" size={10} color="#78350f" />
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
              <Ionicons name="attach" size={14} color="#6b7280" />
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

/** Metadata only. `storagePath` (a server disk path) is never displayed (03 B.4). */
function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen((v) => !v)}
      className="mx-4 mb-2 rounded-xl bg-white p-3 active:bg-gray-50"
    >
      <View className="flex-row items-center">
        <Ionicons name={attachmentIcon(attachment.mimeType)} size={22} color="#4b5563" />
        <View className="ml-3 flex-1">
          <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>{attachment.fileName || 'Unnamed file'}</Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {formatBytes(attachment.sizeBytes)} · {attachment.mimeType || 'unknown type'}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
      </View>
      {open ? (
        <View className="mt-2 border-t border-gray-100 pt-1">
          <Row label="Uploaded by">{formatDisplayName(attachment.uploaderName) || 'Unknown'}</Row>
          <Row label="Uploaded">{formatDateTime(attachment.createdAt)}</Row>
          <Row label="Type">{attachment.mimeType || 'Unknown'}</Row>
          <Row label="Size">{formatBytes(attachment.sizeBytes)}</Row>
          <Row label="Added with">{attachment.commentId ? 'A reply' : 'The ticket'}</Row>
        </View>
      ) : null}
    </Pressable>
  );
}

const TASK_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  OPEN: { name: 'ellipse-outline', color: '#6b7280' },
  IN_PROGRESS: { name: 'time-outline', color: '#ca8a04' },
  COMPLETED: { name: 'checkmark-circle', color: '#16a34a' },
  CANCELLED: { name: 'close-circle-outline', color: '#9ca3af' },
};

/** Read-only for every role in Phase 3a (no toggling). Tasks come embedded in TKT-3, ordered by sortOrder. */
function TasksTab({ tasks }: { tasks: readonly TicketTaskEmbedded[] }) {
  if (tasks.length === 0) {
    return <EmptyState icon="checkbox-outline" title="No tasks" message="Tasks added to this ticket will appear here." />;
  }
  return (
    <View className="mx-4 rounded-xl bg-white px-4 py-1">
      {tasks.map((task) => {
        const icon = TASK_ICONS[task.status] ?? TASK_ICONS.OPEN!;
        const label = (TASK_STATUS_LABELS as Record<string, string>)[task.status] ?? task.status;
        const assignee = formatDisplayName(task.assignedTo?.displayName);
        return (
          <View key={task.id} className="flex-row border-b border-gray-100 py-3">
            <Ionicons name={icon.name} size={20} color={icon.color} />
            <View className="ml-3 flex-1">
              <Text className={`text-sm font-medium ${task.status === 'COMPLETED' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                {task.title}
              </Text>
              {task.description ? <Text className="mt-0.5 text-xs text-gray-600">{task.description}</Text> : null}
              <Text className="mt-1 text-xs text-gray-500">
                {label}
                {assignee ? ` · ${assignee}` : ' · Unassigned'}
                {task.dueDate ? ` · Due ${formatDate(task.dueDate)}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
