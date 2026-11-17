// Finds the environment switch password in files or bundles WITHOUT knowing it (2026-11-17, third brief). Every run of
// PASSWORD_LENGTH printable characters is hashed with SHA-256 and compared with SWITCH_PASSWORD_SHA256 from
// src/utils/switch-password.ts. So neither this file, nor the test that uses it, nor the release check holds the password.
// Used by tests/environment/switch-password.test.mjs (the whole repository) and scripts/verify-release-bundle.js (the
// release JavaScript and Hermes bytecode). Prints and returns counts only, never a match.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * The password's length: not the password, and not secret enough to matter next to a hash the app ships anyway. If the
 * password changes, its hash changes, and the test that pins the hash fails until this is updated too.
 */
const PASSWORD_LENGTH = 12;

/** The hash the app ships, read from the source (one place). */
function readPasswordHash(root) {
  const source = fs.readFileSync(path.join(root, 'src', 'utils', 'switch-password.ts'), 'utf8');
  const match = source.match(/^export const SWITCH_PASSWORD_SHA256 = '([0-9a-f]{64})';$/m);
  if (!match) throw new Error('SWITCH_PASSWORD_SHA256 not found in src/utils/switch-password.ts');
  return match[1];
}

/** How many PASSWORD_LENGTH-byte windows of printable ASCII (space included) in `buffer` hash to `sha256hex`. */
function countPasswordWindows(buffer, sha256hex, length = PASSWORD_LENGTH) {
  let found = 0;
  let run = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    run = byte >= 0x20 && byte <= 0x7e ? run + 1 : 0;
    if (run < length) continue;
    const window = buffer.subarray(i - length + 1, i + 1);
    if (crypto.createHash('sha256').update(window).digest('hex') === sha256hex) found += 1;
  }
  return found;
}

module.exports = { PASSWORD_LENGTH, readPasswordHash, countPasswordWindows };
