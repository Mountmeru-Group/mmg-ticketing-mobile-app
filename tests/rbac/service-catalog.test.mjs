// Phase G4: the service catalogue. The expected behaviour is the web portal's, read from its source:
// docs/G4-WEB-CATALOGUE.md (every statement there cites a file and line).
//
// For each of END_USER, AGENT, triage AGENT, L2_MANAGER and ADMIN these tests pin who sees the catalogue, whether any
// item is scoped to them, who may send a request and with which fields, and whose requests appear in My Requests and
// on a request's detail, written out in full so that a feature reaching one more role is a failing diff. Then the
// dynamic form, the riskiest part: every field type the web renders, its validation (the web's `required` and the
// browser's checks), the absence of conditional logic, and the exact `formData` and request body the web would send.
//
// What is real: the app's own permission, rule, guard and API modules, unchanged. What is faked: the network (axios's
// transport adapter records requests), as in the other rbac suites. Nothing calls UAT.
//
// iOS (docs/ios/00-PORT-MANIFEST.md §3.15): copied in iOS-3c from c84d53a with every expectation unchanged, except two
// wiring checks that read Android-only code: the drawer row and its Drawer.Screen / CatalogStack are the More rows and
// the More stack's route table (routes.ts STACK_ROUTES); and a number field's keyboard is `numbers-and-punctuation`, the
// iOS keyboard that has "-" (iOS-3c plan Q2: on iOS, `numeric` is the decimal pad, which has none).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { ApiClientError } from '../../src/api/errors.ts';
import {
  SERVICE_REQUEST_PAGE_SIZE, createServiceRequest, getServiceItem, getServiceRequest, listServiceCategories, listServiceItems,
  listServiceRequests,
} from '../../src/api/serviceCatalog.api.ts';
import { assertServiceRequest, wasRefusedOnDevice } from '../../src/hooks/writeGuards.ts';
import { STACK_ROUTES, stackRoutes } from '../../src/navigation/routes.ts';
import {
  canUseServiceCatalog, drawerItems, isOwnServiceRequest, myServiceRequestRows, serviceCatalogPermissions, serviceRequestProblem,
} from '../../src/utils/permissions.ts';
import {
  DATE_FORMAT_MESSAGE, EMAIL_FORMAT_MESSAGE, NUMBER_FORMAT_MESSAGE, OPTION_MESSAGE,
  REQUEST_IMPACT_OPTIONS, REQUEST_URGENCY_OPTIONS, SERVICE_FIELD_TYPES, WHOLE_NUMBER_MESSAGE, answerRows, buildFormData,
  buildServiceRequestBody, categoryItemCount, fieldError, filterCatalogItems, formErrors, initialFormValues, isRealDay,
  itemCountLabel, localDateFromDay, nextRequestPriority, normaliseFormFields, normaliseOptions, requestPriority, requestRef,
  rhfPath, submittedMessage, submittedValue,
} from '../../src/utils/service-catalog.ts';
import { NAMES, OTHER_USER, PERSONAS, forEachPersona } from './personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

// ── The network, faked ───────────────────────────────────────

const sent = [];
let reply = { status: 200, body: {} };
apiClient.defaults.adapter = async (config) => {
  sent.push({
    method: config.method,
    url: config.url,
    params: config.params,
    data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
  });
  const response = {
    status: reply.status,
    statusText: String(reply.status),
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify(reply.body),
    config,
    request: {},
  };
  if (reply.status >= 400) {
    const error = new Error(`Request failed with status code ${reply.status}`);
    error.isAxiosError = true;
    error.response = { ...response, data: reply.body };
    error.config = config;
    throw error;
  }
  return response;
};
beforeEach(() => {
  sent.length = 0;
  reply = { status: 200, body: {} };
});

/** Run `fn`; it must be refused on the device, with nothing sent. Returns the refusal message. */
async function refusedWithNothingSent(fn) {
  sent.length = 0;
  let caught = null;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof ApiClientError, 'expected a refusal');
  assert.equal(caught.kind, 'client');
  assert.equal(sent.length, 0, 'nothing may be sent');
  return caught.message;
}

const STAFF = ['AGENT', 'TRIAGE_AGENT', 'L2_MANAGER', 'ADMIN'];
const field = (over) => normaliseFormFields([{ name: 'f', label: 'Field', ...over }]).fields[0];

// ══ 1. Who sees the catalogue ════════════════════════════════

