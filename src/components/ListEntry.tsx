// Staggered list entry (Phase A1, docs/PERFORMANCE.md §10): when a list first shows its data, its first rows fade in and
// rise 10 dp, each 70 ms after the one above. Rows that arrive later (the next page, a refresh, a search that adds
// rows) appear at once.
//
// How it stays cheap and out of FlashList's way:
// - One native timing per list appearance, shared by its rows. Each row's opacity and offset are native interpolations
//   of it, so the stagger needs no timer and no JavaScript per frame. (Animated's own `delay` is a JavaScript timer,
//   which a busy JS thread on a weak phone would fire late, leaving rows invisible.)
// - A row decides once, when its cell first mounts. FlashList recycles a cell by giving the same component another
//   item, so a recycled cell keeps its decision and its finished values: it never replays the entry. A cell first
//   mounted for a row past `maxRows`, after the entry has finished, or with "Remove animations" on gets no wrapper
//   view at all, and keeps none for its life.
// - The scope counts its mounted rows. When none is left (the list made way for a skeleton, an error or an empty
//   state), the next rows to mount are a new appearance and enter again.
// - Every running timing stops when the scope unmounts.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

import { reduceMotionEnabled } from '@/hooks';
import { motion } from '@/theme';

const { duration, stagger, distance, maxRows, curve, curveSamples } = motion.listEntry;
/** The shared timeline runs in ms, from the first row's start to the last animated row's end. */
const TIMELINE = (maxRows - 1) * stagger + duration;
const ease = Easing.bezier(...curve);
/** The curve as straight segments: the native driver interpolates linearly and cannot run an easing function. */
const CURVE_POINTS = Array.from({ length: curveSamples + 1 }, (_, i) => i / curveSamples);
const CURVE_VALUES = CURVE_POINTS.map(ease);

/** One appearance of a list: the timeline its first rows share. */
interface EntryRun {
  value: Animated.Value;
  started: boolean;
  finished: boolean;
}

const newRun = (): EntryRun => ({ value: new Animated.Value(0), started: false, finished: false });

class EntryScope {
  run = newRun();
  private rows = 0;
  private readonly running = new Set<Animated.CompositeAnimation>();

  attach() {
    this.rows += 1;
  }

  detach() {
    this.rows -= 1;
    if (this.rows === 0) this.run = newRun();
  }

  /** Starts the run a row is bound to (once). An older run keeps going for any row still bound to it. */
  start(run: EntryRun) {
    if (run.started) return;
    run.started = true;
    const timing = Animated.timing(run.value, { toValue: TIMELINE, duration: TIMELINE, easing: Easing.linear, useNativeDriver: true });
    this.running.add(timing);
    timing.start(() => {
      run.finished = true;
      this.running.delete(timing);
    });
  }

  stopAll() {
    for (const timing of [...this.running]) timing.stop();
  }
}

const ScopeContext = createContext<EntryScope | null>(null);

/** Put around a screen's list content (`{content}`). Rows outside a scope never animate. */
export function ListEntryScope({ children }: { children: ReactNode }) {
  const [scope] = useState(() => new EntryScope());
  useEffect(() => () => scope.stopAll(), [scope]);
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

function entryStyle(value: Animated.Value, index: number) {
  const start = index * stagger;
  const progress = value.interpolate({
    inputRange: CURVE_POINTS.map((t) => start + t * duration),
    outputRange: CURVE_VALUES,
    extrapolate: 'clamp',
  });
  return {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  };
}

/** Wraps one row in a list's `renderItem`; `index` is the row's index there. */
export function ListEntry({ index, children }: { index: number; children: ReactNode }) {
  const scope = useContext(ScopeContext);
  // Decided once per cell, when it first mounts (see the top of this file).
  const [entry] = useState(() => {
    const run = scope?.run;
    if (!run || run.finished || index >= maxRows || reduceMotionEnabled()) return null;
    return { run, style: entryStyle(run.value, index) };
  });
  useEffect(() => {
    if (!scope) return;
    scope.attach();
    return () => scope.detach();
  }, [scope]);
  useEffect(() => {
    if (entry) scope?.start(entry.run);
  }, [entry, scope]);
  return entry ? <Animated.View style={entry.style}>{children}</Animated.View> : children;
}
