// Read hooks (Phase 3a, Phase 4) and write hooks (Phase 3b, Phase 4). Writes run only from an explicit user action —
// never on mount, focus or navigation — and none is retried automatically (src/api/queryClient.ts).
export { queryKeys } from './queryKeys';
export { useTickets } from './useTickets';
export { fetchTicketDetail, useTicket } from './useTicket';
export { useTicketComments } from './useTicketComments';
export { useTicketAttachments } from './useTicketAttachments';
export { useTicketHistory } from './useTicketHistory';
export {
  countryName, useCannedResponses, useCategories, useCountryOptions, useEmailRecipients, usePriorityMatrix,
  useSuggestedAssignees, useTeams, useUserSearch,
} from './useLookups';
export { useDebouncedValue } from './useDebouncedValue';
export { useDiscardGuard } from './useDiscardGuard';
export { useSingleFlight } from './useSingleFlight';
export { useStableCallback } from './useStableCallback';
export { reduceMotionEnabled, reduceMotionSettled, useReduceMotion } from './useReduceMotion';
export { findCachedTicket } from './cache';

// Phase 4 reads
export { useDashboard, useRecentTickets, type SafeDashboard } from './useHome';
export { NOTIFICATION_PAGE_SIZE, useNotifications, useUnreadCount } from './useNotifications';
export { MAX_CARD_TICKET_LOOKUPS, useApprovalTickets, usePendingApprovals } from './useApprovals';
export { useAnnouncements } from './useAnnouncements';
export { KB_PAGE_SIZE, useKbArticle, useKbArticles, useKbCategories, useKbSearch, useKbVoted } from './useKnowledgeBase';
export { useProfile, profileChanges, validateProfile, type ProfileForm } from './useProfile';
export { useTaskFeed } from './useTasks';
// Phase G4 reads
export { useMyServiceRequests, useServiceCategories, useServiceItem, useServiceItems, useServiceRequest } from './useServiceCatalog';

// Writes
export { useCreateTicket, validateNewTicket, type CreateTicketVariables } from './useCreateTicket';
export { useUpdateTicket } from './useUpdateTicket';
export { useChangeStatus } from './useChangeStatus';
export { useAssignTicket } from './useAssignTicket';
export { usePostComment } from './usePostComment';
export { useUploadAttachment } from './useUploadAttachment';
export { useBulkRunner, type BulkOutcome, type BulkProgress, type BulkTarget } from './useBulkRunner';
export { assertAssignment, assertStatusChange, assertStatusUnchanged, fetchCurrentStatus, requireRole } from './writeGuards';
// Phase 4 writes
export { useMarkAllNotificationsRead, useMarkNotificationRead } from './useNotifications';
export { useDecideApproval, type ApprovalDecision } from './useApprovals';
export { useKbHelpfulVote } from './useKnowledgeBase';
export { useSignOut, useUpdateProfile } from './useProfile';
export { useDeleteTask, useSaveTask, useToggleTask } from './useTasks';
// Phase G3 writes
export { useDeleteAttachment } from './useDeleteAttachment';
export { useSubmitForApproval } from './useApprovals';
// Phase G4 writes
export { useSubmitServiceRequest } from './useServiceCatalog';
