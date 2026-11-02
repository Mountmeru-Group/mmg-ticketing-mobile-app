// In-app notification endpoints (01 §9). Every route is scoped to the caller.
// No working SSE (05 B.3). Push: the app side is built (G7, src/push/); the server side, NTF-5/NTF-6 and the FCM send, is
// not deployed yet (05 B.4). The app does not poll NTF-2 (useNotifications.ts).
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

// ── Push device tokens (G7) — ⚠ NOT YET DEPLOYED ─────────────
// Specified by Ronit in MOBILE-BACKEND-REQUIREMENTS.md §1.5 (sent to the backend team, 2026-11-02); 01 NTF-5 / NTF-6.
// Until the backend ships them both answer 404 (Express's HTML "Cannot POST"), which src/push/registration.ts treats as
// "not deployed yet": silent for the person, logged for us. Android only, so `platform` is always "android".

/** The body of NTF-5 and the platform this app reports. */
export interface DeviceTokenBody {
  token: string;
  platform: 'android';
}

/** NTF-5 — POST /api/v1/notifications/device-token `{ token, platform }`. Upsert on token, reassigned to the caller. */
export async function registerDeviceToken(token: string): Promise<void> {
  const body: DeviceTokenBody = { token, platform: 'android' };
  await apiClient.post('/notifications/device-token', body);
}

/** NTF-6 — DELETE /api/v1/notifications/device-token `{ token }` (a JSON body, as the requirements specify). */
export async function unregisterDeviceToken(token: string): Promise<void> {
  await apiClient.delete('/notifications/device-token', { data: { token } });
}
