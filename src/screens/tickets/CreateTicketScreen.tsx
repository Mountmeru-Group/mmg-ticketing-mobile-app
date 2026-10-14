// M8 Create ticket (04 §2.1).
// TODO(Phase 3–4) — frontend-only rules to reimplement (05 §A.8):
// - Validation: Subject required, 3–255 chars ("Title is required"); Description required
//   ("Description is required"); a Category must be selected (toast "Please select a Category").
// - Category cascade from LKP-1 flat=true (05 B.15): top/sub/item filters verbatim; changing top resets sub+item,
//   changing sub resets item; each list sorted by name.localeCompare; Sub/Item shown only when non-empty.
//   Submitted categoryId = item || sub || top. "Auto Category"/"Auto Team" are ordinary rows.
// - END_USER body = allow-list { title, description, categoryId, source } (createTicket does this).
// - Staff-only fields: impact, urgency (labels per 05 §A.3), group ("Auto (from category)"), assignee
//   (team members, else USR-3 with END_USERs filtered out), requester (raise on behalf). L2: "Auto" priority.
// - Staff auto-preview: walk up from the deepest category; preselect first defaultTeamId; preselect
//   defaultAssigneeId only if that user is a member of that team.
// - END_USER banner after choosing a category: "Your ticket will be automatically routed to the appropriate
//   team based on the selected category."
// - source = 'API' (D5). Don't collect level/mode (server drops them, 05 B.13).
// - After submit: TKT-2 → upload staged files (ATT-2; on failure toast "Ticket created but some attachments failed
//   to upload") → invalidate ticket + dashboard queries → toast "Ticket created successfully" → open detail.
//   On error show response error or "Failed to create ticket".
// - Plain-text description wrapped as <p>…</p> (05 §A.16); client file checks (05 B.9); persist draft (02 §5.4).
import type { TicketStackScreenProps } from '@/types';
import { PlaceholderScreen } from '../PlaceholderScreen';

export function CreateTicketScreen(_props: TicketStackScreenProps<'CreateTicket'>) {
  return (
    <PlaceholderScreen
      screenId="M8"
      title="New ticket"
      headerVariant="back"
      visibility="All roles. Impact, urgency, group, assignee and requester: staff only."
      endpoints={[
        'LKP-1 · GET /categories?flat=true',
        'LKP-2 · GET /teams (ADMIN, AGENT)',
        'USR-3 · GET /users/search (ADMIN, AGENT)',
        'TKT-2 · POST /tickets',
        'ATT-2 · POST /tickets/:ticketId/attachments (multipart)',
      ]}
    />
  );
}
