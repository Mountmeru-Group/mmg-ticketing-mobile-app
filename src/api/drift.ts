// Response shape checks.
//
// src/types/ was copied from 03-DATA-MODEL.md, which was written from schema.prisma and the web source, not
// from live responses. Two layers, so a wrong guess never corrupts a screen and never gets "fixed" silently:
//
// 1. assert*()  — ALWAYS on. The envelope must be the documented shape (array / page / object), or the query
//                 fails with ApiClientError kind `shape` and the screen shows its error state. Nothing renders
//                 from a body the app does not understand.
// 2. checkFields() — __DEV__ only. Compares the fields the screens read against 03 §C and logs each mismatch
//                 ONCE to the Metro console as `[API drift] <endpoint> <field>: expected <type>, got <type>`.
//                 Ronit copies those lines into docs/web-system/09-API-DRIFT.md and decides what to correct.
//                 Do NOT change a type in src/types/ to make a warning go away.
//
// Logs carry type names (and enum values) only — never field values: they may be names, emails or tokens (R6).
import type { Paginated } from '@/types';
import { ApiClientError } from './errors';

type ValueKind = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined';

export interface FieldSpec {
  /** Dot path from the checked value, e.g. `requester.displayName`. */
  path: string;
  /** Allowed kinds. Include 'null' / 'undefined' where 03 says `| null` / `?`. */
  kinds: readonly ValueKind[];
  /** For enum fields: the allowed values from 03 §A. An unknown value is logged (enum values are not secret). */
  oneOf?: readonly string[];
}

function kindOf(value: unknown): ValueKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'undefined') return t;
  return 'object';
}

function readPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function shapeError(endpoint: string, detail: string): ApiClientError {
  if (__DEV__) console.warn(`[API drift] ${endpoint} ${detail}`);
  return new ApiClientError('shape', 200, { error: `Unexpected response shape from ${endpoint}` });
}

// ── 1. Envelope guards (always on) ───────────────────────────

export function assertArray<T>(endpoint: string, value: unknown): asserts value is T[] {
  if (!Array.isArray(value)) throw shapeError(endpoint, `body: expected array, got ${kindOf(value)}`);
}

export function assertObject<T extends object>(endpoint: string, value: unknown): asserts value is T {
  if (kindOf(value) !== 'object') throw shapeError(endpoint, `body: expected object, got ${kindOf(value)}`);
}

/** Shape (a) (01 §0.3). Only the keys the list relies on are required. */
export function assertPaginated<T>(endpoint: string, value: unknown): asserts value is Paginated<T> {
  assertObject(endpoint, value);
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.data)) throw shapeError(endpoint, `data: expected array, got ${kindOf(page.data)}`);
  for (const key of ['page', 'total'] as const) {
    if (typeof page[key] !== 'number') throw shapeError(endpoint, `${key}: expected number, got ${kindOf(page[key])}`);
  }
}

// ── 2. Field drift (__DEV__ only) ────────────────────────────

const reported = new Set<string>();

function report(line: string): void {
  if (reported.has(line)) return;
  reported.add(line);
  console.warn(`[API drift] ${line}`);
}

/**
 * Logs (once per session) each field of `value` that does not match `specs`. `label` prefixes the path,
 * e.g. `data[0].`. Checks one sample item per array to keep the cost negligible.
 */
export function checkFields(endpoint: string, value: unknown, specs: readonly FieldSpec[], label = ''): void {
  if (!__DEV__ || value === undefined) return;
  for (const spec of specs) {
    const fieldValue = readPath(value, spec.path);
    const kind = kindOf(fieldValue);
    if (!spec.kinds.includes(kind)) {
      report(`${endpoint} ${label}${spec.path}: expected ${spec.kinds.join(' | ')}, got ${kind}`);
    } else if (spec.oneOf && typeof fieldValue === 'string' && !spec.oneOf.includes(fieldValue)) {
      report(`${endpoint} ${label}${spec.path}: unknown enum value "${fieldValue}" (expected one of ${spec.oneOf.join(', ')})`);
    }
  }
}
