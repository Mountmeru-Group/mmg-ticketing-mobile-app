// ╔════════════════════════════════════════════════════════════════════════════════════╗
// ║  ⚠  DEV PLACEHOLDER — replaced in iOS-4 (docs/ios/00-PORT-MANIFEST.md §6).  ⚠      ║
// ║  Loaded only when __DEV__ is true (./placeholders.ts), so release bundles do not   ║
// ║  contain this module at all (compliance A2, guideline 2.1).                        ║
// ╚════════════════════════════════════════════════════════════════════════════════════╝
// Shows which route is on screen and its params, and offers sample links with made-up ids so the navigation shell can
// be walked on a simulator: records open in the current tab, sheets cover the tab bar, and each record gets its own
// screen (getId). It fetches nothing.
import { useNavigation, useRoute, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SHEET_ROUTES } from '@/navigation/routes';

interface SampleLink {
  label: string;
  route: string;
  params?: object;
}

/** Registered in every tab stack. */
const RECORDS: readonly SampleLink[] = [
  { label: 'Ticket A', route: 'TicketDetail', params: { ticketId: 'dev-ticket-a' } },
  { label: 'Ticket B', route: 'TicketDetail', params: { ticketId: 'dev-ticket-b' } },
  { label: 'Task 1 of ticket A', route: 'TaskDetail', params: { ticketId: 'dev-ticket-a', taskId: 'dev-task-1' } },
  { label: 'Approval A', route: 'ApprovalDetail', params: { approvalId: 'dev-approval-a' } },
  { label: 'Approval B', route: 'ApprovalDetail', params: { approvalId: 'dev-approval-b' } },
  { label: 'Ticket link "#1234"', route: 'TicketLink', params: { link: '#1234' } },
];

/** In the root stack, above the tabs. */
const SHEETS: readonly SampleLink[] = [
  { label: 'New ticket', route: 'CreateTicket' },
  { label: 'Reply to ticket A', route: 'ReplyComposer', params: { ticketId: 'dev-ticket-a', mode: 'reply' } },
  { label: 'Change status of ticket A', route: 'StatusClosure', params: { ticketIds: ['dev-ticket-a'] } },
  { label: 'Assign ticket A', route: 'AssignPicker', params: { ticketIds: ['dev-ticket-a'] } },
  { label: 'Submit ticket A for approval', route: 'SubmitApproval', params: { ticketId: 'dev-ticket-a' } },
  { label: 'New task on ticket A', route: 'TaskEditor', params: { ticketId: 'dev-ticket-a' } },
  { label: 'Ticket filters', route: 'TicketFilters' },
];

/** Links that only make sense from one route (its stack has the target). */
const FROM_ROUTE: Partial<Record<string, readonly SampleLink[]>> = {
  Home: [
    { label: 'Tickets tab, "My open" filter', route: 'TicketsTab', params: { screen: 'TicketList', params: { filter: 'MY_OPEN' }, pop: true } },
    { label: 'Announcements', route: 'Announcements' },
  ],
  KnowledgeBase: [
    { label: 'Article A', route: 'KbArticle', params: { slug: 'dev-article-a' } },
    { label: 'Article B', route: 'KbArticle', params: { slug: 'dev-article-b' } },
  ],
  ServiceCatalog: [
    { label: 'Request form for item A', route: 'ServiceRequestForm', params: { itemId: 'dev-item-a' } },
    { label: 'Request form for item B', route: 'ServiceRequestForm', params: { itemId: 'dev-item-b' } },
    { label: 'My request A', route: 'ServiceRequestDetail', params: { requestId: 'dev-request-a' } },
  ],
};

const isSheet = (name: string) => (SHEET_ROUTES as readonly string[]).includes(name);

export function DevPlaceholderScreen() {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const sheet = isSheet(route.name);
  const groups: [string, readonly SampleLink[]][] = sheet
    ? []
    : [
        ['From this screen', FROM_ROUTE[route.name] ?? []],
        ['Records (open in this tab)', RECORDS],
        ['Sheets (cover the tab bar)', SHEETS],
      ];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-12">
      <View className="mb-4 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-4">
        <Text className="text-xs font-semibold uppercase tracking-wide text-amber-900">DEV PLACEHOLDER — replaced in iOS-4</Text>
        <Text className="mt-1 text-xs text-amber-900">Development builds only. Nothing is fetched.</Text>
      </View>

      <Block heading="Route">
        <Text className="font-mono text-sm text-gray-900">{route.name}</Text>
      </Block>
      <Block heading="Params">
        <Text className="font-mono text-xs leading-5 text-gray-800">
          {route.params === undefined ? 'none' : JSON.stringify(route.params, null, 2)}
        </Text>
      </Block>

      {groups
        .filter(([, links]) => links.length > 0)
        .map(([heading, links]) => (
          <Block key={heading} heading={`DEV · ${heading}`}>
            {links.map((link) => (
              <Pressable
                key={link.label}
                accessibilityRole="button"
                onPress={() => navigation.navigate(link.route, link.params)}
                className="mb-2 min-h-11 justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 active:bg-gray-100"
              >
                <Text className="text-sm font-medium text-gray-900">{link.label}</Text>
              </Pressable>
            ))}
          </Block>
        ))}
    </ScrollView>
  );
}

function Block({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View className="mb-4 rounded-xl bg-white p-4">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{heading}</Text>
      {children}
    </View>
  );
}