describe('catalogue: who sees it (web: sidebar and bottom tab for all four roles, AppLayout.tsx:30, :266)', () => {
  // G5: everyonesRequests is the web's My Requests for staff (SCC:117 scopes END_USER only); END_USER sees their own.
  const ALL = { browse: true, submit: true, requestProperties: true, myRequests: true, everyonesRequests: true };
  forEachPersona(
    'serviceCatalogPermissions',
    {
      END_USER: { ...ALL, requestProperties: false, everyonesRequests: false },
      AGENT: ALL,
      TRIAGE_AGENT: ALL,
      L2_MANAGER: ALL,
      ADMIN: ALL,
    },
    (p) => serviceCatalogPermissions(p),
  );

  // 2026-10-29: Knowledge base is ADMIN only, so for every other role the row follows Tasks directly.
  forEachPersona(
    'the drawer row "catalog" sits after Knowledge base (web sidebar order; ADMIN only has Knowledge base)',
    { END_USER: 1, AGENT: 2, TRIAGE_AGENT: 2, L2_MANAGER: 1, ADMIN: 3 },
    (p) => drawerItems(p.role, 0).indexOf('catalog'),
  );

  test('a role the app does not know gets no catalogue, no drawer row and no request', () => {
    assert.equal(canUseServiceCatalog('GUEST'), false);
    assert.deepEqual(serviceCatalogPermissions({ role: 'GUEST' }), {
      browse: false, submit: false, requestProperties: false, myRequests: false, everyonesRequests: false,
    });
    assert.equal(drawerItems('GUEST', 0).includes('catalog'), false);
    assert.equal(serviceCatalogPermissions(null).requestProperties, false, 'no session reads as END_USER: no request properties');
  });

  test('the More row is labelled as the web sidebar ("Service Request") and opens the catalogue in the More stack', () => {
    // iOS: the drawer's row is a More row (and My Requests a second one, iOS-2); the catalogue's routes are the More
    // stack's, built from STACK_ROUTES.MoreTab, each with its real screen.
    const more = read('src/navigation/MoreScreen.tsx');
    assert.match(more, /catalog: \{ label: 'Service Request', icon: '[\w-]+' \}/);
    assert.match(more, /navigate\('ServiceCatalog', \{ view: 'catalog' \}\)/);
    assert.match(more, /navigate\('ServiceCatalog', \{ view: 'requests' \}\)/);
    const stacks = read('src/navigation/TabStacks.tsx');
    for (const screen of ['ServiceCatalog', 'ServiceRequestForm', 'ServiceRequestDetail']) {
      assert.ok(STACK_ROUTES.MoreTab.includes(screen), `${screen} is not in the More stack`);
      assert.match(stacks, new RegExp(`\\b${screen}: ${screen}Screen,`));
      // 2026-10-29 (iOS-5b): the stacks register their routes from stackRoutes() (as Android's drawer from
      // drawerRoutes()), so the catalogue is checked there too: registered for every role.
      for (const p of Object.values(PERSONAS)) assert.ok(stackRoutes('MoreTab', p.role).includes(screen), `${p.role} ${screen}`);
    }
  });
});

describe('catalogue: no per-item or per-category scoping (SCC:34-41, :61-71; ServiceItem has no role field)', () => {
  const ITEMS = [
    { id: 'i1', name: 'New laptop', description: 'Standard issue laptop', categoryId: 'c-hw', requiresApproval: true },
    { id: 'i2', name: 'Email account', description: 'Mailbox for a new starter', categoryId: 'c-acc', requiresApproval: false },
    { id: 'i3', name: 'VPN access', description: null, categoryId: null, requiresApproval: false },
  ];
  // The browse list takes no viewer at all: every role sees exactly the server's active items.
  forEachPersona(
    'the full item list shown (search "a", no category)',
    Object.fromEntries(NAMES.map((n) => [n, ['i1', 'i2', 'i3']])),
    () => filterCatalogItems(ITEMS, null, 'a').map((i) => i.id),
  );

  test('the screen never filters the catalogue by role', () => {
    const src = read('src/screens/catalog/ServiceCatalogScreen.tsx');
    assert.doesNotMatch(src, /filterCatalogItems\([^)]*(viewer|role)/);
    assert.doesNotMatch(src, /categoryItemCount\([^)]*(viewer|role)/);
  });
});

describe('catalogue: browsing, as the web (SCP:55-66, :410, :422, :446-450)', () => {
  const ITEMS = [
    { id: 'i1', name: 'New Laptop', description: 'Standard issue', categoryId: 'c-hw' },
    { id: 'i2', name: 'Monitor', description: 'Extra LAPTOP screen', categoryId: 'c-hw' },
    { id: 'i3', name: 'Email account', description: 'Mailbox', categoryId: 'c-acc' },
    { id: 'i4', name: 'VPN access', description: null, categoryId: null },
  ];

  test('a category lists its items in the server order', () => {
    assert.deepEqual(filterCatalogItems(ITEMS, 'c-hw', '').map((i) => i.id), ['i1', 'i2']);
  });

  test('search: the trimmed text, ignoring case, in the name or the description, across every category', () => {
    assert.deepEqual(filterCatalogItems(ITEMS, null, '  laptop ').map((i) => i.id), ['i1', 'i2']);
    assert.deepEqual(filterCatalogItems(ITEMS, null, 'MAILBOX').map((i) => i.id), ['i3']);
    assert.deepEqual(filterCatalogItems(ITEMS, null, 'zzz'), []);
  });

  test('search inside an open category stays in that category', () => {
    assert.deepEqual(filterCatalogItems(ITEMS, 'c-acc', 'laptop'), []);
    assert.deepEqual(filterCatalogItems(ITEMS, 'c-hw', 'monitor').map((i) => i.id), ['i2']);
  });

  test('an item with no category is reachable only by search', () => {
    assert.equal(filterCatalogItems(ITEMS, 'c-hw', '').some((i) => i.id === 'i4'), false);
    assert.deepEqual(filterCatalogItems(ITEMS, null, 'vpn').map((i) => i.id), ['i4']);
  });

  test('item counts come from the item list; "1 item" / "n items"', () => {
    assert.equal(categoryItemCount(ITEMS, 'c-hw'), 2);
    assert.equal(categoryItemCount(ITEMS, 'c-none'), 0);
    assert.equal(itemCountLabel(1), '1 item');
    assert.equal(itemCountLabel(0), '0 items');
    assert.equal(itemCountLabel(3), '3 items');
  });

  test('the request reference is "SR-<number>" (SCP:345)', () => {
    assert.equal(requestRef(42), 'SR-42');
  });
});

