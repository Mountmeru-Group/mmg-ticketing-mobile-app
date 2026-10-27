# 00 — Overview of the web system (for the mobile team)

> **Mobile cannot authenticate yet: auth is a PENDING DECISION (`02-AUTH.md`).**
> - The API is usable from a phone once a token is in hand.
> - Getting a token needs backend ask **A1** (password login) or **A2** (native Microsoft SSO). See `06-BACKEND-ASKS.md`.

| | |
|---|---|
| **Written** | 2026-10-09, read-only inspection |
| **Web repo analysed** | `C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform` (git clone, branch `master`). These docs were first written from a ZIP extract with no git history. `07-DRIFT-CHECK.md` (2026-10-14) proved that extract identical to `master` @ `a7c9f90` (2026-10-07) and re-verified the docs against `master` @ **`d7f3887`** (2026-10-09). The docs are pinned to `d7f3887`. |
| **Diagnostic used** | `C:\Users\Ronit Chaudhari\mmg-ticketing-diagnostic.md` (2026-10-09) |
| **Method** | Read routers, validators, controllers, `schema.prisma` and frontend source as text. No database, Redis, network or app process was touched. |

---

## 1. The web system in 10 lines

1. **What it is:** the Mount Meru Group IT **Service Desk / ticketing** platform. Users raise tickets; agents triage, assign, work and close them under SLA.
2. **Backend:** Node 20 + **Express 4** + TypeScript (`backend/src/`), JSON REST under **`/api/v1`**. About 300 routes in 41 modules: 38 routers mounted in `app.ts`, plus comments, attachments and tasks nested under tickets.
3. **Database:** **PostgreSQL** through **Prisma 5** (`backend/prisma/schema.prisma`, about 58 models). The schema is managed by `prisma db push`; the migrations folder is incomplete.
4. **Redis** (Memurai on Windows) holds:
   - the session cache `session:<token>`
   - notification pub/sub
   - the dashboard cache
5. **Auth:** opaque UUID session token, 8-hour absolute expiry.
   - Delivered as httpOnly cookie `sd_session`; the middleware also accepts `Authorization: Bearer`.
   - Identity providers: Microsoft Entra ID SSO (production), LDAP or local bcrypt.
6. **Roles:** `ADMIN`, `AGENT`, `END_USER`, `L2_MANAGER`, plus a hidden "triage" AGENT list in an environment variable.
7. **Frontend:** **React 18 + Vite** SPA (`frontend/src/`), TanStack Query, Zustand, axios with `withCredentials`. It uses the same `/api/v1` API the mobile app will use.
8. **Background jobs** in the API process:
   - SLA breach checker (60 s)
   - auto-close RESOLVED → CLOSED after 48 h
   - inbound email poller (2 min)
9. **Notifications:** email (MS Graph or SMTP) and in-app notification rows. **No push, no working real-time channel.**
10. **Hosting:** a Windows Server VM.
    - **IIS + ARR/URL Rewrite** proxies `/api/*` to Node on localhost.
    - Node runs under **PM2** (`ecosystem.config.js`, daily restart at 03:00) **or NSSM** (`Production-Build/docs/DEPLOYMENT-GUIDE.md`, dated 2026-05-02). The two sources disagree; see BLOCKERS.
    - PROD, UAT and QA run side by side on that one VM.

---

## 2. API base path and versioning

- **Base path:** `https://<host>/api/v1`. It is hard-coded in `backend/src/app.ts`.
  - There is **no other version**, no version header and no deprecation policy.
  - Breaking changes would land in `/api/v1` itself, so the mobile app must pin to documented shapes (`01-API-CONTRACT.md`) and fail safely on unknown values.
- **Health:** `GET https://<host>/health` returns `{ "status": "ok", "ts": "<ISO>" }`. It sits outside `/api`.
  - The deployment guide's smoke test mentions `GET /api/health`, which is **not a route**. In production that path returns the SPA's HTML with status 200.
  - Use `/health`.
