// Reference data and pickers' read queries (all GET). Each loads only when its screen or picker needs it —
// nothing is prefetched. Lookups change rarely: cached for 10 minutes (01 LKP-1).
import { useQuery } from '@tanstack/react-query';

import { assertArray, assertObject, checkFields } from '@/api/drift';
import { getPriorityMatrix, listCategories, listCountries, listMyCountries, listTeams } from '@/api/lookups.api';
import {
  CATEGORY_SPEC, COUNTRY_SPEC, EMAIL_RECIPIENTS_SPEC, PRIORITY_MATRIX_SPEC, TEAM_SPEC, USER_REF_SPEC,
} from '@/api/responseSpecs';
import { getEmailRecipients, getSuggestedAssignees } from '@/api/tickets.api';
import { searchUsers } from '@/api/users.api';
import { useAuthStore } from '@/store/auth.store';
import type {
  Category, Country, EmailRecipients, PriorityMatrixEntry, SuggestedAssignee, Team, UserRole, UserSearchResult,
} from '@/types';
import { isAgentOrAdmin, isStaff } from '@/utils/roles';
import { queryKeys } from './queryKeys';

const LOOKUP_STALE_TIME_MS = 10 * 60_000;

/**
 * Countries for the selector. Source per 05 §A.12: AGENT → LKP-4 `my-countries` (a triage agent gets every
 * active country, a country agent only theirs); ADMIN → LKP-5 `countries`.
 * Pass `enabled: false` until the list is actually needed (the picker opens, or a locked chip needs its name).
 */
export function useCountryOptions({ enabled }: { enabled: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  const source = role === 'ADMIN' ? 'all' : 'mine';

  return useQuery({
    queryKey: queryKeys.lookups.countries(source),
    queryFn: async (): Promise<Country[]> => {
      const res = source === 'all' ? await listCountries() : await listMyCountries();
      const endpoint = source === 'all' ? 'LKP-5' : 'LKP-4';
      assertArray<Country>(endpoint, res);
      checkFields(endpoint, res[0], COUNTRY_SPEC, '[0].');
      return res;
    },
    enabled: enabled && role !== undefined && isAgentOrAdmin(role),
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

/** LKP-1 `GET /categories?flat=true` — always flat (05 B.15); the 3-level tree is built on the device. */
export function useCategories({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: queryKeys.lookups.categories(),
    queryFn: async (): Promise<Category[]> => {
      const res = await listCategories();
      assertArray<Category>('LKP-1', res);
      checkFields('LKP-1', res[0], CATEGORY_SPEC, '[0].');
      return res;
    },
    enabled,
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

/**
 * LKP-6 `GET /priority-matrix` — ADMIN and AGENT only (403 otherwise, so it is never requested for anyone else).
 * Loaded when the impact/urgency editor opens. Preview only: the server's computed priority always wins.
 */
export function usePriorityMatrix({ enabled }: { enabled: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: queryKeys.lookups.priorityMatrix(),
    queryFn: async (): Promise<PriorityMatrixEntry[]> => {
      const res = await getPriorityMatrix();
      assertArray<PriorityMatrixEntry>('LKP-6', res);
      checkFields('LKP-6', res[0], PRIORITY_MATRIX_SPEC, '[0].');
      return res;
    },
    enabled: enabled && !!role && isAgentOrAdmin(role),
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

/** Module-level so the selected array keeps its identity between renders (screens use it in effect deps). */
const activeTeamsOnly = (teams: Team[]) => teams.filter((t) => t.isActive !== false);

/**
 * LKP-2 `GET /teams` — ADMIN and AGENT only (403 otherwise). Inactive groups are dropped (01 LKP-2), except for the M3
 * group filter (`includeInactive`), which lists every group as the web's does (docs/G2-WEB-FILTERS.md §2).
 */
export function useTeams({ enabled, includeInactive = false }: { enabled: boolean; includeInactive?: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: queryKeys.lookups.teams(),
    queryFn: async (): Promise<Team[]> => {
      const res = await listTeams();
      assertArray<Team>('LKP-2', res);
      checkFields('LKP-2', res[0], TEAM_SPEC, '[0].');
      return res;
    },
    select: includeInactive ? undefined : activeTeamsOnly,
    enabled: enabled && !!role && isAgentOrAdmin(role),
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

/**
 * USR-3 `GET /users/search` typeahead — ADMIN and AGENT only. Pass an already-debounced term; under 2
 * characters nothing is requested (the server would answer `[]` anyway).
 */
export function useUserSearch(term: string, { roles = [], enabled }: { roles?: readonly UserRole[]; enabled: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  const q = term.trim();
  return useQuery({
    queryKey: queryKeys.users.search(q, roles),
    queryFn: async (): Promise<UserSearchResult[]> => {
      const res = await searchUsers(q, roles);
      assertArray<UserSearchResult>('USR-3', res);
      checkFields('USR-3', res[0], USER_REF_SPEC, '[0].');
      return res;
    },
    enabled: enabled && q.length >= 2 && !!role && isAgentOrAdmin(role),
  });
}

/** TKT-10 recommended technicians — ADMIN and AGENT only. May include inactive users (05 B.30). */
export function useSuggestedAssignees(ticketId: string, { enabled }: { enabled: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: queryKeys.tickets.suggested(ticketId),
    queryFn: async (): Promise<SuggestedAssignee[]> => {
      const res = await getSuggestedAssignees(ticketId);
      assertArray<SuggestedAssignee>('TKT-10', res);
      checkFields('TKT-10', res[0], USER_REF_SPEC, '[0].');
      return res;
    },
    enabled: enabled && !!ticketId && !!role && isAgentOrAdmin(role),
  });
}

/** TKT-9 Reply-All recipients — ADMIN, AGENT and L2_MANAGER only (01 TKT-9). */
export function useEmailRecipients(ticketId: string, { enabled }: { enabled: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: queryKeys.tickets.recipients(ticketId),
    queryFn: async (): Promise<EmailRecipients> => {
      const res = await getEmailRecipients(ticketId);
      assertObject<EmailRecipients>('TKT-9', res);
      checkFields('TKT-9', res, EMAIL_RECIPIENTS_SPEC);
      return res;
    },
    enabled: enabled && !!ticketId && !!role && isStaff(role),
    retry: false, // on error the composer falls back to the requester's address (05 §A.5)
  });
}

/** Display name for a country, with the raw id as a last resort. */
export function countryName(country: Pick<Country, 'displayName' | 'name'> | null | undefined): string | null {
  if (!country) return null;
  return country.displayName || country.name || null;
}
