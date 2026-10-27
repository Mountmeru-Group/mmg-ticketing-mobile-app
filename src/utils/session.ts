// Read-only facts about the signed-in user record.
import type { AuthUser } from '@/types';

/**
 * Before the dev-token screen verified tokens with GET /auth/me, it stored a PLACEHOLDER user with this id (any
 * role, no country). New sign-ins store the real account, but a session saved earlier can still hold the
 * placeholder until it expires (8 h) or you sign out — so the guards below stay.
 */
const DEV_PLACEHOLDER_USER_ID = '00000000-0000-4000-8000-0000000000ff';

export function isPlaceholderUser(user: Pick<AuthUser, 'id'> | null | undefined): boolean {
  return user?.id === DEV_PLACEHOLDER_USER_ID;
}

/**
 * "Pick up" / "Assign to me" send the signed-in user's id as the assignee. With the placeholder user that id is
 * not a real account, so these actions are hidden rather than sent to UAT.
 */
export function canAssignToSelf(user: Pick<AuthUser, 'id'> | null | undefined): boolean {
  return !!user && !isPlaceholderUser(user);
}
