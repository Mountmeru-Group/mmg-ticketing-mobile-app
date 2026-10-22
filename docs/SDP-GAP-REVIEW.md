# SDP gap review — the mobile app on `dev` versus the ManageEngine ServiceDesk Plus technician app

Written 2026-10-22 on branch `feature/sdp-parity-round1`, against `dev` @ `1d3daff` (Phase G1). The reference is
`docs/web-system/08-SDP-PARITY.md` (64 rows, re-checked here against the code) plus ManageEngine's own description of
the SDP mobile apps (requests, tasks, worklogs, approvals, notifications of assignments / replies / approvals, SLA
status flags, filters and custom views, solutions, announcements, asset audit, voice dictation on iOS).

## 1. Where the app stands

Of the 37 rows `08` marked **BUILD NOW**, 35 are on `dev`: drawer + 3 tabs, named filters and sort, search with the
ticket-link resolver, inline status chip, tap-and-hold bulk Pick up / Assign / Close (cap 20, sequential, per-ticket
results), More options, Conversations / Notes / History / Resolution / Tasks / Attachments, closure form with FCR and
closure code, standalone task feed with "View parent ticket", approvals inbox with entity chips and Take action, KB,
announcements, Home tiles, the "New reply" highlight and the hold-adjusted SLA badge, property editing (G1).

Not built from that list:

| Row | Feature | Status |
|---|---|---|
| 1.57 | Day and night mode | Not built ("not in this phase's brief", `ProfileScreen.tsx`) |
| §4.4 | Requester filter chip (USR-3 → `requesterId=`) | Not built |
| §4.5 | "Advanced" filter sheet: priority, group, category, created-date range | Not built (only Country exists) |

Documented in the contract but unused: **LKP-7 canned responses** (SDP's reply templates; `01` says "mobile: staff").
Asked for by `02-AUTH.md` §5.4 but unused: **local drafts** for the reply composer and the new-ticket form.

## 2. What this branch adds (no backend change, no new package)

| Change | SDP feature | Where |
|---|---|---|
| **Reply templates** in the composer (staff): "Insert a template" opens a sheet listing LKP-7 responses by title and category; the template's HTML becomes composer text (`htmlToDisplayText`) and is inserted by the web's rule (`05` §A.5: empty body → replace, else append after a blank line) | Response templates | `api/lookups.api.ts` `listCannedResponses`, `hooks/useLookups.ts` `useCannedResponses`, `utils/compose.ts` `insertTemplate` (tested in `tests/compose/`), `ReplyComposerScreen.tsx` |
| **Drafts** (`02` §5.4): the reply composer keeps text + mode, the new-ticket form keeps title, description, category picks, impact and urgency — on this phone, per user, in the app's private document folder; restored when the same form opens again, with "Discard draft"; cleared on send/create and on the guard's Discard. Files and recipients are not drafted (temporary URIs; recipients re-prefill) | Offline / interrupted editing | `utils/drafts.ts`, `hooks/useDraft.ts`, `hooks/useDiscardGuard.ts` (`onDiscard`), `ReplyComposerScreen.tsx`, `CreateTicketScreen.tsx` |
| **Share link** in More options, every role: the system share sheet with `${APP_URL}/ticket/<number>` — the exact link the server's emails use (`05` §A.11). Not role-gated (not a write; the server decides who may open the link), so `tests/rbac` is untouched | Share request | `TicketDetailScreen.tsx` `shareTicketLink` |

A 401 mid-submit (the 8 h expiry) no longer loses a reply or a new ticket: after re-login the form restores it.

## 3. Suggested next rounds, in priority order

1. **Dark mode** (`08` row 1.57, BUILD NOW). Every screen uses NativeWind colour classes and `theme/colors.ts`;
   the clean route is NativeWind's `dark:` variants driven by a System / Light / Dark setting in Profile (persist with
   `prefs.store.ts`, apply with `useColorScheme` + `colorScheme.set`). Budget: a day for tokens + badges, a day per
   handful of screens. Needs a device to review contrast; not something to do blind.
2. **Advanced filters** (`08` §4.5) and the **Requester chip** (§4.4): all documented TKT-1 params (`priority`,
   `teamId`, `categoryId`, `fromDate`/`toDate`, `requesterId`). Add the fields to `TicketListKeyParams` so each
   combination is its own cache entry, a sheet on the Tickets screen, and chips showing what is applied. Half a day
   to a day. Note `categoryId` is exact (no children) and date range is on `createdAt` (UTC days).
3. **Swipe actions on ticket cards** (Pick up / Assign) for ADMIN and AGENT — the same guarded writes as the bulk
   bar, one ticket at a time; `react-native-gesture-handler` is installed. Nice-to-have; keep the confirmation.
4. **Templates in the closure form**: LKP-7 responses as a quick fill for "Closure comments" (posted as a PUBLIC
   reply, so the same insert rule applies).
5. **Biometric / PIN app lock** (SDP has it): needs `expo-local-authentication` (package approval, `RELEASE.md` §8)
   and a decision with IT on whether Intune MAM already covers it (`08` S11).

Backend-dependent, unchanged (`06`): push (A5 — the SLA reminders on `feature/sla-breach-alerts` are the bridge),
worklogs (A19), My tasks across tickets (A20), extra sorts (A21), search field (A22), due today (A23), merge (A25),
delegation (A26), approval detail for non-staff (A27), templates for END_USER (A28), assets (A29), requester
acknowledgement (A30).

## 4. For the reviewer

- Typecheck and tests were not run on the authoring machine (package install not permitted there):
  `npm ci && npm run typecheck && npm test`.
- `useDraft` expects a memoised `current` object (see its header); both screens pass one.
- Drafts live in `Paths.document/mmg-drafts/*.json` and are keyed by user id; a sign-out does not delete them, but a
  different user never reads them. If IT wants nothing left on a shared phone after sign-out, add
  `Directory(Paths.document, 'mmg-drafts').delete()` to the sign-out path (`useSignOut`), outside `client.ts` so the
  node tests keep loading without a file-system stub.
