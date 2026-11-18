// M3 Filters sheet (Phase G2): the web ticket list's "More Filters" row plus its status and priority selects, on a phone.
// The web's behaviour, filter by filter with sources: docs/G2-WEB-FILTERS.md.
//
// - WHICH filters: ticketListFilters() (utils/permissions.ts) alone. Status, priority, category and created date for
//   everyone; technician and group for ADMIN and AGENT (their lookups, USR-3 and LKP-2, are 403 for END_USER and
//   L2_MANAGER).
// - MULTI-SELECT on every filter (2026-11-18, Ronit's brief): status, priority, category, technician and group are one
//   OptionSheet `multiple` each (checkboxes, Select all with its count, Clear, the search). Each sends ONE parameter with
//   its values joined by commas, as the live web portal does (01-API-CONTRACT.md TKT-1); one value is sent as before.
//   The "All categories" row clears the choice; it is not a value. Picking statuses replaces a quick filter that sends a
//   status, and picking technicians replaces "My open" or "Unassigned" (one slot each, last choice wins).
// - Ticks apply once, when a sheet closes (one request, not one per tick); the list behind refetches. Nothing is written
//   to the server: these are TKT-1 query params (ticketListQuery in utils/ticket-filters.ts), never filtered on the device.
// - Options as on the web: priorities in its order; active top-level categories by name (LKP-1); every group, inactive
//   ones marked (LKP-2, no country); technicians = active AGENTs, searched by name or email (USR-3 `role=AGENT`). The web
//   lists its technicians from `GET /users`, which is not in the mobile contract (01), so the technician sheet searches:
//   it shows the chosen ones, and up to 20 matches for what is typed.
// - "Clear all" is the web's Clear: named filter, search, the sheet's filters and the sort. The country stays.
// - SAVED FILTERS at the top (./SavedFilters.tsx): the Service Desk's saved views, the same list as the web portal's
//   (2026-11-17). A chip applies the view at once, cut to this role (decodeSavedView).
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ErrorState, FieldLabel, FormCard, Notice, OfflineBanner, OptionSheet, ScreenHeader, SelectField, SubmitButton,
  type SheetOption,
} from '@/components';
import { countryName, useCategories, useCountryOptions, useDebouncedValue, useTeams, useTickets, useUserSearch } from '@/hooks';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { colors } from '@/theme';
import type { TicketPriority, TicketStackScreenProps, TicketStatus } from '@/types';
import { notify } from '@/utils/dialogs';
import { PRIORITY_LABELS, formatDisplayName, statusLabel } from '@/utils/format';
import { ticketListFilters } from '@/utils/permissions';
import type { SavedFilterContent, TicketListFilterState } from '@/utils/saved-filters';
import { DUE_DATE_MAX, DUE_DATE_MIN, dateFromDay, dayFromDate } from '@/utils/tasks';
import {
  PRIORITY_FILTER_OPTIONS, STATUS_FILTER_OPTIONS, TECHNICIAN_FILTER_ROLES, TICKET_FILTER_LABELS, activeFilterLabels,
  categoryFilterOptions, countrySelectorMode, formatFilterDay, groupFilterOptions, isFilterDay, isFilterId,
  isTicketFilterAllowed, listCountryParam, namedFilterSetsStatus, namedFilterSetsTechnician, picksSummary,
  priorityFilterSummary, statusFilterSummary, type FilterPick, type TicketNamedFilter,
} from '@/utils/ticket-filters';
import { SavedFiltersBlock } from './SavedFilters';

type Picker = 'status' | 'priority' | 'category' | 'technician' | 'group';

/** The Status filter's options, in the web's order (TicketsListPage.tsx:28). */
const STATUS_OPTIONS: readonly SheetOption<TicketStatus>[] = STATUS_FILTER_OPTIONS.map((s) => ({ value: s, label: statusLabel(s) }));
/** The Priority filter's options, in the web's order (TicketsListPage.tsx:58). */
const PRIORITY_OPTIONS: readonly SheetOption<TicketPriority>[] = PRIORITY_FILTER_OPTIONS.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));
/** USR-3 answers only a search of 2 or more characters (01 USR-3). */
const TECHNICIAN_SEARCH_MIN = 2;

