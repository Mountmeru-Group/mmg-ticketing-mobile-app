// In-memory stand-in for the part of expo-file-system that src/store/installMarker.ts uses (iOS-5d): `Paths.document`
// and a `File` with `exists` and `create()`. The app container is a set of paths; deleting the app empties it, while
// the Keychain stub (./expo-secure-store.mjs) keeps its items, as iOS does. Tests inspect it through the `__` exports.
const files = new Set();
let failExists = false;
let failCreate = false;

export const Paths = { document: 'file:///app-container/Documents' };

export class File {
  constructor(directory, name) {
    this.uri = `${directory}/${name}`;
  }

  get exists() {
    if (failExists) throw new Error('File system unreadable (test)');
    return files.has(this.uri);
  }

  create() {
    if (failCreate) throw new Error('File system refused (test)');
    files.add(this.uri);
  }
}

/** A fresh install: the app container is empty, and no failure is injected. */
export function __reset() {
  files.clear();
  failExists = false;
  failCreate = false;
}

/** Makes `exists` throw, like a container that can't be read. */
export function __failExists(value = true) {
  failExists = value;
}

/** Makes `create()` throw, like a container that can't be written. */
export function __failCreate(value = true) {
  failCreate = value;
}

/** The paths in the app container. */
export function __files() {
  return [...files];
}
