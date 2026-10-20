# 10 — A2 status: does the native Microsoft SSO endpoint exist yet?

> ## Answer (updated 2026-10-20): **YES. RESOLVED.** AUTH-P2 is deployed to UAT
> - `POST https://uat-servicedesk.mountmerugroup.com/api/v1/auth/microsoft/mobile` is live. It answered the app on UAT with **HTTP 200**.
> - The backend team **confirmed the contract on 2026-10-19** (§0.2). The full shape is in `02-AUTH.md` §7.5; the code copy is `src/types/mobile-sso-contract.ts`.
> - The app was changed on 2026-10-20 to accept that contract (§0.3).
> - **Production is not confirmed.**
> - §1–§7 below are the 2026-10-19 investigation, whose answer then was **NO**. They are kept as the record.

---

## 0. Resolution (2026-10-20)

### 0.1 Evidence
- **Backend team's written answer, 2026-10-19**, relayed by Ronit: the request, response and error codes in §0.2.
- **Live:** on UAT the endpoint returned HTTP 200. The app at `7018f85` then showed `unexpected-response · HTTP 200` (reported by Ronit, 2026-10-20).
- **Not re-verified from source.** The local web clone is still at `d7f3887` (2026-10-09) and does not contain the endpoint. It was not fetched, because R1 keeps the web repo strictly read-only. So there are no file or line references for the new handler yet.

### 0.2 Confirmed contract vs the §4.3 proposal

| Item | Proposed (§4.3) | Confirmed (2026-10-19) | Effect on the app |
|---|---|---|---|
| Request | `{ idToken }` | `{ idToken }` | None |
| `token` | UUID string | UUID string | None |
| `expiresAt` | ISO-8601 string | ISO-8601 string | None. Still read but not used (02 §5.4) |
| `user` name field | `displayName` | **`name`** | **This caused the failure.** The app required `user.displayName`. It now maps `name` → `displayName` |
| Other `user` fields | `id, email, role, ldapSamAccount, countryId` | The same, **plus `department` (a string, not `departmentId`) and `phone`** | Accepted, not stored (`AuthUser` has neither) |
| Malformed body | 400 | 400 | `bad-request` (new reason) |
| Bad Microsoft token | 401 | 401 | `token-rejected` |
| Deactivated | 403 | 403 | `account-disabled`, mapped by status |
| No MMG user | Auto-create, no error | Auto-create as END_USER; **no 404** | `no-account` reason and message removed |
| Server error | 500 | 500 | `server` |
| Not configured | 501 | Not listed | Would show `server` |
| Too many attempts | 429, if change #6 is made | Not listed | `rate-limited` kept, in case |

- The failure was first attributed to `department` vs `departmentId`. **The app never read either field.**
  - The pre-fix code, given the confirmed body, fails with `user.displayName: expected string, got undefined`.
  - That was reproduced on 2026-10-20 by running the `7018f85` version of `auth.api.ts` against the confirmed shape.
- **The AUTH-P2 `user` is not the AUTH-2 (`GET /auth/me`) `user`**: it has `name` vs `displayName`, and adds `department` and `phone`. The app keeps the two as separate types (`02-AUTH.md` §7.5).

### 0.3 What changed in the mobile app (2026-10-20; uncommitted, for Ronit's review)
- `src/types/mobile-sso-contract.ts`: the confirmed contract. `MobileSsoUser` is kept separate from `AuthUser`. The assumed-only constants are gone (the 404 "no account" status, the "Not found" catch-all text, the "deactivated" regex).
- `src/api/auth.api.ts` `readSession()`:
  - Only `token`, `expiresAt`, `user.id`, `user.email` and `user.role` can fail sign-in.
  - Every other named field is optional, and drift-logged through `checkFields()` + `MOBILE_SSO_OPTIONAL_SPEC`.
  - Unknown extras are never read.
- `src/api/auth.api.ts` `classifyExchangeFailure()`:
  - 400 → `bad-request`, 401 → `token-rejected`, 403 → `account-disabled`, 500 → `server`.
  - Any 404 or 405 → `endpoint-missing`.
