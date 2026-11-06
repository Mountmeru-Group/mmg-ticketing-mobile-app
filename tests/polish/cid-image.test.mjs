// An e-mail's inline (cid:) image (2026-11-03, Ronit's decision): no emoji. The sanitiser writes a <cid-image> element.
// A rendered body draws it as a paperclip icon (flat SVG) with "Image in attachments"; plain text reads
// "[image in attachments]". The sanitiser runs for real (src/utils/html.ts); the renderer is read as source.
//
// iOS (iOS-5f): ported from Android dev d8626bc (STEP 3: the sanitiser and plain text; STEP 5: the renderer). One iOS
// difference: iOS-4's table renderer sits in the same map (tests/screens/hig-polish.test.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { palette } from '../../src/theme/colors.ts';
import {
  CID_IMAGE_TAG, CID_IMAGE_TEXT, clearPreparedHtml, htmlToDisplayText, prepareHtmlBody, sanitizeForRender, sanitizeHtml,
} from '../../src/utils/html.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
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

describe('the rendered body draws it', () => {
  const html = read('src/components/HtmlText.tsx');

  test('the element is registered as a block, and has its own renderer', () => {
    assert.match(html, /\[CID_IMAGE_TAG\]: HTMLElementModel\.fromCustomModel\(\{ tagName: CID_IMAGE_TAG, contentModel: HTMLContentModel\.block \}\)/);
    assert.match(html, /customHTMLElementModels=\{CUSTOM_ELEMENT_MODELS\}/);
    assert.match(html, /const RENDERERS = \{ img: ImgRenderer, table: TableRenderer, \[CID_IMAGE_TAG\]: CidImageRenderer \};/);
  });

  test('a drawn paperclip (flat SVG through expo-image) and the words, not an emoji', () => {
    assert.match(html, /const PAPERCLIP = require\('\.\.\/\.\.\/assets\/illustrations\/paperclip\.svg'\) as number;/);
    assert.match(html, /<Image source=\{PAPERCLIP\} style=\{PAPERCLIP_SIZE\} contentFit="contain" accessible=\{false\} \/>/);
    assert.match(html, />Image in attachments<\/Text>/);
    const svg = read('assets/illustrations/paperclip.svg').replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(svg, /Gradient|<filter|<image|<text/i);
    const colours = [...svg.matchAll(/#[0-9a-f]{6}\b/gi)].map(([c]) => c.toLowerCase());
    assert.deepEqual([...new Set(colours)], [palette.gray[500]]);
  });
});
