// HTML from the server (ticket description, comment body) → plain display text (05 §A.6).
//
// The backend stores HTML unsanitised (05 C.17). No HTML renderer or WebView is installed, so this phase
// renders NO markup at all: the web's sanitiser runs first (the documented minimum), then every remaining tag
// is dropped and entities are decoded. The result goes into a <Text>, which cannot execute or fetch anything —
// no script, no remote image, no link navigation. Pure functions, no I/O.
//
// Richer rendering (bold, lists, tappable links, inline images) needs a renderer such as
// react-native-render-html, pending Ronit's approval. It must still go through sanitizeHtml() first.

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
