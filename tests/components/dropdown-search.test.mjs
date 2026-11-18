// Search on long dropdowns (2026-11-17): one shared component, OptionSheet, and one rule, utils/option-search.ts.
// What runs for real: the search rules (match, threshold, words). The component is read as source, as tests/rbac reads
// screens: there is no React Native renderer in this repo.
// iOS (iOS-5i): Android's 723e2fc tests. Step 4 ports the rule; the OptionSheet block arrives with the component in
// step 5, on iOS's PageSheet (Android's Sheet.tsx is not on iOS).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AUDIT_ACTIONS, AUDIT_DATE_PRESETS, AUDIT_ENTITY_TYPES } from '../../src/utils/audit-log.ts';
import {
  OPTION_SEARCH_THRESHOLD, filterOptionsByLabel, isSearchableList, noOptionMatchText, optionSearchAnnouncement,
} from '../../src/utils/option-search.ts';
import { CLOSURE_CODE_OPTIONS, STATUS_TRANSITIONS } from '../../src/utils/ticket-rules.ts';
import { CLOSURE_CODES, TICKET_IMPACTS, TICKET_PRIORITIES, TICKET_URGENCIES } from '../../src/types/enums.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry) ? [rel.replace(/\\/g, '/')] : [];
  });
}

/** 38 categories and an "All" row, as on UAT's category list. */
const CATEGORIES = [
  'All categories', 'Access Management', 'Accounts Payable', 'Active Directory', 'Antivirus', 'Backup', 'Biometric Devices',
  'CCTV', 'Cloud Services', 'Data Center', 'Desktop Support', 'Email', 'ERP - Finance', 'ERP - Inventory', 'Firewall',
  'Hardware', 'Internet', 'IP Telephony', 'Laptop', 'LAN / WAN', 'Licensing', 'Mobile Devices', 'Monitoring', 'Network',
  'Office 365', 'Password Reset', 'Payroll', 'Printers', 'Projectors', 'SAP', 'Security', 'Server', 'SharePoint',
  'Software Install', 'Storage', 'Teams', 'VPN', 'Wi-Fi', 'Workstation Setup',
].map((label, i) => ({ value: `c${i}`, label }));

describe('the search rule (utils/option-search.ts)', () => {
  test('matches anywhere in the label, not just the start', () => {
    assert.deepEqual(filterOptionsByLabel(CATEGORIES, 'twor').map((o) => o.label), ['Network']);
    assert.deepEqual(filterOptionsByLabel(CATEGORIES, 'nance').map((o) => o.label), ['ERP - Finance']);
    assert.deepEqual(filterOptionsByLabel(CATEGORIES, 'ERP').map((o) => o.label), ['ERP - Finance', 'ERP - Inventory']);
  });

  test('is case-insensitive, both ways, and ignores spaces around the query', () => {
    assert.deepEqual(filterOptionsByLabel(CATEGORIES, 'NET').map((o) => o.label), ['Internet', 'Network']);
    assert.deepEqual(filterOptionsByLabel(CATEGORIES, '  vpn ').map((o) => o.label), ['VPN']);
    assert.deepEqual(filterOptionsByLabel(CATEGORIES, 'cctv'), filterOptionsByLabel(CATEGORIES, 'CcTv'));
  });

  test('a blank query keeps every option, in order; no match gives an empty list and a plain line saying so', () => {
    assert.equal(filterOptionsByLabel(CATEGORIES, ''), CATEGORIES);
    assert.equal(filterOptionsByLabel(CATEGORIES, '   '), CATEGORIES);
    assert.deepEqual(filterOptionsByLabel(CATEGORIES, 'zzz'), []);
    assert.equal(noOptionMatchText('  zzz '), 'Nothing matches “zzz”.');
  });

  test('the count TalkBack hears (VoiceOver on iOS)', () => {
    assert.equal(optionSearchAnnouncement(0), 'No matches');
    assert.equal(optionSearchAnnouncement(1), '1 match');
    assert.equal(optionSearchAnnouncement(2), '2 matches');
  });

  test('threshold: more than 10 options. A short list, five or ten, gets no field; a long one does', () => {
    assert.equal(OPTION_SEARCH_THRESHOLD, 10);
    for (const n of [0, 3, 5, 6, 10]) assert.equal(isSearchableList(n), false, String(n));
    for (const n of [11, 20, CATEGORIES.length]) assert.equal(isSearchableList(n), true, String(n));
  });

  test('none of the app\'s own fixed lists reaches it (each with its "All" / "Select" row where it has one)', () => {
    const longestTransitions = Math.max(...Object.values(STATUS_TRANSITIONS).map((t) => t.length));
    const fixed = {
      'priority filter (All + 4)': TICKET_PRIORITIES.length + 1,
      'impact (+ Not set)': TICKET_IMPACTS.length + 1,
      'urgency (+ Not set)': TICKET_URGENCIES.length + 1,
      'closure code (+ Select)': CLOSURE_CODE_OPTIONS.length + 1,
      'change status (longest)': longestTransitions,
      'audit action (All + 9)': AUDIT_ACTIONS.length + 1,
      'audit entity (All + 3)': AUDIT_ENTITY_TYPES.length + 1,
      'audit dates (presets + 2 pickers)': AUDIT_DATE_PRESETS.length + 2,
    };
    for (const [list, count] of Object.entries(fixed)) assert.equal(isSearchableList(count), false, `${list}: ${count}`);
    assert.equal(CLOSURE_CODES.length, 6);
  });
});
