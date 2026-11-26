// Analytics, screen one (2026-11-26, ADMIN only): the app, people, where, what they did. ANL-1 and ANL-4
// (docs/ANALYTICS-BACKEND.md, NOT YET DEPLOYED); the rules for each figure: utils/analytics.ts.
// - Gate: the Analytics stack is registered for ADMIN alone (utils/permissions.ts canViewAnalytics, drawerRoutes), the
//   hooks send nothing for anyone else, and this screen refuses to render for them too (after its hooks).
// - The period: four chips under the header (Today, Last 7 days, Last 30 days, Last 90 days), default Last 30 days,
//   kept in memory only (ui.store analyticsRange), and read by screens two and three too.
// - Sections, in order, each left out when it has nothing to show:
//     1. The app (ANL-4): "Google Play · as at <dataThrough>", the dark banner, four tiles. ANL-4 not deployed: the
//        whole section is absent, and the rest of the screen still works.
//     2. People (ANL-1): four tiles, then "Of N people with access, N% used Setu this month".
//     3. Where (ANL-1 devices.byCountry): a bar per country.
//     4. What they did (ANL-1 actions): the total, then a bar per action, in the audit log's words.
//   Then a row to screen two with the number of people, and the footnote about Play's lag.
// - Not deployed (an HTML answer): one plain line, no error box, no retry. A JSON error: the error state, with Retry.
// - Pull-to-refresh asks both again. Nothing else does: no polling, no refetch on focus (hooks/useAnalytics.ts).
import { useCallback, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, LoadingSkeleton, OfflineBanner, OfflineState, QueryBanner, ScreenHeader,
} from '@/components';
import { useAnalyticsInstalls, useAnalyticsOverview } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { AnalyticsStackScreenProps } from '@/types';
import {
  actionBars, actionsTotal, adoptionLine, countryBars, formatCount, peopleCount, peopleTiles, playSection,
} from '@/utils/analytics';
import { canViewAnalytics } from '@/utils/permissions';
import { BarList, LinkRow, NotAvailableLine, PlayBanner, RangeRow, Section, TileGrid } from './AnalyticsParts';

export const NOT_AVAILABLE_TEXT = "Analytics isn't available yet. The Service Desk hasn't switched it on.";
export const OVERVIEW_NOT_AVAILABLE_TEXT = "Service Desk figures aren't available yet.";
export const PLAY_FOOTNOTE = 'Google Play figures settle a day or two late. Service Desk figures are current.';

export function AnalyticsScreen({ navigation }: AnalyticsStackScreenProps<'AnalyticsOverview'>) {
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const range = useUiStore((s) => s.analyticsRange);
  const setRange = useUiStore((s) => s.setAnalyticsRange);
  const offline = useIsOffline();

  const overview = useAnalyticsOverview(range);
  const installs = useAnalyticsInstalls(range);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await Promise.all([overview.refetch(), installs.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [offline, overview.refetch, installs.refetch]);

  // Unreachable for anyone else (the route is not registered for them); kept so this screen can never show analytics
  // to a role the server would refuse.
  if (!canViewAnalytics(role)) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="Analytics" variant="back" />
        <EmptyState icon="lock-closed-outline" title="Admins only" message="Analytics is available to administrators." />
      </View>
    );
  }

  const overviewData = overview.data?.deployed ? overview.data.data : null;
  const installsData = installs.data?.deployed ? installs.data.data : null;
  const overviewMissing = overview.data?.deployed === false;
  const installsMissing = installs.data?.deployed === false;

  const staleError = (overview.data && overview.error) || (installs.data && installs.error) || null;

  const play = playSection(installsData);
  const people = peopleTiles(overviewData);
  const adoption = adoptionLine(overviewData);
  const countries = countryBars(overviewData);
  const actionTotal = actionsTotal(overviewData);
  const actions = actionBars(overviewData);
  const count = peopleCount(overviewData);

  const blocks: ReactNode[] = [];

  if (overviewMissing && installsMissing) {
    blocks.push(<NotAvailableLine key="none" text={NOT_AVAILABLE_TEXT} />);
  } else {
    // 1. The app (Google Play). Absent when ANL-4 is not deployed or sent no Play figure.
    if (play) {
      blocks.push(
        <Section key="app" title="The app" source={play.heading}>
          <PlayBanner figures={play.banner} />
          <TileGrid figures={play.tiles} />
        </Section>,
      );
    } else if (!installsData && !installsMissing) {
      blocks.push(<QueryBlock key="app" title="The app" query={installs} what="Google Play figures" />);
    }

    // 2–4. The Service Desk's own figures.
    if (overviewMissing) {
      blocks.push(<NotAvailableLine key="overview-missing" text={OVERVIEW_NOT_AVAILABLE_TEXT} />);
    } else if (!overviewData) {
      blocks.push(<QueryBlock key="overview" title="People" query={overview} what="The Service Desk's figures" />);
    } else {
      if (people.length > 0 || adoption) {
        blocks.push(
          <Section key="people" title="People">
            <TileGrid figures={people} />
            {adoption ? <Text className={`text-sm text-gray-700 ${people.length > 0 ? 'mt-3' : ''}`}>{adoption}</Text> : null}
          </Section>,
        );
      }
      if (countries.length > 0) {
        blocks.push(
          <Section key="where" title="Where">
            <BarList bars={countries} />
          </Section>,
        );
      }
      if (actionTotal || actions.length > 0) {
        blocks.push(
          <Section key="what" title="What they did">
            {actionTotal ? (
              <Text className={`text-sm text-gray-700 ${actions.length > 0 ? 'mb-3' : ''}`}>
                <Text className="text-xl font-bold text-gray-900">{actionTotal}</Text> actions in all
              </Text>
            ) : null}
            <BarList bars={actions} />
          </Section>,
        );
      }
      if (people.length === 0 && !adoption && countries.length === 0 && !actionTotal && actions.length === 0) {
        blocks.push(<NotAvailableLine key="overview-empty" text="The Service Desk sent no figures for this period." />);
      }
      blocks.push(
        <LinkRow
          key="people-link"
          icon="people-outline"
          label="Who is using Setu"
          detail={count !== null ? `${formatCount(count)} ${count === 1 ? 'person' : 'people'}` : undefined}
          onPress={() => navigation.navigate('AnalyticsUsers')}
        />,
      );
    }

    if (play) {
      blocks.push(
        <Text key="footnote" className="mx-4 mt-1 text-xs text-gray-500">
          {PLAY_FOOTNOTE}
        </Text>,
      );
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Analytics" variant="back" />
      <OfflineBanner />
      <RangeRow range={range} onPick={setRange} />
      {/* A refresh that failed while the last answer is still on screen (as the audit log). A query with no answer yet
          shows its error in its own section instead (QueryBlock). */}
      <QueryBanner error={staleError} hasData={staleError !== null} onRetry={() => void onRefresh()} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {blocks}
      </ScrollView>
    </View>
  );
}

/** A query that has no answer yet: loading, waiting for the network, or a real (JSON) error, with Retry. */
function QueryBlock({
  title, query, what,
}: {
  title: string;
  query: { isError: boolean; error: unknown; fetchStatus: string; refetch: () => unknown };
  what: string;
}) {
  if (query.fetchStatus === 'paused') return <OfflineState what={what} />;
  if (query.isError) {
    return (
      <Section title={title}>
        <ErrorState error={query.error} title="Couldn't load analytics" onRetry={() => void query.refetch()} />
      </Section>
    );
  }
  return (
    <Section title={title}>
      <LoadingSkeleton variant="lines" rows={3} />
    </Section>
  );
}
