// API environments (00-OVERVIEW.md §3) and the rules for choosing one.
// Since 2026-11-17 (Ronit's written brief) the environment is a RUNTIME choice the person makes on Login (the gear on the
// red panel), no longer fixed by the EAS profile. Which one is in use, and storing it: src/store/environment.store.ts.
// - A release build (any EAS profile) offers Production and UAT. A fresh install is on Production, always; a choice
//   is kept until the person changes it.
// - A development build (__DEV__) is UAT only, whatever is stored, and has no switch: PROD is refused here
//   (CLAUDE.md rule 4). This file never reads EXPO_PUBLIC_APP_ENV any more; scripts/eas-build-guard.js refuses a build
//   that still sets it, so nobody thinks it pins the URL.
// - There is deliberately no free-form URL: only the two named environments below.
import appJson from '../../app.json';

export type AppEnvironment = 'UAT' | 'PROD';

const API_BASE_URLS: Record<AppEnvironment, string> = {
  UAT: 'https://uat-servicedesk.mountmerugroup.com/api/v1',
  // PROD — set 2026-10-29 on Ronit's written instruction, for the first Google Play (internal testing) build.
  // Matches the web repo's deploy configuration (00-OVERVIEW §3). A development build refuses it (apiBaseUrlFor), and
  // scripts/eas-build-guard.js refuses every build if it is ever emptied. Keep it on one line in this form: the build
  // guard reads it.
  PROD: 'https://servicedesk.mountmerugroup.com/api/v1',
};

/** Read once, when this file loads: the kind of build cannot change while the app runs. */
const DEVELOPMENT_BUILD: boolean = __DEV__;

/** The environments this build may use, in the switch sheet's order: both in a release build, UAT in a development one. */
export const SELECTABLE_ENVIRONMENTS: readonly AppEnvironment[] = DEVELOPMENT_BUILD ? ['UAT'] : ['PROD', 'UAT'];

/** A fresh install's environment: Production in every release build, UAT in a development build. */
export const DEFAULT_ENVIRONMENT: AppEnvironment = DEVELOPMENT_BUILD ? 'UAT' : 'PROD';

/** Whether Login shows the gear at all: a release build only (the switch applies to release builds only). */
export const CAN_SWITCH_ENVIRONMENT: boolean = SELECTABLE_ENVIRONMENTS.length > 1;

/** The names the switch sheet shows. */
export const ENVIRONMENT_NAMES: Record<AppEnvironment, string> = { PROD: 'Production', UAT: 'UAT' };

export function isAppEnvironment(value: unknown): value is AppEnvironment {
  return value === 'UAT' || value === 'PROD';
}

/** Whether this build may use `env`. A development build may never use PROD. */
export function isSelectableEnvironment(env: unknown): env is AppEnvironment {
  return isAppEnvironment(env) && SELECTABLE_ENVIRONMENTS.includes(env);
}

/** Base for every `/api/v1` endpoint in 01-API-CONTRACT.md, for this environment. Throws for one this build may not use. */
export function apiBaseUrlFor(env: AppEnvironment): string {
  // `__DEV__` first: a release bundle has `false &&` here, so the minifier drops the block and its message
  // (scripts/verify-release-bundle.js checks it). DEVELOPMENT_BUILD: the build this file was loaded as.
  if (__DEV__ && DEVELOPMENT_BUILD) {
    if (env !== 'UAT') {
      throw new Error('Refusing: a development build must never point at production (CLAUDE.md rule 4).');
    }
  }
  const url = API_BASE_URLS[env];
  if (!url) throw new Error(`Refusing: no API URL is configured for ${env}.`);
  return url;
}

/** The backend's host name, e.g. `uat-servicedesk.mountmerugroup.com`. */
export function apiHostFor(env: AppEnvironment): string {
  return apiBaseUrlFor(env).replace(/^https?:\/\//, '').split('/')[0] ?? '';
}

/** SYS-1 lives OUTSIDE `/api/v1`: `https://<host>/health` (01 §1; `/api/health` is not a route). */
export function healthUrlFor(env: AppEnvironment): string {
  return `${apiBaseUrlFor(env).replace(/\/api\/v1$/, '')}/health`;
}

/** `https://uat-servicedesk.mountmerugroup.com`: the web app's origin, where Service Desk email links point. */
export function appOriginFor(env: AppEnvironment): string {
  return apiBaseUrlFor(env).replace(/\/api\/v1\/?$/, '');
}

/**
 * Which backend the app talks to, shown on Login's chip and on Profile so a tester can always tell (04 M1, M10):
 * e.g. "UAT · uat-servicedesk.mountmerugroup.com", plus "development build" when __DEV__.
 */
export function environmentLabel(env: AppEnvironment): string {
  return `${env} · ${apiHostFor(env)}${DEVELOPMENT_BUILD ? ' · development build' : ''}`;
}

/**
 * Login's environment chip: whenever UAT is in use, in ANY build, so a person on UAT always knows. Never on Production
 * (2026-11-17; until then it followed the build: on every build except a production release).
 */
export function showEnvironmentChip(env: AppEnvironment): boolean {
  return env === 'UAT';
}

export const APP_VERSION: string = appJson.expo.version;
