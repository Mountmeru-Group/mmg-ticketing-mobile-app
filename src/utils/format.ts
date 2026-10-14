// Display helpers: dates (05 §A.10), SLA display (05 §A.9), labels (05 §A.3, §A.10). Pure functions.
// Dates render in the DEVICE timezone, like the web (01 §0.1). The web uses date-fns; it is not installed,
// so the formats below are reproduced by hand.
import type {
  ISODateString, SLAStatus, Ticket, TicketImpact, TicketPriority, TicketStatus, TicketUrgency,
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
  return display.status === 'DUE_SOON' ? 'Due Soon' : 'Within SLA';
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

/** Two-letter initials for the drawer avatar. */
export function initials(name: string | null | undefined): string {
  const clean = formatDisplayName(name).trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
