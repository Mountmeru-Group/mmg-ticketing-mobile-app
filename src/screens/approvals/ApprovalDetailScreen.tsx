// M13 Approval detail + Take action (04 §2.1, 08 1.49–1.50).
// TODO(Phase F) — frontend-only rules to reimplement:
// - `ticket`: try TKT-3 by entityId; show subject, description, public conversation and attachments ONLY on 200.
//   On 403 show "You can approve this, but the details are not available on mobile" — no fallback (08 S8).
//   Never rely on the AGENT scope gap (05 C.6) to make this screen work.
// - `service_request`: embedded `serviceRequest`. `change`: { changeNumber, title, status } only, plus
//   "Open on web for full change details" (08 S2).
// - Take action → comments → Approve (comment optional) / Reject (comment required: "Rejection reason required").
// - After a decision show "Ticket stays Pending Management Review until a technician moves it" (05 B.22).
// - Sanitise any HTML (05 §A.6).
import type { ApprovalsStackScreenProps } from '@/types';
import { PlaceholderScreen } from '../PlaceholderScreen';

export function ApprovalDetailScreen(_props: ApprovalsStackScreenProps<'ApprovalDetail'>) {
  return (
    <PlaceholderScreen
      screenId="M13"
      title="Approval"
      headerVariant="back"
      visibility="The approver (any role)."
      endpoints={[
        'APR-2 · POST /approvals/:id/approve',
        'APR-3 · POST /approvals/:id/reject',
        'TKT-3 · GET /tickets/:id (best effort, by entityId)',
        'TKT-7 · GET /tickets/:id/activity',
        'ATT-1 · GET /tickets/:ticketId/attachments',
        'ATT-3 · GET /tickets/:ticketId/attachments/:attachmentId/view',
      ]}
    />
  );
}
