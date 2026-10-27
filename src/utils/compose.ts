// Composer helpers (05 §A.5, §A.16). Pure functions.

/** Email chip validation, verbatim from FE:TicketDetailPage.tsx (05 §A.5). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/**
 * Add one typed address to a chip list (05 §A.5): trim, strip a trailing comma, validate, skip duplicates
 * (case-insensitive). Returns the new list, or null when the text is not a valid new address.
 */
export function addEmailChip(chips: readonly string[], raw: string): string[] | null {
  const value = raw.trim().replace(/,+$/, '').trim();
  if (!isValidEmail(value)) return null;
  if (chips.some((c) => c.toLowerCase() === value.toLowerCase())) return [...chips];
  return [...chips, value];
}

/** Chips plus any valid leftover text in the input — added on send, as the web does (05 §A.5). */
export function finalRecipients(chips: readonly string[], leftover: string): string[] {
  return addEmailChip(chips, leftover) ?? [...chips];
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Plain text → the HTML the web renders (05 §A.16): escaped, blank-line-separated paragraphs as <p>, single line
 * breaks as <br>. Never produces inline images (the JSON body limit is 2 MB; images go as attachments).
 */
export function plainTextToHtml(text: string): string {
  const normalised = text.replace(/\r\n?/g, '\n').trim();
  if (!normalised) return '';
  return normalised
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** The web's "Send disabled" test on a plain-text body: nothing but whitespace (05 §A.5). */
export function isBlankBody(text: string): boolean {
  return text.trim() === '';
}
