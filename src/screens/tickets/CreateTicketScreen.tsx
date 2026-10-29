// M8 Create ticket (04 M8, 05 §A.8).
// - Title (3–255), description, 3-level category cascade from LKP-1 (flat) — all required on the device.
// - Who sees what comes from createTicketPermissions() (utils/permissions.ts): staff impact and urgency; ADMIN/AGENT
//   the priority preview (G5), group ("Auto (from category)"), assignee, requester (raise on behalf); END_USER the
//   simple form and the routing banner.
// - Priority preview (Phase G5): the G1 box from TicketPropertyEditors, recomputed as impact and urgency change, as the
//   web's create page does. Display only: no one picks a priority, and the body never carries one (01 TKT-2).
// - Body from the per-role allow-list (createTicket): END_USER sends only title, description, categoryId, source.
// - Create is explicit and confirmed (a ticket can't be deleted). Files upload AFTER create, to the new id (ATT-2).
//   On success: open the new ticket.
//
// iOS (docs/ios/00-PORT-MANIFEST.md §6 #7): a root sheet with the standard ✕, its title from routes.ts. On success the
// sheet closes and the new ticket opens in the tab underneath (Android's replace() can't cross a sheet). Impact and
// urgency are iOS action sheets; the category levels, group and people stay scrollable sheets (server lists). The form
// lifts above the keyboard (SheetKeyboardView); a tap outside an input or a drag down puts the keyboard away.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UploadFile } from '@/api/attachments.api';
import { describeWriteError, isSessionEndedError } from '@/api/errors';
import {
  AttachmentPicker, ErrorState, FieldLabel, FormCard, InlineError, KeyboardDoneBar, LoadingSkeleton, LookupError, Notice, OfflineBanner,
  OfflineState, OptionSheet, PersonPickerSheet, SelectField, SheetKeyboardView, SubmitButton, type Person, type SheetOption,
} from '@/components';
import {
  useCategories, useCreateTicket, useDiscardGuard, usePriorityMatrix, useSingleFlight, useTeams, validateNewTicket,
} from '@/hooks';
import { tabUnderSheets } from '@/navigation/routes';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import {
  TICKET_IMPACTS, TICKET_URGENCIES, type Category, type SheetScreenProps, type TicketImpact, type TicketUrgency,
} from '@/types';
import { chooseFromActionSheet, type SheetChoice } from '@/utils/actionSheet';
import { CREATE_ASSIGNEE_ROLES } from '@/utils/assignment';
import { confirmAction, notify } from '@/utils/dialogs';
import { IMPACT_LABELS, URGENCY_LABELS, formatDisplayName } from '@/utils/format';
import { hapticOutcome } from '@/utils/haptics';
import { createTicketPermissions } from '@/utils/permissions';
import { PriorityPreviewBox } from './TicketPropertyEditors';

/** The keyboard's Done bar on this form (iOS-4, components/KeyboardDoneBar.tsx). */
const CREATE_KEYBOARD = 'create-ticket-keyboard';

const AUTO = '__AUTO__';
const NOT_SET = '__NOT_SET__';
/** Dev builds start the title with the agreed test prefix, so UAT test tickets are easy to find. */
const INITIAL_TITLE = __DEV__ ? '[MOBILE TEST] ' : '';

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name);

type Sheet = 'top' | 'sub' | 'item' | 'team' | 'assignee' | 'requester' | null;

