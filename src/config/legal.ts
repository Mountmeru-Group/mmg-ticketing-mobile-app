// Values App Review needs from the app (docs/ios/APP-STORE-COMPLIANCE.md H1, H6), set once per release. iOS-4.
// - Empty means "not decided yet": the row that needs a value is not shown at all (no link to nothing, no request that
//   can't be sent: compliance A2), and scripts/eas-build-guard.js refuses a `production` build until all three are set.
// - Plain literals only: the build guard reads this file as text, before anything is installed.
// This file must stay free of runtime imports.

/**
 * MMG's published privacy policy (App Review 5.1.1(i): "within the app in an easily accessible manner"). An https URL,
 * opened in Safari from Profile › Account › Privacy Policy. Owner: Ronit / legal. Empty until MMG publishes it.
 */
export const PRIVACY_POLICY_URL = '';

/**
 * The Service Desk category an account-deletion request is filed under (App Review 5.1.1(v); utils/accountDeletion.ts):
 * its exact name, looked up in LKP-1 (GET /categories?flat=true) when the person sends the request. Owner: Ronit / IT.
 */
export const ACCOUNT_DELETION_CATEGORY = '';

/**
 * How many working days IT takes to delete an account once asked. The confirmation says it, as Apple requires for a
 * manual deletion ("Inform the person how long it will take to delete the account"). 0 = not agreed with IT yet.
 */
export const ACCOUNT_DELETION_WORKING_DAYS = 0;
