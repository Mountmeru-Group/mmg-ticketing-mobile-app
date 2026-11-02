// M20 Audit log (G8): the AUD-1 query, the action pills' labels, the day groups and the Details formatter. Pure.
// Every web and server statement, with its source line: docs/G8-WEB-AUDIT.md.
//
// DETAILS. `oldValues` / `newValues` are stored as JSON objects (schema.prisma:565-566) and AUD-1 returns them as they
// are: no names are resolved, unlike TKT-7 (tickets.controller.ts:1037-1080). formatAuditDetails() turns the shapes the
// server writes (G8 §8, one per write site) into lines, and falls back to the raw value for anything else:
//   STATUS_CHANGED  {status} → {status}                      "Status: In Progress → Resolved"
//                   + {closedAt, _source:'auto-close-48h'}   "Closed automatically after being resolved"
//   ASSIGNED        {assignedToId[, _autoAssigned]}          "Assigned automatically to user 3f2a9c1e"
//   COMMENTED       {type: PUBLIC | PRIVATE}                  "Public reply" / "Private note"
//   ATTACHMENT_ADDED {count, files[]}                         "2 files: a.pdf, b.png"
//   UPDATED         {title?, priority?, urgency?, impact?, categoryId?} or {updated:true}; AI: {_aiSentiment, _aiEnriched, …}
//   CREATED         {title, priority, status, urgency?, impact?, source, assignedToId, teamId, categoryId, countryId?}
// Any other key becomes "Label: before → after" (objects as JSON). A payload that is not an object (array, string,
// number) is shown raw. It never throws: anything unexpected ends in the raw block.
import type { AuditAction, AuditLogEntry, AuditLogQuery } from '@/types';
import { APP_ORIGIN, parseTicketLink } from './deep-links';
import { IMPACT_LABELS, PRIORITY_LABELS, URGENCY_LABELS, formatDate, formatDisplayName, statusLabel } from './format';

// ── Actions ──────────────────────────────────────────────────

/** The nine AuditAction values, in schema order (schema.prisma:71-81; 03 §A). */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'CREATED', 'UPDATED', 'DELETED', 'STATUS_CHANGED', 'ASSIGNED', 'COMMENTED', 'ATTACHMENT_ADDED', 'SLA_BREACHED', 'ESCALATED',
];

/**
 * Pill labels. Title case, as Ronit read them off the web page ("Commented", "Status Changed", "Assigned", "Created"); the
 * page itself is not in the clone (G8 §1), so the other five follow the same rule.
 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATED: 'Created',
  UPDATED: 'Updated',
  DELETED: 'Deleted',
  STATUS_CHANGED: 'Status Changed',
  ASSIGNED: 'Assigned',
  COMMENTED: 'Commented',
  ATTACHMENT_ADDED: 'Attachment Added',
  SLA_BREACHED: 'SLA Breached',
  ESCALATED: 'Escalated',
};

/** "AUTO_CLOSED" → "Auto Closed": an enum-like string in words. Anything else is returned as it is. */
function enumWords(value: string): string {
  if (!/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(value)) return value;
  return value.split('_').map((w) => (w === 'SLA' ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
}

/** The pill's label; an action the app does not know (a newer server) is shown in words, never dropped. */
export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? enumWords(String(action ?? ''));
}

export function isKnownAuditAction(action: string): action is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(action);
}

// ── Filters → AUD-1 params ───────────────────────────────────

/**
 * The entity types the server writes, as written (G8 §6): `logAudit` call sites use these three. The auto-close job
 * writes lowercase `ticket` (jobs/autoCloseResolved.job.ts:36), which "Ticket" does not match (05 B.38).
 */
export const AUDIT_ENTITY_TYPES = ['Ticket', 'Comment', 'Attachment'] as const;
export type AuditEntityType = typeof AUDIT_ENTITY_TYPES[number];

/** What the screen filters by. Each maps to one exact-match AUD-1 param. */
export interface AuditLogFilters {
  entityType: AuditEntityType | null;
  /** The ticket picked by number. AUD-1 filters by its id; there is no ticket-number param. */
  ticket: { id: string; ticketNumber: number } | null;
  /** The person picked in the USR-3 picker (active users only). */
  person: { id: string; displayName: string } | null;
}

export const NO_AUDIT_FILTERS: AuditLogFilters = { entityType: null, ticket: null, person: null };

