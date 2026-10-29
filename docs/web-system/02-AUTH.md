# 02 — Authentication

> ## ✅ DECIDED: option (b), ask A2, native Microsoft SSO. App side built 2026-10-19 (Phase 2). ✅ Backend endpoint deployed to UAT; contract CONFIRMED
> - **Decision:** Ronit chose (b) (§4). The Entra ID public-client app registration **exists**.
> - **App:** the native flow is implemented (§7). It signs in with Microsoft, then posts the ID token to `POST /api/v1/auth/microsoft/mobile` (AUTH-P2).
> - **Backend:** AUTH-P2 is **deployed to UAT**: `https://uat-servicedesk.mountmerugroup.com/api/v1/auth/microsoft/mobile`. Production is **not confirmed** (`10-A2-STATUS.md` §0).
> - **The contract is CONFIRMED, not assumed.** The backend team gave the real shape on **2026-10-19**; recorded here 2026-10-20 (§7.5).
>   - Its `user` has **`name`**, not `displayName`, plus `department` and `phone`. It is **not** the `GET /auth/me` user shape (§7.5).
> - The `__DEV__` developer-token screen was **deleted on 2026-10-29**, before the first production build (`docs/RELEASE.md` §5). Microsoft sign-in is the only way into every build.
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
- With option (b), re-login *could* be silent (auth library refresh token, then token exchange). **Not implemented in Phase 2:** Microsoft's refresh token is discarded (§7.3), so re-login is interactive. Still handle a 401 exactly as above.

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
  - There is no exception. The one there was, the `__DEV__`-only developer-token screen (`src/screens/auth/DevTokenScreen.tsx`), was deleted on 2026-10-29 (`docs/RELEASE.md` §5).

---

## 7. Implemented flow: native Microsoft SSO (A2, Phase 2, 2026-10-19)

### 7.1 Entra ID app registration (exists)
- **Type:** public client, platform "Mobile and desktop applications". PKCE. **No client secret.** The app contains no secret, and none is needed.
- **Redirect URI:** `com.mountmeru.servicedesk://auth`. **Android package:** `com.mountmeru.servicedesk`.
- **Client ID and tenant ID** are not secrets. Ronit fills them into `src/config/auth.config.ts`, which **replaces the `<CLIENT_ID>` / `<TENANT_ID>` defaults**. For local runs they can also be set as `EXPO_PUBLIC_AZURE_CLIENT_ID` / `EXPO_PUBLIC_AZURE_TENANT_ID` in `.env`.
  - EAS builds do not upload `.env`, so an APK uses the defaults in the file.
  - While either ID is not a GUID, the app does not open Microsoft at all. It shows "Microsoft sign-in is not configured." (reason `not-configured`).
- **Authority:** `https://login.microsoftonline.com/<TENANT_ID>`. The v2.0 `authorize` and `token` endpoints are fixed in the config, so there is no discovery request.
- **Scopes:** `openid profile email offline_access`. Nothing else, and no Graph scope.

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
2. **Microsoft:** `AuthRequest` with `response_type=code`, PKCE `S256` and `prompt=select_account` (as the web flow does) opens in the system browser (Custom Tab).
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
8. **Resolved 2026-10-29:** the allow-list was fixed as suggested below and the check passes (`docs/RELEASE.md` §6). Record of the 2026-10-20 finding: **`npm run verify:release-bundle` FAILED.** It needed Ronit's decision; the script was not changed then.
    - `client_secret` / `clientSecret` appear in `expo-auth-session`'s own option names (`AuthRequest.js`, `TokenRequest.js`, `AuthRequestHooks.js`). They are option names only; the app passes no secret.
    - One UUID-v4 literal: the EAS `extra.eas.projectId` in `app.json`. It is bundled because `src/config/env.ts` imports `app.json`. **This predates Phase 2.**
    - Once the real Entra IDs are filled in, those two GUIDs will be flagged the same way.
    - Suggested fix (not applied): match secret **values** instead of the property names, and allow-list the projectId and the two Entra IDs.
