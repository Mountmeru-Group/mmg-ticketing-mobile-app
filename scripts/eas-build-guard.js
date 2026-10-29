#!/usr/bin/env node
// EAS Build guard — runs on the EAS build server as the `eas-build-pre-install` npm hook (package.json), before
// `npm install`, for every profile. It fails the build in seconds, before any compiling, when:
//   1. the profile is `production` while the PROD API URL in src/config/env.ts is still the empty placeholder
//      (00-OVERVIEW §3: no production target until Ronit signs off and the blocking backend asks ship);
//   2. any profile other than `production` asks for EXPO_PUBLIC_APP_ENV=PROD (development and preview builds are
//      UAT-only, CLAUDE.md rule 4);
//   3. (iOS-4) the profile is `production` while a value App Review needs is still empty in src/config/legal.ts: the
//      privacy-policy URL (App Review 5.1.1(i)), or the account-deletion category and working days (5.1.1(v);
//      docs/ios/APP-STORE-COMPLIANCE.md H1, H6).
// It contains no URL and reads no secret. Fails closed: if a file can't be read or parsed, production is refused.
// Run locally to preview the verdict: EAS_BUILD_PROFILE=production node scripts/eas-build-guard.js
// The rules are verdict(), a pure function, so tests/screens/hig-polish.test.mjs checks each one.
const fs = require('fs');
const path = require('path');

/** The PROD entry of API_BASE_URLS in an env.ts source, or null when it can't be found. */
function prodUrlFrom(envSource) {
  const match = typeof envSource === 'string' ? envSource.match(/^\s*PROD:\s*'([^']*)'/m) : null;
  return match ? match[1].trim() : null;
}

/** The release values in a legal.ts source; each null when it can't be found. */
function legalValuesFrom(legalSource) {
  const text = typeof legalSource === 'string' ? legalSource : '';
  const string = (name) => {
    const match = text.match(new RegExp(`^export const ${name} = '([^']*)';`, 'm'));
    return match ? match[1].trim() : null;
  };
  const days = text.match(/^export const ACCOUNT_DELETION_WORKING_DAYS = (\d+);/m);
  return {
    privacyPolicyUrl: string('PRIVACY_POLICY_URL'),
    deletionCategory: string('ACCOUNT_DELETION_CATEGORY'),
    deletionWorkingDays: days ? Number(days[1]) : null,
  };
}

/**
 * The guard's decision for one build: `ok`, or the lines saying why it is refused. Pure: the build's profile and
 * EXPO_PUBLIC_APP_ENV, and the text of src/config/env.ts and src/config/legal.ts (null when unreadable).
 */
function verdict({ profile, appEnv, envSource, legalSource }) {
  if (profile !== 'production' && appEnv === 'PROD') {
    return {
      ok: false,
      lines: [
        `Profile "${profile}" sets EXPO_PUBLIC_APP_ENV=PROD.`,
        'Only the production profile may target production. development and preview are UAT-only (CLAUDE.md rule 4).',
      ],
    };
  }
  if (profile !== 'production') return { ok: true, lines: [] };

  const lines = [];
  const prodUrl = prodUrlFrom(envSource);
  if (!prodUrl) {
    lines.push(
      'The production profile is a PLACEHOLDER and is not runnable yet.',
      prodUrl === null
        ? 'Could not read the PROD entry in src/config/env.ts (failing closed).'
        : 'src/config/env.ts has no PROD API URL: Ronit has not approved a production target.',
      'Before a production build: Ronit signs off the PROD URL, the blocking backend asks ship, and the',
      'pre-release checklist in docs/RELEASE.md is complete.',
    );
  }
  if (appEnv !== 'PROD') lines.push('The production profile must set EXPO_PUBLIC_APP_ENV=PROD in eas.json.');

  const legal = legalValuesFrom(legalSource);
  if (!legal.privacyPolicyUrl || !/^https:\/\/\S+$/.test(legal.privacyPolicyUrl)) {
    lines.push(
      'src/config/legal.ts has no PRIVACY_POLICY_URL (an https link): App Review 5.1.1(i) needs the privacy policy',
      'linked in the app (docs/ios/APP-STORE-COMPLIANCE.md H1).',
    );
  }
  if (!legal.deletionCategory) {
    lines.push(
      'src/config/legal.ts has no ACCOUNT_DELETION_CATEGORY: the in-app deletion request (App Review 5.1.1(v),',
      'compliance H6) would be hidden.',
    );
  }
  if (!legal.deletionWorkingDays || legal.deletionWorkingDays < 1) {
    lines.push('src/config/legal.ts has no ACCOUNT_DELETION_WORKING_DAYS: the deletion request must say how long IT takes (H6).');
  }
  return lines.length > 0 ? { ok: false, lines } : { ok: true, lines: [] };
}

module.exports = { verdict, prodUrlFrom, legalValuesFrom };

if (require.main === module) {
  const read = (file) => {
    try {
      return fs.readFileSync(path.join(__dirname, '..', 'src', 'config', file), 'utf8');
    } catch {
      return null;
    }
  };
  const profile = process.env.EAS_BUILD_PROFILE || '(none)';
  const appEnv = process.env.EXPO_PUBLIC_APP_ENV || '';
  const result = verdict({ profile, appEnv, envSource: read('env.ts'), legalSource: read('legal.ts') });
  if (!result.ok) {
    console.error(['', '⛔ MMG build guard: this build is refused.', ...result.lines.map((l) => `   ${l}`), ''].join('\n'));
    process.exit(1);
  }
  console.log(`MMG build guard: profile "${profile}", EXPO_PUBLIC_APP_ENV=${appEnv || '(unset → UAT)'} — OK.`);
}
