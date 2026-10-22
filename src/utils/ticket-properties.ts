// Ticket property editing on M4 (Phase G1): the web detail page's rules, as pure functions. Sources and the places
// mobile deliberately differs: docs/G1-WEB-BEHAVIOUR.md. Who may edit what is decided in permissions.ts, not here.
// Nothing here sends a request; the editors build a TKT-4 body from these and save it only on an explicit Save.
import type {
  Category, PriorityMatrixEntry, Ticket, TicketCategoryRef, TicketImpact, TicketPriority, TicketUrgency, UpdateTicketBody,
} from '@/types';
import { formatDisplayName } from './format';

// ── Impact, urgency and the priority preview (G1 §1–§2) ──────

export interface Classification {
  impact: TicketImpact | null;
  urgency: TicketUrgency | null;
}

/**
 * The TKT-4 body for a classification edit: only the values that changed, never null (a 400; on the web "Not Set" saves
 * nothing either). Empty = nothing to save.
 * Plus `priority`, as the web sends it (FE:TicketDetailPage.tsx:304-317; G2, ROLE-MATRIX §8 item 11): with an impact or
 * urgency change, when the matrix is loaded and has a row for the effective pair, that row's priority. Pass `matrix`
 * only for a role that may read LKP-6 (ADMIN, AGENT): L2_MANAGER's matrix is a 403 on the web, so it never sends one.
 * The server stores the same value either way; the key makes it audit the change and email the requester and the
 * technician "priority changed" (BE:tickets.controller.ts:719, :776-784).
 */
export function classificationChanges(
  ticket: Classification,
  staged: Classification,
  matrix?: readonly PriorityMatrixEntry[],
): UpdateTicketBody {
  const body: UpdateTicketBody = {};
  if (staged.impact && staged.impact !== ticket.impact) body.impact = staged.impact;
  if (staged.urgency && staged.urgency !== ticket.urgency) body.urgency = staged.urgency;
  if (matrix && (body.impact || body.urgency)) {
    const effective = { impact: staged.impact ?? ticket.impact, urgency: staged.urgency ?? ticket.urgency };
    const preview = previewPriority(matrix, effective);
    if (preview.kind === 'computed') body.priority = preview.priority;
  }
  return body;
}

export type PriorityPreview =
  /** The matrix row for this pair: the priority the server will store. */
  | { kind: 'computed'; priority: TicketPriority }
  /** Both set, but the matrix has no row for the pair (no default row has MINIMAL or URGENT): priority unchanged. */
  | { kind: 'noRow' }
  /** One of the two is not set: the server computes nothing and the priority is unchanged. */
  | { kind: 'incomplete' };

/**
 * The web's and the server's rule (FE:TicketDetailPage.tsx:306-315, BE:tickets.controller.ts:563-573): with the
 * effective impact and urgency both set, the matrix row for that exact pair decides the priority; otherwise nothing.
 */
export function previewPriority(matrix: readonly PriorityMatrixEntry[], staged: Classification): PriorityPreview {
  if (!staged.impact || !staged.urgency) return { kind: 'incomplete' };
  const row = matrix.find((e) => e.impact === staged.impact && e.urgency === staged.urgency);
  return row ? { kind: 'computed', priority: row.priority } : { kind: 'noRow' };
}

// ── Category cascade (G1 §3) ─────────────────────────────────

export interface CategorySelection {
  topId: string | null;
  subId: string | null;
  itemId: string | null;
}

export type CategoryLevel = keyof CategorySelection;

export const NO_CATEGORY: CategorySelection = { topId: null, subId: null, itemId: null };

interface ChainLink {
  id: string;
  name: string;
}

/** The ticket's category chain by level, derived from `level` as the web does (FE:TicketDetailPage.tsx:1936-1950). */
function ticketChain(category: TicketCategoryRef | null | undefined): { top?: ChainLink; sub?: ChainLink; item?: ChainLink } {
  if (!category) return {};
  const link = (c: { id: string; name: string } | null | undefined) => (c ? { id: c.id, name: c.name } : undefined);
  if (category.level === 'ITEM') {
    return { item: link(category), sub: link(category.parent), top: link(category.parent?.parent) };
  }
  if (category.level === 'SUBCATEGORY') return { sub: link(category), top: link(category.parent) };
  return { top: link(category) };
}

