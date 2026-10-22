// Copied verbatim from 03-DATA-MODEL.md §C ("Tickets", "Ticket list query (TKT-1)", "Ticket request bodies",
// "Activity (TKT-7)"). Do not edit by hand.
import type { ISODateString, UUID } from './api';
import type { AttachmentLite } from './attachment';
import type { Comment } from './comment';
import type {
  AuditAction, CLOSURE_CODES, SLAStatus, TicketImpact, TicketPriority, TicketSource, TicketStatus, TicketUrgency,
} from './enums';
import type { CountryRef, SLAPolicy, SLAPolicyRef, TeamRef, TicketCategoryRef } from './lookups';
import type { TicketTaskEmbedded } from './task';
import type { TicketRequester, UserRefWithAvatar } from './user';

// ── Tickets ──────────────────────────────────────────────────
/** Scalars + TICKET_INCLUDE — returned by TKT-1 (rows), TKT-2, TKT-4, TKT-5, TKT-6 */
export interface Ticket {
  id: UUID; ticketNumber: number; title: string; description: string /* HTML */;
  status: TicketStatus; priority: TicketPriority; impact: TicketImpact | null; urgency: TicketUrgency | null;
  source: TicketSource;
  requesterId: UUID; assignedToId: UUID | null; teamId: UUID | null; categoryId: UUID | null; countryId: string | null;
  tags: string[]; slaPolicyId: UUID | null; slaStatus: SLAStatus;
  firstResponseAt: ISODateString | null; resolvedAt: ISODateString | null; closedAt: ISODateString | null;
  slaResponseDue: ISODateString | null; slaResolveDue: ISODateString | null;
  slaBreachedAt: ISODateString | null; slaBreachNotifiedAt: ISODateString | null;
  slaHoldStartedAt: ISODateString | null; slaHoldMinutes: number;
  lastRequesterReplyAt?: ISODateString | null;  // guaranteed only on TKT-1
  emailMessageId: string | null; emailThreadId: string | null;
  level: string | null; mode: string | null;
  resolution: string | null; closureCode: string | null; isFcr: boolean | null; closureComments: string | null;
  customFields: Record<string, unknown> | null;
  createdAt: ISODateString; updatedAt: ISODateString;
  // relations (TICKET_INCLUDE)
  requester: TicketRequester;
  assignedTo: UserRefWithAvatar | null;
  team: TeamRef | null;
  country: CountryRef | null;
  category: TicketCategoryRef | null;
  slaPolicy: SLAPolicyRef | null;
  _count: { comments: number; attachments: number };
  tasks: TicketTaskEmbedded[];
}
/** GET /tickets/:id — same, but slaPolicy is the full row */
export interface TicketDetail extends Omit<Ticket, 'slaPolicy'> { slaPolicy: SLAPolicy | null; }

/** GET /tickets/:id/sla */
export interface TicketSlaInfo {
  slaStatus: SLAStatus; slaResponseDue: ISODateString | null; slaResolveDue: ISODateString | null;
  firstResponseAt: ISODateString | null; resolvedAt: ISODateString | null; slaBreachedAt: ISODateString | null;
  policy: SLAPolicy | null;
}
/** GET /tickets/:id/email-recipients */
export interface EmailRecipients { to: string[]; cc: string[]; from: string; }

// ── Ticket list query (TKT-1) ────────────────────────────────
export interface TicketListQuery {
  page?: number; limit?: number;                 // NEVER `pageSize`
  status?: string;                               // single or comma list of TicketStatus
  priority?: TicketPriority; impact?: TicketImpact; urgency?: TicketUrgency;
  assignedToId?: UUID | 'unassigned'; teamId?: UUID; categoryId?: UUID; requesterId?: UUID;
  sla?: SLAStatus; fromDate?: string; toDate?: string;   // 'YYYY-MM-DD' (UTC days)
  search?: string; countryId?: string;           // '' = all countries (key present)
  sortBy?: 'priority' | 'sla';                   // omit = updatedAt desc
}

// ── Ticket request bodies (per-role allow-lists — see 01 TKT-2/4/6) ──
export interface CreateTicketBodyEndUser {
  title: string; description: string; categoryId: UUID; source: TicketSource;
}
export interface CreateTicketBodyStaff extends CreateTicketBodyEndUser {
  impact?: TicketImpact; urgency?: TicketUrgency; teamId?: UUID; assignedToId?: UUID; requesterId?: UUID;
}
export interface UpdateTicketBody {           // staff fields; END_USER: title/description only
  title?: string; description?: string; categoryId?: UUID | null; impact?: TicketImpact; urgency?: TicketUrgency;
  teamId?: UUID | null; assignedToId?: UUID | null; tags?: string[]; resolution?: string; countryId?: string | null;
  priority?: TicketPriority;                  // ADMIN/AGENT only, = the LKP-6 value, only with impact/urgency (01 TKT-4, G2)
}
export interface AssignTicketBody { assignedToId?: UUID | null; teamId?: UUID; }
export interface ChangeStatusBody {
  status: TicketStatus;
  resolution?: string; closureCode?: typeof CLOSURE_CODES[number]; isFcr?: boolean; closureComments?: string;
}

// ── Activity (TKT-7) ─────────────────────────────────────────
export interface ActivityCommentItem extends Omit<Comment, 'attachments' | 'author'> {
  _type: 'comment';
  author: UserRefWithAvatar;
  attachments: AttachmentLite[];
}
export interface ActivityAuditItem {
  _type: 'audit';
  id: UUID; ticketId: UUID | null; actorId: UUID | null; action: AuditAction;
  entityType: string; entityId: string;
  oldValues: Record<string, unknown> | null;   // may contain _<key>Name enrichments
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;                     // never display
  createdAt: ISODateString;
  actor: { id: UUID; displayName: string } | null;
}
export type ActivityItem = ActivityCommentItem | ActivityAuditItem;
