// iOS-5i, Ronit's decision 2: saved views behind the BUILD-TIME flag SAVED_VIEWS_ENABLED
// (src/screens/tickets/savedViewsGate.ts): ON in `preview` (UAT), OFF in `production` until SVW-1..4 are confirmed on PROD.
// With it off, a production bundle holds NOTHING of saved views (decision 1 of the plan): no module, no SVW path, no
// query key, no field spec, no store setter, no text.
// - Bundle level, here: the gate runs through the project's own Babel config (babel-preset-expo inlines
//   EXPO_PUBLIC_APP_ENV) and Metro's constant folding, then Metro's dependency collector, exactly the steps a release
//   bundle's module goes through (metro-transform-worker, dev false), for each profile.
// - Reachability, here: every RUNTIME import from index.ts (`import type` is erased and not followed; `require()` is the
//   gate's and not followed): no saved-views module is reachable except through the gate.
// - The whole bundle: scripts/verify-release-bundle.js, for both profiles (JS and Hermes).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const requireFromRepo = createRequire(path.join(REPO, 'package.json'));

const GATE = 'src/screens/tickets/savedViewsGate.ts';
/** Every saved-views module. None may be reachable in a production bundle while the flag is off. */
const SAVED_VIEWS_MODULES = [
  'src/api/savedViews.api.ts',
  'src/hooks/useSavedViews.ts',
  'src/utils/saved-filters.ts',
  'src/types/savedView.ts',
  'src/screens/tickets/SavedFilters.tsx',
];

/** The gate as a release bundle of `appEnv` compiles it: { flag, dependencies }. */
function compileGate(appEnv) {
  const babel = requireFromRepo('@babel/core');
  const { constantFoldingPlugin } = requireFromRepo('metro-transform-plugins');
  // Metro's own collector (its package `exports` do not list it, so it is loaded by path).
  const collectDependencies = requireFromRepo(path.join(REPO, 'node_modules/metro/src/ModuleGraph/worker/collectDependencies.js')).default;
  const saved = { appEnv: process.env.EXPO_PUBLIC_APP_ENV, node: process.env.NODE_ENV, babel: process.env.BABEL_ENV };
  if (appEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
  else process.env.EXPO_PUBLIC_APP_ENV = appEnv;
  process.env.NODE_ENV = 'production';
  process.env.BABEL_ENV = 'production';
  try {
    const compiled = babel.transformSync(read(GATE), {
      filename: path.join(REPO, GATE), cwd: REPO, root: REPO, configFile: path.join(REPO, 'babel.config.js'), babelrc: false,
      ast: true, code: true, caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: false, isServer: false },
    });
    const folded = babel.transformFromAstSync(compiled.ast, compiled.code, {
      plugins: [[constantFoldingPlugin, {}]], babelrc: false, configFile: false, ast: true, code: true, cloneInputAst: true,
    });
    const dependencies = collectDependencies(folded.ast, {
      asyncRequireModulePath: 'asyncRequire', dependencyMapName: '_dependencyMap', dynamicRequires: 'reject', inlineableCalls: [],
      keepRequireNames: true, allowOptionalDependencies: false, unstable_allowRequireContext: false, unstable_isESMImportAtSource: null,
    }).dependencies.map((d) => d.name);
    const exports = {};
    const required = [];
    new Function('exports', 'require', 'module', folded.code)(exports, (name) => {
      required.push(name);
      return { SavedFiltersBlock: () => null, applySavedTicketFilter: () => undefined };
    }, { exports });
    // Comments stay in Babel's output; the minifier drops them from a real bundle, so only the code is checked.
    return { flag: exports.SAVED_VIEWS_ENABLED, dependencies, required, code: code(folded.code) };
  } finally {
    for (const [key, value] of [['EXPO_PUBLIC_APP_ENV', saved.appEnv], ['NODE_ENV', saved.node], ['BABEL_ENV', saved.babel]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('the flag, as each release bundle compiles it', () => {
  test('production (EXPO_PUBLIC_APP_ENV=PROD): OFF, and the compiled gate depends on nothing', () => {
    const { flag, dependencies, required, code: out } = compileGate('PROD');
    assert.equal(flag, false);
    assert.deepEqual(dependencies, []);
    assert.deepEqual(required, []);
    assert.doesNotMatch(out, /EXPO_PUBLIC_APP_ENV|process\.env/, 'folded at build time: nothing is read at run time');
  });

  for (const appEnv of ['UAT', undefined]) {
    test(`preview (EXPO_PUBLIC_APP_ENV=${appEnv ?? 'unset'}): ON`, () => {
      const { flag, code: out } = compileGate(appEnv);
      assert.equal(flag, true);
      assert.doesNotMatch(out, /EXPO_PUBLIC_APP_ENV|process\.env/);
    });
  }

  test('the flag is ONE line, read once, in the gate (the one-line flip, docs/ios/RELEASE-IOS.md)', () => {
    const src = code(read(GATE));
    assert.match(src, /^const ENABLED: boolean = process\.env\.EXPO_PUBLIC_APP_ENV !== 'PROD';$/m);
    assert.equal((src.match(/process\.env/g) ?? []).length, 1);
    assert.match(src, /^export const SAVED_VIEWS_ENABLED: boolean = ENABLED;$/m);
  });
});

// ── Static reachability: the runtime imports a bundle follows ──

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(REPO, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(path.join(REPO, from)), spec);
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return path.relative(REPO, candidate).replace(/\\/g, '/');
  }
  return null;
}

/** The modules a module imports at run time: not `import type` / `export type`, nor imports whose names are all `type`. */
function runtimeImports(rel) {
  if (!/\.tsx?$/.test(rel)) return [];
  const src = code(read(rel));
  const out = [];
  const statement = /^\s*(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(statement)) {
    if (m[4]) {
      out.push(m[4]);
      continue;
    }
    const clause = m[2].trim();
    if (/^type\b/.test(clause)) continue;
    const named = /^\{([\s\S]*)\}$/.exec(clause);
    if (named && named[1].split(',').map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith('type '))) continue;
    out.push(m[3]);
  }
  return out.map((spec) => resolveImport(rel, spec)).filter(Boolean);
}

function reachableFrom(entry) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) for (const next of runtimeImports(queue.shift())) if (!seen.has(next)) seen.add(next), queue.push(next);
  return seen;
}

