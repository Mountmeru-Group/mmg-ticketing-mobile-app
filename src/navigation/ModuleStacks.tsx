// Drawer modules that need their own stack (08 §3.2).
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ApprovalDetailScreen } from '@/screens/approvals/ApprovalDetailScreen';
import { ApprovalsInboxScreen } from '@/screens/approvals/ApprovalsInboxScreen';
import { KbArticleScreen } from '@/screens/knowledge/KbArticleScreen';
import { KnowledgeBaseScreen } from '@/screens/knowledge/KnowledgeBaseScreen';
import { TaskDetailScreen } from '@/screens/tasks/TaskDetailScreen';
import { TaskEditorScreen } from '@/screens/tasks/TaskEditorScreen';
import { TaskListScreen } from '@/screens/tasks/TaskListScreen';
import type { ApprovalsStackParamList, KnowledgeStackParamList, TasksStackParamList } from '@/types';

const Approvals = createNativeStackNavigator<ApprovalsStackParamList>();

/** M12 → M13 */
export function ApprovalsStack() {
  return (
    <Approvals.Navigator initialRouteName="ApprovalsInbox" screenOptions={{ headerShown: false }}>
      <Approvals.Screen name="ApprovalsInbox" component={ApprovalsInboxScreen} />
      <Approvals.Screen name="ApprovalDetail" component={ApprovalDetailScreen} />
    </Approvals.Navigator>
  );
}

const Tasks = createNativeStackNavigator<TasksStackParamList>();

/** Standalone tasks: list → detail → editor (sheet). Detail and editor are shared with the Tickets stack. */
export function TasksStack() {
  return (
    <Tasks.Navigator initialRouteName="TaskList" screenOptions={{ headerShown: false }}>
      <Tasks.Screen name="TaskList" component={TaskListScreen} />
      <Tasks.Screen name="TaskDetail" component={TaskDetailScreen} />
      <Tasks.Group screenOptions={{ presentation: 'modal' }}>
        <Tasks.Screen name="TaskEditor" component={TaskEditorScreen} />
      </Tasks.Group>
    </Tasks.Navigator>
  );
}

const Knowledge = createNativeStackNavigator<KnowledgeStackParamList>();

/** M14 → M15 */
export function KnowledgeStack() {
  return (
    <Knowledge.Navigator initialRouteName="KnowledgeBase" screenOptions={{ headerShown: false }}>
      <Knowledge.Screen name="KnowledgeBase" component={KnowledgeBaseScreen} />
      <Knowledge.Screen name="KbArticle" component={KbArticleScreen} />
    </Knowledge.Navigator>
  );
}