- `src/screens/auth/LoginScreen.tsx`: the `no-account` message is gone, and there is a new `bad-request` message.
- Not touched: the auth flow, PKCE, `auth.config.ts`, Entra settings, the redirect URI, the dev-token screen and its `__DEV__` gate.

### 0.4 Still open
- Production deployment of AUTH-P2.
- Whether `name` vs `displayName` is intentional (`02-AUTH.md` §7.6 #2).
- No `Set-Cookie` on the response: not stated by the backend team.
- Whether the route is rate-limited (§4.1, change #6).
- `06-BACKEND-ASKS.md` still lists A2 as **BLOCKING**. `00-OVERVIEW.md` was not updated either. Both are outside this change; Ronit to decide.

---

All backend paths in §1–§7 are relative to `backend/src/` in the web repo. Line numbers are as of commit `d7f3887`.

---

## 1. Starting state (Step 0)

| Repo | Branch | HEAD | Working tree |
|---|---|---|---|
| Web `MMG-Ticketing-Platform` | `master`, tracking `origin/master` | `d7f3887` (2026-10-09 13:11 +0200, "fix: allow AI to override rule-based category on email tickets when confident") | **Clean.** Only local branch is `master`; no stashes |
| Mobile `mmg-ticketing-mobile-app` | `dev`, tracking `origin/dev` | `1045af0` (2026-10-19 12:20 +0530) | `app.json` was **already modified** before this investigation started. It was not touched by this investigation |

- The web repo had no uncommitted changes, so the STOP condition in Step 0d did not apply.
- **End state:** web repo `git status` is identical to the table above (`master`, `d7f3887`, clean).
- **Mobile repo changed during the run, but not because of this investigation.** At the end, `app.json` no longer showed as modified, and `package.json` and `package-lock.json` did. Another process or session made those changes. This investigation wrote only this file.

---

## 2. Fetch result (Step 1)

- **Command:** `git fetch --all`. This was the only write to the web repo; it updated `.git/FETCH_HEAD` only.
- **Current branch:** `master`.
- **Local HEAD:** `d7f3887`.
- **Remote HEAD:** `origin/master` is `d7f3887`.
- **Commits behind:** **0**. No new commits and no new branches arrived. The repo has no tags.

### Remote branches

| Branch | Tip | Commits ahead / behind `master` | Relevant to A2? |
|---|---|---|---|
| `origin/master` | `d7f3887` 2026-10-09 | 0 / 0 | Current code (§4.1) |
| `origin/claude/manifest-auth-errors-pqil6p` | `7aebd47` 2026-09-08 | **6 / 13 (unmerged)** | **Name says auth.** Content is web-only. It adds `classifyOauthError()` and `OAUTH_ERROR_HINTS` to `auth.controller.ts`, so the web callback redirects with codes such as `oauth_secret_expired`. It also adds a boot warning when `AZURE_AD_CLIENT_SECRET` looks like a GUID, a `postinstall: prisma generate` step, and 4 prod build zips. **No new route, no token in a response body, nothing for mobile** |
| `origin/uat-local-features` | `49b7d97` 2026-10-07 | 3 / 11 | No. The 3 commits are merge commits with an empty diff against `master` |
| `origin/feature/uat-bugfixes-observations` | `97f27ca` 2026-03-24 | 1 / 92 | No. Playwright e2e tests and frontend UI fixes |
| `origin/dashboard-improvements` | `925066e` 2026-07-21 | 0 / 31 | No (older than `master`) |
| `origin/feature/sow-gaps` | `71c8513` 2026-04-09 | 0 / 82 | No (older) |
| `origin/claude/adoring-booth` | `cb4f3db` 2026-04-09 | 0 / 86 | No (older) |
| `origin/feat/manageengine-parity-modules` | `94e0bb7` 2026-04-04 | 0 / 91 | No (older) |
| `origin/fix/code-review-security-and-quality` | `acc8413` 2026-03-17 | 0 / 91 | No (older) |

- **Branch names that suggest mobile, auth, SSO or API work:** only `claude/manifest-auth-errors-pqil6p` (auth). Nothing is named mobile, SSO or API.
- Three commits on `master` have "mobile" in the message: `64b064b`, `0b27f05` and `39e6020` (2026-08-21). All three are **web PWA / responsive layout** work (`frontend/` only), not a native-app API.

---

## 3. What was searched (Step 2)

Scope: the working tree plus every remote branch (`git grep <pattern> HEAD origin/*`), `backend/src`, and, where noted, every tracked text file.

| Search | Result |
|---|---|
| Route path containing `microsoft` **and** `mobile` | **None.** The only `microsoft` routes on any branch are `GET /microsoft` and `GET /microsoft/callback` |
| `auth/mobile`, `microsoft/mobile`, `mobile/login`, `mobileLogin`, `mobile sso`, `token exchange`, `exchangeToken`, `msauth`, `public client` (all tracked files, all refs) | **No hits** |
| Any `/auth` route added since `d7f3887` | **None.** `master` has 0 new commits. No branch ahead of `master` touches `auth.router.ts`; only the `claude/…` branch touches `auth.controller.ts`, and it adds no route |
| New route in the auth router under **any** name | **None.** `auth.router.ts` lists the same 7 routes on `master`, `uat-local-features`, `dashboard-improvements` and `claude/manifest-auth-errors-pqil6p`. The 5 older branches have 6 (no `/test-login`) |
| Handler returning a session token in a JSON body | **Only `POST /auth/test-login`**, at `auth.controller.ts:96` `res.json({ user: userPayload, token })`. This is the Selenium skeleton key, which mobile must never use (`02-AUTH.md` §3, §6) |
| ID-token validation: `jwks`, `jwks-rsa`, `jose`, `jwtVerify`, `jwt.verify`, `jwt.decode`, `idToken` / `id_token` as input, `verifyIdToken`, `discovery/v2.0/keys`, `PublicClientApplication` | **None.** `login.microsoftonline.com` appears only as the MSAL authority at `msal.config.ts:16`. `idTokenClaims` is read only from the web code redemption, `auth.controller.ts:165` |
| `jsonwebtoken` usage | Declared in `backend/package.json:41` (lockfile `9.0.3`) but **imported nowhere**, on any branch |
| `@azure/msal-node` usage | `msal.config.ts:1`: `ConfidentialClientApplication` only (lockfile `5.1.2`). MSAL Node does not validate ID tokens that arrive from outside the server |
| TODO / FIXME mentioning mobile, SSO, token, bearer, native or MSAL (`backend/src`, `frontend/src`, `*.md`, `docs`) | **None** |
| Commit messages (all refs) mentioning mobile, SSO, id-token, bearer, JWKS, MSAL, public client or React Native | Only the web PWA commits above and `959f91c` (2026-03-05, the original Office 365 web SSO) |
| Env var names (names only; values never read) in `.env.production`, `.env.example`, `.env.production.example`, `.env.windows.example` | `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `AZURE_AD_REDIRECT_URI`, `SESSION_TTL_HOURS`, `SESSION_SECRET`, `JWT_SECRET`. **No mobile client ID variable exists** |
| `config/openapi-spec.ts` auth paths | `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/config`, `/auth/microsoft`, `/auth/microsoft/callback`. Nothing for mobile |

---

## 4. Not found: what exists and what is needed (Step 4)

### 4.1 What the auth router contains today

`modules/auth/auth.router.ts:7-15` on `master`. It is mounted at `app.ts:123` (`app.use('/api/v1/auth', authRouter)`).

| Route | Handler (`auth.controller.ts`) | How the token is delivered |
|---|---|---|
| `POST /login` | `login`, `:22-49` | Cookie `sd_session` only. Body is `{ user }` (`:43-44`) |
| `POST /test-login` | `testLogin`, `:68-97`. Also registered directly at `app.ts:117` | Cookie **and** body `{ user, token }`. Gated by `x-test-secret`. Forbidden for mobile |
| `POST /logout` | `logoutHandler`, `:51-58` | Not applicable. Reads the cookie, otherwise `Bearer` |
| `GET /me` | `me`, `:60-65`, behind `requireAuth` | Not applicable |
| `GET /microsoft` | `microsoftLogin`, `:101-128` | Sets the `msal_state` cookie and 302s to Microsoft |
| `GET /microsoft/callback` | `microsoftCallback`, `:130-224` | Cookie only (`:201-204`), then a 302 to `/dashboard` |
| `GET /config` | `authConfig`, `:226-232` | Not applicable. Returns `{ microsoftEnabled, localAuthEnabled }` |

- **Rate limiting:** `loginLimiter` (20 per 15 min per IP, `app.ts:87-92`) is attached to `POST /api/v1/auth/login` only (`app.ts:122`).
- `apiLimiter` is mounted **after** the auth router (`app.ts:123-124`), so every other `/api/v1/auth/*` route has **no rate limit at all**. A new route added to the router would inherit that gap unless it is listed explicitly the way `app.ts:122` lists `/login`.

### 4.2 Partial work

- **Nothing partial exists.** There is no stub, no TODO and no in-progress branch.
- These are the pieces the change can reuse:
  - `loginWithAzureAd(profile, ip, ua)` at `auth.service.ts:181-295`. It already does user matching, auto-create, the session row and the Redis cache. It is provider-agnostic: it takes a plain `{ oid, email, displayName, department?, usageLocation?, officeLocation? }` (`:172-179`).
  - The claims-to-profile mapping at `auth.controller.ts:184-191`.
  - `jsonwebtoken@9.0.3`, already a direct dependency but unused.
  - `config.azureAd.tenantId` at `config/index.ts:37`.
  - The Bearer path at `middleware/auth.middleware.ts:7`, which already accepts the resulting token.

### 4.3 The smallest change that satisfies A2

**Prerequisite (IT, not code):** the public-client Entra app registration (`00-OVERVIEW.md` BLOCKER B8, `06` A2 step 1). Its client ID becomes the `aud` the server checks.

**Backend change, file by file.** This is a proposal for the backend team; nothing was changed.

| # | File / line | Change |
|---|---|---|
| 1 | `config/index.ts:34-39` (`azureAd`) | Add `mobileClientId: process.env.AZURE_AD_MOBILE_CLIENT_ID \|\| ''`. This is a new env var; it is an ID, not a secret. It is needed for UAT and PROD |
| 2 | `backend/package.json` | Add `jwks-rsa` (CommonJS, which matches `tsconfig` `"module": "commonjs"`) to pair with the already-installed `jsonwebtoken`. `jose@5` would also work |
| 3 | `auth.service.ts:185` and `:294` | Make `loginWithAzureAd` also return `expiresAt`, which it already computes at `:272`, and return `user` as the full `sessionPayload` from `:278-285` instead of the 4-field object. The web callback ignores the return value apart from `token`, so the web flow does not change. **Without this change, the endpoint cannot match our contract (§5)** |
| 4 | `auth.controller.ts` (new handler, after `:224`) | `microsoftMobileLogin`, sketched below: validate the ID token, map the claims exactly as `:184-191` does, call `loginWithAzureAd`, and return JSON. **Never call `res.cookie`**: a cookie would override the Bearer header (`auth.middleware.ts:7`, `02-AUTH.md` §2 #5) |
| 5 | `auth.router.ts`, after `:14` | `router.post('/microsoft/mobile', microsoftMobileLogin);` |
| 6 | `app.ts`, next to `:122` | `app.post('/api/v1/auth/microsoft/mobile', loginLimiter, (_req, _res, next) => next());`. Without it the endpoint has no rate limit (§4.1) |
| 7 | `auth.controller.ts:226-232` (`authConfig`) | Optional but wanted: add `microsoftMobileEnabled: Boolean(config.azureAd.tenantId && config.azureAd.mobileClientId)`. `01-API-CONTRACT.md` notes that mobile needs its own flag |
| 8 | `config/openapi-spec.ts`, around `:246` | Optional: document the new path |

**Validation rules** (all required):
- `alg` is `RS256`.
- The key comes from `https://login.microsoftonline.com/<tenantId>/discovery/v2.0/keys`, selected by `kid`.
- `iss` is `https://login.microsoftonline.com/<tenantId>/v2.0`.
- `aud` is `config.azureAd.mobileClientId`.
- `tid` is `config.azureAd.tenantId`.
- `exp` and `nbf` are checked (`jsonwebtoken` does this by default).
- `oid` is present.

**Handler sketch** (proposal only, not applied; it follows the style of `auth.controller.ts`):
```ts
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const mobileTokenSchema = z.object({ idToken: z.string().min(1) });
const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${config.azureAd.tenantId}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

export async function microsoftMobileLogin(req: Request, res: Response) {
  const { tenantId, mobileClientId } = config.azureAd;
  if (!tenantId || !mobileClientId) {
    return res.status(501).json({ error: 'Microsoft mobile authentication is not configured' });
  }
  const parsed = mobileTokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'idToken is required' });

  let claims: jwt.JwtPayload;
  try {
    claims = await new Promise<jwt.JwtPayload>((resolve, reject) =>
      jwt.verify(
        parsed.data.idToken,
        (header, cb) => jwks.getSigningKey(header.kid).then((k) => cb(null, k.getPublicKey()), cb),
        { algorithms: ['RS256'], audience: mobileClientId, issuer: `https://login.microsoftonline.com/${tenantId}/v2.0` },
        (err, payload) => (err ? reject(err) : resolve(payload as jwt.JwtPayload)),
      ),
    );
    if (claims.tid !== tenantId || !claims.oid) throw new Error('Wrong tenant or missing oid');
  } catch (err) {
    logger.warn('Mobile Microsoft token rejected', { error: err instanceof Error ? err.message : err });
    return res.status(401).json({ error: 'Invalid Microsoft token' });
  }

  const email = String(claims.preferred_username || claims.email || '').toLowerCase();
  if (!email) return res.status(401).json({ error: 'No email address in Microsoft account' });

  try {
    const result = await loginWithAzureAd(
      { oid: claims.oid, email, displayName: claims.name || email, department: claims.department },
      req.ip,
      req.headers['user-agent'],
    );
    // No res.cookie(): the cookie would win over the Bearer header (auth.middleware.ts:7).
    return res.json({ token: result.token, expiresAt: result.expiresAt, user: result.user });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'Account is deactivated') return res.status(403).json({ error: 'Account is deactivated' });
    logger.error('Mobile Microsoft login failed', { error: message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

**Proposed contract.** This is what to ask the backend team to confirm. It is the same as our assumption.

| Case | Status | Body |
|---|---|---|
| Success | 200 | `{ token: string /* uuid */, expiresAt: string /* ISO-8601 */, user: { id, email, displayName, role, ldapSamAccount, countryId } }`, with **no `Set-Cookie`** |
| Body missing or empty `idToken` | 400 | `{ error: 'idToken is required' }` |
| Bad signature, wrong `iss`/`aud`/`tid`, expired, or no `oid` | 401 | `{ error: 'Invalid Microsoft token' }` |
| Valid token but no email claim | 401 | `{ error: 'No email address in Microsoft account' }` |
| Valid identity, MMG user deactivated | 403 | `{ error: 'Account is deactivated' }` |
| Valid identity, **no matching MMG user** | — | **No error exists today.** `loginWithAzureAd` auto-creates the user as `END_USER` (`auth.service.ts:239-251`), exactly as the web flow does. A2 as written keeps that behaviour. If the business wants mobile to refuse unknown users instead, that is a **new rule** the backend team must add, with its own status code. We need an answer either way |
| Server not configured for mobile | 501 | `{ error: 'Microsoft mobile authentication is not configured' }` |
| Too many attempts (if change #6 is made) | 429 | `{ error: 'Too many login attempts. Try again in 15 minutes.' }` |
| Unexpected failure | 500 | `{ error: 'Internal server error' }`. Do **not** echo raw thrown messages the way `login` does at `:47` |

**Points the backend team must decide.** These affect our code.
1. **Country and office for new users.** The web callback reads `country` and `officeLocation` from Graph `/me` using the Graph access token (`auth.controller.ts:167-182`). An ID token alone cannot do that.
   - With `{ idToken }` only, a user **created** through mobile gets no `countryId` and no `officeLocation`.
   - Existing users keep theirs, because the service updates them only when values are supplied (`auth.service.ts:233, 235, 261-262`).
   - If the backend team wants parity, the request becomes `{ idToken: string, accessToken?: string }`. The access token is a Graph token with scope `User.Read`, used only to call Graph `/me` as `:171` does. That would be a change to our request type.
2. **Deactivated wording and status.** The service throws `'Account is deactivated'` (`auth.service.ts:268`), but the middleware returns `'Account deactivated'` (`middleware/auth.middleware.ts`). Mobile maps messages by exact string (`02-AUTH.md` §5.3), so the status and string must be agreed.
3. **Merge order.** The unmerged `claude/manifest-auth-errors-pqil6p` branch edits the same region of `auth.controller.ts` (around `:99` and `:207-223`). Whoever merges second will have a small conflict.

---

## 5. Comparison with what our app assumes

The app assumes request `{ idToken: string }` and response `{ token, user, expiresAt }` (`src/api/auth.api.ts:75-80`, `src/types/user.ts:15`, `01-API-CONTRACT.md` AUTH-P2).

- **There is no live endpoint to compare against.** The table below compares our assumption with what the existing code returns **if the backend reuses `loginWithAzureAd` as-is**. That is the likely shortcut, and it is why change #3 matters.

| Field | Our assumption | What reuse as-is would give | Difference |
|---|---|---|---|
| Method and path | `POST /api/v1/auth/microsoft/mobile` | Not present | Endpoint missing |
| Request | `{ idToken: string }` (required) | Not present | None, unless decision 1 adds an optional `accessToken` |
| `token` | `string`, an opaque UUID | `result.token`, a UUID v4 (`auth.service.ts:271`) | Matches |
| `expiresAt` | `string`, ISO-8601 | **Not returned.** Computed at `:272` but dropped at `:294` | **Missing unless change #3 is made** |
| `user` | `AuthUser` = `{ id, email, displayName, role, ldapSamAccount, countryId }` (`03-DATA-MODEL.md`, `src/types/user.ts:7`) | `{ id, email, displayName, role }` (`:294`) | **`ldapSamAccount` and `countryId` missing unless change #3 is made.** The workaround would be calling `GET /auth/me` right after login |
| Cookie | None | Only if the handler calls `res.cookie` the way the web callback does | Must be **no cookie** |

---

## 6. UAT deployment

- **Nothing to deploy:** the endpoint does not exist on any branch.
- Nothing in the repo indicates any UAT-specific auth route. `web.config.uat` has no auth rules.
- The newest committed build zips are on the unmerged `claude/…` branch, dated 2026-09-08. They contain the web-only OAuth error classifier, not a mobile endpoint.

---

## 7. What this investigation ran

- **Write to the web repo:** only `git fetch --all`.
- **Read-only commands in the web repo:** `git status`, `git log`, `git show`, `git diff`, `git branch`, `git grep`, `git rev-parse`, `git rev-list --count`, `git reflog show`, `git stash list`, `grep`, `sed -n`, `cat`, `ls`.
  - `git grep`, `rev-parse`, `rev-list`, `reflog show` and `stash list` are not on the R4 list by name, but all are read-only.
- **`.env.production`:** only variable names were extracted (`grep -o '^NAME='`). No value was read or printed.
- No database, prisma, npm, build or run command was used. Nothing was checked out.
- Nothing needed a step beyond the permitted fetch, so there is **no R7 item**.
- The only file written is this one.
