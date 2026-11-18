// iOS-5i: saved views on iOS, beyond Android's tests (tests/filters/saved-views.test.mjs runs them).
// - Two rules Android's tests do not pin, found by the step-3 mutation check: SVW-2's body allow-list (only the web's
//   eight keys, only non-empty strings, whatever the caller passes), and the role cut of what a view HOLDS on the phone
//   (the Save sheet lists it), not only of what it sends.
// - The five personas: what each one's saved view holds, and what each one is told was left out of a view that holds
//   everything (one an ADMIN saved on the web).
// - No build flag (Ronit, 2026-11-18, the simplified plan): saved views are in every build, preview and production, as
//   on Android, and their pieces sit where Android keeps them. scripts/verify-release-bundle.js expects them in both.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AxiosHeaders } from 'axios';

import { apiClient } from '../../src/api/client.ts';
import { createTicketView } from '../../src/api/savedViews.api.ts';
import { captureSavedView, decodeSavedView, savedViewChips } from '../../src/utils/saved-filters.ts';
import { NAMES, PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel.replace(/\\/g, '/')] : [];
  });
}

const sent = [];
apiClient.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  sent.push({ method: config.method, url: config.url, body });
  return {
    status: 201,
    statusText: '201',
    headers: AxiosHeaders.from({ 'content-type': 'application/json; charset=utf-8' }),
    data: JSON.stringify({ id: 'v1', name: body.name, entityType: 'ticket', filters: body.filters, columns: [], userId: 'u', isDefault: false, createdAt: '2026-11-18T00:00:00.000Z' }),
    config,
    request: {},
  };
};
beforeEach(() => {
  sent.length = 0;
});

/** The list with everything set, as a staff member could have it (one value each, and one list). */
const EVERYTHING = {
  ticketFilter: 'ALL',
  ticketSort: 'PRIORITY',
  ticketSearch: undefined,
  ticketCountryId: null,
  ticketAdvanced: {
    status: ['OPEN', 'IN_PROGRESS'],
    priority: ['HIGH'],
    category: [{ id: 'cat-network', name: 'Network' }],
    fromDate: '2026-11-01',
    toDate: '2026-11-30',
    technician: [{ id: 'tech-1', name: 'Jane Tech' }, { id: 'tech-2', name: 'John Tech' }],
    group: [{ id: 'team-1', name: 'Service Desk' }],
  },
};

describe('SVW-2 sends only the web\'s eight keys, as strings, whatever it is handed', () => {
  test('extra keys, columns, isDefault, empty and non-string values never reach the Service Desk', async () => {
    await createTicketView('Mine', {
      status: 'OPEN', priority: '', sortBy: 'priority', categoryIds: ['a', 'b'], columns: ['title'], isDefault: true,
      teamId: ['team-1'], assignedToId: 7, fromDate: '2026-11-01', search: 'vpn', countryId: 'country-ke',
    });
    assert.deepEqual(sent.map((r) => [r.method, r.url]), [['post', '/saved-views']]);
    assert.deepEqual(sent[0].body, { name: 'Mine', entityType: 'ticket', filters: { status: 'OPEN', sortBy: 'priority', fromDate: '2026-11-01' } });
  });
});

describe('the five personas: what a saved view HOLDS (the Save sheet lists it) and what it SENDS', () => {
  const HOLDS = {
    END_USER: ['Quick filter: All', 'Status: Open, In Progress', 'Priority: High', 'Category: Network', 'Created 01 Nov 2026 – 30 Nov 2026', 'Sort: Priority'],
    L2_MANAGER: ['Quick filter: All', 'Status: Open, In Progress', 'Priority: High', 'Category: Network', 'Created 01 Nov 2026 – 30 Nov 2026', 'Sort: Priority'],
    AGENT: ['Quick filter: All', 'Status: Open, In Progress', 'Priority: High', 'Category: Network', 'Created 01 Nov 2026 – 30 Nov 2026', 'Technician: Jane Tech, John Tech', 'Group: Service Desk', 'Sort: Priority'],
    TRIAGE_AGENT: ['Quick filter: All', 'Status: Open, In Progress', 'Priority: High', 'Category: Network', 'Created 01 Nov 2026 – 30 Nov 2026', 'Technician: Jane Tech, John Tech', 'Group: Service Desk', 'Sort: Priority'],
    ADMIN: ['Quick filter: All', 'Status: Open, In Progress', 'Priority: High', 'Category: Network', 'Created 01 Nov 2026 – 30 Nov 2026', 'Technician: Jane Tech, John Tech', 'Group: Service Desk', 'Sort: Priority'],
  };
  for (const name of NAMES) {
    test(`${name}: holds and sends only its own filters`, () => {
      const persona = PERSONAS[name];
      const capture = captureSavedView(EVERYTHING, persona);
      assert.deepEqual(savedViewChips(capture.content), HOLDS[name]);
      const staff = name === 'AGENT' || name === 'TRIAGE_AGENT' || name === 'ADMIN';
      assert.deepEqual(capture.content.advanced.technician.map((t) => t.id), staff ? ['tech-1', 'tech-2'] : []);
      assert.deepEqual(capture.content.advanced.group.map((g) => g.id), staff ? ['team-1'] : []);
      assert.equal(capture.filters.assignedToId, staff ? 'tech-1,tech-2' : undefined);
      assert.equal(capture.filters.teamId, staff ? 'team-1' : undefined);
      assert.equal(capture.refusal, null);
    });
  }

  const ADMIN_VIEW = {
    status: 'OPEN,IN_PROGRESS', priority: 'HIGH,URGENT', sortBy: 'sla', assignedToId: 'tech-1,tech-2', teamId: 'team-1',
    categoryId: 'cat-a,cat-b', fromDate: '2026-11-01', toDate: '2026-11-30',
  };
  const LEFT_OUT = {
    END_USER: ['Technician (not available to your role)', 'Group (not available to your role)'],
    L2_MANAGER: ['Technician (not available to your role)', 'Group (not available to your role)'],
    AGENT: [],
    TRIAGE_AGENT: [],
    ADMIN: [],
  };
  for (const name of NAMES) {
    test(`${name}: a view holding everything applies what this role can send, and names the rest`, () => {
      const { content, leftOut } = decodeSavedView(ADMIN_VIEW, PERSONAS[name]);
      assert.deepEqual(leftOut, LEFT_OUT[name]);
      assert.deepEqual(content.advanced.status, ['OPEN', 'IN_PROGRESS']);
      assert.deepEqual(content.advanced.priority, ['HIGH', 'URGENT']);
      assert.deepEqual(content.advanced.category.map((c) => c.id), ['cat-a', 'cat-b']);
      assert.equal(content.sort, 'DUE');
      const staff = LEFT_OUT[name].length === 0;
      assert.deepEqual(content.advanced.technician.map((t) => t.id), staff ? ['tech-1', 'tech-2'] : []);
      assert.deepEqual(content.advanced.group.map((g) => g.id), staff ? ['team-1'] : []);
    });
  }
});

