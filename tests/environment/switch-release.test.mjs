// The runtime environment switch (2026-11-17), as a RELEASE build runs it: Production by default on a fresh install,
// the choice kept across a restart, and a switch that removes the device token from the OLD environment first, then
// signs out and clears the session, the 15-day clock, SecureStore, the query cache and the filter state.
// Since 2026-11-18 a switch away from Production is for a signed-in ADMIN only (permissions.ts canSwitchEnvironment; the
// password gate is removed): each switch to UAT below is made by an ADMIN who signed in on Production first. Who sees
// the switch, the approved layout, and that any role may still USE UAT: tests/environment/admin-switch.test.mjs.
//
// This file runs as a release build: __DEV__ is set to false BEFORE the app's modules load (dynamic imports below), and
// node --test runs every test file in its own process, so no other file sees it. The development build's side (UAT only,
// PROD refused) is tests/environment/dev-build.test.mjs.
// What is real: env.ts, the environment, auth, ui and saved-filter stores, the API client and its interceptors, the
// query client, push registration's NTF-6 call and switchEnvironment(). Faked: the network (axios adapter) and the
// phone's Keystore (tests/support/stubs/expo-secure-store.mjs). Nothing calls a real server.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { AxiosHeaders } from 'axios';
import * as secureStore from 'expo-secure-store';

globalThis.__DEV__ = false;

const env = await import('../../src/config/env.ts');
const { ENVIRONMENT_KEY, activeEnvironment, apiBaseUrl, useEnvironmentStore } = await import('../../src/store/environment.store.ts');
const { useAuthStore } = await import('../../src/store/auth.store.ts');
const { useUiStore } = await import('../../src/store/ui.store.ts');
const { usePushStore } = await import('../../src/store/push.store.ts');
const { queryClient } = await import('../../src/api/queryClient.ts');
const { apiClient } = await import('../../src/api/client.ts');
const { ApiClientError } = await import('../../src/api/errors.ts');
const { getAttachmentViewRequest } = await import('../../src/api/attachments.api.ts');
const { switchEnvironment } = await import('../../src/api/environmentSwitch.ts');
const { DEFAULT_DASHBOARD_PERIOD } = await import('../../src/utils/dashboard-period.ts');
const { NO_ADVANCED_FILTERS } = await import('../../src/utils/ticket-filters.ts');

const PROD_URL = 'https://servicedesk.mountmerugroup.com/api/v1';
const UAT_URL = 'https://uat-servicedesk.mountmerugroup.com/api/v1';
const SESSION_KEYS = ['mmg.session.token', 'mmg.session.issuedAt', 'mmg.session.user', 'mmg.session.environment'];
const FULL_AUTH_KEY = 'mmg.auth.fullAuthAt';
const USER = { id: 'user-admin', email: 'admin@example.test', displayName: 'Admin', role: 'ADMIN', countryId: null };
const FCM_TOKEN = 'fcm-token-SWITCH';

/** An ADMIN signs in on the environment in use and switches to `next`: the only way off Production since 2026-11-18. */
async function adminSwitch(next) {
  await useAuthStore.getState().setSession({ token: `session-${activeEnvironment()}`, user: USER, fullAuthAt: Date.now() });
  await switchEnvironment(next);
}

// ── The network: every request is recorded with the environment and session at the moment it was sent ──
const sent = [];
apiClient.defaults.adapter = (config) => {
  sent.push({
    method: config.method,
    base: config.baseURL,
    url: config.url,
    auth: config.headers?.Authorization,
    environmentInUse: activeEnvironment(),
    signedIn: useAuthStore.getState().isAuthenticated,
  });
  return Promise.resolve({
    status: 200,
    statusText: '200',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify({ message: 'ok' }),
    config,
    request: {},
  });
};

/** A fresh install: nothing on the phone, nothing in memory. */
async function freshInstall() {
  secureStore.__reset();
  useEnvironmentStore.setState({ environment: env.DEFAULT_ENVIRONMENT, restored: false });
  useAuthStore.setState({ user: null, token: null, issuedAt: null, environment: null, fullAuthAt: null, isAuthenticated: false, isLoading: true, signOutMessage: null });
  usePushStore.getState().reset();
  useUiStore.getState().reset();
  queryClient.clear();
  await useEnvironmentStore.getState().restoreEnvironment();
}

