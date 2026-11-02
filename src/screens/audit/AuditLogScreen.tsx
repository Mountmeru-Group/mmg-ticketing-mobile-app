// M20 Audit log (G8, ADMIN only): AUD-1, newest first. The web portal's /audit-log table, as cards for a 390 dp phone.
// Web and server behaviour, with sources: docs/G8-WEB-AUDIT.md.
// - Gate: the route is registered for ADMIN alone (utils/permissions.ts canViewAuditLog, drawerRoutes), useAuditLog
//   sends AUD-1 for ADMIN only, and the server answers 403 to every other role (auditLog.router.ts:8).
// - Layout: a heading per day ("Today", "Yesterday", "Mon 02 Nov 2026"), then one card per entry: the action pill, the
//   entity and time, the ticket number (a link, through the deep-link resolver), the person and their email, and the
//   details in a tinted box (utils/audit-log.ts formatAuditDetails). Never the IP address the row carries.
// - Filters: every one is a server-side AUD-1 param, and they combine in one request (auditLog.controller.ts:7-13):
//     Entity type → entityType=Ticket | Comment | Attachment (exact match)
//     Ticket      → ticketId=<id>; the search box takes a ticket number, resolved to its id by TKT-1 as the deep-link
//                   resolver does (there is no ticket-number param)
//     Person      → actorId=<user id>, picked with USR-3 (active users only)
//   The endpoint has NO action, date or free-text filter (G8 §2, §6), so the app offers none: filtering a page on the
//   device would show a partial answer as if it were the whole one.
// - Memory: capped at 500 entries (useAuditLog), with the ticket list's "search or filter to narrow" footer.
// - No polling; pull-to-refresh reloads the first page only.
import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, FilterChip, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR, OfflineBanner,
  OfflineState, OptionSheet, PersonPickerSheet, QueryBanner, ScreenHeader, SearchField, type Person, type SheetOption,
} from '@/components';
import { findTicketIdByNumber, queryKeys, useAuditLog } from '@/hooks';
import { openTicketLinkInApp } from '@/navigation/navigationRef';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette, type AuditActionTone } from '@/theme';
import type { AppDrawerScreenProps, AuditAction, AuditLogEntry, UserRole } from '@/types';
import {
  AUDIT_ENTITY_TYPES, NO_AUDIT_FILTERS, activeAuditFilterCount, auditActionLabel, auditListRows, auditTicketLink, auditTime,
  formatAuditDetails, isKnownAuditAction, parseAuditTicketNumber, type AuditEntityType, type AuditListRow,
  type AuditLogFilters,
} from '@/utils/audit-log';
import { formatDisplayName } from '@/utils/format';
import { canViewAuditLog } from '@/utils/permissions';

const ALL_TYPES = '__ALL__';
/** USR-3 for every role: anyone can appear in the log, requesters included. */
const EVERY_ROLE: readonly UserRole[] = [];

const ENTITY_DESCRIPTIONS: Record<AuditEntityType, string> = {
  Ticket: 'Created, changed, assigned, status changes (not automatic closes)',
  Comment: 'Public replies and private notes',
  Attachment: 'Files added',
};
const ENTITY_OPTIONS: readonly SheetOption<string>[] = [
  { value: ALL_TYPES, label: 'All types' },
  ...AUDIT_ENTITY_TYPES.map((t) => ({ value: t, label: t, description: ENTITY_DESCRIPTIONS[t] })),
];

/** One icon per action, so a pill never relies on its colour (docs/brand/UI-STANDARDS.md §13). */
const ACTION_ICONS: Record<AuditAction, keyof typeof Ionicons.glyphMap> = {
  CREATED: 'add-circle-outline',
  UPDATED: 'create-outline',
  DELETED: 'trash-outline',
  STATUS_CHANGED: 'swap-horizontal-outline',
  ASSIGNED: 'person-add-outline',
  COMMENTED: 'chatbubble-outline',
  ATTACHMENT_ADDED: 'attach-outline',
  SLA_BREACHED: 'alarm-outline',
  ESCALATED: 'trending-up-outline',
};

/** The ticket search: idle, or the state of the last ticket-number lookup. */
type TicketLookup =
  | { state: 'idle' }
  | { state: 'busy' | 'none' | 'offline' | 'error'; ticketNumber: number }
  | { state: 'invalid' };

const rowKey = (row: AuditListRow) => row.key;
const rowType = (row: AuditListRow) => row.kind;

