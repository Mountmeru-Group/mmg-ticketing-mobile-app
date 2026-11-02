// Home's PERIOD row (G6): the web dashboard's "Range" buttons, in the web's order, sending DSH-1 what the web sends.
// The web's behaviour, with sources: docs/G6-WEB-DASHBOARD.md §2. Pure functions.
//
// - Each preset sends `range=<value>`, the value the web's button sends (FE:DashboardPage.tsx:294-304, :99).
// - The server turns it into a window ending tonight (BE:dashboard.controller.ts:206-228). Some labels are not what the
//   window is: "This week" = the last 7 days (= "Last 7 days"), "This month" = the last 30 days (= "Last 30 days"),
//   "Quarterly" = 90 days, "This year" = 365 days. The labels are the web's; the mismatch is reported (05 B.36).
// - Custom sends `from` and `to` (`YYYY-MM-DD`) once both days are picked, as the web does (:106). The web also sends
//   `range=custom`, which the server never reads when `from` is present (:244, :300) and which is not a DSH-1 range in
//   03 §C, so the app leaves `range` out: same window, same server cache key (`custom:<from>:<to>`).
import type { DashboardQuery } from '@/api/dashboard.api';
import type { DashboardRange } from '@/types';
import { formatFilterDay, isFilterDay } from './ticket-filters';

/** A Home period: one of DSH-1's ranges, or a custom From–To. */
export type DashboardPeriod = DashboardRange | 'custom';

/** The web's buttons, in its order and with its words (sentence case, as everywhere in the app). */
export const DASHBOARD_PERIODS: readonly { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

/** The web opens its dashboard on "This Month" (FE:DashboardPage.tsx:61), which the server reads as the last 30 days. */
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = 'month';

/** The Custom period's two days, `YYYY-MM-DD` on the device's calendar (what the web's date inputs give), or null. */
export interface CustomDayRange {
  from: string | null;
  to: string | null;
}

export const NO_CUSTOM_RANGE: CustomDayRange = { from: null, to: null };

export type CustomRangeProblem = 'from-missing' | 'to-missing' | 'from-after-to';

export const CUSTOM_RANGE_MESSAGES: Record<CustomRangeProblem, string> = {
  'from-missing': 'Pick a From day to see the counts.',
  'to-missing': 'Pick a To day to see the counts.',
  'from-after-to': 'The From day must be on or before the To day.',
};

/**
 * Why a custom range can't be sent yet, or null when it can. The web sends nothing until both days are set (:106) and
 * checks nothing else; the server checks nothing at all (BE:dashboard.controller.ts:300-302), so From after To would
 * just count zero. The app refuses that instead, and never sends a day the server can't parse (isFilterDay).
 */
export function customRangeProblem(range: CustomDayRange): CustomRangeProblem | null {
  if (!isFilterDay(range.from)) return 'from-missing';
  if (!isFilterDay(range.to)) return 'to-missing';
  if (range.from > range.to) return 'from-after-to';
  return null;
}

/** The DSH-1 params for a period, or null when there is nothing to ask yet (Custom without a valid range). */
export function dashboardPeriodQuery(
  period: DashboardPeriod,
  custom: CustomDayRange,
): Pick<DashboardQuery, 'range' | 'from' | 'to'> | null {
  if (period !== 'custom') return { range: period };
  if (customRangeProblem(custom) !== null) return null;
  return { from: custom.from as string, to: custom.to as string };
}

/** The period part of the DSH-1 query key: the range, or `custom:<from>:<to>` (the server's own cache key, :244). */
export function dashboardPeriodKey(query: Pick<DashboardQuery, 'range' | 'from' | 'to'>): string {
  return query.from ? `custom:${query.from}:${query.to ?? ''}` : (query.range ?? DEFAULT_DASHBOARD_PERIOD);
}

export function dashboardPeriodLabel(period: DashboardPeriod): string {
  return DASHBOARD_PERIODS.find((p) => p.value === period)?.label ?? period;
}

/** "01 Oct 2026 – 15 Oct 2026" for a complete custom range, else null. */
export function customRangeLabel(range: CustomDayRange): string | null {
  if (customRangeProblem(range) !== null) return null;
  return `${formatFilterDay(range.from as string)} – ${formatFilterDay(range.to as string)}`;
}

// ── The period on the ticket list (G7) ───────────────────────

/** The created-date filter a Home tile hands to the ticket list: TKT-1 `fromDate` / `toDate` (`YYYY-MM-DD`). */
export interface PeriodListDates {
  fromDate: string;
  toDate: string;
}

/**
 * The days a Home tile puts on the ticket list for a period, computed exactly as the web's dashboard links compute them
 * (`getRangeDateParams`, FE:pages/dashboard/DashboardPage.tsx:72-86):
 * - "today" is the **UTC** calendar day of the device clock (`toISOString()`, :74), and "N days ago" is the device's
 *   date minus N (`setDate`, :76), also read as a UTC day. TKT-1 reads both as UTC days (BE:tickets.controller.ts:125-130),
 *   so this is the server's own window whenever the server runs on UTC (docs/G7-PERIOD-APPROVALS-PUSH.md §1.3).
 * - today, yesterday: that one day. last7 / week: 7 days ago → today. last30 / month: 30. quarter: 90. year: 365.
 * - all: null, no date filter (:84).
 * - custom: its From and To, once the range is valid. The web also sends a lone From (:77); the app shows no counts for
 *   an incomplete range (dashboardPeriodQuery), so there is no number for a list to match and it sends nothing.
 */
export function periodListDates(period: DashboardPeriod, custom: CustomDayRange, now: Date = new Date()): PeriodListDates | null {
  const day = (d: Date) => d.toISOString().split('T')[0] as string;
  const daysAgo = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return day(d);
  };
  const today = day(now);
  switch (period) {
    case 'today':
      return { fromDate: today, toDate: today };
    case 'yesterday':
      return { fromDate: daysAgo(1), toDate: daysAgo(1) };
    case 'last7':
    case 'week':
      return { fromDate: daysAgo(7), toDate: today };
    case 'last30':
    case 'month':
      return { fromDate: daysAgo(30), toDate: today };
    case 'quarter':
      return { fromDate: daysAgo(90), toDate: today };
    case 'year':
      return { fromDate: daysAgo(365), toDate: today };
    case 'all':
      return null;
    case 'custom':
      return customRangeProblem(custom) === null ? { fromDate: custom.from as string, toDate: custom.to as string } : null;
  }
}
