// Service catalogue (Phase G4; drawer "Service Request"). The web's /service-catalog page, with its two views
// (FE:pages/service-catalog/ServiceCatalogPage.tsx; docs/G4-WEB-CATALOGUE.md §2, §6):
// - Catalog: categories (SCR-1) with their item counts, then a category's items (SCR-2); the search box filters items
//   by name or description across every category, on the device, as the web. Tapping an item opens its form.
// - My Requests: newest first (SCR-4), as the web lists them (G5): every request for ADMIN, AGENT and L2_MANAGER, the
//   person's own for END_USER (serviceCatalogPermissions().everyonesRequests). Tapping one of the person's OWN requests
//   opens its detail, which the web does not have; other people's rows are not links, as on the web.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, FilterChip, ListEntry, ListEntryScope, LoadingSkeleton, NO_SCROLL_ANCHOR, OfflineBanner,
  OfflineState, QueryBanner, ScreenHeader, SearchField, StatusBadge,
} from '@/components';
import { useMyServiceRequests, useServiceCategories, useServiceItems } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { CatalogStackScreenProps, ServiceCategory, ServiceItem, ServiceRequest } from '@/types';
import { formatDateTime } from '@/utils/format';
import { isOwnServiceRequest, serviceCatalogPermissions, type ServiceCatalogPermissions } from '@/utils/permissions';
import { categoryItemCount, filterCatalogItems, itemCountLabel, requestRef } from '@/utils/service-catalog';

type Tab = 'catalog' | 'requests';

/** The web's icon names (ServiceCatalogPage.tsx:18-20) as Ionicons; anything else: a box (category) or a document (item). */
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  mail: 'mail-outline',
  box: 'cube-outline',
  globe: 'globe-outline',
  settings: 'settings-outline',
  file: 'document-text-outline',
};

function iconFor(icon: string | null | undefined, fallback: keyof typeof Ionicons.glyphMap): keyof typeof Ionicons.glyphMap {
  return (icon && ICONS[icon]) || fallback;
}

