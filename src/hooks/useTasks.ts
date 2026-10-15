// Tasks module (Phase 4): the standalone list, task detail, M11 editor writes.
//
// THE STANDALONE LIST HAS NO ENDPOINT OF ITS OWN. TSK-1 lists one ticket's tasks; a cross-ticket task list needs ask
// A20 (08 1.41). Calling TSK-1 once per ticket would be an N-request fan-out on hardware shared with production, so
// the list reads the tasks TKT-1 already embeds in every ticket row (TICKET_INCLUDE) — the SAME query as the Tickets
// tab's "All / Last updated" list, so the two share one cache and nothing is fetched twice. Consequences, shown on screen:
//   - tasks appear ticket page by ticket page (20 tickets per "Load more"), most recently updated tickets first;
//   - the status / "assigned to me" / search filters apply to the tickets loaded so far.
//
// WRITES (TSK-2/3/4) — staff only (ADMIN, AGENT, L2_MANAGER). END_USER is read-only (D4); the server checks nothing
// (05 C.3), so this is the only gate. Writes run from task detail or the ticket's Tasks tab, where TKT-3 has loaded the
// ticket first (05 §C hygiene). `dueDate` is always a full UTC ISO string (05 B.25).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { assertObject, checkFields } from '@/api/drift';
import { TASK_RESPONSE_SPEC } from '@/api/responseSpecs';
import { createTask, deleteTask, updateTask } from '@/api/tasks.api';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { TaskBody, TaskStatus, TicketTask } from '@/types';
import { isStaff } from '@/utils/roles';
import { matchesTaskFilter, toggledTaskStatus, type FeedTask, type TaskFeedFilter } from '@/utils/tasks';
import { listCountryParam } from '@/utils/ticket-filters';
import { patchTaskInCaches, refreshTicket } from './cache';
import { useTickets } from './useTickets';
import { refuse, requireOnline, requireRole, wasRefusedOnDevice } from './writeGuards';

export function useTaskFeed(filter: TaskFeedFilter) {
  const user = useAuthStore((s) => s.user);
  const selectedCountry = useUiStore((s) => s.ticketCountryId);
  const countryId = user ? listCountryParam(user, selectedCountry) : undefined;
  const tickets = useTickets({ filter: 'ALL', sort: 'UPDATED', countryId });

  const all = useMemo<FeedTask[]>(() => {
    const rows: FeedTask[] = [];
    const seen = new Set<string>();
    for (const t of tickets.tickets) {
      for (const task of Array.isArray(t.tasks) ? t.tasks : []) {
        if (!task || typeof task.id !== 'string' || seen.has(task.id)) continue;
        seen.add(task.id);
        rows.push({ task, ticket: { id: t.id, ticketNumber: t.ticketNumber, title: t.title, status: t.status } });
      }
    }
    return rows;
  }, [tickets.tickets]);

  const items = useMemo(() => all.filter((row) => matchesTaskFilter(row, filter)), [all, filter]);

  return {
    ...tickets,
    items,
    /** Tasks in the loaded tickets before filtering. */
    loadedTaskCount: all.length,
    ticketsLoaded: tickets.tickets.length,
    ticketsTotal: tickets.total,
  };
}

function requireTaskEditor(role: ReturnType<typeof requireRole>): void {
  if (!isStaff(role)) throw refuse('Tasks are read-only for your role.');
}

function checkTask(endpoint: string, res: unknown): TicketTask {
  assertObject<TicketTask>(endpoint, res);
  checkFields(endpoint, res, TASK_RESPONSE_SPEC);
  return res;
}

/** TSK-3 `{ status: COMPLETED ↔ OPEN }` — reversible, so no confirmation (the web toggles directly too). */
export function useToggleTask() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  return useMutation({
    mutationFn: async ({ ticketId, taskId, status }: { ticketId: string; taskId: string; status: TaskStatus }) => {
      requireOnline();
      requireTaskEditor(requireRole(role));
      return checkTask('TSK-3', await updateTask(ticketId, taskId, { status: toggledTaskStatus(status) }));
    },
    onSuccess: (task, { ticketId }) => patchTaskInCaches(queryClient, ticketId, { task }),
    onSettled: (_res, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      void refreshTicket(queryClient, ticketId);
    },
  });
}

export interface SaveTaskVariables {
  ticketId: string;
  /** Absent = create (TSK-2). */
  taskId?: string;
  /** Allow-listed by tasks.api (title, description, assignedToId, status, dueDate, sortOrder). */
  body: TaskBody;
}

/** TSK-2 create / TSK-3 edit. */
export function useSaveTask() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  return useMutation({
    mutationFn: async ({ ticketId, taskId, body }: SaveTaskVariables): Promise<TicketTask> => {
      requireOnline();
      requireTaskEditor(requireRole(role));
      if (taskId) {
        if (Object.keys(body).length === 0) throw refuse('Nothing has changed.');
        return checkTask('TSK-3', await updateTask(ticketId, taskId, body));
      }
      const title = body.title?.trim() ?? '';
      if (!title) throw refuse('Task title is required.');
      return checkTask('TSK-2', await createTask(ticketId, { ...body, title }));
    },
    onSuccess: (task, { ticketId }) => {
      if (typeof task?.id === 'string') patchTaskInCaches(queryClient, ticketId, { task });
    },
    onSettled: (_res, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      void refreshTicket(queryClient, ticketId);
    },
  });
}

/** TSK-4 — after the "Remove this task?" confirmation (05 §A.15). */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  return useMutation({
    mutationFn: async ({ ticketId, taskId }: { ticketId: string; taskId: string }) => {
      requireOnline();
      requireTaskEditor(requireRole(role));
      return deleteTask(ticketId, taskId);
    },
    onSuccess: (_res, { ticketId, taskId }) => patchTaskInCaches(queryClient, ticketId, { deletedId: taskId }),
    onSettled: (_res, error, { ticketId }) => {
      if (wasRefusedOnDevice(error)) return;
      void refreshTicket(queryClient, ticketId);
    },
  });
}
