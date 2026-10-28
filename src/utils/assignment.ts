// Who can be chosen as a ticket's technician, and the group sent with the choice (05 §A.4, B.14, B.30). Shared by the
// assign picker (M7) and the Technician editor on M4, so both offer the same people, in the same order, and send the
// same TKT-5 body. The web's picker, with sources: docs/ROLE-MATRIX.md §15. WHO may assign is not decided here:
// canAssignTickets() in ./permissions.ts. Pure functions, no UI.
import type { SuggestedAssignee, Team, UserRole } from '@/types';
import { formatDisplayName } from './format';

/** USR-3 roles for "Search technicians" when the group has no members (the web: `role=AGENT,ADMIN`, TDP:289). */
export const TECHNICIAN_ROLES: readonly UserRole[] = ['AGENT', 'ADMIN'];

/**
 * USR-3 roles for the create form's "Assign to" search with no group chosen: "END_USERs filtered out" (05 §A.8).
 * iOS: moved here from CreateTicketScreen, which may not name a role (tests/navigation/shell.test.mjs).
 */
export const CREATE_ASSIGNEE_ROLES: readonly UserRole[] = ['ADMIN', 'AGENT', 'L2_MANAGER'];

/**
 * USR-3 roles for a task's technician (M11, TSK-2/TSK-3): staff only. iOS-3c: moved here from TaskEditorScreen, which
 * may not name a role (tests/navigation/shell.test.mjs). WHO may pick one: taskPermissions() in ./permissions.ts.
 */
export const TASK_ASSIGNEE_ROLES: readonly UserRole[] = ['ADMIN', 'AGENT', 'L2_MANAGER'];

export interface Technician {
  id: string;
  displayName: string;
  email: string;
}

/** A technician in a pick list, with a short grey note (why they are listed, or a warning). */
export interface TechnicianOption extends Technician {
  note?: string;
}

export const INACTIVE_TECHNICIAN_NOTE = 'Not in any active group — may be inactive';

/** How a technician is named on screen: the display name, else the email. */
export function technicianName(person: Pick<Technician, 'displayName' | 'email'>): string {
  return formatDisplayName(person.displayName) || person.email;
}

/** A group's members (LKP-2 `members[].user`), by name. */
export function teamMembers(team: Team | undefined): Technician[] {
  return (team?.members ?? [])
    .map((m) => m.user)
    .filter((u): u is NonNullable<typeof u> => !!u && typeof u.id === 'string')
    .map((u) => ({ id: u.id, displayName: u.displayName, email: u.email }))
    .sort((a, b) => formatDisplayName(a.displayName).localeCompare(formatDisplayName(b.displayName)));
}

/**
 * TKT-10's recommended technicians (the ticket's category × its country), in the server's order. They may be inactive
 * (05 B.30): those found in an active group (LKP-2, active groups only) come first; the rest last, `active: false`.
 */
export function recommendedTechnicians(
  suggested: readonly SuggestedAssignee[] | undefined,
  activeTeams: readonly Team[] | undefined,
): (Technician & { active: boolean })[] {
  const inActiveGroup = new Set((activeTeams ?? []).flatMap((t) => (t.members ?? []).map((m) => m.user?.id)));
  const people = (suggested ?? []).map((u) => ({ id: u.id, displayName: u.displayName, email: u.email, active: inActiveGroup.has(u.id) }));
  return [...people.filter((p) => p.active), ...people.filter((p) => !p.active)];
}

/**
 * The Technician editor's list, in the web picker's order (TDP:1809-1849): the recommended people first, then the
 * members of the ticket's group, each person once. The current technician is marked, as the web's "✓ Current".
 */
export function technicianOptions({
  recommended, members, currentId, countryName, groupName,
}: {
  recommended: readonly (Technician & { active: boolean })[];
  members: readonly Technician[];
  currentId: string | null;
  countryName: string | null;
  groupName: string | null;
}): TechnicianOption[] {
  const seen = new Set<string>();
  const options: TechnicianOption[] = [];
  const add = (person: Technician, notes: (string | null)[]) => {
    if (seen.has(person.id)) return;
    seen.add(person.id);
    const note = [person.id === currentId ? 'Current technician' : null, ...notes].filter(Boolean).join(' · ');
    options.push({ id: person.id, displayName: person.displayName, email: person.email, ...(note ? { note } : {}) });
  };
  for (const p of recommended) {
    add(p, [countryName ? `Recommended for ${countryName}` : 'Recommended', p.active ? null : INACTIVE_TECHNICIAN_NOTE]);
  }
  for (const m of members) add(m, [groupName]);
  return options;
}

/**
 * `teamId` for TKT-5: the group's id when the technician is one of its members, so the ticket stays in that group;
 * otherwise none, and the server keeps or chooses the group as on the web (05 B.14). Never null: null cannot clear a
 * group (01 TKT-5). Removing the technician sends no group.
 */
export function assignmentTeamId(
  assignedToId: string | null,
  members: readonly Pick<Technician, 'id'>[],
  teamId: string | null | undefined,
): string | undefined {
  if (!assignedToId || !teamId) return undefined;
  return members.some((m) => m.id === assignedToId) ? teamId : undefined;
}

/** The notice after a successful assignment (M7's wording, used by both). `null`: the technician was removed. */
export function assignmentDoneMessage(name: string | null): string {
  return name === null ? 'Assignment removed' : `Assigned to ${name}`;
}
