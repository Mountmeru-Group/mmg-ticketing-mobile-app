#!/usr/bin/env node
// Release bundle check (docs/RELEASE.md §6). Builds the JavaScript bundle exactly as a release APK/AAB does
// (`expo export:embed --dev false --minify true`, then Hermes bytecode), into the OS temp folder — never into the repo —
// and searches it. Fails (exit 1) when the release bundle contains:
//   - any string of the deleted developer-token screen (removed 2026-10-29; kept as a regression check);
//   - a forbidden auth marker or secret name (test-login, x-test-secret, client secret …) or a token-shaped value;
//   - any mountmerugroup.com host other than the two in src/config/env.ts.
// Allowed, because they are not secrets (each one is explained in RELEASE.md §6):
//   - `client_secret` / `clientSecret` (any case, `_`, `-` or nothing between) ONLY where the source map traces the
//     occurrence to expo-auth-session's own files, and ONLY as a name: given a literal value anywhere, it fails;
//   - three public UUIDs, by exact value: the Entra client ID, the Entra tenant ID and the EAS project ID;
//   - Metro's own `//# debugId=` trailer, only at the end of the file and only if it matches the source map.
// A development bundle is also built as a CONTROL: a __DEV__-only string must be found there and not in release,
// proving both that the search works and that __DEV__ code is stripped from the release bundle.
// Prints counts and file names only — never a matched value.
//
// Usage: npm run verify:release-bundle            EXPO_PUBLIC_APP_ENV=UAT, as the preview profile builds
//        npm run verify:release-bundle -- --prod  EXPO_PUBLIC_APP_ENV=PROD, as the production profile builds
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(os.tmpdir(), 'mmg-release-check');
const expoCli = require.resolve('expo/bin/cli', { paths: [root] });
const APP_ENV = process.argv.includes('--prod') ? 'PROD' : 'UAT';
/** Both API hosts of src/config/env.ts: its URL table is bundled whole, so every bundle names both. */
const ALLOWED_HOSTS = ['uat-servicedesk.mountmerugroup.com', 'servicedesk.mountmerugroup.com'];
/** Public identifiers, not secrets (02-AUTH §7.1). Exact values: any other UUID-v4 literal still fails. */
const PUBLIC_UUIDS = {
  '76c6edf5-a09c-4d1a-9a48-68f84697678b': 'Entra client ID (src/config/auth.config.ts)',
  '24067079-ff6a-4c4e-a5de-7c5ac7ddf4d8': 'Entra tenant ID (src/config/auth.config.ts)',
  '86788b11-328a-4ad7-a3dc-275b6f31325e': 'EAS projectId (app.json, bundled through src/config/env.ts)',
};

