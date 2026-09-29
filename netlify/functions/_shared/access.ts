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

/** Recomputes userAccess/{uid} from the user's RoleAssignment documents. */
export async function rebuildUserAccess(deps: { db: Firestore; registry: Registry }, uid: string): Promise<UserAccessDoc> {
  const collection = deps.registry.get(ROLE_ASSIGNMENT_DOCTYPE).collection;
  const assignments = await deps.db.collection(collection).where('uid', '==', uid).get();
  const grants = assignments.docs.map((d) => ({ role: d.get('role'), orgId: d.get('orgId'), withDescendants: d.get('withDescendants') }));
  const ref = deps.db.collection(USER_ACCESS_COLLECTION).doc(uid);
  const personId: unknown = (await ref.get()).get('personId');
  const access = buildUserAccess(uid, typeof personId === 'string' ? personId : null, grants);
  await ref.set({ ...access, updatedAt: FieldValue.serverTimestamp() });
  return access;
}
