import {
  buildUserAccess,
  ROLE_ASSIGNMENT_DOCTYPE,
  USER_ACCESS_COLLECTION,
  userContextFromAccess,
  type Registry,
  type UserAccessDoc,
  type UserContext,
} from '@jci/core';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/** The caller's grants, from userAccess/{uid}. A user without that doc has no roles. */
export async function loadUserContext(db: Firestore, uid: string): Promise<UserContext> {
  const snap = await db.collection(USER_ACCESS_COLLECTION).doc(uid).get();
  return userContextFromAccess(snap.exists ? snap.data() : null, uid);
}

/**
 * Recomputes userAccess/{uid} from the user's RoleAssignment documents.
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
