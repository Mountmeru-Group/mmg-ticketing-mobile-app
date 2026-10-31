// M2 Home (04 §2.1 M2, 08 §3.3). Two variants by role; pull-to-refresh only — nothing polls (01 DSH-1).
//
// END_USER: "Raise a ticket", Open and Resolved counts (DSH-1), my 5 most recent tickets (TKT-1, `countryId=`, D8).
// ADMIN / AGENT: DSH-1 KPI tiles — open, inProgress, onHold, slaBreached, totalOpen, and unassigned for ADMIN and the
//   UI's triage AGENT only (05 §A.12) — plus shortcuts (My open, Due soon) and DSH-1 `recent`.
// L2_MANAGER: the same tiles WITHOUT counts, and a TKT-1 recent list. DSH-1 is never called for L2: the server caches
//   it per role for L2 (05 C.19), so its numbers can be another L2 manager's. Reasons and the KPI list: hooks/useHome.ts.
// Every role: "Pending approvals" tile (APR-1; END_USER/L2 only while they have one, 08 S1). The Alerts badge (NTF-2)
//   lives on the tab bar.
// ADMIN only (2026-10-29): the active-announcement banner (ANN-1, dismissible for this session) and its "Read more".
//   Other roles get no banner and no ANN-1 request, because the Announcements screen does not exist for them.
// The greeting follows the device clock, read again whenever Home is shown or the app returns to it (utils/greeting.ts).
// A tile opens the Tickets tab with the matching filter (utils/ticket-filters.ts: the same status set as the KPI).
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #1): the Home tab's root, under the native navigation bar's large title. A recent
// ticket and the banner open inside Home; a tile switches to the Tickets tab; "Pending approvals" switches to the
// Approvals tab, or opens More's Approvals for the roles without that tab (hasApprovalsTab). The offline and error
// banners sit inside the scroll view, so the large title collapses as the screen scrolls (react-native-screens tracks
// the first scroll view on the screen). "Raise a ticket" and the "+" button open the create sheet (M8) over the tabs.
// iOS-4: at the accessibility text sizes the KPI tiles are one per row and their labels wrap instead of shrinking; the
// greeting and the counts stop growing where iOS's Title 2 and Title 1 stop (theme/typography.ts maxTextScale).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type ReactNode } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useIsOffline } from '@/api/network';
import {
  AnnouncementBanner, EmptyState, ErrorState, LoadingSkeleton, Notice, OfflineBanner, QueryBanner, RecentTicketRow,
  Skeleton, SubmitButton,
} from '@/components';
import {
  queryKeys, useAccessibilityTextSize, useAnnouncements, useDashboard, usePendingApprovals, useRecentTickets, useScaledIconSize,
  type SafeDashboard,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors, maxTextScale, shadows } from '@/theme';
import type { DashboardRecentTicket, HomeStackScreenProps, Ticket } from '@/types';
import { greetingLine, greetingNow } from '@/utils/greeting';
import {
  hasApprovalsTab, homeTiles, homeVariant, navRole, showAnnouncementBanner, showApprovalsShortcut, type HomeTile,
} from '@/utils/permissions';
import { ROLE_LABELS } from '@/utils/roles';
import type { TicketNamedFilter } from '@/utils/ticket-filters';

interface Tile {
  key: string;
  label: string;
  /** undefined = no count shown (L2_MANAGER). */
  value?: number;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** The square behind the icon: the web KPI card's colour for this count (colors.kpi). */
  color: string;
  onPress: () => void;
}

