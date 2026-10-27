// M4 property editors (Phase G1): impact and urgency with the priority preview, the category cascade, the ticket's
// country, and the resolution text. The web's behaviour, field by field with sources: docs/G1-WEB-BEHAVIOUR.md.
// The technician (2026-10-27): the same editor pattern on the Technician row; the web's picker: ROLE-MATRIX.md §15.
//
// - WHO and WHEN come from ticketFieldPermissions() (utils/permissions.ts) alone: `edit` shows a "Change …" link,
//   `locked` shows the saved value with the reason, `view` shows the value only, `hidden` shows nothing.
// - Every editor stages its changes and writes ONLY on Save: nothing saves on selection, blur or navigation, and leaving
//   with unsaved changes asks first (useDiscardGuard). One editor is open at a time.
// - Save → useUpdateTicket (TKT-4 PUT, never status). Priority only rides along with an impact/urgency change, as the
//   matrix value, exactly as the web sends it (G2). Controls are disabled while it is in flight.
//   Success: a toast, and the editor closes on the server's values. Failure: the server's message (a 403 says the role
//   can't change that field), and the editor closes so the field shows the saved value again.
// - The technician saves through useAssignTicket (TKT-5), the hook Pick up and the assign picker (M7) use, with the
//   same guards, lists and `teamId` rule (utils/assignment.ts). It is not a second assignment path.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import {
  Card, FieldLabel, HtmlText, LookupError, Notice, OptionSheet, OutlineButton, PersonPickerSheet, PriorityBadge, SelectField,
  SubmitButton, type SheetOption,
} from '@/components';
import {
  useAssignTicket, useCategories, useCountryOptions, useDiscardGuard, usePriorityMatrix, useSingleFlight, useSuggestedAssignees,
  useTeams, useUpdateTicket,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import {
  TICKET_IMPACTS, TICKET_URGENCIES, type TicketDetail, type TicketImpact, type TicketPriority, type TicketUrgency,
  type UpdateTicketBody,
} from '@/types';
import {
  TECHNICIAN_ROLES, assignmentDoneMessage, assignmentTeamId, recommendedTechnicians, teamMembers, technicianName,
  technicianOptions, type Technician,
} from '@/utils/assignment';
import { notify, reportFieldWriteError } from '@/utils/dialogs';
import { IMPACT_LABELS, PRIORITY_LABELS, URGENCY_LABELS, categoryCascade, formatDateTime, formatDisplayName } from '@/utils/format';
import { ticketFieldPermissions, type FieldAccess, type TicketFieldPermissions } from '@/utils/permissions';
import {
  categoryChoices, categoryIdToSave, categorySavedMessage, categorySelectionOf, classificationChanges, newTicketPriority,
  previewPriority, selectCategoryLevel, type CategoryChoice, type CategoryLevel, type Classification, type PriorityPreview,
} from '@/utils/ticket-properties';
import { assignMessage, unassignMessage } from '@/utils/writeCopy';

export type EditorKey = 'classification' | 'category' | 'country' | 'resolution' | 'technician';
/** The editors that save through TKT-4. The technician saves through TKT-5 (`assign`). */
type FieldEditorKey = Exclude<EditorKey, 'technician'>;

/**
 * Wording per editor. Titles and success toasts are the web's (G1 §1, §3–§5); the field names the 403 message.
 * The technician's toast is M7's, naming the person (assignmentDoneMessage), so it has no fixed `saved`.
 */
const COPY: Record<EditorKey, { field: string; failed: string; saved: string }> = {
  classification: { field: 'the impact and urgency', failed: 'Failed to update', saved: 'Updated' },
  category: { field: 'the category', failed: 'Failed to update category', saved: 'Category updated' },
  country: { field: 'the country', failed: 'Failed to update country', saved: 'Country updated' },
  resolution: { field: 'the resolution', failed: 'Failed to update resolution', saved: 'Resolution updated' },
  technician: { field: 'the technician', failed: 'Failed to assign', saved: '' },
};

function accessFor(can: TicketFieldPermissions, key: EditorKey): FieldAccess {
  return key === 'classification' ? can.impact : can[key];
}

/** What the Technician editor saves: a person, or null to remove the assignment, and the group to send with it. */
export interface TechnicianChoice {
  person: Technician | null;
  teamId?: string;
}

// ── Coordination (one per screen) ────────────────────────────

export interface PropertyEditing {
  /** The open editor, if any. */
  editing: EditorKey | null;
  saving: boolean;
  open: (key: EditorKey) => void;
  cancel: () => void;
  setDirty: (dirty: boolean) => void;
  save: (key: FieldEditorKey, input: UpdateTicketBody) => void;
  /** The Technician editor's Save: TKT-5 through useAssignTicket, the one assignment path. */
  assign: (choice: TechnicianChoice) => void;
}

/** Call once on M4, before any early return (it uses hooks). `ticket` is undefined until TKT-3 has answered. */
export function usePropertyEditing(ticket: TicketDetail | undefined): PropertyEditing {
  const user = useAuthStore((s) => s.user);
  const update = useUpdateTicket();
  const assignment = useAssignTicket();
  const once = useSingleFlight();
  const [editing, setEditing] = useState<EditorKey | null>(null);
  const [dirty, setDirty] = useState(false);
  const saving = update.isPending || assignment.isPending;
  // Leaving never saves: unsaved changes ask first, and leaving is blocked while a save is in flight.
  useDiscardGuard({ dirty: editing !== null && dirty, busy: saving, what: 'change' });

  // The ticket changed under an open editor (refresh, status change) and the field is no longer editable: close it.
  const stillEditable = !editing || !ticket || accessFor(ticketFieldPermissions(user, ticket), editing).mode === 'edit';
  useEffect(() => {
    if (stillEditable || saving) return;
    setEditing(null);
    setDirty(false);
  }, [stillEditable, saving]);

  const close = () => {
    setEditing(null);
    setDirty(false);
  };

  /** `write` sends the change and returns the success toast. */
  async function run(key: EditorKey, write: (ticket: TicketDetail) => Promise<string>) {
    if (!ticket) return;
    try {
      notify(await write(ticket));
    } catch (e) {
      reportFieldWriteError(COPY[key].failed, COPY[key].field, e);
    } finally {
      close(); // success: the saved values show; failure: the field reverts to the saved value
    }
  }

  return {
    editing,
    saving,
    open: (key) => {
      setDirty(false);
      setEditing(key);
    },
    cancel: close,
    setDirty,
    save: (key, input) =>
      void once(() =>
        run(key, async (t) => {
          const saved = await update.mutateAsync({ ticketId: t.id, status: t.status, input });
          return key === 'category' ? categorySavedMessage(t, saved) : COPY[key].saved;
        }),
      ),
    assign: ({ person, teamId }) =>
      void once(() =>
        run('technician', async (t) => {
          await assignment.mutateAsync({ ticketId: t.id, status: t.status, assignedToId: person ? person.id : null, teamId });
          return assignmentDoneMessage(person ? technicianName(person) : null);
        }),
      ),
  };
}

// ── Shared pieces ────────────────────────────────────────────

/** A label / value line in a card (UI-STANDARDS S6): 112 dp label column, separators between rows. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row border-b border-gray-100 py-2">
      <Text className="w-28 pr-2 text-sm text-gray-500">{label}</Text>
      <View className="flex-1">{typeof children === 'string' ? <Text className="text-sm text-gray-900">{children}</Text> : children}</View>
    </View>
  );
}

const CHIP_STYLES = {
  red: { bg: 'bg-red-100', text: 'text-red-800' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-800' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  green: { bg: 'bg-green-100', text: 'text-green-800' },
} as const;

function Chip({ label, tone }: { label: string; tone: keyof typeof CHIP_STYLES }) {
  const style = CHIP_STYLES[tone];
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${style.bg}`}>
      <Text className={`text-xs font-medium ${style.text}`}>{label}</Text>
    </View>
  );
}

function impactTone(impact: TicketImpact): 'red' | 'yellow' | 'green' {
  // 05 §A.10: HIGH red, MEDIUM yellow, else green.
  if (impact === 'HIGH') return 'red';
  if (impact === 'MEDIUM') return 'yellow';
  return 'green';
}

function urgencyTone(urgency: TicketUrgency): 'red' | 'orange' | 'yellow' | 'green' {
  // 05 §A.10: URGENT red, HIGH orange, MEDIUM yellow, else green.
  if (urgency === 'URGENT') return 'red';
  if (urgency === 'HIGH') return 'orange';
  if (urgency === 'MEDIUM') return 'yellow';
  return 'green';
}

/**
 * Under a field's rows: a "Change …" link when the field is editable, or the reason when the state locks it
 * (ROLE-MATRIX.md §3 rule 2). A field the role never edits gets nothing here (rule 1).
 */
function FieldAction({
  access, label, onPress, blocked,
}: {
  access: FieldAccess;
  label: string;
  onPress: () => void;
  /** Another editor is open, or a write is in flight. */
  blocked: boolean;
}) {
  if (access.mode === 'locked') {
    return (
      <View className="flex-row items-start border-b border-gray-100 py-2">
        <Ionicons name="lock-closed-outline" size={14} color={colors.text.secondary} style={{ marginTop: 1 }} />
        <Text className="ml-1.5 flex-1 text-xs text-gray-500">{access.reason}</Text>
      </View>
    );
  }
  if (access.mode !== 'edit') return null;
  return (
    <View className="border-b border-gray-100">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked }}
        accessibilityHint={blocked ? 'Finish or cancel the open change first' : undefined}
        disabled={blocked}
        onPress={onPress}
        className={`min-h-11 flex-row items-center self-start ${blocked ? 'opacity-50' : 'active:opacity-70'}`}
      >
        <Ionicons name="create-outline" size={18} color={palette.blue[700]} />
        <Text className="ml-1.5 text-sm font-medium text-blue-700">{label}</Text>
      </Pressable>
    </View>
  );
}

