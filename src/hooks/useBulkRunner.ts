// Bulk actions (08 §4.2). There are NO bulk endpoints: a bulk action is N single-ticket calls.
// - Hard cap BULK_ACTION_LIMIT (20). Sequential, one request at a time.
// - Stop at the first 429, 5xx, timeout, network failure or 401 — never retry; none of these calls is idempotent,
//   and the 300/min rate limit is shared by everyone behind the same IP (05 B.19).
// - "Stop" lets the request in flight finish, then runs nothing more.
// - Each ticket costs one fresh status read (TKT-3) plus one write, so 20 tickets ≈ 41 requests ≈ 14% of the shared
//   300/min bucket — the price of never acting on a stale status (writeGuards.fetchCurrentStatus).
// - Afterwards: ONE list refresh (first page only) and the touched tickets marked stale.
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { ApiClientError, describeWriteError, isSessionEndedError } from '@/api/errors';
import { BULK_ACTION_LIMIT } from '@/utils/ticket-rules';
import { markTicketStale, refreshListsFirstPage } from './cache';

export interface BulkTarget {
  id: string;
  /** Shown in progress and results, e.g. "#1234". */
  label: string;
  /** Set when the ticket is not eligible; it is listed as skipped and never sent. */
  skipReason?: string;
}

export type BulkState = 'done' | 'skipped' | 'failed' | 'not-run';

export interface BulkOutcome {
  id: string;
  label: string;
  state: BulkState;
  message?: string;
}

export interface BulkProgress {
  title: string;
  /** Tickets that will actually be sent (excludes skipped). */
  toSend: number;
  /** Tickets sent so far (done + failed). */
  sent: number;
  current: string | null;
  running: boolean;
  stopRequested: boolean;
  stopReason: string | null;
  outcomes: BulkOutcome[];
}

/** Errors after which no further ticket is sent. Ticket-specific 400/403/404 just fail that ticket. */
export function stopReasonFor(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return 'An unexpected error occurred.';
  // A non-JSON 401 (proxy or captive-portal page) keeps the session but still stops the batch: every later call would hit it too.
  if (error.status === 401) return isSessionEndedError(error) ? 'Your session ended.' : 'The Service Desk sent a sign-in page instead of data.';
  if (error.status === 429) return 'The server is limiting requests (429).';
  if (error.status !== null && error.status >= 500) return 'The server reported an error.';
  if (error.kind === 'network' || error.kind === 'timeout') return "The Service Desk couldn't be reached.";
  return null;
}

export interface BulkSequenceResult {
  outcomes: BulkOutcome[];
  sent: number;
  stopReason: string | null;
}

/**
 * The sequential loop, free of React so it can be tested: one ticket at a time, skipped ones never sent, stop on
 * request or on the first batch-stopping error. Throws (sends nothing) above BULK_ACTION_LIMIT.
 */
export async function runBulkSequence(
  targets: readonly BulkTarget[],
  action: (ticketId: string) => Promise<unknown>,
  shouldStop: () => boolean,
  onProgress: (update: { current: string | null; sent: number; outcomes: BulkOutcome[] }) => void = () => undefined,
  isOffline: () => boolean = () => false,
): Promise<BulkSequenceResult> {
  if (targets.length > BULK_ACTION_LIMIT) {
    throw new Error(`Bulk actions are limited to ${BULK_ACTION_LIMIT} tickets.`);
  }
  const outcomes: BulkOutcome[] = targets.map((t) =>
    t.skipReason ? { id: t.id, label: t.label, state: 'skipped', message: t.skipReason } : { id: t.id, label: t.label, state: 'not-run' },
  );
  let sent = 0;
  let stopReason: string | null = null;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    if (target.skipReason) continue;
    if (shouldStop()) {
      stopReason = 'Stopped by you.';
      break;
    }
    if (isOffline()) {
      stopReason = "You're offline."; // never queued for later — the rest is listed as not sent
      break;
    }
    onProgress({ current: target.label, sent, outcomes: [...outcomes] });
    try {
      await action(target.id);
      outcomes[i] = { id: target.id, label: target.label, state: 'done' };
    } catch (error) {
      outcomes[i] = { id: target.id, label: target.label, state: 'failed', message: describeWriteError(error) };
      stopReason = stopReasonFor(error);
    }
    sent += 1;
    onProgress({ current: null, sent, outcomes: [...outcomes] });
    if (stopReason) break;
  }

  if (stopReason) {
    for (let i = 0; i < outcomes.length; i++) {
      if (outcomes[i]!.state === 'not-run') outcomes[i] = { ...outcomes[i]!, message: `Not sent: ${stopReason}` };
    }
  }
  return { outcomes, sent, stopReason };
}

export function useBulkRunner() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const stopRef = useRef(false);

  const run = useCallback(
    async (title: string, targets: readonly BulkTarget[], action: (ticketId: string) => Promise<unknown>) => {
      stopRef.current = false;
      const toSend = targets.filter((t) => !t.skipReason).length;
      setProgress({
        title, toSend, sent: 0, current: null, running: true, stopRequested: false, stopReason: null,
        outcomes: targets.map((t) => ({ id: t.id, label: t.label, state: t.skipReason ? 'skipped' : 'not-run', message: t.skipReason })),
      });
      const touched: string[] = [];
      const result = await runBulkSequence(
        targets,
        async (id) => {
          touched.push(id);
          return action(id);
        },
        () => stopRef.current,
        ({ current, sent, outcomes }) => setProgress((p) => (p ? { ...p, current, sent, outcomes } : p)),
        () => !onlineManager.isOnline(),
      );
      setProgress((p) => (p ? { ...p, current: null, running: false, sent: result.sent, stopReason: result.stopReason, outcomes: result.outcomes } : p));
      touched.forEach((id) => markTicketStale(queryClient, id));
      if (result.sent > 0) void refreshListsFirstPage(queryClient); // once, at the end (08 §4.2)
      return result.outcomes;
    },
    [queryClient],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
    setProgress((p) => (p ? { ...p, stopRequested: true } : p));
  }, []);

  const reset = useCallback(() => setProgress(null), []);

  return { progress, run, stop, reset };
}
