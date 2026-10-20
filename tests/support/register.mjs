// Loaded with `node --import` before any test file (package.json "test").
import { register } from 'node:module';

// A development build, as on the phone during testing: drift logging (src/api/drift.ts) is on.
globalThis.__DEV__ = true;

register('./loader.mjs', import.meta.url);
