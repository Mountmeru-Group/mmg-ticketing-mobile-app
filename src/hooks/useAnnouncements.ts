// M16 Announcements + the Home banner — ANN-1 GET /announcements/active (01 §10.2). Read-only.
// The server filters by date and by my role, and orders pinned first, then type, then newest: the app keeps that
// order. "Dismiss" hides one from the Home banner for this session only (ui.store), with no server call.
import { useQuery } from '@tanstack/react-query';

import { listActiveAnnouncements } from '@/api/announcements.api';
import { assertArray, checkFields } from '@/api/drift';
import { ANNOUNCEMENT_SPEC } from '@/api/responseSpecs';
import { useAuthStore } from '@/store/auth.store';
import type { Announcement } from '@/types';
import { queryKeys } from './queryKeys';

export function useAnnouncements() {
  const signedIn = useAuthStore((s) => !!s.user);
  return useQuery({
    queryKey: queryKeys.announcements.active(),
    queryFn: async (): Promise<Announcement[]> => {
      const res = await listActiveAnnouncements();
      assertArray<Announcement>('ANN-1', res);
      checkFields('ANN-1', res[0], ANNOUNCEMENT_SPEC, '[0].');
      return res.filter((a) => a && typeof a.id === 'string');
    },
    enabled: signedIn,
  });
}
