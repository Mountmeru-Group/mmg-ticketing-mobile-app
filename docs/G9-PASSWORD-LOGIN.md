# G9: email and password sign-in for a Google Play reviewer (first read 2026-11-04; re-read and built 2026-11-05)

**What this is.** Can the app sign in with an email and a password? Each brief asked for the answer to come from the web repo (read-only) before anything was built, and every statement here has a source.
- **The source still has no such endpoint** (the sections from "What changed since the last read" on).
- **Later on 2026-11-05,** Ronit confirmed with the backend team that one **is deployed on UAT**, with its source not pushed.
- So the form was **built defensively, on UAT builds only, against an ⚠ ASSUMED contract.** The next section has what was built and what still needs confirming.
- Ask **A32** (`docs/web-system/06-BACKEND-ASKS.md`) stays open, narrowed to "send us the contract, and push the source".
- The Login footer's year (first G9 brief, Part 1) is in §8.

## Built on 2026-11-05: defensively, against an ASSUMED contract (third G9 brief)

**The clone was re-cloned at 09:56 that morning, and still has no such endpoint.** Checked read-only before this section was written:
- **The fresh clone:** `master` is `7df97c8` (2026-11-05, "Merge pull request #14 from Mountmeru-Group/feature/setu-redesign"), with 15 refs, the new `origin/feature/setu-redesign` (`8f30fdf`) among them.
- **What PR #14 changes** under `backend/src`: 14 files, none under `modules/auth` or `middleware`. They are push notifications, a bot, AI, the audit log, reports, SLA and tickets.
- **The auth router** declares the same seven routes. The only JSON body carrying a token is still `test-login`'s (`auth.controller.ts:96`).
- **On no ref, and in no commit** (`git log --all --no-textconv -S`), is there `auth/mobile`, `mobile/login`, `login/mobile` or `microsoft/mobile`.
- **Not even AUTH-P2** is in the source.
- **Untouched by this work:** no file in the clone is newer than its 09:56:07 index.

**Why "defensively".** The endpoint is on UAT, but no readable contract exists. The last assumed auth contract cost a rebuild: the app required `displayName`, and the server sent `name`. So the app accepts several plausible shapes instead of one guess. Full design: `docs/web-system/02-AUTH.md` §8. The contract as assumed: `docs/web-system/01-API-CONTRACT.md` AUTH-P1.

**What was built**

| Part | What | Where |
|---|---|---|
| Request | `{ username, email, password }`, the same input under both names. Four paths, in order: `/auth/mobile/login`, `/auth/login/mobile`, `/auth/mobile`, `/auth/login`. The next only after a 404 with an HTML body. The answering path is remembered for the run of the app, and one `[auth]` debug line is logged per answer | `src/api/auth.api.ts` `signInWithPassword()`; `src/types/mobile-password-contract.ts` |
| Response | **The same `readSession()` as Microsoft sign-in**, with per-endpoint options. Required: a token (`token` / `accessToken` / `sessionToken`), `user.id`, `user.role`. Name: `name` / `displayName` / `fullName`, else the email. Expiry: `expiresAt` / `expires_at` / `expiry`, unused (8-hour clock). Unknown fields are never read. Drift is logged through the existing mechanism | `src/api/auth.api.ts`; `src/api/responseSpecs.ts`; `src/api/drift.ts` `reportDrift()` |
| `countryId` | A string or `null` is kept as sent. **Missing:** AUTH-2 `GET /auth/me` with the new token supplies it, or the sign-in is **refused** and the session ended (AUTH-3). A missing one never makes an AGENT a triage agent | `confirmFromAuthMe()` |
| Session | `setSession()`, exactly as after Microsoft: same store, same 8-hour rule. `fullAuthAt = now` on every password sign-in, because a password is a full credential check; without it, the next cold start would sign the person out. **Ronit to confirm** | `src/screens/auth/signInAttempt.ts` `attemptPasswordSignIn()` |
| Screen | Below the unchanged pill: OR divider, "Sign in with email instead" with a chevron. The fields open in place (opacity and translateY on the native driver, at once under "Remove animations"). Email keyboard; masked password with a show/hide toggle (`aria-label`); 52 dp brand-red "Sign in". The keyboard never covers "Sign in" (`KeyboardAvoidingView`, plus a scroll to the end when the keyboard opens or the content grows) | `src/screens/auth/EmailSignInForm.tsx`; `LoginScreen.tsx`; tokens in `src/theme/` |
| Builds | **UAT only:** `EMAIL_SIGN_IN_ENABLED = APP_ENV === 'UAT'`. A production build does not render it. The code is still in the production bundle, behind that flag | `src/config/env.ts` |
| Errors | 400, 401, 403, other 4xx, 429, 5xx, none of the paths exists, no token, bad body, `countryId` unconfirmed, network, storage: each has its own message. **Never which field was wrong:** a server message naming one field is replaced | `PASSWORD_FAILURE_COPY`, `neutralCredentialMessage()` |
| Password | Component state only. Sent in the sign-in request and nowhere else. Cleared on success, on failure and on unmount. Never logged, stored or put into an error | `EmailSignInForm.tsx` |
| Tests | `tests/auth/password-sign-in.test.mjs`, 108 new tests. Existing guards updated for the new premise: two ways in (`tests/release/production-readiness.test.mjs`); nine animating files, plus the env import and the UAT-only flag (`tests/motion/start-up-and-login.test.mjs`). `npm test`: 1205 pass, 0 fail | |

