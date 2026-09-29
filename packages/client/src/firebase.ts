import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import type { ClientConfig } from './config';
import { authPersistence } from './persistence';

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  config: ClientConfig;
}

/** Ports from firebase.json. */
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8080;

const clients = new Map<string, FirebaseClient>();

/** One client per app name. Connects to the emulators when `emulatorHost` is set. */
export function initClient(config: ClientConfig): FirebaseClient {
  const name = config.appName ?? '[DEFAULT]';
  const existing = clients.get(name);
  if (existing) return existing;

  const app = initializeApp(
    { projectId: config.projectId, apiKey: config.apiKey, authDomain: config.authDomain, appId: config.appId },
    name,
  );
  const persistence = authPersistence();
  const auth = persistence ? initializeAuth(app, { persistence }) : getAuth(app);
  const db = getFirestore(app);
  if (config.emulatorHost) {
    connectAuthEmulator(auth, `http://${config.emulatorHost}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });
    connectFirestoreEmulator(db, config.emulatorHost, FIRESTORE_EMULATOR_PORT);
  }
  const client = { app, auth, db, config };
  clients.set(name, client);
  return client;
}
