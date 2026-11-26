// Analytics (01 §10.7, ANL-1..4). Contract: docs/ANALYTICS-BACKEND.md ("18", 2026-11-19). ADMIN only.
// NOT YET DEPLOYED (2026-11-26): the app is built against the documented shapes, and their absence is a normal state.
//
// NOT DEPLOYED. A GET to a route the server does not have answers HTML (01 §0.5): Express's `404 Cannot GET`, or the web
// app's index.html with 200 in production mode (isNoSuchGetRoute, as for push and saved views). Each call below turns
// that into `{ deployed: false }`, never an error, so the screens say "not available yet" and nothing retries (the query
// client never retries a non-JSON answer anyway). A JSON error (401, 403, 404, 500) or a plain-text 429 is the route's
// own answer: it is thrown, and the screen shows it as the audit log does.
//
// TOLERANT READING. The envelope must be a JSON object (assertObject, always on, as everywhere in the app). Inside it,
// every field is optional (18 §4a: "the app renders what arrives and skips what doesn't"): a field is kept only if it has
// the documented type, and anything else is left out and logged ONCE as `[API drift]` (__DEV__ only; type names and
// enum values only, never a value, R6). One bad field never rejects the response.
//
// PARAMS: an allow-list. `range` is one of the four (default last30); `sortBy` one of three; `page` and `limit` positive
// integers, `limit` at most 100 (18 §4b); `countryId` only as a non-empty string (the app does not send it yet). Nothing
// else is ever sent: in particular there is NO search parameter in the spec, so none is sent.
import type {
  AnalyticsActionCount, AnalyticsDeviceCountry, AnalyticsInstalls, AnalyticsOverview, AnalyticsQuery, AnalyticsRange,
  AnalyticsUserActivityQuery, AnalyticsUserRow, AnalyticsUsersQuery, AuditLogEntry,
} from '@/types';
import { ANALYTICS_RANGES, ANALYTICS_USER_SORTS, DEFAULT_ANALYTICS_RANGE } from '@/utils/analytics';
import { apiClient } from './client';
import { assertObject, reportDrift } from './drift';
import { isNoSuchGetRoute } from './errors';
import { seg, toPositiveInt } from './helpers';
import type { LoosePage } from './pagination';

// ── Constants ────────────────────────────────────────────────
// The four ranges and the three sorts are in utils/analytics.ts (a leaf module, so ui.store can read the default
// range without importing the API client).

/** Rows per page on screens two and three: half the spec's cap of 100, as the audit log. */
export const ANALYTICS_PAGE_SIZE = 50;
/** 18 §4b: `limit` (cap 100). */
export const ANALYTICS_MAX_LIMIT = 100;

export const ANALYTICS_PATHS = {
  overview: '/analytics/overview',
  installs: '/analytics/installs',
  users: '/analytics/users',
  user: (userId: string) => `/analytics/users/${seg(userId)}`,
} as const;

/** What every ANL call resolves to: the read body, or "this server has no such route yet". */
export type Deployable<T> = { deployed: true; data: T } | { deployed: false };
export const NOT_DEPLOYED: { readonly deployed: false } = Object.freeze({ deployed: false as const });

// ── Requests ─────────────────────────────────────────────────

function rangeParam(range: unknown): AnalyticsRange {
  return (ANALYTICS_RANGES as readonly unknown[]).includes(range) ? (range as AnalyticsRange) : DEFAULT_ANALYTICS_RANGE;
}

function countryParam(countryId: unknown): { countryId?: string } {
  return typeof countryId === 'string' && countryId.trim() ? { countryId } : {};
}

function pageParams(page: number | undefined, limit: number | undefined): { page: number; limit: number } {
  return {
    page: toPositiveInt(page, 1),
    limit: Math.min(toPositiveInt(limit, ANALYTICS_PAGE_SIZE), ANALYTICS_MAX_LIMIT),
  };
}

