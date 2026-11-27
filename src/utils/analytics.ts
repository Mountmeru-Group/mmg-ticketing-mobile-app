// Analytics (2026-11-26, ADMIN only): what each section of the three screens shows, from what the server sent. Pure.
// Contract: docs/ANALYTICS-BACKEND.md (NOT YET DEPLOYED); request and reading rules: src/api/analytics.api.ts.
//
// THE RULES (Ronit's brief):
// - A missing section is not rendered. A missing number LEAVES ITS TILE OUT: never a zero, never a dash, because a zero
//   looks like an answer. A zero the server sent is an answer, and shows as "0".
// - Google Play figures always carry how recent they are: whenever any Play figure shows, the section's heading says
//   "Google Play · as at <dataThrough>"; without a dataThrough it says "Google Play" and nothing about when.
// - Action names are the audit log's own labels (utils/audit-log.ts auditActionLabel): no second wording for one enum.
import type { AnalyticsInstalls, AnalyticsOverview, AnalyticsRange, AnalyticsUserRow, AnalyticsUserSort, UserRole } from '@/types';
import { auditActionLabel } from './audit-log';
import { DASHBOARD_PERIODS } from './dashboard-period';
import { formatDate, formatDisplayName, formatRelativeShort } from './format';
import { filterByText, optionSearchAnnouncement } from './option-search';
import { ROLE_LABELS } from './roles';

// ── The period and the sort ──────────────────────────────────

/** The four ranges every ANL endpoint takes, in the period control's order (18 §4a, §6d). */
export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ['today', 'last7', 'last30', 'last90'];
/** The screen opens on the last 30 days (Ronit's brief). */
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = 'last30';
/** ANL-2 `sortBy` (18 §4b), in the chips' order. */
export const ANALYTICS_USER_SORTS: readonly AnalyticsUserSort[] = ['lastSeen', 'actions', 'name'];

/** The dashboard's own label where it has the same range (Today, Last 7 days, Last 30 days); the fourth is new. */
function dashboardLabel(value: string, fallback: string): string {
  return DASHBOARD_PERIODS.find((p) => p.value === value)?.label ?? fallback;
}

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  today: dashboardLabel('today', 'Today'),
  last7: dashboardLabel('last7', 'Last 7 days'),
  last30: dashboardLabel('last30', 'Last 30 days'),
  last90: 'Last 90 days',
};
export const ANALYTICS_RANGE_OPTIONS: readonly { value: AnalyticsRange; label: string }[] =
  ANALYTICS_RANGES.map((value) => ({ value, label: RANGE_LABELS[value] }));

export function analyticsRangeLabel(range: AnalyticsRange): string {
  return ANALYTICS_RANGE_OPTIONS.find((r) => r.value === range)?.label ?? range;
}

/** Screen two's three chips; "Last seen" first and the default. Every one is ANL-2's `sortBy`, applied by the server. */
const SORT_LABELS: Record<AnalyticsUserSort, string> = { lastSeen: 'Last seen', actions: 'Most actions', name: 'Name' };
export const ANALYTICS_SORT_OPTIONS: readonly { value: AnalyticsUserSort; label: string }[] =
  ANALYTICS_USER_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }));
export const DEFAULT_ANALYTICS_SORT: AnalyticsUserSort = 'lastSeen';

