// Copied verbatim from 03-DATA-MODEL.md §C ("Phase 2" → `Announcement`). Do not edit by hand.
// Announcements moved into the MVP (04 M16); 03 still files the interface under "Phase 2".
import type { ISODateString, UUID } from './api';
import type { AnnouncementType } from './enums';

export interface Announcement {
  id: UUID; title: string; body: string; type: AnnouncementType; authorId: UUID;
  isActive: boolean; isPinned: boolean; startsAt: ISODateString; expiresAt: ISODateString | null;
  targetRoles: string[]; createdAt: ISODateString; updatedAt: ISODateString;
  author: { id: UUID; displayName: string };
}
