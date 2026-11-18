// iOS-5i (Android 4d0e51e, 723e2fc): the filter rules on iOS, for the five personas.
// - Which filters each role gets (permissions.ts ticketListFilters): Status, priority, category and dates for everyone;
//   technician and group for ADMIN and AGENT (triage and country-locked).
// - TKT-1 on the wire, through the app's own axios client: each filter ONE parameter, its values joined by commas
//   (01 §iOS-A: ⚠ ASSUMED, from the UAT portal's URL); never repeated keys, never `x[]=`; a role never sends a filter it
//   does not have, however many values the state holds.
// - "Single value as before" (Ronit's decision 3): Android has no run-time fallback, so the proof is that one value per
//   filter builds the SAME URL as the app built before the multi-select. The three URLs below were built by
//   src/utils/ticket-filters.ts at 6b5e46c (the pre-iOS-5i rules, one value each), through this client, on 2026-11-18.
// Android's own tests for these rules (tests/rbac/list-filters, tests/filters/multi-select) run alongside.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { listTickets } from '../../src/api/tickets.api.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import { ticketListFilters } from '../../src/utils/permissions.ts';
import {
  NO_ADVANCED_FILTERS, availableTicketFilters, namedFilterSetsStatus, ticketListQuery, withAdvancedFilters, withNamedFilter,
} from '../../src/utils/ticket-filters.ts';
import { NAMES, PERSONAS, forEachPersona } from '../rbac/personas.mjs';

const sent = [];
apiClient.defaults.adapter = async (config) => {
  sent.push({ params: { ...(config.params ?? {}) }, uri: apiClient.getUri(config) });
  return {
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify({ data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrev: false }),
    config,
    request: {},
  };
};
const query = (i = 0) => new URL(sent[i].uri).searchParams;

beforeEach(() => {
  sent.length = 0;
  useUiStore.getState().reset();
});

const picks = (ids) => ids.map((id, i) => ({ id, name: `Name ${i + 1}` }));
/** Every filter holding several values. */
const EVERY_FILTER_SEVERAL = {
  ...NO_ADVANCED_FILTERS,
  status: ['ON_HOLD', 'OPEN'],
  priority: ['URGENT', 'HIGH'],
  category: picks(['cat-a', 'cat-b', 'cat-c']),
  fromDate: '2026-10-01',
  toDate: '2026-10-22',
  technician: picks(['tech-a', 'tech-b']),
  group: picks(['team-a', 'team-b']),
};

describe('which filters each of the five personas gets (ticketListFilters)', () => {
  forEachPersona('the Filters sheet', {
    END_USER: ['status', 'priority', 'category', 'date'],
    AGENT: ['status', 'priority', 'category', 'date', 'technician', 'group'],
    TRIAGE_AGENT: ['status', 'priority', 'category', 'date', 'technician', 'group'],
    L2_MANAGER: ['status', 'priority', 'category', 'date'],
    ADMIN: ['status', 'priority', 'category', 'date', 'technician', 'group'],
  }, (p) => ticketListFilters(p));

  test('no session counts as END_USER (the narrowest list)', () => {
    assert.deepEqual(ticketListFilters(null), ['status', 'priority', 'category', 'date']);
  });
});

describe('TKT-1 on the wire, per persona: one key per filter, values joined by commas', () => {
  const EXPECTED = {
    END_USER: { status: 'OPEN,ON_HOLD', priority: 'HIGH,URGENT', categoryId: 'cat-a,cat-b,cat-c' },
    AGENT: { status: 'OPEN,ON_HOLD', priority: 'HIGH,URGENT', categoryId: 'cat-a,cat-b,cat-c', assignedToId: 'tech-a,tech-b', teamId: 'team-a,team-b' },
    TRIAGE_AGENT: { status: 'OPEN,ON_HOLD', priority: 'HIGH,URGENT', categoryId: 'cat-a,cat-b,cat-c', assignedToId: 'tech-a,tech-b', teamId: 'team-a,team-b' },
    L2_MANAGER: { status: 'OPEN,ON_HOLD', priority: 'HIGH,URGENT', categoryId: 'cat-a,cat-b,cat-c' },
    ADMIN: { status: 'OPEN,ON_HOLD', priority: 'HIGH,URGENT', categoryId: 'cat-a,cat-b,cat-c', assignedToId: 'tech-a,tech-b', teamId: 'team-a,team-b' },
  };
  for (const name of NAMES) {
    test(`${name}: the URL axios builds holds each allowed filter once, as one comma list, and nothing else`, async () => {
      const me = PERSONAS[name];
      await listTickets(ticketListQuery({ me, filter: 'ALL', sort: 'UPDATED', advanced: EVERY_FILTER_SEVERAL, allowed: ticketListFilters(me) }));
      const q = query();
      for (const [key, value] of Object.entries(EXPECTED[name])) {
        assert.deepEqual(q.getAll(key), [value], `${name} ${key}`);
        assert.equal(typeof sent[0].params[key], 'string', `${key}: a string, so axios never writes ${key}[]=`);
      }
      for (const key of ['assignedToId', 'teamId']) {
        if (!(key in EXPECTED[name])) assert.equal(q.has(key), false, `${name} never sends ${key}`);
      }
      assert.deepEqual([q.get('fromDate'), q.get('toDate')], ['2026-10-01', '2026-10-22']);
      assert.doesNotMatch(sent[0].uri, /\[\]=|%5B%5D=/, 'no array syntax');
      const keys = [...q.keys()];
      assert.equal(keys.length, new Set(keys).size, 'no key repeated');
      assert.doesNotMatch(sent[0].uri, /=,|,&|,$|,,/, 'no empty part, no trailing comma');
    });
  }
});

