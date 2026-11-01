// Type scale. iOS-4: the sizes are iOS's text styles at the default text size ("Large"), from the HIG Typography page
// (developer.apple.com/design/human-interface-guidelines/typography, "iOS, iPadOS Dynamic Type sizes"), so body text
// is iOS's 17 pt, not the web's 14. The class names stay the web's (`text-sm`, `text-base` …), so no screen changed:
// only what each class resolves to. tailwind.config.js reads this file.
// - Font: the system font (SF Pro on iOS); no font is loaded or named here.
// - Dynamic Type: React Native scales every size with the person's text size (allowFontScaling, on by default), up to
//   ×3.571 at the largest accessibility size. iOS's own titles grow less than that, so `maxTextScale` gives the ratio
//   at which each title style stops growing on iOS (its AX5 size ÷ its Large size). Screens set it as
//   `maxFontSizeMultiplier` only on text of 20 pt and more; body and caption text is never capped.
// - Sizes in rem: NativeWind resolves 1rem to 16 pt (`inlineRem: 16` in metro.config.js).
// This file must stay free of runtime imports, because tailwind.config.js loads it outside Metro.

/** `text-*` sizes: [font size, { lineHeight }], each an iOS text style at the default text size. */
export const fontSize = {
  /** Caption 1: 12 / 16. */
  xs: ['0.75rem', { lineHeight: '1rem' }],
  /** Subheadline: 15 / 20. */
  sm: ['0.9375rem', { lineHeight: '1.25rem' }],
  /** Body: 17 / 22. */
  base: ['1.0625rem', { lineHeight: '1.375rem' }],
  /** Title 3: 20 / 25. */
  lg: ['1.25rem', { lineHeight: '1.5625rem' }],
  /** Title 2: 22 / 28. */
  xl: ['1.375rem', { lineHeight: '1.75rem' }],
  /** Title 1: 28 / 34. */
  '2xl': ['1.75rem', { lineHeight: '2.125rem' }],
  /** Large Title: 34 / 41. */
  '3xl': ['2.125rem', { lineHeight: '2.5625rem' }],
} as const satisfies Record<string, readonly [string, { lineHeight: string }]>;

/** The same sizes in points, for the few places that take a number (the HTML renderer, the scale caps). */
export const textStylePoints = {
  caption1: 12,
  footnote: 13,
  subheadline: 15,
  body: 17,
  title3: 20,
  title2: 22,
  title1: 28,
  largeTitle: 34,
} as const;

/**
 * The most a title style grows on iOS: its size at the largest accessibility text size (AX5) ÷ its size at the default
 * (HIG Typography: Large Title 34 → 60, Title 1 28 → 58, Title 2 22 → 56, Title 3 20 → 55). For `maxFontSizeMultiplier`
 * on `text-3xl`, `text-2xl`, `text-xl` and `text-lg` text.
 */
export const maxTextScale = {
  largeTitle: 60 / 34,
  title1: 58 / 28,
  title2: 56 / 22,
  title3: 55 / 20,
} as const;

/** `font-*` weights. */
export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * The login's "arc split" type (2026-10-30, docs/brand/UI-STANDARDS.md §10), in dp. These sizes are outside the web's
 * scale above, so they are styles, not classes, and nothing else uses them; S0's "no arbitrary sizes" still holds
 * everywhere else. Android draws weight 800 with the nearest weight the system font has (Roboto Black on most phones).
 * iOS (iOS-5c): the same numbers, in pt. SF Pro has a true Heavy (800). 15, 13 and 12 happen to be iOS's Subheadline,
 * Footnote and Caption 1 (UI-STANDARDS §iOS-A.12).
 */
export const loginType = {
  /** "One portal / for all your / IT needs.": line height 1.05, tight tracking. */
  headline: { fontSize: 42, lineHeight: 44, letterSpacing: -1.3, fontWeight: '800' },
  /** It is already 42 dp: at most 1.3 × with large system text, so a line does not wrap on a 360 dp phone. */
  headlineMaxScale: 1.3,
  subline: { fontSize: 15, lineHeight: 22.5 },
  /** "Setu" on Login, and on the start-up intro. */
  wordmark: { fontSize: 21, lineHeight: 28, fontWeight: '800' },
  prompt: { fontSize: 13, lineHeight: 18 },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  footer: { fontSize: 12, lineHeight: 16 },
} as const;

/** How the sizes combine (class names). */
export const textRoles = {
  pageTitle: 'text-2xl font-bold',
  kpiValue: 'text-2xl font-bold',
  kpiLabel: 'text-sm',
  cardTitle: 'font-semibold',
  navItem: 'text-sm font-medium',
  body: 'text-sm',
  caption: 'text-xs',
  badge: 'text-xs font-medium',
} as const;
