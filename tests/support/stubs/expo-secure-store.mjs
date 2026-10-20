// In-memory stand-in for expo-secure-store (the phone's Keystore). Tests inspect it through the `__` exports.
const items = new Map();
let failOnKey = null;

export async function setItemAsync(key, value) {
  if (key === failOnKey) throw new Error('SecureStore refused (test)');
  items.set(key, String(value));
}

export async function getItemAsync(key) {
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
}

/** Makes setItemAsync(key) throw, like a Keystore failure on a real device. */
export function __failOn(key) {
  failOnKey = key;
}

/** A copy of everything stored, as `{ key: value }`. */
export function __snapshot() {
  return Object.fromEntries(items);
}
