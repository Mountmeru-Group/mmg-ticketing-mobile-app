// M7 Assign picker (04 M7, 05 §A.4, 08 §4.2). ADMIN and AGENT only — L2_MANAGER and END_USER never reach it (the
// entry points are hidden; the server would answer 403) and the screen refuses them too.
// - Group first (LKP-2, active only), then its members, filterable. USR-3 search when the group has no members.
// - Recommended for the ticket's country (TKT-10). It may include INACTIVE users (05 B.30): anyone not found in an
//   active group is listed last and flagged.
// - "Assign to me" (hidden for a pre-check dev-token placeholder session), "Remove assignment", "Move to group".
// - Every assignment is TKT-5 POST /tickets/:id/assign with `teamId` when known (05 B.14, 08 S5); `teamId: null` is
//   never sent (it can't clear a team). Each one asks for confirmation (the assignee is emailed).
// - Bulk mode (2–20 tickets from M3): pick group + person, sequential, stop on 429/5xx, per-ticket results.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { assignTicket } from '@/api/tickets.api';
import {
  BulkProgressModal, EmptyState, ErrorState, FormCard, LoadingSkeleton, LookupError, Notice, OfflineBanner, OfflineState,
  OptionSheet, OutlineButton, PersonPickerSheet, ScreenHeader, SelectField, type Person, type SheetOption,
} from '@/components';
import {
  assertAssignment, fetchCurrentStatus, findCachedTicket, useAssignTicket, useBulkRunner, useDiscardGuard, useSingleFlight, useSuggestedAssignees, useTeams,
  useTicket, type BulkTarget,
} from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import type { Team, TicketDetail, TicketStackScreenProps, TicketStatus, UserRole } from '@/types';
import { confirmAction, notify, reportWriteError } from '@/utils/dialogs';
import { formatDisplayName, statusLabel } from '@/utils/format';
import { isAgentOrAdmin } from '@/utils/roles';
import { canAssignToSelf } from '@/utils/session';
import { BULK_ACTION_LIMIT, isResolvedLocked } from '@/utils/ticket-rules';
import { assignMessage, bulkAssignMessage } from '@/utils/writeCopy';

type Props = TicketStackScreenProps<'AssignPicker'>;

const TECHNICIAN_ROLES: readonly UserRole[] = ['AGENT', 'ADMIN'];

function membersOf(team: Team | undefined): Person[] {
  return (team?.members ?? [])
    .map((m) => m.user)
    .filter((u): u is NonNullable<typeof u> => !!u && typeof u.id === 'string')
    .map((u) => ({ id: u.id, displayName: u.displayName, email: u.email }))
    .sort((a, b) => formatDisplayName(a.displayName).localeCompare(formatDisplayName(b.displayName)));
}

export function AssignPickerScreen(props: Props) {
  const role: UserRole = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  if (!isAgentOrAdmin(role)) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="Assign" variant="close" />
        <EmptyState icon="lock-closed-outline" title="Not available for your role" message="Only Admins and Technicians can assign tickets." />
      </View>
    );
  }
  return props.route.params.ticketIds.length > 1 ? <BulkAssign {...props} /> : <SingleAssign {...props} />;
}

// ── Group selector (shared) ──────────────────────────────────

function useGroupSelection(initialTeamId: string | null | undefined) {
  const teams = useTeams({ enabled: true });
  const [teamId, setTeamId] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (initialised || initialTeamId === undefined) return;
    setTeamId(initialTeamId);
    setInitialised(true);
  }, [initialTeamId, initialised]);
  const team = teams.data?.find((t) => t.id === teamId);
  const options: SheetOption<string>[] = (teams.data ?? []).map((t) => ({ value: t.id, label: t.name }));
  return { teams, teamId, setTeamId, team, options };
}

// ── One ticket ───────────────────────────────────────────────

