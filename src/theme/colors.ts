// The app's one source of colour. Every value comes from the MMG Service Desk web portal; docs/brand/WEB-TOKENS.md
// names the web file each one was read from.
// - `palette`: Tailwind CSS 3.4's default colours, only the shades in use. Web and mobile both pin tailwindcss 3.4.19,
//   so `bg-blue-600` on the web, `bg-blue-600` here and `palette.blue[600]` are the same colour.
// - `colors`: what a colour is for (brand, surfaces, text, badges, dashboard tiles, navigation).
// - tailwind.config.js reads `colors`, so `bg-primary`, `text-muted-foreground`, `border-border` … mean what they mean
//   on the web.
// No hex literal belongs anywhere else in src/: import from '@/theme'. This file must stay free of runtime imports,
// because tailwind.config.js loads it outside Metro.
import type { SLAStatus, TicketPriority, TicketStatus } from '@/types';

export const palette = {
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af',
    500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827',
  },
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 500: '#64748b', 700: '#334155' },
  zinc: { 600: '#52525b', 700: '#3f3f46' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
  orange: { 100: '#ffedd5', 500: '#f97316', 700: '#c2410c' },
  amber: { 100: '#fef3c7', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' },
  yellow: { 100: '#fef9c3', 500: '#eab308', 600: '#ca8a04', 700: '#a16207' },
  lime: { 500: '#84cc16' },
  green: { 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
  emerald: { 500: '#10b981' },
  teal: { 100: '#ccfbf1', 400: '#2dd4bf', 700: '#0f766e' },
  cyan: { 100: '#cffafe', 500: '#06b6d4', 700: '#0e7490' },
  sky: { 400: '#38bdf8' },
  blue: { 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' },
  indigo: { 100: '#e0e7ff', 400: '#818cf8', 700: '#4338ca' },
  violet: { 500: '#8b5cf6', 700: '#6d28d9' },
  purple: { 100: '#f3e8ff', 400: '#c084fc', 500: '#a855f7', 700: '#7e22ce' },
  pink: { 500: '#ec4899' },
} as const;

/** A pill: background and text colour. */
export interface BadgeTone {
  bg: string;
  fg: string;
}

const tone = (bg: string, fg: string): BadgeTone => ({ bg, fg });

// Brand: the web's `--primary` and `--secondary`/`--accent` (HSL in the web's CSS), as hex.
const BRAND_RED = '#d21121'; // hsl(355 85% 44.5%)
const BRAND_YELLOW = '#ffcc00'; // hsl(48 100% 50%)

/** Ticket status pill. Web: frontend/src/components/ui/StatusBadge.tsx. */
const status: Record<TicketStatus, BadgeTone> = {
  OPEN: tone(palette.blue[100], palette.blue[700]),
  IN_PROGRESS: tone(palette.yellow[100], palette.yellow[700]),
  PENDING: tone(palette.orange[100], palette.orange[700]),
  ON_HOLD: tone(palette.slate[200], palette.slate[700]),
  PENDING_MGMT_REVIEW: tone(palette.purple[100], palette.purple[700]),
  PENDING_MASTER_DATA: tone(palette.indigo[100], palette.indigo[700]),
  PENDING_PARTNER: tone(palette.amber[100], palette.amber[700]),
  PENDING_USER_CONFIRM: tone(palette.cyan[100], palette.cyan[700]),
  PENDING_USER_INFO: tone(palette.teal[100], palette.teal[700]),
  RESOLVED: tone(palette.green[100], palette.green[700]),
  CANCELED: tone(palette.red[100], palette.red[600]),
  CLOSED: tone(palette.zinc[700], palette.white),
};

/** Priority pill. Web: frontend/src/components/ui/PriorityBadge.tsx. */
const priority: Record<TicketPriority, BadgeTone> = {
  LOW: tone(palette.gray[100], palette.gray[600]),
  MEDIUM: tone(palette.blue[100], palette.blue[700]),
  HIGH: tone(palette.orange[100], palette.orange[700]),
  URGENT: tone(palette.red[100], palette.red[700]),
};

/** SLA pill. Web: frontend/src/components/ui/SLABadge.tsx. */
const sla: Record<SLAStatus, BadgeTone> = {
  WITHIN_SLA: tone(palette.green[100], palette.green[700]),
  DUE_SOON: tone(palette.yellow[100], palette.yellow[700]),
  BREACHED: tone(palette.red[100], palette.red[700]),
};

export const colors = {
  // ── The web's CSS variables (frontend/src/index.css `:root`), under the web's tailwind.config.js names ──
  primary: BRAND_RED,
  primaryForeground: palette.white,
  secondary: BRAND_YELLOW,
  secondaryForeground: '#1a1a1a', // hsl(0 0% 10%)
  accent: BRAND_YELLOW,
  accentForeground: '#1a1a1a',
  destructive: '#ef4444', // hsl(0 84.2% 60.2%)
  destructiveForeground: '#f8fafc', // hsl(210 40% 98%)
  background: palette.white,
  foreground: '#020817', // hsl(222.2 84% 4.9%)
  card: palette.white,
  cardForeground: '#020817',
  muted: '#f1f5f9', // hsl(210 40% 96.1%)
  mutedForeground: '#64748b', // hsl(215.4 16.3% 46.9%)
  border: '#e2e8f0', // hsl(214.3 31.8% 91.4%); every unqualified `border` on the web
  input: '#e2e8f0',
  ring: BRAND_RED,

  // ── What the web's pages actually paint (frontend/src/layouts/AppLayout.tsx, pages/) ──
  /** Page background behind cards (`bg-gray-50`). */
  canvas: palette.gray[50],
  /** Cards, sidebar, top bar (`bg-white`). */
  surface: palette.white,
  text: {
    /** Headings and values (`text-gray-900`). */
    primary: palette.gray[900],
    /** Form labels and table cells (`text-gray-700`). */
    body: palette.gray[700],
    /** Labels and captions (`text-gray-500`). */
    secondary: palette.gray[500],
    /** Hints, placeholders, chevrons (`text-gray-400`). */
    muted: palette.gray[400],
    inverse: palette.white,
  },

  /** Sidebar and bottom bar. Web: AppLayout.tsx NavLink (active `bg-primary text-white`) and MobileBottomNav. */
  nav: {
    activeBg: BRAND_RED,
    activeFg: palette.white,
    idleFg: palette.gray[600],
    tabActive: BRAND_RED,
    tabIdle: palette.gray[400],
  },

  status,
  priority,
  sla,
  /** Any status, priority or SLA value the app does not know (`bg-gray-100 text-gray-600` in all three web badges). */
  badgeFallback: tone(palette.gray[100], palette.gray[600]),

  /** Dashboard KPI tiles: the square behind the tile's white icon. Web: pages/dashboard/DashboardPage.tsx KPICard. */
  kpi: {
    total: palette.purple[500],
    open: palette.blue[500],
    inProgress: palette.yellow[500],
    resolved: palette.green[500],
    slaBreached: palette.red[500],
    closed: palette.zinc[600],
    unassigned: palette.orange[500],
  },
  /** The dot on the dashboard's pending sub-status mini-tiles (staff only). Same web file. */
  kpiPending: {
    PENDING_MGMT_REVIEW: palette.amber[400],
    PENDING_PARTNER: palette.purple[400],
    PENDING_USER_CONFIRM: palette.sky[400],
    PENDING_USER_INFO: palette.indigo[400],
    PENDING_MASTER_DATA: palette.teal[400],
    ON_HOLD: palette.gray[400],
  } satisfies Partial<Record<TicketStatus, string>>,

  /** Dashboard chart series. Web: DashboardPage.tsx STATUS_COLORS / PRIORITY_COLORS (no colour there for CANCELED). */
  chart: {
    status: {
      OPEN: palette.blue[500],
      IN_PROGRESS: palette.amber[500],
      ON_HOLD: palette.violet[500],
      PENDING: palette.orange[500],
      RESOLVED: palette.emerald[500],
      CLOSED: palette.gray[500],
      PENDING_MGMT_REVIEW: palette.pink[500],
      PENDING_USER_CONFIRM: palette.cyan[500],
      PENDING_USER_INFO: palette.lime[500],
      PENDING_MASTER_DATA: palette.red[500],
      PENDING_PARTNER: palette.purple[500],
    } satisfies Partial<Record<TicketStatus, string>>,
    priority: {
      LOW: palette.emerald[500],
      MEDIUM: palette.amber[500],
      HIGH: palette.orange[500],
      URGENT: palette.red[500],
    } satisfies Record<TicketPriority, string>,
    slaMet: palette.emerald[500],
    slaBreached: palette.red[500],
  },
} as const;
