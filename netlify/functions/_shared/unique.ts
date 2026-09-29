import { createHash } from 'node:crypto';
import { deepEqual, fieldKey, getFieldValue, UNIQUE_KEYS_COLLECTION, type DocTypeMeta, type FieldDef } from '@jci/core';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { ApiError } from './errors';
import type { PendingWrite } from './naming';

function claimRef(db: Firestore, doctype: string, key: string, value: unknown): DocumentReference {
  const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return db.collection(UNIQUE_KEYS_COLLECTION).doc(`${doctype}.${key}.${hash}`);
}

const isEmpty = (v: unknown): boolean => v === null || v === '';

/**
 * Enforces `unique` fields with one claim document per value. Reads happen now; the returned
 * writes claim new values and release old ones. Pass after = {} for a delete.
 */
export async function planUniques(
  tx: Transaction,
  db: Firestore,
  meta: DocTypeMeta,
  fields: readonly FieldDef[],
  id: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<PendingWrite[]> {
  const writes: PendingWrite[] = [];
  const conflicts: string[] = [];
  for (const f of fields) {
    if (f.unique !== true) continue;
    const key = fieldKey(f);
    const oldValue = getFieldValue(before, key);
    const newValue = getFieldValue(after, key);
    if (deepEqual(oldValue, newValue)) continue;
    if (!isEmpty(newValue)) {
      const ref = claimRef(db, meta.name, key, newValue);
      const claim = await tx.get(ref);
      if (claim.exists && claim.get('docId') !== id) conflicts.push(key);
      else writes.push((t) => t.set(ref, { doctype: meta.name, field: key, docId: id }));
    }
    if (!isEmpty(oldValue)) {
      const ref = claimRef(db, meta.name, key, oldValue);
      writes.push((t) => t.delete(ref));
    }
  }
  if (conflicts.length > 0) {
    throw new ApiError(409, 'duplicate', 'Another document already uses this value', { fields: conflicts });
  }
  return writes;
}
