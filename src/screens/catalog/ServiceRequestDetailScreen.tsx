// One of my service requests (Phase G4; SCR-6). The web has no request detail: its My Requests rows are not links
// (docs/G4-WEB-CATALOGUE.md §7), so this screen is a mobile addition, read-only, and only for the person's own request
// (isOwnServiceRequest; SCR-6 answers any request to staff). It shows the status, priority and dates, the answers sent
// (labelled from the item's form, SCR-3), the notes and the approvals. Requests cannot be changed or cancelled: the
// web offers neither, and the server's edit, status and assign routes are staff-only and out of scope (01 Appendix A).
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOffline } from '@/api/network';
import {
  ApprovalStatusChip, Card, EmptyState, ErrorState, LoadingSkeleton, Notice, OfflineBanner, OfflineState, PriorityBadge,
  QueryBanner, ScreenHeader, StatusBadge,
} from '@/components';
import { useServiceItem, useServiceRequest } from '@/hooks';
import { Row } from '@/screens/tickets/TicketPropertyEditors';
import { useAuthStore } from '@/store/auth.store';
import { colors } from '@/theme';
import type { CatalogStackScreenProps, ServiceRequest } from '@/types';
import { formatDateTime, formatDisplayName } from '@/utils/format';
import { htmlToDisplayText } from '@/utils/html';
import { isOwnServiceRequest, serviceCatalogPermissions } from '@/utils/permissions';
import { answerRows, normaliseFormFields, requestRef } from '@/utils/service-catalog';

export function ServiceRequestDetailScreen({ route }: CatalogStackScreenProps<'ServiceRequestDetail'>) {
  const { requestId } = route.params;
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const viewer = useAuthStore((s) => s.user);
  const can = serviceCatalogPermissions(viewer);
  const query = useServiceRequest(requestId);
  const request = query.data;
  const own = isOwnServiceRequest(viewer, request);
  // The item's form gives the answers their labels and order; without it they show by their keys.
  const itemQuery = useServiceItem(request?.serviceItemId, { enabled: own && can.myRequests });
  const form = useMemo(() => normaliseFormFields(itemQuery.data?.formFields), [itemQuery.data?.formFields]);
  const answers = useMemo(() => (request && own ? answerRows(request.formData, form.fields) : []), [request, own, form.fields]);
  const [refreshing, setRefreshing] = useState(false);

  const header = <ScreenHeader title={request && own ? requestRef(request.requestNumber) : 'Service request'} variant="back" />;

  if (!can.myRequests) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState icon="lock-closed-outline" title="Not available for your role" />
      </View>
    );
  }

  if (!request) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <OfflineBanner />
        {query.fetchStatus === 'paused' ? (
          <OfflineState what="This request" />
        ) : query.isError ? (
          <ErrorState error={query.error} title="Couldn't load this request" onRetry={() => void query.refetch()} />
        ) : (
          <LoadingSkeleton variant="detail" />
        )}
      </View>
    );
  }

  if (!own) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState icon="lock-closed-outline" title="Not one of your requests" message="My Requests shows only the requests you sent." />
      </View>
    );
  }

  const onRefresh = async () => {
    if (offline) return;
    setRefreshing(true);
    try {
      await Promise.all([query.refetch(), itemQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const notes = htmlToDisplayText(request.notes);
  const approvals = [...(Array.isArray(request.approvals) ? request.approvals : [])].sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <OfflineBanner />
      <QueryBanner error={query.error} hasData onRetry={() => void onRefresh()} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <Card>
          <Text className="text-xs font-semibold text-gray-500">{requestRef(request.requestNumber)}</Text>
          <Text className="text-lg font-bold text-gray-900">{request.serviceItem?.name || 'Service request'}</Text>
          <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
            <StatusBadge status={request.status} />
            <PriorityBadge priority={request.priority} />
          </View>
          <Text className="mt-2 text-xs text-gray-500">Requested {formatDateTime(request.createdAt)}</Text>
        </Card>

        <Card title="Details">
          <Row label="Requested by">{formatDisplayName(request.requester?.displayName) || request.requester?.email || '—'}</Row>
          <Row label="Technician">{request.assignedTo ? formatDisplayName(request.assignedTo.displayName) || request.assignedTo.email : '—'}</Row>
          <Row label="Group">{request.team?.name || '—'}</Row>
          <Row label="Last updated">{formatDateTime(request.updatedAt)}</Row>
          {request.resolvedAt ? <Row label="Resolved">{formatDateTime(request.resolvedAt)}</Row> : null}
          {request.closedAt ? <Row label="Closed">{formatDateTime(request.closedAt)}</Row> : null}
        </Card>

        <Card title="Employee Details">
          {answers.length === 0 ? (
            <Text className="text-sm text-gray-500">No answers were sent with this request.</Text>
          ) : (
            answers.map((a) => (
              <Row key={a.key} label={a.label}>
                {a.value}
              </Row>
            ))
          )}
        </Card>

        {notes ? (
          <Card title="Notes">
            <Text selectable className="text-sm text-gray-700">
              {notes}
            </Text>
          </Card>
        ) : null}

        <Approvals request={request} approvals={approvals} />

        <View className="mx-4">
          <Notice>To change or cancel a request, contact the Service Desk: requests can't be edited from the app or the web portal.</Notice>
        </View>
      </ScrollView>
    </View>
  );
}

function Approvals({ request, approvals }: { request: ServiceRequest; approvals: ServiceRequest['approvals'] }) {
  if (approvals.length === 0) {
    if (!request.serviceItem?.requiresApproval) return null;
    // The server creates approvals only when the service lists approvers (serviceCatalog.controller.ts:146-156).
    return (
      <Card title="Approvals">
        <Text className="text-sm text-gray-700">This service needs approval, but no approver is set for it, so none was requested.</Text>
      </Card>
    );
  }
  return (
    <Card title="Approvals">
      {approvals.map((a, index) => (
        <View key={a.id} className={`py-2 ${index < approvals.length - 1 ? 'border-b border-gray-100' : ''}`}>
          <View className="flex-row items-center">
            <Text className="flex-1 pr-2 text-sm font-semibold text-gray-900" numberOfLines={2}>
              {formatDisplayName(a.approver?.displayName) || a.approver?.email || 'Approver'}
            </Text>
            <ApprovalStatusChip status={a.status} />
          </View>
          <Text className="text-xs text-gray-500">
            Stage {a.stage}
            {a.decidedAt ? ` · decided ${formatDateTime(a.decidedAt)}` : ''}
          </Text>
          {a.comments ? (
            <Text selectable className="mt-1 text-sm text-gray-700">
              {a.comments}
            </Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
}