function SingleAssign({ navigation, route }: Props) {
  const ticketId = route.params.ticketIds[0] ?? '';
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const role: UserRole = user?.role ?? 'END_USER';
  const ticketQuery = useTicket(ticketId);
  const ticket = ticketQuery.data;
  const assign = useAssignTicket();
  const once = useSingleFlight();
  const group = useGroupSelection(ticket ? ticket.teamId : undefined);
  const suggested = useSuggestedAssignees(ticketId, { enabled: !!ticket });
  const [sheet, setSheet] = useState<'group' | 'people' | null>(null);
  const { leave } = useDiscardGuard({ dirty: false, busy: assign.isPending, what: 'assignment' });

  const members = useMemo(() => membersOf(group.team), [group.team]);
  // 05 B.30: recommended users may be inactive. Those found in an active group come first; the rest last, flagged.
  const recommended = useMemo(() => {
    const inActiveGroup = new Set((group.teams.data ?? []).flatMap((t) => (t.members ?? []).map((m) => m.user?.id)));
    const people = (suggested.data ?? []).map((u) => ({ id: u.id, displayName: u.displayName, email: u.email, active: inActiveGroup.has(u.id) }));
    return [...people.filter((p) => p.active), ...people.filter((p) => !p.active)];
  }, [suggested.data, group.teams.data]);

  // Every assignment path goes through the single-flight guard (no double sends from a double-tap).
  const doAssign = (...args: Parameters<typeof doAssignNow>) => once(() => doAssignNow(...args));
  async function doAssignNow(
    person: { id: string; displayName: string } | null,
    teamId: string | undefined,
    confirm: { title: string; message: string; label: string; done?: string },
  ) {
    if (!ticket) return;
    const ok = await confirmAction({ title: confirm.title, message: confirm.message, confirmLabel: confirm.label, destructive: person === null });
    if (!ok) return;
    try {
      await assign.mutateAsync({ ticketId, status: ticket.status, assignedToId: person ? person.id : null, teamId });
      notify(confirm.done ?? (person ? `Assigned to ${formatDisplayName(person.displayName)}` : 'Assignment removed'));
      leave(() => navigation.goBack());
    } catch (e) {
      reportWriteError('Failed to assign', e);
    }
  }

  function pickPerson(person: Person, ticketNow: TicketDetail) {
    setSheet(null);
    // Send the selected group only when the person belongs to it; otherwise let the server keep/choose (web parity).
    const inGroup = members.some((m) => m.id === person.id);
    const teamId = inGroup ? (group.teamId ?? undefined) : undefined;
    const name = formatDisplayName(person.displayName) || person.email;
    void doAssign(person, teamId, {
      title: `Assign to ${name}?`,
      message: assignMessage(ticketNow.ticketNumber, name, inGroup ? (group.team?.name ?? null) : null),
      label: 'Assign',
    });
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-gray-50">
        <ScreenHeader title="Assign" variant="close" />
        <OfflineBanner />
        {ticketQuery.fetchStatus === 'paused' ? (
          <OfflineState what="This ticket" />
        ) : ticketQuery.isError ? (
          <ErrorState error={ticketQuery.error} title="Couldn't load this ticket" onRetry={() => void ticketQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="formPage" rows={3} />
        )}
      </View>
    );
  }

  const locked = isResolvedLocked(role, ticket.status);
  const busy = assign.isPending;
  const current = formatDisplayName(ticket.assignedTo?.displayName);
  const groupChanged = !!group.teamId && group.teamId !== ticket.teamId;

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title={`Assign · #${ticket.ticketNumber}`} variant="close" />
      <OfflineBanner />
      {locked ? (
        <EmptyState icon="lock-closed-outline" title="Locked" message="Closed and canceled tickets are locked for technicians." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
          <FormCard>
            <Text className="text-sm text-gray-500" numberOfLines={2}>#{ticket.ticketNumber} · {ticket.title}</Text>
            <Text className="mt-2 text-sm text-gray-700">
              Technician: <Text className="font-semibold">{current || 'Unassigned'}</Text> · Group:{' '}
              <Text className="font-semibold">{ticket.team?.name ?? 'Not set'}</Text>
            </Text>
          </FormCard>

          <FormCard title="Quick actions">
            {canAssignToSelf(user) && user ? (
              <ActionRow
                label="Assign to me"
                disabled={busy || ticket.assignedToId === user.id}
                onPress={() =>
                  void doAssign({ id: user.id, displayName: user.displayName }, ticket.teamId ?? undefined, {
                    title: 'Assign to you?',
                    message: `#${ticket.ticketNumber} will be assigned to you${ticket.team ? ` in ${ticket.team.name}` : ''}.`,
                    label: 'Assign to me',
                  })
                }
              />
            ) : (
              <Notice>
                "Assign to me" isn't available: this session was saved before the developer token was checked with the server.
                Sign out and paste the token again.
              </Notice>
            )}
            {ticket.assignedToId ? (
              <ActionRow
                label="Remove assignment"
                tone="danger"
                disabled={busy}
                onPress={() =>
                  void doAssign(null, undefined, {
                    title: 'Remove assignment?',
                    message: `#${ticket.ticketNumber} will have no technician. ${current || 'The current technician'} is no longer assigned.`,
                    label: 'Remove',
                  })
                }
              />
            ) : null}
          </FormCard>

          <FormCard title="Group">
            <SelectField
              label="Group"
              value={group.team?.name ?? (group.teams.isLoading ? 'Loading groups…' : null)}
              placeholder="Choose a group"
              onPress={() => setSheet('group')}
              disabled={busy || !group.teams.data}
            />
            <LookupError query={group.teams} what="groups" />
            {groupChanged ? (
              <ActionRow
                label={`Move to ${group.team?.name ?? 'this group'}${current ? ` (keep ${current})` : ''}`}
                disabled={busy}
                onPress={() =>
                  void doAssign(
                    ticket.assignedToId ? { id: ticket.assignedToId, displayName: current } : null,
                    group.teamId ?? undefined,
                    {
                      title: 'Change group?',
                      message: `#${ticket.ticketNumber} moves to ${group.team?.name ?? 'the selected group'}${current ? `; ${current} stays assigned and is emailed` : ''}.`,
                      label: 'Move',
                      done: 'Group changed',
                    },
                  )
                }
              />
            ) : null}
            <ActionRow
              label={members.length > 0 ? `Choose from ${members.length} members` : 'Search technicians'}
              disabled={busy}
              onPress={() => setSheet('people')}
            />
          </FormCard>

          <FormCard title={`Recommended${ticket.country ? ` for ${ticket.country.displayName || ticket.country.name}` : ''}`}>
            {suggested.isLoading ? <LoadingSkeleton variant="lines" rows={2} /> : null}
            <LookupError query={suggested} what="recommendations" />
            {!suggested.isLoading && recommended.length === 0 && !suggested.isError ? (
              <Text className="text-sm text-gray-500">No recommendations for this category and country.</Text>
            ) : null}
            {recommended.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                disabled={busy || p.id === ticket.assignedToId}
                onPress={() => pickPerson(p, ticket)}
                className={`min-h-12 justify-center py-3 ${i === recommended.length - 1 ? '' : 'border-b border-gray-100'} ${busy || p.id === ticket.assignedToId ? 'opacity-50' : 'active:bg-gray-50'}`}
              >
                <Text className="text-base text-gray-900">{formatDisplayName(p.displayName)}</Text>
                <Text className="text-xs text-gray-500">
                  {p.email}
                  {p.active ? '' : ' · Not in any active group — may be inactive'}
                </Text>
              </Pressable>
            ))}
          </FormCard>
        </ScrollView>
      )}

      <OptionSheet
        visible={sheet === 'group'}
        title="Group"
        options={group.options}
        selected={group.teamId}
        onSelect={group.setTeamId}
        onClose={() => setSheet(null)}
      />
      <PersonPickerSheet
        visible={sheet === 'people'}
        title={group.team ? `Assign within ${group.team.name}` : 'Search technicians'}
        people={members}
        searchRoles={members.length === 0 ? TECHNICIAN_ROLES : undefined}
        onPick={(p) => pickPerson(p, ticket)}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

