// M3 Ticket list (04 §2.1 M3, 08 §4). Live data from TKT-1 (Phase 3a) plus inline status and bulk actions (Phase 3b).
//
// WHERE EACH FILTER IS APPLIED (08 §4.5) — every named filter is a SERVER-SIDE TKT-1 param (ticket-filters.ts):
//   All         → no extra params; the server applies the role scope (END_USER also sends `countryId=`, D8)
//   Open        → status=OPEN
//   My open     → assignedToId=<me>&status=<the 9 open statuses>   (END_USER: the status list only — scope is own)
//   Unassigned  → assignedToId=unassigned                          (ADMIN / AGENT only)
//   Pending     → status=<the 7 hold statuses>
//   Overdue     → sla=BREACHED          (server slaStatus)
//   Due soon    → sla=DUE_SOON          (server slaStatus, ≤ 30 min left)
//   Resolved    → status=RESOLVED
//   Closed      → status=CLOSED
//   Sort        → sortBy=priority | sortBy=sla | omitted (= updatedAt desc). No direction param exists (08 §4.3).
//   Search      → search=<digits> exact ticket # (a leading # is stripped) | search=<text> subject, requester,
//                 technician (08 §4.4). Submitted on the keyboard's search key, not per keystroke. A pasted ticket
//                 link (…/ticket/<n>, …/tickets/<id>) opens the in-app link resolver instead (05 §A.11).
//   Home tiles  → tile-only filters with the KPI's exact status set (ticket-filters.ts HomeTileFilter); shown as an
//                 extra chip until another filter is picked.
//   Country     → countryId per 05 §A.12 (listCountryParam).
//   Filters sheet (Phase G2, M3 → TicketFilters; the web's "More Filters", docs/G2-WEB-FILTERS.md):
//     Priority  → priority=<LOW|MEDIUM|HIGH|URGENT>                    (every role)
//     Category  → categoryId=<top-level id>, exact (no sub-categories) (every role)
//     Created   → fromDate=YYYY-MM-DD and/or toDate=YYYY-MM-DD         (every role; UTC days on createdAt)
//     Technician→ assignedToId=<user id>                               (ADMIN / AGENT; one slot with My open/Unassigned)
//     Group     → teamId=<team id>                                     (ADMIN / AGENT)
//   Who gets which: ticketListFilters() (utils/permissions.ts). All of the above combine in ONE request
//   (ticketListQuery); "Clear all" is the web's Clear: named filter, search, the five and the sort (not the country).
// CLIENT-SIDE — display only, never used to hide or reorder rows:
//   the "New reply" highlight (lastRequesterReplyAt, 05 §A.9) and the hold-adjusted SLA badge (05 §A.9), which can
//   disagree with the server slaStatus behind Overdue / Due soon. Results are never filtered on the device to
//   "fix" the search-scope bug (05 C.7).
//
// WRITES (Phase 3b) — every one is an explicit action with a confirmation naming who is emailed:
//   Inline status chip (08 §4.1): staff only, transitions from ticket-rules.ts for that ticket only; RESOLVED /
//     CLOSED / CANCELED open M6 for the closure fields instead of writing here. TKT-6 POST only — never PUT.
//   Tap-and-hold multi-select (08 §4.2): staff only, hard cap BULK_ACTION_LIMIT (20). Pick up (ADMIN/AGENT) runs
//     here; Assign → M7 and Close → M6 in bulk mode. Sequential, Stop button, per-ticket results, one list refresh.
//   No bulk delete or merge: those endpoints don't exist (08 §4.2).
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #2): the Tickets tab's root. There is no hardware back: while tickets are
// selected, the navigation bar shows the count and Cancel. The status chip opens an iOS action sheet listing exactly
// inlineStatusTransitions() for that ticket (Canceled in red); a closure target opens the M6 sheet. Bulk Assign and
// Close open M7 and M6 as root sheets.
// iOS-4 (HIG, Toolbars and Search fields):
// - the search is the navigation bar's own (headerSearchBarOptions), under a large title that collapses as the list
//   scrolls. It searches as before: the keyboard's search key submits, a pasted ticket link opens the resolver, and an
//   emptied field (its ⓧ, or Cancel) clears the search, as the old field's ⓧ did;
// - the named filters, sort, country, count and "Clear all" ride at the top of the list, with the banners, so the
//   title can collapse (react-native-screens collapses it against the screen's first scroll view); every first-load
//   state scrolls the same way (StateScroll);
// - Filters is a button in the navigation bar, with how many of the five are on in its badge and its label.
import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View, type RefreshControlProps,
} from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import { useIsOffline } from '@/api/network';
import { assignTicket } from '@/api/tickets.api';
import {
  BulkProgressModal, EmptyState, ErrorState, FilterChip, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR,
  OfflineBanner, OfflineState, OptionSheet, OutlineButton, QueryBanner, TicketCard, type SheetOption,
} from '@/components';
import {
  assertAssignment, countryName, fetchCurrentStatus, useAccessibilityTextSize, useBulkRunner, useChangeStatus,
  useCountryOptions, useSingleFlight, useStableCallback, useTickets, type BulkTarget,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors, shadows } from '@/theme';
