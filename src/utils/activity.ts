// History (TKT-7 audit entries) → human sentences, and who may see private notes. Pure functions.
import type { ActivityAuditItem, Comment, UserRole } from '@/types';
import { formatDisplayName } from './format';

/**
 * PRIVATE comments (internal notes) are shown to ADMIN and AGENT only (04 M4, 05 §A.3).
 * The server already withholds them from END_USER (CMT-1) — but TKT-7 sends them to L2_MANAGER, so the UI
 * never assumes the server filtered. This is display hygiene mirroring the web UI, not a security fix (05 §C).
 */
export function canSeePrivateNotes(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'AGENT';
}

export function visibleComments<T extends Pick<Comment, 'type'>>(comments: readonly T[], role: UserRole): T[] {
  return canSeePrivateNotes(role) ? [...comments] : comments.filter((c) => c.type === 'PUBLIC');
}

/**
 * 05 §A.7: hide `COMMENTED` entries for private notes from END_USER — they reveal that internal notes exist.
 * Applied to every role that cannot see private notes (so L2_MANAGER too), to keep one rule for notes.
 */
export function visibleAuditItems(items: readonly ActivityAuditItem[], role: UserRole): ActivityAuditItem[] {
  if (canSeePrivateNotes(role)) return [...items];
  return items.filter((a) => !(a.action === 'COMMENTED' && a.newValues?.type === 'PRIVATE'));
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/**
 * Sentence for one audit entry, verbatim from FE:TicketDetailPage.tsx:2884-2932 (05 §A.7).
 * Returns the actor and the action separately so the screen can bold the name.
 * Never reads `ipAddress`.
 */
export function describeAudit(audit: ActivityAuditItem): { actor: string; action: string } {
  const nv = (audit.newValues ?? {}) as Record<string, unknown>;
  const ov = (audit.oldValues ?? {}) as Record<string, unknown>;
  const assignedName = str(nv._assignedToName) || str(nv.assignedToId) || 'someone';
  const statusFormatted = str(nv.status).replace(/_/g, ' ');

  function describeChanges(): string {
    const parts: string[] = [];
    if (nv.title) parts.push(`renamed to "${str(nv.title)}"`);
    if (nv.priority) parts.push(`priority changed from ${str(ov.priority) || '?'} → ${str(nv.priority)}`);
    if (nv.urgency) parts.push(`urgency changed from ${str(ov.urgency) || '?'} → ${str(nv.urgency)}`);
    if (nv.impact) parts.push(`impact changed from ${str(ov.impact) || '?'} → ${str(nv.impact)}`);
    if (nv.categoryId) parts.push(`category → ${str(nv._categoryName) || str(nv.categoryId)}`);
    return parts.length ? parts.join(', ') : 'updated';
  }

  const labels: Record<string, string> = {
    CREATED: `created this ticket${nv._teamName ? ` → ${str(nv._teamName)}` : ''}${nv._assignedToName ? ` / ${str(nv._assignedToName)}` : ''}${nv._categoryName ? ` [${str(nv._categoryName)}]` : ''}${nv._countryName ? ` (${str(nv._countryName)})` : ''}`,
    UPDATED: describeChanges() || 'updated this ticket',
    STATUS_CHANGED: `changed status to ${statusFormatted}`,
    ASSIGNED: nv._autoAssigned
      ? `auto-assigned to ${assignedName}`
      : ov.assignedToId
        ? `reassigned from ${str(ov._assignedToName) || str(ov.assignedToId) || 'unassigned'} to ${assignedName}`
        : `assigned to ${assignedName}`,
    COMMENTED: 'added a comment',
    SLA_BREACHED: 'SLA breached',
    ESCALATED: 'escalated ticket',
    ATTACHMENT_ADDED: 'added an attachment',
    DELETED: 'deleted',
  };

  return {
    actor: formatDisplayName(audit.actor?.displayName) || 'System',
    action: labels[audit.action] ?? str(audit.action),
  };
}
