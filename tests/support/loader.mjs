// Node module hooks so `node --test` can run the app's own TypeScript, unchanged:
// - `@/x` resolves to src/x, and extensionless imports get `.ts`, `.tsx` or `/index.ts` (what Metro and tsc do).
// - .ts/.tsx are transpiled with the repo's own `typescript` package: types are erased and nothing else changes.
// - .json is served as a default export (src/config/env.ts imports app.json).
// - Native modules a phone provides are replaced by the in-memory stand-ins in ./stubs. Nothing else is faked here.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(REPO, 'src');
const ts = createRequire(path.join(REPO, 'package.json'))('typescript');

const STUBS = {
  'expo-secure-store': 'expo-secure-store.mjs',
  'expo-auth-session': 'expo-auth-session.mjs',
};

function firstFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return { url: pathToFileURL(path.join(REPO, 'tests', 'support', 'stubs', STUBS[specifier])).href, shortCircuit: true };
  }
  let target = null;
  if (specifier.startsWith('@/')) {
    target = firstFile(path.join(SRC, specifier.slice(2)));
  } else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    target = firstFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
  }
  if (target) return { url: pathToFileURL(target).href, shortCircuit: true };
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!url.startsWith('file:')) return next(url, context);
  const file = fileURLToPath(url); // drops any `?query` used to load a second, fresh copy of a module
  if (/\.tsx?$/.test(file)) {
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        sourceMap: false,
      },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  if (file.endsWith('.json')) {
    return { format: 'module', source: `export default ${readFileSync(file, 'utf8')};`, shortCircuit: true };
  }
  return next(url, context);
}
