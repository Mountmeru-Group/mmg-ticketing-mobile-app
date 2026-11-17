// The environment the app talks to (2026-11-17): the person's choice, stored on this phone until they change it.
// The rules (which environments a build may use, the default, the URLs) are in src/config/env.ts.
// - A fresh install, or a value that is missing, unreadable or not allowed in this build, is the build's default:
//   Production in a release build, UAT in a development build. A development build never uses PROD, whatever is stored.
// - The choice is NOT session state: a sign-out keeps it (it is not one of auth.store's session keys). It changes only
//   through switchEnvironment() (src/api/environmentSwitch.ts), which signs out and clears everything first.
// - Not a secret. It is in SecureStore only because AsyncStorage is not installed (as auth.store's stored user).
// Every request reads the environment in use from here when it is sent (src/api/client.ts): nothing caches a URL.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import {
  DEFAULT_ENVIRONMENT, apiBaseUrlFor, apiHostFor, appOriginFor, healthUrlFor, isSelectableEnvironment,
  type AppEnvironment,
} from '@/config/env';

export const ENVIRONMENT_KEY = 'mmg.app.environment';

/** The stored value as this build may use it: anything else is the build's default. */
export function storedEnvironment(raw: string | null): AppEnvironment {
  return isSelectableEnvironment(raw) ? raw : DEFAULT_ENVIRONMENT;
}

interface EnvironmentState {
  /** The environment in use. The build's default until restoreEnvironment() has read the stored choice. */
  environment: AppEnvironment;
  /** True once restoreEnvironment() has run. Nothing calls the API before then (RootNavigator waits for it). */
  restored: boolean;
  /** Boot: read the stored choice. Never throws: an unreadable Keystore means the default. */
  restoreEnvironment: () => Promise<void>;
  /**
   * Store and use `env`. Only switchEnvironment() calls this, after the sign-out. Refuses an environment this build
   * may not use (a development build and PROD), so the rule holds even if a caller is wrong.
   */
  saveEnvironment: (env: AppEnvironment) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentState>()((set) => ({
  environment: DEFAULT_ENVIRONMENT,
  restored: false,

  restoreEnvironment: async () => {
    let raw: string | null = null;
    try {
      raw = await SecureStore.getItemAsync(ENVIRONMENT_KEY);
    } catch {
      raw = null; // Android Keystore can fail to decrypt after a device restore: as a fresh install.
    }
    set({ environment: storedEnvironment(raw), restored: true });
  },

  saveEnvironment: async (env) => {
    if (!isSelectableEnvironment(env)) throw new Error(`This build cannot use ${env}.`);
    await SecureStore.setItemAsync(ENVIRONMENT_KEY, env);
    set({ environment: env });
  },
}));

// ── The environment in use, for code outside React (the API client, link parsing) ──

export function activeEnvironment(): AppEnvironment {
  return useEnvironmentStore.getState().environment;
}

/** Base for every `/api/v1` endpoint, in the environment in use. */
export function apiBaseUrl(): string {
  return apiBaseUrlFor(activeEnvironment());
}

/** e.g. `servicedesk.mountmerugroup.com`. */
export function apiHost(): string {
  return apiHostFor(activeEnvironment());
}

/** SYS-1 `https://<host>/health`. */
export function healthUrl(): string {
  return healthUrlFor(activeEnvironment());
}

/** The web app's origin in the environment in use: email links to any other host are not followed (utils/deep-links.ts). */
export function appOrigin(): string {
  return appOriginFor(activeEnvironment());
}
