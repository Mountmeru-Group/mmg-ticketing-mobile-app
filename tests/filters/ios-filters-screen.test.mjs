// iOS-5i step 6: the Filters sheet and its saved filters on iPhone (Android 723e2fc; UI-STANDARDS §17.2, §18.1,
// §iOS-A.17). Android's own tests read the same files: tests/rbac/list-filters (verbatim), tests/filters/multi-select and
// tests/filters/saved-views. These are the iOS ones: what each of the five personas sees, the page sheets, VoiceOver
// (no live region on iOS), the error haptic, the notices that show inside the sheets, and saved views in every build.
// Read as source: there is no React Native renderer in this repo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ticketListFilters } from '../../src/utils/permissions.ts';
import { NAMES, PERSONAS } from '../rbac/personas.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const screen = code(read('src/screens/tickets/TicketFiltersScreen.tsx'));
const block = code(read('src/screens/tickets/SavedFilters.tsx'));

/** Each filter's field and sheet on the Filters sheet, by its ticketListFilters() key. */
const FIELDS = { status: 'Status', priority: 'Priority', category: 'Category', date: 'Created', technician: 'Technician', group: 'Group' };

describe('the five personas: the fields, the sheets and the saved filters each one gets', () => {
  const SEES = {
    END_USER: ['Saved filters', 'Status', 'Priority', 'Category', 'Created'],
    AGENT: ['Saved filters', 'Status', 'Priority', 'Category', 'Created', 'Technician', 'Group'],
    TRIAGE_AGENT: ['Saved filters', 'Status', 'Priority', 'Category', 'Created', 'Technician', 'Group'],
    L2_MANAGER: ['Saved filters', 'Status', 'Priority', 'Category', 'Created'],
    ADMIN: ['Saved filters', 'Status', 'Priority', 'Category', 'Created', 'Technician', 'Group'],
  };
  for (const name of NAMES) {
    test(`${name}: ${SEES[name].join(', ')}`, () => {
      const allowed = ticketListFilters(PERSONAS[name]);
      // Every field and every sheet sits behind its own allowed.includes(key) (tests/rbac/list-filters pins the guards).
      const fields = Object.entries(FIELDS).filter(([key]) => allowed.includes(key)).map(([, label]) => label);
      assert.deepEqual(['Saved filters', ...fields], SEES[name]);
      for (const [key, label] of Object.entries(FIELDS)) {
        if (key === 'date') continue;
        assert.match(screen, new RegExp(`allowed\\.includes\\('${key}'\\) \\? \\(\\s*<OptionSheet\\s+multiple\\s+visible=\\{picker === '${key}'\\}\\s+title="${label}"`), label);
      }
    });
  }

  test('saved filters for every signed-in role, in every build: no role check, no build flag around them', () => {
    assert.match(screen, /\{user \? <SavedFiltersBlock list=\{listState\} onApply=\{applySaved\} \/> : null\}/);
    assert.match(screen, /^import \{ SavedFiltersBlock \} from '\.\/SavedFilters';$/m, 'a static import: in every bundle');
    assert.doesNotMatch(screen + block, /EXPO_PUBLIC_APP_ENV|__DEV__|SAVED_VIEWS_ENABLED|require\(/);
    assert.doesNotMatch(block, /\brole\b\s*[!=]==|isAgentOrAdmin|canSwitchEnvironment/, 'each role\'s cut comes from decodeSavedView()');
  });

  test('the country\'s name (for "not kept") is looked up only where a person can pick a country and has one picked', () => {
    assert.match(screen, /useCountryOptions\(\{ enabled: countryMode === 'switch' && ticketCountryId !== null \}\)/);
  });
});

describe('the Filters sheet on iPhone: iOS\'s frame kept, Android\'s multi-selects in it', () => {
  test('iOS\'s own parts stay: the bar\'s Clear all, the calendar sheet, the large-text date rows', () => {
    assert.match(screen, /<Text className="text-sm font-medium text-blue-700">Clear all<\/Text>/);
    assert.match(screen, /<DatePickerSheet\b/);
    assert.match(screen, /const largeText = useAccessibilityTextSize\(\);/);
    assert.doesNotMatch(screen, /DateTimePickerAndroid|ScreenHeader|PersonPickerSheet|__ALL__|const ALL\b/);
  });

  test('VoiceOver hears the technician search\'s line (no live region on iOS), worded as the line under the rows', () => {
    assert.match(screen, /announcement: technicianSearchLine\(technicianQuery, technicianTerm, technicianSearch, technicianOptions\.length\),/);
    for (const words of ['Type at least 2 letters of a name or email to find technicians.', 'Searching needs a connection. It runs when you reconnect.']) {
      assert.equal(screen.split(words).length - 1, 2, words);
    }
    assert.ok(screen.includes('No technician matches “${q}”.'));
  });

  test('"Saved …" shows inside this sheet (it stays open over the app\'s notice host; Ronit, decision 4)', () => {
    assert.match(screen, /<SuccessNoticeHost top=\{8\} \/>\s*<\/View>\s*\);\s*\}/);
  });
});