import type { Ticket, TicketStatus, TicketsStackScreenProps, UserRole } from '@/types';
import { chooseFromActionSheet, transitionChoices } from '@/utils/actionSheet';
import { looksLikeUrl } from '@/utils/deep-links';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import { statusLabel } from '@/utils/format';
import { hapticSelection } from '@/utils/haptics';
import {
  bulkActions, inlineStatusTransitions, navRole, ticketListFilters, ticketsTitle, type BulkAction,
} from '@/utils/permissions';
import { isStaff } from '@/utils/roles';
import {
  TICKET_FILTER_LABELS, TICKET_SORT_LABELS, activeAdvancedFilters, activeFilterLabels, availableTicketFilters,
  countrySelectorMode, isHomeTileFilter, isTicketFilterAllowed, listCountryParam, normaliseTicketSearch,
  type TicketNamedFilter, type TicketSortOption,
} from '@/utils/ticket-filters';
import { BULK_ACTION_LIMIT, isResolvedLocked, requiresClosureForm } from '@/utils/ticket-rules';
import { bulkPickUpMessage, statusChangeMessage } from '@/utils/writeCopy';

const SORT_OPTIONS: readonly SheetOption<TicketSortOption>[] = [
  { value: 'UPDATED', label: TICKET_SORT_LABELS.UPDATED, description: 'Newest first' },
  { value: 'PRIORITY', label: TICKET_SORT_LABELS.PRIORITY, description: 'Urgent first' },
  { value: 'DUE', label: TICKET_SORT_LABELS.DUE, description: 'Soonest resolve deadline first' },
];

const ALL_COUNTRIES = '__ALL__';
const ticketKey = (t: Ticket) => t.id;
/** Room under the last card for the "+" button; the tab bar already takes the home-indicator inset. */
const LIST_BOTTOM_PADDING = 96;

