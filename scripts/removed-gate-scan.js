// Proves the environment switch's PASSWORD GATE is gone (removed 2026-11-18, Ronit's brief: "ADMIN only, no password"),
// from src/ and from a release bundle, WITHOUT holding the password or its hash.
// - The gate shipped a SHA-256 hash of the password (versionCode 7, never released). This file holds only a fingerprint
//   of that hash: SHA-256 of its 64-character hex string. Neither the hash nor the password can be read back from it.
// - `countHashCopies`: every 64-character run of lowercase hex is hashed and compared with the fingerprint, so a copy of
//   the old hash anywhere is found.
// - `countPasswordWindows`: every OLD_PASSWORD_LENGTH-byte run of printable ASCII is hashed twice (the password's hash,
//   then the fingerprint), so the plain-text password is found too, as the old check found it.
// - `GATE_MARKERS`: the gate's own names and words (the prompt, the lockout, the single-use pass).
// Used by tests/environment/admin-switch.test.mjs (src/) and scripts/verify-release-bundle.js (the release bundle).
// Returns counts only, never a match.
const crypto = require('crypto');

/** SHA-256 of the removed gate's SHA-256 hex string. Not the hash, not the password. */
const GATE_HASH_FINGERPRINT = 'c40a3eb78844696b40478ccebceaa8ced5f769a85a7382761c0843daa3b1b14c';
/** The removed password's length (the old scripts/password-scan.js PASSWORD_LENGTH). */
const OLD_PASSWORD_LENGTH = 12;

/** Identifiers and words that existed only in the gate. None may appear in src/ or in a release bundle. */
const GATE_MARKERS = [
  'switch-password', 'SWITCH_PASSWORD', 'SwitchPass', 'switchPass', 'environmentSwitchGate', 'createSwitchPasswordGate',
  'redeemSwitchPass', 'revokeSwitchPass', 'passwordCheckMessage', 'EnvironmentPasswordSheet', 'PASSWORD_REQUIRED',
  'Switch password', 'Too many wrong tries', 'Enter the switch password', 'tries left before a',
];

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/**
 * How many 64-character lowercase-hex runs in `buffer` are the removed hash. `fingerprint` is for the tests' control
 * (a test hash's fingerprint); the default is the removed gate's.
 */
function countHashCopies(buffer, fingerprint = GATE_HASH_FINGERPRINT) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer);
  return (text.match(/[0-9a-f]{64}/g) ?? []).filter((hex) => sha256(hex) === fingerprint).length;
}

/** How many `length`-byte windows of printable ASCII (space included) in `buffer` are the removed password. */
function countPasswordWindows(buffer, length = OLD_PASSWORD_LENGTH, fingerprint = GATE_HASH_FINGERPRINT) {
  let found = 0;
  let run = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    run = byte >= 0x20 && byte <= 0x7e ? run + 1 : 0;
    if (run < length) continue;
    if (sha256(sha256(buffer.subarray(i - length + 1, i + 1))) === fingerprint) found += 1;
  }
  return found;
}

/** The gate's markers found in `text`, each once. */
function gateMarkersIn(text) {
  return GATE_MARKERS.filter((marker) => text.includes(marker));
}

module.exports = { GATE_HASH_FINGERPRINT, GATE_MARKERS, OLD_PASSWORD_LENGTH, countHashCopies, countPasswordWindows, gateMarkersIn };