beforeEach(async () => {
  sent.length = 0;
  await freshInstall();
});

describe('a release build: Production on a fresh install, the choice kept until changed', () => {
  test('a fresh install is on Production, and every request goes there', async () => {
    assert.equal(env.DEFAULT_ENVIRONMENT, 'PROD');
    assert.equal(activeEnvironment(), 'PROD');
    assert.equal(apiBaseUrl(), PROD_URL);
    assert.equal(secureStore.__snapshot()[ENVIRONMENT_KEY], undefined, 'nothing is written until the person switches');
    await apiClient.get('/health-check-free-path', { skipAuth: true });
    assert.equal(sent[0].base, PROD_URL);
  });

  test('a stored value that is missing, unknown or unreadable is Production again', async () => {
    for (const stored of [null, 'QA', 'prod', '']) {
      secureStore.__reset();
      if (stored !== null) await secureStore.setItemAsync(ENVIRONMENT_KEY, stored);
      useEnvironmentStore.setState({ environment: 'UAT', restored: false });
      await useEnvironmentStore.getState().restoreEnvironment();
      assert.equal(activeEnvironment(), 'PROD', String(stored));
    }
    secureStore.__reset();
    await secureStore.setItemAsync(ENVIRONMENT_KEY, 'UAT');
    secureStore.__failReadsOn(ENVIRONMENT_KEY);
    await useEnvironmentStore.getState().restoreEnvironment();
    assert.equal(activeEnvironment(), 'PROD', 'an unreadable Keystore is a fresh install');
  });

  test('the environment persists across a restart: switched to UAT, a cold start is still on UAT', async () => {
    await adminSwitch('UAT');
    assert.equal(secureStore.__snapshot()[ENVIRONMENT_KEY], 'UAT');
    // A second, fresh copy of the store module: what a cold start loads. Same Keystore.
    const restarted = await import(`../../src/store/environment.store.ts?restart=${Date.now()}`);
    assert.equal(restarted.useEnvironmentStore.getState().environment, 'PROD', 'before the stored choice is read');
    await restarted.useEnvironmentStore.getState().restoreEnvironment();
    assert.equal(restarted.useEnvironmentStore.getState().environment, 'UAT');
    assert.equal(restarted.apiBaseUrl(), UAT_URL);
  });

  test('…and it changes only when the person switches back: then Production is kept', async () => {
    await adminSwitch('UAT');
    await switchEnvironment('PROD');
    assert.equal(secureStore.__snapshot()[ENVIRONMENT_KEY], 'PROD');
    useEnvironmentStore.setState({ environment: 'UAT', restored: false });
    await useEnvironmentStore.getState().restoreEnvironment();
    assert.equal(activeEnvironment(), 'PROD');
  });

  test('a sign-out does not reset it: only switchEnvironment() changes it', async () => {
    await adminSwitch('UAT');
    await useAuthStore.getState().clearSession(null, { forgetFullAuth: true });
    assert.equal(secureStore.__snapshot()[ENVIRONMENT_KEY], 'UAT');
    assert.equal(activeEnvironment(), 'UAT');
  });
});