async function getIfDeployed(endpoint: string, path: string, params: Record<string, unknown>): Promise<Deployable<unknown>> {
  try {
    const res = await apiClient.get<unknown>(path, { params });
    return { deployed: true, data: res.data };
  } catch (error) {
    if (!isNoSuchGetRoute(error)) throw error;
    reportDrift(endpoint, 'no such route on this server (an HTML answer): not deployed yet');
    return NOT_DEPLOYED;
  }
}

/** ANL-1 — GET /api/v1/analytics/overview?range= (18 §4a). */
export async function getAnalyticsOverview(query: AnalyticsQuery = {}): Promise<Deployable<AnalyticsOverview>> {
  const res = await getIfDeployed('ANL-1', ANALYTICS_PATHS.overview, { range: rangeParam(query.range), ...countryParam(query.countryId) });
  return res.deployed ? { deployed: true, data: readOverview(res.data) } : NOT_DEPLOYED;
}

/** ANL-4 — GET /api/v1/analytics/installs?range= (18 §6d). Google Play's figures, a day or two behind. */
export async function getAnalyticsInstalls(query: AnalyticsQuery = {}): Promise<Deployable<AnalyticsInstalls>> {
  const res = await getIfDeployed('ANL-4', ANALYTICS_PATHS.installs, { range: rangeParam(query.range), ...countryParam(query.countryId) });
  return res.deployed ? { deployed: true, data: readInstalls(res.data) } : NOT_DEPLOYED;
}

/** ANL-2 — GET /api/v1/analytics/users?range=&page=&limit=&sortBy= (18 §4b). Sorted by the SERVER. */
export async function listAnalyticsUsers(query: AnalyticsUsersQuery = {}): Promise<Deployable<LoosePage<AnalyticsUserRow>>> {
  const paging = pageParams(query.page, query.limit);
  const sortBy = (ANALYTICS_USER_SORTS as readonly unknown[]).includes(query.sortBy) ? { sortBy: query.sortBy } : {};
  const res = await getIfDeployed('ANL-2', ANALYTICS_PATHS.users, {
    range: rangeParam(query.range), ...paging, ...sortBy, ...countryParam(query.countryId),
  });
  return res.deployed ? { deployed: true, data: readUsersPage(res.data, paging) } : NOT_DEPLOYED;
}

/** ANL-3 — GET /api/v1/analytics/users/:id?range=&page=&limit= (18 §4c), read as AUD-1's page. */
export async function listAnalyticsUserActivity(
  userId: string,
  query: AnalyticsUserActivityQuery = {},
): Promise<Deployable<LoosePage<AuditLogEntry>>> {
  const paging = pageParams(query.page, query.limit);
  const res = await getIfDeployed('ANL-3', ANALYTICS_PATHS.user(userId), { range: rangeParam(query.range), ...paging });
  return res.deployed ? { deployed: true, data: readActivityPage(res.data, paging) } : NOT_DEPLOYED;
}

// ── Tolerant readers ─────────────────────────────────────────

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'non-finite number';
  return typeof value;
}

/** Logged once per endpoint and path: the documented type, and the kind that came (never the value). */
function drift(endpoint: string, path: string, expected: string, value: unknown): void {
  reportDrift(endpoint, `${path}: expected ${expected}, got ${kindOf(value)}`);
}

