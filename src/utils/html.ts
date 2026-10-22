// HTML from the server (ticket description, comment body). Pure functions, no I/O. The backend stores HTML
// unsanitised (05 C.17), so nothing reaches the screen without passing through this file:
// - sanitizeForRender(): input to react-native-render-html (HtmlText). Native views only — no WebView, no
//   script execution. Only inline base64 raster images survive; remote images are never fetched (05 §A.6).
// - htmlToDisplayText(): plain-text fallback, used when the renderer fails.

/** Web sanitiser, verbatim minimum from FE:TicketDetailPage.tsx:2685-2718 (05 §A.6). */
export function sanitizeHtml(html: string): string {
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/\s+on\w+="[^"]*"/gi, '');
  clean = clean.replace(/\s+on\w+='[^']*'/gi, '');
  const bodyMatch = clean.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    clean = bodyMatch[1] ?? '';
  }
  clean = clean.replace(/<head[\s\S]*?<\/head>/gi, '');
  clean = clean.replace(/<\/?html[^>]*>/gi, '');
  clean = clean.replace(/<meta[^>]*>/gi, '');
  clean = clean.replace(/<!DOCTYPE[^>]*>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');
  clean = clean.replace(/<img[^>]*src=["']cid:[^"']*["'][^>]*\/?>/gi, '<span>📎 image in attachments</span>');
  clean = clean.replace(/(<img[^>]*)(src=["'][^"']*["'])([^>]*>)/gi, (match, _pre, src: string) => {
    if (src.toLowerCase().includes('cid:')) return '<span>📎 image in attachments</span>';
    return match;
  });
  return clean.trim();
}

/** Elements dropped with their content before rendering. Also passed to the renderer as `ignoredDomTags`. */
export const BLOCKED_TAGS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'svg', 'math', 'video', 'audio',
  'source', 'track', 'canvas', 'picture', 'map', 'area', 'form', 'input', 'button', 'select', 'option', 'textarea',
  'noscript', 'template', 'title', 'head', 'meta', 'link', 'base', 'dialog',
] as const;

/**
 * Compiled once, not per body: two patterns per blocked tag — the element with its content, then any stray open or
 * close tag. They carry the `g` flag, so they are used only with String.replace (which resets lastIndex), never
 * with .test() or .exec().
 */
const BLOCKED_TAG_PATTERNS: readonly RegExp[] = BLOCKED_TAGS.flatMap((tag) => [
  new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'),
  new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'),
]);

/** Inline images the renderer may show: base64 raster data only. SVG (scriptable) and remote URLs are not. */
const SAFE_IMAGE_SRC = /^\s*data:image\/(png|jpe?g|gif|webp|bmp);base64,/i;

/**
 * sanitizeHtml() (the web's minimum) plus mobile rules from 05 §A.6:
 * - blocked elements are removed with their content;
 * - an <img> stays only with a base64 raster `src` (data:image/png|jpeg|gif|webp|bmp); every other image —
 *   remote URL, SVG, attachment URL needing the Bearer header — becomes "[image]", so nothing is fetched;
 * - `srcset` and `style` attributes on images are dropped.
 * Links stay as markup; HtmlText opens only http(s) and mailto links, in the system browser.
 */
export function sanitizeForRender(html: string): string {
  let clean = sanitizeHtml(html);
  for (const pattern of BLOCKED_TAG_PATTERNS) clean = clean.replace(pattern, '');
  clean = clean.replace(/<img\b[^>]*>/gi, (img) => {
    const src = /\ssrc\s*=\s*(["'])([\s\S]*?)\1/i.exec(img)?.[2] ?? '';
    if (!SAFE_IMAGE_SRC.test(src)) return '<span>[image]</span>';
    return `<img src="${src.replace(/"/g, '')}" />`;
  });
  return clean;
}

/** HTML vs plain text, verbatim test from FE:TicketDetailPage.tsx:1157 (05 §A.6). */
export function looksLikeHtml(text: string): boolean {
  return /<[a-z!/]|&(lt|gt|nbsp|amp|quot|#x?\d+);/i.test(text);
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', copy: '©', reg: '®', trade: '™',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Server HTML (or plain text) → text safe to put in a <Text>.
 * Block elements become line breaks, list items get a bullet, images become a short marker
 * (inline base64 images can be megabytes; they are never decoded here).
 */
export function htmlToDisplayText(input: string | null | undefined): string {
  if (!input) return '';
  if (!looksLikeHtml(input)) return input.replace(/\r\n?/g, '\n').trim();

  let text = sanitizeHtml(input);
  text = text.replace(/<(noscript|template|svg|iframe|object|title)[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/<img[^>]*src=["']data:[^>]*>/gi, ' [image] ');
  text = text.replace(/<img[^>]*>/gi, ' [image] ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n• ');
  text = text.replace(/<\/(p|div|h[1-6]|tr|table|blockquote|pre|ul|ol)>/gi, '\n'); // </li>: the next <li> breaks
  text = text.replace(/<(p|div|h[1-6]|tr|table|blockquote|pre|ul|ol|hr)[^>]*>/gi, '\n');
  text = text.replace(/<\/t[dh]>/gi, '\t');
  text = text.replace(/<[^>]*>/g, '');
  text = decodeEntities(text);
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/[ \t ]+\n/g, '\n');
  text = text.replace(/\n[ \t ]+/g, '\n');
  text = text.replace(/[  ]{2,}/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
