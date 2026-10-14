// Copied verbatim from 03-DATA-MODEL.md §C ("Notifications"). Do not edit by hand.
import type { ISODateString, UUID } from './api';
import type { NotificationType } from './enums';

// ── Notifications ────────────────────────────────────────────
export interface Notification {
  id: UUID; userId: UUID; ticketId: UUID | null; type: NotificationType;
  title: string; body: string; isRead: boolean; readAt: ISODateString | null; createdAt: ISODateString;
  ticket?: { id: UUID; ticketNumber: number; title: string } | null;   // on NTF-1
}
export interface UnreadCount { count: number; }
