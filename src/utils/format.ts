// Display helpers: dates (05 §A.10), SLA display (05 §A.9), labels (05 §A.3, §A.10). Pure functions.
// Dates render in the DEVICE timezone, like the web (01 §0.1). The web uses date-fns; it is not installed,
// so the formats below are reproduced by hand.
import type {
  ISODateString, SLAStatus, TaskStatus, Ticket, TicketCategoryRef, TicketImpact, TicketPriority, TicketStatus,
  TicketUrgency,
} from '@/types';
import { HOLD_STATUSES } from '@/types';

// ── Dates ────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDate(value: ISODateString | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `dd MMM yyyy`, e.g. "09 Oct 2026". */
export function formatDate(value: ISODateString | Date | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `dd MMM yyyy, HH:mm`, e.g. "09 Oct 2026, 14:05". */
export function formatDateTime(value: ISODateString | Date | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** Relative time, past or future: "5 minutes ago", "in about 2 hours". Approximates date-fns wording. */
export function formatRelative(value: ISODateString | Date | null | undefined, now: number = Date.now()): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  const diffMs = d.getTime() - now;
  const future = diffMs > 0;
  const seconds = Math.abs(diffMs) / 1000;
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(seconds / 3600);
  const days = Math.round(seconds / 86_400);
  const months = Math.round(seconds / (86_400 * 30));
  const years = Math.round(seconds / (86_400 * 365));

  let text: string;
  if (seconds < 45) text = 'less than a minute';
  else if (minutes < 45) text = plural(minutes, 'minute');
  else if (hours < 24) text = `about ${plural(hours, 'hour')}`;
  else if (days < 30) text = plural(days, 'day');
  else if (months < 12) text = plural(months, 'month');
  else text = `about ${plural(years, 'year')}`;

  return future ? `in ${text}` : `${text} ago`;
}

/**
 * formatRelative's steps, in one-line units, past only: "just now", "5m ago", "3h ago", "2d ago", "4mo ago", "1y ago".
 * For one-line meta such as a ticket card's "updated 2d ago". A time ahead of the phone's clock reads "just now".
 */
export function formatRelativeShort(value: ISODateString | Date | null | undefined, now: number = Date.now()): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  const seconds = Math.max(0, now - d.getTime()) / 1000;
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(seconds / 3600);
  const days = Math.round(seconds / 86_400);
  const months = Math.round(seconds / (86_400 * 30));
  if (seconds < 45) return 'just now';
  if (minutes < 45) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(seconds / (86_400 * 365))}y ago`;
}

/** "2 Nov" on the phone's calendar; "2 Nov 2025" outside the current year. No leading zero. */
export function formatShortDate(value: ISODateString | Date | null | undefined, now: number = Date.now()): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

// ── SLA (05 §A.9, decision D6: one function for list AND detail) ──

export type SlaFields = Pick<
  Ticket,
  'status' | 'slaStatus' | 'slaResponseDue' | 'slaResolveDue' | 'firstResponseAt' | 'resolvedAt' | 'slaHoldMinutes' | 'slaHoldStartedAt'
>;

export type SlaBreachType = 'first_response' | 'resolution' | 'both';

export interface DisplaySlaStatus {
  status: SLAStatus;
  breachType: SlaBreachType | null;
}

/**
 * Hold-adjusted resolve deadline, verbatim from FE:pages/tickets/TicketsListPage.tsx:30-57.
 * ⚠ B.27: the server already extends slaResolveDue on hold exit AND keeps slaHoldMinutes, so this can
 * over-extend while a ticket is back on hold. Copied as-is for parity; raised with the backend.
 */
export function effectiveResolveDue(t: SlaFields, now: number = Date.now()): Date | null {
  if (!t.slaResolveDue) return null;
  const due = new Date(t.slaResolveDue);
  if (!HOLD_STATUSES.includes(t.status)) return due;
  const pastHoldMs = (t.slaHoldMinutes ?? 0) * 60000;
  const ongoingHoldMs = t.slaHoldStartedAt ? now - new Date(t.slaHoldStartedAt).getTime() : 0;
  return new Date(due.getTime() + pastHoldMs + ongoingHoldMs);
}

/** Verbatim `getDisplaySlaStatus` (05 §A.9). */
export function getDisplaySlaStatus(t: SlaFields, now: number = Date.now()): DisplaySlaStatus {
  const nowDate = new Date(now);
  const responseMissed = !!t.slaResponseDue && !t.firstResponseAt && new Date(t.slaResponseDue) < nowDate;
  const effDue = effectiveResolveDue(t, now);
  const resolutionMissed = effDue ? (t.resolvedAt ? new Date(t.resolvedAt) > effDue : effDue < nowDate) : false;
  if (resolutionMissed && responseMissed) return { status: 'BREACHED', breachType: 'both' };
  if (resolutionMissed) return { status: 'BREACHED', breachType: 'resolution' };
  if (responseMissed) return { status: 'BREACHED', breachType: 'first_response' };
  return { status: t.slaStatus === 'BREACHED' ? 'WITHIN_SLA' : t.slaStatus, breachType: null };
}

/** Badge text (05 §A.9 breach labels, §A.10 SLA labels). */
export function slaLabel(display: DisplaySlaStatus): string {
  if (display.status === 'BREACHED') {
    switch (display.breachType) {
      case 'first_response':
        return 'First Response SLA Breached';
      case 'resolution':
        return 'Resolution SLA Breached';
      case 'both':
        return 'First Response & Resolution SLA Breached';
      default:
        return 'Breached';
    }
  }
  if (display.status === 'DUE_SOON') return 'Due Soon';
  if (display.status === 'WITHIN_SLA') return 'Within SLA';
  return String(display.status); // a value outside 03 §A (logged as drift): show it raw, never "Within SLA"
}

// ── Labels (05 §A.3, §A.10) ──────────────────────────────────

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  ON_HOLD: 'On Hold',
  PENDING_MGMT_REVIEW: 'Pending with Management Review',
  PENDING_MASTER_DATA: 'Pending with Master Data Team',
  PENDING_PARTNER: 'Pending with Partner',
  PENDING_USER_CONFIRM: 'Pending with User for Confirmation',
  PENDING_USER_INFO: 'Pending with User for Info',
  RESOLVED: 'Resolved',
  CANCELED: 'Canceled',
  CLOSED: 'Closed',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const IMPACT_LABELS: Record<TicketImpact, string> = {
  MINIMAL: 'Affects User',
  LOW: 'Affects Group',
  MEDIUM: 'Affects Department',
  HIGH: 'Affects Business',
};

export const URGENCY_LABELS: Record<TicketUrgency, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

/** Unknown values fall back to the raw value (05 §A.10). */
export function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Header source chip (05 §A.10): `source === 'EMAIL' ? 'Email Request' : 'Incident Request'`. */
export function sourceLabel(source: string): string {
  return source === 'EMAIL' ? 'Email Request' : 'Incident Request';
}

/** "512 B", "14.2 KB", "3.1 MB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Category / Subcategory / Item names from the ticket's category chain, derived from `level` as the web does
 * (05 §A.3, FE:TicketDetailPage.tsx:1934-2008). Missing levels are null.
 */
export function categoryCascade(category: TicketCategoryRef | null | undefined): {
  category: string | null;
  subcategory: string | null;
  item: string | null;
} {
  if (!category) return { category: null, subcategory: null, item: null };
  switch (category.level) {
    case 'ITEM':
      return { category: category.parent?.parent?.name ?? null, subcategory: category.parent?.name ?? null, item: category.name };
    case 'SUBCATEGORY':
      return { category: category.parent?.name ?? null, subcategory: category.name, item: null };
    default:
      return { category: category.name, subcategory: null, item: null };
  }
}

/**
 * Name formatting (FE:TicketsListPage.tsx:21-26): if a display name contains `@`, take the part before it,
 * turn `[._-]+` into spaces and title-case it.
 */
export function formatDisplayName(name: string | null | undefined): string {
  if (!name) return '';
  if (!name.includes('@')) return name;
  return name
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * First name and last initial, for the technician on a ticket card (2026-11-03): "Sarthak Darekar" → "Sarthak D.",
 * "Ana Maria Lopez" → "Ana L.". One word stays as it is. Formatted as formatDisplayName() first, so an e-mail-style name
 * gives the same words the drawer shows.
 */
export function shortName(name: string | null | undefined): string {
  const parts = formatDisplayName(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] as string;
  const last = parts[parts.length - 1] as string;
  return `${parts[0]} ${last[0]?.toUpperCase() ?? ''}.`;
}

/**
 * What a ticket card's people row says, for the card's screen-reader label (the row itself is hidden from TalkBack;
 * on iOS, from VoiceOver): "Requested by Rohit Jadhav, technician Sarthak Darekar"; END_USER's row has the technician
 * only ("Unassigned").
 */
export function peopleRowLabel(
  requesterName: string | null | undefined,
  technicianName: string | null | undefined,
  showRequester: boolean,
): string {
  const technician = formatDisplayName(technicianName);
  if (!showRequester) return technician ? `Technician ${technician}` : 'Unassigned';
  return `Requested by ${formatDisplayName(requesterName) || 'unknown requester'}, ${technician ? `technician ${technician}` : 'unassigned'}`;
}

/** Two-letter initials for the drawer avatar. */
export function initials(name: string | null | undefined): string {
  const clean = formatDisplayName(name).trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
