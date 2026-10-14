// M3 Ticket list (04 §2.1, 08 §4).
// TODO(Phase 3–4) — frontend-only rules to reimplement:
// - 05 §A.1 inline status chip: transition map only (ticket-rules.getAvailableTransitions); hidden for END_USER,
//   empty for AGENT on CLOSED/CANCELED; RESOLVED/CLOSED/CANCELED open M6 (05 §A.2) (08 §4.1).
// - 05 §A.9 hold-adjusted SLA badge (SlaBadge); "new reply" highlight when lastRequesterReplyAt != null.
// - 05 §A.10 status/priority labels; display-name formatting (formatDisplayName).
// - 05 §A.11 search: digits = ticket #, strip a leading "#"; hint "Ticket #, subject, requester or technician".
// - 05 §A.12 country selector (ADMIN/triage AGENT switch; country agent locked; hidden for L2).
// - D8: END_USER always sends `countryId=` (roleDefaultTicketQuery).
// - Named filters (08 §4.5) and the three sorts (08 §4.3) via ticket-filters.ts; never send `pageSize`.
// - Bulk (08 §4.2): tap-and-hold, max BULK_ACTION_LIMIT (20), sequential, stop at the first 429/5xx, never retry,
//   one refetch at the end; Close only where canCloseInBulk(); Pick up sends teamId (S5, 05 B.14).
// - Requester filter chip via USR-3 for ADMIN/AGENT only. Never filter results client-side to "fix" C.7.
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { TicketStackScreenProps } from '@/types';
import { isAgentOrAdmin } from '@/utils/roles';
import {
  TICKET_FILTER_LABELS,
  TICKET_SORT_LABELS,
  availableTicketFilters,
  type TicketSortOption,
} from '@/utils/ticket-filters';
import { canChangeStatus } from '@/utils/ticket-rules';
import { PLACEHOLDER_ID, PLACEHOLDER_ID_2, PlaceholderScreen, Section, type PlaceholderAction } from '../PlaceholderScreen';

const SORTS: TicketSortOption[] = ['UPDATED', 'PRIORITY', 'DUE'];

export function TicketListScreen({ navigation, route }: TicketStackScreenProps<'TicketList'>) {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const { ticketFilter, ticketSort, setTicketFilter, setTicketSort } = useUiStore();
  const requestedFilter = route.params?.filter;

  // Home tiles open this tab with a named filter pre-applied (08 §3.3).
  useEffect(() => {
    if (requestedFilter) setTicketFilter(requestedFilter);
  }, [requestedFilter, setTicketFilter]);

  const actions: PlaceholderAction[] = [
    { label: 'Open a ticket', onPress: () => navigation.navigate('TicketDetail', { ticketId: PLACEHOLDER_ID }) },
    { label: '+ Create ticket (FAB)', onPress: () => navigation.navigate('CreateTicket') },
  ];
  if (canChangeStatus(role)) {
    actions.push({
      label: 'Bulk close 2 selected (M6 bulk mode)',
      onPress: () => navigation.navigate('StatusClosure', { ticketIds: [PLACEHOLDER_ID, PLACEHOLDER_ID_2], target: 'CLOSED' }),
    });
  }
  if (isAgentOrAdmin(role)) {
    actions.push({
      label: 'Bulk assign 2 selected (M7 bulk mode)',
      onPress: () => navigation.navigate('AssignPicker', { ticketIds: [PLACEHOLDER_ID, PLACEHOLDER_ID_2] }),
    });
  }

  return (
    <PlaceholderScreen
      screenId="M3"
      title={role === 'END_USER' ? 'My Tickets' : 'Tickets'}
      headerVariant="drawer"
      visibility="All roles (END_USER sees own tickets, labelled “My Tickets”). Inline status + bulk actions: staff only."
      endpoints={[
        'TKT-1 · GET /tickets',
        'TKT-5 · POST /tickets/:id/assign (bulk Pick up / Assign)',
        'TKT-6 · POST /tickets/:id/status (inline chip / bulk Close)',
        'LKP-2 · GET /teams (group filter)',
        'LKP-4 · GET /countries/my-countries',
        'LKP-5 · GET /countries',
        'USR-3 · GET /users/search (requester filter)',
      ]}
      actions={actions}
    >
      <Section heading="Named filter (08 §4.5)">
        <ChipRow
          options={availableTicketFilters(role)}
          selected={ticketFilter}
          label={(f) => TICKET_FILTER_LABELS[f]}
          onSelect={setTicketFilter}
        />
      </Section>
      <Section heading="Sort (08 §4.3)">
        <ChipRow options={SORTS} selected={ticketSort} label={(s) => TICKET_SORT_LABELS[s]} onSelect={setTicketSort} />
      </Section>
    </PlaceholderScreen>
  );
}

function ChipRow<T extends string>({
  options,
  selected,
  label,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  label: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap">
      {options.map((option) => {
        const active = option === selected;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option)}
            className={`mb-2 mr-2 rounded-full border px-3 py-1.5 ${active ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}
          >
            <Text className={active ? 'text-sm font-medium text-white' : 'text-sm text-gray-800'}>{label(option)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
