// API environment selection (00-OVERVIEW.md §3).
// - UAT is the ONLY allowed target for development and test builds. Every build defaults to UAT.
// - There is deliberately no free-form URL override: a build can only select a named environment,
//   so a development build can never be pointed at production by an env var (CLAUDE.md rule 4).
import appJson from '../../app.json';

export type AppEnvironment = 'UAT' | 'PROD';

/**
 * iOS (iOS-9b): ONE base URL per bundle. Expo writes EXPO_PUBLIC_APP_ENV into the bundle when it builds it, so a
 * production build reads `'PROD' === 'PROD' ? { PROD } : { UAT }` and the minifier drops the other branch with its URL
 * (the folding that kept the email sign-in out of production bundles in iOS-5g): a production bundle holds the PROD URL
 * and never the UAT one, a preview bundle the reverse (scripts/verify-release-bundle.js proves both, on JS and Hermes).
 * Android keeps both URLs in every bundle (docs/ios/ANDROID-DELTA.md §5).
 * - PROD: approved by Ronit's manager, 2026-11-11 (iOS-9b), for release builds of the `production` EAS profile ONLY:
 *   __DEV__ builds refuse it below, and scripts/eas-build-guard.js refuses PROD on every other profile.
 * - Keep each URL on its own `UAT: '…',` / `PROD: '…',` line: the build guard and the release check read them as text.
 */
const API_BASE_URLS: Partial<Record<AppEnvironment, string>> =
  process.env.EXPO_PUBLIC_APP_ENV === 'PROD'
    ? {
        PROD: 'https://servicedesk.mountmerugroup.com/api/v1',
      }
    : {
        UAT: 'https://uat-servicedesk.mountmerugroup.com/api/v1',
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
export const API_BASE_URL: string = API_BASE_URLS[APP_ENV] ?? '';

/** SYS-1 lives OUTSIDE `/api/v1`: `https://<host>/health` (01 §1; `/api/health` is not a route). */
export const HEALTH_URL: string = `${API_BASE_URL.replace(/\/api\/v1$/, '')}/health`;

/** The backend's host name, e.g. `uat-servicedesk.mountmerugroup.com`. */
export const API_HOST: string = API_BASE_URL.replace(/^https?:\/\//, '').split('/')[0] ?? '';

/**
 * Which backend this build talks to, shown on Login and Profile so a tester can always tell (04 M1, M10):
 * e.g. "UAT · uat-servicedesk.mountmerugroup.com", plus "development build" when __DEV__.
 */
export const ENVIRONMENT_LABEL: string = `${APP_ENV} · ${API_HOST}${__DEV__ ? ' · development build' : ''}`;

/**
 * Login's environment chip (04 M1) is for testers: it shows on every build except production, where it does not
 * render at all (2026-10-30). APP_ENV is PROD only in a release build of the `production` EAS profile (above, and
 * scripts/eas-build-guard.js). Profile (M10) still shows ENVIRONMENT_LABEL on every build.
 */
export const SHOW_ENVIRONMENT_CHIP: boolean = APP_ENV !== 'PROD';

export const APP_VERSION: string = appJson.expo.version;
