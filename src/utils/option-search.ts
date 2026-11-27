// Search inside a long dropdown (2026-11-17): the rules OptionSheet (src/components/OptionSheet.tsx) follows. Pure.
// - Only a LONG list gets the search field: more than OPTION_SEARCH_THRESHOLD options. A field above a short list is
//   noise, so every list of the app's own fixed values (priority, impact, urgency, sort, status, closure code, audit
//   action …: 10 at most) never has one; the lists that come from the Service Desk and grow (categories, groups,
//   countries, a service form's selects) get one as soon as they pass it.
// - Case-insensitive, the query trimmed, and it matches anywhere in the text, not just at the start.
// - 2026-11-27: the rule takes SEVERAL texts per item (filterByText), so Analytics' people search can match a name OR an
//   email with this same rule instead of a second matcher. filterOptionsByLabel is the rule on one text, the label,
//   and behaves exactly as before.

/**
 * A sheet shows about ten rows on a typical phone (70 % of an 800 dp screen, 48 dp rows): a list longer than that has
 * to be scrolled, and only then is a search worth its space. The count includes an "All …" row.
 */
export const OPTION_SEARCH_THRESHOLD = 10;

/** Whether a list of `count` options gets the search field. */
export function isSearchableList(count: number): boolean {
  return count > OPTION_SEARCH_THRESHOLD;
}

/**
 * THE search rule: the items with a text that contains the query anywhere, ignoring case, the query trimmed. A blank
 * query keeps them all (the same array). The items keep their order. A missing text matches nothing.
 */
export function filterByText<T>(
  items: readonly T[],
  query: string,
  textsOf: (item: T) => readonly (string | null | undefined)[],
): readonly T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return items;
  return items.filter((item) => textsOf(item).some((text) => !!text && text.toLocaleLowerCase().includes(needle)));
}

const optionLabel = (option: { label: string }) => [option.label];

/** The options whose label contains the query anywhere, ignoring case. A blank query keeps them all, in order. */
export function filterOptionsByLabel<T extends { label: string }>(options: readonly T[], query: string): readonly T[] {
  return filterByText(options, query, optionLabel);
}

/** What TalkBack says after the list narrows. */
export function optionSearchAnnouncement(matches: number): string {
  if (matches === 0) return 'No matches';
  return matches === 1 ? '1 match' : `${matches} matches`;
}

/** The line shown in place of an empty list. */
export function noOptionMatchText(query: string): string {
  return `Nothing matches “${query.trim()}”.`;
}
