// HTML from the server (ticket description, comment body). Pure functions, no I/O. The backend stores HTML
// unsanitised (05 C.17), so nothing reaches the screen without passing through this file:
// - sanitizeForRender(): input to react-native-render-html (HtmlText). Native views only — no WebView, no
//   script execution. Only inline base64 raster images survive; remote images are never fetched (05 §A.6).
// - htmlToDisplayText(): plain-text fallback, used when the renderer fails.
// - prepareHtmlBody(): both of the above for one body, from one sanitiser pass, with recent results cached.

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
 * The two patterns per blocked tag, compiled once (Phase P2). Building them inside sanitizeForRender() compiled 64
 * regular expressions for every body rendered. `replace` with a global pattern always starts at 0, so sharing is safe.
 */
const BLOCKED_TAG_PATTERNS = BLOCKED_TAGS.map(
  (tag) => [new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')] as const,
);

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
  return renderSafeFromSanitized(sanitizeHtml(html));
}

/** sanitizeForRender() after its sanitizeHtml() step, so one sanitised string can feed both outputs (prepareHtmlBody). */
function renderSafeFromSanitized(sanitized: string): string {
  let clean = sanitized;
  for (const [element, tag] of BLOCKED_TAG_PATTERNS) {
    clean = clean.replace(element, '');
    clean = clean.replace(tag, '');
  }
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
  return displayTextFromSanitized(sanitizeHtml(input));
}

/** htmlToDisplayText() after its sanitizeHtml() step (see renderSafeFromSanitized). */
function displayTextFromSanitized(sanitized: string): string {
  let text = sanitized;
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

// ── One body, prepared for HtmlText (Phase P2: moved here from HtmlText, and cached) ──

/** What HtmlText shows for a body: nothing, plain text, or sanitised HTML with its plain-text fallback. */
export type PreparedHtml =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string; fallbackText: string };

function prepareUncached(input: string | null | undefined): PreparedHtml {
  if (!input || !input.trim()) return { kind: 'empty' };
  if (!looksLikeHtml(input)) return { kind: 'text', text: input.replace(/\r\n?/g, '\n').trim() };
  // One sanitizeHtml() pass feeds both: the same strings as sanitizeForRender(input) and htmlToDisplayText(input).
  const sanitized = sanitizeHtml(input);
  const html = renderSafeFromSanitized(sanitized);
  const fallbackText = displayTextFromSanitized(sanitized);
  if (!fallbackText && !/<img\b/i.test(html)) return { kind: 'empty' };
  return { kind: 'html', html, fallbackText };
}

/**
 * Recently prepared bodies. Preparing one is about a hundred regex scans of it, and the same body is prepared again
 * whenever its list cell is recycled or its ticket reopened. Bounded by the characters held (about 2 MB as UTF-16,
 * keys included); a body over 200 000 characters (an inline screenshot) is never kept. HtmlText clears it at sign-out.
 */
const PREPARED_BUDGET_CHARS = 1_000_000;
const PREPARED_MAX_INPUT_CHARS = 200_000;
const prepared = new Map<string, PreparedHtml>();
let preparedChars = 0;

const charsHeld = (input: string, p: PreparedHtml) =>
  input.length + (p.kind === 'html' ? p.html.length + p.fallbackText.length : p.kind === 'text' ? p.text.length : 0);

export function prepareHtmlBody(input: string | null | undefined): PreparedHtml {
  if (!input || input.length > PREPARED_MAX_INPUT_CHARS) return prepareUncached(input);
  const hit = prepared.get(input);
  if (hit) {
    prepared.delete(input); // the most recently used goes last; the oldest is evicted first
    prepared.set(input, hit);
    return hit;
  }
  const result = prepareUncached(input);
  prepared.set(input, result);
  preparedChars += charsHeld(input, result);
  for (const [key, value] of prepared) {
    if (preparedChars <= PREPARED_BUDGET_CHARS) break;
    prepared.delete(key);
    preparedChars -= charsHeld(key, value);
  }
  return result;
}

/** Drops every prepared body (sign-out: they are ticket content). */
export function clearPreparedHtml(): void {
  prepared.clear();
  preparedChars = 0;
}
