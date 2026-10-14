# 02 — Authentication

> ## ⛔ PENDING DECISION — the mobile app CANNOT authenticate today
> - The backend never hands a session token to a non-browser client.
> - Production allows only Microsoft SSO, and that flow is web-only.
> - **Until Ronit chooses option (a) or (b) in §4 and the backend team ships it (`06-BACKEND-ASKS.md` A1/A2), no mobile build can log in to any real environment.**
> - Do **not** work around this: no cookie scraping, no `/auth/test-login`, no WebView that lifts the web session. See §6.

All paths are relative to `backend/src/` unless prefixed with `frontend/src/`. Line numbers are as of 2026-10-09.

---

## 1. How web auth works today

### 1.1 The session token
- It is an **opaque UUID v4**, not a JWT: `uuidv4()` at `modules/auth/auth.service.ts:77, 144, 271`. The `jsonwebtoken` package and `JWT_SECRET` are unused.
- It is stored in **two places**:
  1. **PostgreSQL**, table `sessions` (`backend/prisma/schema.prisma:179-193`).
     - Columns: `{ id, userId, token (unique), ipAddress, userAgent, expiresAt, createdAt }`.
     - Created at `auth.service.ts:78-88` (LDAP), `145-149` (local), `272-276` (Azure).
  2. **Redis**, key `session:<token>`.
     - Value: JSON `{ id, email, displayName, role, ldapSamAccount, countryId }`.
     - TTL: `SESSION_TTL_HOURS × 3600` (`auth.service.ts:91-103, 151-163, 278-290`).
- **Lifetime:** `SESSION_TTL_HOURS`, default **8** (`config/index.ts:15`); production is also 8.
  - The expiry is **absolute**: `expiresAt` is set once at creation and never extended.
  - **There is no refresh token and no refresh endpoint.** A grep for `refresh` in `backend/src` finds nothing, and `modules/auth/auth.router.ts:7-15` lists every auth route.
  - A new login does not revoke older sessions, so a user can have many live sessions.
  - Expired rows are deleted lazily, on first use after expiry (`middleware/auth.middleware.ts:35-38`).

### 1.2 The cookie
- **Name:** `sd_session` (`modules/auth/auth.controller.ts:14`).
- **Options**, verbatim (`auth.controller.ts:15-20`):
  ```ts
  const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict' as const,
    maxAge: config.session.ttlHours * 60 * 60 * 1000,
  };
  ```
- The Microsoft callback overrides `sameSite: 'lax'` (`auth.controller.ts:201-204`).
- **JavaScript never sees the token.** The web client sends it automatically with `axios` `withCredentials: true` (`frontend/src/api/client.ts:4-8`).
- The web app persists only `{ user, isAuthenticated }` to `localStorage` key `sd-auth`.

### 1.3 Identity providers and how `POST /auth/login` picks one
`POST /api/v1/auth/login` (`auth.controller.ts:22-49`) takes `{ username, password }` and chooses a backend:

```ts
// auth.controller.ts:33
const useLocalAuth = process.env.LOCAL_AUTH_ENABLED === 'true' || config.redis.url === 'redis://mock' || config.nodeEnv === 'development';
```

| Provider | When | Behaviour |
|---|---|---|
| **Local (bcrypt)** | `useLocalAuth` is true | `email = username.includes('@') ? username : `${username}@dev.local`` (`:38-39`). Checks `passwordHash` with bcrypt (`auth.service.ts:121-168`). Errors: `'Invalid credentials'`, `'Account is deactivated'` |
| **LDAP / AD** | otherwise | Binds a service account, searches `(|(sAMAccountName=x)(userPrincipalName=x))`, optionally checks `LDAP_ALLOWED_GROUP`, then binds as the user. Upserts the user as `END_USER` (`auth.service.ts:25-108`). Errors include `'User not found in Active Directory'`, `'User is not a member of the required AD group'`, `'Invalid credentials'`, `'LDAP connection failed'` |
| **Microsoft Entra ID SSO** | **never via `/auth/login`.** Only via `GET /auth/microsoft` | See §1.4 |

- **Production (`.env.production`) has Entra ID configured and no LDAP or local auth.** In production, Microsoft SSO is therefore the only way to log in.
- `GET /api/v1/auth/config` (no auth) returns `{ microsoftEnabled: boolean, localAuthEnabled: boolean }` (`auth.controller.ts:226-232`). It tells a client which login UI to show.

