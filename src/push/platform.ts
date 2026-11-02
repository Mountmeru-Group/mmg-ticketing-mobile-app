// The phone side of push (G7): expo-notifications behind the small PushPlatform interface registration.ts uses.
// Only src/push/PushBridge.tsx imports this file, so tests (which run in Node) never load native code.
// - Expo Go on Android has no remote push since SDK 53: getDevicePushTokenAsync and addPushTokenListener THROW there
//   (expo-notifications build/warnOfExpoGoPushUsage.js). In Expo Go, and anywhere but Android, push is `unavailable`
//   and expo-notifications is never touched (Metro's inlineRequires loads it on first use, metro.config.js).
// - The token is the native FCM registration token (getDevicePushTokenAsync), as MOBILE-BACKEND-REQUIREMENTS.md §1
//   asks: the backend sends through FCM directly, not through Expo's push service. Firebase needs the project's
//   google-services.json in the build (app.json `android.googleServicesFile`); without it getToken() rejects and push
//   is `unavailable` (docs/RELEASE.md §2b).
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PushPermission } from '@/utils/push';
import type { PushPlatform } from './registration';

/** The channel the Service Desk sends on (`android.notification.channelId`, MOBILE-BACKEND-REQUIREMENTS.md §1.6). */
export const PUSH_CHANNEL_ID = 'setu_tickets';

const UNAVAILABLE: PushPlatform = {
  available: false,
  ensureChannel: async () => undefined,
  getPermission: async () => ({ status: 'undetermined', canAskAgain: false }),
  requestPermission: async () => ({ status: 'undetermined', canAskAgain: false }),
  getToken: async () => {
    throw new Error('Push is not available in this build');
  },
  deleteLocalToken: async () => undefined,
  onTokenChange: () => () => undefined,
};

function permissionOf(response: Notifications.NotificationPermissionsStatus): PushPermission {
  const status = response.status === 'granted' || response.status === 'denied' ? response.status : 'undetermined';
  return { status, canAskAgain: response.canAskAgain };
}

export function pushIsPossibleHere(): boolean {
  return Platform.OS === 'android' && !isRunningInExpoGo();
}

export function createExpoPushPlatform(): PushPlatform {
  if (!pushIsPossibleHere()) return UNAVAILABLE;
  return {
    available: true,
    ensureChannel: async () => {
      await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
        name: 'Ticket alerts',
        description: 'Assignments, replies, status changes, SLA breaches and approvals on your tickets',
        importance: Notifications.AndroidImportance.HIGH,
      });
    },
    getPermission: async () => permissionOf(await Notifications.getPermissionsAsync()),
    requestPermission: async () => permissionOf(await Notifications.requestPermissionsAsync()),
    getToken: async () => {
      const token = await Notifications.getDevicePushTokenAsync();
      if (typeof token.data !== 'string' || !token.data) throw new Error('No FCM token');
      return token.data;
    },
    deleteLocalToken: () => Notifications.unregisterForNotificationsAsync(),
    onTokenChange: (listener) => {
      const subscription = Notifications.addPushTokenListener((token) => {
        if (typeof token.data === 'string' && token.data) listener(token.data);
      });
      return () => subscription.remove();
    },
  };
}
