// Read hooks (Phase 3a) and write hooks (Phase 3b). Writes run only from an explicit user action — never on mount,
// focus or navigation — and none is retried automatically (src/api/queryClient.ts).
export { queryKeys } from './queryKeys';
export { useTickets } from './useTickets';
export { useTicket } from './useTicket';
export { useTicketComments } from './useTicketComments';
export { useTicketAttachments } from './useTicketAttachments';
export { useTicketHistory } from './useTicketHistory';
export {
  countryName, useCategories, useCountryOptions, useEmailRecipients, useSuggestedAssignees, useTeams, useUserSearch,
} from './useLookups';
export { useDebouncedValue } from './useDebouncedValue';
export { useDiscardGuard } from './useDiscardGuard';
export { useSingleFlight } from './useSingleFlight';
export { findCachedTicket } from './cache';

// Writes
export { useCreateTicket, validateNewTicket, type CreateTicketVariables } from './useCreateTicket';
export { useUpdateTicket } from './useUpdateTicket';
export { useChangeStatus } from './useChangeStatus';
export { useAssignTicket } from './useAssignTicket';
export { usePostComment } from './usePostComment';
export { useUploadAttachment } from './useUploadAttachment';
export { useBulkRunner, type BulkOutcome, type BulkProgress, type BulkTarget } from './useBulkRunner';
export { assertAssignment, assertStatusChange, assertStatusUnchanged, fetchCurrentStatus, requireRole } from './writeGuards';
