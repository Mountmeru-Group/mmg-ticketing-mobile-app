// G8: the audit log's Details formatter, day groups, labels and pill colours (src/utils/audit-log.ts, theme/colors.ts).
// Every "known shape" below is copied from the server line that writes it (docs/G8-WEB-AUDIT.md §8); the fallbacks
// feed it what the server does not write today, and things no JSON API sends, to show it never throws.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { colors } from '../../src/theme/colors.ts';
import {
  AUDIT_ACTIONS, AUDIT_ACTION_LABELS, auditActionLabel, auditDayLabel, auditListRows, auditTicketLink, auditTime,
  formatAuditDetails, parseAuditTicketNumber,
} from '../../src/utils/audit-log.ts';
import { APP_ORIGIN, parseTicketLink } from '../../src/utils/deep-links.ts';

const A = '3f2a9c1e-1111-4111-8111-111111111111';
const B = 'b7d4e2a0-2222-4222-8222-222222222222';
const C = 'c0ffee00-3333-4333-8333-333333333333';
const fmt = (action, oldValues, newValues) => formatAuditDetails({ action, oldValues, newValues });

// ── Known shapes, one per server write site ──────────────────

describe('Details: the shapes the server writes', () => {
  test('STATUS_CHANGED, TKT-6 (tickets.controller.ts:929-937)', () => {
    assert.deepEqual(fmt('STATUS_CHANGED', { status: 'IN_PROGRESS' }, { status: 'RESOLVED' }), {
      lines: ['Status: In Progress → Resolved'],
      raw: null,
    });
  });

  test('STATUS_CHANGED, the auto-close job (autoCloseResolved.job.ts:33-41): no actor, closedAt and _source read', () => {
    const d = fmt('STATUS_CHANGED', { status: 'RESOLVED' }, { status: 'CLOSED', closedAt: '2026-11-01T10:00:00.000Z', _source: 'auto-close-48h' });
    assert.deepEqual(d, { lines: ['Status: Resolved → Closed', 'Closed automatically after being resolved'], raw: null });
  });

  test('ASSIGNED automatically on create or from email (tickets.controller.ts:431-440, graph.service.ts:767-776)', () => {
    assert.deepEqual(fmt('ASSIGNED', { assignedToId: null }, { assignedToId: A, _autoAssigned: true }), {
      lines: ['Assigned automatically to user 3f2a9c1e'],
      raw: null,
    });
  });

  test('ASSIGNED on a field edit, a reassignment (tickets.controller.ts:738-747)', () => {
    assert.deepEqual(fmt('ASSIGNED', { assignedToId: A }, { assignedToId: B }).lines, ['Technician: user 3f2a9c1e → user b7d4e2a0']);
  });

  test('ASSIGNED through TKT-5, no oldValues (tickets.controller.ts:813-821)', () => {
    assert.deepEqual(fmt('ASSIGNED', null, { assignedToId: B }), { lines: ['Assigned to user b7d4e2a0'], raw: null });
  });

  test('ASSIGNED with TKT-7-style names, if a server ever adds them to AUD-1', () => {
    assert.deepEqual(fmt('ASSIGNED', { assignedToId: A, _assignedToName: 'Old Tech' }, { assignedToId: B, _assignedToName: 'jane.doe@mmg.com' }).lines, [
      'Technician: Old Tech → Jane Doe',
    ]);
  });

  test('COMMENTED (comments.controller.ts:103-111): the web shows {"type":"PUBLIC"}', () => {
    assert.deepEqual(fmt('COMMENTED', null, { type: 'PUBLIC' }), { lines: ['Public reply'], raw: null });
    assert.deepEqual(fmt('COMMENTED', null, { type: 'PRIVATE' }).lines, ['Private note']);
    assert.deepEqual(fmt('COMMENTED', null, { type: 'INTERNAL' }).lines, ['Comment type: Internal']);
  });

  test('ATTACHMENT_ADDED (attachments.controller.ts:97-105)', () => {
    assert.deepEqual(fmt('ATTACHMENT_ADDED', null, { count: 2, files: ['a.pdf', 'b.png'] }).lines, ['2 files: a.pdf, b.png']);
    assert.deepEqual(fmt('ATTACHMENT_ADDED', null, { count: 1, files: ['scan.jpg'] }).lines, ['1 file: scan.jpg']);
    const seven = ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png'];
    assert.deepEqual(fmt('ATTACHMENT_ADDED', null, { count: 7, files: seven }).lines, ['7 files: 1.png, 2.png, 3.png, 4.png, 5.png and 2 more']);
  });

  test('UPDATED, a field edit (tickets.controller.ts:716-733)', () => {
    assert.deepEqual(fmt('UPDATED', { priority: 'MEDIUM' }, { priority: 'HIGH' }).lines, ['Priority: Medium → High']);
    assert.deepEqual(fmt('UPDATED', { title: 'Printer', impact: 'MINIMAL' }, { title: 'Printer jammed', impact: 'HIGH' }).lines, [
      'Title: “Printer” → “Printer jammed”',
      'Impact: Affects User → Affects Business',
    ]);
    assert.deepEqual(fmt('UPDATED', { urgency: 'LOW', categoryId: A }, { urgency: 'URGENT', categoryId: B }).lines, [
      'Urgency: Low → Urgent',
      'Category changed',
    ]);
    // Nothing changed: the server writes {updated: true} (:723).
    assert.deepEqual(fmt('UPDATED', {}, { updated: true }), { lines: ['Saved with no field changes'], raw: null });
  });

  test('UPDATED by AI enrichment of an email ticket (graph.service.ts:902-910)', () => {
    assert.deepEqual(fmt('UPDATED', {}, { _aiSentiment: 'dissatisfied', _aiEnriched: true, priority: 'HIGH', categoryId: C }).lines, [
      'Set by AI enrichment',
      'AI sentiment: Dissatisfied',
      'Priority: High',
      'Category changed',
    ]);
  });

  test('CREATED from the web form (tickets.controller.ts:408-425): ids become "Also set", nulls are skipped', () => {
    const d = fmt('CREATED', null, {
      title: 'Printer jammed', priority: 'MEDIUM', status: 'OPEN', urgency: null, impact: 'LOW', source: 'WEB_FORM',
      assignedToId: A, teamId: B, categoryId: C, countryId: null,
    });
    assert.deepEqual(d, {
      lines: ['Title: “Printer jammed”', 'Priority: Medium', 'Status: Open', 'Impact: Affects Group', 'Source: Web Form', 'Also set: technician, group, category'],
      raw: null,
    });
  });

  test('CREATED from email, no urgency or impact keys (imap.service.ts:209-222)', () => {
    const d = fmt('CREATED', undefined, { title: 'VPN down', priority: 'HIGH', status: 'OPEN', source: 'EMAIL', assignedToId: null, teamId: B, categoryId: null });
    assert.deepEqual(d.lines, ['Title: “VPN down”', 'Priority: High', 'Status: Open', 'Source: Email', 'Also set: group']);
  });

  test('CREATED with names, if a server ever adds them', () => {
    const d = fmt('CREATED', null, { title: 'X', teamId: B, _teamName: 'Service Desk', categoryId: C });
    assert.deepEqual(d.lines, ['Title: “X”', 'Group: Service Desk', 'Also set: category']);
  });
});

