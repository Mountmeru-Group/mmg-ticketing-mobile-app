// ANN-1 announcements: the type chip, the Home banner and the full card (M16). Bodies are server HTML and go through
// the one safe renderer (HtmlText).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import type { Announcement, AnnouncementType } from '@/types';
import { formatDate, formatDisplayName } from '@/utils/format';
import { htmlToDisplayText } from '@/utils/html';
import { HtmlText } from './HtmlText';

const TYPE_STYLES: Record<AnnouncementType, { label: string; chip: string; text: string; banner: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  INFO: { label: 'Info', chip: 'bg-blue-100', text: 'text-blue-800', banner: 'border-blue-200 bg-blue-50', icon: 'information-circle', color: '#1d4ed8' },
  WARNING: { label: 'Warning', chip: 'bg-amber-100', text: 'text-amber-800', banner: 'border-amber-200 bg-amber-50', icon: 'warning', color: '#b45309' },
  CRITICAL: { label: 'Critical', chip: 'bg-red-100', text: 'text-red-800', banner: 'border-red-200 bg-red-50', icon: 'alert-circle', color: '#b91c1c' },
  MAINTENANCE: { label: 'Maintenance', chip: 'bg-purple-100', text: 'text-purple-800', banner: 'border-purple-200 bg-purple-50', icon: 'construct', color: '#6d28d9' },
};

/** Unknown types (enum drift) fall back to the INFO look with the raw value as the label. */
function styleFor(type: string) {
  return (TYPE_STYLES as Record<string, (typeof TYPE_STYLES)[AnnouncementType]>)[type] ?? { ...TYPE_STYLES.INFO, label: type };
}

export function AnnouncementTypeChip({ type }: { type: string }) {
  const s = styleFor(type);
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${s.chip}`}>
      <Text className={`text-xs font-medium ${s.text}`}>{s.label}</Text>
    </View>
  );
}

/** Home banner: one announcement, a two-line plain-text preview, "Dismiss" (this session only) and "See all". */
export function AnnouncementBanner({
  announcement, moreCount, onOpen, onDismiss,
}: {
  announcement: Announcement;
  /** Other active announcements not shown in the banner. */
  moreCount: number;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const s = styleFor(announcement.type);
  const preview = htmlToDisplayText(announcement.body).replace(/\s+/g, ' ').trim();
  return (
    <View accessibilityRole="summary" className={`mx-4 mb-3 rounded-xl border p-3 ${s.banner}`}>
      <View className="flex-row items-start">
        <Ionicons name={s.icon} size={20} color={s.color} />
        <Pressable accessibilityRole="button" accessibilityHint="Opens announcements" onPress={onOpen} className="ml-2 flex-1">
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={2}>
            {announcement.title || 'Announcement'}
          </Text>
          {preview ? (
            <Text className="mt-0.5 text-xs text-gray-700" numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
          <Text className="mt-1 text-xs font-medium text-blue-700">
            {moreCount > 0 ? `See all announcements (${moreCount} more)` : 'Read more'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss announcement for this session"
          onPress={onDismiss}
          hitSlop={10}
          className="ml-2 h-6 w-6 items-center justify-center"
        >
          <Ionicons name="close" size={18} color="#4b5563" />
        </Pressable>
      </View>
    </View>
  );
}

/** Full card on M16: type chip, pin, title, dates, author and the sanitised body (collapsible). */
export function AnnouncementCard({
  announcement, hiddenOnHome, onShowOnHome,
}: {
  announcement: Announcement;
  hiddenOnHome: boolean;
  onShowOnHome: () => void;
}) {
  const author = formatDisplayName(announcement.author?.displayName);
  return (
    <View className="mx-4 mb-3 rounded-xl bg-white p-4">
      <View className="mb-2 flex-row items-center">
        <AnnouncementTypeChip type={announcement.type} />
        {announcement.isPinned ? (
          <View className="ml-2 flex-row items-center">
            <Ionicons name="pin" size={12} color="#6b7280" />
            <Text className="ml-0.5 text-xs text-gray-500">Pinned</Text>
          </View>
        ) : null}
      </View>
      <Text selectable className="text-base font-semibold text-gray-900">
        {announcement.title || 'Announcement'}
      </Text>
      <Text className="mb-2 mt-0.5 text-xs text-gray-500">
        {formatDate(announcement.startsAt)}
        {announcement.expiresAt ? ` – until ${formatDate(announcement.expiresAt)}` : ''}
        {author ? ` · ${author}` : ''}
      </Text>
      <HtmlText html={announcement.body} collapsedHeight={160} emptyText="No details" />
      {hiddenOnHome ? (
        <Pressable accessibilityRole="button" onPress={onShowOnHome} className="mt-2 self-start py-1">
          <Text className="text-xs font-medium text-blue-700">Hidden from Home for this session · Show it again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
