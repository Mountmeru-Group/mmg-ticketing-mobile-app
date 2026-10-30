// Geometry of the brand moments: the start-up images and the login's "arc split" layout (2026-10-30;
// docs/brand/UI-STANDARDS.md §10, docs/PERFORMANCE.md §12). Sizes are dp unless named `…Px`.
// This file must stay free of runtime imports, like the rest of src/theme.

/**
 * The native splash image and the start-up intro (navigation/SplashIntro.tsx) share this geometry, so the intro's
 * first frame lands exactly on the native splash.
 * - expo-splash-screen draws assets/splash-icon.png (`imagePx` square) `imageDp` wide, centred on the screen
 *   (app.json `imageWidth`; RELEASE.md §7 "Splash geometry"). The intro draws a box of the same size in the same place.
 * - The logo ends the intro `logo.widthPx` wide at (`logo.leftPx`, `logo.topPx`) in that image: 120 × 73 dp, the size
 *   it had on the Phase C splash. The drop layer (assets/brand/meru-drop.png) has the mark's own canvas, so it shares
 *   the logo's box.
 * - scripts/make-splash-assets.py draws the image from the same numbers; tests/motion/start-up-and-login.test.mjs
 *   checks the image against them.
 */
export const splashArt = {
  imageDp: 192,
  imagePx: 1024,
  logo: { leftPx: 192, topPx: 160, widthPx: 640 },
  /** assets/brand/meru-mark.png and meru-drop.png. */
  markPx: { width: 566, height: 346 },
  /** Below the logo: the gap to "Setu", then the gap to the yellow rule and the rule itself. */
  wordmarkGap: 20,
  ruleGap: 6,
  rule: { width: 24, height: 3 },
} as const;

/**
 * Login, "arc split", at the 390 × 844 reference phone. The card's height is a share of the screen's; the decorative
 * circles' x and size scale with the screen's width and their y with its height. Type sizes are in typography.ts
 * (`loginType`) and follow the system text size, not the screen.
 */
export const loginLayout = {
  reference: { width: 390, height: 844 },
  /** The red card is at least this share of the screen's height; it grows (and the page scrolls) if its text needs more. */
  cardHeight: 0.63,
  cardRadius: 46,
  /** Side padding of the card and the white area. */
  gutter: 28,
  /** Space between the card's last line and its rounded bottom edge. */
  cardBottomPadding: 44,
  /** Below the status bar, above the logo card. */
  cardTopPadding: 24,
  /** The white card that holds the logo: the logo is about 1.5 : 1, so the card is too. */
  logoCard: { width: 124, height: 84, radius: 20, padX: 16, padY: 12 },
  /** Circles at the reference width: centre (x, y) from the card's top-left, and diameter. */
  circles: [
    { x: 352, y: 36, size: 260 }, // bleeds off the top right
    { x: -22, y: 372, size: 150 }, // smaller, off the left at the card's lower third
  ],
  sublineMaxWidth: 270,
  /**
   * The outlined sign-in pill, as wide as its content. Its height is fixed at 52 dp, which is also the floor for the
   * touch target: the label fits it up to 200 % system text. While signing in it is a 52 dp circle: `ring` is the width
   * of the spinner's ring and arc.
   */
  button: { height: 52, radius: 26, padX: 24, border: 1.5, logo: 21, logoGap: 12, ring: 3, captionGap: 8 },
} as const;