describe('switching: the old environment is left completely before the new one is stored', () => {
  /** Signed in on Production, push registered, a ticket list cached, filters and a Home period set. */
  async function busyOnProduction() {
    await useAuthStore.getState().setSession({ token: 'prod-session-token', user: USER, fullAuthAt: Date.now() });
    usePushStore.getState().setToken(FCM_TOKEN);
    usePushStore.getState().setStatus('on');
    queryClient.setQueryData(['tickets', 'list', 'prod'], { data: [{ id: 'prod-ticket' }] });
    queryClient.setQueryData(['lookups', 'categories'], [{ id: 'prod-category' }]);
    const ui = useUiStore.getState();
    // A Home tile first (it clears the rest), then everything else on top of it.
    ui.openTicketList('ACTIVE_KPI', { label: 'This month', fromDate: '2026-11-01', toDate: '2026-11-30' });
    ui.setTicketAdvanced({ priority: 'HIGH', category: { id: 'prod-category', name: 'Network' } });
    ui.setTicketSearchText('vpn');
    ui.setTicketSearch('vpn');
    ui.setTicketSort('PRIORITY');
    ui.setTicketCountryId('country-tz');
    ui.setHomePeriod('custom');
    ui.setHomeCustomRange({ from: '2026-11-01' });
    assert.equal(useUiStore.getState().ticketPeriod?.label, 'This month');
    assert.equal(useAuthStore.getState().environment, 'PROD');
  }

  test('1. NTF-6 deletes the device token from PRODUCTION, while its session is still valid, before anything else', async () => {
    await busyOnProduction();
    await switchEnvironment('UAT');
    const ntf6 = sent.findIndex((r) => r.method === 'delete' && r.url === '/notifications/device-token');
    assert.equal(ntf6, 0, 'the first request');
    assert.deepEqual(
      { base: sent[0].base, auth: sent[0].auth, environmentInUse: sent[0].environmentInUse, signedIn: sent[0].signedIn },
      { base: PROD_URL, auth: 'Bearer prod-session-token', environmentInUse: 'PROD', signedIn: true },
    );
    // Then AUTH-3, still on Production with the Production session, as an explicit sign-out does.
    assert.deepEqual(
      sent.slice(1).map((r) => [r.method, r.url, r.base, r.auth]),
      [['post', '/auth/logout', PROD_URL, 'Bearer prod-session-token']],
    );
    assert.ok(sent.every((r) => r.base === PROD_URL), 'nothing reached UAT with the Production token');
  });

  test('2–5. session, 15-day clock and SecureStore session keys gone; query cache empty; filters and period reset; UAT stored', async () => {
    await busyOnProduction();
    await switchEnvironment('UAT');

    const auth = useAuthStore.getState();
    assert.deepEqual(
      { token: auth.token, user: auth.user, environment: auth.environment, isAuthenticated: auth.isAuthenticated, fullAuthAt: auth.fullAuthAt },
      { token: null, user: null, environment: null, isAuthenticated: false, fullAuthAt: null },
    );
    const stored = secureStore.__snapshot();
    for (const key of [...SESSION_KEYS, FULL_AUTH_KEY]) assert.equal(stored[key], undefined, key);
    assert.deepEqual(Object.keys(stored), [ENVIRONMENT_KEY], 'only the new choice is left on the phone');
    assert.equal(stored[ENVIRONMENT_KEY], 'UAT');

    assert.equal(queryClient.getQueryCache().getAll().length, 0, 'no Production list can show under UAT');

    const ui = useUiStore.getState();
    assert.deepEqual(
      {
        filter: ui.ticketFilter, sort: ui.ticketSort, advanced: ui.ticketAdvanced, searchText: ui.ticketSearchText,
        search: ui.ticketSearch, country: ui.ticketCountryId, period: ui.ticketPeriod, home: ui.homePeriod,
      },
      {
        filter: 'ALL', sort: 'UPDATED', advanced: NO_ADVANCED_FILTERS, searchText: '', search: undefined, country: null,
        period: null, home: DEFAULT_DASHBOARD_PERIOD,
      },
    );
    assert.equal(activeEnvironment(), 'UAT');
    assert.equal(apiBaseUrl(), UAT_URL);
  });

  test('the new environment is stored only after the old one is left (never while its session is alive)', async () => {
    await busyOnProduction();
    const seen = [];
    const stop = useEnvironmentStore.subscribe((s) => seen.push({ env: s.environment, signedIn: useAuthStore.getState().isAuthenticated, cached: queryClient.getQueryCache().getAll().length }));
    await switchEnvironment('UAT');
    stop();
    assert.deepEqual(seen, [{ env: 'UAT', signedIn: false, cached: 0 }]);
  });

  test('from Login on UAT, "Use Production" (already signed out, push already forgotten): nothing is sent, the rest still runs', async () => {
    await adminSwitch('UAT');
    await useAuthStore.getState().setSession({ token: 't', user: USER, fullAuthAt: Date.now() });
    await useAuthStore.getState().clearSession(null);
    assert.ok(secureStore.__snapshot()[FULL_AUTH_KEY], 'an ordinary sign-out keeps the 15-day date');
    queryClient.setQueryData(['auth', 'config'], { ok: true });
    useUiStore.getState().setTicketFilter('CLOSED');
    sent.length = 0;
    await switchEnvironment('PROD');
    assert.deepEqual(sent, []);
    assert.equal(secureStore.__snapshot()[FULL_AUTH_KEY], undefined, 'the switch clears the 15-day clock too');
    assert.equal(queryClient.getQueryCache().getAll().length, 0);
    assert.equal(useUiStore.getState().ticketFilter, 'ALL');
    assert.equal(activeEnvironment(), 'PROD');
  });

  test('switching to the environment already in use changes nothing', async () => {
    await busyOnProduction();
    await switchEnvironment('PROD');
    assert.deepEqual(sent, []);
    assert.equal(useAuthStore.getState().isAuthenticated, true);
  });
});

