# Review — "warn the technician before an SLA is missed": ManageEngine vs the MMG mobile app

Written 2026-10-22 on `feature/sla-breach-alerts`. Scope: only the response / resolution SLA alerting behaviour,
compared with ManageEngine ServiceDesk Plus (SDP) and its technician mobile app. Companion to `SLA-REMINDERS.md`
(what the branch builds) and `web-system/08-SDP-PARITY.md` (the wider feature comparison).

## 1. How ManageEngine does it

- An SLA carries a **response** time and a **resolution** time (response < resolution).
- **Escalation rules** are configured per SLA: *Escalate before* — a lead time ahead of the deadline, so the
  technician is warned in advance — and *Escalate after* — one level for response, up to four for resolution. Each
  level notifies chosen technicians and can reassign, change the group, priority or level.
- The SLA clock pauses while a request is on hold.
- Channel: **email** (SMS through notification rules). The SDP mobile app shows **SLA status flags for response and
  resolution** on every request and pushes assignment, end-user-reply and approval notifications to the technician.

## 2. How MMG compares

| Capability | ManageEngine | MMG backend today (per `web-system/*`) | MMG app on `dev` | With `feature/sla-breach-alerts` |
|---|---|---|---|---|
| Response deadline tracked | Yes | Yes: `slaResponseDue`, `firstResponseAt` | Breach label only ("First Response SLA Breached", `05` §A.9) | Countdown in the ticket header + reminder |
| Resolution deadline tracked | Yes | Yes: `slaResolveDue`, hold-adjusted | Badge + "Resolve by" row | Countdown + reminder |
| **Warn before the breach** | Configurable lead time per rule | Fixed **≤ 30 min**: `jobs/slaBreachChecker.job.ts` flips the ticket to `DUE_SOON` and writes an `SLA_WARNING` in-app notification (`01` §9, `06` A23). The escalation rules configured in the admin UI **never run** (`05` B.5) | **Nothing proactive**: the warning shows in Alerts only on pull-to-refresh — no push (`05` B.4), SSE broken (B.3), no polling this phase | Phone notification at due − 30 min for both deadlines, Home heads-up, Settings switch |
| Who is warned | Chosen technicians per level; the group when unassigned | The assignee (in-app row); nobody for an unassigned ticket | Same | Assignee only |
| After-breach escalation (levels, reassign) | Up to 4 levels | None (rules dead) | None | None |
| Reaches the phone while the app is closed | Push | None — ask **A5** open | None | OS-scheduled local reminder, only for tickets this phone has loaded |
| Hold pauses the clock | Yes | Yes, with a double-count quirk (`05` B.27) | Mirrors the web formula (`05` §A.9) | Reminders suppressed while on hold |

**Verdict.** On *showing* SLA state the app is at parity with SDP: status flags, breach type, Due soon / Overdue
filters, sort by due, hold handling. On *warning the technician before a miss*, `dev` is behind SDP for a backend
reason, not an app reason: the server already computes the exact "30 minutes left" moment and records the warning,
but has no way to reach a phone, and the app deliberately does not poll. The SLA branch closes most of that gap from
the device; it cannot cover tickets the phone has not loaded, nor unassigned tickets.

## 3. Recommendations, in order

1. **Mobile, ready:** merge `feature/sla-breach-alerts` — after `npx expo install expo-notifications` (lock file),
   `npm run typecheck && npm test`, and a new `preview` build (native module). This is the bridge.
2. **Backend, the real fix:** ask **A5** (push), and send `SLA_WARNING` / `SLA_BREACHED` to the assignee as push. The
   job already fires at the right moment; only delivery is missing. This reaches SDP-level behaviour, including
   tickets the phone never opened.
3. **Backend:** revive the escalation rules (B.5) or at least make the lead time configurable (`schema.prisma` already
   has `minutesBefore`), add a **group-level** warning for unassigned tickets, and fix the hold double-count (B.27).
4. **Mobile, small, Ronit's call:** switch on the 60-second foreground poll of NTF-2 that `01` §0.4 / NTF-2 allows,
   so the Alerts badge reflects the server's `SLA_WARNING` without a pull-to-refresh.

## 4. To confirm with Ronit / the backend team

The docs do not say:

- whether `slaBreachChecker` evaluates the **response** deadline or only resolution (the web computes response
  breach client-side, `05` §A.9, which suggests the server status is resolution-centric);
- whether `SLA_WARNING` goes to the assignee only, or also to the group;
- whether any **email** is sent on warning or breach today.

## Sources

- https://help.servicedeskplus.com/configurations/helpdesk/configuring-service-level-agreement.html
- https://www.manageengine.com/products/service-desk-msp/service-level-agreement.html
- https://www.manageengine.com/products/service-desk/it-incident-management/how-to-prevent-overdue-tickets.html
- https://pitstop.manageengine.com/portal/en/community/topic/sla-escalations-notifications
- https://help.servicedeskplus.com/mobile-client/android-app.html
- https://www.manageengine.com/products/service-desk/self-service/help-desk-software-android-app.html
