// iOS-4: the HIG polish, accessibility and the two App Review items (docs/ios/00-PORT-MANIFEST.md §4.13).
// 1. every control is at least 44 × 44 pt and has an accessibilityLabel;
// 2. Reduce Motion: the page sheets fade instead of sliding; every Modal honours it;
// 3. haptics: one documented meaning each, played by the shared write paths;
// 4. Dynamic Type: the iOS text styles, the title caps, the accessibility layouts, readable KB tables;
// 5. VoiceOver: no control hidden inside another; the priority preview is announced;
// 6. appearance: light only, nothing reads the system scheme; brand yellow never text or an icon;
// 7. the ticket list's search is the navigation bar's own, and searches exactly as before;
// 8. account deletion: the exact TKT-2 payload per role, and nothing sent without the confirmation;
// 9. the privacy policy: the row, and the release guard that refuses a production build without the URL.
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
import { ACCOUNT_DELETION_CATEGORY, ACCOUNT_DELETION_WORKING_DAYS, PRIVACY_POLICY_URL } from '../../src/config/legal.ts';
import { ACCESSIBILITY_TEXT_SCALE, isAccessibilityTextScale } from '../../src/hooks/useTextSize.ts';
import { loginLayout } from '../../src/theme/brand.ts';
import { fontSize, loginType, maxTextScale, textStylePoints } from '../../src/theme/typography.ts';
import {
  DELETION_CONFIRM_LABEL, DELETION_CONFIRM_TITLE, accountDeletionTicket, accountRows, deletionConfirmMessage,
  deletionTicketTitle, findDeletionCategory,
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
  'src/screens/auth/SignInButton.tsx': { style: 'style={styles.pill}', height: loginLayout.button.height, width: loginLayout.button.height },
};

// ── 1. Targets and labels ────────────────────────────────────

