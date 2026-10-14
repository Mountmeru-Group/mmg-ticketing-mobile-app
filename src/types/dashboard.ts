// Copied verbatim from 03-DATA-MODEL.md §C ("Dashboard (DSH-1)"). Do not edit by hand.
import type { TicketPriority, TicketStatus } from './enums';
import type { Ticket } from './ticket';

// ── Dashboard (DSH-1) ────────────────────────────────────────
export interface DashboardKpis {
  total: number; open: number; inProgress: number; onHold: number;
  pendingMgmtReview: number; pendingPartner: number; pendingUserConfirm: number;
  pendingUserInfo: number; pendingMasterData: number; pending: number;
  resolvedToday: number; resolved: number; closed: number; slaBreached: number; unassigned: number;
  totalOpen: number; currentlyOpen: number; createdToday: number; createdYesterday: number;
  closedToday: number; closedYesterday: number; slaBreachPercent: number;
}
export interface DashboardRecentTicket
  extends Omit<Ticket, 'requester' | 'assignedTo' | 'team' | 'country' | 'category' | 'slaPolicy' | '_count' | 'tasks'> {
  requester: { displayName: string };
  assignedTo: { displayName: string } | null;
}
export interface DashboardAll {
  kpis: DashboardKpis;
  byStatus: { status: TicketStatus; count: number }[];
  byPriority: { priority: TicketPriority; count: number }[];
  recent: DashboardRecentTicket[];
  // Present but NOT used by mobile MVP (scoping defects — 05 §B.20):
  workload: unknown; trends: unknown; technicianMatrix: unknown; teamMatrix: unknown; bySource: unknown;
  countryGroupRows: unknown; technicianPriorityBreakdown: unknown; technicianSLABreaches: unknown;
  technicianClosedToday: unknown; technicianClosedThisWeek: unknown; monthlyTrends: unknown;
}
export type DashboardRange = 'today' | 'yesterday' | 'last7' | 'week' | 'last30' | 'month' | 'quarter' | 'year' | 'all';
