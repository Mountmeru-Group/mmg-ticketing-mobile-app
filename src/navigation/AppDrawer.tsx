// Signed-in shell: a side drawer wrapping the bottom tabs (08 §3). Profile opens from the drawer's account card.
// The bottom bar (AppTabBar) shows on every screen: MainTabs draws it as its tab bar, and screenLayout puts it under each
// other drawer screen, in the same place.
import { createDrawerNavigator } from '@react-navigation/drawer';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import { AnnouncementsScreen } from '@/screens/dashboard/AnnouncementsScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import type { AppDrawerParamList } from '@/types';
import { AppTabBar } from './AppTabBar';
import { DrawerContent } from './DrawerContent';
import { MainTabs } from './MainTabs';
import { ApprovalsStack, CatalogStack, KnowledgeStack, TasksStack } from './ModuleStacks';

const Drawer = createDrawerNavigator<AppDrawerParamList>();

export function AppDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="MainTabs"
      drawerContent={(props) => <DrawerContent {...props} />}
      // Android back, and the header's back arrow (the same action): closes the drawer first, then returns to the
      // screen the user came from, as a browser does (08 §3.1). The tabs are the first entry, so back ends there.
      backBehavior="fullHistory"
      screenOptions={{ headerShown: false, drawerType: 'front' }}
      screenLayout={({ route, children }) =>
        route.name === 'MainTabs' ? children : <AboveTabBar>{children}</AboveTabBar>
      }
    >
      <Drawer.Screen name="MainTabs" component={MainTabs} />
      <Drawer.Screen name="Approvals" component={ApprovalsStack} />
      <Drawer.Screen name="Tasks" component={TasksStack} />
      <Drawer.Screen name="Knowledge" component={KnowledgeStack} />
      <Drawer.Screen name="Catalog" component={CatalogStack} />
      <Drawer.Screen name="Announcements" component={AnnouncementsScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
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
