// Home's KPI tiles and status chips (G6): what each one counts, its words, and the ticket list it opens. Which ones a
// role sees is permissions.ts (homeTiles, homeChips); how they look is HomeScreen.tsx. Pure functions.
//
// Counted as the web counts them (FE:DashboardPage.tsx:341-417; docs/G6-WEB-DASHBOARD.md §4). "In the period" = created
// within the Home period (BE:dashboard.controller.ts:331-433):
//   Total            kpis.total          created in the period
//   Open             kpis.currentlyOpen  status OPEN right now, ANY creation date: the web's "Open Tickets" (:350).
//                                        Before G6 the app showed kpis.open (OPEN and created in the period)
//   In progress      kpis.inProgress     IN_PROGRESS or PENDING, in the period
//   Resolved         kpis.resolved       RESOLVED (not CLOSED), in the period. For Today: kpis.resolvedToday, labelled
//                                        "Resolved today", as on the web (:363-364). Same tickets either way
//   SLA breached     kpis.slaBreached    BREACHED and not RESOLVED or CLOSED, in the period
//   Closed           kpis.closed         CLOSED, in the period
//   Unassigned       kpis.unassigned     unassigned and OPEN/IN_PROGRESS/ON_HOLD/PENDING, in the period
//   pending reasons  kpis.pending…       that one status, in the period; On hold = kpis.onHold
//   Active           kpis.totalOpen      OPEN, IN_PROGRESS, ON_HOLD or PENDING right now, any date. App only: the web
//                                        dashboard never shows it
// Every one of these is scoped correctly by the server for ADMIN, AGENT and END_USER, except `unassigned` for an AGENT
// whose scope is "assigned to me" alone (05 B.20), which is why permissions.ts shows it to ADMIN and triage AGENT only.
import type { DashboardKpis } from '@/types';
import type { DashboardPeriod } from './dashboard-period';
import type { HomeChip, HomeTile } from './permissions';
import type { TicketNamedFilter } from './ticket-filters';

/** The DSH-1 KPIs Home reads. Nothing else in `kpis` reaches a screen (hooks/useHome.ts pickSafe). */
export type HomeKpis = Pick<
  DashboardKpis,
  | 'total' | 'currentlyOpen' | 'inProgress' | 'resolved' | 'resolvedToday' | 'slaBreached' | 'closed' | 'unassigned'
  | 'onHold' | 'pendingMgmtReview' | 'pendingPartner' | 'pendingUserConfirm' | 'pendingUserInfo' | 'pendingMasterData'
  | 'totalOpen'
>;

export const HOME_KPI_KEYS: readonly (keyof HomeKpis)[] = [
  'total', 'currentlyOpen', 'inProgress', 'resolved', 'resolvedToday', 'slaBreached', 'closed', 'unassigned', 'onHold',
  'pendingMgmtReview', 'pendingPartner', 'pendingUserConfirm', 'pendingUserInfo', 'pendingMasterData', 'totalOpen',
];

// ── Tiles ────────────────────────────────────────────────────

/**
 * The list a tile opens: the same tickets the tile counts, any creation date (the list has no period yet, see
 * ticket-filters.ts HomeTileFilter). Total opens everything, as the web's Total card opens /tickets (:346).
 */
export const HOME_TILE_LIST_FILTER: Record<HomeTile, TicketNamedFilter> = {
  total: 'ALL',
  open: 'OPEN',
  inProgress: 'IN_PROGRESS_KPI',
  resolved: 'RESOLVED',
  slaBreached: 'BREACHED_KPI',
};

const TILE_LABELS: Record<HomeTile, string> = {
  total: 'Total tickets',
  open: 'Open',
  inProgress: 'In progress',
  resolved: 'Resolved',
  slaBreached: 'SLA breached',
};

export function homeTileLabel(tile: HomeTile, period: DashboardPeriod): string {
  return tile === 'resolved' && period === 'today' ? 'Resolved today' : TILE_LABELS[tile];
}

export function homeTileValue(tile: HomeTile, kpis: HomeKpis, period: DashboardPeriod): number {
  switch (tile) {
    case 'total':
      return kpis.total;
    case 'open':
      return kpis.currentlyOpen;
    case 'inProgress':
      return kpis.inProgress;
    case 'resolved':
      return period === 'today' ? kpis.resolvedToday : kpis.resolved;
    case 'slaBreached':
      return kpis.slaBreached;
  }
}

// ── Status chips ─────────────────────────────────────────────

/** The web's links (:386, :393, :407), as named filters. Active opens the same status set it counts. */
export const HOME_CHIP_LIST_FILTER: Record<HomeChip, TicketNamedFilter> = {
  closed: 'CLOSED',
  unassigned: 'UNASSIGNED_KPI',
  pendingMgmtReview: 'MGMT_REVIEW_KPI',
  pendingPartner: 'PARTNER_KPI',
  pendingUserConfirm: 'USER_CONFIRM_KPI',
  pendingUserInfo: 'USER_INFO_KPI',
  pendingMasterData: 'MASTER_DATA_KPI',
  onHold: 'ON_HOLD_KPI',
  active: 'ACTIVE_KPI',
};

/** The web's words (:382-402); Active is the app's own. */
export const HOME_CHIP_LABELS: Record<HomeChip, string> = {
  closed: 'Closed',
  unassigned: 'Unassigned',
  pendingMgmtReview: 'Mgmt review',
  pendingPartner: 'With partner',
  pendingUserConfirm: 'User confirm',
  pendingUserInfo: 'More info',
  pendingMasterData: 'Master data',
  onHold: 'On hold',
  active: 'Active now',
};

const CHIP_KPI: Record<HomeChip, keyof HomeKpis> = {
  closed: 'closed',
  unassigned: 'unassigned',
  pendingMgmtReview: 'pendingMgmtReview',
  pendingPartner: 'pendingPartner',
  pendingUserConfirm: 'pendingUserConfirm',
  pendingUserInfo: 'pendingUserInfo',
  pendingMasterData: 'pendingMasterData',
  onHold: 'onHold',
  active: 'totalOpen',
};

export function homeChipValue(chip: HomeChip, kpis: HomeKpis): number {
  return kpis[CHIP_KPI[chip]];
}

/** The web hides a pending-reason or On hold mini-card at 0 (:404-405). Closed and Unassigned always show; so does Active. */
const HIDDEN_AT_ZERO: ReadonlySet<HomeChip> = new Set<HomeChip>([
  'pendingMgmtReview', 'pendingPartner', 'pendingUserConfirm', 'pendingUserInfo', 'pendingMasterData', 'onHold',
]);

/**
 * The chips to draw, in order.
 * - `counted` false (L2_MANAGER: no counts at all): every chip, as a shortcut without a number.
 * - Counts not here yet (loading, error): only the chips that always show, so a zero chip never flashes up.
 * - Counts here: the web's rule, a chip in HIDDEN_AT_ZERO goes at 0.
 */
export function visibleHomeChips(chips: readonly HomeChip[], kpis: HomeKpis | undefined, counted: boolean): HomeChip[] {
  if (!counted) return [...chips];
  return chips.filter((chip) => !HIDDEN_AT_ZERO.has(chip) || (kpis !== undefined && homeChipValue(chip, kpis) > 0));
}
