// M3 Filters sheet (Phase G2): the web ticket list's "More Filters" row plus its priority select, on a phone.
// The web's behaviour, filter by filter with sources: docs/G2-WEB-FILTERS.md.
//
// - WHICH filters: ticketListFilters() (utils/permissions.ts) alone. Priority, category and created date for everyone;
//   technician and group for ADMIN and AGENT (their lookups, USR-3 and LKP-2, are 403 for END_USER and L2_MANAGER).
// - Every pick applies at once, as each web select does on change; the list behind refetches. Nothing is written to the
//   server: these are TKT-1 query params (ticketListQuery in utils/ticket-filters.ts), never filtered on the device.
// - Options as on the web: priorities in its order; active top-level categories by name (LKP-1); every group, inactive
//   ones marked (LKP-2, no country); technicians = active AGENTs, searched by name or email (USR-3 `role=AGENT`).
// - "Clear all" is the web's Clear: named filter, search, the five filters and the sort. The country stays.
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ErrorState, FieldLabel, FormCard, Notice, OfflineBanner, OptionSheet, PersonPickerSheet, ScreenHeader, SelectField,
  SubmitButton, type SheetOption,
} from '@/components';
import { useCategories, useTeams, useTickets } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { TicketPriority, TicketStackScreenProps } from '@/types';
import { notify } from '@/utils/dialogs';
import { PRIORITY_LABELS, formatDisplayName } from '@/utils/format';
import { ticketListFilters } from '@/utils/permissions';
import { DUE_DATE_MAX, DUE_DATE_MIN, dateFromDay, dayFromDate } from '@/utils/tasks';
import {
  PRIORITY_FILTER_OPTIONS, TECHNICIAN_FILTER_ROLES, TICKET_FILTER_LABELS, activeFilterLabels, categoryFilterOptions,
  formatFilterDay, groupFilterOptions, isFilterDay, isTicketFilterAllowed, listCountryParam, namedFilterSetsTechnician,
  type TicketNamedFilter,
} from '@/utils/ticket-filters';

const ALL = '__ALL__';

type Picker = 'priority' | 'category' | 'technician' | 'group';

