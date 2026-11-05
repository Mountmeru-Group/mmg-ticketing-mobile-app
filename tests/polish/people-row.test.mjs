// The people row on ticket cards (2026-11-03, src/components/PeopleRow.tsx): [RJ] Rohit Jadhav → [SD] Sarthak D.
// The words and colours run for real (format.ts, colors.ts); the row and the card are read as source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { colors, palette } from '../../src/theme/colors.ts';
import { formatDisplayName, initials, peopleRowLabel, shortName } from '../../src/utils/format.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const lightness = (hex) => {
  const y = lum(hex);
  return y <= 216 / 24389 ? (y * 24389) / 27 : 116 * Math.cbrt(y) - 16;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('names', () => {
  test('the technician: first name and last initial', () => {
    assert.equal(shortName('Sarthak Darekar'), 'Sarthak D.');
    assert.equal(shortName('Ana Maria Lopez'), 'Ana L.');
    assert.equal(shortName('Prince'), 'Prince');
    assert.equal(shortName(''), '');
    assert.equal(shortName(null), '');
  });

  test('an e-mail-style name reads as the drawer shows it (formatDisplayName), with matching initials', () => {
    assert.equal(formatDisplayName('rohit.jadhav@mountmerugroup.com'), 'Rohit Jadhav');
    assert.equal(initials('rohit.jadhav@mountmerugroup.com'), 'RJ');
    assert.equal(shortName('sarthak_darekar@mountmerugroup.com'), 'Sarthak D.');
  });

  test('screen readers hear the row in the card\'s label', () => {
    assert.equal(peopleRowLabel('Rohit Jadhav', 'Sarthak Darekar', true), 'Requested by Rohit Jadhav, technician Sarthak Darekar');
    assert.equal(peopleRowLabel('Rohit Jadhav', null, true), 'Requested by Rohit Jadhav, unassigned');
    assert.equal(peopleRowLabel(null, null, true), 'Requested by unknown requester, unassigned');
    assert.equal(peopleRowLabel('Me', 'Sarthak Darekar', false), 'Technician Sarthak Darekar');
    assert.equal(peopleRowLabel('Me', null, false), 'Unassigned');
    // Then the dates and the due line (2026-11-05): "…. Raised 2 Nov, updated 2 days ago. Due Fri 7 Nov, 17:00".
    assert.match(read('src/components/TicketCard.tsx'), /`Ticket \$\{ticket\.ticketNumber\}: \$\{ticket\.title\}\$\{newReply \? ', new reply' : ''\}\. \$\{people\}\. ` \+\s*`Raised \$\{raised\}, updated \$\{formatRelative\(ticket\.updatedAt, now\)\}\$\{due \? `\. \$\{due\.label\}` : ''\}`/);
  });
});

describe('avatars: told apart by lightness', () => {
  test('requester and technician are ≥ 15 L* apart (they are 93 and 27), and their initials pass 4.5:1', () => {
    const { requester, technician } = colors.avatar;
    const gap = Math.abs(lightness(requester.bg) - lightness(technician.bg));
    assert.ok(gap >= 15, gap.toFixed(1));
    assert.ok(contrast(requester.bg, requester.fg) >= 4.5, contrast(requester.bg, requester.fg).toFixed(2));
    assert.ok(contrast(technician.bg, technician.fg) >= 4.5, contrast(technician.bg, technician.fg).toFixed(2));
  });

  test('the requester has S3\'s avatar (brand red on its 10 % tint); the technician slate-700', () => {
    assert.equal(colors.avatar.requester.fg, colors.primary);
    assert.equal(colors.avatar.technician.bg, palette.slate[700]);
  });

  test('the unassigned ring and plus pass 3:1 for a UI graphic', () => {
    assert.ok(contrast(colors.avatar.unassigned, palette.white) >= 3);
  });
});

describe('the row', () => {
  const row = read('src/components/PeopleRow.tsx');
  const card = read('src/components/TicketCard.tsx');

  test('25 dp avatars with initials; the initials stay inside the circle at large text', () => {
    assert.match(row, /const AVATAR = 25;/);
    assert.match(row, /avatar: \{ width: AVATAR, height: AVATAR, borderRadius: AVATAR \/ 2,/);
    assert.match(row, /maxFontSizeMultiplier=\{INITIALS_MAX_SCALE\}/);
  });

  test('a STATIC arrow between them: nothing in the row animates', () => {
    assert.match(row, /<Ionicons name="arrow-forward" size=\{14\}/);
    assert.doesNotMatch(row, /Animated|useNativeDriver|\.loop\(/);
  });

  test('unassigned: a dashed empty circle with a plus, and "Unassigned" in italic muted text', () => {
    assert.match(row, /empty: \{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors\.avatar\.unassigned \}/);
    assert.match(row, /<Ionicons name="add" size=\{14\} color=\{colors\.avatar\.unassigned\} \/>/);
    assert.match(row, /text-xs italic \$\{onTint \? 'text-gray-600' : 'text-gray-500'\}`\} numberOfLines=\{1\}>\s*Unassigned/);
  });

  test('one line: every name truncates and shrinks, the row never wraps', () => {
    assert.doesNotMatch(row, /flex-wrap/);
    const names = row.match(/<Text className="ml-1\.5 shrink[^"]*"[^>]*>/g) ?? [];
    assert.ok(names.length >= 1);
    for (const tag of row.match(/<Text\b[^>]*className="[^"]*ml-1\.5[^"]*"[^>]*>|<Text className=\{`ml-1\.5[^`]*`\}[^>]*>/g) ?? []) {
      assert.match(tag, /numberOfLines=\{1\}/, tag);
    }
  });

  test('names come through formatDisplayName (as the drawer); END_USER sees the technician only', () => {
    assert.match(row, /label=\{formatDisplayName\(requesterName\) \|\| 'Unknown requester'\}/);
    assert.match(row, /label=\{shortName\(technicianName\)\}/);
    assert.match(row, /\{showRequester \? \(/);
    assert.match(card, /showRequester=\{staff\}/);
  });

  test('on the card: under the badges, after a hairline rule; the old "Technician:" line is gone', () => {
    assert.match(card, /<View className="mt-3 border-border pt-2\.5" style=\{styles\.rule\}>\s*<PeopleRow/);
    assert.match(card, /rule: \{ borderTopWidth: StyleSheet\.hairlineWidth \}/);
    assert.doesNotMatch(card, /Technician: |Not yet assigned to a technician/);
  });

  test('FlashList v2 has no item-size estimate to update: it measures each card (nothing sets estimatedItemSize)', () => {
    assert.match(JSON.parse(read('package.json')).dependencies['@shopify/flash-list'], /^2\./);
    assert.doesNotMatch(read('src/screens/tickets/TicketListScreen.tsx'), /estimatedItemSize|overrideItemLayout/);
  });

  test('the list skeleton mirrors the new row, so the first load does not jump', () => {
    assert.match(read('src/components/LoadingSkeleton.tsx'), /border-t border-border pt-2\.5">\s*<Bar className="h-\[25px\] w-\[25px\] rounded-full" \/>/);
  });
});
