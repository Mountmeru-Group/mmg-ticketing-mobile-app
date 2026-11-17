// The environment switch (2026-11-17, Ronit's written brief): Login's gear → EnvironmentSheet → switchEnvironment().
// Everything tied to the old environment is ended or cleared BEFORE the new one is stored, in this order:
//   1. push: NTF-6 deletes this phone's device token from the CURRENT environment, while its session still works
//      (then AUTH-3, as an explicit sign-out does). Nothing is sent when there is no session or no token, which is the
//      usual case on Login: an earlier sign-out already did this;
//   2. sign out: the session, the 15-day clock and every session key in SecureStore;
//   3. the whole TanStack Query cache, so no list from one environment can appear under the other;
//   4. the in-memory filter and period state (ui.store), the in-memory saved-filter list, and what the app learned
//      about the old backend's routes (the email sign-in path, the audit-log path);
//   5. the new environment, stored. RootNavigator already shows Login (it follows the auth store).
// Saved filters on the phone are NOT deleted: they are kept per user AND per environment (savedFilters.store.ts), so a
// UAT filter is simply never offered on production.
import { isSelectableEnvironment, type AppEnvironment } from '@/config/env';
import { unregisterPushForSignOut } from '@/push/registration';
import { useAuthStore } from '@/store/auth.store';
import { useEnvironmentStore } from '@/store/environment.store';
import { useSavedFiltersStore } from '@/store/savedFilters.store';
import { useUiStore } from '@/store/ui.store';
import { forgetPasswordSignInPath, logout } from './auth.api';
import { forgetAuditLogPath } from './auditLog.api';
import { queryClient } from './queryClient';

/** As useSignOut: AUTH-3's answer is not needed, so it is waited for at most this long. */
const LOGOUT_WAIT_MS = 5_000;

/**
 * Switch to `next`: signs out and clears everything above, then stores it. Throws (and changes nothing) for an
 * environment this build may not use: a development build can never switch to PROD. A no-op when `next` is in use.
 */
export async function switchEnvironment(next: AppEnvironment): Promise<void> {
  if (!isSelectableEnvironment(next)) throw new Error(`This build cannot use ${String(next)}.`);
  if (next === useEnvironmentStore.getState().environment) return;

  // 1. On the current environment, while its session is still valid. Never throws; bounded (UNREGISTER_WAIT_MS).
  await unregisterPushForSignOut();
  if (useAuthStore.getState().isAuthenticated) {
    await Promise.race([logout().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS))]);
  }

  // 2. Sign out: session, the 15-day clock (so the next sign-in is challenged), SecureStore.
  await useAuthStore.getState().clearSession(null, { forgetFullAuth: true });

  // 3. Every cached response from the old environment.
  queryClient.clear();

  // 4. Filters, search, sort, country, the Home period; the saved-filter list in memory; learned routes.
  useUiStore.getState().reset();
  useSavedFiltersStore.getState().reset();
  forgetPasswordSignInPath();
  forgetAuditLogPath();

  // 5. Only now the new environment. From here every request goes there (client.ts reads it per request).
  await useEnvironmentStore.getState().saveEnvironment(next);
}
