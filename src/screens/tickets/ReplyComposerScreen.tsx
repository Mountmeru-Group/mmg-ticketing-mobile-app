// M5 Reply / Note composer (04 §2.1).
// TODO(Phase 4) — frontend-only rules to reimplement (05 §A.5, §A.16):
// - Quick actions: Reply (PUBLIC, To = [requester.email]); Reply All (PUBLIC, TKT-9: To = r.to || [requester.email],
//   CC = r.cc; on error To = [requester.email]); Note (PRIVATE, no recipients, ADMIN/AGENT only).
// - Type selector "Public Reply" / "Private Note" for non-END_USER; To/CC rows only for PUBLIC.
// - Email chips: regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/; add on Enter/,/space; skip duplicates; backspace removes
//   the last chip; leftover valid input is added on send.
// - Recipient suggestions via USR-3 for ADMIN/AGENT only.
// - Send disabled: (!body.trim() || body.replace(/<[^>]*>/g, '').trim() === '') && files.length === 0.
// - Upload files FIRST (ATT-2), then CMT-2 with attachmentIds. Button "Send Reply" / "Save Note".
// - Plain-text input wrapped as <p>…</p> with escaping; images go as attachments, never inline base64 (2 MB limit).
// - Client file checks before upload (validateUploadFiles; 05 B.9).
// - Warn staff that public replies email the whole original thread; removing a chip doesn't stop that (B.11).
// - Persist the draft locally so a 401 on send doesn't lose it (02 §5.4).
import type { TicketStackScreenProps } from '@/types';
import { PlaceholderScreen } from '../PlaceholderScreen';

const TITLES = { reply: 'Reply', replyAll: 'Reply all', note: 'Add note' } as const;

export function ReplyComposerScreen({ route }: TicketStackScreenProps<'ReplyComposer'>) {
  return (
    <PlaceholderScreen
      screenId="M5"
      title={TITLES[route.params.mode]}
      headerVariant="close"
      visibility="All roles. Reply all: ADMIN, AGENT, L2. Private note: ADMIN, AGENT only."
      endpoints={[
        'CMT-2 · POST /tickets/:ticketId/comments',
        'ATT-2 · POST /tickets/:ticketId/attachments (multipart)',
        'TKT-9 · GET /tickets/:id/email-recipients (Reply all)',
        'USR-3 · GET /users/search (recipient suggestions)',
      ]}
    />
  );
}
