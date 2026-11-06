// M20 Audit log (G8, ADMIN only): AUD-1, newest first. The web portal's /audit-log table, as cards for a 390 dp phone.
// Web and server behaviour, with sources: docs/G8-WEB-AUDIT.md.
// - Gate: the route is registered for ADMIN alone (utils/permissions.ts canViewAuditLog, drawerRoutes), useAuditLog
//   sends AUD-1 for ADMIN only, and the server answers 403 to every other role (auditLog.router.ts:8).
// - Layout: a heading per day ("Today", "Yesterday", "Mon 02 Nov 2026"), then one card per entry: the action pill, the
//   entity and time, the ticket number (a link, through the deep-link resolver), the person and their email, and the
//   details in a tinted box (utils/audit-log.ts formatAuditDetails). Never the IP address the row carries.
// - Filters: every one is a server-side AUD-1 param (the backend team's written contract, 2026-11-05), and they combine
//   in one request (auditLog.controller.ts:7-49):
//     Ticket      → ticketNumber=<n>, typed in the search box; the server finds the ticket. A number with no ticket
//                   filters nothing server-side, so the app spots that and says "No ticket #n" (05 B.40)
//     Action      → action=<AuditAction> (exact)
//     Dates       → dateFrom / dateTo: whole days on the phone's calendar, sent as their first and last instants
//     Entity type → entityType=Ticket | Comment | Attachment (exact match)
//     Person      → actorId=<user id>, picked with USR-3 (active users only); in the source, not the written contract
//   There is no free-text filter: filtering a page on the device would show a partial answer as if it were the whole one.
// - Memory: capped at 500 entries (useAuditLog), with the ticket list's "search or filter to narrow" footer.
// - No polling; pull-to-refresh reloads the first page only.
//
// iOS (iOS-5e, Android's 8b522e3 screen): pushed in the More stack from ADMIN's "Audit log" row; the route is registered
// for ADMIN alone (navigation/routes.ts stackRoutes, the iOS form of drawerRoutes), so no other role can reach it by
// tab, More, deep link or notification tap. It has no record screen of its own (no params, so no getId): a ticket link
// opens TicketLink → M4 inside the More stack (openTicketLinkInApp).
// - The native navigation bar (solid, iOS-8a) titled "Audit log" (routes.ts), instead of Android's ScreenHeader. Under
//   it, as on Android, the toolbar that never scrolls: the ticket-number search, the filter chips, the count and
//   "Clear all"; then the error banner, then the list.
// - The list's foot: the tab bar takes its own space, so 24 pt (listBottomInset), not Android's insets.bottom + 24.
// - Chips grow with the text size (at least 36 pt, a 4 pt hit slop); the pull-to-refresh spinner is tinted
//   (RefreshControl `tintColor`, Android's `colors`); VoiceOver hears the line under the search box (Android's live
//   region is TalkBack's only); the footer's retry has a label.
// - iOS-5f (Android's d8626bc filters): Action and Dates are chips beside Entity type and Person, each opening an
//   OptionSheet (a native page sheet), as the others do. "From a day…" and "Until a day…" open DatePickerSheet (the iOS
//   calendar, Cancel and Done) once the Dates sheet has gone, instead of Android's system date dialog; Android's limits
//   (from DUE_DATE_MIN to today) and its rule that From never comes after To (withAuditDay) are unchanged.
import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { useIsOffline } from '@/api/network';
import {
  DatePickerSheet, EmptyState, ErrorState, FilterChip, LIST_TOP_GAP, ListEntry, ListEntryScope, LoadingSkeleton,
  NO_SCROLL_ANCHOR, OfflineBanner, OfflineState, OptionSheet, PersonPickerSheet, QueryBanner, SearchField,
  listBottomInset, type Person, type SheetOption,
} from '@/components';
import { useAuditLog } from '@/hooks';
import { openTicketLinkInApp } from '@/navigation/navigationRef';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette, type AuditActionTone } from '@/theme';
import type { AuditAction, AuditLogEntry, MoreStackScreenProps, UserRole } from '@/types';
import {
  AUDIT_ACTIONS, AUDIT_ACTION_LABELS, AUDIT_DATE_PRESETS, AUDIT_ENTITY_TYPES, NO_AUDIT_FILTERS, activeAuditFilterCount,
  auditActionLabel, auditDatesLabel, auditListRows, auditPresetDays, auditPresetOf, auditTicketLink, auditTime,
  formatAuditDetails, isKnownAuditAction, parseAuditTicketNumber, withAuditDay, type AuditDatePreset, type AuditEntityType,
  type AuditListRow, type AuditLogFilters,
} from '@/utils/audit-log';
import { formatDisplayName } from '@/utils/format';
import { canViewAuditLog, navRole } from '@/utils/permissions';
import { DUE_DATE_MIN, dateFromDay, dayFromDate } from '@/utils/tasks';

