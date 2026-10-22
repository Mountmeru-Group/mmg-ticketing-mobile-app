// The app's NavigationContainer ref (RootNavigator), for code that runs outside a screen — e.g. a ticket link tapped
// inside server HTML (HtmlText). Screens keep using their own `navigation` prop.
import { createNavigationContainerRef } from '@react-navigation/native';

import { useAuthStore } from '@/store/auth.store';
import type { RootStackParamList } from '@/types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Open the in-app ticket-link resolver (M4 behind it). Signed-in only: the Login stack has no ticket screens, and
 * nothing is queued for after sign-in. Returns false when it could not navigate.
 */
export function openTicketLinkInApp(link: string): boolean {
  if (!navigationRef.isReady() || !useAuthStore.getState().isAuthenticated) return false;
  navigationRef.navigate('App', {
    screen: 'MainTabs',
    params: { screen: 'TicketsTab', params: { screen: 'TicketLink', params: { link }, initial: false } },
  });
  return true;
}

/** Open one ticket's detail (M4) by id — a tapped SLA reminder. Same conditions as openTicketLinkInApp(). */
export function openTicketInApp(ticketId: string): boolean {
  if (!navigationRef.isReady() || !useAuthStore.getState().isAuthenticated) return false;
  navigationRef.navigate('App', {
    screen: 'MainTabs',
    params: { screen: 'TicketsTab', params: { screen: 'TicketDetail', params: { ticketId }, initial: false } },
  });
  return true;
}
