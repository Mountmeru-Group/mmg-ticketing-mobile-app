// Account deletion, started in the app (iOS-4; docs/ios/APP-STORE-COMPLIANCE.md H6; App Review 5.1.1(v)).
// The Service Desk has no deletion endpoint, so the request is a ticket for IT, raised through the EXISTING TKT-2
// (POST /tickets) by useCreateTicket(): the same validation as Create Ticket (validateNewTicket), the same per-role
// allow-list (tickets.api.ts), and the same online and role guards. No new endpoint, no backend change.
// - Fields sent: title, description (as <p> HTML, by useCreateTicket), categoryId and source. Never priority, impact or
//   urgency for any role, so the server stores its default priority (01 TKT-2).
// - The category: the one named in config/legal.ts ACCOUNT_DELETION_CATEGORY, found by exact name in LKP-1.
// - Nothing is sent until the person confirms (Profile › Account › Request Account Deletion → confirmation Alert).
// Pure functions only, so the Node tests check the exact text and payload.
import type { AuthUser, Category } from '@/types';
import { formatDateTime, formatDisplayName } from './format';
import { ROLE_LABELS } from './roles';

/** What Profile's Account card shows: each row only once its release value is set (config/legal.ts). */
export function accountRows(config: {
  privacyPolicyUrl: string;
  deletionCategory: string;
  deletionWorkingDays: number;
}): { privacyPolicy: boolean; requestDeletion: boolean } {
  return {
    privacyPolicy: /^https:\/\/\S+$/.test(config.privacyPolicyUrl.trim()),
    requestDeletion: config.deletionCategory.trim() !== '' && Number.isInteger(config.deletionWorkingDays) && config.deletionWorkingDays > 0,
  };
}

/** The category to file the request under: the one with exactly this name (case and outer spaces ignored), if active. */
export function findDeletionCategory(categories: readonly Category[], name: string): Category | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return categories.find((c) => c.isActive !== false && c.name.trim().toLowerCase() === wanted) ?? null;
}

export const DELETION_CONFIRM_TITLE = 'Request account deletion?';
export const DELETION_CONFIRM_LABEL = 'Send Request';

/** The confirmation's message: what happens, how long it takes, and what may be kept (App Review 5.1.1(v) guidance). */
export function deletionConfirmMessage(workingDays: number): string {
  const days = `${workingDays} working ${workingDays === 1 ? 'day' : 'days'}`;
  return [
    'This asks Mount Meru IT to delete your Service Desk account and the personal data linked to it.',
    `IT completes it by hand within ${days} and replies on the request ticket.`,
    'Records Mount Meru must keep, such as tickets you raised, may be kept.',
    'Your Mount Meru work account (Microsoft) is not affected.',
    'If you sign in to Setu again, a new Service Desk account is created.',
  ].join(' ');
}

/** The ticket's title, within TKT-2's 3–255 characters. */
export function deletionTicketTitle(user: Pick<AuthUser, 'displayName' | 'email'>): string {
  const who = formatDisplayName(user.displayName) || user.email || 'unknown user';
  return `Account deletion request: ${who}`.slice(0, 255);
}

/**
 * The ticket's description, as plain text (useCreateTicket sends it as <p> HTML, 05 §A.16): who is asking, from where
 * and when, and what IT is asked to do.
 */
export function deletionTicketDescription(
  user: Pick<AuthUser, 'id' | 'displayName' | 'email' | 'role'>,
  { appVersion, requestedAt }: { appVersion: string; requestedAt: Date },
): string {
  return [
    'Please delete my Service Desk account and the personal data linked to it.',
    [
      `Name: ${formatDisplayName(user.displayName) || '—'}`,
      `Email: ${user.email || '—'}`,
      `Role: ${ROLE_LABELS[user.role] ?? user.role}`,
      `Service Desk user ID: ${user.id}`,
      `Sent from: Setu for iPhone ${appVersion}, Profile › Request Account Deletion, ${formatDateTime(requestedAt)}`,
    ].join('\n'),
    'This request was made in the app after a confirmation. Please reply on this ticket when the account has been deleted, or say what has to be kept and why.',
  ].join('\n\n');
}

/** The useCreateTicket() variables for the request: title, description and category only. */
export function accountDeletionTicket(
  user: Pick<AuthUser, 'id' | 'displayName' | 'email' | 'role'>,
  { appVersion, requestedAt, categoryId }: { appVersion: string; requestedAt: Date; categoryId: string },
): { title: string; description: string; categoryId: string } {
  return {
    title: deletionTicketTitle(user),
    description: deletionTicketDescription(user, { appVersion, requestedAt }),
    categoryId,
  };
}
