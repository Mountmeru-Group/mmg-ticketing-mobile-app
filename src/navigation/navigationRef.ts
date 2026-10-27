// The app's NavigationContainer ref (RootNavigator), for code that runs outside a screen — e.g. a ticket link tapped
// inside server HTML (HtmlText). Screens keep using their own `navigation` prop.
import { createNavigationContainerRef } from '@react-navigation/native';

import { useAuthStore } from '@/store/auth.store';
import type { RootStackParamList } from '@/types';
import { ticketLinkDestination } from '@/utils/deep-links';
import { focusedAppTab } from './routes';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Open the in-app ticket-link resolver (M4 behind it) in the tab on screen (deep-links.ts ticketLinkDestination).
 * Signed-in only: the Login stack has no ticket screens, and nothing is queued for after sign-in. Returns false when it
 * did not navigate (signed out, not ready, a sheet on top, or not a ticket link), and the caller opens the browser.
 */
export function openTicketLinkInApp(link: string): boolean {
  if (!navigationRef.isReady() || !useAuthStore.getState().isAuthenticated) return false;
  const destination = ticketLinkDestination(link, focusedAppTab(navigationRef.getRootState()));
  if (!destination) return false;
  // Every tab stack registers TicketLink; `initial: false` keeps the tab's root under it.
  const params = { screen: 'TicketLink', params: { link: destination.link }, initial: false } as const;
  navigationRef.navigate('App', { screen: destination.tab, params });
  return true;
}
