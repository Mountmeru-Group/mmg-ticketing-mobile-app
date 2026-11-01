// The start-up sequence's decisions (2026-10-30, docs/PERFORMANCE.md §12), without React Native, so
// tests/motion/start-up-and-login.test.mjs runs this exact code under Node. ./splash.ts drives it with the real native
// splash; ./SplashIntro.tsx draws its phase.
//
// Who hides the native splash, and when:
// - The intro plays: as soon as its first frame is ready to draw (the raised drop: the same picture as the native
//   splash) and the system has said motion is allowed. The first screen keeps mounting underneath meanwhile.
// - No intro ("Remove animations" on, its images failed, or the first screen was ready and the intro's first frame did
//   not follow within `paintWait` ms): when the first screen is ready, exactly as before. Its end state is the first
//   screen itself.
// The intro hands off to the first screen only once its timeline has ended AND that screen is ready, so the blank view
// RootNavigator shows while it reads the stored session is never revealed. A touch skips the rest of the intro.

export type IntroPhase =
  /** Mounted under the native splash: waiting for its first frame and the motion setting. */
  | 'waiting'
  /** The native splash is hidden and the timeline runs. */
  | 'playing'
  /** At its end state (the timeline ended, or a touch skipped to it), waiting for the first screen. */
  | 'holding'
  /** Fading out over the first screen. */
  | 'leaving'
  /** Removed, or skipped. */
  | 'gone';

export interface SplashSequenceDeps {
  /** Hides the native splash. Called at most once. */
  hideNativeSplash: () => void;
  /** Runs `run` after `ms`; returns a cancel function. */
  setTimer: (ms: number, run: () => void) => () => void;
  paintWait: number;
}

export interface SplashSequence {
  phase: () => IntroPhase;
  subscribe: (listener: () => void) => () => void;
  /** Both intro images are on their views: the next frame drawn shows the intro's first frame. */
  introFramePainted: () => void;
  /** The system's "Remove animations" answer. */
  motionSetting: (reduceMotion: boolean) => void;
  /** An intro image failed to load. */
  introFailed: () => void;
  /** The intro left the tree without finishing (e.g. the crash screen replaced it). */
  introUnmounted: () => void;
  /** The first screen is mounted (or the crash screen is showing). Idempotent. */
  firstScreenReady: () => void;
  timelineEnded: () => void;
  handOffEnded: () => void;
  /** A touch on the intro: skip to its end, and to the first screen at once if that is ready. */
  touched: () => void;
}

export function createSplashSequence({ hideNativeSplash, setTimer, paintWait }: SplashSequenceDeps): SplashSequence {
  let phase: IntroPhase = 'waiting';
  let painted = false;
  /** null until the system answers. */
  let motionAllowed: boolean | null = null;
  let ready = false;
  let nativeHidden = false;
  let cancelPaintWait: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const hideNative = () => {
    if (nativeHidden) return;
    nativeHidden = true;
    hideNativeSplash();
  };

  const set = (next: IntroPhase) => {
    if (next === phase) return;
    phase = next;
    if (next !== 'waiting') {
      cancelPaintWait?.();
      cancelPaintWait = null;
    }
    for (const listener of [...listeners]) listener();
  };

  /** No intro: the native splash stays until the first screen is ready, as before. */
  const skip = () => {
    if (phase !== 'waiting') return;
    set('gone');
    if (ready) hideNative();
  };

  const tryStart = () => {
    if (phase !== 'waiting' || !painted || motionAllowed !== true) return;
    hideNative(); // over an identical frame: nothing visibly changes
    set('playing');
  };

  return {
    phase: () => phase,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    introFramePainted() {
      painted = true;
      tryStart();
    },
    motionSetting(reduceMotion) {
      if (motionAllowed !== null) return;
      motionAllowed = !reduceMotion;
      if (reduceMotion) skip();
      else tryStart();
    },
    introFailed: skip,
    introUnmounted() {
      if (phase === 'waiting') skip();
      else set('gone');
    },
    firstScreenReady() {
      if (ready) return;
      ready = true;
      if (phase === 'waiting') {
        // The intro gets a short grace for its first frame; it never holds the app back longer than that.
        cancelPaintWait = setTimer(paintWait, skip);
      } else if (phase === 'holding') {
        set('leaving');
      } else if (phase === 'gone') {
        hideNative();
      }
    },
    timelineEnded() {
      if (phase !== 'playing') return;
      set(ready ? 'leaving' : 'holding');
    },
    handOffEnded() {
      if (phase === 'leaving') set('gone');
    },
    touched() {
      if (phase === 'playing') set(ready ? 'gone' : 'holding');
      else if (phase === 'leaving') set('gone');
    },
  };
}
