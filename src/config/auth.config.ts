// Microsoft Entra ID settings for native sign-in (ask A2, 02-AUTH.md §7; iOS: §7.7).
// - PUBLIC CLIENT: authorization code + PKCE (S256) through Apple's sign-in sheet (ASWebAuthenticationSession). There
//   is NO client secret here and there must never be one (02 §6). Neither ID below is a secret: both ship in every build.
// - The two IDs are the A2 app registration's. iOS uses the same registration as Android, with its iOS/macOS platform,
//   so the backend's ID-token audience check is unchanged. A local `.env` can override them
//   (EXPO_PUBLIC_AZURE_CLIENT_ID / EXPO_PUBLIC_AZURE_TENANT_ID, read once at bundle time); EAS builds use the defaults.
//   Until both are real GUIDs, the app refuses to open Microsoft sign-in and says why (isMicrosoftSignInConfigured).
import type { AuthRequestPromptOptions } from 'expo-auth-session';
import { Platform } from 'react-native';

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

/** The iOS redirect's scheme: Entra's iOS/macOS platform form `msauth.<bundle ID>`. Also `scheme` in app.json. */
export const AUTH_REDIRECT_SCHEME = 'msauth.com.mountmeru.servicedesk';

/** Registered in Entra under the iOS/macOS platform for bundle ID `com.mountmeru.servicedesk`. Exact string. */
export const IOS_AUTH_REDIRECT_URI = 'msauth.com.mountmeru.servicedesk://auth';

/**
 * The redirect URI this build sends to Microsoft. iOS only: this branch builds no other platform, and Android's
 * signature-hash redirect lives on `dev`, never here. The sign-in sheet catches the redirect by its scheme and hands it
 * straight back to the app: no deep link is involved.
 */
export function getAuthRedirectUri(): string {
  if (Platform.OS !== 'ios') throw new Error(`No Microsoft redirect URI is registered for ${Platform.OS} in this build`);
  return IOS_AUTH_REDIRECT_URI;
}

/**
 * How the sign-in sheet opens (02 §7.7, decision D5). Ephemeral: the sheet neither reads nor keeps Safari's Microsoft
 * cookies, so iOS asks no "'Setu' Wants to Use 'microsoftonline.com' to Sign In" first, a shared phone never carries the
 * previous person's Microsoft session, and signing out of Setu leaves nothing behind. The cost: a full Microsoft
 * sign-in (password, and MFA where Conditional Access asks for it) every time.
 */
export const AUTH_SESSION_OPTIONS: AuthRequestPromptOptions = { preferEphemeralSession: true };

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** False on any platform but iOS, or while either ID is still a placeholder (or not a GUID). */
export function isMicrosoftSignInConfigured(): boolean {
  return Platform.OS === 'ios' && GUID_RE.test(AZURE_CLIENT_ID) && GUID_RE.test(AZURE_TENANT_ID);
}
