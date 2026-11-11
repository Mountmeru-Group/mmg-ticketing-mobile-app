// Account deletion, started in the app (App Review 5.1.1(v); docs/ios/APP-STORE-COMPLIANCE.md H6). iOS-4; redesigned in
// iOS-9b (Ronit, 2026-11-11), because MMG has no deletion category and IT has agreed no deletion time.
// The Service Desk has no deletion endpoint, so deletion is a Service Desk request for IT:
// - Profile › Account › Request Account Deletion → a confirmation Alert (below) → the EXISTING Create Ticket sheet,
//   filled in with the subject and description below. The person picks the category and creates the ticket through the
//   normal flow: the same validation, the same "Create this ticket?" confirmation, the same POST /tickets (TKT-2).
//   Profile sends nothing itself, and nothing is sent without the person's own taps.
// - No category is hard-coded, and no time is promised anywhere: IT deletes the account and updates the person on that
//   ticket.
// - Every role can create tickets (Create Ticket and its "+" are shown to all four), so every role gets the same request.
// Pure values only, so the Node tests check the exact text.
import type { AuthUser, CreateTicketPrefill } from '@/types';

/** What Profile's Account card shows from config/legal.ts: the privacy policy only once it is an https link. */
export function accountRows(config: { privacyPolicyUrl: string }): { privacyPolicy: boolean } {
  return { privacyPolicy: /^https:\/\/\S+$/.test(config.privacyPolicyUrl.trim()) };
}

export const DELETION_CONFIRM_TITLE = 'Request account deletion?';
export const DELETION_CONFIRM_LABEL = 'Continue';

/**
 * The confirmation's message: what happens, who does it, where the person hears back and what may be kept (App Review
 * 5.1.1(v) guidance). It names no time: IT has agreed none.
 */
export const DELETION_CONFIRM_MESSAGE = [
  'This opens a new Service Desk request, filled in for you, asking Mount Meru IT to delete your Setu / Service Desk account.',
  'Choose a category and create it as you would any ticket: nothing is sent until you do.',
  'IT deletes the account and updates you on that ticket.',
  'Records Mount Meru must keep, such as tickets you raised, may be kept.',
  'Your Mount Meru work account (Microsoft) is not affected.',
].join(' ');

/** The ticket's subject (TKT-2 title, 3–255 characters). */
export const DELETION_TICKET_TITLE = 'Account deletion request';

/** The ticket's description: who is asking, by the signed-in email. Plain text (useCreateTicket sends it as <p> HTML). */
export function deletionTicketDescription(email: string | null | undefined): string {
  const address = (email ?? '').trim();
  return address
    ? `Please delete my Setu / Service Desk account (${address})`
    : 'Please delete my Setu / Service Desk account';
}

/** What Create Ticket opens with: the subject and description only. Never a category, priority or anything else. */
export function accountDeletionPrefill(user: Pick<AuthUser, 'email'>): CreateTicketPrefill {
  return { title: DELETION_TICKET_TITLE, description: deletionTicketDescription(user.email) };
}