export function TicketFiltersScreen({ navigation }: TicketStackScreenProps<'TicketFilters'>) {
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const {
    ticketFilter, ticketSort, ticketCountryId, ticketSearch, ticketAdvanced: advanced, setTicketAdvanced, clearTicketFilters,
  } = useUiStore();
  const [picker, setPicker] = useState<Picker | null>(null);

  const allowed = ticketListFilters(user);
  const role = user?.role ?? 'END_USER';
  const activeFilter: TicketNamedFilter = isTicketFilterAllowed(role, ticketFilter) ? ticketFilter : 'ALL';
  const anythingOn = activeFilterLabels({ filter: activeFilter, search: ticketSearch, advanced, allowed }).length > 0;

  // The same TKT-1 query as the list behind (same key, one request): its total is the "Show N tickets" button.
  const countryId = user ? listCountryParam(user, ticketCountryId) : undefined;
  const list = useTickets({ filter: activeFilter, sort: ticketSort, search: ticketSearch, countryId, advanced });

  // Lookups load only when their picker opens; the chosen name is kept with the choice.
  const categories = useCategories({ enabled: picker === 'category' && allowed.includes('category') });
  const teams = useTeams({ enabled: picker === 'group' && allowed.includes('group'), includeInactive: true });

  const priorityOptions = useMemo<SheetOption<TicketPriority | typeof ALL>[]>(
    () => [{ value: ALL, label: 'All priorities' }, ...PRIORITY_FILTER_OPTIONS.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))],
    [],
  );
  const categoryOptions = useMemo(() => categoryFilterOptions(categories.data ?? []), [categories.data]);
  const groupOptions = useMemo(() => groupFilterOptions(teams.data ?? []), [teams.data]);

  /** System date dialog (Android). The device's calendar day is sent, as the web's date input sends the browser's. */
  const pickDay = (current: string | null, apply: (day: string) => void) => {
    DateTimePickerAndroid.open({
      value: (current ? dateFromDay(current) : null) ?? new Date(),
      mode: 'date',
      minimumDate: DUE_DATE_MIN,
      maximumDate: DUE_DATE_MAX,
      onValueChange: (_event, date) => apply(dayFromDate(date)),
      onError: () => notify("Couldn't open the date picker."),
    });
  };

  const fromDay = isFilterDay(advanced.fromDate) ? advanced.fromDate : null;
  const toDay = isFilterDay(advanced.toDate) ? advanced.toDate : null;
  const technicianSlotTaken = namedFilterSetsTechnician(activeFilter);

  const total = list.total;
  const showLabel = total === undefined ? 'Show tickets' : `Show ${total} ${total === 1 ? 'ticket' : 'tickets'}`;

  return (
    <View className="flex-1 bg-gray-50">
      <ScreenHeader
        title="Filters"
        variant="close"
        right={
          anythingOn ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all filters, search and sort"
              onPress={clearTicketFilters}
              className="h-11 justify-center px-3"
            >
              <Text className="text-sm font-medium text-blue-700">Clear all</Text>
            </Pressable>
          ) : null
        }
      />
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <Text className="mx-4 mb-2 text-xs text-gray-500">
          Every filter applies at once, together with the quick filter{activeFilter !== 'ALL' ? ` (${TICKET_FILTER_LABELS[activeFilter]})` : ''}, the search and the sort.
        </Text>

        <FormCard>
          {allowed.includes('priority') ? (
            <SelectField
              label="Priority"
              value={advanced.priority ? PRIORITY_LABELS[advanced.priority] : null}
              placeholder="All priorities"
              onPress={() => setPicker('priority')}
            />
          ) : null}

          {allowed.includes('category') ? (
            <SelectField
              label="Category"
              hint="Top-level categories. Tickets filed under a sub-category or item of it are not included."
              value={advanced.category?.name ?? null}
              placeholder="All categories"
              onPress={() => setPicker('category')}
            />
          ) : null}

          {allowed.includes('date') ? (
            <View className="mb-3">
              <FieldLabel label="Created" hint="The day the ticket was raised, both days included. Days are counted in UTC." />
              <DayField
                label="From"
                day={fromDay}
                onPress={() => pickDay(fromDay, (day) => setTicketAdvanced({ fromDate: day }))}
                onClear={() => setTicketAdvanced({ fromDate: null })}
              />
              <DayField
                label="To"
                day={toDay}
                onPress={() => pickDay(toDay ?? fromDay, (day) => setTicketAdvanced({ toDate: day }))}
                onClear={() => setTicketAdvanced({ toDate: null })}
              />
              {fromDay && toDay && fromDay > toDay ? (
                <Notice tone="warning">“From” is after “To”, so no ticket can match.</Notice>
              ) : null}
            </View>
          ) : null}

          {allowed.includes('technician') ? (
            <SelectField
              label="Technician"
              hint={
                technicianSlotTaken
                  ? `Picking a technician replaces the “${TICKET_FILTER_LABELS[activeFilter]}” quick filter.`
                  : undefined
              }
              value={advanced.technician?.name ?? null}
              placeholder="All technicians"
              onPress={() => setPicker('technician')}
            />
          ) : null}

          {allowed.includes('group') ? (
            <SelectField
              label="Group"
              value={advanced.group?.name ?? null}
              placeholder="All groups"
              onPress={() => setPicker('group')}
            />
          ) : null}
        </FormCard>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 8 }} className="border-t border-border bg-white px-4 pt-3">
        <SubmitButton label={showLabel} onPress={() => navigation.goBack()} />
      </View>

      <OptionSheet
        visible={picker === 'priority'}
        title="Priority"
        options={priorityOptions}
        selected={advanced.priority ?? ALL}
        onSelect={(value) => setTicketAdvanced({ priority: value === ALL ? null : value })}
        onClose={() => setPicker(null)}
      />

      <OptionSheet
        visible={picker === 'category'}
        title="Category"
        options={[{ value: ALL, label: 'All categories' }, ...categoryOptions.map((c) => ({ value: c.id, label: c.name }))]}
        selected={advanced.category?.id ?? ALL}
        onSelect={(value) => {
          const choice = categoryOptions.find((c) => c.id === value);
          setTicketAdvanced({ category: value === ALL || !choice ? null : choice });
        }}
        onClose={() => setPicker(null)}
      >
        {lookupState(categories, 'categories')}
      </OptionSheet>

      <OptionSheet
        visible={picker === 'group'}
        title="Group"
        options={[
          { value: ALL, label: 'All groups' },
          ...groupOptions.map((g) => ({ value: g.id, label: g.name, description: g.inactive ? 'Inactive group' : undefined })),
        ]}
        selected={advanced.group?.id ?? ALL}
        onSelect={(value) => {
          const choice = groupOptions.find((g) => g.id === value);
          setTicketAdvanced({ group: value === ALL || !choice ? null : { id: choice.id, name: choice.name } });
        }}
        onClose={() => setPicker(null)}
      >
        {lookupState(teams, 'groups')}
      </OptionSheet>

      {allowed.includes('technician') ? (
        <PersonPickerSheet
          visible={picker === 'technician'}
          title="Technician"
          searchRoles={TECHNICIAN_FILTER_ROLES}
          extraOptions={[
            {
              key: 'all',
              label: 'All technicians',
              onPress: () => {
                setTicketAdvanced({ technician: null });
                setPicker(null);
              },
            },
          ]}
          onPick={(person) => {
            setTicketAdvanced({ technician: { id: person.id, name: formatDisplayName(person.displayName) || person.email } });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
}

/** One end of the date range: opens the system date picker; ✕ clears it (the web's emptied date input). */
function DayField({ label, day, onPress, onClear }: { label: string; day: string | null; onPress: () => void; onClear: () => void }) {
  return (
    <View className="mb-2 flex-row items-center">
      <Text className="w-14 text-sm text-gray-700">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Created ${label.toLowerCase()}: ${day ? formatFilterDay(day) : 'any day'}`}
        onPress={onPress}
        className="min-h-11 flex-1 flex-row items-center rounded-lg border border-gray-300 bg-white px-3 py-2 active:bg-gray-50"
      >
        <Text className={`flex-1 text-base ${day ? 'text-gray-900' : 'text-gray-500'}`}>{day ? formatFilterDay(day) : 'Any day'}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.text.secondary} />
      </Pressable>
      {day ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Clear the ${label.toLowerCase()} date`}
          onPress={onClear}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="close-circle" size={18} color={colors.text.muted} />
        </Pressable>
      ) : (
        <View className="w-11" />
      )}
    </View>
  );
}

interface Lookup {
  data: unknown;
  error: unknown;
  isError: boolean;
  isPending: boolean;
  fetchStatus: string;
  refetch: () => Promise<unknown>;
}

/**
 * In place of a picker's options while its lookup is loading, offline or failed; undefined once it has data, so the
 * OptionSheet shows its options. A plain function, not a component: an element is never undefined.
 */
function lookupState(query: Lookup, what: string): ReactNode | undefined {
  if (query.data !== undefined) return undefined;
  if (query.fetchStatus === 'paused') {
    return <Text className="px-4 py-8 text-center text-sm text-gray-500">The {what} load when you reconnect.</Text>;
  }
  if (query.isError) {
    return <ErrorState error={query.error} title={`Couldn't load the ${what}`} onRetry={() => void query.refetch()} />;
  }
  return (
    <View className="items-center py-8">
      <ActivityIndicator color={colors.primary} />
      <Text className="mt-2 text-sm text-gray-500">Loading {what}…</Text>
    </View>
  );
}
