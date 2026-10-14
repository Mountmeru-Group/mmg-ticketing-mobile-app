// M7 Assign picker (04 §2.1, 08 1.18, §4.2).
// TODO(Phase 4) — frontend-only rules to reimplement (05 §A.4):
// - Group selector first (LKP-2, active groups only), then its members with search.
// - Candidate order: "🌍 Recommended for {country}" (TKT-10) → team members (LKP-2 members[].user) →
//   USR-3 search `role=AGENT,ADMIN` when the group has no members.
// - TKT-10 may include inactive users (05 B.30): cross-check or show them last.
// - "Assign to me" (Pick up), "Remove assignment" ({ assignedToId: null }).
// - Always send teamId when known (05 B.14, 08 S5); refetch TKT-3 afterwards (05 B.18).
// - AGENT locked on CLOSED/CANCELED (isResolvedLocked) — no assignment edits.
// - Bulk mode: same picker applied per ticket, max 20, sequential, stop at the first 429/5xx (08 §4.2).
import type { TicketStackScreenProps } from '@/types';
import { PlaceholderScreen } from '../PlaceholderScreen';

export function AssignPickerScreen({ route }: TicketStackScreenProps<'AssignPicker'>) {
  const count = route.params.ticketIds.length;
  return (
    <PlaceholderScreen
      screenId="M7"
      title={count > 1 ? `Assign ${count} tickets` : 'Assign'}
      headerVariant="close"
      visibility="ADMIN, AGENT only (server 403 for L2_MANAGER and END_USER)."
      endpoints={[
        'TKT-10 · GET /tickets/:id/suggested-assignees',
        'LKP-2 · GET /teams',
        'USR-3 · GET /users/search',
        'TKT-5 · POST /tickets/:id/assign',
      ]}
    />
  );
}
