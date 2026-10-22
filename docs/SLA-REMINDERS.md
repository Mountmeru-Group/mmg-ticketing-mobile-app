# SLA reminders — "warn the technician 30 minutes before a breach"

Branch `feature/sla-breach-alerts` (2026-10-22). What ManageEngine calls an escalation *before* violation, for the
assignee, on the phone.

## What the backend already does, and what it cannot do

- The `slaBreachChecker` job sets `slaStatus = DUE_SOON` at **≤ 30 minutes** to a deadline and writes `SLA_WARNING`
  (then `SLA_BREACHED`) in-app notifications (`01` NTF-1 "types actually produced", `06` A23).
- Escalation rules configured in the admin UI never run (`05` B.5).
- There is **no push** (`05` B.4, ask A5) and the SSE stream is broken (B.3). This phase does not poll either. So the
  warning the server writes is only seen when someone opens Alerts and pulls to refresh — usually too late.

## What the app does (no new endpoint, field or enum)

1. **Pool.** For ADMIN, AGENT and L2_MANAGER (anyone who can be an assignee), one `TKT-1` request: my open tickets,
   soonest deadline first — `assignedToId=<me>`, the My-open status list, `sortBy=sla`, `limit=50`. All documented
   parameters. Key `['tickets','sla-watch',<me>]` (`hooks/queryKeys.ts`); never under `['tickets','list']`, which
   `cache.ts` treats as infinite data.
   - Fetched on sign-in, and again when the app returns to the foreground, **at most once a minute** (the contract's
     foreground limit, `01` §0.4).
   - After every ticket write the server's returned ticket is patched into the pool without a request
     (`cache.ts` `patchSlaWatch`): a pick-up joins, a reassignment leaves, a status change updates.
2. **Plan** (`utils/sla-reminders.ts`, pure, tested in `tests/sla/`). Per ticket assigned to me, each open deadline:
   - first response: `slaResponseDue` while `firstResponseAt` is null;
   - resolution: `effectiveResolveDue()` (the hold-adjusted value, `05` §A.9) while `resolvedAt` is null;
   - none while the ticket is in a final status or a **hold** status (the server extends the due time when the hold
     ends, `05` B.27, so a reminder planned during a hold would be wrong);
   - fire at `due − 30 min`; a deadline already inside the window fires a few seconds after planning; a deadline
     already missed is skipped (the server's `SLA_BREACHED` covers it). Soonest 40 are kept.
3. **Schedule** (`notifications/localReminders.ts`). The plan is reconciled against the OS schedule — only
   notifications carrying our own `data.kind` are touched — so re-plans cancel moved or obsolete reminders and add new
   ones. Android channel `sla` (importance high). A tap opens the ticket (`navigationRef.openTicketInApp`), including
   the tap that launches the app.
4. **UI.**
   - Home (staff): a one-time **Allow notifications** card (the OS prompt is this tap or the one in Settings, never on
     launch, `08` §8); a note when the OS blocks the app; and, while reminders run, "N of your tickets are due within
     30 minutes" with a link that opens My open sorted by due date.
   - Ticket detail header: "First response due in 12 min" / "Resolution due in 2 h 05 min", amber inside the window.
   - Profile & settings (staff): **SLA reminders** switch (default on, this phone only, `mmg.pref.slaReminders` in
     SecureStore) with the permission state.
5. **Lifecycle.** Scheduled when the signed-in shell mounts; everything cancelled when the switch is turned off and
   when the shell unmounts (sign-out), so a shared phone never carries another person's reminders.

## Limits — be honest in release notes

- The phone can only remind about tickets it has loaded. A ticket assigned to me while the app has not been opened
  (and not foregrounded) for hours gets no reminder until the next open. **Push (A5) is the real fix**: the server
  already knows the moment (`slaBreachChecker`); it needs a device-token table and a sender. Until then this is the
  bridge, and the Home/Alerts pull-to-refresh remains the fallback.
- Deadlines are read as the phone sees them: a wrong device clock shifts every reminder.
- Android may delay or batch scheduled notifications under battery optimisation (Doze); the OS decides, not the app.
- Nothing fires for unassigned tickets (nobody to remind) or for END_USER.

## For the reviewer

- New: `src/utils/sla-reminders.ts`, `src/notifications/localReminders.ts`, `src/hooks/useSlaReminders.ts`,
  `src/store/prefs.store.ts`, `tests/sla/sla-reminders.test.mjs`, this file.
- Changed: `hooks/cache.ts` (`patchSlaWatch`), `hooks/queryKeys.ts`, `hooks/index.ts`, `navigation/navigationRef.ts`,
  `navigation/AppDrawer.tsx` (mounts the hook), `screens/dashboard/HomeScreen.tsx`, `screens/tickets/TicketDetailScreen.tsx`,
  `screens/profile/ProfileScreen.tsx`, `package.json`, `app.json`, `docs/RELEASE.md` §8.
- `expo-notifications` is the SDK 57 pin (`~57.0.23`). The lock file was not regenerated on the authoring machine:
  run `npx expo install expo-notifications`, commit the lock file, rebuild the `preview` APK (native module).
- Not done, by design: polling NTF-2 for `SLA_WARNING` (the phase forbids polling); a `MY_DUE_SOON` list filter
  (`assignedToId` + `sla=DUE_SOON` would be valid, but the Home link to My open sorted by due date covers it).
