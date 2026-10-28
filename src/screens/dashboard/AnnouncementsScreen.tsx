// M16 Announcements (04 §2.1 M16; drawer item for every role, 08 S1). ANN-1, read-only — ADMIN management is out of
// scope. The server's order is kept (pinned first, then type, then newest; 01 ANN-1). Bodies are server HTML and go
// through the same safe renderer as ticket comments (HtmlText). Dismissing on Home hides one from the Home banner for
// this session only; it stays listed here, with a way to show it on Home again.
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #24): registered in the Home stack (from Home's banner) and the More stack (its
// row), with the native navigation bar.
import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { useIsOffline } from '@/api/network';
import {
  AnnouncementCard, EmptyState, ErrorState, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR, OfflineBanner,
  OfflineState, QueryBanner,
} from '@/components';
import { useAnnouncements } from '@/hooks';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { SharedStackScreenProps } from '@/types';

export function AnnouncementsScreen(_props: SharedStackScreenProps<'Announcements'>) {
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
        renderItem={({ item, index }) => (
          <ListEntry index={index}>
            <AnnouncementCard announcement={item} hiddenOnHome={dismissed.includes(item.id)} onShowOnHome={restore} />
          </ListEntry>
        )}
        ListEmptyComponent={
          <EmptyState illustration="empty" title="No announcements" message="Service Desk announcements for your role will appear here." />
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner />
      <QueryBanner error={query.error} hasData={hasData} onRetry={() => void onRefresh()} />
      <ListEntryScope>{content}</ListEntryScope>
    </View>
  );
}

const announcementKey = (a: { id: string }) => a.id;
