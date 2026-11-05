// In-app notification endpoints (01 §9). Every route is scoped to the caller.
// No working SSE (05 B.3). Push: the app side is built (G7, src/push/); the server side, NTF-5/NTF-6 and the FCM send,
// is confirmed by the backend team in writing (2026-11-05) and is in the web source (7df97c8). The app does not poll
// NTF-2 (useNotifications.ts).
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

// ── Push device tokens (G7) ─────────────────────────────────
// The backend team's written contract (2026-11-05), for both: path /api/v1/notifications/device-token, body
// `{ "token": "<fcm-token>", "platform": "android" }`, `Authorization: Bearer <token>` (api/client.ts). Same in the web
// source (7df97c8, notifications/deviceToken.controller.ts): NTF-5 answers 400 without `token` or `platform`; NTF-6 reads
// only `token`. A 404 (a server without them) is still read as "not deployed": silent for the person, logged for us
// (src/push/registration.ts). Android only, so `platform` is always "android".

/** The body of NTF-5 and NTF-6: the phone's FCM token and the platform this app reports. */
export interface DeviceTokenBody {
  token: string;
  platform: 'android';
}

const deviceTokenBody = (token: string): DeviceTokenBody => ({ token, platform: 'android' });

/** NTF-5 — POST /api/v1/notifications/device-token `{ token, platform }`. Upsert on token, reassigned to the caller. */
export async function registerDeviceToken(token: string): Promise<void> {
  await apiClient.post('/notifications/device-token', deviceTokenBody(token));
}

/** NTF-6 — DELETE /api/v1/notifications/device-token `{ token, platform }`, a JSON body (not a path parameter). */
export async function unregisterDeviceToken(token: string): Promise<void> {
  await apiClient.delete('/notifications/device-token', { data: deviceTokenBody(token) });
}
