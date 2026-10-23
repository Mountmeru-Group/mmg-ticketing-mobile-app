// Drawer modules that need their own stack (08 §3.2).
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ApprovalDetailScreen } from '@/screens/approvals/ApprovalDetailScreen';
import { ApprovalsInboxScreen } from '@/screens/approvals/ApprovalsInboxScreen';
import { ServiceCatalogScreen } from '@/screens/catalog/ServiceCatalogScreen';
import { ServiceRequestDetailScreen } from '@/screens/catalog/ServiceRequestDetailScreen';
import { ServiceRequestFormScreen } from '@/screens/catalog/ServiceRequestFormScreen';
import { KbArticleScreen } from '@/screens/knowledge/KbArticleScreen';
import { KnowledgeBaseScreen } from '@/screens/knowledge/KnowledgeBaseScreen';
import { TaskDetailScreen } from '@/screens/tasks/TaskDetailScreen';
import { TaskEditorScreen } from '@/screens/tasks/TaskEditorScreen';
import { TaskListScreen } from '@/screens/tasks/TaskListScreen';
import type { ApprovalsStackParamList, CatalogStackParamList, KnowledgeStackParamList, TasksStackParamList } from '@/types';

// freezeOnBlur (Phase P2): a screen that is not on show stops re-rendering until it is shown again.
const SCREEN_OPTIONS = { headerShown: false, freezeOnBlur: true } as const;

const Approvals = createNativeStackNavigator<ApprovalsStackParamList>();

/** M12 → M13 */
export function ApprovalsStack() {
  return (
    <Approvals.Navigator initialRouteName="ApprovalsInbox" screenOptions={SCREEN_OPTIONS}>
      <Approvals.Screen name="ApprovalsInbox" component={ApprovalsInboxScreen} />
      {/*
        One screen per approval (getId, docs/PERFORMANCE.md §9.7). Without it, opening approval B from Alerts while
        approval A's detail is on top reused A's screen with B's id: A's typed comment came along into B's decision, and
        when B was not in the cached pending list the screen kept showing A, so Approve or Reject acted on A.
      */}
      <Approvals.Screen name="ApprovalDetail" component={ApprovalDetailScreen} getId={({ params }) => params.approvalId} />
    </Approvals.Navigator>
  );
}

const Tasks = createNativeStackNavigator<TasksStackParamList>();

/** Standalone tasks: list → detail → editor (sheet). Detail and editor are shared with the Tickets stack. */
export function TasksStack() {
  return (
    <Tasks.Navigator initialRouteName="TaskList" screenOptions={SCREEN_OPTIONS}>
      <Tasks.Screen name="TaskList" component={TaskListScreen} />
      {/* One screen per task (getId, docs/PERFORMANCE.md §9.7): another task never reuses this one's screen. */}
      <Tasks.Screen name="TaskDetail" component={TaskDetailScreen} getId={({ params }) => params.taskId} />
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
    <Knowledge.Navigator initialRouteName="KnowledgeBase" screenOptions={SCREEN_OPTIONS}>
      <Knowledge.Screen name="KnowledgeBase" component={KnowledgeBaseScreen} />
      {/* One screen per article (getId, docs/PERFORMANCE.md §9.7): another article never reuses this one's screen. */}
      <Knowledge.Screen name="KbArticle" component={KbArticleScreen} getId={({ params }) => params.slug} />
    </Knowledge.Navigator>
  );
}

const Catalog = createNativeStackNavigator<CatalogStackParamList>();

/** Service catalogue (Phase G4): catalogue and My Requests → an item's request form, or one of my requests. */
export function CatalogStack() {
  return (
    <Catalog.Navigator initialRouteName="ServiceCatalog" screenOptions={SCREEN_OPTIONS}>
      <Catalog.Screen name="ServiceCatalog" component={ServiceCatalogScreen} />
      {/* One screen per item and per request (getId, docs/PERFORMANCE.md §9.7): a request form never carries another
          item's answers, and another request never reuses this one's screen. */}
      <Catalog.Screen name="ServiceRequestForm" component={ServiceRequestFormScreen} getId={({ params }) => params.itemId} />
      <Catalog.Screen name="ServiceRequestDetail" component={ServiceRequestDetailScreen} getId={({ params }) => params.requestId} />
    </Catalog.Navigator>
  );
}
