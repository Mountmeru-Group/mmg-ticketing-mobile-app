// In-memory stand-in for expo-secure-store (the phone's Keystore). Tests inspect it through the `__` exports.
const items = new Map();
let failOnKey = null;
let failReadsOn = new Set();

export async function setItemAsync(key, value) {
  if (key === failOnKey) throw new Error('SecureStore refused (test)');
  items.set(key, String(value));
}

export async function getItemAsync(key) {
  if (failReadsOn.has(key)) throw new Error('SecureStore could not decrypt (test)');
  return items.has(key) ? items.get(key) : null;
}

export async function deleteItemAsync(key) {
  items.delete(key);
}

export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY';

/** Empties the store and stops any injected failure. */
export function __reset() {
  items.clear();
  failOnKey = null;
  failReadsOn = new Set();
}

/** Makes setItemAsync(key) throw, like a Keystore failure on a real device. */
export function __failOn(key) {
  failOnKey = key;
}

/** Makes getItemAsync throw for each of these keys, like a Keystore that cannot decrypt after a device restore. */
export function __failReadsOn(...keys) {
  failReadsOn = new Set(keys);
}

/** A copy of everything stored, as `{ key: value }`. */
export function __snapshot() {
  return Object.fromEntries(items);
}
