// M2 Home (04 §2.1 M2, 08 §3.3). Two variants by role; pull-to-refresh only — nothing polls (01 DSH-1).
//
// PERIOD row (G6): the web dashboard's Range buttons (Today … All time, Custom), default "This month". Every count
// below follows it except Open and Active, which count right now. What each period sends: utils/dashboard-period.ts.
//   Not for L2_MANAGER, whose tiles have no counts. The choice lasts while the app is open (ui.store.ts).
// END_USER: "Raise a ticket", Open and Resolved counts (DSH-1), my 5 most recent tickets (TKT-1, `countryId=`, D8).
// ADMIN / AGENT: the web's five KPI tiles (Total, Open, In progress, Resolved, SLA breached), then its status chips
//   (Closed, Unassigned for ADMIN and the UI's triage AGENT only, the pending reasons, On hold) and Active — plus
//   shortcuts (My open, Due soon) and DSH-1 `recent`. Since G6; before, the tiles were Open, In progress, On hold,
//   SLA breached, Active and Unassigned (docs/G6-WEB-DASHBOARD.md §5).
// L2_MANAGER: the same tiles and chips WITHOUT counts, and a TKT-1 recent list. DSH-1 is never called for L2: the
//   server caches it per role for L2 (05 C.19), so its numbers can be another L2 manager's. Reasons: hooks/useHome.ts.
// Every role: "Pending approvals" tile (APR-1; END_USER/L2 only while they have one, 08 S1). The Alerts badge (NTF-2)
//   lives on the tab bar.
// ADMIN only (2026-10-29): the active-announcement banner (ANN-1, dismissible for this session) and its "Read more".
//   Other roles get no banner and no ANN-1 request, because the Announcements screen does not exist for them.
// The greeting follows the device clock, read again whenever Home is shown or the app returns to it (utils/greeting.ts).
//   Beside it, a drawn sun, sun-behind-cloud or moon for the band (components/GreetingMark.tsx): one rise and fade
//   when Home mounts, hidden from screen readers.
// Count fade (2026-11-03, Ronit's option 5 for the count roll): when the period changes, each tile's number fades from
//   the old into the new instead of snapping (components/CountFade.tsx), only while Home is visible.
// Window captions (2026-11-03): under every count, the window it covers ("this month", "last 7 days" … or "right now"
//   for Open), and "right now" on the Active chip, the one chip counted differently from its neighbours
//   (utils/home-kpis.ts HOME_TILE_WINDOW, HOME_CHIP_WINDOW). The counts themselves are unchanged: the web's (G6).
// A tile or chip opens the Tickets tab with the matching filter (utils/home-kpis.ts: the same status set it counts) and,
//   since G7, the period as the list's created-date filter when it counts "created in the period" (all but Open and
//   Active), as the web's dashboard links do. The list names the period in a chip that clears it.
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  AnnouncementBanner, CountFade, EmptyState, ErrorState, FilterChip, GreetingMark, LoadingSkeleton, Notice, OfflineBanner,
  PressableCard, QueryBanner, RecentTicketRow, ScreenHeader, Skeleton, SubmitButton,
} from '@/components';
import { queryKeys, useAnnouncements, useDashboard, usePendingApprovals, useRecentTickets } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { DashboardRecentTicket, MainTabScreenProps, Ticket } from '@/types';
import {
  CUSTOM_RANGE_MESSAGES, DASHBOARD_PERIODS, customRangeProblem, dashboardPeriodKey, dashboardPeriodLabel,
  dashboardPeriodQuery, periodListDates, type CustomDayRange, type DashboardPeriod,
} from '@/utils/dashboard-period';
import { notify } from '@/utils/dialogs';
import { greetingLine, greetingMark, greetingNow } from '@/utils/greeting';
import {
  HOME_CHIP_CARRIES_PERIOD, HOME_CHIP_LABELS, HOME_CHIP_LIST_FILTER, HOME_TILE_CARRIES_PERIOD, HOME_TILE_LIST_FILTER,
  homeChipCaption, homeChipValue, homeTileCaption, homeTileLabel, homeTileValue, visibleHomeChips, type HomeKpis,
} from '@/utils/home-kpis';
import {
  homeChips, homeTiles, homeVariant, showAnnouncementBanner, showApprovalsShortcut, showHomePeriod, type HomeChip,
  type HomeTile,
} from '@/utils/permissions';
import { ROLE_LABELS } from '@/utils/roles';
import { DUE_DATE_MIN, dateFromDay, dayFromDate } from '@/utils/tasks';
import { formatFilterDay, isFilterDay, type TicketNamedFilter } from '@/utils/ticket-filters';

