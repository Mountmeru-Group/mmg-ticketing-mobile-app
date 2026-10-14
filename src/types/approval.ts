// Copied verbatim from 03-DATA-MODEL.md §C ("Phase 2" → `Approval`). Do not edit by hand.
// Approvals moved into the MVP (04 M12/M13); 03 still files the interface under "Phase 2".
import type { ISODateString, UUID } from './api';
import type { ApprovalEntityType, ApprovalStatus } from './enums';
import type { ServiceRequestScalars } from './service-catalog';
import type { UserRef } from './user';

export interface Approval {
  id: UUID; entityType: ApprovalEntityType; entityId: UUID; stage: number; approverId: UUID;
  status: ApprovalStatus; comments: string | null; decidedAt: ISODateString | null;
  changeId: UUID | null; serviceRequestId: UUID | null; createdAt: ISODateString;
  approver: UserRef | null;
  change: { id: UUID; changeNumber: number; title: string; status: string } | null;
  serviceRequest: (ServiceRequestScalars & { serviceItem: { id: UUID; name: string } }) | null;
}
