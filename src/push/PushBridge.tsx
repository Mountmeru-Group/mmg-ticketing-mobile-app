// Wires push (G7) to the app's events. Mounted once, in App.tsx, for the life of the process; renders nothing.
// Every trigger is an event (sign-in, sign-out, a tap, a new token, the app returning to the foreground): no timer, no
// polling. What each step does: src/push/registration.ts. Taps: src/push/taps.ts.
// - Never asks for the notification permission: that happens on the first visit to Alerts (NotificationsScreen).
// - A notification arriving while Setu is open is shown (banner and tray, no sound) only while someone is signed in,
//   and refreshes the Alerts list and badge, since it means a new row exists. While signed out it is not shown.
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { queryKeys } from '@/hooks/queryKeys';
import { navigationRef } from '@/navigation/navigationRef';
import { useAuthStore } from '@/store/auth.store';
import { usePushStore } from '@/store/push.store';
import { createExpoPushPlatform } from './platform';
import {
  forgetPushOnSessionEnd, installPushPlatform, onPushTokenRotated, syncPushRegistration,
} from './registration';
import { flushPushTap, handlePushTap } from './taps';

export function PushBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const platform = createExpoPushPlatform();
    installPushPlatform(platform);
    if (!platform.available) {
      usePushStore.getState().setStatus('unavailable');
      return;
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => {
        const signedIn = useAuthStore.getState().isAuthenticated;
        if (signedIn) void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
        return { shouldShowBanner: signedIn, shouldShowList: signedIn, shouldPlaySound: false, shouldSetBadge: false };
      },
    });

    const onResponse = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      handlePushTap(response.notification.request.identifier, response.notification.request.content.data);
    };
    const responses = Notifications.addNotificationResponseReceivedListener(onResponse);
    // A tap that arrived before the navigation was mounted (a cold start) opens once it is. The ref keeps this listener
    // and attaches it when RootNavigator's container mounts, so RootNavigator itself is unchanged.
    const stopReadyListener = navigationRef.addListener('ready', flushPushTap);
    // Cold start: the tap that launched the app. Read once, then cleared so it is never opened twice.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        onResponse(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);

    const stopTokenListener = platform.onTokenChange((token) => void onPushTokenRotated(token));

    // Sign-in (or a restored session) registers; any sign-out forgets. Read once for a session already restored.
    if (useAuthStore.getState().isAuthenticated) void syncPushRegistration();
    const stopAuthListener = useAuthStore.subscribe((state, previous) => {
      const signedIn = state.isAuthenticated && !!state.user;
      const wasSignedIn = previous.isAuthenticated && !!previous.user;
      if (signedIn && (!wasSignedIn || state.user?.id !== previous.user?.id)) void syncPushRegistration();
      if (!signedIn && wasSignedIn) void forgetPushOnSessionEnd();
    });

    // Back from Settings (or anywhere): if push was off, the permission may have changed. Nothing runs otherwise.
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !useAuthStore.getState().isAuthenticated) return;
      const { status } = usePushStore.getState();
      if (status === 'denied' || status === 'not-asked') void syncPushRegistration();
    });

    return () => {
      responses.remove();
      stopReadyListener();
      stopTokenListener();
      stopAuthListener();
      appState.remove();
      installPushPlatform(null);
    };
  }, [queryClient]);

  return null;
}
