import { ORGANIZATION_DOCTYPE, ROLE_ASSIGNMENT_DOCTYPE, type RoleName } from '@jci/core';
import { orgDocs, registry, SEED_ORGS } from '@jci/doctypes';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { rebuildUserAccess } from '../netlify/functions/_shared/access';
import { firestoreFor } from '../netlify/functions/_shared/admin';

// Emulator only. The hosts match firebase.json, and a demo- project can never reach production.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const PROJECT_ID = 'demo-jci';
/** Dev-only accounts that exist only in the Auth emulator. */
const DEV_PASSWORD = 'jci-dev-password';
const DEV_USERS: { email: string; role: RoleName; orgId: string; withDescendants: boolean }[] = [
  { email: 'admin@jci.test', role: 'SystemManager', orgId: 'jci', withDescendants: true },
  { email: 'member@jci.test', role: 'Member', orgId: 'jci-kl', withDescendants: false },
];

const app = initializeApp({ projectId: PROJECT_ID });
const db = firestoreFor(app);
const auth = getAuth(app);

const orgs = orgDocs(SEED_ORGS);
const organizations = registry.get(ORGANIZATION_DOCTYPE).collection;
for (const org of orgs) await db.collection(organizations).doc(String(org.id)).set(org);
console.log(`Seeded ${orgs.length} organisations.`);

const assignments = registry.get(ROLE_ASSIGNMENT_DOCTYPE).collection;
for (const user of DEV_USERS) {
  const orgPath = orgs.find((o) => o.id === user.orgId)?.orgPath;
  if (!Array.isArray(orgPath)) throw new Error(`Seed org "${user.orgId}" not found`);
  const existing = await auth.getUserByEmail(user.email).catch(() => null);
  const uid = existing?.uid ?? (await auth.createUser({ email: user.email, password: DEV_PASSWORD })).uid;
  const id = `seed-${uid}`;
  await db
    .collection(assignments)
    .doc(id)
    .set({ id, uid, role: user.role, withDescendants: user.withDescendants, orgId: user.orgId, orgPath, ownerPersonId: null });
  await rebuildUserAccess({ db, registry }, uid);
  console.log(`Seeded ${user.email} (uid ${uid}) as ${user.role} at ${user.orgId}${user.withDescendants ? ' and below' : ''}.`);
}
