// The five people the role matrix is about (docs/ROLE-MATRIX.md), shared by every tests/rbac suite.
// Triage AGENT: the server's definition is an email in TRIAGE_USER_EMAILS, which the app cannot see (ask A4). The app
// uses the web UI's definition, an AGENT with no countryId (05 §A.12, FE:CountrySelector.tsx:30), so that is tested.
import assert from 'node:assert/strict';
import { test } from 'node:test';

export const PERSONAS = {
  END_USER: { id: 'user-end', role: 'END_USER', countryId: 'country-tz', email: 'end@example.test', displayName: 'End User', ldapSamAccount: null },
  AGENT: { id: 'user-agent', role: 'AGENT', countryId: 'country-tz', email: 'agent@example.test', displayName: 'Agent', ldapSamAccount: null },
  TRIAGE_AGENT: { id: 'user-triage', role: 'AGENT', countryId: null, email: 'triage@example.test', displayName: 'Triage', ldapSamAccount: null },
  L2_MANAGER: { id: 'user-l2', role: 'L2_MANAGER', countryId: 'country-tz', email: 'l2@example.test', displayName: 'L2', ldapSamAccount: null },
  ADMIN: { id: 'user-admin', role: 'ADMIN', countryId: null, email: 'admin@example.test', displayName: 'Admin', ldapSamAccount: null },
};
export const NAMES = Object.keys(PERSONAS);
export const OTHER_USER = 'user-someone-else';

/** For each persona: the expected value, written out in full so an extra permission shows up as a diff. */
export function forEachPersona(title, expected, actual) {
  for (const name of NAMES) {
    test(`${title}: ${name}`, () => {
      assert.deepEqual(actual(PERSONAS[name]), expected[name]);
    });
  }
}
