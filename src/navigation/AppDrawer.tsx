// Signed-in shell: a side drawer wrapping the bottom tabs (08 §3). Profile opens from the drawer's account card.
// The bottom bar (AppTabBar) shows on every screen: MainTabs draws it as its tab bar, and screenLayout puts it under each
// other drawer screen, in the same place.
// Which routes are registered is drawerRoutes() (utils/permissions.ts, pinned per role by tests/rbac); this file only
// supplies screens. Knowledge and Announcements are registered for ADMIN only, so for every other role they do not
// exist: nothing can navigate to them, not merely no drawer row (2026-10-29).
import { createDrawerNavigator } from '@react-navigation/drawer';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { ComponentType, ReactElement } from 'react';
import { View } from 'react-native';

import { AnnouncementsScreen } from '@/screens/dashboard/AnnouncementsScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { useAuthStore } from '@/store/auth.store';
import type { AppDrawerParamList } from '@/types';
import { drawerRoutes, type DrawerRoute } from '@/utils/permissions';
import { AppTabBar } from './AppTabBar';
import { DrawerContent } from './DrawerContent';
import { MainTabs } from './MainTabs';
import { ApprovalsStack, CatalogStack, KnowledgeStack, TasksStack } from './ModuleStacks';

const Drawer = createDrawerNavigator<AppDrawerParamList>();

const DRAWER_SCREENS: Record<DrawerRoute, ComponentType<any>> = {
  MainTabs,
  Approvals: ApprovalsStack,
  Tasks: TasksStack,
  Knowledge: KnowledgeStack,
  Catalog: CatalogStack,
  Announcements: AnnouncementsScreen,
  Profile: ProfileScreen,
};

export function AppDrawer() {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  return (
    <Drawer.Navigator
      initialRouteName="MainTabs"
      drawerContent={(props) => <DrawerContent {...props} />}
      // Android back, and the header's back arrow (the same action): closes the drawer first, then returns to the
      // screen the user came from, as a browser does (08 §3.1). The tabs are the first entry, so back ends there.
      backBehavior="fullHistory"
      // freezeOnBlur (Phase P2): a drawer screen not on show stops re-rendering until it is shown again.
      screenOptions={{ headerShown: false, drawerType: 'front', freezeOnBlur: true }}
      screenLayout={({ route, children }) =>
        route.name === 'MainTabs' ? children : <AboveTabBar>{children}</AboveTabBar>
      }
    >
      {drawerRoutes(role).map((name) => (
        <Drawer.Screen key={name} name={name} component={DRAWER_SCREENS[name]} />
      ))}
    </Drawer.Navigator>
  );
}

/** A drawer screen above the bottom bar. It belongs to no tab, so none is active; a press opens that tab. */
function AboveTabBar({ children }: { children: ReactElement }) {
  const navigation = useNavigation();
  return (
    <View className="flex-1">
      <View className="flex-1">{children}</View>
      <AppTabBar active={null} onPress={(tab) => navigation.dispatch(CommonActions.navigate('MainTabs', { screen: tab }))} />
    </View>
  );
}
