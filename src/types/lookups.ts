// Copied verbatim from 03-DATA-MODEL.md §C ("Reference data"). Do not edit by hand.
// Countries, categories, teams, SLA policies, priority matrix and canned responses.
import type { ISODateString, UUID } from './api';
import type { CategoryLevel, TicketImpact, TicketPriority, TicketUrgency, UserRole } from './enums';
import type { UserRef } from './user';

// ── Reference data ───────────────────────────────────────────
/** GET /countries, /countries/my-countries */
export interface Country {
  id: string; code: string; name: string; displayName: string; timezone: string;
  currency: string; dateFormat: string; businessLanguage: string; isActive: boolean;
}
export interface CountryRef { id: string; name: string; displayName: string; }

/** GET /categories?flat=true — one row (ignore `children`) */
export interface Category {
  id: UUID; name: string; description: string | null; parentId: UUID | null; sortOrder: number;
  level: CategoryLevel; isActive: boolean; defaultTeamId: UUID | null; defaultAssigneeId: UUID | null;
  countryId: string | null; keywords: string[]; createdAt: ISODateString;
  defaultTeam: { id: UUID; name: string } | null;
  defaultAssignee: { id: UUID; displayName: string } | null;
  children?: unknown[];   // not filtered by isActive — DO NOT USE
}
/** Ticket.category chain (TICKET_INCLUDE) */
export interface TicketCategoryRef {
  id: UUID; name: string; level: CategoryLevel; parentId: UUID | null;
  parent: {
    id: UUID; name: string; level: CategoryLevel; parentId: UUID | null;
    parent: { id: UUID; name: string; level: CategoryLevel } | null;
  } | null;
}

export interface TeamRef { id: UUID; name: string; }
export interface TeamMember {
  id: UUID; teamId: UUID; userId: UUID; isLead: boolean; joinedAt: ISODateString;
  user: UserRef & { role?: UserRole };        // role only on GET /teams/:id
}
/** GET /teams */
export interface Team {
  id: UUID; name: string; description: string | null; isActive: boolean;
  slaPolicyId: UUID | null; slaPolicyP1Id: UUID | null; slaPolicyP2Id: UUID | null;
  slaPolicyP3Id: UUID | null; slaPolicyP4Id: UUID | null; countryId: string | null;
  createdAt: ISODateString; updatedAt: ISODateString;
  members: TeamMember[];
  slaPolicy: SLAPolicyRef | SLAPolicy | null;  // {id,name} on list; full on GET /teams/:id
}

export interface SLAPolicyRef { id: UUID; name: string; }
export interface SLAPolicy extends SLAPolicyRef {
  description: string | null; isActive: boolean;
  respondTimeUrgent: number; respondTimeHigh: number; respondTimeMedium: number; respondTimeLow: number;
  resolveTimeUrgent: number; resolveTimeHigh: number; resolveTimeMedium: number; resolveTimeLow: number;
  businessHoursOnly: boolean; businessHoursStart: number; businessHoursEnd: number; businessDays: number[];
  timezone: string; operationalHoursId: UUID | null; countryId: string | null;
  createdAt: ISODateString; updatedAt: ISODateString;
}

/** GET /priority-matrix item */
export interface PriorityMatrixEntry { id: UUID; impact: TicketImpact; urgency: TicketUrgency; priority: TicketPriority; }

/** GET /canned-responses → { data: CannedResponse[] } */
export interface CannedResponse { id: UUID; title: string; body: string; category: string | null; }
