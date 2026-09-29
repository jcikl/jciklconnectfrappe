import {
  CUSTOM_FIELD_DOCTYPE,
  customFieldFromDoc,
  ORGANIZATION_DOCTYPE,
  type DocTypeMeta,
  type FieldDef,
  type Registry,
  type StoredDoc,
} from '@jci/core';
import { Timestamp, type DocumentReference, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore';
import { invalid } from './errors';
import { isValidDocId } from './naming';

export interface StoreDeps {
  db: Firestore;
  registry: Registry;
}

export function docRef(db: Firestore, meta: DocTypeMeta, id: string): DocumentReference {
  return db.collection(meta.collection).doc(id);
}

export async function readDoc(tx: Transaction, ref: DocumentReference): Promise<StoredDoc | null> {
  const snap = await tx.get(ref);
  return snap.exists ? { ...snap.data(), id: snap.id } : null;
}

/** orgPath of an existing organisation; 422 when it does not exist. */
export async function loadOrgPath(tx: Transaction, deps: StoreDeps, orgId: string): Promise<string[]> {
  const unknown = invalid([{ path: 'orgId', message: `Unknown organisation "${orgId}"` }]);
  if (!isValidDocId(orgId)) throw unknown;
  const org = await readDoc(tx, docRef(deps.db, deps.registry.get(ORGANIZATION_DOCTYPE), orgId));
  if (!org || !Array.isArray(org.orgPath)) throw unknown;
  return org.orgPath as string[];
}

/**
 * Custom fields for `meta` defined at any org on `orgPath`, sorted by fieldname.
 * Global DocTypes (orgPath null) get every definition; an empty orgPath gets none.
 */
export async function loadCustomFields(
  tx: Transaction,
  deps: StoreDeps,
  meta: DocTypeMeta,
  orgPath: readonly string[] | null,
): Promise<FieldDef[]> {
  if (orgPath !== null && orgPath.length === 0) return [];
  const collection = deps.registry.get(CUSTOM_FIELD_DOCTYPE).collection;
  let query: Query = deps.db.collection(collection).where('targetDocType', '==', meta.name);
  if (orgPath !== null) query = query.where('org', 'in', [...orgPath]);
  const snap = await tx.get(query);
  return snap.docs.map((d) => customFieldFromDoc(d.data())).sort((a, b) => (a.fieldname < b.fieldname ? -1 : 1));
}

/** Converts Firestore Timestamps to ISO strings so a stored document can be sent as JSON. */
export function serializeDoc(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeDoc);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeDoc(v)]));
  }
  return value;
}
