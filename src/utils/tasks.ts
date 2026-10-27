// Tasks module helpers (05 §A.15, B.25). Pure functions.
import type { TaskStatus, TicketStatus, TicketTaskEmbedded } from '@/types';

/** One row of the standalone task list: the task as embedded in its ticket (TKT-1), plus that ticket's identity. */
export interface FeedTask {
  task: TicketTaskEmbedded;
  ticket: { id: string; ticketNumber: number; title: string; status: TicketStatus };
}

export type TaskStatusFilter = 'ALL' | 'ACTIVE' | TaskStatus;

export const TASK_FILTER_LABELS: Record<TaskStatusFilter, string> = {
  ALL: 'All',
  ACTIVE: 'Not done',
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export interface TaskFeedFilter {
  status: TaskStatusFilter;
  /** Assigned to this user id only. */
  assignedToId?: string;
  /** Case-insensitive match on task title/description, ticket number or ticket subject. */
  search?: string;
}

export function matchesTaskFilter(row: FeedTask, filter: TaskFeedFilter): boolean {
  const { task, ticket } = row;
  if (filter.status === 'ACTIVE' && (task.status === 'COMPLETED' || task.status === 'CANCELLED')) return false;
  if (filter.status !== 'ALL' && filter.status !== 'ACTIVE' && task.status !== filter.status) return false;
  if (filter.assignedToId && task.assignedToId !== filter.assignedToId && task.assignedTo?.id !== filter.assignedToId) return false;
  const q = filter.search?.trim().toLowerCase().replace(/^#\s*/, '');
  if (q) {
    const haystack = [task.title, task.description ?? '', String(ticket.ticketNumber), ticket.title].join('\n').toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/** Done ↔ not done, the web's toggle (05 §A.15: `{ status: COMPLETED ↔ OPEN }`). */
export function toggledTaskStatus(status: TaskStatus): TaskStatus {
  return status === 'COMPLETED' ? 'OPEN' : 'COMPLETED';
}

// ── Due dates (05 B.25) ──────────────────────────────────────
// The server wants a full UTC ISO string; `YYYY-MM-DD` gets a 400. A due DATE is sent as UTC midnight of that day
// (`2026-10-12T00:00:00.000Z`, the example in 05 §A.15) and shown back as that same calendar day.

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" → "YYYY-MM-DDT00:00:00.000Z", or null when it is not a real calendar date. */
export function dayToDueDate(day: string): string | null {
  const m = DAY_RE.exec(day.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return date.toISOString();
}

/** A stored due date → "YYYY-MM-DD" (its UTC calendar day), for the editor. */
export function dueDateToDay(dueDate: string | null | undefined): string {
  if (!dueDate) return '';
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** A Date's calendar day on the device, as "YYYY-MM-DD" (what the date picker's choice means to the person). */
export function dayFromDate(date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today + `offsetDays` on the device's calendar, as "YYYY-MM-DD". */
export function dayFromToday(offsetDays: number, now: Date = new Date()): string {
  return dayFromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays));
}

/** "YYYY-MM-DD" → a local Date at noon of that day (the date picker's starting value), or null if not a real date. */
export function dateFromDay(day: string): Date | null {
  if (!dayToDueDate(day)) return null;
  const m = DAY_RE.exec(day.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}

/** The range dayToDueDate accepts, for the picker's minimumDate / maximumDate. */
export const DUE_DATE_MIN = new Date(2000, 0, 1);
export const DUE_DATE_MAX = new Date(2100, 11, 31);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "12 Oct 2026" for a due date, read as its UTC calendar day so it never shifts by the device timezone. */
export function formatDueDay(dueDate: string | null | undefined): string {
  const day = dueDateToDay(dueDate);
  const m = DAY_RE.exec(day);
  if (!m) return '—';
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Overdue = not done and its due day is before today (device calendar). */
export function isTaskOverdue(task: Pick<TicketTaskEmbedded, 'status' | 'dueDate'>, now: Date = new Date()): boolean {
  if (!task.dueDate || task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
  const day = dueDateToDay(task.dueDate);
  return !!day && day < dayFromToday(0, now);
}
