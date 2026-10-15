// AUTH-2 GET /auth/me — the signed-in user as the SERVER sees it (02 §5.1: refresh on every cold start).
// The app shell waits for it, so role, id and country used for list scoping, "My open" and note visibility
// are the token's real ones — never the stored copy or the dev-token screen's placeholder user.
import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/api/auth.api';
import { assertObject, checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { AUTH_ME_SPEC } from '@/api/responseSpecs';
import { useAuthStore } from '@/store/auth.store';
import { USER_ROLES, type AuthMeResponse, type AuthUser } from '@/types';
import { queryKeys } from './queryKeys';

export function useSessionUser() {
  const token = useAuthStore((s) => s.token);
  const updateUser = useAuthStore((s) => s.updateUser);

  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: async (): Promise<AuthUser> => {
      const res = await getMe();
      assertObject<AuthMeResponse>('AUTH-2', res);
      checkFields('AUTH-2', res, AUTH_ME_SPEC);
      const user = res.user as AuthUser | undefined;
      // Role and id drive scoping and gating; without them the app cannot behave correctly.
      if (!user || typeof user.id !== 'string' || !USER_ROLES.includes(user.role)) {
        throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from AUTH-2' });
      }
      await updateUser(user);
      return user;
    },
    enabled: !!token,
    // Once per session: the cache is cleared on sign-out, and a new sign-in starts a new query.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
