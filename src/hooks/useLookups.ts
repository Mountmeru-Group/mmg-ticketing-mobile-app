// Reference data for M3/M4. Phase 3a needs only countries, for the M3 country selector (05 §A.12).
// - Categories (LKP-1) and teams (LKP-2) are not fetched: M4 shows the ticket's own category chain, team and
//   assignee names, which TKT-3 already returns. Nothing is prefetched.
// - Lookups change rarely: cached for 10 minutes (01 LKP-1).
import { useQuery } from '@tanstack/react-query';

import { assertArray, checkFields } from '@/api/drift';
import { listCountries, listMyCountries } from '@/api/lookups.api';
import { COUNTRY_SPEC } from '@/api/responseSpecs';
import { useAuthStore } from '@/store/auth.store';
import type { Country } from '@/types';
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
    enabled: enabled && (role === 'ADMIN' || role === 'AGENT'),
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

/** Display name for a country, with the raw id as a last resort. */
export function countryName(country: Pick<Country, 'displayName' | 'name'> | null | undefined): string | null {
  if (!country) return null;
  return country.displayName || country.name || null;
}
