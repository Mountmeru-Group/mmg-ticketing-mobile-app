// M2 Home (04 §2.1, 08 §3.3).
// TODO(Phase 3–4) — frontend-only rules to reimplement:
// - 05 B.20: show ONLY the correctly scoped DSH-1 KPIs (total, open, inProgress, onHold, resolved, slaBreached,
//   totalOpen, currentlyOpen) and `recent`. Never the technician/team widgets.
// - 05 §A.12 country selector value → `countryId` on DSH-1 (not for L2_MANAGER).
// - "Unassigned" tile only for ADMIN and triage AGENT (UI definition: AGENT without countryId, 05 §A.12).
// - No "Due today" until A23: show Due soon (sla=DUE_SOON) + Overdue (sla=BREACHED) instead (08 S6).
// - Pending approvals tile = APR-1 length; END_USER/L2 only while ≥ 1 (08 S1).
// - Pinned announcements banner from ANN-1 (08 S1).
// - 05 §A.9 SLA badge and §A.10 labels on the recent list.
// - Pull-to-refresh only; no polling of DSH-1 (01 DSH-1).
import { useAuthStore } from '@/store/auth.store';
import type { MainTabScreenProps } from '@/types';
import { isAgentOrAdmin, isTriageAgent } from '@/utils/roles';
import type { TicketNamedFilter } from '@/utils/ticket-filters';
import { TICKET_FILTER_LABELS } from '@/utils/ticket-filters';
import { PlaceholderScreen, type PlaceholderAction } from '../PlaceholderScreen';

export function HomeScreen({ navigation }: MainTabScreenProps<'HomeTab'>) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'END_USER';

  const openList = (filter?: TicketNamedFilter) =>
    navigation.navigate('TicketsTab', { screen: 'TicketList', params: filter ? { filter } : undefined, initial: false });

  const actions: PlaceholderAction[] = [
    {
      label: '+ Create ticket (FAB)',
      onPress: () => navigation.navigate('TicketsTab', { screen: 'CreateTicket', initial: false }),
    },
  ];

  if (role === 'END_USER') {
    actions.push({ label: 'My tickets', onPress: () => openList() });
  } else {
    const tiles: TicketNamedFilter[] = ['MY_OPEN'];
    if (role === 'ADMIN' || (user && isTriageAgent(user))) tiles.push('UNASSIGNED');
    tiles.push('OVERDUE', 'DUE_SOON');
    for (const filter of tiles) {
      actions.push({ label: `Tile: ${TICKET_FILTER_LABELS[filter]}`, onPress: () => openList(filter) });
    }
    // END_USER/L2 see this tile only while APR-1 returns ≥ 1 (08 S1); no data yet, so only ADMIN/AGENT here.
    if (isAgentOrAdmin(role)) {
      actions.push({
        label: 'Tile: Pending approvals',
        onPress: () => navigation.navigate('Approvals', { screen: 'ApprovalsInbox' }),
      });
    }
  }
  actions.push({ label: 'Announcement banner', onPress: () => navigation.navigate('Announcements') });

  return (
    <PlaceholderScreen
      screenId="M2"
      title="Home"
      headerVariant="drawer"
      visibility="All roles. END_USER: raise-a-ticket variant. Staff (ADMIN, AGENT, L2_MANAGER): KPI tiles variant."
      endpoints={[
        'DSH-1 · GET /dashboard/all',
        'TKT-1 · GET /tickets',
        'NTF-2 · GET /notifications/count',
        'APR-1 · GET /approvals/pending',
        'ANN-1 · GET /announcements/active',
      ]}
      actions={actions}
    />
  );
}
