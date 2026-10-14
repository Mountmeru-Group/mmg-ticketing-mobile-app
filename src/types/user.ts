// Copied verbatim from 03-DATA-MODEL.md §C ("Users"). Do not edit by hand.
import type { ISODateString, UUID } from './api';
import type { UserRole } from './enums';

// ── Users ────────────────────────────────────────────────────
/** GET /auth/me → { user: AuthUser }  (from session cache; may be stale) */
export interface AuthUser {
  id: UUID; email: string; displayName: string; role: UserRole;
  ldapSamAccount: string | null; countryId: string | null;
}
export interface AuthMeResponse { user: AuthUser; }
export interface AuthConfigResponse { microsoftEnabled: boolean; localAuthEnabled: boolean; }

/** PENDING (A1/A2) — not in the API yet; shape to be agreed with the backend team */
export interface MobileLoginResponse { token: string; expiresAt: ISODateString; user: AuthUser; }

/** GET /users/:id */
export interface UserProfile {
  id: UUID; email: string; displayName: string; role: UserRole; isActive: boolean;
  department: string | null; phone: string | null; timezone: string;
  lastLoginAt: ISODateString | null; createdAt: ISODateString;
}
/** PUT /users/:id response */
export interface UserProfileUpdated {
  id: UUID; email: string; displayName: string; role: UserRole; isActive: boolean;
  department: string | null; phone: string | null; timezone: string;
}
/** GET /users/search */
export interface UserSearchResult { id: UUID; email: string; displayName: string; role: UserRole; }

/** Generic user reference used inside other resources */
export interface UserRef { id: UUID; displayName: string; email: string; }
export interface UserRefWithAvatar extends UserRef { avatarUrl: string | null; }
/** GET /tickets/:id/suggested-assignees item */
export type SuggestedAssignee = UserRefWithAvatar;

/** Ticket.requester (TICKET_INCLUDE) */
export interface TicketRequester extends UserRefWithAvatar {
  phone: string | null; department: string | null; timezone: string; role: UserRole; countryId: string | null;
}
