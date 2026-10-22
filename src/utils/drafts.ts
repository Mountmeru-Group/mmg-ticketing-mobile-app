// Local drafts (02 §5.4): what a person typed in the reply composer or the new-ticket form, kept on this phone so a
// 401 on submit, a crash or an incoming call does not lose it. Text and picked ids only — never attachments (their
// URIs are temporary) and nothing that came from the server. One small JSON file per draft in the app's private
// document folder, keyed by the signed-in user's id so a shared phone never shows another person's draft. Cleared on
// send and on Discard. Nothing here is a secret: no token, no server data.
import { Directory, File, Paths } from 'expo-file-system';

const FOLDER = 'mmg-drafts';

function fileFor(key: string): File {
  // The key is built from ids the app controls; still, never let it form a path.
  const safe = key.replace(/[^A-Za-z0-9_.-]/g, '_');
  return new File(Paths.document, FOLDER, `${safe}.json`);
}

/** The draft saved under `key`, or null when there is none or it cannot be read. Never throws. */
export async function readDraft<T extends object>(key: string): Promise<T | null> {
  try {
    const file = fileFor(key);
    if (!file.exists) return null;
    const parsed: unknown = JSON.parse(await file.text());
    return typeof parsed === 'object' && parsed !== null ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** Best effort: a draft that cannot be written is simply not restored later. Never throws. */
export async function writeDraft(key: string, value: object): Promise<void> {
  try {
    const folder = new Directory(Paths.document, FOLDER);
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    fileFor(key).write(JSON.stringify(value));
  } catch {
    // nothing to do
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    const file = fileFor(key);
    if (file.exists) file.delete();
  } catch {
    // nothing to clear
  }
}
