// One native stack per tab (docs/ios/00-PORT-MANIFEST.md §4.5), built from the route table in ./routes.ts:
// - iOS-8a: every screen has a solid navigation bar in the look of Android's top bar (ScreenHeader): white, a hairline
//   under it, an 18 pt semibold title. No large title and no translucent bar: with either, iOS laid the tab roots out
//   under the bar and the status bar, and on a device (TestFlight 0.1.0 (1)) their content showed through it
//   (docs/brand/UI-STANDARDS.md §iOS-A.13). Pushed screens keep the standard back chevron and the native edge swipe
//   (HIG, Toolbars: "Use the standard Back and Close buttons … don't use a text label that says Back");
// - the record screens (ticket, task, approval, ticket link) are in every stack, and each record gets its own screen
//   (getId, docs/PERFORMANCE.md §9.7);
// - freezeOnBlur (Phase P2): a screen that is not on show stops re-rendering until it is shown again.
// Every route renders its real screen since iOS-3c: SCREENS is a complete table, so a route without one does not compile.
// Which routes are registered is stackRoutes() (routes.ts, pinned per role by tests/rbac); this file only supplies
// screens. The knowledge base and Announcements are registered for ADMIN only, so for every other role they do not
// exist: nothing can navigate to them, not merely no More row (iOS-5b, as Android's drawer, 2026-10-29). The Audit log
// likewise, in the More stack (iOS-5e, Android's G8, 2026-11-02).
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';

import { ApprovalDetailScreen } from '@/screens/approvals/ApprovalDetailScreen';
import { ApprovalsInboxScreen } from '@/screens/approvals/ApprovalsInboxScreen';
import { AuditLogScreen } from '@/screens/audit/AuditLogScreen';
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
import { colors, fontWeight } from '@/theme';
import type { AppTab } from '@/utils/permissions';
import { MoreScreen } from './MoreScreen';
import { getIdFor, routeTitle, stackRoutes, type StackRoute } from './routes';

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
  AuditLog: AuditLogScreen,
  TaskList: TaskListScreen,
  KnowledgeBase: KnowledgeBaseScreen,
  KbArticle: KbArticleScreen,
  ServiceCatalog: ServiceCatalogScreen,
  ServiceRequestForm: ServiceRequestFormScreen,
  ServiceRequestDetail: ServiceRequestDetailScreen,
  Profile: ProfileScreen,
};

/**
 * The navigation bar of every stack screen and sheet (iOS-8a): Android's top bar (f4fad10 ScreenHeader) on UIKit's.
 * - Solid: `headerTransparent: false` keeps the bar opaque even with a search field, and no screen has a large title,
 *   so react-native-screens lays every screen out below the bar (edgesForExtendedLayout without the top edge).
 * - Android's look: a white bar (`bg-white`), a hairline under it (`border-b`), the title 18 pt semibold gray-900, and
 *   the back chevron and icon buttons in gray-900. UIKit keeps its own 44 pt height and centres the title (native-stack:
 *   headerTitleAlign is "Not supported on iOS").
 * - Bar buttons sit flat on the bar, as Android's: no iOS 26 glass capsule behind them.
 */
export const STACK_SCREEN_OPTIONS: NativeStackNavigationOptions = {
  freezeOnBlur: true,
  headerLargeTitle: false,
  headerTransparent: false,
  headerStyle: { backgroundColor: colors.surface },
  headerShadowVisible: true,
  // The standard back chevron alone, never a "Back" label (HIG, Toolbars).
  headerBackButtonDisplayMode: 'minimal',
  headerTintColor: colors.text.primary,
  headerTitleStyle: { color: colors.text.primary, fontSize: 18, fontWeight: fontWeight.semibold },
  headerLeftBackgroundVisible: false,
  headerRightBackgroundVisible: false,
  contentStyle: { backgroundColor: colors.canvas },
};

function createTabStack(tab: AppTab): ComponentType {
  const Stack = createNativeStackNavigator();

  function TabStack() {
    const role = useAuthStore((s) => s.user?.role);
    const routes = stackRoutes(tab, role);
    return (
      <Stack.Navigator initialRouteName={routes[0]} screenOptions={STACK_SCREEN_OPTIONS}>
        {routes.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            component={SCREENS[name]}
            getId={getIdFor(name)}
            options={{ title: routeTitle(name, role) }}
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
