// One native stack per tab (docs/ios/00-PORT-MANIFEST.md §4.5), built from the route table in ./routes.ts:
// - the tab's root has the iOS large title (except a list with a pinned bar, routes.ts hasLargeTitle); pushed screens a
//   standard title, the standard back chevron and the native edge swipe back (HIG, Toolbars: "Use a large title to help
//   people stay oriented"; "Use the standard Back and Close buttons … don't use a text label that says Back");
// - the record screens (ticket, task, approval, ticket link) are in every stack, and each record gets its own screen
//   (getId, docs/PERFORMANCE.md §9.7);
// - freezeOnBlur (Phase P2): a screen that is not on show stops re-rendering until it is shown again.
// Until iOS-3c every route not built yet renders the DEV placeholder (src/screens/placeholders.ts).
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';

import { HomeScreen } from '@/screens/dashboard/HomeScreen';
import { PlaceholderRoute } from '@/screens/placeholders';
import { TicketDetailScreen } from '@/screens/tickets/TicketDetailScreen';
import { TicketLinkScreen } from '@/screens/tickets/TicketLinkScreen';
import { TicketListScreen } from '@/screens/tickets/TicketListScreen';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import type { AppTab } from '@/utils/permissions';
import { MoreScreen } from './MoreScreen';
import { STACK_ROUTES, getIdFor, hasLargeTitle, routeTitle, type StackRoute } from './routes';

/** Built screens. Every other route is still the placeholder; iOS-3 adds the real screens here (3a: the read screens). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SCREENS: Partial<Record<StackRoute, ComponentType<any>>> = {
  More: MoreScreen,
  Home: HomeScreen,
  TicketList: TicketListScreen,
  TicketDetail: TicketDetailScreen,
  TicketLink: TicketLinkScreen,
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
            component={SCREENS[name] ?? PlaceholderRoute}
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