// ── What falls through ───────────────────────────────────────

describe('Details: fallbacks, never a crash', () => {
  test('an action the app does not know: every key in words', () => {
    assert.deepEqual(fmt('AUTO_CLOSED', { status: 'RESOLVED' }, { status: 'CLOSED' }), { lines: ['Status: Resolved → Closed'], raw: null });
    assert.deepEqual(fmt('ESCALATED', null, { level: 2, toTeamId: B }).lines, ['Level: 2', 'To team: id b7d4e2a0']);
  });

  test('extra keys on a known action are shown, not dropped; objects as JSON', () => {
    assert.deepEqual(fmt('COMMENTED', null, { type: 'PUBLIC', mentions: ['ann', 'bob'], meta: { via: 'email' } }).lines, [
      'Public reply',
      'Mentions: ann, bob',
      'Meta: {"via":"email"}',
    ]);
  });

  test('a key only in oldValues', () => {
    assert.deepEqual(fmt('UPDATED', { slaPolicyId: A }, {}).lines, ['SLA policy was id 3f2a9c1e']);
  });

  test('a date in an unknown key is formatted', () => {
    const [line] = fmt('SLA_BREACHED', null, { breachedAt: '2026-11-01T10:00:00.000Z' }).lines;
    assert.match(line, /^Breached at: 01 Nov 2026, \d\d:\d\d$/);
  });

  test('a payload that is not an object is shown raw', () => {
    assert.deepEqual(fmt('UPDATED', null, 'free text'), { lines: [], raw: 'After: "free text"' });
    assert.deepEqual(fmt('UPDATED', [1, 2], 5), { lines: [], raw: 'Before: [1,2]\nAfter: 5' });
    // A known action with an unusable shape: nothing invented.
    assert.deepEqual(fmt('STATUS_CHANGED', null, ['RESOLVED']), { lines: [], raw: 'After: ["RESOLVED"]' });
  });

  test('nothing recorded: no lines and no raw block (the card shows no box)', () => {
    assert.deepEqual(fmt('COMMENTED', null, null), { lines: [], raw: null });
    assert.deepEqual(fmt('CREATED', undefined, {}), { lines: [], raw: null });
  });

  test('wrong types inside a known shape do not break it', () => {
    assert.deepEqual(fmt('ATTACHMENT_ADDED', null, { count: '2', files: 'a.pdf' }).lines, ['Count: 2', 'Files: a.pdf']);
    assert.deepEqual(fmt('ATTACHMENT_ADDED', null, { files: ['a.pdf', 7, null] }).lines, ['3 files: a.pdf']);
    assert.deepEqual(fmt('STATUS_CHANGED', { status: 42 }, { status: { code: 'X' } }).lines, ['Status: 42 → {"code":"X"}']);
  });

  test('long values are clipped', () => {
    const [line] = fmt('UPDATED', {}, { title: 'x'.repeat(500) }).lines;
    assert.ok(line.length < 140, String(line.length));
    assert.ok(line.endsWith('…”'));
  });

  test('values no JSON API sends still never throw', () => {
    const hostile = {};
    Object.defineProperty(hostile, 'boom', { enumerable: true, get() { throw new Error('getter'); } });
    assert.doesNotThrow(() => fmt('UPDATED', null, hostile));
    const d = fmt('UPDATED', null, hostile);
    assert.equal(d.lines.length, 0);
    assert.equal(typeof d.raw, 'string');
    assert.doesNotThrow(() => fmt('UPDATED', null, { big: 10n }));
    assert.doesNotThrow(() => formatAuditDetails({ action: undefined, oldValues: undefined, newValues: undefined }));
  });
});

