// Expo's dynamic config, on top of app.json. app.json stays the source of truth for everything; Expo hands it in as
// `config`. This file does ONE thing: point the Android build at Firebase's google-services.json (project `mmg-setu`,
// package com.mountmeru.servicedesk) when, and only when, the build has been given it. docs/RELEASE.md §2b.
//
// - EAS: GOOGLE_SERVICES_JSON is an EAS *file* environment variable, visibility "secret", set in BOTH the `preview` and
//   the `production` environments (production added 2026-11-06). EAS writes the file on the build server and sets the
//   variable to its path. This file reads the variable and nothing else: it never looks at the build profile or at
//   EXPO_PUBLIC_APP_ENV, so a UAT build and a PROD build take the same path and both get Firebase.
// - On this machine: the file sits at the repo root and is git-ignored (.gitignore). EAS uploads only what git tracks,
//   so a file placed there never reaches an EAS build by itself. A local native build uses it only when asked:
//   `GOOGLE_SERVICES_JSON=./google-services.json npx expo run:android`.
// - Without the variable, `android.googleServicesFile` is not set at all: prebuild never looks for a file that is not
//   there (it would fail with "Cannot copy google-services.json").
module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
