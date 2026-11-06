// An e-mail's inline (cid:) image (2026-11-03, Ronit's decision): no emoji. The sanitiser writes a <cid-image> element.
// A rendered body draws it as a paperclip icon (flat SVG) with "Image in attachments"; plain text reads
// "[image in attachments]". The sanitiser runs for real (src/utils/html.ts); the renderer is read as source.
//
// iOS (iOS-5f, STEP 3): ported from Android dev d8626bc. The sanitiser and plain-text tests are verbatim; the renderer's
// ("the rendered body draws it") join with HtmlText's paperclip in STEP 5.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  CID_IMAGE_TAG, CID_IMAGE_TEXT, clearPreparedHtml, htmlToDisplayText, prepareHtmlBody, sanitizeForRender, sanitizeHtml,
} from '../../src/utils/html.ts';

const PLACEHOLDER = `<${CID_IMAGE_TAG}>${CID_IMAGE_TEXT}</${CID_IMAGE_TAG}>`;
const EMOJI = /\p{Emoji_Presentation}/u;

describe('the sanitiser', () => {
  test('a cid: image becomes the <cid-image> element, in both of the web\'s forms, with no emoji', () => {
    assert.equal(CID_IMAGE_TAG, 'cid-image');
    assert.equal(CID_IMAGE_TEXT, '[image in attachments]');
    assert.equal(sanitizeHtml('<p>See <img src="cid:image001.png@01DA"> here</p>'), `<p>See ${PLACEHOLDER} here</p>`);
    assert.equal(sanitizeHtml('<img alt="logo" width="40" src="CID:logo@x">'), PLACEHOLDER);
    assert.doesNotMatch(sanitizeHtml('<img src="cid:a"><img src="cid:b">'), EMOJI);
  });

  test('the renderer\'s input keeps the element (it is not a blocked tag)', () => {
    assert.equal(sanitizeForRender('<p><img src="cid:a"></p>'), `<p>${PLACEHOLDER}</p>`);
  });

  test('every other image is as before: base64 rasters kept, anything else "[image]"', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo=';
    assert.equal(sanitizeForRender(`<img src="${data}">`), `<img src="${data}" />`);
    assert.equal(sanitizeForRender('<img src="https://example.test/x.png">'), '<span>[image]</span>');
  });
});

describe('plain text', () => {
  test('reads "[image in attachments]" in place of the image', () => {
    assert.equal(htmlToDisplayText('<p>See <img src="cid:a"> here</p>'), 'See [image in attachments] here');
    assert.doesNotMatch(htmlToDisplayText('<div><img src="cid:a"></div>'), EMOJI);
  });

  test('a prepared body carries the element for the renderer and the words for its fallback', () => {
    clearPreparedHtml();
    const prepared = prepareHtmlBody('<p>Screenshot:</p><p><img src="cid:shot@1"></p>');
    assert.equal(prepared.kind, 'html');
    assert.ok(prepared.html.includes(PLACEHOLDER));
    assert.match(prepared.fallbackText, /\[image in attachments\]/);
  });

  test('a body that is only a cid: image is not shown as empty', () => {
    clearPreparedHtml();
    assert.equal(prepareHtmlBody('<div><img src="cid:only@1"></div>').kind, 'html');
  });
});
