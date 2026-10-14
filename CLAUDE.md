# CLAUDE.md — MMG Ticketing MOBILE app

> **Read this file first in every session. Then read the doc in `docs/web-system/` that matches your task.**
>
> **Auth is a PENDING DECISION.** Until a backend ask (A1 or A2) ships, the app cannot log in against production. See `docs/web-system/02-AUTH.md`.

## What this repo is

- This is the **MMG Ticketing MOBILE app**, the phone client for the Mount Meru Group Service Desk.
- Stack:
  - React Native / **Expo SDK 52**, TypeScript
  - React Navigation v6
  - TanStack Query v5
  - Zustand
  - NativeWind
  - expo-secure-store
  - Axios
- Current state: **documentation only.** There is no application code yet. The docs in `docs/web-system/` were written on 2026-10-09 from a read-only inspection of the web repo.

## The backend is the single source of truth

- The web backend (Express + Prisma + PostgreSQL + Redis) owns all data and all business rules.
- The mobile app is a **REST client of `/api/v1` and NOTHING ELSE.**
  - It never connects to a database.
  - It never reads the web repo at runtime.
  - It never duplicates logic the backend already enforces.
- **Exception:** some rules exist only in the web frontend and the backend does not enforce them, such as status transitions and required closure fields. Mobile must reimplement those, exactly as listed in `docs/web-system/05-RULES-AND-GAPS.md` §A. That is the only client-side business logic allowed. When the backend later enforces a rule (ask A6), delete the mobile copy.

## Rules for every change

1. **API calls.** Before adding or changing any API call, check `docs/web-system/01-API-CONTRACT.md`.
   - If the endpoint is not in that file, **STOP and ask Ronit.**
   - Never invent an endpoint, a field name, a query parameter or an enum value.
   - "The web app calls it" is not enough: the web client calls at least one endpoint that does not exist (see 01 §0.6).
2. **Types.** TypeScript types must match `docs/web-system/03-DATA-MODEL.md` exactly.
   - Copy the interfaces from §B of that file into `src/types/`; do not hand-write new ones.
   - If the API returns something the doc doesn't describe, stop and update the doc (with Ronit's OK) before changing the type.
3. **Web repo is reference only.** The web repo clone at `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform` is **READ-ONLY** reference.
   - Read it to verify a shape. Never write to it, never run it, never modify it.
   - The brief that produced these docs named it `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform`. No such folder exists directly under the home folder; the Desktop path above is the clone that was analysed.
4. **Environment.** Point the app only at the environment marked **ALLOWED** in `docs/web-system/00-OVERVIEW.md` §3.
   - Never point a development build at production.
5. **Auth.** Do not build a workaround while auth is a PENDING DECISION.
   - No scraping of `Set-Cookie`, no use of `/auth/test-login`, no embedding of the web SSO flow.
   - See `02-AUTH.md`.
6. **Security holes.** Do not rely on, exploit, or try to patch the backend permission gaps in `05-RULES-AND-GAPS.md` §C.
   - The UI must offer only the actions the web UI offers for that role.
   - Fixing the gaps is the web team's job.
7. **Hard-wired client behaviour** (details in `01-API-CONTRACT.md` §0):
   - Always send `Authorization: Bearer <token>`, never cookies.
   - Treat any `text/html` response as an error.
   - Treat 401 as "log in again" (no refresh exists).
   - Normalise the four pagination shapes in one adapter.
   - Never put base64 images in JSON bodies: the limit is 2 MB.
   - Sanitise HTML before rendering it.
8. **Secrets.** Never commit tokens, `.env` values or test credentials.
   - Tokens live in `expo-secure-store` only, never AsyncStorage or logs.

## Doc index (`docs/web-system/`)

| File | Read it when |
|---|---|
| `00-OVERVIEW.md` | You need the big picture, environments and base URLs, or the BLOCKERS list |
| `01-API-CONTRACT.md` | **Any time you touch an API call.** Every allowed endpoint, with params, shapes, errors and source lines |
| `02-AUTH.md` | Login, token storage, 401 handling, logout |
| `03-DATA-MODEL.md` | Writing or changing TypeScript types; enum values |
| `04-SCREEN-MAP.md` | Deciding what screen to build and which endpoints it uses |
| `05-RULES-AND-GAPS.md` | Status transitions, closure rules, validation, known backend bugs and their workarounds, security findings |
| `06-BACKEND-ASKS.md` | What we have asked the backend team for, and what is blocking |

If code and docs disagree, **the backend source wins**. Re-verify against the web repo (read-only), then ask Ronit before updating the doc.

---

## SAFETY RULES — NON-NEGOTIABLE

R1. READ-ONLY on the web repo clone and on the diagnostic file. No writes, no
    edits, no deletes, no moves, anywhere under those paths.
R2. NO DATABASE. Do not connect to any database. Do not run prisma, psql, or
    any migration/seed/push command. Schema knowledge comes from reading
    schema.prisma as text only.
R3. Never fix anything you find. Bad code, dead routes, security holes,
    migration drift — REPORT in 05-RULES-AND-GAPS.md and move on.
R4. SHELL — inspection only. Allowed: ls, dir, cat, head, tail, grep,
    Select-String, find, git status, git log, git diff.
    Forbidden: rm, mv, cp over an existing file, chmod, chown, kill, any
    install (npm/npx/pip/choco), any start/stop/restart, any git write command
    (commit, push, checkout, pull, reset, clean, stash).
R5. Write ONLY the 8 files listed under OUTPUT LOCATION. Nothing else, nowhere
    else. Do not create code files.
R6. Never print a secret value. If a real secret appears, write
    "[REDACTED - present in <file>]".
R7. If a step seems to need a write outside the allowed paths, a state change,
    or a DB connection: STOP, add it to a BLOCKERS section at the end of
    00-OVERVIEW.md with the exact command you would have run. Ronit decides.

> Note for future sessions:
> - R4 and R5 were written for the documentation phase that produced these files. The 8 files are `CLAUDE.md` plus `docs/web-system/00` to `06`.
> - When mobile development starts, Ronit will say which of R4 and R5 are relaxed **for this mobile repo only**, for example to allow `npm install` and writing `src/`.
> - Until Ronit says so in writing, they apply as stated.
> - R1, R2, R3 and R6 apply to the web repo and its databases **permanently**.