describe('catalogue: the requests (SCR-1, SCR-2, SCR-3)', () => {
  test('SCR-1 and SCR-2 are plain GETs with no parameters (the web sends none)', async () => {
    reply = { status: 200, body: [] };
    await listServiceCategories();
    await listServiceItems();
    assert.deepEqual(sent.map((r) => [r.method, r.url, r.params]), [
      ['get', '/service-catalog/categories', undefined],
      ['get', '/service-catalog/items', undefined],
    ]);
  });

  test('SCR-3 and SCR-6 encode the id as one path segment', async () => {
    reply = { status: 200, body: { id: 'x' } };
    await getServiceItem('a/b');
    await getServiceRequest('c d');
    assert.deepEqual(sent.map((r) => r.url), ['/service-catalog/items/a%2Fb', '/service-catalog/requests/c%20d']);
  });
});

// ══ 2. Who can send a request, and what is sent ═════════════

describe('submit: who may send a request (every role; the server needs only a signed-in user, SCRT:23)', () => {
  const BODY = { serviceItemId: 'item-1', formData: { fullName: 'Asha' }, notes: '' };

  for (const name of NAMES) {
    test(`${name}: sends exactly one POST with exactly the four kept keys (no priority)`, async () => {
      reply = { status: 201, body: { id: 'sr-1' } };
      await createServiceRequest(BODY, PERSONAS[name].role);
      assert.deepEqual(sent, [{ method: 'post', url: '/service-catalog/requests', params: undefined, data: BODY }]);
    });
  }

  forEachPersona(
    'may send a priority (the web: staff only, from Impact × Urgency)',
    { END_USER: false, AGENT: true, TRIAGE_AGENT: true, L2_MANAGER: true, ADMIN: true },
    (p) => serviceRequestProblem(p, { ...BODY, priority: 'HIGH' }) === null,
  );

  for (const name of STAFF) {
    test(`${name}: a priority is sent as chosen`, async () => {
      reply = { status: 201, body: { id: 'sr-1' } };
      await createServiceRequest({ ...BODY, priority: 'URGENT' }, PERSONAS[name].role);
      assert.deepEqual(sent[0].data, { ...BODY, priority: 'URGENT' });
    });
  }

  test('END_USER: a priority is refused with nothing sent (the web never sends one for END_USER)', async () => {
    const message = await refusedWithNothingSent(() => createServiceRequest({ ...BODY, priority: 'HIGH' }, 'END_USER'));
    assert.equal(message, "Your role can't set a request's priority.");
  });

  for (const name of NAMES) {
    test(`${name}: any key outside the four is refused with nothing sent (title, categoryId, teamId …)`, async () => {
      for (const extra of ['title', 'description', 'categoryId', 'teamId', 'assignedToId', 'impact', 'urgency', 'requesterId']) {
        await refusedWithNothingSent(() => createServiceRequest({ ...BODY, [extra]: 'x' }, PERSONAS[name].role));
      }
    });
  }

  test('an unknown role, a missing service and an invalid priority are refused with nothing sent', async () => {
    await refusedWithNothingSent(() => createServiceRequest(BODY, 'GUEST'));
    await refusedWithNothingSent(() => createServiceRequest({ ...BODY, serviceItemId: '' }, 'ADMIN'));
    await refusedWithNothingSent(() => createServiceRequest({ ...BODY, priority: 'CRITICAL' }, 'ADMIN'));
  });

  test('the write guard refuses exactly what the API layer refuses, as a device refusal', () => {
    for (const name of NAMES) {
      const role = PERSONAS[name].role;
      assert.doesNotThrow(() => assertServiceRequest(role, BODY));
      let error = null;
      try {
        assertServiceRequest(role, { ...BODY, title: 'x' });
      } catch (e) {
        error = e;
      }
      assert.ok(wasRefusedOnDevice(error), `${name}: an extra key is a device refusal`);
    }
    assert.throws(() => assertServiceRequest('END_USER', { ...BODY, priority: 'LOW' }));
    assert.doesNotThrow(() => assertServiceRequest('L2_MANAGER', { ...BODY, priority: 'LOW' }));
  });

  test('a server error keeps its message (404 "Service item not found")', async () => {
    reply = { status: 404, body: { error: 'Service item not found' } };
    await assert.rejects(createServiceRequest(BODY, 'END_USER'), (e) => e instanceof ApiClientError && e.status === 404 && e.message === 'Service item not found');
  });
});

