import { SYSTEM_FIELDS } from '../meta/types';

export type Change = [key: string, oldValue: unknown, newValue: unknown];

const SYSTEM = new Set<string>(SYSTEM_FIELDS);

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function flatten(doc: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!doc) return out;
  for (const [k, v] of Object.entries(doc)) {
    if (SYSTEM.has(k)) continue;
    if (k === 'custom' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ck, cv] of Object.entries(v)) out[`custom.${ck}`] = cv;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function diffDocs(before: Record<string, unknown> | null, after: Record<string, unknown>): Change[] {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes: Change[] = [];
  for (const k of keys) {
    const oldValue = a[k] ?? null;
    const newValue = b[k] ?? null;
    if (!deepEqual(oldValue, newValue)) changes.push([k, oldValue, newValue]);
  }
  return changes;
}
