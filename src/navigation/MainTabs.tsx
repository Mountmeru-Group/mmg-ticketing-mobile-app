// Bottom tabs inside the drawer: Home · Tickets · Alerts, same order for every role (08 §3.1). The list comes from
// mainTabs() (utils/permissions.ts, pinned per role by tests/rbac); this file only supplies screens. The bar itself is
// AppTabBar, shared with the other drawer screens so it sits in the same place on every screen.
// The Alerts badge is the NTF-2 unread count: loaded when the tabs mount, refreshed by pull-to-refresh (Home, Alerts)
// and after a mark-read. No polling and no push (this phase's rule; 05 B.3/B.4), so it can lag until a refresh.
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import type { ComponentType } from 'react';

import { useUnreadCount } from '@/hooks';
import { HomeScreen } from '@/screens/dashboard/HomeScreen';
import { NotificationsScreen } from '@/screens/notifications/NotificationsScreen';
import { useAuthStore } from '@/store/auth.store';
import type { MainTabParamList } from '@/types';
import { mainTabs, type MainTab } from '@/utils/permissions';
import { AppTabBar } from './AppTabBar';
import { TicketStack } from './TicketStack';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_SCREENS: Record<MainTab, ComponentType<any>> = {
  HomeTab: HomeScreen,
  TicketsTab: TicketStack,
  AlertsTab: NotificationsScreen,
};

export function MainTabs() {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  // The one observer that fetches the unread count; AppTabBar reads it from the cache.
  useUnreadCount({ enabled: true });

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      // Android back on a non-Home tab root returns to Home (08 §3.1).
      backBehavior="initialRoute"
      tabBar={(props) => <MainTabBar {...props} />}
      // freezeOnBlur (Phase P2): a tab not on show stops re-rendering until it is shown again.
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
    >
      {mainTabs(role).map(({ name }) => (
        <Tab.Screen key={name} name={name} component={TAB_SCREENS[name]} />
      ))}
    </Tab.Navigator>
  );
}

/** The tab navigator's bar: a press does what React Navigation's default bar does (bottom-tabs BottomTabBar). */
function MainTabBar({ state, navigation }: BottomTabBarProps) {
  const focused = state.routes[state.index];
  const routeOf = (tab: MainTab) => state.routes.find((route) => route.name === tab);

  const onPress = (tab: MainTab) => {
    const route = routeOf(tab);
    if (!route) return;
    const isFocused = route.key === focused?.key;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
      data: { behavior: { scrollToTop: isFocused, popToTop: isFocused } },
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.dispatch({ ...CommonActions.navigate(route.name, route.params), target: state.key });
    }
  };

  const onLongPress = (tab: MainTab) => {
    const route = routeOf(tab);
    if (route) navigation.emit({ type: 'tabLongPress', target: route.key });
  };

  return <AppTabBar active={(focused?.name as MainTab | undefined) ?? null} onPress={onPress} onLongPress={onLongPress} />;
}
