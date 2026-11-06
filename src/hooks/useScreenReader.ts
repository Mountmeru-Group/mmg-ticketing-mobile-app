import { AccessibilityInfo } from 'react-native';

// iOS (iOS-5f): whether VoiceOver is running, for a decision taken when a decorative animation would start. The greeting
// mark plays no entrance while VoiceOver runs (components/GreetingMark.tsx; docs/ios/ANDROID-DELTA.md §10): it is
// hidden from VoiceOver, and a moving picture beside the greeting only distracts someone following the focus.
// The pattern of useReduceMotion.ts: one native listener for the whole app, started on first use and kept for the app's
// life. Until the first answer arrives (a few ms after start), VoiceOver counts as off.

let enabled = false;
let started = false;

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.addEventListener('screenReaderChanged', (value: boolean) => {
    enabled = value;
  });
  AccessibilityInfo.isScreenReaderEnabled().then(
    (value) => {
      enabled = value;
    },
    () => undefined,
  );
}

/** VoiceOver now, without subscribing: for a decision taken once, when an animation would start. */
export function screenReaderEnabled(): boolean {
  start();
  return enabled;
}
