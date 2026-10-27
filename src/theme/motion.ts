// Motion tokens (Phase A1, 2026-10-23; docs/PERFORMANCE.md §10). Every duration, distance, scale and curve an animation
// uses is here; components hold no motion numbers of their own.
// Every animation in the app keeps the same rules (PERFORMANCE.md §10.1):
// - React Native's Animated with `useNativeDriver: true`, so no JavaScript runs per frame once it has started;
// - transform and opacity only, never a layout property (width, height, margin, padding, top, left …);
// - decoration only: nothing waits for an animation, and a press responds at once;
// - skipped when Android's "Remove animations" is on (hooks/useReduceMotion.ts): the end state shows at once;
// - stopped when its component unmounts.
// This file must stay free of runtime imports, like the rest of src/theme. Curves are cubic-bezier control points, as
// in CSS; a component turns one into an easing with `Easing.bezier(...curve)`.

/** Cubic-bezier control points (x1, y1, x2, y2). */
export type MotionCurve = readonly [number, number, number, number];

const curve = {
  /** Constant speed. */
  linear: [0, 0, 1, 1],
  /** Decelerates into place: something arriving on screen. */
  enter: [0.2, 0, 0, 1],
  /** Speeds up, then slows down: a change in place. */
  standard: [0.4, 0, 0.2, 1],
} as const satisfies Record<string, MotionCurve>;

export const motion = {
  curve,

  /** Loading skeletons (components/Shimmer.tsx): a translucent band sweeps across the placeholder bars. */
  shimmer: {
    /** One sweep across the screen's width, ms. Repeats while the skeleton shows. */
    duration: 1400,
    curve: curve.linear,
    /** Width of the band, dp. */
    bandWidth: 96,
    /** Opacity of the white strips that make up the band, edge to edge: a soft band without a gradient. */
    bandOpacities: [0.12, 0.28, 0.45, 0.28, 0.12],
  },

  /** List rows when a list first shows its data (components/ListEntry.tsx). */
  listEntry: {
    /** One row's fade and lift, ms. */
    duration: 340,
    /** From one row's start to the next row's, ms. */
    stagger: 70,
    /** How far a row rises into place, dp. */
    distance: 10,
    /**
     * Rows at this index or later never animate: the first screenful on a 360 × 640 dp phone is fewer rows than this,
     * and a row that arrives by infinite scroll (index 20 or later) must appear at once.
     */
    maxRows: 8,
    curve: curve.enter,
    /** Points sampled along the curve: the native driver interpolates linearly between them. */
    curveSamples: 8,
  },

  /** A status badge when its own ticket's or request's status changes (components/StatusBadge.tsx). */
  statusChange: {
    /** The whole pulse and colour crossfade, ms. */
    duration: 280,
    /** Peak of the pulse, halfway through. */
    scale: 1.14,
    curve: curve.standard,
  },
} as const;
