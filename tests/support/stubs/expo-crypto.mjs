// Stand-in for expo-crypto (the phone's native hashing), with Node's own SHA-256: the same digest, lowercase hex.
// Only what src/ uses: digestStringAsync with SHA-256 and the HEX encoding.
import { createHash } from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512', MD5: 'MD5' };
export const CryptoEncoding = { HEX: 'hex', BASE64: 'base64' };

const NODE_NAMES = { 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512', MD5: 'md5' };

let calls = 0;

export async function digestStringAsync(algorithm, data, options = { encoding: CryptoEncoding.HEX }) {
  calls += 1;
  return createHash(NODE_NAMES[algorithm]).update(String(data), 'utf8').digest(options.encoding === CryptoEncoding.BASE64 ? 'base64' : 'hex');
}

/** How many digests were asked for (never what was hashed). */
export function __calls() {
  return calls;
}
