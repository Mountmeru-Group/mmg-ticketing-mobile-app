// The bottom bar, Home · Tickets · Alerts, on every signed-in screen (UI-STANDARDS S12). One bar, two hosts, the same
// place on screen:
// - MainTabs gives it to the tab navigator as `tabBar` (MainTabBar), so a press there is the navigator's own: it emits
//   `tabPress` (a second press on Tickets pops its stack to the list) and switches tab, as React Navigation's bar did;
// - AppDrawer's screenLayout puts it under every other drawer screen. No tab is active there, so none is highlighted
//   (the drawer's red row shows where you are), and a press opens that tab with its stack as it was left.
// Which tabs show, and their titles, come from mainTabs() (utils/permissions.ts), as for the tab navigator's screens.
// Sizes are React Navigation's default bar ('uikit' bottom-tabs), which the app used until now: 49 dp plus the bottom
// inset, a hairline top line, 24 dp icons over a 12 dp label, the badge on the icon's top end.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnreadCount } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import { mainTabs, type MainTab } from '@/utils/permissions';

const TAB_ICONS: Record<MainTab, { idle: keyof typeof Ionicons.glyphMap; focused: keyof typeof Ionicons.glyphMap }> = {
  HomeTab: { idle: 'home-outline', focused: 'home' },
  TicketsTab: { idle: 'ticket-outline', focused: 'ticket' },
  AlertsTab: { idle: 'notifications-outline', focused: 'notifications' },
};

/** The default bar's height above the bottom inset (bottom-tabs TABBAR_HEIGHT_UIKIT). */
const BAR_HEIGHT = 49;
/** The default badge: three quarters of the 25 dp icon size. */
const BADGE_SIZE = 18.75;

interface AppTabBarProps {
  /** The tab on screen, or null on a screen that belongs to no tab. */
  active: MainTab | null;
  onPress: (tab: MainTab) => void;
  onLongPress?: (tab: MainTab) => void;
}

export function AppTabBar({ active, onPress, onLongPress }: AppTabBarProps) {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const insets = useSafeAreaInsets();
  const { fonts } = useTheme();
  // Read from the cache only: MainTabs owns the NTF-2 fetch, so showing the bar on more screens fetches nothing more.
  const unread = useUnreadCount({ enabled: false }).data ?? 0;

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { height: BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom, paddingHorizontal: Math.max(insets.left, insets.right) },
      ]}
    >
      {mainTabs(role).map(({ name, title }) => {
        const focused = name === active;
        // Web MobileBottomNav: active `text-primary`; idle gray-500 (the web's gray-400 fails WCAG AA, colors.ts).
        const color = focused ? colors.nav.tabActive : colors.nav.tabIdle;
        const badge = name === 'AlertsTab' && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null;
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            android_ripple={{ borderless: true }}
            onPress={() => onPress(name)}
            onLongPress={onLongPress ? () => onLongPress(name) : undefined}
            style={styles.item}
          >
            <View style={styles.icon}>
              <Ionicons name={focused ? TAB_ICONS[name].focused : TAB_ICONS[name].idle} size={24} color={color} />
              {/* Brand red: React Navigation's default red is 3.5:1 against white text. */}
              {badge ? (
                <Text numberOfLines={1} style={[fonts.regular, styles.badge]}>
                  {badge}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={1} style={[fonts.medium, styles.label, { color }]}>
              {title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    elevation: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', padding: 5 },
  icon: { width: 31, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '500', textAlign: 'center', backgroundColor: 'transparent' },
  badge: {
    position: 'absolute',
    end: -3,
    top: -3,
    height: BADGE_SIZE,
    minWidth: BADGE_SIZE,
    lineHeight: BADGE_SIZE - 1,
    borderRadius: BADGE_SIZE / 2,
    paddingHorizontal: 4,
    overflow: 'hidden',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: colors.primary,
    color: colors.primaryForeground,
  },
});