**Login response**
```
200  { "user": { "id", "email", "displayName", "role" } }      ← NO token in the body
     Set-Cookie: sd_session=<uuid>; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Strict
400  { "error": "Username and password are required" }          ← zod failure; no `details`
401  { "error": "<raw thrown message>" }                         ← every failure, even DB/Redis errors
429  { "error": "Too many login attempts. Try again in 15 minutes." }   ← 20 per 15 min per IP (app.ts:87-92)
```

### 1.4 Microsoft SSO (web redirect flow)
1. The browser opens `GET /api/v1/auth/microsoft` (`auth.controller.ts:101-127`).
   - If Entra ID is not configured: `501 { error: 'Microsoft authentication is not configured' }`.
   - Otherwise it generates `state = uuidv4()` and stores it in cookie `msal_state` `{ httpOnly: true, secure: true, sameSite: 'none', maxAge: 5 min }` (`:109-114`).
   - It then 302s to Microsoft with:
     - scopes `['openid','profile','email','User.Read']` (`modules/auth/msal.config.ts:35`)
     - `prompt: 'select_account'`
     - the fixed redirect URI `https://servicedesk.mountmerugroup.com/api/v1/auth/microsoft/callback` (`AZURE_AD_REDIRECT_URI`).
2. Microsoft redirects the browser to `GET /api/v1/auth/microsoft/callback?code&state` (`auth.controller.ts:129-224`).
   - The server checks `state` against the `msal_state` cookie.
   - It redeems the code with the **confidential client** (client ID + **client secret**) through `acquireTokenByCode`.
   - It reads Graph `/me` (country, officeLocation).
3. `loginWithAzureAd()` (`auth.service.ts:181-295`) matches the user:
   - by `azureAdId`, then by email;
   - otherwise it auto-creates the user as `END_USER`;
   - it syncs `countryId` for END_USERs.
   - It then creates the session and Redis cache entry.
4. **The response is a cookie plus a 302 to `${APP_URL}/dashboard`.** The token never appears in a URL or a body.
   - On failure, it 302s to `${APP_URL}/login?error=<code>`. Codes: `oauth_not_configured`, `oauth_denied`, `oauth_state_mismatch`, `oauth_no_code`, `account_deactivated`, `oauth_failed`, `oauth_init_failed`.

### 1.5 Using the session
- `requireAuth` (`middleware/auth.middleware.ts:6-67`) runs on every protected route. See §3 for the exact logic.
- It sets `req.user = { id, email, displayName, role, ldapSamAccount, countryId }`.
- Role guards are in `middleware/rbac.middleware.ts:8-23`:
  - `requireRole(...)`
  - `adminOnly` = ADMIN
  - `agentOrAdmin` = ADMIN, AGENT
  - `agentOrAdminOrL2` = ADMIN, AGENT, L2_MANAGER
  - 403 body: `{ "error": "Forbidden: insufficient role" }`.
- `GET /api/v1/auth/me` returns `{ user: req.user }` (`auth.controller.ts:60-65`).
  - It does **not** include department, phone, timezone, avatarUrl, teams or `mustChangePassword`.
  - It may be **stale**: Redis is not refreshed when the user record changes.

### 1.6 Logout
- `POST /api/v1/auth/logout` (`auth.controller.ts:51-58`). It has **no** `requireAuth` and no rate limit.
- It takes the token from the cookie, otherwise from `Authorization: Bearer`.
- It deletes the DB row and the Redis key (`auth.service.ts:110-115`), clears the cookie, and **always** returns `200 { "message": "Logged out" }`.

### 1.7 Things that exist only in the web frontend
- **Inactivity logout** after 60 minutes (`frontend/src/hooks/useInactivityLogout.ts`). The server knows nothing about it.
- **Forced password change** screen (`frontend/src/pages/auth/ChangePasswordPage.tsx`). It is **dead**:
  - the backend never returns `mustChangePassword` (`/auth/login`, `/auth/me`);
  - that column is not in `schema.prisma`; it exists only through raw SQL at `modules/users/users.controller.ts:345-348`.

---

## 2. Why this does not work from React Native

