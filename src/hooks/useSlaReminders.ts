// SLA reminders for the signed-in technician (docs/SLA-REMINDERS.md).
// The pool: my open tickets, soonest deadline first — ONE TKT-1 request (`assignedToId=<me>`, the My-open status list,
// `sortBy=sla`, all documented in 01 TKT-1) on sign-in and when the app returns to the foreground, at most once a
// minute (the contract's foreground limit, 01 §0.4). A ticket write updates the pool without a request (cache.ts
// patches the row from the server's answer). Each change replans and brings the OS schedule in line
// (src/notifications/localReminders.ts). Staff only: END_USER is never an assignee.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { assertPaginated } from '@/api/drift';
import { listTickets } from '@/api/tickets.api';
import { openTicketInApp } from '@/navigation/navigationRef';
import {
  cancelAllSlaReminders, getReminderPermission, onReminderOpened, syncScheduledReminders,
} from '@/notifications/localReminders';
import { useAuthStore } from '@/store/auth.store';
import { usePrefsStore } from '@/store/prefs.store';
import type { Paginated, Ticket } from '@/types';
import { isStaff } from '@/utils/roles';
import { planReminders } from '@/utils/sla-reminders';
import { ticketFilterQuery } from '@/utils/ticket-filters';
import { queryKeys } from './queryKeys';

const FOREGROUND_MIN_INTERVAL_MS = 60_000;
/** TKT-1 `limit` is capped at 100 by tickets.api; 50 covers a technician's open queue in one page. */
const WATCH_LIMIT = 50;

/** The reminder pool. `enabled: false` = no request (and no stale data is shown from it). */
export function useSlaWatch({ enabled }: { enabled: boolean }) {
  const user = useAuthStore((s) => s.user);
  const me = user && isStaff(user.role) ? user : null;

  return useQuery({
    queryKey: queryKeys.tickets.slaWatch(me?.id ?? ''),
    queryFn: async (): Promise<Ticket[]> => {
      if (!me) return [];
      const res: Paginated<Ticket> = await listTickets({ ...ticketFilterQuery('MY_OPEN', me), sortBy: 'sla', limit: WATCH_LIMIT });
      assertPaginated<Ticket>('TKT-1', res);
      return res.data;
    },
    enabled: enabled && me !== null,
    staleTime: FOREGROUND_MIN_INTERVAL_MS,
  });
}

/** Mounted once in the signed-in shell (AppDrawer). Unmounting (sign-out) cancels every scheduled reminder. */
export function useSlaReminders(): void {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const staff = !!user && isStaff(user.role);
  const pref = usePrefsStore((s) => s.slaReminders);
  const permission = usePrefsStore((s) => s.reminderPermission);
  const load = usePrefsStore((s) => s.load);
  const setPermission = usePrefsStore((s) => s.setReminderPermission);

  useEffect(() => {
    if (pref === null) void load();
  }, [pref, load]);

  // Read, never request: the prompt is a tap on Home or in Settings (08 §8).
  useEffect(() => {
    if (!staff) return;
    void getReminderPermission().then(setPermission).catch(() => undefined);
  }, [staff, setPermission]);

  const active = staff && pref === true && permission === 'granted';
  const watch = useSlaWatch({ enabled: active });

  // Pool → plan → OS schedule.
  useEffect(() => {
    if (!active || !user || !watch.data) return;
    void syncScheduledReminders(planReminders(watch.data, user.id)).catch(() => undefined);
  }, [active, user, watch.data]);

  // Turned off: nothing scheduled stays behind. Also on unmount (sign-out).
  useEffect(() => {
    if (staff && pref === true) return;
    void cancelAllSlaReminders().catch(() => undefined);
  }, [staff, pref]);
  useEffect(() => () => void cancelAllSlaReminders().catch(() => undefined), []);

  // Foreground: refresh the pool, at most once a minute (the mount already fetched it).
  const lastRefresh = useRef(Date.now());
  useEffect(() => {
    if (!active) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const now = Date.now();
      if (now - lastRefresh.current < FOREGROUND_MIN_INTERVAL_MS) return;
      lastRefresh.current = now;
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.slaWatchAll(), refetchType: 'active' });
    });
    return () => subscription.remove();
  }, [active, queryClient]);

  // A tapped reminder opens its ticket (warm, and the tap that launched the app).
  useEffect(() => onReminderOpened((ticketId) => void openTicketInApp(ticketId)), []);
}
