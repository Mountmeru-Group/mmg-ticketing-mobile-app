// Copied verbatim from 03-DATA-MODEL.md §C ("Analytics (ANL-1..4)", 2026-11-26). Do not edit by hand.
import type { ISODateString, Paginated, UUID } from './api';
import type { AuditLogEntry } from './audit';

// ── Analytics (ANL-1..4) — NOT YET DEPLOYED (2026-11-26) ─────
// Source: docs/ANALYTICS-BACKEND.md ("18 — Analytics Dashboard: Backend Specification", 2026-11-19), the shapes the app
// asked the backend team for. Nothing here is deployed or in the web source. The spec makes EVERY field optional ("the
// app renders what arrives and skips what doesn't", §4a), so every field below is optional; the app reads what is there.
/** `range`, on all four (18 §4a, §6d). */
export type AnalyticsRange = 'today' | 'last7' | 'last30' | 'last90';
/** ANL-2 `sortBy` (18 §4b). Sorting is server-side. */
export type AnalyticsUserSort = 'lastSeen' | 'actions' | 'name';
/** ANL-1 / ANL-4 query. `countryId` is optional and the app does not send it yet. */
export interface AnalyticsQuery { range?: AnalyticsRange; countryId?: UUID; }
/** ANL-1 `GET /analytics/overview` (18 §4a). */
export interface AnalyticsOverview {
  range?: AnalyticsRange; from?: ISODateString; to?: ISODateString;
  users?: { activeToday?: number; activeThisMonth?: number; totalWithAccess?: number; newThisPeriod?: number };
  devices?: { registered?: number; activeThisMonth?: number; byCountry?: AnalyticsDeviceCountry[] };
  logins?: { mobile?: number; web?: number };   // 18 §3a: depends on a platform column the backend may have to add
  actions?: { total?: number; byType?: AnalyticsActionCount[] };
}
export interface AnalyticsDeviceCountry { countryId?: UUID; country?: string; devices?: number; }
/** `action` is an AuditAction (A above), or a newer value the app shows in words. */
export interface AnalyticsActionCount { action?: string; count?: number; }
/** ANL-2 query (18 §4b). `limit` caps at 100. No search parameter exists. */
export interface AnalyticsUsersQuery {
  range?: AnalyticsRange; page?: number; limit?: number; sortBy?: AnalyticsUserSort; countryId?: UUID;
}
/** ANL-2 `GET /analytics/users` (18 §4b). A fifth pagination shape: the rows are under `rows`, not `data`. */
export interface AnalyticsUsersPage { page?: number; limit?: number; total?: number; rows?: AnalyticsUserRow[]; }
export interface AnalyticsUserRow {
  userId?: UUID; name?: string; email?: string;
  role?: string;                                // a UserRole in the spec's example ("AGENT")
  country?: string;                             // a country NAME ("Zambia"), not an id
  lastSeenAt?: ISODateString;
  lastAction?: { type?: string; ticketNumber?: number; at?: ISODateString }; // type: an AuditAction, or newer
  actionsInPeriod?: number; loginsInPeriod?: number; daysActiveInPeriod?: number;
  hasMobileApp?: boolean;                       // has a registered device token (18 §2 metric 2)
}
/** ANL-3 query (18 §4c). */
export interface AnalyticsUserActivityQuery { range?: AnalyticsRange; page?: number; limit?: number; }
/**
 * ANL-3 `GET /analytics/users/:id` (18 §4c). The spec gives NO shape: "the audit log filtered to that user. If reusing the
 * audit log's existing response shape is easier, do that and tell us." The app reads AUD-1's shape, the only one
 * documented; anything else is drift, and the timeline is left out.
 */
export type AnalyticsUserActivityPage = Paginated<AuditLogEntry>;
/** ANL-4 `GET /analytics/installs` (18 §6d): Google Play figures, from a daily job. Days are `YYYY-MM-DD`. */
export interface AnalyticsInstalls {
  range?: AnalyticsRange; from?: string; to?: string;
  dataThrough?: string;                         // the last day Google's figures cover; shown as "as at <day>"
  totals?: {
    installs?: number; uninstalls?: number; netGrowth?: number; growthRatePercent?: number;
    currentInstalls?: number; activeDevices?: number; audienceSize?: number;
  };
  crashRatePercent?: number;
  byCountry?: { country?: string; installs?: number; uninstalls?: number; currentInstalls?: number }[];
  daily?: { date?: string; installs?: number; uninstalls?: number; activeDevices?: number }[];
}