// ── Numbers ──────────────────────────────────────────────────

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** "1,631"; a fraction keeps up to two decimals ("0.42"). */
export function formatCount(n: number): string {
  const [whole, fraction] = String(Math.abs(Math.round(n * 100) / 100)).split('.');
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '−' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

/** "8.4%", "0.42%", "0%". */
export function formatPercent(n: number): string {
  return `${formatCount(n)}%`;
}

/** Growth, signed: "+8.4%", "−3.1%", "0%". */
export function formatSignedPercent(n: number): string {
  return `${n > 0 ? '+' : ''}${formatPercent(n)}`;
}

// ── Tiles ────────────────────────────────────────────────────

/** One figure: its words, its number as text, and an optional note beside it (growth beside installs). */
export interface AnalyticsFigure {
  key: string;
  label: string;
  value: string;
  note?: string;
}

/** A figure only when its number came: undefined, null, NaN or a string leave it OUT. */
function figure(key: string, label: string, value: unknown, format: (n: number) => string = formatCount): AnalyticsFigure[] {
  return isNum(value) ? [{ key, label, value: format(value) }] : [];
}

// ── 1. The app (ANL-4, Google Play) ──────────────────────────

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "17 Nov 2026" for a `YYYY-MM-DD` on the phone's calendar (not UTC midnight), or for an ISO instant; else null. */
export function playDayLabel(value: string | undefined): string | null {
  if (!value) return null;
  const m = DAY.exec(value);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatDate(date);
}

/** The heading every Play figure sits under. */
export function playHeading(dataThrough: string | undefined): string {
  const day = playDayLabel(dataThrough);
  return day ? `Google Play · as at ${day}` : 'Google Play';
}

export interface PlaySection {
  /** "Google Play · as at 17 Nov 2026", or "Google Play". Shown whenever the section is. */
  heading: string;
  /** The dark banner: current installs large, active devices beside it. */
  banner: AnalyticsFigure[];
  /** Installs (growth beside it), uninstalls, audience, crash rate. */
  tiles: AnalyticsFigure[];
}

/**
 * Section 1, or null when there is nothing from Google to show (ANL-4 not deployed, or no Play figure in its answer).
 * The heading comes with every figure, so no Play number can show without saying how recent it is.
 */
export function playSection(installs: AnalyticsInstalls | null | undefined): PlaySection | null {
  if (!installs) return null;
  const totals = installs.totals ?? {};
  const banner = [
    ...figure('currentInstalls', 'Current installs', totals.currentInstalls),
    ...figure('activeDevices', 'Active devices', totals.activeDevices),
  ];
  const installsTile = figure('installs', 'Installs', totals.installs);
  // Growth sits beside installs; with no installs number there is no tile for it to sit in.
  if (installsTile[0] && isNum(totals.growthRatePercent)) installsTile[0].note = formatSignedPercent(totals.growthRatePercent);
  const tiles = [
    ...installsTile,
    ...figure('uninstalls', 'Uninstalls', totals.uninstalls),
    ...figure('audienceSize', 'Audience', totals.audienceSize),
    ...figure('crashRatePercent', 'Crash rate', installs.crashRatePercent, formatPercent),
  ];
  if (banner.length === 0 && tiles.length === 0) return null;
  return { heading: playHeading(installs.dataThrough), banner, tiles };
}

// ── 2. People (ANL-1) ────────────────────────────────────────

export function peopleTiles(overview: AnalyticsOverview | null | undefined): AnalyticsFigure[] {
  const users = overview?.users ?? {};
  return [
    ...figure('activeToday', 'Active today', users.activeToday),
    ...figure('activeThisMonth', 'Active this month', users.activeThisMonth),
    ...figure('loginsMobile', 'Logins on Setu', overview?.logins?.mobile),
    ...figure('newThisPeriod', 'New this period', users.newThisPeriod),
  ];
}

/** activeThisMonth / totalWithAccess as a whole percent; null when either is missing or there is nobody with access. */
export function adoptionPercent(overview: AnalyticsOverview | null | undefined): number | null {
  const active = overview?.users?.activeThisMonth;
  const total = overview?.users?.totalWithAccess;
  if (!isNum(active) || !isNum(total) || total <= 0) return null;
  return Math.round((active / total) * 100);
}

/** "Of 1,631 people with access, 13% used Setu this month", or null (the line is then left out). */
export function adoptionLine(overview: AnalyticsOverview | null | undefined): string | null {
  const percent = adoptionPercent(overview);
  const total = overview?.users?.totalWithAccess;
  if (percent === null || !isNum(total)) return null;
  return `Of ${formatCount(total)} ${total === 1 ? 'person' : 'people'} with access, ${percent}% used Setu this month`;
}

/** The count on the row that opens screen two: everyone with access; null when not sent. */
export function peopleCount(overview: AnalyticsOverview | null | undefined): number | null {
  const total = overview?.users?.totalWithAccess;
  return isNum(total) ? total : null;
}

// ── 3. Where, and 4. What they did: bars ─────────────────────

export interface AnalyticsBar {
  key: string;
  label: string;
  value: number;
  /** The count, as text, at the bar's right. */
  valueText: string;
  /** Width relative to the largest bar, 0–1. */
  fraction: number;
}

/** Widest first (ties by label); each bar relative to the largest. Rows without a name or a number are left out. */
function bars(rows: { key: string; label: string | undefined; value: unknown }[]): AnalyticsBar[] {
  const kept = rows.filter((r): r is { key: string; label: string; value: number } => !!r.label && isNum(r.value));
  const max = Math.max(0, ...kept.map((r) => r.value));
  return kept
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .map((r) => ({
      key: r.key,
      label: r.label,
      value: r.value,
      valueText: formatCount(r.value),
      fraction: max > 0 ? Math.min(1, Math.max(0, r.value / max)) : 0,
    }));
}

/** Section 3: devices per country (ANL-1 devices.byCountry). Empty when missing or empty: the section is then left out. */
export function countryBars(overview: AnalyticsOverview | null | undefined): AnalyticsBar[] {
  const list = overview?.devices?.byCountry ?? [];
  return bars(list.map((c, i) => ({ key: `country:${c.countryId ?? c.country ?? i}`, label: c.country, value: c.devices })));
}

/** Section 4: a bar per action type, in the audit log's words (ANL-1 actions.byType). */
export function actionBars(overview: AnalyticsOverview | null | undefined): AnalyticsBar[] {
  const list = overview?.actions?.byType ?? [];
  return bars(list.map((a, i) => ({
    key: `action:${a.action ?? i}`,
    label: a.action ? analyticsActionLabel(a.action) : undefined,
    value: a.count,
  })));
}

/** Section 4's total, as text, or null when not sent. */
export function actionsTotal(overview: AnalyticsOverview | null | undefined): string | null {
  const total = overview?.actions?.total;
  return isNum(total) ? formatCount(total) : null;
}

/** An action in words: the audit log's label, and nothing else (a newer value in words, as the audit log shows it). */
export function analyticsActionLabel(action: string): string {
  return auditActionLabel(action);
}

// ── Screens two and three: a person ──────────────────────────

/** formatDisplayName, else the email, else a plain stand-in: a row is never blank. */
export function personName(row: Pick<AnalyticsUserRow, 'name' | 'email'> | undefined): string {
  return formatDisplayName(row?.name) || row?.email || 'Name not given';
}

/** The role in the app's words ("Technician" for AGENT); a role the app does not know, in words ("SUPER_ADMIN" → "Super Admin"). */
export function personRoleLabel(role: string | undefined): string | null {
  if (!role) return null;
  const known = (ROLE_LABELS as Record<string, string>)[role as UserRole];
  if (known) return known;
  return role.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || null;
}

/** "Status Changed on #10482": the audit log's label, then the ticket; the label alone without a ticket; null without a type. */
export function lastActionSentence(lastAction: AnalyticsUserRow['lastAction'] | undefined): string | null {
  if (!lastAction?.type) return null;
  const label = analyticsActionLabel(lastAction.type);
  return isNum(lastAction.ticketNumber) ? `${label} on #${lastAction.ticketNumber}` : label;
}

/**
 * Nothing in the period: zero days active, or (without that count) zero actions AND zero logins. Only counts the server
 * SENT can say so: a person with none of the three is not called inactive, because a missing number is not a zero.
 */
export function isInactiveInPeriod(row: AnalyticsUserRow): boolean {
  if (isNum(row.daysActiveInPeriod)) return row.daysActiveInPeriod === 0;
  return isNum(row.actionsInPeriod) && isNum(row.loginsInPeriod) && row.actionsInPeriod === 0 && row.loginsInPeriod === 0;
}

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** "184 actions · 17 days active"; each part only when sent; null when neither was. */
export function personCountsLine(row: AnalyticsUserRow): string | null {
  const parts = [
    ...(isNum(row.actionsInPeriod) ? [plural(row.actionsInPeriod, 'action', 'actions')] : []),
    ...(isNum(row.daysActiveInPeriod) ? [plural(row.daysActiveInPeriod, 'day active', 'days active')] : []),
  ];
  return parts.length ? parts.join(' · ') : null;
}

/** Screen two's middle line, for someone active: what they last did and when; else when they were last seen; else null. */
export function personActivityLine(row: AnalyticsUserRow, now: number = Date.now()): string | null {
  const sentence = lastActionSentence(row.lastAction);
  const when = row.lastAction?.at ?? row.lastSeenAt;
  if (sentence) return when ? `${sentence} · ${formatRelativeShort(when, now)}` : sentence;
  return row.lastSeenAt ? `Last seen ${formatRelativeShort(row.lastSeenAt, now)}` : null;
}

/** Screen two, someone with nothing in the period: "Last seen 12 Oct 2026" (a date, not "3w ago"); null without one. */
export function lastSeenDateLine(row: AnalyticsUserRow): string | null {
  return row.lastSeenAt ? `Last seen ${formatDate(row.lastSeenAt)}` : null;
}

/** Screen three's three counts, each left out when not sent. */
export function personCountTiles(row: AnalyticsUserRow | undefined): AnalyticsFigure[] {
  return [
    ...figure('actionsInPeriod', 'Actions', row?.actionsInPeriod),
    ...figure('loginsInPeriod', 'Logins', row?.loginsInPeriod),
    ...figure('daysActiveInPeriod', 'Days active', row?.daysActiveInPeriod),
  ];
}

/** Screen three's chips: "Has the app" only when the server says so (false is not "no app": it means no device token). */
export function personChips(row: AnalyticsUserRow | undefined, now: number = Date.now()): { key: string; label: string }[] {
  if (!row) return [];
  return [
    ...(row.hasMobileApp === true ? [{ key: 'app', label: 'Has the app' }] : []),
    ...(row.lastSeenAt ? [{ key: 'seen', label: `Active ${formatRelativeShort(row.lastSeenAt, now)}` }] : []),
  ];
}

// ── Screen two: search on the phone, and how much of the list it covers (2026-11-27) ──
// Ronit's decision: ANL-2 has no `search` parameter and will not gain one, so the search runs on the phone. It is only
// honest over the WHOLE list, so the screen loads every page first (hooks/useAnalytics.ts, capped at
// ANALYTICS_MAX_PAGES), and whenever what it holds is not everyone, a line above the results says so (peopleCoverage).

/** The texts a person is found by: the name as shown, the name as sent, the email. */
const personSearchTexts = (row: AnalyticsUserRow) => [formatDisplayName(row.name), row.name, row.email];

/**
 * Screen two's search: anywhere in the name OR the email, any case, the query trimmed. It IS option-search.ts's rule
 * (filterByText), not a second matcher. The rows keep their order: the server's, for the sort chip chosen.
 */
export function filterPeople(rows: readonly AnalyticsUserRow[], query: string): readonly AnalyticsUserRow[] {
  return filterByText(rows, query, personSearchTexts);
}

/** Where loading the list stands (useAnalyticsUsers, read by screen two). */
export interface PeopleLoadState {
  /** People held, once each. */
  loaded: number;
  /** ANL-2's `total`, when it sent one. */
  total: number | null;
  /** Another page is due (under the cap). */
  more: boolean;
  /** That page waits for the network. */
  waiting: boolean;
  /** A request failed: loading stopped, and what arrived is kept. */
  failed: boolean;
  /** The cap stopped loading, and the server has more. */
  capped: boolean;
}

export type PeopleCoverageKind = 'complete' | 'failed' | 'waiting' | 'loading' | 'capped' | 'short';

export interface PeopleCoverage {
  kind: PeopleCoverageKind;
  /** The plain line above the results; null only when the list is everyone. */
  text: string | null;
  /** Said after the number of matches; null only when the list is everyone. */
  note: string | null;
}

/**
 * Whether the search covers everyone, and the line that says so when it does not. NEVER silent about a gap: a list
 * that is still loading, stopped by a failure or the network, cut by the cap, or short of the server's total gets its
 * line. Only a list known to be whole has none.
 */
export function peopleCoverage(s: PeopleLoadState): PeopleCoverage {
  const n = formatCount(s.loaded);
  const of = s.total !== null ? ` of ${formatCount(s.total)}` : '';
  const people = (s.total ?? s.loaded) === 1 ? 'person' : 'people';
  const incomplete = `The list is incomplete: ${n}${of} ${people} loaded.`;
  const line = (kind: PeopleCoverageKind, text: string, note: string = text): PeopleCoverage => ({ kind, text, note });

  if (s.failed) return line('failed', `${incomplete} Search covers only those.`);
  if (s.more && s.waiting) return line('waiting', `${incomplete} The rest load when you're back online.`);
  if (s.more) return line('loading', `More people are coming: ${n}${of} loaded so far.`, 'More people are still loading.');
  if (s.capped) {
    return line('capped', s.total !== null && s.total > s.loaded
      ? `Search covers the first ${n} of ${formatCount(s.total)} people.`
      : `Search covers the first ${n} people. There may be more.`);
  }
  if (s.total !== null && s.loaded < s.total) return line('short', `${incomplete} Search covers only those.`);
  return { kind: 'complete', text: null, note: null };
}

/** What TalkBack says once typing pauses: the number of matches (option-search's words), then any gap in the list. */
export function peopleSearchAnnouncement(matches: number, note: string | null): string {
  const count = optionSearchAnnouncement(matches);
  return note ? `${count}. ${note}` : count;
}