- **API docs:** `GET /api/docs` serves Swagger UI. It is **public** and **incomplete** (about 95 of 300 paths). **Do not use it as a contract**; use `01-API-CONTRACT.md`.
- **Format:** JSON in and out. The request body limit is **2 MB**. Errors are always `{ "error": string }`, and validation errors add `details`.
- **Content traps:**
  - In production, unknown GETs under `/api` return **`200 text/html`** (SPA fallback).
  - The client must treat any HTML response as an error.
- **Rate limits:**
  - login: 20 per 15 min per IP;
  - everything else: 300/min per cookie, otherwise per **IP**. Bearer clients are keyed by IP; see `06` A14.
- **CORS:** a single origin, `APP_URL`. Native iOS and Android are unaffected. **Expo Web or a browser preview will be blocked.**

---

## 3. Environments and base URLs

| Env | Web URL | API base URL | Backend port (IIS rewrite target) | Install root on VM | Service name | **Mobile may point at it?** |
|---|---|---|---|---|---|---|
| **PROD** | `https://servicedesk.mountmerugroup.com` | `https://servicedesk.mountmerugroup.com/api/v1` | `localhost:4000` (`web.config`, `ecosystem.config.js`) | `C:\inetpub\servicedesk` | PM2 `servicedesk` / NSSM `ServiceDesk` | **NO.** Only a release build, after Ronit signs off and after the BLOCKING asks ship. |
| **UAT** | `https://uat-servicedesk.mountmerugroup.com` | `https://uat-servicedesk.mountmerugroup.com/api/v1` | `localhost:4001` (`web.config.uat`) | `C:\inetpub\servicedesk-uat` | NSSM `ServiceDesk-UAT` | **YES. This is the ONLY allowed target for development and test builds.** |
| **QA** | `https://qa-servicedesk.mountmerugroup.com` | `https://qa-servicedesk.mountmerugroup.com/api/v1` | `localhost:4002` (likely; `frontend/public/web.config`) | `C:\inetpub\servicedesk-qa` | NSSM `ServiceDesk-QA` | **NO**, unless Ronit approves. It belongs to the web team's QA. |
| Local dev | `http://localhost:5173` | `http://localhost:4000/api/v1` | 4000 | – | `npm run dev` | **NO** from this project. Running the web backend is outside our remit. |

**Sources**
- `Production-Build/docs/DEPLOYMENT-GUIDE.md:31-38`
- `web.config`, `web.config.uat`, `frontend/public/web.config`
- `ecosystem.config.js`
- `backend/src/config/index.ts`

**Caveats the mobile team must know**
- All three environments run on **one VM, one PostgreSQL server** (schemas `public` = prod, `uat`, `qa`) and **one Memurai/Redis** on `localhost:6379` (`DEPLOYMENT-GUIDE.md:37-38`).
  - Heavy UAT testing, such as load tests or polling loops, consumes **production hardware**. Keep polling intervals conservative even on UAT.
- `frontend/public/web.config` points at `:4002`. Every web build therefore ships a QA-targeted rewrite unless it is replaced at deploy time. This is a web-team concern, recorded here only for context.
- We do not know which login methods UAT has enabled (`LOCAL_AUTH_ENABLED`, LDAP or SSO). See BLOCKERS B3.
  - If UAT is SSO-only like production, **A2** is needed even for development.
- **Base URL in the app:**
  - Configure it per build profile, e.g. `EXPO_PUBLIC_API_BASE_URL`.
  - Development and preview profiles must be hard-wired to UAT.
  - The production profile must not exist until Ronit approves.

---

## 4. How to use these docs

| File | What it gives you | Use it when |
|---|---|---|
| `../../CLAUDE.md` | Guardrails and safety rules | Start of every session |
| `01-API-CONTRACT.md` | Full spec of every endpoint the mobile app may call: params, bodies, responses, errors, pagination, source lines. Out-of-scope routes are listed in an appendix | Before writing or changing **any** API call. If an endpoint isn't there, stop and ask Ronit |
| `02-AUTH.md` | How web auth works, why it fails on React Native, the Bearer fallback, the two candidate solutions, and token/401 handling for Axios + SecureStore | Building login, logout, the API client or session handling |
| `03-DATA-MODEL.md` | Fields, enums and relations for the models mobile touches, plus copy-ready TypeScript interfaces matching **API responses** | Writing `src/types/`, rendering fields, building pickers |
| `04-SCREEN-MAP.md` | Web screen → mobile screen map, MVP / Phase 2 / out of scope, endpoints per screen | Planning or building a screen |
| `05-RULES-AND-GAPS.md` | §A: frontend-only rules mobile must copy. §B: backend bugs and our workarounds. §C: security findings (report only) | Implementing status changes, closure, create-ticket validation, SLA display; any time behaviour looks wrong |
| `06-BACKEND-ASKS.md` | The 18 requests to the backend team, sorted blocking-first | Checking whether a workaround can be removed, or what is blocking |

