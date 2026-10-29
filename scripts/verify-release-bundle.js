#!/usr/bin/env node
// Release bundle check, iOS (docs/ios/RELEASE-IOS.md §3). Ported from the Android script at c84d53a (Phase iOS-5).
// Builds the JavaScript bundle as the iOS release build does (`expo export:embed --platform ios --dev false --minify true`
// into main.jsbundle, with its source map), compiles it to Hermes bytecode, and builds a development bundle as a
// CONTROL. Everything goes to the OS temp folder, never the repo, and is deleted afterwards (--keep keeps it).
// Fails (exit 1) when the release bundle:
//   - contains a string of the __DEV__-only developer-token screen, or a "DEV PLACEHOLDER" string;
//   - contains a test-login marker, a backend secret name, a client-secret VALUE, a token-shaped UUID or "Bearer <uuid>";
//   - names the client-secret option outside expo-auth-session's own modules;
//   - lacks the iOS redirect msauth.com.mountmeru.servicedesk://auth, or contains the Android form (msauth://);
//   - (preview) lacks the UAT API URL, or names any mountmerugroup.com host that is not allowed;
//   - reaches an Android-only API from app code (comments do not count), or bundles the drawer navigator.
// Android's false positives, fixed here (02-AUTH.md §7.6 item 8; PERFORMANCE.md §9.3):
//   - `client_secret` / `clientSecret` are expo-auth-session's own option names. The names are now allowed only inside
//     node_modules/expo-auth-session, and secret VALUES are searched instead (manifest §4.10, approved 2026-10-28);
//   - the Entra client and tenant IDs (public, src/config/auth.config.ts) and the EAS projectId (app.json, once set) are
//     UUIDs, not tokens. They are read from those files and allowed, along with UUIDs that only library code defines
//     and the build's own source-map debug id (the bundle's last line, equal to the map's `debugId`).
// Prints counts only — never a matched value.
//
// Usage: npm run verify:release-bundle                          (the preview profile: EXPO_PUBLIC_APP_ENV=UAT)
//        npm run verify:release-bundle -- --profile production  (EXPO_PUBLIC_APP_ENV=PROD; before iOS-9 only)
//        add --keep to keep the bundles in the temp folder for inspection.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const profile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'preview';
const keep = args.includes('--keep');
if (!['preview', 'production'].includes(profile)) {
  console.error(`Unknown profile "${profile}": use preview or production.`);
  process.exit(2);
}
const appEnv = profile === 'production' ? 'PROD' : 'UAT';
const out = path.join(os.tmpdir(), 'mmg-release-check-ios');
const expoCli = require.resolve('expo/bin/cli', { paths: [root] });
const ts = require(require.resolve('typescript', { paths: [root] }));
const readRepo = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// ── What the bundle may contain, read from the repo so it can't drift ──
const envSource = readRepo('src/config/env.ts');
const UAT_API_URL = (envSource.match(/^\s*UAT:\s*'([^']+)'/m) ?? [])[1];
const PROD_API_URL = (envSource.match(/^\s*PROD:\s*'([^']*)'/m) ?? [])[1] ?? '';
const hostOf = (url) => (url ? url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase() : null);
const ALLOWED_HOSTS = [hostOf(UAT_API_URL), hostOf(PROD_API_URL)].filter(Boolean);
const IOS_REDIRECT = (readRepo('src/config/auth.config.ts').match(/IOS_AUTH_REDIRECT_URI = '([^']+)'/) ?? [])[1];
const authConfig = readRepo('src/config/auth.config.ts');
const PUBLIC_UUIDS = new Set(
  [
    (authConfig.match(/EXPO_PUBLIC_AZURE_CLIENT_ID \|\| '([0-9a-f-]{36})'/i) ?? [])[1], // Entra client ID (public)
    (authConfig.match(/EXPO_PUBLIC_AZURE_TENANT_ID \|\| '([0-9a-f-]{36})'/i) ?? [])[1], // Entra tenant ID (public)
    JSON.parse(readRepo('app.json')).expo?.extra?.eas?.projectId, // EAS project (iOS-7), public
    '00000000-0000-4000-8000-0000000000ff', // utils/session.ts — an old dev-session placeholder id, not a secret
  ]
    .filter(Boolean)
    .map((u) => u.toLowerCase()),
);

