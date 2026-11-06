// The few react-native APIs NativeWind's runtime (react-native-css-interop) touches when it loads and when it styles a
// component, for tests/support/nativewind.mjs ONLY. React Native itself cannot load in Node (Flow source, native
// modules). Only what css-interop reads is here: a phone at rest, light mode, no listeners firing.
'use strict';

const subscription = () => ({ remove() {} });
const host = (name) => {
  const component = () => null;
  component.displayName = name;
  return component;
};

module.exports = {
  Appearance: { getColorScheme: () => 'light', setColorScheme() {}, addChangeListener: subscription },
  AppState: { currentState: 'active', addEventListener: subscription },
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: subscription },
  Dimensions: { get: () => ({ width: 360, height: 640, scale: 3, fontScale: 1 }), addEventListener: subscription },
  I18nManager: { isRTL: false, getConstants: () => ({ isRTL: false }) },
  PixelRatio: { get: () => 3, getFontScale: () => 1, roundToNearestPixel: (n) => n },
  Platform: { OS: 'android', Version: 35, constants: { reactNativeVersion: { major: 0, minor: 86 } }, select: (o) => o.android ?? o.native ?? o.default },
  PlatformColor: (...names) => ({ semantic: names }),
  StyleSheet: { hairlineWidth: 1, flatten: (style) => style },
  Pressable: host('Pressable'),
  View: host('View'),
  Text: host('Text'),
};
