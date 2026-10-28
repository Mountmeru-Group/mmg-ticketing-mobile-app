// In-memory stand-in for expo-secure-store (the iPhone's Keychain). Tests inspect it through the `__` exports.
const items = new Map();
const calls = [];
let failOnKey = null;

export async function setItemAsync(key, value, options) {
  calls.push({ op: 'set', key, options });
  if (key === failOnKey) throw new Error('SecureStore refused (test)');
  items.set(key, String(value));
}

export async function getItemAsync(key, options) {
  calls.push({ op: 'get', key, options });
  return items.has(key) ? items.get(key) : null;
}

export async function deleteItemAsync(key, options) {
  calls.push({ op: 'delete', key, options });
  items.delete(key);
}

export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY';
export const WHEN_UNLOCKED = 'WHEN_UNLOCKED';
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';

/** Empties the store, forgets the calls and stops any injected failure. */
export function __reset() {
  items.clear();
  calls.length = 0;
  failOnKey = null;
}

/** Makes setItemAsync(key) throw, like a Keychain failure on a real device. */
export function __failOn(key) {
  failOnKey = key;
}

/** A copy of everything stored, as `{ key: value }`. */
export function __snapshot() {
  return Object.fromEntries(items);
}

/** Every call since the last reset, with the options it passed: `{ op, key, options }`. Never a value. */
export function __calls() {
  return calls;
}
