// Shared FlashList settings (Phase P2, docs/PERFORMANCE.md §9).
//
// FlashList v2 keeps the visible row anchored when rows are added above it ("maintainVisibleContentPosition", on by
// default). FlatList on Android never did that: a pull-to-refresh that brings new tickets or alerts in at the top
// showed them. Every list turns it off, so scrolling behaves exactly as before the switch.
export const NO_SCROLL_ANCHOR = { disabled: true } as const;