/** Save (the form's one primary action) and Cancel. Both off while saving; Save off until something changed. */
function EditorActions({
  canSave, saving, onSave, onCancel,
}: {
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="mt-1">
      <SubmitButton label="Save" onPress={onSave} disabled={!canSave} loading={saving} />
      <View className="mt-2">
        <OutlineButton label="Cancel" onPress={onCancel} disabled={saving} />
      </View>
    </View>
  );
}

/** Tells the screen whether this editor holds unsaved changes (for the leave prompt). */
function useReportDirty(dirty: boolean, onDirtyChange: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
}

const NONE = '__NONE__';

interface SectionProps {
  ticket: TicketDetail;
  can: TicketFieldPermissions;
  edit: PropertyEditing;
  /** Another write on the screen (status, assignment, upload) is in flight. */
  busy: boolean;
}

function sectionState(key: EditorKey, { can, edit, busy }: SectionProps) {
  const access = accessFor(can, key);
  const open = edit.editing === key && access.mode === 'edit';
  return { access, open, blocked: busy || edit.saving || (edit.editing !== null && edit.editing !== key) };
}

// ── Impact and urgency, with the priority preview (G1 §1–§2) ──

export function ClassificationSection(props: SectionProps) {
  const { ticket, can, edit } = props;
  const { access, open, blocked } = sectionState('classification', props);
  if (access.mode === 'hidden') return null; // END_USER (05 §A.3)
  if (open) {
    return (
      <ClassificationForm
        ticket={ticket}
        preview={can.priorityPreview}
        saving={edit.saving}
        onCancel={edit.cancel}
        onDirtyChange={edit.setDirty}
        onSave={(input) => edit.save('classification', input)}
      />
    );
  }
  return (
    <>
      <Row label="Impact">
        {ticket.impact ? <Chip label={IMPACT_LABELS[ticket.impact] ?? ticket.impact} tone={impactTone(ticket.impact)} /> : 'Not set'}
      </Row>
      <Row label="Urgency">
        {ticket.urgency ? <Chip label={URGENCY_LABELS[ticket.urgency] ?? ticket.urgency} tone={urgencyTone(ticket.urgency)} /> : 'Not set'}
      </Row>
      <FieldAction access={access} label="Change impact and urgency" onPress={() => edit.open('classification')} blocked={blocked} />
    </>
  );
}

