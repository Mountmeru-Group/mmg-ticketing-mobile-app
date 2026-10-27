// Copied verbatim from 03-DATA-MODEL.md §C (`TicketTaskEmbedded` from "Tickets"; "Tasks"). Do not edit by hand.
import type { ISODateString, UUID } from './api';
import type { TaskStatus } from './enums';
import type { UserRef, UserRefWithAvatar } from './user';

export interface TicketTaskEmbedded {
  id: UUID; ticketId: UUID; title: string; description: string | null; assignedToId: UUID | null;
  status: TaskStatus; dueDate: ISODateString | null; sortOrder: number; completedAt: ISODateString | null;
  createdAt: ISODateString; updatedAt: ISODateString;
  assignedTo: UserRef | null;                  // no avatarUrl inside tickets
}

// ── Tasks ────────────────────────────────────────────────────
export interface TicketTask extends Omit<TicketTaskEmbedded, 'assignedTo'> {
  assignedTo: UserRefWithAvatar | null;
}
export interface TaskBody {
  title?: string; description?: string | null; assignedToId?: UUID | null;
  status?: TaskStatus; dueDate?: ISODateString | null /* full UTC ISO 'Z' */; sortOrder?: number;
}
