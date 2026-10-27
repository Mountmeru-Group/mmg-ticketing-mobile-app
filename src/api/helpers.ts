/**
 * Copy only the allowed keys, skipping `undefined`. Every request body is built through an allow-list,
 * never by spreading form state (05 §C "Mobile-side rules", 01 TKT-2/TKT-4/TKT-6, USR-2).
 */
export function pickDefined<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/** Encode one path segment. IDs come from server data, but never let a value add path segments (05 C.18). */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

/** 01 §0.3: `page=abc` or `limit=abc` crashes Prisma with a 500. Always send positive integers. */
export function toPositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}