**Unchanged:** the Microsoft sign-in flow (`signInWithMicrosoft()`, `exchangeMicrosoftIdToken()`'s reader options are exactly its old fields), `SignInButton.tsx`, `auth.config.ts`, the Entra config, `eas.json` and the production profile, the 15-day rule, and the 8-hour rule. `tests/auth/mobile-sso.test.mjs` and `tests/auth/reauth.test.mjs` are untouched and pass.

**Still to confirm** (`02-AUTH.md` §8.7 has the full list)
1. Which path answers on UAT, which request key it reads, and which response keys it sends, `countryId` included.
2. Whether it sets a cookie, its rate limit, and its error statuses and messages. In particular: do an unknown email and a wrong password get the same answer?
3. Which accounts may use it (A32 proposed an allow-list).
4. The 15-day clock after a password sign-in (`fullAuthAt = now`).
5. PROD: the option stays off there until A32 ships on PROD and Ronit says so.
6. **On a device** (no build was run): the reveal, the keyboard keeping "Sign in" visible on a 360 dp phone at 100 %, 130 % and 200 % text, and TalkBack on the toggle.

**How to learn the real contract on the device** (`02-AUTH.md` §8.8). Sign in with email once against UAT, then read the lines:
- **Development build:** in Metro, the `[auth] email sign-in: …` lines give the answering path, the status and the key names. `[API drift] AUTH-P1 …` lines name any optional field that is missing or of another type.
- **`preview` APK:** `adb logcat -s ReactNativeJS:V` shows the same `[auth]` lines. Any failure box's Ref line also reads `<reason> · HTTP <status> · <path>`.

---

## What changed since the last read: nothing

The 2026-11-05 brief said the clone had been updated and the endpoints were now present. **The clone on disk is the one already read on the morning of 2026-11-05. It has no new commit and no such endpoint.**

**The clone,** `Service Desk Mobile APP\MMG-Ticketing-Platform`
- **When it was made.**
  - Cloned on 2026-11-04 at 16:32: `.git` and every working file carry that time.
  - Fetched from GitHub at 16:36 (`.git/FETCH_HEAD`).
  - **No file in it is newer than `FETCH_HEAD`** (`find . -newer .git/FETCH_HEAD` is empty).
- **What is checked out.**
  - `master` at `d7f3887`, with no local edits and no untracked files (`git status --porcelain --untracked-files=all` is empty).
  - Git's index is still dated 2026-11-04 16:32:53. Nothing has touched the checkout since it was cloned.
- **Every branch is at the commit that fetch wrote.** No new branch, and no new commit on any branch. The four October commits are the ones the first read (2026-11-04, previous clone) named in §2 and Sources.

| Branch | Commit | Last commit |
|---|---|---|
| `master` (checked out) | `d7f3887` | 2026-10-09 |
| `fix/phase0-1-security` | `cb7b074` | 2026-10-28 |
| `setu-changes-oct-2026` | `8aaf522` | 2026-10-28 |
| `features-enhancement-oct` | `7d65310` | 2026-10-28 |
| `ui/compact-dashboard` | `04efd64` | 2026-10-28 |
| `uat-local-features` | `49b7d97` | 2026-10-07 |
| `claude/manifest-auth-errors-pqil6p` | `7aebd47` | 2026-09-08 |
| `dashboard-improvements` | `925066e` | 2026-07-21 |
| `feature/sow-gaps` | `71c8513` | 2026-04-09 |
| `claude/adoring-booth` | `cb4f3db` | 2026-04-09 |
| `feat/manageengine-parity-modules` | `94e0bb7` | 2026-04-04 |
| `feature/uat-bugfixes-observations` | `97f27ca` | 2026-03-24 |
| `fix/code-review-security-and-quality` | `acc8413` | 2026-03-17 |

- **Auth files changed: none.**
  - With no new commit, no file can have changed.
  - `git diff master <branch> -- backend/src/modules/auth/auth.service.ts backend/src/app.ts` is empty for `fix/phase0-1-security`, `setu-changes-oct-2026` and `features-enhancement-oct`.
  - Their `auth.controller.ts` differs from `master` only by the `test-login` gate (§2).
- **The searches were re-run on 2026-11-05, on all 13 branch tips plus local `master`.**
  - The only JSON body under `backend/src` that carries a `token` is still `test-login`'s, `res.json({ user: userPayload, token })`. It is at `auth.controller.ts:96`, and at `:105` on `fix/phase0-1-security`, `setu-changes-oct-2026` and `features-enhancement-oct`.
  - The auth router declares the same seven routes on every ref: `/login`, `/test-login` (9 of the 14 refs), `/logout`, `/me`, `/microsoft`, `/microsoft/callback`, `/config`.
  - No file on any ref mentions `auth/mobile`, `mobile/login`, `microsoft/mobile`, `mobileLogin`, `loginMobile` or a `MOBILE_PASSWORD` / `MOBILE_LOGIN` / `MOBILE_AUTH` flag.
  - `git log --all --no-textconv -S` finds no commit, ever, that added or removed `mobile/login`, `auth/mobile`, `microsoft/mobile` or `mobileLogin`.

**Other backends on this machine.** The home folder was searched for every `auth.controller.ts` and `auth.router.ts` outside `node_modules`.

| Folder | What it is | Auth routes | Token in a JSON body |
|---|---|---|---|
| `Desktop\Service Desk Mobile APP\MMG-Ticketing-Platform` | **The clone the brief names.** Everything above | The seven above | `test-login` only |
| `Desktop\Service Desk Web Clone` | An **older** copy: files dated 2026-10-09, no `.git` | The same seven | `test-login` only (`auth.controller.ts:96`) |
| `Desktop\Mamastops service Desk Mobile App\Mamastops-ServiceDesk` | **A different product:** `Mountmeru-Group/Mamastops-ServiceDesk`, HEAD `d38d197` (2026-10-20) | The same seven | `test-login` only (`:96`) |
| `Desktop\Service Desk Mobile APP\IOS MMG` | A copy of this mobile app, not a backend | n/a | n/a |

**So where could the endpoint be?**
- AUTH-P2 (`POST /auth/microsoft/mobile`) has run on UAT since 2026-10-20 (`docs/web-system/02-AUTH.md` §7.5), yet it is on **no** branch of `Mountmeru-Group/MMG-Ticketing-Platform`.
  - So the backend team deploys code they have not pushed.
  - If they have now built a password endpoint, it is most likely in that same unpushed place.
- **Ask them for the branch name, or for the contract in writing,** as they gave AUTH-P2's on 2026-10-19. Then pull it into the clone and re-run this read.

## The brief's six questions, from the current source

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Every endpoint that authenticates an email and a password | **One: `POST /api/v1/auth/login`.**<br>Request body `{ username: string, password: string }`, both `z.string().min(1)`. The field is **`username`, not `email`**. On the local path, a username without `@` becomes `<username>@dev.local`.<br>Response body `{ user: { id: string, email: string, displayName: string, role: UserRole } }` | `BE:modules/auth/auth.controller.ts@master:9-12, 22-44`; `auth.router.ts:7`; `auth.service.ts:107, 126, 167` |
| 2 | Token in the JSON body, or a cookie? | **Cookie only.** The handler runs `res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);` and then `return res.json({ user: result.user });`. The cookie is `sd_session`, `httpOnly` | `auth.controller.ts@master:43-44`, and the same lines on `fix/phase0-1-security` (§1) |
| 3 | Errors | **400** `{ error: 'Username and password are required' }`: the body failed the schema.<br>**401** `{ error: <thrown message> }`: every failure.<ul><li>Local path: `'Invalid credentials'` for an unknown email **and** for a wrong password, so it does not tell which. Also `'Account is deactivated'`.</li><li>LDAP path: its own messages. One of them, `'User not found in Active Directory'`, does reveal an unknown user (`05` C.23).</li></ul>**429** from the limiter (row 4) | `auth.controller.ts@master:25, 45-47`; `auth.service.ts@master:129-140` |
| 4 | Rate limiting | `express-rate-limit`: **20 requests per 15 minutes per client IP** (`keyGenerator: getClientIp`). It answers with the default status 429 and the body `{ error: 'Too many login attempts. Try again in 15 minutes.' }`. It applies to `/auth/login` only, not `/auth/config` or `/auth/me` | `BE:app.ts@master:87-92, 122` |
| 5 | `GET /auth/config` | `{ microsoftEnabled: msal !== null, localAuthEnabled: LOCAL_AUTH_ENABLED === 'true' \|\| REDIS_URL === 'redis://mock' \|\| NODE_ENV === 'development' }`. Unchanged.<br>**PROD: `localAuthEnabled` is `false`.** The tracked `.env.production@master` sets `NODE_ENV=production` (`:7`) and a real `REDIS_URL` (`:14`), and has no `LOCAL_AUTH_ENABLED` and no `LDAP_*`.<br>**UAT: unknown from the source.** No ref tracks a UAT env file, and no tracked env file on any ref sets `LOCAL_AUTH_ENABLED` | `auth.controller.ts@master:226-232` (`@phase0-1:235-241`); §4 |
| 6 | Does the response's `user` match `AuthUser`? | **No: the same class of mismatch as SSO, in reverse.** Field by field below | `src/types/user.ts:7-10`; `src/api/auth.api.ts:342-373` |

**Question 5: a one-line check would settle UAT.** It is an unauthenticated GET and was not run, because the brief asked for the source: `curl -s https://uat-servicedesk.mountmerugroup.com/api/v1/auth/config`. Even `localAuthEnabled: true` would change nothing here. It would still mean a token in a cookie (row 2).

### The `user` object, field by field

- `POST /auth/login` returns what `loginWithLocal()` or `loginWithLdap()` returns. Both return `{ id, email, displayName, role }` (`auth.service.ts@master:107, 167`).
- The app reads a session through `readSession()` and `readUser()` (`src/api/auth.api.ts:342-400`). These were built for AUTH-P2's body (`src/types/mobile-sso-contract.ts`).

| `AuthUser` field (`src/types/user.ts:7-10`) | `/auth/login` sends | AUTH-P2 sends (what `readUser` reads) | If `readUser()` were handed `/auth/login`'s body |
|---|---|---|---|
| `id: UUID` | `id` | `id` | Matches |
| `email: string` | `email` | `email` | Matches |
| `displayName: string` | **`displayName`** | **`name`** | **Mismatch.** `readUser` reads `user.name` (`:361`), finds none, and shows the email instead (`:367`) |
| `role: UserRole` | `role` (the same Prisma enum) | `role` | Matches |
| `ldapSamAccount: string \| null` | **absent** | `ldapSamAccount` | Falls back to `null` (`:368`). Harmless |
| `countryId: string \| null` | **absent** | `countryId` | Falls back to `null` (`:370`). **An AGENT then reads as a triage agent in the UI** (`05` §A.12). The server still scopes the data from its Redis copy, which does hold `countryId` (`auth.service.ts:151-158`) |
| (session) `token` | **absent from the body** | `token` | **Sign-in refused:** `token` is required (`:377`) |
| (session) `expiresAt` | **absent** | `expiresAt` | **Sign-in refused:** required |

- **It is the SSO mismatch turned round.**
  - AUTH-P2 sends `name` where `AuthUser` says `displayName`.
  - `/auth/login` sends `displayName`, as `AuthUser` does. But the app's one reader looks for `name`.
- **The trap for A32.**
  - Suppose the backend team adds a token to a password route and returns `loginWithLocal()`'s `user` as it stands.
  - The app would **accept** it: both fields are optional.
  - But it would show the email in place of the person's name, and it would lose `countryId`.
  - A32 already asks for AUTH-P2's exact body. On 2026-11-05 a line was added to A32 naming `loginWithLocal()`'s return value as the thing **not** to send.

## Build profiles (2026-11-05 brief, Part 2): checked and left unchanged

| Profile | Environment | Distribution | Source |
|---|---|---|---|
| Development (`npx expo start`, any `__DEV__` build) | UAT. A development build refuses PROD and throws at start-up | n/a: local only | `src/config/env.ts:21-24` |
| `preview` | UAT (`EXPO_PUBLIC_APP_ENV=UAT`) | `internal`, APK | `eas.json`, profile `preview` |
| `production` | PROD (`EXPO_PUBLIC_APP_ENV=PROD`), **not touched** | `store`, AAB | `eas.json`, profile `production` |

- `eas.json` has no separate `development` profile. Any build that does not ask for PROD resolves to UAT (`src/config/env.ts:21`).
- The build guard refuses PROD on any profile but `production` (`scripts/eas-build-guard.js:32-35`).

## So the second brief's STOP applied (superseded later the same day)

> **Superseded on 2026-11-05.** The backend team confirmed the endpoint is deployed on UAT, so the third brief had the form built against an ASSUMED contract (top of this file). This section is kept as the record of what the source showed.

- **The email form was not built.** No endpoint in the source returns a token in a JSON body for an email and a password. A form would greet every user, the Play reviewer included, with a failure.
- **Untouched:** `LoginScreen`, `SignInButton`, `signInAttempt`, `auth.api.ts`, `auth.store.ts`, `auth.config.ts`, `eas.json` and the SSO flow. Parts 3 and 4 of the brief did not run.
- **What unblocks it:** the backend team's branch, or their contract in writing (above). When the endpoint is in the clone, re-run this read and build to what it says.

---

**Sources**
- Web repo clone `MMG-Ticketing-Platform`, read-only. It was byte-for-byte unchanged before and after each read (§9).
  - Read through `git show <ref>:<path>` and `git grep <pattern> <refs>`, with `--no-optional-locks` so that git did not even refresh its index. No checkout, no fetch.
  - `master` HEAD is `d7f3887` (2026-10-09).
  - It is a fresh clone of 2026-11-04 16:32, fetched at **2026-11-04 16:36** (the time on `.git/FETCH_HEAD`). Nothing pushed after that is seen here.
  - §1 to §7 were first read on 2026-11-04 from the previous clone, fetched 2026-11-02 16:38. The fresh clone has the same commits on every branch (above), so every line number below still holds.
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
  - So UAT runs backend code that was never pushed to these branches, or was pushed after 2026-11-04 16:36 (the fresh clone's fetch).
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
| **2026-11-05 re-read** | **Built: nothing.** The STOP applies (top of this file). **Docs:** the top of this file was rewritten, §2, §9 and Sources were brought up to date, and A32 in `06-BACKEND-ASKS.md` gained one line on the `user` shape. **Web repo:** read-only. Path, size and modification time of every file, `.git` included, were hashed after the reads and before any write, and again at the end: `1C2104AF…1CFC`, 871 files (840 outside `.git`), both times. That hash cannot be compared with the 2026-11-04 one, which came from the previous clone. The two other backends (top) were only grepped. **Not run:** no EAS build, no database, no `npm`; neither UAT nor PROD was called; nothing committed |

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
