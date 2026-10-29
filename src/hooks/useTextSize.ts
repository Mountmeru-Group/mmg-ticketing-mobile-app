import { useWindowDimensions } from 'react-native';

// The person's text size (Settings › Accessibility › Display & Text Size › Larger Text), as React Native reports it:
// `fontScale` is 1 at the default size and 3.571 at the largest accessibility size (RCTAccessibilityManager).
// iOS-4, HIG Typography: "Consider adjusting your layout at large font sizes. … consider using a stacked layout where
// text appears above secondary items. … Reduce the number of columns when the font size increases".

/**
 * The first accessibility text size (AX1) in React Native's scale. Every size from here up is one of iOS's
 * "accessibility categories" (UIContentSizeCategory.isAccessibilityCategory); the standard sizes stop at 1.353.
 */
export const ACCESSIBILITY_TEXT_SCALE = 1.786;

/** Pure, for tests: whether a font scale is one of the accessibility sizes. */
export function isAccessibilityTextScale(fontScale: number): boolean {
  return fontScale >= ACCESSIBILITY_TEXT_SCALE;
}

/** True at the accessibility text sizes: layouts stack and multi-column rows become one column. */
export function useAccessibilityTextSize(): boolean {
  return isAccessibilityTextScale(useWindowDimensions().fontScale);
}

/** Icons that carry meaning grow with the text beside them (HIG Typography), up to twice their size. */
export function useScaledIconSize(size: number): number {
  const { fontScale } = useWindowDimensions();
  return Math.round(size * Math.min(Math.max(fontScale, 1), 2));
}
