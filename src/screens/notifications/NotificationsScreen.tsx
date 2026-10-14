// M9 Notifications — the "Alerts" tab (04 §2.1, 08 §3.1).
// TODO(Phase 4) — frontend-only rules to reimplement:
// - Unread first in the UI; tap → ticket by `ticketId` (types alone can't route: approvals arrive as
//   TICKET_UPDATED, 05 B.23); mark read on tap; "Mark all read" in the header.
// - Tab badge from NTF-2: poll on app foreground, pull-to-refresh, and at most every 60 s while foregrounded;
//   never in the background (05 B.3, 01 §0.4). No SSE (broken) and no push until A5 (05 B.4).
import { Text } from 'react-native';

import type { MainTabScreenProps } from '@/types';
import { PLACEHOLDER_ID, PlaceholderScreen } from '../PlaceholderScreen';

export function NotificationsScreen({ navigation }: MainTabScreenProps<'AlertsTab'>) {
  return (
    <PlaceholderScreen
      screenId="M9"
      title="Notifications"
      headerVariant="drawer"
      headerRight={<Text className="px-2 text-sm text-gray-400">Mark all read</Text>}
      visibility="All roles (own notifications only)."
      endpoints={[
        'NTF-1 · GET /notifications',
        'NTF-2 · GET /notifications/count',
        'NTF-3 · POST /notifications/:id/read',
        'NTF-4 · POST /notifications/read-all',
      ]}
      actions={[
        {
          label: "Open a notification's ticket",
          onPress: () =>
            navigation.navigate('TicketsTab', {
              screen: 'TicketDetail',
              params: { ticketId: PLACEHOLDER_ID },
              initial: false,
            }),
        },
      ]}
    />
  );
}
