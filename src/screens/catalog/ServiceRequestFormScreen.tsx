// A service's request form (Phase G4): the web's /service-catalog/new/:itemId page
// (FE:pages/service-catalog/ServiceRequestFormPage.tsx; docs/G4-WEB-CATALOGUE.md §3–§5).
// - Shown: what reaches the server. The custom fields ("Employee Details") of every type, Notes ("Resolution",
//   collapsed), and, for staff (serviceCatalogPermissions().requestProperties), Impact and Urgency with the Priority
//   they set (the web's hard-coded map, sticky as on the web). Only `priority` is sent of those three.
// - Not shown: the web's subject, description, category, group, technician, assets, request type, mode, level,
//   impact details and attachments. The server keeps none of them (05 §B.24), and the files are never uploaded.
// - Validation is the web's: `required` ("<label> is required"; only an empty value fails) plus the browser's checks
//   on e-mail and number fields. Messages appear after the first "Add Request", then follow each change.
// - "Add Request" sends at once (the web asks nothing), through useSubmitServiceRequest only. On success: the web's
//   toast, then back to the catalogue's Home view, as the web returns to /service-catalog.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeWriteError, isSessionEndedError } from '@/api/errors';
import {
  Card, EmptyState, ErrorState, FormCard, InlineError, LoadingSkeleton, Notice, OfflineBanner, OfflineState, OptionSheet,
  OutlineButton, PriorityBadge, ScreenHeader, SelectField, SubmitButton, type SheetOption,
} from '@/components';
import { useDiscardGuard, useServiceItem, useSingleFlight, useSubmitServiceRequest } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { colors, palette } from '@/theme';
import type { CatalogStackScreenProps, TicketImpact, TicketPriority } from '@/types';
import { notify } from '@/utils/dialogs';
import { formatDisplayName } from '@/utils/format';
import { serviceCatalogPermissions } from '@/utils/permissions';
import {
  REQUEST_IMPACT_OPTIONS, REQUEST_URGENCY_OPTIONS, buildServiceRequestBody, formErrors, initialFormValues, nextRequestPriority,
  normaliseFormFields, submittedMessage, type RequestUrgency, type ServiceFormValues,
} from '@/utils/service-catalog';
import { ServiceFormFieldInput } from './ServiceFormFieldInput';

const NOT_SET = '__NOT_SET__';

/** The typed values whose field is still in the form. */
function pickExisting(values: ServiceFormValues, fields: readonly { name: string }[]): ServiceFormValues {
  return Object.fromEntries(fields.filter((f) => typeof values[f.name] === 'string').map((f) => [f.name, values[f.name]]));
}