describe('saved filters on iPhone: page sheets, VoiceOver, the error haptic, notices', () => {
  test('Save and Manage are page sheets; the name field stays above the keyboard; no other frame', () => {
    assert.match(block, /<PageSheet visible=\{visible\} title="Save these filters" onClose=\{onClose\}>\s*<SheetKeyboardView>/);
    assert.match(block, /<PageSheet\s+visible=\{visible\}\s+title=\{renaming \? `Rename “\$\{cleanSavedFilterName\(renaming\.name\)\}”` : `Saved filters \(\$\{items\.length\}\)`\}\s+onClose=\{onClose\}\s+notices\s*>/);
    assert.equal((block.match(/<SheetKeyboardView>/g) ?? []).length, 2, 'Save, and Rename in Manage');
    assert.doesNotMatch(block, /<Modal\b|<Sheet\b|from '\.\/Sheet'/);
  });

  test('iOS has no live region: the note, a load failure and a name error are announced when they appear', () => {
    assert.match(block, /function useAnnounce\(text: string \| null\) \{\s*useEffect\(\(\) => \{\s*if \(text\) AccessibilityInfo\.announceForAccessibility\(text\);/);
    assert.match(block, /useAnnounce\(note\);/);
    assert.match(block, /useAnnounce\(failed \? `Couldn't load your saved filters\. \$\{describeError\(query\.error\)\}` : null\);/);
    assert.match(block, /useAnnounce\(error\);/);
    assert.doesNotMatch(block, /accessibilityLiveRegion/, 'Android only');
  });

  test('a name error plays the error haptic first, as the app\'s other inline form errors (iOS-5f)', () => {
    assert.match(block, /\} catch \(e\) \{\s*hapticOutcome\('error'\);\s*setError\(describeWriteError\(e\)\);/);
  });

  test('a chip whose view the app cannot apply whole says so to VoiceOver (Android: the icon only)', () => {
    assert.match(block, /accessibilityLabel=\{`\$\{cleanSavedFilterName\(d\.view\.name\)\}\$\{d\.leftOut\.length > 0 \? ', parts not on the app' : ''\}`\}/);
  });

  test('the iOS keyboard: Return saves, the ⓧ clears, Return is off while the name is empty', () => {
    assert.match(block, /returnKeyType="done"\s*enablesReturnKeyAutomatically\s*clearButtonMode="while-editing"\s*onSubmitEditing=\{\(\) => void submit\(\)\}/);
  });

  test('Android\'s versionCode-6 notice is not on iOS (S3)', () => {
    assert.doesNotMatch(block, /LegacyNotice|useLegacySavedFilters|previous version/);
  });
});

// The step-6 mutation check found four actions no test held (Android's tests miss them too): each is pinned here.
describe('saved filters: each action does what it says', () => {
  test('tapping a chip puts the view on the list: applySaved is the store\'s applySavedTicketFilter', () => {
    assert.match(screen, /\bapplySavedTicketFilter,\s*\} = useUiStore\(\);/);
    assert.match(screen, /const applySaved = \(content: SavedFilterContent\) => applySavedTicketFilter\(content\);/);
  });

  test('a delete happens only after "Delete" is confirmed (destructive), and never before the question', () => {
    assert.match(
      block,
      /const ok = await confirmAction\(\{\s*title: `Delete “\$\{name\}”\?`,[\s\S]*?confirmLabel: 'Delete',\s*destructive: true,\s*\}\);\s*if \(!ok\) return;\s*try \{\s*const \{ alreadyGone \} = await remove\.mutateAsync\(\{ id: view\.id \}\);/,
    );
    assert.equal((block.match(/remove\.mutateAsync\(/g) ?? []).length, 1, 'one delete call, behind the question');
  });

  test('"Save filter" saves the filters shown in the sheet: the same capture the block checked', () => {
    assert.match(block, /const capture = captureSavedView\(list, user\);/);
    assert.match(block, /<SaveFilterSheet visible=\{sheet === 'save'\} capture=\{capture\}/);
    assert.match(block, /await create\.mutateAsync\(\{ name, filters: capture\.filters, existing \}\);/);
    assert.equal((block.match(/create\.mutateAsync\(/g) ?? []).length, 1);
  });

  test('"Save these filters" is off until the list has loaded and while saving is refused (the reason shown under it)', () => {
    assert.match(
      block,
      /accessibilityLabel="Save these filters"\s*accessibilityState=\{\{ disabled: !ready \|\| !!saveProblem \}\}\s*disabled=\{!ready \|\| !!saveProblem\}\s*onPress=\{\(\) => setSheet\('save'\)\}/,
    );
    assert.match(block, /const saveProblem = ready \? savedViewSaveProblem\(views\.data, capture\) : null;/);
    assert.match(block, /\{saveProblem \? <Text className="mt-1 text-xs text-gray-600">\{saveProblem\}<\/Text> : null\}/);
  });
});