| # | Web mechanism | What happens in a React Native / Expo app | Severity |
|---|---|---|---|
| 1 | Token delivered **only** in `Set-Cookie: sd_session; HttpOnly` (`auth.controller.ts:43-44`) | JavaScript in RN cannot read `HttpOnly` cookies, so the app cannot put the token into `expo-secure-store`. RN's native stack (NSURLSession on iOS, OkHttp on Android) may store and replay the cookie by itself, but that store is not under app control: you can't inspect, protect or reliably clear it, and clearing it needs `@react-native-cookies/cookies`, which does **not** run in Expo Go | **BLOCKER** |
| 2 | Production login is **Microsoft SSO only**, as a **confidential-client** redirect | The flow needs the **client secret**, which must never ship in an app. The redirect URI is fixed to the web domain. A system browser (`expo-auth-session` / `ASWebAuthenticationSession`) would end on `https://servicedesk…/dashboard` with the cookie set **inside that browser**. The app gets neither a code it can redeem nor a token | **BLOCKER** |
| 3 | CSRF state in an `msal_state` cookie (`SameSite=None`) | Ties the flow to one browser cookie jar. An in-app browser and the app's fetch stack do not share it | Part of #2 |
| 4 | `POST /auth/login` (password) | Even where it works (local or LDAP, **not** production), the token only arrives as a cookie (#1). Scraping `Set-Cookie` is possible from Node test scripts (`tests/api-agent/agent.js`), but RN `fetch` does not expose `Set-Cookie` reliably | **BLOCKER** in practice |
| 5 | Cookie is checked **before** the Bearer header (`auth.middleware.ts:7`) | If an `sd_session` cookie ever lands in RN's native cookie jar (for example after calling `/auth/login`), it **overrides** the `Authorization` header on every request. After user B logs in on the same device, requests can still run **as user A** | High: design around it (§5.2) |
| 6 | 8 h absolute expiry, no refresh | Phone users are logged out mid-shift every 8 h. Re-login means the full SSO round-trip | Medium (A3) |
| 7 | CORS allows one origin (`app.ts:70-73`) | Native iOS and Android are unaffected (CORS is a browser rule). **Expo Web / browser preview is blocked** | Low |
| 8 | Rate limiter keyed by cookie, otherwise IP (`app.ts:94-102`) | Bearer clients share one 300/min bucket per public IP, e.g. a whole office behind one NAT | Medium (A14) |
| 9 | Inactivity logout is web-only | Mobile must decide its own policy (§5.6) | Low |

---

## 3. The Bearer-token fallback that already exists

**Where:** `backend/src/middleware/auth.middleware.ts:7`

```ts
const token = req.cookies?.sd_session || req.headers.authorization?.replace('Bearer ', '');
```

**What it accepts**
- `Authorization: Bearer <uuid>`: exactly `Bearer`, capital **B**, one space, then the raw token.
  - `.replace` is case-sensitive and replaces only the first occurrence.
  - `bearer <t>` (lower case) or a bare token is passed through **unchanged**, so the "token" includes the prefix and fails.
- **The cookie wins** if both are present.
- The same extraction is used by `POST /auth/logout` (`auth.controller.ts:52`).

**What happens next** (`auth.middleware.ts:9-66`)
1. No token: `401 { "error": "Unauthorized" }`.
2. **Redis fast path:** `GET session:<token>` with a 300 ms timeout.
   - On a hit, `req.user` is the cached JSON and the request proceeds.
   - **No expiry, `isActive` or role re-check on this path.**
3. **DB fallback:** `sessions.findUnique({ token })`.
   - Missing or expired: `401 { "error": "Session expired" }`. **An unknown or garbage token also gets `"Session expired"`.**
   - User inactive: `401 { "error": "Account deactivated" }`. This is reached only on the DB path.
   - Otherwise it re-caches in Redis and proceeds.
4. Any thrown error: `500 { "error": "Internal server error" }`.

**What a mobile client must send:** on every request except `/health`, `/auth/config` and the login endpoint:
```
Authorization: Bearer 3f1c…-…-…(uuid v4)
Accept: application/json
```
and **no cookies** (§5.2).

**Proof it works end to end:** the code path is clear, but nobody has yet sent a Bearer request through IIS/ARR to a live environment. VERIFY item `00-OVERVIEW.md` BLOCKER B4. IIS/ARR normally forwards `Authorization`, but this must be confirmed on UAT.

**The only endpoint that returns a token in the body today is `POST /api/v1/auth/test-login`** (`app.ts:117`, `auth.controller.ts:67-97`).
- It requires header `x-test-secret` to equal the server's `TEST_AUTH_SECRET`.
- It accepts any email and does **not** check `isActive`.
- It exists for Selenium tests. **The mobile app must never use it:** it is a skeleton key, and the secret must never ship in an app. See `05` §C.

---

## 4. Candidate solutions (PENDING DECISION — Ronit chooses)

### (a) New backend endpoint that returns the session token in the JSON body (ask **A1**)
`POST /api/v1/auth/mobile/login` `{ username, password }` → `{ token, expiresAt, user }`, no cookie. Or the same added to `/auth/login` behind an `X-Client: mobile` header.

| Pros | Cons |
|---|---|
| Very small backend change: it reuses `loginWithLocal` / `loginWithLdap` and the existing session model, about 1 day of work | **Does not work in production**, which has no local or LDAP login, only SSO. It only unblocks environments with `LOCAL_AUTH_ENABLED=true` or LDAP configured |
| Simple mobile UI (a username/password form) that works in Expo Go | The app collects **corporate passwords** directly. LDAP and local login **bypass Entra ID MFA and Conditional Access**, which security may not accept for a phone app |
| Good for UAT and automated testing | Same 8 h expiry; re-login means re-typing the password |

### (b) Native Microsoft SSO: new Entra ID public-client app registration plus a token-exchange endpoint (ask **A2**)
- **IT** registers a new public-client ("Mobile and desktop") app: PKCE, no secret, redirect URIs for the app scheme.
- The app signs in with the system browser and obtains an **ID token** (or Graph access token). It uses `expo-auth-session` (works in Expo Go with a custom scheme in a dev build), or MSAL through a config plugin (dev build required).
- The app POSTs the ID token to a new endpoint, e.g. `POST /api/v1/auth/microsoft/mobile` `{ idToken }`.
- The server validates the signature against Entra JWKS, plus `iss`, `aud` (the new client ID), `tid` and `exp`. It reuses `loginWithAzureAd()` and returns `{ token, expiresAt, user }`.

| Pros | Cons |
|---|---|
| **Works in production**, with the same identity as the website (same user matching, same auto-create-as-END_USER) | More backend work (JWKS validation, about 2–4 days) **plus** an Entra admin task, i.e. a tenant change that IT must approve |
| No passwords in the app; MFA and Conditional Access are honoured | Redirect URIs must be registered per bundle ID / package and signing key, and per environment if separate builds target UAT and PROD |
| Can re-login **silently** after the 8 h expiry, using the Microsoft refresh token held by the auth library. This largely removes the need for A3 | A native MSAL library needs an Expo **dev build** (not Expo Go); `expo-auth-session` alone is fine in a dev build |
| No change to the web flow or the existing app registration | Needs a UAT environment with SSO configured to test end to end |

### Recommendation (for the decision, not a decision)
- **(b) is required for production.** Nothing else lets production users in without changing production's auth configuration.
- **(a) is optional** as a fast unblocker for UAT, if UAT has local or LDAP login enabled (unknown: `00` BLOCKER B3).
- Both return the same `{ token, expiresAt, user }` shape, so the mobile client code after login is identical, and we can ship (a) first for testing and (b) for launch.

**Response shape the mobile app will code against** (must be agreed with the backend team; it is **not** in the API today):
```ts
interface MobileLoginResponse {
  token: string;          // opaque UUID session token, same as sd_session
  expiresAt: string;      // ISO-8601; absolute expiry
  user: AuthUser;         // see 03-DATA-MODEL.md (id, email, displayName, role, ldapSamAccount, countryId)
}
```

---

## 5. Client handling: Axios + expo-secure-store

This is how the mobile app must behave once (a) or (b) exists. There is **no refresh**, so **401 means re-login.**

### 5.1 Storage
- **Token and `expiresAt`:** `expo-secure-store` only.
  - Suggested keys: `mmg.session.token`, `mmg.session.expiresAt`.
  - Use `keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` so the token is not restored to another device from backup.
  - **Never** use AsyncStorage, MMKV, Zustand-persist, logs, crash reports or analytics.
- **User profile** (`AuthUser`): a Zustand store. It may be persisted to AsyncStorage for fast startup, since it holds no secret.
  - Refresh it from `GET /auth/me` on every cold start and every foreground after more than 15 minutes.
  - The server's copy can be stale too (see `05` §C), so the authorisation decision always belongs to the server.
- On boot, read the token from SecureStore into memory once. The Axios interceptor reads the in-memory copy, not SecureStore, on every request.

### 5.2 Axios instance
```ts
// Shape only — no code is written in this phase.
baseURL:          EXPO_PUBLIC_API_BASE_URL            // UAT for dev/preview builds (00-OVERVIEW §3)
timeout:          30000
withCredentials:  false                               // never send/accept cookies
headers:          { Accept: 'application/json' }
request  → if token: headers.Authorization = `Bearer ${token}`   // capital B, one space
```
- **Never call the cookie-setting web endpoints** (`POST /auth/login` in its current form, `/auth/microsoft*`). The mobile login must use the A1/A2 endpoint, which must not set a cookie.
  - This keeps `sd_session` out of the native cookie jar, so it can never override the Bearer header (§2 #5).
- **Belt and braces:** if a dev build includes `@react-native-cookies/cookies`, call `clearAll()` on logout and login. Not possible in Expo Go.

### 5.3 Response interceptor
1. **HTML guard.** If `content-type` contains `text/html`, reject with a `NotAnApiResponse` error. Mirrors `frontend/src/api/client.ts:20`.
   - Unknown GETs return the SPA's `index.html` with **200** in production. Unknown POST/PUT/DELETE return Express's HTML 404.
2. **401** (`Unauthorized` / `Session expired` / `Account deactivated`):
   - **no retry, no refresh** (none exists);
   - delete the token from SecureStore and memory;
   - `queryClient.clear()`;
   - reset Zustand stores;
   - navigate to Login, with a message chosen by `error`:
     - `Session expired`: "Your session has ended. Please sign in again."
     - `Account deactivated`: "Your account is disabled. Contact IT."
   - De-duplicate, so a burst of parallel 401s produces one logout.
3. **403** (`Forbidden: insufficient role` / `Forbidden`): show "You don't have permission to do that". **Do not log out.**
4. **429:**
   - back off;
   - retry **GET only**, at most twice, with exponential delay;
   - show "Too many requests, try again shortly".
   - The general limiter's body is express-rate-limit's default plain text, not JSON.
5. **5xx:** retry **GET only**, at most twice.
   - **Never auto-retry POST, PUT or DELETE.** The web client retries POSTs up to 3 times (`frontend/src/api/client.ts:33-43`), which can create duplicate tickets or comments. Mobile must not copy that.
6. **400 `Validation error`:** surface `details` (`Record<string, string[]>`) next to the form fields.

### 5.4 The 8-hour expiry
- Store `expiresAt` from the login response.
  - Until A1 or A2 returns it, the fallback is login time + 8 h. `SESSION_TTL_HOURS` is configurable per environment, so treat the fallback as a hint and let 401 be the truth.
- **On app foreground and before opening any long-form screen** (reply, create ticket, close ticket): if `now > expiresAt − 10 min`, ask the user to sign in again **before** they type.
- **Drafts:** persist reply and create-ticket drafts locally (non-secret AsyncStorage), so a 401 on submit does not lose work. After re-login, offer to resubmit.
- With option (b), re-login can usually be silent (auth library refresh token, then token exchange). Still handle a 401 exactly as above.

### 5.5 Logout
1. `POST /api/v1/auth/logout` with the Bearer header. It always returns 200; ignore network failures.
2. Then, regardless of the result:
   - delete the token and `expiresAt` from SecureStore;
   - `queryClient.clear()`;
   - reset every Zustand store, **including the country selection**. The web app forgets to clear `sd-country`; don't copy that.
3. When push exists (A5), also `DELETE /api/v1/devices/:token` **before** step 1.

### 5.6 Inactivity
- The web app logs out after 60 minutes idle. This is a frontend-only rule; the server's only clock is the 8 h expiry.
- **Mobile proposal** (Ronit to confirm): no idle logout. Instead, an optional biometric or app-lock on resume after more than 15 minutes in the background. Not a server rule, so not part of the contract.

### 5.7 Attachments and images
- Attachment `download`/`view` URLs require the same Bearer header. There are **no signed or public URLs.**
- Use `expo-image` `source={{ uri, headers: { Authorization } }}` or `FileSystem.downloadAsync(url, path, { headers })`.
- **Never** append the token to a URL query string. The server doesn't support it, and it would leak into logs.

---

## 6. Explicitly forbidden auth workarounds
- Calling `/auth/test-login`, or embedding `TEST_AUTH_SECRET`.
- Loading the web login in a WebView and extracting `sd_session` from the WebView cookie store.
- Parsing `Set-Cookie` from `/auth/login`.
- Shipping the existing web app registration's client secret, or any secret.
- Asking users to paste a token.
