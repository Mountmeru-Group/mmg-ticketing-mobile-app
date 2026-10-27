// Role helpers for UI gating. Gating mirrors the web UI for UX only; the server stays the authority
// (05 §C rule 3). Do not add checks that "fix" a server gap.
import type { AuthUser, UserRole } from '@/types';

/** Display labels — never show raw enums (08 S3). */
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  AGENT: 'Technician',
  END_USER: 'User',
  L2_MANAGER: 'L2 Manager',
};

/** `isStaff = role !== 'END_USER'` (05 §A.8) — includes L2_MANAGER. */
export function isStaff(role: UserRole): boolean {
  return role !== 'END_USER';
}

/** Server `agentOrAdmin` guard (02 §1.5): assign, pick up, teams, user search, private notes. */
export function isAgentOrAdmin(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'AGENT';
}

/** UI definition of a triage agent: AGENT with no countryId (05 §A.12). The server's list (A4) is invisible to us. */
export function isTriageAgent(user: Pick<AuthUser, 'role' | 'countryId'>): boolean {
  return user.role === 'AGENT' && !user.countryId;
}

/** Country-locked agent: forced to their own country (05 §A.12). */
export function isCountryLockedAgent(user: Pick<AuthUser, 'role' | 'countryId'>): boolean {
  return user.role === 'AGENT' && !!user.countryId;
}
