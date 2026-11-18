// The environment switch: the drawer's "Environment" row (ADMIN only since 2026-11-18, permissions.ts
// canSwitchEnvironment; the password gate of 2026-11-17 is removed) → EnvironmentSheet → switchEnvironment(). Login has
// no switch; its "Use Production" link (on UAT, signed out) calls this with Production, the default, which anyone may.
// Everything tied to the old environment is ended or cleared BEFORE the new one is stored, in this order:
//   1. push: NTF-6 deletes this phone's device token from the CURRENT environment, while its session still works
//      (then AUTH-3, as an explicit sign-out does). Nothing is sent when there is no session or no token, which is the
//      usual case on Login: an earlier sign-out already did this;
//   2. sign out: the session, the 15-day clock and every session key in SecureStore;
//   3. the whole TanStack Query cache, so no list (and no saved view) from one environment can appear under the other;
//   4. the in-memory filter and period state (ui.store), and what the app learned about the old backend's routes (the
//      email sign-in path, the audit-log path);
//   5. the new environment, stored. RootNavigator shows Login (it follows the auth store).
// Saved filters are the Service Desk's saved views since the second brief of 2026-11-17: each environment has its own
// (its own database), and the app holds them only in the query cache, cleared in step 3.
import { DEFAULT_ENVIRONMENT, isSelectableEnvironment, type AppEnvironment } from '@/config/env';
import { unregisterPushForSignOut } from '@/push/registration';
import { useAuthStore } from '@/store/auth.store';
import { useEnvironmentStore } from '@/store/environment.store';
import { useUiStore } from '@/store/ui.store';
import { canSwitchEnvironment } from '@/utils/permissions';
import { forgetPasswordSignInPath, logout } from './auth.api';
import { forgetAuditLogPath } from './auditLog.api';
import { queryClient } from './queryClient';

/** As useSignOut: AUTH-3's answer is not needed, so it is waited for at most this long. */
const LOGOUT_WAIT_MS = 5_000;

/** Why a move off Production is refused for anyone but a signed-in ADMIN. */
export const ADMIN_ONLY_SWITCH = 'Only an administrator can change the environment.';

/**
 * Switch to `next`: signs out and clears everything above, then stores it. Throws, changing nothing:
 * - for an environment this build may not use (a development build can never switch to PROD);
 * - for any environment but the default (Production), unless the person signed in may switch (canSwitchEnvironment:
 *   ADMIN). The drawer offers the row to no one else; this is the last guard behind it.
 * Back to Production needs no role: Login's "Use Production" link runs it signed out.
 * A no-op when `next` is in use.
 */
export async function switchEnvironment(next: AppEnvironment): Promise<void> {
  if (!isSelectableEnvironment(next)) throw new Error(`This build cannot use ${String(next)}.`);
  if (next === useEnvironmentStore.getState().environment) return;
  if (next !== DEFAULT_ENVIRONMENT && !canSwitchEnvironment(useAuthStore.getState().user?.role)) {
    throw new Error(ADMIN_ONLY_SWITCH);
  }

  // 1. On the current environment, while its session is still valid. Never throws; bounded (UNREGISTER_WAIT_MS).
  await unregisterPushForSignOut();
  if (useAuthStore.getState().isAuthenticated) {
    await Promise.race([logout().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS))]);
  }

  // 2. Sign out: session, the 15-day clock (so the next sign-in is challenged), SecureStore.
  await useAuthStore.getState().clearSession(null, { forgetFullAuth: true });

  // 3. Every cached response from the old environment, its saved views included.
  queryClient.clear();

  // 4. Filters, search, sort, country, the Home period; learned routes.
  useUiStore.getState().reset();
  forgetPasswordSignInPath();
  forgetAuditLogPath();

  // 5. Only now the new environment. From here every request goes there (client.ts reads it per request).
  await useEnvironmentStore.getState().saveEnvironment(next);
}
