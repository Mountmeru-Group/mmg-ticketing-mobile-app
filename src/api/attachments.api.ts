// Attachment endpoints (01 §4). Mounted under /api/v1/tickets/:ticketId/attachments.
import { API_BASE_URL } from '@/config/env';
import { useAuthStore } from '@/store/auth.store';
import type { Attachment, UserRole } from '@/types';
import { canDeleteAttachments } from '@/utils/permissions';
import { UPLOAD_TIMEOUT_MS, apiClient, type MessageResponse } from './client';
import { clientError } from './errors';
import { seg } from './helpers';

/** A file picked on the device (camera, gallery or documents). */
export interface UploadFile {
  uri: string;
  name: string;
  /** MIME type. The server stores the client-declared value. */
  type: string;
  /** Bytes, when the picker reports it. Needed for the size check below. */
  size?: number;
}

/** 01 ATT-2: field `files`, at most 10 per request. */
export const MAX_FILES_PER_UPLOAD = 10;
/** Client cap until the IIS request limit is known (00 B6; 05 B.9, B.34). The server's own cap is 50 MB. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Server-blocked extensions (01 ATT-2). Every limit violation is an opaque 500, so check on the device. */
export const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.php', '.py', '.js'] as const;

/** Returns a user-facing problem, or null when the batch can be uploaded. */
export function validateUploadFiles(files: readonly UploadFile[]): string | null {
  if (files.length === 0) return 'No files selected';
  if (files.length > MAX_FILES_PER_UPLOAD) return `You can attach up to ${MAX_FILES_PER_UPLOAD} files at a time`;
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return `${file.name}: this file type is not allowed`;
    if (file.size !== undefined && file.size > MAX_UPLOAD_BYTES) return `${file.name} is larger than 25 MB`;
  }
  return null;
}

/**
 * ATT-1 — GET /api/v1/tickets/:ticketId/attachments
 * All ticket files incl. comment-linked ones, newest first. END_USER: own tickets only (403 otherwise).
 */
export async function listAttachments(ticketId: string): Promise<Attachment[]> {
  const res = await apiClient.get<Attachment[]>(`/tickets/${seg(ticketId)}/attachments`);
  return res.data;
}

/**
 * ATT-2 — POST /api/v1/tickets/:ticketId/attachments (multipart/form-data, field `files`, 1–10 files).
 * Validated on the device first (05 B.9). The optional `?commentId=` query is not used: link files to a
 * reply through CMT-2 `attachmentIds` instead (01 ATT-2).
 */
export async function uploadAttachments(ticketId: string, files: readonly UploadFile[]): Promise<Attachment[]> {
  const problem = validateUploadFiles(files);
  if (problem) throw clientError(problem);

  const form = new FormData();
  for (const file of files) {
    // React Native's FormData takes a { uri, name, type } descriptor in place of a Blob.
    form.append('files', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  const res = await apiClient.post<Attachment[]>(`/tickets/${seg(ticketId)}/attachments`, form, {
    // RN's networking layer appends the multipart boundary to this header itself.
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
  });
  return res.data;
}

/**
 * ATT-5 — DELETE /api/v1/tickets/:ticketId/attachments/:attachmentId (Phase G3).
 * ADMIN, AGENT and L2_MANAGER, any file, in any status (web FE:TicketDetailPage.tsx:1345); the server refuses END_USER,
 * so a request from that role is refused here before it is sent. PERMANENT: the file is removed from disk and its row
 * deleted, with no audit entry. The screen confirms "Delete <fileName>?" first. Pass only an id from this ticket's
 * ATT-1 list: the server does not check that the file belongs to `ticketId` (05 C.4).
 */
export async function deleteAttachment(ticketId: string, attachmentId: string, role: UserRole): Promise<MessageResponse> {
  if (!canDeleteAttachments(role)) throw clientError("Your role can't delete files from a ticket.");
  const res = await apiClient.delete<MessageResponse>(`/tickets/${seg(ticketId)}/attachments/${seg(attachmentId)}`);
  return res.data;
}

/**
 * Binary attachment requests (ATT-3, ATT-4) do not go through apiClient: they are rendered by an image/PDF
 * viewer or downloaded to a file. The Bearer header is required; there are no signed URLs, and the token
 * must NEVER be put in the URL (02 §5.7). The consumer must check the response Content-Type before
 * rendering (05 §C: never render text/html, image/svg+xml or application/xhtml+xml inline).
 */
export interface AuthenticatedRequest {
  uri: string;
  headers: Record<string, string>;
}

function authenticatedRequest(path: string): AuthenticatedRequest {
  const { token } = useAuthStore.getState();
  return {
    uri: `${API_BASE_URL}${path}`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

/**
 * ATT-3 — GET /api/v1/tickets/:ticketId/attachments/:attachmentId/view
 * Inline view (`Content-Disposition: inline`). Use with expo-image `source={{ uri, headers }}` or a PDF viewer.
 */
export function getAttachmentViewRequest(ticketId: string, attachmentId: string): AuthenticatedRequest {
  return authenticatedRequest(`/tickets/${seg(ticketId)}/attachments/${seg(attachmentId)}/view`);
}

/**
 * ATT-4 — GET /api/v1/tickets/:ticketId/attachments/:attachmentId/download
 * File download for the share sheet, e.g. FileSystem.downloadAsync(uri, path, { headers }).
 */
export function getAttachmentDownloadRequest(ticketId: string, attachmentId: string): AuthenticatedRequest {
  return authenticatedRequest(`/tickets/${seg(ticketId)}/attachments/${seg(attachmentId)}/download`);
}

/** Only images (not SVG) and PDFs may be rendered inline; everything else is download/share only (01 ATT-3). */
export function canRenderInline(mimeType: string): boolean {
  const type = mimeType.toLowerCase();
  if (type === 'application/pdf') return true;
  return type.startsWith('image/') && !type.startsWith('image/svg');
}
