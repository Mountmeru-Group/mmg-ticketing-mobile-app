// Signed-in shell: a side drawer wrapping the bottom tabs (08 §3). Profile lives in the drawer header.
import { createDrawerNavigator } from '@react-navigation/drawer';

import { AnnouncementsScreen } from '@/screens/dashboard/AnnouncementsScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import type { AppDrawerParamList } from '@/types';
import { DrawerContent } from './DrawerContent';
import { MainTabs } from './MainTabs';
import { ApprovalsStack, KnowledgeStack } from './ModuleStacks';

const Drawer = createDrawerNavigator<AppDrawerParamList>();

export function AppDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="MainTabs"
      drawerContent={(props) => <DrawerContent {...props} />}
      // Android back: closes the drawer first, then returns to the tabs (08 §3.1).
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false, drawerType: 'front' }}
    >
      <Drawer.Screen name="MainTabs" component={MainTabs} />
      <Drawer.Screen name="Approvals" component={ApprovalsStack} />
      <Drawer.Screen name="Knowledge" component={KnowledgeStack} />
      <Drawer.Screen name="Announcements" component={AnnouncementsScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
    </Drawer.Navigator>
  );
}
