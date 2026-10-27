// Spacing and corner radius of the MMG Service Desk web portal (docs/brand/WEB-TOKENS.md §3). tailwind.config.js
// reads both, so `p-*`, `m-*`, `gap-*` and `rounded-*` resolve from here.
// - Spacing: the web defines no scale of its own; it uses Tailwind's default (step n = n × 0.25rem), written out here.
// - Radius: the web sets `--radius: 0.5rem` and derives lg / md / sm from it; the other steps are Tailwind's.
// Like typography, rem is 16 on the web and in the app (`inlineRem: 16`, see typography.ts).
// This file must stay free of runtime imports, because tailwind.config.js loads it outside Metro.

export const spacing = {
  0: '0px',
  px: '1px',
  0.5: '0.125rem',
  1: '0.25rem',
  1.5: '0.375rem',
  2: '0.5rem',
  2.5: '0.625rem',
  3: '0.75rem',
  3.5: '0.875rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  7: '1.75rem',
  8: '2rem',
  9: '2.25rem',
  10: '2.5rem',
  11: '2.75rem',
  12: '3rem',
  14: '3.5rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  28: '7rem',
  32: '8rem',
  36: '9rem',
  40: '10rem',
  44: '11rem',
  48: '12rem',
  52: '13rem',
  56: '14rem',
  60: '15rem',
  64: '16rem',
  72: '18rem',
  80: '20rem',
  96: '24rem',
} as const;

export const radius = {
  none: '0px',
  /** Web: calc(var(--radius) - 4px), 4px on the web. Tailwind's own `sm` is 0.125rem. */
  sm: '0.25rem',
  DEFAULT: '0.25rem',
  /** Web: calc(var(--radius) - 2px), 6px on the web. */
  md: '0.375rem',
  /** Web: var(--radius). Buttons, inputs, sidebar items. */
  lg: '0.5rem',
  /** Cards and KPI tiles. */
  xl: '0.75rem',
  /** The login card. */
  '2xl': '1rem',
  '3xl': '1.5rem',
  /** Badges and avatars. */
  full: '9999px',
} as const;
