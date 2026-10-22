// The canned-response insert rule (05 §A.5) and the HTML → composer-text step it relies on.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { insertTemplate, plainTextToHtml } from '../../src/utils/compose.ts';
import { htmlToDisplayText } from '../../src/utils/html.ts';

describe('insertTemplate', () => {
  test('an empty body is replaced by the template', () => {
    assert.equal(insertTemplate('', 'Thanks for reporting this.'), 'Thanks for reporting this.');
    assert.equal(insertTemplate('   \n ', 'Thanks for reporting this.'), 'Thanks for reporting this.');
  });
  test('a body with text gets the template appended after one blank line', () => {
    assert.equal(insertTemplate('Hi Priya,', 'We are looking into it.'), 'Hi Priya,\n\nWe are looking into it.');
    assert.equal(insertTemplate('Hi Priya,\n\n', 'We are looking into it.'), 'Hi Priya,\n\nWe are looking into it.');
  });
  test('an empty template changes nothing', () => {
    assert.equal(insertTemplate('Hi', '  '), 'Hi');
  });
  test('CRLF in a template is normalised', () => {
    assert.equal(insertTemplate('', 'Line 1\r\nLine 2'), 'Line 1\nLine 2');
  });
});

describe('template HTML → composer text → sent HTML', () => {
  test('paragraphs and breaks survive as the composer sees them', () => {
    const body = '<p>Hello <b>there</b>,</p><p>We have logged this.<br>Regards</p>';
    const text = htmlToDisplayText(body);
    assert.equal(text, 'Hello there,\n\nWe have logged this.\nRegards');
    assert.equal(plainTextToHtml(insertTemplate('', text)), '<p>Hello there,</p><p>We have logged this.<br>Regards</p>');
  });
  test('scripts and images in a template never reach the sent body', () => {
    const text = htmlToDisplayText('<p>Hi</p><script>alert(1)</script><img src="data:image/png;base64,AAA">');
    assert.equal(text.includes('alert'), false);
    assert.equal(plainTextToHtml(text).includes('<img'), false);
  });
});