function countText(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${n === 1 ? 'entry' : 'entries'}`;
}

export function AuditLogScreen(_props: AppDrawerScreenProps<'AuditLog'>) {
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const offline = useIsOffline();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<AuditLogFilters>(NO_AUDIT_FILTERS);
  const [searchText, setSearchText] = useState('');
  const [lookup, setLookup] = useState<TicketLookup>({ state: 'idle' });
  const [sheet, setSheet] = useState<'entity' | 'person' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Each ticket search gets a number; an answer that comes back after a newer search, or a clear, is dropped.
  const attempt = useRef(0);

  const list = useAuditLog(filters);
  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = list;
  const hasData = list.data !== undefined;
  const rows = useMemo(() => auditListRows(list.entries), [list.entries]);
  const activeCount = activeAuditFilterCount(filters);

  const onRefresh = useCallback(async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await refreshFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [offline, refreshFirstPage]);

  // Guarded as the ticket list's: the 500-entry cap ends hasNextPage, so nothing loads past it.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !refreshing && !offline) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, refreshing, offline, fetchNextPage]);

  // ── Ticket search: a number → its id (TKT-1) → ticketId ─────
  const clearTicket = () => {
    attempt.current += 1;
    setSearchText('');
    setLookup({ state: 'idle' });
    setFilters((f) => (f.ticket ? { ...f, ticket: null } : f));
  };
  const onChangeSearch = (text: string) => {
    setSearchText(text);
    if (lookup.state !== 'idle' && lookup.state !== 'busy') setLookup({ state: 'idle' });
  };
  async function submitSearch() {
    const text = searchText.trim();
    if (!text) {
      clearTicket();
      return;
    }
    const ticketNumber = parseAuditTicketNumber(text);
    if (ticketNumber === null) {
      setLookup({ state: 'invalid' });
      return;
    }
    if (filters.ticket?.ticketNumber === ticketNumber) return;
    if (offline) {
      setLookup({ state: 'offline', ticketNumber });
      return;
    }
    const mine = ++attempt.current;
    setLookup({ state: 'busy', ticketNumber });
    try {
      const found = await queryClient.fetchQuery({
        queryKey: queryKeys.auditLog.ticket(ticketNumber),
        queryFn: () => findTicketIdByNumber(role, ticketNumber),
      });
      if (mine !== attempt.current) return;
      if (found) {
        setFilters((f) => ({ ...f, ticket: found }));
        setLookup({ state: 'idle' });
      } else {
        setLookup({ state: 'none', ticketNumber });
      }
    } catch {
      if (mine === attempt.current) setLookup({ state: 'error', ticketNumber });
    }
  }

  const clearAll = () => {
    clearTicket();
    setFilters(NO_AUDIT_FILTERS);
  };

  const personOptions = useMemo(
    () => (filters.person ? [{ key: 'anyone', label: 'Anyone', onPress: () => {
      setFilters((f) => ({ ...f, person: null }));
      setSheet(null);
    } }] : []),
    [filters.person],
  );
  const pickPerson = useCallback((p: Person) => {
    setFilters((f) => ({ ...f, person: { id: p.id, displayName: p.displayName } }));
    setSheet(null);
  }, []);

  const openTicket = useCallback((link: string) => {
    openTicketLinkInApp(link);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: AuditListRow; index: number }) =>
      item.kind === 'day' ? (
        <Text accessibilityRole="header" className="px-4 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {item.label}
        </Text>
      ) : (
        <ListEntry index={index}>
          <AuditCard entry={item.entry} onOpenTicket={openTicket} />
        </ListEntry>
      ),
    [openTicket],
  );

  const contentStyle = useMemo(() => ({ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }), [insets.bottom]);

  // Unreachable for anyone else (the route is not registered for them); kept so this screen can never send AUD-1 or
  // show the log to a role the server would refuse.
  if (!canViewAuditLog(role)) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="Audit log" variant="back" />
        <EmptyState icon="lock-closed-outline" title="Admins only" message="The audit log is available to administrators." />
      </View>
    );
  }

  let content: ReactNode;
  if (!hasData && list.fetchStatus === 'paused') {
    content = <OfflineState what="The audit log" />;
  } else if (list.isPending && !hasData) {
    content = <LoadingSkeleton variant="audit" rows={4} />;
  } else if (list.isError && !hasData) {
    content = <ErrorState error={list.error} title="Couldn't load the audit log" onRetry={() => void list.refetch()} />;
  } else {
    content = (
      <FlashList
        data={rows}
        keyExtractor={rowKey}
        getItemType={rowType}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={contentStyle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          activeCount > 0 ? (
            <EmptyState
              illustration="empty"
              title="No entries match these filters"
              message="Every filter applies at once. Try fewer filters. Pull down to refresh."
              actionLabel="Clear all filters"
              onAction={clearAll}
            />
          ) : (
            <EmptyState
              illustration="empty"
              title="No audit entries yet"
              message="Ticket changes, replies and files will appear here as they happen. Pull down to refresh."
            />
          )
        }
        ListFooterComponent={
          <AuditListFooter
            count={list.entries.length}
            total={list.total}
            capped={list.capped}
            loading={isFetchingNextPage}
            failed={isFetchNextPageError && !offline}
            hasMore={!!hasNextPage}
            offline={offline}
            onRetry={() => void fetchNextPage()}
          />
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Audit log" variant="back" />
      <OfflineBanner />

      <View className="border-b border-border bg-white px-4 py-2">
        <SearchField
          value={searchText}
          onChangeText={onChangeSearch}
          onClear={clearTicket}
          onSubmitEditing={() => void submitSearch()}
          returnKeyType="search"
          placeholder="Ticket number, e.g. 1234"
          accessibilityLabel="Filter by ticket number"
        />
        <LookupLine lookup={lookup} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2"
          contentContainerClassName="gap-2 py-1"
          keyboardShouldPersistTaps="handled"
        >
          {filters.ticket ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ticket #${filters.ticket.ticketNumber}. Clear the ticket filter`}
              onPress={clearTicket}
              hitSlop={4}
              className="h-9 flex-row items-center rounded-full border border-primary bg-primary px-3 active:opacity-80"
            >
              <Ionicons name="ticket-outline" size={14} color={colors.primaryForeground} />
              <Text className="ml-1 text-sm font-medium text-primary-foreground">#{filters.ticket.ticketNumber}</Text>
              <Ionicons name="close" size={14} color={colors.primaryForeground} style={{ marginLeft: 4 }} />
            </Pressable>
          ) : null}
          <FilterChip
            role="button"
            icon="pricetag-outline"
            label={filters.entityType ?? 'All types'}
            active={!!filters.entityType}
            onPress={() => setSheet('entity')}
          />
          <FilterChip
            role="button"
            icon="person-outline"
            label={filters.person ? formatDisplayName(filters.person.displayName) || 'Person' : 'Person'}
            active={!!filters.person}
            onPress={() => setSheet('person')}
          />
        </ScrollView>

        <View className="mt-1 min-h-9 flex-row items-center">
          <Text className="flex-1 text-xs text-gray-500">{list.total !== undefined ? countText(list.total) : ' '}</Text>
          {activeCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              onPress={clearAll}
              className="min-h-11 justify-center pl-3 active:opacity-60"
            >
              <Text className="text-sm font-medium text-blue-700">Clear all</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <QueryBanner error={isFetchNextPageError ? null : list.error} hasData={hasData} onRetry={() => void onRefresh()} />

      <ListEntryScope>{content}</ListEntryScope>

      <OptionSheet
        visible={sheet === 'entity'}
        title="Entity type"
        options={ENTITY_OPTIONS}
        selected={filters.entityType ?? ALL_TYPES}
        onSelect={(value) =>
          setFilters((f) => ({ ...f, entityType: value === ALL_TYPES ? null : (value as AuditEntityType) }))
        }
        onClose={() => setSheet(null)}
      />
      <PersonPickerSheet
        visible={sheet === 'person'}
        title="Person"
        searchRoles={EVERY_ROLE}
        extraOptions={personOptions}
        onPick={pickPerson}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

/** Under the search box: what the last ticket-number search found, or why it found nothing. */
function LookupLine({ lookup }: { lookup: TicketLookup }) {
  if (lookup.state === 'idle') return null;
  if (lookup.state === 'busy') {
    return (
      <View accessibilityLiveRegion="polite" className="mt-2 flex-row items-center">
        <ActivityIndicator size="small" color={colors.primary} />
        <Text className="ml-2 text-xs text-gray-500">Finding ticket #{lookup.ticketNumber}…</Text>
      </View>
    );
  }
  const text =
    lookup.state === 'invalid'
      ? 'Search takes a ticket number, like 1234. To see one person’s entries, tap Person.'
      : lookup.state === 'none'
        ? `No ticket #${lookup.ticketNumber}.`
        : lookup.state === 'offline'
          ? `You're offline. Ticket #${lookup.ticketNumber} can be looked up when you reconnect.`
          : `Couldn't look up ticket #${lookup.ticketNumber}. Try again.`;
  const error = lookup.state === 'error' || lookup.state === 'none';
  return (
    <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" className="mt-2 flex-row items-start">
      <Ionicons
        name={error ? 'alert-circle' : 'information-circle-outline'}
        size={16}
        color={error ? palette.red[700] : colors.text.secondary}
      />
      <Text className={`ml-1.5 flex-1 text-xs ${error ? 'text-red-700' : 'text-gray-500'}`}>{text}</Text>
    </View>
  );
}

/** The action as a pill: label, icon and the action's tone (theme/colors.ts auditAction). */
function ActionPill({ action }: { action: string }) {
  const known = isKnownAuditAction(action);
  const tone: AuditActionTone = known ? colors.auditAction[action] : colors.badgeFallback;
  // Every pill has a 1 dp border, in its own fill colour unless the tone names one, so all pills are the same height.
  const border = tone.border ?? tone.bg;
  return (
    <View
      className="flex-row items-center rounded-full border px-2.5 py-0.5"
      style={{ backgroundColor: tone.bg, borderColor: border }}
    >
      <Ionicons name={known ? ACTION_ICONS[action] : 'ellipse-outline'} size={12} color={tone.fg} />
      <Text className="ml-1 text-xs font-medium" style={{ color: tone.fg }}>
        {auditActionLabel(action)}
      </Text>
    </View>
  );
}

/** The entity in words; the auto-close job's lowercase `ticket` reads as "Ticket" (05 B.38). */
function entityLabel(entityType: string): string {
  return entityType ? entityType.charAt(0).toUpperCase() + entityType.slice(1) : '';
}

const AuditCard = memo(function AuditCard({ entry, onOpenTicket }: { entry: AuditLogEntry; onOpenTicket: (link: string) => void }) {
  const details = useMemo(() => formatAuditDetails(entry), [entry]);
  const link = auditTicketLink(entry.ticket);
  const ticket = entry.ticket;
  // A null actor is a job (auto-close) or a deleted user (onDelete: SetNull, schema.prisma:571); the web says "System".
  const actor = formatDisplayName(entry.actor?.displayName) || 'System';
  const email = entry.actor?.email;

  return (
    <View className="mx-4 mb-3 rounded-xl border border-border bg-white p-4">
      <View className="flex-row items-center">
        <ActionPill action={entry.action} />
        <Text className="ml-2 flex-1 text-xs text-gray-500" numberOfLines={1}>
          {entityLabel(entry.entityType)}
        </Text>
        <Text className="text-xs text-gray-500">{auditTime(entry.createdAt)}</Text>
      </View>

      {ticket && link ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ticket ${ticket.ticketNumber}: ${ticket.title}`}
          onPress={() => onOpenTicket(link)}
          className="mt-1 min-h-11 flex-row items-center active:opacity-60"
        >
          <Text className="text-sm font-semibold text-blue-700">#{ticket.ticketNumber}</Text>
          <Text className="ml-2 flex-1 text-sm text-gray-700" numberOfLines={1}>
            {ticket.title}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
        </Pressable>
      ) : (
        <Text className="mt-2 text-sm text-gray-500">No ticket linked</Text>
      )}

      <View className={ticket && link ? '' : 'mt-2'}>
        <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
          {actor}
        </Text>
        {email ? (
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {email}
          </Text>
        ) : null}
      </View>

      {details.lines.length > 0 || details.raw ? (
        <View className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
          {details.lines.map((line, i) => (
            <Text key={i} className={`text-sm text-gray-700 ${i > 0 ? 'mt-1' : ''}`}>
              {line}
            </Text>
          ))}
          {details.raw ? (
            <Text selectable className={`font-mono text-xs text-gray-700 ${details.lines.length > 0 ? 'mt-2' : ''}`}>
              {details.raw}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

function AuditListFooter({
  count, total, capped, loading, failed, hasMore, offline, onRetry,
}: {
  count: number;
  total: number | undefined;
  /** The 500-entry memory cap stopped the list before the server's end (useAuditLog). */
  capped: boolean;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  offline: boolean;
  onRetry: () => void;
}) {
  if (hasMore && offline) {
    return <Text className="py-4 text-center text-xs text-gray-500">More entries load when you reconnect.</Text>;
  }
  if (loading) {
    return (
      <View className="flex-row items-center justify-center py-4">
        <ActivityIndicator color={colors.primary} />
        <Text className="ml-2 text-sm text-gray-500">Loading more…</Text>
      </View>
    );
  }
  if (failed) {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry} className="items-center py-4 active:opacity-60">
        <Text className="text-sm text-red-700">Couldn't load more entries.</Text>
        <Text className="mt-1 text-sm font-semibold text-blue-700">Tap to retry</Text>
      </Pressable>
    );
  }
  if (capped) {
    return (
      <Text className="px-4 py-4 text-center text-xs text-gray-500">
        {`Showing the first ${count}${total !== undefined ? ` of ${total}` : ''} — search or filter to narrow`}
      </Text>
    );
  }
  if (!hasMore && count > 0) {
    return (
      <Text className="py-4 text-center text-xs text-gray-500">
        {total !== undefined && total !== count ? `Showing ${count} of ${total}` : `All ${count} shown`}
      </Text>
    );
  }
  return null;
}