const ALL_TYPES = '__ALL__';
const ALL_ACTIONS = '__ALL__';
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

/** Written by no server code today (docs/G8-WEB-AUDIT.md §8): offered, because the enum has them, but said so. */
const UNWRITTEN_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>(['DELETED', 'SLA_BREACHED', 'ESCALATED']);
const ACTION_OPTIONS: readonly SheetOption<string>[] = [
  { value: ALL_ACTIONS, label: 'All actions' },
  ...AUDIT_ACTIONS.map((a) => ({
    value: a,
    label: AUDIT_ACTION_LABELS[a],
    description: UNWRITTEN_ACTIONS.has(a) ? 'Not written by the Service Desk today' : undefined,
  })),
];

/** Dates: the quick spans, then a day picked by hand for either end. */
type DatesChoice = AuditDatePreset | 'pick-from' | 'pick-to';

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

const rowKey = (row: AuditListRow) => row.key;
const rowType = (row: AuditListRow) => row.kind;

function countText(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${n === 1 ? 'entry' : 'entries'}`;
}

export function AuditLogScreen(_props: MoreStackScreenProps<'AuditLog'>) {
  const role = navRole(useAuthStore((s) => s.user?.role));
  const offline = useIsOffline();

  const [filters, setFilters] = useState<AuditLogFilters>(NO_AUDIT_FILTERS);
  const [searchText, setSearchText] = useState('');
  // The search box holds something that is not a ticket number.
  const [invalidSearch, setInvalidSearch] = useState(false);
  const [sheet, setSheet] = useState<'action' | 'dates' | 'entity' | 'person' | null>(null);
  // iOS: the day calendar for one end of the Dates span (DatePickerSheet), or null.
  // Its latest day is today, read when it opens (Android: `maximumDate: new Date()` when its dialog opens).
  const [dayPicker, setDayPicker] = useState<{ end: 'from' | 'to'; value: Date; today: Date } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  // ── Ticket search: the number goes to the server as ticketNumber ─────
  const clearTicket = () => {
    setSearchText('');
    setInvalidSearch(false);
    setFilters((f) => (f.ticketNumber !== null ? { ...f, ticketNumber: null } : f));
  };
  const onChangeSearch = (text: string) => {
    setSearchText(text);
    if (invalidSearch) setInvalidSearch(false);
  };
  const submitSearch = () => {
    const text = searchText.trim();
    if (!text) {
      clearTicket();
      return;
    }
    const ticketNumber = parseAuditTicketNumber(text);
    setInvalidSearch(ticketNumber === null);
    if (ticketNumber !== null) setFilters((f) => (f.ticketNumber === ticketNumber ? f : { ...f, ticketNumber }));
  };

  // ── Dates: a quick span, or either end picked in the iOS calendar (Android: its system date dialog) ─────
  // iOS presents one sheet at a time: a hand-picked end opens its calendar once the Dates sheet has gone.
  const pickNext = useRef<'from' | 'to' | null>(null);
  const pickDay = (end: 'from' | 'to') => {
    const current = filters.dates[end];
    const today = new Date();
    setDayPicker({ end, value: (current ? dateFromDay(current) : null) ?? today, today });
  };
  const pickDates = (choice: DatesChoice) => {
    if (choice === 'pick-from' || choice === 'pick-to') {
      pickNext.current = choice === 'pick-from' ? 'from' : 'to';
      return;
    }
    setFilters((f) => ({ ...f, dates: auditPresetDays(choice) }));
  };
  const onDatesSheetGone = () => {
    const end = pickNext.current;
    pickNext.current = null;
    if (end) pickDay(end);
  };
  const dateOptions: readonly SheetOption<DatesChoice>[] = [
    ...AUDIT_DATE_PRESETS,
    { value: 'pick-from', label: 'From a day…', description: filters.dates.from ? auditDatesLabel({ from: filters.dates.from, to: null }) : undefined },
    { value: 'pick-to', label: 'Until a day…', description: filters.dates.to ? auditDatesLabel({ from: null, to: filters.dates.to }) : undefined },
  ];

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

  // iOS-8a: the bar is solid and the tab bar takes its own space, so the list pads only for its own gaps.
  const contentStyle = useMemo(() => ({ paddingTop: LIST_TOP_GAP, paddingBottom: listBottomInset(), flexGrow: 1 }), []);

  // Unreachable for anyone else (the route is not registered for them); kept so this screen can never send AUD-1 or
  // show the log to a role the server would refuse.
  if (!canViewAuditLog(role)) {
    return (
      <View className="flex-1 bg-gray-50">
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          list.ticketMissing && filters.ticketNumber !== null ? (
            <EmptyState
              illustration="empty"
              title={`No ticket #${filters.ticketNumber}`}
              message="The Service Desk has no ticket with that number. Check it and search again."
              actionLabel="Clear the ticket filter"
              onAction={clearTicket}
            />
          ) : activeCount > 0 ? (
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
      <OfflineBanner />

      {/* The toolbar (iOS-8a, Android's): below the navigation bar, never under it, and it does not scroll. */}
      <View className="border-b border-border bg-white px-4 py-2">
        <SearchField
          value={searchText}
          onChangeText={onChangeSearch}
          onClear={clearTicket}
          onSubmitEditing={submitSearch}
          returnKeyType="search"
          placeholder="Ticket number, e.g. 1234"
          accessibilityLabel="Filter by ticket number"
        />
        <SearchLine invalid={invalidSearch} missingTicket={list.ticketMissing ? filters.ticketNumber : null} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2"
          contentContainerClassName="gap-2 py-1"
          keyboardShouldPersistTaps="handled"
        >
          {filters.ticketNumber !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ticket #${filters.ticketNumber}. Clear the ticket filter`}
              onPress={clearTicket}
              hitSlop={4}
              className="min-h-9 flex-row items-center rounded-full border border-primary bg-primary px-3 py-1 active:opacity-80"
            >
              <Ionicons name="ticket-outline" size={14} color={colors.primaryForeground} />
              <Text className="ml-1 text-sm font-medium text-primary-foreground">#{filters.ticketNumber}</Text>
              <Ionicons name="close" size={14} color={colors.primaryForeground} style={{ marginLeft: 4 }} />
            </Pressable>
          ) : null}
          <FilterChip
            role="button"
            icon="flash-outline"
            label={filters.action ? AUDIT_ACTION_LABELS[filters.action] : 'All actions'}
            active={!!filters.action}
            onPress={() => setSheet('action')}
          />
          <FilterChip
            role="button"
            icon="calendar-outline"
            label={auditDatesLabel(filters.dates)}
            active={!!(filters.dates.from || filters.dates.to)}
            onPress={() => setSheet('dates')}
          />
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
        visible={sheet === 'action'}
        title="Action"
        options={ACTION_OPTIONS}
        selected={filters.action ?? ALL_ACTIONS}
        onSelect={(value) => setFilters((f) => ({ ...f, action: value === ALL_ACTIONS ? null : (value as AuditAction) }))}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'dates'}
        title="Dates"
        options={dateOptions}
        selected={auditPresetOf(filters.dates)}
        onSelect={pickDates}
        onClose={() => setSheet(null)}
        onDismiss={onDatesSheetGone}
      />
      {/* iOS: a hand-picked end in the iOS calendar. Android's limits: from DUE_DATE_MIN; nothing is logged in the future. */}
      <DatePickerSheet
        visible={dayPicker !== null}
        title={dayPicker?.end === 'to' ? 'Until' : 'From'}
        value={dayPicker?.value ?? DUE_DATE_MIN}
        minimumDate={DUE_DATE_MIN}
        maximumDate={dayPicker?.today}
        onDone={(date) => {
          if (dayPicker) setFilters((f) => ({ ...f, dates: withAuditDay(f.dates, dayPicker.end, dayFromDate(date)) }));
        }}
        onClose={() => setDayPicker(null)}
      />
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

/** Under the search box: why the search text is not used, or that the number names no ticket. */
function SearchLine({ invalid, missingTicket }: { invalid: boolean; missingTicket: number | null }) {
  const text = invalid
    ? 'Search takes a ticket number, like 1234. To see one person’s entries, tap Person.'
    : missingTicket !== null
      ? `No ticket #${missingTicket}.`
      : null;
  // VoiceOver hears the line when it appears (Android: accessibilityLiveRegion, TalkBack only).
  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);

  if (text === null) return null;
  const error = !invalid;
  return (
    <View accessibilityRole={error ? 'alert' : undefined} className="mt-2 flex-row items-start">
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Couldn't load more entries. Retry"
        onPress={onRetry}
        className="min-h-11 items-center py-4 active:opacity-60"
      >
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