export function ServiceRequestFormScreen({ navigation, route }: CatalogStackScreenProps<'ServiceRequestForm'>) {
  const { itemId } = route.params;
  const insets = useSafeAreaInsets();
  const viewer = useAuthStore((s) => s.user);
  const can = serviceCatalogPermissions(viewer);
  const itemQuery = useServiceItem(itemId);
  const submit = useSubmitServiceRequest();
  const once = useSingleFlight();

  const item = itemQuery.data;
  const form = useMemo(() => normaliseFormFields(item?.formFields), [item?.formFields]);
  const [values, setValues] = useState<ServiceFormValues>({});
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false); // the web's "Resolution" section starts closed (:44)
  const [impact, setImpact] = useState<TicketImpact | null>(null);
  const [urgency, setUrgency] = useState<RequestUrgency | null>(null);
  const [priority, setPriority] = useState<TicketPriority | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'impact' | 'urgency' | null>(null);

  // Every field starts empty; nothing is prefilled (G4 §4.4). If the item reloads with a changed form, what was typed
  // into fields that still exist is kept.
  useEffect(() => setValues((prev) => ({ ...initialFormValues(form.fields), ...pickExisting(prev, form.fields) })), [form]);

  const errors = useMemo(() => (attempted ? formErrors(form.fields, values) : {}), [attempted, form.fields, values]);
  const failing = form.fields.filter((f) => errors[f.name]);
  const busy = submit.isPending;
  const dirty = Object.values(values).some((v) => v !== '') || notes !== '' || impact !== null || urgency !== null;
  const { leave } = useDiscardGuard({ dirty, busy, what: 'request' });

  const setValue = useCallback((name: string, value: string) => setValues((v) => ({ ...v, [name]: value })), []);
  // One stable handler per field (Phase P2), so a keystroke redraws only the field it went to (ServiceFormFieldInput).
  const fieldSetters = useMemo(
    () => new Map(form.fields.map((f) => [f.name, (v: string) => setValue(f.name, v)] as const)),
    [form.fields, setValue],
  );

  // "Reset" (the web's :237-242): every field, notes and the request properties back to empty.
  const reset = () => {
    setValues(initialFormValues(form.fields));
    setNotes('');
    setImpact(null);
    setUrgency(null);
    setPriority(null);
    setAttempted(false);
    setError(null);
  };

  const send = () =>
    void once(async () => {
      if (!item) return;
      setError(null);
      setAttempted(true);
      if (Object.keys(formErrors(form.fields, values)).length > 0) return;
      try {
        await submit.mutateAsync(
          buildServiceRequestBody({
            serviceItemId: item.id,
            fields: form.fields,
            values,
            notes,
            priority: can.requestProperties ? priority : null,
          }),
        );
        notify(submittedMessage(item));
        leave(() => navigation.popTo('ServiceCatalog', { view: 'catalog', resetAt: Date.now() }));
      } catch (e) {
        if (!isSessionEndedError(e)) setError(describeWriteError(e) || 'Failed to submit request');
      }
    });

  const header = <ScreenHeader title="New request" variant="back" />;

  if (!can.submit) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState icon="lock-closed-outline" title="Not available for your role" />
      </View>
    );
  }

  if (!item) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <OfflineBanner />
        {itemQuery.fetchStatus === 'paused' ? (
          <OfflineState what="The request form" />
        ) : itemQuery.isError ? (
          <ErrorState error={itemQuery.error} title="Couldn't load this service" onRetry={() => void itemQuery.refetch()} />
        ) : (
          <LoadingSkeleton variant="formPage" rows={4} />
        )}
      </View>
    );
  }

  const impactOptions: SheetOption<string>[] = [{ value: NOT_SET, label: 'Not set' }, ...REQUEST_IMPACT_OPTIONS];
  const urgencyOptions: SheetOption<string>[] = [{ value: NOT_SET, label: 'Not set' }, ...REQUEST_URGENCY_OPTIONS];
  const chooseImpact = (v: string) => {
    const next = v === NOT_SET ? null : (v as TicketImpact);
    setImpact(next);
    setPriority((p) => nextRequestPriority(p, next, urgency));
  };
  const chooseUrgency = (v: string) => {
    const next = v === NOT_SET ? null : (v as RequestUrgency);
    setUrgency(next);
    setPriority((p) => nextRequestPriority(p, impact, next));
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: palette.gray[50] }}>
      {header}
      <OfflineBanner />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
        <Card>
          <View className="flex-row items-start">
            <View className="h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Ionicons name="mail-outline" size={20} color={palette.blue[700]} />
            </View>
            <View className="ml-3 flex-1">
              {item.category?.name ? <Text className="text-xs font-medium text-blue-700">{item.category.name}</Text> : null}
              <Text className="text-lg font-bold text-gray-900">{item.name || 'Service'}</Text>
              {item.description ? <Text className="mt-1 text-sm text-gray-700">{item.description}</Text> : null}
            </View>
          </View>
        </Card>

        {item.isActive === false ? (
          // SCR-3 still returns retired items; SCR-5 would answer 404 "Service item not found" (01 SCR-3).
          <View className="mx-4">
            <Notice tone="warning">This service is no longer offered, so it can't be requested.</Notice>
          </View>
        ) : (
          <>
            {can.requestProperties ? (
              <FormCard title="Request properties">
                <SelectField
                  label="Impact"
                  value={REQUEST_IMPACT_OPTIONS.find((o) => o.value === impact)?.label ?? null}
                  placeholder="Select impact"
                  onPress={() => setSheet('impact')}
                  disabled={busy}
                />
                <SelectField
                  label="Urgency"
                  value={REQUEST_URGENCY_OPTIONS.find((o) => o.value === urgency)?.label ?? null}
                  placeholder="Select urgency"
                  onPress={() => setSheet('urgency')}
                  disabled={busy}
                />
                <Text className="mb-1 text-sm font-medium text-gray-700">Priority</Text>
                <View className="mb-3 min-h-11 flex-row items-center rounded-lg border border-gray-300 bg-gray-100 px-3">
                  {priority ? <PriorityBadge priority={priority} auto /> : <Text className="text-base text-gray-500">Auto-calculated</Text>}
                </View>
                <Notice>
                  The priority is worked out from impact and urgency once both are chosen. Without them, the request is Medium.
                </Notice>
              </FormCard>
            ) : null}

            <FormCard title="Requester details">
              <Text className="text-base font-semibold text-gray-900">{formatDisplayName(viewer?.displayName) || viewer?.email || '—'}</Text>
              {viewer?.email ? <Text className="text-sm text-gray-500">{viewer.email}</Text> : null}
            </FormCard>

            {form.fields.length > 0 ? (
              // Always "Employee Details" on the web: `formSectionTitle` is not a ServiceItem column (G4 §3).
              <FormCard title="Employee Details">
                {form.fields.map((field) => (
                  <ServiceFormFieldInput
                    key={field.name}
                    field={field}
                    value={values[field.name] ?? ''}
                    error={errors[field.name] ?? null}
                    onChange={fieldSetters.get(field.name) ?? ((v) => setValue(field.name, v))}
                    disabled={busy}
                  />
                ))}
              </FormCard>
            ) : null}
            {form.skipped > 0 ? (
              <View className="mx-4">
                <Notice tone="warning">
                  {form.skipped === 1 ? '1 field of this form is' : `${form.skipped} fields of this form are`} set up in a way the app
                  can't show. Contact the Service Desk if you need {form.skipped === 1 ? 'it' : 'them'}.
                </Notice>
              </View>
            ) : null}

            <Card>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: notesOpen }}
                accessibilityLabel="Resolution: notes for the person handling your request"
                onPress={() => setNotesOpen((o) => !o)}
                className="-my-2 min-h-11 flex-row items-center active:opacity-60"
              >
                <Ionicons name={notesOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.text.body} />
                <View className="ml-2 flex-1">
                  <Text className="text-sm font-medium text-gray-700">Resolution</Text>
                  {!notesOpen ? (
                    <Text className="text-xs text-gray-500" numberOfLines={1}>
                      {notes ? notes : 'Notes for the person handling your request'}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {notesOpen ? (
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  editable={!busy}
                  multiline
                  textAlignVertical="top"
                  placeholder="Add any additional notes for the resolver…"
                  placeholderTextColor={colors.text.secondary}
                  accessibilityLabel="Notes for the resolver"
                  className="mt-4 min-h-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
                />
              ) : null}
            </Card>

            {failing.length > 0 ? (
              <InlineError message={`Check ${failing.length === 1 ? 'this field' : 'these fields'}: ${failing.map((f) => f.label).join(', ')}.`} />
            ) : null}
            <InlineError message={error} />
            {item.requiresApproval ? (
              <View className="mx-4">
                <Notice tone="warning">This request requires approval before fulfilment.</Notice>
              </View>
            ) : null}
            <View className="mx-4">
              <SubmitButton label="Add Request" onPress={send} loading={busy} />
              <View className="mt-3">
                <OutlineButton label="Reset" icon="refresh" onPress={reset} disabled={busy} />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <OptionSheet
        visible={sheet === 'impact'}
        title="Impact"
        options={impactOptions}
        selected={impact ?? NOT_SET}
        onSelect={chooseImpact}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'urgency'}
        title="Urgency"
        options={urgencyOptions}
        selected={urgency ?? NOT_SET}
        onSelect={chooseUrgency}
        onClose={() => setSheet(null)}
      />
    </KeyboardAvoidingView>
  );
}