describe('submit: the body the form builds (SRF:142-155 minus what SCC:26-31 drops)', () => {
  const { fields } = normaliseFormFields([
    { name: 'fullName', label: 'Full Name', required: true },
    { name: 'email', label: 'Email', type: 'email' },
  ]);

  test('exactly serviceItemId, formData, notes (+ priority when set): nothing the server would drop', () => {
    const body = buildServiceRequestBody({ serviceItemId: 'item-1', fields, values: { fullName: 'Asha', email: ' a@b.co ' }, notes: 'Thanks', priority: 'HIGH' });
    assert.deepEqual(body, { serviceItemId: 'item-1', formData: { fullName: 'Asha', email: 'a@b.co' }, notes: 'Thanks', priority: 'HIGH' });
  });

  test('blank notes are sent as "" (the web: `data.notes || ""`), not trimmed; no priority means the key is absent', () => {
    const blank = buildServiceRequestBody({ serviceItemId: 'item-1', fields, values: {}, notes: '', priority: null });
    assert.deepEqual(blank, { serviceItemId: 'item-1', formData: { fullName: '', email: '' }, notes: '' });
    assert.equal(buildServiceRequestBody({ serviceItemId: 'i', fields, values: {}, notes: '  x  ', priority: null }).notes, '  x  ');
  });

  test('the success message is the web toast (SRF:169), including " — pending approval"', () => {
    assert.equal(submittedMessage({ requiresApproval: false }), 'Service request submitted');
    assert.equal(submittedMessage({ requiresApproval: true }), 'Service request submitted — pending approval');
  });
});