function num(endpoint: string, src: Rec, key: string, path: string): number | undefined {
  const value = src[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  drift(endpoint, path, 'number', value);
  return undefined;
}

function str(endpoint: string, src: Rec, key: string, path: string): string | undefined {
  const value = src[key];
  if (typeof value === 'string' && value.trim() !== '') return value;
  drift(endpoint, path, 'string', value);
  return undefined;
}

const DAY_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(?:$|T)/;

/** A day (`YYYY-MM-DD`) or an ISO instant that parses; anything else is left out. */
function dateStr(endpoint: string, src: Rec, key: string, path: string): string | undefined {
  const value = src[key];
  if (typeof value === 'string' && DAY_OR_INSTANT.test(value) && !Number.isNaN(new Date(value).getTime())) return value;
  drift(endpoint, path, 'date string', value);
  return undefined;
}

function sub(endpoint: string, src: Rec, key: string, path: string): Rec | undefined {
  const value = src[key];
  if (isRec(value)) return value;
  drift(endpoint, path, 'object', value);
  return undefined;
}

/** The items of an array that are objects; the rest are dropped (and logged). Undefined when it is not an array. */
function items(endpoint: string, src: Rec, key: string, path: string): Rec[] | undefined {
  const value = src[key];
  if (!Array.isArray(value)) {
    drift(endpoint, path, 'array', value);
    return undefined;
  }
  return value.filter((item): item is Rec => {
    if (isRec(item)) return true;
    drift(endpoint, `${path}[]`, 'object', item);
    return false;
  });
}

/** Copies each named key that holds a finite number. */
function nums<K extends string>(endpoint: string, src: Rec, keys: readonly K[], prefix: string): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const value = num(endpoint, src, key, `${prefix}${key}`);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function rangeOf(endpoint: string, src: Rec): AnalyticsRange | undefined {
  const value = src.range;
  if ((ANALYTICS_RANGES as readonly unknown[]).includes(value)) return value as AnalyticsRange;
  if (typeof value === 'string') reportDrift(endpoint, `range: unknown enum value "${value}" (expected one of ${ANALYTICS_RANGES.join(', ')})`);
  else drift(endpoint, 'range', 'string', value);
  return undefined;
}

/** Assigns `value` to `out[key]` only when it is defined, so a missing field stays ABSENT (never `undefined`, never 0). */
function put<T extends object, K extends keyof T>(out: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) out[key] = value;
}

/** ANL-1, read tolerantly. Never throws once the envelope is an object. */
export function readOverview(body: unknown): AnalyticsOverview {
  const ep = 'ANL-1';
  assertObject<Rec>(ep, body);
  const out: AnalyticsOverview = {};
  put(out, 'range', rangeOf(ep, body));
  put(out, 'from', dateStr(ep, body, 'from', 'from'));
  put(out, 'to', dateStr(ep, body, 'to', 'to'));

  const users = sub(ep, body, 'users', 'users');
  if (users) out.users = nums(ep, users, ['activeToday', 'activeThisMonth', 'totalWithAccess', 'newThisPeriod'] as const, 'users.');

  const devices = sub(ep, body, 'devices', 'devices');
  if (devices) {
    const read: NonNullable<AnalyticsOverview['devices']> = nums(ep, devices, ['registered', 'activeThisMonth'] as const, 'devices.');
    const list = items(ep, devices, 'byCountry', 'devices.byCountry');
    if (list) {
      read.byCountry = list.map((item) => {
        const row: AnalyticsDeviceCountry = {};
        put(row, 'countryId', str(ep, item, 'countryId', 'devices.byCountry[].countryId'));
        put(row, 'country', str(ep, item, 'country', 'devices.byCountry[].country'));
        put(row, 'devices', num(ep, item, 'devices', 'devices.byCountry[].devices'));
        return row;
      });
    }
    out.devices = read;
  }

  const logins = sub(ep, body, 'logins', 'logins');
  if (logins) out.logins = nums(ep, logins, ['mobile', 'web'] as const, 'logins.');

  const actions = sub(ep, body, 'actions', 'actions');
  if (actions) {
    const read: NonNullable<AnalyticsOverview['actions']> = {};
    put(read, 'total', num(ep, actions, 'total', 'actions.total'));
    const list = items(ep, actions, 'byType', 'actions.byType');
    if (list) {
      read.byType = list.map((item) => {
        const row: AnalyticsActionCount = {};
        put(row, 'action', str(ep, item, 'action', 'actions.byType[].action'));
        put(row, 'count', num(ep, item, 'count', 'actions.byType[].count'));
        return row;
      });
    }
    out.actions = read;
  }
  return out;
}