export function TicketListScreen({ navigation, route }: TicketsStackScreenProps<'TicketList'>) {
  const user = useAuthStore((s) => s.user);
  const role = navRole(user?.role);
  const {
    ticketFilter, ticketSort, ticketCountryId, ticketAdvanced, ticketSearchText: searchText, ticketSearch: search,
    setTicketFilter, setTicketSort, setTicketCountryId, setTicketSearchText: setSearchText, setTicketSearch: setSearch,
    clearTicketFilters,
  } = useUiStore();

  // Home tiles open this tab with a named filter pre-applied (08 §3.3).
  const requestedFilter = route.params?.filter;
  useEffect(() => {
    if (requestedFilter) setTicketFilter(requestedFilter);
  }, [requestedFilter, setTicketFilter]);

  const filters = availableTicketFilters(role);
  // Home tile filters are valid here too, except Unassigned for roles that can't use it (ADMIN/AGENT only).
  const activeFilter: TicketNamedFilter = isTicketFilterAllowed(role, ticketFilter) ? ticketFilter : 'ALL';

  // Filters sheet (G2): only the filters this person gets count, show or are sent.
  const allowedMore = ticketListFilters(user);
  const activeMore = activeAdvancedFilters(ticketAdvanced, allowedMore);
  const activeLabels = activeFilterLabels({ filter: activeFilter, search, advanced: ticketAdvanced, allowed: allowedMore });
  const openFilters = useCallback(() => navigation.navigate('TicketFilters'), [navigation]);

  const [sheet, setSheet] = useState<'sort' | 'country' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const countryMode = user ? countrySelectorMode(user) : 'hidden';
  const countryId = user ? listCountryParam(user, ticketCountryId) : undefined;
  // Fetched only when a name must be shown or the picker is opened — never prefetched.
  const countries = useCountryOptions({
    enabled: sheet === 'country' || countryMode === 'locked' || (countryMode === 'switch' && ticketCountryId !== null),
  });

  const list = useTickets({ filter: activeFilter, sort: ticketSort, search, countryId, advanced: ticketAdvanced });
  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = list;
  const hasData = list.data !== undefined;

  const openTicket = useCallback(
    (ticketId: string) => navigation.navigate('TicketDetail', { ticketId }),
    [navigation],
  );

  const offline = useIsOffline();

  // Offline, a refetch would only pause until reconnect and leave the spinner turning; the banner explains.
  const onRefresh = useCallback(async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await refreshFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [offline, refreshFirstPage]);

  // Guarded: the list can fire onEndReached repeatedly, and a failed page must wait for an explicit retry. The 500-ticket
  // cap (useTickets) ends hasNextPage, so nothing loads past it.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !refreshing && !offline) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, refreshing, offline, fetchNextPage]);

  // ── Search in the navigation bar (iOS-4) ───────────────────
  // The bar keeps its own text; the store keeps the same text (searchText) and the search that was submitted (search).
  const searchBar = useRef<SearchBarCommands>(null);
  /** The text the bar last reported, so a change made elsewhere (Clear all, a Home tile) is written back to it. */
  const barText = useRef(searchText);
  const submitSearch = useStableCallback((text: string) => {
    // A pasted email link opens that ticket (in-app resolver) instead of searching for the URL text.
    if (looksLikeUrl(text)) {
      navigation.navigate('TicketLink', { link: text.trim() });
      return;
    }
    setSearch(normaliseTicketSearch(text));
  });
  const clearSearch = useStableCallback(() => {
    barText.current = '';
    searchBar.current?.clearText();
    setSearchText('');
    setSearch(undefined);
  });
  const onSearchTextChange = useStableCallback((text: string) => {
    barText.current = text;
    setSearchText(text);
    // An emptied field clears the search, as the old field's ⓧ did (the bar's ⓧ empties it).
    if (text === '') setSearch(undefined);
  });
  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ref: searchBar,
        placeholder: 'Ticket #, subject, requester or technician',
        // Under the title, in the navigation bar, and kept on screen while the list scrolls (HIG, Search fields: "Place
        // search at the top … when … there's no bottom toolbar").
        placement: 'stacked',
        hideWhenScrolling: false,
        autoCapitalize: 'none',
        tintColor: colors.primary,
        onChangeText: (e) => onSearchTextChange(e.nativeEvent.text),
        onSearchButtonPress: (e) => submitSearch(e.nativeEvent.text),
        onCancelButtonPress: () => clearSearch(),
      },
    });
  }, [navigation, onSearchTextChange, submitSearch, clearSearch]);
  // Clear all and a Home tile change the store's text: show it in the bar too.
  useEffect(() => {
    if (barText.current === searchText) return;
    const frame = requestAnimationFrame(() => {
      if (!searchBar.current) return;
      barText.current = searchText;
      if (searchText) searchBar.current.setText(searchText);
      else searchBar.current.clearText();
    });
    return () => cancelAnimationFrame(frame);
  }, [searchText]);

  const countryOptions = useMemo<SheetOption<string>[]>(
    () => [
      { value: ALL_COUNTRIES, label: 'All countries' },
      ...(countries.data ?? []).map((c) => ({ value: c.id, label: countryName(c) ?? c.id })),
    ],
    [countries.data],
  );
  const selectedCountryLabel =
    countryMode === 'locked'
      ? (countryName(countries.data?.find((c) => c.id === user?.countryId)) ?? 'Your country')
      : ticketCountryId === null
        ? 'All countries'
        : (countryName(countries.data?.find((c) => c.id === ticketCountryId)) ?? 'Selected country');

  // ── Multi-select (08 §4.2) ─────────────────────────────────
  // The bar's buttons, and whether a long-press selects at all, come from bulkActions() (utils/permissions.ts, pinned
  // per role by tests/rbac): staff only; Pick up / Assign for ADMIN and AGENT; Close for every role that changes status.
  const bulk = bulkActions(user);
  const canSelect = bulk.length > 0;
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const selectionMode = selected.size > 0;
  // Keeps the same empty set when nothing is selected (Phase P2): the reset below runs on mount and on every filter,
  // sort or search change, and a new empty set redrew every visible card (it is the list's extraData).
  const clearSelection = useCallback(() => setSelected((prev) => (prev.size === 0 ? prev : new Set())), []);
  // One identity for the screen's lifetime (Phase P): it is every card's onLongPress, so a new one per selection change
  // re-rendered every visible card on each tap. Now only the tapped card does.
  // iOS-4: a ticket added to or taken out of the selection plays the selection haptic.
  const toggle = useStableCallback((ticketId: string) => {
    if (selected.has(ticketId)) {
      const next = new Set(selected);
      next.delete(ticketId);
      setSelected(next);
      hapticSelection();
    } else if (selected.size >= BULK_ACTION_LIMIT) {
      Alert.alert('Selection limit', `You can act on up to ${BULK_ACTION_LIMIT} tickets at a time`);
    } else {
      setSelected(new Set(selected).add(ticketId));
      hapticSelection();
    }
  });
  const onCardPress = useCallback((ticketId: string) => (selectionMode ? toggle(ticketId) : openTicket(ticketId)), [selectionMode, toggle, openTicket]);
  // Rows can vanish when the query changes; start over rather than act on tickets no longer shown.
  useEffect(() => clearSelection(), [activeFilter, ticketSort, search, countryId, ticketAdvanced, clearSelection]);
  // iOS has no back button to clear the selection (Android's did): while tickets are selected, the navigation bar shows
  // how many and a Cancel that clears them, as iOS's own selection modes do. Otherwise its right side is Filters (G2).
  const filtersOn = activeMore.length;
  useLayoutEffect(() => {
    navigation.setOptions(
      selectionMode
        ? {
            title: `${selected.size} selected`,
            headerLeft: () => <HeaderTextButton label="Cancel" onPress={clearSelection} />,
            headerRight: () => <Text className="text-xs text-gray-500">max {BULK_ACTION_LIMIT}</Text>,
          }
        : {
            title: ticketsTitle(role),
            headerLeft: undefined,
            headerRight: () => <FiltersButton on={filtersOn} onPress={openFilters} />,
          },
    );
  }, [navigation, selectionMode, selected.size, clearSelection, role, filtersOn, openFilters]);
  const selectedTickets = useMemo(() => list.tickets.filter((t) => selected.has(t.id)), [list.tickets, selected]);
  // iOS-4: at the accessibility text sizes the selection bar's buttons stack instead of shrinking their labels.
  const largeText = useAccessibilityTextSize();

  // ── Inline status chip (08 §4.1) ───────────────────────────
  const changeStatus = useChangeStatus();
  const once = useSingleFlight();
  const statusBusyId = changeStatus.isPending ? changeStatus.variables?.ticketId : undefined;

  // iOS: the chip opens an action sheet with exactly that ticket's inlineStatusTransitions() (utils/actionSheet.ts);
  // the whole of it (sheet, confirmation, write) runs single-flight. One identity for the screen's lifetime (Phase P).
  async function pickStatus(t: Ticket) {
    const transitions = inlineStatusTransitions(role, t.status);
    const target = await chooseFromActionSheet({
      title: `Change status · #${t.ticketNumber}`,
      message: transitions.some((x) => requiresClosureForm(x.target)) ? 'A closing status opens the closure form first.' : undefined,
      choices: transitionChoices(transitions),
    });
    if (target) await applyTransition(t, target);
  }
  const onStatusPress = useStableCallback((t: Ticket) => void once(() => pickStatus(t)));

  async function applyTransition(t: Ticket, target: TicketStatus) {
    const transition = inlineStatusTransitions(role, t.status).find((x) => x.target === target);
    if (!transition) return;
    if (requiresClosureForm(target)) {
      navigation.navigate('StatusClosure', { ticketIds: [t.id], target }); // closure fields are required (05 §A.2)
      return;
    }
    const ok = await confirmAction({
      title: `${transition.label}?`,
      message: statusChangeMessage(t.ticketNumber, t.status, target),
      confirmLabel: transition.label,
    });
    if (!ok) return;
    try {
      await changeStatus.mutateAsync({ ticketId: t.id, from: t.status, body: { status: target } });
      notify('Status updated');
    } catch (e) {
      reportWriteError('Failed to update status', e);
    }
  }

  // ── Bulk pick up (runs here; Assign and Close open M7 / M6) ─
  const runner = useBulkRunner();
  async function bulkPickUp() {
    if (!user) return;
    const me = user;
    const targets: BulkTarget[] = selectedTickets.map((t) => ({
      id: t.id,
      label: `#${t.ticketNumber}`,
      skipReason: isResolvedLocked(role, t.status)
        ? `${statusLabel(t.status)} tickets are locked for technicians.`
        : t.assignedToId === me.id
          ? 'Already assigned to you.'
          : undefined,
    }));
    const eligible = targets.filter((t) => !t.skipReason).length;
    if (eligible === 0) {
      Alert.alert('Nothing to pick up', 'None of the selected tickets can be picked up.');
      return;
    }
    const ok = await confirmAction({
      title: `Pick up ${eligible} ${eligible === 1 ? 'ticket' : 'tickets'}?`,
      message: bulkPickUpMessage(eligible, targets.length - eligible),
      confirmLabel: 'Pick up',
      destructive: true,
    });
    if (!ok) return;
    const byId = new Map(selectedTickets.map((t) => [t.id, t]));
    await runner.run('Picking up tickets', targets, async (id) => {
      const t = byId.get(id);
      if (!t) throw new Error('Ticket not loaded');
      assertAssignment(role, t.status, me.id); // same guards as a single assignment,
      assertAssignment(role, await fetchCurrentStatus(id), me.id); // against the server's current status too
      // 08 S5 / 05 B.14: send the row's team so the server doesn't pick an arbitrary one.
      await assignTicket(id, t.teamId ? { assignedToId: me.id, teamId: t.teamId } : { assignedToId: me.id });
    });
  }

  function openBulk(screen: 'AssignPicker' | 'StatusClosure') {
    const ticketIds = selectedTickets.map((t) => t.id);
    if (ticketIds.length === 0) return;
    if (screen === 'AssignPicker') navigation.navigate('AssignPicker', { ticketIds });
    else navigation.navigate('StatusClosure', { ticketIds, target: 'CLOSED' });
    clearSelection();
  }
  const onBulk: Record<BulkAction, () => void> = {
    pickup: () => void once(bulkPickUp),
    assign: () => openBulk('AssignPicker'),
    close: () => openBulk('StatusClosure'),
  };

  const renderItem = useCallback(
    ({ item, index }: { item: Ticket; index: number }) => {
      const interactive = inlineStatusTransitions(role, item.status).length > 0;
      return (
        <ListEntry index={index}>
          <TicketCard
            ticket={item}
            role={role}
            onPress={onCardPress}
            onLongPress={canSelect ? toggle : undefined}
            selectionMode={selectionMode}
            selected={selected.has(item.id)}
            onStatusPress={interactive ? onStatusPress : undefined}
            statusBusy={statusBusyId === item.id}
          />
        </ListEntry>
      );
    },
    [role, onCardPress, canSelect, toggle, selectionMode, selected, onStatusPress, statusBusyId],
  );

  const contentStyle = useMemo(() => ({ paddingBottom: LIST_BOTTOM_PADDING, flexGrow: 1 }), []);
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />;

  // The top of the list (iOS-4): the banners, then the named filters (08 §4.5), sort (08 §4.3), country (05 §A.12), the
  // count, and what is applied with the web's Clear (shown when anything but the sort is set, TicketsListPage.tsx:395-397).
  // The search itself is the navigation bar's (one box, no field selector, A22); Filters (G2) is the bar's right button.
  const listHeader = (
    <View>
      <OfflineBanner />
      <View className="border-b border-border bg-white px-4 pb-1 pt-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 py-1"
          keyboardShouldPersistTaps="handled"
        >
          {isHomeTileFilter(activeFilter) ? (
            <View
              accessible
              accessibilityRole="radio"
              accessibilityState={{ selected: true }}
              accessibilityLabel={`Filter from Home: ${TICKET_FILTER_LABELS[activeFilter]}`}
              className="min-h-9 flex-row items-center rounded-full border border-primary bg-primary px-3 py-1"
            >
              <Ionicons name="home-outline" size={14} color={colors.primaryForeground} />
              <Text className="ml-1 text-sm font-medium text-primary-foreground">{TICKET_FILTER_LABELS[activeFilter]}</Text>
            </View>
          ) : null}
          {filters.map((f) => (
            <FilterChip key={f} label={TICKET_FILTER_LABELS[f]} active={f === activeFilter} onPress={() => setTicketFilter(f)} />
          ))}
        </ScrollView>

        <View className="mt-1 flex-row flex-wrap items-center gap-y-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${TICKET_SORT_LABELS[ticketSort]}`}
            onPress={() => setSheet('sort')}
            hitSlop={4}
            className="mr-2 min-h-9 flex-row items-center rounded-full border border-gray-300 bg-white px-3 py-1 active:bg-gray-50"
          >
            <Ionicons name="swap-vertical" size={14} color={colors.text.body} />
            <Text className="ml-1 text-sm text-gray-700">{TICKET_SORT_LABELS[ticketSort]}</Text>
          </Pressable>
          {countryMode === 'switch' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Country: ${selectedCountryLabel}`}
              onPress={() => setSheet('country')}
              hitSlop={4}
              className="mr-2 min-h-9 shrink flex-row items-center rounded-full border border-gray-300 bg-white px-3 py-1 active:bg-gray-50"
            >
              <Ionicons name="globe-outline" size={14} color={colors.text.body} />
              <Text className="ml-1 shrink text-sm text-gray-700" numberOfLines={1}>{selectedCountryLabel}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.text.body} style={{ marginLeft: 2 }} />
            </Pressable>
          ) : null}
          {countryMode === 'locked' ? (
            <View
              accessible
              accessibilityLabel={`Locked to ${selectedCountryLabel}`}
              className="mr-2 min-h-9 shrink flex-row items-center rounded-full bg-gray-100 px-3 py-1"
            >
              <Ionicons name="lock-closed" size={14} color={colors.badgeFallback.fg} />
              <Text className="ml-1 shrink text-sm text-gray-600" numberOfLines={1}>{selectedCountryLabel}</Text>
            </View>
          ) : null}
          <View className="flex-1" />
          {list.total !== undefined ? (
            <Text className="text-xs text-gray-500">
              {list.total} {list.total === 1 ? 'ticket' : 'tickets'}
            </Text>
          ) : null}
        </View>

        {activeLabels.length > 0 ? (
          <View className="flex-row items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Filtered by ${activeLabels.join(', ')}. Open filters`}
              onPress={openFilters}
              className="min-h-11 flex-1 flex-row items-center active:opacity-60"
            >
              <Ionicons name="funnel-outline" size={14} color={colors.text.secondary} />
              <Text className="ml-1.5 flex-1 text-xs text-gray-700" numberOfLines={2}>
                {activeLabels.join(' · ')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all filters, search and sort"
              onPress={clearTicketFilters}
              className="min-h-11 justify-center pl-3 active:opacity-60"
            >
              <Text className="text-sm font-medium text-blue-700">Clear all</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <QueryBanner error={isFetchNextPageError ? null : list.error} hasData={hasData} onRetry={() => void onRefresh()} />
      <View className="h-3" />
    </View>
  );

  let content: ReactNode;
  if (!hasData && list.fetchStatus === 'paused') {
    content = (
      <StateScroll header={listHeader} refreshControl={refreshControl}>
        <OfflineState what="Tickets" />
      </StateScroll>
    );
  } else if (list.isPending && !hasData) {
    content = (
      <StateScroll header={listHeader}>
        <LoadingSkeleton rows={5} />
      </StateScroll>
    );
  } else if (list.isError && !hasData) {
    content = (
      <StateScroll header={listHeader} refreshControl={refreshControl}>
        <ErrorState error={list.error} title="Couldn't load tickets" onRetry={() => void list.refetch()} />
      </StateScroll>
    );
  } else {
    content = (
      <FlashList
        data={list.tickets}
        extraData={selected}
        keyExtractor={ticketKey}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        keyboardShouldPersistTaps="handled"
        // Under the translucent large-title bar and its search field (iOS-4).
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={listHeader}
        contentContainerStyle={contentStyle}
        refreshControl={refreshControl}
        ListEmptyComponent={
          <ListEmpty
            role={role}
            filter={activeFilter}
            search={search}
            moreFilters={activeMore.length}
            onClearSearch={clearSearch}
            onShowAll={() => setTicketFilter('ALL')}
            onClearAll={clearTicketFilters}
            onCreate={() => navigation.navigate('CreateTicket')}
          />
        }
        ListFooterComponent={
          <ListFooter
            count={list.tickets.length}
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
      <ListEntryScope>{content}</ListEntryScope>

      {selectionMode ? (
        // Selection action bar (08 §4.2): exactly the buttons bulkActions() returns. It sits on the tab bar, which
        // already takes the home-indicator inset.
        <View className={`absolute bottom-0 left-0 right-0 gap-2 border-t border-border bg-white px-4 pb-2 pt-3 ${largeText ? '' : 'flex-row'}`}>
          {bulk.map((action) => (
            <BarButton key={action} icon={BULK_BUTTONS[action].icon} label={BULK_BUTTONS[action].label} onPress={onBulk[action]} stacked={largeText} />
          ))}
        </View>
      ) : (
        // "+" FAB → M8 Create ticket (04 §2.1).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create ticket"
          onPress={() => navigation.navigate('CreateTicket')}
          style={[{ bottom: 20 }, shadows.fab]}
          className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <Ionicons name="add" size={28} color={colors.primaryForeground} />
        </Pressable>
      )}

      <BulkProgressModal
        progress={runner.progress}
        onStop={runner.stop}
        onClose={() => {
          runner.reset();
          clearSelection();
        }}
      />

      <OptionSheet
        visible={sheet === 'sort'}
        title="Sort by"
        options={SORT_OPTIONS}
        selected={ticketSort}
        onSelect={setTicketSort}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'country'}
        title="Country"
        options={countryOptions}
        selected={ticketCountryId ?? ALL_COUNTRIES}
        onSelect={(value) => setTicketCountryId(value === ALL_COUNTRIES ? null : value)}
        onClose={() => setSheet(null)}
      >
        {countries.fetchStatus === 'paused' && !countries.data ? (
          <Text className="px-4 py-8 text-center text-sm text-gray-500">Countries load when you reconnect.</Text>
        ) : countries.isPending ? (
          <View className="items-center py-8">
            <ActivityIndicator color={colors.primary} />
            <Text className="mt-2 text-sm text-gray-500">Loading countries…</Text>
          </View>
        ) : countries.isError && !countries.data ? (
          <ErrorState error={countries.error} title="Couldn't load countries" onRetry={() => void countries.refetch()} />
        ) : undefined}
      </OptionSheet>
    </View>
  );
}

function ListEmpty({
  role, filter, search, moreFilters, onClearSearch, onShowAll, onClearAll, onCreate,
}: {
  role: UserRole;
  filter: TicketNamedFilter;
  search: string | undefined;
  /** How many of the Filters sheet's five are on. */
  moreFilters: number;
  onClearSearch: () => void;
  onShowAll: () => void;
  onClearAll: () => void;
  onCreate: () => void;
}) {
  if (moreFilters > 0) {
    return (
      <EmptyState
        illustration="empty"
        title="No tickets match these filters"
        message="Every filter applies at once. Try fewer filters or a wider date range. Pull down to refresh."
        actionLabel="Clear all filters"
        onAction={onClearAll}
      />
    );
  }
  if (search) {
    return (
      <EmptyState
        illustration="empty"
        title={`No tickets match “${search}”`}
        message="Search covers the ticket number, subject, requester and technician."
        actionLabel="Clear search"
        onAction={onClearSearch}
      />
    );
  }
  if (filter !== 'ALL') {
    return (
      <EmptyState
        illustration="empty"
        title={`No tickets in “${TICKET_FILTER_LABELS[filter]}”`}
        message="Tickets that match this filter will appear here. Pull down to refresh."
        actionLabel="Show all tickets"
        onAction={onShowAll}
      />
    );
  }
  return !isStaff(role) ? (
    <EmptyState
      illustration="empty"
      title="You haven't raised any tickets yet"
      message="Tickets you raise will appear here. Pull down to refresh."
      actionLabel="Raise a ticket"
      onAction={onCreate}
    />
  ) : (
    <EmptyState
      illustration="empty"
      title="No tickets in your queue"
      message="Tickets assigned to you or your groups will appear here. Pull down to refresh."
    />
  );
}

function ListFooter({
  count, total, capped, loading, failed, hasMore, offline, onRetry,
}: {
  count: number;
  total: number | undefined;
  /** The 500-ticket memory cap stopped the list before the server's end (useTickets). */
  capped: boolean;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  offline: boolean;
  onRetry: () => void;
}) {
  if (hasMore && offline) {
    return <Text className="py-4 text-center text-xs text-gray-500">More tickets load when you reconnect.</Text>;
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
    // iOS-4: the same Retry button as every other error state (ErrorState).
    return (
      <View className="items-center py-4">
        <Text className="mb-2 text-sm text-red-700">Couldn't load more tickets.</Text>
        <OutlineButton label="Retry" icon="refresh" onPress={onRetry} />
      </View>
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

const BULK_BUTTONS: Record<BulkAction, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pickup: { label: 'Pick up', icon: 'hand-left-outline' },
  assign: { label: 'Assign', icon: 'person-add-outline' },
  close: { label: 'Close', icon: 'checkmark-done-outline' },
};

function BarButton({
  icon, label, onPress, stacked,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** One above the other (the accessibility text sizes), each full width. */
  stacked: boolean;
}) {
  return (
    <View className={stacked ? undefined : 'flex-1'}>
      <OutlineButton icon={icon} label={label} onPress={onPress} compact />
    </View>
  );
}

/** A text button in the navigation bar (iOS: Cancel), in the bar's tint colour, 44 pt tall. */
function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} className="min-h-11 justify-center active:opacity-60">
      <Text className="text-base text-primary">{label}</Text>
    </Pressable>
  );
}

/** The navigation bar's Filters button (G2, iOS-4): the sheet, with how many of the five are on. */
function FiltersButton({ on, onPress }: { on: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on > 0 ? `Filters, ${on} on` : 'Filters'}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center active:opacity-60"
    >
      <Ionicons name={on > 0 ? 'options' : 'options-outline'} size={24} color={colors.primary} />
      {on > 0 ? (
        <View className="absolute right-0 top-0.5 min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1">
          <Text className="text-xs font-semibold text-primary-foreground" maxFontSizeMultiplier={1.4}>{on}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A first-load state (offline, loading, error) in a scroll view under the large-title bar, with the list's header on top,
 * so the title still collapses and the filters stay reachable (iOS-4; the Alerts screen's StateScroll).
 */
function StateScroll({
  header, refreshControl, children,
}: {
  header: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  children: ReactNode;
}) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, paddingBottom: LIST_BOTTOM_PADDING }}
      refreshControl={refreshControl}
    >
      {header}
      {children}
    </ScrollView>
  );
}
