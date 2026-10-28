// Signed-in shell (docs/ios/00-PORT-MANIFEST.md §4.5): the iOS tab bar, Home · Tickets · Approvals · Alerts · More.
// - Which tabs show, their titles and their badges come from appTabs() and tabBadges() (utils/permissions.ts, pinned per
//   role by tests/navigation); this file only supplies icons and stacks. A role's tabs never change during a session
//   (HIG, Tab bars: "Don't disable or hide tab bar buttons, even when their content is unavailable").
// - React Navigation's own bar: UIKit's 49 pt plus the home-indicator inset, a filled icon over a one-word label
//   (HIG: "Include tab labels", "Prefer filled symbols"). Android's custom AppTabBar is not ported: it existed only to
//   sit under the drawer's screens. The native UITabBar (Liquid Glass) is decision D4, revisited in iOS-4.
// - The bar stays on every pushed screen; only the sheets (RootNavigator) cover it.
// - Badges: the NTF-2 unread count and the APR-1 pending count, from the queries the app already has. They load when the
//   tabs mount and refresh as on Android: pull-to-refresh, after a mark-read or a decision. No polling (05 B.3/B.4).
import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { usePendingApprovals, useUnreadCount } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import type { AppTabParamList } from '@/types';
import { appTabs, tabBadges, type AppTab } from '@/utils/permissions';
import { TAB_STACKS } from './TabStacks';

const Tab = createBottomTabNavigator<AppTabParamList>();

const TAB_ICONS: Record<AppTab, keyof typeof Ionicons.glyphMap> = {
  HomeTab: 'home',
  TicketsTab: 'ticket',
  ApprovalsTab: 'checkmark-done-circle',
  AlertsTab: 'notifications',
  MoreTab: 'ellipsis-horizontal-circle',
};

/** What VoiceOver adds after the tab's name when it has a badge. */
const BADGE_MEANING: Partial<Record<AppTab, string>> = {
  AlertsTab: 'unread',
  ApprovalsTab: 'waiting for you',
  MoreTab: 'approvals waiting for you',
};

export function AppTabs() {
  const role = useAuthStore((s) => s.user?.role);
  // The one observer of each count. The screens read the same cached queries (Android: MainTabs and DrawerContent).
  const unread = useUnreadCount({ enabled: true }).data ?? 0;
  const pendingApprovals = usePendingApprovals().data?.length ?? 0;
  const badges = tabBadges(role, { unread, pendingApprovals });

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        // Each tab's native stack draws its own navigation bar.
        headerShown: false,
        // freezeOnBlur (Phase P2): a tab not on show stops re-rendering until it is shown again.
        freezeOnBlur: true,
        // Web MobileBottomNav: active `text-primary`; idle gray-500 (the web's gray-400 fails WCAG AA, colors.ts).
        tabBarActiveTintColor: colors.nav.tabActive,
        tabBarInactiveTintColor: colors.nav.tabIdle,
        // Brand red: React Navigation's default red is 3.5:1 against white text.
        tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.primaryForeground },
      }}
    >
      {appTabs(role).map(({ name, title }) => {
        const count = badges[name] ?? 0;
        return (
          <Tab.Screen
            key={name}
            name={name}
            component={TAB_STACKS[name]}
            options={{
              title,
              tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[name]} size={size} color={color} />,
              tabBarBadge: count > 0 ? (count > 99 ? '99+' : count) : undefined,
              tabBarAccessibilityLabel: count > 0 ? `${title}, ${count} ${BADGE_MEANING[name] ?? ''}`.trim() : title,
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}
