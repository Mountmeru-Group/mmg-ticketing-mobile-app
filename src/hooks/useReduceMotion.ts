import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// Android's "Remove animations" setting (Accessibility, or developer options' animation scale at 0), which React Native
// reports as "reduce motion". Phase A1: when it is on, every animation is skipped and its end state shows at once
// (src/theme/motion.ts). One native listener serves the whole app; it starts on first use and lives as long as the app.
// Until the first answer arrives (a few ms after start-up), motion counts as allowed.

let enabled = false;
let started = false;
let firstAnswer: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function update(value: boolean) {
  if (value === enabled) return;
  enabled = value;
  for (const listener of listeners) listener();
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.addEventListener('reduceMotionChanged', update);
  firstAnswer = AccessibilityInfo.isReduceMotionEnabled().then(
    (value) => {
      update(value);
      return value;
    },
    () => false,
  );
}

/**
 * The setting once the system has answered, for a decision that must not be taken on the default: the start-up intro,
 * which would otherwise play its first frames before knowing. If the system cannot answer, motion counts as allowed.
 */
export function reduceMotionSettled(): Promise<boolean> {
  start();
  return firstAnswer ?? Promise.resolve(enabled);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The setting now, without subscribing: for a decision taken once, when an animation would start. */
export function reduceMotionEnabled(): boolean {
  start();
  return enabled;
}

/** The setting, re-rendering when it changes: for an animation that runs as long as its component shows. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, reduceMotionEnabled);
}
