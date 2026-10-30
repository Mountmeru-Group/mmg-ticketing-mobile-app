// Motion tokens (Phase A1, 2026-10-23; docs/PERFORMANCE.md §10; start-up and sign-in added 2026-10-30, §12). Every
// duration, distance, scale and curve an animation uses is here; components hold no motion numbers of their own.
// Colours are in colors.ts (`colors.motion`: white ground, brand yellow accent).
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
  /** Falls under gravity, runs about 4.5 % past its mark and settles back: a drop landing. */
  fall: [0.55, 0, 0.45, 1.3],
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
    /**
     * Opacity of the brand-yellow strips that make up the band, edge to edge: a soft band without a gradient. Lower than
     * the white band's (0.12 → 0.45) it replaced on 2026-10-30, because yellow also shows on the white cards: at the
     * peak it is a pale cream over white and a warm beige over the grey bars.
     */
    bandOpacities: [0.08, 0.16, 0.26, 0.16, 0.08],
  },

  /**
   * Start-up intro (navigation/SplashIntro.tsx), one native timeline of `duration` ms. Times are [start, end] in ms on
   * it. The hand-off to the first screen comes after it, once that screen is ready.
   */
  intro: {
    /**
     * The native splash's own exit fade (expo-splash-screen `setOptions`; its default is 400). It fades over the
     * intro's first frame, which is the same picture, so it is never seen; the drop holds still until it is done.
     */
    nativeFade: 120,
    /** Stage 1: the drop falls `dropDistance` dp and settles into its place in the logo. */
    drop: [120, 400],
    /** How far above its place the drop starts, dp. The native splash image draws it there (scripts/make-splash-assets.py). */
    dropDistance: 18,
    dropCurve: curve.fall,
    /** Stage 2: the full logo resolves over the drop (opacity only, so the two drops stay one). */
    logo: [400, 620],
    logoCurve: curve.standard,
    /** The yellow rule draws out from its centre (scaleX). */
    rule: [560, 760],
    ruleCurve: curve.enter,
    /** "Setu" fades up from `wordmarkRise` dp below its place. */
    wordmark: [620, 900],
    wordmarkRise: 8,
    wordmarkCurve: curve.enter,
    /** The whole timeline, ms. */
    duration: 900,
    /** Hand-off: the white ground fades out over the first screen, ms. */
    handOff: 220,
    handOffCurve: curve.standard,
    /**
     * If the first screen is ready before the intro's first frame is, how long the native splash waits for that frame
     * before the intro is skipped, ms. The intro never holds the app back by more than this.
     */
    paintWait: 300,
    /** Points sampled along each curve: the native driver interpolates linearly between them. */
    curveSamples: 10,
  },

  /** The sign-in button (screens/auth/SignInButton.tsx). */
  signIn: {
    /** The outlined pill collapses into a circle, ms; the same time back if the person cancels at Microsoft. */
    collapse: 240,
    collapseCurve: curve.standard,
    /** Part of the collapse in which the label fades out, from its start (0–1). */
    labelFadeEnd: 0.4,
    /** Part of the collapse in which the ring, its arc and "Opening Microsoft…" fade in (0–1). */
    ringFadeStart: 0.6,
    /** "Opening Microsoft…" rises this far into place, dp. */
    captionRise: 6,
    /** One turn of the yellow arc, ms. Loops while Microsoft's page is opening and the sign-in completes. */
    spin: 900,
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