/** ANL-4, read tolerantly. Never throws once the envelope is an object. */
export function readInstalls(body: unknown): AnalyticsInstalls {
  const ep = 'ANL-4';
  assertObject<Rec>(ep, body);
  const out: AnalyticsInstalls = {};
  put(out, 'range', rangeOf(ep, body));
  put(out, 'from', dateStr(ep, body, 'from', 'from'));
  put(out, 'to', dateStr(ep, body, 'to', 'to'));
  put(out, 'dataThrough', dateStr(ep, body, 'dataThrough', 'dataThrough'));

  const totals = sub(ep, body, 'totals', 'totals');
  if (totals) {
    out.totals = nums(ep, totals, [
      'installs', 'uninstalls', 'netGrowth', 'growthRatePercent', 'currentInstalls', 'activeDevices', 'audienceSize',
    ] as const, 'totals.');
  }
  put(out, 'crashRatePercent', num(ep, body, 'crashRatePercent', 'crashRatePercent'));

  const byCountry = items(ep, body, 'byCountry', 'byCountry');
  if (byCountry) {
    out.byCountry = byCountry.map((item) => {
      const row: NonNullable<AnalyticsInstalls['byCountry']>[number] = nums(ep, item, ['installs', 'uninstalls', 'currentInstalls'] as const, 'byCountry[].');
      put(row, 'country', str(ep, item, 'country', 'byCountry[].country'));
      return row;
    });
  }
  const daily = items(ep, body, 'daily', 'daily');
  if (daily) {
    out.daily = daily.map((item) => {
      const row: NonNullable<AnalyticsInstalls['daily']>[number] = nums(ep, item, ['installs', 'uninstalls', 'activeDevices'] as const, 'daily[].');
      put(row, 'date', dateStr(ep, item, 'date', 'daily[].date'));
      return row;
    });
  }
  return out;
}

/** The page counters: what the server sent where it is a usable number, else what the app asked for. */
function pageOf(endpoint: string, body: Rec, asked: { page: number; limit: number }): Omit<LoosePage<never>, 'rows' | 'listed'> {
  const page = num(endpoint, body, 'page', 'page');
  const limit = num(endpoint, body, 'limit', 'limit');
  const total = num(endpoint, body, 'total', 'total');
  return {
    page: page !== undefined && page >= 1 ? Math.trunc(page) : asked.page,
    limit: limit !== undefined && limit >= 1 ? Math.trunc(limit) : asked.limit,
    total: total !== undefined && total >= 0 ? total : null,
  };
}

/** One ANL-2 row: every field optional; `lastAction` kept when it has at least its type. */
export function readUserRow(item: Rec): AnalyticsUserRow {
  const ep = 'ANL-2';
  const row: AnalyticsUserRow = {};
  put(row, 'userId', str(ep, item, 'userId', 'rows[].userId'));
  put(row, 'name', str(ep, item, 'name', 'rows[].name'));
  put(row, 'email', str(ep, item, 'email', 'rows[].email'));
  put(row, 'role', str(ep, item, 'role', 'rows[].role'));
  put(row, 'country', str(ep, item, 'country', 'rows[].country'));
  put(row, 'lastSeenAt', dateStr(ep, item, 'lastSeenAt', 'rows[].lastSeenAt'));
  const last = item.lastAction;
  if (isRec(last)) {
    const action: NonNullable<AnalyticsUserRow['lastAction']> = {};
    put(action, 'type', str(ep, last, 'type', 'rows[].lastAction.type'));
    put(action, 'ticketNumber', num(ep, last, 'ticketNumber', 'rows[].lastAction.ticketNumber'));
    put(action, 'at', dateStr(ep, last, 'at', 'rows[].lastAction.at'));
    if (action.type !== undefined) row.lastAction = action;
  } else if (last !== null) {
    // null is a person with no action at all, which is an answer; anything else is drift.
    drift(ep, 'rows[].lastAction', 'object', last);
  }
  put(row, 'actionsInPeriod', num(ep, item, 'actionsInPeriod', 'rows[].actionsInPeriod'));
  put(row, 'loginsInPeriod', num(ep, item, 'loginsInPeriod', 'rows[].loginsInPeriod'));
  put(row, 'daysActiveInPeriod', num(ep, item, 'daysActiveInPeriod', 'rows[].daysActiveInPeriod'));
  if (typeof item.hasMobileApp === 'boolean') row.hasMobileApp = item.hasMobileApp;
  else drift(ep, 'rows[].hasMobileApp', 'boolean', item.hasMobileApp);
  return row;
}

