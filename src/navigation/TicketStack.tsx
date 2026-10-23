// Tickets tab: list → detail → reply / status / assign / create / task (08 §3; 04 §2.1), plus the in-app ticket-link
// resolver. TaskDetail and TaskEditor are also registered in the Tasks stack (ModuleStacks.tsx).
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TaskDetailScreen } from '@/screens/tasks/TaskDetailScreen';
import { TaskEditorScreen } from '@/screens/tasks/TaskEditorScreen';
import { AssignPickerScreen } from '@/screens/tickets/AssignPickerScreen';
import { CreateTicketScreen } from '@/screens/tickets/CreateTicketScreen';
import { ReplyComposerScreen } from '@/screens/tickets/ReplyComposerScreen';
import { StatusClosureScreen } from '@/screens/tickets/StatusClosureScreen';
import { SubmitApprovalScreen } from '@/screens/tickets/SubmitApprovalScreen';
import { TicketDetailScreen } from '@/screens/tickets/TicketDetailScreen';
import { TicketFiltersScreen } from '@/screens/tickets/TicketFiltersScreen';
import { TicketLinkScreen } from '@/screens/tickets/TicketLinkScreen';
import { TicketListScreen } from '@/screens/tickets/TicketListScreen';
import type { TicketStackParamList } from '@/types';

const Stack = createNativeStackNavigator<TicketStackParamList>();

// freezeOnBlur (Phase P2): a screen that is not on show stops re-rendering until it is shown again.
const SCREEN_OPTIONS = { headerShown: false, freezeOnBlur: true } as const;

export function TicketStack() {
  return (
    <Stack.Navigator initialRouteName="TicketList" screenOptions={SCREEN_OPTIONS}>
      <Stack.Screen name="TicketList" component={TicketListScreen} />
      <Stack.Screen name="TicketDetail" component={TicketDetailScreen} />
      <Stack.Screen name="CreateTicket" component={CreateTicketScreen} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
      <Stack.Screen name="TicketLink" component={TicketLinkScreen} />
      {/* Sheets opened from M3/M4. Android back closes them first (08 §3.1). */}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="ReplyComposer" component={ReplyComposerScreen} />
        <Stack.Screen name="StatusClosure" component={StatusClosureScreen} />
        <Stack.Screen name="AssignPicker" component={AssignPickerScreen} />
        <Stack.Screen name="SubmitApproval" component={SubmitApprovalScreen} />
        <Stack.Screen name="TaskEditor" component={TaskEditorScreen} />
        <Stack.Screen name="TicketFilters" component={TicketFiltersScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
