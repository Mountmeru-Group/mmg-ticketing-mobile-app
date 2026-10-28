// One native stack per tab (docs/ios/00-PORT-MANIFEST.md §4.5), built from the route table in ./routes.ts:
// - the tab's root has the iOS large title (except a list with a pinned bar, routes.ts hasLargeTitle); pushed screens a
//   standard title, the standard back chevron and the native edge swipe back (HIG, Toolbars: "Use a large title to help
//   people stay oriented"; "Use the standard Back and Close buttons … don't use a text label that says Back");
// - the record screens (ticket, task, approval, ticket link) are in every stack, and each record gets its own screen
//   (getId, docs/PERFORMANCE.md §9.7);
// - freezeOnBlur (Phase P2): a screen that is not on show stops re-rendering until it is shown again.
// Every route renders its real screen since iOS-3c: SCREENS is a complete table, so a route without one does not compile.
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';

import { ApprovalDetailScreen } from '@/screens/approvals/ApprovalDetailScreen';
import { ApprovalsInboxScreen } from '@/screens/approvals/ApprovalsInboxScreen';
import { ServiceCatalogScreen } from '@/screens/catalog/ServiceCatalogScreen';
import { ServiceRequestDetailScreen } from '@/screens/catalog/ServiceRequestDetailScreen';
import { ServiceRequestFormScreen } from '@/screens/catalog/ServiceRequestFormScreen';
import { AnnouncementsScreen } from '@/screens/dashboard/AnnouncementsScreen';
import { HomeScreen } from '@/screens/dashboard/HomeScreen';
import { KbArticleScreen } from '@/screens/knowledge/KbArticleScreen';
import { KnowledgeBaseScreen } from '@/screens/knowledge/KnowledgeBaseScreen';
import { NotificationsScreen } from '@/screens/notifications/NotificationsScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { TaskDetailScreen } from '@/screens/tasks/TaskDetailScreen';
import { TaskListScreen } from '@/screens/tasks/TaskListScreen';
import { TicketDetailScreen } from '@/screens/tickets/TicketDetailScreen';
import { TicketLinkScreen } from '@/screens/tickets/TicketLinkScreen';
import { TicketListScreen } from '@/screens/tickets/TicketListScreen';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import type { AppTab } from '@/utils/permissions';
import { MoreScreen } from './MoreScreen';
import { STACK_ROUTES, getIdFor, hasLargeTitle, routeTitle, type StackRoute } from './routes';

/** Every stack route's screen (iOS-3a: the read screens; iOS-3c: the modules). Complete: no placeholder remains. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SCREENS: Record<StackRoute, ComponentType<any>> = {
  More: MoreScreen,
  Home: HomeScreen,
  TicketList: TicketListScreen,
  TicketDetail: TicketDetailScreen,
  TicketLink: TicketLinkScreen,
  TaskDetail: TaskDetailScreen,
  ApprovalDetail: ApprovalDetailScreen,
  ApprovalsInbox: ApprovalsInboxScreen,
  Notifications: NotificationsScreen,
  Announcements: AnnouncementsScreen,
  TaskList: TaskListScreen,
  KnowledgeBase: KnowledgeBaseScreen,
  KbArticle: KbArticleScreen,
  ServiceCatalog: ServiceCatalogScreen,
  ServiceRequestForm: ServiceRequestFormScreen,
  ServiceRequestDetail: ServiceRequestDetailScreen,
  Profile: ProfileScreen,
};

export const STACK_SCREEN_OPTIONS: NativeStackNavigationOptions = {
  freezeOnBlur: true,
  // The standard back chevron alone, never a "Back" label (HIG, Toolbars).
  headerBackButtonDisplayMode: 'minimal',
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.text.primary },
  headerLargeTitleStyle: { color: colors.text.primary },
  headerLargeTitleShadowVisible: false,
  contentStyle: { backgroundColor: colors.canvas },
};

function createTabStack(tab: AppTab): ComponentType {
  const Stack = createNativeStackNavigator();
  const routes: readonly StackRoute[] = STACK_ROUTES[tab];

  function TabStack() {
    const role = useAuthStore((s) => s.user?.role);
    return (
      <Stack.Navigator initialRouteName={routes[0]} screenOptions={STACK_SCREEN_OPTIONS}>
        {routes.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            component={SCREENS[name]}
            getId={getIdFor(name)}
            options={{ title: routeTitle(name, role), headerLargeTitle: hasLargeTitle(tab, name) }}
          />
        ))}
      </Stack.Navigator>
    );
  }
  TabStack.displayName = `${tab}Stack`;
  return TabStack;
}

export const TAB_STACKS: Record<AppTab, ComponentType> = {
  HomeTab: createTabStack('HomeTab'),
  TicketsTab: createTabStack('TicketsTab'),
  ApprovalsTab: createTabStack('ApprovalsTab'),
  AlertsTab: createTabStack('AlertsTab'),
  MoreTab: createTabStack('MoreTab'),
};
