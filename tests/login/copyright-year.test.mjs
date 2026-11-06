// The Login footer's year (2026-11-04): "Copyright © <year> Mount Meru Group", the year from the device clock
// (src/utils/copyright.ts). LoginScreen reads it on first render, on focus and when the app returns to the foreground,
// as Home reads the greeting: events only, never a timer. And a guard: no user-facing string anywhere in src/ may hold
// a written four-digit year, because a written year is wrong from 1 January.
//
// iOS (iOS-5f): ported from Android dev d8626bc, all of it, unchanged. On iOS VoiceOver, like TalkBack, reads "©" as
// "copyright".
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { COPYRIGHT_HOLDER, copyrightLabel, copyrightLine, copyrightYear } from '../../src/utils/copyright.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const ts = createRequire(path.join(REPO, 'package.json'))('typescript');

describe('copyright year: the device clock', () => {
  test('the calendar year of the clock it is given, on the phone\'s own calendar (local time)', () => {
    // The Date constructor with parts is local time, as the phone's clock is.
    assert.equal(copyrightYear(new Date(2026, 11, 31, 23, 59, 59, 999)), 2026);
    assert.equal(copyrightYear(new Date(2027, 0, 1, 0, 0, 0, 0)), 2027, 'the new year from the first millisecond');
    assert.equal(copyrightYear(new Date(2031, 5, 15)), 2031);
  });

  test('with no argument it reads the device clock', () => {
    const before = new Date().getFullYear();
    const now = copyrightYear();
    const after = new Date().getFullYear();
    assert.ok(now === before || now === after);
  });

  test('the line and what TalkBack reads carry the year they are given', () => {
    assert.equal(COPYRIGHT_HOLDER, 'Mount Meru Group');
    for (const year of [2026, 2027, 2040]) {
      assert.equal(copyrightLine(year), `Copyright © ${year} Mount Meru Group`);
      // "©" alone is read as "copyright", so the label drops it rather than saying the word twice.
      assert.equal(copyrightLabel(year), `Copyright ${year} Mount Meru Group`);
    }
  });
});

describe('copyright year: Login', () => {
  const login = read('src/screens/auth/LoginScreen.tsx');

  test('the footer renders the computed line, with the spoken label', () => {
    assert.match(login, /<Text style=\{styles\.footer\} accessibilityLabel=\{copyrightLabel\(year\)\}>\s*\{copyrightLine\(year\)\}\s*<\/Text>/);
    assert.doesNotMatch(login, /Mount Meru Group IT/);
  });

  test('read on first render, on focus and when the app returns to the foreground', () => {
    assert.match(login, /const \[year, setYear\] = useState\(\(\) => copyrightYear\(\)\);/);
    assert.match(login, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*setYear\(copyrightYear\(\)\);/);
    assert.match(login, /AppState\.addEventListener\('change', \(next\) => \{\s*if \(next === 'active'\) setYear\(copyrightYear\(\)\);/);
    assert.match(login, /return \(\) => subscription\.remove\(\);/);
  });

  test('no timer and no polling; the device clock only', () => {
    assert.doesNotMatch(login, /setInterval|setTimeout|refetchInterval|requestAnimationFrame/);
    assert.doesNotMatch(read('src/utils/copyright.ts'), /setInterval|setTimeout|\bfetch\(|apiClient|@\/api|useAuthStore/);
  });
});

// ── The guard ────────────────────────────────────────────────

const YEAR = /\b(?:19|20)\d{2}\b/;

/**
 * Every place in a source file where text could carry a written year to the screen: string literals (JSX attributes
 * such as accessibilityLabel included), template literal text, JSX text, and a year-like number placed straight into
 * text (`{2026}` in JSX, `${2026}` in a template, `'©' + 2026`). Comments are not looked at; nor is a number used as a
 * number, such as the due-date picker's bounds `new Date(2000, 0, 1)` (src/utils/tasks.ts).
 * Every string literal counts, shown or not: one that reaches no screen and must hold a year goes in ALLOWED with why.
 */
function writtenYears(source, fileName) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const add = (node, text) => {
    const match = YEAR.exec(text);
    if (match) found.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, year: match[0], text: text.trim() });
  };
  const isTextual = (node) =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node, node.text);
    else if (node.kind === ts.SyntaxKind.JsxText) add(node, node.getText(sf));
    else if (ts.isNumericLiteral(node) && YEAR.test(node.text)) {
      const parent = node.parent;
      const intoText =
        ts.isJsxExpression(parent) ||
        ts.isTemplateSpan(parent) ||
        (ts.isBinaryExpression(parent) &&
          parent.operatorToken.kind === ts.SyntaxKind.PlusToken &&
          isTextual(parent.left === node ? parent.right : parent.left));
      if (intoText) add(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** `src/…` file → why a string in it may hold a year. None today. */
const ALLOWED = new Map([]);

function sourceFiles(dir) {
  return readdirSync(path.join(REPO, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(REPO, rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}

describe('no written year in any user-facing string in src/', () => {
  test('the guard catches each way a year can be written into text (so a pass below means something)', () => {
    const caught = (src, file = 'probe.tsx') => writtenYears(src, file).map((f) => f.year);
    assert.deepEqual(caught(`const a = 'Copyright © 2026 Mount Meru Group';`), ['2026']);
    assert.deepEqual(caught('const a = `© 2026 ${holder}`;'), ['2026']);
    assert.deepEqual(caught('const a = `© ${holder} 2026`;'), ['2026']);
    assert.deepEqual(caught('const a = <Text>Copyright © 2026 Mount Meru Group</Text>;'), ['2026']);
    assert.deepEqual(caught('const a = <Text accessibilityLabel="Copyright 2026">x</Text>;'), ['2026']);
    assert.deepEqual(caught('const a = <Text>© {2026} Mount Meru Group</Text>;'), ['2026']);
    assert.deepEqual(caught('const a = `© ${2026}`;'), ['2026']);
    assert.deepEqual(caught(`const a = '© ' + 2026;`), ['2026']);
    assert.deepEqual(caught(`const a = 'Due 12 Nov 1999';`), ['1999']);
  });

  test('…and leaves alone what is not text: comments, numbers used as numbers, computed years', () => {
    const caught = (src) => writtenYears(src, 'probe.tsx');
    assert.deepEqual(caught('// 2026-11-04: the footer\n/** "09 Oct 2026" */\nconst a = 1;'), []);
    assert.deepEqual(caught('export const DUE_DATE_MIN = new Date(2000, 0, 1);\nif (y < 2000) {}'), []);
    assert.deepEqual(caught('const a = <Text>{copyrightLine(year)}</Text>;'), []);
    assert.deepEqual(caught('const ms = 2000 + delay;'), []);
  });

  test('every .ts / .tsx file under src/', () => {
    const files = sourceFiles('src');
    assert.ok(files.length > 100, `scanned ${files.length} files`);
    assert.ok(files.includes('src/screens/auth/LoginScreen.tsx'));
    const offenders = [];
    for (const rel of files) {
      for (const f of writtenYears(read(rel), rel)) {
        if (!ALLOWED.has(rel)) offenders.push(`${rel}:${f.line} "${f.year}" in ${JSON.stringify(f.text.slice(0, 80))}`);
      }
    }
    assert.deepEqual(offenders, [], 'compute the year from the device clock instead (src/utils/copyright.ts)');
  });
});
