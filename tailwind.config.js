// Design tokens come from src/theme/ (the one source of truth; docs/brand/WEB-TOKENS.md says where each value was read
// on the web). Those files are TypeScript: Tailwind's config loader requires this file with Node, which strips the
// types (Node 22.18+ / 24), and falls back to its own jiti + sucrase loader if Node cannot.
const { colors } = require('./src/theme/colors.ts');
const { radius, spacing } = require('./src/theme/spacing.ts');
const { fontSize, fontWeight } = require('./src/theme/typography.ts');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // The web's colour names (frontend/tailwind.config.js), so a class means the same thing in both apps.
      // Tailwind's default palette (`bg-blue-600` …) stays available and equals `palette` in src/theme/colors.ts.
      colors: {
        border: colors.border,
        input: colors.input,
        ring: colors.ring,
        background: colors.background,
        foreground: colors.foreground,
        primary: { DEFAULT: colors.primary, foreground: colors.primaryForeground },
        secondary: { DEFAULT: colors.secondary, foreground: colors.secondaryForeground },
        destructive: { DEFAULT: colors.destructive, foreground: colors.destructiveForeground },
        muted: { DEFAULT: colors.muted, foreground: colors.mutedForeground },
        accent: { DEFAULT: colors.accent, foreground: colors.accentForeground },
        card: { DEFAULT: colors.card, foreground: colors.cardForeground },
        canvas: colors.canvas,
        surface: colors.surface,
      },
      fontSize,
      fontWeight,
      spacing,
      borderRadius: radius,
    },
  },
  plugins: [],
};
