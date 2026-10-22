// Microsoft Entra ID settings for native sign-in (ask A2, 02-AUTH.md §7).
// - PUBLIC CLIENT: authorization code + PKCE through the system browser. There is NO client secret here and there
//   must never be one (02 §6). Neither ID below is a secret: both ship inside every build.
// - Ronit fills in the two IDs from the A2 app registration, in either of two ways:
//     1. replace the '<CLIENT_ID>' / '<TENANT_ID>' defaults below. This is what an EAS build (preview APK) uses:
//        EAS does not upload `.env`, which is git-ignored.
//     2. set EXPO_PUBLIC_AZURE_CLIENT_ID / EXPO_PUBLIC_AZURE_TENANT_ID in a local `.env` (names in .env.example).
//        Read once at bundle time; restart `npx expo start` after a change.
//   Until both are real GUIDs, the app refuses to open Microsoft sign-in and says why (isMicrosoftSignInConfigured).

// Must stay direct `process.env.EXPO_PUBLIC_*` accesses so Expo inlines them at build time (no destructuring).
/** Entra "Application (client) ID" of the mobile (public-client) app registration. */
export const AZURE_CLIENT_ID: string = process.env.EXPO_PUBLIC_AZURE_CLIENT_ID || '76c6edf5-a09c-4d1a-9a48-68f84697678b';
/** Entra "Directory (tenant) ID" of Mount Meru Group. Single tenant: no `common` / `organizations`. */
export const AZURE_TENANT_ID: string = process.env.EXPO_PUBLIC_AZURE_TENANT_ID || '24067079-ff6a-4c4e-a5de-7c5ac7ddf4d8';

export const AZURE_AUTHORITY = `https://login.microsoftonline.com/${AZURE_TENANT_ID}`;

/** The authority's v2.0 endpoints, fixed here so sign-in needs no discovery request first. */
export const AZURE_ENDPOINTS = {
  authorizationEndpoint: `${AZURE_AUTHORITY}/oauth2/v2.0/authorize`,
  tokenEndpoint: `${AZURE_AUTHORITY}/oauth2/v2.0/token`,
} as const;

/**
 * The minimum to identify the user: `openid` gives the ID token, `profile` / `email` its name and email claims.
 * `offline_access` was asked for, so Microsoft also returns a refresh token; the app discards it (and the access
 * token) unused. Nothing broader, no Graph scope.
 */
export const AZURE_SCOPES: readonly string[] = ['openid', 'profile', 'email', 'offline_access'];

/** URL scheme of the redirect URI below; listed under `scheme` in app.json so Android hands the return URL to the app. */
export const AUTH_REDIRECT_SCHEME = 'msauth';

/**
 * The redirect URI this build sends to Microsoft: the one registered in Entra under the "Android" platform for package
 * com.mountmeru.servicedesk, in Microsoft's fixed `msauth://<package>/<Base64 signature hash>` form (RELEASE.md §3.2).
 * One value for every build signed with the EAS key; it is NOT built with expo-auth-session's makeRedirectUri, and
 * Expo Go cannot receive it (02-AUTH §7.2's `exp://` text is out of date — see 11-SSO-VERIFY §4.2).
 * Kept as a function so the Login screen, the sign-in flow and the tests read it the same way.
 */
export function getAuthRedirectUri(): string {
  return 'msauth://com.mountmeru.servicedesk/tlz9kcLBCrCtaVd%2FAvzUpkcOfgo%3D';
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** False while either ID is still a placeholder (or not a GUID): sign-in would only fail on Microsoft's page. */
export function isMicrosoftSignInConfigured(): boolean {
  return GUID_RE.test(AZURE_CLIENT_ID) && GUID_RE.test(AZURE_TENANT_ID);
}
