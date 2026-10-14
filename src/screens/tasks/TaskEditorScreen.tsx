// M11 Task editor (sheet from M4 Tasks; 04 §2.1, 08 1.42).
// TODO(Phase 4) — frontend-only rules to reimplement (05 §A.15):
// - Staff only (ADMIN, AGENT, L2_MANAGER): the server has no checks at all (05 C.3); END_USER read-only (D4).
// - Add disabled while the title is blank; payload { title: title.trim(), description: description.trim() ||
//   undefined, dueDate }.
// - dueDate as a full UTC ISO string (toTaskDueDate), never YYYY-MM-DD (05 B.25).
// - Toggle: PUT { status: COMPLETED ↔ OPEN }. Delete asks "Remove this task?".
// - Refetch TKT-3 / TSK-1 after every write (05 B.18).
import type { TicketStackScreenProps } from '@/types';
import { PlaceholderScreen } from '../PlaceholderScreen';

export function TaskEditorScreen({ route }: TicketStackScreenProps<'TaskEditor'>) {
  const editing = route.params.taskId !== undefined;
  return (
    <PlaceholderScreen
      screenId="M11"
      title={editing ? 'Edit task' : 'New task'}
      headerVariant="close"
      visibility="ADMIN, AGENT, L2_MANAGER. END_USER sees tasks read-only in M4."
      endpoints={[
        'TSK-2 · POST /tickets/:ticketId/tasks',
        'TSK-3 · PUT /tickets/:ticketId/tasks/:taskId',
        'TSK-4 · DELETE /tickets/:ticketId/tasks/:taskId',
      ]}
    />
  );
}
