// iOS-3a ports the read screens before the write ones (docs/ios/00-PORT-MANIFEST.md §6). Until iOS-3b ports the write
// sheets, every control on these screens that would change a ticket is left out: not disabled, and not marked "coming
// soon" (App Review 2.1; docs/ios/APP-STORE-COMPLIANCE.md A2). The screens keep Android's code, which renders each write
// control from the lists and flags below, so an empty list or a false flag means no control at all.
// - The role rules stay in permissions.ts, unchanged and pinned by tests/rbac: this only takes away what the phase has
//   not built. The read flags (private notes, impact and urgency, reply recipients) pass through as they are.
// - iOS-3b: set WRITE_CONTROLS to true, then delete this file and unwrap its calls.
import type { FieldAccess, TicketDetailPermissions, TicketFieldPermissions } from './permissions';

/** False in iOS-3a: no screen offers a write. */
export const WRITE_CONTROLS: boolean = false;

/** M4's role answers without the writes: no status card, More options, composer buttons, file or task changes. */
export function readOnlyDetail(can: TicketDetailPermissions): TicketDetailPermissions {
  if (WRITE_CONTROLS) return can;
  return {
    ...can,
    // The AGENT lock only explains a missing write (the status card, "Add files"); with no writes there is nothing to
    // explain.
    locked: false,
    statusBar: false,
    transitions: [],
    moreActions: [],
    conversationActions: [],
    addAttachments: false,
    deleteAttachments: false,
    editTasks: false,
  };
}

const VIEW: FieldAccess = { mode: 'view' };
const readOnlyAccess = (access: FieldAccess): FieldAccess => (access.mode === 'hidden' ? access : VIEW);

/** M4's property editors without the writes: every field shows its value only, and a hidden field stays hidden. */
export function readOnlyFields(can: TicketFieldPermissions): TicketFieldPermissions {
  if (WRITE_CONTROLS) return can;
  return {
    impact: readOnlyAccess(can.impact),
    urgency: readOnlyAccess(can.urgency),
    category: readOnlyAccess(can.category),
    country: readOnlyAccess(can.country),
    resolution: readOnlyAccess(can.resolution),
    technician: readOnlyAccess(can.technician),
    priorityPreview: false,
  };
}

/** A list of write actions (M3's selection bar, a card's status chip): empty while writes are off. */
export function readOnlyActions<T>(actions: readonly T[]): readonly T[] {
  return WRITE_CONTROLS ? actions : [];
}
