# 02 — Authentication

> ## ✅ DECIDED: option (b), ask A2, native Microsoft SSO. App side built 2026-10-19 (Phase 2). ✅ Backend endpoint deployed to UAT; contract CONFIRMED
> - **Decision:** Ronit chose (b) (§4). The Entra ID public-client app registration **exists**.
> - **App:** the native flow is implemented (§7). It signs in with Microsoft, then posts the ID token to `POST /api/v1/auth/microsoft/mobile` (AUTH-P2).
> - **Backend:** AUTH-P2 is **deployed to UAT**: `https://uat-servicedesk.mountmerugroup.com/api/v1/auth/microsoft/mobile`. Production is **not confirmed** (`10-A2-STATUS.md` §0).
> - **The contract is CONFIRMED, not assumed.** The backend team gave the real shape on **2026-10-19**; recorded here 2026-10-20 (§7.5).
>   - Its `user` has **`name`**, not `displayName`, plus `department` and `phone`. It is **not** the `GET /auth/me` user shape (§7.5).
> - **iOS (`ios-dev`, iOS-6, 2026-10-28):** redirect `msauth.com.mountmeru.servicedesk://auth` through Apple's sign-in sheet, PKCE S256, Keychain `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (§7.7). Code complete and tested with mocks; **not yet verified on a device** (iOS-7).
> - `__DEV__` builds keep the developer-token screen as the fallback until SSO works end to end. It is removed in Phase 8.
> - **15-day forced re-authentication** (2026-10-30): every 15 days the user is signed out, and Microsoft is told to challenge the next sign-in (`prompt=login`). It is a client-side layer on top of the unchanged 8-hour session. See §5.8.
>   - **iOS (`ios-dev`, iOS-5d, 2026-11-01):** ported from Android `f4fad10`, with the same behaviour. The iOS differences (Keychain class, reinstall, the private sheet) are in §iOS-A.
> - Do **not** work around this: no cookie scraping, no `/auth/test-login`, no WebView that lifts the web session. See §6.
> - **Email and password sign-in (G9): built 2026-11-05 against an ⚠ ASSUMED contract, on UAT builds only.** The backend team says the endpoint is deployed on UAT, but its source is not pushed, so the app tolerates several request and response shapes instead of one. Nothing about it is verified against source. See §8.
>   - **iOS (`ios-dev`, iOS-5g, 2026-11-06):** one path only, `POST /api/v1/auth/mobile/login`, **confirmed** live on UAT by the backend team. No fallback, and iOS never calls `POST /auth/login`. Android's body and tolerant reader (Ronit: 1a, 2a). UAT builds only, gated at build time as well as at run time. **`Set-Cookie` is not yet confirmed: that blocks shipping it to testers.** See §iOS-B.

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
- **On `fix/phase0-1-security`** (`cb7b074`, 2026-10-28, not on `master`), it also needs `TEST_AUTH_ENABLED=true`, and the secret is compared in constant time. It still checks no password and still sets the cookie (`docs/G9-PASSWORD-LOGIN.md` §6).

---

## 4. Candidate solutions (DECIDED: (b), ask A2)

> **Decision (Ronit, by 2026-10-19):** option **(b)**. IT has created the Entra app registration. The implemented flow is in §7. Option (a) / A1 is not being built: production is SSO only. The text below is kept as the record of the choice.

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

