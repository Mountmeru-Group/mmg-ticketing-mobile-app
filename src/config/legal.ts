// Values App Review needs from the app and from App Store Connect (docs/ios/APP-STORE-COMPLIANCE.md H1, H7), set once
// per release. iOS-4; iOS-9b set them and replaced the deletion category and working days (see utils/accountDeletion.ts).
// - Empty means "not decided yet": a row that needs a value is not shown at all (no link to nothing: compliance A2), and
//   scripts/eas-build-guard.js refuses a `production` build until both are https links.
// - Plain literals only: the build guard and the release check read this file as text, before anything is installed.
// This file must stay free of runtime imports.

/**
 * MMG's published privacy policy (App Review 5.1.1(i): "within the app in an easily accessible manner"). An https URL,
 * opened in Safari from Profile › Account › Privacy Policy, and the same URL in App Store Connect's Privacy Policy URL
 * field. Owner: Ronit / legal. Set 2026-11-11 (iOS-9b).
 */
export const PRIVACY_POLICY_URL = 'https://www.mountmerugroup.com/privacy-policy';

/**
 * App Store Connect's Support URL (App Review 1.5, compliance H7). Not shown in the app: kept here as the one place the
 * release reads it from, so it is checked (an https link) with the privacy policy. Owner: Ronit. Set 2026-11-11 (iOS-9b).
 */
export const SUPPORT_URL = 'https://www.mountmerugroup.com';