/** One action in a stack of actions: the standard outline button, left-aligned (UI-STANDARDS S5). */
function ActionRow({ label, onPress, disabled = false, tone = 'default' }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'default' | 'danger' }) {
  return (
    <View className="mb-2">
      <OutlineButton label={label} onPress={onPress} disabled={disabled} tone={tone === 'danger' ? 'danger' : 'neutral'} align="start" />
    </View>
  );
}

// ── Bulk assign (08 §4.2) ────────────────────────────────────

function BulkAssign({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const role: UserRole = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const bulk = useBulkRunner();
  const once = useSingleFlight();
  const group = useGroupSelection(null);
  const [sheet, setSheet] = useState<'group' | 'people' | null>(null);
  const members = useMemo(() => membersOf(group.team), [group.team]);
  const running = bulk.progress?.running ?? false;
  const { leave } = useDiscardGuard({ dirty: false, busy: running, what: 'bulk assignment' });

  const { targets, statusById } = useMemo(() => {
    const statuses = new Map<string, TicketStatus>();
    const list: BulkTarget[] = route.params.ticketIds.slice(0, BULK_ACTION_LIMIT).map((id) => {
      const t = findCachedTicket(queryClient, id);
      if (!t) return { id, label: `Ticket ${id.slice(0, 8)}`, skipReason: 'Not loaded on this device. Refresh the list and try again.' };
      statuses.set(id, t.status);
      return isResolvedLocked(role, t.status)
        ? { id, label: `#${t.ticketNumber}`, skipReason: `${statusLabel(t.status)} tickets are locked for technicians.` }
        : { id, label: `#${t.ticketNumber}` };
    });
    return { targets: list, statusById: statuses };
  }, [route.params.ticketIds, queryClient, role]);
  const eligible = targets.filter((t) => !t.skipReason);
  const skipped = targets.filter((t) => t.skipReason);

  async function pick(person: Person) {
    setSheet(null);
    const name = formatDisplayName(person.displayName) || person.email;
    const inGroup = members.some((m) => m.id === person.id);
    const teamId = inGroup ? (group.teamId ?? undefined) : undefined;
    const ok = await confirmAction({
      title: `Assign ${eligible.length} ${eligible.length === 1 ? 'ticket' : 'tickets'} to ${name}?`,
      message: bulkAssignMessage(eligible.length, name, skipped.length),
      confirmLabel: 'Assign',
      destructive: true,
    });
    if (!ok) return;
    await bulk.run(`Assigning to ${name}`, targets, async (id) => {
      const status = statusById.get(id);
      if (!status) throw new Error('Status unknown');
      assertAssignment(role, status, person.id); // same guards as a single assignment,
      assertAssignment(role, await fetchCurrentStatus(id), person.id); // against the server's current status too
      await assignTicket(id, teamId ? { assignedToId: person.id, teamId } : { assignedToId: person.id });
    });
  }

  const tooMany = route.params.ticketIds.length > BULK_ACTION_LIMIT;

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader title={`Assign ${route.params.ticketIds.length} tickets`} variant="close" />
      <OfflineBanner />
      {tooMany ? (
        <EmptyState icon="alert-circle-outline" title="Too many tickets" message={`You can act on up to ${BULK_ACTION_LIMIT} tickets at a time.`} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
          <FormCard title={`${eligible.length} will be assigned`}>
            <Text className="text-sm text-gray-700">{eligible.map((t) => t.label).join(', ') || 'None of the selected tickets can be assigned.'}</Text>
            {skipped.map((t) => (
              <Text key={t.id} className="mt-1 text-sm text-gray-500">
                Skipped {t.label}: {t.skipReason}
              </Text>
            ))}
          </FormCard>
          <FormCard title="Assign to">
            <SelectField
              label="Group"
              value={group.team?.name ?? (group.teams.isLoading ? 'Loading groups…' : null)}
              placeholder="Choose a group"
              onPress={() => setSheet('group')}
              disabled={running || !group.teams.data || bulk.progress !== null}
            />
            <LookupError query={group.teams} what="groups" />
            <ActionRow
              label={group.team ? (members.length > 0 ? `Choose from ${members.length} members` : 'Search technicians') : 'Search technicians'}
              disabled={running || eligible.length === 0 || bulk.progress !== null}
              onPress={() => setSheet('people')}
            />
          </FormCard>
        </ScrollView>
      )}
      <OptionSheet visible={sheet === 'group'} title="Group" options={group.options} selected={group.teamId} onSelect={group.setTeamId} onClose={() => setSheet(null)} />
      <PersonPickerSheet
        visible={sheet === 'people'}
        title={group.team ? `Assign within ${group.team.name}` : 'Search technicians'}
        people={members}
        searchRoles={members.length === 0 ? TECHNICIAN_ROLES : undefined}
        onPick={(p) => void once(() => pick(p))}
        onClose={() => setSheet(null)}
      />
      <BulkProgressModal
        progress={bulk.progress}
        onStop={bulk.stop}
        onClose={() => {
          bulk.reset();
          leave(() => navigation.goBack());
        }}
      />
    </View>
  );
}
