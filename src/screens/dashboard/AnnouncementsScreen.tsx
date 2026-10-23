// M16 Announcements (04 §2.1 M16; drawer item for every role, 08 S1). ANN-1, read-only — ADMIN management is out of
// scope. The server's order is kept (pinned first, then type, then newest; 01 ANN-1). Bodies are server HTML and go
// through the same safe renderer as ticket comments (HtmlText). Dismissing on Home hides one from the Home banner for
// this session only; it stays listed here, with a way to show it on Home again.
import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  AnnouncementCard, EmptyState, ErrorState, LoadingSkeleton, NO_SCROLL_ANCHOR, OfflineBanner, OfflineState, QueryBanner,
  ScreenHeader,
} from '@/components';
import { useAnnouncements } from '@/hooks';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { AppDrawerScreenProps } from '@/types';

export function AnnouncementsScreen(_props: AppDrawerScreenProps<'Announcements'>) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const query = useAnnouncements();
  const dismissed = useUiStore((s) => s.dismissedAnnouncementIds);
  const restore = useUiStore((s) => s.restoreAnnouncement);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const hasData = query.data !== undefined;
  let content;
  if (!hasData && query.fetchStatus === 'paused') {
    content = <OfflineState what="Announcements" />;
  } else if (!hasData && query.isError) {
    content = <ErrorState error={query.error} title="Couldn't load announcements" onRetry={() => void query.refetch()} />;
  } else if (!hasData) {
    content = <LoadingSkeleton variant="announcements" rows={3} />;
  } else {
    content = (
      <FlashList
        data={query.data}
        keyExtractor={announcementKey}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        renderItem={({ item }) => <AnnouncementCard announcement={item} hiddenOnHome={dismissed.includes(item.id)} onShowOnHome={restore} />}
        ListEmptyComponent={
          <EmptyState icon="megaphone-outline" title="No announcements" message="Service Desk announcements for your role will appear here." />
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Announcements" variant="back" />
      <OfflineBanner />
      <QueryBanner error={query.error} hasData={hasData} onRetry={() => void onRefresh()} />
      {content}
    </View>
  );
}

const announcementKey = (a: { id: string }) => a.id;
