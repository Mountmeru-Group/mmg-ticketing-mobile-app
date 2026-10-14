// Copied verbatim from 03-DATA-MODEL.md §C ("Attachments"). Do not edit by hand.
import type { ISODateString, UUID } from './api';

// ── Attachments ──────────────────────────────────────────────
export interface Attachment {
  id: UUID; ticketId: UUID | null; commentId: UUID | null; uploaderName: string;
  fileName: string; mimeType: string; sizeBytes: number;
  storagePath: string;                          // server path — never display
  createdAt: ISODateString;
}
export type AttachmentLite = Pick<Attachment, 'id' | 'fileName' | 'mimeType' | 'storagePath'>;