/** ANL-2's page `{ page, limit, total, rows }`. No `rows` array: `listed` is false and the list is not shown. */
export function readUsersPage(body: unknown, asked: { page: number; limit: number }): LoosePage<AnalyticsUserRow> {
  const ep = 'ANL-2';
  assertObject<Rec>(ep, body);
  const list = items(ep, body, 'rows', 'rows');
  return { ...pageOf(ep, body, asked), rows: (list ?? []).map(readUserRow), listed: list !== undefined };
}

/**
 * One ANL-3 entry, as AUD-1's row (03 §C), made safe for the audit log's renderer: an entry needs a string `id` (its key)
 * and a string `action`; every other field falls back to "not there" (empty entity, no actor, no ticket). Null when it
 * cannot be shown.
 */
export function readActivityEntry(item: Rec): AuditLogEntry | null {
  const ep = 'ANL-3';
  const id = str(ep, item, 'id', 'data[].id');
  const action = str(ep, item, 'action', 'data[].action');
  if (id === undefined || action === undefined) return null;
  const actor = isRec(item.actor) && typeof item.actor.displayName === 'string'
    ? {
      id: typeof item.actor.id === 'string' ? item.actor.id : '',
      displayName: item.actor.displayName,
      email: typeof item.actor.email === 'string' ? item.actor.email : '',
    }
    : null;
  const ticket = isRec(item.ticket) && typeof item.ticket.ticketNumber === 'number'
    ? {
      id: typeof item.ticket.id === 'string' ? item.ticket.id : '',
      ticketNumber: item.ticket.ticketNumber,
      title: typeof item.ticket.title === 'string' ? item.ticket.title : '',
    }
    : null;
  if (item.ticket !== null && item.ticket !== undefined && ticket === null) drift(ep, 'data[].ticket', 'object with ticketNumber', item.ticket);
  return {
    id,
    action: action as AuditLogEntry['action'],
    entityType: typeof item.entityType === 'string' ? item.entityType : '',
    entityId: typeof item.entityId === 'string' ? item.entityId : '',
    ticketId: typeof item.ticketId === 'string' ? item.ticketId : null,
    actorId: typeof item.actorId === 'string' ? item.actorId : null,
    oldValues: item.oldValues ?? null,
    newValues: item.newValues ?? null,
    ipAddress: null, // never displayed (AUD-1), so never kept
    createdAt: dateStr(ep, item, 'createdAt', 'data[].createdAt') ?? '',
    actor,
    ticket,
  };
}

/** ANL-3's page, read as AUD-1's `{ data, total, page, limit, … }`. No `data` array: `listed` is false. */
export function readActivityPage(body: unknown, asked: { page: number; limit: number }): LoosePage<AuditLogEntry> {
  const ep = 'ANL-3';
  assertObject<Rec>(ep, body);
  const list = items(ep, body, 'data', 'data');
  const rows = (list ?? []).flatMap((item) => {
    const entry = readActivityEntry(item);
    return entry ? [entry] : [];
  });
  return { ...pageOf(ep, body, asked), rows, listed: list !== undefined };
}
