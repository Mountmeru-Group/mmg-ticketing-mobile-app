// Ticket links tapped in the app (05 §A.11) on the iOS tabs (docs/ios/00-PORT-MANIFEST.md §4.5): the link is parsed
// as on Android, then opens the resolver in the tab on screen. Nothing opens under a sheet or the sign-in screens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { STACK_ROUTES, focusedAppTab } from '../../src/navigation/routes.ts';
import { APP_ORIGIN, parseTicketLink, ticketLinkDestination } from '../../src/utils/deep-links.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UUID = '3F1C2B4A-1111-4222-8333-944455556666';

describe('parsing (unchanged from Android)', () => {
  test('the build talks to UAT, so links resolve only on the UAT web origin', () => {
    assert.equal(APP_ORIGIN, 'https://uat-servicedesk.mountmerugroup.com');
  });

  const cases = [
    ['#1234', { ok: true, target: { kind: 'number', ticketNumber: 1234 } }],
    ['  # 77 ', { ok: true, target: { kind: 'number', ticketNumber: 77 } }],
    [`${APP_ORIGIN}/ticket/55`, { ok: true, target: { kind: 'number', ticketNumber: 55 } }],
    [`${APP_ORIGIN}/tickets/${UUID}`, { ok: true, target: { kind: 'id', id: UUID.toLowerCase() } }],
    [`${APP_ORIGIN}/tickets/42/`, { ok: true, target: { kind: 'number', ticketNumber: 42 } }],
    ['https://UAT-SERVICEDESK.mountmerugroup.com/ticket/9', { ok: true, target: { kind: 'number', ticketNumber: 9 } }],
    ['https://servicedesk.mountmerugroup.com/ticket/9', { ok: false, reason: 'other-environment' }],
    ['https://evil.example/ticket/9', { ok: false, reason: 'other-environment' }],
    [`${APP_ORIGIN}/knowledge/9`, { ok: false, reason: 'not-a-ticket-link' }],
    ['#0', { ok: false, reason: 'not-a-ticket-link' }],
    ['hello', { ok: false, reason: 'not-a-ticket-link' }],
    [`${APP_ORIGIN}/ticket/%E0%A4%A`, { ok: false, reason: 'not-a-ticket-link' }],
  ];
  for (const [input, expected] of cases) {
    test(JSON.stringify(input), () => assert.deepEqual(parseTicketLink(input), expected));
  }
});

describe('which tab a link opens in', () => {
  test('in the tab on screen, for every tab, because every tab stack has the resolver', () => {
    for (const tab of Object.keys(STACK_ROUTES)) {
      assert.ok(STACK_ROUTES[tab].includes('TicketLink'), tab);
      assert.deepEqual(ticketLinkDestination('#1234', tab), { tab, link: '#1234' });
    }
  });

  test('nothing opens under a sheet or the sign-in screens', () => {
    assert.equal(ticketLinkDestination('#1234', null), null);
  });

  test('a link that is not a ticket link here opens nothing (the browser gets it)', () => {
    assert.equal(ticketLinkDestination('https://evil.example/ticket/9', 'TicketsTab'), null);
    assert.equal(ticketLinkDestination('hello', 'HomeTab'), null);
  });
});

describe('the tab on screen, from the navigation state', () => {
  const app = (tabIndex, tabs = ['HomeTab', 'TicketsTab', 'AlertsTab', 'MoreTab']) => ({
    name: 'App',
    state: { index: tabIndex, routes: tabs.map((name) => ({ name })) },
  });

  test('not ready, or signed out: none', () => {
    assert.equal(focusedAppTab(undefined), null);
    assert.equal(focusedAppTab({ index: 0, routes: [] }), null);
    assert.equal(focusedAppTab({ index: 0, routes: [{ name: 'Auth' }] }), null);
  });

  test('the tabs before they have a state of their own: Home, where they start', () => {
    assert.equal(focusedAppTab({ index: 0, routes: [{ name: 'App' }] }), 'HomeTab');
  });

  test('the focused tab, for a four-tab and a five-tab bar', () => {
    assert.equal(focusedAppTab({ index: 0, routes: [app(2)] }), 'AlertsTab');
    assert.equal(
      focusedAppTab({ index: 0, routes: [app(2, ['HomeTab', 'TicketsTab', 'ApprovalsTab', 'AlertsTab', 'MoreTab'])] }),
      'ApprovalsTab',
    );
  });

  test('a sheet on top: none', () => {
    assert.equal(focusedAppTab({ index: 1, routes: [app(1), { name: 'ReplyComposer' }] }), null);
  });

  test('navigationRef opens links through these two functions', () => {
    const src = readFileSync(path.join(REPO, 'src/navigation/navigationRef.ts'), 'utf8');
    assert.ok(src.includes('ticketLinkDestination(link, focusedAppTab(navigationRef.getRootState()))'));
  });
});
