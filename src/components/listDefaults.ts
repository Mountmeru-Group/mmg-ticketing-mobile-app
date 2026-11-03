// Shared FlashList settings (Phase P2, docs/PERFORMANCE.md §9).
//
// FlashList v2 keeps the visible row anchored when rows are added above it ("maintainVisibleContentPosition", on by
// default). FlatList on Android never did that: a pull-to-refresh that brings new tickets or alerts in at the top
// showed them. Every list turns it off, so scrolling behaves exactly as before the switch.
export const NO_SCROLL_ANCHOR = { disabled: true } as const;

// The room around a tab screen's list (iOS-8a, docs/brand/UI-STANDARDS.md §iOS-A.13). The navigation bar is solid, so a
// list starts below it; React Navigation's tab bar takes its own space under the screen (it is not drawn over it), so a
// list ends at the bar's top edge. What still covers the last rows is drawn inside the screen: the "+" button, or the
// ticket list's selection bar. Android pads the same way (12 on top; 24, or 96 with the "+", below).

/** Gap above a list's first row (Android's `paddingTop: 12`). */
export const LIST_TOP_GAP = 12;
/** Gap under a list's last row when nothing floats over it. */
export const LIST_END_GAP = 24;
/** The "+" button: 56 pt, this far above the tab bar. */
export const FAB_BOTTOM = 20;
const FAB_SIZE = 56;
/** Room under the last row on a screen with the "+" button: the button, its offset and a 20 pt gap (96). */
export const FAB_CLEARANCE = FAB_BOTTOM + FAB_SIZE + 20;

/**
 * Bottom padding of a tab screen's list: clear of the "+" button when the screen has one, and of a bar drawn over the
 * list's foot (`overlay`, its measured height), whichever is taller.
 */
export function listBottomInset({ fab = false, overlay = 0 }: { fab?: boolean; overlay?: number } = {}): number {
  return Math.max(fab ? FAB_CLEARANCE : LIST_END_GAP, overlay > 0 ? overlay + LIST_END_GAP : 0);
}