function ClassificationForm({
  ticket, preview, saving, onCancel, onDirtyChange, onSave,
}: {
  ticket: TicketDetail;
  preview: boolean;
  saving: boolean;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (input: UpdateTicketBody) => void;
}) {
  const [staged, setStaged] = useState<Classification>({ impact: ticket.impact, urgency: ticket.urgency });
  const [sheet, setSheet] = useState<'impact' | 'urgency' | null>(null);
  // ADMIN/AGENT only (403 for L2, as on the web). Not loaded yet or failed: saved without a priority, as the web does.
  const matrix = usePriorityMatrix({ enabled: preview });
  const body = classificationChanges(ticket, staged, preview ? matrix.data : undefined);
  const dirty = Object.keys(body).length > 0;
  useReportDirty(dirty, onDirtyChange);

  // The web's values, minus its "Not Set", which saves nothing (G1 §1): a value can be changed, never cleared.
  const impactOptions: SheetOption<TicketImpact>[] = TICKET_IMPACTS.map((v) => ({ value: v, label: IMPACT_LABELS[v] }));
  const urgencyOptions: SheetOption<TicketUrgency>[] = TICKET_URGENCIES.map((v) => ({ value: v, label: URGENCY_LABELS[v] }));

  return (
    <View className="border-b border-gray-100 py-3">
      <SelectField
        label="Impact"
        value={staged.impact ? IMPACT_LABELS[staged.impact] : null}
        placeholder="Not set"
        onPress={() => setSheet('impact')}
        disabled={saving}
      />
      <SelectField
        label="Urgency"
        value={staged.urgency ? URGENCY_LABELS[staged.urgency] : null}
        placeholder="Not set"
        onPress={() => setSheet('urgency')}
        disabled={saving}
      />
      <PriorityPreviewBox
        target={{ kind: 'update', current: ticket.priority, assigned: !!ticket.assignedToId }}
        staged={staged}
        enabled={preview}
        matrix={matrix}
      />
      <EditorActions canSave={dirty} saving={saving} onSave={() => onSave(body)} onCancel={onCancel} />

      <OptionSheet
        visible={sheet === 'impact'}
        title="Impact"
        options={impactOptions}
        selected={staged.impact}
        onSelect={(impact) => setStaged((s) => ({ ...s, impact }))}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'urgency'}
        title="Urgency"
        options={urgencyOptions}
        selected={staged.urgency}
        onSelect={(urgency) => setStaged((s) => ({ ...s, urgency }))}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

/** What the preview is for: an impact/urgency change on M4 (G1), or a new ticket on M8 (G5). */
export type PriorityPreviewTarget =
  /** `assigned`: the ticket has a technician, who is emailed too. */
  | { kind: 'update'; current: TicketPriority; assigned: boolean }
  | { kind: 'create' };

/**
 * The priority the server will store (LKP-6, the web's and the server's rule, G1 §2), shown as impact and urgency change.
 * Only shown, never picked: neither the web nor the app lets anyone set a priority by hand on these forms.
 * - `update` (M4): said before Save whenever it would change. Save sends that value with the change (G2, as the web
 *   does), so the server emails the requester and the technician; the box says so.
 * - `create` (M8, G5): the web's "Auto-computed from Impact × Urgency" box (FE:CreateTicketPage.tsx:368-387). Nothing is
 *   sent for it (01 TKT-2): the server applies the same row itself, and stores Medium without one (newTicketPriority).
 * L2_MANAGER can't read the matrix (403, as on the web), so it is told the Service Desk sets it, and sends no priority.
 */
export function PriorityPreviewBox({
  target, staged, enabled, matrix,
}: {
  target: PriorityPreviewTarget;
  staged: Classification;
  enabled: boolean;
  matrix: ReturnType<typeof usePriorityMatrix>;
}) {
  const when = target.kind === 'create' ? 'when the ticket is created' : 'when you save';

  let body: ReactNode;
  if (!enabled) {
    body = <Text className="text-xs text-gray-700">The Service Desk {target.kind === 'create' ? 'sets' : 'recalculates'} the priority from impact × urgency {when}.</Text>;
  } else if (matrix.data === undefined) {
    body = matrix.isError && !matrix.isFetching ? (
      <>
        <LookupError query={matrix} what="the priority matrix" />
        <Text className="text-xs text-gray-700">The Service Desk still {target.kind === 'create' ? 'sets' : 'recalculates'} the priority {when}.</Text>
      </>
    ) : (
      <View className="flex-row items-center">
        <ActivityIndicator size="small" color={colors.primary} />
        <Text className="ml-2 text-xs text-gray-700">Checking the priority matrix…</Text>
      </View>
    );
  } else if (target.kind === 'create') {
    body = <NewTicketPriority result={previewPriority(matrix.data, staged)} />;
  } else {
    const { current, assigned } = target;
    const label = PRIORITY_LABELS[current] ?? current;
    const result = previewPriority(matrix.data, staged);
    if (result.kind === 'computed' && result.priority !== current) {
      body = (
        <>
          <View className="mb-1 flex-row flex-wrap items-center gap-1.5">
            <PriorityBadge priority={current} />
            <Ionicons name="arrow-forward" size={14} color={colors.text.secondary} />
            <PriorityBadge priority={result.priority} auto />
          </View>
          <Text className="text-xs text-gray-700">
            Saving changes the priority from {label} to {PRIORITY_LABELS[result.priority] ?? result.priority}. The SLA deadlines
            may be recalculated, and the requester{assigned ? ' and the technician are' : ' is'} emailed about the new priority.
          </Text>
        </>
      );
    } else {
      const why =
        result.kind === 'computed'
          ? 'Impact × urgency gives the same priority.'
          : result.kind === 'noRow'
            ? 'The priority matrix has no entry for this pair.'
            : 'The priority is calculated once both impact and urgency are set.';
      body = (
        <>
          <View className="mb-1">
            <PriorityBadge priority={current} />
          </View>
          <Text className="text-xs text-gray-700">{why} It stays {label}.</Text>
        </>
      );
    }
  }

  return (
    <View className="mb-3 rounded-lg border border-border bg-gray-50 p-3" accessibilityLiveRegion="polite">
      <Text className="mb-1 text-xs font-semibold text-gray-500">{target.kind === 'create' ? 'Priority' : 'Priority after saving'}</Text>
      {body}
    </View>
  );
}

/** The create form's box, in the web's words where it has them (FE:CreateTicketPage.tsx:376, :383). */
function NewTicketPriority({ result }: { result: PriorityPreview }) {
  const stored = PRIORITY_LABELS[newTicketPriority(result)];
  return (
    <>
      <View className="mb-1">
        <PriorityBadge priority={newTicketPriority(result)} auto={result.kind === 'computed'} />
      </View>
      <Text className="text-xs text-gray-700">
        {result.kind === 'computed'
          ? 'Auto-computed from Impact × Urgency.'
          : result.kind === 'noRow'
            ? `The priority matrix has no entry for this pair, so the ticket is created as ${stored}.`
            : `Set Impact and Urgency above to compute priority. Until then the ticket is created as ${stored}.`}
      </Text>
    </>
  );
}

// ── Category, three levels (G1 §3) ───────────────────────────

export function CategorySection(props: SectionProps) {
  const { ticket, edit } = props;
  const { access, open, blocked } = sectionState('category', props);
  if (open) {
    return (
      <CategoryForm
        ticket={ticket}
        saving={edit.saving}
        onCancel={edit.cancel}
        onDirtyChange={edit.setDirty}
        onSave={(input) => edit.save('category', input)}
      />
    );
  }
  const cascade = categoryCascade(ticket.category);
  return (
    <>
      <Row label="Category">{cascade.category ?? 'Not set'}</Row>
      {cascade.subcategory ? <Row label="Subcategory">{cascade.subcategory}</Row> : null}
      {cascade.item ? <Row label="Item">{cascade.item}</Row> : null}
      <FieldAction access={access} label="Change category" onPress={() => edit.open('category')} blocked={blocked} />
    </>
  );
}

const choiceLabel = (c: CategoryChoice) => (c.inactive ? `${c.name} (inactive)` : c.name);

function CategoryForm({
  ticket, saving, onCancel, onDirtyChange, onSave,
}: {
  ticket: TicketDetail;
  saving: boolean;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (input: UpdateTicketBody) => void;
}) {
  const categories = useCategories({ enabled: true });
  const [selection, setSelection] = useState(() => categorySelectionOf(ticket.category));
  const [sheet, setSheet] = useState<CategoryLevel | null>(null);
  const choices = useMemo(() => categoryChoices(categories.data ?? [], ticket.category, selection), [categories.data, ticket.category, selection]);
  const target = categoryIdToSave(selection);
  const dirty = target !== (ticket.categoryId ?? null);
  useReportDirty(dirty, onDirtyChange);

  const cascade = categoryCascade(ticket.category);
  const now = [cascade.category, cascade.subcategory, cascade.item].filter(Boolean).join(' › ') || 'No category';
  const find = (list: CategoryChoice[], id: string | null) => list.find((c) => c.id === id);
  const top = find(choices.tops, selection.topId);
  const sub = find(choices.subs, selection.subId);
  const item = find(choices.items, selection.itemId);
  const inactiveChosen = [top, sub, item].some((c) => c?.inactive);

  const sheetOptions = (list: CategoryChoice[], none: string): SheetOption<string>[] => [
    { value: NONE, label: 'None', description: none },
    ...list.map((c) => ({ value: c.id, label: choiceLabel(c) })),
  ];
  const sheets: Record<CategoryLevel, { title: string; options: SheetOption<string>[] }> = {
    topId: { title: 'Category', options: sheetOptions(choices.tops, 'Remove the category from this ticket') },
    subId: { title: 'Subcategory', options: sheetOptions(choices.subs, 'Keep only the category') },
    itemId: { title: 'Item', options: sheetOptions(choices.items, 'Keep only the subcategory') },
  };

  return (
    <View className="border-b border-gray-100 py-3">
      <Text className="mb-3 text-xs text-gray-500">Now: {now}</Text>
      {categories.data === undefined ? (
        categories.isError && !categories.isFetching ? (
          <LookupError query={categories} what="categories" />
        ) : (
          <View className="mb-3 min-h-11 flex-row items-center">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="ml-2 text-sm text-gray-700">Loading categories…</Text>
          </View>
        )
      ) : (
        <>
          <SelectField label="Category" value={top ? choiceLabel(top) : null} placeholder="None" onPress={() => setSheet('topId')} disabled={saving} />
          {selection.topId && choices.subs.length > 0 ? (
            <SelectField label="Subcategory" value={sub ? choiceLabel(sub) : null} placeholder="None" onPress={() => setSheet('subId')} disabled={saving} />
          ) : null}
          {selection.subId && choices.items.length > 0 ? (
            <SelectField label="Item" value={item ? choiceLabel(item) : null} placeholder="None" onPress={() => setSheet('itemId')} disabled={saving} />
          ) : null}
          {inactiveChosen ? (
            <Notice tone="warning">Part of this ticket's category is no longer active. It stays as it is unless you choose another.</Notice>
          ) : null}
          {dirty && target === null ? <Notice tone="warning">Saving removes the category from this ticket.</Notice> : null}
          {dirty && target !== null ? (
            <Notice>
              Saving may re-route the ticket: the Service Desk can change its group and technician to match the new category, and
              emails the new technician.
            </Notice>
          ) : null}
        </>
      )}
      <EditorActions canSave={dirty && categories.data !== undefined} saving={saving} onSave={() => onSave({ categoryId: target })} onCancel={onCancel} />

      {sheet ? (
        <OptionSheet
          visible
          title={sheets[sheet].title}
          options={sheets[sheet].options}
          selected={selection[sheet] ?? NONE}
          // Choosing a level clears the levels below it, as on the web (G1 §3).
          onSelect={(value) => setSelection((s) => selectCategoryLevel(s, sheet, value === NONE ? null : value))}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

// ── Technician (TKT-5; the web's picker, ROLE-MATRIX.md §15) ──

/**
 * The Technician row and its "Change technician" editor. ADMIN and AGENT (not locked) edit, exactly where More options
 * offers Assign; a locked AGENT sees the reason; L2_MANAGER and END_USER see the value only (ticketFieldPermissions).
 */
export function TechnicianSection(props: SectionProps) {
  const { ticket, edit } = props;
  const { access, open, blocked } = sectionState('technician', props);
  if (open) {
    return (
      <TechnicianForm
        ticket={ticket}
        saving={edit.saving}
        onCancel={edit.cancel}
        onDirtyChange={edit.setDirty}
        onSave={edit.assign}
      />
    );
  }
  return (
    <>
      <Row label="Technician">{formatDisplayName(ticket.assignedTo?.displayName) || 'Unassigned'}</Row>
      <FieldAction access={access} label="Change technician" onPress={() => edit.open('technician')} blocked={blocked} />
    </>
  );
}

function TechnicianForm({
  ticket, saving, onCancel, onDirtyChange, onSave,
}: {
  ticket: TicketDetail;
  saving: boolean;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (choice: TechnicianChoice) => void;
}) {
  // The assign picker's sources (M7), as the web's (05 §A.4): TKT-10 recommended for the ticket's category and country,
  // then the members of the ticket's group (LKP-2); USR-3 search when the group has no members.
  const teams = useTeams({ enabled: true });
  const suggested = useSuggestedAssignees(ticket.id, { enabled: true });
  // Keyed on the id, so Save starts disabled even if TKT-3 left out the `assignedTo` object.
  const current: Technician | null = ticket.assignedToId
    ? { id: ticket.assignedToId, displayName: ticket.assignedTo?.displayName ?? '', email: ticket.assignedTo?.email ?? '' }
    : null;
  const [chosen, setChosen] = useState<Technician | null>(current);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dirty = (chosen?.id ?? null) !== (ticket.assignedToId ?? null);
  useReportDirty(dirty, onDirtyChange);

  const team = teams.data?.find((t) => t.id === ticket.teamId);
  const members = useMemo(() => teamMembers(team), [team]);
  const recommended = useMemo(() => recommendedTechnicians(suggested.data, teams.data), [suggested.data, teams.data]);
  const people = useMemo(
    () =>
      technicianOptions({
        recommended,
        members,
        currentId: ticket.assignedToId ?? null,
        countryName: ticket.country ? ticket.country.displayName || ticket.country.name : null,
        groupName: team?.name ?? null,
      }),
    [recommended, members, ticket.assignedToId, ticket.country, team?.name],
  );
  const loading = teams.isLoading || suggested.isLoading;
  const teamId = assignmentTeamId(chosen?.id ?? null, members, ticket.teamId);
  const currentName = current ? technicianName(current) : '';

  return (
    <View className="border-b border-gray-100 py-3">
      {loading ? (
        <View className="mb-3 min-h-11 flex-row items-center">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="ml-2 text-sm text-gray-700">Loading technicians…</Text>
        </View>
      ) : (
        <SelectField
          label="Technician"
          value={chosen ? technicianName(chosen) || 'Current technician' : null}
          placeholder="Unassigned"
          onPress={() => setSheetOpen(true)}
          disabled={saving}
          hint={members.length > 0 ? `Recommended technicians and the members of ${team?.name ?? 'the group'}` : 'Recommended technicians, or search by name'}
        />
      )}
      <LookupError query={suggested} what="recommendations" />
      <LookupError query={teams} what="groups" />
      {dirty && chosen ? <Notice>{assignMessage(ticket.ticketNumber, technicianName(chosen), teamId ? (team?.name ?? null) : null)}</Notice> : null}
      {dirty && !chosen ? <Notice tone="warning">{unassignMessage(ticket.ticketNumber, currentName)}</Notice> : null}
      <EditorActions canSave={dirty} saving={saving} onSave={() => onSave({ person: chosen, teamId })} onCancel={onCancel} />

      <PersonPickerSheet
        visible={sheetOpen}
        title="Technician"
        people={people}
        searchRoles={members.length === 0 ? TECHNICIAN_ROLES : undefined}
        extraOptions={[{ key: 'none', label: 'Unassigned', onPress: () => { setChosen(null); setSheetOpen(false); } }]}
        onPick={(p) => {
          setChosen({ id: p.id, displayName: p.displayName, email: p.email });
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

// ── Country (G1 §4) ──────────────────────────────────────────

export function CountrySection(props: SectionProps) {
  const { ticket, edit } = props;
  const { access, open, blocked } = sectionState('country', props);
  if (open) {
    return (
      <CountryForm
        ticket={ticket}
        saving={edit.saving}
        onCancel={edit.cancel}
        onDirtyChange={edit.setDirty}
        onSave={(input) => edit.save('country', input)}
      />
    );
  }
  return (
    <>
      <Row label="Country">{ticket.country?.displayName || ticket.country?.name || 'Not set'}</Row>
      <FieldAction access={access} label="Change country" onPress={() => edit.open('country')} blocked={blocked} />
    </>
  );
}

function CountryForm({
  ticket, saving, onCancel, onDirtyChange, onSave,
}: {
  ticket: TicketDetail;
  saving: boolean;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (input: UpdateTicketBody) => void;
}) {
  // ADMIN → LKP-5, triage AGENT → LKP-4 (05 §A.12); both are active countries only.
  const countries = useCountryOptions({ enabled: true });
  const [countryId, setCountryId] = useState<string | null>(ticket.countryId ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dirty = countryId !== (ticket.countryId ?? null);
  useReportDirty(dirty, onDirtyChange);

  const list = countries.data ?? [];
  const current = ticket.country && !list.some((c) => c.id === ticket.country?.id)
    ? [{ id: ticket.country.id, label: `${ticket.country.displayName || ticket.country.name} (inactive)` }]
    : [];
  const options: SheetOption<string>[] = [
    { value: NONE, label: 'Unassigned', description: 'No country on this ticket' },
    ...current.map((c) => ({ value: c.id, label: c.label })),
    ...list.map((c) => ({ value: c.id, label: c.displayName || c.name })),
  ];
  const chosen = options.find((o) => o.value === (countryId ?? NONE));

  return (
    <View className="border-b border-gray-100 py-3">
      {countries.data === undefined && !(countries.isError && !countries.isFetching) ? (
        <View className="mb-3 min-h-11 flex-row items-center">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="ml-2 text-sm text-gray-700">Loading countries…</Text>
        </View>
      ) : (
        <SelectField label="Country" value={chosen?.label ?? null} placeholder="Unassigned" onPress={() => setSheetOpen(true)} disabled={saving || countries.data === undefined} />
      )}
      <LookupError query={countries} what="countries" />
      <EditorActions canSave={dirty} saving={saving} onSave={() => onSave({ countryId })} onCancel={onCancel} />
      <OptionSheet
        visible={sheetOpen}
        title="Country"
        options={options}
        selected={countryId ?? NONE}
        onSelect={(value) => setCountryId(value === NONE ? null : value)}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

// ── Resolution (G1 §5) ───────────────────────────────────────

/** Resolution section (04 M4): shown once a ticket is resolved/closed/canceled or has closure data. */
export function ResolutionSection(props: SectionProps) {
  const { ticket, edit } = props;
  const { access, open, blocked } = sectionState('resolution', props);
  const done = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' || ticket.status === 'CANCELED';
  const hasData = !!(ticket.resolution || ticket.closureCode || ticket.closureComments);
  if (!done && !hasData) return null;
  return (
    <Card title="Resolution">
      {open ? (
        <ResolutionForm
          ticket={ticket}
          saving={edit.saving}
          onCancel={edit.cancel}
          onDirtyChange={edit.setDirty}
          onSave={(input) => edit.save('resolution', input)}
        />
      ) : (
        <>
          {ticket.resolution ? <HtmlText html={ticket.resolution} collapsedHeight={140} /> : <Text className="text-sm text-gray-500">No resolution recorded</Text>}
          <View className="mt-2">
            <FieldAction access={access} label="Edit resolution" onPress={() => edit.open('resolution')} blocked={blocked} />
          </View>
        </>
      )}
      <View className="mt-2">
        <Row label="Closure code">{ticket.closureCode || 'Not set'}</Row>
        <Row label="First call fix">{ticket.isFcr ? 'Yes' : 'No'}</Row>
        {ticket.resolvedAt ? <Row label="Resolved">{formatDateTime(ticket.resolvedAt)}</Row> : null}
        {ticket.closedAt ? <Row label="Closed">{formatDateTime(ticket.closedAt)}</Row> : null}
      </View>
      {ticket.closureComments ? (
        <View className="mt-2">
          <Text className="mb-1 text-xs font-semibold text-gray-500">Closure comments</Text>
          <HtmlText html={ticket.closureComments} collapsedHeight={140} />
        </View>
      ) : null}
    </Card>
  );
}

function ResolutionForm({
  ticket, saving, onCancel, onDirtyChange, onSave,
}: {
  ticket: TicketDetail;
  saving: boolean;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (input: UpdateTicketBody) => void;
}) {
  const [draft, setDraft] = useState(ticket.resolution ?? '');
  const dirty = draft !== (ticket.resolution ?? '');
  useReportDirty(dirty, onDirtyChange);
  return (
    <View>
      <FieldLabel label="Resolution" hint="The requester sees this on the ticket." />
      <TextInput
        value={draft}
        onChangeText={setDraft}
        editable={!saving}
        multiline
        textAlignVertical="top"
        placeholder="How the issue was resolved"
        placeholderTextColor={colors.text.secondary}
        accessibilityLabel="Resolution"
        className="mb-3 min-h-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
      />
      {/* Sent as typed, as on the web (G1 §5): no trim, and an empty text is allowed. */}
      <EditorActions canSave={dirty} saving={saving} onSave={() => onSave({ resolution: draft })} onCancel={onCancel} />
    </View>
  );
}