describe('no build flag: saved views in every build, where Android keeps them', () => {
  test('no gate and no flag anywhere; only src/config/env.ts reads EXPO_PUBLIC_APP_ENV (the API URL, iOS-9b)', () => {
    assert.equal(existsSync(path.join(REPO, 'src/screens/tickets/savedViewsGate.ts')), false);
    const flagged = sourceFiles('src').filter((rel) => /SAVED_VIEWS_ENABLED|savedViewsGate/.test(code(read(rel))));
    assert.deepEqual(flagged, []);
    assert.deepEqual(sourceFiles('src').filter((rel) => /EXPO_PUBLIC_APP_ENV/.test(code(read(rel)))), ['src/config/env.ts']);
  });

  test('Android\'s placement: the query key, the field spec, the list store\'s action and both barrels', () => {
    assert.match(read('src/hooks/queryKeys.ts'), /savedViews: \{\s*tickets: \(\) => \['saved-views', 'ticket'\] as const,\s*\}/);
    assert.match(read('src/api/responseSpecs.ts'), /export const SAVED_VIEW_SPEC: readonly FieldSpec\[\] = \[/);
    assert.match(read('src/store/ui.store.ts'), /applySavedTicketFilter: \(content\) => set\(savedFilterUiState\(content\)\),/);
    assert.match(read('src/hooks/index.ts'), /useCreateSavedView, useDeleteSavedView, useRenameSavedView, useSavedTicketViews, useSavedViewNames,\s*\} from '\.\/useSavedViews';/);
    assert.match(read('src/types/index.ts'), /^export \* from '\.\/savedView';\r?$/m);
  });

  test('SAVED_VIEW_SPEC is 03 §C\'s SavedView: its eight fields, and a row as SVW-1 returns it fits every one', async () => {
    const { SAVED_VIEW_SPEC } = await import('../../src/api/responseSpecs.ts');
    assert.deepEqual(SAVED_VIEW_SPEC.map((s) => s.path), ['id', 'name', 'entityType', 'filters', 'columns', 'userId', 'isDefault', 'createdAt']);
    const row = { id: 'v1', name: 'Mine', entityType: 'ticket', filters: {}, columns: [], userId: 'u1', isDefault: false, createdAt: '2026-11-18T00:00:00.000Z' };
    const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
    for (const spec of SAVED_VIEW_SPEC) assert.ok(spec.kinds.includes(kind(row[spec.path])), `${spec.path}: ${kind(row[spec.path])}`);
    // A view's filters are never trusted to be an object (03 §C: Json), so every JSON kind is accepted there.
    assert.deepEqual([...SAVED_VIEW_SPEC.find((s) => s.path === 'filters').kinds].sort(), ['array', 'boolean', 'null', 'number', 'object', 'string']);
  });

  test('S3 (Android build 6\'s phone-only list) is not on iOS: no legacy store, hook or key', () => {
    assert.equal(existsSync(path.join(REPO, 'src/store/legacySavedFilters.ts')), false);
    const legacy = sourceFiles('src').filter((rel) => /useLegacySavedFilters|LegacySavedFilter|mmg\.savedFilters/.test(code(read(rel))));
    assert.deepEqual(legacy, []);
  });
});
