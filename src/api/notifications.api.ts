// In-app notification endpoints (01 §9). Every route is scoped to the caller.
// No push (05 B.4) and no working SSE (05 B.3): poll NTF-2 on foreground and at most every 60 s while
// foregrounded, never in the background (01 §0.4).
import type { Notification, Paginated, UnreadCount } from '@/types';
import { apiClient, type MessageResponse } from './client';
import { seg, toPositiveInt } from './helpers';

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  /** Sends `unread=true`; anything else means all. */
  unreadOnly?: boolean;
}

/** NTF-1 — GET /api/v1/notifications. Pagination shape (a), `createdAt` desc. */
export async function listNotifications(query: NotificationListQuery = {}): Promise<Paginated<Notification>> {
  const params = {
    page: toPositiveInt(query.page, 1),
    limit: Math.min(toPositiveInt(query.limit, 25), 100),
    unread: query.unreadOnly ? 'true' : undefined,
  };
  const res = await apiClient.get<Paginated<Notification>>('/notifications', { params });
  return res.data;
}

/** NTF-2 — GET /api/v1/notifications/count. Unread count for the Alerts tab badge. */
export async function getUnreadCount(): Promise<UnreadCount> {
  const res = await apiClient.get<UnreadCount>('/notifications/count');
  return res.data;
}

/** NTF-3 — POST /api/v1/notifications/:id/read. 200 even for unknown ids. */
export async function markNotificationRead(id: string): Promise<MessageResponse> {
  const res = await apiClient.post<MessageResponse>(`/notifications/${seg(id)}/read`);
  return res.data;
}

/** NTF-4 — POST /api/v1/notifications/read-all. */
export async function markAllNotificationsRead(): Promise<MessageResponse> {
  const res = await apiClient.post<MessageResponse>('/notifications/read-all');
  return res.data;
}
