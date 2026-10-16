#!/usr/bin/env node
// Release bundle check (docs/RELEASE.md §6). Builds the JavaScript bundle exactly as a release APK/AAB does
// (`expo export:embed --dev false --minify true`, then Hermes bytecode), into the OS temp folder — never into the repo —
// and searches it. Fails (exit 1) when the release bundle contains:
//   - any string from the __DEV__-only developer-token screen (src/screens/auth/DevTokenScreen.tsx, the dev button in
//     LoginScreen, the DevToken route in AuthStack);
//   - a forbidden auth marker or secret name (test-login, x-test-secret, client secret …) or a token-shaped value;
//   - any mountmerugroup.com host other than the ones allowed for this run (UAT only, until a PROD URL is approved).
// A development bundle is also built as a CONTROL, to show the search does find the dev-token strings when they are
// present (informational: after the screen is deleted in Phase 8 the control finds none, which is expected).
// Prints counts only — never a matched value.
//
// Usage: npm run verify:release-bundle            (bundles with EXPO_PUBLIC_APP_ENV=UAT, as the preview profile does)
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(os.tmpdir(), 'mmg-release-check');
const expoCli = require.resolve('expo/bin/cli', { paths: [root] });
const ALLOWED_HOSTS = ['uat-servicedesk.mountmerugroup.com'];
/** utils/session.ts — an old dev-session placeholder id, not a secret. */
const PLACEHOLDER_UUID = '00000000-0000-4000-8000-0000000000ff';

const DEV_TOKEN_NEEDLES = [
  'DevTokenScreen', 'DevTokenForm', 'Developer session token', 'Developer: use a UAT session token',
  'Paste sd_session value', 'sd_session from a UAT browser session', 'That is not an sd_session value',
  "Couldn't verify this token", 'Checking token', 'Use this token', 'The Service Desk did not accept this token',
  '__DEV__ builds only',
];
const FORBIDDEN_NEEDLES = [
  'x-test-secret', 'TEST_AUTH_SECRET', '/auth/test-login', 'client_secret', 'clientSecret', 'AZURE_AD', 'sd_session=',
];
/** Must be present, proving the right file was searched (non-JSON guard, error boundary, login screen). */
const CONTROL_NEEDLES = [
  'Unexpected non-JSON response from the server', 'The app hit an unexpected problem while showing this screen',
  'Sign in with Microsoft',
];

function bundle(dev) {
  const dir = path.join(out, dev ? 'dev' : 'release');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'res'), { recursive: true });
  const file = path.join(dir, 'index.android.bundle');
  const args = [
    expoCli, 'export:embed', '--platform', 'android', '--dev', String(dev), '--minify', String(!dev),
    '--entry-file', 'index.ts', '--bundle-output', file, '--assets-dest', path.join(dir, 'res'),
    ...(dev ? [] : ['--reset-cache']),
  ];
  console.log(`Bundling ${dev ? 'development control' : 'release'} bundle…`);
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, EXPO_PUBLIC_APP_ENV: 'UAT', NODE_ENV: dev ? 'development' : 'production' },
  });
  if (r.status !== 0 || !fs.existsSync(file)) throw new Error(`expo export:embed failed (dev=${dev})`);
  return file;
}

function hermes(jsFile) {
  const bin = { win32: 'win64-bin/hermesc.exe', darwin: 'osx-bin/hermesc', linux: 'linux64-bin/hermesc' }[process.platform];
  if (!bin) return null;
  const hermesc = path.join(path.dirname(require.resolve('hermes-compiler/package.json', { paths: [root] })), 'hermesc', bin);
  if (!fs.existsSync(hermesc)) return null;
  const hbc = `${jsFile}.hbc`;
  const r = spawnSync(hermesc, ['-emit-binary', '-max-diagnostic-width=80', '-O', '-out', hbc, jsFile], { stdio: 'ignore' });
  return r.status === 0 && fs.existsSync(hbc) ? hbc : null;
}

const read = (f) => fs.readFileSync(f).toString('latin1');
const count = (hay, needle) => hay.split(needle).length - 1;

const releaseJs = bundle(false);
const releaseHbc = hermes(releaseJs);
const devJs = bundle(true);
const targets = { 'release JS': read(releaseJs), ...(releaseHbc ? { 'release Hermes': read(releaseHbc) } : {}) };
const control = read(devJs);
const problems = [];

console.log(`\nSearched: ${Object.keys(targets).join(' + ')}${releaseHbc ? '' : ' (hermesc not found: bytecode skipped)'}; control: development bundle.\n`);
console.log('Developer-token screen strings (release must be 0):');
for (const n of DEV_TOKEN_NEEDLES) {
  const counts = Object.entries(targets).map(([k, t]) => [k, count(t, n)]);
  for (const [k, c] of counts) if (c > 0) problems.push(`${k} contains dev-token string ${JSON.stringify(n)} (${c}×)`);
  console.log(`  ${JSON.stringify(n).padEnd(46)} ${counts.map(([k, c]) => `${k}: ${c}`).join('  ')}  | control: ${count(control, n)}`);
}
for (const n of FORBIDDEN_NEEDLES) {
  for (const [k, t] of Object.entries(targets)) if (count(t, n) > 0) problems.push(`${k} contains forbidden marker ${JSON.stringify(n)}`);
}
for (const n of CONTROL_NEEDLES) {
  for (const [k, t] of Object.entries(targets)) if (count(t, n) === 0) problems.push(`${k} is missing expected string ${JSON.stringify(n)} — wrong file?`);
}

const js = targets['release JS'];
const hosts = [...new Set((js.match(/[a-z0-9.-]*mountmerugroup\.com/gi) ?? []).map((h) => h.toLowerCase()))];
const badHosts = hosts.filter((h) => !ALLOWED_HOSTS.includes(h));
if (badHosts.length) problems.push(`release JS names hosts that are not allowed: ${badHosts.join(', ')}`);
const v4 = (js.match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) ?? []).filter((u) => u.toLowerCase() !== PLACEHOLDER_UUID);
if (v4.length) problems.push(`release JS contains ${v4.length} UUID-v4 literal(s) — the shape of a session token (values not printed)`);
if (/Bearer [0-9a-f]{8}-/i.test(js)) problems.push('release JS contains a literal "Bearer <uuid>"');

console.log(`\nmountmerugroup.com hosts in release JS: ${hosts.join(', ') || 'none'}`);
console.log(`Control (development bundle) dev-token strings found: ${DEV_TOKEN_NEEDLES.filter((n) => count(control, n) > 0).length}/${DEV_TOKEN_NEEDLES.length}`);
console.log(`Bundles kept for inspection in: ${out}\n`);

if (problems.length) {
  console.error(`FAIL — ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('PASS — no dev-token screen, forbidden auth marker, token-shaped value or unapproved host in the release bundle.');