**Conventions in all docs**
- File references are `path:line`. Unless stated otherwise, paths are relative to `backend/src/` (backend) or `frontend/src/` (web frontend) in the web repo.
- Line numbers are as of web commit `d7f3887` (`master`, 2026-10-09) and will drift; search for the quoted symbol if a line has moved.
- "⚠" marks a defect or trap. "VERIFY" marks something that could not be confirmed without a live system.

---

## BLOCKERS (steps not performed — Ronit decides)

These steps would have needed a write outside the allowed paths, a state change, a database connection, or access to a live server. **None of them were run.**

| # | Exact command I would have run | Why it was needed | Why it was not run |
|---|---|---|---|
| B1 | `git -C "C:\Users\Ronit Chaudhari\Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform" status` | Prove the web repo is unchanged, and pin the docs to a commit | The folder is **not a git repository**. I took a SHA-256 fingerprint of all 835 files before and after writing these docs instead; the terminal summary reports whether they match. Ronit: tell us where the real repo with history lives, so the docs can be pinned to a commit hash. **RESOLVED 2026-10-14:** that finding described the old ZIP extract. The path above is now a real git clone; the extract matched `master` @ `a7c9f90`, and the docs are pinned to `master` @ `d7f3887` (`07-DRIFT-CHECK.md` §1). |
| B2 | `npx prisma db pull --print` against the UAT `DATABASE_URL` | Confirm the live schema matches `schema.prisma`. In particular, confirm the raw-SQL columns `users.mustChangePassword`, `tickets.lastRequesterReplyAt`, `comments.toRecipients/ccRecipients` that `03-DATA-MODEL.md` relies on | Needs a DB connection (R2) |
| B3 | `Select-String -Path "C:\inetpub\servicedesk-uat\backend\.env" -Pattern "^(LOCAL_AUTH_ENABLED\|AZURE_AD_CLIENT_ID\|LDAP_URL\|TRIAGE_USER_EMAILS\|REDIS_URL\|SESSION_TTL_HOURS\|TEST_AUTH_SECRET)="` on the VM (then the same for PROD) | Learn which login methods UAT has, the triage list, the session TTL, and whether the environments share a Redis DB index. Values would be redacted | Needs server access, and the file holds secrets |
| B4 | `curl -s -H "Authorization: Bearer <uat-token>" https://uat-servicedesk.mountmerugroup.com/api/v1/auth/me` and `.../tickets/<id>/attachments/<aid>/view` | Prove Bearer auth works end to end through IIS/ARR, which might strip `Authorization` | Needs a real session token (a login creates server-side state) and live network calls |
| B5 | On the VM: `pm2 list` and `nssm status ServiceDesk` / `ServiceDesk-UAT` | Settle PM2 vs NSSM. This matters for the 03:00 forced restart and for log locations | Needs server access |
| B6 | `%windir%\system32\inetsrv\appcmd list config "<UAT site>" -section:requestFiltering` | Confirm the IIS upload limit (default ~28.6 MB) against the app's 50 MB. Sets the mobile client-side file-size cap | Needs server access |
| B7 | `redis-cli -h localhost -p 6379 INFO keyspace` on the VM | Confirm whether PROD, UAT and QA share one Redis DB. If they do, a `session:<token>` minted on UAT could pass the Redis fast path on PROD (`05` §C, VERIFY item) | Needs a Redis connection (R2 spirit) and server access |
| B8 | (none run) Entra admin centre: create the public-client app registration for A2 | Needed before any SSO work can start | A state change in the company tenant; IT/Ronit decision |
