// Push notifications (G7): the pure parts. What state push is in on this phone, the words the Alerts screen uses for
// it, what a tapped notification opens, and how a device-token call's failure is read. No native code here: the
// expo-notifications side is src/push/platform.ts, the flow is src/push/registration.ts.
// The backend half (FCM send, NTF-5/NTF-6) is NOT YET DEPLOYED: MOBILE-BACKEND-REQUIREMENTS.md §1, 01 NTF-5/NTF-6.
import { ApiClientError } from '@/api/errors';
import { APP_ORIGIN, parseTicketLink } from './deep-links';

/**
 * - `checking`      not worked out yet: signed out, or the check is still running.
 * - `unavailable`   this build cannot receive push: Expo Go (Android push left it in SDK 53), no Firebase configuration
 *                   in the build (google-services.json), or no Google Play services. Nothing the person can change.
 * - `not-asked`     Android 13+: the notification permission has not been asked yet.
 * - `denied`        the person refused it, or turned Setu's notifications off in Settings.
 * - `not-deployed`  the Service Desk answered 404 for NTF-5: its half of push is not live yet.
 * - `failed`        registering failed some other way (offline, 5xx). Tried again on the next start or sign-in.
 * - `on`            this phone is registered: alerts arrive as notifications.
 */
export type PushStatus = 'checking' | 'unavailable' | 'not-asked' | 'denied' | 'not-deployed' | 'failed' | 'on';

/** The notification permission as the app needs it (expo-notifications' NotificationPermissionsStatus, reduced). */
export interface PushPermission {
  status: 'granted' | 'denied' | 'undetermined';
  /** False once Android will no longer show the dialog: only the system Settings can turn it on. */
  canAskAgain: boolean;
}

/** The Alerts screen's notice for each state. `action` is a button under it. */
export interface PushNotice {
  tone: 'info' | 'warning';
  text: string;
  action?: { label: string; kind: 'request' | 'settings' };
}

const PULL = 'Pull down to check for new alerts.';

export function pushNotice(status: PushStatus, canAskAgain: boolean): PushNotice {
  switch (status) {
    case 'on':
      return { tone: 'info', text: 'Alerts also arrive on this phone as notifications, even when Setu is closed.' };
    case 'not-deployed':
      return {
        tone: 'info',
        text: `Notifications on this phone aren't switched on at the Service Desk yet, so alerts only show here. ${PULL}`,
      };
    case 'not-asked':
      return {
        tone: 'info',
        text: `Turn on notifications to get alerts even when Setu is closed. ${PULL}`,
        action: { label: 'Turn on notifications', kind: 'request' },
      };
    case 'denied':
      return {
        tone: 'info',
        text: `Notifications are off for Setu on this phone, so alerts only show here. ${PULL}`,
        action: canAskAgain
          ? { label: 'Turn on notifications', kind: 'request' }
          : { label: 'Open settings', kind: 'settings' },
      };
    case 'unavailable':
      return { tone: 'info', text: `This version of Setu can't receive notifications, so alerts only show here. ${PULL}` };
    case 'failed':
      return { tone: 'info', text: `Notifications couldn't be set up on this phone just now. ${PULL}` };
    case 'checking':
      return { tone: 'info', text: PULL };
  }
}

/** What a failed NTF-5 / NTF-6 call means. A 401 has already ended the session (api/client.ts): nothing to report. */
export type DeviceTokenFailure = 'not-deployed' | 'session-ended' | 'failed';

export function deviceTokenFailure(error: unknown): DeviceTokenFailure {
  if (error instanceof ApiClientError) {
    // Express answers an unknown route with an HTML 404 ("Cannot POST …"), read as kind `not-json` (01 §0.5).
    if (error.status === 404) return 'not-deployed';
    if (error.status === 401) return 'session-ended';
  }
  return 'failed';
}

/**
 * What to do with a tapped notification right now:
 * - `wait`         the navigation is not mounted yet, or the stored session is still being read (a cold start);
 * - `drop`         nobody is signed in: Login opens, and nothing is queued for after sign-in (as openTicketLinkInApp);
 * - `open-ticket`  the ticket, through the in-app link resolver;
 * - `open-alerts`  the Alerts tab, when the notification names no ticket.
 */
export type PushTapAction = 'wait' | 'drop' | 'open-ticket' | 'open-alerts';

export function pushTapAction({
  navigationReady, sessionLoading, signedIn, link,
}: {
  navigationReady: boolean;
  sessionLoading: boolean;
  signedIn: boolean;
  link: string | null;
}): PushTapAction {
  if (!navigationReady || sessionLoading) return 'wait';
  if (!signedIn) return 'drop';
  return link ? 'open-ticket' : 'open-alerts';
}

/**
 * The in-app link a tapped notification opens, for the existing deep-link resolver (TicketLink → M4), or null.
 * MOBILE-BACKEND-REQUIREMENTS.md §1.6: `data.ticketId` (a uuid) on every ticket notification; `data.ticketNumber` as a
 * fallback. FCM data values are strings. Whatever comes in goes through parseTicketLink, so only a uuid or a plain
 * ticket number from THIS environment is ever followed.
 */
export function pushTicketLink(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { ticketId, ticketNumber } = data as Record<string, unknown>;
  const candidates: string[] = [];
  if (typeof ticketId === 'string' && ticketId.trim()) candidates.push(`${APP_ORIGIN}/tickets/${encodeURIComponent(ticketId.trim())}`);
  if (typeof ticketNumber === 'string' || typeof ticketNumber === 'number') candidates.push(`#${String(ticketNumber).trim()}`);
  for (const link of candidates) {
    if (parseTicketLink(link).ok) return link;
  }
  return null;
}
