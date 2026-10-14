// Copied verbatim from 03-DATA-MODEL.md §C ("Comments"). Do not edit by hand.
import type { ISODateString, UUID } from './api';
import type { Attachment } from './attachment';
import type { CommentType } from './enums';
import type { UserRef, UserRefWithAvatar } from './user';

// ── Comments ─────────────────────────────────────────────────
export interface Comment {
  id: UUID; ticketId: UUID; authorId: UUID; body: string /* HTML */; type: CommentType; isEdited: boolean;
  toRecipients: string[]; ccRecipients: string[];
  createdAt: ISODateString; updatedAt: ISODateString;
  author: UserRefWithAvatar | UserRef;         // no avatarUrl after PUT
  attachments?: Attachment[];                  // only on GET /comments
}
export interface CreateCommentBody {
  body: string; type: CommentType; to?: string[]; cc?: string[]; attachmentIds?: UUID[];
}
