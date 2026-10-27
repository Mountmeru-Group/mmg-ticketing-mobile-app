// Service catalogue endpoints (01 §10.4), used since Phase G4: browse (SCR-1, SCR-2), an item's request form (SCR-3),
// "Add Request" (SCR-5) and My Requests with each request's detail (SCR-4, SCR-6). The web's behaviour, with sources:
// docs/G4-WEB-CATALOGUE.md. Admin writes and the staff-only request routes (01 Appendix A) are never called.
import type { CreateServiceRequestBody, ServiceCategory, ServiceItem, ServiceRequest, SimplePage, UserRole } from '@/types';
import { serviceRequestProblem } from '@/utils/permissions';
import { apiClient } from './client';
import { clientError } from './errors';
import { seg, toPositiveInt } from './helpers';

/** SCR-1 — GET /api/v1/service-catalog/categories. Active only, by `sortOrder`. Its embedded `services` are not used. */
export async function listServiceCategories(): Promise<ServiceCategory[]> {
  const res = await apiClient.get<ServiceCategory[]>('/service-catalog/categories');
  return res.data;
}

/** SCR-2 — GET /api/v1/service-catalog/items, with no parameters, as the web (ServiceCatalogPage.tsx:40-43). Active only. */
export async function listServiceItems(): Promise<ServiceItem[]> {
  const res = await apiClient.get<ServiceItem[]>('/service-catalog/items');
  return res.data;
}

/** SCR-3 — GET /api/v1/service-catalog/items/:id. Inactive items are still returned: the form checks `isActive`. */
export async function getServiceItem(id: string): Promise<ServiceItem> {
  const res = await apiClient.get<ServiceItem>(`/service-catalog/items/${seg(id)}`);
  return res.data;
}

/** The web loads 50 (ServiceCatalogPage.tsx:46); 01 SCR-4: `limit` is uncapped server-side, so never send more than 50. */
export const SERVICE_REQUEST_PAGE_SIZE = 50;

/**
 * SCR-4 — GET /api/v1/service-catalog/requests?page=&limit=50. Shape (b), newest first. No `status`: the web sends none
 * (an invalid one is a 500). END_USER gets their own requests; every other role gets everyone's, and My Requests shows
 * them as the web does (G5, myServiceRequestRows). A request's detail opens only for one's own (isOwnServiceRequest).
 */
export async function listServiceRequests(page: number): Promise<SimplePage<ServiceRequest>> {
  const params = { page: toPositiveInt(page, 1), limit: SERVICE_REQUEST_PAGE_SIZE };
  const res = await apiClient.get<SimplePage<ServiceRequest>>('/service-catalog/requests', { params });
  return res.data;
}

/** SCR-6 — GET /api/v1/service-catalog/requests/:id. 404 unknown; 403 for an END_USER who is not the requester. */
export async function getServiceRequest(id: string): Promise<ServiceRequest> {
  const res = await apiClient.get<ServiceRequest>(`/service-catalog/requests/${seg(id)}`);
  return res.data;
}

/**
 * SCR-5 — POST /api/v1/service-catalog/requests `{ serviceItemId, formData, notes, priority? }`.
 * The body is rebuilt from the four keys the server keeps (05 §B.24), and refused here, with nothing sent, when
 * serviceRequestProblem() objects (an unknown role, or a `priority` from END_USER, who never has one on the web).
 * 201: the request, with `approvals: []` (they are created afterwards, 05 B.18). No ticket, no notification.
 */
export async function createServiceRequest(body: CreateServiceRequestBody, role: UserRole): Promise<ServiceRequest> {
  const problem = serviceRequestProblem({ role }, body);
  if (problem) throw clientError(problem);
  const payload: CreateServiceRequestBody = {
    serviceItemId: body.serviceItemId,
    formData: body.formData,
    notes: body.notes,
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
  };
  const res = await apiClient.post<ServiceRequest>('/service-catalog/requests', payload);
  return res.data;
}
