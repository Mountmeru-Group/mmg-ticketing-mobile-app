// Bottom tabs inside the drawer: Home · Tickets · Alerts, same order for every role (08 §3.1).
import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { HomeScreen } from '@/screens/dashboard/HomeScreen';
import { NotificationsScreen } from '@/screens/notifications/NotificationsScreen';
import { useAuthStore } from '@/store/auth.store';
import type { MainTabParamList } from '@/types';
import { TicketStack } from './TicketStack';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      // Android back on a non-Home tab root returns to Home, then exits (08 §3.1).
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563eb' }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="TicketsTab"
        component={TicketStack}
        options={{
          title: role === 'END_USER' ? 'My Tickets' : 'Tickets',
          tabBarIcon: ({ color, size }) => <Ionicons name="ticket-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="AlertsTab"
        component={NotificationsScreen}
        options={{
          title: 'Alerts',
          // TODO(Phase 4): tabBarBadge = NTF-2 unread count (poll ≥ 60 s, foreground only; 05 B.3).
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
