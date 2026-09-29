import { ORGANIZATION_DOCTYPE, ROLE_ASSIGNMENT_DOCTYPE } from '@jci/core';
import { orgDocs, registry, SEED_ORGS } from '@jci/doctypes';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { rebuildUserAccess } from '../netlify/functions/_shared/access';
import { firestoreFor } from '../netlify/functions/_shared/admin';

// Emulator only. The hosts match firebase.json, and a demo- project can never reach production.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const PROJECT_ID = 'demo-jci';
/** Dev-only account that exists only in the Auth emulator. */
const DEV_ADMIN = { email: 'admin@jci.test', password: 'jci-dev-password' };

const app = initializeApp({ projectId: PROJECT_ID });
const db = firestoreFor(app);
const auth = getAuth(app);

const organizations = registry.get(ORGANIZATION_DOCTYPE).collection;
for (const org of orgDocs(SEED_ORGS)) await db.collection(organizations).doc(String(org.id)).set(org);

const existing = await auth.getUserByEmail(DEV_ADMIN.email).catch(() => null);
const uid = existing?.uid ?? (await auth.createUser(DEV_ADMIN)).uid;
const assignmentId = `seed-${uid}`;
await db
  .collection(registry.get(ROLE_ASSIGNMENT_DOCTYPE).collection)
  .doc(assignmentId)
  .set({ id: assignmentId, uid, role: 'SystemManager', withDescendants: true, orgId: 'jci', orgPath: ['jci'], ownerPersonId: null });
await rebuildUserAccess({ db, registry }, uid);

console.log(`Seeded ${SEED_ORGS.length} organisations and ${DEV_ADMIN.email} (uid ${uid}) as System Manager at jci.`);
