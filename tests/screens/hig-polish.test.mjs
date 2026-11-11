// iOS-4: the HIG polish, accessibility and the two App Review items (docs/ios/00-PORT-MANIFEST.md §4.13).
// 1. every control is at least 44 × 44 pt and has an accessibilityLabel;
// 2. Reduce Motion: the page sheets fade instead of sliding; every Modal honours it;
// 3. haptics: one documented meaning each, played by the shared write paths;
// 4. Dynamic Type: the iOS text styles, the title caps, the accessibility layouts, readable KB tables;
// 5. VoiceOver: no control hidden inside another; the priority preview is announced;
// 6. appearance: light only, nothing reads the system scheme; brand yellow never text or an icon;
// 7. the ticket list's search (iOS-8a: Android's field, fixed under the navigation bar) searches exactly as before;
// 8. account deletion (iOS-9b): a confirmation, then Create Ticket filled in; the person picks the category and sends it;
// 9. the privacy policy and the support URL: the row, and the release guard that refuses a production build without them.
// Source checks read the files as text, as the other screen tests do; pure modules are run.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { __clearHaptics, __haptics } from 'expo-haptics';
import { __alerts, __clearAlerts, __pressAlertButton } from 'react-native';

import { ApiClientError } from '../../src/api/errors.ts';
import { apiClient } from '../../src/api/client.ts';
import { MOBILE_TICKET_SOURCE, createTicket } from '../../src/api/tickets.api.ts';
import { PRIVACY_POLICY_URL, SUPPORT_URL } from '../../src/config/legal.ts';
import { validateNewTicket } from '../../src/hooks/useCreateTicket.ts';
import { ACCESSIBILITY_TEXT_SCALE, isAccessibilityTextScale } from '../../src/hooks/useTextSize.ts';
import { loginLayout } from '../../src/theme/brand.ts';
import { fontSize, loginType, maxTextScale, textStylePoints } from '../../src/theme/typography.ts';
import { USER_ROLES } from '../../src/types/enums.ts';
import {
  DELETION_CONFIRM_LABEL, DELETION_CONFIRM_MESSAGE, DELETION_CONFIRM_TITLE, DELETION_TICKET_TITLE, accountDeletionPrefill,
  accountRows, deletionTicketDescription,
} from '../../src/utils/accountDeletion.ts';
import { plainTextToHtml } from '../../src/utils/compose.ts';
import { confirmAction, notify, notifyWarning, reportWriteError } from '../../src/utils/dialogs.ts';
import { bulkOutcomeHaptic, hapticSelection } from '../../src/utils/haptics.ts';
import { TABLE_MIN_COLUMN_WIDTH, tableColumnCount, tableLayoutWidth } from '../../src/utils/html.ts';
import { subscribeToSuccessNotices } from '../../src/utils/successNotice.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const require = createRequire(import.meta.url);
const { verdict, legalValuesFrom } = require('../../scripts/eas-build-guard.js');

