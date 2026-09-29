import type { Persistence } from 'firebase/auth';

/** Web and Node keep the Firebase Auth default persistence. React Native uses persistence.native.ts. */
export function authPersistence(): Persistence | undefined {
  return undefined;
}