const DEV_TOKEN_NEEDLES = [
  'DevTokenScreen', 'DevTokenForm', 'Developer session token', 'Developer: use a UAT session token',
  'Paste sd_session value', 'sd_session from a UAT browser session', 'That is not an sd_session value',
  "Couldn't verify this token", 'Checking token', 'Use this token', 'The Service Desk did not accept this token',
  '__DEV__ builds only',
];
const FORBIDDEN_NEEDLES = ['x-test-secret', 'TEST_AUTH_SECRET', '/auth/test-login', 'AZURE_AD', 'sd_session='];
/** The auth library's own option names. Checked by origin and value below, not as plain needles. */
const SECRET_NAME = /client[_-]?secret/gi;
const SECRET_NAME_OWNER = '/node_modules/expo-auth-session/';
/** A secret name given a literal: `clientSecret:"…"`, `client_secret='…'`, or `?client_secret=…` inside a string. */
const SECRET_VALUE = [/client[_-]?secret["'`]?\s*[:=]\s*["'`]/gi, /[?&]client[_-]?secret=(?!\$\{)[^&"'`\s]/gi];
/** Must be present, proving the right file was searched (non-JSON guard, error boundary, login screen). */
const CONTROL_NEEDLES = [
  'Unexpected non-JSON response from the server', 'The app hit an unexpected problem while showing this screen',
  'Sign in with Microsoft',
];
/** Only inside `if (__DEV__)` in src/config/env.ts: in the development control, never in release. */
const DEV_ONLY_NEEDLE = 'a development build must never point at production';

function bundle(dev) {
  const dir = path.join(out, dev ? 'dev' : 'release');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'res'), { recursive: true });
  const file = path.join(dir, 'index.android.bundle');
  const args = [
    expoCli, 'export:embed', '--platform', 'android', '--dev', String(dev), '--minify', String(!dev),
    '--entry-file', 'index.ts', '--bundle-output', file, '--assets-dest', path.join(dir, 'res'),
    ...(dev ? [] : ['--reset-cache', '--sourcemap-output', `${file}.map`]),
  ];
  console.log(`Bundling ${dev ? 'development control' : `release (EXPO_PUBLIC_APP_ENV=${APP_ENV})`} bundle…`);
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, EXPO_PUBLIC_APP_ENV: dev ? 'UAT' : APP_ENV, NODE_ENV: dev ? 'development' : 'production' },
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

const B64 = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]));

/** One source-map segment: Base64 VLQ → signed integers. */
function decodeSegment(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64[ch];
    if (digit === undefined) throw new Error('bad source map');
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

/** (generated line, column) → original source path, from a standard (non-indexed) v3 source map. */
function sourceLookup(map) {
  if (map?.version !== 3 || typeof map.mappings !== 'string' || !Array.isArray(map.sources)) throw new Error('bad source map');
  let source = 0;
  const lines = map.mappings.split(';').map((line) => {
    const segments = [];
    let column = 0;
    for (const segment of line.split(',')) {
      if (!segment) continue;
      const v = decodeSegment(segment);
      column += v[0];
      if (v.length >= 4) {
        source += v[1];
        segments.push([column, source]);
      }
    }
    return segments;
  });
  return (line, column) => {
    let hit = null;
    for (const [c, s] of lines[line] ?? []) {
      if (c > column) break;
      hit = s;
    }
    return hit === null ? null : String(map.sources[hit]).replace(/\\/g, '/');
  };
}

/** Where each occurrence of `re` in `js` comes from: original source path, or null when the map has none. */
function originsOf(js, re, lookup) {
  const lineStarts = [0];
  for (let i = js.indexOf('\n'); i !== -1; i = js.indexOf('\n', i + 1)) lineStarts.push(i + 1);
  return [...js.matchAll(re)].map((m) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= m.index) lo = mid;
      else hi = mid - 1;
    }
    return lookup(lo, m.index - lineStarts[lo]);
  });
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
console.log('Developer-token screen strings (deleted 2026-10-29; release must be 0):');
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
if (count(control, DEV_ONLY_NEEDLE) === 0) problems.push('development control is missing its __DEV__-only string — the search or the control is broken');
for (const [k, t] of Object.entries(targets)) {
  if (count(t, DEV_ONLY_NEEDLE) > 0) problems.push(`${k} contains __DEV__-only code — not a release bundle`);
}

let map = null;
try {
  map = JSON.parse(fs.readFileSync(`${releaseJs}.map`, 'utf8'));
} catch {
  // reported below: without the map nothing can be traced, and the debugId trailer is not set aside
}
// Metro ends a bundle built with a source map with `//# debugId=<uuid>`: a fresh id per build, also written into the
// map. Set aside ONLY that exact trailer at the end of the file, and only when its id is the map's own.
const TRAILER = /\n\/\/# sourceMappingURL=[^\n]*\n\/\/# debugId=([0-9a-f-]{36})\s*$/i;
const trailer = targets['release JS'].match(TRAILER);
const js = trailer && map?.debugId === trailer[1] ? targets['release JS'].slice(0, trailer.index) : targets['release JS'];

// Secret names: by origin (source map) and by value. Hermes bytecode keeps no source positions, so these names are
// judged on the release JS it is compiled from; every other needle above is still searched in the bytecode too.
let origins = [];
try {
  const lookup = sourceLookup(map);
  // Proof the tracing works: a string the app owns must trace to its own file, not to the library.
  const probe = originsOf(js, /Unexpected non-JSON response from the server/g, lookup);
  if (!probe.length || !probe.every((o) => o?.endsWith('/src/api/client.ts'))) throw new Error('probe string not traced to src/api/client.ts');
  origins = originsOf(js, SECRET_NAME, lookup);
} catch (e) {
  problems.push(`release source map unreadable (${e.message}): client secret names cannot be traced, so they fail`);
  origins = (js.match(SECRET_NAME) ?? []).map(() => null);
}
const strangers = origins.filter((o) => !o || !o.includes(SECRET_NAME_OWNER));
if (strangers.length) {
  const files = [...new Set(strangers.map((o) => (o ? o.replace(/^.*?\/(node_modules|src)\//, '$1/') : '(no source)')))];
  problems.push(`release JS has ${strangers.length} client-secret name(s) from outside expo-auth-session: ${files.join(', ')}`);
}
const valued = SECRET_VALUE.reduce((n, re) => n + (js.match(re) ?? []).length, 0);
if (valued) problems.push(`release JS gives a client-secret name a literal value ${valued}× (values not printed)`);

const hosts = [...new Set((js.match(/[a-z0-9.-]*mountmerugroup\.com/gi) ?? []).map((h) => h.toLowerCase()))];
const badHosts = hosts.filter((h) => !ALLOWED_HOSTS.includes(h));
if (badHosts.length) problems.push(`release JS names hosts that are not allowed: ${badHosts.join(', ')}`);
const v4 = js.match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) ?? [];
const knownV4 = v4.filter((u) => PUBLIC_UUIDS[u.toLowerCase()]);
const unknownV4 = v4.length - knownV4.length;
if (unknownV4) problems.push(`release JS contains ${unknownV4} UUID-v4 literal(s) — the shape of a session token (values not printed)`);
if (/Bearer [0-9a-f]{8}-/i.test(js)) problems.push('release JS contains a literal "Bearer <uuid>"');

console.log(`\nClient-secret names in release JS: ${origins.length}, from expo-auth-session: ${origins.length - strangers.length}, given a literal value: ${valued}`);
console.log(`Public UUIDs in release JS: ${[...new Set(knownV4.map((u) => PUBLIC_UUIDS[u.toLowerCase()]))].join('; ') || 'none'}; other UUID-v4 literals: ${unknownV4}${js.length < targets['release JS'].length ? ' (Metro debugId trailer set aside)' : ''}`);
console.log(`mountmerugroup.com hosts in release JS: ${hosts.join(', ') || 'none'}`);
console.log(`Control (development bundle): __DEV__-only string found ${count(control, DEV_ONLY_NEEDLE)}×; dev-token strings ${DEV_TOKEN_NEEDLES.filter((n) => count(control, n) > 0).length}/${DEV_TOKEN_NEEDLES.length} (0 expected: the screen is deleted)`);
console.log(`Bundles kept for inspection in: ${out}\n`);

if (problems.length) {
  console.error(`FAIL — ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`PASS (${APP_ENV}) — no dev-token screen, forbidden auth marker, secret value, token-shaped value or unapproved host in the release bundle.`);