interface Tile {
  key: string;
  label: string;
  /** undefined = no count shown (L2_MANAGER, still loading, or a Custom period not picked yet). */
  value?: number;
  /** The window the count covers, under it: the period, or "right now" (homeTileCaption). */
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** The square behind the icon and the tile's left edge: the web KPI card's colour for this count (colors.kpi). */
  color: string;
  onPress: () => void;
}

export function HomeScreen({ navigation }: MainTabScreenProps<'HomeTab'>) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'END_USER';
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const offline = useIsOffline();
  const openTicketList = useUiStore((s) => s.openTicketList);
  const dismissed = useUiStore((s) => s.dismissedAnnouncementIds);
  const dismissAnnouncement = useUiStore((s) => s.dismissAnnouncement);
  const period = useUiStore((s) => s.homePeriod);
  const customRange = useUiStore((s) => s.homeCustomRange);
  const setPeriod = useUiStore((s) => s.setHomePeriod);
  const setCustomRange = useUiStore((s) => s.setHomeCustomRange);

  // Variant, tiles, chips, the period row and the approvals shortcut come from utils/permissions.ts (pinned per role
  // by tests/rbac).
  const variant = homeVariant(role);
  const isEndUser = variant === 'endUser';
  const isL2 = variant === 'l2';
  const showPeriod = showHomePeriod(role);
  const dashboard = useDashboard(); // disabled for L2_MANAGER, and while a Custom period has no valid range
  // null = Custom without a valid From–To: DSH-1 waits, and pull-to-refresh must not ask for it.
  const periodQuery = dashboardPeriodQuery(period, customRange);
  const periodReady = periodQuery !== null;
  // Count fade: which period the numbers count, and whether they may fade. Only after the person has changed the period
  // on this visit of Home (the first numbers appear as before), and only while Home is the screen in view.
  const periodKey = periodQuery ? dashboardPeriodKey(periodQuery) : 'none';
  const focused = useIsFocused();
  const [periodTouched, setPeriodTouched] = useState(false);
  const countsFade = focused && periodTouched;
  const recent = useRecentTickets({ enabled: isEndUser || isL2 });
  const showBanner = showAnnouncementBanner(role); // ADMIN only
  const announcements = useAnnouncements(); // disabled inside the hook for every other role
  const approvals = usePendingApprovals();
  const pendingCount = approvals.data?.length ?? 0;
  const showApprovalsTile = showApprovalsShortcut(role, pendingCount); // 08 S1

  // The time-of-day greeting: from the device clock on first render, again each time Home is focused, and again when
  // the app comes back to the foreground on Home (an app left open overnight). Events only: no timer, no polling.
  // The state is the greeting itself, so a check that finds the same band does not re-render.
  const [greeting, setGreeting] = useState(() => greetingNow());
  useFocusEffect(
    useCallback(() => {
      setGreeting(greetingNow());
      const subscription = AppState.addEventListener('change', (next) => {
        if (next === 'active') setGreeting(greetingNow());
      });
      return () => subscription.remove();
    }, []),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await Promise.all([
        isL2 || !periodReady ? Promise.resolve() : dashboard.refetch(),
        isEndUser || isL2 ? recent.refetch() : Promise.resolve(),
        // refetch() runs even on a disabled query, so ANN-1 is skipped here for every role but ADMIN.
        showBanner ? announcements.refetch() : Promise.resolve(),
        approvals.refetch(),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.count() }), // the Alerts badge
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // The store holds the filter, so a second tap on the same tile still applies it; `pop` returns to the existing
  // list instead of stacking another one. Like a web dashboard link, the tile's filter applies alone: the Filters
  // sheet, search and sort start empty, so the list matches the tile (docs/G2-WEB-FILTERS.md §4).
  // G7: a tile that counts "created in the period" also puts the period on the list as its created-date filter, as the
  // web's links do (utils/dashboard-period.ts periodListDates). Not for L2_MANAGER, who has no period row.
  const openList = (filter: TicketNamedFilter, carriesPeriod = false) => {
    const dates = carriesPeriod && showPeriod ? periodListDates(period, customRange) : null;
    openTicketList(filter, dates ? { label: dashboardPeriodLabel(period), ...dates } : null);
    navigation.navigate('TicketsTab', { screen: 'TicketList', params: { filter }, pop: true });
  };
  const openTicket = (ticketId: string) =>
    navigation.navigate('TicketsTab', { screen: 'TicketDetail', params: { ticketId }, initial: false });
  const createTicket = () => navigation.navigate('TicketsTab', { screen: 'CreateTicket', initial: false });
  const openApprovals = () => navigation.navigate('Approvals', { screen: 'ApprovalsInbox', pop: true });

  // ── Custom period: the system date dialog, as on the Filters sheet. Days are the device's calendar days, as the
  // web's date inputs give the browser's. From is capped at To (or today), To starts at From; nothing is in the future.
  const pickDay = (which: keyof CustomDayRange) => {
    const today = new Date();
    const fromDate = isFilterDay(customRange.from) ? dateFromDay(customRange.from) : null;
    const toDate = isFilterDay(customRange.to) ? dateFromDay(customRange.to) : null;
    const minimumDate = which === 'to' && fromDate ? fromDate : DUE_DATE_MIN;
    const maximumDate = which === 'from' && toDate && toDate < today ? toDate : today;
    const current = which === 'from' ? fromDate : toDate;
    DateTimePickerAndroid.open({
      value: clampDate(current ?? (which === 'to' ? fromDate : null) ?? today, minimumDate, maximumDate),
      mode: 'date',
      minimumDate,
      maximumDate,
      onValueChange: (_event, date) => {
        setPeriodTouched(true);
        setCustomRange({ [which]: dayFromDate(date) });
      },
      onError: () => notify("Couldn't open the date picker."),
    });
  };
  const pickPeriod = (next: DashboardPeriod) => {
    setPeriodTouched(true);
    setPeriod(next);
    // "Custom" opens the From dialog straight away when there is no From yet.
    if (next === 'custom' && customRangeProblem(customRange) === 'from-missing') pickDay('from');
  };

  // ── Announcement banner (ADMIN): the first active one not dismissed this session (server order: pinned first) ──
  const activeAnnouncements = showBanner ? (announcements.data ?? []) : [];
  const visibleAnnouncements = activeAnnouncements.filter((a) => !dismissed.includes(a.id));
  const banner = visibleAnnouncements[0];

  // ── Tiles and chips ────────────────────────────────────────
  // Placeholder data (the previous period's response, kept for `recent`, hooks/useHome.ts) never supplies a count.
  const showTileCounts = !isL2;
  const countsCurrent = showTileCounts && periodReady && !dashboard.isPlaceholderData;
  const kpis = countsCurrent ? dashboard.data?.kpis : undefined;
  const tiles: Tile[] = user ? buildTiles(homeTiles(user), kpis, period, customRange, openList) : [];
  const chips: HomeChip[] = user ? visibleHomeChips(homeChips(user), kpis, showTileCounts) : [];
  const countsMissing = showTileCounts && periodReady && (!dashboard.data || dashboard.isPlaceholderData);
  const countsLoading = countsMissing && dashboard.fetchStatus !== 'idle';

  const primaryError = isL2 ? recent.error : isEndUser ? (dashboard.error ?? recent.error) : dashboard.error;
  const hasAnyData = isL2 ? recent.data !== undefined : dashboard.data !== undefined;

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Home" variant="drawer" />
      <OfflineBanner />
      <QueryBanner error={primaryError} hasData={hasAnyData} onRetry={() => void onRefresh()} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <View className="mx-4 mb-4">
          <View className="flex-row items-center">
            <View className="shrink">
              <Text accessibilityRole="header" className="text-xl font-bold text-gray-900">{greetingLine(greeting, user?.displayName)}</Text>
            </View>
            <GreetingMark mark={greetingMark(greeting)} />
          </View>
          <Text className="text-sm text-gray-500">{ROLE_LABELS[role]}</Text>
        </View>

        {banner ? (
          <AnnouncementBanner
            announcement={banner}
            moreCount={visibleAnnouncements.length - 1}
            onOpen={() => navigation.navigate('Announcements')}
            onDismiss={() => dismissAnnouncement(banner.id)}
          />
        ) : null}

        {isEndUser ? (
          <View className="mx-4 mb-4">
            <SubmitButton label="Raise a ticket" icon="add-circle-outline" onPress={createTicket} />
          </View>
        ) : null}

        {showPeriod ? (
          <PeriodRow period={period} customRange={customRange} onPick={pickPeriod} onPickDay={pickDay} />
        ) : null}

        <Section title={isEndUser ? 'My tickets' : 'Tickets'}>
          {isL2 ? (
            <View className="mx-4 mb-2">
              <Notice tone="info">
                Counts aren't shown for L2 Managers: the Service Desk's dashboard numbers can't be relied on for your
                role yet. Tap a tile to see the tickets.
              </Notice>
            </View>
          ) : null}
          <TileGrid
            tiles={tiles}
            showCounts={showTileCounts}
            periodKey={periodKey}
            countsFade={countsFade}
            loading={countsLoading}
            error={countsMissing && dashboard.isError ? dashboard.error : null}
            paused={countsMissing && dashboard.fetchStatus === 'paused'}
            onRetry={() => void dashboard.refetch()}
          />
          {chips.length > 0 ? (
            <View className="mx-4 mt-3 flex-row flex-wrap gap-2">
              {chips.map((chip) => (
                <StatusChip
                  key={chip}
                  label={HOME_CHIP_LABELS[chip]}
                  caption={homeChipCaption(chip)}
                  value={kpis ? homeChipValue(chip, kpis) : undefined}
                  loading={countsLoading}
                  color={CHIP_COLORS[chip]}
                  onPress={() => openList(HOME_CHIP_LIST_FILTER[chip], HOME_CHIP_CARRIES_PERIOD[chip])}
                />
              ))}
            </View>
          ) : null}
        </Section>

        {!isEndUser || showApprovalsTile ? (
          <Section title="Shortcuts">
            <View className="mx-4 flex-row flex-wrap gap-2">
              {!isEndUser ? <Shortcut icon="person-outline" label="My open" onPress={() => openList('MY_OPEN')} /> : null}
              {!isEndUser ? <Shortcut icon="alarm-outline" label="Due soon" onPress={() => openList('DUE_SOON')} /> : null}
              {showApprovalsTile ? (
                <Shortcut
                  icon="checkmark-done-outline"
                  label={approvals.data ? `Pending approvals (${pendingCount})` : 'Pending approvals'}
                  onPress={openApprovals}
                />
              ) : null}
            </View>
          </Section>
        ) : null}

        <Section title={isEndUser ? 'My recent tickets' : 'Recent tickets'} action={{ label: 'See all', onPress: () => openList('ALL') }}>
          <RecentList
            rows={isEndUser || isL2 ? recent.data : dashboard.data?.recent.slice(0, 5)}
            query={isEndUser || isL2 ? recent : dashboard}
            showRequester={!isEndUser}
            onOpen={openTicket}
            emptyText={isEndUser ? "You haven't raised any tickets yet." : 'No tickets in your queue yet.'}
          />
        </Section>
      </ScrollView>

      {!isEndUser ? (
        // "+" FAB → M8 (04 §2.1). END_USER has the "Raise a ticket" button instead.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create ticket"
          onPress={createTicket}
          style={{ bottom: insets.bottom + 20 }}
          className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
        >
          <Ionicons name="add" size={28} color={colors.primaryForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

function clampDate(value: Date, min: Date, max: Date): Date {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ── Tiles and chips per role ─────────────────────────────────

// Which tiles and chips show, per role, is homeTiles() / homeChips(); what each counts and which list it opens is
// utils/home-kpis.ts. These tables only say how each one looks. Colours: the web's KPI card or mini-card for the same
// count (FE:DashboardPage.tsx:341-402), via colors.kpi and colors.kpiPending; Active (app only) is colors.kpi.active.
const TILE_LOOK: Record<HomeTile, Pick<Tile, 'icon' | 'color'>> = {
  total: { icon: 'ticket-outline', color: colors.kpi.total },
  open: { icon: 'folder-open-outline', color: colors.kpi.open },
  inProgress: { icon: 'time-outline', color: colors.kpi.inProgress },
  resolved: { icon: 'checkmark-circle-outline', color: colors.kpi.resolved },
  slaBreached: { icon: 'warning-outline', color: colors.kpi.slaBreached },
};

const CHIP_COLORS: Record<HomeChip, string> = {
  closed: colors.kpi.closed,
  unassigned: colors.kpi.unassigned,
  pendingMgmtReview: colors.kpiPending.PENDING_MGMT_REVIEW,
  pendingPartner: colors.kpiPending.PENDING_PARTNER,
  pendingUserConfirm: colors.kpiPending.PENDING_USER_CONFIRM,
  pendingUserInfo: colors.kpiPending.PENDING_USER_INFO,
  pendingMasterData: colors.kpiPending.PENDING_MASTER_DATA,
  onHold: colors.kpiPending.ON_HOLD,
  active: colors.kpi.active,
};

/** `kpis` undefined = no counts (L2_MANAGER, still loading, or a Custom period not picked yet). */
function buildTiles(
  keys: readonly HomeTile[],
  kpis: HomeKpis | undefined,
  period: DashboardPeriod,
  customRange: CustomDayRange,
  openList: (f: TicketNamedFilter, carriesPeriod: boolean) => void,
): Tile[] {
  return keys.map((key) => ({
    key,
    label: homeTileLabel(key, period),
    caption: homeTileCaption(key, period, customRange),
    ...TILE_LOOK[key],
    value: kpis ? homeTileValue(key, kpis, period) : undefined,
    onPress: () => openList(HOME_TILE_LIST_FILTER[key], HOME_TILE_CARRIES_PERIOD[key]),
  }));
}

// ── Pieces ───────────────────────────────────────────────────

function Section({
  title, caption, action, children,
}: {
  title: string;
  caption?: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <View className="mb-4">
      <View className="mx-4 mb-2 min-h-6 flex-row items-center">
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500" accessibilityRole="header">
            {title}
          </Text>
          {caption ? <Text className="mt-0.5 text-xs text-gray-500">{caption}</Text> : null}
        </View>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={10} className="ml-3 py-0.5 active:opacity-60">
            <Text className="text-sm font-medium text-blue-700">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * The PERIOD row (G6): the web's Range buttons as one scrolling row of FilterChips (active brand red, the rest white
 * with a gray-300 border, S5). It scrolls the chosen chip into view on first layout: the default, "This month", is the
 * sixth chip and starts off-screen at 360 dp. Custom shows its From and To under the row.
 */
function PeriodRow({
  period, customRange, onPick, onPickDay,
}: {
  period: DashboardPeriod;
  customRange: CustomDayRange;
  onPick: (period: DashboardPeriod) => void;
  onPickDay: (which: keyof CustomDayRange) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const problem = period === 'custom' ? customRangeProblem(customRange) : null;

  return (
    <View className="mb-4">
      <Text className="mx-4 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500" accessibilityRole="header">
        Period
      </Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 py-1"
        accessibilityRole="radiogroup"
        accessibilityLabel="Period"
      >
        {DASHBOARD_PERIODS.map((p) => (
          <View
            key={p.value}
            onLayout={(e) => {
              if (scrolled.current || p.value !== period) return;
              scrolled.current = true;
              // Leave the gutter and a bit of the chip before it showing, so the row reads as scrollable.
              scrollRef.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 48), animated: false });
            }}
          >
            <FilterChip label={p.label} active={p.value === period} onPress={() => onPick(p.value)} />
          </View>
        ))}
      </ScrollView>
      {period === 'custom' ? (
        <View className="mx-4 mt-2">
          <View className="flex-row" style={{ columnGap: 8 }}>
            <DayButton label="From" day={customRange.from} onPress={() => onPickDay('from')} />
            <DayButton label="To" day={customRange.to} onPress={() => onPickDay('to')} />
          </View>
          {problem ? (
            <Text className={`mt-1 text-xs ${problem === 'from-after-to' ? 'text-red-700' : 'text-gray-500'}`} accessibilityLiveRegion="polite">
              {CUSTOM_RANGE_MESSAGES[problem]}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DayButton({ label, day, onPress }: { label: string; day: string | null; onPress: () => void }) {
  const value = isFilterDay(day) ? formatFilterDay(day) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? 'not picked'}. Opens the date picker`}
      onPress={onPress}
      className="min-h-11 flex-1 flex-row items-center rounded-lg border border-gray-300 bg-white px-3 active:bg-gray-50"
    >
      <Ionicons name="calendar-outline" size={18} color={colors.text.body} />
      <View className="ml-2 flex-1">
        <Text className="text-xs text-gray-500">{label}</Text>
        <Text className={`text-sm ${value ? 'font-medium text-gray-900' : 'text-gray-500'}`} numberOfLines={1}>
          {value ?? 'Pick a day'}
        </Text>
      </View>
    </Pressable>
  );
}

/** Space between KPI tiles, both ways (S1: cards 12 dp apart). */
const TILE_GAP = 12;

function TileGrid({
  tiles, showCounts, periodKey, countsFade, loading, error, paused, onRetry,
}: {
  tiles: readonly Tile[];
  /** false = L2_MANAGER: a tile shows "View tickets" instead of a count. */
  showCounts: boolean;
  /** The period the counts belong to, and whether a new count may fade in (CountFade). */
  periodKey: string;
  countsFade: boolean;
  loading: boolean;
  error: unknown;
  paused: boolean;
  onRetry: () => void;
}) {
  // Two tiles per row, as explicit rows with widths in dp. The tiles used to size themselves with `w-[48%]` in a
  // wrapping row. That class compiles to `width: '48%'`, yet on a device the tiles came out as wide as their content
  // (five to a row) and the label beside the icon collapsed to one letter. Nothing here depends on a percentage or on
  // wrapping now.
  // - Width: the grid's measured width (until the first layout, the window minus the `mx-4` gutters), minus one gap.
  // - An odd last tile spans the row, so no tile is left alone half-width: SLA breached, the fifth of the staff set.
  // - A row is as tall as its taller tile (the tiles stretch) and each count sits at the tile's foot, so the two
  //   counts line up when one label wraps.
  const { width: windowWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState<number>();
  const width = gridWidth ?? windowWidth - 32;
  const half = (width - TILE_GAP) / 2;
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));

  return (
    <View>
      {error ? (
        <View className="mx-4 mb-3 rounded-xl border border-border bg-white">
          <ErrorState error={error} title="Couldn't load the counts" onRetry={onRetry} />
        </View>
      ) : null}
      {paused ? <Text className="mx-4 mb-2 text-xs text-gray-500">Counts load when you reconnect.</Text> : null}
      <View className="mx-4" style={{ rowGap: TILE_GAP }} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {rows.map((row) => (
          <View key={row.map((t) => t.key).join('+')} className="flex-row" style={{ columnGap: TILE_GAP }}>
            {row.map((t) => (
              <KpiTile
                key={t.key}
                tile={t}
                width={row.length === 2 ? half : width}
                showCounts={showCounts}
                loading={loading}
                periodKey={periodKey}
                countsFade={countsFade}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function KpiTile({
  tile: t, width, showCounts, loading, periodKey, countsFade,
}: {
  tile: Tile;
  width: number;
  showCounts: boolean;
  loading: boolean;
  periodKey: string;
  countsFade: boolean;
}) {
  // The web's KPI card (DashboardPage.tsx KPICard): white card, a coloured square with a white icon, the label in
  // `text-sm text-gray-500`, the count in `text-2xl font-bold`. The web puts the label beside the square; a phone tile
  // is too narrow for that (about 80 dp at 360 dp), so the label goes under the square and gets the full width.
  // G6: a 4 dp left edge in the same colour (Ronit's brief; the 2026-10-09 web clone's card has no coloured edge).
  // 2026-11-03: the window caption under the count, and the standard press feedback. The width is on the press
  // wrapper, which the row stretches to the taller tile; the card grows to fill it (`grow`, basis auto, so it is still
  // measured by its content first), and the counts stay aligned.
  return (
    <PressableCard
      accessibilityRole="button"
      accessibilityLabel={`${t.label}${t.value !== undefined ? `: ${t.value}, ${t.caption}` : ''}. Opens the list`}
      onPress={t.onPress}
      wrapperStyle={{ width }}
      style={{ borderLeftWidth: 4, borderLeftColor: t.color }}
      className="min-h-32 grow justify-between rounded-xl border border-border bg-white p-4"
    >
      <View>
        <View className="h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: t.color }}>
          <Ionicons name={t.icon} size={18} color={colors.text.inverse} />
        </View>
        {/* Never truncated, and a word never breaks: each word may take a line (two at most), and a word still too wide
            shrinks to fit instead. No minimumFontScale, so the shrink can always finish and nothing is cut. */}
        <Text
          className="mt-2 text-sm text-gray-500"
          numberOfLines={Math.min(t.label.split(' ').length, 2)}
          adjustsFontSizeToFit
        >
          {t.label}
        </Text>
      </View>
      <View>
        {t.value !== undefined ? (
          // 2026-11-03: fades from the old number into the new when the period changes (components/CountFade.tsx).
          <CountFade value={t.value} periodKey={periodKey} active={countsFade} />
        ) : loading ? (
          // The count's own line holds the height (an invisible "0" in its style, hidden from screen readers), so the
          // tile keeps its height at any system text size when the number replaces the bar. Until 2026-10-30 this was a
          // fixed 32 dp line, which matched only at 100 %.
          <View className="mt-1 justify-center">
            <Text className="text-2xl font-bold" style={{ opacity: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              0
            </Text>
            <View style={StyleSheet.absoluteFill} className="justify-center">
              <Skeleton className="h-6 w-12" />
            </View>
          </View>
        ) : showCounts ? (
          // No count to show yet (a Custom period without both days, or an error shown above the grid).
          <Text className="mt-1 text-2xl font-bold text-gray-500" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            –
          </Text>
        ) : (
          <Text className="mt-1 text-sm font-medium text-blue-700">View tickets</Text>
        )}
        {/* The window (2026-11-03), small and muted under the number. Shown whenever counts are, loading included, so
            nothing moves when the number arrives: it depends on the period, not on the data. */}
        {showCounts ? (
          <Text className="text-xs text-gray-500" numberOfLines={2}>
            {t.caption}
          </Text>
        ) : null}
      </View>
    </PressableCard>
  );
}

/**
 * A status chip under the tiles (G6): the web's mini-card as a pill — coloured dot, count, label (FE:DashboardPage.tsx
 * :408-413). 36 dp with a 4 dp hit slop (S8), the standard white card border. No count for L2_MANAGER.
 */
function StatusChip({
  label, caption, value, loading, color, onPress,
}: {
  label: string;
  /** Only on a chip counted differently from its neighbours: Active's "right now" (homeChipCaption). */
  caption: string | null;
  value: number | undefined;
  loading: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${value !== undefined ? `: ${value}` : ''}${caption ? `, ${caption}` : ''}. Opens the list`}
      onPress={onPress}
      hitSlop={4}
      className="h-9 flex-row items-center rounded-full border border-border bg-white px-3 active:bg-gray-50"
    >
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {value !== undefined ? (
        <Text className="ml-1.5 text-sm font-semibold text-gray-900">{value}</Text>
      ) : loading ? (
        <Skeleton className="ml-1.5 h-3.5 w-5" />
      ) : null}
      <Text className="ml-1.5 text-sm text-gray-700">{label}</Text>
      {caption ? <Text className="ml-1 text-xs text-gray-500">{caption}</Text> : null}
    </Pressable>
  );
}

function Shortcut({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-11 flex-row items-center rounded-full border border-gray-300 bg-white px-4 active:bg-gray-50"
    >
      <Ionicons name={icon} size={18} color={colors.text.body} />
      <Text className="ml-2 text-sm font-medium text-gray-700">{label}</Text>
    </Pressable>
  );
}

interface RecentQueryState {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  refetch: () => Promise<unknown>;
}

function RecentList({
  rows, query, showRequester, onOpen, emptyText,
}: {
  rows: readonly (Ticket | DashboardRecentTicket)[] | undefined;
  query: RecentQueryState;
  showRequester: boolean;
  onOpen: (ticketId: string) => void;
  emptyText: string;
}) {
  let body: ReactNode;
  if (!rows && query.fetchStatus === 'paused') {
    body = <Text className="py-4 text-center text-sm text-gray-500">Recent tickets load when you reconnect.</Text>;
  } else if (!rows && query.isError) {
    body = <ErrorState error={query.error} title="Couldn't load recent tickets" onRetry={() => void query.refetch()} />;
  } else if (!rows) {
    body = <LoadingSkeleton variant="rows" rows={3} />;
  } else if (rows.length === 0) {
    body = <EmptyState icon="ticket-outline" title={emptyText} message="Your most recent tickets will appear here." />;
  } else {
    body = rows.map((t, i) => (
      <RecentTicketRow key={t.id} ticket={t} showRequester={showRequester} onPress={onOpen} last={i === rows.length - 1} />
    ));
  }
  // The standard card as a list of rows (Card.tsx `flush`); the section supplies the spacing below.
  return <View className="mx-4 rounded-xl border border-border bg-white px-4">{body}</View>;
}