describe('a token never crosses environments', () => {
  test('a Production session is never sent to UAT: the request is refused and that session ended', async () => {
    await useAuthStore.getState().setSession({ token: 'prod-session-token', user: USER });
    // An interrupted switch, simulated: the environment moved while the Production session stayed in memory.
    useEnvironmentStore.setState({ environment: 'UAT' });
    await assert.rejects(apiClient.get('/tickets'), (error) => error instanceof ApiClientError && error.status === 401);
    assert.deepEqual(sent, [], 'nothing left the phone');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(useAuthStore.getState().isAuthenticated, false);
  });

  test('…nor the reverse: a UAT session never reaches Production', async () => {
    useEnvironmentStore.setState({ environment: 'UAT' });
    await useAuthStore.getState().setSession({ token: 'uat-session-token', user: USER });
    assert.equal(useAuthStore.getState().environment, 'UAT');
    useEnvironmentStore.setState({ environment: 'PROD' });
    await assert.rejects(apiClient.get('/tickets'));
    assert.deepEqual(sent, []);
  });

  test('attachment views (outside the API client) carry no header from another environment', async () => {
    await useAuthStore.getState().setSession({ token: 'prod-session-token', user: USER });
    assert.deepEqual(getAttachmentViewRequest('t1', 'a1').headers, { Authorization: 'Bearer prod-session-token' });
    useEnvironmentStore.setState({ environment: 'UAT' });
    const request = getAttachmentViewRequest('t1', 'a1');
    assert.equal(request.uri, `${UAT_URL}/tickets/t1/attachments/a1/view`);
    assert.deepEqual(request.headers, {});
  });

  test('a cold start drops a stored session from the other environment, and an untagged one (from before the switch)', async () => {
    await useAuthStore.getState().setSession({ token: 'prod-session-token', user: USER, fullAuthAt: Date.now() });
    // The phone restarts on UAT (as if the environment had been written and the app died before the sign-out).
    await secureStore.setItemAsync(ENVIRONMENT_KEY, 'UAT');
    useEnvironmentStore.setState({ restored: false });
    useAuthStore.setState({ token: null, user: null, environment: null, isAuthenticated: false, isLoading: true });
    await useAuthStore.getState().restoreSession();
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    for (const key of SESSION_KEYS) assert.equal(secureStore.__snapshot()[key], undefined, key);

    // A session stored by a build from before 2026-11-17 names no environment: it cannot be placed, so it is dropped.
    await freshInstall();
    await secureStore.setItemAsync('mmg.session.token', 'old-build-token');
    await secureStore.setItemAsync('mmg.session.issuedAt', String(Date.now()));
    await secureStore.setItemAsync('mmg.session.user', JSON.stringify(USER));
    await secureStore.setItemAsync(FULL_AUTH_KEY, String(Date.now()));
    await useAuthStore.getState().restoreSession();
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(secureStore.__snapshot()['mmg.session.token'], undefined);
  });

  test('a session of the environment in use comes back after a restart, as before', async () => {
    await useAuthStore.getState().setSession({ token: 'prod-session-token', user: USER, fullAuthAt: Date.now() });
    useAuthStore.setState({ token: null, user: null, environment: null, isAuthenticated: false, isLoading: true });
    await useAuthStore.getState().restoreSession();
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(useAuthStore.getState().environment, 'PROD');
  });
});
