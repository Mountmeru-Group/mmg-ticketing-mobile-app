// Lookup endpoints (01 §7). Priorities and statuses are enums, not endpoints (03 §A) — there is no
// /priorities or /statuses route; calling one returns 200 HTML in production.
import type { CannedResponse, Category, Country, PriorityMatrixEntry, Team } from '@/types';
import { apiClient } from './client';

/**
 * LKP-1 — GET /api/v1/categories?flat=true
 * Always flat: every row at every level is then active (05 B.15). Build the 3-level tree client-side from
 * `parentId` + `level`, ignore nested `children`, sort each level by name. Cache ~10 minutes.
 */
export async function listCategories(): Promise<Category[]> {
  const res = await apiClient.get<Category[]>('/categories', { params: { flat: 'true' } });
  return res.data;
}

/**
 * LKP-2 — GET /api/v1/teams (ADMIN, AGENT only; 403 for others).
 * Includes inactive teams — filter `isActive: false` out. Use `members[].user` directly (no per-team GET).
 * `countryId` is an exact match; omit it for all teams.
 */
export async function listTeams(countryId?: string): Promise<Team[]> {
  const res = await apiClient.get<Team[]>('/teams', { params: { countryId } });
  return res.data;
}

/**
 * LKP-4 — GET /api/v1/countries/my-countries
 * Countries the user may pick: ADMIN all; others with a country only theirs; others without one all.
 */
export async function listMyCountries(): Promise<Country[]> {
  const res = await apiClient.get<Country[]>('/countries/my-countries');
  return res.data;
}

/** LKP-5 — GET /api/v1/countries. All active countries, by name. */
export async function listCountries(): Promise<Country[]> {
  const res = await apiClient.get<Country[]>('/countries');
  return res.data;
}

/**
 * LKP-6 — GET /api/v1/priority-matrix (ADMIN, AGENT only; 403 for others).
 * Preview only: the server computes the priority itself on TKT-2/TKT-4, and the app never sends `priority`.
 * ⚠ Writes on GET: an empty table is seeded with 9 default rows (01 LKP-6).
 */
export async function getPriorityMatrix(): Promise<PriorityMatrixEntry[]> {
  const res = await apiClient.get<PriorityMatrixEntry[]>('/priority-matrix');
  return res.data;
}

/**
 * LKP-7 — GET /api/v1/canned-responses: reply templates for the composer. Any role on the server; staff only on
 * mobile, as on the web (01 LKP-7). Wrapped `{ data }`, active only, ordered by category then title, no pagination.
 * `search` matches title or body; `category` is exact. `body` is HTML.
 */
export async function listCannedResponses(query: { search?: string; category?: string } = {}): Promise<{ data: CannedResponse[] }> {
  const res = await apiClient.get<{ data: CannedResponse[] }>('/canned-responses', { params: query });
  return res.data;
}
