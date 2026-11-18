// Multi-select dropdowns: the rules OptionSheet's `multiple` mode follows (src/components/OptionSheet.tsx). Pure.
// 2026-11-17 built it for Status only. 2026-11-18 (Ronit's brief): every ticket-list filter, status, priority, category,
// technician and group, each sent as ONE parameter holding comma-separated values, as the live web portal sends them
// (docs/web-system/01-API-CONTRACT.md TKT-1).
// - A "Select all" row with a count like the web's "1/38": the number chosen of all the options. A list that comes from a
//   server search (technicians) has no known total, so its count reads "2 selected".
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

/** The count for a list whose total is unknown (a server search): "2 selected". */
export function selectionCountUnknownTotal(chosen: number): string {
  return `${chosen} selected`;
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

/**
 * Every option the sheet knows, each value once: `first` in its order, then any of `more` not already there. A chosen
 * value the options do not hold (a saved view's category that is no longer listed, an earlier search's technician)
 * keeps its row and its name this way, so opening and closing the sheet never drops it.
 */
export function mergeOptions<T extends { value: string }>(first: readonly T[], ...more: readonly (readonly T[])[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of [first, ...more]) {
    for (const option of list) {
      if (seen.has(option.value)) continue;
      seen.add(option.value);
      out.push(option);
    }
  }
  return out;
}

/** Sorted by label, as the web orders its technician list (by name): a fixed order for options that arrive by search. */
export function byLabel<T extends { label: string }>(options: readonly T[]): T[] {
  return options.slice().sort((a, b) => a.label.localeCompare(b.label));
}