/** The current selection, as the editor opens. */
export function categorySelectionOf(category: TicketCategoryRef | null | undefined): CategorySelection {
  const chain = ticketChain(category);
  return { topId: chain.top?.id ?? null, subId: chain.sub?.id ?? null, itemId: chain.item?.id ?? null };
}

/** Choose a value on one level (null = "None"). Every level below it is cleared, as a web save of that level does. */
export function selectCategoryLevel(selection: CategorySelection, level: CategoryLevel, id: string | null): CategorySelection {
  if (level === 'topId') return { topId: id, subId: null, itemId: null };
  if (level === 'subId') return { ...selection, subId: id, itemId: null };
  return { ...selection, itemId: id };
}

/** What Save sends: the deepest chosen level, or null when "None" is chosen at the top (the web's `value || parent || null`). */
export function categoryIdToSave(selection: CategorySelection): string | null {
  return selection.itemId ?? selection.subId ?? selection.topId ?? null;
}

export interface CategoryChoice {
  id: string;
  name: string;
  /** Not in LKP-1's active list: the ticket still points at an inactive (or retired) category. */
  inactive: boolean;
}

/**
 * The options for each level from LKP-1 (flat, active only), in the server's order as on the web detail page.
 * The ticket's own category, sub-category and item stay pickable when they are no longer active, marked `inactive`:
 * the web adds back the first two from the ticket's chain (:1963-1973); mobile also adds the item, which the web
 * leaves showing "— None —".
 */
export function categoryChoices(
  categories: readonly Category[],
  current: TicketCategoryRef | null | undefined,
  selection: CategorySelection,
): Record<'tops' | 'subs' | 'items', CategoryChoice[]> {
  const chain = ticketChain(current);
  const active = (c: Category): CategoryChoice => ({ id: c.id, name: c.name, inactive: false });
  const withCurrent = (list: CategoryChoice[], link: ChainLink | undefined, belongsHere: boolean) =>
    link && belongsHere && !list.some((c) => c.id === link.id) ? [{ ...link, inactive: true }, ...list] : list;

  const tops = categories.filter((c) => c.level === 'CATEGORY').map(active);
  const subs = selection.topId
    ? categories.filter((c) => c.level === 'SUBCATEGORY' && c.parentId === selection.topId).map(active)
    : [];
  const items = selection.subId
    ? categories.filter((c) => c.level === 'ITEM' && c.parentId === selection.subId).map(active)
    : [];

  return {
    tops: withCurrent(tops, chain.top, true),
    subs: withCurrent(subs, chain.sub, !!selection.topId && selection.topId === (chain.top?.id ?? null)),
    items: withCurrent(items, chain.item, !!selection.subId && selection.subId === (chain.sub?.id ?? null)),
  };
}

// ── After a save ─────────────────────────────────────────────

/**
 * The toast after a category save. The web says "auto-assigned to <name>" whenever the response has any technician
 * (FE:TicketDetailPage.tsx:487-492); mobile says it only when the server actually re-routed the ticket (G1 D7).
 */
export function categorySavedMessage(
  before: Pick<Ticket, 'assignedToId' | 'teamId'>,
  after: Pick<Ticket, 'assignedToId' | 'teamId' | 'assignedTo' | 'team'>,
): string {
  const parts: string[] = [];
  if (after.teamId && after.teamId !== before.teamId) parts.push(`moved to ${after.team?.name ?? 'another group'}`);
  if (after.assignedToId && after.assignedToId !== before.assignedToId) {
    parts.push(`auto-assigned to ${formatDisplayName(after.assignedTo?.displayName) || 'another technician'}`);
  }
  return parts.length > 0 ? `Category updated — ${parts.join(' and ')}` : 'Category updated';
}
