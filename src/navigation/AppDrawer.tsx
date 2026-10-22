// Signed-in shell: a side drawer wrapping the bottom tabs (08 §3). Profile opens from the drawer's account card.
import { createDrawerNavigator } from '@react-navigation/drawer';

import { useSlaReminders } from '@/hooks/useSlaReminders';
import { AnnouncementsScreen } from '@/screens/dashboard/AnnouncementsScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import type { AppDrawerParamList } from '@/types';
import { DrawerContent } from './DrawerContent';
import { MainTabs } from './MainTabs';
import { ApprovalsStack, KnowledgeStack, TasksStack } from './ModuleStacks';

const Drawer = createDrawerNavigator<AppDrawerParamList>();

export function AppDrawer() {
  // Lives with the signed-in shell: scheduled on sign-in, cancelled when this unmounts on sign-out.
  useSlaReminders();
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
      <Drawer.Screen name="Tasks" component={TasksStack} />
      <Drawer.Screen name="Knowledge" component={KnowledgeStack} />
      <Drawer.Screen name="Announcements" component={AnnouncementsScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
    </Drawer.Navigator>
  );
}
