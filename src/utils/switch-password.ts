// The environment switch's password gate (2026-11-17, Ronit's third brief): anyone may open the drawer's "Service Desk
// environment" row, but only someone with the password reaches the sheet that switches.
//
// HONEST LIMITS. This stops a curious employee, not a determined one. The app ships this hash, so anyone can decompile
// it, patch the check out, or try candidate passwords against the hash offline. It is a speed bump. The real control
// is that both environments need a Mount Meru work account to sign in.
//
// - Only a SHA-256 hash of the password is here, never the password: plaintext would sit in the APK's strings and in
//   git history for good. tests/environment/switch-password.test.mjs and scripts/verify-release-bundle.js fail if the
//   plaintext ever appears in the repository or in a release bundle.
// - What is typed is hashed with expo-crypto and only the hashes are compared. The typed value is never logged (in any
//   build), stored, or sent; it lives in the prompt's field until the check, then the field is cleared.
// - After MAX_ATTEMPTS wrong tries in a row, every try is refused for LOCKOUT_MS, and the prompt says so. The count is
//   in memory only: it resets on a correct entry and when the app restarts.
// - A correct entry gives a single-use SwitchPass. switchEnvironment() takes it (src/api/environmentSwitch.ts) for any
//   move away from Production, and the drawer revokes it when the sheet closes. Nothing remembers a correct entry: every
//   switch asks again.
import * as Crypto from 'expo-crypto';

/** SHA-256 of the switch password, lowercase hex (as expo-crypto's digestStringAsync gives it). Not the password. */
export const SWITCH_PASSWORD_SHA256 = 'b0c3a3ca23bfe7e3c3faaf153f9f83e327a589ad1eb1fc9e089cdb22fae201b9';

/** Wrong tries in a row before the lockout. */
export const MAX_ATTEMPTS = 5;
/** How long every try is refused once MAX_ATTEMPTS wrong tries are reached. */
export const LOCKOUT_MS = 60_000;

/** Proof of one correct entry, for one switch. Opaque; only this module makes them. */
export type SwitchPass = { readonly switchPass: true };

const livePasses = new WeakSet<SwitchPass>();

/** Use a pass up: true once for a pass from a correct entry, false for anything else or a pass already used. */
export function redeemSwitchPass(pass: SwitchPass | null | undefined): boolean {
  if (!pass || !livePasses.has(pass)) return false;
  livePasses.delete(pass);
  return true;
}

/** The sheet closed without using it: it can never be used. */
export function revokeSwitchPass(pass: SwitchPass | null | undefined): void {
  if (pass) livePasses.delete(pass);
}

export type PasswordCheck =
  | { ok: true; pass: SwitchPass }
  /** `left`: tries left before the lockout (0 means it has just started). */
  | { ok: false; reason: 'wrong'; left: number }
  /** Refused without checking: still locked for this long. */
  | { ok: false; reason: 'locked'; retryInMs: number };

/** SHA-256 of `value` as lowercase hex, on the phone (expo-crypto). */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.HEX });
  return digest.toLowerCase();
}

/** Compares every character, whatever the first difference, so the time taken says nothing about the hash. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SwitchPasswordGate {
  /** Check a typed password. Refused without hashing while locked. */
  check: (entered: string) => Promise<PasswordCheck>;
  /** Ms left of the lockout, or 0. */
  lockedForMs: () => number;
}

/**
 * A gate for one password hash. The app has one (environmentSwitchGate); tests make their own with a test password, so
 * the real password is never needed outside the person's head.
 */
export function createSwitchPasswordGate({
  expectedSha256,
  digest = sha256Hex,
  now = Date.now,
}: {
  expectedSha256: string;
  digest?: (value: string) => Promise<string>;
  now?: () => number;
}): SwitchPasswordGate {
  let failures = 0;
  let lockedUntil: number | null = null;

  const lockedForMs = () => {
    if (lockedUntil === null) return 0;
    const left = lockedUntil - now();
    if (left > 0) return left;
    // The lockout is over: a fresh set of tries.
    lockedUntil = null;
    failures = 0;
    return 0;
  };

  return {
    lockedForMs,
    check: async (entered) => {
      const locked = lockedForMs();
      if (locked > 0) return { ok: false, reason: 'locked', retryInMs: locked };
      const matches = sameHex(await digest(entered), expectedSha256.toLowerCase());
      if (matches) {
        failures = 0;
        const pass = Object.freeze({ switchPass: true }) as SwitchPass;
        livePasses.add(pass);
        return { ok: true, pass };
      }
      failures += 1;
      if (failures >= MAX_ATTEMPTS) lockedUntil = now() + LOCKOUT_MS;
      return { ok: false, reason: 'wrong', left: Math.max(0, MAX_ATTEMPTS - failures) };
    },
  };
}

/** The app's gate. In memory: a restart starts a fresh count. */
export const environmentSwitchGate: SwitchPasswordGate = createSwitchPasswordGate({ expectedSha256: SWITCH_PASSWORD_SHA256 });

/** What the prompt says after a check, in words. Never contains what was typed. */
export function passwordCheckMessage(result: PasswordCheck): string | null {
  if (result.ok) return null;
  if (result.reason === 'locked') {
    const seconds = Math.ceil(result.retryInMs / 1000);
    return `Too many wrong tries. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
  }
  if (result.left === 0) return `That password is wrong. Too many wrong tries: try again in ${LOCKOUT_MS / 1000} seconds.`;
  return `That password is wrong. ${result.left} ${result.left === 1 ? 'try' : 'tries'} left before a ${LOCKOUT_MS / 1000}-second wait.`;
}