export function HomeScreen({ navigation }: HomeStackScreenProps<'Home'>) {
  const user = useAuthStore((s) => s.user);
  const role = navRole(user?.role);
  const queryClient = useQueryClient();
  const offline = useIsOffline();
  const openTicketList = useUiStore((s) => s.openTicketList);
  const dismissed = useUiStore((s) => s.dismissedAnnouncementIds);
  const dismissAnnouncement = useUiStore((s) => s.dismissAnnouncement);

  // Variant, tiles and the approvals shortcut come from utils/permissions.ts (pinned per role by tests/rbac).
  const variant = homeVariant(role);
  const isEndUser = variant === 'endUser';
  const isL2 = variant === 'l2';
  const dashboard = useDashboard(); // disabled for L2_MANAGER inside the hook
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
        isL2 ? Promise.resolve() : dashboard.refetch(),
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
  const openList = (filter: TicketNamedFilter) => {
    openTicketList(filter);
    navigation.navigate('TicketsTab', { screen: 'TicketList', params: { filter }, pop: true });
  };
  // iOS: a record opens in the tab the person is in (every tab stack has TicketDetail); the create form is a sheet.
  const openTicket = (ticketId: string) => navigation.navigate('TicketDetail', { ticketId });
  const createTicket = () => navigation.navigate('CreateTicket');
  // The Approvals tab for the roles that have it; otherwise the Approvals row's screen in More, with More under it.
  const openApprovals = () =>
    hasApprovalsTab(role)
      ? navigation.navigate('ApprovalsTab', { screen: 'ApprovalsInbox', pop: true })
      : navigation.navigate('MoreTab', { screen: 'ApprovalsInbox', initial: false, pop: true });

  // ── Announcement banner (ADMIN): the first active one not dismissed this session (server order: pinned first) ──
  const activeAnnouncements = showBanner ? (announcements.data ?? []) : [];
  const visibleAnnouncements = activeAnnouncements.filter((a) => !dismissed.includes(a.id));
  const banner = visibleAnnouncements[0];

  // ── Tiles ──────────────────────────────────────────────────
  const kpis = dashboard.data?.kpis;
  const tiles: Tile[] = user ? buildTiles(homeTiles(user), isL2 ? undefined : kpis, openList) : [];
  const showTileCounts = !isL2;

  const primaryError = isL2 ? recent.error : isEndUser ? (dashboard.error ?? recent.error) : dashboard.error;
  const hasAnyData = isL2 ? recent.data !== undefined : dashboard.data !== undefined;

  // The "+" button (staff) needs room under the last section; the tab bar already takes the home-indicator inset.
  const showFab = !isEndUser;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: showFab ? 96 : 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <OfflineBanner />
        <QueryBanner error={primaryError} hasData={hasAnyData} onRetry={() => void onRefresh()} />
        <View className="mx-4 mb-4 mt-3">
          <Text accessibilityRole="header" className="text-xl font-bold text-gray-900" maxFontSizeMultiplier={maxTextScale.title2}>
            {greetingLine(greeting, user?.displayName)}
          </Text>
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

        <Section
          title={isEndUser ? 'My tickets' : 'Tickets'}
          caption={
            isL2
              ? undefined
              : isEndUser
                ? 'Tickets you raised in the last 30 days.'
                : 'Created in the last 30 days, except Active (right now). Tapping opens the full list, all dates.'
          }
        >
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
            loading={showTileCounts && dashboard.isPending && dashboard.fetchStatus !== 'idle'}
            error={showTileCounts && !dashboard.data && dashboard.isError ? dashboard.error : null}
            paused={showTileCounts && !dashboard.data && dashboard.fetchStatus === 'paused'}
            onRetry={() => void dashboard.refetch()}
          />
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

      {showFab ? (
        // "+" FAB → M8 (04 §2.1). END_USER has the "Raise a ticket" button instead.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create ticket"
          onPress={createTicket}
          style={[{ bottom: 20 }, shadows.fab]}
          className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <Ionicons name="add" size={28} color={colors.primaryForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Tiles per role ───────────────────────────────────────────

// Which tiles show, per role, is homeTiles() (END_USER: Open, Resolved; staff: five counts, plus Unassigned for ADMIN
// and the UI's triage AGENT only, 04 M2). This table only says how each one looks and which list filter it opens.
// Colours: the web KPI card for the same count (colors.kpi); On hold uses the web's On Hold mini-tile grey.
const TILES: Record<HomeTile, Omit<Tile, 'key' | 'value' | 'onPress'> & { filter: TicketNamedFilter }> = {
  open: { label: 'Open', icon: 'folder-open-outline', color: colors.kpi.open, filter: 'OPEN' },
  resolved: { label: 'Resolved', icon: 'checkmark-circle-outline', color: colors.kpi.resolved, filter: 'RESOLVED' },
  inProgress: { label: 'In progress', icon: 'play-circle-outline', color: colors.kpi.inProgress, filter: 'IN_PROGRESS_KPI' },
  onHold: { label: 'On hold', icon: 'pause-circle-outline', color: colors.kpiPending.ON_HOLD, filter: 'ON_HOLD_KPI' },
  slaBreached: { label: 'SLA breached', icon: 'warning-outline', color: colors.kpi.slaBreached, filter: 'BREACHED_KPI' },
  totalOpen: { label: 'Active', hint: 'right now', icon: 'pulse-outline', color: colors.kpi.total, filter: 'ACTIVE_KPI' },
  unassigned: { label: 'Unassigned', icon: 'help-circle-outline', color: colors.kpi.unassigned, filter: 'UNASSIGNED_KPI' },
};

/** `kpis` undefined = no counts (L2_MANAGER, or still loading). */
function buildTiles(keys: readonly HomeTile[], kpis: SafeDashboard['kpis'] | undefined, openList: (f: TicketNamedFilter) => void): Tile[] {
  return keys.map((key) => {
    const { filter, ...look } = TILES[key];
    return { key, ...look, value: kpis?.[key], onPress: () => openList(filter) };
  });
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${action.label}: ${title}`}
            onPress={action.onPress}
            className="-my-2.5 ml-3 min-h-11 justify-center active:opacity-60"
          >
            <Text className="text-sm font-medium text-blue-700">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Space between KPI tiles, both ways (S1: cards 12 dp apart). */
const TILE_GAP = 12;

function TileGrid({
  tiles, loading, error, paused, onRetry,
}: {
  tiles: readonly Tile[];
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
  // - An odd last tile (5 tiles: AGENT outside triage, L2_MANAGER) spans the row, so no tile is left alone half-width.
  // - A row is as tall as its taller tile (the tiles stretch) and each count sits at the tile's foot, so the two
  //   counts line up when one label wraps.
  // - iOS-4: at the accessibility text sizes, one tile per row (HIG Typography: "Reduce the number of columns when the
  //   font size increases").
  const { width: windowWidth } = useWindowDimensions();
  const largeText = useAccessibilityTextSize();
  const [gridWidth, setGridWidth] = useState<number>();
  const width = gridWidth ?? windowWidth - 32;
  const half = (width - TILE_GAP) / 2;
  const perRow = largeText ? 1 : 2;
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));

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
              <KpiTile key={t.key} tile={t} width={row.length === 2 ? half : width} loading={loading} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function KpiTile({ tile: t, width, loading }: { tile: Tile; width: number; loading: boolean }) {
  const largeText = useAccessibilityTextSize();
  // The glyph grows with the text (HIG Typography: "Increase the size of meaningful interface icons"), and its square
  // with it: 32 pt around an 18 pt glyph at the default size.
  const iconSize = useScaledIconSize(18);
  // The web's KPI card (DashboardPage.tsx KPICard): white card, a coloured square with a white icon, the label in
  // `text-sm text-gray-500`, the count in `text-2xl font-bold`. The web puts the label beside the square; a phone tile
  // is too narrow for that (about 80 dp at 360 dp), so the label goes under the square and gets the full width.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.label}${t.value !== undefined ? `: ${t.value}` : ''}. Opens the list`}
      onPress={t.onPress}
      style={{ width }}
      className="min-h-32 justify-between rounded-xl border border-border bg-white p-4 active:opacity-80"
    >
      <View>
        <View className="items-center justify-center rounded-lg" style={{ backgroundColor: t.color, width: iconSize + 14, height: iconSize + 14 }}>
          <Ionicons name={t.icon} size={iconSize} color={colors.text.inverse} />
        </View>
        {/* Never truncated, and a word never breaks: each word may take a line (two at most), and a word still too wide
            shrinks to fit instead ("Unassigned" at 200 % text on a 360 dp phone: about 87 %). No minimumFontScale, so the
            shrink can always finish and nothing is cut. */}
        <Text
          className="mt-2 text-sm text-gray-500"
          numberOfLines={largeText ? undefined : Math.min(t.label.split(' ').length, 2)}
          adjustsFontSizeToFit={!largeText}
        >
          {t.label}
        </Text>
        {t.hint && t.value !== undefined ? (
          <Text className="text-xs text-gray-500">{t.hint}</Text>
        ) : t.hint && loading ? (
          // Phase P: the hint's line is kept (invisible, hidden from screen readers) while the count loads, so the row
          // does not grow and push the screen down when the number arrives.
          <Text className="text-xs text-gray-500" style={{ opacity: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {t.hint}
          </Text>
        ) : null}
      </View>
      {t.value !== undefined ? (
        <Text className="mt-1 text-2xl font-bold text-gray-900" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={maxTextScale.title1}>
          {t.value}
        </Text>
      ) : loading ? (
        // The count's own line holds the height (an invisible "0" in its style, hidden from screen readers), so the tile
        // keeps its height at any system text size when the number replaces the bar. Until 2026-10-30 this was a fixed
        // 32 dp line, which matched only at 100 %.
        // iOS (iOS-5c): the "0" also takes the count's one line and its Title 1 cap, so the two lines are the same at
        // every text size. On iOS the old 32 pt line was short even at the default size (`text-2xl` is 28 / 34 pt).
        <View className="mt-1 justify-center">
          <Text className="text-2xl font-bold" numberOfLines={1} maxFontSizeMultiplier={maxTextScale.title1} style={{ opacity: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            0
          </Text>
          <View style={StyleSheet.absoluteFill} className="justify-center">
            <Skeleton className="h-6 w-12" />
          </View>
        </View>
      ) : (
        <Text className="mt-1 text-sm font-medium text-blue-700">View tickets</Text>
      )}
    </Pressable>
  );
}

function Shortcut({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-11 flex-row items-center rounded-full border border-gray-300 bg-white px-4 py-2 active:bg-gray-50"
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