describe('every control: at least 44 × 44 pt, and a VoiceOver label', () => {
  test('every Pressable reaches 44 pt tall (and wide, when its width is set), with its hit slop', () => {
    const PT = (step) => Number(step) * 4; // spacing.ts: step n = n × 0.25rem = 4n pt
    const short = [];
    let checked = 0;
    for (const rel of TSX) {
      const src = read(rel);
      for (const { text, line } of openingTags(src, 'Pressable')) {
        checked += 1;
        const attrs = expandConstants(src, text);
        const sized = TOKEN_SIZED[rel];
        if (sized && attrs.includes(sized.style)) {
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
    assert.deepEqual(short, [], 'HIG Buttons: "a button needs a hit region of at least 44x44 pt"');
  });

  test('the hit slop is only for chips in a row: a lone icon button is 44 pt itself', () => {
    for (const rel of TSX) {
      const src = read(rel);
      for (const { text, line } of openingTags(src, 'Pressable')) {
        const iconOnly = /(?:^|[\s`'"])w-(\d+)(?=[\s`'"])/.exec(text);
        if (iconOnly && Number(iconOnly[1]) * 4 < 44) assert.fail(`${rel}:${line}: an icon button narrower than 44 pt`);
      }
    }
  });

  test('every Pressable, TextInput and Switch has an accessibilityLabel', () => {
    const missing = [];
    for (const rel of TSX) {
      const src = read(rel);
      for (const tag of ['Pressable', 'TextInput', 'Switch']) {
        for (const { text, line } of openingTags(src, tag)) if (!/\baccessibilityLabel=/.test(text)) missing.push(`${rel}:${line} <${tag}>`);
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
        const capped = /text-(lg|xl|2xl|3xl)\b/.test(text) || /maxFontSizeMultiplier=\{1\.4\}/.test(text) || loginHeadline;
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
    assert.match(html, /const RENDERERS = \{ img: ImgRenderer, table: TableRenderer \};/);
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

// ── 7. Search in the navigation bar ──────────────────────────

describe('the ticket list: the navigation bar\'s search, under a large title', () => {
  const src = code(read('src/screens/tickets/TicketListScreen.tsx'));

  test('the native search field, at the top, kept on screen while the list scrolls', () => {
    assert.match(src, /headerSearchBarOptions: \{/);
    assert.match(src, /placement: 'stacked',\s*hideWhenScrolling: false,/);
    assert.match(src, /placeholder: 'Ticket #, subject, requester or technician'/);
    assert.doesNotMatch(src, /<SearchField\b/, 'the old field is gone');
  });

  test('it searches exactly as before: search key submits, a link opens the resolver, an emptied field clears', () => {
    assert.match(src, /onSearchButtonPress: \(e\) => submitSearch\(e\.nativeEvent\.text\)/);
    assert.match(src, /onCancelButtonPress: \(\) => clearSearch\(\)/);
    assert.match(src, /if \(looksLikeUrl\(text\)\) \{\s*navigation\.navigate\('TicketLink', \{ link: text\.trim\(\) \}\);/);
    assert.match(src, /setSearch\(normaliseTicketSearch\(text\)\);/);
    assert.match(src, /if \(text === ''\) setSearch\(undefined\);/);
  });

  test('the filters ride at the top of the list, in every state, so the large title collapses', () => {
    assert.match(src, /ListHeaderComponent=\{listHeader\}/);
    assert.match(src, /contentInsetAdjustmentBehavior="automatic"/);
    assert.equal((src.match(/<StateScroll header=\{listHeader\}/g) ?? []).length, 3, 'offline, loading and error');
    assert.match(src, /headerRight: \(\) => <FiltersButton on=\{filtersOn\} onPress=\{openFilters\} \/>/);
    const inbox = code(read('src/screens/approvals/ApprovalsInboxScreen.tsx'));
    assert.match(inbox, /contentInsetAdjustmentBehavior="automatic"/);
    assert.equal((inbox.match(/<StateScroll header=\{header\}/g) ?? []).length, 3);
    assert.doesNotMatch(inbox, /SearchField|headerSearchBarOptions/, 'Approvals has no search on web or Android');
  });
});

// ── 8. Account deletion ──────────────────────────────────────

describe('account deletion: a ticket for IT through the existing TKT-2, only after a confirmation (H6)', () => {
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
  const at = new Date(2026, 9, 29, 14, 5);

  test('the exact ticket: title, description and category, nothing else', () => {
    const v = accountDeletionTicket(user, { appVersion: '0.1.0', requestedAt: at, categoryId: 'cat-access' });
    assert.deepEqual(Object.keys(v).sort(), ['categoryId', 'description', 'title']);
    assert.equal(v.title, 'Account deletion request: Asha Mrema');
    assert.equal(v.categoryId, 'cat-access');
    assert.equal(
      v.description,
      [
        'Please delete my Service Desk account and the personal data linked to it.',
        '',
        'Name: Asha Mrema',
        'Email: asha.mrema@mountmerugroup.com',
        'Role: User',
        'Service Desk user ID: user-7',
        `Sent from: Setu for iPhone 0.1.0, Profile › Request Account Deletion, ${v.description.match(/Deletion, (.*)$/m)[1]}`,
        '',
        'This request was made in the app after a confirmation. Please reply on this ticket when the account has been deleted, or say what has to be kept and why.',
      ].join('\n'),
    );
    assert.match(v.description, /Deletion, \d{2} \w{3} 2026, 14:05$/m, 'the date and time it was sent');
    assert.ok(v.title.length >= 3 && v.title.length <= 255, "TKT-2's title limits");
    assert.equal(deletionTicketTitle({ displayName: '', email: 'x@y.z' }), 'Account deletion request: x@y.z');
    assert.equal(deletionTicketTitle({ displayName: 'A'.repeat(400), email: '' }).length, 255);
  });

  test('POST /tickets sends title, description, category and source for every role: never priority, impact or urgency', async () => {
    const v = accountDeletionTicket(user, { appVersion: '0.1.0', requestedAt: at, categoryId: 'cat-access' });
    for (const role of ['END_USER', 'L2_MANAGER', 'AGENT', 'ADMIN']) {
      sent.length = 0;
      // As useCreateTicket() builds it: the description as <p> HTML, source API, and no impact or urgency given.
      await createTicket({ title: v.title, description: plainTextToHtml(v.description), categoryId: v.categoryId, source: MOBILE_TICKET_SOURCE, impact: undefined, urgency: undefined }, role);
      assert.equal(sent.length, 1, role);
      assert.equal(sent[0].method, 'post');
      assert.equal(sent[0].url, '/tickets');
      assert.deepEqual(sent[0].data, { title: v.title, description: plainTextToHtml(v.description), categoryId: 'cat-access', source: 'API' }, role);
    }
    assert.match(plainTextToHtml(v.description), /^<p>Please delete my Service Desk account and the personal data linked to it\.<\/p><p>Name: Asha Mrema<br>/);
  });

  test('the request goes through useCreateTicket (its validation and guards), with nothing but the built ticket', () => {
    const src = code(read('src/screens/profile/ProfileScreen.tsx'));
    assert.match(src, /const createTicket = useCreateTicket\(\);/);
    assert.match(src, /createTicket\.mutateAsync\(\s*accountDeletionTicket\(user, \{ appVersion: APP_VERSION, requestedAt: new Date\(\), categoryId: category\.id \}\),\s*\)/);
    const hook = code(read('src/hooks/useCreateTicket.ts'));
    assert.match(hook, /const problem = validateNewTicket\(v\);/, 'the same validation as Create Ticket');
    assert.match(hook, /requireOnline\(\);/);
  });

  test('nothing is sent without the confirmation: it asks first, and Cancel stops everything', async () => {
    const src = code(read('src/screens/profile/ProfileScreen.tsx'));
    const flow = src.slice(src.indexOf('const requestDeletion'), src.indexOf('const set = (key'));
    const asked = flow.indexOf('await confirmAction(');
    assert.ok(asked >= 0);
    assert.ok(asked < flow.indexOf('if (!ok) return;'));
    assert.ok(flow.indexOf('if (!ok) return;') < flow.indexOf('categories.refetch()'), 'no lookup before the OK');
    assert.ok(flow.indexOf('if (!ok) return;') < flow.indexOf('createTicket.mutateAsync('), 'no ticket before the OK');
    assert.match(flow, /title: DELETION_CONFIRM_TITLE,\s*message: deletionConfirmMessage\(ACCOUNT_DELETION_WORKING_DAYS\),\s*confirmLabel: DELETION_CONFIRM_LABEL,/);
    assert.doesNotMatch(flow, /destructive: true/, 'a deliberate choice: the default style (HIG Alerts)');

    const answer = confirmAction({ title: DELETION_CONFIRM_TITLE, message: deletionConfirmMessage(5), confirmLabel: DELETION_CONFIRM_LABEL });
    const alert = __alerts().at(-1);
    assert.equal(alert.title, 'Request account deletion?');
    assert.deepEqual(alert.buttons.map((b) => [b.text, b.style]), [['Cancel', 'cancel'], ['Send Request', 'default']]);
    __pressAlertButton('Cancel');
    assert.equal(await answer, false);
    assert.equal(sent.length, 0, 'Cancel sent nothing');
  });

  test('the confirmation says what happens, how long it takes and what may be kept (App Review 5.1.1(v))', () => {
    assert.equal(
      deletionConfirmMessage(5),
      'This asks Mount Meru IT to delete your Service Desk account and the personal data linked to it. IT completes it by hand within 5 working days and replies on the request ticket. Records Mount Meru must keep, such as tickets you raised, may be kept. Your Mount Meru work account (Microsoft) is not affected. If you sign in to Setu again, a new Service Desk account is created.',
    );
    assert.match(deletionConfirmMessage(1), /within 1 working day and/);
  });

  test('the category: the named one, found by exact name in LKP-1, and only if active', () => {
    const c = (id, name, isActive = true) => ({ id, name, isActive });
    const list = [c('a', 'Access Requests'), c('b', 'Account deletion', false), c('d', ' Account Deletion ')];
    assert.equal(findDeletionCategory(list, 'account deletion')?.id, 'd', 'case and outer spaces ignored; the inactive one skipped');
    assert.equal(findDeletionCategory(list, 'Account'), null, 'never a partial match');
    assert.equal(findDeletionCategory(list, ''), null);
    const src = code(read('src/screens/profile/ProfileScreen.tsx'));
    assert.match(src, /useCategories\(\{ enabled: false \}\)/, 'LKP-1 only when a request is sent, never on opening Profile');
    assert.match(src, /if \(!category\) \{\s*hapticOutcome\('error'\);/, 'no category: nothing is sent');
  });

  test('the row shows only once its category and working days are set; the success shows the new ticket number', () => {
    assert.deepEqual(accountRows({ privacyPolicyUrl: '', deletionCategory: '', deletionWorkingDays: 0 }), { privacyPolicy: false, requestDeletion: false });
    assert.equal(accountRows({ privacyPolicyUrl: '', deletionCategory: 'Access', deletionWorkingDays: 0 }).requestDeletion, false);
    assert.equal(accountRows({ privacyPolicyUrl: '', deletionCategory: 'Access', deletionWorkingDays: 5 }).requestDeletion, true);
    const src = code(read('src/screens/profile/ProfileScreen.tsx'));
    assert.match(src, /const canRequestDeletion = ACCOUNT_ROWS\.requestDeletion && !!user && !placeholder;/);
    assert.match(src, /Alert\.alert\('Request Sent', `Ticket #\$\{ticket\.ticketNumber\} was created\./);
    assert.match(src, /\{ text: 'View Ticket', onPress: \(\) => navigation\.navigate\('TicketDetail', \{ ticketId: ticket\.id \}\) \}/);
  });
});

// ── 9. Privacy policy and the release guard ──────────────────

describe('the privacy policy (H1) and the release guard', () => {
  const env = (prod) => `const API_BASE_URLS = {\n  UAT: 'https://uat.example.invalid/api/v1',\n  PROD: '${prod}',\n};`;
  const legal = ({ url = '', category = '', days = 0 } = {}) =>
    `export const PRIVACY_POLICY_URL = '${url}';\nexport const ACCOUNT_DELETION_CATEGORY = '${category}';\nexport const ACCOUNT_DELETION_WORKING_DAYS = ${days};\n`;
  const ready = { url: 'https://www.example.invalid/privacy', category: 'Access Requests', days: 5 };
  const PROD = 'https://prod.example.invalid/api/v1';

  test('a production build fails with an empty privacy URL, even once the PROD API URL is set', () => {
    const result = verdict({ profile: 'production', appEnv: 'PROD', envSource: env(PROD), legalSource: legal({ ...ready, url: '' }) });
    assert.equal(result.ok, false);
    assert.equal(result.lines.length, 2);
    assert.match(result.lines[0], /no PRIVACY_POLICY_URL/);
  });

  test('…and with a URL that is not https, or no deletion category or working days', () => {
    assert.match(verdict({ profile: 'production', appEnv: 'PROD', envSource: env(PROD), legalSource: legal({ ...ready, url: 'http://x.invalid' }) }).lines.join(' '), /PRIVACY_POLICY_URL/);
    assert.match(verdict({ profile: 'production', appEnv: 'PROD', envSource: env(PROD), legalSource: legal({ ...ready, category: '' }) }).lines.join(' '), /ACCOUNT_DELETION_CATEGORY/);
    assert.match(verdict({ profile: 'production', appEnv: 'PROD', envSource: env(PROD), legalSource: legal({ ...ready, days: 0 }) }).lines.join(' '), /ACCOUNT_DELETION_WORKING_DAYS/);
    assert.equal(verdict({ profile: 'production', appEnv: 'PROD', envSource: env(PROD), legalSource: null }).ok, false, 'unreadable: fails closed');
  });

  test('with every value set it passes; preview and development builds never need them', () => {
    assert.deepEqual(verdict({ profile: 'production', appEnv: 'PROD', envSource: env(PROD), legalSource: legal(ready) }), { ok: true, lines: [] });
    assert.equal(verdict({ profile: 'preview', appEnv: 'UAT', envSource: env(''), legalSource: legal() }).ok, true);
    assert.equal(verdict({ profile: 'preview', appEnv: 'PROD', envSource: env(PROD), legalSource: legal(ready) }).ok, false, 'PROD only on production (rule 4)');
  });

  test('this repo today: production is refused (no PROD URL, no privacy URL, no deletion values)', () => {
    const result = verdict({ profile: 'production', appEnv: 'PROD', envSource: read('src/config/env.ts'), legalSource: read('src/config/legal.ts') });
    assert.equal(result.ok, false);
    const text = result.lines.join(' ');
    for (const name of ['PROD API URL', 'PRIVACY_POLICY_URL', 'ACCOUNT_DELETION_CATEGORY', 'ACCOUNT_DELETION_WORKING_DAYS']) assert.ok(text.includes(name), name);
    assert.deepEqual(legalValuesFrom(read('src/config/legal.ts')), {
      privacyPolicyUrl: PRIVACY_POLICY_URL,
      deletionCategory: ACCOUNT_DELETION_CATEGORY,
      deletionWorkingDays: ACCOUNT_DELETION_WORKING_DAYS,
    });
  });

  test('the Privacy Policy row: only with an https URL, opened in Safari; no link to nothing (A2)', () => {
    assert.equal(accountRows({ privacyPolicyUrl: '', deletionCategory: '', deletionWorkingDays: 0 }).privacyPolicy, false);
    assert.equal(accountRows({ privacyPolicyUrl: 'http://x.invalid', deletionCategory: '', deletionWorkingDays: 0 }).privacyPolicy, false);
    assert.equal(accountRows({ privacyPolicyUrl: 'https://www.example.invalid/privacy', deletionCategory: '', deletionWorkingDays: 0 }).privacyPolicy, true);
    const src = code(read('src/screens/profile/ProfileScreen.tsx'));
    assert.match(src, /Linking\.openURL\(PRIVACY_POLICY_URL\)/);
    assert.match(src, /\{ACCOUNT_ROWS\.privacyPolicy \? \(\s*<AccountRow icon="shield-checkmark-outline" label="Privacy Policy"/);
  });
});
