// Search on long dropdowns (2026-11-17): one shared component, OptionSheet, and one rule, utils/option-search.ts.
// What runs for real: the search rules (match, threshold, words). The component is read as source, as tests/rbac reads
// screens: there is no React Native renderer in this repo.
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

  test('the count TalkBack hears', () => {
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

describe('OptionSheet: the one shared dropdown, and the only place its search lives', () => {
  const sheet = read('src/components/OptionSheet.tsx');

  test('the field shows only for a long list with its options loaded, pinned above the list', () => {
    // 2026-11-18: `known` is the options plus any chosen value they lack (a multi-select's), so it counts as the list. A
    // server search (`remote`, the technician filter) always has its field: the field IS how its list is filled.
    assert.match(sheet, /const searchable = remote !== null \|\| \(children === undefined && isSearchableList\(known\.length\)\);/);
    assert.match(sheet, /\{searchable \? \(\s*<View className="mx-4 mb-2">\s*<SearchField/);
    // Above the FlatList, outside it: it stays put while the list scrolls.
    assert.ok(sheet.indexOf('<SearchField') < sheet.indexOf('<FlatList'));
    assert.match(sheet, /return searchable \? filterOptionsByLabel\(known, query\) : known;/);
  });

  test('no match: a plain line, not an empty sheet', () => {
    assert.match(sheet, /ListEmptyComponent=\{\s*!remote && searchable && typed \? \(\s*<Text[^>]*>\{noOptionMatchText\(query\)\}<\/Text>/);
    assert.match(sheet, /const typed = query\.trim\(\) !== '';/);
  });

  test('the keyboard never covers the list, and a tap on an option with it up picks at once', () => {
    assert.match(sheet, /<Sheet visible=\{visible\} title=\{title\} onClose=\{close\} avoidKeyboard=\{searchable\}>/);
    assert.match(sheet, /keyboardShouldPersistTaps="handled"/);
    const frame = read('src/components/Sheet.tsx');
    assert.match(frame, /<KeyboardAvoidingView behavior="padding" enabled=\{avoidKeyboard\} style=\{styles\.fill\}>/);
    // The sheet shrinks to the room above the keyboard; its list (a FlatList) scrolls inside it.
    assert.match(frame, /className=\{`\$\{HEIGHTS\[height\]\} shrink rounded-t-2xl bg-white pt-2`\}/);
  });

  test('the field clears when the sheet closes, however it closes', () => {
    assert.match(sheet, /useEffect\(\(\) => \{\s*if \(!visible\) setOwnQuery\(''\);/);
    // A server search's field belongs to the caller: closing empties it through the caller (setQuery → onQueryChange).
    assert.match(sheet, /const setQuery = \(text: string\) => \(remote \? remote\.onQueryChange\(text\) : setOwnQuery\(text\)\);/);
    // Closing also hands a multi-select's ticks to the caller, once, before onClose (tests/filters/multi-select).
    assert.match(sheet, /const close = useStableCallback\(\(\) => \{\s*setQuery\(''\);\s*if \(multi && !sameChoices\(draft, committed \?\? \[\]\)\) \{[\s\S]*?multi\.onChange\(draft as T\[\], chosen as SheetOption<T>\[\]\);\s*\}\s*onClose\(\);/);
    assert.match(sheet, /const pick = useStableCallback\(\(value: string\) => \{\s*setQuery\(''\);/);
  });

  test('accessible: a real label naming the list, and the number of matches announced', () => {
    assert.match(sheet, /accessibilityLabel=\{`Search \$\{title\}`\}/);
    assert.match(sheet, /AccessibilityInfo\.announceForAccessibility\(optionSearchAnnouncement\(settledCount\)\)/);
    assert.match(sheet, /const settled = useDebouncedValue\(query, ANNOUNCE_AFTER_MS\);/);
  });

  test('every dropdown in the app is an OptionSheet: no screen builds its own single-choice sheet or search', () => {
    // Every <Modal> in src/ is one of these sheets or a full-screen dialog; none is a second dropdown.
    const modals = sourceFiles('src').filter((rel) => /<Modal\b/.test(read(rel))).sort();
    assert.deepEqual(modals, [
      'src/components/BulkProgressModal.tsx',
      'src/components/ImageViewerModal.tsx',
      'src/components/PersonPickerSheet.tsx', // people: its own server search (USR-3), unchanged
      'src/components/Sheet.tsx', // the frame OptionSheet and the 2026-11-17 sheets use
      'src/components/TemplatePickerSheet.tsx', // reply templates: its own search, unchanged
    ]);
    const users = sourceFiles('src').filter((rel) => /<OptionSheet\b/.test(read(rel))).sort();
    assert.deepEqual(users, [
      'src/screens/audit/AuditLogScreen.tsx',
      'src/screens/catalog/ServiceFormFieldInput.tsx',
      'src/screens/catalog/ServiceRequestFormScreen.tsx',
      'src/screens/profile/ProfileScreen.tsx',
      'src/screens/tasks/TaskEditorScreen.tsx',
      'src/screens/tickets/AssignPickerScreen.tsx',
      'src/screens/tickets/CreateTicketScreen.tsx',
      'src/screens/tickets/StatusClosureScreen.tsx',
      'src/screens/tickets/TicketDetailScreen.tsx',
      'src/screens/tickets/TicketFiltersScreen.tsx',
      'src/screens/tickets/TicketListScreen.tsx',
      'src/screens/tickets/TicketPropertyEditors.tsx',
    ]);
    for (const rel of users) assert.doesNotMatch(read(rel), /filterOptionsByLabel|isSearchableList/, `${rel} must not add its own`);
  });
});
