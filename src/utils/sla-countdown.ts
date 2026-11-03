// The SLA countdown on ticket detail (2026-11-03, docs/brand/UI-STANDARDS.md §14). Pure functions, no new SLA rule:
// - The deadline is effectiveResolveDue(), the web's own hold-adjusted resolve deadline (05 §A.9), the same value as
//   the Properties card's "Resolve by" row. "6h left" is that deadline minus now.
// - Green, amber or red comes from getDisplaySlaStatus() (05 §A.9), the same answer as the SLA badge above it, except
//   that a first-response breach alone does not turn the resolution bar red (the badge already says it).
//   Amber is the server's own DUE_SOON (≤ 30 min left, jobs/slaBreachChecker.job.ts:62-65); the app sets no threshold.
// - The bar is the share of wall-clock time from the ticket's creation to that deadline. It is NOT the share of the
//   SLA's business hours used: slaResolveDue is a business-hours deadline (03 §B), and the API does not say how many
//   business minutes the policy allows or have passed. Overnight and at weekends the bar moves on while the SLA clock
//   does not (UI-STANDARDS.md §14 has the decision this leaves).
import type { SLAStatus } from '@/types';
import { HOLD_STATUSES } from '@/types';
import { effectiveResolveDue, getDisplaySlaStatus, type SlaFields } from './format';

/** Statuses where the resolution clock has stopped for good: no countdown. */
const STOPPED: ReadonlySet<string> = new Set(['RESOLVED', 'CLOSED', 'CANCELED']);

export interface SlaCountdown {
  tone: SLAStatus;
  /** "6h left", "25m left", "2d 4h left", "Breached". */
  label: string;
  /** The status is a hold status: the clock is paused, so the time left stands still. */
  paused: boolean;
  /** 0–1: wall-clock share of creation → deadline. 1 once breached. */
  elapsed: number;
}

/** "2d 4h", "6h", "25m", "under 1m". Whole units, rounded down, so it never promises more time than there is. */
export function formatTimeLeft(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'under 1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
}

/**
 * The countdown for a ticket, or null when there is none to show: no SLA (no resolve deadline), or the ticket is
 * Resolved, Closed or Canceled (the clock has stopped; the badge shows the outcome).
 */
export function slaCountdown(ticket: SlaFields & { createdAt: string }, now: number = Date.now()): SlaCountdown | null {
  if (STOPPED.has(ticket.status)) return null;
  const due = effectiveResolveDue(ticket, now);
  if (!due) return null;
  const left = due.getTime() - now;
  const paused = HOLD_STATUSES.includes(ticket.status);
  if (left <= 0) return { tone: 'BREACHED', label: 'Breached', paused, elapsed: 1 };
  const display = getDisplaySlaStatus(ticket, now);
  // Not breached on resolution here, so the only BREACHED left is a first-response breach: a different clock.
  const tone: SLAStatus = display.status === 'DUE_SOON' ? 'DUE_SOON' : 'WITHIN_SLA';
  const start = new Date(ticket.createdAt).getTime();
  const span = due.getTime() - start;
  const elapsed = Number.isFinite(span) && span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : 0;
  return { tone, label: `${formatTimeLeft(left)} left`, paused, elapsed };
}
