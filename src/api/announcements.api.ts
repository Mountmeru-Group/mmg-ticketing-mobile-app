// Announcements (01 §10.2). Moved into the MVP as M16 + the Home banner (04, 08 §5.1); 01 still labels it P2.
// `GET /announcements/:id` does not exist (01 §0.6 #4) and `GET /announcements` is the unfiltered admin list.
import type { Announcement } from '@/types';
import { apiClient } from './client';

/**
 * ANN-1 — GET /api/v1/announcements/active
 * Active, started, unexpired, targeted at my role. Ordered pinned first; keep the server's order.
 */
export async function listActiveAnnouncements(): Promise<Announcement[]> {
  const res = await apiClient.get<Announcement[]>('/announcements/active');
  return res.data;
}
