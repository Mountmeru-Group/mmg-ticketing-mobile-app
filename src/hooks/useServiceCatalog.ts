// Service catalogue (Phase G4) — SCR-1 categories, SCR-2 items, SCR-3 one item, SCR-4 My Requests, SCR-6 one request,
// SCR-5 "Add Request" (01 §10.4). The web's behaviour, with sources: docs/G4-WEB-CATALOGUE.md.
// - My Requests keeps only the person's own rows, for every role (isOwnServiceRequest): SCR-4 returns everyone's
//   requests to ADMIN, AGENT and L2_MANAGER. Those rows are dropped before anything renders. When few of a page's rows
//   are the person's, the next pages are read automatically, a few at a time, then on request.
// - "Add Request" runs only when tapped, is never retried, and its body is checked by assertServiceRequest() first.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { assertArray, assertObject, assertPaginated, checkFields } from '@/api/drift';
import { ApiClientError } from '@/api/errors';
import { normalisePage } from '@/api/pagination';
import { SERVICE_CATEGORY_SPEC, SERVICE_ITEM_SPEC, SERVICE_REQUEST_SPEC } from '@/api/responseSpecs';
import {
  SERVICE_REQUEST_PAGE_SIZE, createServiceRequest, getServiceItem, getServiceRequest, listServiceCategories, listServiceItems,
  listServiceRequests,
} from '@/api/serviceCatalog.api';
import { useAuthStore } from '@/store/auth.store';
import type { CreateServiceRequestBody, ServiceCategory, ServiceItem, ServiceRequest, SimplePage } from '@/types';
import { myServiceRequestRows } from '@/utils/permissions';
import { shouldReadMoreRequests } from '@/utils/service-catalog';
import { queryKeys } from './queryKeys';
import { assertServiceRequest, requireOnline, requireRole, wasRefusedOnDevice } from './writeGuards';

const CATALOG_STALE_TIME_MS = 5 * 60_000; // the catalogue changes rarely; still ≥ 60 s

function hasId(row: unknown): row is { id: string } {
  return typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string';
}

export function useServiceCategories() {
  return useQuery({
    queryKey: queryKeys.serviceCatalog.categories(),
    queryFn: async (): Promise<ServiceCategory[]> => {
      const res = await listServiceCategories();
      assertArray<ServiceCategory>('SCR-1', res);
      checkFields('SCR-1', res[0], SERVICE_CATEGORY_SPEC, '[0].');
      return res.filter(hasId);
    },
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

export function useServiceItems() {
  return useQuery({
    queryKey: queryKeys.serviceCatalog.items(),
    queryFn: async (): Promise<ServiceItem[]> => {
      const res = await listServiceItems();
      assertArray<ServiceItem>('SCR-2', res);
      checkFields('SCR-2', res[0], SERVICE_ITEM_SPEC, '[0].');
      return res.filter(hasId);
    },
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

/** SCR-3: one item with its form definition. `enabled` lets the request detail ask only once it knows the item id. */
export function useServiceItem(id: string | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.serviceCatalog.item(id ?? ''),
    queryFn: async (): Promise<ServiceItem> => {
      const res = await getServiceItem(id as string);
      assertObject<ServiceItem>('SCR-3', res);
      if (typeof res.id !== 'string') throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from SCR-3' });
      checkFields('SCR-3', res, SERVICE_ITEM_SPEC);
      return res;
    },
    enabled: enabled && !!id,
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

/**
 * My Requests: SCR-4 pages of 50, newest first, keeping only the signed-in person's requests. For END_USER the server
 * already sends only theirs; for every other role it sends everyone's, and the rest are dropped here.
 */
export function useMyServiceRequests() {
  const viewer = useAuthStore((s) => s.user);
  const query = useInfiniteQuery({
    queryKey: queryKeys.serviceCatalog.requests(),
    queryFn: async ({ pageParam }): Promise<SimplePage<ServiceRequest>> => {
      const res = await listServiceRequests(pageParam);
      assertPaginated<ServiceRequest>('SCR-4', res);
      if (typeof (res as { limit?: unknown }).limit !== 'number') {
        throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from SCR-4' });
      }
      checkFields('SCR-4', res.data[0], SERVICE_REQUEST_SPEC, 'data[0].');
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (normalisePage(last).hasNext ? last.page + 1 : undefined),
    enabled: !!viewer,
  });

  const requests = useMemo(() => myServiceRequestRows(viewer, query.data?.pages ?? []), [query.data, viewer]);

  const pagesRead = query.data?.pages.length ?? 0;
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = query;
  /** Reading further on its own (few of the person's rows so far); false once the automatic pages are used up. */
  const autoScanning = shouldReadMoreRequests({ shown: requests.length, pagesRead, hasNextPage: !!hasNextPage });

  useEffect(() => {
    if (autoScanning && !isFetching && !isFetchNextPageError) void fetchNextPage();
  }, [autoScanning, isFetching, isFetchNextPageError, fetchNextPage]);

  /** How many requests (anyone's, for staff) have been read so far: "Checked the latest n". */
  const checked = pagesRead * SERVICE_REQUEST_PAGE_SIZE;

  return { ...query, requests, pagesRead, checked, autoScanning };
}

/** SCR-6: one request. The screen shows it only when it is the person's own (isOwnServiceRequest). */
export function useServiceRequest(id: string) {
  return useQuery({
    queryKey: queryKeys.serviceCatalog.request(id),
    queryFn: async (): Promise<ServiceRequest> => {
      const res = await getServiceRequest(id);
      assertObject<ServiceRequest>('SCR-6', res);
      if (typeof res.id !== 'string') throw new ApiClientError('shape', 200, { error: 'Unexpected response shape from SCR-6' });
      checkFields('SCR-6', res, SERVICE_REQUEST_SPEC);
      return res;
    },
    enabled: !!id,
  });
}

/** SCR-5 "Add Request". The body comes from buildServiceRequestBody(); the guard re-checks it before sending. */
export function useSubmitServiceRequest() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  return useMutation({
    mutationFn: async (body: CreateServiceRequestBody): Promise<ServiceRequest> => {
      requireOnline();
      const requesterRole = requireRole(role);
      assertServiceRequest(requesterRole, body);
      const created = await createServiceRequest(body, requesterRole);
      if (typeof created?.id !== 'string') {
        // The request very likely exists; My Requests will show it after the refresh below.
        throw new ApiClientError('shape', 201, { error: 'Unexpected response shape from SCR-5' });
      }
      checkFields('SCR-5', created, SERVICE_REQUEST_SPEC);
      return created;
    },
    // Settled, not success: after a 500 or a timeout the request may still exist (the web invalidates on success).
    onSettled: (_created, error) => {
      if (wasRefusedOnDevice(error)) return; // nothing was sent
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceCatalog.requests() });
    },
  });
}
