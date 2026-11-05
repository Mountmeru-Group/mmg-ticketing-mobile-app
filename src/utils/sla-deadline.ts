// The SLA deadline on ticket detail (2026-11-03, Ronit's option C; docs/brand/UI-STANDARDS.md §14.6) and, since
// 2026-11-05, on ticket cards (slaDueLine, §16): ONE rule, two wordings. Pure functions, no new SLA rule:
// - The deadline is effectiveResolveDue(), the web's own hold-adjusted resolve deadline (05 §A.9), the same value as
//   the Properties card's "Resolve by" row. It is shown as a time ("Due Mon 11:00"), never as a countdown.
// - Why not a countdown: slaResolveDue is a business-hours deadline (03 §B SLAPolicy), and the API does not say how
//   much business time is left. A wall-clock countdown read "66h left" on a Friday evening with 3 working hours to go.
//   A real countdown needs the server's number: backend ask A31 (docs/web-system/06-BACKEND-ASKS.md).
// - Green, amber or red comes from getDisplaySlaStatus() (05 §A.9), the same answer as the SLA badge above it, except
//   that a first-response breach alone does not turn the resolution deadline red (the badge already says it).
//   Amber is the server's own DUE_SOON (≤ 30 min left, jobs/slaBreachChecker.job.ts:62-65); the app sets no threshold.
import type { SLAStatus } from '@/types';
import { HOLD_STATUSES } from '@/types';
import { effectiveResolveDue, formatShortDate, getDisplaySlaStatus, type SlaFields } from './format';

/** Statuses where the resolution clock has stopped for good: no deadline to show. */
const STOPPED: ReadonlySet<string> = new Set(['RESOLVED', 'CLOSED', 'CANCELED']);

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface SlaDeadline {
  tone: SLAStatus;
  /** "Due Mon 11:00", "Due today 16:30", "Due 12 Nov 11:00", "Paused while on hold", "Breached". */
  label: string;
  /** The status is a hold status: the SLA clock is paused, and the deadline moves later for as long as it lasts. */
  paused: boolean;
  /** effectiveResolveDue(): the deadline itself, or, once breached, the moment it was missed. */
  due: Date;
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const clockOf = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** Calendar days from today to `due` on the phone's calendar: 0 today, 1 tomorrow. */
function daysUntil(due: Date, now: number): number {
  // Rounded: a day that has 23 or 25 hours (a clock change) still counts as one day.
  return Math.round((startOfDay(due) - startOfDay(new Date(now))) / 86_400_000);
}

/**
 * When a future deadline falls, on the phone's clock and calendar: "today 11:00", "tomorrow 11:00", "Mon 11:00" for the
 * rest of the coming week, then "12 Nov 11:00" ("12 Nov 2027 11:00" in another year). A weekday is never more than 6
 * days away, so "Mon" is never next week's Monday.
 */
export function formatDueTime(due: Date, now: number = Date.now()): string {
  const clock = clockOf(due);
  const today = new Date(now);
  const days = daysUntil(due, now);
  if (days <= 0) return `today ${clock}`;
  if (days === 1) return `tomorrow ${clock}`;
  if (days <= 6) return `${DAYS[due.getDay()]} ${clock}`;
  const year = due.getFullYear() === today.getFullYear() ? '' : ` ${due.getFullYear()}`;
  return `${pad2(due.getDate())} ${MONTHS[due.getMonth()]}${year} ${clock}`;
}

/**
 * The deadline for a ticket, or null when there is none to show: no SLA (no resolve deadline), or the ticket is
 * Resolved, Closed or Canceled (the clock has stopped; the badge shows the outcome).
 * On hold, the hold-adjusted deadline moves later minute by minute, so no time is given: "Paused while on hold".
 */
export function slaDeadline(ticket: SlaFields, now: number = Date.now()): SlaDeadline | null {
  if (STOPPED.has(ticket.status)) return null;
  const due = effectiveResolveDue(ticket, now);
  if (!due) return null;
  const paused = HOLD_STATUSES.includes(ticket.status);
  if (due.getTime() <= now) return { tone: 'BREACHED', label: 'Breached', paused, due };
  // Not breached on resolution here, so the only BREACHED left is a first-response breach: a different clock.
  const tone: SLAStatus = getDisplaySlaStatus(ticket, now).status === 'DUE_SOON' ? 'DUE_SOON' : 'WITHIN_SLA';
  return { tone, label: paused ? 'Paused while on hold' : `Due ${formatDueTime(due, now)}`, paused, due };
}

/**
 * The due line on a ticket card (2026-11-05, UI-STANDARDS.md §16): slaDeadline() above, same deadline, same colour,
 * same cases with nothing to show, worded with the date every time, because a list mixes many days:
 *   "Due today 5 Nov, 16:30", "Due tomorrow 6 Nov, 09:00", "Due Fri 7 Nov, 17:00", "Due Mon 17 Nov, 10:00";
 *   "Breached 3 Nov, 12:00": when it was missed, not only that it was.
 * On hold it gives no time, as detail does: "Paused while on hold", or "Breached". Never a countdown.
 */
export function slaDueLine(ticket: SlaFields, now: number = Date.now()): SlaDeadline | null {
  const deadline = slaDeadline(ticket, now);
  if (!deadline || deadline.paused) return deadline;
  const { due } = deadline;
  const at = `${formatShortDate(due, now)}, ${clockOf(due)}`;
  if (deadline.tone === 'BREACHED') return { ...deadline, label: `Breached ${at}` };
  const days = daysUntil(due, now);
  const day = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : DAYS[due.getDay()];
  return { ...deadline, label: `Due ${day} ${at}` };
}
