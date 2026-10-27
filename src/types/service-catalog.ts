// Copied verbatim from 03-DATA-MODEL.md §C ("Phase 2" → service catalog interfaces). Do not edit by hand.
// PHASE 2 — types only. No service-catalog endpoint (SCR-*) is implemented in the MVP (08 S7).
// Present because `Approval.serviceRequest` (MVP, M12/M13) embeds `ServiceRequestScalars`.
import type { ISODateString, UUID } from './api';
import type { Approval } from './approval';
import type { SLAStatus, TicketPriority, TicketStatus } from './enums';
import type { TeamRef } from './lookups';
import type { UserRef } from './user';

export interface ServiceFormField {
  name: string; label: string;
  type?: 'text' | 'textarea' | 'date' | 'phone' | 'email' | 'number' | 'select';  // unknown → text
  required?: boolean; placeholder?: string;
  options?: (string | { value: string; label: string })[];
}
export interface ServiceItem {
  id: UUID; name: string; description: string | null; categoryId: UUID | null; icon: string | null;
  estimatedTime: number | null; requiresApproval: boolean; approverIds: UUID[];
  formFields: ServiceFormField[] | null;       // server does not validate
  isActive: boolean; sortOrder: number; createdAt: ISODateString; updatedAt: ISODateString;
  category?: { id: UUID; name: string } | null;
}
export interface ServiceCategory {
  id: UUID; name: string; description: string | null; icon: string | null; sortOrder: number;
  isActive: boolean; createdAt: ISODateString; services: ServiceItem[];
}
export interface ServiceRequestScalars {
  id: UUID; requestNumber: number; serviceItemId: UUID; requesterId: UUID; assignedToId: UUID | null;
  teamId: UUID | null; countryId: string | null; status: TicketStatus; priority: TicketPriority;
  slaPolicyId: UUID | null; slaStatus: SLAStatus; slaResponseDue: ISODateString | null;
  slaResolveDue: ISODateString | null; slaBreachedAt: ISODateString | null; firstResponseAt: ISODateString | null;
  formData: Record<string, unknown> | null; notes: string | null;
  resolvedAt: ISODateString | null; closedAt: ISODateString | null; createdAt: ISODateString; updatedAt: ISODateString;
}
export interface ServiceRequest extends ServiceRequestScalars {
  serviceItem: { id: UUID; name: string; requiresApproval: boolean; estimatedTime: number | null };
  requester: UserRef; assignedTo: UserRef | null; team: TeamRef | null;
  approvals: (Omit<Approval, 'change' | 'serviceRequest'> & { approver: UserRef | null })[];
}
export interface CreateServiceRequestBody {
  serviceItemId: UUID; priority?: TicketPriority; formData: Record<string, unknown>; notes?: string | null;
}
