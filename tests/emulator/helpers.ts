import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { firestoreFor } from '../../netlify/functions/_shared/admin';

export function requireEmulators(): { firestoreHost: string; authHost: string } {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!firestoreHost || !authHost) {
    throw new Error('These tests need the Firebase emulators. Run them with `npm run test:emulator`.');
  }
  return { firestoreHost, authHost };
}

export interface TestProject {
  projectId: string;
  app: App;
  db: Firestore;
  /** Deletes every Firestore document in this project. */
  clear(): Promise<void>;
  close(): Promise<void>;
}

/** An isolated emulator project. Each test file uses its own projectId, so files can run in parallel. */
export function testProject(projectId: string): TestProject {
  const { firestoreHost } = requireEmulators();
  const app = initializeApp({ projectId }, projectId);
  return {
    projectId,
    app,
    db: firestoreFor(app),
    async clear() {
      const url = `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Clearing Firestore for ${projectId} failed: HTTP ${res.status}`);
    },
    close: () => deleteApp(app),
  };
}

export async function clearAuth(projectId: string): Promise<void> {
  const { authHost } = requireEmulators();
  const res = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Clearing Auth for ${projectId} failed: HTTP ${res.status}`);
}

/** Creates a user in the Auth emulator's default project (demo-jci) and returns its ID token. */
export async function signUp(email: string): Promise<{ uid: string; idToken: string }> {
  const { authHost } = requireEmulators();
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'emulator-only-password', returnSecureToken: true }),
  });
  const body = (await res.json()) as { localId?: string; idToken?: string; error?: { message: string } };
  if (!res.ok || !body.localId || !body.idToken) {
    throw new Error(`Auth emulator sign-up failed: ${body.error?.message ?? res.status}`);
  }
  return { uid: body.localId, idToken: body.idToken };
}
