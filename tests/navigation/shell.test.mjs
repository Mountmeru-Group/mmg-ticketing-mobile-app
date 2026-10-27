// The iOS tab bar and More list for each of the five personas (docs/ios/00-PORT-MANIFEST.md §4.5), pinned to
// utils/permissions.ts, and the wiring that makes those answers the only source: the navigators call them, and no file
// under src/navigation, src/screens or src/components names a role. Expected values are written out in full, so an
// extra tab or row shows up as a diff.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { routeTitle } from '../../src/navigation/routes.ts';
import { appTabs, drawerItems, hasApprovalsTab, moreSections, tabBadges } from '../../src/utils/permissions.ts';
import { PERSONAS, forEachPersona } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel] : [];
  });
}

const tab = (name, title) => ({ name, title });

describe('tab bar', () => {
  const FIVE = [tab('HomeTab', 'Home'), tab('TicketsTab', 'Tickets'), tab('ApprovalsTab', 'Approvals'), tab('AlertsTab', 'Alerts'), tab('MoreTab', 'More')];
  const L2 = [tab('HomeTab', 'Home'), tab('TicketsTab', 'Tickets'), tab('AlertsTab', 'Alerts'), tab('MoreTab', 'More')];

  forEachPersona(
    'tabs',
    {
      END_USER: [tab('HomeTab', 'Home'), tab('TicketsTab', 'My Tickets'), tab('AlertsTab', 'Alerts'), tab('MoreTab', 'More')],
      AGENT: FIVE,
      TRIAGE_AGENT: FIVE,
      L2_MANAGER: L2,
      ADMIN: FIVE,
    },
    (p) => appTabs(p.role),
  );

  test('at most five tabs for every persona (HIG: five or fewer on iPhone)', () => {
    for (const p of Object.values(PERSONAS)) assert.ok(appTabs(p.role).length <= 5, p.role);
  });

  test('the Approvals tab is exactly the roles that always have Approvals (drawerItems with nothing pending)', () => {
    for (const p of Object.values(PERSONAS)) {
      assert.equal(hasApprovalsTab(p.role), drawerItems(p.role, 0).includes('approvals'), p.role);
    }
  });

  test('a role\'s tabs never depend on a count: appTabs takes none (HIG: never hide a tab)', () => {
    assert.equal(appTabs.length, 1);
  });

  test('no user yet: END_USER\'s tabs; a role the app does not know: no Approvals tab', () => {
    assert.deepEqual(appTabs(null), appTabs('END_USER'));
    assert.deepEqual(appTabs(undefined), appTabs('END_USER'));
    assert.deepEqual(
      appTabs('SUPERUSER').map((t) => t.name),
      ['HomeTab', 'TicketsTab', 'AlertsTab', 'MoreTab'],
    );
  });

  test('the ticket list\'s title is the Tickets tab\'s title', () => {
    for (const p of Object.values(PERSONAS)) {
      assert.equal(routeTitle('TicketList', p.role), appTabs(p.role)[1].title);
    }
  });
});

