// API environment selection (00-OVERVIEW.md §3).
// - UAT is the ONLY allowed target for development and test builds. Every build defaults to UAT.
// - There is deliberately no free-form URL override: a build can only select a named environment,
//   so a development build can never be pointed at production by an env var (CLAUDE.md rule 4).
import appJson from '../../app.json';

export type AppEnvironment = 'UAT' | 'PROD';

const API_BASE_URLS: Record<AppEnvironment, string> = {
  UAT: 'https://uat-servicedesk.mountmerugroup.com/api/v1',
  // ⛔ PROD — INTENTIONALLY EMPTY PLACEHOLDER. Do NOT add the production URL here.
  // It is filled in only after Ronit signs off and the BLOCKING backend asks ship (00-OVERVIEW §3, 06).
  PROD: '',
};

function resolveEnvironment(): AppEnvironment {
  // Inlined at build time by Expo. Must stay a direct `process.env.EXPO_PUBLIC_*` access (no destructuring).
  const requested = process.env.EXPO_PUBLIC_APP_ENV;
  if (requested !== 'PROD') return 'UAT';
  if (__DEV__) {
    throw new Error('Refusing to start: a development build must never point at production (CLAUDE.md rule 4).');
  }
  if (!API_BASE_URLS.PROD) {
    throw new Error('Refusing to start: no PROD API URL is configured (placeholder pending Ronit sign-off).');
  }
  return 'PROD';
}

export const APP_ENV: AppEnvironment = resolveEnvironment();

/** Base for every `/api/v1` endpoint in 01-API-CONTRACT.md. */
export const API_BASE_URL: string = API_BASE_URLS[APP_ENV];

/** SYS-1 lives OUTSIDE `/api/v1`: `https://<host>/health` (01 §1; `/api/health` is not a route). */
export const HEALTH_URL: string = `${API_BASE_URL.replace(/\/api\/v1$/, '')}/health`;

export const APP_VERSION: string = appJson.expo.version;