export type AuditLogKeyParams = Omit<AuditLogQuery, 'page' | 'limit'>;

/** AUD-1 params for these filters, without page and limit. Only the three the server reads (auditLog.controller.ts:7). */
export function auditLogQuery(filters: AuditLogFilters): AuditLogKeyParams {
  const query: AuditLogKeyParams = {};
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.ticket) query.ticketId = filters.ticket.id;
  if (filters.person) query.actorId = filters.person.id;
  return query;
}

export function activeAuditFilterCount(filters: AuditLogFilters): number {
  return (filters.entityType ? 1 : 0) + (filters.ticket ? 1 : 0) + (filters.person ? 1 : 0);
}

/**
 * The search box takes a ticket number: "1234", "#1234", or a ticket-number link from this environment (the deep-link
 * parser's rule, utils/deep-links.ts). Anything else → null.
 */
export function parseAuditTicketNumber(text: string): number | null {
  const parsed = parseTicketLink(text);
  return parsed.ok && parsed.target.kind === 'number' ? parsed.target.ticketNumber : null;
}

/** The in-app link for an entry's ticket, for the deep-link resolver (TicketLink → M4); null when there is no ticket. */
export function auditTicketLink(ticket: AuditLogEntry['ticket'] | undefined): string | null {
  if (!ticket || typeof ticket !== 'object') return null;
  const candidates: string[] = [];
  if (typeof ticket.id === 'string' && ticket.id) candidates.push(`${APP_ORIGIN}/tickets/${encodeURIComponent(ticket.id)}`);
  if (typeof ticket.ticketNumber === 'number') candidates.push(`#${ticket.ticketNumber}`);
  return candidates.find((link) => parseTicketLink(link).ok) ?? null;
}

// ── Day groups ───────────────────────────────────────────────

export type AuditListRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'entry'; key: string; entry: AuditLogEntry };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The heading above a day's entries, on the phone's calendar: "Today", "Yesterday", else "Mon 02 Nov 2026". */
export function auditDayLabel(d: Date, now: Date = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  return `${WEEKDAYS[d.getDay()]} ${formatDate(d)}`;
}

/** "14:05", the phone's local time. */
export function auditTime(value: unknown): string {
  const d = parseDate(value);
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—';
}

/**
 * The list's rows: a day heading wherever the local day changes, then that day's entries, in the server's order
 * (newest first). An entry with an unreadable date goes under "Date unknown".
 */
export function auditListRows(entries: readonly AuditLogEntry[], now: Date = new Date()): AuditListRow[] {
  const rows: AuditListRow[] = [];
  let current: string | null = null;
  for (const entry of entries) {
    const d = parseDate(entry.createdAt);
    const key = d ? dayKey(d) : 'unknown';
    if (key !== current) {
      current = key;
      rows.push({ kind: 'day', key: `day:${key}:${rows.length}`, label: d ? auditDayLabel(d, now) : 'Date unknown' });
    }
    rows.push({ kind: 'entry', key: `entry:${entry.id}`, entry });
  }
  return rows;
}

// ── Details ──────────────────────────────────────────────────

export interface AuditDetails {
  /** Readable lines, in order, e.g. "Status: In Progress → Resolved". */
  lines: string[];
  /** What could not be read, as JSON text for a monospace block; null when everything was read. */
  raw: string | null;
}

type Rec = Record<string, unknown>;

