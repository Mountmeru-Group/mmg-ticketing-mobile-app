// Search inside a long dropdown (2026-11-17): the rules OptionSheet (src/components/OptionSheet.tsx) follows. Pure.
// - Only a LONG list gets the search field: more than OPTION_SEARCH_THRESHOLD options. A field above a short list is
//   noise, so every list of the app's own fixed values (priority, impact, urgency, sort, status, closure code, audit
//   action …: 10 at most) never has one; the lists that come from the Service Desk and grow (categories, groups,
//   countries, a service form's selects) get one as soon as they pass it.
// - Case-insensitive, and it matches anywhere in the label, not just at the start.

/**
 * A sheet shows about ten rows on a typical phone (70 % of an 800 dp screen, 48 dp rows): a list longer than that has
 * to be scrolled, and only then is a search worth its space. The count includes an "All …" row.
 */
export const OPTION_SEARCH_THRESHOLD = 10;

/** Whether a list of `count` options gets the search field. */
export function isSearchableList(count: number): boolean {
  return count > OPTION_SEARCH_THRESHOLD;
}

/** The options whose label contains the query anywhere, ignoring case. A blank query keeps them all, in order. */
export function filterOptionsByLabel<T extends { label: string }>(options: readonly T[], query: string): readonly T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return options;
  return options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
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
