# CLAUDE.md — Setu iOS app (`ios-dev`)

> **Read this file first in every session.** Then read `docs/ios/00-PORT-MANIFEST.md` (what is ported, from where, and in which phase), and the doc in `docs/web-system/` that matches your task.
>
> This is the **iOS port** of the Android app. The Android guardrails are carried over unchanged unless a rule is marked **iOS**.

## What this repo is

- This is the **iPhone app** for the Mount Meru Group Service Desk. Users see it as **Setu**. In-app text that says "the Service Desk" means the backend or the IT team, not the app.
- It is the `ios-dev` branch of `Mountmeru-Group/mmg-ticketing-mobile-app`, ported from the Android app on `dev`.
- **Port source:** `origin/dev` @ `c84d53ac716b10a1d0084fb002f212225fb24763`.
  - To bring later Android changes across, diff `c84d53a..origin/dev`.
  - Apply each changed file according to its row in the manifest.
- Stack (`package.json` is the source of truth):
  - Expo SDK 57, React Native 0.86, React 19, TypeScript
  - React Navigation 7
  - TanStack Query 5
  - Zustand 5
  - NativeWind 4
  - expo-secure-store
  - Axios
- Bundle ID `com.mountmeru.servicedesk`. iPhone only (`supportsTablet: false`).
- **Roadmap** (details in the manifest, §2; renumbered 2026-10-28, old→new table there):
  - iOS-1 foundation (1a docs, 1b port)
  - iOS-2 navigation shell (tab bar + More)
  - iOS-3 screens (3a read, 3b write, 3c modules)
  - iOS-4 HIG polish
  - iOS-5 parity + tests
  - iOS-6 Microsoft SSO
  - iOS-7 EAS project + first build → TestFlight (full-system test)
  - iOS-8 testing-team rounds
  - iOS-9 App Store readiness + submit
- **Auth on iOS:**
  - Microsoft SSO (AUTH-P2) is live on UAT. On iOS it is wired in iOS-6, once IT has registered the iOS redirect `msauth.com.mountmeru.servicedesk://auth`.
  - Until then the only way in is the `__DEV__` developer-token screen, which arrives in iOS-2.
  - The TestFlight test login (manifest §8) is a proposal and is **not approved**.

## iOS branch rules — NON-NEGOTIABLE

I1. **Work on `ios-dev` only.**
    - Never push to, merge into, rebase or touch `main`, `dev` or any Android branch.

I2. **Never open or modify** `..\mmg-ticketing-mobile-app` (Android) or `..\MMG-Ticketing-Platform` (web).
    - Read Android code only through git, from this repo: `git show <commit>:<path>`, `git ls-tree`, `git grep`.
    - Porting a file is `git checkout <port source> -- <path>` into the working tree; it never switches branch.

I3. **UAT API only:** `https://uat-servicedesk.mountmerugroup.com/api/v1`.
    - The PROD entry in `src/config/env.ts` stays an empty placeholder until Ronit signs off in writing.

I4. **The web repo is read-only reference, and it is not opened from this repo.**
    - Use `docs/web-system/`. If a shape must be checked against the web source, ask Ronit.

I5. **App Store compliance is checked in every phase** against `docs/ios/APP-STORE-COMPLIANCE.md`.
    - A phase that touches a row updates that row, with evidence, before the phase counts as done.

I6. **Never commit without first showing Ronit the diff and getting an OK.**
    - Then commit to `ios-dev` only.

I7. **No new work outside the current phase's brief:** no `eas` commands, new dependencies, screens or navigation unless that brief allows them.

## The backend is the single source of truth

- The web backend (Express + Prisma + PostgreSQL + Redis) owns all data and all business rules.
- The mobile app is a **REST client of `/api/v1` and NOTHING ELSE.**
  - It never connects to a database.
  - It never reads the web repo at runtime.
  - It never duplicates logic the backend already enforces.
- **Exception:** some rules exist only in the web frontend and the backend does not enforce them, such as status transitions and required closure fields.
  - Mobile must reimplement those, exactly as listed in `docs/web-system/05-RULES-AND-GAPS.md` §A. That is the only client-side business logic allowed.
  - When the backend later enforces a rule (ask A6), delete the mobile copy.

## Rules for every change

1. **API calls.** Before adding or changing any API call, check `docs/web-system/01-API-CONTRACT.md`.
   - If the endpoint is not in that file, **STOP and ask Ronit.**
   - Never invent an endpoint, a field name, a query parameter or an enum value.
   - "The web app calls it" is not enough: the web client calls at least one endpoint that does not exist (see 01 §0.6).
2. **Types.** TypeScript types must match `docs/web-system/03-DATA-MODEL.md` exactly.
   - Copy the interfaces from §B of that file into `src/types/`; do not hand-write new ones.
   - If the API returns something the doc doesn't describe, stop and update the doc (with Ronit's OK) before changing the type.
3. **Web repo (iOS).** Not opened from this repo (rule I4). Shapes come from `docs/web-system/`.
4. **Environment.** Point the app only at the environment marked **ALLOWED** in `docs/web-system/00-OVERVIEW.md` §3.
   - Never point a development or TestFlight build at production.
5. **Auth.** No workaround of any kind (`docs/web-system/02-AUTH.md` §6):
   - no scraping of `Set-Cookie`;
   - no use of `/auth/test-login` and no `TEST_AUTH_SECRET`;
   - no embedding of the web SSO flow or lifting its cookie;
   - no pasting of tokens, except on the `__DEV__`-only developer-token screen.
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
8. **Secrets.** Never commit tokens, `.env` values, test credentials, signing certificates, provisioning profiles or App Store Connect keys.
   - Tokens live in `expo-secure-store` only (iOS Keychain, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), never AsyncStorage or logs.

## Doc index

| File | Read it when |
|---|---|
| `docs/ios/00-PORT-MANIFEST.md` | Porting anything from Android: each file's class (KEEP / ADAPT / SKIP / SCREEN), its iOS change and its phase; the roadmap; open decisions D1–D11 |
| `docs/ios/APP-STORE-COMPLIANCE.md` | **Every phase.** The Apple rules the phase touches, and their status |
| `docs/web-system/00-OVERVIEW.md` | You need the big picture, environments and base URLs, or the BLOCKERS list |
| `docs/web-system/01-API-CONTRACT.md` | **Any time you touch an API call.** Every allowed endpoint, with params, shapes, errors and source lines |
| `docs/web-system/02-AUTH.md` | Login, token storage, 401 handling, logout |
| `docs/web-system/03-DATA-MODEL.md` | Writing or changing TypeScript types; enum values |
| `docs/web-system/04-SCREEN-MAP.md` | Deciding what screen to build and which endpoints it uses |
| `docs/web-system/05-RULES-AND-GAPS.md` | Status transitions, closure rules, validation, known backend bugs and their workarounds, security findings |
| `docs/web-system/06-BACKEND-ASKS.md` | What we have asked the backend team for, and what is blocking |

If code and docs disagree, **the backend source wins**. Ask Ronit to have it re-verified (the web repo is not opened from here) before a doc is updated.

---

## SAFETY RULES — NON-NEGOTIABLE (carried over from Android)

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

> **iOS note on R4 and R5:**
> - R4 and R5 were written for the Android documentation phase.
> - In this repo, each phase brief from Ronit says exactly what is allowed. For example, iOS-1b allows `npm ci`, `npx tsc`, `npm test`, `npx expo-doctor`, `git checkout <port source> -- <path>`, and writing the files that brief names.
> - Outside what a brief allows, R4 and R5 apply as stated.
> - R1, R2, R3 and R6 apply to the web repo and its databases **permanently**.