// ── Labels, links, ticket numbers ────────────────────────────

describe('Action labels', () => {
  test('the four Ronit read off the web page, verbatim', () => {
    assert.equal(AUDIT_ACTION_LABELS.COMMENTED, 'Commented');
    assert.equal(AUDIT_ACTION_LABELS.STATUS_CHANGED, 'Status Changed');
    assert.equal(AUDIT_ACTION_LABELS.ASSIGNED, 'Assigned');
    assert.equal(AUDIT_ACTION_LABELS.CREATED, 'Created');
  });
  test('every value of the AuditAction enum has a label (schema.prisma:71-81)', () => {
    assert.deepEqual(AUDIT_ACTIONS, ['CREATED', 'UPDATED', 'DELETED', 'STATUS_CHANGED', 'ASSIGNED', 'COMMENTED', 'ATTACHMENT_ADDED', 'SLA_BREACHED', 'ESCALATED']);
    for (const a of AUDIT_ACTIONS) assert.ok(AUDIT_ACTION_LABELS[a], a);
  });
  test('an unknown action is shown in words, never dropped', () => {
    assert.equal(auditActionLabel('AUTO_CLOSED'), 'Auto Closed');
    assert.equal(auditActionLabel('SLA_WARNING'), 'SLA Warning');
    assert.equal(auditActionLabel('weird thing'), 'weird thing');
  });
});

