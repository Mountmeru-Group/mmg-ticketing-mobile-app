// User endpoints (01 §6).
import type { UserProfile, UserProfileUpdated, UserRole, UserSearchResult } from '@/types';
import { apiClient } from './client';
import { pickDefined, seg } from './helpers';

/**
 * USR-2 body (01 §6). Mobile sends ONLY these four fields — never `countryId` (⚠ the server lets
 * non-admins change their own ticket scope with it, 05 C.10), `role` or `isActive`.
 * `department` and `phone` cannot be null; send "" to clear.
 */
export interface UpdateOwnProfileBody {
  displayName?: string;
  phone?: string;
  department?: string;
  timezone?: string;
}

/**
 * USR-1 — GET /api/v1/users/:id
 * Own profile for M10. No countryId/avatarUrl here — countryId comes from AUTH-2.
 */
export async function getUser(id: string): Promise<UserProfile> {
  const res = await apiClient.get<UserProfile>(`/users/${seg(id)}`);
  return res.data;
}

/**
 * USR-2 — PUT /api/v1/users/:id
 * Own profile edit. AUTH-2 stays stale until re-login, so update the local store from THIS response (05 B.28).
 */
export async function updateOwnProfile(id: string, input: UpdateOwnProfileBody): Promise<UserProfileUpdated> {
  const body = pickDefined(input, ['displayName', 'phone', 'department', 'timezone'] as const);
  const res = await apiClient.put<UserProfileUpdated>(`/users/${seg(id)}`, body);
  return res.data;
}

/**
 * USR-3 — GET /api/v1/users/search?q=&role= (ADMIN, AGENT only; 403 for others).
 * Active users, max 20. Under 2 characters the server returns [] — skip the request.
 */
export async function searchUsers(q: string, roles?: readonly UserRole[]): Promise<UserSearchResult[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const params = { q: term, role: roles && roles.length > 0 ? roles.join(',') : undefined };
  const res = await apiClient.get<UserSearchResult[]>('/users/search', { params });
  return res.data;
}
