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
import { periodCaption, type CustomDayRange, type DashboardPeriod } from './dashboard-period';
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
 * The list a tile opens: the same tickets the tile counts. The period travels separately, as a created-date filter,
 * for the tiles in HOME_TILE_CARRIES_PERIOD (G7). Total opens everything in the period, as the web's Total card opens
 * /tickets with its dates (:346).
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

/**
 * Whether a tile hands the Home period to the list as a created-date filter (G7, as the web's links do: `${dp}` on
 * Total, In Progress, Resolved and SLA Breached, FE:DashboardPage.tsx:346-374). Open counts right now, any date, so it
 * opens every open ticket, as the web's Open link does (:353).
 */
export const HOME_TILE_CARRIES_PERIOD: Record<HomeTile, boolean> = {
  total: true,
  open: false,
  inProgress: true,
  resolved: true,
  slaBreached: true,
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

/**
 * Whether a chip hands the Home period to the list (G7). Closed and Unassigned: as the web's links (`${dp}`, :386, :393).
 * The pending reasons and On hold: **yes, unlike the web**. Their counts are created-in-the-period (the byStatus groupBy,
 * BE:dashboard.controller.ts:346), but the web's mini-card links carry no dates (:407), so its list shows more rows than
 * its card. The app passes the period so the chip and the list agree (05 B.37). Active counts right now, any date.
 */
export const HOME_CHIP_CARRIES_PERIOD: Record<HomeChip, boolean> = {
  closed: true,
  unassigned: true,
  pendingMgmtReview: true,
  pendingPartner: true,
  pendingUserConfirm: true,
  pendingUserInfo: true,
  pendingMasterData: true,
  onHold: true,
  active: false,
};

/**
 * The web's words (:382-402); Active is the app's own. "Active" until 2026-11-03 read "Active now"; the "now" is its
 * window caption since (HOME_CHIP_WINDOW), as Open's is.
 */
export const HOME_CHIP_LABELS: Record<HomeChip, string> = {
  closed: 'Closed',
  unassigned: 'Unassigned',
  pendingMgmtReview: 'Mgmt review',
  pendingPartner: 'With partner',
  pendingUserConfirm: 'User confirm',
  pendingUserInfo: 'More info',
  pendingMasterData: 'Master data',
  onHold: 'On hold',
  active: 'Active',
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

// ── Window captions (2026-11-03) ─────────────────────────────

/**
 * The window a count covers, read from the table at the top of this file (docs/G6-WEB-DASHBOARD.md §5, §7):
 * - `period`: created within the Home period (`createdAt` in the window, BE:dashboard.controller.ts:332-346).
 * - `now`: a status count right now, whatever the creation date: Open (`currentlyOpen`, :433) and Active (`totalOpen`,
 *   :431). "Right now", not "all time": they count what is open at this moment, not everything ever.
 * This is why Open can be larger than Total (Total 199, Open 342 on Ronit's phone): Total counts the period, Open does
 * not. The numbers are the web's on purpose (G6); the captions say which window each one is.
 */
export type KpiWindow = 'period' | 'now';

export const HOME_TILE_WINDOW: Record<HomeTile, KpiWindow> = {
  total: 'period',
  open: 'now',
  inProgress: 'period',
  resolved: 'period',
  slaBreached: 'period',
};

export const HOME_CHIP_WINDOW: Record<HomeChip, KpiWindow> = {
  closed: 'period',
  unassigned: 'period',
  pendingMgmtReview: 'period',
  pendingPartner: 'period',
  pendingUserConfirm: 'period',
  pendingUserInfo: 'period',
  pendingMasterData: 'period',
  onHold: 'period',
  active: 'now',
};

/** The caption of a count with no date filter. */
export const NOW_CAPTION = 'right now';

/** The small caption under a tile's count: the period ("this month", "last 7 days", "01 Oct – 15 Oct") or "right now". */
export function homeTileCaption(tile: HomeTile, period: DashboardPeriod, custom: CustomDayRange): string {
  return HOME_TILE_WINDOW[tile] === 'now' ? NOW_CAPTION : periodCaption(period, custom);
}

/**
 * A chip's caption, only where the chip is counted differently from its neighbours. Every chip but Active counts the
 * period, so only Active carries one ("right now"); the others would all repeat the same words.
 */
export function homeChipCaption(chip: HomeChip): string | null {
  return HOME_CHIP_WINDOW[chip] === 'now' ? NOW_CAPTION : null;
}
