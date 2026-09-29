import {
  buildUserAccess,
  ROLE_ASSIGNMENT_DOCTYPE,
  USER_ACCESS_COLLECTION,
  userContextFromAccess,
  type Registry,
  type StoredDoc,
  type UserAccessDoc,
  type UserContext,
} from '@jci/core';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { invalid } from './errors';
import { isValidDocId, type PendingWrite } from './naming';
import type { TxEffect } from './pipeline';

/** The caller's grants, from userAccess/{uid}. A user without that doc has no roles. */
export async function loadUserContext(db: Firestore, uid: string): Promise<UserContext> {
  const snap = await db.collection(USER_ACCESS_COLLECTION).doc(uid).get();
  return userContextFromAccess(snap.exists ? snap.data() : null, uid);
}

/**
 * Recomputes userAccess/{uid} from the user's RoleAssignment documents, outside any save.
 * The pipeline keeps userAccess in step through syncUserAccessInTx; this is for seeding and repair.
 * Runs in one transaction so two concurrent rebuilds cannot let a stale write win
 * (a lost grant, or a revoked grant coming back).
 */
export async function rebuildUserAccess(deps: { db: Firestore; registry: Registry }, uid: string): Promise<UserAccessDoc> {
  const collection = deps.registry.get(ROLE_ASSIGNMENT_DOCTYPE).collection;
  const ref = deps.db.collection(USER_ACCESS_COLLECTION).doc(uid);
  return deps.db.runTransaction(async (tx) => {
    const assignments = await tx.get(deps.db.collection(collection).where('uid', '==', uid));
    const grants = assignments.docs.map((d) => ({ role: d.get('role'), orgId: d.get('orgId'), withDescendants: d.get('withDescendants') }));
    const personId: unknown = (await tx.get(ref)).get('personId');
    const access = buildUserAccess(uid, typeof personId === 'string' ? personId : null, grants);
    tx.set(ref, { ...access, updatedAt: FieldValue.serverTimestamp() });
    return access;
  });
}

const grantOf = (doc: StoredDoc) => ({ role: doc.role, orgId: doc.orgId, withDescendants: doc.withDescendants });

/**
 * RoleAssignment tx-effect: writes userAccess for the uid before and after the change inside the save
 * transaction, so a grant or a revocation commits atomically with the assignment.
 */
export const syncUserAccessInTx: TxEffect = async (tx, { db, registry, id, before, after }) => {
  if (after && (typeof after.uid !== 'string' || !isValidDocId(after.uid))) {
    throw invalid([{ path: 'uid', message: 'Not a valid user ID' }]);
  }
  const collection = registry.get(ROLE_ASSIGNMENT_DOCTYPE).collection;
  const uids = new Set<string>();
  for (const doc of [before, after]) if (typeof doc?.uid === 'string' && isValidDocId(doc.uid)) uids.add(doc.uid);

  const writes: PendingWrite[] = [];
  for (const uid of uids) {
    const stored = await tx.get(db.collection(collection).where('uid', '==', uid));
    // The query sees this assignment as it was before the change; swap in its new state.
    const grants = stored.docs.filter((d) => d.id !== id).map((d) => grantOf(d.data()));
    if (after?.uid === uid) grants.push(grantOf(after));
    const ref = db.collection(USER_ACCESS_COLLECTION).doc(uid);
    const personId: unknown = (await tx.get(ref)).get('personId');
    const access = buildUserAccess(uid, typeof personId === 'string' ? personId : null, grants);
    writes.push((t) => t.set(ref, { ...access, updatedAt: FieldValue.serverTimestamp() }));
  }
  return writes;
};
