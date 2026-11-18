// API environments (00-OVERVIEW.md §3) and the rules for choosing one.
// Since 2026-11-17 (Ronit's written brief) the environment is a RUNTIME choice, no longer fixed by the EAS profile. Which
// one is in use, and storing it: src/store/environment.store.ts.
// - A release build (any EAS profile) offers Production and UAT. A fresh install is on Production, always.
// - Since 2026-11-18: the switch is the drawer's "Environment" row, in the account card, for ADMIN only and with no
//   password (permissions.ts canSwitchEnvironment). Any role may USE UAT: a UAT session is kept across restarts for
//   anyone, and the choice persists. Login has no switch, only a "Use Production" link while on UAT.
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

/** Whether this build can switch at all: a release build only. Who may switch: permissions.ts canSwitchEnvironment. */
export const CAN_SWITCH_ENVIRONMENT: boolean = SELECTABLE_ENVIRONMENTS.length > 1;

/** The names the switch sheet and the drawer show. */
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
 * Which backend the app talks to, shown on the UAT chip (Login, the drawer) and on Profile (04 M1, M10):
 * e.g. "UAT · uat-servicedesk.mountmerugroup.com", plus "development build" when __DEV__.
 */
export function environmentLabel(env: AppEnvironment): string {
  return `${env} · ${apiHostFor(env)}${DEVELOPMENT_BUILD ? ' · development build' : ''}`;
}

/**
 * The UAT chip (Login and the drawer's header): whenever UAT is in use, in ANY build and for ANY role, so a person on UAT
 * always knows. Never on Production (2026-11-17; until then it followed the build: on every build but a production
 * release).
 */
export function showEnvironmentChip(env: AppEnvironment): boolean {
  return env === 'UAT';
}

/** The environment chip's word (the drawer's Environment row and header; src/navigation/EnvironmentChip.tsx). */
export const ENVIRONMENT_CHIP_LABELS: Record<AppEnvironment, string> = { PROD: 'PRODUCTION', UAT: 'UAT' };

/**
 * The state chip on a row of the switch sheet (2026-11-18): IN USE on the environment in use; TESTING on UAT otherwise;
 * none on Production otherwise.
 */
export function environmentRowState(env: AppEnvironment, active: AppEnvironment): 'IN USE' | 'TESTING' | null {
  if (env === active) return 'IN USE';
  return env === 'UAT' ? 'TESTING' : null;
}

export const APP_VERSION: string = appJson.expo.version;
