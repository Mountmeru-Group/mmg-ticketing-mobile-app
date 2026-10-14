// M6 Status & closure sheet (04 §2.1, 08 §4.2).
// TODO(Phase 4) — frontend-only rules to reimplement (all in src/utils/ticket-rules.ts):
// - 05 §A.1 transition buttons from the map only; disable all while the request is pending; RESOLVED green,
//   CLOSED grey; non-closure targets post `{ status }` straight away (no pending-reason modal).
// - 05 §A.2 closure form for RESOLVED/CLOSED/CANCELED: title `Transition · <label>`, save `Save & <label>`;
//   Resolution* and Closure Comments* required (trim); Closure code exact strings (U+2013); FCR default false;
//   save disabled per canSubmitClosure(); body from buildClosureBody(); upload files first, then post status.
//   Warn that Closure Comments become a PUBLIC comment the requester sees.
// - Bulk mode (08 §4.2): one Close form for each eligible ticket (canCloseInBulk); skipped tickets listed;
//   max 20, sequential, stop at the first 429/5xx; confirmation states how many requesters will be emailed (S4).
// - Toasts "Status updated" / "Failed to update status".
// - Status is ONLY ever changed through TKT-6 POST /tickets/:id/status — never PUT (05 B.1).
import { Text, View } from 'react-native';

import { useAuthStore } from '@/store/auth.store';
import type { TicketStackScreenProps } from '@/types';
import { STATUS_LABELS } from '@/utils/format';
import { REQUIRED_CLOSURE_FIELDS, getAvailableTransitions, requiresClosureForm } from '@/utils/ticket-rules';
import { PlaceholderScreen, Section } from '../PlaceholderScreen';

/** Preview only: shows the rules module working for the signed-in role. */
const PREVIEW_FROM = 'IN_PROGRESS' as const;

export function StatusClosureScreen({ route }: TicketStackScreenProps<'StatusClosure'>) {
  const role = useAuthStore((s) => s.user?.role) ?? 'END_USER';
  const { ticketIds, target } = route.params;
  const bulk = ticketIds.length > 1;
  const transitions = getAvailableTransitions(role, PREVIEW_FROM);

  return (
    <PlaceholderScreen
      screenId="M6"
      title={bulk ? `Close ${ticketIds.length} tickets` : 'Change status'}
      headerVariant="close"
      visibility="ADMIN, AGENT, L2_MANAGER. END_USER cannot change status."
      endpoints={['TKT-6 · POST /tickets/:id/status', 'ATT-2 · POST /tickets/:ticketId/attachments (closure files)']}
    >
      {target ? (
        <Section heading="Requested target">
          <Text className="text-sm text-gray-800">{STATUS_LABELS[target]}</Text>
        </Section>
      ) : null}
      <Section heading={`Rules preview: transitions from ${STATUS_LABELS[PREVIEW_FROM]}`}>
        {transitions.length === 0 ? (
          <Text className="text-sm text-gray-500">No transitions for this role.</Text>
        ) : (
          transitions.map((t) => (
            <View key={t.target} className="flex-row justify-between py-1">
              <Text className="text-sm text-gray-800">{t.label}</Text>
              <Text className="text-xs text-gray-500">{requiresClosureForm(t.target) ? 'closure form' : 'direct'}</Text>
            </View>
          ))
        )}
        <Text className="mt-2 text-xs text-gray-500">Required closure fields: {REQUIRED_CLOSURE_FIELDS.join(', ')}</Text>
      </Section>
    </PlaceholderScreen>
  );
}