export function CreateTicketScreen({ navigation }: SheetScreenProps<'CreateTicket'>) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const can = createTicketPermissions(user);
  const staff = can.classification;
  const agentOrAdmin = can.routing;

  const categoriesQuery = useCategories({ enabled: true });
  const teamsQuery = useTeams({ enabled: agentOrAdmin });
  // G5: LKP-6 for the preview, ADMIN/AGENT only (403 for L2, as on the web). Shared cache with the M4 editor.
  const matrix = usePriorityMatrix({ enabled: can.priorityPreview });
  const create = useCreateTicket();
  const once = useSingleFlight();

  const [title, setTitle] = useState(INITIAL_TITLE);
  const [description, setDescription] = useState('');
  const [topId, setTopId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [impact, setImpact] = useState<TicketImpact | null>(null);
  const [urgency, setUrgency] = useState<TicketUrgency | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null); // null = Auto (from category)
  const [teamTouched, setTeamTouched] = useState(false);
  const [assignee, setAssignee] = useState<Person | null>(null);
  const [requester, setRequester] = useState<Person | null>(null); // null = me
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);

  // ── Category cascade, verbatim from FE:CreateTicketPage.tsx:78-97 (05 §A.8) ──
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const topCategories = useMemo(() => categories.filter((c) => c.level === 'CATEGORY' || (!c.level && !c.parentId)).sort(byName), [categories]);
  const subCategories = useMemo(
    () => (topId ? categories.filter((c) => c.parentId === topId && (c.level === 'SUBCATEGORY' || !c.level)).sort(byName) : []),
    [categories, topId],
  );
  const items = useMemo(
    () => (subId ? categories.filter((c) => c.parentId === subId && (c.level === 'ITEM' || !c.level)).sort(byName) : []),
    [categories, subId],
  );
  const find = useCallback((id: string | null) => (id ? categories.find((c) => c.id === id) : undefined), [categories]);
  const categoryId = itemId || subId || topId;

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const team = teams.find((t) => t.id === teamId);
  const members: Person[] = useMemo(
    () => (team?.members ?? []).map((m) => m.user).filter((u): u is NonNullable<typeof u> => !!u).map((u) => ({ id: u.id, displayName: u.displayName, email: u.email })),
    [team],
  );

  // Staff auto-preview (05 §A.8, :99-130): walk up from the deepest category; pre-select the first defaultTeamId,
  // and the first defaultAssigneeId only if that user is a member of that team. Stops once the group is chosen by hand.
  useEffect(() => {
    if (!agentOrAdmin || teamTouched || teams.length === 0) return;
    const chain = [find(itemId), find(subId), find(topId)].filter((c): c is Category => !!c);
    const autoTeamId = chain.find((c) => c.defaultTeamId)?.defaultTeamId ?? null;
    const autoTeam = teams.find((t) => t.id === autoTeamId);
    setTeamId(autoTeam ? autoTeam.id : null);
    const withAssignee = chain.find((c) => c.defaultAssigneeId);
    const member = autoTeam?.members.find((m) => m.userId === withAssignee?.defaultAssigneeId || m.user?.id === withAssignee?.defaultAssigneeId);
    setAssignee(member?.user ? { id: member.user.id, displayName: member.user.displayName, email: member.user.email } : null);
  }, [agentOrAdmin, teamTouched, teams, itemId, subId, topId, find]);

  const dirty = title !== INITIAL_TITLE || !!description.trim() || !!categoryId || files.length > 0;
  const { leave } = useDiscardGuard({ dirty, busy: create.isPending, what: 'ticket' });

  async function submit() {
    setError(null);
    const problem = validateNewTicket({ title, description, categoryId });
    if (problem) {
      setError(problem);
      return;
    }
    const routing = team
      ? `It goes to ${team.name}${assignee ? `, assigned to ${formatDisplayName(assignee.displayName)}` : ''}.`
      : 'The Service Desk routes it from the category.';
    const ok = await confirmAction({
      title: 'Create this ticket?',
      message: [
        routing,
        `${requester ? formatDisplayName(requester.displayName) : 'You'} will be emailed a confirmation${assignee ? ', and the technician is emailed' : ''}.`,
        files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} upload after the ticket is created.` : '',
        "Tickets can't be deleted afterwards.",
      ].filter(Boolean).join(' '),
      confirmLabel: 'Create',
    });
    if (!ok) return;
    try {
      const result = await create.mutateAsync({
        title,
        description,
        categoryId,
        impact: staff ? (impact ?? undefined) : undefined,
        urgency: staff ? (urgency ?? undefined) : undefined,
        teamId: agentOrAdmin ? (teamId ?? undefined) : undefined,
        assignedToId: agentOrAdmin ? assignee?.id : undefined,
        requesterId: can.raiseOnBehalf ? requester?.id : undefined,
        files,
      });
      if (result.uploadError) {
        // iOS-4: created, but the files failed: the warning haptic with the Alert (utils/haptics.ts).
        hapticOutcome('warning');
        Alert.alert('Ticket created', `Ticket created but some attachments failed to upload. ${describeWriteError(result.uploadError)}`);
      } else {
        notify('Ticket created successfully');
      }
      // Close the sheet and open the new ticket in the tab underneath, over that tab's own screens.
      const tab = tabUnderSheets(navigation.getState());
      const ticketDetail = { screen: 'TicketDetail', params: { ticketId: result.ticket.id }, initial: false } as const;
      leave(() => navigation.popTo('App', { screen: tab, params: ticketDetail }));
    } catch (e) {
      if (!isSessionEndedError(e)) setError(describeWriteError(e) || 'Failed to create ticket');
    }
  }

  const busy = create.isPending;
  // iOS-4: Title's Return key moves to Description; Description (multiline) closes the keyboard with the Done bar.
  const descriptionInput = useRef<TextInput>(null);
  const option = (c: Category): SheetOption<string> => ({ value: c.id, label: c.name });
  const teamOptions: SheetOption<string>[] = [{ value: AUTO, label: 'Auto (from category)' }, ...teams.map((t) => ({ value: t.id, label: t.name }))];

  // Impact and urgency: short fixed lists, so iOS action sheets, with the web's "Not set" first.
  const impactChoices: SheetChoice<string>[] = [{ value: NOT_SET, label: 'Not set' }, ...TICKET_IMPACTS.map((v) => ({ value: v, label: IMPACT_LABELS[v] }))];
  const urgencyChoices: SheetChoice<string>[] = [{ value: NOT_SET, label: 'Not set' }, ...TICKET_URGENCIES.map((v) => ({ value: v, label: URGENCY_LABELS[v] }))];
  async function pickImpact() {
    const v = await chooseFromActionSheet({ title: 'Impact', choices: impactChoices });
    if (v !== null) setImpact(v === NOT_SET ? null : (v as TicketImpact));
  }
  async function pickUrgency() {
    const v = await chooseFromActionSheet({ title: 'Urgency', choices: urgencyChoices });
    if (v !== null) setUrgency(v === NOT_SET ? null : (v as TicketUrgency));
  }

  if (!categoriesQuery.data) {
    // Categories are required to raise a ticket (05 §A.8), so the form waits for them.
    return (
      <View className="flex-1 bg-gray-50">
        <OfflineBanner />
        {categoriesQuery.fetchStatus === 'paused' ? (
          <OfflineState what="The ticket form" />
        ) : categoriesQuery.isError ? (
          <ErrorState error={categoriesQuery.error} title="Couldn't load categories" onRetry={() => void categoriesQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="formPage" rows={4} />
        )}
      </View>
    );
  }

  return (
    <SheetKeyboardView>
      <OfflineBanner />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      >
        <FormCard>
          <FieldLabel label="Title" required hint="3 to 255 characters" />
          <TextInput
            value={title}
            onChangeText={setTitle}
            editable={!busy}
            maxLength={255}
            placeholder="Short summary of the issue"
            placeholderTextColor={colors.text.secondary}
            accessibilityLabel="Title, required"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => descriptionInput.current?.focus()}
            className="mb-3 min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
          />
          <FieldLabel label="Description" required />
          <TextInput
            ref={descriptionInput}
            value={description}
            onChangeText={setDescription}
            editable={!busy}
            multiline
            textAlignVertical="top"
            placeholder="What happened, and what do you need?"
            placeholderTextColor={colors.text.secondary}
            accessibilityLabel="Description, required"
            inputAccessoryViewID={CREATE_KEYBOARD}
            className="min-h-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
          />
        </FormCard>

        <FormCard title="Category">
          <SelectField label="Category" required value={find(topId)?.name ?? null} placeholder="Select a category" onPress={() => setSheet('top')} disabled={busy} />
          {subCategories.length > 0 ? (
            <SelectField label="Subcategory" value={find(subId)?.name ?? null} placeholder="Select (optional)" onPress={() => setSheet('sub')} disabled={busy} />
          ) : null}
          {items.length > 0 ? (
            <SelectField label="Item" value={find(itemId)?.name ?? null} placeholder="Select (optional)" onPress={() => setSheet('item')} disabled={busy} />
          ) : null}
          {can.routingNotice && categoryId ? (
            <Notice>Your ticket will be automatically routed to the appropriate team based on the selected category.</Notice>
          ) : null}
        </FormCard>

        {staff ? (
          <FormCard title="Classification">
            <SelectField label="Impact" value={impact ? IMPACT_LABELS[impact] : null} placeholder="Not set" onPress={() => void pickImpact()} disabled={busy} />
            <SelectField label="Urgency" value={urgency ? URGENCY_LABELS[urgency] : null} placeholder="Not set" onPress={() => void pickUrgency()} disabled={busy} />
            <PriorityPreviewBox target={{ kind: 'create' }} staged={{ impact, urgency }} enabled={can.priorityPreview} matrix={matrix} />
          </FormCard>
        ) : null}

        {agentOrAdmin ? (
          <FormCard title="Routing">
            <SelectField
              label="Group"
              value={team ? team.name : 'Auto (from category)'}
              hint={team && !teamTouched ? 'Pre-selected from the category' : undefined}
              onPress={() => setSheet('team')}
              disabled={busy || teamsQuery.isLoading}
            />
            <LookupError query={teamsQuery} what="groups" />
            <SelectField
              label="Assign to"
              value={assignee ? formatDisplayName(assignee.displayName) || assignee.email : null}
              placeholder="No one (auto)"
              onPress={() => setSheet('assignee')}
              disabled={busy}
            />
            {can.raiseOnBehalf ? (
              <SelectField
                label="Requester"
                value={requester ? formatDisplayName(requester.displayName) || requester.email : 'Me'}
                hint="Raise this ticket on behalf of someone else"
                onPress={() => setSheet('requester')}
                disabled={busy}
              />
            ) : null}
          </FormCard>
        ) : null}

        <FormCard title="Attachments">
          <AttachmentPicker files={files} onChange={setFiles} disabled={busy} />
          <Text className="mt-2 text-xs text-gray-500">Files upload after the ticket is created.</Text>
        </FormCard>

        <InlineError message={error} />
        <View className="mx-4">
          <SubmitButton label="Create ticket" onPress={() => void once(submit)} loading={busy} />
        </View>
      </ScrollView>
      <KeyboardDoneBar id={CREATE_KEYBOARD} />

      <OptionSheet
        visible={sheet === 'top'}
        title="Category"
        options={topCategories.map(option)}
        selected={topId}
        onSelect={(id) => {
          setTopId(id); // changing top resets sub + item (05 §A.8)
          setSubId(null);
          setItemId(null);
        }}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'sub'}
        title="Subcategory"
        options={subCategories.map(option)}
        selected={subId}
        onSelect={(id) => {
          setSubId(id); // changing sub resets item
          setItemId(null);
        }}
        onClose={() => setSheet(null)}
      />
      <OptionSheet visible={sheet === 'item'} title="Item" options={items.map(option)} selected={itemId} onSelect={setItemId} onClose={() => setSheet(null)} />
      <OptionSheet
        visible={sheet === 'team'}
        title="Group"
        options={teamOptions}
        selected={teamId ?? AUTO}
        onSelect={(v) => {
          setTeamTouched(true);
          const next = v === AUTO ? null : v;
          setTeamId(next);
          const nextTeam = teams.find((t) => t.id === next);
          if (assignee && !nextTeam?.members.some((m) => m.user?.id === assignee.id)) setAssignee(null);
        }}
        onClose={() => setSheet(null)}
      />
      <PersonPickerSheet
        visible={sheet === 'assignee'}
        title={team ? `Assign within ${team.name}` : 'Assign to'}
        people={members}
        searchRoles={team ? undefined : CREATE_ASSIGNEE_ROLES}
        extraOptions={[{ key: 'none', label: 'No one (auto)', onPress: () => { setAssignee(null); setSheet(null); } }]}
        onPick={(p) => {
          setAssignee(p);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <PersonPickerSheet
        visible={sheet === 'requester'}
        title="Requester"
        searchRoles={[]}
        extraOptions={[{ key: 'me', label: 'Me', onPress: () => { setRequester(null); setSheet(null); } }]}
        onPick={(p) => {
          setRequester(p);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
    </SheetKeyboardView>
  );
}
