// M14 Knowledge base (04 §2.1 M14, 08 1.59). Read only — authoring is out of scope.
// - Categories: KB-1, public ones only (05 B.26; KB-1 itself does not filter `isPublic`).
// - Articles: KB-2, 20 per page, newest first, optionally one category. `published` is never sent (drafts, 05 C.15);
//   rows that are not published AND public are not shown.
// - Search: KB-3 only (KB-2 ignores `search`, 01 §0.6 #10), from 2 characters, debounced; published + public, max 20.
import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import {
  EmptyState, ErrorState, FilterChip, LoadingSkeleton, NO_SCROLL_ANCHOR, OfflineBanner, OfflineState, QueryBanner,
  ScreenHeader, SearchField,
} from '@/components';
import { useDebouncedValue, useKbArticles, useKbCategories, useKbSearch } from '@/hooks';
import { colors, palette } from '@/theme';
import type { KBArticleListItem, KBSearchResult, KnowledgeStackScreenProps } from '@/types';
import { formatDate } from '@/utils/format';

export function KnowledgeBaseScreen({ navigation }: KnowledgeStackScreenProps<'KnowledgeBase'>) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const term = useDebouncedValue(searchText.trim(), 350);
  const searching = searchText.trim().length > 0;

  const categories = useKbCategories();
  const articles = useKbArticles(categoryId);
  const search = useKbSearch(term);
  const [refreshing, setRefreshing] = useState(false);

  const { refreshFirstPage, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = articles;

  const openArticle = useCallback((slug: string) => navigation.navigate('KbArticle', { slug }), [navigation]);
  // Stable renderers and memoised rows (Phase P): this screen re-renders on every keystroke in the search box.
  const renderSearchRow = useCallback<ListRenderItem<KBSearchResult>>(({ item }) => <SearchRow result={item} onPress={openArticle} />, [openArticle]);
  const renderArticleRow = useCallback<ListRenderItem<KBArticleListItem>>(({ item }) => <ArticleRow article={item} onPress={openArticle} />, [openArticle]);

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      if (searching && term.length >= 2) await search.refetch();
      else await Promise.all([categories.refetch(), refreshFirstPage()]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !refreshing && !offline) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, refreshing, offline, fetchNextPage]);

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />;

  let content;
  if (searching) {
    if (term.length < 2) {
      content = <EmptyState icon="search-outline" title="Keep typing" message="Search starts at 2 characters." />;
    } else if (!search.data && search.fetchStatus === 'paused') {
      content = <OfflineState what="Search results" />;
    } else if (!search.data && search.isError) {
      content = <ErrorState error={search.error} title="Search failed" onRetry={() => void search.refetch()} />;
    } else if (!search.data) {
      content = <LoadingSkeleton variant="articles" rows={3} />;
    } else {
      content = (
        <FlashList
          data={search.data}
          keyExtractor={rowKey}
          maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
          renderItem={renderSearchRow}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text className="mx-4 mb-2 text-xs text-gray-500">
              {search.data.length === 20 ? 'Top 20 matches' : `${search.data.length} ${search.data.length === 1 ? 'match' : 'matches'}`} for “{term}”
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={`No articles match “${term}”`}
              message="Search covers titles, article text and tags."
              actionLabel="Clear search"
              onAction={() => setSearchText('')}
            />
          }
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={refreshControl}
        />
      );
    }
  } else if (!articles.data && articles.fetchStatus === 'paused') {
    content = <OfflineState what="Articles" />;
  } else if (!articles.data && articles.isError) {
    content = <ErrorState error={articles.error} title="Couldn't load articles" onRetry={() => void articles.refetch()} />;
  } else if (!articles.data) {
    content = <LoadingSkeleton variant="articles" rows={4} />;
  } else {
    content = (
      <FlashList
        data={articles.articles}
        keyExtractor={rowKey}
        maintainVisibleContentPosition={NO_SCROLL_ANCHOR}
        renderItem={renderArticleRow}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          categoryId ? (
            <EmptyState
              icon="book-outline"
              title="No articles in this category yet"
              message="Published articles in this category will appear here."
              actionLabel="Show all articles"
              onAction={() => setCategoryId(null)}
            />
          ) : (
            <EmptyState icon="book-outline" title="No articles here yet" message="Published articles will appear here." />
          )
        }
        ListFooterComponent={
          hasNextPage && offline ? (
            <Text className="py-4 text-center text-xs text-gray-500">More articles load when you reconnect.</Text>
          ) : isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
          ) : isFetchNextPageError ? (
            <Pressable accessibilityRole="button" onPress={() => void fetchNextPage()} className="items-center py-4 active:opacity-60">
              <Text className="text-sm text-red-700">Couldn't load more articles.</Text>
              <Text className="mt-1 text-sm font-semibold text-blue-700">Tap to retry</Text>
            </Pressable>
          ) : null
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={refreshControl}
      />
    );
  }

  const categoryOptions = categories.data ?? [];

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Knowledge base" variant="back" />
      <OfflineBanner />
      <View className="border-b border-border bg-white px-4 py-2">
        <SearchField
          value={searchText}
          onChangeText={setSearchText}
          onClear={() => setSearchText('')}
          returnKeyType="search"
          placeholder="Search articles"
          accessibilityLabel="Search knowledge base articles"
        />
        {!searching ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-2"
            contentContainerClassName="gap-2 py-1"
            keyboardShouldPersistTaps="handled"
          >
            <FilterChip label="All" active={categoryId === null} onPress={() => setCategoryId(null)} />
            {categoryOptions.map((c) => (
              <FilterChip
                key={c.id}
                label={c.depth > 0 ? `· ${c.name}` : c.name}
                active={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
            {categories.isPending && categories.fetchStatus === 'fetching' ? <LoadingSkeleton variant="chips" rows={3} /> : null}
            {categories.isError && !categories.data ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Categories didn't load. ${describeError(categories.error)} Tap to retry.`}
                onPress={() => void categories.refetch()}
                hitSlop={4}
                className="h-9 flex-row items-center rounded-full border border-red-200 bg-red-50 px-3 active:opacity-70"
              >
                <Ionicons name="refresh" size={14} color={palette.red[700]} />
                <Text className="ml-1 text-sm text-red-800">Categories didn't load · Retry</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
      <QueryBanner
        error={searching ? search.error : isFetchNextPageError ? null : articles.error}
        hasData={searching ? !!search.data : !!articles.data}
        onRetry={() => void onRefresh()}
      />
      {content}
    </View>
  );
}

/** Article tags: grey pills, the badge shape (UI-STANDARDS S9). Shared with the article screen's look. */
function Tags({ tags }: { tags: readonly string[] | undefined }) {
  const list = Array.isArray(tags) ? tags.filter((t) => typeof t === 'string' && t.trim()).slice(0, 4) : [];
  if (list.length === 0) return null;
  return (
    <View className="mt-2 flex-row flex-wrap gap-1.5">
      {list.map((t) => (
        <View key={t} className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: colors.badgeFallback.bg }}>
          <Text className="text-xs" style={{ color: colors.badgeFallback.fg }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

const rowKey = (row: { id: string }) => row.id;

const ArticleRow = memo(function ArticleRow({ article, onPress }: { article: KBArticleListItem; onPress: (slug: string) => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(article.slug)} className="mx-4 mb-3 rounded-xl border border-border bg-white p-4 active:opacity-80">
      {article.category?.name ? <Text className="mb-0.5 text-xs font-medium text-blue-700">{article.category.name}</Text> : null}
      <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
        {article.title || 'Untitled article'}
      </Text>
      {article.excerpt ? (
        <Text className="mt-1 text-sm text-gray-700" numberOfLines={3}>
          {article.excerpt}
        </Text>
      ) : null}
      <Tags tags={article.tags} />
      <Text className="mt-2 text-xs text-gray-500">
        {article.publishedAt ? `Published ${formatDate(article.publishedAt)}` : 'Published'}
        {typeof article.helpfulCount === 'number' && article.helpfulCount > 0 ? ` · ${article.helpfulCount} found it helpful` : ''}
      </Text>
    </Pressable>
  );
});

const SearchRow = memo(function SearchRow({ result, onPress }: { result: KBSearchResult; onPress: (slug: string) => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(result.slug)} className="mx-4 mb-3 rounded-xl border border-border bg-white p-4 active:opacity-80">
      <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
        {result.title || 'Untitled article'}
      </Text>
      {result.excerpt ? (
        <Text className="mt-1 text-sm text-gray-700" numberOfLines={3}>
          {result.excerpt}
        </Text>
      ) : null}
      <Tags tags={result.tags} />
    </Pressable>
  );
});