describe('nothing of saved views is reachable in a bundle except through the gate', () => {
  test('from index.ts, through every runtime import: no saved-views module', () => {
    const reachable = reachableFrom('index.ts');
    assert.ok(reachable.size > 150, `the walk covers the app (${reachable.size} modules)`);
    assert.ok(reachable.has('src/screens/tickets/TicketFiltersScreen.tsx'));
    assert.deepEqual(SAVED_VIEWS_MODULES.filter((rel) => reachable.has(rel)), []);
  });

  test('the saved-views modules exist (the check above is not vacuous) and reach each other', () => {
    const present = SAVED_VIEWS_MODULES.filter((rel) => existsSync(path.join(REPO, rel)));
    assert.ok(present.length >= 4, present.join());
    assert.ok(reachableFrom('src/hooks/useSavedViews.ts').has('src/api/savedViews.api.ts'));
  });

  test('the barrels, the query keys, the field specs and the list store hold nothing of saved views', () => {
    for (const rel of ['src/hooks/index.ts', 'src/types/index.ts', 'src/components/index.ts', 'src/hooks/queryKeys.ts', 'src/api/responseSpecs.ts', 'src/store/ui.store.ts']) {
      assert.doesNotMatch(code(read(rel)), /saved.?views?|savedFilter|SavedFilter|SAVED_VIEW|applySavedTicketFilter/i, rel);
    }
  });

  test('only the saved-views modules name the SVW path or the saved-views words', () => {
    const offenders = [];
    for (const rel of reachableFrom('index.ts')) {
      if (/\/saved-views|Save these filters|Saved filters|saved filter/i.test(code(read(rel)))) offenders.push(rel);
    }
    assert.deepEqual(offenders, []);
  });
});

describe('Android\'s store action, moved out of ui.store: the same effect', () => {
  test('applySavedTicketFilter() sets exactly savedFilterUiState(), as ui.store\'s action did on Android, and nothing else', async () => {
    const { applySavedTicketFilter } = await import('../../src/hooks/useSavedViews.ts');
    const { savedFilterUiState } = await import('../../src/utils/saved-filters.ts');
    const { useUiStore } = await import('../../src/store/ui.store.ts');
    const { NO_ADVANCED_FILTERS } = await import('../../src/utils/ticket-filters.ts');
    const data = (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function'));
    const content = {
      filter: 'OPEN', sort: 'PRIORITY',
      advanced: { ...NO_ADVANCED_FILTERS, status: ['CLOSED', 'OPEN'], priority: ['HIGH'], category: [{ id: 'c1', name: 'Net' }] },
    };
    const ui = useUiStore.getState();
    ui.reset();
    ui.setTicketCountryId('country-ke');
    ui.setTicketSearchText('vpn');
    ui.setTicketSearch('vpn');
    ui.openTicketList('ACTIVE_KPI', { fromDate: '2026-11-01', toDate: '2026-11-30', label: 'This month' });
    const before = data(useUiStore.getState());
    applySavedTicketFilter(content);
    assert.deepEqual(data(useUiStore.getState()), { ...before, ...savedFilterUiState(content) });
    assert.equal(useUiStore.getState().ticketCountryId, 'country-ke', 'the country is kept, as on the web');
    assert.equal(useUiStore.getState().ticketPeriod, null, 'the Home period is cleared');
    useUiStore.getState().reset();
  });
});
