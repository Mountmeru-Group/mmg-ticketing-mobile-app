// M10 Profile — USR-1 read, USR-2 own-profile edit, AUTH-3 sign out (01 §1, §6; 02 §5.5).
// - USR-2 body is ONLY displayName, phone, department, timezone (users.api allow-list). Never countryId (05 C.10),
//   role or isActive. phone/department are cleared with "" (null is a 400).
// - AUTH-2 (/auth/me) stays stale after an edit until re-login (05 B.28), so the signed-in user's name is updated
//   from the USR-2 response, through the auth store's existing setSession (same token, same issuedAt — the session
//   and its 8-hour expiry are unchanged).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { logout } from '@/api/auth.api';
import { endSession } from '@/api/client';
import { assertObject, checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { USER_PROFILE_SPEC, USER_PROFILE_UPDATED_SPEC } from '@/api/responseSpecs';
import { getUser, updateOwnProfile, type UpdateOwnProfileBody } from '@/api/users.api';
import { useAuthStore } from '@/store/auth.store';
import type { UserProfile, UserProfileUpdated } from '@/types';
import { confirmAction } from '@/utils/dialogs';
import { queryKeys } from './queryKeys';
import { refuse, requireOnline, wasRefusedOnDevice } from './writeGuards';

/** USR-1 for the signed-in user. */
export function useProfile() {
  const user = useAuthStore((s) => s.user);
  const id = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.users.profile(id),
    queryFn: async (): Promise<UserProfile> => {
      const res = await getUser(id);
      assertObject<UserProfile>('USR-1', res);
      if (typeof res.id !== 'string') throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from USR-1' });
      checkFields('USR-1', res, USER_PROFILE_SPEC);
      return res;
    },
    enabled: !!id,
  });
}

export interface ProfileForm {
  displayName: string;
  phone: string;
  department: string;
  timezone: string;
}

/** IANA zone name ("Africa/Dar_es_Salaam") or UTC. The server accepts any string; this only catches typos. */
const TIMEZONE_RE = /^(UTC|GMT|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2})$/;

export function validateProfile(form: ProfileForm): string | null {
  if (!form.displayName.trim()) return 'Name is required';
  if (form.displayName.trim().length > 255) return 'Name must be 255 characters or fewer';
  if (form.phone.trim().length > 50) return 'Phone must be 50 characters or fewer';
  if (form.department.trim().length > 255) return 'Department must be 255 characters or fewer';
  if (!form.timezone.trim()) return 'Timezone is required';
  if (!TIMEZONE_RE.test(form.timezone.trim())) return 'Timezone must be a name like Africa/Dar_es_Salaam, or UTC';
  return null;
}

/** Only the fields that changed, trimmed. Empty phone/department are sent as "" to clear them (01 USR-2). */
export function profileChanges(before: Pick<UserProfile, 'displayName' | 'phone' | 'department' | 'timezone'>, form: ProfileForm): UpdateOwnProfileBody {
  const out: UpdateOwnProfileBody = {};
  const name = form.displayName.trim();
  const phone = form.phone.trim();
  const department = form.department.trim();
  const timezone = form.timezone.trim();
  if (name !== before.displayName) out.displayName = name;
  if (phone !== (before.phone ?? '')) out.phone = phone;
  if (department !== (before.department ?? '')) out.department = department;
  if (timezone !== before.timezone) out.timezone = timezone;
  return out;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ form, before }: { form: ProfileForm; before: UserProfile }): Promise<UserProfileUpdated> => {
      requireOnline();
      if (!user) throw refuse('You are not signed in to a real account.');
      const problem = validateProfile(form);
      if (problem) throw refuse(problem);
      const changes = profileChanges(before, form);
      if (Object.keys(changes).length === 0) throw refuse('Nothing has changed.');
      const res = await updateOwnProfile(user.id, changes);
      assertObject<UserProfileUpdated>('USR-2', res);
      checkFields('USR-2', res, USER_PROFILE_UPDATED_SPEC);
      return res;
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData<UserProfile>(queryKeys.users.profile(updated.id), (p) =>
        p
          ? {
              ...p,
              displayName: typeof updated.displayName === 'string' ? updated.displayName : p.displayName,
              phone: updated.phone ?? null,
              department: updated.department ?? null,
              timezone: typeof updated.timezone === 'string' ? updated.timezone : p.timezone,
            }
          : p,
      );
      // 05 B.28: refresh the stored user's name from the USR-2 response. Same token and issuedAt: the session is untouched.
      const { token, issuedAt, user: current } = useAuthStore.getState();
      if (token && issuedAt !== null && current && current.id === updated.id && typeof updated.displayName === 'string' && updated.displayName !== current.displayName) {
        await useAuthStore.getState().setSession({ token, issuedAt, user: { ...current, displayName: updated.displayName } }).catch(() => undefined);
      }
    },
    onSettled: (_res, error) => {
      if (wasRefusedOnDevice(error)) return;
      if (user) void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(user.id), refetchType: 'none' });
    },
  });
}

const LOGOUT_WAIT_MS = 5_000;

/**
 * Sign out (02 §5.5), always after a confirmation: AUTH-3 (result ignored, waits at most 5 s), then the local wipe —
 * SecureStore token, the whole query cache and every store (endSession). The app then shows Login.
 * The 15-day date goes too, so the next sign-in is challenged and starts a new 15 days (02 §5.8).
 */
export function useSignOut() {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    const ok = await confirmAction({
      title: 'Sign out?',
      message: 'You will need to sign in again.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    setSigningOut(true);
    try {
      await Promise.race([
        logout().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS)),
      ]);
    } finally {
      await endSession(null, { forgetFullAuth: true });
      setSigningOut(false);
    }
  }, []);

  return { signOut, signingOut };
}
