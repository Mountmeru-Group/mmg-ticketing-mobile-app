// Wording of the confirmation dialogs (Phase 3b): each one names exactly what will happen on the server — who is
// emailed, what becomes public, what can't be undone. Facts from 01 TKT-2/5/6 side effects. Pure functions.
import type { TicketStatus, UserRole } from '@/types';
import { HOLD_STATUSES } from '@/types';
import { statusLabel } from './format';

const isHold = (s: TicketStatus) => HOLD_STATUSES.includes(s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Non-closure transition (posts `{ status }` only). */
export function statusChangeMessage(ticketNumber: number, from: TicketStatus, to: TicketStatus): string {
  const parts = [`#${ticketNumber} moves from ${statusLabel(from)} to ${statusLabel(to)}.`];
  if (isHold(to)) parts.push('The requester gets two emails (status change and pending reason) and the SLA clock pauses.');
  else parts.push('The requester is emailed about the change.');
  if (isHold(from) && !isHold(to)) parts.push('The SLA clock resumes.');
  if ((from === 'RESOLVED' || from === 'CLOSED') && (to === 'OPEN' || to === 'IN_PROGRESS')) {
    parts.push('The assigned technician is emailed that the ticket was reopened.');
  }
  return parts.join(' ');
}

/** RESOLVED / CLOSED / CANCELED with the closure form (05 §A.2). */
export function closureMessage(ticketNumber: number, target: TicketStatus, role: UserRole, fileCount: number): string {
  const parts: string[] = [];
  if (target === 'RESOLVED') {
    parts.push(`#${ticketNumber} will be marked Resolved. It closes automatically after 48 hours.`);
  } else {
    parts.push(`#${ticketNumber} will be ${statusLabel(target)}.`);
  }
  parts.push('Your closure comments are posted as a PUBLIC reply the requester can see,');
  parts.push(target === 'CLOSED' ? 'and the requester receives the status and closed emails.' : 'and the requester is emailed.');
  if (role === 'AGENT' && target !== 'RESOLVED') parts.push("As a Technician you can't change this ticket again afterwards.");
  if (fileCount > 0) parts.push(`${plural(fileCount, 'file')} upload first; if that fails, the status is not changed.`);
  return parts.join(' ');
}

export function bulkCloseMessage(count: number, skipped: number, role: UserRole): string {
  const parts = [
    `${plural(count, 'ticket')} will be Closed, one at a time.`,
    'On every ticket your closure comments are posted as a PUBLIC reply, and each requester receives 2–3 emails.',
  ];
  if (role === 'AGENT') parts.push("As a Technician you can't change them again afterwards.");
  if (skipped > 0) parts.push(`${plural(skipped, 'selected ticket is', 'selected tickets are')} skipped.`);
  return parts.join(' ');
}

export function assignMessage(ticketNumber: number, name: string, groupName: string | null): string {
  return `#${ticketNumber} will be assigned to ${name}${groupName ? ` in ${groupName}` : ''}. ${name} is emailed and notified in the app.`;
}

/** `current`: the technician's name, '' when unknown. */
export function unassignMessage(ticketNumber: number, current: string): string {
  return `#${ticketNumber} will have no technician. ${current || 'The current technician'} is no longer assigned.`;
}

export function bulkAssignMessage(count: number, name: string, skipped: number): string {
  const parts = [`${plural(count, 'ticket')} will be assigned to ${name}, one at a time. ${name} gets one email per ticket.`];
  if (skipped > 0) parts.push(`${plural(skipped, 'selected ticket is', 'selected tickets are')} skipped.`);
  return parts.join(' ');
}

/** ATT-5 (Phase G3): the server unlinks the file and deletes its row, with no history entry (01 ATT-5). */
export function deleteAttachmentMessage(fileName: string): string {
  return `${fileName} is permanently removed from this ticket, for everyone including the requester. This can't be undone, and the ticket's history won't show it.`;
}

export function bulkPickUpMessage(count: number, skipped: number): string {
  const parts = [`${plural(count, 'ticket')} will be assigned to you, one at a time.`];
  if (skipped > 0) parts.push(`${plural(skipped, 'selected ticket is', 'selected tickets are')} skipped.`);
  return parts.join(' ');
}