const DEV_TOKEN_NEEDLES = [
  'DevTokenScreen', 'DevTokenForm', 'Developer session token', 'Developer: use a UAT session token',
  'Paste sd_session value', 'sd_session from a UAT browser session', 'That is not an sd_session value',
  "Couldn't verify this token", 'Checking token', 'Use this token', 'The Service Desk did not accept this token',
  '__DEV__ builds only',
];
/** The iOS-2 route placeholders (deleted in iOS-3c): never again in a release bundle. */
const PLACEHOLDER_NEEDLES = ['DEV PLACEHOLDER', 'DevPlaceholderScreen', 'replaced in iOS-3'];
/** Test-login markers and the backend's secret names (02 §6). The client-secret option names are checked below. */
const FORBIDDEN_NEEDLES = ['x-test-secret', 'TEST_AUTH_SECRET', '/auth/test-login', 'AZURE_AD', 'sd_session='];
/**
 * Secret VALUES: an Entra client secret (`xxxNQ~…`, 40 characters); a string literal assigned to the client-secret
 * option; or `client_secret=<value>` inside a string (a hard-coded form body). expo-auth-session's own code copies the
 * option into the request (`s.client_secret=t.clientSecret`): code, not a value, so it is not matched.
 */
const SECRET_VALUE_PATTERNS = [
  /[A-Za-z0-9_~.-]{3}\dQ~[A-Za-z0-9_~.-]{31,34}/,
  /client_?secret["']?\s*[:=]\s*["'`][^"'`\s]{6,}["'`]/i,
  /["'`][^"'`\n]{0,200}client_secret=[^&"'`\s${}]{6,}/i,
];
const SECRET_NAMES = ['clientSecret', 'client_secret'];
const SECRET_NAME_OWNERS = ['node_modules/expo-auth-session/'];
/** Android-only APIs: none may be reached from app code in an iOS release. */
const ANDROID_ONLY_APIS = [
  'ToastAndroid', 'BackHandler', 'PermissionsAndroid', 'DateTimePickerAndroid', 'DrawerLayoutAndroid',
  'TouchableNativeFeedback', 'android_ripple',
];
/** Android-only props: iOS ignores them. Reported, not failed. */
const ANDROID_ONLY_PROPS = ['statusBarTranslucent', 'navigationBarTranslucent', 'hardwareAccelerated'];
/** Must be present, proving the right file was searched (non-JSON guard, error boundary, login screen). */
const CONTROL_NEEDLES = [
  'Unexpected non-JSON response from the server', 'The app hit an unexpected problem while showing this screen',
  'Sign in with Microsoft',
];

function bundle(dev) {
  const dir = path.join(out, dev ? 'dev' : 'release');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const file = path.join(dir, 'main.jsbundle');
  const cliArgs = [
    expoCli, 'export:embed', '--platform', 'ios', '--dev', String(dev), '--minify', String(!dev),
    '--entry-file', 'index.ts', '--bundle-output', file, '--assets-dest', path.join(dir, 'assets'),
    ...(dev ? [] : ['--sourcemap-output', `${file}.map`, '--reset-cache']),
  ];
  console.log(`Bundling ${dev ? 'development control' : `release (${profile}, EXPO_PUBLIC_APP_ENV=${appEnv})`} bundle…`);
  const r = spawnSync(process.execPath, cliArgs, {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, EXPO_PUBLIC_APP_ENV: appEnv, NODE_ENV: dev ? 'development' : 'production' },
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
/** Source code without its comments (TypeScript's own scanner), so a comment naming an API never counts. */
function codeOnly(file, text) {
  if (!/\.[cm]?[jt]sx?$/.test(file)) return text;
  return ts.transpileModule(text, {
    fileName: file,
    compilerOptions: { removeComments: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
}

const problems = [];
const releaseJs = bundle(false);
const releaseHbc = hermes(releaseJs);
const devJs = bundle(true);
const targets = { 'release JS': read(releaseJs), ...(releaseHbc ? { 'release Hermes': read(releaseHbc) } : {}) };
const control = read(devJs);
const js = targets['release JS'];

// The modules the release bundle contains, from its source map: what is reachable in a release build.
const map = JSON.parse(fs.readFileSync(`${releaseJs}.map`, 'utf8'));
// Metro names each module from the project root with a leading "/" ("/App.tsx", "/node_modules/…"); its own virtual
// modules start with "__" or a NUL ("__prelude__", "\0polyfill:…").
const modules = (map.sources ?? []).map((source, i) => {
  const virtual = source.startsWith('__') || source.startsWith('\u0000');
  const rel = virtual ? source : path.relative(root, path.join(root, source.replace(/^[/\\]+/, ''))).split(path.sep).join('/');
  const abs = path.join(root, rel);
  let text = map.sourcesContent?.[i];
  if (typeof text !== 'string' && !virtual && fs.existsSync(abs) && fs.statSync(abs).isFile()) text = fs.readFileSync(abs, 'utf8');
  return { rel, text: typeof text === 'string' ? text : '', virtual, library: virtual || rel.includes('node_modules/') };
});
const appModules = modules.filter((m) => !m.library && !m.rel.startsWith('..'));

console.log(`\nSearched: ${Object.keys(targets).join(' + ')}${releaseHbc ? '' : ' (hermesc not found: bytecode skipped)'}; control: development bundle.`);
console.log(`Release bundle: ${modules.length} modules, ${appModules.length} of them app code.\n`);

console.log('Developer-token screen strings (release must be 0):');
for (const n of DEV_TOKEN_NEEDLES) {
  const counts = Object.entries(targets).map(([k, t]) => [k, count(t, n)]);
  for (const [k, c] of counts) if (c > 0) problems.push(`${k} contains dev-token string ${JSON.stringify(n)} (${c}×)`);
  console.log(`  ${JSON.stringify(n).padEnd(46)} ${counts.map(([k, c]) => `${k}: ${c}`).join('  ')}  | control: ${count(control, n)}`);
}
for (const n of PLACEHOLDER_NEEDLES) {
  for (const [k, t] of Object.entries(targets)) if (count(t, n) > 0) problems.push(`${k} contains placeholder string ${JSON.stringify(n)}`);
}
for (const n of FORBIDDEN_NEEDLES) {
  for (const [k, t] of Object.entries(targets)) if (count(t, n) > 0) problems.push(`${k} contains forbidden marker ${JSON.stringify(n)}`);
}
for (const n of CONTROL_NEEDLES) {
  for (const [k, t] of Object.entries(targets)) if (count(t, n) === 0) problems.push(`${k} is missing expected string ${JSON.stringify(n)} — wrong file?`);
}

// Client secret: no value anywhere; the option's NAME only inside expo-auth-session's own modules.
for (const re of SECRET_VALUE_PATTERNS) {
  for (const [k, t] of Object.entries(targets)) if (re.test(t)) problems.push(`${k} matches a client-secret value pattern (${re.source.slice(0, 24)}…)`);
}
const nameCount = SECRET_NAMES.reduce((sum, n) => sum + count(js, n), 0);
const nameOwners = [...new Set(modules.filter((m) => SECRET_NAMES.some((n) => m.text.includes(n))).map((m) => m.rel))];
const strayOwners = nameOwners.filter((rel) => !SECRET_NAME_OWNERS.some((owner) => rel.includes(owner)));
if (strayOwners.length) problems.push(`the client-secret option is named outside expo-auth-session: ${strayOwners.join(', ')}`);

// The iOS redirect, and never the Android one.
if (!IOS_REDIRECT || count(js, IOS_REDIRECT) === 0) problems.push('release JS lacks the iOS redirect (src/config/auth.config.ts IOS_AUTH_REDIRECT_URI)');
for (const [k, t] of Object.entries(targets)) if (count(t, 'msauth://') > 0) problems.push(`${k} contains the Android redirect form "msauth://"`);

// Hosts, and the UAT API URL in a preview build.
const hosts = [...new Set((js.match(/[a-z0-9.-]*mountmerugroup\.com/gi) ?? []).map((h) => h.toLowerCase()))];
const badHosts = hosts.filter((h) => !ALLOWED_HOSTS.includes(h));
if (badHosts.length) problems.push(`release JS names hosts that are not allowed: ${badHosts.join(', ')}`);
if (profile === 'preview' && (!UAT_API_URL || count(js, UAT_API_URL) === 0)) problems.push('release JS (preview) lacks the UAT API URL from src/config/env.ts');

// Token-shaped values: UUID v4 literals that are neither public IDs nor defined by library code.
const v4 = [...new Set((js.match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) ?? []).map((u) => u.toLowerCase()))];
const libraryUuid = (u) => modules.some((m) => m.library && m.text.toLowerCase().includes(u));
// Metro stamps each build with a random id linking it to its source map: the last line "//# debugId=<uuid>", the same
// value as the map's `debugId`. Not a token; allowed only there.
const debugIds = new Set(
  [...js.matchAll(/^\/\/# debugId=([0-9a-f-]{36})\s*$/gim)].map((m) => m[1].toLowerCase()).filter((u) => u === String(map.debugId ?? '').toLowerCase()),
);
const unexplained = v4.filter((u) => !PUBLIC_UUIDS.has(u) && !libraryUuid(u) && !debugIds.has(u));
if (unexplained.length) problems.push(`release JS contains ${unexplained.length} UUID-v4 literal(s) that are not public IDs — the shape of a session token (values not printed)`);
if (/Bearer [0-9a-f]{8}-/i.test(js)) problems.push('release JS contains a literal "Bearer <uuid>"');

// Android-only APIs reachable from app code (comments stripped), and the drawer navigator.
const androidApis = [];
const androidProps = [];
for (const m of appModules) {
  const code = codeOnly(m.rel, m.text);
  for (const api of ANDROID_ONLY_APIS) if (new RegExp(`\\b${api}\\b`).test(code)) androidApis.push(`${m.rel}: ${api}`);
  for (const prop of ANDROID_ONLY_PROPS) if (new RegExp(`\\b${prop}\\b`).test(code)) androidProps.push(`${m.rel}: ${prop}`);
}
if (androidApis.length) problems.push(`app code reaches Android-only APIs: ${androidApis.join('; ')}`);
const drawer = modules.filter((m) => m.rel.includes('node_modules/@react-navigation/drawer/'));
if (drawer.length) problems.push(`the release bundle contains @react-navigation/drawer (${drawer.length} modules); iOS has no drawer`);

console.log(`\nPlaceholder strings: ${PLACEHOLDER_NEEDLES.map((n) => count(js, n)).reduce((a, b) => a + b, 0)} · forbidden markers: ${FORBIDDEN_NEEDLES.map((n) => count(js, n)).reduce((a, b) => a + b, 0)}`);
console.log(`Client-secret option names: ${nameCount} in release JS, defined by ${nameOwners.length} module(s), ${strayOwners.length} outside expo-auth-session · secret-value matches: ${SECRET_VALUE_PATTERNS.filter((re) => re.test(js)).length}`);
console.log(`iOS redirect: ${IOS_REDIRECT && count(js, IOS_REDIRECT) > 0 ? 'present' : 'MISSING'} · Android "msauth://": ${count(js, 'msauth://')}`);
console.log(`mountmerugroup.com hosts: ${hosts.join(', ') || 'none'} · UAT API URL: ${UAT_API_URL && count(js, UAT_API_URL) > 0 ? 'present' : 'absent'}${profile === 'preview' ? ' (required)' : ''}`);
console.log(`UUID-v4 literals: ${v4.length} (${v4.filter((u) => PUBLIC_UUIDS.has(u)).length} public IDs, ${v4.filter((u) => !PUBLIC_UUIDS.has(u) && libraryUuid(u)).length} library constants, ${v4.filter((u) => debugIds.has(u)).length} build debug id, ${unexplained.length} unexplained)`);
console.log(`Android-only APIs reached from app code: ${androidApis.length} · drawer modules: ${drawer.length}`);
console.log(`Android-only props in app code (ignored on iOS, not a failure): ${androidProps.length ? androidProps.join('; ') : 'none'}`);
console.log(`Control (development bundle) dev-token strings found: ${DEV_TOKEN_NEEDLES.filter((n) => count(control, n) > 0).length}/${DEV_TOKEN_NEEDLES.length}`);

if (keep) console.log(`\nBundles kept for inspection in: ${out}\n`);
else {
  fs.rmSync(out, { recursive: true, force: true });
  console.log(`\nTemporary bundles deleted (${out}). Use --keep to keep them.\n`);
}

if (problems.length) {
  console.error(`FAIL — ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`PASS (${profile}) — no dev-token or placeholder string, test-login marker, client-secret value, token-shaped value,`);
console.log('unapproved host or reachable Android-only API; the iOS redirect is present' + (profile === 'preview' ? ', and the UAT API URL.' : '.'));
