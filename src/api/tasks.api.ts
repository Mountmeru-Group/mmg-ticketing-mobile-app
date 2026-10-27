// Ticket task endpoints (01 §5). Mounted under /api/v1/tickets/:ticketId/tasks.
// ⚠ No role or ticket-access checks exist on any task route (05 C.3). The UI offers task editing only to
// ADMIN, AGENT and L2_MANAGER; END_USER sees tasks read-only (D4).
import type { TaskBody, TicketTask } from '@/types';
import { apiClient, type MessageResponse } from './client';
import { clientError } from './errors';
import { pickDefined, seg } from './helpers';

const TASK_KEYS = ['title', 'description', 'assignedToId', 'status', 'dueDate', 'sortOrder'] as const;

/** `dueDate` must be a full UTC ISO string ending in `Z`; `YYYY-MM-DD` and offsets get a 400 (05 B.25). */
const UTC_ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function toTaskDueDate(date: Date): string {
  return date.toISOString();
}

function assertValidDueDate(dueDate: string | null | undefined): void {
  if (dueDate && !UTC_ISO_DATETIME.test(dueDate)) {
    throw clientError('Due date must be a full UTC date-time (use toTaskDueDate)');
  }
}

/** TSK-1 — GET /api/v1/tickets/:ticketId/tasks. `sortOrder` asc. Also embedded in TKT-3 `tasks`. */
export async function listTasks(ticketId: string): Promise<TicketTask[]> {
  const res = await apiClient.get<TicketTask[]>(`/tickets/${seg(ticketId)}/tasks`);
  return res.data;
}

/**
 * TSK-2 — POST /api/v1/tickets/:ticketId/tasks
 * Title required (1–255). `completedAt` is not set on create even when status is COMPLETED.
 */
export async function createTask(ticketId: string, input: TaskBody & { title: string }): Promise<TicketTask> {
  if (!input.title.trim()) throw clientError('Task title is required');
  assertValidDueDate(input.dueDate);
  const body = pickDefined(input, TASK_KEYS);
  const res = await apiClient.post<TicketTask>(`/tickets/${seg(ticketId)}/tasks`, body);
  return res.data;
}

/**
 * TSK-3 — PUT /api/v1/tickets/:ticketId/tasks/:taskId
 * Partial update; `null` clears description, assignedToId and dueDate. Status → COMPLETED sets completedAt.
 */
export async function updateTask(ticketId: string, taskId: string, input: TaskBody): Promise<TicketTask> {
  assertValidDueDate(input.dueDate);
  const body = pickDefined(input, TASK_KEYS);
  const res = await apiClient.put<TicketTask>(`/tickets/${seg(ticketId)}/tasks/${seg(taskId)}`, body);
  return res.data;
}

/** TSK-4 — DELETE /api/v1/tickets/:ticketId/tasks/:taskId. Confirm "Remove this task?" first (05 §A.15). */
export async function deleteTask(ticketId: string, taskId: string): Promise<MessageResponse> {
  const res = await apiClient.delete<MessageResponse>(`/tickets/${seg(ticketId)}/tasks/${seg(taskId)}`);
  return res.data;
}
