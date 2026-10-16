// M8 Create ticket (04 M8, 05 §A.8).
// - Title (3–255), description, 3-level category cascade from LKP-1 (flat) — all required on the device.
// - Staff only: impact, urgency. ADMIN/AGENT only (LKP-2 and USR-3 are 403 for L2): group ("Auto (from category)"),
//   assignee, requester (raise on behalf). END_USER sees the simple form and the routing banner.
// - Body from the per-role allow-list (createTicket): END_USER sends only title, description, categoryId, source.
// - Create is explicit and confirmed (a ticket can't be deleted). Files upload AFTER create, to the new id (ATT-2).
//   On success: open the new ticket.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UploadFile } from '@/api/attachments.api';
import { describeWriteError, isSessionEndedError } from '@/api/errors';
import {
  AttachmentPicker, ErrorState, FieldLabel, FormCard, InlineError, LoadingSkeleton, LookupError, Notice, OfflineBanner,
  OfflineState, OptionSheet, PersonPickerSheet, ScreenHeader, SelectField, SubmitButton, type Person, type SheetOption,
} from '@/components';
import { useCategories, useCreateTicket, useDiscardGuard, useSingleFlight, useTeams, validateNewTicket } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import {
  TICKET_IMPACTS, TICKET_URGENCIES, type Category, type TicketImpact, type TicketStackScreenProps, type TicketUrgency,
  type UserRole,
} from '@/types';
import { confirmAction, notify } from '@/utils/dialogs';
import { IMPACT_LABELS, URGENCY_LABELS, formatDisplayName } from '@/utils/format';
import { isAgentOrAdmin, isStaff } from '@/utils/roles';

const AUTO = '__AUTO__';
const NOT_SET = '__NOT_SET__';
const ASSIGNEE_ROLES: readonly UserRole[] = ['ADMIN', 'AGENT', 'L2_MANAGER']; // "END_USERs filtered out" (05 §A.8)
/** Dev builds start the title with the agreed test prefix, so UAT test tickets are easy to find. */
const INITIAL_TITLE = __DEV__ ? '[MOBILE TEST] ' : '';

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name);

type Sheet = 'top' | 'sub' | 'item' | 'impact' | 'urgency' | 'team' | 'assignee' | 'requester' | null;

export function CreateTicketScreen({ navigation }: TicketStackScreenProps<'CreateTicket'>) {
  const insets = useSafeAreaInsets();
  const role: UserRole = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const staff = isStaff(role);
  const agentOrAdmin = isAgentOrAdmin(role);

  const categoriesQuery = useCategories({ enabled: true });
  const teamsQuery = useTeams({ enabled: agentOrAdmin });
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
        requesterId: agentOrAdmin ? requester?.id : undefined,
        files,
      });
      if (result.uploadError) {
        Alert.alert('Ticket created', `Ticket created but some attachments failed to upload. ${describeWriteError(result.uploadError)}`);
      } else {
        notify('Ticket created successfully');
      }
      leave(() => navigation.replace('TicketDetail', { ticketId: result.ticket.id }));
    } catch (e) {
      if (!isSessionEndedError(e)) setError(describeWriteError(e) || 'Failed to create ticket');
    }
  }

  const busy = create.isPending;
  const option = (c: Category): SheetOption<string> => ({ value: c.id, label: c.name });
  const impactOptions: SheetOption<string>[] = [{ value: NOT_SET, label: 'Not set' }, ...TICKET_IMPACTS.map((v) => ({ value: v, label: IMPACT_LABELS[v] }))];
  const urgencyOptions: SheetOption<string>[] = [{ value: NOT_SET, label: 'Not set' }, ...TICKET_URGENCIES.map((v) => ({ value: v, label: URGENCY_LABELS[v] }))];
  const teamOptions: SheetOption<string>[] = [{ value: AUTO, label: 'Auto (from category)' }, ...teams.map((t) => ({ value: t.id, label: t.name }))];

  if (!categoriesQuery.data) {
    // Categories are required to raise a ticket (05 §A.8), so the form waits for them.
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="New ticket" variant="back" />
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
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <ScreenHeader title="New ticket" variant="back" />
      <OfflineBanner />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
        <FormCard>
          <FieldLabel label="Title" required hint="3 to 255 characters" />
          <TextInput
            value={title}
            onChangeText={setTitle}
            editable={!busy}
            maxLength={255}
            placeholder="Short summary of the issue"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Title, required"
            className="mb-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
          />
          <FieldLabel label="Description" required />
          <TextInput
            value={description}
            onChangeText={setDescription}
            editable={!busy}
            multiline
            textAlignVertical="top"
            placeholder="What happened, and what do you need?"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Description, required"
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
          {!staff && categoryId ? (
            <Notice>Your ticket will be automatically routed to the appropriate team based on the selected category.</Notice>
          ) : null}
        </FormCard>

        {staff ? (
          <FormCard title="Classification">
            <SelectField label="Impact" value={impact ? IMPACT_LABELS[impact] : null} placeholder="Not set" onPress={() => setSheet('impact')} disabled={busy} />
            <SelectField label="Urgency" value={urgency ? URGENCY_LABELS[urgency] : null} placeholder="Not set" onPress={() => setSheet('urgency')} disabled={busy} />
            <Notice>Priority is set by the server from impact × urgency (Auto).</Notice>
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
            <SelectField
              label="Requester"
              value={requester ? formatDisplayName(requester.displayName) || requester.email : 'Me'}
              hint="Raise this ticket on behalf of someone else"
              onPress={() => setSheet('requester')}
              disabled={busy}
            />
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
        visible={sheet === 'impact'}
        title="Impact"
        options={impactOptions}
        selected={impact ?? NOT_SET}
        onSelect={(v) => setImpact(v === NOT_SET ? null : (v as TicketImpact))}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'urgency'}
        title="Urgency"
        options={urgencyOptions}
        selected={urgency ?? NOT_SET}
        onSelect={(v) => setUrgency(v === NOT_SET ? null : (v as TicketUrgency))}
        onClose={() => setSheet(null)}
      />
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
        searchRoles={team ? undefined : ASSIGNEE_ROLES}
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
    </KeyboardAvoidingView>
  );
}
