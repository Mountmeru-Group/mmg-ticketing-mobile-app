// Saved ticket filters (2026-11-17, Ronit's decision): on the phone only, scoped to the signed-in user AND the
// environment, at most 20 each, and never holding a filter the role cannot send.
// What is real: src/utils/saved-filters.ts, src/store/savedFilters.store.ts, ui.store's apply, ticketListFilters()
// (utils/permissions.ts) and ticketListQuery(). Faked: the phone's Keystore (tests/support/stubs/expo-secure-store.mjs).
// No network at all: a saved filter never syncs and no backend call is made (checked below).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as secureStore from 'expo-secure-store';

import { useSavedFiltersStore } from '../../src/store/savedFilters.store.ts';
import { useUiStore } from '../../src/store/ui.store.ts';
import { ticketListFilters } from '../../src/utils/permissions.ts';
import {
  SAVED_FILTER_LIMIT, SAVED_FILTER_NAME_MAX, SavedFilterError, captureSavedFilter, parseSavedFilters, sameSavedFilterContent,
  sanitizeSavedFilter, savedFilterChips, savedFilterNameProblem, savedFiltersKey,
} from '../../src/utils/saved-filters.ts';
import { NO_ADVANCED_FILTERS, ticketListQuery } from '../../src/utils/ticket-filters.ts';
import { PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const UAT = (user) => ({ environment: 'UAT', userId: user.id });
const PROD = (user) => ({ environment: 'PROD', userId: user.id });

/** Everything the list can hold at once, including what only ADMIN and AGENT may send (technician, group, country). */
const EVERYTHING = {
  ticketFilter: 'OPEN',
  ticketSort: 'PRIORITY',
  ticketSearch: 'vpn',
  ticketCountryId: 'country-ke',
  countryName: 'Kenya',
  ticketAdvanced: {
    priority: 'HIGH',
    category: { id: 'cat-network', name: 'Network' },
    fromDate: '2026-11-01',
    toDate: '2026-11-30',
    technician: { id: 'tech-1', name: 'Jane Tech' },
    group: { id: 'team-1', name: 'Service Desk' },
  },
};
const store = () => useSavedFiltersStore.getState();

beforeEach(() => {
  secureStore.__reset();
  store().reset();
  useUiStore.getState().reset();
});

describe('scope: the signed-in user AND the environment', () => {
  test('a saved filter made on UAT is not offered on production', async () => {
    const admin = PERSONAS.ADMIN;
    await store().save(admin, UAT(admin), 'UAT network', captureSavedFilter(EVERYTHING, admin));
    assert.deepEqual(store().items.map((f) => f.name), ['UAT network']);

    await store().load(admin, PROD(admin));
    assert.deepEqual(store().items, [], 'production: nothing offered');
    assert.deepEqual(store().scope, PROD(admin));

    await store().load(admin, UAT(admin));
    assert.deepEqual(store().items.map((f) => f.name), ['UAT network'], 'still on the phone for UAT');
  });

  test('each user and environment has its own storage key, and every entry names both', async () => {
    const admin = PERSONAS.ADMIN;
    await store().save(admin, UAT(admin), 'Mine', captureSavedFilter(EVERYTHING, admin));
    assert.deepEqual(Object.keys(secureStore.__snapshot()), [`mmg.savedFilters.UAT.${admin.id}`]);
    const [entry] = JSON.parse(secureStore.__snapshot()[`mmg.savedFilters.UAT.${admin.id}`]);
    assert.equal(entry.environment, 'UAT');
    assert.equal(entry.userId, admin.id);
    assert.notEqual(savedFiltersKey(UAT(admin)), savedFiltersKey(PROD(admin)));
  });

  test('an entry that names another environment or user is never offered, even under this key', () => {
    const admin = PERSONAS.ADMIN;
    const content = captureSavedFilter(EVERYTHING, admin);
    const raw = JSON.stringify([
      { id: 'a', name: 'From UAT', environment: 'UAT', userId: admin.id, createdAt: 1, ...content },
      { id: 'b', name: 'Someone else', environment: 'PROD', userId: 'user-other', createdAt: 1, ...content },
      { id: 'c', name: 'Mine', environment: 'PROD', userId: admin.id, createdAt: 1, ...content },
    ]);
    const { items, changed } = parseSavedFilters(raw, PROD(admin), admin);
    assert.deepEqual(items.map((f) => f.name), ['Mine']);
    assert.equal(changed, true, 'the cleaned list is written back');
  });

  test('a saved filter made by one user is not offered to another on the same phone', async () => {
    const admin = PERSONAS.ADMIN;
    const agent = PERSONAS.AGENT;
    await store().save(admin, UAT(admin), 'Admin only', captureSavedFilter(EVERYTHING, admin));
    await store().load(agent, UAT(agent));
    assert.deepEqual(store().items, []);
    // Nor can anyone write into another person's list.
    await assert.rejects(store().save(agent, UAT(admin), 'Sneaky', captureSavedFilter(EVERYTHING, agent)), SavedFilterError);
    await store().load(admin, UAT(admin));
    assert.deepEqual(store().items.map((f) => f.name), ['Admin only']);
  });

  test('they survive a restart and a sign-out (only the copy in memory is reset)', async () => {
    const agent = PERSONAS.TRIAGE_AGENT;
    await store().save(agent, UAT(agent), 'Kept', captureSavedFilter(EVERYTHING, agent));
    store().reset();
    assert.deepEqual(store().items, []);
    const restarted = await import(`../../src/store/savedFilters.store.ts?restart=${Date.now()}`);
    await restarted.useSavedFiltersStore.getState().load(agent, UAT(agent));
    assert.deepEqual(restarted.useSavedFiltersStore.getState().items.map((f) => f.name), ['Kept']);
  });
});

describe('role: a saved filter never carries a filter its role cannot send (ticketListFilters, permissions.ts)', () => {
  for (const [name, persona] of Object.entries(PERSONAS)) {
    test(`${name}: only the filters the Filters sheet offers this role, plus quick filter, search, sort and its country rule`, async () => {
      const saved = await store().save(persona, UAT(persona), `${name} set`, captureSavedFilter(EVERYTHING, persona));
      const allowed = ticketListFilters(persona);
      const a = saved.advanced;
      assert.equal(a.priority !== null, allowed.includes('priority'));
      assert.equal(a.category !== null, allowed.includes('category'));
      assert.equal(a.fromDate !== null && a.toDate !== null, allowed.includes('date'));
      assert.equal(a.technician !== null, allowed.includes('technician'), 'technician');
      assert.equal(a.group !== null, allowed.includes('group'), 'group');
      assert.equal(saved.filter, 'OPEN');
      assert.equal(saved.search, 'vpn');
      assert.equal(saved.sort, 'PRIORITY');
      // The country only for the roles that switch it (ADMIN, triage AGENT); left alone for everyone else.
      const switches = persona.role === 'ADMIN' || (persona.role === 'AGENT' && !persona.countryId);
      assert.deepEqual(saved.country, switches ? { id: 'country-ke', name: 'Kenya' } : null);
      // What the phone holds is the same cut-down set.
      const stored = JSON.parse(secureStore.__snapshot()[`mmg.savedFilters.UAT.${persona.id}`])[0];
      assert.deepEqual(stored.advanced, a);
    });
  }

  test('END_USER and L2_MANAGER: no technician and no group, on save, on read, and on apply', async () => {
    for (const persona of [PERSONAS.END_USER, PERSONAS.L2_MANAGER]) {
      store().reset();
      // A list written while the person still had a staff role (or edited by hand): it holds a technician and a group.
      const admin = { ...persona, role: 'ADMIN' };
      await store().save(admin, UAT(persona), 'Old staff filter', captureSavedFilter(EVERYTHING, admin));
      assert.equal(store().items[0].advanced.technician.id, 'tech-1');
      store().reset();

      await store().load(persona, UAT(persona));
      const [filter] = store().items;
      assert.equal(filter.advanced.technician, null);
      assert.equal(filter.advanced.group, null);
      assert.equal(filter.country, null);
      const onPhone = JSON.parse(secureStore.__snapshot()[`mmg.savedFilters.UAT.${persona.id}`])[0];
      assert.equal(onPhone.advanced.technician, null, 'cut on the phone too: it does not outlive the role');

      // Applying even an uncut copy puts nothing the role cannot send on the list, nor in the request.
      useUiStore.getState().applySavedTicketFilter(sanitizeSavedFilter({ ...filter, advanced: EVERYTHING.ticketAdvanced }, persona));
      const ui = useUiStore.getState();
      assert.equal(ui.ticketAdvanced.technician, null);
      assert.equal(ui.ticketAdvanced.group, null);
      const query = ticketListQuery({
        me: persona, filter: ui.ticketFilter, sort: ui.ticketSort, search: ui.ticketSearch, advanced: ui.ticketAdvanced,
        allowed: ticketListFilters(persona),
      });
      assert.equal(query.teamId, undefined);
      assert.notEqual(query.assignedToId, 'tech-1');
    }
  });

  test('a quick filter the role does not have is not kept ("Unassigned" is ADMIN and AGENT only)', () => {
    const state = { ...EVERYTHING, ticketFilter: 'UNASSIGNED' };
    assert.equal(captureSavedFilter(state, PERSONAS.END_USER).filter, 'ALL');
    assert.equal(captureSavedFilter(state, PERSONAS.L2_MANAGER).filter, 'ALL');
    assert.equal(captureSavedFilter(state, PERSONAS.AGENT).filter, 'UNASSIGNED');
  });

  test('one technician slot: "My open" wins over a Technician filter, as the request sends it', () => {
    const saved = captureSavedFilter({ ...EVERYTHING, ticketFilter: 'MY_OPEN' }, PERSONAS.ADMIN);
    assert.equal(saved.filter, 'MY_OPEN');
    assert.equal(saved.advanced.technician, null);
  });

  test('a malformed stored entry is cut to what is valid: unknown sort, priority and days are dropped', () => {
    const admin = PERSONAS.ADMIN;
    const raw = JSON.stringify([{
      id: 'x', name: 'Odd', environment: 'UAT', userId: admin.id, createdAt: 1,
      filter: 'NOT_A_FILTER', sort: 'RANDOM', search: 42, country: { id: '' },
      advanced: { priority: 'SEVERE', category: { id: 'c' }, fromDate: '2026-13-45', toDate: 'soon', technician: 'tech', group: null },
    }]);
    const [f] = parseSavedFilters(raw, UAT(admin), admin).items;
    assert.deepEqual(
      { filter: f.filter, sort: f.sort, search: f.search, country: f.country, advanced: f.advanced },
      { filter: 'ALL', sort: 'UPDATED', search: null, country: null, advanced: NO_ADVANCED_FILTERS },
    );
  });
});

describe('what a saved filter holds, and applying it', () => {
  test('applying one sets its whole set at once, and the chip that matches the list is the active one', async () => {
    const admin = PERSONAS.ADMIN;
    const saved = await store().save(admin, UAT(admin), 'Everything', captureSavedFilter(EVERYTHING, admin));
    useUiStore.getState().setTicketFilter('CLOSED');
    useUiStore.getState().setTicketSearch('other');
    useUiStore.getState().openTicketList('ACTIVE_KPI', { label: 'This month', fromDate: '2026-11-01', toDate: '2026-11-30' });

    useUiStore.getState().applySavedTicketFilter(sanitizeSavedFilter(saved, admin));
    const ui = useUiStore.getState();
    assert.deepEqual(
      {
        filter: ui.ticketFilter, sort: ui.ticketSort, search: ui.ticketSearch, text: ui.ticketSearchText, country: ui.ticketCountryId,
        advanced: ui.ticketAdvanced, period: ui.ticketPeriod,
      },
      {
        filter: 'OPEN', sort: 'PRIORITY', search: 'vpn', text: 'vpn', country: 'country-ke', advanced: EVERYTHING.ticketAdvanced,
        period: null,
      },
    );
    const now = captureSavedFilter({ ...ui, countryName: 'Kenya' }, admin);
    assert.equal(sameSavedFilterContent(saved, now), true, 'filled brand red');
    useUiStore.getState().setTicketSort('DUE');
    assert.equal(sameSavedFilterContent(saved, captureSavedFilter({ ...useUiStore.getState(), countryName: 'Kenya' }, admin)), false);
  });

  test('the save sheet lists exactly what is captured', () => {
    assert.deepEqual(savedFilterChips(captureSavedFilter(EVERYTHING, PERSONAS.ADMIN)), [
      'Quick filter: Open', 'Search: “vpn”', 'Priority: High', 'Category: Network', 'Created 01 Nov 2026 – 30 Nov 2026',
      'Technician: Jane Tech', 'Group: Service Desk', 'Sort: Priority', 'Country: Kenya',
    ]);
    assert.deepEqual(savedFilterChips(captureSavedFilter(EVERYTHING, PERSONAS.END_USER)), [
      'Quick filter: Open', 'Search: “vpn”', 'Priority: High', 'Category: Network', 'Created 01 Nov 2026 – 30 Nov 2026', 'Sort: Priority',
    ]);
    const nothing = { ...EVERYTHING, ticketFilter: 'ALL', ticketSearch: undefined, ticketCountryId: null, ticketSort: 'UPDATED', ticketAdvanced: NO_ADVANCED_FILTERS };
    assert.deepEqual(savedFilterChips(captureSavedFilter(nothing, PERSONAS.ADMIN)), ['Quick filter: All', 'Sort: Last updated', 'All countries']);
  });

  test('a country not captured (a role without the selector) leaves the list\'s country alone', () => {
    const content = captureSavedFilter(EVERYTHING, PERSONAS.AGENT); // a country-locked AGENT
    assert.equal(content.country, null);
    useUiStore.getState().setTicketCountryId('country-x');
    useUiStore.getState().applySavedTicketFilter(content);
    assert.equal(useUiStore.getState().ticketCountryId, 'country-x');
  });
});

describe('names, duplicates and the cap', () => {
  const admin = PERSONAS.ADMIN;
  const content = (n) => captureSavedFilter({ ...EVERYTHING, ticketSearch: `search ${n}` }, admin);

  test('a name is required and trimmed; one longer than the cap is refused', async () => {
    assert.equal(savedFilterNameProblem('   ', []), 'Give the filter a name.');
    await assert.rejects(store().save(admin, UAT(admin), '  ', content(1)), /Give the filter a name/);
    const saved = await store().save(admin, UAT(admin), '   My   filter  ', content(1));
    assert.equal(saved.name, 'My filter');
    assert.equal(savedFilterNameProblem('x'.repeat(SAVED_FILTER_NAME_MAX), []), null);
    await assert.rejects(store().save(admin, UAT(admin), 'x'.repeat(SAVED_FILTER_NAME_MAX + 1), content(2)), /40 characters or fewer/);
  });

  test('a duplicate name is refused with a clear message, whatever its case or spacing', async () => {
    await store().save(admin, UAT(admin), 'Network', content(1));
    await assert.rejects(store().save(admin, UAT(admin), '  network ', content(2)), (error) => {
      assert.ok(error instanceof SavedFilterError);
      assert.equal(error.message, 'You already have a saved filter called “Network”. Choose another name.');
      return true;
    });
    assert.equal(store().items.length, 1);
  });

  test('the same filters saved twice are refused: they are already saved under their name', async () => {
    await store().save(admin, UAT(admin), 'First', content(1));
    await assert.rejects(store().save(admin, UAT(admin), 'Second', content(1)), /already saved as “First”/);
  });

  test('the cap holds: 20 per user per environment, the 21st refused; another environment has its own 20', async () => {
    for (let n = 1; n <= SAVED_FILTER_LIMIT; n++) await store().save(admin, UAT(admin), `Filter ${n}`, content(n));
    assert.equal(store().items.length, 20);
    await assert.rejects(store().save(admin, UAT(admin), 'One more', content(99)), /up to 20 saved filters/);
    assert.equal(store().items.length, 20);
    assert.equal(JSON.parse(secureStore.__snapshot()[`mmg.savedFilters.UAT.${admin.id}`]).length, 20);
    await store().save(admin, PROD(admin), 'Production one', content(99));
    assert.equal(store().items.length, 1);
    // A list over the cap on the phone (edited by hand) is read as its first 20.
    const many = Array.from({ length: 25 }, (_, n) => ({ id: `id${n}`, name: `F${n}`, environment: 'UAT', userId: admin.id, createdAt: n, ...content(n) }));
    assert.equal(parseSavedFilters(JSON.stringify(many), UAT(admin), admin).items.length, 20);
  });

  test('Manage: rename (same rules) and delete', async () => {
    const a = await store().save(admin, UAT(admin), 'Alpha', content(1));
    const b = await store().save(admin, UAT(admin), 'Beta', content(2));
    await assert.rejects(store().rename(admin, UAT(admin), b.id, 'ALPHA'), /already have a saved filter called “Alpha”/);
    await store().rename(admin, UAT(admin), b.id, '  Gamma ');
    await store().rename(admin, UAT(admin), a.id, 'alpha'); // its own name, in another case: fine
    assert.deepEqual(store().items.map((f) => f.name), ['alpha', 'Gamma']);
    await store().remove(admin, UAT(admin), a.id);
    assert.deepEqual(store().items.map((f) => f.name), ['Gamma']);
    await store().remove(admin, UAT(admin), b.id);
    assert.deepEqual(secureStore.__snapshot(), {}, 'the last one gone: nothing left on the phone');
  });
});

describe('the Filters sheet', () => {
  const sheet = read('src/screens/tickets/TicketFiltersScreen.tsx');
  const block = read('src/screens/tickets/SavedFilters.tsx');

  test('SAVED FILTERS sits at the top of the sheet, above every filter', () => {
    assert.ok(sheet.indexOf('<SavedFiltersBlock') > 0);
    assert.ok(sheet.indexOf('<SavedFiltersBlock') < sheet.indexOf('<FormCard>'));
    assert.match(sheet, /applySavedTicketFilter\(sanitizeSavedFilter\(filter, user\)\)/, 'cut to the role on apply');
  });

  test('chips (the active one filled), Manage, the dashed save button, the capture list, and a delete that asks first', () => {
    assert.match(block, /<FilterChip key=\{f\.id\} label=\{f\.name\} role="button" active=\{sameSavedFilterContent\(f, current\)\} onPress=\{\(\) => onApply\(f\)\} \/>/);
    assert.match(block, />Manage</);
    assert.match(block, /border-dashed/);
    assert.match(block, />Save these filters</);
    assert.match(block, /const chips = savedFilterChips\(content\);/);
    assert.match(block, /maxLength=\{SAVED_FILTER_NAME_MAX\}/);
    assert.match(block, /const ok = await confirmAction\(\{\s*title: `Delete “\$\{filter\.name\}”\?`/);
    assert.ok(block.indexOf('const ok = await confirmAction') < block.indexOf('await onRemove(filter.id)'));
  });

  test('no backend call: the saved-filter code never touches the API', () => {
    function files(dir) {
      return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
        const rel = path.join(dir, entry);
        return statSync(path.join(REPO, rel)).isDirectory() ? files(rel) : [rel.replace(/\\/g, '/')];
      });
    }
    for (const rel of ['src/utils/saved-filters.ts', 'src/store/savedFilters.store.ts', 'src/hooks/useSavedFilters.ts', 'src/screens/tickets/SavedFilters.tsx']) {
      assert.doesNotMatch(read(rel), /@\/api\/|apiClient|from '\.\.?\/api/, rel);
    }
    // In src/api only the sign-out (client.ts) and the switch reset the copy in memory; nothing sends one anywhere.
    const touching = files('src/api').filter((rel) => /savedFilters|SavedFilter|saved-filters/.test(read(rel)));
    assert.deepEqual(touching.sort(), ['src/api/client.ts', 'src/api/environmentSwitch.ts']);
    for (const rel of touching) {
      for (const line of read(rel).split('\n').filter((l) => /useSavedFiltersStore/.test(l) && !/^import /.test(l))) {
        assert.match(line, /useSavedFiltersStore\.getState\(\)\.reset\(\);/, `${rel}: ${line.trim()}`);
      }
    }
  });
});
