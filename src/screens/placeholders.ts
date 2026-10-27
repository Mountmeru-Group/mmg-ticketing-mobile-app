// ⚠ DEV ONLY until iOS-4: what every route without its real screen renders (docs/ios/00-PORT-MANIFEST.md §6).
// - __DEV__: DevPlaceholderScreen (the route, its params and sample links, marked "DEV PLACEHOLDER — replaced in iOS-4").
// - Release: the `require` sits inside the __DEV__ branch, so a release build folds the branch away and the module is
//   never bundled (as AuthStack does for DevTokenScreen). An unbuilt route renders nothing there; release builds can't
//   sign in before iOS-7 in any case. The exported iOS bundle is checked for the marker text (compliance A2, 2.1).
import type { ComponentType } from 'react';

function NotBuilt() {
  return null;
}

export const PlaceholderRoute: ComponentType = __DEV__
  ? (require('./DevPlaceholderScreen') as typeof import('./DevPlaceholderScreen')).DevPlaceholderScreen
  : NotBuilt;
