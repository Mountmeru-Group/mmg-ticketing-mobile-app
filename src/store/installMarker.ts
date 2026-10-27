// iOS keeps Keychain items after an app is deleted (docs/ios/00-PORT-MANIFEST.md §7). Without this check, deleting Setu
// and installing it again would start in the session from before, because the token is still in the Keychain. The app
// container IS deleted with the app, so a marker file there tells a fresh install (no marker) from a normal launch.
// - First launch after an install: wipe the three mmg.session.* Keychain items, then write the marker.
// - Every later launch: the marker is there and nothing happens.
// - Restored onto another device from a backup: the marker may come back, but the session items are
//   AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY (auth.store.ts) and never do, so the app still starts signed out.
import { File, Paths } from 'expo-file-system';

import { wipeStoredSession } from './auth.store';

const MARKER_NAME = 'setu-install-marker';

/**
 * Runs once on boot, before restoreSession() (RootNavigator). Never throws.
 * - The marker can't be read: nothing is wiped, and restoreSession() and the 8-hour rule apply as usual.
 * - The marker can't be written: the next launch wipes again, so the person signs in again. Safe, never stuck signed in.
 */
export async function wipeSessionLeftByPreviousInstall(): Promise<void> {
  let marker: File;
  try {
    marker = new File(Paths.document, MARKER_NAME);
    if (marker.exists) return;
  } catch {
    return;
  }
  await wipeStoredSession();
  try {
    marker.create();
  } catch {
    // See above: wiped again on the next launch.
  }
}
