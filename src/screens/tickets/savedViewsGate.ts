// SAVED_VIEWS_ENABLED (iOS-5i, Ronit's decision 2, 2026-11-18). Saved filters, the Service Desk's saved views (SVW-1..4,
// docs/web-system/16-SAVED-VIEWS.md), are ON in `preview` builds (UAT, TestFlight) and OFF in `production` builds until
// the backend team confirms SVW-1..4 are live on PROD (docs/web-system/06-BACKEND-ASKS.md §iOS-A).
// - A BUILD-TIME flag. Expo writes EXPO_PUBLIC_APP_ENV into the bundle when it builds it, so a production bundle reads
//   `'PROD' !== 'PROD'` here, and Metro folds it to false before it collects the bundle's modules. The saved-views modules
//   are reached only through this file, so with the flag off they are not in that bundle at all: no module, no SVW path,
//   no text (scripts/verify-release-bundle.js proves it on JS and Hermes).
// - THE FLIP (docs/ios/RELEASE-IOS.md): make the line below `const ENABLED: boolean = true;`, update the value its test
//   pins (tests/release/saved-views-gate.test.mjs), and ship it in a NEW App Store version, never by EAS Update (Ronit's
//   decision 5).
// - Keep it ONE `const` in THIS file: Metro folds a constant only inside the module that declares it.
const ENABLED: boolean = process.env.EXPO_PUBLIC_APP_ENV !== 'PROD';

/** Saved views in this build: true in `preview` (UAT), false in `production` while the flag is off. */
export const SAVED_VIEWS_ENABLED: boolean = ENABLED;