describe('submit: request properties, impact × urgency → priority (SRF:24-34, :107-122)', () => {
  test('the options and labels are the web form\'s (Urgency has no Urgent; MEDIUM reads "Normal")', () => {
    assert.deepEqual(REQUEST_IMPACT_OPTIONS.map((o) => [o.value, o.label]), [
      ['HIGH', 'Affects Business'], ['MEDIUM', 'Affects Department'], ['LOW', 'Affects Group'], ['MINIMAL', 'Affects User'],
    ]);
    assert.deepEqual(REQUEST_URGENCY_OPTIONS.map((o) => [o.value, o.label]), [['HIGH', 'High'], ['MEDIUM', 'Normal'], ['LOW', 'Low']]);
  });

  test('the web\'s hard-coded map, all 12 pairs', () => {
    const table = {
      HIGH: ['URGENT', 'HIGH', 'HIGH'],
      MEDIUM: ['HIGH', 'MEDIUM', 'MEDIUM'],
      LOW: ['MEDIUM', 'LOW', 'LOW'],
      MINIMAL: ['LOW', 'LOW', 'LOW'],
    };
    for (const [impact, row] of Object.entries(table)) {
      ['HIGH', 'MEDIUM', 'LOW'].forEach((urgency, i) => assert.equal(requestPriority(impact, urgency), row[i], `${impact} × ${urgency}`));
    }
  });

  test('one of the two missing: no priority (the server then stores MEDIUM)', () => {
    assert.equal(requestPriority('HIGH', null), null);
    assert.equal(requestPriority(null, 'LOW'), null);
    assert.equal(requestPriority(null, null), null);
  });

  test('sticky, as the web: clearing impact or urgency keeps the last computed priority', () => {
    let p = nextRequestPriority(null, 'HIGH', null);
    assert.equal(p, null);
    p = nextRequestPriority(p, 'HIGH', 'HIGH');
    assert.equal(p, 'URGENT');
    p = nextRequestPriority(p, null, 'HIGH');
    assert.equal(p, 'URGENT');
    p = nextRequestPriority(p, 'MINIMAL', 'HIGH');
    assert.equal(p, 'LOW');
  });

  test('the form sends the priority only where the permissions give request properties', () => {
    const src = read('src/screens/catalog/ServiceRequestFormScreen.tsx');
    assert.match(src, /priority: can\.requestProperties \? priority : null/);
    assert.match(src, /\{can\.requestProperties \? \(/);
  });
});

// ══ 3. Whose requests appear in My Requests ═════════════════

describe('My Requests: as the web lists them (G5): every request for staff, END_USER their own', () => {
  const row = (id, requesterId) => ({ id, requesterId, requestNumber: 1 });
  // SCR-4 for staff returns everyone's requests (SCC:117) and the web lists them all under "My Requests" (SCP:44-48,
  // :333-352); for END_USER the server returns only theirs. The pages below hold everyone's, to prove END_USER's rule.
  const PAGES = [
    { data: NAMES.map((n, i) => row(`r${i}`, PERSONAS[n].id)).concat([row('rx', OTHER_USER)]) },
    { data: [row('r0', PERSONAS.END_USER.id), ...NAMES.map((n, i) => row(`s${i}`, PERSONAS[n].id))] },
  ];
  const EVERY_ROW = ['r0', 'r1', 'r2', 'r3', 'r4', 'rx', 's0', 's1', 's2', 's3', 's4'];

  forEachPersona(
    'rows shown, deduplicated, newest first as the server sent them',
    { END_USER: ['r0', 's0'], AGENT: EVERY_ROW, TRIAGE_AGENT: EVERY_ROW, L2_MANAGER: EVERY_ROW, ADMIN: EVERY_ROW },
    (p) => myServiceRequestRows(p, PAGES).map((r) => r.id),
  );

  test('a role the app does not know, or no session, sees only rows that are their own', () => {
    assert.deepEqual(myServiceRequestRows({ id: 'user-guest', role: 'GUEST' }, [{ data: [row('g1', 'user-guest'), row('g2', OTHER_USER)] }]).map((r) => r.id), ['g1']);
    assert.deepEqual(myServiceRequestRows(null, PAGES), []);
  });

  forEachPersona(
    'another person\'s request is never shown on the detail screen (SCR-6 answers any request to staff)',
    Object.fromEntries(NAMES.map((n) => [n, false])),
    (p) => isOwnServiceRequest(p, { requesterId: OTHER_USER }),
  );

  forEachPersona('their own request is shown on the detail screen', Object.fromEntries(NAMES.map((n) => [n, true])), (p) =>
    isOwnServiceRequest(p, { requesterId: p.id }),
  );

  test('no session, no request, malformed rows: nothing shown', () => {
    assert.equal(isOwnServiceRequest(null, { requesterId: 'x' }), false);
    assert.equal(isOwnServiceRequest(PERSONAS.ADMIN, null), false);
    assert.deepEqual(myServiceRequestRows(PERSONAS.ADMIN, [{ data: [null, { requesterId: PERSONAS.ADMIN.id }, { id: 5 }] }, {}]), []);
  });

  test('SCR-4: page and limit 50, never a status (the web sends none; an invalid one is a 500)', async () => {
    reply = { status: 200, body: { data: [], total: 0, page: 1, limit: 50 } };
    await listServiceRequests(1);
    await listServiceRequests(0);
    await listServiceRequests(2.7);
    await listServiceRequests(Number.NaN);
    assert.equal(SERVICE_REQUEST_PAGE_SIZE, 50);
    assert.deepEqual(sent.map((r) => [r.url, r.params]), [
      ['/service-catalog/requests', { page: 1, limit: 50 }],
      ['/service-catalog/requests', { page: 1, limit: 50 }],
      ['/service-catalog/requests', { page: 2, limit: 50 }],
      ['/service-catalog/requests', { page: 1, limit: 50 }],
    ]);
  });

  test('no page is read by itself: the next one loads only as the list scrolls (the web reads one page of 50)', () => {
    const hook = read('src/hooks/useServiceCatalog.ts');
    assert.doesNotMatch(hook, /useEffect|fetchNextPage\(/);
  });

  test('wiring: the hook keeps rows only through myServiceRequestRows, the detail only through isOwnServiceRequest', () => {
    assert.match(read('src/hooks/useServiceCatalog.ts'), /myServiceRequestRows\(viewer, query\.data\?\.pages \?\? \[\]\)/);
    const detail = read('src/screens/catalog/ServiceRequestDetailScreen.tsx');
    assert.match(detail, /const own = isOwnServiceRequest\(viewer, request\)/);
    assert.match(detail, /if \(!own\) \{/);
  });

  test('wiring: only the person\'s own rows are links to the detail (the web\'s rows are never links, SCP:344)', () => {
    const screen = read('src/screens/catalog/ServiceCatalogScreen.tsx');
    assert.match(screen, /canOpen=\{\(request\) => isOwnServiceRequest\(viewer, request\)\}/);
    assert.match(screen, /onPress=\{own \? \(\) => onOpen\(item\) : undefined\}/);
    assert.doesNotMatch(screen, /requester\??\.(displayName|email)/, 'no requester column, as on the web');
  });
});

// ══ 4. The dynamic form ═════════════════════════════════════

describe('form: field definitions (SRF:183-235)', () => {
  test('the seven types the web renders, each kept as itself', () => {
    assert.deepEqual([...SERVICE_FIELD_TYPES], ['text', 'textarea', 'date', 'phone', 'email', 'number', 'select']);
    for (const type of SERVICE_FIELD_TYPES) assert.equal(field({ type }).type, type);
  });

  test('anything else renders as a text box, as on the web (exact, case-sensitive match)', () => {
    for (const type of [undefined, null, '', 'Textarea', 'EMAIL', 'checkbox', 'radio', 'multiselect', 'file', 'time', 'url', 42]) {
      assert.equal(field({ type }).type, 'text', String(type));
    }
  });

  test('label: the definition\'s, else the name; required: any truthy value', () => {
    assert.equal(field({ label: 'Employee code' }).label, 'Employee code');
    assert.equal(normaliseFormFields([{ name: 'code' }]).fields[0].label, 'code');
    assert.equal(normaliseFormFields([{ name: 'code', label: '  ' }]).fields[0].label, 'code');
    assert.equal(field({ required: true }).required, true);
    assert.equal(field({ required: 'yes' }).required, true);
    assert.equal(field({ required: 1 }).required, true);
    assert.equal(field({ required: 0 }).required, false);
    assert.equal(field({}).required, false);
  });

  test('placeholders per type: phone defaults to "Enter phone number", date has none, select\'s empty entry "-- Select --"', () => {
    assert.equal(field({ type: 'text', placeholder: 'e.g. Asha' }).placeholder, 'e.g. Asha');
    assert.equal(field({ type: 'phone' }).placeholder, 'Enter phone number');
    assert.equal(field({ type: 'phone', placeholder: '+255…' }).placeholder, '+255…');
    assert.equal(field({ type: 'date', placeholder: 'ignored' }).placeholder, undefined);
    assert.equal(field({ type: 'select' }).emptyLabel, '-- Select --');
    assert.equal(field({ type: 'select', placeholder: 'Choose a site' }).emptyLabel, 'Choose a site');
    assert.equal(field({ type: 'number', placeholder: 5 }).placeholder, '5');
  });

  test('select options: strings, {value, label}, a numeric value as text, a missing value takes the label', () => {
    assert.deepEqual(normaliseOptions(['A', { value: 'b', label: 'Bee' }, { value: 3, label: 'Three' }, { label: 'Only label' }]), [
      { value: 'A', label: 'A' },
      { value: 'b', label: 'Bee' },
      { value: '3', label: 'Three' },
      { value: 'Only label', label: 'Only label' },
    ]);
  });

  test('select options the web crashes on or renders blank are skipped: null, numbers, booleans, empty and repeated values', () => {
    assert.deepEqual(normaliseOptions([null, 7, true, '', { value: '' }, 'A', 'A', { value: 'v' }]), [
      { value: 'A', label: 'A' },
      { value: 'v', label: 'v' },
    ]);
    assert.deepEqual(normaliseOptions('A,B'), []);
    assert.deepEqual(normaliseOptions({ a: 1 }), []);
    assert.deepEqual(field({ type: 'text', options: ['A'] }).options, [], 'options belong to selects only');
  });

  test('entries that cannot be shown are skipped and counted: not an object, no usable name, a repeated name', () => {
    const def = normaliseFormFields([
      null, 'text', ['a'], { label: 'No name' }, { name: '' }, { name: 5 }, { name: '.' }, { name: '__proto__' },
      { name: 'a.__proto__.b' }, { name: 'ok' }, { name: 'ok', label: 'Again' },
    ]);
    assert.deepEqual(def.fields.map((f) => f.name), ['ok']);
    assert.equal(def.skipped, 10);
  });

  test('formFields that is not an array: no fields (null, an object, a string — which crashes the web page)', () => {
    for (const raw of [null, undefined, {}, { length: 2 }, 'abc', 7]) assert.deepEqual(normaliseFormFields(raw), { fields: [], skipped: 0 });
  });

  test('no conditional logic: dependency keys are ignored, every field is shown and keeps its own rule', () => {
    const def = normaliseFormFields([
      { name: 'hasLaptop', label: 'Has laptop', type: 'select', options: ['Yes', 'No'] },
      { name: 'serial', label: 'Serial', required: true, showIf: { hasLaptop: 'Yes' }, dependsOn: 'hasLaptop', visibleWhen: 'x', min: 1, max: 9, pattern: '^\\d+$' },
    ]);
    assert.deepEqual(def.fields.map((f) => f.name), ['hasLaptop', 'serial']);
    assert.deepEqual(Object.keys(def.fields[1]).sort(), ['emptyLabel', 'label', 'name', 'options', 'placeholder', 'required', 'type']);
    // "No" chosen, yet Serial is still required, and no pattern applies to it.
    assert.deepEqual(formErrors(def.fields, { hasLaptop: 'No', serial: '' }), { serial: 'Serial is required' });
    assert.deepEqual(formErrors(def.fields, { hasLaptop: 'No', serial: 'abc' }), {});
  });

  test('every field starts empty and nothing is prefilled (SRF:87)', () => {
    const { fields } = normaliseFormFields([{ name: 'a' }, { name: 'b', type: 'select', options: ['X'] }, { name: 'c', type: 'date' }]);
    assert.deepEqual(initialFormValues(fields), { a: '', b: '', c: '' });
  });
});

describe('form: validation, per type (the web\'s `required` plus the browser\'s checks)', () => {
  test('required: "<label> is required" for an empty value only; spaces pass (react-hook-form), except in an e-mail', () => {
    for (const type of SERVICE_FIELD_TYPES) {
      assert.equal(fieldError(field({ type, required: true, options: ['A'] }), ''), 'Field is required', type);
    }
    for (const type of ['text', 'textarea', 'phone']) assert.equal(fieldError(field({ type, required: true }), '   '), null, type);
    assert.equal(fieldError(field({ type: 'email', required: true }), '   '), 'Field is required', 'the browser trims an e-mail first');
  });

  test('not required: empty passes for every type', () => {
    for (const type of SERVICE_FIELD_TYPES) assert.equal(fieldError(field({ type, options: ['A'] }), ''), null, type);
  });

  test('text, textarea and phone have no format rule (no pattern, no length)', () => {
    assert.equal(fieldError(field({ type: 'phone' }), 'call me maybe'), null);
    assert.equal(fieldError(field({ type: 'text' }), 'x'.repeat(5000)), null);
    assert.equal(fieldError(field({ type: 'textarea' }), 'line 1\nline 2'), null);
  });

  test('email: the HTML "valid e-mail address", after trimming', () => {
    const f = field({ type: 'email' });
    for (const ok of ['name@example.com', 'a@b', "o'reilly+tag@mail.co.tz", ' asha@mmg.co.tz ']) assert.equal(fieldError(f, ok), null, ok);
    for (const bad of ['abc', 'a@', '@b.com', 'a b@c.com', 'a@b..com', 'a@-b.com', 'a@b_c.com']) assert.equal(fieldError(f, bad), EMAIL_FORMAT_MESSAGE, bad);
  });

  test('number: a valid number and a whole one (no step on the web input, so 1); no minimum or maximum', () => {
    const f = field({ type: 'number' });
    for (const ok of ['42', '-3', '0', '007', '1e3', ' 12 ', '99999999']) assert.equal(fieldError(f, ok), null, ok);
    for (const bad of ['1.5', '.5', '-0.25']) assert.equal(fieldError(f, bad), WHOLE_NUMBER_MESSAGE, bad);
    for (const bad of ['abc', '1,000', '+1', '1.', '--1', '1e', '1e400', '12abc']) assert.equal(fieldError(f, bad), NUMBER_FORMAT_MESSAGE, bad);
  });

  test('date: a real calendar day as YYYY-MM-DD, any year', () => {
    const f = field({ type: 'date' });
    for (const ok of ['2026-10-22', '2024-02-29', '1965-07-01', '0099-01-31']) assert.equal(fieldError(f, ok), null, ok);
    for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '22/10/2026', '2026-1-5', '0000-01-01']) assert.equal(fieldError(f, bad), DATE_FORMAT_MESSAGE, bad);
    assert.equal(isRealDay('2100-02-29'), false);
    assert.equal(localDateFromDay('1965-07-01')?.getFullYear(), 1965);
    assert.equal(localDateFromDay('0099-01-31')?.getFullYear(), 99);
    assert.equal(localDateFromDay('nope'), null);
  });

  test('select: "" is the empty entry; a value must be one of the options', () => {
    const f = field({ type: 'select', required: true, options: ['Dar', { value: 'aru', label: 'Arusha' }] });
    assert.equal(fieldError(f, ''), 'Field is required');
    assert.equal(fieldError(f, 'Dar'), null);
    assert.equal(fieldError(f, 'aru'), null);
    assert.equal(fieldError(f, 'Arusha'), OPTION_MESSAGE, 'the label is not the value');
  });

  test('the browser\'s check wins over `required`, as on the web (it blocks before react-hook-form runs)', () => {
    assert.equal(fieldError(field({ type: 'email', required: true }), 'nope'), EMAIL_FORMAT_MESSAGE);
    assert.equal(fieldError(field({ type: 'number', required: true }), 'x'), NUMBER_FORMAT_MESSAGE);
  });

  test('formErrors lists every failing field, in the form\'s order, with nothing for valid ones', () => {
    const { fields } = normaliseFormFields([
      { name: 'b', label: 'B', required: true },
      { name: 'a', label: 'A', type: 'email' },
      { name: 'c', label: 'C', type: 'number', required: true },
    ]);
    const errors = formErrors(fields, { b: '', a: 'bad', c: '2' });
    assert.deepEqual(Object.entries(errors), [['b', 'B is required'], ['a', EMAIL_FORMAT_MESSAGE]]);
    assert.deepEqual(formErrors(fields, { b: 'x', a: '', c: '1' }), {});
  });
});

describe('form: the formData sent (react-hook-form\'s values, as the web submits them)', () => {
  test('every field is sent, untouched ones as ""; every value is a string (numbers too)', () => {
    const { fields } = normaliseFormFields([
      { name: 'name' }, { name: 'age', type: 'number' }, { name: 'start', type: 'date' }, { name: 'site', type: 'select', options: ['A'] },
    ]);
    assert.deepEqual(buildFormData(fields, { age: '42' }), { name: '', age: '42', start: '', site: '' });
  });

  test('the browser\'s value cleaning: e-mail trimmed, single-line breaks dropped, textarea line breaks as \\n', () => {
    assert.equal(submittedValue({ type: 'email' }, '  a@b.c \n'), 'a@b.c');
    assert.equal(submittedValue({ type: 'text' }, 'a\r\nb'), 'ab');
    assert.equal(submittedValue({ type: 'phone' }, ' +255 1\n2 '), ' +255 12 ');
    assert.equal(submittedValue({ type: 'textarea' }, 'a\r\nb\rc'), 'a\nb\nc');
    assert.equal(submittedValue({ type: 'number' }, ' 7 '), '7');
    assert.equal(submittedValue({ type: 'text' }, undefined), '');
  });

  test('names with dots or brackets nest as react-hook-form does (SRF:184 registers `formData.<name>`)', () => {
    assert.deepEqual(rhfPath('formData.employee.code'), ['formData', 'employee', 'code']);
    assert.deepEqual(rhfPath('formData.list[0]'), ['formData', 'list', '0']);
    assert.deepEqual(rhfPath('plain'), ['plain']);
    const { fields } = normaliseFormFields([{ name: 'employee.code' }, { name: 'employee.name' }, { name: 'list[0]' }, { name: 'Full Name' }]);
    assert.deepEqual(buildFormData(fields, { 'employee.code': 'E1', 'employee.name': 'Asha', 'list[0]': 'x', 'Full Name': 'A B' }), {
      employee: { code: 'E1', name: 'Asha' },
      list: ['x'],
      'Full Name': 'A B',
    });
  });

  test('a prototype key can never be written', () => {
    const fields = [{ name: 'a.__proto__.polluted', label: 'x', type: 'text', required: false, placeholder: undefined, emptyLabel: '', options: [] }];
    const out = buildFormData(fields, { 'a.__proto__.polluted': 'yes' });
    assert.deepEqual(out, {});
    assert.equal({}.polluted, undefined);
  });
});

describe('form: a request\'s answers on its detail screen (mobile only)', () => {
  test('labelled and ordered by the item\'s fields, a select shows its label, other keys by path', () => {
    const { fields } = normaliseFormFields([
      { name: 'site', label: 'Site', type: 'select', options: [{ value: 'dar', label: 'Dar es Salaam' }] },
      { name: 'employee.code', label: 'Employee code' },
    ]);
    const rows = answerRows({ extra: 3, employee: { code: 'E9' }, site: 'dar', blank: ' ', nested: { x: [true] } }, fields);
    assert.deepEqual(rows.map((r) => [r.label, r.value]), [
      ['Site', 'Dar es Salaam'],
      ['Employee code', 'E9'],
      ['extra', '3'],
      ['blank', '—'],
      ['nested.x[0]', 'true'],
    ]);
    assert.deepEqual(answerRows(null, fields), []);
    assert.deepEqual(answerRows('text', []), []);
  });
});

// ══ 5. Wiring: the screens follow the web and these rules ═══

describe('wiring: the form follows the web', () => {
  const form = read('src/screens/catalog/ServiceRequestFormScreen.tsx');
  const input = read('src/screens/catalog/ServiceFormFieldInput.tsx');
  const hook = read('src/hooks/useServiceCatalog.ts');

  test('no attachments (never uploaded on the web, 05 §B.24) and no confirmation (the web asks nothing)', () => {
    assert.doesNotMatch(form, /AttachmentPicker|uploadAttachments|confirmAction\(/);
  });

  test('the body comes from buildServiceRequestBody, never from fields the server drops', () => {
    assert.match(form, /buildServiceRequestBody\(\{/);
    assert.doesNotMatch(form, /\b(title|subject|categoryId|teamId|assignedToId|requesterId|impact|urgency):\s/);
  });

  test('after sending: the web\'s toast, then back to the catalogue\'s Home view', () => {
    assert.match(form, /notify\(submittedMessage\(item\)\)/);
    assert.match(form, /popTo\('ServiceCatalog', \{ view: 'catalog', resetAt: Date\.now\(\) \}\)/);
  });

  test('validation runs before sending, and the hook guards before the API call', () => {
    assert.match(form, /if \(Object\.keys\(formErrors\(form\.fields, values\)\)\.length > 0\) return;/);
    const guard = hook.indexOf('assertServiceRequest(requesterRole, body)');
    const call = hook.indexOf('createServiceRequest(body, requesterRole)');
    assert.ok(guard > 0 && call > 0 && guard < call, 'guard first');
  });

  test('the field control handles each of the seven types; anything else falls to the text box', () => {
    for (const branch of ["case 'select'", "case 'date'", "case 'textarea'"]) assert.ok(input.includes(branch), branch);
    assert.match(input, /phone: 'phone-pad'/);
    assert.match(input, /email: 'email-address'/);
    assert.match(input, /number: 'numbers-and-punctuation'/);
    assert.match(input, /default:\s*\n\s*\/\/ text, phone, email, number/);
  });

  test('an inactive item cannot be requested (01 SCR-3)', () => {
    assert.match(form, /item\.isActive === false \?/);
  });
});
