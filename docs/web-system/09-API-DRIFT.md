# 09 — API Drift (live responses vs `03-DATA-MODEL.md`)

> **What this is.** `src/types/` was copied from `03-DATA-MODEL.md` §C, which was written from `schema.prisma` and the web source, **not** from live responses. This file records every place a **live UAT response** differs from those types.
>
> **Rules**
> - Do **not** change a type in `src/types/` to fit a response. Record the mismatch here; **Ronit decides** what gets corrected (03 first, then a re-copy into `src/types/`).
> - The app stays resilient meanwhile: envelope checks fail safely (error state, nothing rendered), and field reads use fallbacks.
> - Never paste field **values** here: no names, emails, ticket text or tokens (R6). Types and enum values only.

## How mismatches are found

Phase 3a added a **`__DEV__`-only** checker (`src/api/drift.ts`, specs in `src/api/responseSpecs.ts`). It compares the fields M3/M4 read against 03 §C and logs each mismatch **once per app session** to the Metro terminal:

```
[API drift] TKT-1 data[0].lastRequesterReplyAt: expected string | null, got undefined
[API drift] TKT-3 status: unknown enum value "NEW_STATUS" (expected one of OPEN, IN_PROGRESS, …)
```

Copy each line into the table below, adding where you saw it (screen, role, ticket number if needed).

- **Endpoints checked (reads, Phase 3a):** TKT-1, TKT-3 (incl. `tasks[0]`), TKT-7, CMT-1, ATT-1, LKP-4/LKP-5.
- **Endpoints checked (Phase 3b):**
  - write responses: TKT-2, TKT-4, TKT-5, TKT-6 (the returned `Ticket`), CMT-2 (the created comment, without `attachments`, which 01 says are absent), ATT-2;
  - picker reads: TKT-9, TKT-10, LKP-1, LKP-2, USR-3.
- **A write is never failed because a field drifted.** The change has already happened on the server, so the app logs the drift line and refreshes the ticket. The exceptions are TKT-2 without an `id` and ATT-2 that is not an array: the app cannot continue without those, and the message says the change may have been saved.
- **Checked per response:** the first array item only.
- **Release builds:** the checker is compiled out.

A wrong **envelope**, such as an object where an array is promised, also logs a line. It also fails the request with "The Service Desk's reply was not in the expected format", so the bad data never reaches the screen.

## Observed drift

| # | Date | Endpoint | Field | Expected (03 §C) | What arrived | Where seen (screen · role) | Decision (Ronit) |
|---|---|---|---|---|---|---|---|
| — | — | — | *None recorded yet. Phases 3a and 3b were written without UAT access (no token, by design). Ronit's 3a test run found no read drift; write drift will come from the 3b test run.* | | | | |

## Watch list (flagged in the docs, not yet observed)

These are the likeliest drift points. Each one is already read with a fallback in the UI.

| Field | Why it may differ | Doc reference |
|---|---|---|
| `Ticket.lastRequesterReplyAt` | Merged by raw SQL on TKT-1 only. It is `null` if that query fails, and absent on TKT-3. | 03 §B.1, 05 B.17 |
| `Comment.toRecipients` / `ccRecipients` | Read through raw SQL; `[]` where the columns are missing | 03 §B.3 |
| `Ticket.isFcr` | Nullable in the schema despite its `false` default | 03 §B.1 |
| `TicketDetail.slaPolicy` | Full row on TKT-3, `{id,name}` elsewhere | 01 TKT-3 |
| Enum values (`status`, `priority`, `slaStatus`, audit `action`) | The database is managed by `prisma db push`, so a deployed enum can run ahead of the schema read on 2026-10-09 | 00 B2, 03 "Read this first" |