describe('Ticket links and numbers', () => {
  test('a ticket opens through the deep-link resolver, by id', () => {
    const link = auditTicketLink({ id: A, ticketNumber: 12, title: 'x' });
    assert.equal(link, `${APP_ORIGIN}/tickets/${A}`);
    assert.deepEqual(parseTicketLink(link), { ok: true, target: { kind: 'id', id: A } });
  });
  test('no ticket (deleted, or none), no link; a bad id falls back to the number', () => {
    assert.equal(auditTicketLink(null), null);
    assert.equal(auditTicketLink(undefined), null);
    assert.equal(auditTicketLink({ id: 'not-a-uuid', ticketNumber: 12, title: '' }), '#12');
  });
  test('the search box takes a ticket number only', () => {
    assert.equal(parseAuditTicketNumber('1234'), 1234);
    assert.equal(parseAuditTicketNumber('#1234'), 1234);
    assert.equal(parseAuditTicketNumber('  # 77 '), 77);
    assert.equal(parseAuditTicketNumber(`${APP_ORIGIN}/ticket/55`), 55);
    for (const text of ['', 'jane', '0', '12a', '1234567890', `${APP_ORIGIN}/tickets/${A}`, 'https://elsewhere.example/ticket/5']) {
      assert.equal(parseAuditTicketNumber(text), null, text);
    }
  });
});

// ── Day groups and times (the phone's local calendar) ────────

describe('Day groups', () => {
  const now = new Date(2026, 10, 2, 12, 0);
  const at = (...args) => new Date(...args).toISOString();
  const entry = (id, createdAt) => ({ id, createdAt, action: 'CREATED', entityType: 'Ticket', entityId: id, oldValues: null, newValues: null, ipAddress: null, actorId: null, ticketId: null, actor: null, ticket: null });

  test('a heading wherever the local day changes, in the server\'s order', () => {
    const rows = auditListRows(
      [
        entry('e1', at(2026, 10, 2, 11, 30)),
        entry('e2', at(2026, 10, 2, 0, 5)),
        entry('e3', at(2026, 10, 1, 23, 59)),
        entry('e4', at(2026, 9, 30, 8, 0)),
        entry('e5', 'not a date'),
      ],
      now,
    );
    assert.deepEqual(rows.map((r) => (r.kind === 'day' ? `# ${r.label}` : r.entry.id)), [
      '# Today', 'e1', 'e2', '# Yesterday', 'e3', '# Fri 30 Oct 2026', 'e4', '# Date unknown', 'e5',
    ]);
    assert.equal(new Set(rows.map((r) => r.key)).size, rows.length, 'keys are unique');
  });

  test('an empty log has no rows', () => assert.deepEqual(auditListRows([], now), []));

  test('labels and times', () => {
    assert.equal(auditDayLabel(new Date(2026, 10, 2, 0, 0), now), 'Today');
    assert.equal(auditDayLabel(new Date(2026, 10, 1, 23, 0), now), 'Yesterday');
    assert.equal(auditDayLabel(new Date(2025, 10, 2, 9, 0), now), 'Sun 02 Nov 2025');
    assert.equal(auditTime(at(2026, 10, 2, 9, 5)), '09:05');
    assert.equal(auditTime('nope'), '—');
    assert.equal(auditTime(null), '—');
  });
});

// ── Pill colours: told apart by lightness, readable ──────────

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

describe('Action pill colours (theme/colors.ts auditAction)', () => {
  test('every action has a tone, and every label passes WCAG AA for 12 dp text (4.5:1)', () => {
    for (const a of AUDIT_ACTIONS) {
      const tone = colors.auditAction[a];
      assert.ok(tone, a);
      assert.ok(contrast(tone.bg, tone.fg) >= 4.5, `${a}: ${contrast(tone.bg, tone.fg).toFixed(2)}`);
    }
  });

  test('the actions the server writes differ in LIGHTNESS, not hue alone (≥ 15 L* apart)', () => {
    // UPDATED, CREATED, ASSIGNED, STATUS_CHANGED, COMMENTED: one band each. ATTACHMENT_ADDED shares STATUS_CHANGED's pale
    // band and is told apart by its icon and label (docs/brand/UI-STANDARDS.md §13).
    const written = ['UPDATED', 'CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'COMMENTED'];
    for (let i = 0; i < written.length; i++) {
      for (let j = i + 1; j < written.length; j++) {
        const [x, y] = [written[i], written[j]];
        const gap = Math.abs(lightness(colors.auditAction[x].bg) - lightness(colors.auditAction[y].bg));
        assert.ok(gap >= 15, `${x} vs ${y}: ${gap.toFixed(1)}`);
      }
    }
  });

  test('the white pill is outlined, so it does not vanish into the white card', () => {
    assert.equal(colors.auditAction.COMMENTED.bg, '#ffffff');
    assert.ok(colors.auditAction.COMMENTED.border);
  });
});