describe('one value per filter: the same request as before the multi-select (decision 3)', () => {
  const ONE_EACH = {
    ...NO_ADVANCED_FILTERS,
    priority: ['HIGH'],
    category: [{ id: 'cat-hw', name: 'Hardware' }],
    fromDate: '2026-10-01',
    toDate: '2026-10-22',
    technician: [{ id: 'tech-1', name: 'Jane' }],
    group: [{ id: 'team-1', name: 'SD' }],
  };
  // Built by the 6b5e46c rules (single values) through this client: the pre-iOS-5i requests, byte for byte.
  const BEFORE = {
    'ALL UPDATED': 'https://uat-servicedesk.mountmerugroup.com/api/v1/tickets?priority=HIGH&assignedToId=tech-1&teamId=team-1&categoryId=cat-hw&fromDate=2026-10-01&toDate=2026-10-22&search=vpn&page=1&limit=20',
    'OPEN PRIORITY': 'https://uat-servicedesk.mountmerugroup.com/api/v1/tickets?status=OPEN&priority=HIGH&assignedToId=tech-1&teamId=team-1&categoryId=cat-hw&fromDate=2026-10-01&toDate=2026-10-22&search=vpn&sortBy=priority&page=1&limit=20',
    'OVERDUE DUE': 'https://uat-servicedesk.mountmerugroup.com/api/v1/tickets?priority=HIGH&assignedToId=tech-1&teamId=team-1&categoryId=cat-hw&sla=BREACHED&fromDate=2026-10-01&toDate=2026-10-22&search=vpn&sortBy=sla&page=1&limit=20',
  };
  for (const [combo, url] of Object.entries(BEFORE)) {
    test(`${combo}: exactly the URL of 6b5e46c`, async () => {
      const [filter, sort] = combo.split(' ');
      const me = PERSONAS.ADMIN;
      await listTickets(ticketListQuery({ me, filter, sort, advanced: ONE_EACH, allowed: ticketListFilters(me), search: 'vpn' }));
      assert.equal(sent[0].uri, url);
      assert.doesNotMatch(sent[0].uri, /,/, 'one value: no comma anywhere');
    });
  }

  test('nothing chosen sends no filter key at all, never an empty value', async () => {
    const me = PERSONAS.ADMIN;
    await listTickets(ticketListQuery({ me, filter: 'ALL', sort: 'UPDATED', advanced: NO_ADVANCED_FILTERS, allowed: ticketListFilters(me) }));
    const q = query();
    for (const key of ['status', 'priority', 'categoryId', 'assignedToId', 'teamId', 'fromDate', 'toDate']) assert.equal(q.has(key), false, key);
  });
});

describe('the status slot (Android 4d0e51e), for every persona\'s own quick filters', () => {
  for (const name of NAMES) {
    test(`${name}: statuses replace a quick filter that sends a status; that quick filter clears them; one status key`, async () => {
      const me = PERSONAS[name];
      const named = availableTicketFilters(me.role).filter(namedFilterSetsStatus);
      assert.ok(named.length > 0, `${name} has at least one quick filter that sends a status`);
      for (const filter of named) {
        let state = withAdvancedFilters({ filter, advanced: NO_ADVANCED_FILTERS }, { status: ['RESOLVED', 'OPEN'] });
        assert.deepEqual([state.filter, state.advanced.status], ['ALL', ['OPEN', 'RESOLVED']], filter);
        state = withNamedFilter(state, filter);
        assert.deepEqual([state.filter, state.advanced.status], [filter, []], filter);
      }
      sent.length = 0;
      // A stale state that holds both: the request still carries ONE status, the quick filter's.
      const stale = { ...NO_ADVANCED_FILTERS, status: ['CLOSED'] };
      await listTickets(ticketListQuery({ me, filter: named[0], sort: 'UPDATED', advanced: stale, allowed: ticketListFilters(me) }));
      assert.equal(query().getAll('status').length, 1);
      assert.notEqual(query().get('status'), 'CLOSED');
    });
  }
});
