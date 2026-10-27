// Reply templates (Phase G3, LKP-7): the web picker's rules as pure functions. The web's behaviour, with sources, is
// in docs/G3-WEB-BEHAVIOUR.md §1 (CRP = FE:components/ui/CannedResponsePicker.tsx).
// - Every active template, unscoped: no category or team filter, no `search` sent to the server.
// - Search on the device: title or category, case-insensitive (not the body).
// - Grouped by category, "General" when there is none; groups by name, the server's order inside a group.
// - Insert: a blank body is replaced; otherwise the template is appended at the end. No placeholders.
// The mobile composer is plain text (05 §A.16), so a template goes in as text: formatting is not kept, and images
// are left out because the app never sends inline images (01 §0.1).
import type { CannedResponse } from '@/types';
import { isBlankBody } from './compose';
import { htmlToDisplayText } from './html';

/** The group of a template with no category (CRP:39). */
export const GENERAL_CATEGORY = 'General';

export interface TemplateGroup {
  category: string;
  templates: CannedResponse[];
}

/** CRP:31-35: every template for an empty search, else those whose title or category contains it, ignoring case. */
export function filterTemplates(templates: readonly CannedResponse[], search: string): CannedResponse[] {
  const q = search.trim().toLowerCase();
  if (!q) return [...templates];
  return templates.filter((t) => t.title.toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q));
}

/** CRP:37-42, :84. Inside a group, templates keep the server's order (category, then title). */
export function groupTemplates(templates: readonly CannedResponse[]): TemplateGroup[] {
  const groups = new Map<string, CannedResponse[]>();
  for (const template of templates) {
    const key = template.category || GENERAL_CATEGORY;
    const group = groups.get(key);
    if (group) group.push(template);
    else groups.set(key, [template]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({ category, templates: list }));
}

/** True when inserting this template leaves images out (see templateText). */
export function templateHasImages(html: string): boolean {
  return /<img\b/i.test(html);
}

/** A template's HTML as the composer's plain text: paragraphs, line breaks and list bullets kept; images dropped. */
export function templateText(html: string): string {
  return htmlToDisplayText(html.replace(/<img\b[^>]*>/gi, ''));
}

/**
 * The web's insert rule (FE:TicketDetailPage.tsx:1046-1051): a body with no text is replaced by the template;
 * otherwise the template is appended at the end, as a new paragraph (plainTextToHtml sends a blank line as a new
 * <p>, as the web's `prev + body` adds one). Never at the cursor, as on the web.
 */
export function insertTemplate(current: string, html: string): string {
  const text = templateText(html);
  if (isBlankBody(current)) return text;
  if (!text) return current;
  return `${current.replace(/\s+$/, '')}\n\n${text}`;
}

/** One line of a template's text for its row in the picker. */
export function templatePreview(html: string): string {
  return templateText(html).replace(/\s+/g, ' ').trim();
}