/** Picks as sheet options (value = id, label = name), and back. */
const pickOptions = (picks: readonly FilterPick[]): SheetOption<string>[] => picks.map((p) => ({ value: p.id, label: p.name }));
const picksFrom = (chosen: readonly SheetOption<string>[]): FilterPick[] => chosen.map((o) => ({ id: o.value, name: o.label }));

export function TicketFiltersScreen({ navigation }: TicketStackScreenProps<'TicketFilters'>) {
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const {
    ticketFilter, ticketSort, ticketCountryId, ticketSearch, ticketAdvanced: advanced, setTicketAdvanced, clearTicketFilters,
    applySavedTicketFilter,
  } = useUiStore();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [technicianQuery, setTechnicianQuery] = useState('');

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

  const categoryOptions = useMemo<SheetOption<string>[]>(
    () => categoryFilterOptions(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categories.data],
  );
  const groupOptions = useMemo<SheetOption<string>[]>(
    () =>
      groupFilterOptions(teams.data ?? []).map((g) => ({
        value: g.id, label: g.name, description: g.inactive ? 'Inactive group' : undefined,
      })),
    [teams.data],
  );

  // Technicians come from a server search (USR-3, active AGENTs, up to 20), only while their sheet is open.
  const technicianTerm = useDebouncedValue(technicianQuery, 350);
  const technicianSearch = useUserSearch(technicianTerm, {
    roles: TECHNICIAN_FILTER_ROLES, enabled: picker === 'technician' && allowed.includes('technician'),
  });
  const technicianTyped = technicianQuery.trim().length >= TECHNICIAN_SEARCH_MIN;
  const technicianOptions = useMemo<SheetOption<string>[]>(
    () =>
      (technicianTyped ? (technicianSearch.data ?? []) : [])
        .filter((u) => isFilterId(u.id))
        .map((u) => ({ value: u.id, label: formatDisplayName(u.displayName) || u.email, description: u.email })),
    [technicianTyped, technicianSearch.data],
  );
  const closePicker = () => {
    setPicker(null);
    setTechnicianQuery('');
  };

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
  const statusSlotTaken = namedFilterSetsStatus(activeFilter);

  // Saved filters: the list's state, for "Save these filters" and for the chip that matches. The country's name, for the
  // "not kept" note, comes from the same lookup the list's country selector already loaded (same key: no extra request).
  const countryMode = user ? countrySelectorMode(user) : 'hidden';
  const countries = useCountryOptions({ enabled: countryMode === 'switch' && ticketCountryId !== null });
  const listState: TicketListFilterState = {
    ticketFilter: activeFilter, ticketSort, ticketSearch, ticketCountryId, ticketAdvanced: advanced,
    countryName: countryName(countries.data?.find((c) => c.id === ticketCountryId)),
  };
  // Already cut to this role by decodeSavedView(); the store sets exactly these fields.
  const applySaved = (content: SavedFilterContent) => applySavedTicketFilter(content);

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
              className="h-11 justify-center px-3 active:opacity-60"
            >
              <Text className="text-sm font-medium text-blue-700">Clear all</Text>
            </Pressable>
          ) : null
        }
      />
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        {user ? <SavedFiltersBlock list={listState} onApply={applySaved} /> : null}

        <Text className="mx-4 mb-2 text-xs text-gray-500">
          Every filter applies at once, together with the quick filter{activeFilter !== 'ALL' ? ` (${TICKET_FILTER_LABELS[activeFilter]})` : ''}, the search and the sort.
        </Text>

        <FormCard>
          {allowed.includes('status') ? (
            <SelectField
              label="Status"
              hint={
                statusSlotTaken
                  ? `Picking statuses replaces the “${TICKET_FILTER_LABELS[activeFilter]}” quick filter.`
                  : undefined
              }
              value={statusFilterSummary(advanced.status)}
              placeholder="All statuses"
              onPress={() => setPicker('status')}
            />
          ) : null}

          {allowed.includes('priority') ? (
            <SelectField
              label="Priority"
              value={priorityFilterSummary(advanced.priority)}
              placeholder="All priorities"
              onPress={() => setPicker('priority')}
            />
          ) : null}

          {allowed.includes('category') ? (
            <SelectField
              label="Category"
              hint="Top-level categories. Tickets filed under a sub-category or item of one are not included."
              value={picksSummary(advanced.category)}
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
                  ? `Picking technicians replaces the “${TICKET_FILTER_LABELS[activeFilter]}” quick filter.`
                  : undefined
              }
              value={picksSummary(advanced.technician)}
              placeholder="All technicians"
              onPress={() => setPicker('technician')}
            />
          ) : null}

          {allowed.includes('group') ? (
            <SelectField
              label="Group"
              value={picksSummary(advanced.group)}
              placeholder="All groups"
              onPress={() => setPicker('group')}
            />
          ) : null}
        </FormCard>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 8 }} className="border-t border-border bg-white px-4 pt-3">
        <SubmitButton label={showLabel} onPress={() => navigation.goBack()} />
      </View>

      {/* Five multi-selects, one component (OptionSheet `multiple`). Each hands its choice over once, when it closes. */}
      {allowed.includes('status') ? (
        <OptionSheet
          multiple
          visible={picker === 'status'}
          title="Status"
          allLabel="All statuses"
          options={STATUS_OPTIONS}
          selectedValues={advanced.status}
          onChange={(values) => setTicketAdvanced({ status: values })}
          onClose={closePicker}
        />
      ) : null}

      {allowed.includes('priority') ? (
        <OptionSheet
          multiple
          visible={picker === 'priority'}
          title="Priority"
          allLabel="All priorities"
          options={PRIORITY_OPTIONS}
          selectedValues={advanced.priority}
          onChange={(values) => setTicketAdvanced({ priority: values })}
          onClose={closePicker}
        />
      ) : null}

      {allowed.includes('category') ? (
        <OptionSheet
          multiple
          visible={picker === 'category'}
          title="Category"
          allLabel="All categories"
          options={categoryOptions}
          selectedValues={advanced.category.map((c) => c.id)}
          selectedOptions={pickOptions(advanced.category)}
          onChange={(_values, chosen) => setTicketAdvanced({ category: picksFrom(chosen) })}
          onClose={closePicker}
        >
          {lookupState(categories, 'categories')}
        </OptionSheet>
      ) : null}

      {allowed.includes('group') ? (
        <OptionSheet
          multiple
          visible={picker === 'group'}
          title="Group"
          allLabel="All groups"
          options={groupOptions}
          selectedValues={advanced.group.map((g) => g.id)}
          selectedOptions={pickOptions(advanced.group)}
          onChange={(_values, chosen) => setTicketAdvanced({ group: picksFrom(chosen) })}
          onClose={closePicker}
        >
          {lookupState(teams, 'groups')}
        </OptionSheet>
      ) : null}

      {allowed.includes('technician') ? (
        <OptionSheet
          multiple
          visible={picker === 'technician'}
          title="Technician"
          allLabel="All technicians"
          options={technicianOptions}
          selectedValues={advanced.technician.map((t) => t.id)}
          selectedOptions={pickOptions(advanced.technician)}
          onChange={(_values, chosen) => setTicketAdvanced({ technician: picksFrom(chosen) })}
          onClose={closePicker}
          remoteSearch={{
            query: technicianQuery,
            onQueryChange: setTechnicianQuery,
            placeholder: 'Name or email (2+ letters)',
            footer: (
              <TechnicianSearchState
                query={technicianQuery}
                settled={technicianTerm}
                search={technicianSearch}
                found={technicianOptions.length}
              />
            ),
          }}
        />
      ) : null}
    </View>
  );
}

/** Under the technician sheet's rows: what the search is doing, in words. Nothing once there are matches. */
function TechnicianSearchState({
  query, settled, search, found,
}: {
  query: string;
  settled: string;
  search: { isFetching: boolean; isError: boolean; error: unknown; data: unknown; fetchStatus: string; refetch: () => Promise<unknown> };
  found: number;
}) {
  const q = query.trim();
  const line = (text: string) => <Text className="px-4 py-6 text-center text-sm text-gray-500">{text}</Text>;
  if (q.length < TECHNICIAN_SEARCH_MIN) return line('Type at least 2 letters of a name or email to find technicians.');
  if (search.fetchStatus === 'paused') return line('Searching needs a connection. It runs when you reconnect.');
  if (search.isFetching || settled.trim() !== q) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (search.isError && search.data === undefined) {
    return <ErrorState error={search.error} title="Couldn't search technicians" onRetry={() => void search.refetch()} />;
  }
  return found === 0 ? line(`No technician matches “${q}”.`) : null;
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
          className="h-11 w-11 items-center justify-center active:opacity-60"
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
