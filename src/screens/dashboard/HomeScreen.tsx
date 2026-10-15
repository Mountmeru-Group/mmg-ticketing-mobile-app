// M2 Home (04 §2.1 M2, 08 §3.3). Two variants by role; pull-to-refresh only — nothing polls (01 DSH-1).
//
// END_USER: "Raise a ticket", Open and Resolved counts (DSH-1), my 5 most recent tickets (TKT-1, `countryId=`, D8).
// ADMIN / AGENT: DSH-1 KPI tiles — open, inProgress, onHold, slaBreached, totalOpen, and unassigned for ADMIN and the
//   UI's triage AGENT only (05 §A.12) — plus shortcuts (My open, Due soon) and DSH-1 `recent`.
// L2_MANAGER: the same tiles WITHOUT counts, and a TKT-1 recent list. DSH-1 is never called for L2: the server caches
//   it per role for L2 (05 C.19), so its numbers can be another L2 manager's. Reasons and the KPI list: hooks/useHome.ts.
// Every role: active-announcement banner (ANN-1, dismissible for this session), "Pending approvals" tile (APR-1;
//   END_USER/L2 only while they have one, 08 S1). The Alerts badge (NTF-2) lives on the tab bar.
// A tile opens the Tickets tab with the matching filter (utils/ticket-filters.ts: the same status set as the KPI).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  AnnouncementBanner, EmptyState, ErrorState, Notice, OfflineBanner, QueryBanner, RecentTicketRow, ScreenHeader,
} from '@/components';
import { queryKeys, useAnnouncements, useDashboard, usePendingApprovals, useRecentTickets, type SafeDashboard } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { DashboardRecentTicket, MainTabScreenProps, Ticket } from '@/types';
import { formatDisplayName } from '@/utils/format';
import { ROLE_LABELS, isAgentOrAdmin, isTriageAgent } from '@/utils/roles';
import type { TicketNamedFilter } from '@/utils/ticket-filters';

interface Tile {
  key: string;
  label: string;
  /** undefined = no count shown (L2_MANAGER). */
  value?: number;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'blue' | 'yellow' | 'slate' | 'red' | 'green' | 'gray' | 'purple';
  onPress: () => void;
}

const TONES: Record<Tile['tone'], { bg: string; fg: string }> = {
  blue: { bg: 'bg-blue-50', fg: '#1d4ed8' },
  yellow: { bg: 'bg-yellow-50', fg: '#a16207' },
  slate: { bg: 'bg-slate-100', fg: '#334155' },
  red: { bg: 'bg-red-50', fg: '#b91c1c' },
  green: { bg: 'bg-green-50', fg: '#15803d' },
  gray: { bg: 'bg-gray-100', fg: '#374151' },
  purple: { bg: 'bg-purple-50', fg: '#6d28d9' },
};

