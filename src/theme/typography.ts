// Type scale of the MMG Service Desk web portal (docs/brand/WEB-TOKENS.md §2). tailwind.config.js reads it, so the
// `text-*` and `font-*` classes resolve from here.
// - Font: the web sets no font of its own, so it renders Tailwind's default system stack (`font-sans`), which is
//   Roboto on Android. Roboto is also React Native's default on Android, so no font is loaded or named here.
// - Sizes are the web's scale (Tailwind's default) in rem. Since Phase C, NativeWind resolves 1rem to 16 dp as the web
//   does (`inlineRem: 16` in metro.config.js; its default is 14), so `text-sm` is 14 on both.
// This file must stay free of runtime imports, because tailwind.config.js loads it outside Metro.

/** `text-*` sizes: [font size, { lineHeight }]. */
export const fontSize = {
  xs: ['0.75rem', { lineHeight: '1rem' }],
  sm: ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem', { lineHeight: '1.5rem' }],
  lg: ['1.125rem', { lineHeight: '1.75rem' }],
  xl: ['1.25rem', { lineHeight: '1.75rem' }],
  '2xl': ['1.5rem', { lineHeight: '2rem' }],
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
} as const satisfies Record<string, readonly [string, { lineHeight: string }]>;

/** `font-*` weights the web uses. */
export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** How the web combines them (frontend/src: KPICard, AppLayout sidebar, the three badges, cards). Class names. */
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
