// The pieces the three Analytics screens share (2026-11-26, UI-STANDARDS.md §19). Layout only: what shows is decided in
// utils/analytics.ts, which leaves out every figure the server did not send.
// - Bars are drawn with Views (no charting library): a full-width track, the bar's width relative to the largest, the
//   name above it and the count at its right.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CardTitle, FilterChip, PressableCard } from '@/components';
import { colors } from '@/theme';
import type { AnalyticsRange } from '@/types';
import { ANALYTICS_RANGE_OPTIONS, type AnalyticsBar, type AnalyticsFigure } from '@/utils/analytics';
import { initials } from '@/utils/format';

/** The period control under the header: the four ranges as radio chips. Screen one only. */
export function RangeRow({ range, onPick }: { range: AnalyticsRange; onPick: (range: AnalyticsRange) => void }) {
  return (
    <View className="border-b border-border bg-white py-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 py-1"
        accessibilityRole="radiogroup"
        accessibilityLabel="Period"
      >
        {ANALYTICS_RANGE_OPTIONS.map((r) => (
          <FilterChip key={r.value} label={r.label} active={r.value === range} onPress={() => onPick(r.value)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** A section: the standard card with its caption, and an optional source line under it. */
export function Section({ title, source, children }: { title: string; source?: string; children: ReactNode }) {
  return (
    <View className="mx-4 mb-3 rounded-xl border border-border bg-white p-4">
      {source ? (
        <View className="mb-3">
          <CardTitle>{title}</CardTitle>
          <Text className="-mt-2 text-xs text-gray-500">{source}</Text>
        </View>
      ) : (
        <CardTitle>{title}</CardTitle>
      )}
      {children}
    </View>
  );
}

/** Two tiles per row. Only the figures given: a missing number has no tile at all. */
export function TileGrid({ figures }: { figures: readonly AnalyticsFigure[] }) {
  if (figures.length === 0) return null;
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {figures.map((f) => (
        <View
          key={f.key}
          accessible
          accessibilityLabel={`${f.label}: ${f.value}${f.note ? `, ${f.note}` : ''}`}
          className="min-h-16 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
          style={{ flexBasis: '47%', flexGrow: 1 }}
        >
          <Text className="text-xs text-gray-500" numberOfLines={1}>{f.label}</Text>
          <View className="mt-1 flex-row items-baseline">
            <Text className="text-xl font-bold text-gray-900">{f.value}</Text>
            {f.note ? <Text className="ml-2 text-xs font-medium text-gray-700">{f.note}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The dark Google Play banner: the first figure large, the second beside it. */
export function PlayBanner({ figures }: { figures: readonly AnalyticsFigure[] }) {
  if (figures.length === 0) return null;
  const [main, side] = figures;
  return (
    <View
      accessible
      accessibilityLabel={figures.map((f) => `${f.label}: ${f.value}`).join(', ')}
      className="mb-3 flex-row items-end rounded-lg px-4 py-3"
      style={{ backgroundColor: colors.analytics.banner.bg }}
    >
      {main ? (
        <View className="flex-1">
          <Text className="text-xs" style={{ color: colors.analytics.bannerCaption }}>{main.label}</Text>
          <Text className="text-3xl font-bold" style={{ color: colors.analytics.banner.fg }}>{main.value}</Text>
        </View>
      ) : null}
      {side ? (
        <View className="ml-4 items-end">
          <Text className="text-xs" style={{ color: colors.analytics.bannerCaption }}>{side.label}</Text>
          <Text className="text-lg font-semibold" style={{ color: colors.analytics.banner.fg }}>{side.value}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Bars, widest first (already sorted), each relative to the largest, its count at the right. */
export function BarList({ bars }: { bars: readonly AnalyticsBar[] }) {
  return (
    <View>
      {bars.map((bar, i) => (
        <View
          key={bar.key}
          accessible
          accessibilityLabel={`${bar.label}: ${bar.valueText}`}
          className={i > 0 ? 'mt-3' : ''}
        >
          <View className="flex-row items-baseline">
            <Text className="flex-1 text-sm text-gray-700" numberOfLines={1}>{bar.label}</Text>
            <Text className="ml-2 text-sm font-semibold text-gray-900">{bar.valueText}</Text>
          </View>
          <View className="mt-1 h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.analytics.barTrack }}>
            <View className="h-2 rounded-full" style={{ width: `${bar.fraction * 100}%`, backgroundColor: colors.analytics.bar }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A route the server does not have yet: one plain line. Not an error box, no retry. */
export function NotAvailableLine({ text }: { text: string }) {
  return (
    <View accessibilityLiveRegion="polite" className="mx-4 mb-3 flex-row items-start py-2">
      <Ionicons name="information-circle-outline" size={18} color={colors.text.secondary} />
      <Text className="ml-2 flex-1 text-sm text-gray-500">{text}</Text>
    </View>
  );
}

/** Initials in a circle; muted for someone with nothing in the period. */
export function PersonAvatar({ name, muted = false, size = 40 }: { name: string; muted?: boolean; size?: number }) {
  const tone = muted ? colors.analytics.mutedAvatar : colors.avatar.requester;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: tone.bg }}
    >
      <Text className={size >= 56 ? 'text-lg font-bold' : 'text-sm font-bold'} style={{ color: tone.fg }}>{initials(name)}</Text>
    </View>
  );
}

/** A tappable row to another screen: icon, words, an optional count, a chevron. */
export function LinkRow({
  icon, label, detail, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <PressableCard
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      className="mx-4 mb-3 min-h-14 flex-row items-center rounded-xl border border-border bg-white px-4"
    >
      <Ionicons name={icon} size={22} color={colors.text.body} />
      <Text className="ml-3 flex-1 text-base font-medium text-gray-900">{label}</Text>
      {detail ? <Text className="mr-1 text-sm text-gray-500">{detail}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
    </PressableCard>
  );
}
