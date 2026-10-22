// SLA deadline reminders, planned on the device from the SLA fields TKT-1 / TKT-3 already return (03 §C): no new
// endpoint, no new field, no new enum value. Pure functions; the OS scheduling is src/notifications/localReminders.ts
// and the orchestration is hooks/useSlaReminders.ts (docs/SLA-REMINDERS.md).
//
// Why on the device: the backend's slaBreachChecker job marks a ticket DUE_SOON at ≤ 30 minutes (06 A23) and writes an
// SLA_WARNING notification, but there is no push (05 B.4, ask A5) and this phase does not poll, so a technician who is
// not looking at the app never learns of it in time. A local notification scheduled from the due time fires whether or
// not the app is open. Limits: only tickets this phone has loaded (my open tickets, refreshed on sign-in, on foreground
// and after each write) and the phone's clock. Push (A5) is the full answer; this is the bridge until it ships.
import type { Ticket } from '@/types';
import { HOLD_STATUSES } from '@/types';
import { effectiveResolveDue } from './format';

/** Lead time before a deadline: the same 30 minutes the server uses for DUE_SOON (06 A23). */
export const SLA_REMINDER_LEAD_MS = 30 * 60_000;
/** Every scheduled notification is OS bookkeeping; the soonest deadlines are the ones that matter. */
export const MAX_SCHEDULED_REMINDERS = 40;
/** Already inside the lead window when planning: fire shortly after now rather than at a time in the past. */
const IMMEDIATE_DELAY_MS = 5_000;

export type SlaDeadlineKind = 'response' | 'resolution';

export const SLA_DEADLINE_LABELS: Record<SlaDeadlineKind, string> = { response: 'First response', resolution: 'Resolution' };

/** The ticket fields the planner reads: present on TKT-1 rows and on TKT-3 (03 §C). */
export type ReminderSource = Pick<
  Ticket,
  | 'id' | 'ticketNumber' | 'title' | 'status' | 'assignedToId' | 'slaStatus' | 'slaResponseDue' | 'slaResolveDue'
  | 'firstResponseAt' | 'resolvedAt' | 'slaHoldMinutes' | 'slaHoldStartedAt'
>;

export interface SlaDeadline {
  kind: SlaDeadlineKind;
  /** Epoch ms. */
  dueAt: number;
}

export interface SlaReminder extends SlaDeadline {
  /** `${ticketId}:${kind}` — stable across replans, so an already-scheduled notification can be recognised. */
  key: string;
  ticketId: string;
  ticketNumber: number;
  title: string;
  /** Epoch ms the notification fires: dueAt − lead, or just after now when that moment has passed. */
  fireAt: number;
}

const FINAL_STATUSES: readonly Ticket['status'][] = ['RESOLVED', 'CLOSED', 'CANCELED'];

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The deadlines still open on a ticket. None while the SLA clock is stopped: a final status, or a hold status (the
 * server extends slaResolveDue when the hold ends, 05 B.27, so a reminder planned during a hold would be wrong).
 */
export function openDeadlines(t: ReminderSource, now: number = Date.now()): SlaDeadline[] {
  if (FINAL_STATUSES.includes(t.status) || HOLD_STATUSES.includes(t.status)) return [];
  const out: SlaDeadline[] = [];
  const responseDue = t.firstResponseAt ? null : parseTime(t.slaResponseDue);
  if (responseDue !== null) out.push({ kind: 'response', dueAt: responseDue });
  const resolveDue = t.resolvedAt ? null : effectiveResolveDue(t, now);
  if (resolveDue && Number.isFinite(resolveDue.getTime())) out.push({ kind: 'resolution', dueAt: resolveDue.getTime() });
  return out;
}

/**
 * Reminders to schedule for the signed-in technician: one per open deadline that has not passed, on each ticket
 * assigned to them, soonest first, capped. A deadline already inside the lead window fires almost at once; one already
 * missed is skipped (the server's SLA_BREACHED notification covers it).
 */
export function planReminders(tickets: readonly ReminderSource[], meId: string, now: number = Date.now()): SlaReminder[] {
  const out: SlaReminder[] = [];
  for (const t of tickets) {
    if (!t || t.assignedToId !== meId) continue;
    for (const { kind, dueAt } of openDeadlines(t, now)) {
      if (dueAt <= now) continue;
      out.push({
        key: `${t.id}:${kind}`,
        ticketId: t.id,
        ticketNumber: t.ticketNumber,
        title: typeof t.title === 'string' ? t.title : '',
        kind,
        dueAt,
        fireAt: Math.max(now + IMMEDIATE_DELAY_MS, dueAt - SLA_REMINDER_LEAD_MS),
      });
    }
  }
  out.sort((a, b) => a.fireAt - b.fireAt);
  return out.slice(0, MAX_SCHEDULED_REMINDERS);
}

/** Whole minutes from one instant to another, never below 1. */
export function minutesBetween(from: number, to: number): number {
  return Math.max(1, Math.round((to - from) / 60_000));
}

/** "12 min", "2 h 05 min", "3 d 4 h". */
export function formatMinutesLeft(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24} h`;
}

/** Notification text. The title is the server's plain `title` (never HTML), cut so the body stays on one line. */
export function reminderCopy(r: SlaReminder): { title: string; body: string } {
  const minutes = minutesBetween(r.fireAt, r.dueAt);
  const title = `#${r.ticketNumber} · ${SLA_DEADLINE_LABELS[r.kind]} due in ${formatMinutesLeft(minutes)}`;
  const subject = r.title.trim();
  const body = subject.length > 80 ? `${subject.slice(0, 79)}…` : subject || 'Open the ticket to reply before the SLA is missed.';
  return { title, body };
}

export interface SlaCountdown extends SlaDeadline {
  minutesLeft: number;
  /** Inside the lead window: the server would show DUE_SOON. */
  dueSoon: boolean;
}

/** The nearest deadline still ahead, for the detail header and the Home heads-up; null without one. */
export function nextDeadline(t: ReminderSource, now: number = Date.now()): SlaCountdown | null {
  const ahead = openDeadlines(t, now).filter((d) => d.dueAt > now).sort((a, b) => a.dueAt - b.dueAt);
  const next = ahead[0];
  if (!next) return null;
  return { ...next, minutesLeft: minutesBetween(now, next.dueAt), dueSoon: next.dueAt - now <= SLA_REMINDER_LEAD_MS };
}
