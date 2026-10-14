// Tickets tab: list → detail → reply / status / assign / create / task (08 §3; 04 §2.1).
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TaskEditorScreen } from '@/screens/tasks/TaskEditorScreen';
import { AssignPickerScreen } from '@/screens/tickets/AssignPickerScreen';
import { CreateTicketScreen } from '@/screens/tickets/CreateTicketScreen';
import { ReplyComposerScreen } from '@/screens/tickets/ReplyComposerScreen';
import { StatusClosureScreen } from '@/screens/tickets/StatusClosureScreen';
import { TicketDetailScreen } from '@/screens/tickets/TicketDetailScreen';
import { TicketListScreen } from '@/screens/tickets/TicketListScreen';
import type { TicketStackParamList } from '@/types';

const Stack = createNativeStackNavigator<TicketStackParamList>();

export function TicketStack() {
  return (
    <Stack.Navigator initialRouteName="TicketList" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TicketList" component={TicketListScreen} />
      <Stack.Screen name="TicketDetail" component={TicketDetailScreen} />
      <Stack.Screen name="CreateTicket" component={CreateTicketScreen} />
      {/* Sheets opened from M3/M4. Android back closes them first (08 §3.1). */}
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="ReplyComposer" component={ReplyComposerScreen} />
        <Stack.Screen name="StatusClosure" component={StatusClosureScreen} />
        <Stack.Screen name="AssignPicker" component={AssignPickerScreen} />
        <Stack.Screen name="TaskEditor" component={TaskEditorScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
