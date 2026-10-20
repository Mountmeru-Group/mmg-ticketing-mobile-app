// M15 KB article (04 §2.1 M15). KB-4 by slug; "Was this helpful?" is KB-5 by id.
// - Shown only when published AND public (01 KB-4: drafts are reachable by slug). A 403 means non-public: same message.
// - The body is server HTML rendered by HtmlText — the same sanitiser and native renderer as ticket comments
//   (no WebView, no script, no remote images; links open in the browser, ticket links open in the app).
// - One helpful vote per article per device (no server de-duplication, 01 KB-5), confirmed first: it can't be undone.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiClientError } from '@/api/errors';
import { useIsOffline } from '@/api/network';
import {
  Card, EmptyState, ErrorState, HtmlText, LoadingSkeleton, OfflineBanner, OfflineState, OutlineButton, QueryBanner,
  ScreenHeader,
} from '@/components';
import { useKbArticle, useKbHelpfulVote, useKbVoted, useSingleFlight } from '@/hooks';
import { colors, palette } from '@/theme';
import type { KnowledgeStackScreenProps } from '@/types';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import { formatDate, formatDisplayName } from '@/utils/format';
import { isReadableArticle } from '@/utils/kb';

export function KbArticleScreen({ route }: KnowledgeStackScreenProps<'KbArticle'>) {
  const { slug } = route.params;
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const query = useKbArticle(slug);
  const article = query.data;
  const { voted, markVoted } = useKbVoted(article?.id);
  const vote = useKbHelpfulVote();
  const once = useSingleFlight();
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

  const onVote = () =>
    void once(async () => {
      if (!article || voted) return;
      const ok = await confirmAction({
        title: 'Mark as helpful?',
        message: 'Your vote is added to this article’s helpful count. You can vote once per article on this device, and it can’t be undone.',
        confirmLabel: 'Yes, it helped',
      });
      if (!ok) return;
      try {
        await vote.mutateAsync({ article, alreadyVoted: !!voted });
        markVoted();
        notify('Thanks for your feedback');
      } catch (e) {
        reportWriteError("Couldn't record your vote", e);
      }
    });

  const notAvailable =
    (article && !isReadableArticle(article)) ||
    (!article && query.error instanceof ApiClientError && (query.error.status === 403 || query.error.status === 404));

  let content;
  if (notAvailable) {
    content = (
      <EmptyState
        icon="document-lock-outline"
        title="This article isn't available"
        message="It may be unpublished, private or removed. Only published, public articles can be read in the app."
      />
    );
  } else if (!article && query.fetchStatus === 'paused') {
    content = <OfflineState what="This article" />;
  } else if (!article && query.isError) {
    content = <ErrorState error={query.error} title="Couldn't load this article" onRetry={() => void query.refetch()} />;
  } else if (!article) {
    content = <LoadingSkeleton variant="article" />;
  } else {
    const author = formatDisplayName(article.author?.displayName);
    const tags = Array.isArray(article.tags) ? article.tags.filter((t) => typeof t === 'string' && t.trim()) : [];
    content = (
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <Card>
          {article.category?.name ? <Text className="mb-1 text-xs font-medium text-blue-700">{article.category.name}</Text> : null}
          <Text selectable className="text-lg font-bold text-gray-900">
            {article.title || 'Untitled article'}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">
            {article.publishedAt ? `Published ${formatDate(article.publishedAt)}` : 'Published'}
            {author ? ` · ${author}` : ''}
            {typeof article.viewCount === 'number' ? ` · ${article.viewCount} views` : ''}
          </Text>
          {tags.length > 0 ? (
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {tags.map((t) => (
                <View key={t} className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: colors.badgeFallback.bg }}>
                  <Text className="text-xs" style={{ color: colors.badgeFallback.fg }}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        <Card>
          <HtmlText html={article.body} collapsedHeight={100_000} horizontalInset={66} emptyText="This article has no text." />
        </Card>

        <Card>
          <Text className="text-sm font-semibold text-gray-900">Was this helpful?</Text>
          <Text className="mt-0.5 text-xs text-gray-500">
            {typeof article.helpfulCount === 'number' ? `${article.helpfulCount} ${article.helpfulCount === 1 ? 'person' : 'people'} found this helpful.` : ''}
          </Text>
          {voted ? (
            <View className="mt-3 flex-row items-center">
              <Ionicons name="checkmark-circle" size={18} color={palette.green[600]} />
              <Text className="ml-1.5 text-sm text-gray-700">You marked this as helpful on this device.</Text>
            </View>
          ) : (
            <View className="mt-3 self-start">
              <OutlineButton
                icon="thumbs-up-outline"
                label="Yes, this helped"
                onPress={onVote}
                disabled={voted === null}
                loading={vote.isPending}
              />
            </View>
          )}
        </Card>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title="Article" variant="back" />
      <OfflineBanner />
      <QueryBanner error={notAvailable ? null : query.error} hasData={!!article} onRetry={() => void onRefresh()} />
      {content}
    </View>
  );
}
