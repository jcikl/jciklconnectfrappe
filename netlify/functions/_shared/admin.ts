import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const configured = new WeakSet<Firestore>();

/** The app's Firestore, with undefined properties ignored (settings may only be applied once per instance). */
export function firestoreFor(app: App): Firestore {
  const db = getFirestore(app);
  if (!configured.has(db)) {
    db.settings({ ignoreUndefinedProperties: true });
    configured.add(db);
  }
  return db;
}

/**
 * The server's default Firebase app. With FIRESTORE_EMULATOR_HOST set it talks to the emulators
 * (project FIREBASE_PROJECT_ID, default demo-jci); otherwise FIREBASE_SERVICE_ACCOUNT must hold the key JSON.
 */
export function serverApp(): App {
  const existing = getApps().find((a) => a.name === '[DEFAULT]');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-jci';
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId });
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  return initializeApp({ credential: cert(JSON.parse(serviceAccount)), projectId });
}
