// ATT-4 download-then-share (expo-file-system + expo-sharing, approved by Ronit). PDFs and every other non-image
// attachment open through the system share sheet, from which the person picks a viewer app.
// - The Bearer header comes from getAttachmentDownloadRequest(); the token never goes in a URL or a log (02 §5.7).
// - A non-2xx answer rejects natively ("response has status: N"), so an error body is never saved as the file.
//   A 401 ends the session exactly as the API client does (02 §5.3).
// - Files go to ONE private cache folder that is emptied before each download, so at most one downloaded attachment
//   sits on the device. The server's file name is sanitised (it is user-supplied) and never used as a path.
// - text/html, image/svg+xml and xhtml are only ever shared, never rendered in the app (05 §C).
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { SESSION_ENDED_MESSAGE } from '@/store/auth.store';
import type { Attachment } from '@/types';
import { getAttachmentDownloadRequest } from './attachments.api';
import { ApiClientError, clientError } from './errors';
import { endSession } from './client';

const DOWNLOAD_FOLDER = 'mmg-attachment';

/** A safe single file name: no path separators or control characters, no leading dots, ≤ 120 characters. */
export function safeFileName(name: string | null | undefined): string {
  const cleaned = (name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!cleaned) return 'attachment';
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, 120 - ext.length) + ext;
}

/** Map a native download failure to the app's error shape (status parsed from "response has status: 403"). */
function toApiError(error: unknown): ApiClientError {
  const message = error instanceof Error ? error.message : String(error);
  const status = /status:\s*(\d{3})/i.exec(message)?.[1];
  if (status) {
    const code = Number(status);
    const text = code === 403 ? 'Forbidden' : code === 404 ? 'Attachment not found' : `HTTP ${code}`;
    return new ApiClientError('http', code, { error: text });
  }
  return new ApiClientError('network', null, { error: 'Network error' });
}

/** Download one attachment into the private cache folder (replacing any earlier download). */
export async function downloadAttachment(ticketId: string, attachment: Pick<Attachment, 'id' | 'fileName'>): Promise<File> {
  const { uri, headers } = getAttachmentDownloadRequest(ticketId, attachment.id);
  if (!headers.Authorization) throw clientError('You are not signed in.');

  const folder = new Directory(Paths.cache, DOWNLOAD_FOLDER);
  if (folder.exists) folder.delete(); // keep at most one downloaded attachment on the device
  folder.create({ intermediates: true, idempotent: true });

  try {
    return await File.downloadFileAsync(uri, new File(folder, safeFileName(attachment.fileName)), { headers, idempotent: true });
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.status === 401) void endSession(SESSION_ENDED_MESSAGE);
    throw apiError;
  }
}

/** ATT-4, then the system share sheet ("open with" a PDF viewer, save, send…). */
export async function openAttachmentExternally(ticketId: string, attachment: Pick<Attachment, 'id' | 'fileName' | 'mimeType'>): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw clientError("Sharing isn't available on this device.");
  const file = await downloadAttachment(ticketId, attachment);
  await Sharing.shareAsync(file.uri, {
    mimeType: attachment.mimeType || 'application/octet-stream',
    dialogTitle: `Open ${safeFileName(attachment.fileName)}`,
  });
}
