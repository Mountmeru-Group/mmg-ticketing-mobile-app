#!/usr/bin/env node
// EAS Build guard — runs on the EAS build server as the `eas-build-pre-install` npm hook (package.json), before
// `npm install`, for every profile. It fails the build in seconds, before any compiling.
//
// Since 2026-11-17 the API environment is a RUNTIME choice the person makes in the app (Login's gear;
// src/config/env.ts, src/store/environment.store.ts). No profile fixes it any more, and every release build starts on
// Production, so this guard now refuses a build when:
//   1. the PROD or the UAT API URL in src/config/env.ts is missing or empty: a release build defaults to PROD and offers
//      UAT, so both must be there (fails closed: if env.ts can't be read or parsed, the build is refused);
//   2. EXPO_PUBLIC_APP_ENV is set at all (eas.json, or an EAS environment variable): the app no longer reads it, and a
//      profile that still sets it would only make someone believe it pins the URL.
// Until 2026-11-17 it refused PROD on every profile but `production`, and a `production` build without PROD. Those
// rules assumed the URL was fixed per profile, which is no longer true.
// What it does NOT need to do: keep a development build off PROD. That is enforced in the app itself, in every build
// (src/config/env.ts: a __DEV__ build can only use UAT, has no switch, and refuses a PROD URL), CLAUDE.md rule 4.
// It contains no URL and reads no secret.
// Run locally to preview the verdict: EAS_BUILD_PROFILE=production node scripts/eas-build-guard.js
const fs = require('fs');
const path = require('path');

const profile = process.env.EAS_BUILD_PROFILE || '(none)';

function fail(lines) {
  console.error(['', '⛔ MMG build guard: this build is refused.', ...lines.map((l) => `   ${l}`), ''].join('\n'));
  process.exit(1);
}

/** One entry of API_BASE_URLS in src/config/env.ts (`  UAT: '…',`), or null when it can't be found. */
function urlInEnvTs(name) {
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'env.ts'), 'utf8');
    const match = source.match(new RegExp(`^\\s*${name}:\\s*'([^']*)'`, 'm'));
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

if (process.env.EXPO_PUBLIC_APP_ENV !== undefined) {
  fail([
    `Profile "${profile}" sets EXPO_PUBLIC_APP_ENV.`,
    'The app no longer reads it: the environment is chosen in the app (Login → gear), and every release build',
    'starts on Production. Remove it from eas.json and from the EAS environment variables (docs/RELEASE.md).',
  ]);
}

for (const name of ['PROD', 'UAT']) {
  const url = urlInEnvTs(name);
  if (!url) {
    fail([
      url === null
        ? `Could not read the ${name} entry in src/config/env.ts (failing closed).`
        : `src/config/env.ts has no ${name} API URL.`,
      'Every release build starts on Production and offers UAT, so both URLs must be set (00-OVERVIEW.md §3).',
    ]);
  }
}

console.log(`MMG build guard: profile "${profile}", PROD and UAT URLs present, no EXPO_PUBLIC_APP_ENV — OK.`);
