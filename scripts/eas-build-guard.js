#!/usr/bin/env node
// EAS Build guard — runs on the EAS build server as the `eas-build-pre-install` npm hook (package.json), before
// `npm install`, for every profile. It fails the build in seconds, before any compiling, when:
//   1. the profile is `production` while the PROD API URL in src/config/env.ts is still the empty placeholder
//      (00-OVERVIEW §3: no production target until Ronit signs off and the blocking backend asks ship);
//   2. any profile other than `production` asks for EXPO_PUBLIC_APP_ENV=PROD (development and preview builds are
//      UAT-only, CLAUDE.md rule 4).
// It contains no URL and reads no secret. Fails closed: if env.ts can't be read or parsed, production is refused.
// Run locally to preview the verdict: EAS_BUILD_PROFILE=production node scripts/eas-build-guard.js
const fs = require('fs');
const path = require('path');

const profile = process.env.EAS_BUILD_PROFILE || '(none)';
const appEnv = process.env.EXPO_PUBLIC_APP_ENV || '';

function fail(lines) {
  console.error(['', '⛔ MMG build guard: this build is refused.', ...lines.map((l) => `   ${l}`), ''].join('\n'));
  process.exit(1);
}

/** The PROD entry of API_BASE_URLS in src/config/env.ts, or null when it can't be found. */
function prodUrlInEnvTs() {
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'env.ts'), 'utf8');
    const match = source.match(/^\s*PROD:\s*'([^']*)'/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

if (profile !== 'production' && appEnv === 'PROD') {
  fail([
    `Profile "${profile}" sets EXPO_PUBLIC_APP_ENV=PROD.`,
    'Only the production profile may target production. development and preview are UAT-only (CLAUDE.md rule 4).',
  ]);
}

if (profile === 'production') {
  const prodUrl = prodUrlInEnvTs();
  if (!prodUrl) {
    fail([
      'The production profile is a PLACEHOLDER and is not runnable yet.',
      prodUrl === null
        ? 'Could not read the PROD entry in src/config/env.ts (failing closed).'
        : 'src/config/env.ts has no PROD API URL: Ronit has not approved a production target.',
      'Before a production build: Ronit signs off the PROD URL, the blocking backend asks ship, and the',
      'pre-release checklist in docs/RELEASE.md is complete.',
    ]);
  }
  if (appEnv !== 'PROD') {
    fail(['The production profile must set EXPO_PUBLIC_APP_ENV=PROD in eas.json.']);
  }
}

console.log(`MMG build guard: profile "${profile}", EXPO_PUBLIC_APP_ENV=${appEnv || '(unset → UAT)'} — OK.`);
