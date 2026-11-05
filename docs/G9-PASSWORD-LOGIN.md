# G9: email and password sign-in for a Google Play reviewer (2026-11-04)

**What this is.** Part 2 of the G9 brief: can the app sign in with an email and a password at all? The brief asked for this to be established from the web repo (read-only) before anything was built. Every statement has a source. **Verdict: no.** No endpoint in the web source turns an email and a password into a token a Bearer client can use. So the form was **not built** (brief Part 3), and the requirement went to the backend team as ask **A32** (`docs/web-system/06-BACKEND-ASKS.md`). Part 1 of the brief, the Login footer's year, is in §8.

**Sources**
- Web repo clone `MMG-Ticketing-Platform`, read-only. It was byte-for-byte unchanged before and after this work (§9).
  - Read through `git show <ref>:<path>` and `git grep <pattern> <refs>`, with `--no-optional-locks` so that git did not even refresh its index. No checkout, no fetch.
  - `master` HEAD is `d7f3887` (2026-10-09).
  - The remote-tracking branches were last fetched on **2026-11-02 16:38** (the time on `.git/FETCH_HEAD`). Nothing pushed after that is seen here.
- Branch notation: `@master` is `d7f3887`. `@phase0-1` is `origin/fix/phase0-1-security` at `cb7b074` (2026-10-28).
- Path prefixes:
  - `BE:` = `backend/src/`
  - `FE:` = `frontend/src/`
  - `src/` = this mobile repo
  - A path without a prefix (`.env.production`) is at the web repo's root.
- R6: no secret value is printed here. Env files were read for which keys are set, never for their values. The only values quoted are non-secret flags and URLs.

---

## 0. The answer in brief

| # | Question | Answer |
|---|---|---|
| 1 | Does `POST /auth/login` return the token in the body? | **No. Only as the httpOnly `sd_session` cookie.** The body is `{ user }` (§1) |
| 2 | Anything changed since `d7f3887`, on any branch? | **Nothing that returns a token.** Across all 13 branches, the only auth change is that `fix/phase0-1-security` gates `test-login` behind `TEST_AUTH_ENABLED` (§2). `setu-changes-oct-2026` and `features-enhancement-oct` carry that same change |
| 3 | Any endpoint that checks email + password and returns a usable token? | **None.** Only two routes check a password, and both go through `POST /auth/login`. The one route that returns a token in a body (`test-login`) checks **no password at all** (§3) |
| 4 | What does `GET /auth/config` report, and does UAT differ from PROD? | It reports `{ microsoftEnabled, localAuthEnabled }`. **PROD**, per the tracked `.env.production`: `true` / `false`. **UAT: not in the source on any branch, so unknown** (§4) |
| 5 | Is local password auth off on production? | **Yes, by absence.** There is no "disable" flag. Local auth is opt-in through `LOCAL_AUTH_ENABLED=true` (or dev settings), and the tracked production env has none of them. The fallback, LDAP, has no server configured there either, so every password login on PROD fails with 401 (§5) |
| 6 | `test-login` (`TEST_AUTH_ENABLED`): what is it, and could it serve? | An **impersonation** route for Selenium: give it any email plus the server's shared secret, and it returns that user's session token. **Not appropriate for a production app, and not used** (§6) |

**One fact that shapes the ask:** a Google Play reviewer installs the **production** AAB, and that build always talks to **PROD**, never UAT (§7).

---

## 1. `POST /api/v1/auth/login`: the token is only in a cookie

`BE:modules/auth/auth.controller.ts@master`:

```ts
22  export async function login(req: Request, res: Response) {
23    const parsed = loginSchema.safeParse(req.body);
24    if (!parsed.success) {
25      return res.status(400).json({ error: 'Username and password are required' });
26    }
...
33    const useLocalAuth = process.env.LOCAL_AUTH_ENABLED === 'true' || config.redis.url === 'redis://mock' || config.nodeEnv === 'development';
...
37      if (useLocalAuth) {
38        const email = username.includes('@') ? username : `${username}@dev.local`;
39        result = await loginWithLocal(email, password, ipAddress, userAgent);
40      } else {
41        result = await loginWithLdap(username, password, ipAddress, userAgent);
42      }
43      res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);
44      return res.json({ user: result.user });
45    } catch (err) {
46      const message = err instanceof Error ? err.message : 'Authentication failed';
47      return res.status(401).json({ error: message });
```