describe('More list', () => {
  const WORK = { key: 'work', items: ['tasks', 'catalog', 'myRequests'] };
  const WORK_APPROVALS = { key: 'work', items: ['approvals', 'tasks', 'catalog', 'myRequests'] };
  const INFO = { key: 'information', items: ['knowledge', 'announcements'] };
  const SETTINGS = { key: 'settings', items: ['settings'] };
  const PLAIN = [WORK, INFO, SETTINGS];
  const WITH_APPROVALS = [WORK_APPROVALS, INFO, SETTINGS];

  forEachPersona(
    'More rows with no pending approvals',
    { END_USER: PLAIN, AGENT: PLAIN, TRIAGE_AGENT: PLAIN, L2_MANAGER: PLAIN, ADMIN: PLAIN },
    (p) => moreSections(p.role, 0),
  );

  // 08 S1: END_USER and L2_MANAGER see Approvals only while APR-1 returns something. ADMIN and AGENT have the tab, so
  // it is never also a More row (one route per screen).
  forEachPersona(
    'More rows with 2 pending approvals',
    { END_USER: WITH_APPROVALS, AGENT: PLAIN, TRIAGE_AGENT: PLAIN, L2_MANAGER: WITH_APPROVALS, ADMIN: PLAIN },
    (p) => moreSections(p.role, 2),
  );

  test('every drawer row is a tab or a More row, never both', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const pending of [0, 2]) {
        const more = moreSections(p.role, pending).flatMap((s) => s.items);
        for (const row of drawerItems(p.role, pending)) {
          const inTab = row === 'approvals' && hasApprovalsTab(p.role);
          assert.equal(more.includes(row), !inTab, `${p.role} ${pending} ${row}`);
        }
      }
    }
  });

  test('a role the app does not know gets no catalogue, as on Android', () => {
    const rows = moreSections('SUPERUSER', 0).flatMap((s) => s.items);
    assert.equal(rows.includes('catalog'), false);
    assert.equal(rows.includes('myRequests'), false);
  });
});

describe('tab badges', () => {
  const counts = { unread: 3, pendingApprovals: 2 };
  forEachPersona(
    'badges with 3 unread and 2 pending approvals',
    {
      END_USER: { AlertsTab: 3, MoreTab: 2 },
      AGENT: { AlertsTab: 3, ApprovalsTab: 2 },
      TRIAGE_AGENT: { AlertsTab: 3, ApprovalsTab: 2 },
      L2_MANAGER: { AlertsTab: 3, MoreTab: 2 },
      ADMIN: { AlertsTab: 3, ApprovalsTab: 2 },
    },
    (p) => tabBadges(p.role, counts),
  );

  forEachPersona(
    'no badges when nothing is unread or waiting',
    { END_USER: {}, AGENT: {}, TRIAGE_AGENT: {}, L2_MANAGER: {}, ADMIN: {} },
    (p) => tabBadges(p.role, { unread: 0, pendingApprovals: 0 }),
  );

  test('a badge only ever sits on a tab the role has', () => {
    for (const p of Object.values(PERSONAS)) {
      const names = appTabs(p.role).map((t) => t.name);
      for (const name of Object.keys(tabBadges(p.role, counts))) assert.ok(names.includes(name), `${p.role} ${name}`);
    }
  });
});

describe('wiring: the shell takes role decisions from utils/permissions.ts', () => {
  test('no navigator, screen or component names a role', () => {
    const roleString = /['"`](ADMIN|AGENT|END_USER|L2_MANAGER)['"`]/;
    const offenders = ['src/navigation', 'src/screens', 'src/components'].flatMap(sourceFiles).filter((rel) => roleString.test(read(rel)));
    assert.deepEqual(offenders, []);
  });

  test('no navigator calls a low-level role gate itself', () => {
    const rawGate = /\b(isStaff|isAgentOrAdmin|canSeePrivateNotes|canChangeStatus|isTriageAgent|isCountryLockedAgent|drawerItems|mainTabs)\(/;
    const offenders = sourceFiles('src/navigation').filter((rel) => rawGate.test(read(rel)));
    assert.deepEqual(offenders, []);
  });

  const GATED = [
    { file: 'src/navigation/AppTabs.tsx', uses: ['appTabs(', 'tabBadges('], forbid: /name="(HomeTab|TicketsTab|ApprovalsTab|AlertsTab|MoreTab)"/ },
    { file: 'src/navigation/MoreScreen.tsx', uses: ['moreSections(', 'countrySelectorMode(', 'useSignOut('] },
  ];
  for (const { file, uses, forbid } of GATED) {
    test(`${file} uses ${uses.join(', ')}`, () => {
      const src = read(file);
      for (const call of uses) assert.ok(src.includes(call), `${file} should call ${call}`);
      if (forbid) assert.equal(forbid.test(src), false, `${file} hard-codes a tab`);
    });
  }
});