const MAX_VALUE = 120;
const MAX_RAW = 600;
const MAX_FILES = 5;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function json(value: unknown, max = MAX_VALUE): string {
  try {
    const text = JSON.stringify(value);
    return clip(text === undefined ? String(value) : text, max);
  } catch {
    return clip(String(value), max);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Field names in words. Ids name the thing they point at; AUD-1 sends the id only. */
const KEY_LABELS: Record<string, string> = {
  title: 'Title', status: 'Status', priority: 'Priority', urgency: 'Urgency', impact: 'Impact', source: 'Source',
  assignedToId: 'Technician', teamId: 'Group', categoryId: 'Category', countryId: 'Country', requesterId: 'Requester',
  slaPolicyId: 'SLA policy', closedAt: 'Closed at', type: 'Type',
};

/** A field name in words: `closedAt` → "Closed at", `toTeamId` → "To team", `_someFlag` → "Some flag". */
function keyLabel(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  const words = key
    .replace(/^_+/, '')
    .replace(/(.)Id$/, '$1')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

const ENUM_LABELS: Record<string, Record<string, string>> = {
  priority: PRIORITY_LABELS,
  urgency: URGENCY_LABELS,
  impact: IMPACT_LABELS,
};

/** One value in words, by its field: statuses and priorities by their labels, dates formatted, ids shortened. */
function valueText(key: string, value: unknown, names?: Rec): string {
  if (value === null || value === undefined || value === '') return key.endsWith('Id') ? 'none' : '—';
  if (typeof value === 'string') {
    if (key === 'status') return statusLabel(value);
    const labels = ENUM_LABELS[key];
    if (labels) return labels[value] ?? enumWords(value);
    if (key.endsWith('Id') && UUID_RE.test(value)) {
      const name = names?.[`_${key.slice(0, -2)}Name`];
      return typeof name === 'string' && name ? formatDisplayName(name) : `id ${value.slice(0, 8)}`;
    }
    if (key.endsWith('At')) {
      const d = parseDate(value);
      if (d) return `${formatDate(d)}, ${auditTime(value)}`;
    }
    // Enum fields in words ("WEB_FORM" → "Web Form"); free text as it is.
    return clip(key === 'source' || key === 'type' ? enumWords(value) : value, MAX_VALUE);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) {
    return clip(value.join(', '), MAX_VALUE);
  }
  return json(value);
}

/** Someone an assignment names: TKT-7's `_assignedToName` when present, else the short id AUD-1 gives. */
function personText(id: unknown, name: unknown): string {
  if (typeof name === 'string' && name) return formatDisplayName(name);
  if (id === null || id === undefined || id === '') return 'nobody';
  return typeof id === 'string' ? `user ${id.slice(0, 8)}` : json(id);
}

function quoted(value: unknown): string {
  return typeof value === 'string' ? `“${clip(value, MAX_VALUE)}”` : valueText('title', value);
}

function fileList(files: string[]): string {
  const shown = files.slice(0, MAX_FILES).map((f) => clip(f, 60));
  const rest = files.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
}

/** The fields CREATED stores as ids; AUD-1 has no names for them. */
const CREATED_ID_KEYS = ['assignedToId', 'teamId', 'categoryId', 'countryId'] as const;
const CREATED_ID_WORDS: Record<(typeof CREATED_ID_KEYS)[number], string> = {
  assignedToId: 'technician', teamId: 'group', categoryId: 'category', countryId: 'country',
};

function describe(action: string, before: Rec, after: Rec, lines: string[], used: Set<string>): void {
  const has = (o: Rec, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const use = (...keys: string[]) => keys.forEach((k) => used.add(k));
  const change = (key: string) => {
    if (!has(after, key)) return;
    use(key);
    const label = keyLabel(key);
    const to = key === 'title' ? quoted(after[key]) : valueText(key, after[key], after);
    if (has(before, key) && before[key] !== null && before[key] !== undefined) {
      const from = key === 'title' ? quoted(before[key]) : valueText(key, before[key], before);
      lines.push(from === to ? `${label}: ${to}` : `${label}: ${from} → ${to}`);
    } else {
      lines.push(`${label}: ${to}`);
    }
  };

  switch (action) {
    case 'STATUS_CHANGED': {
      change('status');
      if (after._source === 'auto-close-48h') {
        // AUTO_CLOSE_HOURS can override the 48 h, so the marker's number is not repeated (autoCloseResolved.job.ts:6, :40).
        lines.push('Closed automatically after being resolved');
        use('_source', 'closedAt');
      }
      break;
    }
    case 'ASSIGNED': {
      if (!has(after, 'assignedToId')) break;
      use('assignedToId', '_autoAssigned', '_assignedToName');
      const to = personText(after.assignedToId, after._assignedToName);
      if (after._autoAssigned === true) {
        lines.push(`Assigned automatically to ${to}`);
      } else if (has(before, 'assignedToId') && before.assignedToId) {
        lines.push(`Technician: ${personText(before.assignedToId, before._assignedToName)} → ${to}`);
      } else {
        lines.push(`Assigned to ${to}`);
      }
      break;
    }
    case 'COMMENTED': {
      if (!has(after, 'type')) break;
      use('type');
      lines.push(after.type === 'PUBLIC' ? 'Public reply' : after.type === 'PRIVATE' ? 'Private note' : `Comment type: ${valueText('type', after.type)}`);
      break;
    }
    case 'ATTACHMENT_ADDED': {
      const files = Array.isArray(after.files) ? after.files.filter((f): f is string => typeof f === 'string') : [];
      const count = typeof after.count === 'number' ? after.count : Array.isArray(after.files) ? after.files.length : null;
      if (count === null) break;
      use('count', ...(Array.isArray(after.files) ? ['files'] : []));
      lines.push(`${count} ${count === 1 ? 'file' : 'files'}${files.length ? `: ${fileList(files)}` : ''}`);
      break;
    }
    case 'UPDATED': {
      if (after._aiEnriched === true) {
        lines.push('Set by AI enrichment');
        use('_aiEnriched');
      }
      // "satisfied" | "neutral" | "dissatisfied" (email/graph.service.ts:862).
      if (typeof after._aiSentiment === 'string' && after._aiSentiment.trim()) {
        const s = after._aiSentiment.trim();
        lines.push(`AI sentiment: ${s.charAt(0).toUpperCase()}${s.slice(1).toLowerCase()}`);
        use('_aiSentiment');
      }
      for (const key of ['title', 'priority', 'urgency', 'impact']) change(key);
      if (has(after, 'categoryId')) {
        use('categoryId', '_categoryName');
        lines.push(typeof after._categoryName === 'string' && after._categoryName ? `Category: ${after._categoryName}` : 'Category changed');
      }
      if (after.updated === true) {
        lines.push('Saved with no field changes');
        use('updated');
      }
      break;
    }
    case 'CREATED': {
      change('title');
      for (const key of ['priority', 'status', 'urgency', 'impact', 'source']) {
        if (after[key] === null) use(key);
        else change(key);
      }
      const named: string[] = [];
      const idsOnly: string[] = [];
      for (const key of CREATED_ID_KEYS) {
        if (!has(after, key)) continue;
        const nameKey = `_${key.slice(0, -2)}Name`;
        use(key, nameKey);
        if (after[key] === null || after[key] === undefined || after[key] === '') continue;
        const name = after[nameKey];
        if (typeof name === 'string' && name) named.push(`${keyLabel(key)}: ${formatDisplayName(name)}`);
        else idsOnly.push(CREATED_ID_WORDS[key]);
      }
      lines.push(...named);
      // AUD-1 returns ids, not names (G8 §8): say what was set rather than print four uuids.
      if (idsOnly.length) lines.push(`Also set: ${idsOnly.join(', ')}`);
      break;
    }
    default:
      break;
  }
}

/** Readable details for one entry, never throwing. See the table at the top of this file. */
export function formatAuditDetails(entry: Pick<AuditLogEntry, 'action' | 'oldValues' | 'newValues'>): AuditDetails {
  try {
    const { oldValues, newValues } = entry;
    const rawParts: string[] = [];
    if (oldValues !== null && oldValues !== undefined && !isRecord(oldValues)) rawParts.push(`Before: ${json(oldValues, MAX_RAW)}`);
    if (newValues !== null && newValues !== undefined && !isRecord(newValues)) rawParts.push(`After: ${json(newValues, MAX_RAW)}`);
    const before: Rec = isRecord(oldValues) ? oldValues : {};
    const after: Rec = isRecord(newValues) ? newValues : {};

    const lines: string[] = [];
    const used = new Set<string>();
    describe(String(entry.action ?? ''), before, after, lines, used);

    // Everything no handler read: "Label: before → after", in the order the server wrote it.
    const leftovers = [...new Set([...Object.keys(after), ...Object.keys(before)])].filter((k) => !used.has(k));
    for (const key of leftovers) {
      if (key.startsWith('_') && key.endsWith('Name')) continue; // a TKT-7-style name for an id shown above
      const label = keyLabel(key);
      const inAfter = Object.prototype.hasOwnProperty.call(after, key);
      const inBefore = Object.prototype.hasOwnProperty.call(before, key);
      const to = inAfter ? valueText(key, after[key], after) : null;
      const from = inBefore ? valueText(key, before[key], before) : null;
      if (from !== null && to !== null) lines.push(from === to ? `${label}: ${to}` : `${label}: ${from} → ${to}`);
      else if (to !== null) lines.push(`${label}: ${to}`);
      else if (from !== null) lines.push(`${label} was ${from}`);
    }
    return { lines, raw: rawParts.length ? rawParts.join('\n') : null };
  } catch {
    return { lines: [], raw: json({ oldValues: entry?.oldValues, newValues: entry?.newValues }, MAX_RAW) };
  }
}