- **The token goes into the cookie only** (`:43`). The body is `{ user }` (`:44`).
  - `result` does hold the token (`BE:modules/auth/auth.service.ts@master:107` LDAP, `:167` local). The controller just never puts it in the body.
- The cookie is `sd_session` (`:14`), and it is `httpOnly: true` (`:15-20`).
- **The body is `{ username, password }`, not `{ email, … }`.** Both are `z.string().min(1)` (`:9-12`).
  - On the local path, a username without `@` becomes `<username>@dev.local` (`:38`).
- **Every failure is 401 with the raw thrown message** (`:45-47`).
  - The local path's messages are `'Invalid credentials'` for an unknown email or a wrong password alike (`auth.service.ts@master:129-136`), and `'Account is deactivated'` (`:138-140`).
  - So the local path does not reveal which of the two was wrong. The LDAP path does (`'User not found in Active Directory'`, `:32-35`; already finding C.23 in `05`).
- **Rate limit:** 20 requests per 15 minutes per IP, answered with `{ error: 'Too many login attempts. Try again in 15 minutes.' }` (`BE:app.ts@master:87-92`, applied to this route at `:122`).
- **Same code on `@phase0-1`:** the login handler is identical, `:22-49` (§2).

**Why a cookie is a dead end for the app.** React Native cannot read an `httpOnly` cookie. And a cookie left in the native cookie jar **overrides** the Bearer header on every later request, because the middleware reads the cookie first (`BE:middleware/auth.middleware.ts@master:7`; `02-AUTH.md` §2 #1 and #5). Parsing `Set-Cookie` is forbidden outright (`02-AUTH.md` §6; `CLAUDE.md` rule 5).

---

## 2. Changes since `d7f3887`, every branch

- **How every branch was checked**
  - Branches with commits that `master` lacks: `git merge-base --is-ancestor` and `git rev-list --count master..<branch>`.
  - The auth files on each of them: `git diff <merge-base> <branch> -- BE:modules/auth BE:app.ts BE:middleware/auth.middleware.ts BE:config/index.ts`.
- **Branches.** There are 13 remote branches. Six are ancestors of `master` and add nothing. Seven have commits that `master` lacks:

| Branch | Commits not in `master` | Auth-relevant change |
|---|---|---|
| `fix/phase0-1-security` | 1: `cb7b074` (2026-10-28) | **`test-login` gated by `TEST_AUTH_ENABLED`**, plus a constant-time secret compare (`auth.controller.ts@phase0-1:68-81`). Nothing else under `BE:modules/auth`, `BE:app.ts` or the auth middleware |
| `setu-changes-oct-2026` | 13 (to 2026-10-28) | **Only that same change**, carried in by merge `ba4a8fb`. The other 12 commits are presentation (dashboard, layout, ticket detail). Its auth files are identical to `@phase0-1` (`git diff` empty) |
| `features-enhancement-oct` | 18 (to 2026-10-28) | Only that same change. Auth files identical to `@phase0-1` |
| `ui/compact-dashboard` | 8 (2026-10-28) | None |
| `claude/manifest-auth-errors-pqil6p` | 6 (2026-09-08) | **The Microsoft callback's error classification only:** `classifyOauthError()`, hints in the log, `?error=<code>` on redirect. Nothing about passwords or tokens |
| `uat-local-features` | 3 (merge commits) | None |
| `feature/uat-bugfixes-observations` | 1 (2026-03-24) | None |

- **History, all refs** (`git log --all --no-textconv -S<text>`):
  - **No commit, ever,** added or removed `auth/mobile`, `microsoft/mobile`, `mobile/login` or `X-Client`.
  - `TEST_AUTH_ENABLED` appears only in `cb7b074`.
- **The clone lags UAT.** AUTH-P2 (`POST /auth/microsoft/mobile`) is deployed on UAT (`docs/web-system/02-AUTH.md` §7.5), but **no branch here contains it** (the grep in §3 finds no such route).
  - So UAT runs backend code that was never pushed to these branches, or was pushed after 2026-11-02 16:38.
  - **"Not in the source" therefore means "not in the source we can see".** Under R1 the clone was not fetched. The backend team's answer to A32 is the authority (§10).

---

## 3. Any endpoint that checks email + password and returns a usable token?

**None.** Searched at every branch tip with `git grep <pattern> <every ref>`:

- **Password checks.** `bcrypt.compare` exists only inside `loginWithLocal` (`BE:modules/auth/auth.service.ts@master:133`).
  - `loginWithLocal` and `loginWithLdap` are each called from one place only: the `POST /auth/login` handler (`BE:modules/auth/auth.controller.ts@master:39, 41`).
  - So every path that checks a password ends in §1's cookie.
- **Tokens in a body.** The only JSON response that carries a `token` is `test-login`'s, `res.json({ user: userPayload, token })`.
  - It is at `auth.controller.ts@master:96`, and at `:105` on `@phase0-1`, `setu-changes-oct-2026` and `features-enhancement-oct`.
  - It checks no password (§6).
- **Routes with "login" in the path**, every file of every branch tip:
  - `POST /api/v1/auth/login`: `BE:app.ts:122` (limiter), `BE:modules/auth/auth.router.ts:7`.
  - `POST /api/v1/auth/test-login`: `BE:app.ts:117`, `auth.router.ts:8`.
  - The stale compiled copy `backend/dist_old/modules/auth/auth.router.js:7`.
  - Nothing else.
- **The auth router lists every auth route**, and none returns a token for a password (`auth.router.ts@master:7-15`, identical on `@phase0-1`):
  - `/login`, `/test-login`, `/logout`, `/me`, `/microsoft`, `/microsoft/callback`, `/config`.
- **`POST /users/change-password`** takes a password but returns no token, and needs a session first (`01-API-CONTRACT.md` USR-4).

---

## 4. `GET /api/v1/auth/config`

```ts
// BE:modules/auth/auth.controller.ts@master:226-232 (the same at @phase0-1:235-241)
export function authConfig(_req: Request, res: Response) {
  const msal = getMsalInstance();
  return res.json({
    microsoftEnabled: msal !== null,
    localAuthEnabled: process.env.LOCAL_AUTH_ENABLED === 'true' || config.redis.url === 'redis://mock' || config.nodeEnv === 'development',
  });
}
```

**What the two flags mean**
- `microsoftEnabled` is true when the **web** app registration's client ID, **client secret** and tenant ID are all set (`BE:modules/auth/msal.config.ts:7-10`).
  - It says nothing about the mobile SSO (AUTH-P2), which needs no secret.
- `localAuthEnabled` uses the very expression that picks the login backend (`auth.controller.ts@master:33`).
  - It is true exactly when `POST /auth/login` checks a bcrypt password instead of LDAP.
  - It does **not** mean "a token is available": the answer is a cookie either way (§1).
- The web login page shows its username/password form only when `localAuthEnabled` is true (`FE:pages/auth/LoginPage.tsx@master:40-42, 119, 133`).
  - If `/auth/config` itself fails, the web page shows the form anyway (`:43-45`).

**PROD.** Read from the tracked `.env.production@master`:

| Key | Line | Effect |
|---|---|---|
| `NODE_ENV=production` | `:7` | not development |
| `REDIS_URL` | `:14` | set to a real Redis, not `redis://mock` |
| `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | `:22-24` | all set [REDACTED - present in .env.production] |
| `LOCAL_AUTH_ENABLED` | none | not present |
| `LDAP_*` | none | not present |

- So PROD reports **`{ "microsoftEnabled": true, "localAuthEnabled": false }`**.
- **Caveat:** this is the file as committed at `d7f3887`. `cb7b074` stops tracking it ("Stop tracking root `.env.production` (kept on disk)", commit message). After that merges, PROD's configuration is no longer in the source at all.

**UAT: unknown from source.**
- No branch tracks a UAT env file. The env-style files on every branch are `.env.example`, `.env.production`, `.env.production.example`, `.env.windows.example`, `frontend/.env.*` and `tests/api-agent/.env.example`.
- None of them sets `LOCAL_AUTH_ENABLED`.
- This is open BLOCKER B3 (`docs/web-system/00-OVERVIEW.md:117`). It needs the UAT server's `.env`.
- **A one-line check would settle it.** It is an unauthenticated GET and was not run: the brief asked for the source, and it does not change the verdict.
  - Command: `curl -s https://uat-servicedesk.mountmerugroup.com/api/v1/auth/config`.
  - It cannot change the verdict because `localAuthEnabled: true` would still mean "token in a cookie" (§1).

---

## 5. Is local password auth off on production?

**Yes, but there is no "disabled" flag to quote: local auth is opt-in.**

**What turns it on.** It is on only when one of these holds (`BE:modules/auth/auth.controller.ts@master:33`):
- `LOCAL_AUTH_ENABLED === 'true'`;
- `REDIS_URL === 'redis://mock'`;
- `NODE_ENV === 'development'`.

**Why it is off on PROD.** The tracked production env meets none of the three (§4: `:7`, `:14`, no `LOCAL_AUTH_ENABLED`). So `POST /auth/login` takes the **LDAP** branch (`:40-41`).
- **LDAP is not configured there either.** `.env.production@master` has no `LDAP_*` key.
  - `config.ldap.url` then defaults to `''` (`BE:config/index.ts:26-32`).
  - The server starts anyway, because LDAP settings are required only when Azure is **not** configured (`:56-60`).
- The LDAP search connects to that empty URL (`BE:modules/auth/auth.service.ts@master:299-305`, `createClient` at `:301`).
- Whatever that throws becomes **401 `{ error: <message> }`** (`auth.controller.ts:45-47`). The exact text was not established: nothing was run (R2, R4).
- **So on PROD every password login fails, for every user.** This matches `02-AUTH.md` §1.3: production is Microsoft SSO only.

**What `LOCAL_AUTH_ENABLED=true` on PROD would and would not do**
- It would switch the **web** `POST /auth/login` from LDAP to bcrypt **for everyone**.
- It would make the web page show its password form to every user (`FE:pages/auth/LoginPage.tsx:119, 133`).
- It would **still** return the token only as a cookie (§1).
- So on its own it does not let the app in, and it widens the web's attack surface. A32 asks for something narrower (§10).

---

## 6. `test-login` and `TEST_AUTH_ENABLED`

**What it is.** An impersonation route for the Selenium suite (`// Test Auth (for automated Selenium tests only)`, `auth.controller.ts@master:67`).

**Where it is mounted.** Twice:
- straight on the app, **before** both rate limiters (`BE:app.ts@master:15-16, 117`; the login limiter is `:122`, the API limiter `:124`);
- and again in the auth router (`auth.router.ts:8`).

**What it does** (`@phase0-1:68-106`; `@master:68-97`)

| Step | `@master` | `@phase0-1` (`cb7b074`) |
|---|---|---|
| Gate | Header `x-test-secret` must equal `TEST_AUTH_SECRET`. A missing secret gives 403 (`:69-72`) | **Also** `TEST_AUTH_ENABLED === 'true'`, and the secret is compared in constant time. Otherwise `403 { error: 'Forbidden' }` (`:72-81`). Comment: "so a forgotten `TEST_AUTH_SECRET` alone can never enable it in production" (`:69-71`) |
| Input | `{ email }`, else `400 { error: 'Email required' }` (`:74-75`) | same (`:83-84`) |
| **Password** | **None. It is never asked for or checked** | **None** |
| User | Any user with that email. `404 { error: 'User not found' }` otherwise (`:82-83`). **No `isActive` check** | same (`:91-92`) |
| Session | A new session row, `userAgent: 'Selenium-Test'`, expiry `SESSION_TTL_HOURS` (`:85-90`) | same (`:94-99`) |
| Redis | `{ id, email, displayName, role }` only (`:92-93`). **No `countryId` or `ldapSamAccount`**, unlike a real login (`auth.service.ts:151-158`) | same (`:101-102`) |
| Answer | **Sets the `sd_session` cookie** (`:95`) **and** returns `{ user, token }` (`:96`) | same (`:104-105`) |

**The default.** The example env on `@phase0-1` ships it off: `TEST_AUTH_ENABLED=false`, with `TEST_AUTH_SECRET=` empty (`.env.example@phase0-1:46-47`). The Selenium helpers carry a default secret [REDACTED - present in tests/api-agent/.env.example, tests/api-agent/agent.js, tests/selenium/helpers/auth.helper.js].

**Could it serve a Google Play reviewer? Technically yes, where it is switched on. Appropriate for a production app? No. Not used, and flagged here as Ronit's decision to make if anyone proposes it.**

1. **It is a skeleton key, not a password check.**
   - The app would have to carry the server-wide secret.
   - Anyone who unpacks the APK gets it, and with it a session as **any** user, ADMIN included.
   - It checks no password, so it signs in deactivated users too (`05` §C.13).
2. **It must be switched on in PROD to help the reviewer**, because the Play build talks to PROD (§7).
   - That means `TEST_AUTH_ENABLED=true` plus a secret on the production server, which reverses the very point of `cb7b074`.
3. **It sets the cookie.** That cookie would override the Bearer header on every later request (`02-AUTH.md` §2 #5): the hazard the app is built to avoid.
4. **It sits outside both rate limiters** (`app.ts:117` comes before `:122` and `:124`), so the secret can be guessed without limit.
5. **Its sessions are thinner** than real ones: no `countryId` (above). An AGENT signed in through it would be scoped differently (`05` §A.12).
6. **This repo forbids it**: `CLAUDE.md` rule 5, `02-AUTH.md` §6, `01-API-CONTRACT.md` §1.5.

---

## 7. Which server a Google Play reviewer reaches

- **Google Play reviews the store AAB.** That is the `production` EAS profile, which sets `EXPO_PUBLIC_APP_ENV=PROD` (`eas.json`, profile `production`).
- **The build guard keeps the two apart** (`scripts/eas-build-guard.js:32-35, 51-52`):
  - it refuses a `production` build that does not target PROD;
  - it refuses PROD on any other profile.
- **So the reviewer's app talks to `https://servicedesk.mountmerugroup.com/api/v1`** (`src/config/env.ts:15`), never to UAT.
- **The `preview` profile (UAT, `eas.json`) is for testers, not for the store.** A password sign-in that works only on UAT lets testers in. It does not let a Play reviewer in.
- **Today a reviewer could not sign in with Microsoft on PROD either.** AUTH-P2 is not yet confirmed on production (`docs/RELEASE.md:283`, a release blocker). Without it, Microsoft sign-in ends in "App sign-in isn't available yet".

---

## 8. Part 1: the footer's year

**The premise did not hold**
- The Login footer read **"Mount Meru Group IT"** (`src/screens/auth/LoginScreen.tsx:176` before this change). It had no year and no copyright line.
- That is exactly what the approved design specifies (`docs/brand/UI-STANDARDS.md` §10.1).
- `git log --all -S"copyright"` and `-S"© 2026"` find no commit, ever. The text "copyright © 2026 Mount Meru Group" has never been in this repo.

**What changed.** The footer now reads **"Copyright © <year> Mount Meru Group"**: the brief's wording, with the year never written into the source.
- **The year** is the device's local calendar year, `Date#getFullYear()` (`src/utils/copyright.ts`).
- **It is read** on first render, on focus, and when the app returns to the foreground on Login. That is the Home greeting's pattern (`UI-STANDARDS.md` §9). There is no timer.
- **TalkBack** reads "Copyright 2026 Mount Meru Group". The `©` sign is dropped from the spoken label, because TalkBack would read it as a second "copyright".
- **Unchanged:** the style (12 dp, `text.secondary`) and the position.
- **The wording is new:** "IT" is gone. Ronit to confirm.

**Every hardcoded year or date in `src/`.** Every match of 1900–2099 was classified with the TypeScript parser: comment, string, template, JSX text or number. That is 109 matches in 52 files.

| Where | Count | What | Changed? |
|---|---|---|---|
| **User-facing strings, template text, JSX text** | **0** | None. Now enforced by a test (below) | n/a |
| Code (numbers) | 2 | `src/utils/tasks.ts:60` `if (y < 2000 \|\| y > 2100) return null;` and `:92-93` `DUE_DATE_MIN = new Date(2000, 0, 1)` / `DUE_DATE_MAX = new Date(2100, 11, 31)`. The range a task due date may take. Validation bounds, not text, and they do not go stale | No |
| Comments | 107 | Most are change-log dates (`2026-11-03` and similar) in file headers and notes | No |
| | | Format examples in doc comments, never rendered: `"09 Oct 2026"` (`src/utils/format.ts:23, 31`), `"28 Dec 2025 – 02 Jan 2026"` (`src/utils/dashboard-period.ts:107, 118`), `"Mon 02 Nov 2026"` (`src/utils/audit-log.ts:129`), `"01 Oct 2026"` (`src/utils/ticket-filters.ts:344`), `"12 Oct 2026"` (`src/utils/tasks.ts:97`), `"12 Nov 2027 11:00"` (`src/utils/sla-deadline.ts:34`) | No |
| | | Not years: web source line numbers (`FE:TicketDetailPage.tsx:1934-2008` at `src/utils/format.ts:192`, and the like at `src/utils/permissions.ts:361` and `src/utils/ticket-properties.ts:86, 125`), `U+2013` (`src/types/enums.ts:58`), and "1900–1999" in `src/utils/service-catalog.ts:237` | No |

**The guard.** `tests/login/copyright-year.test.mjs` parses every `.ts` / `.tsx` file in `src/` and fails on any four-digit year (1900–2099) written into text:
- string literals, JSX attribute values included;
- template literal text;
- JSX text;
- a year-like number placed straight into text: `{2026}` in JSX, `${2026}` in a template, `'©' + 2026`.

Comments, and numbers used as numbers, are left alone. Nine positive controls prove it catches each form, and four prove what it ignores.

---

## 9. What was done, and what was not

| | |
|---|---|
| Built | The footer year (§8): `src/utils/copyright.ts`, `src/screens/auth/LoginScreen.tsx`. Tests: `tests/login/copyright-year.test.mjs` (new); `tests/motion/start-up-and-login.test.mjs` (the old footer assertion updated) |
| **Not built** | **The email form** (brief Part 3). No endpoint can serve it (§0), and a form that cannot sign in would greet the reviewer with a failure. `LoginScreen`, `SignInButton`, `signInAttempt`, `auth.api.ts`, `auth.store.ts`, `auth.config.ts`, `eas.json` and the SSO flow are untouched |
| Docs | This file. `06-BACKEND-ASKS.md` gains ask **A32**. `02-AUTH.md` §8, `01-API-CONTRACT.md` §1.4 / §1.5, `05-RULES-AND-GAPS.md` C.13 and `docs/brand/UI-STANDARDS.md` §10.1 / §15 are updated |
| Web repo | Read-only. Every file's path, size and modification time were hashed before and after: `61421ED4…6882`, 882 files, both times. No fetch, no checkout; git ran with `--no-optional-locks` |
| Not run | No EAS build. No database. Neither UAT nor PROD was called |

## 10. What Ronit needs from the backend team

**Ask A32** (`06-BACKEND-ASKS.md`). In short:
- **The endpoint.** A narrow `POST /api/v1/auth/mobile/login` `{ email, password }` that returns the AUTH-P2 body `{ token, expiresAt, user }` with **no cookie**.
  - It checks a bcrypt password only.
  - It is limited to an allow-list of reviewer accounts.
  - It is behind the existing login limiter.
- **Where.** Deployed on **PROD** as well as UAT, because the reviewer's build talks to PROD (§7).
- **A reviewer account** on PROD, with something to look at.
- **AUTH-P2 on PROD.** Its deployment is a release blocker on its own (`docs/RELEASE.md:283`).

**An alternative that needs no new endpoint.**
- IT creates a dedicated **Microsoft (Entra) reviewer account** in the MMG tenant, and Google is given its credentials under Play Console → App content → App access.
- It signs in through the SSO the app already has, so it still needs **AUTH-P2 on PROD**.
- It also needs IT to let that account through **without MFA** (a Conditional Access exclusion), because a reviewer cannot complete MFA.
- That is a tenant security decision, for IT and Ronit.
- Once AUTH-P2 is on PROD, this is likely the fastest route.
