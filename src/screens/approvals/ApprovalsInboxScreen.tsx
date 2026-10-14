// M12 Approvals inbox (04 §2.1, 08 1.47–1.48).
// TODO(Phase F) — frontend-only rules to reimplement:
// - Cards: entity type, title/number when available, requested date, stage.
// - Filter chips All · Tickets · Service requests · Changes, client-side on `entityType` (08 S2; APR-1 is unpaginated).
// - Pull-to-refresh. Drawer badge = pending count.
// - Visibility (08 S1): ADMIN/AGENT always; END_USER/L2 only while APR-1 returns ≥ 1.
// - Never use the unscoped GET /approvals list (05 C.16).
import type { ApprovalsStackScreenProps } from '@/types';
import { PLACEHOLDER_ID, PlaceholderScreen } from '../PlaceholderScreen';

export function ApprovalsInboxScreen({ navigation }: ApprovalsStackScreenProps<'ApprovalsInbox'>) {
  return (
    <PlaceholderScreen
      screenId="M12"
      title="Approvals"
      headerVariant="drawer"
      visibility="ADMIN, AGENT always. END_USER and L2_MANAGER only while they have pending approvals (08 S1)."
      endpoints={['APR-1 · GET /approvals/pending']}
      actions={[
        { label: 'Open an approval → M13', onPress: () => navigation.navigate('ApprovalDetail', { approvalId: PLACEHOLDER_ID }) },
      ]}
    />
  );
}