export function HomeScreen({ navigation }: MainTabScreenProps<'HomeTab'>) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'END_USER';
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const offline = useIsOffline();
  const setTicketFilter = useUiStore((s) => s.setTicketFilter);
  const dismissed = useUiStore((s) => s.dismissedAnnouncementIds);
  const dismissAnnouncement = useUiStore((s) => s.dismissAnnouncement);

  const isEndUser = role === 'END_USER';
  const isL2 = role === 'L2_MANAGER';
  const dashboard = useDashboard(); // disabled for L2_MANAGER inside the hook
  const recent = useRecentTickets({ enabled: isEndUser || isL2 });
  const announcements = useAnnouncements();
  const approvals = usePendingApprovals();
  const pendingCount = approvals.data?.length ?? 0;
  const showApprovalsTile = isAgentOrAdmin(role) || pendingCount > 0; // 08 S1

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await Promise.all([
        isL2 ? Promise.resolve() : dashboard.refetch(),
        isEndUser || isL2 ? recent.refetch() : Promise.resolve(),
        announcements.refetch(),
        approvals.refetch(),
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.count() }), // the Alerts badge
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // The store holds the filter, so a second tap on the same tile still applies it; `pop` returns to the existing
  // list instead of stacking another one.
  const openList = (filter: TicketNamedFilter) => {
    setTicketFilter(filter);
    navigation.navigate('TicketsTab', { screen: 'TicketList', params: { filter }, pop: true });
  };
  const openTicket = (ticketId: string) =>
    navigation.navigate('TicketsTab', { screen: 'TicketDetail', params: { ticketId }, initial: false });
  const createTicket = () => navigation.navigate('TicketsTab', { screen: 'CreateTicket', initial: false });
  const openApprovals = () => navigation.navigate('Approvals', { screen: 'ApprovalsInbox', pop: true });

  // ── Announcement banner: the first active one not dismissed this session (server order: pinned first) ──
  const activeAnnouncements = announcements.data ?? [];
  const visibleAnnouncements = activeAnnouncements.filter((a) => !dismissed.includes(a.id));
  const banner = visibleAnnouncements[0];

  const firstName = formatDisplayName(user?.displayName).split(/\s+/)[0] ?? '';

  // ── Tiles ──────────────────────────────────────────────────
  const kpis = dashboard.data?.kpis;
  const tiles: Tile[] = isEndUser ? endUserTiles(kpis, openList) : staffTiles(role, user, isL2 ? undefined : kpis, openList);
  const showTileCounts = !isL2;

  const primaryError = isL2 ? recent.error : isEndUser ? (dashboard.error ?? recent.error) : dashboard.error;
  const hasAnyData = isL2 ? recent.data !== undefined : dashboard.data !== undefined;

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Home" variant="drawer" />
      <OfflineBanner />
      <QueryBanner error={primaryError} hasData={hasAnyData} onRetry={() => void onRefresh()} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
      >
        <View className="mx-4 mb-3">
          <Text className="text-xl font-bold text-gray-900">{firstName ? `Hello, ${firstName}` : 'Hello'}</Text>
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
          <Pressable
            accessibilityRole="button"
            onPress={createTicket}
            className="mx-4 mb-4 flex-row items-center justify-center rounded-xl bg-blue-600 py-4 active:bg-blue-700"
          >
            <Ionicons name="add-circle-outline" size={24} color="#ffffff" />
            <Text className="ml-2 text-lg font-semibold text-white">Raise a ticket</Text>
          </Pressable>
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

      {!isEndUser ? (
        // "+" FAB → M8 (04 §2.1). END_USER has the "Raise a ticket" button instead.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create ticket"
          onPress={createTicket}
          style={{ bottom: insets.bottom + 20 }}
          className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg active:bg-blue-700"
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Tiles per role ───────────────────────────────────────────

function endUserTiles(kpis: SafeDashboard['kpis'] | undefined, openList: (f: TicketNamedFilter) => void): Tile[] {
  return [
    { key: 'open', label: 'Open', value: kpis?.open, icon: 'folder-open-outline', tone: 'blue', onPress: () => openList('OPEN') },
    { key: 'resolved', label: 'Resolved', value: kpis?.resolved, icon: 'checkmark-circle-outline', tone: 'green', onPress: () => openList('RESOLVED') },
  ];
}

function staffTiles(
  role: string,
  user: { role: 'ADMIN' | 'AGENT' | 'END_USER' | 'L2_MANAGER'; countryId: string | null } | null,
  kpis: SafeDashboard['kpis'] | undefined,
  openList: (f: TicketNamedFilter) => void,
): Tile[] {
  const tiles: Tile[] = [
    { key: 'open', label: 'Open', value: kpis?.open, icon: 'folder-open-outline', tone: 'blue', onPress: () => openList('OPEN') },
    { key: 'inProgress', label: 'In progress', value: kpis?.inProgress, icon: 'play-circle-outline', tone: 'yellow', onPress: () => openList('IN_PROGRESS_KPI') },
    { key: 'onHold', label: 'On hold', value: kpis?.onHold, icon: 'pause-circle-outline', tone: 'slate', onPress: () => openList('ON_HOLD_KPI') },
    { key: 'slaBreached', label: 'SLA breached', value: kpis?.slaBreached, icon: 'warning-outline', tone: 'red', onPress: () => openList('BREACHED_KPI') },
    { key: 'totalOpen', label: 'Active', hint: 'right now', value: kpis?.totalOpen, icon: 'pulse-outline', tone: 'purple', onPress: () => openList('ACTIVE_KPI') },
  ];
  // Unassigned: ADMIN and the UI's triage AGENT only (brief; 04 M2; 05 §A.12) — never L2 (server 403 on assign anyway).
  if (role === 'ADMIN' || (user && isTriageAgent(user))) {
    tiles.push({ key: 'unassigned', label: 'Unassigned', value: kpis?.unassigned, icon: 'help-circle-outline', tone: 'gray', onPress: () => openList('UNASSIGNED_KPI') });
  }
  return tiles;
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
      <View className="mx-4 mb-2 flex-row items-end">
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500" accessibilityRole="header">
            {title}
          </Text>
          {caption ? <Text className="mt-0.5 text-xs text-gray-400">{caption}</Text> : null}
        </View>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
            <Text className="text-sm font-medium text-blue-700">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function TileGrid({
  tiles, loading, error, paused, onRetry,
}: {
  tiles: readonly Tile[];
  loading: boolean;
  error: unknown;
  paused: boolean;
  onRetry: () => void;
}) {
  return (
    <View>
      {error ? (
        <View className="mx-4 mb-2 rounded-xl bg-white">
          <ErrorState error={error} title="Couldn't load the counts" onRetry={onRetry} />
        </View>
      ) : null}
      {paused ? <Text className="mx-4 mb-2 text-xs text-gray-500">Counts load when you reconnect.</Text> : null}
      <View className="mx-4 flex-row flex-wrap justify-between">
        {tiles.map((t) => {
          const tone = TONES[t.tone];
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={`${t.label}${t.value !== undefined ? `: ${t.value}` : ''}. Opens the list`}
              onPress={t.onPress}
              className={`mb-2 w-[48.5%] rounded-xl p-3 active:opacity-80 ${tone.bg}`}
            >
              <View className="flex-row items-center">
                <Ionicons name={t.icon} size={18} color={tone.fg} />
                <Text className="ml-1.5 flex-1 text-sm font-medium text-gray-800" numberOfLines={1}>
                  {t.label}
                </Text>
              </View>
              {t.value !== undefined ? (
                <Text className="mt-1 text-2xl font-bold text-gray-900">{t.value}</Text>
              ) : loading ? (
                <ActivityIndicator style={{ marginTop: 8, alignSelf: 'flex-start' }} color={tone.fg} />
              ) : (
                <Text className="mt-1 text-xs text-gray-500">View tickets</Text>
              )}
              {t.hint && t.value !== undefined ? <Text className="text-xs text-gray-500">{t.hint}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Shortcut({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center rounded-full border border-gray-300 bg-white px-3 py-2 active:bg-gray-50"
    >
      <Ionicons name={icon} size={16} color="#1f2937" />
      <Text className="ml-1.5 text-sm text-gray-900">{label}</Text>
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
    body = <ActivityIndicator style={{ marginVertical: 16 }} color="#2563eb" />;
  } else if (rows.length === 0) {
    body = <EmptyState icon="ticket-outline" title={emptyText} />;
  } else {
    body = rows.map((t, i) => (
      <RecentTicketRow key={t.id} ticket={t} showRequester={showRequester} onPress={onOpen} last={i === rows.length - 1} />
    ));
  }
  return <View className="mx-4 rounded-xl bg-white px-4">{body}</View>;
}