**Response shape proposed at decision time.** Superseded: the confirmed AUTH-P2 shape is in §7.5, and its `user` is not `AuthUser`.
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
    - **iOS (`ios-dev`):** in the code since iOS-1b. Every `expo-secure-store` call in `src/store/auth.store.ts` passes it; `tests/auth/ios-sso.test.mjs` pins it (iOS-6). Why this class: §7.7.
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
- **Never call the cookie-setting web endpoints `/auth/microsoft*`.** The mobile login must use an endpoint that does not set a cookie.
  - This keeps `sd_session` out of the native cookie jar, so it can never override the Bearer header (§2 #5).
  - **One exception since 2026-11-05:** the email sign-in tries `POST /auth/login` **last**, in case the backend team added a token to its body (§8). Its `Set-Cookie` still cannot reach the jar. With `withCredentials: false`, React Native's Android networking builds the request with `CookieJar.NO_COOKIES`, so a cookie is neither sent nor stored (`node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/network/NetworkingModule.kt:371-373`, RN 0.86.3).
  - **iOS (iOS-5g): no exception.** iOS never calls `POST /auth/login`; its email sign-in calls only `POST /auth/mobile/login` (§iOS-B). On iOS, `withCredentials: false` provably stops cookies being sent; whether a `Set-Cookie` is stored is iOS's behaviour, not React Native's code (§iOS-B, Cookies).
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
- With option (b), re-login *could* be silent (auth library refresh token, then token exchange). **Not implemented in Phase 2:** Microsoft's refresh token is discarded (§7.3), so re-login is interactive. Still handle a 401 exactly as above.
  - "Interactive" usually means only Microsoft's account picker, with no credentials. Every 15 days a re-login is a real challenge (§5.8).

### 5.5 Logout
1. `POST /api/v1/auth/logout` with the Bearer header. It always returns 200; ignore network failures.
2. Then, regardless of the result:
   - delete the token and `expiresAt` from SecureStore;
   - delete the 15-day date `mmg.auth.fullAuthAt` (§5.8), so the next sign-in is challenged and starts a new 15 days. Only the user's own sign-out does this; a 401 or the 8-hour expiry keeps it;
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

### 5.8 Forced re-authentication every 15 days (2026-10-30)

**Policy.**
- Every 15 days the user is signed out and must sign in with Microsoft again.
- Microsoft is told to **challenge** that sign-in (`prompt=login`). A live Microsoft browser session cannot sign the user straight back in.
- This is an extra client-side layer. The 8-hour session (§5.4) is unchanged, and the server knows nothing about this rule.

**Why it is needed: behaviour before this change** (read from the code on 2026-10-30)
- At 8 hours the session ends. Any one of these ends it, with "Your session has ended. Please sign in again.":
  - the request interceptor;
  - the return to the foreground;
  - a cold start;
  - a server 401.
- The re-sign-in sent `prompt=select_account`. Microsoft shows its account picker. While Microsoft's own SSO cookie in the system browser (Chrome Custom Tab) is valid, tapping the account signs the user in **without credentials**.
- That comes from Microsoft's browser session, **not from `offline_access`**. The refresh token that scope produces is discarded (§7.3), so removing the scope would change nothing.
- So after the first sign-in the app never asked for credentials again. Entra's own policies (MFA, Conditional Access, revoked sessions) could still do so; the tenant's policies were not checked.

**The interval: one constant**
- `REAUTH_INTERVAL_MS` in `src/store/auth.store.ts`, set to `15 * 24 * 60 * 60 * 1000`.
- **To change it, edit that one line.** The checks, the decision to challenge, and the Login notice ("every 15 days") all read it.
- Keep it a whole number of days, so the notice reads well.
- `tests/auth/reauth.test.mjs` asserts 15 days: change the asserted value with it.

**The timestamp**

| | |
|---|---|
| Name | `fullAuthAt`: epoch ms of the last sign-in that Microsoft was told to challenge |
| Where | `expo-secure-store`, key **`mmg.auth.fullAuthAt`**, a decimal string. A copy is kept in memory in the auth store |
| Independent of the session | It is not one of the `mmg.session.*` keys, so the 8-hour sign-out and a 401 never touch it |
| Written | Only by a **successful sign-in that was sent with `prompt=login`**, last, after the session is stored (`setSession({ …, fullAuthAt })`). The 15 days restart from it |
| Never written by | An ordinary re-sign-in within the 15 days (`prompt=select_account`), the profile save that re-stores the same session (`useProfile.ts`), or a cancelled or failed sign-in |
| Deleted by | The user's own sign-out (`useSignOut`, §5.5), and the 15-day sign-out itself |

- It holds no secret: only a number is stored.
- No token, ID token or code is stored for this rule, and none is logged.

**When it is checked.** Only on start and on return to the foreground. There is no timer and no poll.

| When | Where | What |
|---|---|---|
| Cold start | `restoreSession()` | If a session is stored and re-authentication is due, it deletes the session and the date, and Login shows the notice. This runs **before** the 8-hour check, so the notice wins when both are due |
| Return to the foreground | `endSessionIfReauthDue()` (`src/api/client.ts`) | Called first in RootNavigator's AppState handler, before the unchanged 8-hour check |
| Tap on "Sign in with Microsoft" | `attemptSignIn()` | Decides before Microsoft's page opens, from the in-memory date. Due: `prompt=login`, and a new date on success. Not due: `prompt=select_account`, and the date is kept |

**When it is "due"** (`isReauthDue()`)
- There is no date: the first sign-in on a phone, after the user's own sign-out, or after the 15-day sign-out.
- The stored date is missing, corrupt or unreadable. "Corrupt" means anything other than a positive whole number of up to 15 digits.
- `now − date ≥ REAUTH_INTERVAL_MS`. The boundary itself counts as due.
- The date is more than `REAUTH_CLOCK_TOLERANCE_MS` (5 minutes) in the future.

**Login notice**
- Title: "Signed out for security". Text: "Please sign in again. Setu asks for a fresh Microsoft sign-in every 15 days."
- It uses the existing message slot of the arc-split layout (`docs/brand/UI-STANDARDS.md` §10.1). It is styled as information (blue-50, lock icon), not as the red failure box.
- It shows only when this rule ended a live session.
- It stays through a cancelled attempt and goes once the user is signed in. A failed attempt replaces it, as it does any sign-out message.

**Edge cases**

| Case | What happens |
|---|---|
| Clock moved forward past the 15 days | Due: the user is signed out and challenged. The new date is written at the wrong (future) time. If the clock is then corrected, that date is more than 5 minutes in the future, so the rule is due once more. Safe, at the cost of one extra sign-in |
| Clock moved back | Up to 5 minutes (a network-time correction) is ignored. Further back, the date is in the future and proves nothing, so the rule is due |
| Clock **held** in the past | **Limitation.** A clock kept between the date and date + 15 days is never due. Closing this needs a trusted clock, such as server time; that is not built. The 8-hour session still ends on the server's own clock |
| Date missing, including phones updated from a build before this change | Due. A signed-in user is signed out **once**, with the notice, after updating |
| Date corrupt | Due. The bad value is deleted. No crash |
| Expiry reached while the app is open | Caught on the next return to the foreground. An app kept in the foreground past the 15 days is not interrupted, because there is no timer. Its session still ends within 8 hours, and the sign-in after that is challenged, because the decision is made at sign-in |
| User's own sign-out | The date is deleted. The next sign-in is challenged and starts a new 15 days. No notice |
| Secure storage unavailable | **Read fails:** it counts as no date, so the rule is due. A stored session is signed out; otherwise the next sign-in is challenged. **Write fails** after a challenged sign-in: the reason is `storage` ("Couldn't save your sign-in") and the user is not signed in; the next cold start clears the partial session. **Delete fails:** the in-memory copy still says "no date" for the rest of that run |
| Sign-in cancelled at Microsoft, or refused | Nothing is written, so the rule is still due |

**`prompt=login`: how it was verified (2026-10-30)**
- The installed `expo-auth-session` is **57.0.16**.
  - `Prompt.Login = "login"` (`node_modules/expo-auth-session/build/AuthRequest.types.d.ts:53`).
  - `AuthRequestConfig.prompt?: Prompt | Prompt[]` (`:139`).
  - `makeAuthUrlAsync()` copies it into the authorize URL's query (`build/AuthRequest.js:209-211`).
- The library's real `AuthRequest.makeAuthUrlAsync()` was **run** under Node, configured as `auth.api.ts` configures it.
  - Only its native modules were stubbed: `expo-web-browser`, `expo-crypto`, `react-native` and `expo-modules-core`.
  - The URL carried `prompt=login`, and `prompt=select_account` in the other case.
  - The harness was throwaway, in the session scratchpad, and is not committed.
- `tests/auth/reauth.test.mjs` asserts that the app passes `prompt: 'login'` to `AuthRequest` exactly when the rule is due, and `select_account` otherwise.
- **Microsoft's side.** Microsoft's identity platform documentation says `prompt=login` makes the user enter credentials on that request, overriding single sign-on.
  - This has **not** been seen on a device: no build was run.
  - With passwordless or Authenticator sign-in, the challenge may be an approval rather than a password.

**A server-side alternative.** IT can enforce the same rule in Entra with a Conditional Access "sign-in frequency" policy. It does not depend on the phone's clock, so it would also close the held-clock limitation above. The app's rule stays valid alongside it.

**How to test on a device.** This needs a build. Turn off "automatic date & time" so you don't have to wait 15 days.
1. Fresh install, then sign in. Microsoft asks for credentials, not just the account picker.
2. Set the date 16 days ahead, then return to Setu. Login shows "Signed out for security", and signing in asks for credentials.
3. Set the date back to today, then return. You are signed out once more, because the date is now in the future (expected). Sign in.
4. Set the clock 9 hours ahead (within the 15 days), then return. Login shows "Your session has ended", and signing in shows only the account picker, with no credentials.
5. Sign out from Profile, then sign in. Microsoft asks for credentials.

> **iOS:** the same rule, ported in iOS-5d. What differs on iOS (the Keychain class, the reinstall, the private sign-in sheet, the device test) is in §iOS-A.

---

## 6. Explicitly forbidden auth workarounds
- Calling `/auth/test-login`, or embedding `TEST_AUTH_SECRET`.
- Loading the web login in a WebView and extracting `sd_session` from the WebView cookie store.
- Parsing `Set-Cookie` from `/auth/login`.
- Shipping the existing web app registration's client secret, or any secret.
- Asking users to paste a token.
  - One documented exception: the `__DEV__`-only developer-token screen (`src/screens/auth/DevTokenScreen.tsx`). It is absent from release bundles (`docs/RELEASE.md` §6) and is deleted in Phase 8, once SSO works end to end.

---

## 7. Implemented flow: native Microsoft SSO (A2, Phase 2, 2026-10-19)

> §7.1–§7.6 are the Android record (branch `dev`). Their redirect text is out of date even for Android (`11-SSO-VERIFY.md` §7 item 2). **For iOS, read §7.7.**

### 7.1 Entra ID app registration (exists)
- **Type:** public client, platform "Mobile and desktop applications". PKCE. **No client secret.** The app contains no secret, and none is needed.
- **Redirect URI:** `com.mountmeru.servicedesk://auth`. **Android package:** `com.mountmeru.servicedesk`.
- **Client ID and tenant ID** are not secrets. Ronit fills them into `src/config/auth.config.ts`, which **replaces the `<CLIENT_ID>` / `<TENANT_ID>` defaults**. For local runs they can also be set as `EXPO_PUBLIC_AZURE_CLIENT_ID` / `EXPO_PUBLIC_AZURE_TENANT_ID` in `.env`.
  - EAS builds do not upload `.env`, so an APK uses the defaults in the file.
  - While either ID is not a GUID, the app does not open Microsoft at all. It shows "Microsoft sign-in is not configured." (reason `not-configured`).
- **Authority:** `https://login.microsoftonline.com/<TENANT_ID>`. The v2.0 `authorize` and `token` endpoints are fixed in the config, so there is no discovery request.
- **Scopes:** `openid profile email offline_access`. Nothing else, and no Graph scope.
  - `offline_access` only makes Microsoft return a refresh token, which is discarded (§7.3). It is not what lets a re-sign-in skip the password; Microsoft's browser session does that (§5.8).

### 7.2 Redirect URI per runtime
The URI is built by `expo-auth-session`'s `makeRedirectUri({ scheme: 'com.mountmeru.servicedesk', path: 'auth' })`.

| Runtime | URI the app sends | Registered? |
|---|---|---|
| EAS build (`preview` APK), any standalone or dev-client build | `com.mountmeru.servicedesk://auth` | **Yes** |
| Expo Go (`npx expo start`, scan the QR code) | `exp://<LAN-IP>:8081/--/auth`. It changes with the machine and network | **No.** Microsoft shows AADSTS50011 (redirect URI mismatch) on its own page, unless that exact URI is also added under "Mobile and desktop applications". `__DEV__` builds show the URI on the Login screen |

- `app.json` `scheme` is now `["mmgservicedesk", "com.mountmeru.servicedesk"]`. The first entry keeps the existing in-app scheme; the second lets the redirect return to a standalone build.
- **New native modules** (`expo-crypto`, plus `expo-web-browser` and `expo-application` through `expo-auth-session`): an APK built before this change cannot run the flow. Build a new one.

### 7.3 Sequence (`src/api/auth.api.ts`)
1. **Login:** the user taps "Sign in with Microsoft". The button is disabled and shows a spinner until the flow ends.
2. **Microsoft:** `AuthRequest` with `response_type=code` and PKCE `S256` opens in the system browser (Custom Tab).
   - The prompt is `prompt=select_account`, as the web flow does, or `prompt=login` when the 15-day re-authentication is due (§5.8).
   - Closing the page, pressing Back, or pressing Cancel on Microsoft's page (`access_denied` + `error_subcode=cancel`) returns to Login with **no error**.
3. **Code redemption:** the code goes to Microsoft's token endpoint (`exchangeCodeAsync`) with the PKCE verifier and no secret.
   - Only `id_token` is kept, in memory, for one request.
   - Microsoft's access token and refresh token are dropped unused. There is no silent re-login (§5.4).
4. **Exchange:** `POST /api/v1/auth/microsoft/mobile` with body `{ idToken }`.
   - Sent **without** an `Authorization` header (`skipAuth`), and without cookies (`withCredentials: false`).
5. **Validation** (`readSession()`, §7.5): only five REQUIRED fields can fail sign-in: `token`, `expiresAt`, `user.id`, `user.email` and `user.role`.
   - If one is missing, blank or the wrong type, nothing is stored and the reason is `unexpected-response`.
   - A missing or wrong OPTIONAL field is logged once as `[API drift] AUTH-P2 …` in `__DEV__` builds, and the app falls back.
   - Unknown extra fields are never read.
6. **Store:** `setSession({ token, user })` is **unchanged**.
   - `user` is the AUTH-P2 user mapped onto `AuthUser` (§7.5): `name` becomes `displayName`; `department` and `phone` are dropped.
   - Token, user and `issuedAt = now` go to SecureStore.
   - After a sign-in sent with `prompt=login`, `fullAuthAt = now` goes there too (§5.8). The call is then `setSession({ token, user, fullAuthAt })`.
   - The 8-hour rule runs from `issuedAt`. `expiresAt` from the response is checked but **not used** yet.
   - A 401 still means "sign in again". There is no refresh.
7. **Done:** RootNavigator switches to the app.

**Nothing is logged:** no token, ID token, authorization code or redirect URL. Error details carry only HTTP statuses, server `error` strings, AADSTS codes and field names.

### 7.4 Failure reasons, as shown on Login
Each reason has its own title, message and reference line (`Ref: <reason> · HTTP <status>`). `__DEV__` builds also print a developer detail line.

AUTH-P2's own JSON answers are mapped by **status**, not by the `error` text (§7.5).

| Reason | Trigger | User sees | Retry |
|---|---|---|---|
| `token-rejected` | AUTH-P2 → **401** JSON | "Sign-in was refused". Use the work account, then contact IT | Yes |
| `account-disabled` | AUTH-P2 → **403** JSON, whatever the `error` text | 05 §A.13: "Your account has been deactivated. Contact IT support." | No |
| `bad-request` | AUTH-P2 → **400** JSON: the request was malformed, which is an app-side problem | "Sign-in request wasn't accepted". Report to IT | No |
| `server` | AUTH-P2 → **500**, any other 5xx, a non-JSON error page (for example an IIS 401/403 page, which is not the endpoint's answer), or any status not listed here | "The Service Desk had a problem" | Yes |
| `endpoint-missing` | AUTH-P2 → **any 404 or 405**, HTML or JSON. The endpoint never answers 404 itself (§7.5), so this always means the route is not deployed on that server | "App sign-in isn't available yet". Microsoft accepted the sign-in; the server can't sign in the app yet | No |
| `network` | No answer from the Service Desk (network or timeout) or from `login.microsoftonline.com` | "Can't connect" | Yes |
| `not-configured` | Client or tenant ID still a placeholder | 05 §A.13: "Microsoft sign-in is not configured." | No |
| `microsoft` | Microsoft returned an error (AADSTS code shown in the detail), no code, or no ID token | 05 §A.13: "Microsoft sign-in failed. Please try again." | Yes |
| `rate-limited` | AUTH-P2 → 429. Not in the confirmed contract; kept in case a limiter is added (`10-A2-STATUS.md` §4.3 change #6) | "Too many attempts" | No |
| `unexpected-response` | AUTH-P2 → 2xx, but the body is not JSON, or a REQUIRED field (§7.5) is missing, blank or the wrong type | "Sign-in couldn't be completed". Report to IT | No |
| `storage` | SecureStore refused to save the session | "Couldn't save your sign-in" | Yes |

- `no-account` was **removed** on 2026-10-20. The backend auto-creates unknown Microsoft users, so there is no such answer.

**How to tell "backend not ready" from "app bug":**
- `endpoint-missing`, `server` and `unexpected-response` point at the **backend**. `bad-request` points at the contract between app and backend. In each case Microsoft sign-in already succeeded.
- `microsoft` and `not-configured` point at **Entra registration or app config**. The Service Desk was never called.
- A crash, a spinner that never stops, or an error after a 200 that does match §7.5 is an **app bug**.

### 7.5 The contract: CONFIRMED by the backend team on 2026-10-19
Single source in code: `src/types/mobile-sso-contract.ts`.

- **Source:** the backend team's written answer of 2026-10-19, relayed by Ronit and recorded here on 2026-10-20.
  - It was **not** re-verified against backend source. The local web clone is still at `d7f3887` (2026-10-09) and does not contain the endpoint. Under R1 it was not fetched.
- **Deployed:** UAT, `https://uat-servicedesk.mountmerugroup.com/api/v1/auth/microsoft/mobile`.
  - First live result (2026-10-20): **HTTP 200**. The app before this fix rejected it as `unexpected-response`, because it required `user.displayName` and the response has `user.name`.

**Request** (as assumed; confirmed unchanged)
```
POST /api/v1/auth/microsoft/mobile
Content-Type: application/json
Accept: application/json
(no Authorization header, no cookie)

{ "idToken": "<Microsoft v2.0 ID token: JWT, aud = mobile client ID, tid = MMG tenant>" }
```

**Success: 200**, JSON. The shape, with values replaced by their types:
```json
{
  "token": "<opaque session UUID, as sd_session>",
  "user": {
    "id": "<uuid>",
    "email": "<string>",
    "name": "<string>",
    "role": "ADMIN|AGENT|END_USER|L2_MANAGER",
    "countryId": "<string>",
    "ldapSamAccount": "<string>",
    "department": "<string>",
    "phone": "<string>"
  },
  "expiresAt": "<ISO-8601, e.g. 2026-10-20T07:45:00.000Z>"
}
```
- `department` is a **string**. It is **not** `departmentId`.
- The app expects **no `Set-Cookie`**: a cookie would override the Bearer header (§2 #5). The backend answer does not mention cookies (§7.6). `__DEV__` builds warn if one is seen.

**What can fail sign-in.** This is `readSession()` in `src/api/auth.api.ts`.

| Field | Level | If missing, blank or the wrong type |
|---|---|---|
| `token` | **REQUIRED**, non-empty string | `unexpected-response` |
| `expiresAt` | **REQUIRED**, non-empty string | `unexpected-response` |
| `user` | **REQUIRED**, object | `unexpected-response` |
| `user.id`, `user.email` | **REQUIRED**, non-empty string | `unexpected-response` |
| `user.role` | **REQUIRED**, one of the four `UserRole` values | `unexpected-response`. An unknown role is refused: every UI gate is keyed on it, and a stored session with one would not load (`auth.store.ts`) |
| `user.name` | optional string | `[API drift]` line in `__DEV__`. `displayName` falls back to the email, which `formatDisplayName()` shows as "First Last" |
| `user.countryId` | optional, string or null | Drift line; read as `null`. An AGENT then shows as a triage agent in the UI (05 §A.12). The server still scopes the data |
| `user.ldapSamAccount` | optional, string or null | Drift line; read as `null` |
| `user.department`, `user.phone` | optional, string or null | Drift line. Never kept in the session: `AuthUser` has neither, and Profile reads them from USR-1 |
| **Any other field, at any level** | ignored | Never read, so it cannot fail sign-in |

- Drift lines use the existing mechanism: `checkFields()` with `MOBILE_SSO_OPTIONAL_SPEC` (`src/api/drift.ts`, `src/api/responseSpecs.ts`). Each line is logged once per session in `__DEV__` builds, with type names only.
- **How "an extra field cannot fail sign-in" was verified (2026-10-20):**
  - The real `exchangeMicrosoftIdToken()` ran under Node against 35 crafted answers. Only the HTTP transport, the config and `expo-auth-session` were stubbed. The harness was throwaway, in the session scratchpad, and is not committed.
  - Extra fields at both levels signed in with **no** warnings. They included `departmentId`, a numeric `displayName`, `refreshToken`, nested objects, keys named `constructor` / `toString` / `hasOwnProperty`, and JSON `"__proto__"` keys.
  - Each required field missing, blank or the wrong type gave `unexpected-response`.
  - Optional fields missing, null or the wrong type signed in and logged drift.
  - The same confirmed body run through the pre-fix code failed with `user.displayName: expected string, got undefined`.
  - Why it holds by construction: the reader accesses only the named keys, through `Unchecked<MobileSsoResponse>` / `Unchecked<MobileSsoUser>`. Reading any other key is a compile error, and nothing walks the body's keys or compares its key set.

**Two user shapes. AUTH-P2 is not AUTH-2.**

| | AUTH-P2 `user` (this endpoint) | AUTH-2 `GET /auth/me` → `user` |
|---|---|---|
| Fields | `id, email, name, role, countryId, ldapSamAccount, department, phone` | `id, email, displayName, role, ldapSamAccount, countryId` |
| Source | Backend team, 2026-10-19 | Web source at `d7f3887`: `auth.controller.ts:64` returns `req.user`, built at `middleware/auth.middleware.ts:46-53` and cached at `auth.service.ts:278-285` |

- The name field differs (`name` vs `displayName`), and AUTH-P2 adds `department` and `phone`.
- The app keeps **two types**: `MobileSsoUser` (`src/types/mobile-sso-contract.ts`) and `AuthUser` (`src/types/user.ts`, 03 §C, unchanged). `readSession()` is the one place that maps the first onto the second.
- Whether the difference is intentional is an open question for the backend team (§7.6).

**Errors.** Every error is JSON `{ "error": "…" }`.

| Status | Backend meaning | App reason (§7.4) |
|---|---|---|
| 400 | Malformed request | `bad-request` |
| 401 | Microsoft token rejected | `token-rejected` |
| 403 | Account deactivated | `account-disabled` |
| 500 | Server error | `server` |

- **There is no 404 "no account" answer.** Unknown Microsoft users are auto-created as `END_USER`, as in the web flow. A 404 or 405 can therefore only come from the routing layer, and the app shows `endpoint-missing`.
- The app maps by **status**, not by the message text.

### 7.6 Open points
**Resolved on 2026-10-20** (all were open on 2026-10-19):
- AUTH-P2 existence: it is deployed to UAT (`10-A2-STATUS.md` §0).
- Field names: `idToken` in; `token`, `user`, `expiresAt` out. Confirmed.
- `user` shape and `expiresAt`: an 8-field `user` with `name`; `expiresAt` is returned.
- "No account" signal: there is none. Unknown users are auto-created as END_USER. The app's `no-account` reason and its message were removed.
- Deactivated wording: 403 means deactivated, and the app maps by status.

**Still open**
1. **Production:** AUTH-P2 is not confirmed on PROD. A PROD build shows `endpoint-missing` until it is deployed there.
2. **Two user shapes** (§7.5): ask the backend team whether AUTH-P2 `user.name` vs AUTH-2 `user.displayName` is intentional. If AUTH-P2 moves to `displayName`, change `MobileSsoUser` and the one mapping line in `readSession()`.
3. **No `Set-Cookie`:** not stated in the backend answer. Confirm it. A cookie would override the Bearer header (§2 #5).
4. **Rate limit** on the new route: unknown. Before it shipped, every `/auth/*` route except `/login` had none (`10-A2-STATUS.md` §4.1).
5. **Country and office for users created through mobile:** an ID token alone does not carry Graph `country`/`officeLocation`. The confirmed request is `{ idToken }` only, so a user first created through mobile may have no `countryId`. If the backend wants parity, the request gains `accessToken` and the app needs the `User.Read` scope. That is a scope change, so it needs Ronit's approval.
6. **Bearer through IIS/ARR on UAT** is still unverified (`00-OVERVIEW.md` BLOCKER B4).
7. **Expo Go redirect** is not registered (§7.2). Test with an EAS build, or register the `exp://` URI the Login screen shows.
8. **`npm run verify:release-bundle` now FAILS.** It needs Ronit's decision; the script was not changed.
    - `client_secret` / `clientSecret` appear in `expo-auth-session`'s own option names (`AuthRequest.js`, `TokenRequest.js`, `AuthRequestHooks.js`). They are option names only; the app passes no secret.
    - One UUID-v4 literal: the EAS `extra.eas.projectId` in `app.json`. It is bundled because `src/config/env.ts` imports `app.json`. **This predates Phase 2.**
    - Once the real Entra IDs are filled in, those two GUIDs will be flagged the same way.
    - Suggested fix (not applied): match secret **values** instead of the property names, and allow-list the projectId and the two Entra IDs.

### 7.7 iOS (`ios-dev`, iOS-6, 2026-10-28)
**Status:** code complete and tested with mocks (`tests/auth/ios-sso.test.mjs`, plus the 34 contract tests in `tests/auth/mobile-sso.test.mjs`). **Not yet verified on a device.** The first TestFlight build (iOS-7) does that.

**Entra.** The same registration: client `76c6edf5-…`, tenant `24067079-…`.
- Ronit reports (2026-10-28) that its **iOS/macOS platform is registered** for bundle ID `com.mountmeru.servicedesk`. Not re-checked from here.
- No new client ID, so the backend's ID-token audience check is unchanged.

| | iOS |
|---|---|
| Redirect URI | `msauth.com.mountmeru.servicedesk://auth`, exactly (`IOS_AUTH_REDIRECT_URI`, `src/config/auth.config.ts`) |
| How it is chosen | `getAuthRedirectUri()` returns it when `Platform.OS === 'ios'` and throws otherwise. `isMicrosoftSignInConfigured()` is false off iOS, so sign-in shows `not-configured` and never opens Microsoft. Android's signature-hash redirect is not in this branch |
| `app.json` `scheme` | `msauth.com.mountmeru.servicedesk`. `npx expo config --type introspect` gives `CFBundleURLSchemes` = `msauth.com.mountmeru.servicedesk`, `com.mountmeru.servicedesk` (Expo adds the bundle ID) |
| Browser | Apple's sign-in sheet, `ASWebAuthenticationSession`, through `expo-auth-session` → `expo-web-browser` `openAuthSessionAsync`. The sheet catches the redirect by its scheme and returns it straight to the app: no deep link, and neither Linking nor navigation is involved |
| Session | `preferEphemeralSession: true` (`AUTH_SESSION_OPTIONS`, decision D5) |
| PKCE | `S256`, stated explicitly (`codeChallengeMethod`). The library refuses `plain` |
| Scopes, secret | Unchanged (§7.1). No client secret |
| `maybeCompleteAuthSession` | Not called. It exists for web pop-ups; on iOS the native module does not implement it. Calling it would also need `expo-web-browser` as a direct dependency; it is installed only under `expo-auth-session` |

**The ephemeral session (D5)**
- **With it:** iOS shows no "'Setu' Wants to Use 'microsoftonline.com' to Sign In" prompt. Safari's Microsoft cookies are neither read nor left behind, so a shared phone never carries the previous person's session, and signing out of Setu leaves nothing behind.
- **The cost:** a full Microsoft sign-in every time (password, and MFA where Conditional Access asks for it), at least once per 8-hour session.
- **Revisit** if IT deploys Microsoft's Enterprise SSO plug-in (Authenticator or Company Portal).

**Cancel.** These all return to Login with **no error**, as in §7.3 step 2:
- `cancel`: iOS's answer for Cancel on the sheet, and for any other end of the sheet without the redirect;
- `dismiss`, and `locked` (a second sheet while one is open);
- Microsoft's own `access_denied` + `error_subcode=cancel`.

**Keychain (§5.1).** `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` on every call.
- `THIS_DEVICE_ONLY`: never synced through iCloud Keychain, never restored onto another device from a backup.
- `AFTER_FIRST_UNLOCK`, not `WHEN_UNLOCKED`: `restoreSession()` treats a failed read as "wipe and sign out". Any Keychain read while the phone is locked (a future push or background task) would then silently sign the person out. The token is an 8-hour session that the server can revoke.
- No Face ID. Keychain items survive an uninstall, so `installMarker.ts` wipes them on the first launch after a reinstall.
  - **iOS-5d:** the 15-day date `mmg.auth.fullAuthAt` (§5.8) has the same class, and the reinstall wipes it too (§iOS-A).

**Sign-out (§5.5).** `signOutAndWipe()` in `src/api/auth.api.ts`, called by `useSignOut` after the confirmation:
1. `POST /auth/logout` with the Bearer header. The result is ignored, and the wait is at most 5 s.
2. Then always `endSession(null, { forgetFullAuth: true })`: `queryClient.clear()`, the UI store reset, the three Keychain items deleted, and since iOS-5d the 15-day date too (§5.5, §5.8).
- Microsoft itself is not signed out. With the ephemeral sheet there is no Safari session to sign out of.

**Messages:** unchanged (§7.4).

**Release bundle** (2026-10-28, `npx expo export --platform ios`, Hermes bytecode, searched in Latin-1 and UTF-16):
- 0 developer-token strings out of 12 searched. The `--dev` export, as a control, contains all 12.
- The iOS redirect is present. `msauth://` and the Android signature hash are absent.
- No client-secret value: 0 Entra-secret-shaped strings, and no `clientSecret` / `client_secret` given a string literal.
  - `client_secret` and `clientSecret` occur only as `expo-auth-session`'s own option names (`AuthRequest.js`, `TokenRequest.js`, `AuthRequestHooks.js`), as §7.6 #8 already says. `src/` contains neither (tested).

**What only a device can verify (iOS-7)**
- Entra accepts the iOS redirect. If it does not, Microsoft shows AADSTS50011 on its own page, and closing the sheet returns to Login with no error.
- The sheet returns the code to the app.
- PKCE with the real library.
- AUTH-P2 accepts an ID token obtained on iOS (same `aud`).
- The Keychain on a device, including after a restart and after a reinstall.
- The stale-banner wiring on real AppState events. The sheet leaves the app `inactive`; a trip to Microsoft Authenticator during sign-in is `background`, and neither counts as leaving.

**Optional check with no build** (Ronit's call: it is a real Microsoft sign-in, but it never reaches the Service Desk):
1. Open this URL in a desktop browser:
   ```
   https://login.microsoftonline.com/24067079-ff6a-4c4e-a5de-7c5ac7ddf4d8/oauth2/v2.0/authorize?client_id=76c6edf5-a09c-4d1a-9a48-68f84697678b&response_type=code&redirect_uri=msauth.com.mountmeru.servicedesk%3A%2F%2Fauth&scope=openid%20profile%20email%20offline_access&prompt=select_account&code_challenge=0xfXCd1w3vFqrS5jbJ2HpQAo7heKHZe0aR9sO4lue8M&code_challenge_method=S256
   ```
2. Sign in.
   - **AADSTS50011:** the iOS redirect is not registered as typed. Fix it in Entra before iOS-7.
   - **No error, and the browser tries to open an `msauth.com.mountmeru.servicedesk://` link:** Microsoft accepts the URI.
- The PKCE challenge belongs to a verifier that was generated and thrown away, so any code the browser receives is useless.

---

## iOS-A. iOS: the 15-day re-authentication (`ios-dev`, iOS-5d, 2026-11-01)

Ported from Android `dev` @ `f4fad10`. iOS keeps **the same behaviour** as §5.8, step for step. This section lists only what differs on an iPhone, and why. (This is the first lettered iOS section in this file. §7.7 predates the lettering rule and keeps its number.)

**Android → iOS, moment by moment**

| When | Android (§5.8) | iOS |
|---|---|---|
| Tap on "Sign in with Microsoft" | `attemptSignIn()` decides from the in-memory date: `prompt=login` and a new date, or `prompt=select_account` and the date kept | Same code (`signInAttempt.ts`, verbatim). `prompt` is the only thing that changes: the redirect `msauth.com.mountmeru.servicedesk://auth`, PKCE S256, `preferEphemeralSession: true` and the AUTH-P2 exchange are untouched (§7.7) |
| Cold start | `restoreSession()`: the 15 days before the 8 hours | Same, after the reinstall check (`installMarker.ts`), which RootNavigator runs first |
| Return to the foreground | `endSessionIfReauthDue()` first in RootNavigator's AppState handler | Same handler. iOS also reports `active` after `inactive` (Control Centre, Notification Centre, the sign-in sheet). The check is cheap, and on Login it does nothing |
| During a request | Not checked: the request interceptor keeps only its 8-hour check | Same (`client.ts`, verbatim) |
| 401, 8-hour expiry, profile save | The date is kept | Same |
| The user's sign-out | `useSignOut` → `endSession(null, { forgetFullAuth: true })` | `useSignOut` → `signOutAndWipe()` (`src/api/auth.api.ts`, since iOS-6), which passes the option |
| The 15-day sign-out | `endSession(REAUTH_NOTICE.message, { forgetFullAuth: true })`: query cache cleared, UI store reset, session and date deleted. AUTH-3 is **not** called, so the server token lives until its own 8 hours | Same. Recorded, not changed (parity) |
| Login notice | "Signed out for security", blue-50, lock icon, in the existing message slot | Same |
| Reinstall | Not applicable: Android deletes the Keystore with the app | **iOS only:** see below |

**Keychain.** `mmg.auth.fullAuthAt` is read, written and deleted with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, as the session items are (§5.1, §7.7).
- So the date never syncs through iCloud Keychain and never comes back onto another device from a backup. There, the rule is due, and the first sign-in is challenged.
- A read that fails (for example before the first unlock after a restart, if a future push or background task ever read it) counts as "due", as §5.8 says. Today nothing reads the Keychain in the background.
- `tests/auth/ios-reauth.test.mjs` pins the class on every call on the key; `tests/auth/ios-sso.test.mjs`'s Keychain test now covers it too.

**Reinstall.** iOS keeps Keychain items after the app is deleted. On the first launch after a reinstall, `installMarker.ts` now deletes the date as well as the three session items (`forgetStoredFullAuth()`, exported from `auth.store.ts` for this).
- **A reinstall means a fresh, challenged sign-in**, even within the 15 days. Login shows no notice: nothing was signed out, the app is new.
- The marker can't be read: nothing is wiped, and §5.8 applies as usual. The marker can't be written: the next launch wipes again.

**`prompt=login` and the private sheet (D5).** The sign-in sheet is ephemeral, so it holds no Microsoft cookie, and every iOS sign-in already asks for the password (§7.7).
- On a plain iPhone, `prompt=login` therefore changes nothing a tester can see. The visible difference is the Login notice, not the password prompt.
- It matters on a phone with Microsoft's Enterprise SSO plug-in (Authenticator or Company Portal under device management), which can otherwise sign in from the device's own Microsoft session. It also matters if D5 is ever reversed.
- Kept for parity (Ronit, iOS-5d brief). **Not seen on a device.**

**The `__DEV__` developer-token screen** (iOS only until iOS-9). Its `setSession` passes `fullAuthAt: Date.now()` (Ronit, iOS-5d Q1). The pasted token comes from a fresh UAT web sign-in. Without a date, every developer session would count as due and end at the first return to the foreground. Release builds don't contain the screen.

**How to test on an iPhone** (a TestFlight build; `UAT-TEST-PLAN-IOS.md` G15). Turn off Settings › General › Date & Time › **Set Automatically**, so you don't have to wait 15 days.
- Steps 1, 2, 3 and 5 of §5.8 apply as written.
- **Step 4 differs:** after the 8-hour expiry, Login shows "Your session has ended", and the sign-in still asks for the password, because the sheet is private. That is D5, not this rule.
- Also on iOS: delete Setu and install it again within the 15 days. Login shows no notice, and the sign-in is challenged.
- Swiping the app away and reopening it at +16 days shows the notice too (the cold-start path).
---

## 8. Email and password sign-in (G9): built 2026-11-05 against an ⚠ ASSUMED contract, UAT builds only

**The goal:** a Google Play reviewer, who has no Microsoft account in the MMG tenant, can sign in.

> **iOS:** this section is Android's text, verbatim at `d8626bc`. iOS calls one confirmed path, with no fallback: §iOS-B.

> **⚠ ASSUMED, NOT VERIFIED AGAINST SOURCE.** On 2026-11-05 Ronit confirmed with the backend team that a mobile password-login endpoint is **deployed on UAT**, with local auth on there. Its source has **not been pushed**: no branch of the web clone has it (`docs/G9-PASSWORD-LOGIN.md`). That holds for the clone fetched 2026-11-04 16:36, and for the fresh one of 2026-11-05 09:56 (`master` `7df97c8`, 15 refs), whose auth module and middleware are unchanged since `d7f3887`. That is the same position AUTH-P2 was in before its contract arrived. So the app was built to work against **several plausible shapes, not one guessed shape**. The last guess cost a rebuild: the app required `displayName`, and the server sent `name`. Every wire name is in one file, `src/types/mobile-password-contract.ts`. Cut it down to the real contract when it arrives (ask A32).

### 8.1 The two ways in

| | Microsoft (AUTH-P2, §7) | Email and password (AUTH-P1, this section) |
|---|---|---|
| Builds | Every build | **UAT builds only** (`EMAIL_SIGN_IN_ENABLED`, `src/config/env.ts`): development and `preview`. A production build does not render the option at all |
| Contract | **Confirmed** by the backend team, 2026-10-19 | **Assumed**: endpoint reported deployed on UAT, source not pushed |
| Where on Login | The outlined pill, the primary action, unchanged | Under the pill: OR divider, then "Sign in with email instead". The fields open in place (`docs/brand/UI-STANDARDS.md` §15.2) |
| Request | `POST /auth/microsoft/mobile` `{ idToken }` | Up to four paths (§8.2), `{ username, email, password }` |
| Response reader | `readSession()` with `AUTH_P2_READER`: its confirmed names only | **The same `readSession()`**, with `AUTH_P1_READER`: aliases, and fewer required fields (§8.3) |
| `countryId` missing | Stored as `null` (unchanged) | Taken from AUTH-2 before the sign-in completes, or the sign-in is **refused** (§8.4) |
| Session | `setSession({ token, user, fullAuthAt })`: same store, same 8-hour rule from `issuedAt` | **The same call, the same store, the same 8-hour rule** |
| 15-day clock (§5.8) | `fullAuthAt` only after a challenged sign-in (`prompt=login`) | **`fullAuthAt = now` after every password sign-in** (§8.5) |
| Code | `signInWithMicrosoft()` → `attemptSignIn()` | `signInWithPassword()` → `attemptPasswordSignIn()` (`src/api/auth.api.ts`, `src/screens/auth/signInAttempt.ts`) |

- **The SSO path is unchanged.** `readSession()` gained per-endpoint options; AUTH-P2's reader holds exactly its old key names and required fields. All 34 tests of `tests/auth/mobile-sso.test.mjs`, a file not touched, still pass, and `tests/auth/password-sign-in.test.mjs` proves AUTH-P2 takes none of the email path's aliases.
- **They never overlap.** Both run through Login's one single flight. The Microsoft pill is locked (no touch, hidden from TalkBack) while an email sign-in runs, and "Sign in" is disabled while Microsoft's runs.

### 8.2 The request, sent tolerantly

- **Body:** `{ "username": <email>, "email": <email>, "password": <password> }`: the same trimmed input under both names.
  - **Why both:** the clone's `/auth/login` reads `username` (`auth.controller.ts:9-12`), and A32 proposed `email`. A server ignores the key it does not read.
  - The password is sent as typed, never trimmed.
- **Headers:** JSON, no `Authorization` (`skipAuth`), no cookies (`withCredentials: false`).
- **Checked first, on the phone:** a trimmed email of the form `name@domain.tld`, and a non-empty password. Nothing invalid is sent.
- **Paths, in this order** (`MOBILE_PASSWORD_PATHS`):
  1. `POST /api/v1/auth/mobile/login`
  2. `POST /api/v1/auth/login/mobile`
  3. `POST /api/v1/auth/mobile`
  4. `POST /api/v1/auth/login`: the clone's web login, in case the backend team added a token to its body. Its cookie cannot reach the native jar (§5.2).
- **The next path only after a 404 with an HTML body:** Express's `Cannot POST …`, which means "no such route" (01 §0.5).
  - A JSON error of any status means the route exists and refused. The app stops there and shows the message.
  - A 404 that is not HTML (for example plain text), a 200 with an HTML body, and a network failure also stop.
- **Remembered:** the path that last gave a JSON answer is tried first by later attempts in the same run of the app. It is held in memory only. A 429 is not remembered, because the general limiter answers it in front of every route. A remembered path that later answers HTML 404 is forgotten, and the others are tried in order.
- **Logged** at debug level, in every build (Metro, and logcat as `ReactNativeJS`): one `[auth] email sign-in: …` line per answer. It carries the path, the status, and which key names the token, name and expiry came under. Never the email, the password, a token or a server message.
- **None answers:** reason `unavailable`, "Email sign-in isn't available … Sign in with Microsoft instead", with a "Sign in with Microsoft" button in the failure box. The button never stays on a spinner: every path ends in an outcome.

### 8.3 The response, read tolerantly (`readSession()` with `AUTH_P1_READER`)

| Field | Level | Accepted under | If missing |
|---|---|---|---|
| token | **REQUIRED** | `token`, `accessToken`, `sessionToken`: the first non-blank string | `no-token`: "Email sign-in isn't available", offering Microsoft |
| `user` | **REQUIRED**, object | `user` | `unexpected-response` |
| `user.id` | **REQUIRED** | `id` | `unexpected-response` |
| `user.role` | **REQUIRED**, one of the four `UserRole` values | `role` | `unexpected-response`. An unknown role is refused, as on AUTH-P2 |
| `user.email` | optional | `email` | The typed email stands in |
| display name | optional | `name`, `displayName`, `fullName` | The email stands in; one drift line names all three keys |
| expiry | optional | `expiresAt`, `expires_at`, `expiry` | Nothing. It is read but not used, as on AUTH-P2: the app's 8-hour clock applies (§5.4) |
| `user.countryId` | optional, string or null | `countryId` | **AUTH-2 is asked** (§8.4) |
| `user.ldapSamAccount` | optional, string or null | `ldapSamAccount` | `null` |
| **Any other field, at any level** | ignored | | Never read, so it cannot fail sign-in |

- A 200 with an HTML body, or HTML labelled JSON, is rejected (`unexpected-response`), as on AUTH-P2.
- **Drift:** a missing or wrongly typed optional field is logged once as `[API drift] AUTH-P1 …` in `__DEV__` builds, through the existing mechanism (`checkFields()` with `MOBILE_PASSWORD_OPTIONAL_SPEC`, plus `reportDrift()` for the alias groups).

### 8.4 `countryId`: a missing one can never make an agent a triage agent

- **Why it matters.** In the UI, an AGENT with no `countryId` is a triage agent: they can switch country, and their lists are not locked (05 §A.12). The clone's `/auth/login` sends no `countryId` (`auth.service.ts:167`). A body without it would silently change an agent's scope in the app.
- **What the app does** (`confirmFromAuthMe()`):
  - **Sent as a string:** kept. An AGENT is locked to that country.
  - **Sent as `null`:** kept as `null`. The server itself says this AGENT has no country.
  - **Missing, or another type:** before the sign-in completes, the app calls `GET /api/v1/auth/me` (AUTH-2) with `Authorization: Bearer <the new token>`. AUTH-2 is the server's own record of the session (`auth.middleware.ts:46-53`), which holds `countryId` (`auth.service.ts:151-158`). Its `countryId` is used, string or `null`. Its `displayName`, `email` and `ldapSamAccount` fill only fields the sign-in answer did not have.
  - **AUTH-2 fails or disagrees:** the sign-in is **refused**, with reason `session-unconfirmed`. That covers any HTTP error, no answer, a non-JSON body, no `user`, no `countryId` in it either, a different `user.id`, or a different `user.role`. The new session is ended on the server (`POST /auth/logout` with the same token, best effort), and nothing is stored.
- Microsoft sign-in is unchanged: a missing `countryId` there is still stored as `null` (§7.5).

### 8.5 The session and the 15-day clock

- Stored through `setSession({ token, user, fullAuthAt: Date.now() })`: the same SecureStore keys, the same 8-hour rule from `issuedAt`, and the same 401 handling as after Microsoft sign-in.
- **`fullAuthAt = now` on every password sign-in.** The rule itself is unchanged: the interval, the checks and the notice. Two reasons:
  - A password is a full credential check, which is what the 15-day rule exists to force. It is the same as a challenged Microsoft sign-in.
  - Without a date, `restoreSession()` treats re-authentication as due, so a phone that signed in by password would be signed out on its next cold start.
- **Ronit to confirm.** This was the open question in this section's earlier version. The 15-day notice still says "a fresh Microsoft sign-in", because the notice was not to be changed.
- **The password** is held in the form's component state only. It goes to the one sign-in request and nowhere else: not to AUTH-2, AUTH-3, a header, a log line, an error, the outcome, the store or SecureStore. It is cleared on success, on failure and on unmount. `tests/auth/password-sign-in.test.mjs` "R6" checks all of these.

### 8.6 Failure reasons, as shown on Login

Shown in a failure box above "Sign in": title, message, the server's own words where they are fit to show, and `Ref: <reason> · HTTP <status> · <path>` on every build. `__DEV__` builds also print the developer detail.

| Reason | Trigger | User sees | Offers Microsoft |
|---|---|---|---|
| `credentials-rejected` | **401** JSON | "Sign-in was refused", then **the server's message**, or "The email or password isn't right. Check both, then try again." when the server's message would say which was wrong | No |
| `account-disabled` | **403** JSON | "Account deactivated" (05 §A.13) | No |
| `bad-request` | **400** JSON | "Sign-in request wasn't accepted". Report to IT | Yes |
| `refused` | Any other 4xx JSON, a JSON 404 included | "Email sign-in wasn't accepted", then the server's message where it is fit to show | Yes |
| `rate-limited` | **429**, JSON or plain text | "Too many attempts": "Too many sign-in attempts have been made from this network. Wait 15 minutes, then try again." The clone's login limiter is 20 per 15 minutes per IP (`app.ts:87-92`); the new route's is unknown | No |
| `server` | **5xx**; a non-JSON error page (IIS); a 404 that is not HTML | "The Service Desk had a problem" | No |
| `unavailable` | All four paths answered 404 with an HTML body | "Email sign-in isn't available" | Yes |
| `no-token` | A 2xx JSON object with no token under any accepted key (the clone's `/auth/login`, for one) | "Email sign-in isn't available" | Yes |
| `unexpected-response` | A 2xx that is not a JSON object, or `user`, `user.id` or `user.role` missing or wrong | "Sign-in couldn't be completed". Report to IT | Yes |
| `session-unconfirmed` | `countryId` missing, and AUTH-2 failed or disagreed (§8.4) | "Sign-in couldn't be confirmed" | Yes |
| `network` | No answer | "Can't connect" | No |
| `storage` | SecureStore refused the session | "Couldn't save your sign-in" | No |

- **Never which field was wrong** (`neutralCredentialMessage()`). A server message that names one field is replaced by the app's message, which names both. That covers the clone's LDAP "User not found in Active Directory" (05 C.23), "Incorrect password", "Unknown email" and the like. "Invalid credentials" and "Invalid email or password" are shown as sent. The same rule applies to every server message the app quotes.
- A 401 here is a refused sign-in, not an expired session: no "Your session has ended" sign-out.

### 8.7 Still to confirm (ask A32: "send us the contract, and push the source")

1. **The path** that answers on UAT. The `[auth]` debug line names it after the first attempt (§8.8).
2. **The request key:** `email`, `username`, or both.
3. **The response keys:** the token's, the name's and the expiry's, and whether `user.countryId` is in the body.
4. **No `Set-Cookie`** on the new route. `__DEV__` builds warn if one is visible to JavaScript. React Native keeps it out of the jar either way (§5.2).
5. **The rate limit** on the new route, and its **error statuses** and messages: whether it says which field was wrong, and whether unknown emails get 401 or 404.
6. **Which accounts may use it:** everyone with a local password, or an allow-list (A32's proposal).
7. **PROD.** The option is off on production builds until the endpoint is on PROD and Ronit says so. A Play reviewer installs the production build (§8 goal; `docs/G9-PASSWORD-LOGIN.md` §7).
8. **The 15-day clock** (§8.5).

When the contract arrives: cut `src/types/mobile-password-contract.ts` and `AUTH_P1_READER` (`src/api/auth.api.ts`) down to it. Keep the tests for the real shape and drop the guesses. Then record it in `01-API-CONTRACT.md` as confirmed.

### 8.8 How to learn the real contract on a device

The email path needs no Microsoft redirect, so it also works in a development build or Expo Go against UAT.

- **Development build** (`npx expo start`, Metro console):
  - `[auth] email sign-in: POST /api/v1<path> → 404 with an HTML body (no such route)` for each path passed over;
  - then `[auth] email sign-in: POST /api/v1<path> answered HTTP <status>: token as "<key>", name as "<key>", expiry as "<key>", countryId sent | not sent, so asking GET /auth/me`;
  - `[API drift] AUTH-P1 …` for each optional field that is missing or of another type.
- **`preview` APK** (no Metro, so no drift lines): `adb logcat -s ReactNativeJS:V` shows the same `[auth]` lines. A failure box's Ref line, `<reason> · HTTP <status> · <path>`, names the answering path without any tooling.
- Send those lines to the backend team with the A32 question, or record them in `01-API-CONTRACT.md` AUTH-P1 with Ronit's OK.

**Alternative with no new endpoint** (unchanged). A dedicated Entra reviewer account, signing in through the existing Microsoft sign-in.
- It needs AUTH-P2 on PROD (§7.6 item 1).
- It also needs an MFA exclusion for that one account, which is IT's decision (`docs/G9-PASSWORD-LOGIN.md` §10).

---

## iOS-B. iOS: email and password sign-in (`ios-dev`, iOS-5g, 2026-11-06)

Ported from Android `dev` @ `d8626bc` (G9 `999943e`, and E1 in `d8626bc`; `docs/ios/ANDROID-DELTA.md` §10.8). §8 is Android's text, verbatim. It describes Android's build: an ⚠ ASSUMED contract and four paths. This section lists only what differs on iOS, and why. The brief called this note "02-AUTH §iOS-A"; that letter is the 15-day section, so it is §iOS-B.

**The contract iOS is built against** (the backend team, through Ronit, 2026-11-06)

| Part | iOS |
|---|---|
| Method and path | **`POST /api/v1/auth/mobile/login`, confirmed live on UAT.** The only sign-in path iOS calls (`MOBILE_PASSWORD_PATH`, `src/types/mobile-password-contract.ts`) |
| Request body | Android's: `{ "username": <email>, "email": <email>, "password": <password> }`, which is what Android sends to this path (§8.2). Ronit, 1a |
| The 200 | Android's tolerant reader, `AUTH_P1_READER` (§8.3). Ronit, 2a. Required: a token (`token`, `accessToken` or `sessionToken`), `user`, `user.id`, and `user.role`. `name` and `displayName` (and `fullName`) are both accepted; any other field is optional; extra fields never fail sign-in |
| Errors | Android's reasons and words (§8.6), unchanged |
| `Set-Cookie` | ⏳ **NOT CONFIRMED.** Ronit is asking the backend team. **Until it is answered, the email sign-in does not go to testers** (below) |

**Android → iOS**

| | Android (§8) | iOS |
|---|---|---|
| Paths | Up to four, in order, moving on after a 404 with an HTML body; the path that answered is remembered for the run (§8.2) | **One**, `POST /auth/mobile/login`, once per tap. A 404 with an HTML body is `unavailable` ("Email sign-in isn't available … Sign in with Microsoft instead", `Ref: unavailable · HTTP 404`), and no other path is tried. Nothing is remembered |
| `POST /auth/login` | Android's fourth path | **Never called.** `verify-release-bundle` fails any bundle that names `/auth/login`, and `tests/auth/ios-password-sign-in.test.mjs` lists every auth path in `src/` |
| The gate | `EMAIL_SIGN_IN_ENABLED`, at run time (§8.1) | **Two gates, both UAT only.** The same run-time gate (`src/config/env.ts`, `APP_ENV === 'UAT'`). **And a build-time gate:** `LoginScreen.tsx` loads the form with a `require()` behind `process.env.EXPO_PUBLIC_APP_ENV !== 'PROD'`. Expo writes that value into the bundle, and Metro folds the branch away before it collects the modules. So a `production` bundle holds **none** of the four G9 modules and **none** of their strings: checked on every release check, for both profiles |
| Where the code is | `src/api/auth.api.ts`, `src/screens/auth/signInAttempt.ts` | iOS's own modules, so the build-time gate can leave them out: `src/api/passwordSignIn.api.ts` and `src/screens/auth/passwordSignInAttempt.ts`. The contract file is not re-exported from `src/types/index.ts`. The reader (`readSession()`, `readUser()`) stays shared in `auth.api.ts`; AUTH-P2's reader is unchanged |
| A `Set-Cookie` on the answer | A `__DEV__` warning | The same warning, plus one `[auth] email sign-in: … sent Set-Cookie` line in every UAT build. The cookie's value is never logged |
| The session | `setSession({ token, user, fullAuthAt: Date.now() })` in SecureStore | The same call. On iOS: the Keychain with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, as for Microsoft (§7.7); the reinstall wipe and the 15-day rule (§iOS-A); sign-out through `signOutAndWipe()` (AUTH-3). `fullAuthAt = now` on every password sign-in, as §8.5 (the iOS-5g brief, item e) |
| `countryId` | AUTH-2 asked when it is missing (§8.4) | The same |
| The keyboard | Android's | The email keyboard. `textContentType` `"username"` and `"password"`, so iOS Password AutoFill offers saved company credentials. Return goes to the password, then signs in. The form stays above the keyboard (E1) |
| VoiceOver | TalkBack hears a live region | iOS has no live region: a failure, or a field error, is announced when it appears (`AccessibilityInfo.announceForAccessibility`). The toggle is labelled "Show password" / "Hide password". The Microsoft pill is hidden from VoiceOver while an email sign-in runs. Targets of 48 pt and more (52 pt for Sign in), and Dynamic Type |
| The password | Cleared on success, failure and unmount (§8.5) | The same, in the submit's `finally` |
| Reading the `[auth]` lines | `adb logcat -s ReactNativeJS:V` (§8.8) | A development build: Metro. A `preview` build: Console.app on a Mac with the iPhone connected, subsystem `com.facebook.react.log`, category `javascript`, with **Include Debug Messages** on (React Native logs `console.debug` at the debug level). A failure box's Ref line needs no tool |

**Cookies.** Recorded here and in `docs/ios/APP-STORE-COMPLIANCE.md` (G9 section). Not changed.
- **Proven from source:** `withCredentials: false` sets `HTTPShouldHandleCookies = NO` on the request (`RCTNetworking.mm:319`), so React Native sends no cookie from the jar. Auth is Bearer only.
- **Not provable from source:** that a `Set-Cookie` on the answer is never **stored**. That is iOS's behaviour, not React Native's code. It is settled only if the endpoint sends no `Set-Cookie`, which the backend team has not yet confirmed. **That open item blocks shipping the email sign-in to testers.**
- **React Native's redirect behaviour (existing):** on any HTTP redirect, `RCTHTTPRequestHandler.mm:149-159` puts the jar's cookies on the redirected request and drops `Authorization`. No `/api/v1` call is expected to redirect. `UAT-TEST-PLAN-IOS.md` G19.16 and G20 check it on a device.

**Not on production.** The option is off in production builds until the endpoint is on PROD and Ronit says so. Whether it then serves App Review's demo account (compliance A4) is an open decision for iOS-9.

**Tests:** `tests/auth/password-sign-in.test.mjs` (Android's, with "one path" in place of "path discovery"), `tests/auth/ios-password-sign-in.test.mjs` (the iOS-only checks: one path, the gates, the Keychain, the password), `tests/login/sign-in-button.test.mjs` (E1). Device checks: `UAT-TEST-PLAN-IOS.md` G20.