/** Source without comments, so a comment that names an API is not mistaken for a use. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir, pattern = /\.tsx?$/) {
  return readdirSync(path.join(REPO, dir)).flatMap((entry) => {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel, pattern);
    return pattern.test(entry) ? [rel] : [];
  });
}

/** Every opening `<Tag …>` in a source, attributes included (braces and strings skipped), with its line. */
function openingTags(src, tag) {
  const out = [];
  // Not a generic such as useRef<TextInput>: a JSX tag never follows an identifier.
  const re = new RegExp(`(?<![\\w.])<${tag}(?=[\\s>/])`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + tag.length + 1;
    let depth = 0;
    let quote = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    out.push({ text: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** A file's string constants (`const NAME = '…';`), so `${NAME}` in a className can be read. */
function expandConstants(src, text) {
  const constants = Object.fromEntries([...src.matchAll(/^const (\w+) = '([^']*)';/gm)].map((m) => [m[1], m[2]]));
  return text.replace(/\$\{(\w+)\}/g, (whole, name) => constants[name] ?? whole);
}

const TSX = sourceFiles('src', /\.tsx$/);

/**
 * iOS-5c: Pressables sized by a StyleSheet style from a theme token, not a class: the style, and its height and minimum
 * width in pt. Login's sign-in pill is Android's design, a fixed 52 pt (tests/motion/start-up-and-login.test.mjs pins
 * `pill: { height: H, minWidth: H, … }` with H = loginLayout.button.height).
 */
const TOKEN_SIZED = {
  'src/screens/auth/SignInButton.tsx': [{ style: 'style={styles.pill}', height: loginLayout.button.height, width: loginLayout.button.height }],
  // iOS-5g, Android's email form (UI-STANDARDS.md §15.2): "Sign in with email instead" (48 pt tall, as wide as its
  // words), the show/hide toggle (48 × 48) and "Sign in" (at least 52 pt, the form's width). The sizes are pinned in
  // tests/auth/ios-password-sign-in.test.mjs and tests/login/sign-in-button.test.mjs.
  'src/screens/auth/EmailSignInForm.tsx': [
    { style: 'style={styles.action}', height: loginLayout.emailForm.actionHeight, width: loginLayout.emailForm.actionHeight },
    { style: 'style={styles.toggle}', height: loginLayout.emailForm.toggle, width: loginLayout.emailForm.toggle },
    { style: 'style={[submitStyle.button,', height: loginLayout.emailForm.submit.height, width: loginLayout.emailForm.submit.height },
  ],
};

/**
 * iOS-5f: Android's PressableCard (components/PressFeedback.tsx) is a Pressable whose classes and label all come from
 * its caller (`<Pressable {...props} …>`). So that one tag is not checked itself; instead every `<PressableCard>` in
 * src/ is checked exactly as a Pressable is, below.
 */
const PRESSABLE_TAGS = ['Pressable', 'PressableCard'];
const PASS_THROUGH = { 'src/components/PressFeedback.tsx': /^<Pressable \{\.\.\.props\} \{\.\.\.feedback\.pressProps\(\{ onPressIn, onPressOut \}\)\}>$/ };
const isPassThrough = (rel, text) => !!PASS_THROUGH[rel]?.test(text.replace(/\s+/g, ' '));

// ── 1. Targets and labels ────────────────────────────────────

describe('every control: at least 44 × 44 pt, and a VoiceOver label', () => {
  test('every Pressable reaches 44 pt tall (and wide, when its width is set), with its hit slop', () => {
    const PT = (step) => Number(step) * 4; // spacing.ts: step n = n × 0.25rem = 4n pt
    const short = [];
    let checked = 0;
    let passThrough = 0;
    for (const rel of TSX) {
      const src = read(rel);
      for (const { text, line } of PRESSABLE_TAGS.flatMap((tag) => openingTags(src, tag))) {
        if (isPassThrough(rel, text)) {
          passThrough += 1;
          continue;
        }
        checked += 1;
        const attrs = expandConstants(src, text);
        const sized = TOKEN_SIZED[rel]?.find((s) => attrs.includes(s.style));
        if (sized) {
          if (sized.height < 44 || sized.width < 44) short.push(`${rel}:${line}`);
          continue;
        }
        const sizes = (prop) => [...attrs.matchAll(new RegExp(`(?:^|[\\s\`'"])(?:min-)?${prop}-(\\d+(?:\\.5)?)(?=[\\s\`'"])`, 'g'))].map((m) => PT(m[1]));
        const slop = Number(attrs.match(/hitSlop=\{(\d+)\}/)?.[1] ?? 0);
        const heights = sizes('h');
        const widths = sizes('w');
        const tall = heights.length > 0 && Math.max(...heights) + 2 * slop >= 44;
        const wide = widths.length === 0 || Math.max(...widths) + 2 * slop >= 44;
        if (!tall || !wide) short.push(`${rel}:${line}`);
      }
    }
    assert.ok(checked > 50, `found ${checked} Pressables`);
    assert.equal(passThrough, Object.keys(PASS_THROUGH).length, 'the one pass-through Pressable is where it is expected');
    assert.deepEqual(short, [], 'HIG Buttons: "a button needs a hit region of at least 44x44 pt"');
  });

  test('the hit slop is only for chips in a row: a lone icon button is 44 pt itself', () => {
    for (const rel of TSX) {
      const src = read(rel);
      for (const { text, line } of PRESSABLE_TAGS.flatMap((tag) => openingTags(src, tag))) {
        const iconOnly = /(?:^|[\s`'"])w-(\d+)(?=[\s`'"])/.exec(text);
        if (iconOnly && Number(iconOnly[1]) * 4 < 44) assert.fail(`${rel}:${line}: an icon button narrower than 44 pt`);
      }
    }
  });

  test('every Pressable, TextInput and Switch has an accessibilityLabel', () => {
    const missing = [];
    for (const rel of TSX) {
      const src = read(rel);
      for (const tag of [...PRESSABLE_TAGS, 'TextInput', 'Switch']) {
        for (const { text, line } of openingTags(src, tag)) {
          if (isPassThrough(rel, text)) continue;
          if (!/\baccessibilityLabel=/.test(text)) missing.push(`${rel}:${line} <${tag}>`);
        }
      }
    }
    assert.deepEqual(missing, [], 'HIG VoiceOver: "Provide alternative labels for all key interface elements"');
  });

  test('no control sits inside another: the ticket card and an attachment row offer theirs as VoiceOver actions', () => {
    const card = code(read('src/components/TicketCard.tsx'));
    assert.match(card, /name: 'changeStatus', label: 'Change status'/);
    assert.match(card, /name: 'select', label: 'Select'/);
    assert.match(card, /actionName === 'changeStatus'\) onStatusPress\?\.\(ticket\)/);
    assert.match(card, /actionName === 'select'\) onLongPress\?\.\(ticket\.id\)/);
    const detail = code(read('src/screens/tickets/TicketDetailScreen.tsx'));
    for (const action of ["name: 'details'", "name: 'share', label: 'Download and share'", "name: 'delete', label: 'Delete'"]) {
      assert.ok(detail.includes(action), action);
    }
    assert.match(detail, /action === 'delete' && canDelete\) onDelete\?\.\(attachment\)/, 'the same condition as the button');
  });

  test('VoiceOver hears the new priority (the live region is Android only)', () => {
    const src = code(read('src/screens/tickets/TicketPropertyEditors.tsx'));
    assert.match(src, /if \(spoken\) AccessibilityInfo\.announceForAccessibility\(spoken\);/);
    assert.match(src, /preview\?\.kind === 'computed' \? `Priority: /);
  });

  test('decorative initials are hidden from VoiceOver (HIG: "Exclude purely decorative images")', () => {
    for (const rel of ['src/navigation/MoreScreen.tsx', 'src/screens/profile/ProfileScreen.tsx', 'src/screens/tickets/TicketDetailScreen.tsx']) {
      const src = code(read(rel));
      for (const m of src.matchAll(/\{initials\(/g)) {
        const before = src.slice(Math.max(0, m.index - 400), m.index);
        assert.match(before, /accessibilityElementsHidden\s+importantForAccessibility="no-hide-descendants"/, rel);
      }
    }
  });
});

// ── 2. Reduce Motion ─────────────────────────────────────────

describe('Reduce Motion skips the motion', () => {
  test('the page sheets fade instead of sliding when Reduce Motion is on', () => {
    const src = code(read('src/components/PageSheet.tsx'));
    assert.match(src, /const reduceMotion = useReduceMotion\(\);/);
    assert.match(src, /animationType=\{reduceMotion \? 'fade' : 'slide'\}/);
    assert.match(src, /presentationStyle="pageSheet"/);
    assert.match(src, /allowSwipeDismissal/);
  });

  test('every Modal either fades or is the page sheet: nothing slides past Reduce Motion', () => {
    for (const rel of TSX) {
      for (const { text, line } of openingTags(read(rel), 'Modal')) {
        const fades = /animationType="fade"/.test(text);
        const pageSheet = rel === 'src/components/PageSheet.tsx' && /reduceMotion \? 'fade' : 'slide'/.test(text);
        assert.ok(fades || pageSheet, `${rel}:${line}`);
      }
    }
  });

  test('the four picker sheets are page sheets, with no grabber they could not be dragged by', () => {
    for (const name of ['OptionSheet', 'PersonPickerSheet', 'TemplatePickerSheet', 'DatePickerSheet']) {
      const src = code(read(`src/components/${name}.tsx`));
      assert.match(src, /<PageSheet\b/, name);
      assert.doesNotMatch(src, /<Modal\b/, name);
      assert.doesNotMatch(src, /h-1 w-10 self-center rounded-full/, `${name}: the grabber`);
    }
    const date = code(read('src/components/DatePickerSheet.tsx'));
    assert.match(date, /left=\{<SheetTextButton label="Cancel"/, 'Done comes with Cancel (HIG, Sheets)');
    assert.match(date, /right=\{<SheetTextButton label="Done"/);
  });

  test('no animation uses a spring or a bounce', () => {
    for (const rel of sourceFiles('src')) assert.doesNotMatch(code(read(rel)), /Animated\.spring|withSpring|Easing\.bounce|Easing\.elastic/, rel);
  });
});

// ── 3. Haptics ───────────────────────────────────────────────

describe('haptics: one documented meaning each (HIG, Playing haptics)', () => {
  beforeEach(() => {
    __clearHaptics();
    __clearAlerts();
  });

  test('a write that finished: success, with the notice', () => {
    const seen = [];
    const stop = subscribeToSuccessNotices((n) => seen.push(n));
    notify('Reply sent');
    stop();
    assert.deepEqual(__haptics(), ['success']);
    assert.equal(seen[0].tone, 'success');
  });

  test('a partial outcome: warning, with the amber notice, never the success tick', () => {
    const seen = [];
    const stop = subscribeToSuccessNotices((n) => seen.push(n));
    notifyWarning("Couldn't mark it read: You're offline.");
    stop();
    assert.deepEqual(__haptics(), ['warning']);
    assert.equal(seen[0].tone, 'warning');
    const alerts = code(read('src/screens/notifications/NotificationsScreen.tsx'));
    assert.match(alerts, /notifyWarning\(`Couldn't mark it read: /);
    assert.doesNotMatch(alerts, /notify\(`Couldn't/, 'a failure never shows the success notice');
  });

  test('a failed write: error, with the Alert; a 401 (already signed out) plays nothing and shows nothing', () => {
    reportWriteError('Failed to update status', new ApiClientError('http', 409, { error: 'Conflict' }));
    assert.deepEqual(__haptics(), ['error']);
    assert.equal(__alerts().length, 1);
    __clearHaptics();
    __clearAlerts();
    reportWriteError('Failed to update status', new ApiClientError('http', 401, { error: 'Unauthorized' }));
    assert.deepEqual(__haptics(), []);
    assert.equal(__alerts().length, 0);
  });

  test('a bulk run: success when all went through, error when none did, warning in between', () => {
    const run = (...states) => states.map((state) => ({ state }));
    assert.equal(bulkOutcomeHaptic(run('done', 'done')), 'success');
    assert.equal(bulkOutcomeHaptic(run('failed', 'failed')), 'error');
    assert.equal(bulkOutcomeHaptic(run('done', 'failed')), 'warning');
    assert.equal(bulkOutcomeHaptic(run('done', 'skipped')), 'warning');
    assert.equal(bulkOutcomeHaptic(run('done', 'not-run')), 'warning');
    assert.equal(bulkOutcomeHaptic(run('skipped')), 'warning');
    assert.match(code(read('src/components/BulkProgressModal.tsx')), /if \(wasRunning\.current && !running && progress\) hapticOutcome\(bulkOutcomeHaptic\(progress\.outcomes\)\);/);
  });

  test('a selection change: the selection haptic, from the chips, the segmented tabs and a selected ticket', () => {
    hapticSelection();
    assert.deepEqual(__haptics(), ['selection']);
    assert.match(code(read('src/components/Filters.tsx')), /if \(!\(role === 'radio' && active\)\) hapticSelection\(\);/, 'a chip already on plays nothing');
    assert.match(code(read('src/screens/tickets/TicketDetailScreen.tsx')), /if \(t === highlighted\) return;\s*hapticSelection\(\);/);
    assert.equal((code(read('src/screens/tickets/TicketListScreen.tsx')).match(/hapticSelection\(\);/g) ?? []).length, 2, 'select and deselect');
  });

  test('an approval decision and a created ticket whose files failed play their own outcome', () => {
    assert.match(code(read('src/screens/approvals/ApprovalDetailScreen.tsx')), /setResult\(res\);\s*hapticOutcome\('success'\);/);
    assert.match(code(read('src/screens/tickets/CreateTicketScreen.tsx')), /if \(result\.uploadError\) \{\s*hapticOutcome\('warning'\);/);
  });

  test('only utils/haptics.ts talks to expo-haptics', () => {
    const users = sourceFiles('src').filter((rel) => /from 'expo-haptics'/.test(read(rel)));
    assert.deepEqual(users, ['src/utils/haptics.ts']);
  });
});

// ── 4. Dynamic Type ──────────────────────────────────────────

describe('Dynamic Type: the iOS text styles, the caps and the large-text layouts', () => {
  test('the type scale is iOS\'s text styles at the default size (HIG Typography, "Large (default)")', () => {
    const pt = (rem) => Number(rem.replace('rem', '')) * 16;
    const got = Object.fromEntries(Object.entries(fontSize).map(([k, [size, { lineHeight }]]) => [k, [pt(size), pt(lineHeight)]]));
    assert.deepEqual(got, {
      xs: [12, 16], // Caption 1
      sm: [15, 20], // Subhead
      base: [17, 22], // Body
      lg: [20, 25], // Title 3
      xl: [22, 28], // Title 2
      '2xl': [28, 34], // Title 1
      '3xl': [34, 41], // Large Title
    });
    assert.equal(textStylePoints.body, 17);
    assert.ok(Math.min(...Object.values(got).map(([size]) => size)) >= 11, 'nothing below iOS\'s 11 pt minimum');
  });

  test('titles stop growing where iOS\'s own do (AX5 ÷ Large); body and caption text is never capped', () => {
    assert.equal(maxTextScale.largeTitle, 60 / 34);
    assert.equal(maxTextScale.title1, 58 / 28);
    assert.equal(maxTextScale.title2, 56 / 22);
    assert.equal(maxTextScale.title3, 55 / 20);
    assert.ok(loginType.headline.fontSize >= textStylePoints.title3 && loginType.headlineMaxScale <= maxTextScale.largeTitle);
    for (const rel of TSX) {
      for (const { text, line } of openingTags(read(rel), 'Text')) {
        if (!/maxFontSizeMultiplier=/.test(text)) continue;
        // iOS-5c: Login's 42 pt headline (Android's design, a style, not a class) is a title too; it stops at 1.3 ×,
        // sooner than iOS's Large Title, so a line never wraps (UI-STANDARDS §10.1, §iOS-A.12).
        const loginHeadline = /maxFontSizeMultiplier=\{loginType\.headlineMaxScale\}/.test(text) && /style=\{styles\.headline\}/.test(text);
        // iOS-5f: the people row's avatar initials (Android's ×1.2, so two letters fit the 25 pt circle; the name
        // beside them is never capped).
        const peopleInitials = rel === 'src/components/PeopleRow.tsx' && /maxFontSizeMultiplier=\{INITIALS_MAX_SCALE\}/.test(text);
        const capped = /text-(lg|xl|2xl|3xl)\b/.test(text) || /maxFontSizeMultiplier=\{1\.4\}/.test(text) || loginHeadline || peopleInitials;
        assert.ok(capped, `${rel}:${line}: a cap on text that isn't a title, an initial or a badge count`);
      }
    }
  });

  test('the accessibility text sizes start at AX1, as UIKit\'s isAccessibilityCategory', () => {
    assert.equal(ACCESSIBILITY_TEXT_SCALE, 1.786);
    assert.equal(isAccessibilityTextScale(1), false);
    assert.equal(isAccessibilityTextScale(1.353), false, 'xxxLarge, the largest standard size');
    assert.equal(isAccessibilityTextScale(1.786), true, 'AX1');
    assert.equal(isAccessibilityTextScale(3.571), true, 'AX5');
  });

  test('at those sizes the multi-column rows become one column, and nothing shrinks its text to fit', () => {
    const home = code(read('src/screens/dashboard/HomeScreen.tsx'));
    assert.match(home, /const perRow = largeText \? 1 : 2;/, 'KPI tiles');
    assert.match(home, /adjustsFontSizeToFit=\{!largeText\}/);
    const detail = code(read('src/screens/tickets/TicketDetailScreen.tsx'));
    assert.match(detail, /\$\{largeText \? 'w-1\/2' : 'flex-1'\}/, 'the four tabs, two by two');
    assert.match(detail, /adjustsFontSizeToFit=\{!largeText\}/);
    assert.match(code(read('src/components/TicketCard.tsx')), /largeText \? 'mb-1 items-start' : 'mb-1 flex-row items-center'/);
    assert.match(code(read('src/components/Form.tsx')), /const shrink = compact && !largeText;/);
    assert.match(code(read('src/screens/tickets/TicketListScreen.tsx')), /stacked=\{largeText\}/);
  });

  test('controls grow with the text: no fixed height on a button, a field or a chip', () => {
    assert.match(code(read('src/components/Form.tsx')), /min-h-12 flex-row items-center justify-center rounded-lg px-4 py-2/);
    assert.match(code(read('src/components/Filters.tsx')), /min-h-11 flex-row items-center rounded-lg border/);
    assert.match(code(read('src/components/Filters.tsx')), /min-h-9 flex-row items-center rounded-full/);
  });

  test('knowledge-base tables: a minimum column width that grows with the text, scrolling sideways when wider', () => {
    const cell = (tagName) => ({ tagName, children: [] });
    const row = (n) => ({ tagName: 'tr', children: Array.from({ length: n }, () => cell('td')) });
    const table = { tagName: 'table', children: [{ tagName: 'thead', children: [{ tagName: 'tr', children: [cell('th'), cell('th')] }] }, { tagName: 'tbody', children: [row(3), row(2)] }] };
    assert.equal(tableColumnCount(table), 3);
    const nested = { tagName: 'table', children: [{ tagName: 'tbody', children: [{ tagName: 'tr', children: [{ tagName: 'td', children: [{ tagName: 'table', children: [row(9)] }] }] }] }] };
    assert.equal(tableColumnCount(nested), 1, 'a nested table is its own table');
    assert.equal(TABLE_MIN_COLUMN_WIDTH, 120);
    assert.equal(tableLayoutWidth(2, 1, 300), 300, 'fits: the width it has');
    assert.equal(tableLayoutWidth(4, 1, 300), 480, 'wider: 4 × 120');
    assert.equal(tableLayoutWidth(2, 3.571, 300), 2 * Math.round(120 * 3.571), 'AX5');
    const html = code(read('src/components/HtmlText.tsx'));
    // iOS-5f: + Android's <cid-image> paperclip (tests/polish/cid-image.test.mjs).
    assert.match(html, /const RENDERERS = \{ img: ImgRenderer, table: TableRenderer, \[CID_IMAGE_TAG\]: CidImageRenderer \};/);
    assert.match(html, /<ScrollView horizontal/);
  });
});

// ── 6. Appearance and colour ─────────────────────────────────

describe('appearance: light only (D9), and brand yellow never as text', () => {
  test('userInterfaceStyle is "light"', () => {
    assert.equal(JSON.parse(read('app.json')).expo.userInterfaceStyle, 'light');
  });

  test('nothing reads the system appearance, so nothing renders dark on a dark-mode phone', () => {
    for (const rel of [...sourceFiles('src'), 'App.tsx']) {
      assert.doesNotMatch(code(read(rel)), /useColorScheme|Appearance\.|\bdark:|PlatformColor|DynamicColorIOS/, rel);
    }
    assert.match(read('App.tsx'), /<StatusBar barStyle="dark-content" \/>/);
    assert.match(read('src/components/DatePickerSheet.tsx'), /themeVariant="light"/);
    assert.doesNotMatch(read('tailwind.config.js'), /darkMode/);
  });

  test('brand yellow (1.5:1 on white) is never a text or icon colour: only the decorative illustrations use it', () => {
    for (const rel of sourceFiles('src')) {
      if (rel === 'src/theme/colors.ts') continue;
      const src = code(read(rel));
      assert.doesNotMatch(src, /colors\.(secondary|accent)\b|\b(text|bg|border)-(secondary|accent)\b|#ff(cc00|cb03)\b|#fecb03\b/i, rel);
    }
  });
});

// ── 7. Search under the navigation bar ───────────────────────
// iOS-8a replaces iOS-4's search in the navigation bar (under a large title the search and the first card overlapped on
// a device): Android's field, in a toolbar fixed under the bar. The search rules are iOS-4's, unchanged.

describe('the ticket list: Android\'s search field, fixed under the navigation bar (iOS-8a)', () => {
  const src = code(read('src/screens/tickets/TicketListScreen.tsx'));

  test('the search field and the Filters button, under the bar; nothing in the bar but the title', () => {
    assert.doesNotMatch(src, /headerSearchBarOptions|SearchBarCommands/, 'the bar\'s own search field is gone');
    assert.match(src, /<SearchField\s+value=\{searchText\}\s+onChangeText=\{onSearchTextChange\}\s+onClear=\{clearSearch\}/);
    assert.match(src, /placeholder="Ticket #, subject, requester or technician"/);
    assert.match(src, /<FiltersButton on=\{filtersOn\} onPress=\{openFilters\} \/>/);
    assert.match(src, /title: ticketsTitle\(role\),\s*headerLeft: undefined,\s*headerRight: undefined,/);
  });

  test('it searches exactly as before: search key submits, a link opens the resolver, an emptied field or ⓧ clears', () => {
    assert.match(src, /onSubmitEditing=\{\(\) => submitSearch\(searchText\)\}\s*returnKeyType="search"/);
    assert.match(src, /if \(looksLikeUrl\(text\)\) \{\s*navigation\.navigate\('TicketLink', \{ link: text\.trim\(\) \}\);/);
    assert.match(src, /setSearch\(normaliseTicketSearch\(text\)\);/);
    assert.match(src, /if \(text === ''\) setSearch\(undefined\);/);
    assert.match(src, /const clearSearch = useStableCallback\(\(\) => \{\s*setSearchText\(''\);\s*setSearch\(undefined\);/);
  });

  test('the filter rows are fixed with the search, and ride at the top of the list only at the accessibility sizes', () => {
    assert.match(src, /\{searchRow\}\s*\{largeText \? null : filterRows\}/);
    assert.match(src, /const listHeader = largeText \? \(/);
    assert.equal((src.match(/<StateScroll header=\{listHeader\} style=\{contentStyle\}/g) ?? []).length, 3, 'offline, loading and error');
    assert.match(src, /ListHeaderComponent=\{listHeader\}/);
    const inbox = code(read('src/screens/approvals/ApprovalsInboxScreen.tsx'));
    assert.doesNotMatch(inbox, /SearchField|headerSearchBarOptions/, 'Approvals has no search on web or Android');
  });
});

// ── 8. Account deletion ──────────────────────────────────────

// iOS-9b (Ronit, 2026-11-11): MMG has no deletion category and IT has agreed no deletion time, so the iOS-4 request (a
// ticket sent from Profile under a named category, with "within N working days") became: a confirmation, then the
// EXISTING Create Ticket sheet, filled in. The person picks the category and creates it through the normal flow.
describe('account deletion: a confirmation, then Create Ticket filled in; the person picks the category and sends it (H6)', () => {
  const sent = [];
  apiClient.defaults.adapter = async (config) => {
    sent.push({ method: config.method, url: config.url, data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data });
    return { data: { id: 'tkt-new', ticketNumber: 4321 }, status: 201, statusText: 'Created', headers: { 'content-type': 'application/json' }, config };
  };
  beforeEach(() => {
    sent.length = 0;
    __clearAlerts();
  });

  const user = { id: 'user-7', displayName: 'Asha Mrema', email: 'asha.mrema@mountmerugroup.com', role: 'END_USER' };
  const profile = code(read('src/screens/profile/ProfileScreen.tsx'));
  const flow = profile.slice(profile.indexOf('const requestDeletion'), profile.indexOf('const set = (key'));
  const create = code(read('src/screens/tickets/CreateTicketScreen.tsx'));
  /** Words that would promise a time. None may appear anywhere in the flow. */
  const TIMELINE = /\b(days?|weeks?|hours?|months?|within|working|business|by hand|soon|immediately|promptly)\b|\d/i;

  test('the confirmation appears first: its title, its buttons, and Cancel opens nothing', async () => {
    const asked = flow.indexOf('await confirmAction(');
    assert.ok(asked >= 0, 'it asks');
    assert.ok(asked < flow.indexOf('if (!ok) return;'));
    assert.ok(flow.indexOf('if (!ok) return;') < flow.indexOf("navigation.navigate('CreateTicket'"), 'nothing opens before the OK');
    assert.match(flow, /title: DELETION_CONFIRM_TITLE,\s*message: DELETION_CONFIRM_MESSAGE,\s*confirmLabel: DELETION_CONFIRM_LABEL,/);
    assert.doesNotMatch(flow, /destructive: true/, 'a deliberate choice: the default style (HIG Alerts)');

    const answer = confirmAction({ title: DELETION_CONFIRM_TITLE, message: DELETION_CONFIRM_MESSAGE, confirmLabel: DELETION_CONFIRM_LABEL });
    const alert = __alerts().at(-1);
    assert.equal(alert.title, 'Request account deletion?');
    assert.equal(alert.message, DELETION_CONFIRM_MESSAGE);
    assert.deepEqual(alert.buttons.map((b) => [b.text, b.style]), [['Cancel', 'cancel'], ['Continue', 'default']]);
    __pressAlertButton('Cancel');
    assert.equal(await answer, false);
    assert.equal(sent.length, 0, 'Cancel sent nothing');
  });

  test('the message: a request for IT, raised by the person, updated on that ticket; no time promised', () => {
    assert.equal(
      DELETION_CONFIRM_MESSAGE,
      'This opens a new Service Desk request, filled in for you, asking Mount Meru IT to delete your Setu / Service Desk account. Choose a category and create it as you would any ticket: nothing is sent until you do. IT deletes the account and updates you on that ticket. Records Mount Meru must keep, such as tickets you raised, may be kept. Your Mount Meru work account (Microsoft) is not affected.',
    );
    assert.doesNotMatch(DELETION_CONFIRM_MESSAGE, TIMELINE);
  });

  test('on Continue, Create Ticket opens filled in: the subject, and the description with the signed-in email', () => {
    assert.match(flow, /navigation\.navigate\('CreateTicket', \{ prefill: accountDeletionPrefill\(user\) \}\);/);
    const prefill = accountDeletionPrefill(user);
    assert.deepEqual(prefill, {
      title: 'Account deletion request',
      description: 'Please delete my Setu / Service Desk account (asha.mrema@mountmerugroup.com)',
    });
    assert.deepEqual(Object.keys(prefill).sort(), ['description', 'title'], 'the text only: never a category or anything else');
    assert.equal(accountDeletionPrefill({ email: '  x@y.z ' }).description, 'Please delete my Setu / Service Desk account (x@y.z)');
    assert.equal(deletionTicketDescription(''), 'Please delete my Setu / Service Desk account', 'no email: no empty brackets');
    assert.equal(DELETION_TICKET_TITLE, 'Account deletion request');
    for (const text of Object.values(prefill)) assert.doesNotMatch(text.replace('asha.mrema@mountmerugroup.com', ''), TIMELINE);
    // As filled in, the form is NOT ready to send: the person must still choose the category (the normal validation).
    assert.equal(validateNewTicket({ ...prefill, categoryId: null }), 'Please select a Category');
    assert.equal(validateNewTicket({ ...prefill, categoryId: 'cat-picked' }), null);
  });

  test('nothing is sent without the person\'s tap: Profile creates no ticket, looks nothing up and picks no category', () => {
    assert.doesNotMatch(profile, /useCreateTicket|useCategories|createTicket\(|categoryId|findDeletionCategory|requireOnline/);
    assert.doesNotMatch(flow, /mutateAsync|refetch|apiClient|Alert\.alert/, 'the flow only asks, then navigates');
    assert.equal(profile.split('mutateAsync(').length - 1, 1, "Profile's one write is its own profile save (USR-2)");
    assert.match(profile, /await update\.mutateAsync\(\{ form, before: profile\.data \}\);/);
    // Create Ticket sends only from submit(): validation, then its own "Create this ticket?" confirmation, then TKT-2.
    const submit = create.slice(create.indexOf('async function submit()'), create.indexOf('const busy = create.isPending;'));
    const order = ['validateNewTicket({ title, description, categoryId })', "title: 'Create this ticket?'", 'if (!ok) return;', 'create.mutateAsync('];
    const at = order.map((needle) => submit.indexOf(needle));
    assert.ok(at.every((i) => i >= 0), JSON.stringify(at));
    assert.deepEqual([...at].sort((a, b) => a - b), at, 'validated, confirmed, then sent');
    assert.equal(create.split('create.mutateAsync(').length - 1, 1, 'one send, in submit()');
  });

  test('Create Ticket: `prefill` seeds only the first title and description; the category comes from the cascade only', () => {
    assert.match(create, /const prefill = route\.params\?\.prefill;/);
    assert.match(create, /const \[initialTitle\] = useState\(\(\) => \(prefill \? `\$\{INITIAL_TITLE\}\$\{prefill\.title\}` : INITIAL_TITLE\)\);/);
    assert.match(create, /const \[initialDescription\] = useState\(\(\) => prefill\?\.description \?\? ''\);/);
    assert.match(create, /const \[title, setTitle\] = useState\(initialTitle\);/);
    assert.match(create, /const \[description, setDescription\] = useState\(initialDescription\);/);
    assert.equal(create.split('prefill').length - 1, 5, 'read once (2), used for the two starting texts only (3)');
    assert.match(create, /const categoryId = itemId \|\| subId \|\| topId;/);
    // Closing an unchanged pre-filled form asks nothing, as an empty one; any change of the person's is guarded.
    assert.match(create, /const dirty = title !== initialTitle \|\| description\.trim\(\) !== initialDescription\.trim\(\) \|\| !!categoryId \|\| files\.length > 0;/);
    assert.match(read('src/types/navigation.ts'), /CreateTicket: \{ prefill\?: CreateTicketPrefill \} \| undefined;/);
    assert.match(read('src/types/navigation.ts'), /export interface CreateTicketPrefill \{\s*title: string;\s*description: string;\s*\}/);
  });

  test('every role that can create tickets gets it, and TKT-2 sends the person\'s category with the text', async () => {
    // The row is not role-gated (only a real signed-in account), as Create Ticket is open to every role.
    assert.match(profile, /const canRequestDeletion = !!user && !placeholder;/);
    assert.doesNotMatch(flow, /role|isStaff|isAgentOrAdmin|createTicketPermissions/);
    assert.doesNotMatch(read('src/screens/tickets/TicketListScreen.tsx').match(/\/\/ "\+" FAB[\s\S]*?<\/Pressable>/)[0], /role|isStaff/);
    const prefill = accountDeletionPrefill(user);
    for (const role of USER_ROLES) {
      sent.length = 0;
      // As useCreateTicket() builds it from the form: the description as <p> HTML, source API; nothing else filled in.
      await createTicket({ ...prefill, description: plainTextToHtml(prefill.description), categoryId: 'cat-picked', source: MOBILE_TICKET_SOURCE, impact: undefined, urgency: undefined }, role);
      assert.equal(sent.length, 1, role);
      assert.equal(sent[0].method, 'post');
      assert.equal(sent[0].url, '/tickets');
      assert.deepEqual(sent[0].data, {
        title: 'Account deletion request',
        description: '<p>Please delete my Setu / Service Desk account (asha.mrema@mountmerugroup.com)</p>',
        categoryId: 'cat-picked',
        source: 'API',
      }, role);
    }
  });

  test('no hard-coded category and no timeline, anywhere: the module, legal.ts, Profile and the build guard', () => {
    const module = code(read('src/utils/accountDeletion.ts'));
    // "Choose a category" is the only mention: an instruction to the person, never a value, field or lookup.
    assert.doesNotMatch(module.replace('Choose a category and create it', ''), /categor/i);
    for (const rel of ['src/config/legal.ts', 'src/screens/profile/ProfileScreen.tsx', 'src/utils/accountDeletion.ts', 'scripts/eas-build-guard.js']) {
      assert.doesNotMatch(code(read(rel)), /ACCOUNT_DELETION_CATEGORY|ACCOUNT_DELETION_WORKING_DAYS|deletionCategory|deletionWorkingDays/, rel);
    }
    const hint = profile.match(/label="Request Account Deletion"\s*hint="([^"]+)"/)[1];
    assert.equal(hint, 'Asks you to confirm, then opens a new request for IT to delete your Service Desk account');
    for (const text of [DELETION_CONFIRM_TITLE, DELETION_CONFIRM_MESSAGE, DELETION_CONFIRM_LABEL, DELETION_TICKET_TITLE, hint]) {
      assert.doesNotMatch(text, TIMELINE, text);
    }
  });
});

// ── 9. Privacy policy and the release guard ──────────────────

describe('the privacy policy (H1), the support URL (H7) and the release guard', () => {
  const env = (prod) => `const API_BASE_URLS = {\n  UAT: 'https://uat.example.invalid/api/v1',\n  PROD: '${prod}',\n};`;
  const legal = ({ url = '', support = '' } = {}) =>
    `export const PRIVACY_POLICY_URL = '${url}';\nexport const SUPPORT_URL = '${support}';\n`;
  const ready = { url: 'https://www.example.invalid/privacy', support: 'https://www.example.invalid' };
  const PROD = 'https://prod.example.invalid/api/v1';
  const production = (legalSource, envSource = env(PROD)) => verdict({ profile: 'production', appEnv: 'PROD', envSource, legalSource });

  test('a production build fails with an empty privacy URL, even once the PROD API URL is set', () => {
    const result = production(legal({ ...ready, url: '' }));
    assert.equal(result.ok, false);
    assert.equal(result.lines.length, 2);
    assert.match(result.lines[0], /no PRIVACY_POLICY_URL/);
  });

  test('…and with a privacy or support URL that is not https, or no support URL; unreadable fails closed', () => {
    assert.match(production(legal({ ...ready, url: 'http://x.invalid' })).lines.join(' '), /PRIVACY_POLICY_URL/);
    assert.match(production(legal({ ...ready, support: '' })).lines.join(' '), /no SUPPORT_URL/);
    assert.match(production(legal({ ...ready, support: 'http://x.invalid' })).lines.join(' '), /SUPPORT_URL/);
    assert.match(production(legal({ ...ready, support: 'mailto:it@example.invalid' })).lines.join(' '), /SUPPORT_URL/, 'a URL, not an email');
    assert.equal(production(null).ok, false, 'unreadable legal.ts: fails closed');
    assert.equal(production(legal(ready), null).ok, false, 'unreadable env.ts: fails closed');
    assert.match(production(legal(ready), env('')).lines.join(' '), /no PROD API URL/);
  });

  test('with the PROD URL and both links it passes; preview and development builds never need them', () => {
    assert.deepEqual(production(legal(ready)), { ok: true, lines: [] });
    assert.equal(verdict({ profile: 'preview', appEnv: 'UAT', envSource: env(''), legalSource: legal() }).ok, true);
    assert.equal(verdict({ profile: 'preview', appEnv: 'PROD', envSource: env(PROD), legalSource: legal(ready) }).ok, false, 'PROD only on production (rule 4)');
    assert.equal(verdict({ profile: 'production', appEnv: 'UAT', envSource: env(PROD), legalSource: legal(ready) }).ok, false, 'production must target PROD');
  });

  test('iOS-9b: the guard requires exactly the PROD URL and the two links; the deletion values are gone', () => {
    assert.deepEqual(Object.keys(legalValuesFrom(legal(ready))).sort(), ['privacyPolicyUrl', 'supportUrl']);
    assert.doesNotMatch(code(read('scripts/eas-build-guard.js')), /ACCOUNT_DELETION|WORKING_DAYS/);
  });

  test('this repo: the production profile passes the guard, with the approved PROD URL and both links set', () => {
    assert.deepEqual(production(read('src/config/legal.ts'), read('src/config/env.ts')), { ok: true, lines: [] });
    assert.deepEqual(legalValuesFrom(read('src/config/legal.ts')), { privacyPolicyUrl: PRIVACY_POLICY_URL, supportUrl: SUPPORT_URL });
    assert.equal(PRIVACY_POLICY_URL, 'https://www.mountmerugroup.com/privacy-policy');
    assert.equal(SUPPORT_URL, 'https://www.mountmerugroup.com');
    for (const url of [PRIVACY_POLICY_URL, SUPPORT_URL]) assert.match(url, /^https:\/\/\S+$/);
  });

  test('the support URL is for App Store Connect only: nothing in the app shows or imports it', () => {
    const users = sourceFiles('src').filter((rel) => rel !== 'src/config/legal.ts' && /\bSUPPORT_URL\b/.test(code(read(rel))));
    assert.deepEqual(users, []);
  });

  test('the Privacy Policy row: only with an https URL, opened in Safari; no link to nothing (A2)', () => {
    assert.equal(accountRows({ privacyPolicyUrl: '' }).privacyPolicy, false);
    assert.equal(accountRows({ privacyPolicyUrl: 'http://x.invalid' }).privacyPolicy, false);
    assert.equal(accountRows({ privacyPolicyUrl: 'https://www.example.invalid/privacy' }).privacyPolicy, true);
    assert.equal(accountRows({ privacyPolicyUrl: PRIVACY_POLICY_URL }).privacyPolicy, true, 'this build shows it');
    const src = code(read('src/screens/profile/ProfileScreen.tsx'));
    assert.match(src, /Linking\.openURL\(PRIVACY_POLICY_URL\)/);
    assert.match(src, /\{ACCOUNT_ROWS\.privacyPolicy \? \(\s*<AccountRow icon="shield-checkmark-outline" label="Privacy Policy"/);
  });
});