export function ServiceCatalogScreen({ navigation, route }: CatalogStackScreenProps<'ServiceCatalog'>) {
  const viewer = useAuthStore((s) => s.user);
  const can = serviceCatalogPermissions(viewer);
  const [view, setView] = useState<Tab>(route.params?.view ?? 'catalog');
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [search, setSearch] = useState('');

  // After "Add Request" the web reopens /service-catalog: the catalogue's Home view, no category, no search.
  const resetAt = route.params?.resetAt;
  const requestedView = route.params?.view;
  useEffect(() => {
    if (resetAt === undefined) return;
    setView(requestedView ?? 'catalog');
    setCategory(null);
    setSearch('');
  }, [resetAt, requestedView]);

  // Android back: leave the open category or the search first, as the web's "Home" breadcrumb does.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (view !== 'catalog' || (!category && !search)) return false;
        setCategory(null);
        setSearch('');
        return true;
      });
      return () => sub.remove();
    }, [view, category, search]),
  );
  // Stable (Phase P): passed to every memoised service row.
  const openItem = useCallback((item: ServiceItem) => navigation.navigate('ServiceRequestForm', { itemId: item.id }), [navigation]);

  if (!can.browse) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="Service Request" variant="back" />
        <EmptyState icon="lock-closed-outline" title="Not available for your role" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Service Request" variant="back" />
      <OfflineBanner />
      <View className="border-b border-border bg-white px-4 py-2">
        {/* The web's two buttons, "Catalog" and "My Requests" (ServiceCatalogPage.tsx:174-187). */}
        <View className="flex-row gap-2 py-1" accessibilityRole="tablist">
          <FilterChip
            label="Catalog"
            icon="file-tray-outline"
            active={view === 'catalog'}
            onPress={() => {
              setView('catalog');
              setCategory(null); // the web's Catalog button also clears the category and the search (:176)
              setSearch('');
            }}
          />
          {can.myRequests ? (
            <FilterChip label="My Requests" icon="send-outline" active={view === 'requests'} onPress={() => setView('requests')} />
          ) : null}
        </View>
        {view === 'catalog' ? (
          <View className="mt-2">
            <SearchField
              value={search}
              onChangeText={setSearch}
              onClear={() => setSearch('')}
              returnKeyType="search"
              placeholder="Search services..."
              accessibilityLabel="Search services"
            />
            {category ? (
              <View className="mt-2 flex-row items-center">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to all categories"
                  onPress={() => {
                    setCategory(null);
                    setSearch('');
                  }}
                  hitSlop={8}
                  className="min-h-11 flex-row items-center active:opacity-60"
                >
                  <Ionicons name="home-outline" size={18} color={palette.blue[700]} />
                  <Text className="ml-1 text-sm font-medium text-blue-700">Home</Text>
                </Pressable>
                <Ionicons name="chevron-forward" size={14} color={colors.text.muted} style={{ marginHorizontal: 4 }} />
                <Text className="flex-1 text-sm font-medium text-gray-700" numberOfLines={1}>
                  {category.name}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {view === 'catalog' ? (
        <CatalogView
          category={category}
          search={search}
          onOpenCategory={setCategory}
          onClear={() => {
            setCategory(null);
            setSearch('');
          }}
          onOpenItem={openItem}
        />
      ) : (
        <MyRequestsView
          can={can}
          canOpen={(request) => isOwnServiceRequest(viewer, request)}
          onOpen={(request) => navigation.navigate('ServiceRequestDetail', { requestId: request.id })}
          onBrowse={() => setView('catalog')}
        />
      )}
    </View>
  );
}

// ── Catalog ──────────────────────────────────────────────────

function CatalogView({
  category, search, onOpenCategory, onClear, onOpenItem,
}: {
  category: ServiceCategory | null;
  search: string;
  onOpenCategory: (c: ServiceCategory) => void;
  onClear: () => void;
  onOpenItem: (item: ServiceItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const categories = useServiceCategories();
  const items = useServiceItems();
  const [refreshing, setRefreshing] = useState(false);
  const home = !category && !search.trim();

  const allItems = useMemo(() => items.data ?? [], [items.data]);
  const shown = useMemo(() => filterCatalogItems(allItems, category?.id ?? null, search), [allItems, category, search]);
  // Phase P: each category's count once per item list, not once per row per render; stable renderers, memoised rows.
  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const c of categories.data ?? []) byCategory.set(c.id, categoryItemCount(allItems, c.id));
    return byCategory;
  }, [categories.data, allItems]);
  const renderCategory = useCallback<ListRenderItem<ServiceCategory>>(
    ({ item, index }) => (
      <ListEntry index={index}>
        <CategoryRow category={item} count={counts.get(item.id) ?? 0} onOpen={onOpenCategory} />
      </ListEntry>
    ),
    [counts, onOpenCategory],
  );
  const renderService = useCallback<ListRenderItem<ServiceItem>>(
    ({ item, index }) => (
      <ListEntry index={index}>
        <ServiceRow item={item} onOpen={onOpenItem} />
      </ListEntry>
    ),
    [onOpenItem],
  );

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await Promise.all([categories.refetch(), items.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />;
  const contentStyle = { paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 };

  // Both lists are needed on Home (the counts come from the items); a category or a search needs only the items.
  const needed = home ? [categories, items] : [items];
  const missing = needed.find((q) => !q.data);
  const failed = needed.find((q) => q.error);
  const banner = <QueryBanner error={failed?.error ?? null} hasData={!missing} onRetry={() => void onRefresh()} />;

  if (missing) {
    if (missing.fetchStatus === 'paused') return <OfflineState what="The catalogue" />;
    if (missing.isError) return <ErrorState error={missing.error} title="Couldn't load the catalogue" onRetry={() => void missing.refetch()} />;
    return <LoadingSkeleton variant="articles" rows={4} />;
  }

  if (home) {
    const list = categories.data ?? [];
    return (
      <ListEntryScope>
        {banner}
        <FlashList
          data={list}
          keyExtractor={rowKey}
          maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            list.length > 0 ? (
              <Text accessibilityRole="header" className="mx-4 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Choose a category to raise your request
              </Text>
            ) : null
          }
          renderItem={renderCategory}
          ListEmptyComponent={
            <EmptyState illustration="empty" title="No service categories yet" message="Services you can request will appear here." />
          }
          contentContainerStyle={contentStyle}
          refreshControl={refreshControl}
        />
      </ListEntryScope>
    );
  }

  const heading = search.trim() ? `Search: ${search}` : (category?.name ?? '');
  return (
    <ListEntryScope>
      {banner}
      <FlashList
        data={shown}
        keyExtractor={rowKey}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="mx-4 mb-2 flex-row items-center">
            <Text accessibilityRole="header" className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500" numberOfLines={1}>
              {heading}
            </Text>
            <Text className="ml-2 text-xs text-gray-500">{itemCountLabel(shown.length)}</Text>
          </View>
        }
        renderItem={renderService}
        ListEmptyComponent={
          <EmptyState
            illustration="empty"
            title="No matching service templates"
            message={search.trim() ? 'Search covers service names and descriptions, in every category.' : 'This category has no services yet.'}
            actionLabel="Show all categories"
            onAction={onClear}
          />
        }
        contentContainerStyle={contentStyle}
        refreshControl={refreshControl}
      />
    </ListEntryScope>
  );
}

const rowKey = (row: { id: string }) => row.id;

/** A category on the catalogue's Home view, with its item count. Memoised (Phase P). */
const CategoryRow = memo(function CategoryRow({
  category, count, onOpen,
}: {
  category: ServiceCategory;
  count: number;
  onOpen: (category: ServiceCategory) => void;
}) {
  return (
    <CatalogRow
      icon={iconFor(category.icon, 'cube-outline')}
      title={category.name}
      description={category.description}
      trailing={<Text className="text-xs text-gray-500">{itemCountLabel(count)}</Text>}
      onPress={() => onOpen(category)}
    />
  );
});

/** A service in a category or in search results. Memoised (Phase P). */
const ServiceRow = memo(function ServiceRow({ item, onOpen }: { item: ServiceItem; onOpen: (item: ServiceItem) => void }) {
  return (
    <CatalogRow
      icon={iconFor(item.icon, 'document-text-outline')}
      title={item.name}
      description={item.description}
      descriptionLines={1}
      trailing={
        item.requiresApproval ? (
          <View className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5">
            <Text className="text-xs font-medium text-amber-700">Requires approval</Text>
          </View>
        ) : null
      }
      onPress={() => onOpen(item)}
    />
  );
});

function CatalogRow({
  icon, title, description, descriptionLines = 2, trailing, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string | null;
  descriptionLines?: number;
  trailing: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="mx-4 mb-3 flex-row items-center rounded-xl border border-border bg-white p-4 active:opacity-80"
    >
      {/* The web's icon square: `bg-blue-100 text-blue-600` (ServiceCatalogPage.tsx:429, :463). */}
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
        <Ionicons name={icon} size={20} color={palette.blue[700]} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
          {title || 'Untitled'}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={descriptionLines}>
            {description}
          </Text>
        ) : null}
        {trailing ? <View className="mt-1.5 flex-row">{trailing}</View> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text.muted} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

// ── My Requests ──────────────────────────────────────────────

function MyRequestsView({
  can, canOpen, onOpen, onBrowse,
}: {
  can: ServiceCatalogPermissions;
  /** The detail opens for the person's own requests only (isOwnServiceRequest). */
  canOpen: (r: ServiceRequest) => boolean;
  onOpen: (r: ServiceRequest) => void;
  onBrowse: () => void;
}) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const list = useMyServiceRequests();
  const [refreshing, setRefreshing] = useState(false);
  const { requests, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = list;
  // Stable while this view re-renders on its own (paging, refresh), so loaded rows are not redone (Phase P).
  const renderRequest = useCallback<ListRenderItem<ServiceRequest>>(
    ({ item, index }) => {
      const own = canOpen(item);
      return (
        <ListEntry index={index}>
          <RequestRow request={item} own={own} onPress={own ? () => onOpen(item) : undefined} />
        </ListEntry>
      );
    },
    [canOpen, onOpen],
  );

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await list.refetch();
    } finally {
      setRefreshing(false);
    }
  };
  const loadMore = useCallback(() => {
    if (requests.length > 0 && hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !offline) void fetchNextPage();
  }, [requests.length, hasNextPage, isFetchingNextPage, isFetchNextPageError, offline, fetchNextPage]);

  if (!list.data) {
    if (list.fetchStatus === 'paused') return <OfflineState what="Your requests" />;
    if (list.isError) return <ErrorState error={list.error} title="Couldn't load your requests" onRetry={() => void list.refetch()} />;
    return <LoadingSkeleton variant="list" rows={4} />;
  }

  return (
    <ListEntryScope>
      <QueryBanner error={isFetchNextPageError ? null : list.error} hasData onRetry={() => void onRefresh()} />
      <FlashList
        data={requests}
        keyExtractor={rowKey}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        renderItem={renderRequest}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          requests.length === 0 ? null : (
            <Text className="mx-4 mb-2 text-xs text-gray-500">
              {can.everyonesRequests
                ? "Every service request, newest first, as on the web portal. Yours open to show their details."
                : 'Requests you sent, newest first.'}
            </Text>
          )
        }
        ListEmptyComponent={
          isFetchingNextPage ? (
            <LoadingSkeleton variant="list" rows={2} topGap={false} />
          ) : (
            <EmptyState
              illustration="empty"
              title="No service requests yet"
              message="Requests you send from the catalogue appear here."
              actionLabel="Browse the catalogue"
              onAction={onBrowse}
            />
          )
        }
        ListFooterComponent={
          requests.length === 0 ? null : hasNextPage && offline ? (
            <Text className="py-4 text-center text-xs text-gray-500">Older requests load when you reconnect.</Text>
          ) : isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
          ) : isFetchNextPageError ? (
            <Pressable accessibilityRole="button" onPress={() => void fetchNextPage()} className="items-center py-4 active:opacity-60">
              <Text className="text-sm text-red-700">Couldn't load older requests.</Text>
              <Text className="mt-1 text-sm font-semibold text-blue-700">Tap to retry</Text>
            </Pressable>
          ) : null
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      />
    </ListEntryScope>
  );
}

/**
 * A My Requests row: the web's columns (# SR-n, Service, Status, Requested; ServiceCatalogPage.tsx:333-352), and no
 * requester column, as on the web. Only the person's own rows are links (to the mobile-only detail).
 */
const RequestRow = memo(function RequestRow({ request, own, onPress }: { request: ServiceRequest; own: boolean; onPress?: () => void }) {
  const body = (
    <>
      <View className="flex-row items-center">
        <Text className="flex-1 text-xs font-semibold text-gray-500">{requestRef(request.requestNumber)}</Text>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} /> : null}
      </View>
      <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
        {request.serviceItem?.name || '—'}
      </Text>
      <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
        <StatusBadge status={request.status} recordId={request.id} />
      </View>
      <Text className="mt-2 text-xs text-gray-500">
        Requested {own ? 'by you, ' : ''}{formatDateTime(request.createdAt)}
      </Text>
    </>
  );
  const className = 'mx-4 mb-3 rounded-xl border border-border bg-white p-4';
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} className={`${className} active:opacity-80`}>
      {body}
    </Pressable>
  ) : (
    <View className={className}>{body}</View>
  );
});
