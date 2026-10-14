// M4 Ticket detail (04 §2.1, 08 §5.1).
// TODO(Phase 3–4) — frontend-only rules to reimplement:
// - 05 §A.1 header status drop-down: transition map only; hidden for END_USER; AGENT locked on CLOSED/CANCELED.
// - 05 §A.2 closure targets open M6.
// - 05 §A.3 field-level edit permissions per role (impact/urgency hidden for END_USER; L2 assignee, group and
//   country read-only (D2); resolution read-only for END_USER (D3); `locked` = isResolvedLocked()).
//   Category cascade derivation from ticket.category.level, and what each level change sends.
//   "Auto" pill on priority when impact + urgency are both set.
// - 05 §A.4 "More options": Pick up = TKT-5 { assignedToId: me, teamId } (S5); Assign → M7; Close → M6.
// - 05 §A.6 sanitise description/comment HTML; sandboxed renderer; cid: images → "📎 image in attachments".
// - 05 §A.7 History: audit entries → sentences; never show ipAddress; END_USER hides PRIVATE COMMENTED entries.
// - 05 §A.9 SLA badge (hold-adjusted), §A.10 labels and chips (source chip, impact/urgency colours).
// - 05 §A.15 Tasks: END_USER read-only (D4); staff toggle COMPLETED ↔ OPEN.
// - Notes section (PRIVATE comments) for ADMIN/AGENT only.
// - 05 §C hygiene: call TKT-7/9/10, CMT, ATT, TSK only after TKT-3 succeeded; never render html/svg attachments.
// - 05 B.12 de-duplicate activity across pages (mergeActivityItems); B.18 refetch TKT-3/TKT-7 after every write.
// - Attachment count badge from `_count.attachments` (refetch after uploads).
import { useAuthStore } from '@/store/auth.store';
import type { TicketStackScreenProps } from '@/types';
import { isAgentOrAdmin, isStaff } from '@/utils/roles';
import { canChangeStatus } from '@/utils/ticket-rules';
import { PlaceholderScreen, type PlaceholderAction } from '../PlaceholderScreen';

export function TicketDetailScreen({ navigation, route }: TicketStackScreenProps<'TicketDetail'>) {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const { ticketId } = route.params;

  const actions: PlaceholderAction[] = [
    { label: 'Reply (Conversations FAB → M5)', onPress: () => navigation.navigate('ReplyComposer', { ticketId, mode: 'reply' }) },
  ];
  if (isStaff(role)) {
    actions.push({ label: 'Reply all → M5', onPress: () => navigation.navigate('ReplyComposer', { ticketId, mode: 'replyAll' }) });
  }
  if (isAgentOrAdmin(role)) {
    actions.push({ label: 'Add note → M5', onPress: () => navigation.navigate('ReplyComposer', { ticketId, mode: 'note' }) });
  }
  if (canChangeStatus(role)) {
    actions.push({ label: 'Status drop-down → M6', onPress: () => navigation.navigate('StatusClosure', { ticketIds: [ticketId] }) });
  }
  if (isAgentOrAdmin(role)) {
    actions.push({ label: 'More options › Assign → M7', onPress: () => navigation.navigate('AssignPicker', { ticketIds: [ticketId] }) });
  }
  if (isStaff(role)) {
    actions.push({ label: 'Tasks › Add task → M11', onPress: () => navigation.navigate('TaskEditor', { ticketId }) });
  }

  return (
    <PlaceholderScreen
      screenId="M4"
      title="Ticket detail"
      headerVariant="back"
      visibility="All roles; actions by role. Notes section: ADMIN, AGENT. Status: ADMIN, AGENT, L2. Assign/Pick up: ADMIN, AGENT."
      endpoints={[
        'TKT-3 · GET /tickets/:id',
        'TKT-7 · GET /tickets/:id/activity',
        'TKT-4 · PUT /tickets/:id (field edits — never status)',
        'TKT-5 · POST /tickets/:id/assign',
        'TKT-6 · POST /tickets/:id/status',
        'CMT-1 · GET /tickets/:ticketId/comments',
        'ATT-1 · GET /tickets/:ticketId/attachments',
        'ATT-3 · GET /tickets/:ticketId/attachments/:attachmentId/view',
        'ATT-4 · GET /tickets/:ticketId/attachments/:attachmentId/download',
        'TSK-1 · GET /tickets/:ticketId/tasks',
        'TSK-3 · PUT /tickets/:ticketId/tasks/:taskId',
        'LKP-1 · GET /categories?flat=true',
        'LKP-2 · GET /teams',
      ]}
      actions={actions}
    />
  );
}
