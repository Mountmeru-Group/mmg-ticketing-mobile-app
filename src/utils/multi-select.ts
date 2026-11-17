// Multi-select dropdowns (2026-11-17): the rules OptionSheet's `multiple` mode follows (src/components/OptionSheet.tsx).
// Pure. Built only for a filter the server reads several values for. Today that is the ticket list's Status, sent as one
// comma-separated `status` (docs/web-system/16-SAVED-VIEWS.md §7). Priority, category, technician and group stay single.
// - A "Select all" row with a count like the web's "1/38": the number chosen of all the options.
// - With a search typed, "Select all" applies to the options the search shows, and only to them.
// - The closed field reads "Afrikomart +2": the first chosen in option order, then how many more.

/** "Open", "Open +2", or null when nothing is chosen. */
export function multiSelectSummary(labels: readonly string[]): string | null {
  if (labels.length === 0) return null;
  return labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`;
}

/** The count beside "Select all", as the web shows it: chosen / all options ("1/38"). */
export function selectionCount(chosen: number, total: number): string {
  return `${chosen}/${total}`;
}

/** The chosen values, each once, in the options' order. Values that are not options are dropped. */
export function inOptionOrder<T extends string>(options: readonly { value: T }[], chosen: Iterable<T>): T[] {
  const set = new Set(chosen);
  return options.filter((o) => set.has(o.value)).map((o) => o.value);
}

/** Tick or untick one value. */
export function toggleChoice<T extends string>(options: readonly { value: T }[], chosen: readonly T[], value: T): T[] {
  const set = new Set(chosen);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return inOptionOrder(options, set);
}

/** "Select all" row state for the options on screen: every one chosen, some, or none. Empty `shown` is `none`. */
export type SelectAllState = 'all' | 'some' | 'none';

export function selectAllState<T extends string>(shown: readonly { value: T }[], chosen: readonly T[]): SelectAllState {
  if (shown.length === 0) return 'none';
  const set = new Set(chosen);
  const on = shown.filter((o) => set.has(o.value)).length;
  if (on === shown.length) return 'all';
  return on === 0 ? 'none' : 'some';
}

/**
 * Tap on "Select all": when every option on screen is chosen, untick those; otherwise tick them all. Only the options on
 * screen (`shown`, after the search) change; choices hidden by the search are kept.
 */
export function toggleAllShown<T extends string>(
  options: readonly { value: T }[],
  shown: readonly { value: T }[],
  chosen: readonly T[],
): T[] {
  const set = new Set(chosen);
  if (selectAllState(shown, chosen) === 'all') for (const o of shown) set.delete(o.value);
  else for (const o of shown) set.add(o.value);
  return inOptionOrder(options, set);
}

/** True when two choices hold the same values (order does not matter). */
export function sameChoices<T extends string>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}
