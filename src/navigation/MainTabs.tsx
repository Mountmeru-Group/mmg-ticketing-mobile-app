// Bottom tabs inside the drawer: Home · Tickets · Alerts, same order for every role (08 §3.1). The list and titles come
// from mainTabs() (utils/permissions.ts, pinned per role by tests/rbac); this file only supplies screens and icons.
// The Alerts badge is the NTF-2 unread count: loaded when the tabs mount, refreshed by pull-to-refresh (Home, Alerts)
// and after a mark-read. No polling and no push (this phase's rule; 05 B.3/B.4), so it can lag until a refresh.
import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ComponentType } from 'react';

import { useUnreadCount } from '@/hooks';
import { HomeScreen } from '@/screens/dashboard/HomeScreen';
import { NotificationsScreen } from '@/screens/notifications/NotificationsScreen';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import type { MainTabParamList } from '@/types';
import { mainTabs, type MainTab } from '@/utils/permissions';
import { TicketStack } from './TicketStack';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_SCREENS: Record<MainTab, { component: ComponentType<any>; icon: keyof typeof Ionicons.glyphMap; iconFocused: keyof typeof Ionicons.glyphMap }> = {
  HomeTab: { component: HomeScreen, icon: 'home-outline', iconFocused: 'home' },
  TicketsTab: { component: TicketStack, icon: 'ticket-outline', iconFocused: 'ticket' },
  AlertsTab: { component: NotificationsScreen, icon: 'notifications-outline', iconFocused: 'notifications' },
};

export function MainTabs() {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const unread = useUnreadCount({ enabled: true }).data ?? 0;

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      // Android back on a non-Home tab root returns to Home, then exits (08 §3.1).
      backBehavior="initialRoute"
      // Web MobileBottomNav: active `text-primary`; idle gray-500 here (the web's gray-400 fails WCAG AA, colors.ts).
      // 24 dp icons, filled when active. The unread badge is brand red: React Navigation's default red is 3.5:1.
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.nav.tabActive,
        tabBarInactiveTintColor: colors.nav.tabIdle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
        tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.primaryForeground },
      }}
    >
      {mainTabs(role).map(({ name, title }) => {
        const tab = TAB_SCREENS[name];
        return (
          <Tab.Screen
            key={name}
            name={name}
            component={tab.component}
            options={{
              title,
              tabBarBadge: name === 'AlertsTab' && unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
              tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? tab.iconFocused : tab.icon} color={color} size={24} />,
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}
