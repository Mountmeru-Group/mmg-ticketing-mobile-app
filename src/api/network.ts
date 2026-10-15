// Connectivity: @react-native-community/netinfo drives TanStack Query's onlineManager.
// - While offline, queries PAUSE instead of failing, so nothing retries against the shared UAT/production
//   hardware (00 §3). A paused first load finishes by itself when the connection returns (that is the original
//   request completing, not a refetch); cached data is only refreshed by pull-to-refresh.
// - NetInfo's JavaScript reachability check is switched off: it would ping an external URL every 60 s, which is
//   background polling. "Offline" therefore means the device has no network (`isConnected === false`). A network
//   that is up but cannot reach the Service Desk still surfaces as a failed request (QueryBanner).
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

let started = false;

/** Call once at app start (App.tsx), before the first query runs. */
export function startConnectivityMonitoring(): void {
  if (started) return;
  started = true;
  // With the JS check off, `isInternetReachable` can read `false` while the device is online, so it is ignored.
  NetInfo.configure({ reachabilityShouldRun: () => false });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
}

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const getOffline = () => !onlineManager.isOnline();

/** True while the device has no network connection. */
export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, getOffline, getOffline);
}
