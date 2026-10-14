// M16 Announcements (04 §2.1; drawer item for every role, 08 S1).
// TODO(Phase 4) — frontend-only rules to reimplement:
// - Keep the server's order (pinned first, then type, then newest); do not re-sort (01 ANN-1).
// - Type chip INFO / WARNING / CRITICAL / MAINTENANCE.
// - Expandable body rendered through the HTML sanitiser (05 §A.6): sandboxed, JS disabled, links to browser.
// - Pinned items also appear as the M2 Home banner.
import type { AppDrawerScreenProps } from '@/types';
import { PlaceholderScreen } from '../PlaceholderScreen';

export function AnnouncementsScreen(_props: AppDrawerScreenProps<'Announcements'>) {
  return (
    <PlaceholderScreen
      screenId="M16"
      title="Announcements"
      headerVariant="drawer"
      visibility="All roles (the server targets by role via targetRoles)."
      endpoints={['ANN-1 · GET /announcements/active']}
    />
  );
}
