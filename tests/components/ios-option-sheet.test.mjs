// iOS-5i step 5: OptionSheet `multiple` and the dropdown search on iPhone (UI-STANDARDS §18.1, §17.3, §iOS-A.17).
// Android's own checks of this component are in tests/filters/multi-select.test.mjs (step 6, with the Filters sheet that
// uses it) and tests/components/dropdown-search.test.mjs. These are the iOS ones: the page-sheet frame, Clear and Done in
// the bar (Ronit, decision 4), closing applies the ticks however it closes, VoiceOver, 44 pt, and the notice host a sheet
// that stays open can mount. Read as source: there is no React Native renderer in this repo.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

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

const sheet = code(read('src/components/OptionSheet.tsx'));
const frame = code(read('src/components/PageSheet.tsx'));

describe('one component: single choice and checkboxes are the same OptionSheet, in iOS\'s page sheet', () => {
  test('the two modes share one component; only OptionSheet has `multiple`', () => {
    assert.match(sheet, /export type OptionSheetProps<T extends string> = SingleProps<T> \| MultipleProps<T>;/);
    assert.match(sheet, /multiple \? \(\s*<CheckRow option=\{item\} checked=\{chosen\.has\(item\.value\)\} onToggle=\{toggle\} \/>\s*\) : \(\s*<OptionRow/);
    assert.equal(sourceFiles('src/components').filter((rel) => /Sheet\.tsx$/.test(rel) && /multiple/.test(code(read(rel)))).join(), 'src/components/OptionSheet.tsx');
    assert.match(sheet, /<PageSheet\b/);
    assert.doesNotMatch(sheet, /<Modal\b|from '\.\/Sheet'/, 'no second frame (Android\'s Sheet.tsx is not on iOS)');
  });

  test('a single-choice sheet is as before: ✕ on the left, radio rows, a pick applies and closes', () => {
    assert.match(sheet, /left=\{multiple \? <SheetTextButton[\s\S]*?\/> : undefined\}/, 'no `left` for one choice: PageSheet draws its ✕');
    assert.match(frame, /\{left \?\? <SheetClose onPress=\{onClose\} \/>\}/);
    assert.match(sheet, /accessibilityRole="radio"/);
    assert.match(sheet, /const pick = useStableCallback\(\(value: string\) => \{\s*setQuery\(''\);\s*if \(props\.multiple !== true\) props\.onSelect\(value as T\);\s*onClose\(\);/);
  });

  test('onDismiss still reaches the page sheet (a sheet that follows this one opens from it, iOS-5e)', () => {
    assert.match(sheet, /onDismiss=\{onDismiss\}/);
  });
});

describe('several at once: Clear and Done in the bar, and closing applies the ticks (Ronit, decision 4)', () => {
  test('Clear (left, dimmed while nothing is ticked) and Done (right, bold); no footer buttons', () => {
    assert.match(sheet, /left=\{multiple \? <SheetTextButton label="Clear" onPress=\{\(\) => setDraft\(\[\]\)\} disabled=\{draft\.length === 0\} \/> : undefined\}/);
    assert.match(sheet, /right=\{multiple \? <SheetTextButton label="Done" onPress=\{close\} bold \/> : undefined\}/);
    assert.doesNotMatch(sheet, /<OutlineButton|<SubmitButton/, 'Android\'s footer is in the bar on iOS');
    assert.match(frame, /accessibilityState=\{\{ disabled \}\}\s*disabled=\{disabled\}/, 'a dimmed Clear is "dimmed" to VoiceOver and takes no tap');
  });

  test('Done and a swipe down both close through close(), which hands the ticks over once, only if they changed', () => {
    assert.match(sheet, /onClose=\{close\}/);
    assert.match(frame, /onRequestClose=\{onClose\}/, 'a swipe down is PageSheet\'s onRequestClose');
    assert.match(sheet, /if \(multi && !sameChoices\(draft, committed \?\? \[\]\)\) \{/);
    assert.match(sheet, /multi\.onChange\(draft as T\[\], chosen as SheetOption<T>\[\]\);/);
    assert.match(sheet, /\}, \[visible\]\);/, 'the draft starts from the caller\'s choice each time the sheet opens');
  });

  test('"Select all" with the web\'s count, pinned above the list; "All …" clears; a chosen value outside the options keeps its row', () => {
    assert.ok(sheet.indexOf('<SearchField') < sheet.indexOf("'Select all shown' : 'Select all'"));
    assert.ok(sheet.indexOf("'Select all shown' : 'Select all'") < sheet.indexOf('<FlatList'));
    assert.match(sheet, /const count = remote \? selectionCountUnknownTotal\(draft\.length\) : selectionCount\(draft\.length, known\.length\);/);
    assert.match(sheet, /setDraft\(\(now\) => toggleAllShown\(known, shown, now\)\);/);
    assert.match(sheet, /<AllRow label=\{allLabel\} active=\{draft\.length === 0\} onPress=\{\(\) => setDraft\(\[\]\)\} \/>/);
    assert.match(sheet, /\(remote \? byLabel\(mergeOptions\(named, met, options\)\) : mergeOptions\(options, named\)\)/);
  });

  test('a server search (the technician filter): the chosen stay listed, new results change no state unless new', () => {
    assert.match(sheet, /if \(remote\) return query\.trim\(\) \? options : known\.filter\(\(o\) => pinned\.has\(o\.value\)\);/);
    assert.match(sheet, /return merged\.length === now\.length \? now : merged;/);
  });
});

describe('VoiceOver, Dynamic Type and 44 pt', () => {
  test('rows are checkboxes or radios with their state and a full label; "Select all" is mixed when some are ticked', () => {
    assert.match(sheet, /accessibilityRole="checkbox"\s*accessibilityState=\{\{ checked \}\}\s*accessibilityLabel=\{option\.description \? `\$\{option\.label\}, \$\{option\.description\}` : option\.label\}/);
    assert.match(sheet, /checked: allState === 'all' \? true : allState === 'some' \? 'mixed' : false/);
    assert.match(sheet, /accessibilityLabel=\{`\$\{typed \? 'Select all shown' : 'Select all'\}, \$\{count\}`\}/);
  });

  test('iOS has no live region: a server search\'s footer is announced in words when it changes', () => {
    assert.doesNotMatch(sheet, /accessibilityLiveRegion/, 'Android only');
    assert.match(sheet, /const spoken = remote\?\.announcement \?\? null;\s*useEffect\(\(\) => \{\s*if \(visible && spoken\) AccessibilityInfo\.announceForAccessibility\(spoken\);/);
  });

  test('every row and bar button grows with the text and is at least 44 pt; no tick plays a haptic', () => {
    for (const row of ['OptionRow', 'AllRow', 'CheckRow']) assert.ok(sheet.includes(`function ${row}`), row);
    assert.equal((sheet.match(/className="min-h-12 flex-row items-center border-b border-border px-4 py-3 active:bg-gray-50"/g) ?? []).length, 4, 'three row kinds and Select all');
    assert.doesNotMatch(sheet, /className="[^"]*(?<![\w-])h-\d/, 'no fixed height on anything that holds text');
    assert.match(frame, /className="min-h-11 min-w-11 justify-center px-2 active:opacity-60"/);
    assert.doesNotMatch(sheet, /haptic/i);
  });
});

describe('a sheet that stays open after a write shows its own notices (Ronit, decision 4)', () => {
  test('PageSheet `notices` mounts a host inside the sheet, under its bar', () => {
    assert.match(frame, /\{notices \? <SuccessNoticeHost top=\{NOTICE_TOP\} \/> : null\}/);
    assert.match(frame, /const NOTICE_TOP = 64;/);
    const host = code(read('src/components/SuccessNotice.tsx'));
    assert.match(host, /top: top \?\? insets\.top \+ 8/);
  });
});
