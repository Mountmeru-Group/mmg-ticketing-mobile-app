// A tapped push notification (G7) → the ticket, through the existing in-app deep-link resolver (openTicketLinkInApp →
// TicketLink → M4), whether the app was cold, in the background or in the foreground:
// - background / foreground: PushBridge's response listener calls handlePushTap(); the navigation is ready, it opens.
// - cold start: the launching tap is read once PushBridge mounts; the navigation and the stored session are not ready
//   yet, so it waits here and the navigation container's `ready` event flushes it (PushBridge listens through
//   navigationRef). Signed out by then: dropped (utils/push.ts).
// The same tap can arrive twice on a cold start (the listener and getLastNotificationResponseAsync): deduplicated by the
// notification's id.
import { navigationRef, openTicketLinkInApp } from '@/navigation/navigationRef';
import { useAuthStore } from '@/store/auth.store';
import { pushTapAction, pushTicketLink } from '@/utils/push';
import { pushLog } from './registration';

let pending: { link: string | null } | null = null;
let lastHandledId: string | null = null;

export function handlePushTap(notificationId: string, data: unknown): void {
  if (notificationId && notificationId === lastHandledId) return;
  lastHandledId = notificationId;
  pending = { link: pushTicketLink(data) };
  flushPushTap();
}

/** Open the waiting tap if the app can now. Called on every tap, and when the navigation becomes ready. */
export function flushPushTap(): void {
  if (!pending) return;
  const { isLoading, isAuthenticated } = useAuthStore.getState();
  const action = pushTapAction({
    navigationReady: navigationRef.isReady(),
    sessionLoading: isLoading,
    signedIn: isAuthenticated,
    link: pending.link,
  });
  if (action === 'wait') return;
  const { link } = pending;
  pending = null;
  if (action === 'drop') {
    pushLog('tap: nobody signed in, nothing opened');
  } else if (action === 'open-ticket' && link) {
    openTicketLinkInApp(link);
  } else {
    navigationRef.navigate('App', { screen: 'MainTabs', params: { screen: 'AlertsTab' } });
  }
}
